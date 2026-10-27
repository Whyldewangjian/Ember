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
  if (state.active) state.cancelled = true;
  return { ok: true, active: state.active };
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

// 下载 [start, end] 到 partFile；onBytes 每次收到数据回调
function fetchPart(url, start, end, partFile, onBytes) {
  return new Promise(function (resolve, reject) {
    const lib = url.indexOf('http:') === 0 ? http : https;
    let settled = false;
    const done = function (fn, arg) { if (!settled) { settled = true; fn(arg); } };

    const req = lib.get(url, {
      headers: { 'User-Agent': UA, 'Range': 'bytes=' + start + '-' + end },
      timeout: 60000
    }, function (res) {
      if (res.statusCode !== 206 && res.statusCode !== 200) {
        res.resume();
        return done(reject, new Error('分段失败 HTTP ' + res.statusCode));
      }
      const out = fs.createWriteStream(partFile);
      res.on('data', function (c) { if (onBytes) onBytes(c.length); });
      res.pipe(out);
      out.on('finish', function () { out.close(function () { done(resolve, partFile); }); });
      out.on('error', function (e) { done(reject, e); });
      res.on('error', function (e) { done(reject, e); });
    });

    req.on('timeout', function () { req.destroy(new Error('分段超时')); });
    req.on('error', function (e) { done(reject, e); });

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

  let n = total ? Math.ceil(total / PART_SIZE) : 1;
  n = Math.max(1, Math.min(MAX_PARTS, n));
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
      await fetchPart(p.finalUrl, 0, total ? total - 1 : '', one, bump);
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
    jobs.push(fetchPart(p.finalUrl, start, end, pf, bump));
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
