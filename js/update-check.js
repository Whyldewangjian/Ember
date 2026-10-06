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
//   3. 在 GitHub 上创建 Release，tag 用 v1.3.1 这种格式
//   4. 把 dist\Ember-<版本>-locked.exe 作为 Release 附件上传
// ============================================================================

const { ipcMain, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

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

function downloadFile(url, destPath, onProgress, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 5;
  return new Promise(function (resolve, reject) {
    if (!assetUrlAllowed(url)) return reject(new Error('下载地址不在白名单内：' + url));
    const lib = url.startsWith('http:') ? http : https;
    const req = lib.get(url, { headers: { 'User-Agent': UA }, timeout: 60000 }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('重定向次数过多'));
        // 重定向目标也要过白名单
        if (!assetUrlAllowed(res.headers.location)) {
          return reject(new Error('重定向到非白名单地址，已中止'));
        }
        return resolve(downloadFile(res.headers.location, destPath, onProgress, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('下载失败 HTTP ' + res.statusCode)); }

      const total = parseInt(res.headers['content-length'] || '0', 10);
      let got = 0;
      const out = fs.createWriteStream(destPath);
      res.on('data', function (chunk) {
        got += chunk.length;
        if (onProgress) onProgress(got, total);
      });
      res.pipe(out);
      out.on('finish', function () { out.close(function () { resolve(destPath); }); });
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('timeout', function () { req.destroy(new Error('下载超时')); });
    req.on('error', reject);
  });
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
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send('update-progress', Object.assign({ stage: stage }, extra || {}));
          }
        } catch (e) {}
      };

      send('downloading', { received: 0, total: asset.size || 0 });
      await downloadFile(asset.browser_download_url, newExe, function (got, total) {
        send('downloading', { received: got, total: total || asset.size || 0 });
      });

      send('installing');

      if (!portable) {
        // ---------- 安装版：静默运行新版安装程序，它会覆盖旧文件并自动启动 ----------
        // NSIS 的 /S 是静默安装；electron-builder 的安装脚本在静默模式下
        // 默认会重新创建快捷方式并在结束后启动应用。
        const child = spawn(newExe, ['/S'], { detached: true, stdio: 'ignore', windowsHide: true });
        child.unref();
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
}

module.exports = { registerUpdateIPC };
