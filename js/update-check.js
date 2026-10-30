// ============================================================================
// js/update-check.js —— 检查更新 / 一键下载替换
//
// 设计目标：
//   · 不引入 electron-updater，保持"单 exe 便携版"的分发方式不变
//   · 只依赖 GitHub Releases 的公开 API，不需要任何 token（仓库必须是公开的）
//   · 下载来源做白名单校验，避免被中间人换成任意地址
//   · 便携版运行时解压在 %TEMP%，所以"真实的 exe 路径"取自
//     PORTABLE_EXECUTABLE_FILE 环境变量，而不是 process.execPath
//
// 发布新版的方法（很重要，见文件末尾的说明）：
//   1. 改 package.json 的 version
//   2. npm run build:locked
//   3. 在 GitHub 上创建 Release，tag 用 v1.3.2 这种格式
//   4. 把 dist\Ember-<版本>-locked.exe 作为 Release 附件上传
// ============================================================================

const { ipcMain, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
// ★ 下载器单独一个模块（不依赖 electron，可以脱离程序测试）
const dl = require('./update-download');

// ===== 你的 GitHub 仓库 =====
const GITHUB_OWNER = 'Whyldewangjian';
const GITHUB_REPO = 'Ember';
// ===========================

const API_LATEST = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const UA = 'Ember-Updater';

// 允许下载的域名后缀。
// GitHub 的 Release 附件会 302 重定向到不同的资产域名，常见的有：
//   github.com（下载入口）
//   objects.githubusercontent.com（旧版资产域名 / release-assets 同族）
//   release-assets.githubusercontent.com（新版带 digest 的资产域名）
// 所以用后缀匹配，而不是精确匹配单个主机名。
const DOWNLOAD_HOST_SUFFIXES = [
  '.github.com',
  '.githubusercontent.com'
];

// ---------------------------------------------------------------- 工具函数

function httpGetJson(url, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 5;
  return new Promise(function (resolve, reject) {
    const lib = url.startsWith('http:') ? http : https;
    const req = lib.get(url, {
      headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' },
      timeout: 20000
    }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('重定向次数过多'));
        return resolve(httpGetJson(res.headers.location, redirectsLeft - 1));
      }
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        if (res.statusCode === 404) return reject(new Error('仓库或 Release 不存在（若仓库是私有的，本功能不可用）'));
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
        catch (e) { reject(new Error('返回内容不是合法 JSON')); }
      });
    });
    req.on('timeout', function () { req.destroy(new Error('请求超时')); });
    req.on('error', reject);
  });
}

// 把 v1.3.10 这样的字符串转成可比较的数字数组
function parseVer(v) {
  return String(v || '').replace(/^v/i, '').split('.').map(function (x) { return parseInt(x, 10) || 0; });
}
function isNewer(remote, local) {
  const a = parseVer(remote), b = parseVer(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

// 从 Release 的 assets 里挑出安装包 / 便携版 exe
//   type = 'installer' → 名字里不含 portable、且是 Setup 或 Ember-<版本>-locked.exe
//   type = 'portable'  → 名字里含 portable
function pickAsset(release, type) {
  const assets = (release && release.assets) || [];
  const exes = assets.filter(function (a) { return /\.exe$/i.test(a.name || ''); });
  if (!exes.length) return null;

  if (type === 'portable') {
    return exes.find(function (a) { return /portable/i.test(a.name); }) ||
           exes.find(function (a) { return /Ember/i.test(a.name); }) ||
           exes[0];
  }
  // 默认要安装程序
  return exes.find(function (a) { return /setup/i.test(a.name); }) ||
         exes.find(function (a) { return !/portable/i.test(a.name); }) ||
         exes[0];
}

// 判断当前是"便携版"还是"安装版"
//   便携版：运行时会解压到 %TEMP%，所以 execPath 在临时目录里
//   安装版：直接装在 %LOCALAPPDATA%\Programs\Ember 之类的固定目录
function isPortable() {
  const p = (process.env.PORTABLE_EXECUTABLE_FILE || '').trim();
  if (p && fs.existsSync(p)) return true;
  const exe = process.execPath || '';
  const tmp = (os.tmpdir() || '').toLowerCase();
  if (tmp && exe.toLowerCase().indexOf(tmp) === 0) return true;
  return false;
}

// 便携版要替换的"用户手里那个 exe"路径
function realExePath() {
  const portFile = process.env.PORTABLE_EXECUTABLE_FILE;
  if (portFile && fs.existsSync(portFile)) return portFile;
  return process.execPath;
}

function assetUrlAllowed(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return DOWNLOAD_HOST_SUFFIXES.some(function (suffix) {
      return host === suffix.slice(1) || host.endsWith(suffix);
    });
  } catch (e) { return false; }
}

// ---------------------------------------------------------------- 下载（多线程分片 + 可取消）
// 设计说明：
//   ⚠️ 下面这一组（DL 状态 / downloadSmart / downloadPart / concatParts / probeRange）
//     已经从 1.3.4 起废弃，实际下载走 js/update-download.js（独立模块、可单独测试）。
//     这里保留是因为 broadcastProgress / assetUrlAllowed 等仍在使用；
//     downloadSmart 那几个函数没有任何调用点，下次清理时可以整块删掉。
//   · GitHub 的附件地址支持 HTTP Range，所以可以切成多段并行下载，速度能提升 1.5~4 倍
//   · 每段先写各自的临时文件，全部下完再拼成一个文件（避免并发写同一文件的坑）
//   · 状态放在模块变量里，渲染进程可以用 update-download-state 随时查询
//     （以前进度只发给"点按钮时的那个窗口"，窗口重开就永远显示"下载中"）
//   · 支持取消：cancel-update-download 会中断所有分段并清理临时文件
const DL = {
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

function resetDL() {
  DL.active = false;
  DL.cancelled = false;
  DL.received = 0;
  DL.total = 0;
  DL.speed = 0;
  DL.eta = 0;
  DL.threads = 0;
  DL.startedAt = 0;
  DL.lastTick = 0;
  DL.lastBytes = 0;
}

// 广播给所有窗口（而不是只发给发起请求的那个）
function broadcastProgress(stage, extra) {
  const payload = Object.assign({ stage: stage }, extra || {});
  try {
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach(function (w) {
      try { if (!w.isDestroyed()) w.webContents.send('update-progress', payload); } catch (e) {}
    });
  } catch (e) {}
}

// 跟随重定向，拿到最终地址（顺带探测是否支持 Range）
function probeRange(url, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 5;
  return new Promise(function (resolve, reject) {
    if (!assetUrlAllowed(url)) return reject(new Error('下载地址不在白名单内：' + url));
    const lib = url.startsWith('http:') ? http : https;
    const req = lib.get(url, {
      headers: { 'User-Agent': UA, 'Range': 'bytes=0-0' },
      timeout: 30000
    }, function (res) {
      // 重定向：继续跟
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('重定向次数过多'));
        if (!assetUrlAllowed(res.headers.location)) return reject(new Error('重定向到非白名单地址，已中止'));
        return resolve(probeRange(res.headers.location, redirectsLeft - 1));
      }
      res.resume();
      if (res.statusCode === 206) {
        // Content-Range: bytes 0-0/85428426
        const cr = String(res.headers['content-range'] || '');
        const m = cr.match(/\/(\d+)\s*$/);
        const total = m ? parseInt(m[1], 10) : parseInt(res.headers['content-length'] || '0', 10);
        return resolve({ finalUrl: url, total: total, supportsRange: true });
      }
      if (res.statusCode === 200) {
        return resolve({
          finalUrl: url,
          total: parseInt(res.headers['content-length'] || '0', 10),
          supportsRange: false
        });
      }
      reject(new Error('下载失败 HTTP ' + res.statusCode));
    });
    req.on('timeout', function () { req.destroy(new Error('探测下载地址超时')); });
    req.on('error', reject);
  });
}

// 下载一段 [start, end] 到 partFile
function downloadPart(url, start, end, partFile, onBytes) {
  return new Promise(function (resolve, reject) {
    const lib = url.startsWith('http:') ? http : https;
    const req = lib.get(url, {
      headers: {
        'User-Agent': UA,
        'Range': 'bytes=' + start + '-' + end
      },
      timeout: 60000
    }, function (res) {
      if (res.statusCode !== 206 && res.statusCode !== 200) {
        res.resume();
        return reject(new Error('分段下载失败 HTTP ' + res.statusCode));
      }
      const out = fs.createWriteStream(partFile);
      res.on('data', function (chunk) { if (onBytes) onBytes(chunk.length); });
      res.pipe(out);
      out.on('finish', function () { out.close(function () { resolve(partFile); }); });
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('timeout', function () { req.destroy(new Error('分段下载超时')); });
    req.on('error', reject);
    req.on('abort', function () { reject(new Error('cancelled')); });
    // 取消时随时掐断
    const timer = setInterval(function () {
      if (DL.cancelled) { try { req.destroy(); } catch (e) {} }
    }, 300);
    req.on('close', function () { clearInterval(timer); });
  });
}

// 把多个分段文件拼成一个
function concatParts(parts, outFile) {
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

function updateSpeed() {
  const now = Date.now();
  if (!DL.lastTick) { DL.lastTick = now; DL.lastBytes = DL.received; return; }
  const dt = (now - DL.lastTick) / 1000;
  if (dt < 0.4) return;
  const db = DL.received - DL.lastBytes;
  const inst = db / dt;
  // 平滑一下，避免数字乱跳
  DL.speed = DL.speed ? (DL.speed * 0.6 + inst * 0.4) : inst;
  DL.eta = DL.speed > 1024 ? Math.max(0, Math.round((DL.total - DL.received) / DL.speed)) : 0;
  DL.lastTick = now;
  DL.lastBytes = DL.received;
}

async function downloadSmart(url, destPath, expectTotal) {
  resetDL();
  DL.active = true;
  DL.startedAt = Date.now();

  const tmpDir = path.dirname(destPath);
  const probe = await probeRange(url);
  const total = probe.total || expectTotal || 0;
  DL.total = total;

  // 分段数：每 12MB 一段，最多 8 段
  let n = total ? Math.ceil(total / (12 * 1024 * 1024)) : 1;
  n = Math.max(1, Math.min(8, n));
  if (!probe.supportsRange) n = 1;
  DL.threads = n;

  broadcastProgress('downloading', { received: 0, total: total, speed: 0, eta: 0, threads: n });

  if (n === 1) {
    // 单线程（服务端不支持分段时的回退）
    const one = destPath + '.part0';
    await downloadPart(probe.finalUrl, 0, Math.max(0, total - 1) || '', one,
      function (len) {
        DL.received += len;
        updateSpeed();
        broadcastProgress('downloading', {
          received: DL.received, total: DL.total, speed: DL.speed, eta: DL.eta, threads: 1
        });
      });
    if (DL.cancelled) throw new Error('cancelled');
    try { fs.renameSync(one, destPath); } catch (e) { fs.copyFileSync(one, destPath); fs.unlinkSync(one); }
    DL.active = false;
    return destPath;
  }

  // 多段并行
  const chunk = Math.ceil(total / n);
  const jobs = [];
  const parts = [];
  for (let i = 0; i < n; i++) {
    const start = i * chunk;
    const end = Math.min(total - 1, start + chunk - 1);
    const partFile = destPath + '.part' + i;
    parts.push(partFile);
    jobs.push(downloadPart(probe.finalUrl, start, end, partFile, function (len) {
      DL.received += len;
      updateSpeed();
      broadcastProgress('downloading', {
        received: DL.received, total: DL.total, speed: DL.speed, eta: DL.eta, threads: n
      });
    }));
  }

  try {
    await Promise.all(jobs);
  } catch (e) {
    // 清理分段文件
    parts.forEach(function (p) { try { fs.unlinkSync(p); } catch (err) {} });
    DL.active = false;
    throw (DL.cancelled ? new Error('cancelled') : e);
  }

  if (DL.cancelled) {
    parts.forEach(function (p) { try { fs.unlinkSync(p); } catch (err) {} });
    DL.active = false;
    throw new Error('cancelled');
  }

  broadcastProgress('merging', { received: total, total: total });
  await concatParts(parts, destPath);
  parts.forEach(function (p) { try { fs.unlinkSync(p); } catch (err) {} });

  // 校验大小（防止分段缺斤少两）
  try {
    const st = fs.statSync(destPath);
    if (total && st.size !== total) throw new Error('下载文件大小不符（' + st.size + ' / ' + total + '）');
  } catch (e) {
    if (e && e.message && e.message.indexOf('大小不符') >= 0) { DL.active = false; throw e; }
  }

  DL.active = false;
  DL.speed = 0;
  DL.eta = 0;
  return destPath;
}

// 兼容旧名字（其它地方可能引用）
function downloadFile(url, destPath, onProgress, redirectsLeft) {
  return downloadSmart(url, destPath, 0);
}

// ---------------------------------------------------------------- IPC

function registerUpdateIPC() {
  // 查询是否有新版本
  ipcMain.handle('check-update', async function () {
    try {
      if (GITHUB_OWNER === 'YOUR_GITHUB_USERNAME') {
        return { ok: false, error: '更新模块尚未配置：请先在 js/update-check.js 里填写 GITHUB_OWNER' };
      }
      const release = await httpGetJson(API_LATEST);
      const latest = release.tag_name || release.name || '';
      const current = app.getVersion();
      const portable = isPortable();
      const asset = pickAsset(release, portable ? 'portable' : 'installer');
      return {
        ok: true,
        current: current,
        latest: String(latest).replace(/^v/i, ''),
        hasUpdate: isNewer(latest, current),
        mode: portable ? 'portable' : 'installer',
        notes: release.body || '',
        publishedAt: release.published_at || '',
        htmlUrl: release.html_url || '',
        assetName: asset ? asset.name : '',
        assetSize: asset ? asset.size : 0,
        canAutoInstall: !!asset
      };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
  });

  // 下载新版并完成更新（自动区分 安装版 / 便携版）
  ipcMain.handle('download-update', async function (event, payload) {
    try {
      if (GITHUB_OWNER === 'YOUR_GITHUB_USERNAME') return { ok: false, error: '更新模块尚未配置' };
      const release = await httpGetJson(API_LATEST);
      const latest = String(release.tag_name || '').replace(/^v/i, '');
      const current = app.getVersion();
      if (!isNewer(latest, current)) return { ok: false, error: '当前已是最新版本' };

      const portable = isPortable();
      const asset = pickAsset(release, portable ? 'portable' : 'installer');
      if (!asset) return { ok: false, error: '该 Release 里没有找到可用的 exe 附件' };

      const tmpDir = path.join(os.tmpdir(), 'ember-update');
      fs.mkdirSync(tmpDir, { recursive: true });
      const newExe = path.join(tmpDir, 'Ember-update.exe');

      const send = function (stage, extra) {
        broadcastProgress(stage, extra);
      };

      // ★ 用独立下载模块（多线程 + 可取消 + 速度统计），进度广播给所有窗口
      broadcastProgress('downloading', { received: 0, total: asset.size || 0, threads: 0, speed: 0, eta: 0 });
      try {
        await dl.download(asset.browser_download_url, newExe, {
          total: asset.size || 0,
          onProgress: function (p) {
            broadcastProgress(p.stage === 'merging' ? 'merging' : 'downloading', {
              received: p.received, total: p.total,
              speed: p.speed, eta: p.eta, threads: p.threads
            });
          }
        });
      } catch (dlErr) {
        if (dlErr && dlErr.message === 'cancelled') {
          broadcastProgress('cancelled', {});
          return { ok: false, cancelled: true, error: '已取消下载' };
        }
        throw dlErr;
      }

      broadcastProgress('installing', {});

      if (!portable) {
        // ---------- 安装版：静默运行新版安装程序，它会覆盖旧文件 ----------
        // NSIS 的 /S 是静默安装；electron-builder 默认会在安装结束后启动应用。
        const child = spawn(newExe, ['/S'], { detached: true, stdio: 'ignore', windowsHide: true });
        child.unref();

        // ★ 兜底重启：实测在静默安装 + 单实例锁的组合下，
        //   安装程序「启动新版本」这一步可能被跳过（新进程抢不到锁就退了），
        //   表现就是"更新完 Ember 没自己回来"。这里再放一个外部脚本：
        //   等安装进程结束后，显式带 --updated 启动 Ember。
        try {
          const exe = process.execPath;
          // bat 只能安全写 ASCII；安装路径含中文时不动它，交给安装程序自己处理
          if (!/[^\x00-\x7F]/.test(exe) && !/[^\x00-\x7F]/.test(newExe)) {
            const batPath = path.join(tmpDir, 'relaunch-ember.bat');
            const installerName = path.basename(newExe);
            const bl = [
              '@echo off',
              'ping 127.0.0.1 -n 4 > nul',
              ':wait',
              'tasklist /fi "imagename eq ' + installerName + '" 2>nul | find /i "' + installerName + '" >nul',
              'if not errorlevel 1 ( ping 127.0.0.1 -n 3 >nul & goto wait )',
              'ping 127.0.0.1 -n 3 > nul',
              'start "" "' + exe + '" --updated',
              'del "%~f0" > nul 2>&1'
            ];
            fs.writeFileSync(batPath, bl.join('\r\n') + '\r\n', 'ascii');
            spawn('cmd.exe', ['/c', batPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
          }
        } catch (e) {}

        send('restarting');
        setTimeout(function () { app.quit(); }, 600);
        return { ok: true, mode: 'installer', target: process.execPath, asset: asset.name };
      }

      // ---------- 便携版：交给外部脚本，在进程退出后替换 exe 并重启 ----------
      const target = realExePath();
      const bat = path.join(tmpDir, 'apply-update.bat');
      const lines = [
        '@echo off',
        'ping 127.0.0.1 -n 3 > nul',
        ':retry',
        'move /y "' + newExe + '" "' + target + '" > nul 2>&1',
        'if errorlevel 1 ( ping 127.0.0.1 -n 2 > nul & goto retry )',
        'start "" "' + target + '"',
        'del "%~f0" > nul 2>&1'
      ];
      fs.writeFileSync(bat, lines.join('\r\n') + '\r\n', 'ascii');

      spawn('cmd.exe', ['/c', bat], { detached: true, stdio: 'ignore', windowsHide: true }).unref();

      send('restarting');
      setTimeout(function () { app.quit(); }, 500);
      return { ok: true, mode: 'portable', target: target, asset: asset.name };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
  });

  // 在浏览器里打开 Release 页面（备用方案）
  ipcMain.handle('open-release-page', async function (event, url) {
    try {
      if (url && /^https:\/\/github\.com\//.test(url)) shell.openExternal(url);
      return { ok: true };
    } catch (e) { return { ok: false }; }
  });

  // ★ 查询当前下载状态：窗口重开/重进弹窗时用它恢复真实进度
  ipcMain.handle('update-download-state', async function () {
    return Object.assign({ ok: true }, dl.snapshot());
  });

  // ★ 取消下载
  ipcMain.handle('cancel-update-download', async function () {
    return dl.cancel();
  });
}

module.exports = { registerUpdateIPC };
