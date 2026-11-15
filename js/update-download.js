// ============================================================================
// js/update-download.js —— 安装包下载器（多线程分片 + 可取消 + 速度统计）
//
// 为什么单独一个文件：
//   · 不依赖 electron，可以脱离程序直接用 node 测试
//   · update-check.js 只负责"找版本、决定装不装"，下载细节全在这里
//
// 工作方式：
//   1. 先用 Range: bytes=0-0 探一次，拿到最终重定向地址、总大小、是否支持分段
//   2. 支持分段 → 切成 N 段（每 12MB 一段，最多 8 段），各自写成 .partN
//   3. 全部下完 → 按顺序拼成一个文件 → 校验大小
//   4. 不支持分段 → 退回单线程
//   5. 中途 cancel() 会掐断所有请求并清理临时文件
// ============================================================================
const fs = require('fs');
const http = require('http');
const https = require('https');

const UA = 'Ember-Updater';
const inflight = new Set();   // 在途的请求（取消时要逐个 abort，否则 promise 永远不 resolve）
const PART_SIZE = 12 * 1024 * 1024;   // 每段 12MB
const MAX_PARTS = 8;

const state = {
  active: false,
  cancelled: false,
  received: 0,
  total: 0,
  speed: 0,
  eta: 0,
  threads: 0,
  startedAt: 0,
  lastTick: 0,
  lastBytes: 0
};

function reset() {
  state.active = false;
  state.cancelled = false;
  state.received = 0;
  state.total = 0;
  state.speed = 0;
  state.eta = 0;
  state.threads = 0;
  state.startedAt = 0;
  state.lastTick = 0;
  state.lastBytes = 0;
}

function snapshot() {
  if (!state.active) return { active: false };
  return {
    active: true,
    received: state.received,
    total: state.total,
    speed: Math.round(state.speed),
    eta: state.eta,
    threads: state.threads,
    elapsed: Math.round((Date.now() - state.startedAt) / 1000)
  };
}

function cancel() {
  state.cancelled = true;
  // ★ 关键：不只是打个标记，必须把在途的请求全部 abort 掉。
  //   以前只置标记、靠轮询 destroy，遇到"半死连接"时 promise 永远不 settle，
  //   界面就卡在「正在取消…」。
  let n = 0;
  inflight.forEach(function (h) { try { h.abort('cancelled by user'); n++; } catch (e) {} });
  return { ok: true, active: state.active, aborted: n };
}

function tickSpeed() {
  const now = Date.now();
  if (!state.lastTick) { state.lastTick = now; state.lastBytes = state.received; return; }
  const dt = (now - state.lastTick) / 1000;
  if (dt < 0.4) return;
  const inst = (state.received - state.lastBytes) / dt;
  state.speed = state.speed ? (state.speed * 0.6 + inst * 0.4) : inst;
  state.eta = state.speed > 1024
    ? Math.max(0, Math.round((state.total - state.received) / state.speed))
    : 0;
  state.lastTick = now;
  state.lastBytes = state.received;
}

function probe(url, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 5;
  return new Promise(function (resolve, reject) {
    const lib = url.indexOf('http:') === 0 ? http : https;
    const req = lib.get(url, {
      headers: { 'User-Agent': UA, 'Range': 'bytes=0-0' },
      timeout: 30000
    }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('重定向次数过多'));
        return resolve(probe(res.headers.location, redirectsLeft - 1));
      }
      res.resume();
      if (res.statusCode === 206) {
        const cr = String(res.headers['content-range'] || '');
        const m = cr.match(/\/(\d+)\s*$/);
        const total = m ? parseInt(m[1], 10) : 0;
        return resolve({ finalUrl: url, total: total, supportsRange: true });
      }
      if (res.statusCode === 200) {
        return resolve({
          finalUrl: url,
          total: parseInt(res.headers['content-length'] || '0', 10),
          supportsRange: false
        });
      }
      reject(new Error('探测失败 HTTP ' + res.statusCode));
    });
    req.on('timeout', function () { req.destroy(new Error('探测超时')); });
    req.on('error', reject);
  });
}

// ★ 断点续传：连接中途被掐断时，不再从头下，而是从 .part 文件已有的字节处继续。
//   国内到 GitHub 资源域名经常十几秒就断一次，靠续传才能把 82MB 下完。
function fetchPartResumable(url, start, end, partFile, onBytes, maxAttempts) {
  const tries = Math.max(1, Number(maxAttempts) || 5);
  return (async function () {
    for (let a = 0; a < tries; a++) {
      let have = 0;
      try { have = fs.existsSync(partFile) ? fs.statSync(partFile).size : 0; } catch (e) { have = 0; }
      const from = start + have;
      if (from > end) return partFile;              // 已经下完了
      try {
        await fetchPart(url, from, end, partFile, onBytes, have > 0);
        const size = fs.existsSync(partFile) ? fs.statSync(partFile).size : 0;
        if (start + size >= end + 1) return partFile; // 完整性校验
        throw new Error('分段不完整（' + size + '/' + (end - start + 1) + '）');
      } catch (e) {
        if (state.cancelled) throw new Error('cancelled');
        if (a === tries - 1) throw e;
        await new Promise(function (r) { setTimeout(r, 600 * (a + 1)); });
      }
    }
    return partFile;
  })();
}

// 下载 [start, end] 到 partFile；onBytes 每次收到数据回调
function fetchPart(url, start, end, partFile, onBytes, append) {
  return new Promise(function (resolve, reject) {
    const lib = url.indexOf('http:') === 0 ? http : https;
    let settled = false;
    let wd = null;
    const cleanup = function () {
      if (wd) { clearInterval(wd); wd = null; }
      inflight.delete(handle);
    };
    const done = function (fn, arg) { if (!settled) { settled = true; cleanup(); fn(arg); } };

    let lastByteAt = Date.now();
    let resRef = null;
    const handle = {
      abort: function (why) {
        try { if (resRef) resRef.destroy(); } catch (e) {}
        try { req.destroy(); } catch (e) {}
        done(reject, new Error(why || 'cancelled'));
      }
    };
    inflight.add(handle);

    const req = lib.get(url, {
      headers: { 'User-Agent': UA, 'Range': 'bytes=' + start + '-' + end },
      timeout: 60000
    }, function (res) {
      resRef = res;
      if (res.statusCode !== 206 && res.statusCode !== 200) {
        res.resume();
        return done(reject, new Error('分段失败 HTTP ' + res.statusCode));
      }
      const out = fs.createWriteStream(partFile, append ? { flags: 'a' } : undefined);
      res.on('data', function (c) { lastByteAt = Date.now(); if (onBytes) onBytes(c.length); });
      res.pipe(out);
      out.on('finish', function () { out.close(function () { done(resolve, partFile); }); });
      out.on('error', function (e) { done(reject, e); });
      res.on('error', function (e) { done(reject, e); });
    });

    req.on('timeout', function () { req.destroy(new Error('分段超时')); });
    req.on('error', function (e) { done(reject, e); });
    // ★ 看门狗：连接"半死"（TCP 还在但没数据）时 60 秒都没有新字节 → 主动判死，
    //   否则界面会永远停在某个百分比，用户只能强杀进程。
    wd = setInterval(function () {
      if (Date.now() - lastByteAt > 60000) {
        handle.abort('stalled（60 秒没有收到数据）');
      }
    }, 5000);

    // 取消：轮询 state.cancelled（简单可靠，不依赖事件）
    const t = setInterval(function () {
      if (state.cancelled) { try { req.destroy(); } catch (e) {} }
    }, 250);
    req.on('close', function () { clearInterval(t); });
  });
}

function concat(parts, outFile) {
  return new Promise(function (resolve, reject) {
    const ws = fs.createWriteStream(outFile);
    let i = 0;
    function next() {
      if (i >= parts.length) { ws.end(); return; }
      const rs = fs.createReadStream(parts[i]);
      i++;
      rs.pipe(ws, { end: false });
      rs.on('end', next);
      rs.on('error', reject);
    }
    ws.on('finish', function () { resolve(outFile); });
    ws.on('error', reject);
    next();
  });
}

/**
 * 下载主入口
 * @param {string} url      下载地址（可带重定向）
 * @param {string} destPath 目标文件
 * @param {object} opts     { total, onProgress(payload) }
 */
async function download(url, destPath, opts) {
  opts = opts || {};
  reset();
  state.active = true;
  // ★ 清掉上一次残留的分段/安装包，避免"看着下完了其实是旧文件"
  try {
    const dir = require('path').dirname(destPath);
    if (require('fs').existsSync(dir)) {
      require('fs').readdirSync(dir).forEach(function (f) {
        if (/\.part\d+$/.test(f)) { try { require('fs').unlinkSync(require('path').join(dir, f)); } catch (e) {} }
      });
    }
  } catch (e) {}
  state.startedAt = Date.now();
  const emit = function (extra) {
    if (typeof opts.onProgress === 'function') {
      try { opts.onProgress(Object.assign({ stage: 'downloading' }, extra)); } catch (e) {}
    }
  };

  let p;
  try {
    p = await probe(url);
  } catch (e) {
    reset();
    throw e;
  }

  const total = p.total || opts.total || 0;
  state.total = total;

  // ★ 镜像站对并发连接敏感（实测 ghproxy 开 7 线会被服务端 abort），
  //   所以允许调用方限制线程数；默认仍是 8。
  const cap = Math.max(1, Math.min(MAX_PARTS, Number(opts.maxThreads) || MAX_PARTS));
  let n = total ? Math.ceil(total / PART_SIZE) : 1;
  n = Math.max(1, Math.min(cap, n));
  if (!p.supportsRange) n = 1;
  state.threads = n;
  emit({ received: 0, total: total, speed: 0, eta: 0, threads: n });

  const bump = function (len) {
    state.received += len;
    tickSpeed();
    emit({
      received: state.received, total: state.total,
      speed: state.speed, eta: state.eta, threads: state.threads
    });
  };

  if (n === 1) {
    const one = destPath + '.part0';
    try {
      await fetchPartResumable(p.finalUrl, 0, total ? total - 1 : Number.MAX_SAFE_INTEGER, one, bump, 5);
    } catch (e) {
      try { fs.unlinkSync(one); } catch (x) {}
      reset();
      throw state.cancelled ? new Error('cancelled') : e;
    }
    if (state.cancelled) { try { fs.unlinkSync(one); } catch (x) {} reset(); throw new Error('cancelled'); }
    try { fs.renameSync(one, destPath); }
    catch (e) { fs.copyFileSync(one, destPath); try { fs.unlinkSync(one); } catch (x) {} }
    reset();
    return { ok: true, size: total, threads: 1 };
  }

  const chunk = Math.ceil(total / n);
  const parts = [];
  const jobs = [];
  for (let i = 0; i < n; i++) {
    const start = i * chunk;
    const end = Math.min(total - 1, start + chunk - 1);
    const pf = destPath + '.part' + i;
    parts.push(pf);
    jobs.push(fetchPartResumable(p.finalUrl, start, end, pf, bump, 5));
  }

  try {
    await Promise.all(jobs);
  } catch (e) {
    parts.forEach(function (x) { try { fs.unlinkSync(x); } catch (y) {} });
    const cancelled = state.cancelled;
    reset();
    throw cancelled ? new Error('cancelled') : e;
  }

  if (state.cancelled) {
    parts.forEach(function (x) { try { fs.unlinkSync(x); } catch (y) {} });
    reset();
    throw new Error('cancelled');
  }

  if (typeof opts.onProgress === 'function') {
    try { opts.onProgress({ stage: 'merging', received: total, total: total }); } catch (e) {}
  }
  await concat(parts, destPath);
  parts.forEach(function (x) { try { fs.unlinkSync(x); } catch (y) {} });

  const st = fs.statSync(destPath);
  if (total && st.size !== total) {
    reset();
    throw new Error('下载文件大小不符（' + st.size + ' / ' + total + '）');
  }

  reset();
  return { ok: true, size: st.size, threads: n };
}

module.exports = { download, cancel, snapshot, reset, state };
