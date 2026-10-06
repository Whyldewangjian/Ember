// ======================== APP 工坊（独立模块，可整删） ========================
(function () {
  'use strict';

  const btn = document.getElementById('appWorkshopSwitchBtn');
  const mode = document.getElementById('workshopMode');
  if (!btn || !mode) return;

  const mainArea = document.querySelector('.main-area');
  const bottomBar = document.querySelector('.bottom-bar');
  let active = false;
  let generatedCode = '';
  let wsPrevCode = '';           // ★ 回溯：上一版本
  let wsImages = [];             // ★ 参考图（画面风格）

  let packing = false;          // ★ 打包/构建进行中


  let ipc = null;
  try { ipc = require('electron').ipcRenderer; } catch (e) {}

  // ---------- 模型下拉 ----------
  const modelSelect = document.getElementById('wsModelSelect');
  function renderModelSelect() {
    if (!modelSelect) return;
    const list = (typeof apis !== 'undefined' && Array.isArray(apis)) ? apis : [];
    modelSelect.innerHTML = '';
    if (!list.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '未配置';
      modelSelect.appendChild(opt);
      return;
    }
    list.forEach(function (a) {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.model || '';
      // ★ 按工坊自己的模型显示选中项（不再跟主页共用）
      const myId = (typeof window.scopeApiId === 'function') ? window.scopeApiId('workshop') : activeApiId;
      if (typeof activeApiId !== 'undefined' && a.id === myId) opt.selected = true;
      modelSelect.appendChild(opt);
    });
  }
  if (modelSelect) {
    modelSelect.addEventListener('change', function () {
      const id = this.value;
      if (!id) return;
      // ★ 只改工坊自己的模型（不再影响主页/对话/分镜）
      if (typeof setActiveModel === 'function') setActiveModel('workshop', id);
      if (typeof renderWsImgs === 'function') renderWsImgs();
    });

  }
  window.__syncWsModelSelect = renderModelSelect;

  // ---------- 模式切换 ----------
  function enter() {
    if (active) return;
    if (window.__exitChatMode) window.__exitChatMode();
    if (window.__exitCanvasMode) window.__exitCanvasMode();
    if (window.__exitStoryboardMode) window.__exitStoryboardMode();
    if (window.__exitAgentMode) window.__exitAgentMode();
    active = true;
    if (mainArea) mainArea.style.display = 'none';
    if (bottomBar) bottomBar.style.display = 'none';
    const td = document.querySelector('.time-display');
    if (td) td.style.display = ''; document.body.classList.add('mode-active');
    const home = document.getElementById('homeSwitchBtn');
    if (home) home.classList.remove('active');
    document.querySelectorAll('.mode-switch').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    mode.style.display = 'flex';
    renderModelSelect();
  }
  function exit() {
    if (!active) return;
    active = false;
    mode.style.display = 'none';
    btn.classList.remove('active');
    const td = document.querySelector('.time-display');
    if (td) td.style.display = ''; document.body.classList.remove('mode-active');
    if (mainArea) mainArea.style.display = '';
    if (bottomBar) bottomBar.style.display = '';
  }
  btn.addEventListener('click', function () { if (!active) enter(); });
  window.__enterWorkshopMode = enter;
  window.__exitWorkshopMode = exit;

  // ---------- 窗口控制 ----------
  function bindWin(id, action) {
    const el = document.getElementById(id);
    if (el && ipc) el.addEventListener('click', function () { ipc.invoke(action).catch(function () {}); });
  }
  bindWin('wsDockBtn', 'dock-enable');
  bindWin('wsWinMinBtn', 'win-minimize');
  bindWin('wsWinMaxBtn', 'win-maximize');

  // ★ 关闭按钮：用克隆体替换，确保只有下面这一个监听；打包中先确认，避免误关中断
  const wsClose = document.getElementById('wsWinCloseBtn');
  if (wsClose && wsClose.parentNode) {
    const freshClose = wsClose.cloneNode(true);
    wsClose.parentNode.replaceChild(freshClose, wsClose);
    freshClose.addEventListener('click', async function () {
      if (packing) {
        if (!(await ask('正在打包应用，现在关闭会中断打包。\n\n确定要关闭吗？'))) return;
      }
      if (typeof requestCloseApp === 'function') requestCloseApp();
      else if (ipc) ipc.invoke('win-close').catch(function () {});
    });
  }

  const wsSettings = document.getElementById('wsSettingsBtn');
  if (wsSettings) {
    wsSettings.addEventListener('click', function () {
      const sb = document.getElementById('settingsBtn');
      if (sb) sb.click();
    });
  }

  // ---------- 元素 ----------
  const promptInput = document.getElementById('wsPrompt');
  const typeSelect = document.getElementById('wsType');
  const extraInput = document.getElementById('wsExtra');
  const genBtn = document.getElementById('wsGenerateBtn');
  const statusEl = document.getElementById('wsStatus');
  const codeEl = document.getElementById('wsCode');
  const runBtn = document.getElementById('wsRunBtn');
  const saveBtn = document.getElementById('wsSaveBtn');
  const copyBtn = document.getElementById('wsCopyBtn');
  const rollbackBtn = document.getElementById('wsRollbackBtn');
  // ★ 迭代
  const reviseInput = document.getElementById('wsRevise');
  const reviseBtn = document.getElementById('wsReviseBtn');
  const reviseStatusEl = document.getElementById('wsReviseStatus');
  // ★ 打包
  const packBtn = document.getElementById('wsPackBtn');
  const portableCb = document.getElementById('wsPortable');

  const EXT_MAP = { html: 'html', js: 'js', python: 'py', css: 'css' };

  // ======================== ★ 应用图标选择 ========================
  const ICON_KEY = 'llm_ws_icon';
  const pathMod = require('path');
  const fsMod = require('fs');
  const urlMod = require('url');
  function resourceRoot() {
    try {
      if (process.resourcesPath) {
        const asar = pathMod.join(process.resourcesPath, 'app.asar');
        if (fsMod.existsSync(asar)) return asar;
      }
    } catch (e) {}
    const cwd = process.cwd ? process.cwd() : '';
    if (cwd && fsMod.existsSync(pathMod.join(cwd, 'image'))) return cwd;
    return pathMod.dirname(process.execPath || '');
  }
  function writableRoot() {
    if (process.resourcesPath && process.execPath) return pathMod.dirname(process.execPath);
    const cwd = process.cwd ? process.cwd() : '';
    return cwd || pathMod.dirname(process.execPath || '');
  }
  const ICON_ROOT = pathMod.join(resourceRoot(), 'image', 'app-icons');
  const ICON_CUSTOM_DIR = pathMod.join(writableRoot(), 'image', 'app-icons', 'custom');
  const DEFAULT_ICON = pathMod.join(resourceRoot(), 'build', 'icon.ico');


  const iconBtn = document.getElementById('wsIconBtn');
  const iconCurrentEl = document.getElementById('wsIconCurrent');

  const iconOverlay = document.getElementById('iconPickerOverlay');
  const iconGrid = document.getElementById('iconGrid');
  const iconUploadGrid = document.getElementById('iconUploadGrid');
  const iconBuiltinPane = document.getElementById('iconBuiltinPane');
  const iconUploadPane = document.getElementById('iconUploadPane');
  const iconUploadBtn = document.getElementById('iconUploadBtn');
  const iconPickerCancel = document.getElementById('iconPickerCancel');
  const iconPickerConfirm = document.getElementById('iconPickerConfirm');
  const iconTabBtns = Array.prototype.slice.call(document.querySelectorAll('.icon-tab'));

  let selectedIcon = localStorage.getItem(ICON_KEY) || 'default';
  let pickIcon = selectedIcon;

  function iconPathOf(id) {
    if (id === 'default') return DEFAULT_ICON;
    if (id.indexOf('builtin:') === 0) return pathMod.join(ICON_ROOT, id.slice(8));
    if (id.indexOf('custom:') === 0) return pathMod.join(ICON_CUSTOM_DIR, id.slice(7));
    return DEFAULT_ICON;
  }
  function iconLabelOf(id) {
    if (id === 'default') return '默认（Ember）';
    if (id.indexOf('builtin:') === 0) return id.slice(8).replace(/\.(png|ico)$/i, '');
    if (id.indexOf('custom:') === 0) return '自定义 · ' + id.slice(7).replace(/\.(png|ico)$/i, '');
    return '默认（Ember）';
  }
  function listIcons(dir) {
    try {
      if (!fsMod.existsSync(dir)) return [];
      return fsMod.readdirSync(dir).filter(function (f) { return /\.(png|ico)$/i.test(f); });
    } catch (e) { return []; }
  }
  function thumbUrl(p) {
    try {
      const data = fsMod.readFileSync(p);
      const ext = require('path').extname(p).toLowerCase();
      const mime = (ext === '.png') ? 'image/png' : (ext === '.ico' ? 'image/x-icon' : 'image/png');
      return 'data:' + mime + ';base64,' + data.toString('base64');
    } catch (e) { return ''; }
  }

  function makeIconCell(id, deletable) {
    const cell = document.createElement('div');
    cell.className = 'icon-cell' + (pickIcon === id ? ' active' : '');
    const thumb = document.createElement('div');
    thumb.className = 'icon-thumb';
    if (id === 'default') {
      thumb.innerHTML = '<span class="icon-default-mark"><i class="fas fa-bolt"></i></span>';
    } else {
      thumb.innerHTML = '<img src="' + thumbUrl(iconPathOf(id)) + '" alt="">';
    }
    const label = document.createElement('div');
    label.className = 'icon-cell-label';
    label.textContent = iconLabelOf(id);
    cell.appendChild(thumb);
    cell.appendChild(label);
    if (deletable) {
      const del = document.createElement('span');
      del.className = 'icon-del';
      del.innerHTML = '<i class="fas fa-times"></i>';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        try { fsMod.unlinkSync(iconPathOf(id)); } catch (err) {}
        if (pickIcon === id) pickIcon = 'default';
        renderIconGrid();
      });
      cell.appendChild(del);
    }
    cell.addEventListener('click', function () { pickIcon = id; renderIconGrid(); });
    return cell;
  }
  function renderIconGrid() {
    iconGrid.innerHTML = '';
    iconGrid.appendChild(makeIconCell('default', false));
    listIcons(ICON_ROOT).forEach(function (f) { iconGrid.appendChild(makeIconCell('builtin:' + f, false)); });

    iconUploadGrid.innerHTML = '';
    const customs = listIcons(ICON_CUSTOM_DIR);
    if (!customs.length) {
      iconUploadGrid.innerHTML = '<div class="icon-empty">还没有上传的图标</div>';
    } else {
      customs.forEach(function (f) { iconUploadGrid.appendChild(makeIconCell('custom:' + f, true)); });
    }
  }
  function switchIconTab(tab) {
    iconTabBtns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === tab); });
    iconBuiltinPane.style.display = (tab === 'builtin') ? '' : 'none';
    iconUploadPane.style.display = (tab === 'upload') ? '' : 'none';
  }
  function openIconPicker() {
    pickIcon = selectedIcon;
    renderIconGrid();
    switchIconTab('builtin');
    iconOverlay.classList.add('show');
  }
  function refreshIconEntry() {
    if (!iconCurrentEl) return;
    let useDefault = (selectedIcon === 'default');
    if (!useDefault) {
      try { useDefault = !fsMod.existsSync(iconPathOf(selectedIcon)); }
      catch (e) { useDefault = true; }
    }
    if (useDefault) {
      iconCurrentEl.innerHTML = '<span class="icon-default-mark" style="width:100%;height:100%;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent-dark));display:flex;align-items:center;justify-content:center;color:#fff;"><i class="fas fa-bolt"></i></span>';
    } else {
      iconCurrentEl.innerHTML = '<img src="' + thumbUrl(iconPathOf(selectedIcon)) + '" alt="">';
    }
  }

  if (iconCurrentEl) iconCurrentEl.addEventListener('click', openIconPicker);
  function validateAndSaveIcon(f) {
    const reader = new FileReader();
    reader.onload = function () {
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = function () {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) { setStatus('❌ 上传失败：无法解析该图片'); return; }
        if (w !== h) { setStatus('❌ 上传失败：图标必须是正方形（当前 ' + w + '×' + h + '）'); return; }
        if (w < 256) { setStatus('❌ 上传失败：尺寸需 ≥256×256（当前 ' + w + '×' + h + '）'); return; }
        try {
          if (!fsMod.existsSync(ICON_CUSTOM_DIR)) fsMod.mkdirSync(ICON_CUSTOM_DIR, { recursive: true });
          const ext = pathMod.extname(f.name) || '.png';
          const dest = pathMod.join(ICON_CUSTOM_DIR, 'custom-' + Date.now() + ext);
          fsMod.copyFileSync(f.path, dest);
          pickIcon = 'custom:' + pathMod.basename(dest);
          renderIconGrid();
          switchIconTab('upload');
          setStatus('✅ 图标已上传');
        } catch (err) { setStatus('❌ 上传失败：' + (err && err.message ? err.message : err)); }
      };
      img.onerror = function () { setStatus('❌ 上传失败：无法解析该图片'); };
      img.src = dataUrl;
    };
    reader.onerror = function () { setStatus('❌ 上传失败：读取文件失败'); };
    reader.readAsDataURL(f);
  }

  function closeIconPicker(save) {
    iconOverlay.classList.remove('show');
    if (save) {
      selectedIcon = pickIcon;
      try { localStorage.setItem(ICON_KEY, selectedIcon); } catch (e) {}
      refreshIconEntry();
    }
  }
  if (iconBtn) iconBtn.addEventListener('click', openIconPicker);
  if (iconPickerCancel) iconPickerCancel.addEventListener('click', function () { closeIconPicker(false); });
  if (iconPickerConfirm) iconPickerConfirm.addEventListener('click', function () { closeIconPicker(true); });
  if (iconOverlay) iconOverlay.addEventListener('click', function (e) { if (e.target === iconOverlay) closeIconPicker(false); });
  iconTabBtns.forEach(function (b) { b.addEventListener('click', function () { switchIconTab(b.getAttribute('data-tab')); }); });
  if (iconUploadBtn) {
    iconUploadBtn.addEventListener('click', function () {
      const inp = document.createElement('input');

      inp.type = 'file';
      inp.accept = '.png,.ico';
      inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', function () {
        const f = this.files && this.files[0];
        if (f) validateAndSaveIcon(f);
        document.body.removeChild(inp);
      });

      inp.click();
    });
  }
  refreshIconEntry();
  const TYPE_NAME = { html: 'HTML 单文件', js: 'JavaScript 文件', python: 'Python 脚本', css: 'CSS 样式表' };

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg || ''; }
  function setReviseStatus(msg) { if (reviseStatusEl) reviseStatusEl.textContent = msg || ''; }
  // ★ 高亮开关：打包/构建期间让状态栏突出显示
  function setBusy(on) {
    packing = !!on;
    window.__emberBusy = packing;
    if (statusEl) statusEl.classList.toggle('ws-busy', packing);
  }
  // ★ Electron 里 prompt 不可用；confirm 可用但要防意外，所以统一用 ask()
  function ask(msg) {
    if (typeof window.showConfirm === 'function') return window.showConfirm(msg);
    try { return Promise.resolve(!!window.confirm(msg)); } catch (e) { return Promise.resolve(false); }
  }

  // ---------- 左右栏拖拽调整比例 ----------
  (function initResizer() {
    const resizer = document.getElementById('wsResizer');
    const leftPanel = mode.querySelector('.app-mode-left');
    if (!resizer || !leftPanel) return;
    resizer.addEventListener('mousedown', function (e) {
      e.preventDefault();
      resizer.classList.add('dragging');
      const startX = e.clientX;
      const startW = leftPanel.offsetWidth;
      function onMove(ev) {
        const w = Math.min(Math.max(startW + (ev.clientX - startX), 300), window.innerWidth - 320);
        leftPanel.style.width = w + 'px';
      }
      function onUp() {
        resizer.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  })();
  // ======================== ★ 参考图（画面风格） ========================
  const wsImgBar = document.getElementById('wsImgBar');
  let wsImgFileInput = null;
  function wsApi() { return (typeof window.apiFor === 'function') ? window.apiFor('workshop') : currentApi; }
  function renderWsImgs() {
    if (!wsImgBar) return;
    const A = wsApi();
    if ((!A || !A.vision) && wsImages.length === 0) { wsImgBar.style.display = 'none'; wsImgBar.innerHTML = ''; return; }
    wsImgBar.style.display = '';
    wsImgBar.innerHTML = '';
    if (wsImages.length === 0) {
      wsImgBar.innerHTML = '<div class="img-preview-empty"><i class="fas fa-image"></i> 点击浏览 / 拖拽图片，或 Ctrl+V 粘贴</div>';
      return;
    }
    wsImages.forEach(function (img, idx) {
      const item = document.createElement('div');
      item.className = 'img-item';
      item.innerHTML = '<img src="' + img.dataUrl + '" alt="参考图' + (idx + 1) + '"><button class="img-item-del" title="删除"><i class="fas fa-times"></i></button>';
      item.querySelector('.img-item-del').addEventListener('click', function (e) { e.stopPropagation(); removeWsImage(idx); });
      wsImgBar.appendChild(item);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'img-add-btn';
    addBtn.title = '添加图片';
    addBtn.innerHTML = '<i class="fas fa-plus"></i>';
    addBtn.addEventListener('click', function (e) { e.stopPropagation(); pickWsImage(); });
    wsImgBar.appendChild(addBtn);
  }
  function removeWsImage(idx) { wsImages.splice(idx, 1); renderWsImgs(); }
  function clearWsImages() { wsImages = []; renderWsImgs(); }
  function pickWsImage() {
    const A = wsApi();
    if (!A || !A.vision) { setStatus('当前模型不支持看图，请在设置中勾选「该模型支持看图」'); return; }
    if (wsImgFileInput) wsImgFileInput.click();
  }
  async function addWsImage(file) {
    if (!file) return;
    const A = wsApi();
    if (!A || !A.vision) { setStatus('当前模型不支持看图，请在设置中勾选「该模型支持看图」'); return; }
    if (!file.type.startsWith('image/')) { setStatus('请选择图片文件'); return; }
    if (file.size > 10 * 1024 * 1024) { setStatus('图片过大，请选择 10MB 以内的图片'); return; }
    try {
      const dataUrl = (typeof processBgFile === 'function') ? await processBgFile(file) : '';
      if (!dataUrl) { setStatus('图片处理失败'); return; }
      wsImages.push({ dataUrl: dataUrl, name: file.name });
      renderWsImgs();
      setStatus('✅ 已添加参考图：' + file.name);
    } catch (e) { setStatus('❌ ' + (e.message || '添加失败')); }
  }
  if (wsImgBar) {
    wsImgFileInput = document.createElement('input');
    wsImgFileInput.type = 'file';
    wsImgFileInput.accept = 'image/*';
    wsImgFileInput.style.display = 'none';
    document.body.appendChild(wsImgFileInput);
    wsImgFileInput.addEventListener('change', function () { if (this.files && this.files[0]) addWsImage(this.files[0]); this.value = ''; });
    wsImgBar.addEventListener('click', pickWsImage);
    wsImgBar.addEventListener('dragover', function (e) { e.preventDefault(); this.classList.add('dragover'); });
    wsImgBar.addEventListener('dragleave', function () { this.classList.remove('dragover'); });
    wsImgBar.addEventListener('drop', function (e) {
      e.preventDefault(); this.classList.remove('dragover');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) addWsImage(files[0]);
    });
    document.addEventListener('paste', function (e) {
      if (!active) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') === 0) { addWsImage(items[i].getAsFile()); break; }
      }
    });
    renderWsImgs();
  }

  // ---------- LLM 调用 ----------

  // ---------- LLM 调用 ----------
  async function callLLM(prompt, onDelta, images) {
    const A = (typeof window.apiFor === 'function') ? window.apiFor('workshop') : currentApi;   // ★ 用工坊自己的模型
    if (typeof A === 'undefined' || !A.key) {
      throw new Error('请先在设置中配置 API Key');
    }
    const base = (A.url || '').replace(/\/+$/, '');
    wsAbortCtl = new AbortController(); wsT0 = performance.now(); wsT1 = 0; wsResetIdle(180000); resetCodeBuffer();

    let content = prompt;
    if (images && images.length) {
      content = images.map(function (img) { return { type: 'image_url', image_url: { url: img.dataUrl } }; });
      content.push({ type: 'text', text: prompt });
    }


    const res = await fetch(base + '/chat/completions', { signal: wsAbortCtl.signal,

      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + A.key },
      body: JSON.stringify({
        model: A.model,
        messages: [{ role: 'user', content: content }],
        temperature: 0.7,
        stream: true
      })
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 200));
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '', full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t || !t.startsWith('data:')) continue;
        const d = t.slice(5).trim();
        if (d === '[DONE]') continue;
        try {
          const j = JSON.parse(d);
          const delta = j.choices && j.choices[0] && j.choices[0].delta;
          if (delta && typeof delta.content === 'string') {
            full += delta.content;
            wsResetIdle(30000);

            if (onDelta) onDelta(delta.content, full);

          }
        } catch (e) {}
      }
    }
    clearTimeout(wsIdleTimer);
    return full;

  }
  // ★ 代码框滚动节流：每帧最多滚一次（长代码时读 scrollHeight 会强制重排，很贵）
  let codeScrollPending = false;
  let codeBuf = ''; let wsT0 = 0; let wsT1 = 0;
  function scrollCodeElSoon() {
    if (codeScrollPending) return;
    codeScrollPending = true;
    requestAnimationFrame(function () {
      codeScrollPending = false;
      if (!codeEl) return;
      if (codeBuf) { codeEl.appendChild(document.createTextNode(codeBuf)); codeBuf = ''; }
      codeEl.scrollTop = codeEl.scrollHeight;
    });
  }
  // ★ 流式内容先攒进缓冲区，每帧只写一次 DOM
  //   原来每收到一小块就 append + 强制重排一次，突发一片时会冻结界面几十秒
  function pushCodeText(chunk) { if (!wsT1) wsT1 = performance.now();
    codeBuf += chunk;
    scrollCodeElSoon();
  }
  function resetCodeBuffer() { codeBuf = ''; }


  // ★ 工坊的元数据行（放在代码框下方）
  let wsMetaEl = null;
  function wsModelName() {
    try {
      const id = (typeof window.scopeApiId === 'function') ? window.scopeApiId('workshop') : activeApiId;
      const a = apis.find(function (x) { return x.id === id; });
      return (a && a.model) || currentApi.model || '—';
    } catch (e) { return (currentApi && currentApi.model) || '—'; }
  }
  function showWsMeta(t0, t1, inText, outText) {
    if (typeof window.buildMetaHTML !== 'function' || !codeEl) return;
    if (!wsMetaEl) {
      wsMetaEl = document.createElement('div');
      wsMetaEl.className = 'meta-line ws-meta';
      codeEl.parentNode.insertBefore(wsMetaEl, codeEl.nextSibling);
    }
    wsMetaEl.innerHTML = window.buildMetaHTML(wsModelName(), t0, t1, inText, outText);
  }
  function hideWsMeta() { if (wsMetaEl) wsMetaEl.innerHTML = ''; }

  // ★ 工坊请求的中止 + 空闲看门狗（防止流卡住时永久等待）
  let wsAbortCtl = null;
  let wsIdleTimer = null;
  function wsResetIdle(ms) {
    clearTimeout(wsIdleTimer);
    wsIdleTimer = setTimeout(function () {
      if (wsAbortCtl) { try { wsAbortCtl.abort(); } catch (e) {} }
    }, ms || 30000);   // ★ 默认 30 秒无新数据 → 自动中止
  }

  function wsStopLLM() { if (wsAbortCtl) { try { wsAbortCtl.abort(); } catch (e) {} } }


  // ---------- 提取代码 ----------
  function extractCode(text) {
    const m = String(text || '').match(/```[a-zA-Z0-9._-]*\s*\n([\s\S]*?)```/);
    if (m && m[1]) return m[1].replace(/\s+$/, '');
    return String(text || '').trim();
  }

  // ---------- 构建生成提示词 ----------
  function buildPrompt() {
    const need = (promptInput.value || '').trim();
    const type = typeSelect.value;
    const extra = (extraInput.value || '').trim();
    const typeDesc = TYPE_NAME[type] || '代码文件';

    const lines = [
      '你是一名资深工程师。请根据下面的需求，生成完整、可直接运行的代码。',
      '',
      '【硬性要求】',
      '- 只输出一个代码块（用 ``` 包裹），代码块之外不要写任何解释文字',
      '- 代码必须完整，禁止省略、禁止写「此处省略」「其余同上」',
      '- 必须可直接运行，不依赖未说明的外部环境',
      '- 输出类型：' + typeDesc,
      extra ? '- 补充要求：' + extra : ''
    ];

    // ★ HTML 界面约束：铺满视口、不做网页式居中定宽
    if (type === 'html') {
      lines.push(
        '',
        '【HTML 界面要求（必须严格遵守）】',
        '1. 单文件：CSS 与 JS 全部内联，禁止引用任何外部 CDN、外部字体或本地文件。',
        '2. 页面必须铺满整个视口，禁止任何形式的整体居中留白：',
        '   - html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; }',
        '   - 根容器用 position:fixed; inset:0;（或 width:100vw; height:100dvh;）',
        '   - 禁止用 max-width / margin:0 auto / translate(-50%,-50%) 给整个界面定宽居中',
        '3. 界面内不出现滚动条（overflow:hidden），所有内容在视口内自适应排布。',
        '4. 按桌面应用的观感设计：全屏铺满的深色背景（不要白底），自带顶部工具栏或侧边栏，用 flex/grid 布局，字号可用 clamp() 自适应。',
        '5. 顶部预留一条高 28px 的区域不要放关键内容（该区域会被用作窗口拖动条）。',
        '6. 除代码本身外不要输出任何说明文字。'
      );
    }

    lines.push('', '【需求】', need);
    return lines.join('\n');
  }

  // ---------- 构建迭代提示词 ----------
  function buildRevisePrompt(feedback) {
    const lines = [
      '你之前生成了下面这段代码：',
      '',
      '```',
      generatedCode,
      '```',
      '',
      '用户希望做以下修改：',
      feedback,
      '',
      '请输出**修改后的完整代码**。要求：',
      '- 只输出一个代码块（用 ``` 包裹），代码块之外不要写任何解释文字',
      '- 必须输出完整代码，禁止省略、禁止写「其余同上」',
      '- 未涉及修改的部分保持原样，不要擅自改动',
      '- 必须可直接运行'
    ];
    // ★ HTML 类型：修改后仍须满足界面约束
    if (typeSelect.value === 'html') {
      lines.push(
        '- 界面仍须铺满整个视口：html, body 无外边距、无滚动条，根容器 position:fixed; inset:0;，禁止整页居中定宽'
      );
    }
    return lines.join('\n');
  }

  // ---------- 生成 ----------
  let generating = false;
  genBtn.addEventListener('click', async function () {
    if (generating) return;
    const need = (promptInput.value || '').trim();
    if (!need) { setStatus('请先输入需求描述'); return; }

    generating = true;
    genBtn.disabled = true;
    setStatus('生成中...'); if (codeEl) codeEl.textContent = '正在生成代码...';
    wsPrevCode = generatedCode;
    generatedCode = '';



    try {
      let lastFull = ''; const wsT0 = performance.now(); let wsT1 = 0;
      const wsPrompt = buildPrompt(); await callLLM(wsPrompt, function (chunk, full) {

        if (!wsT1) { wsT1 = performance.now(); if (codeEl) codeEl.textContent = ''; } lastFull = full;

        pushCodeText(chunk);
        setStatus('生成中...（' + lastFull.length + ' 字）');

      }, wsImages);

      generatedCode = extractCode(lastFull);
      setRollbackBtn(false);

      codeEl.textContent = generatedCode || '（未提取到代码，请重试）';
      setStatus(generatedCode ? ('✅ 完成（' + generatedCode.length + ' 字）') : '未提取到代码，可重试'); if (generatedCode) showWsMeta(wsT0, wsT1, wsPrompt, generatedCode); else hideWsMeta();

      saveWsState();
    } catch (err) {
      setStatus(/abort/i.test((err && err.message) || '') ? '⏸ 已中止（或长时间无响应）' : ('❌ ' + (err.message || err)));


      codeEl.textContent = '生成失败：' + (err.message || err);
    } finally {
      generating = false;
      genBtn.disabled = false;
    }
  });

  // ---------- 迭代修改 ----------
  let revising = false;
  if (reviseBtn) {
    reviseBtn.addEventListener('click', async function () {
      if (revising) return;
      if (!generatedCode) { setReviseStatus('请先生成代码，再提修改意见'); return; }
      const feedback = (reviseInput && reviseInput.value || '').trim();
      if (!feedback) { setReviseStatus('请先填写修改意见'); return; }

      revising = true;
      reviseBtn.disabled = true;
      setReviseStatus('修改中...');
      const prevCode = generatedCode; if (codeEl) codeEl.textContent = '正在修改代码...';

      try {
        let lastFull = '';
        const wsPrompt = buildRevisePrompt(feedback); await callLLM(wsPrompt, function (chunk, full) {
          lastFull = full;
          pushCodeText(chunk);
          setReviseStatus('修改中...（' + lastFull.length + ' 字）');

        }, wsImages);

        const newCode = extractCode(lastFull);
        if (!newCode) {
          // 解析失败：还原上一版
          generatedCode = prevCode;
          codeEl.textContent = prevCode;
          setReviseStatus('❌ 未提取到代码，已保留上一版');
        } else {
          wsPrevCode = prevCode;
          generatedCode = newCode;
          setRollbackBtn(false);

          codeEl.textContent = newCode;

          if (reviseInput) reviseInput.value = '';
          setReviseStatus('✅ 修改完成（' + newCode.length + ' 字），可继续提意见或直接运行'); showWsMeta(wsT0, wsT1, wsPrompt, newCode);

          saveWsState();
        }
      } catch (err) {
        // 出错：还原上一版
        generatedCode = prevCode;
        codeEl.textContent = prevCode;
        setReviseStatus(/abort/i.test((err && err.message) || '') ? '⏸ 已中止（已保留上一版）' : ('❌ ' + (err.message || err) + '（已保留上一版）'));


      } finally {
        revising = false;
        reviseBtn.disabled = false;
      }
    });
  }

  // ---------- 回溯到上一版本 ----------
  function setRollbackBtn(rolledBack) {
    if (!rollbackBtn) return;
    rollbackBtn.innerHTML = rolledBack
      ? '<i class="fas fa-rotate-right"></i> 恢复最终版本'
      : '<i class="fas fa-undo"></i> 回溯上一版本';
  }
  function rollbackCode() {

    if (!wsPrevCode) { setStatus('没有可回溯的上一版本'); return; }
    const cur = generatedCode;
    generatedCode = wsPrevCode;
    wsPrevCode = cur;
    codeEl.textContent = generatedCode;
    if (codeEl) {
      codeEl.classList.remove('ws-flash');
      void codeEl.offsetWidth;
      codeEl.classList.add('ws-flash');
    }
    const wasRolledBack = rollbackBtn && rollbackBtn.textContent.indexOf('恢复') !== -1;
    setRollbackBtn(!wasRolledBack);
    setStatus(wasRolledBack ? '✅ 已恢复最终版本' : '✅ 已回溯到上一版本');

    saveWsState();
  }

  if (rollbackBtn) rollbackBtn.addEventListener('click', rollbackCode);

  // ---------- 运行预览（仅 HTML） ----------

  runBtn.addEventListener('click', async function () {
    if (!generatedCode) { setStatus('请先生成代码'); return; }
    if (typeSelect.value !== 'html') {
      setStatus('只有「HTML 单文件」支持直接预览运行');
      return;
    }
    if (!ipc || !ipc.invoke) { setStatus('预览功能仅在桌面版可用'); return; }
    try {
      const r = await ipc.invoke('preview-html', generatedCode);
      if (r && r.ok) setStatus('✅ 已打开预览窗口');
      else setStatus('❌ 预览失败' + (r && r.error ? '：' + r.error : ''));
    } catch (e) {
      setStatus('❌ 预览失败');
    }
  });

  // ---------- 保存为文件 ----------
  saveBtn.addEventListener('click', async function () {
    if (!generatedCode) { setStatus('请先生成代码'); return; }
    const type = typeSelect.value;
    const ext = EXT_MAP[type] || 'txt';
    const defaultName = 'ember_' + Date.now() + '.' + ext;

    if (ipc && ipc.invoke) {
      try {
        const result = await ipc.invoke('save-file-dialog', {
          title: '保存生成的文件',
          defaultPath: defaultName,
          filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
        });
        if (result && !result.canceled && result.filePath) {
          const r = await ipc.invoke('write-file', result.filePath, generatedCode);
          setStatus((r && r.ok) ? ('✅ 已保存：' + result.filePath) : '❌ 写入失败');
        }
      } catch (e) {
        setStatus('❌ 保存失败');
      }
    } else {
      const blob = new Blob([generatedCode], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = defaultName;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });

  // ======================== ★ 打包为应用（electron-builder，和 Ember 自己的打包方式一致） ========================
  // 说明：Electron 里 prompt 不可用，应用名通过「保存对话框」输入，全程不用 prompt。
  //   不勾选 → 只生成一个可打包的 Electron 项目（含 build.bat），秒级完成
  //   勾选   → 生成项目后直接调用 electron-builder 构建，产出 dist\ 里的 exe
  const SHELL_MAIN = `const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    backgroundColor: '#0d0f12',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'app.html'));
  win.once('ready-to-show', function () { win.show(); });
}

ipcMain.on('win-minimize',   function () { if (win) win.minimize(); });
ipcMain.on('win-toggle-max', function () { if (win) { win.isMaximized() ? win.unmaximize() : win.maximize(); } });
ipcMain.on('win-close',      function () { if (win) win.close(); });

app.whenReady().then(createWindow);
app.on('window-all-closed', function () { app.quit(); });
`;

  const SHELL_PRELOAD = `const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('emberWin', {
  minimize:  function () { ipcRenderer.send('win-minimize'); },
  toggleMax: function () { ipcRenderer.send('win-toggle-max'); },
  close:     function () { ipcRenderer.send('win-close'); }
});
`;

  // 注入到作品 HTML 里的无边框标题栏（在普通浏览器里会自动隐藏，无副作用）
  const CHROME_STYLE = '<style id="__ember_chrome_style">'
    + '#__ember_tb{position:fixed;top:0;left:0;right:0;height:28px;z-index:2147483647;'
    + '-webkit-app-region:drag;background:transparent;display:flex;justify-content:flex-end;'
    + 'align-items:center;gap:2px;padding-right:6px;font-family:"Segoe UI",sans-serif;}'
    + '#__ember_tb button{-webkit-app-region:no-drag;width:30px;height:22px;line-height:1;'
    + 'border:0;border-radius:4px;background:rgba(255,255,255,.10);color:#e8eaed;font-size:12px;'
    + 'cursor:pointer;padding:0;}'
    + '#__ember_tb button:hover{background:rgba(255,255,255,.22);}'
    + '#__ember_tb button.__close:hover{background:#e81123;color:#fff;}'
    + '</style>';
  const CHROME_HTML = '<div id="__ember_tb">'
    + '<button id="__ember_min" title="最小化">&#8211;</button>'
    + '<button id="__ember_max" title="最大化">&#9723;</button>'
    + '<button id="__ember_close" class="__close" title="关闭">&#10005;</button>'
    + '</div>';
  const CHROME_JS = '<script>(function(){var w=window.emberWin;var bar=document.getElementById("__ember_tb");'
    + 'if(!w){bar.style.display="none";return;}'
    + 'document.getElementById("__ember_min").onclick=function(){w.minimize()};'
    + 'document.getElementById("__ember_max").onclick=function(){w.toggleMax()};'
    + 'document.getElementById("__ember_close").onclick=function(){w.close()};'
    + '})();<\/script>';

  const CODE_PLACEHOLDER = '生成的可运行代码会显示在这里';

  function injectChrome(html) {
    if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, CHROME_STYLE + '\n</head>');
    else html = CHROME_STYLE + html;
    if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, CHROME_HTML + CHROME_JS + '\n</body>');
    else html = html + CHROME_HTML + CHROME_JS;
    return html;
  }

  // 找 electron-builder 的 CLI（优先用当前项目里的）
  function findBuilderCli(fs, path, appDir) {
    const cands = [
      path.join(process.cwd(), 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js'),
      path.join(appDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
    ];
    for (let i = 0; i < cands.length; i++) { if (fs.existsSync(cands[i])) return cands[i]; }
    return '';
  }

  // 找 node.exe
  function findNode(fs) {
    try {
      const out = require('child_process').execSync('where node', { windowsHide: true }).toString();
      const first = out.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean)[0];
      if (first && fs.existsSync(first)) return first;
    } catch (e) {}
    return '';
  }

  // ★ 检测 npx（Node.js）是否可用
  function checkNpx(cb) {
    try {
      require('child_process').exec('npx -v', { windowsHide: true, timeout: 10000 }, function (err) { cb(!err); });
    } catch (e) { cb(false); }
  }
  function checkWinget(cb) {
    try {
      require('child_process').exec('winget -v', { windowsHide: true, timeout: 10000 }, function (err) { cb(!err); });
    } catch (e) { cb(false); }
  }
  function installNodeViaWinget() {
    return new Promise(function (resolve) {
      try {
        require('child_process').exec('winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements', { windowsHide: false }, function (err) {
          resolve(!err);
        });
      } catch (e) { resolve(false); }
    });
  }
  function openNodeSite() {
    try { require('electron').shell.openExternal('https://nodejs.org/zh-cn/download/'); } catch (e) {}
  }
  // ★ 走系统 npx 执行命令
  function runNpx(args, cwd, onLine) {
    return new Promise(function (resolve, reject) {
      const cp = require('child_process');
      const proc = cp.spawn('npx', args, {
        cwd: cwd, windowsHide: true, shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let buf = '';
      function handle(chunk) {
        buf += chunk.toString();
        const parts = buf.split(/\r?\n/);
        buf = parts.pop();
        parts.forEach(function (l) { const s = l.trim(); if (s && onLine) onLine(s); });
      }
      proc.stdout.on('data', handle);
      proc.stderr.on('data', handle);
      proc.on('error', reject);
      proc.on('close', function (code) {
        if (code === 0) resolve();
        else reject(new Error('构建进程退出码 ' + code));
      });
    });
  }

  // 跑命令并把输出逐行回调
  function runStream(cmd, args, cwd, onLine) {

    return new Promise(function (resolve, reject) {
      const cp = require('child_process').spawn(cmd, args, {
        cwd: cwd,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' })
      });
      let buf = '';
      function handle(chunk) {
        buf += chunk.toString();
        const parts = buf.split(/\r?\n/);
        buf = parts.pop();
        parts.forEach(function (l) { const s = l.trim(); if (s && onLine) onLine(s); });
      }
      cp.stdout.on('data', handle);
      cp.stderr.on('data', handle);
      cp.on('error', reject);
      cp.on('close', function (code) {
        if (code === 0) resolve();
        else reject(new Error('构建进程退出码 ' + code));
      });
    });
  }

  function buildBat() {
    return [
      '@echo off',
      'chcp 65001 >nul',
      'cd /d "%~dp0"',
      'echo 正在打包，请稍候（首次会下载依赖，需要联网）...',
      'call npx --yes electron-builder --win --publish never',
      'echo.',
      'echo 打包结束，产物在 dist\\ 文件夹里。',
      'pause'
    ].join('\r\n');
  }

  function projectReadme(name) {
    return [
      name + ' —— 打包项目说明',
      '',
      '1) 本文件夹是一个标准的 Electron 项目（main.js / preload.js / app.html / package.json）。',
      '2) 直接运行调试：在本文件夹执行   npm install electron   然后   npx electron .',
      '3) 打包成 exe：双击 build.bat（或执行 npx electron-builder --win --publish never），产物在 dist\\ 里。',
      '4) 换图标：把 256×256 的 icon.ico 放到本文件夹，重新打包即可。',
      '',
      '打包配置写在 package.json 的 build 字段里，与 Ember 自己的做法一致。'
    ].join('\r\n');
  }

  function openFolder(dir) {
    try { require('child_process').exec('explorer "' + dir + '"'); } catch (e) {}
  }

  if (packBtn) {
    packBtn.addEventListener('click', async function () {
      const fs = require('fs'); const os = require('os');

      const path = require('path');

      let html = (codeEl ? (codeEl.innerText || '') : '').trim();
      if (html === CODE_PLACEHOLDER) html = '';
      if (!html) { setStatus('没有可打包的代码，请先生成'); return; }

      if (typeSelect.value !== 'html') {
        if (!(await ask('当前输出类型不是「HTML 单文件」，打包出的应用无法正常显示。仍要继续吗？'))) return;
      }

      packBtn.disabled = true;
      try {
        // 1) 选输出位置（应用名在这里输入）
        if (!ipc || !ipc.invoke) { setStatus('打包功能仅在桌面版可用'); return; }
        const picked = await ipc.invoke('save-file-dialog', {
          title: '选择输出位置（勾选"立即构建"则只生成一个 exe，否则新建项目文件夹）',
          defaultPath: '我的应用',
          filters: [{ name: '全部文件', extensions: ['*'] }]
        });
        if (!picked || picked.canceled || !picked.filePath) { setStatus('已取消'); return; }

        const outDir = path.dirname(picked.filePath);
        let name = path.basename(picked.filePath).replace(/\.[^.]+$/, '').trim() || '我的应用';
        name = name.replace(/[\\/:*?"<>|]/g, '_');
        const doBuild = !!(portableCb && portableCb.checked);
        // ★ 勾选"立即构建"时：项目建在系统临时目录（你看不到），构建完只把 exe 复制出来
        const appDir = doBuild ? path.join(os.tmpdir(), 'ember-build-' + Date.now()) : path.join(outDir, name);


        // 2) 生成项目文件
        setStatus('生成项目文件 ...');
        await fs.promises.mkdir(appDir, { recursive: true });
        await fs.promises.writeFile(path.join(appDir, 'main.js'), SHELL_MAIN, 'utf8');
        await fs.promises.writeFile(path.join(appDir, 'preload.js'), SHELL_PRELOAD, 'utf8');
        await fs.promises.writeFile(path.join(appDir, 'app.html'), injectChrome(html), 'utf8');

        // ★ 复制应用图标（没选到就用默认 Ember 图标）
        let iconFile = '';
        try {
          const iconSrc = iconPathOf(selectedIcon);
          if (fs.existsSync(iconSrc)) {
            iconFile = 'icon' + path.extname(iconSrc);
            fs.copyFileSync(iconSrc, path.join(appDir, iconFile));
          }
        } catch (e) { iconFile = ''; }

        const pkg = {
          name: 'ember-generated-app',
          productName: name,
          version: '1.0.0',
          description: name,
          author: 'Ember',
          main: 'main.js',
          build: {
            appId: 'com.ember.generated.app',
            productName: name,
            electronVersion: process.versions.electron,
            directories: { output: 'dist' },
            files: ['main.js', 'preload.js', 'app.html', 'package.json'].concat(iconFile ? [iconFile] : []),
            win: {
              target: [
                { target: 'portable', arch: ['x64'] }
              ]
            },
            portable: { artifactName: '${productName}.exe' },
            nsis: {
              oneClick: false,
              allowToChangeInstallationDirectory: true,
              createDesktopShortcut: true,
              artifactName: '${productName} Setup.exe'
            }
          }
        };
        if (iconFile) pkg.build.win.icon = iconFile;
        await fs.promises.writeFile(path.join(appDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
        await fs.promises.writeFile(path.join(appDir, 'build.bat'), buildBat(), 'utf8');
        await fs.promises.writeFile(path.join(appDir, '使用说明.txt'), projectReadme(name), 'utf8');


        // 3) 不勾选：只生成项目
        if (!doBuild) {
          setStatus('已生成可打包项目：' + appDir + '（双击其中的 build.bat 即可出 exe）');
          if (await ask('已生成可打包项目：\n' + appDir + '\n\n现在打开该文件夹吗？')) openFolder(appDir);
          return;
        }

        // 4) 勾选：检测 Node.js 环境，然后走 npx 构建
        const hasNode = await new Promise(function (resolve) { checkNpx(resolve); });
        if (!hasNode) {
          const wantInstall = await ask('未检测到 Node.js 环境。\n\n打包 exe 需要 Node.js（含 npx）。\n\n点「确定」：尝试用 winget 自动安装；\n点「取消」：打开官网手动下载。');
          if (wantInstall) {
            setStatus('正在检测 winget ...');
            const hasWg = await new Promise(function (resolve) { checkWinget(resolve); });
            if (hasWg) {
              setStatus('正在自动安装 Node.js（请在弹出的窗口里点「是」允许）...');
              const ok = await installNodeViaWinget();
              setStatus(ok ? 'Node.js 已安装，请重启 Ember 后再试一次立即构建。' : 'Node.js 安装未完成，请重启 Ember 后重试，或手动安装。');
            } else {
              setStatus('未找到 winget，将打开官网手动下载。');
              openNodeSite();
            }
          } else {
            openNodeSite();
          }
          return;
        }


        setBusy(true);                                   // ★ 高亮状态栏 + 防误关
        setStatus('⏳ 正在构建应用（首次需联网下载依赖，约 3～10 分钟，请耐心等待，勿关闭窗口）...');
        try {
          await runNpx(['--yes', 'electron-builder', '--win', '--publish', 'never'], appDir, function (line) {
            const shortLine = line.length > 90 ? ('…' + line.slice(-90)) : line;
            setStatus('⏳ 构建中：' + shortLine);
          });
        } finally {
          setBusy(false);
        }

        const distDir = path.join(appDir, 'dist');
        let produced = [];
        try { produced = fs.readdirSync(distDir).filter(function (f) { return /\.exe$/i.test(f); }); } catch (e) {}

        // ★ 勾选了"立即构建"：只把 exe 复制到你选的位置，然后删掉临时项目
        if (doBuild) {
          if (!produced.length) {
            setStatus('⚠ 构建结束但没找到 exe。临时项目保留在：' + appDir);
            if (await ask('构建结束但没找到 exe。\n临时项目保留在：\n' + appDir + '\n\n现在打开该文件夹吗？')) openFolder(appDir);
            return;
          }
          const srcExe = path.join(distDir, produced[0]);
          const dstExe = path.join(outDir, name + '.exe');
          try {
            if (fs.existsSync(dstExe)) fs.rmSync(dstExe, { force: true });
            fs.copyFileSync(srcExe, dstExe);
          } catch (err) {
            setStatus('⚠ exe 已生成但复制失败：' + (err && err.message ? err.message : err) + '（源文件在 ' + srcExe + '）');
            if (await ask('复制失败。\n源文件：\n' + srcExe + '\n\n现在打开该文件夹吗？')) openFolder(distDir);
            return;
          }
          try { fs.rmSync(appDir, { recursive: true, force: true }); } catch (e) {}
          setStatus('✅ 已生成：' + dstExe);
          if (await ask('构建完成，已生成：\n' + dstExe + '\n\n现在打开所在文件夹吗？')) openFolder(outDir);
          return;
        }

        // 未勾选：保持原行为（项目文件夹留在你选的位置，可双击 build.bat 再打包）
        setStatus('✅ 构建完成：' + (produced.length ? produced.join('、') : '请查看 dist 文件夹'));
        if (await ask('构建完成：\n' + distDir + '\n' + (produced.length ? produced.join('\n') : '') + '\n\n现在打开 dist 文件夹吗？')) openFolder(distDir);

      } catch (err) {
        setStatus('打包失败：' + (err && err.message ? err.message : err));
      } finally {
        setBusy(false);
        packBtn.disabled = false;
      }
    });
  }

  // ======================== 状态持久化（多项目，重开保留内容） ========================
  const WS_PROJECTS_KEY = 'llm_ws_projects';
  const OLD_WS_KEY = 'llm_workshop_state';
  let wsProjects = [];
  let currentProjectId = null;
  let wsSaveTimer = null;

  function wsStateKey() { return 'llm_ws_state_' + currentProjectId; }

  function saveWsState() {
    if (!currentProjectId) return;
    try {
      localStorage.setItem(wsStateKey(), JSON.stringify({
        prompt: promptInput.value,
        type: typeSelect.value,
        extra: extraInput.value,
        portable: portableCb ? !!portableCb.checked : false,
        code: (generatedCode && generatedCode.length <= 200000) ? generatedCode : '',
        prev: (wsPrevCode && wsPrevCode.length <= 200000) ? wsPrevCode : ''
      }));
    } catch (e) {}
  }
  function saveWsDebounced() {
    clearTimeout(wsSaveTimer);
    wsSaveTimer = setTimeout(function () { if (!generating && !revising) saveWsState(); }, 400);
  }

  function loadProjectState() {
    try {
      const s = JSON.parse(localStorage.getItem(wsStateKey()) || '{}');
      promptInput.value = (s.prompt != null) ? s.prompt : '';
      typeSelect.value = s.type || 'html';
      extraInput.value = (s.extra != null) ? s.extra : '';
      if (portableCb) portableCb.checked = !!s.portable;
      generatedCode = s.code || '';
      wsPrevCode = s.prev || '';
      codeEl.textContent = generatedCode || CODE_PLACEHOLDER;
      hideWsMeta();
    } catch (e) {}
  }

  function renderProjectSelect() {
    const sel = document.getElementById('wsProjectSelect');
    if (!sel) return;
    sel.innerHTML = '';
    wsProjects.forEach(function (p) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = (p.name || '项目').slice(0, 16);
      sel.appendChild(opt);
    });
    if (currentProjectId) sel.value = currentProjectId;
  }

  function switchProject(id) {
    const p = wsProjects.find(function (x) { return x.id === id; });
    if (!p) return;
    saveWsState();
    currentProjectId = id;
    loadProjectState();
    renderProjectSelect();
    setStatus('已切换到项目：' + (p.name || '项目'));
  }

  function newProject() {
    const s = {
      id: 'wp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: '新项目',
      time: new Date().toLocaleString('zh-CN', { hour12: false })
    };
    wsProjects.push(s);
    try { localStorage.setItem(WS_PROJECTS_KEY, JSON.stringify(wsProjects)); } catch (e) {}
    switchProject(s.id);
    if (promptInput) promptInput.focus();
  }

  function deleteProject(id) {
    if (wsProjects.length <= 1) { setStatus('至少保留一个项目'); return; }
    const wasCurrent = (currentProjectId === id);
    wsProjects = wsProjects.filter(function (p) { return p.id !== id; });
    try { localStorage.setItem(WS_PROJECTS_KEY, JSON.stringify(wsProjects)); } catch (e) {}
    try { localStorage.removeItem('llm_ws_state_' + id); } catch (e) {}
    if (wasCurrent) {
      currentProjectId = wsProjects[0].id;
      loadProjectState();
      renderProjectSelect();
      setStatus('已删除项目');
    } else {
      renderProjectSelect();
    }
  }

  function loadProjects() {
    try {
      wsProjects = JSON.parse(localStorage.getItem(WS_PROJECTS_KEY) || '[]');
    } catch (e) { wsProjects = []; }
    if (!Array.isArray(wsProjects) || !wsProjects.length) {
      const first = { id: 'wp_' + Date.now(), name: '默认项目', time: new Date().toLocaleString('zh-CN', { hour12: false }) };
      wsProjects = [first];
      try {
        const old = localStorage.getItem(OLD_WS_KEY);
        localStorage.setItem(WS_PROJECTS_KEY, JSON.stringify(wsProjects));
        if (old) {
          localStorage.setItem('llm_ws_state_' + first.id, old);
          localStorage.removeItem(OLD_WS_KEY);
        }
      } catch (e) {}
    }
    currentProjectId = wsProjects[0].id;
  }


  [promptInput, extraInput].forEach(function (el) {
    if (el) el.addEventListener('input', saveWsDebounced);
  });
  if (typeSelect) typeSelect.addEventListener('change', saveWsDebounced);
  if (portableCb) portableCb.addEventListener('change', saveWsDebounced);
  if (codeEl) {
    new MutationObserver(saveWsDebounced).observe(codeEl, { childList: true, childData: true, characterData: true, subtree: true });
  }

  // ★ 复制代码
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      let text = (codeEl ? (codeEl.innerText || '') : '').trim();
      if (text === CODE_PLACEHOLDER) text = '';
      if (!text) { setStatus('没有可复制的代码，请先生成'); return; }
      if (typeof copyTextToClipboard === 'function') {
        copyTextToClipboard(text).then(function (ok) { setStatus(ok ? '✅ 已复制到剪贴板' : '❌ 复制失败'); });
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { setStatus('✅ 已复制到剪贴板'); }, function () { setStatus('❌ 复制失败'); });
      } else {
        setStatus('❌ 复制失败');
      }
    });
  }

  // ★ 拖拽 txt 读取代码（用于重新打包或迭代修改）
  if (codeEl && codeEl.parentNode) {
    const codeWrap = codeEl.parentNode;
    codeWrap.addEventListener('dragover', function (e) { e.preventDefault(); });
    codeWrap.addEventListener('drop', function (e) {
      e.preventDefault();
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      const f = files[0];
      if (!/\.(txt|html|js|css|py|json|md)$/i.test(f.name)) {
        setStatus('请拖入文本文件（.txt / .html / .js / .css 等）');
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        const text = String(reader.result || '');
        if (!text.trim()) { setStatus('文件内容为空'); return; }
        generatedCode = text;
        setRollbackBtn(false);

        codeEl.textContent = text;
        setStatus('✅ 已读取 ' + f.name + '（' + text.length + ' 字），可打包或迭代修改');
        saveWsState();
      };
      reader.onerror = function () { setStatus('读取文件失败'); };
      reader.readAsText(f, 'utf-8');
    });
  }

  function openRenameProject() {
    const p = wsProjects.find(function (x) { return x.id === currentProjectId; });
    const overlay = document.getElementById('wsRenameOverlay');
    const input = document.getElementById('wsRenameInput');
    if (!p || !overlay || !input) return;
    input.value = p.name || '';
    overlay.classList.add('show');
    input.focus();
    input.select();
  }
  function closeRenameProject() {
    const overlay = document.getElementById('wsRenameOverlay');
    if (overlay) overlay.classList.remove('show');
  }
  function confirmRenameProject() {
    const input = document.getElementById('wsRenameInput');
    const name = (input ? input.value : '').trim();
    if (!name) { setStatus('项目名不能为空'); return; }
    const p = wsProjects.find(function (x) { return x.id === currentProjectId; });
    if (p) {
      p.name = name.slice(0, 16);
      try { localStorage.setItem(WS_PROJECTS_KEY, JSON.stringify(wsProjects)); } catch (e) {}
      renderProjectSelect();
      setStatus('已重命名为：' + p.name);
    }
    closeRenameProject();
  }

  const wsProjectNewBtn = document.getElementById('wsProjectNewBtn');
  const wsProjectSelect = document.getElementById('wsProjectSelect');
  const wsProjectRenameBtn = document.getElementById('wsProjectRenameBtn');
  const wsProjectDel = document.getElementById('wsProjectDel');
  if (wsProjectNewBtn) wsProjectNewBtn.addEventListener('click', newProject);
  if (wsProjectSelect) wsProjectSelect.addEventListener('change', function () { switchProject(this.value); });
  if (wsProjectRenameBtn) wsProjectRenameBtn.addEventListener('click', openRenameProject);
  if (wsProjectDel) wsProjectDel.addEventListener('click', function () { if (currentProjectId) deleteProject(currentProjectId); });

  const wsRenameConfirm = document.getElementById('wsRenameConfirm');
  const wsRenameCancel = document.getElementById('wsRenameCancel');
  const wsRenameOverlay = document.getElementById('wsRenameOverlay');
  const wsRenameInput = document.getElementById('wsRenameInput');
  if (wsRenameConfirm) wsRenameConfirm.addEventListener('click', confirmRenameProject);
  if (wsRenameCancel) wsRenameCancel.addEventListener('click', closeRenameProject);
  if (wsRenameOverlay) wsRenameOverlay.addEventListener('click', function (e) { if (e.target === wsRenameOverlay) closeRenameProject(); });
  if (wsRenameInput) wsRenameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmRenameProject(); });

  loadProjects();
  renderProjectSelect();
  loadProjectState();
})();



