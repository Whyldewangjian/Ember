// ======================== Agent · 对话式文件操作（可整删） ========================
(function () {
  'use strict';

  const btn = document.getElementById('agentSwitchBtn');
  const mode = document.getElementById('agentMode');
  if (!btn || !mode) return;

  const mainArea = document.querySelector('.main-area');
  const bottomBar = document.querySelector('.bottom-bar');
  const pathMod = (function () { try { return require('path'); } catch (e) { return null; } })();

  let active = false;
  let running = false;
  let abortCtl = null;
  let roots = [];          // [{ path, name }]
  let entries = [];        // agent-list 结果
  let proposals = [];      // 待确认的改动（跨轮累积的待办队列）
  let turnTouched = [];    // 仅本轮触及的改动（用于「本轮完成」提示，按轮统计）
  let history = [];        // 会话历史（不含 system）
  let currentBubble = null;// 当前 Agent 气泡

  let ipc = null;
  try { ipc = require('electron').ipcRenderer; } catch (e) {}

  // ---------- 模型下拉 ----------
  const modelSelect = document.getElementById('agModelSelect');
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
      const myId = (typeof window.scopeApiId === 'function') ? window.scopeApiId('agent') : activeApiId;
      if (typeof activeApiId !== 'undefined' && a.id === myId) opt.selected = true;
      modelSelect.appendChild(opt);
    });
  }
  if (modelSelect) {
    modelSelect.addEventListener('change', function () {
      const id = this.value;
      if (!id) return;
      if (typeof setActiveModel === 'function') setActiveModel('agent', id);
    });
  }
  window.__syncAgentModelSelect = renderModelSelect;

  // ---------- 模式切换 ----------
  function enter() {
    if (active) return;
    if (window.__exitChatMode) window.__exitChatMode();
    if (window.__exitCanvasMode) window.__exitCanvasMode();
    if (window.__exitStoryboardMode) window.__exitStoryboardMode();
    if (window.__exitWorkshopMode) window.__exitWorkshopMode();
    active = true;
    if (mainArea) mainArea.style.display = 'none';
    if (bottomBar) bottomBar.style.display = 'none';
    const td = document.querySelector('.time-display');
    if (td) td.style.display = '';
    document.body.classList.add('mode-active');
    document.querySelectorAll('.mode-switch').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    mode.style.display = 'flex';
    renderModelSelect();
    loadPresets();
    renderPresetSelect();
    loadRoots();
    renderRoots();          // ★ 必须重绘：否则从 localStorage 读回的文件夹不会出现在列表里
    loadHistory();          // ★ 读回上次的对话
    renderHistory();        // ★ 并把气泡重画出来
    refreshList();
    if (typeof checkApiStatus === 'function') checkApiStatus('agent');
  }
  function exit() {
    if (!active) return;
    active = false;
    mode.style.display = 'none';
    btn.classList.remove('active');
    const td = document.querySelector('.time-display');
    if (td) td.style.display = '';
    document.body.classList.remove('mode-active');
    if (mainArea) mainArea.style.display = '';
    if (bottomBar) bottomBar.style.display = '';
  }
  btn.addEventListener('click', function () { if (!active) enter(); });
  window.__enterAgentMode = enter;
  window.__exitAgentMode = exit;

  // ---------- 窗口控制 ----------
  function bindWin(id, action) {
    const el = document.getElementById(id);
    if (el && ipc) el.addEventListener('click', function () { ipc.invoke(action).catch(function () {}); });
  }
  bindWin('agDockBtn', 'dock-enable');
  bindWin('agWinMinBtn', 'win-minimize');
  bindWin('agWinMaxBtn', 'win-maximize');
  const agClose = document.getElementById('agWinCloseBtn');
  if (agClose && agClose.parentNode) {
    const fresh = agClose.cloneNode(true);
    agClose.parentNode.replaceChild(fresh, agClose);
    fresh.addEventListener('click', async function () {
      if (running) {
        const ok = await (typeof showConfirm === 'function'
          ? showConfirm('Agent 正在运行，现在关闭会中断。', { danger: true })
          : Promise.resolve(window.confirm('Agent 正在运行，现在关闭会中断。\n\n确定关闭吗？')));
        if (!ok) return;
        if (abortCtl) { try { abortCtl.abort(); } catch (e) {} }
      }
      if (typeof requestCloseApp === 'function') requestCloseApp();
      else if (ipc) ipc.invoke('win-close').catch(function () {});
    });
  }
  const agSettings = document.getElementById('agSettingsBtn');
  if (agSettings) agSettings.addEventListener('click', function () {
    const sb = document.getElementById('settingsBtn');
    if (sb) sb.click();
  });

  // ---------- 元素 ----------
  const agAddFolderBtn = document.getElementById('agAddFolderBtn');
  const agClearChatBtn = document.getElementById('agClearChatBtn');
  const agRootsList = document.getElementById('agRootsList');
  const agTree = document.getElementById('agTree');
  const agTreeEmpty = document.getElementById('agTreeEmpty');
  const agChat = document.getElementById('agChat');
  const agChatEmpty = document.getElementById('agChatEmpty');
  const agInput = document.getElementById('agInput');
  const agSendBtn = document.getElementById('agSendBtn');
  const agStopBtn = document.getElementById('agStopBtn');
  const agStatus = document.getElementById('agStatus');
  const agDiffPanel = document.getElementById('agDiffPanel');
  const agDiffList = document.getElementById('agDiffList');
  const agDiffCount = document.getElementById('agDiffCount');
  const agApplyBtn = document.getElementById('agApplyBtn');
  const agClearDiffBtn = document.getElementById('agClearDiffBtn');
  const agPreviewOverlay = document.getElementById('agPreviewOverlay');
  const agPreviewName = document.getElementById('agPreviewName');
  const agPreviewBody = document.getElementById('agPreviewBody');
  const agPreviewClose = document.getElementById('agPreviewClose');
  const agPreviewReveal = document.getElementById('agPreviewReveal');
  const agPresetSelect = document.getElementById('agPresetSelect');
  const agPresetManageBtn = document.getElementById('agPresetManageBtn');
  const agPresetOverlay = document.getElementById('agPresetOverlay');
  const agPresetList = document.getElementById('agPresetList');
  const agPresetForm = document.getElementById('agPresetForm');
  const agPresetName = document.getElementById('agPresetName');
  const agPresetContent = document.getElementById('agPresetContent');
  const agPresetSave = document.getElementById('agPresetSave');
  const agPresetCancel = document.getElementById('agPresetCancel');
  const agPresetAddBtn = document.getElementById('agPresetAddBtn');
  const agPresetClose = document.getElementById('agPresetClose');

  // ---------- 工具 ----------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function cap(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n) + '\n…（截断）' : s;
  }
  function setStatus(msg) { if (agStatus) agStatus.textContent = msg || ''; }
  function relOf(abs) {
    if (!abs) return '';
    const np = pathMod ? pathMod.normalize(String(abs)) : String(abs);
    for (let i = 0; i < roots.length; i++) {
      const nr = pathMod ? pathMod.normalize(roots[i].path) : roots[i].path;
      if (np === nr) return roots[i].name || nr;
      if (np.indexOf(nr + pathMod.sep) === 0) return np.slice(nr.length + 1);
    }
    return np;
  }

  // ---------- 聊天渲染 ----------
  function scrollChat() { if (agChat) agChat.scrollTop = agChat.scrollHeight; }
  function chatHasContent() {
    return !!(agChat && agChat.querySelector('.ag-msg'));
  }
  function updateChatEmpty() {
    if (!agChatEmpty) return;
    agChatEmpty.style.display = chatHasContent() ? 'none' : '';
  }
  function addUserBubble(text) {
    const msg = document.createElement('div');
    msg.className = 'ag-msg ag-user';
    const b = document.createElement('div');
    b.className = 'ag-bubble';
    b.textContent = text;
    msg.appendChild(b);
    agChat.appendChild(msg);
    updateChatEmpty();
    scrollChat();
    return b;
  }
  function addAgentBubble() {
    const msg = document.createElement('div');
    msg.className = 'ag-msg ag-agent';
    const av = document.createElement('div');
    av.className = 'ag-avatar';
    av.innerHTML = '<i class="fas fa-robot"></i>';
    const b = document.createElement('div');
    b.className = 'ag-bubble';
    msg.appendChild(av);
    msg.appendChild(b);
    agChat.appendChild(msg);
    updateChatEmpty();
    scrollChat();
    setThinking(b, true);
    return b;
  }
  function setThinking(bubble, on) {
    let el = bubble.querySelector('.ag-thinking');
    if (on) {
      if (!el) { el = document.createElement('span'); el.className = 'ag-thinking'; el.textContent = '思考中…'; bubble.appendChild(el); }
    } else if (el) el.remove();
    scrollChat();
  }
  function addActivity(bubble, text) {
    setThinking(bubble, false);
    const div = document.createElement('div');
    div.className = 'ag-activity';
    div.textContent = text;
    bubble.appendChild(div);
    scrollChat();
  }
  function setBubbleText(bubble, text) {
    // ★ 追加「结论」块，而不是清空气泡——否则读取/拒绝/修改等操作流水会被抹掉
    setThinking(bubble, false);
    let el = bubble.querySelector('.ag-final');
    if (!el) { el = document.createElement('div'); el.className = 'ag-final'; bubble.appendChild(el); }
    el.textContent = text;
    scrollChat();
  }

  // ---------- 本轮结束提示（绿色醒目 + 由程序统计的真实改动，不依赖模型自述） ----------
  function addTurnSummary(hasErr, aborted) {
    if (!agChat) return;
    const wrap = document.createElement('div');
    wrap.className = 'ag-done' + (hasErr ? ' ag-done-warn' : '');
    let html = '';
    html += '<div class="ag-done-head"><i class="fas fa-' + (hasErr ? 'triangle-exclamation' : 'circle-check') + '"></i> ';
    html += hasErr ? (aborted ? '本轮任务已中断' : '本轮任务出错') : '本轮任务已完成';
    html += '</div>';
    if (turnTouched.length) {
      html += '<div class="ag-done-sub">实际生成 ' + turnTouched.length + ' 项修改（按本轮真实工具调用统计）：</div>';
      turnTouched.forEach(function (p) {
        const label = p.kind === 'create' ? '新建' : p.kind === 'delete' ? '删除' : p.kind === 'rename' ? '重命名' : '修改';
        const extra = p.kind === 'rename' ? (' → ' + (p.relTo || '')) : '';
        html += '<div class="ag-done-item">· [' + label + '] ' + escapeHtml(p.rel) + escapeHtml(extra) + '</div>';
      });
      html += '<div class="ag-done-sub">还需在下方「待确认的更改」面板点「应用选中」，才会真正写入磁盘。</div>';
    } else {
      html += '<div class="ag-done-sub">本次未产生任何文件修改。</div>';
    }
    wrap.innerHTML = html;
    agChat.appendChild(wrap);
    scrollChat();
  }
  function clearChat() {
    history = [];
    clearHistoryStorage();   // ★ 连 localStorage 一起清，否则下次打开又会冒出来
    proposals = [];
    if (agChat) agChat.innerHTML = '';
    if (agChatEmpty) agChatEmpty.style.display = '';
    renderProposals();
    setStatus('');
  }

  // ---------- Agent 预设（工作说明书，单选） ----------
  let presets = [];           // [{ id, name, content }]
  let activePresetId = '';    // 当前生效的预设 id（空 = 不使用）
  let editingPresetId = null; // 管理弹窗里正在编辑的预设 id（null = 新建）
  const PRESETS_KEY = 'llm_agent_presets';
  const ACTIVE_PRESET_KEY = 'llm_agent_active_preset';
  function loadPresets() {
    try {
      const s = localStorage.getItem(PRESETS_KEY);
      if (s) { const arr = JSON.parse(s); if (Array.isArray(arr)) presets = arr; }
      activePresetId = localStorage.getItem(ACTIVE_PRESET_KEY) || '';
    } catch (e) { presets = []; activePresetId = ''; }
  }
  function savePresets() {
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch (e) {}
    try { localStorage.setItem(ACTIVE_PRESET_KEY, activePresetId || ''); } catch (e) {}
  }
  function renderPresetSelect() {
    if (!agPresetSelect) return;
    agPresetSelect.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '（不使用）';
    agPresetSelect.appendChild(opt0);
    presets.forEach(function (p) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      agPresetSelect.appendChild(o);
    });
    agPresetSelect.value = presets.some(function (p) { return p.id === activePresetId; }) ? activePresetId : '';
    activePresetId = agPresetSelect.value;
  }
  if (agPresetSelect) {
    agPresetSelect.addEventListener('change', function () {
      activePresetId = this.value;
      savePresets();
    });
  }
  function activePresetContent() {
    const p = presets.find(function (x) { return x.id === activePresetId; });
    return (p && p.content) ? p.content : '';
  }
  // ---- 管理弹窗 ----
  function renderPresetList() {
    if (!agPresetList) return;
    if (!presets.length) { agPresetList.innerHTML = '<div class="ag-preset-empty">还没有预设，点下方「新建预设」创建一个。</div>'; return; }
    agPresetList.innerHTML = '';
    presets.forEach(function (p) {
      const item = document.createElement('div');
      item.className = 'ag-preset-item';
      const name = document.createElement('span');
      name.className = 'ag-preset-item-name';
      name.textContent = p.name + (p.id === activePresetId ? '（使用中）' : '');
      item.appendChild(name);
      const edit = document.createElement('button');
      edit.className = 'ag-preset-edit';
      edit.innerHTML = '<i class="fas fa-pen"></i> 编辑';
      edit.addEventListener('click', function () { openPresetForm(p); });
      item.appendChild(edit);
      const del = document.createElement('button');
      del.className = 'ag-preset-del';
      del.innerHTML = '<i class="fas fa-trash"></i> 删除';
      del.addEventListener('click', function () { deletePreset(p.id); });
      item.appendChild(del);
      agPresetList.appendChild(item);
    });
  }
  function openPresetForm(preset) {
    editingPresetId = preset ? preset.id : null;
    if (agPresetName) agPresetName.value = preset ? preset.name : '';
    if (agPresetContent) agPresetContent.value = preset ? preset.content : '';
    if (agPresetForm) agPresetForm.style.display = '';
    if (agPresetList) agPresetList.style.display = 'none';
    if (agPresetAddBtn) agPresetAddBtn.style.display = 'none';
  }
  function closePresetForm() {
    editingPresetId = null;
    if (agPresetForm) agPresetForm.style.display = 'none';
    if (agPresetList) agPresetList.style.display = '';
    if (agPresetAddBtn) agPresetAddBtn.style.display = '';
  }
  function savePresetForm() {
    const name = (agPresetName ? agPresetName.value : '').trim();
    const content = (agPresetContent ? agPresetContent.value : '').trim();
    if (!name) { setStatus('请填写预设名称'); return; }
    if (!content) { setStatus('请填写说明书内容'); return; }
    if (editingPresetId) {
      const p = presets.find(function (x) { return x.id === editingPresetId; });
      if (p) { p.name = name; p.content = content; }
    } else {
      presets.push({ id: 'ap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name: name, content: content });
    }
    savePresets();
    closePresetForm();
    renderPresetList();
    renderPresetSelect();
    setStatus('✅ 已保存预设：' + name);
  }
  async function deletePreset(id) {
    if (typeof showConfirm === 'function') {
      const ok = await showConfirm('确定删除这个预设吗？', { danger: true });
      if (!ok) return;
    }
    presets = presets.filter(function (x) { return x.id !== id; });
    if (activePresetId === id) activePresetId = '';
    savePresets();
    renderPresetList();
    renderPresetSelect();
  }
  function openPresetManage() {
    closePresetForm();
    renderPresetList();
    if (agPresetOverlay) agPresetOverlay.style.display = 'flex';
  }
  if (agPresetManageBtn) agPresetManageBtn.addEventListener('click', openPresetManage);
  if (agPresetAddBtn) agPresetAddBtn.addEventListener('click', function () { openPresetForm(null); });
  if (agPresetSave) agPresetSave.addEventListener('click', savePresetForm);
  if (agPresetCancel) agPresetCancel.addEventListener('click', closePresetForm);
  if (agPresetClose) agPresetClose.addEventListener('click', function () { if (agPresetOverlay) agPresetOverlay.style.display = 'none'; });
  if (agPresetOverlay) agPresetOverlay.addEventListener('click', function (e) { if (e.target === agPresetOverlay) agPresetOverlay.style.display = 'none'; });

  // ---------- 对话历史持久化 ----------
  // ★ 之前 history 只存在内存里，关掉程序就全丢。这里补上 localStorage 持久化。
  const AGENT_HISTORY_KEY = 'llm_agent_history';
  const AGENT_HISTORY_MAX = 200;   // 最多保留多少条消息（防止 localStorage 塞爆）

  function saveHistory() {
    try {
      const trimmed = history.length > AGENT_HISTORY_MAX
        ? history.slice(history.length - AGENT_HISTORY_MAX)
        : history;
      localStorage.setItem(AGENT_HISTORY_KEY, JSON.stringify(trimmed));
    } catch (e) {}
  }
  function loadHistory() {
    try {
      const s = localStorage.getItem(AGENT_HISTORY_KEY);
      if (!s) return;
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        history = arr.filter(function (m) {
          return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
        });
      }
    } catch (e) { history = []; }
  }
  function clearHistoryStorage() {
    try { localStorage.removeItem(AGENT_HISTORY_KEY); } catch (e) {}
  }

  // ★ 把持久化的历史重新画回界面
  //   之前 history 只在内存里，界面气泡也在内存里，两者都随程序关闭一起消失。
  //   现在启动时把 history 读回来，再逐条重建气泡。
  function renderHistory() {
    if (!agChat) return;
    agChat.innerHTML = '';
    if (!history.length) { updateChatEmpty(); return; }
    history.forEach(function (m) {
      if (!m || typeof m.content !== 'string') return;
      if (m.role === 'user') {
        addUserBubble(m.content);
      } else if (m.role === 'assistant') {
        const b = addAgentBubble();
        setBubbleText(b, m.content);
      }
    });
    updateChatEmpty();
    scrollChat();
  }

  // ---------- 文件夹管理 ----------
  function saveRoots() {
    try { localStorage.setItem('llm_agent_roots', JSON.stringify(roots)); } catch (e) {}
  }
  function loadRoots() {
    try {
      const s = localStorage.getItem('llm_agent_roots');
      if (s) { const arr = JSON.parse(s); if (Array.isArray(arr)) roots = arr; }
    } catch (e) { roots = []; }
  }
  function renderRoots() {
    if (!agRootsList) return;
    if (!roots.length) { agRootsList.innerHTML = '<div class="ag-roots-empty">未添加文件夹</div>'; return; }
    let html = '';
    roots.forEach(function (r) {
      html += '<div class="ag-root-item"><i class="fas fa-folder"></i><span class="ag-root-name" title="' + escapeHtml(r.path) + '">' + escapeHtml(r.name || r.path) + '</span>'
        + '<button class="ag-root-open" data-path="' + escapeHtml(r.path) + '" title="在资源管理器中打开"><i class="fas fa-folder-open"></i></button>'
        + '<button class="ag-root-del" data-path="' + escapeHtml(r.path) + '" title="移除"><i class="fas fa-times"></i></button></div>';
    });
    agRootsList.innerHTML = html;
    agRootsList.querySelectorAll('.ag-root-open').forEach(function (b) {
      b.addEventListener('click', function () {
        const p = b.getAttribute('data-path');
        setStatus('正在打开：' + p);
        ipc.invoke('agent-open-path', p).then(function (r) {
          setStatus(r && r.ok ? '' : ('打开失败：' + ((r && r.error) || '未知')));
        }).catch(function () { setStatus('打开失败'); });
      });
    });
    agRootsList.querySelectorAll('.ag-root-del').forEach(function (b) {
      b.addEventListener('click', function () {
        const p = b.getAttribute('data-path');
        roots = roots.filter(function (x) { return x.path !== p; });
        saveRoots();
        renderRoots();
        refreshList();
      });
    });
  }
  async function addFolder() {
    if (!ipc) { setStatus('无法访问文件系统'); return; }
    const r = await ipc.invoke('agent-pick-folders');
    if (!r || !r.ok) { if (!(r && r.canceled)) setStatus('选择失败'); return; }
    r.folders.forEach(function (f) {
      if (!roots.some(function (x) { return x.path === f.path; })) roots.push(f);
    });
    saveRoots();
    renderRoots();
    await refreshList();
  }
  async function refreshList() {
    if (!ipc) return;
    renderRoots();          // ★ 保证文件夹列表始终与 roots 同步
    if (!roots.length) { entries = []; renderTree(); return; }
    await ipc.invoke('agent-set-roots', roots.map(function (r) { return r.path; }));
    const r = await ipc.invoke('agent-list');
    entries = (r && r.entries) || [];
    renderTree();
  }
  // ★ 主进程通知：工作文件夹有变化 → 自动刷新文件树（去抖）
  let _fsTimer = null;
  if (ipc) {
    ipc.on('agent-fs-changed', function () {
      if (!active) return;
      if (_fsTimer) clearTimeout(_fsTimer);
      _fsTimer = setTimeout(function () { _fsTimer = null; refreshList(); }, 250);
    });
  }

  // ---------- 文件树 ----------
  function parentOf(abs) {
    return pathMod ? pathMod.dirname(abs) : String(abs).replace(/[\\/][^\\/]*$/, '');
  }
  function buildTree() {
    const nodes = {};
    const rootsList = [];
    entries.forEach(function (e) {
      nodes[e.abs] = { name: e.rel.split(/[\\/]/).pop(), abs: e.abs, type: e.type, size: e.size, children: [] };
    });
    entries.forEach(function (e) {
      if (e.type === 'root') { rootsList.push(nodes[e.abs]); return; }
      let p = parentOf(e.abs);
      while (p && !nodes[p]) p = parentOf(p);
      if (p && nodes[p]) nodes[p].children.push(nodes[e.abs]);
      else rootsList.push(nodes[e.abs]);
    });
    function sortKids(n) {
      n.children.sort(function (a, b) {
        const da = (a.type === 'dir' || a.type === 'root');
        const db = (b.type === 'dir' || b.type === 'root');
        if (da !== db) return da ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      n.children.forEach(sortKids);
    }
    rootsList.forEach(sortKids);
    return rootsList;
  }
  function renderTree() {
    if (!agTree || !agTreeEmpty) return;
    if (!roots.length) { agTree.innerHTML = ''; agTreeEmpty.style.display = ''; return; }
    agTreeEmpty.style.display = 'none';
    const tree = buildTree();
    agTree.innerHTML = renderTreeNodes(tree, 0);
    agTree.querySelectorAll('.ag-tree-toggle').forEach(function (t) {
      t.addEventListener('click', function () {
        const li = t.closest('.ag-tree-node');
        if (li) li.classList.toggle('collapsed');
      });
    });
    agTree.querySelectorAll('.ag-tree-name').forEach(function (n) {
      n.addEventListener('click', function () {
        if (n.getAttribute('data-type') === 'file') previewFile(n.getAttribute('data-abs'));
      });
    });
  }
  function renderTreeNodes(nodes, depth) {
    let html = '<ul class="ag-tree-ul">';
    nodes.forEach(function (n) {
      const isDir = n.type === 'dir' || n.type === 'root';
      html += '<li class="ag-tree-node">';
      html += '<div class="ag-tree-row" style="padding-left:' + (depth * 14 + 6) + 'px">';
      html += isDir ? '<span class="ag-tree-toggle">▾</span>' : '<span class="ag-tree-toggle ag-tree-spacer"></span>';
      html += '<span class="ag-tree-name" data-abs="' + escapeHtml(n.abs) + '" data-type="' + n.type + '">';
      html += (isDir ? '📁 ' : '📄 ') + escapeHtml(n.name);
      if (n.type === 'file') html += '<span class="ag-size">' + fmtSize(n.size) + '</span>';
      html += '</span></div>';
      if (isDir && n.children && n.children.length) html += renderTreeNodes(n.children, depth + 1);
      html += '</li>';
    });
    html += '</ul>';
    return html;
  }

  // ---------- 文件预览（文本 / HTML / CSV 表格） ----------
  let previewAbs = '';
  function extOf(abs) {
    const s = String(abs || '');
    const m = s.match(/\.([^.\\/]+)$/);
    return m ? m[1].toLowerCase() : '';
  }
  function makePreviewPre(text) {
    const pre = document.createElement('pre');
    pre.className = 'ag-preview-pre';
    pre.textContent = text;
    return pre;
  }
  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c !== '\r') field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  function makeCsvTable(text) {
    const rows = parseCsv(text);
    const table = document.createElement('table');
    table.className = 'ag-preview-table';
    rows.forEach(function (cells, ri) {
      const tr = document.createElement('tr');
      cells.forEach(function (cell) {
        const td = document.createElement(ri === 0 ? 'th' : 'td');
        td.textContent = cell;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    return table;
  }
  async function previewFile(abs) {
    if (!ipc || !agPreviewOverlay) return;
    previewAbs = abs;
    // ★ HTML 用「内联版」读取：把相对引用的本地 js/css 直接嵌进内容里。
    //   因为预览用的 iframe.srcdoc 是不透明源，<script src="./xxx.js"> 这类
    //   相对路径请求会被拦掉，导致画面显示但脚本不执行。
    //   其他类型仍走普通读取。
    const ext = extOf(abs);
    const isHtml = (ext === 'html' || ext === 'htm');
    const r = await ipc.invoke(isHtml ? 'agent-read-file-inline' : 'agent-read-file', abs);
    if (agPreviewName) agPreviewName.textContent = relOf(abs) || abs;
    const body = agPreviewBody;
    if (body) {
      body.innerHTML = '';
      if (!r || !r.ok) body.appendChild(makePreviewPre('读取失败：' + ((r && r.error) || '未知错误')));
      else if (r.binary) body.appendChild(makePreviewPre('[二进制文件，大小 ' + fmtSize(r.size) + ']'));
      else {
        if (isHtml) {
          const ifr = document.createElement('iframe');
          ifr.className = 'ag-preview-iframe';
          // 加 allow-same-origin 让内联脚本能正常读写自身 localStorage；
          // 内容已是自包含的，不需要再请求外部文件。
          ifr.setAttribute('sandbox', 'allow-scripts allow-modals allow-same-origin');
          ifr.srcdoc = r.content;
          body.appendChild(ifr);
          if (r.skipped && r.skipped.length) {
            body.appendChild(makePreviewPre('（以下本地引用未能内联：' + r.skipped.join('、') + '）'));
          }
        } else if (ext === 'csv') {
          body.appendChild(makeCsvTable(r.content));
        } else {
          body.appendChild(makePreviewPre(r.content + (r.truncated ? '\n…（截断）' : '')));
        }
      }
    }
    agPreviewOverlay.style.display = 'flex';
  }
  if (agPreviewClose) agPreviewClose.addEventListener('click', function () { agPreviewOverlay.style.display = 'none'; });
  if (agPreviewReveal) agPreviewReveal.addEventListener('click', function () {
    if (!previewAbs || !ipc) return;
    ipc.invoke('agent-open-path', previewAbs).catch(function () {});
  });
  if (agPreviewOverlay) agPreviewOverlay.addEventListener('click', function (e) { if (e.target === agPreviewOverlay) agPreviewOverlay.style.display = 'none'; });

  // ---------- 差异计算（简单 LCS） ----------
  function diffLines(a, b) {
    const A = String(a == null ? '' : a).split('\n');
    const B = String(b == null ? '' : b).split('\n');
    if (A.length > 800 || B.length > 800) return { simple: true, A: A, B: B };
    const n = A.length, m = B.length;
    const dp = new Array(n + 1);
    for (let i = 0; i <= n; i++) dp[i] = new Array(m + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (A[i] === B[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
        else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const ops = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { ops.push({ t: 'same', x: A[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: 'del', x: A[i] }); i++; }
      else { ops.push({ t: 'add', x: B[j] }); j++; }
    }
    while (i < n) { ops.push({ t: 'del', x: A[i] }); i++; }
    while (j < m) { ops.push({ t: 'add', x: B[j] }); j++; }
    return { simple: false, ops: ops };
  }
  function lineCount(s) { return String(s == null ? '' : s).split('\n').length; }
  function renderDiffHtml(oldTxt, newTxt) {
    const d = diffLines(oldTxt, newTxt);
    if (d.simple) return '<div class="ag-diff-note">文件较大（' + lineCount(oldTxt) + ' → ' + lineCount(newTxt) + ' 行），省略逐行差异</div>';
    let html = '<div class="ag-diff-code">';
    d.ops.forEach(function (op) {
      const cls = op.t === 'add' ? 'ag-add' : op.t === 'del' ? 'ag-del' : 'ag-same';
      const mark = op.t === 'add' ? '+' : op.t === 'del' ? '-' : ' ';
      html += '<div class="ag-line ' + cls + '">' + mark + ' ' + escapeHtml(op.x || ' ') + '</div>';
    });
    html += '</div>';
    return html;
  }

  // ---------- 提案渲染 ----------
  function renderProposals() {
    if (!agDiffList || !agDiffPanel) return;
    if (!proposals.length) { agDiffPanel.style.display = 'none'; agDiffList.innerHTML = ''; return; }
    agDiffPanel.style.display = '';
    if (agDiffCount) agDiffCount.textContent = '(' + proposals.length + ')';
    let html = '';
    proposals.forEach(function (p, idx) {
      html += '<div class="ag-diff-item" data-idx="' + idx + '">';
      html += '<div class="ag-diff-head">';
      html += '<label class="ag-diff-check"><input type="checkbox" class="ag-diff-cb" data-idx="' + idx + '" checked> ' + escapeHtml(p.rel) + '</label>';
      if (p.kind === 'delete') html += '<span class="ag-badge ag-badge-danger">删除</span>';
      else if (p.kind === 'rename') html += '<span class="ag-badge ag-badge-danger">重命名</span>';
      else if (p.kind === 'create') html += '<span class="ag-badge">新建</span>';
      else html += '<span class="ag-badge">修改</span>';
      html += '<button class="ag-diff-remove" data-idx="' + idx + '" title="移除此项">✕</button>';
      html += '</div><div class="ag-diff-body">';
      if (p.kind === 'rename') {
        html += '<div class="ag-rename-line">' + escapeHtml(p.rel) + '  →  ' + escapeHtml(p.relTo) + '</div>';
      } else if (p.kind === 'delete') {
        html += '<div class="ag-del-line">将删除文件（' + lineCount(p.old) + ' 行）</div>';
      } else {
        html += renderDiffHtml(p.old || '', p.content || '');
      }
      html += '</div></div>';
    });
    agDiffList.innerHTML = html;
    agDiffList.querySelectorAll('.ag-diff-remove').forEach(function (b) {
      b.addEventListener('click', function () {
        const idx = parseInt(b.getAttribute('data-idx'), 10);
        proposals.splice(idx, 1);
        renderProposals();
      });
    });
  }

  // ---------- 应用提案 ----------
  async function applyProposals() {
    if (!ipc) return;
    const checked = [];
    agDiffList.querySelectorAll('.ag-diff-cb').forEach(function (cb) { if (cb.checked) checked.push(parseInt(cb.getAttribute('data-idx'), 10)); });
    if (!checked.length) { setStatus('没有选中任何更改'); return; }
    const dangerous = checked.filter(function (i) { const p = proposals[i]; return p.kind === 'delete' || p.kind === 'rename'; });
    if (dangerous.length) {
      const names = dangerous.map(function (i) { const p = proposals[i]; return p.kind === 'rename' ? (p.rel + ' → ' + p.relTo) : p.rel; }).join('\n');
      const ok = await (typeof showConfirm === 'function'
        ? showConfirm('以下为删除/重命名等危险操作：\n\n' + names, { danger: true, okLabel: '确认执行' })
        : Promise.resolve(window.confirm('以下为删除/重命名等危险操作：\n\n' + names + '\n\n确定执行吗？')));
      if (!ok) return;
    }
    let okCount = 0, failCount = 0;
    for (const i of checked) {
      const p = proposals[i];
      let r = null;
      if (p.kind === 'write') r = await ipc.invoke('agent-write-file', p.abs, p.content);
      else if (p.kind === 'create') r = await ipc.invoke('agent-create-file', p.abs, p.content);
      else if (p.kind === 'delete') r = await ipc.invoke('agent-delete', p.abs);
      else if (p.kind === 'rename') r = await ipc.invoke('agent-rename', p.abs, p.to);
      if (r && r.ok) okCount++;
      else { failCount++; if (currentBubble) addActivity(currentBubble, '✗ ' + p.kind + ' ' + p.rel + '：' + ((r && r.error) || '失败')); }
    }
    proposals = proposals.filter(function (p, idx) { return checked.indexOf(idx) < 0; });
    renderProposals();
    setStatus('已应用 ' + okCount + ' 项' + (failCount ? '，失败 ' + failCount + ' 项' : ''));
    await refreshList();
  }

  // ---------- LLM 调用 ----------
  async function callAgent(messages) {
    const A = (typeof window.apiFor === 'function') ? window.apiFor('agent') : (typeof currentApi !== 'undefined' ? currentApi : null);
    if (!A || !A.key) throw new Error('请先在设置中配置 API Key');
    const base = (A.url || '').replace(/\/+$/, '');
    abortCtl = new AbortController();
    // ★ 不设置 max_tokens：现在已禁止整文件重写，输出都很短；
    //   若强行限制，推理模型会把配额全用在推理上，导致最终回答为空。
    const res = await fetch(base + '/chat/completions', {
      method: 'POST',
      signal: abortCtl.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + A.key },
      body: JSON.stringify({ model: A.model, messages: messages, temperature: 0.3, stream: false })
    });
    if (!res.ok) { const t = await res.text(); throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 300)); }
    const data = await res.json();
    const choice = data.choices && data.choices[0];
    const msg = choice && choice.message;
    if (!msg) throw new Error('接口返回异常：没有 choices/message。原始响应：' + JSON.stringify(data).slice(0, 300));
    let content = '';
    if (typeof msg.content === 'string') content = msg.content;
    else if (Array.isArray(msg.content)) {   // 部分接口把内容返回成分片数组
      content = msg.content.map(function (p) { return (p && (p.text || p.content)) || ''; }).join('');
    }
    if (!content || !content.trim()) {
      const fr = (choice && choice.finish_reason) || '未知';
      const rc = (typeof msg.reasoning_content === 'string') ? msg.reasoning_content.length : 0;
      let hint = '';
      if (fr === 'length') hint = '输出达到长度上限被截断。';
      else if (rc > 0) hint = '模型只产出了推理内容（' + rc + ' 字）而没有最终回答，通常是推理模型 + 输出上限过小。';
      throw new Error('模型返回了空内容（finish_reason=' + fr + '）。' + hint + ' 可尝试：换一个模型 / 重试 / 让它分小步修改。');
    }
    return content;
  }

  // ---------- 解析工具调用 ----------
  // 从文本里提取「括号配对」的 JSON 对象（能正确处理 content 里带花括号的代码）
  function extractActionObjects(text) {
    text = String(text || '');
    const out = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '{') continue;
      let depth = 0, inStr = false, esc = false, end = -1;
      for (let j = i; j < text.length; j++) {
        const ch = text[j];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
        } else if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } }
      }
      if (end > i) {
        const seg = text.slice(i, end + 1);
        if (seg.indexOf('"action"') >= 0) out.push(seg);
        i = end;
      }
    }
    return out;
  }
  function parseReply(text) {
    text = String(text || '');
    const calls = [];
    const blocks = [];
    // 1) 优先取 ```json / ``` 代码块（兼容任意语言标记）
    const re = /```[a-zA-Z]*\s*([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(text))) blocks.push(m[1].trim());
    // 2) 没有代码块时，再从正文里捞散落的 {"action":...}
    if (!blocks.length) extractActionObjects(text).forEach(function (s) { blocks.push(s); });
    const seen = {};
    blocks.forEach(function (block) {
      const push = function (x) {
        if (!x || !x.action) return;
        const k = JSON.stringify(x);
        if (seen[k]) return;
        seen[k] = 1;
        calls.push(x);
      };
      try {
        const j = JSON.parse(block);
        if (Array.isArray(j)) j.forEach(push);
        else push(j);
      } catch (e) {
        extractActionObjects(block).forEach(function (s) { try { push(JSON.parse(s)); } catch (e2) {} });
      }
    });
    return { calls: calls };
  }

  // ---------- 系统提示 ----------
  function buildSystemPrompt(files) {
    const rootsTxt = roots.map(function (r) { return '- ' + r.path; }).join('\n');
    const fileTxt = files.slice(0, 400).map(function (f) { return f.abs; }).join('\n');
    const presetTxt = activePresetContent();
    return [
      '你是一个可以读写文件的 Agent，只能在用户指定的「工作文件夹」内操作文件。',
      '',
      '【如何调用工具】要读取或修改文件，你必须输出一个 ```json 代码块，里面是工具调用对象。',
      '一次可以输出多个代码块，也可以输出一个包含多个对象的 JSON 数组。示例：',
      '```json',
      '{"action":"read","path":"<绝对路径>"}',
      '```',
      '',
      '【可用工具】',
      '- 读文件：{"action":"read","path":"<绝对路径>"}',
      '- 搜索：{"action":"grep","pattern":"<正则>","path":"<可选目录绝对路径>"}',
      '- 列目录：{"action":"list","path":"<可选目录绝对路径>"}',
      '- ★修改已有文件的唯一方式：{"action":"edit","path":"<绝对路径>","find":"<要被替换的原文片段>","replace":"<新片段>"}',
      '    · find 必须与文件中的原文逐字符一致（含空格与换行），请先用 read 复制出来',
      '    · 需要一次替换所有匹配时加 "all":true；只改一小段就只给一小段',
      '    · 要加很多内容时，拆成多次 edit（每次插入/替换一小块），不要一次性输出全文',
      '- 新建文件（文件不存在时）：{"action":"create","path":"<绝对路径>","content":"<完整内容>"}',
      '- 删除：{"action":"delete","path":"<绝对路径>"}',
      '- 重命名/移动：{"action":"rename","from":"<原绝对路径>","to":"<新绝对路径>"}',
      '',
      '【必须遵守】',
      '1. 路径一律用绝对路径，且必须位于下面的工作文件夹内，禁止越界。',
      '2. 要改文件必须先用 read 看现状，再动手。',
      '3. ★★ 修改已有文件【只能用 edit 局部替换】，绝对不要输出整个文件内容——输出过长会被截断，导致整次修改失败。',
      '   哪怕要加很多内容，也请拆成多次 edit（每次一小段）。只有新建文件才用 create。',
      '4. write/create 的 content 必须是修改后的【完整文件内容】，不能是补丁、片段或省略号。',
      '5. 用户要求「修改 / 新增 / 删除文件」时，你必须输出对应的 edit/write/create/delete 工具调用，不要只给建议或解释。',
      '6. 信息不足时先用 list/grep/read 探查。',
      '7. 所有改动都会先展示给用户确认后才真正写入，所以请放心提出。',
      '8. 【汇报规范 · 必须严格遵守】收尾时用简短中文总结，并且：',
      '   · 只写你这一轮【真正发出过的工具调用】，没做过的绝对不许写；',
      '   · 逐条列出：文件名 + 你 find 掉的片段 + 你 replace 成的新片段（与你发出的每一条 edit 一一对应）；',
      '   · 禁止编造具体数字、命名、规格（例如"64×64""苍焰凤凰""银河光带"），除非它确实出现在你发出的 replace 里；',
      '   · 禁止用"已重绘 / 已新增 / 已增强 / 已完成某特效"等说法，去描述没有对应工具调用的内容；',
      '   · 如果这一轮没有发出任何 edit/create/delete，必须原样写：本轮未做任何文件修改；',
      '   · 你的总结会与程序统计出的真实改动清单并列显示，请勿夸大。',
      '   · 总结里不要再输出任何 JSON 代码块。',
      '',
      '工作文件夹（绝对路径）：',
      rootsTxt,
      '',
      '当前文件清单（绝对路径，共 ' + files.length + ' 个' + (files.length > 400 ? '，仅列前 400 个' : '') + '）：',
      fileTxt || '(空)',
      presetTxt ? ('【用户附加的工作说明书】\n' + presetTxt) : ''
    ].join('\n');
  }

  // ---------- 读取文件旧内容（用于差异） ----------
  async function readOldContent(abs) {
    if (!ipc) return '';
    const r = await ipc.invoke('agent-read-file', abs);
    if (r && r.ok && !r.binary) return r.content;
    return '';
  }

  // ---------- 提案去重（同一目标的重复/迭代只保留最新一条） ----------
  function addProposal(p) {
    for (let i = 0; i < proposals.length; i++) {
      const q = proposals[i];
      if (q.kind === p.kind && q.abs === p.abs && (q.to || '') === (p.to || '')) {
        const ti = turnTouched.indexOf(q);
        if (q.content === p.content) {                 // 完全相同 → 忽略，但仍算本轮触及
          if (ti < 0) turnTouched.push(q);
          return false;
        }
        proposals[i] = p;                              // 同一目标的新版本 → 替换
        if (ti >= 0) turnTouched[ti] = p; else turnTouched.push(p);
        return true;
      }
    }
    proposals.push(p);
    turnTouched.push(p);
    return true;
  }

  // ---------- 执行工具 ----------
  async function handleToolCall(c, msgs) {
    const a = String(c.action || '').toLowerCase();
    const pushAssistant = function () {
      msgs.push({ role: 'assistant', content: '```json\n' + JSON.stringify(c) + '\n```' });
    };
    if (a === 'read') {
      if (currentBubble) addActivity(currentBubble, '📄 读取 ' + relOf(c.path));
      const r = await ipc.invoke('agent-read-file', c.path);
      let txt;
      if (!r || !r.ok) txt = '[读取失败：' + ((r && r.error) || '未知') + ']';
      else if (r.binary) txt = '[二进制文件，无法读取文本，大小 ' + r.size + ' 字节]';
      else txt = r.content + (r.truncated ? '\n…（截断）' : '');
      pushAssistant();
      msgs.push({ role: 'user', content: '工具结果(read ' + c.path + ')：\n' + cap(txt, 120000) });
      return;
    }
    if (a === 'grep') {
      if (currentBubble) addActivity(currentBubble, '🔍 搜索 ' + (c.pattern || ''));
      const r = await ipc.invoke('agent-grep', { pattern: c.pattern, path: c.path });
      let txt;
      if (!r || !r.ok) txt = '[错误：' + ((r && r.error) || '未知') + ']';
      else {
        const m = r.matches || [];
        txt = m.length ? m.map(function (x) { return x.rel + ':' + x.line + ': ' + x.text; }).join('\n') : '[无匹配]';
      }
      pushAssistant();
      msgs.push({ role: 'user', content: '工具结果(grep)：\n' + cap(txt, 20000) });
      return;
    }
    if (a === 'list') {
      if (currentBubble) addActivity(currentBubble, '🗂 列目录 ' + (c.path || '全部'));
      const r = await ipc.invoke('agent-list');
      let list = (r && r.entries) || [];
      if (c.path) {
        const base = pathMod ? pathMod.normalize(String(c.path)) : String(c.path);
        list = list.filter(function (e) { return e.abs !== c.path && e.abs.indexOf(base) === 0; });
      }
      const txt = list.slice(0, 300).map(function (e) { return (e.type === 'dir' || e.type === 'root' ? '[dir] ' : '      ') + e.rel; }).join('\n');
      pushAssistant();
      msgs.push({ role: 'user', content: '工具结果(list)：\n' + (txt || '[空]') });
      return;
    }
    if (a === 'edit') {
      const rr = await ipc.invoke('agent-read-file', c.path);
      if (!rr || !rr.ok) {
        pushAssistant();
        msgs.push({ role: 'user', content: '工具结果(edit)：读取失败 ' + ((rr && rr.error) || '') + '。' });
        return;
      }
      const cur = String(rr.content || '');
      const find = String(c.find == null ? '' : c.find);
      const repl = String(c.replace == null ? '' : c.replace);
      if (!find) {
        pushAssistant();
        msgs.push({ role: 'user', content: '工具结果(edit)：缺少 find 字段。请提供要替换的原文片段。' });
        return;
      }
      const hits = cur.split(find).length - 1;
      if (hits === 0) {
        if (currentBubble) addActivity(currentBubble, '⚠ 局部替换未匹配 ' + relOf(c.path));
        pushAssistant();
        msgs.push({ role: 'user', content: '工具结果(edit)：在文件中找不到 find 指定的内容。请先 read 该文件，逐字符复制要替换的原文（含缩进与换行）后再试。' });
        return;
      }
      const next = (c.all === true) ? cur.split(find).join(repl) : cur.replace(find, repl);
      addProposal({ kind: 'write', abs: c.path, rel: relOf(c.path), content: next, old: cur });
      if (currentBubble) addActivity(currentBubble, '✎ 局部修改 ' + relOf(c.path) + (hits > 1 ? '（匹配 ' + hits + ' 处' + (c.all === true ? '，全部替换' : '，仅替换首处') + '）' : ''));
      pushAssistant();
      msgs.push({ role: 'user', content: '已记录为待确认的修改（尚未写入磁盘）。请继续。' });
      return;
    }
    if (a === 'write') {
      // ★ 已存在的文件禁止整文件覆盖：40KB 的游戏整文件重写必被输出上限截断 → JSON 不完整 → 修改失败。
      //   这里直接拒绝并引导模型改用 edit 局部替换。
      let exists = false, curLen = 0;
      try {
        const ex = await ipc.invoke('agent-read-file', c.path);
        if (ex && ex.ok) { exists = true; curLen = String(ex.content || '').length; }
      } catch (e) {}
      if (exists) {
        if (currentBubble) addActivity(currentBubble, '⚠ 已拒绝整文件覆盖 ' + relOf(c.path) + '（请改用局部替换）');
        pushAssistant();
        msgs.push({ role: 'user', content: '工具结果(write)：已拒绝。该文件已存在（约 ' + curLen + ' 字符），整文件覆盖会因输出过长被截断而失败。请改用 edit 做局部替换：{"action":"edit","path":"<绝对路径>","find":"<文件中的原文片段>","replace":"<新片段>"}（先用 read 复制原文）。改动很大时，拆成多次 edit，每次替换一小段。' });
        return;
      }
      addProposal({ kind: 'write', abs: c.path, rel: relOf(c.path), content: String(c.content == null ? '' : c.content), old: '' });
      if (currentBubble) addActivity(currentBubble, '＋ 新建 ' + relOf(c.path));
      pushAssistant();
      msgs.push({ role: 'user', content: '已记录为待确认的新建文件（尚未写入磁盘）。请继续。' });
      return;
    }
    if (a === 'create') {
      let exists = false;
      try { const ex = await ipc.invoke('agent-read-file', c.path); exists = !!(ex && ex.ok); } catch (e) {}
      if (exists) {
        if (currentBubble) addActivity(currentBubble, '⚠ 文件已存在，请改用局部替换：' + relOf(c.path));
        pushAssistant();
        msgs.push({ role: 'user', content: '工具结果(create)：该文件已存在，不能新建。请改用 edit 做局部替换。' });
        return;
      }
      addProposal({ kind: 'create', abs: c.path, rel: relOf(c.path), content: String(c.content == null ? '' : c.content), old: '' });
      if (currentBubble) addActivity(currentBubble, '＋ 提出新建 ' + relOf(c.path));
      pushAssistant();
      msgs.push({ role: 'user', content: '已记录为待确认的新建文件（尚未写入磁盘）。请继续。' });
      return;
    }
    if (a === 'delete') {
      const old = await readOldContent(c.path);
      addProposal({ kind: 'delete', abs: c.path, rel: relOf(c.path), content: '', old: old });
      if (currentBubble) addActivity(currentBubble, '⚠ 提出删除 ' + relOf(c.path));
      pushAssistant();
      msgs.push({ role: 'user', content: '已记录为待确认的删除操作（尚未执行）。请继续。' });
      return;
    }
    if (a === 'rename') {
      addProposal({ kind: 'rename', abs: c.from, to: c.to, rel: relOf(c.from), relTo: relOf(c.to), content: '', old: '' });
      if (currentBubble) addActivity(currentBubble, '⚠ 提出重命名 ' + relOf(c.from) + ' → ' + relOf(c.to));
      pushAssistant();
      msgs.push({ role: 'user', content: '已记录为待确认的重命名（尚未执行）。请继续。' });
      return;
    }
    pushAssistant();
    msgs.push({ role: 'user', content: '未知工具动作：' + (c.action || '') });
  }

  // ---------- 主循环（对话式） ----------
  async function sendMessage(text) {
    text = (text || '').trim();
    if (!text) return;
    if (!ipc) { setStatus('无法访问文件系统'); return; }
    if (running) return;
    if (!roots.length) {
      setStatus('请先添加工作文件夹');
      const ok = await (typeof showConfirm === 'function'
        ? showConfirm('还没有添加工作文件夹。\n\nAgent 需要在一个或多个文件夹内操作文件，请先在左侧点「添加」。', { okLabel: '知道了' })
        : Promise.resolve(true));
      return;
    }

    running = true;
    turnTouched = [];
    agSendBtn.disabled = true;
    agStopBtn.style.display = '';
    setStatus('');
    addUserBubble(text);

    const files = entries.filter(function (e) { return e.type === 'file'; });
    // ★ 顺序必须是：system → 历史 → 本轮新消息（旧代码把新消息插在历史前面，导致模型答非所问）
    const msgs = [{ role: 'system', content: buildSystemPrompt(files) }]
      .concat(history)
      .concat([{ role: 'user', content: text }]);

    currentBubble = addAgentBubble();
    let finalText = '';
    let errText = '';
    let lastSig = '';

    try {
      for (let step = 0; step < 30; step++) {
        if (abortCtl && abortCtl.signal.aborted) break;
        setThinking(currentBubble, true);
        const reply = await callAgent(msgs);
        setThinking(currentBubble, false);
        if (!reply || !reply.trim()) { if (currentBubble) addActivity(currentBubble, '（空响应）'); break; }
        const parsed = parseReply(reply);
        if (!parsed.calls.length) {
          // ★ 像是想调用工具却没解析出来（通常是被截断）——必须明确告诉用户「文件没改」
          if (/"action"\s*:/.test(reply) || reply.indexOf('```json') >= 0) {
            if (currentBubble) addActivity(currentBubble, '⚠ 模型返回的工具调用无法解析（多半是输出被截断）。文件【未】被修改。建议：换用输出更长的模型，或让它改用 edit 做局部修改。');
          }
          finalText = reply;
          break;
        }
        // ★ 模型重复同一步操作 → 自动停止，避免空转 30 步
        const sig = JSON.stringify(parsed.calls);
        if (sig === lastSig) {
          if (currentBubble) addActivity(currentBubble, '（模型重复了相同操作，已自动停止）');
          break;
        }
        lastSig = sig;
        let stopped = false;
        for (const c of parsed.calls) {
          if (abortCtl && abortCtl.signal.aborted) { stopped = true; break; }
          await handleToolCall(c, msgs);
        }
        if (stopped) break;
      }
    } catch (e) {
      if (e && (e.name === 'AbortError' || /abort/i.test(e.message || ''))) {
        errText = '⏸ 已停止';
      } else {
        errText = '✗ 出错：' + (e.message || e);
      }
      if (currentBubble) addActivity(currentBubble, errText);
    }

    if (finalText) setBubbleText(currentBubble, finalText.trim());
    else if (errText) { /* 错误已由 addActivity 显示，这里不再覆盖 */ }
    else if (!(abortCtl && abortCtl.signal.aborted)) setBubbleText(currentBubble, '（未获得有效回复）');
    else setBubbleText(currentBubble, '（已停止）');

    // ★ 只把「用户发言 + Agent 总结」写入长期历史；
    //   工具调用与文件内容属于本轮临时上下文，不进入历史，避免撑爆上下文导致后续答非所问
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: (finalText || '（本轮未给出文字总结）').trim() });
    saveHistory();   // ★ 写入 localStorage，下次打开还在
    running = false;
    agSendBtn.disabled = false;
    agStopBtn.style.display = 'none';
    setStatus('');
    if (proposals.length) renderProposals();
    addTurnSummary(!!errText, !!(abortCtl && abortCtl.signal.aborted));
  }

  // ---------- 事件绑定 ----------
  if (agAddFolderBtn) agAddFolderBtn.addEventListener('click', addFolder);
  if (agClearChatBtn) agClearChatBtn.addEventListener('click', clearChat);
  if (agSendBtn) agSendBtn.addEventListener('click', function () { sendMessage(agInput.value); agInput.value = ''; });
  if (agStopBtn) agStopBtn.addEventListener('click', function () { if (abortCtl) { try { abortCtl.abort(); } catch (e) {} } });
  if (agApplyBtn) agApplyBtn.addEventListener('click', applyProposals);
  if (agClearDiffBtn) agClearDiffBtn.addEventListener('click', function () { proposals = []; renderProposals(); });
  if (agInput) {
    agInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(agInput.value); agInput.value = ''; }
    });
  }

  // 初始渲染
  renderRoots();
  renderTree();
  updateChatEmpty();
})();
