// ============================================================================
// js/net-fetch.js —— 联网取资料（抓网页 / 浅克隆仓库）
//
// 为什么需要：
//   "查厂商仓库里的硬件参数"这种需求，Ember 以前只能靠 shell 拼 PowerShell，
//   而且没有任何"联网查资料"的工具 —— 模型压根不会想到去上游仓库找。
//
// 两个动作：
//   fetchText(url)       GET 一个 URL，返回文本（限 200KB，自动跟随跳转）
//   cloneRepo(url, dir)  git clone --depth 1（浅克隆，省时间省空间）
//
// 安全：
//   · fetch 只读，不落盘
//   · clone 会写盘 → 由调用方（渲染层）弹确认框
//   · 只允许 http/https，禁止 file:// 和本地路径
// ============================================================================
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 200 * 1024;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Ember/1.3.x';

function getOnce(url, redirectsLeft) {
  return new Promise(function (resolve) {
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ ok: false, error: 'URL 不合法：' + url }); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return resolve({ ok: false, error: '只允许 http/https' });
    }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,text/plain,*/*' },
      timeout: 20000
    }, function (res) {
      // 跳转
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && (redirectsLeft || 0) > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(getOnce(next, redirectsLeft - 1));
      }
      const chunks = [];
      let total = 0;
      res.on('data', function (d) {
        total += d.length;
        if (total <= MAX_BYTES) chunks.push(d);
      });
      res.on('end', function () {
        const buf = Buffer.concat(chunks);
        let text = buf.toString('utf8');
        // 常见中文页面是 GBK：出现替换字符就尝试 latin1 再判
        if (text.indexOf('\uFFFD') >= 0) {
          try {
            const dec = new TextDecoder('gbk');
            const alt = dec.decode(buf);
            if (alt.indexOf('\uFFFD') < 0) text = alt;
          } catch (e) {}
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          url: url,
          contentType: res.headers['content-type'] || '',
          bytes: total,
          truncated: total > MAX_BYTES,
          text: text
        });
      });
    });
    req.on('timeout', function () { req.destroy(); resolve({ ok: false, error: '超时（20 秒）' }); });
    req.on('error', function (e) { resolve({ ok: false, error: (e && e.message) || String(e) }); });
    req.end();
  });
}

async function fetchText(url) {
  const r = await getOnce(String(url || '').trim(), 3);
  if (r.ok && r.text && r.text.length > 60000) {
    r.text = r.text.slice(0, 60000) + '\n…（后面截掉了，共 ' + r.text.length + ' 字）';
  }
  return r;
}

// git clone --depth 1 到 destDir（destDir 由调用方确保在工作文件夹内）
function cloneRepo(url, destDir) {
  return new Promise(function (resolve) {
    const u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) return resolve({ ok: false, error: '只允许 http/https 的仓库地址' });
    if (!destDir) return resolve({ ok: false, error: '没有目标目录' });
    try {
      const parent = path.dirname(destDir);
      if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
      if (fs.existsSync(destDir) && fs.readdirSync(destDir).length) {
        return resolve({ ok: false, error: '目标目录已存在且不为空：' + destDir });
      }
    } catch (e) { return resolve({ ok: false, error: (e && e.message) || String(e) }); }

    const args = ['clone', '--depth', '1', '--single-branch', u, destDir];
    const ps = spawn('git', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const t = setTimeout(function () {
      try { ps.kill(); } catch (e) {}
      resolve({ ok: false, error: '克隆超时（120 秒），可能是仓库太大或网络慢' });
    }, 120000);
    ps.stdout.on('data', function (d) { out.push(d); });
    ps.stderr.on('data', function (d) { out.push(d); });
    ps.on('error', function (e) {
      clearTimeout(t);
      resolve({ ok: false, error: 'git 不可用：' + ((e && e.message) || e) });
    });
    ps.on('exit', function (code) {
      clearTimeout(t);
      const log = Buffer.concat(out).toString('utf8').trim().slice(-2000);
      if (code !== 0) return resolve({ ok: false, error: 'git clone 失败（exit ' + code + '）：' + log });
      // 统计一下克隆下来的文件数，方便模型判断
      let files = 0;
      try {
        (function walk(d) {
          fs.readdirSync(d, { withFileTypes: true }).forEach(function (x) {
            if (x.name === '.git') return;
            const p = path.join(d, x.name);
            if (x.isDirectory()) walk(p); else files++;
          });
        })(destDir);
      } catch (e) {}
      resolve({ ok: true, path: destDir, files: files, log: log });
    });
  });
}

module.exports = { fetchText, cloneRepo };
