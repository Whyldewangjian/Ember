// browser-ui.js —— 浏览页面窗口工具栏逻辑（配合主进程 WebContentsView）
(function () {
  'use strict';

  let ipc = null;
  try { ipc = require('electron').ipcRenderer; } catch (e) {}

  // ---------- ★ 跟随当前主题 ----------
  const BR_THEMES = {
    default: { bg: '#0b0d0f', panel: '#16191d', panel2: '#1d2126', input: '#0d0f12', text: '#e8eaed', dim: '#9aa3ad', accent: '#3ecf8e', accentText: '#07231a' },
    blue:    { bg: '#0a0d14', panel: '#141922', panel2: '#1b2230', input: '#0c1018', text: '#e8ecf2', dim: '#98a3b3', accent: '#4c8dff', accentText: '#061426' },
    pink:    { bg: '#160d12', panel: '#20151d', panel2: '#2a1c24', input: '#170e14', text: '#f0e8ec', dim: '#b09aa6', accent: '#ff6b9d', accentText: '#2a0717' },
    orange:  { bg: '#0d0e10', panel: '#16181c', panel2: '#1e2126', input: '#101214', text: '#e9ebee', dim: '#9aa2ac', accent: '#ff9a3c', accentText: '#1a1105' }
  };
  (function applyTheme() {
    let key = 'default';
    try { key = localStorage.getItem('llm_theme_key') || 'default'; } catch (e) {}
    const t = BR_THEMES[key] || BR_THEMES.default;
    const r = document.documentElement.style;
    r.setProperty('--br-bg', t.bg);
    r.setProperty('--br-panel', t.panel);
    r.setProperty('--br-panel2', t.panel2);
    r.setProperty('--br-input', t.input);
    r.setProperty('--br-text', t.text);
    r.setProperty('--br-dim', t.dim);
    r.setProperty('--br-accent', t.accent);
    r.setProperty('--br-accent-text', t.accentText);
  })();

  const urlInput = document.getElementById('brUrl');
  const backBtn = document.getElementById('brBack');
  const forwardBtn = document.getElementById('brForward');
  const reloadBtn = document.getElementById('brReload');
  const goBtn = document.getElementById('brGo');
  const dlBtn = document.getElementById('brDownloads');
  const dlPanel = document.getElementById('brDownloadsPanel');
  const dlList = document.getElementById('brDlList');
  const dlBadge = document.getElementById('brDlBadge');
  const dlClose = document.getElementById('brDlClose');

  let isLoading = false;

  function nav(action, url) {
    if (ipc) ipc.invoke('browser-nav', { action: action, url: url }).catch(function () {});
  }

  if (ipc) {
    ipc.on('browser-state', function (e, st) {
      if (!st) return;
      if (st.url) urlInput.value = st.url;
      backBtn.disabled = !st.canGoBack;
      forwardBtn.disabled = !st.canGoForward;
      isLoading = !!st.loading;
      if (isLoading) {
        reloadBtn.innerHTML = '<i class="fas fa-times"></i>';
        reloadBtn.title = '停止加载';
      } else {
        reloadBtn.innerHTML = '<i class="fas fa-rotate-right"></i>';
        reloadBtn.title = '刷新';
      }
    });
  }

  backBtn.addEventListener('click', function () { nav('back'); });
  forwardBtn.addEventListener('click', function () { nav('forward'); });
  reloadBtn.addEventListener('click', function () { nav(isLoading ? 'stop' : 'reload'); });
  goBtn.addEventListener('click', function () { navigate(urlInput.value); });
  urlInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') navigate(this.value);
  });

  function navigate(input) {
    let url = String(input || '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url) && !/^file:\/\//i.test(url)) {
      if (/^[\w-]+(\.[\w-]+)+/.test(url)) url = 'https://' + url;
      else url = 'https://www.bing.com/search?q=' + encodeURIComponent(url);
    }
    nav('go', url);
  }

  // ---------- ★ 窗口控制（无边框窗口） ----------
  const brMin = document.getElementById('brMin');
  const brMax = document.getElementById('brMax');
  const brClose = document.getElementById('brClose');
  if (brMin) brMin.addEventListener('click', function () { if (ipc) ipc.invoke('bwin-minimize').catch(function () {}); });
  if (brMax) brMax.addEventListener('click', function () { if (ipc) ipc.invoke('bwin-maximize').catch(function () {}); });
  if (brClose) brClose.addEventListener('click', function () { if (ipc) ipc.invoke('bwin-close').catch(function () {}); });

  // ---------- 下载面板 ----------
  const downloads = {};
  let panelOpen = false;

  dlBtn.addEventListener('click', function () {
    panelOpen = !panelOpen;
    dlPanel.style.display = panelOpen ? 'flex' : 'none';
    if (ipc) ipc.invoke('browser-toggle-panel', panelOpen).catch(function () {});
  });
  dlClose.addEventListener('click', function () {
    panelOpen = false;
    dlPanel.style.display = 'none';
    if (ipc) ipc.invoke('browser-toggle-panel', false).catch(function () {});
  });

  function renderDownloads() {
    const items = Object.keys(downloads).map(function (k) { return downloads[k]; });
    const activeCount = items.filter(function (d) { return d.state === 'progressing'; }).length;
    if (activeCount > 0) {
      dlBadge.style.display = 'flex';
      dlBadge.textContent = activeCount;
    } else {
      dlBadge.style.display = 'none';
    }
    dlList.innerHTML = '';
    if (items.length === 0) {
      dlList.innerHTML = '<div class="br-dl-empty">暂无下载</div>';
      return;
    }
    items.forEach(function (d) {
      const row = document.createElement('div');
      row.className = 'br-dl-item';
      const pct = d.total > 0 ? Math.round(d.received / d.total * 100) : 0;
      let statusHTML = '';
      if (d.state === 'progressing') {
        statusHTML = '<div class="br-dl-bar"><div class="br-dl-bar-in" style="width:' + pct + '%"></div></div>' +
                     '<span class="br-dl-pct">' + pct + '%</span>';
      } else if (d.state === 'completed') {
        statusHTML = '<span class="br-dl-done">已完成</span>' +
                     '<button class="br-dl-open" data-path="' + (d.filePath || '') + '">打开</button>' +
                     '<button class="br-dl-show" data-path="' + (d.filePath || '') + '">浏览位置</button>';
      } else {
        statusHTML = '<span class="br-dl-fail">失败 / 已取消</span>';
      }
      row.innerHTML =
        '<div class="br-dl-name" title="' + d.filename + '">' + d.filename + '</div>' +
        '<div class="br-dl-status">' + statusHTML + '</div>';
      dlList.appendChild(row);
    });
    dlList.querySelectorAll('.br-dl-open').forEach(function (b) {
      b.addEventListener('click', function () { if (ipc) ipc.invoke('open-downloaded-file', this.dataset.path); });
    });
    dlList.querySelectorAll('.br-dl-show').forEach(function (b) {
      b.addEventListener('click', function () { if (ipc) ipc.invoke('show-downloaded-file', this.dataset.path); });
    });
  }

  if (ipc) {
    ipc.on('download-update', function (e, d) {
      downloads[d.id] = d;
      renderDownloads();
    });
  }
  renderDownloads();
})();
