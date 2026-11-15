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

// ---------- 正文提取（去导航/广告，省 token）----------
function extractMainText(html) {
  let s = String(html || '');
  // 1) 去掉整块噪声
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style|noscript|svg|canvas|iframe|form)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  // 2) 块级标签变换行，列表项加前缀
  s = s.replace(/<li\b[^>]*>/gi, '\n• ');
  s = s.replace(/<(br|hr)\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|section|article|h[1-6]|tr|ul|ol|table|blockquote)>/gi, '\n');
  s = s.replace(/<h[1-6]\b[^>]*>/gi, '\n## ');
  s = s.replace(/<\/(td|th)>/gi, ' | ');
  // 3) 去掉剩下的标签
  s = s.replace(/<[^>]+>/g, ' ');
  // 4) 实体解码
  const ents = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&mdash;': '-', '&ndash;': '-', '&hellip;': '…', '&middot;': '·', '&times;': '×' };
  Object.keys(ents).forEach(function (k) { s = s.split(k).join(ents[k]); });
  s = s.replace(/&#x([0-9a-f]+);/gi, function (_, h) { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return ' '; } });
  s = s.replace(/&#(\d+);/g, function (_, d) { try { return String.fromCodePoint(parseInt(d, 10)); } catch (e) { return ' '; } });
  // 5) 收尾：压缩空白与空行
  s = s.replace(/[ \t\u00a0]+/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.split('\n').map(function (l) { return l.trim(); }).filter(function (l, i, arr) {
    // 去掉导航式短行（大量重复的 1~3 字菜单项）
    if (l.length <= 3 && arr.length > 40) return false;
    return l.length > 0;
  }).join('\n');
  return s.trim();
}

// ---------- 搜索（有 Tavily Key 用 Tavily，没有就用 Bing RSS，免费）----------
function searchTavily(key, query, maxResults, depth) {
  return new Promise(function (resolve) {
    const body = JSON.stringify({
      api_key: key,
      query: String(query || ''),
      max_results: Math.max(1, Math.min(10, Number(maxResults) || 5)),
      search_depth: depth === 'advanced' ? 'advanced' : 'basic'
    });
    const req = https.request({
      hostname: 'api.tavily.com', path: '/search', method: 'POST', timeout: 25000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, function (res) {
      const ch = [];
      res.on('data', function (d) { ch.push(d); });
      res.on('end', function () {
        try {
          const j = JSON.parse(Buffer.concat(ch).toString('utf8'));
          resolve({
            ok: true, engine: 'tavily',
            answer: j.answer || '',
            results: (j.results || []).map(function (r) {
              return { title: r.title || '', url: r.url || '', snippet: String(r.content || '').slice(0, 500) };
            })
          });
        } catch (e) { resolve({ ok: false, error: 'Tavily 返回解析失败' }); }
      });
    });
    req.on('error', function (e) { resolve({ ok: false, error: (e && e.message) || String(e) }); });
    req.on('timeout', function () { req.destroy(); resolve({ ok: false, error: 'Tavily 超时' }); });
    req.write(body); req.end();
  });
}

async function searchBingRss(query, maxResults) {
  const url = 'https://www.bing.com/search?format=rss&q=' + encodeURIComponent(String(query || ''));
  const r = await getOnce(url, 3);
  if (!r.ok) return { ok: false, error: r.error || ('HTTP ' + r.status) };
  const xml = String(r.text || '');
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const strip = function (t) {
    return String(t || '').replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  };
  const results = items.slice(0, Math.max(1, Math.min(10, Number(maxResults) || 5))).map(function (it) {
    return {
      title: strip((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]),
      url: strip((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]),
      snippet: strip((it.match(/<description>([\s\S]*?)<\/description>/) || [])[1]).slice(0, 400)
    };
  }).filter(function (x) { return x.url; });
  return { ok: results.length > 0, engine: 'bing-rss', results: results,
    error: results.length ? '' : '没有解析到搜索结果（可能是被拦截或关键词太窄）' };
}

async function searchWeb(query, maxResults, depth, tavilyKey) {
  const key = String(tavilyKey || '').trim();
  if (key) {
    const t = await searchTavily(key, query, maxResults, depth);
    if (t.ok) return t;
  }
  return await searchBingRss(query, maxResults);
}

// ---------- 下载二进制文件（图片/PDF/压缩包）----------
function downloadFile(url, destPath, maxBytes) {
  return new Promise(function (resolve) {
    let u;
    try { u = new URL(String(url || '').trim()); } catch (e) { return resolve({ ok: false, error: 'URL 不合法' }); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return resolve({ ok: false, error: '只允许 http/https' });
    const limit = Math.max(1024, Math.min(50 * 1024 * 1024, Number(maxBytes) || 20 * 1024 * 1024));
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': UA, 'Accept': '*/*' }, timeout: 30000
    }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadFile(new URL(res.headers.location, url).toString(), destPath, limit));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return resolve({ ok: false, error: 'HTTP ' + res.statusCode });
      }
      const ct = String(res.headers['content-type'] || '');
      const ch = [];
      let total = 0, tooBig = false;
      res.on('data', function (d) {
        total += d.length;
        if (total > limit) { tooBig = true; res.destroy(); return; }
        ch.push(d);
      });
      res.on('end', function () {
        if (tooBig) return resolve({ ok: false, error: '文件超过上限 ' + Math.round(limit / 1048576) + ' MB' });
        const buf = Buffer.concat(ch);
        try {
          const dir = path.dirname(destPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(destPath, buf);
        } catch (e) { return resolve({ ok: false, error: '写入失败：' + ((e && e.message) || e) }); }
        resolve({ ok: true, path: destPath, bytes: buf.length, contentType: ct });
      });
    });
    req.on('error', function (e) { resolve({ ok: false, error: (e && e.message) || String(e) }); });
    req.on('timeout', function () { req.destroy(); resolve({ ok: false, error: '下载超时（30 秒）' }); });
    req.end();
  });
}

module.exports = { fetchText, cloneRepo, extractMainText, searchWeb, downloadFile };
