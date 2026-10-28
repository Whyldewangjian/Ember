// ============================================================================
// js/publish.js —— 「发布到网页」的界面部分（GitHub 授权 + 状态显示）
//
// 分工：
//   · 申请设备码 / 换 access_token / 开浏览器 → 走主进程（js/github-auth.js）
//     原因：github.com 的登录接口不支持跨域，渲染进程直接 fetch 会被拦
//   · 查用户名 → 渲染进程直接 fetch api.github.com（这个接口允许跨域）
//   · 授权拿到的 access_token 只保存在本机 localStorage，不上传任何服务器
// ============================================================================
(function () {
  'use strict';

  var TOKEN_KEY = 'llm_github_token';
  var USER_KEY = 'llm_github_user';

  var ipc = null;
  try { ipc = require('electron').ipcRenderer; } catch (e) {}

  var statusEl = document.getElementById('ghPubStatus');
  var connectBtn = document.getElementById('ghPubConnect');
  var disconnectBtn = document.getElementById('ghPubDisconnect');
  var modal = document.getElementById('ghAuthModal');
  var modalBody = document.getElementById('ghAuthBody');
  var cancelBtn = document.getElementById('ghAuthCancel');

  // 折叠面板
  var group = document.getElementById('publishCollapseGroup');
  var header = document.getElementById('publishCollapseHeader');
  if (group && header) {
    header.addEventListener('click', function () { group.classList.toggle('open'); });
  }

  if (!statusEl || !connectBtn) return;

  var polling = null;      // 轮询定时器
  var pollCount = 0;
  var currentDevice = null;

  function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function username() { try { return localStorage.getItem(USER_KEY) || ''; } catch (e) { return ''; } }
  function saveAuth(tk, login) {
    try {
      localStorage.setItem(TOKEN_KEY, tk || '');
      localStorage.setItem(USER_KEY, login || '');
    } catch (e) {}
  }
  function clearAuth() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) {}
  }

  // ---------- 状态显示 ----------
  function renderStatus() {
    var tk = token();
    var u = username();
    if (tk && u) {
      statusEl.innerHTML = '<i class="fas fa-circle-check"></i> 已连接：<b>' + escapeHtml(u) + '</b>';
      statusEl.className = 'gh-pub-status ok';
      connectBtn.style.display = 'none';
      disconnectBtn.style.display = '';
    } else if (tk) {
      statusEl.innerHTML = '<i class="fas fa-circle-check"></i> 已连接（正在获取用户名…）';
      statusEl.className = 'gh-pub-status ok';
      connectBtn.style.display = 'none';
      disconnectBtn.style.display = '';
      fetchUser();
    } else {
      statusEl.innerHTML = '<i class="fas fa-circle-minus"></i> 未连接';
      statusEl.className = 'gh-pub-status';
      connectBtn.style.display = '';
      disconnectBtn.style.display = 'none';
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------- 用 token 查用户名（api.github.com 允许跨域）----------
  function fetchUser() {
    var tk = token();
    if (!tk) return Promise.resolve('');
    return fetch('https://api.github.com/user', {
      headers: { 'Authorization': 'Bearer ' + tk, 'Accept': 'application/vnd.github+json' }
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var login = (j && j.login) || '';
      if (login) saveAuth(tk, login);
      renderStatus();
      return login;
    }).catch(function () {
      // token 失效了
      clearAuth();
      renderStatus();
      return '';
    });
  }

  // ---------- 弹窗内容 ----------
  function showModal(html) {
    if (!modal || !modalBody) return;
    modalBody.innerHTML = html;
    modal.classList.add('show');
  }
  function closeModal() {
    if (modal) modal.classList.remove('show');
    stopPolling();
  }

  function renderLoading(text) {
    showModal('<div class="gh-auth-loading"><i class="fas fa-circle-notch fa-spin"></i> ' + escapeHtml(text) + '</div>');
  }

  function renderCodePage(d) {
    var remain = Math.floor((d.expiresIn || 900) / 60);
    showModal(
      '<div class="gh-code-tip">把这个码输到刚打开的网页里，然后点授权：</div>'
      + '<div class="gh-code" id="ghCodeText">' + escapeHtml(d.userCode) + '</div>'
      + '<div class="gh-code-actions">'
      + '  <button class="gh-pub-btn" id="ghCodeOpen"><i class="fas fa-up-right-from-square"></i> 打开授权网页</button>'
      + '  <button class="gh-pub-btn ghost" id="ghCodeCopy"><i class="far fa-copy"></i> 复制这个码</button>'
      + '</div>'
      + '<div class="gh-code-status" id="ghCodeStatus">等待授权中…（这个码 ' + remain + ' 分钟内有效）</div>'
    );
    var openBtn = document.getElementById('ghCodeOpen');
    if (openBtn) openBtn.addEventListener('click', function () {
      if (ipc) ipc.invoke('gh-open-verify', d.verificationUri);
      else window.open(d.verificationUri, '_blank');
    });
    var copyBtn = document.getElementById('ghCodeCopy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      try {
        navigator.clipboard.writeText(d.userCode);
        copyBtn.innerHTML = '<i class="fas fa-check"></i> 已复制';
        setTimeout(function () { copyBtn.innerHTML = '<i class="far fa-copy"></i> 复制这个码'; }, 1500);
      } catch (e) {}
    });
  }

  function setCodeStatus(html, cls) {
    var el = document.getElementById('ghCodeStatus');
    if (!el) return;
    el.innerHTML = html;
    el.className = 'gh-code-status' + (cls ? ' ' + cls : '');
  }

  // ---------- 轮询 ----------
  function stopPolling() {
    if (polling) { clearTimeout(polling); polling = null; }
    pollCount = 0;
    currentDevice = null;
  }

  function startPolling(d) {
    stopPolling();
    currentDevice = d;
    var interval = Math.max(5, (d.interval || 5) * 1000);
    var maxTries = Math.ceil(((d.expiresIn || 900) * 1000) / interval);

    function tick() {
      if (!currentDevice) return;
      ipc.invoke('gh-device-poll', currentDevice.deviceCode).then(function (r) {
        if (!currentDevice) return;              // 已被取消
        if (r && r.ok && r.authorized && r.token) {
          stopPolling();
          var tk = r.token;
          saveAuth(tk, '');
          setCodeStatus('<i class="fas fa-circle-check"></i> 授权成功，正在读取账号信息…', 'ok');
          var tk2 = token();
          fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'Bearer ' + tk2, 'Accept': 'application/vnd.github+json' }
          }).then(function (res) { return res.json(); }).then(function (j) {
            saveAuth(tk2, (j && j.login) || '');
            renderStatus();
            setTimeout(closeModal, 600);
            if (typeof showToast === 'function') showToast('✅ 已连接 GitHub' + (j && j.login ? '：' + j.login : ''));
          }).catch(function () {
            renderStatus();
            setTimeout(closeModal, 600);
          });
          return;
        }
        if (r && r.ok && r.pending) {
          pollCount++;
          if (r.slowDown) interval += 5000;
          if (pollCount > maxTries) {
            stopPolling();
            setCodeStatus('<i class="fas fa-triangle-exclamation"></i> 这个码过期了，请关掉重新连接', 'err');
            return;
          }
          setCodeStatus('等待授权中…（已等 ' + Math.round((pollCount * interval) / 1000) + ' 秒）');
          polling = setTimeout(tick, interval);
          return;
        }
        stopPolling();
        setCodeStatus('<i class="fas fa-triangle-exclamation"></i> ' + escapeHtml((r && r.error) || '授权失败'), 'err');
      }).catch(function (e) {
        stopPolling();
        setCodeStatus('<i class="fas fa-triangle-exclamation"></i> ' + escapeHtml((e && e.message) || '网络错误'), 'err');
      });
    }

    polling = setTimeout(tick, interval);
  }

  // ---------- 连接 / 断开 ----------
  function connect() {
    if (!ipc) { if (typeof showToast === 'function') showToast('只有桌面版才能连接 GitHub'); return; }
    renderLoading('正在向 GitHub 申请授权码…');
    ipc.invoke('gh-device-start').then(function (r) {
      if (!r || !r.ok) {
        showModal('<div class="gh-auth-err"><i class="fas fa-triangle-exclamation"></i> '
          + escapeHtml((r && r.error) || '申请失败') + '</div>');
        return;
      }
      renderCodePage(r);
      startPolling(r);
      // 自动打开浏览器（失败也不影响，用户可点按钮）
      ipc.invoke('gh-open-verify', r.verificationUri);
    }).catch(function (e) {
      showModal('<div class="gh-auth-err"><i class="fas fa-triangle-exclamation"></i> '
        + escapeHtml((e && e.message) || '申请失败') + '</div>');
    });
  }

  function disconnect() {
    clearAuth();
    renderStatus();
    if (typeof showToast === 'function') showToast('已断开 GitHub 连接');
  }

  connectBtn.addEventListener('click', connect);
  if (disconnectBtn) disconnectBtn.addEventListener('click', disconnect);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && modal.classList.contains('show')) closeModal();
  });

  // 启动时检查一次
  renderStatus();

  // 对外暴露给「发布」功能用
  window.EmberGitHub = {
    token: token,
    username: username,
    isConnected: function () { return !!(token() && username()); },
    refreshStatus: renderStatus
  };

  // ==========================================================================
  //  发布到 GitHub Pages
  //  文件全部由调用方传进来（工坊传内存里的 HTML，Agent 传磁盘上的文件）
  // ==========================================================================
  var API = 'https://api.github.com';
  var REPO = 'ember-games';
  var RECORDS_KEY = 'llm_publish_records';      // 发布记录（只存本机）

  // ---------- 发布记录 ----------
  function getRecords() {
    try {
      var a = JSON.parse(localStorage.getItem(RECORDS_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveRecords(list) {
    try { localStorage.setItem(RECORDS_KEY, JSON.stringify(list.slice(0, 100))); } catch (e) {}
  }
  function addRecord(r) {
    var list = getRecords();
    // 同一个目录重复发布 → 更新而不是新增
    list = list.filter(function (x) { return x.dir !== r.dir; });
    list.unshift({
      dir: r.dir, url: r.url, user: r.user, repo: r.repo,
      title: r.title || r.dir,
      time: new Date().toLocaleString('zh-CN', { hour12: false })
    });
    saveRecords(list);
    renderRecords();
  }
  function removeRecord(dir) {
    saveRecords(getRecords().filter(function (x) { return x.dir !== dir; }));
    renderRecords();
  }

  // ---------- 从 GitHub 真正删除一个已发布目录 ----------
  // Contents API 不能删目录，只能一个个删文件；所以先递归收集文件，再逐个删
  // 路径编码：按段编码、保留斜杠（整段 encodeURIComponent 会把 / 变成 %2F，个别接口会 404）
  function encPath(p) {
    return String(p).split('/').map(encodeURIComponent).join('/');
  }

  async function collectFiles(user, branch, dirPath, bust) {
    var out = [];
    // ★ 加时间戳参数绕过 GitHub 的目录列表缓存：删完马上查会拿到旧列表
    var q = '?ref=' + encodeURIComponent(branch) + (bust ? ('&t=' + Date.now()) : '');
    var r = await gh('/repos/' + user + '/' + REPO + '/contents/' + encPath(dirPath) + q);
    if (!r.ok || !Array.isArray(r.json)) return out;
    for (var i = 0; i < r.json.length; i++) {
      var it = r.json[i];
      if (it.type === 'dir') {
        var sub = await collectFiles(user, branch, it.path, bust);
        out = out.concat(sub);
      } else if (it.type === 'file') {
        out.push({ path: it.path, sha: it.sha });
      }
    }
    return out;
  }

  // 删一个文件，失败自动重试一次（限流/版本号变化都能靠重试解决）
  async function deleteOneFile(user, branch, path, sha) {
    var body = { message: 'delete ' + path, sha: sha, branch: branch };
    var r = await gh('/repos/' + user + '/' + REPO + '/contents/' + encPath(path), {
      method: 'DELETE', body: body
    });
    if (r.ok) return { ok: true };
    if (r.status === 404) return { ok: true };            // 已经没了，算成功

    // 版本号不对（409/422）→ 重新取一次 sha 再试
    await new Promise(function (s) { setTimeout(s, 900); });
    var fresh = await gh('/repos/' + user + '/' + REPO + '/contents/' + encPath(path) + '?ref=' + branch);
    if (!fresh.ok || !fresh.json || !fresh.json.sha) return { ok: true };   // 取不到=已删除
    var r2 = await gh('/repos/' + user + '/' + REPO + '/contents/' + encPath(path), {
      method: 'DELETE',
      body: { message: 'delete ' + path, sha: fresh.json.sha, branch: branch }
    });
    if (r2.ok || r2.status === 404) return { ok: true };
    return { ok: false, path: path, error: ((r2.json && r2.json.message) || ('HTTP ' + r2.status)) };
  }

  async function deletePublished(dir) {
    if (!token() || !username()) return { ok: false, error: '请先连接 GitHub' };
    var user = username();
    var info = await gh('/repos/' + user + '/' + REPO);
    var branch = (info.ok && info.json && info.json.default_branch) || 'main';
    var files = await collectFiles(user, branch, dir);
    if (!files.length) {
      removeRecord(dir);
      return { ok: true, count: 0, already: true };
    }
    var failed = [];
    for (var i = 0; i < files.length; i++) {
      var d = await deleteOneFile(user, branch, files[i].path, files[i].sha);
      if (!d.ok) failed.push(d);
      await new Promise(function (s) { setTimeout(s, 450); });   // 轻微节流
    }

    // ★ 复查：GitHub 的目录列表有缓存，删完立刻查常常还是旧结果。
    //   所以：加时间戳绕过缓存 + 最多重试 3 次（每次隔 1.2 秒）
    var left = [];
    for (var t = 0; t < 3; t++) {
      await new Promise(function (s) { setTimeout(s, 1200); });
      left = await collectFiles(user, branch, dir, true);
      if (!left.length) break;
    }

    if (!left.length) {
      removeRecord(dir);
      return { ok: true, count: files.length, verified: true };
    }

    // 复查还有文件，但删除请求本身没报错 → 大概率是缓存/延迟，按成功处理
    if (!failed.length) {
      removeRecord(dir);
      return { ok: true, count: files.length, lag: true, left: left.length };
    }

    return {
      ok: false,
      error: '还有 ' + left.length + ' 个文件没删掉：' + left.map(function (f) {
        return f.path.split('/').pop();
      }).join('、') + '。可以再点一次删除重试。',
      files: left.map(function (f) { return f.path; })
    };
  }

  function renderRecords() {
    var box = document.getElementById('ghPubList');
    if (!box) return;
    var list = getRecords();
    if (!list.length) {
      box.innerHTML = '<div class="gh-pub-empty">还没有发布过。生成一个游戏后点「发布到网页」。</div>';
      return;
    }
    box.innerHTML = '';
    list.forEach(function (rec) {
      var item = document.createElement('div');
      item.className = 'gh-pub-item';
      item.innerHTML =
        '<div class="gh-pub-item-main">'
        + '  <div class="gh-pub-item-title">' + escapeHtml(rec.title || rec.dir) + '</div>'
        + '  <div class="gh-pub-item-time">' + escapeHtml(rec.time || '') + '</div>'
        + '  <div class="gh-pub-item-url">' + escapeHtml(rec.url) + '</div>'
        + '</div>'
        + '<div class="gh-pub-item-actions">'
        + '  <button data-act="qr" title="显示二维码"><i class="fas fa-qrcode"></i></button>'
        + '  <button data-act="open" title="在电脑上打开"><i class="fas fa-up-right-from-square"></i></button>'
        + '  <button data-act="copy" title="复制链接"><i class="far fa-copy"></i></button>'
        + '  <button data-act="del" title="从列表移除（不影响 GitHub 上的游戏）"><i class="fas fa-trash"></i></button>'
        + '</div>';
      item.querySelector('[data-act="qr"]').addEventListener('click', function () {
        showResult({ url: rec.url, dir: rec.dir, firstTime: false, pending: false });
      });
      item.querySelector('[data-act="open"]').addEventListener('click', function () {
        if (ipc) ipc.invoke('open-external-url', rec.url);
        else window.open(rec.url, '_blank');
      });
      item.querySelector('[data-act="copy"]').addEventListener('click', function () {
        try {
          navigator.clipboard.writeText(rec.url);
          if (typeof showToast === 'function') showToast('✅ 链接已复制');
        } catch (e) {}
      });
      item.querySelector('[data-act="del"]').addEventListener('click', async function () {
        var msg = '这会从 GitHub 上删掉这个游戏的文件，那个网址会立刻失效。'
          + '如果只想从列表里移除、保留游戏，就点「只移除列表」。';
        var really = window.showConfirm
          ? await window.showConfirm(msg, { danger: true, okLabel: '彻底删除', cancelLabel: '只移除列表' })
          : (window.ask ? await window.ask(msg) : false);

        if (!really) {
          removeRecord(rec.dir);
          if (typeof showToast === 'function') showToast('已从列表移除（GitHub 上的游戏还在）');
          return;
        }
        if (!window.EmberGitHub || !window.EmberGitHub.isConnected()) {
          if (typeof showToast === 'function') showToast('请先连接 GitHub 才能删除');
          return;
        }
        if (typeof showToast === 'function') showToast('正在删除…');
        var del = await deletePublished(rec.dir);
        if (del.ok) {
          if (typeof showToast === 'function') {
            showToast(del.lag
              ? '✅ 已删除（GitHub 列表可能有几秒延迟）'
              : '✅ 已删除（共 ' + del.count + ' 个文件）');
          }
        } else {
          if (typeof showToast === 'function') showToast('删除失败：' + (del.error || '未知原因'));
        }
      });
      box.appendChild(item);
    });
  }

  function ghHeaders(extra) {
    return Object.assign({
      'Authorization': 'Bearer ' + token(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, extra || {});
  }

  async function gh(pathname, options) {
    options = options || {};
    var res = await fetch(API + pathname, {
      method: options.method || 'GET',
      headers: ghHeaders(options.body ? { 'Content-Type': 'application/json' } : null),
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    var txt = await res.text();
    var json = null;
    try { json = txt ? JSON.parse(txt) : null; } catch (e) {}
    // ★ 401 = 令牌失效（被吊销 / 过期 / 用户改过密码）。
    //   顺手清掉本地令牌，界面立刻显示「未连接」，用户不会再反复点发布无效重试。
    if (res.status === 401) {
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        if (window.EmberGitHub && window.EmberGitHub.refreshStatus) window.EmberGitHub.refreshStatus();
      } catch (e) {}
    }
    return { ok: res.ok, status: res.status, json: json, text: txt };
  }

  function toBase64(str) {
    // 渲染进程有 nodeIntegration，直接用 Buffer 处理 UTF-8 最稳
    try { return Buffer.from(str, 'utf8').toString('base64'); } catch (e) {}
    return btoa(unescape(encodeURIComponent(str)));
  }

  // 确保仓库存在；返回 { ok, branch }
  async function ensureRepo(user, onStep) {
    if (onStep) onStep('正在检查仓库…');
    var r = await gh('/repos/' + user + '/' + REPO);
    if (r.ok) return { ok: true, branch: (r.json && r.json.default_branch) || 'main' };

    if (onStep) onStep('第一次使用，正在创建仓库…');
    // auto_init: true —— 让仓库自带一次提交，否则没有分支，Pages 打不开
    var c = await gh('/user/repos', {
      method: 'POST',
      body: { name: REPO, private: false, auto_init: true, description: 'Ember 发布的游戏' }
    });
    if (c.ok) return { ok: true, branch: (c.json && c.json.default_branch) || 'main' };
    if (c.status === 422) return { ok: true, branch: 'main' };   // 已存在
    return { ok: false, error: '创建仓库失败：' + ((c.json && c.json.message) || ('HTTP ' + c.status)) };
  }

  // 上传一个文件（存在则更新）
  async function putFile(user, branch, path, base64, message) {
    var sha = null;
    var probe = await gh('/repos/' + user + '/' + REPO + '/contents/' + encPath(path) + '?ref=' + branch);
    if (probe.ok && probe.json && probe.json.sha) sha = probe.json.sha;
    var body = { message: message || ('publish ' + path), content: base64, branch: branch };
    if (sha) body.sha = sha;
    var r = await gh('/repos/' + user + '/' + REPO + '/contents/' + encPath(path), {
      method: 'PUT', body: body
    });
    return r.ok ? { ok: true } : { ok: false, error: ((r.json && r.json.message) || ('HTTP ' + r.status)) };
  }

  // 放一个 .nojekyll：关掉 GitHub Pages 的 Jekyll 处理。
  // 不加的话 Jekyll 会去"编译"我们上传的 HTML/JS，遇到 Liquid 语法（{{ }}、{% %}）
  // 或者奇怪文件名就报错，表现就是「部署失败 / 站点生成失败」，但文件其实都传上去了。
  async function ensureNoJekyll(user, branch) {
    var probe = await gh('/repos/' + user + '/' + REPO + '/contents/.nojekyll?ref=' + branch);
    if (probe.ok) return;   // 已经有了
    await gh('/repos/' + user + '/' + REPO + '/contents/.nojekyll', {
      method: 'PUT',
      body: { message: 'add .nojekyll', content: toBase64('\n'), branch: branch }
    });
  }

  // 打开 Pages（已开过会返回 409，视为成功）；created 表示这次是"刚开启"
  async function ensurePages(user, branch, onStep) {
    if (onStep) onStep('正在打开网页托管…');
    var r = await gh('/repos/' + user + '/' + REPO + '/pages', {
      method: 'POST',
      body: { source: { branch: branch, path: '/' } }
    });
    if (r.ok) return { ok: true, created: true };
    if (r.status === 409) return { ok: true, created: false };   // 已经开启
    if (r.status === 422) return { ok: true, created: false };   // 参数已存在
    return { ok: false, error: '开启网页托管失败：' + ((r.json && r.json.message) || ('HTTP ' + r.status)) };
  }

  // 等部署完成
  async function waitBuild(user, onStep) {
    var deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      var r = await gh('/repos/' + user + '/' + REPO + '/pages/builds/latest');
      if (r.ok && r.json) {
        if (r.json.status === 'built') return { ok: true, built: true };
        if (r.json.status === 'errored') {
          // ★ 站点"构建报告失败"并不代表游戏没发上去：文件已经 commit 了。
          //   实测过：报告 errored 的同时，链接照样能打开（GitHub 的构建状态常有滞后/误报）。
          //   所以这里只当作"还没构建好"处理，不让整次发布变成失败。
          return {
            ok: true,
            built: false,
            buildError: (r.json.error && r.json.error.message) || '未知原因'
          };
        }
      }
      if (onStep) onStep('正在生成网页…（首次发布通常要 1~2 分钟）');
      await new Promise(function (s) { setTimeout(s, 5000); });
    }
    // 超时不算失败：文件已经传上去了，只是站点还没生成完
    return { ok: true, built: false };
  }

  // 主入口：files = [{ path, text }] 或 [{ path, base64 }]
  async function publishGame(opts) {
    if (!token() || !username()) return { ok: false, error: '还没有连接 GitHub' };
    var user = username();
    var dir = String(opts.dir || '').replace(/[^A-Za-z0-9_-]/g, '') || ('game-' + Date.now());
    var files = opts.files || [];
    if (!files.length) return { ok: false, error: '没有要发布的文件' };
    var onStep = opts.onStep || function () {};

    var rp = await ensureRepo(user, onStep);
    if (!rp.ok) return rp;

    var total = files.length;
    for (var i = 0; i < total; i++) {
      var f = files[i];
      onStep('正在上传文件 ' + (i + 1) + '/' + total + '：' + f.path);
      var b64 = f.base64 || toBase64(f.text || '');
      var up = await putFile(user, rp.branch, dir + '/' + f.path, b64,
        'publish ' + dir + ' / ' + f.path);
      if (!up.ok) return { ok: false, error: '上传 ' + f.path + ' 失败：' + up.error };
    }

    var pg = await ensurePages(user, rp.branch, onStep);
    if (!pg.ok) return pg;
    try { await ensureNoJekyll(user, rp.branch); } catch (e) {}

    var wb = await waitBuild(user, onStep);
    if (!wb.ok) return wb;

    return {
      ok: true,
      url: 'https://' + user.toLowerCase() + '.github.io/' + REPO + '/' + dir + '/',
      dir: dir,
      user: user,
      repo: REPO,
      title: opts.title || dir,
      firstTime: !!pg.created,
      pending: !wb.built,         // true = 还在生成，让用户等一下再打开
      buildError: wb.buildError || ''   // 站点构建报了错（文件仍已上传）
    };
  }

  window.EmberPublish = { publishGame: publishGame, repo: REPO };

  // ---------- 发布结果弹窗 ----------
  function showResult(r) {
    var m = document.getElementById('ghResultModal');
    var b = document.getElementById('ghResultBody');
    if (!m || !b) {
      if (typeof showToast === 'function') showToast('已发布：' + r.url);
      return;
    }
    if (typeof setResultTitle === 'function') setResultTitle(true);   // ★ 复位成"发布成功"
    b.innerHTML =
      '<div class="gh-code-tip">用手机扫码，或直接打开这个网址：</div>'
      + '<div class="gh-qr-wrap"><img class="gh-qr" alt="二维码" '
      + 'src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data='
      + encodeURIComponent(r.url) + '" '
      + 'onerror="this.style.display=\'none\';var t=document.getElementById(\'ghQrFallback\');if(t)t.style.display=\'block\';">'
      + '<div id="ghQrFallback" class="gh-qr-fallback" style="display:none;">二维码没加载出来（需要联网）<br>可以直接复制下面的链接</div></div>'
      + '<div class="gh-url-box" id="ghResultUrl">' + escapeHtml(r.url) + '</div>'
      + (r.pending || r.firstTime
          ? '<div class="gh-wait-tip"><i class="fas fa-clock"></i> '
            + (r.firstTime ? '第一次发布要生成站点，' : '')
            + '如果现在打开是 404 或空白，<b>等 1~2 分钟再刷新</b>就好了。'
            + (r.buildError ? '<br>（站点构建报告：' + escapeHtml(String(r.buildError).slice(0, 80))
              + ' —— 文件已经传上去了，一般过一会儿会自动生效。）' : '')
            + '</div>'
          : '')
      + '<div class="gh-code-actions">'
      + '  <button class="gh-pub-btn" id="ghResultOpen"><i class="fas fa-up-right-from-square"></i> 在电脑上打开</button>'
      + '  <button class="gh-pub-btn ghost" id="ghResultCopy"><i class="far fa-copy"></i> 复制链接</button>'
      + '</div>'
      + '<div class="gh-code-status">手机扫上面的码，或把链接发到手机上打开</div>';
    m.classList.add('show');

    var ob = document.getElementById('ghResultOpen');
    if (ob) ob.addEventListener('click', function () {
      if (ipc) ipc.invoke('open-external-url', r.url);
      else window.open(r.url, '_blank');
    });
    var cb = document.getElementById('ghResultCopy');
    if (cb) cb.addEventListener('click', function () {
      try {
        navigator.clipboard.writeText(r.url);
        cb.innerHTML = '<i class="fas fa-check"></i> 已复制';
        setTimeout(function () { cb.innerHTML = '<i class="far fa-copy"></i> 复制链接'; }, 1500);
      } catch (e) {}
    });
    var close = document.getElementById('ghResultClose');
    if (close) close.addEventListener('click', function () { m.classList.remove('show'); });
    m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('show'); });
  }

  // 发布失败也用弹窗说清楚（toast 一闪就没了，用户容易以为"没反应"）
  function setResultTitle(ok) {
    var t = document.getElementById('ghResultTitle');
    if (!t) return;
    if (ok) {
      t.innerHTML = '<i class="fas fa-circle-check"></i> 发布成功';
      t.style.color = '';
    } else {
      t.innerHTML = '<i class="fas fa-triangle-exclamation"></i> 发布失败';
      t.style.color = '#ff8a80';
    }
  }

  function showError(msg) {
    var m = document.getElementById('ghResultModal');
    var b = document.getElementById('ghResultBody');
    if (!m || !b) {
      if (typeof showToast === 'function') showToast('发布失败：' + msg);
      return;
    }
    setResultTitle(false);
    // ★ 授权失效是最常见的一种失败：给准确指引，并把本地失效的令牌清掉，
    //   否则用户会一直点、一直失败，还以为是网络问题。
    var expired = /bad credentials|401|unauthorized/i.test(String(msg || ''));
    var hint = expired
      ? 'GitHub 授权已经失效（令牌被吊销或过期）。打开「设置 → 发布到网页」，点「断开」再点「连接 GitHub」重新授权一次即可。'
      : '如果提示连不上 GitHub，请先开代理；如果提示权限不足，去设置里断开后重新连接一次。';
    b.innerHTML = '<div class="gh-auth-err"><i class="fas fa-triangle-exclamation"></i> '
      + (expired ? '授权失效' : '发布失败') + '</div>'
      + '<div class="gh-url-box" style="color:#ff8a80;border-color:rgba(255,138,128,.35);">'
      + escapeHtml(String(msg || '未知原因')) + '</div>'
      + '<div class="gh-code-status">' + hint + '</div>';
    m.classList.add('show');
    var close = document.getElementById('ghResultClose');
    if (close) close.addEventListener('click', function () { m.classList.remove('show'); });
    m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('show'); });
  }

  // 发布成功就自动写一条记录（同一目录重复发布则更新那一条）
  var _origShowResult = showResult;
  showResult = function (r) {
    if (r && r.ok && r.url && r.dir) { try { addRecord(r); } catch (e) {} }
    _origShowResult(r);
  };

  // ---------- 从 GitHub 同步已有发布（recovery：换机器 / 清过数据 / 老版本发的） ----------
  async function syncFromGithub() {
    if (!token() || !username()) {
      if (typeof showToast === 'function') showToast('请先连接 GitHub');
      return;
    }
    var user = username();
    if (typeof showToast === 'function') showToast('正在从 GitHub 读取…');
    try {
      var r = await gh('/repos/' + user + '/' + REPO + '/contents/');
      if (!r.ok) {
        if (typeof showToast === 'function') showToast(r.status === 404 ? '还没有发布过任何游戏' : '读取失败：HTTP ' + r.status);
        return;
      }
      var dirs = (r.json || []).filter(function (x) { return x.type === 'dir'; });
      var list = getRecords();
      var have = {};
      list.forEach(function (x) { have[x.dir] = 1; });
      var added = 0;
      dirs.forEach(function (d) {
        if (have[d.name]) return;
        list.push({
          dir: d.name,
          url: 'https://' + user.toLowerCase() + '.github.io/' + REPO + '/' + d.name + '/',
          user: user, repo: REPO, title: d.name, time: '（早前发布，时间未知）'
        });
        added++;
      });
      saveRecords(list);
      renderRecords();
      if (typeof showToast === 'function') {
        showToast(added ? '✅ 同步到 ' + added + ' 个已发布的游戏' : '列表已经是最新的了');
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast('同步失败：' + (e.message || e));
    }
  }

  var syncBtn = document.getElementById('ghPubSync');
  if (syncBtn) syncBtn.addEventListener('click', syncFromGithub);

  window.EmberPublish.showResult = showResult;
  window.EmberPublish.showError = showError;
  window.EmberPublish.showProgress = showProgress;
  window.EmberPublish.updateProgress = updateProgress;
  window.EmberPublish.hideProgress = hideProgress;

  // ---------- 发布进度弹窗（点下去立刻出现，每步实时更新） ----------
  var progTimer = null;
  var progStart = 0;

  function setProgressText(msg) {
    var t = document.getElementById('ghProgText');
    if (t) t.textContent = msg || '';
  }
  function setProgressBar(pct) {
    var f = document.getElementById('ghProgFill');
    if (f) f.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }
  function showProgress(msg) {
    var m = document.getElementById('ghProgressModal');
    if (!m) { if (typeof showToast === 'function') showToast(msg || '正在发布…'); return; }
    setProgressText(msg || '准备中…');
    setProgressBar(6);
    progStart = Date.now();
    var el = document.getElementById('ghProgElapsed');
    if (el) el.textContent = '已用 0 秒';
    m.classList.add('show');
    if (progTimer) clearInterval(progTimer);
    progTimer = setInterval(function () {
      var el2 = document.getElementById('ghProgElapsed');
      if (el2) el2.textContent = '已用 ' + Math.round((Date.now() - progStart) / 1000) + ' 秒';
    }, 1000);
  }
  function updateProgress(msg, pct) {
    setProgressText(msg);
    if (typeof pct === 'number') setProgressBar(pct);
  }
  function hideProgress() {
    if (progTimer) { clearInterval(progTimer); progTimer = null; }
    var m = document.getElementById('ghProgressModal');
    if (m) m.classList.remove('show');
  }
  // ==========================================================================
  //  发布一个本地文件夹（Agent 生成的多文件游戏用这个）
  //  rootAbs：要发布的文件夹绝对路径；entryFile：入口 html（用来判断根目录）
  // ==========================================================================
  var MAX_FILE = 8 * 1024 * 1024;        // 单文件 8MB 上限
  var MAX_TOTAL = 30 * 1024 * 1024;      // 总大小 30MB 上限

  function collectLocalFiles(rootAbs) {
    var fs = require('fs');
    var path = require('path');
    var out = [];
    var total = 0;
    var skipped = [];

    (function walk(dir, rel) {
      var ents;
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      ents.forEach(function (e) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name.charAt(0) === '.') return;
        var abs = path.join(dir, e.name);
        var r = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) { walk(abs, r); return; }
        if (!e.isFile()) return;
        var st;
        try { st = fs.statSync(abs); } catch (e2) { return; }
        if (st.size > MAX_FILE) { skipped.push(r + '（超过 8MB）'); return; }
        if (total + st.size > MAX_TOTAL) { skipped.push(r + '（总量超限）'); return; }
        try {
          out.push({ path: r, base64: fs.readFileSync(abs).toString('base64') });
          total += st.size;
        } catch (e3) { skipped.push(r + '（读取失败）'); }
      });
    })(rootAbs, '');

    return { files: out, skipped: skipped, total: total };
  }

  async function publishFolder(opts) {
    opts = opts || {};
    var rootAbs = opts.rootAbs;
    if (!rootAbs) { showError('没有指定要发布的文件夹'); return; }
    if (!token() || !username() || !window.EmberGitHub || !window.EmberGitHub.isConnected()) {
      showError('还没有连接 GitHub。请打开「设置 → 发布到网页」点一下「连接 GitHub」。');
      return;
    }

    var pathMod = require('path');
    var fsMod = require('fs');
    var hasIndex = false;
    try { hasIndex = fsMod.existsSync(pathMod.join(rootAbs, 'index.html')); } catch (e) {}

    showProgress('正在读取游戏文件…');
    var got;
    try { got = collectLocalFiles(rootAbs); }
    catch (e2) { hideProgress(); showError('读取文件夹失败：' + (e2.message || e2)); return; }

    if (!got.files.length) {
      hideProgress();
      showError('这个文件夹里没有可发布的文件。');
      return;
    }
    if (!hasIndex) {
      // 没有根 index.html，Pages 打开会是 404 —— 提醒但允许继续
      var goOn = window.showConfirm
        ? await window.showConfirm('这个文件夹里没有 index.html，发布出去打开可能是 404。仍要继续吗？')
        : false;
      if (!goOn) { hideProgress(); return; }
    }

    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var dirName = 'game-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
      + pad(d.getHours()) + pad(d.getMinutes());

    updateProgress('共 ' + got.files.length + ' 个文件，准备上传…', 12);
    var step = 0;
    var r = await publishGame({
      dir: dirName,
      files: got.files,
      title: opts.title || dirName,
      onStep: function (t) {
        step++;
        updateProgress(t, Math.min(85, 12 + step * 10));
      }
    });
    hideProgress();

    if (r && r.ok) {
      if (got.skipped.length && typeof showToast === 'function') {
        showToast('有 ' + got.skipped.length + ' 个文件被跳过（太大或读不了）');
      }
      showResult(r);
    } else {
      showError((r && r.error) || '未知原因');
    }
  }

  window.EmberPublish.publishFolder = publishFolder;

  // 「选择文件夹发布」：对话清空了、或游戏是别处生成的，都能直接选文件夹发
  (function bindPickFolder() {
    var b = document.getElementById('ghPubFolder');
    if (!b) return;
    b.addEventListener('click', async function () {
      if (!ipc) { if (typeof showToast === 'function') showToast('只有桌面版才能选文件夹'); return; }
      if (!window.EmberGitHub || !window.EmberGitHub.isConnected()) {
        showError('还没有连接 GitHub。请点上方「连接 GitHub」，按提示输一次码。');
        return;
      }
      try {
        var r = await ipc.invoke('agent-pick-folders');
        if (!r || r.canceled) return;
        var f = (r.folders && r.folders[0]) || null;
        if (!f || !f.path) { if (typeof showToast === 'function') showToast('没选到文件夹'); return; }
        publishFolder({ rootAbs: f.path, title: f.name || f.path });
      } catch (e) {
        showError('选择文件夹失败：' + (e.message || e));
      }
    });
  })();
  window.EmberPublish.getRecords = getRecords;

  window.EmberPublish.renderRecords = renderRecords;
  window.EmberPublish.syncFromGithub = syncFromGithub;
  try { renderRecords(); } catch (e) {}

  // ==========================================================================
  //  工坊的「发布到网页」按钮：在这里绑定，只依赖 DOM id
  //  （放在工坊模块里曾出现"点了完全没反应"，所以移出来独立处理）
  // ==========================================================================
  (function bindWorkshopPublish() {
    var btn = document.getElementById('wsPublishBtn');
    if (!btn) return;
    if (btn.getAttribute('data-bound') === '1') return;
    btn.setAttribute('data-bound', '1');

    var wsCode = document.getElementById('wsCode');
    var wsType = document.getElementById('wsType');
    var wsStatus = document.getElementById('wsStatus');
    var PLACEHOLDER = '生成的可运行代码会显示在这里';
    var setStatus = function (m) { if (wsStatus) wsStatus.textContent = m || ''; };
    var toast = function (m) { if (typeof window.showToast === 'function') window.showToast(m); };

    btn.addEventListener('click', async function () {
      btn.disabled = true;
      showProgress('准备发布…');
      try {
        var html = (wsCode ? (wsCode.innerText || wsCode.textContent || '') : '').trim();
        if (html === PLACEHOLDER) html = '';
        if (!html) {
          hideProgress();
          setStatus('没有可发布的代码，请先生成');
          showError('工作区里还没有代码。先在工坊里生成一个游戏，再来发布。');
          return;
        }
        if (wsType && wsType.value !== 'html') {
          var go = window.showConfirm
            ? await window.showConfirm('当前输出类型不是「HTML 单文件」，发布出去可能打不开。仍要继续吗？')
            : true;
          if (!go) { hideProgress(); return; }
        }
        if (!window.EmberGitHub || !window.EmberGitHub.isConnected()) {
          hideProgress();
          setStatus('请先到「设置 → 发布到网页」里连接 GitHub');
          showError('还没有连接 GitHub。请打开「设置 → 发布到网页」点一下「连接 GitHub」，按提示输一次码就好。');
          return;
        }

        var files = [{ path: 'index.html', text: html }];
        if (/phaser\.min\.js/.test(html)) {
          try {
            var fs = require('fs');
            var path = require('path');
            var libPath = path.join(__dirname, 'lib', 'phaser.min.js');
            if (fs.existsSync(libPath)) {
              files.push({ path: 'phaser.min.js', base64: fs.readFileSync(libPath).toString('base64') });
            }
          } catch (e2) {}
        }
        var d = new Date();
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        var dirName = 'game-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
          + pad(d.getHours()) + pad(d.getMinutes());

        var stepNo = 0;
        var r = await publishGame({
          dir: dirName,
          files: files,
          onStep: function (t) {
            stepNo++;
            updateProgress(t, Math.min(85, 8 + stepNo * 12));
            setStatus(t);
          }
        });
        hideProgress();
        if (r && r.ok) {
          setStatus('✅ 已发布');
          showResult(r);
        } else {
          var em = (r && r.error) || '未知原因';
          setStatus('❌ ' + em);
          showError(em);
        }
      } catch (e) {
        hideProgress();
        var em2 = (e && e.message) ? e.message : String(e);
        setStatus('❌ ' + em2);
        showError(em2);
        try { console.error('[发布]', e); } catch (x) {}
      } finally {
        btn.disabled = false;
      }
    });
  })();
})();
