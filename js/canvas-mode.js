// ======================== 画布节点模式（测试版 v2.18） ========================
(function () {
  'use strict';

  // ---------- Electron IPC ----------
  let ipc = null;
  try { ipc = require('electron').ipcRenderer; } catch (e) {}

  // ---------- 模式切换 ----------
  const modeSwitch = document.getElementById('modeSwitch');
  const canvasMode = document.getElementById('canvasMode');
  const mainArea = document.querySelector('.main-area');
  const bottomBar = document.querySelector('.bottom-bar');
  let canvasActive = false;

  if (!modeSwitch || !canvasMode) return;

  function enterCanvas() {
    if (canvasActive) return;                      // ★ 已在画布模式：无反应
    if (window.__exitChatMode) window.__exitChatMode(); // 先退出对话模式
    if (window.__exitStoryboardMode) window.__exitStoryboardMode(); // 退出分镜模式
    if (window.__exitWorkshopMode) window.__exitWorkshopMode();     // 退出工坊模式
    if (window.__exitAgentMode) window.__exitAgentMode();           // 退出 Agent 模式
    canvasActive = true;
    if (mainArea) mainArea.style.display = 'none';
    if (bottomBar) bottomBar.style.display = 'none';
    canvasMode.style.display = 'flex';
    modeSwitch.classList.add('active');
    modeSwitch.innerHTML = '<i class="fas fa-th"></i> 画布';
    const homeBtn = document.getElementById('homeSwitchBtn');
    if (homeBtn) homeBtn.classList.remove('active');
    document.body.classList.add('mode-active'); setTimeout(refreshModelSelects, 50);
  }
  function exitCanvas() {
    if (!canvasActive) return;                     // ★ 不在画布模式：无反应
    canvasActive = false; document.body.classList.remove('mode-active');
    saveCanvasState();                             // ★ 切出画布时保存布局
    if (mainArea) mainArea.style.display = '';
    if (bottomBar) bottomBar.style.display = '';
    canvasMode.style.display = 'none';
    modeSwitch.classList.remove('active');
    modeSwitch.innerHTML = '<i class="fas fa-project-diagram"></i> 画布';
  }
  modeSwitch.addEventListener('click', enterCanvas);
  // ★ 暴露给主页 / 对话按钮调用
  window.__enterCanvasMode = enterCanvas;
  window.__exitCanvasMode = exitCanvas;


  // ---------- 画布元素 ----------
  const container = document.getElementById('canvasContainer');
  const world = document.getElementById('canvasWorld');
  const svg = document.getElementById('canvasSvg');
  const nodesLayer = document.getElementById('canvasNodes');
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- 状态 ----------
  let nodes = [];
  let links = [];
  let idCounter = 1;
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let lastMouse = null;
  let boards = [];
  let activeBoardId = null;
  let clipboardNodes = [];
  let clipboardLinks = [];
  let undoStack = [];
  let redoStack = [];
  let hoverLinkId = null;
  let delBtn = null;
  let delBtnHover = false;
  let hideDelTimer = null;
  let imageFileInput = null;
  let pickerTargetNode = null;
  let pickerTargetEl = null;
  let previewOverlay = null;
  let imgCtxMenu = null;
  let imgCtxSrc = null;
  let imgCtxName = null;

  // ★ 多选 / 分组 / 框选 状态
  let multiSelected = new Set();
  let groups = [];
  let groupSeq = 1;
  let groupPickerEl = null;
  let marqueeState = null;
  let lastLoadedState = null;
  const GROUP_COLORS = [
    { name: '雾蓝',   bg: 'rgba(96,128,188,0.14)',  border: 'rgba(96,128,188,0.38)',  dot: '#607ebc' },
    { name: '薄荷',   bg: 'rgba(0,184,132,0.12)',   border: 'rgba(0,184,132,0.35)',   dot: '#00b884' },
    { name: '暖橙',   bg: 'rgba(228,148,52,0.12)',  border: 'rgba(228,148,52,0.35)',  dot: '#e49434' },
    { name: '紫罗兰', bg: 'rgba(158,104,224,0.13)', border: 'rgba(158,104,224,0.36)', dot: '#9e68e0' },
    { name: '天蓝',   bg: 'rgba(64,150,240,0.12)',  border: 'rgba(64,150,240,0.34)',  dot: '#4096f0' },
    { name: '粉樱',   bg: 'rgba(224,98,158,0.12)',  border: 'rgba(224,98,158,0.34)',  dot: '#e0629e' }
  ];

  const HEADER_H = 32;
  const MIN_W = 180;
  const MIN_H = 90;
  const CANVAS_KEY = 'llm_canvas_state';   // ★ 布局保存（旧，迁移用）
  const BOARDS_KEY = 'llm_canvas_boards';  // ★ 画布索引
  const BOARD_KEY_PREFIX = 'llm_canvas_board_';   // ★ 每个画布状态键前缀
  function genId() { return 'cn_' + (idCounter++); }

  // 是否支持质量档（模型名含 gpt / gtp）
  function supportsQuality(model) {
    return /gpt|gtp/i.test(model || '');
  }

  // ---------- ★ 画布布局保存 / 恢复 ----------
  function saveBoardIndex() {
    try {
      localStorage.setItem(BOARDS_KEY, JSON.stringify({ activeId: activeBoardId, boards: boards }));
    } catch (e) {}
  }

  function saveCanvasState() {
    try {
      const state = {
        nodes: nodes,
        links: links,
        idCounter: idCounter,
        scale: scale,
        panX: panX,
        panY: panY,
        groups: collectGroupsState()   // ★ 分组一起保存
      };
      if (activeBoardId) {
        localStorage.setItem(BOARD_KEY_PREFIX + activeBoardId, JSON.stringify(state));
        saveBoardIndex();
      }
    } catch (e) {
      // localStorage 超限（图片过大）时忽略
    }
  }

  function applyBoardState(state) {
    if (!state || !Array.isArray(state.nodes)) return false;
    nodes = state.nodes || [];
    links = state.links || [];
    idCounter = state.idCounter || 1;
    scale = state.scale || 1;
    panX = state.panX || 0;
    panY = state.panY || 0;
    lastLoadedState = state;
    return true;
  }

  function loadCanvasState() {
    try {
      const legacy = localStorage.getItem(CANVAS_KEY);
      let index = null;
      try {
        index = JSON.parse(localStorage.getItem(BOARDS_KEY));
      } catch (e) {}

      if (legacy) {
        const state = JSON.parse(legacy);
        if (state && Array.isArray(state.nodes) && state.nodes.length > 0 && (!index || !index.boards || !index.boards.length)) {
          const id = 'board_' + Date.now();
          boards = [{ id: id, name: '画布 1' }];
          activeBoardId = id;
          localStorage.setItem(BOARD_KEY_PREFIX + id, legacy);
          localStorage.removeItem(CANVAS_KEY);
          saveBoardIndex();
          return applyBoardState(state);
        }
      }

      if (index && index.boards && index.boards.length) {
        boards = index.boards;
        activeBoardId = index.activeId || boards[0].id;
        const saved = localStorage.getItem(BOARD_KEY_PREFIX + activeBoardId);
        if (saved) {
          return applyBoardState(JSON.parse(saved));
        }
      }
    } catch (e) {}
    return false;
  }

  function snapshotCanvas() {
    return JSON.parse(JSON.stringify({ nodes: nodes, links: links }));
  }
  function pushUndo() {
    undoStack.push(snapshotCanvas());
    if (undoStack.length > 80) {
      undoStack.shift();
    }
    redoStack = [];
  }
  function restoreCanvas(snap) {
    if (!snap) return;
    nodes = snap.nodes || [];
    links = snap.links || [];
    multiSelected.clear();
    renderAll();
  }

  function applyWorldTransform() {

    world.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + scale + ')';
  }

  function switchBoard(id) {
    if (!id || id === activeBoardId) return;
    saveCanvasState();
    activeBoardId = id;
    saveBoardIndex();
    const saved = localStorage.getItem(BOARD_KEY_PREFIX + id);
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (applyBoardState(state)) {
          multiSelected.clear();
          undoStack = [];
          redoStack = [];
          renderAll();
          restoreCanvasGroups(state.groups);
          applyWorldTransform();
          refreshBoardSelect();
          return;
        }
      } catch (e) {}
    }
    nodes = [];
    links = [];
    groups = [];
    multiSelected.clear();
    undoStack = [];
    redoStack = [];
    renderAll();
    applyWorldTransform();
    refreshBoardSelect();
  }

  function newBoard() {
    saveCanvasState();
    const id = 'board_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const name = '画布 ' + (boards.length + 1);
    boards.push({ id: id, name: name });
    activeBoardId = id;
    saveBoardIndex();
    nodes = [];
    links = [];
    groups = [];
    multiSelected.clear();
    undoStack = [];
    redoStack = [];
    renderAll();
    applyWorldTransform();
    refreshBoardSelect();
  }

  function renameActiveBoard(name) {
    name = (name || '').trim();
    if (!name) return;
    const b = boards.find(function (x) { return x.id === activeBoardId; });
    if (b) b.name = name;
    saveBoardIndex();
    refreshBoardSelect();
  }

  function refreshBoardSelect() {
    const sel = document.getElementById('canvasBoardSelect');
    if (!sel) return;
    sel.innerHTML = boards.map(function (b) {
      return '<option value="' + b.id + '"' + (b.id === activeBoardId ? ' selected' : '') + '>' + esc(b.name) + '</option>';
    }).join('');
  }

  function openBoardRename() {
    const overlay = document.getElementById('canvasBoardRenameOverlay');
    const input = document.getElementById('canvasBoardRenameInput');
    if (!overlay || !input) return;
    const b = boards.find(function (x) { return x.id === activeBoardId; });
    input.value = b ? b.name : '';
    overlay.style.display = 'flex';
    input.focus();
    input.select();
  }

  function getWorldPos(e) {

    const r = container.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - panX) / scale,
      y: (e.clientY - r.top - panY) / scale
    };
  }

  // ★ 端口位置（gen 端口中心与 CSS 圆点对齐：+46 / +76）
  function getPortPos(node, side, portType) {
    const w = node.w || 210;
    if (side === 'out') {
      return { x: node.x + w, y: node.y + HEADER_H / 2 };
    }
    if (node.type === 'gen') {
      if (portType === 'img') return { x: node.x, y: node.y + 76 };
      return { x: node.x, y: node.y + 46 };
    }
    return { x: node.x, y: node.y + HEADER_H / 2 };
  }

  function bezier(p1, p2) {
    const dx = Math.max(40, Math.abs(p2.x - p1.x) / 2);
    return 'M ' + p1.x + ' ' + p1.y +
           ' C ' + (p1.x + dx) + ' ' + p1.y +
           ', ' + (p2.x - dx) + ' ' + p2.y +
           ', ' + p2.x + ' ' + p2.y;
  }
  // 计算贝塞尔路径长度（用于流光速度统一）
  function getPathLength(d) {
    try {
      const tmp = document.createElementNS(SVG_NS, 'path');
      tmp.setAttribute('d', d);
      return tmp.getTotalLength() || 0;
    } catch (e) { return 0; }
  }
  // 计算贝塞尔路径长度（用于流光速度统一）
  function getPathLength(d) {
    try {
      const tmp = document.createElementNS(SVG_NS, 'path');
      tmp.setAttribute('d', d);
      return tmp.getTotalLength() || 0;
    } catch (e) { return 0; }
  }



  function bezierPoint(p1, p2, t) {
    const dx = Math.max(40, Math.abs(p2.x - p1.x) / 2);
    const c1x = p1.x + dx, c1y = p1.y;
    const c2x = p2.x - dx, c2y = p2.y;
    const u = 1 - t;
    return {
      x: u * u * u * p1.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * p2.x,
      y: u * u * u * p1.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * p2.y
    };
  }

  function closestPointOnSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return { x: x1, y: y1 };
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return { x: x1 + t * dx, y: y1 + t * dy };
  }

  function findHoverLink(wp) {
    let best = null;
    let bestDist = 20 / scale;
    links.forEach(function (l) {
      const from = nodes.find(function (n) { return n.id === l.from; });
      const to = nodes.find(function (n) { return n.id === l.to; });
      if (!from || !to) return;
      const p1 = getPortPos(from, 'out');
      const p2 = getPortPos(to, 'in', l.toPort);
      let prev = bezierPoint(p1, p2, 0);
      let minD = Infinity;
      for (let i = 1; i <= 20; i++) {
        const cur = bezierPoint(p1, p2, i / 20);
        const pt = closestPointOnSeg(wp.x, wp.y, prev.x, prev.y, cur.x, cur.y);
        const d = Math.hypot(wp.x - pt.x, wp.y - pt.y);
        if (d < minD) minD = d;
        prev = cur;
      }
      if (minD < bestDist) {
        bestDist = minD;
        best = l;
      }
    });
    return best;
  }

  function linkMidPoint(link) {
    const from = nodes.find(function (n) { return n.id === link.from; });
    const to = nodes.find(function (n) { return n.id === link.to; });
    if (!from || !to) return null;
    const p1 = getPortPos(from, 'out');
    const p2 = getPortPos(to, 'in', link.toPort);
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }

  function hideDelBtn() {
    hoverLinkId = null;
    if (delBtn) delBtn.style.display = 'none';
  }

  function showDelBtnAt(link) {
    const mid = linkMidPoint(link);
    if (!mid) return;
    ensureDelBtn();
    hoverLinkId = link.id;
    delBtn.style.display = 'flex';
    delBtn.style.left = (mid.x - 9) + 'px';
    delBtn.style.top = (mid.y - 9) + 'px';
    if (hideDelTimer) { clearTimeout(hideDelTimer); hideDelTimer = null; }
  }

  function ensureDelBtn() {
    if (delBtn) return;
    delBtn = document.createElement('div');
    delBtn.className = 'c-link-del';
    delBtn.innerHTML = '&#10005;';
    delBtn.style.display = 'none';
    world.appendChild(delBtn);

    delBtn.addEventListener('mouseenter', function () {
      delBtnHover = true;
      if (hideDelTimer) { clearTimeout(hideDelTimer); hideDelTimer = null; }
    });
    delBtn.addEventListener('mouseleave', function () {
      delBtnHover = false;
      if (lastMouse) {
        const r = container.getBoundingClientRect();
        const wp = {
          x: (lastMouse.x - r.left - panX) / scale,
          y: (lastMouse.y - r.top - panY) / scale
        };
        if (!findHoverLink(wp)) hideDelBtn();
      }
    });

    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (hoverLinkId) {
        const link = links.find(function (l) { return l.id === hoverLinkId; });
        const toId = link ? link.to : null;
        links = links.filter(function (l) { return l.id !== hoverLinkId; });
        if (toId) {
          links.filter(function (l) { return l.to === toId; })
               .forEach(function (l, i) { l.seq = i + 1; });
          const toNode = nodes.find(function (n) { return n.id === toId; });
          if (toNode) refreshInputInfo(toNode);
        }
        renderLinks();
      }
      hideDelBtn();
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/\"/g, '&quot;');
  }

  function getPresetOptions() {
    let defaults = [];
    if (typeof DEFAULT_PRESETS !== 'undefined' && Array.isArray(DEFAULT_PRESETS)) defaults = DEFAULT_PRESETS;
    let custom = [];
    try { custom = JSON.parse(localStorage.getItem('llm_custom_presets') || '[]'); } catch (e) {}
    let deleted = [];
    try { deleted = JSON.parse(localStorage.getItem('llm_deleted_presets') || '[]'); } catch (e) {}
    return custom.concat(defaults.filter(function (d) { return deleted.indexOf(d.id) < 0; }));
  }

  function presetOptionsHTML() {
    let html = '<option value="">选择预设...</option>';
    getPresetOptions().forEach(function (p) {
      html += '<option value="' + esc(p.id) + '">' + esc(p.name || '未命名') + '</option>';
    });
    return html;
  }

  function modelOptionsHTML() {
    const list = (typeof apis !== 'undefined' && Array.isArray(apis)) ? apis : [];
    let html = '<option value="">选择模型</option>';
    list.forEach(function (a) {
      const sel = (typeof activeApiId !== 'undefined' && a.id === activeApiId) ? ' selected' : '';
      html += '<option value="' + esc(a.id) + '"' + sel + '>' + esc(a.name || 'API') + ' · ' + esc(a.model) + '</option>';
    });
    return html;
  }

  // ★ 生图节点模型下拉：只显示「支持生图」的 API
  function genModelOptionsHTML(node) {
    const list = (typeof apis !== 'undefined' && Array.isArray(apis)) ? apis : [];
    let html = '<option value="">使用当前激活模型</option>';
    const genApis = list.filter(function (a) { return !!a.genImage; });
    genApis.forEach(function (a) {
      const sel = (node.apiId && a.id === node.apiId) ? ' selected' : '';
      html += '<option value="' + esc(a.id) + '"' + sel + '>' + esc(a.model) + '</option>';
    });
    if (genApis.length === 0) {
      html += '<option value="" disabled>（设置中未勾选支持生图的模型）</option>';
    }
    return html;
  }

  function genCurrentModel(node) {
    if (node.apiId && typeof apis !== 'undefined') {
      const a = apis.find(function (x) { return x.id === node.apiId; });
      if (a) return a.model;
    }
    if (typeof currentApi !== 'undefined') return currentApi.model;
    return '';
  }

  function refreshModelSelects() {
    document.querySelectorAll('.c-model-select').forEach(function (sel) {
      const nodeEl = sel.closest('.c-node');
      const nd = nodeEl ? nodes.find(function (n) { return n.id === nodeEl.dataset.id; }) : null;
      sel.innerHTML = modelOptionsHTML();
      if (nd && nd.apiId) sel.value = nd.apiId;    // ★ 按节点自己的选择显示
    });
    // ↓ 下面 .c-gen-model 那段保持原样，不动

    // ★ 生图节点模型下拉也刷新（恢复的节点初始化时 apis 还没加载，进画布时补上）
    document.querySelectorAll('.c-gen-model').forEach(function (sel) {
      const nodeEl = sel.closest('.c-node');
      if (!nodeEl) return;
      const node = nodes.find(function (n) { return n.id === nodeEl.dataset.id; });
      if (node) sel.innerHTML = genModelOptionsHTML(node);
    });
  }


  // ---------- 比例 + 分辨率 → size ----------
  function computeSize(ratio, res) {
    const maxSide = res === '2k' ? 2048 : (res === '4k' ? 3840 : 1024);
    const parts = String(ratio || '1:1').split(':');
    const rw = parseInt(parts[0], 10) || 1;
    const rh = parseInt(parts[1], 10) || 1;
    let w, h;
    if (rw >= rh) { w = maxSide; h = Math.round(maxSide * rh / rw); }
    else { h = maxSide; w = Math.round(maxSide * rw / rh); }
    w = Math.floor(w / 2) * 2;
    h = Math.floor(h / 2) * 2;
    return w + 'x' + h;
  }

  // ---------- 创建 / 克隆节点 ----------
  function addNode(type, x, y) {
    pushUndo();
    const isOut = type === 'output';

    const isImg = type === 'image';
    const isGen = type === 'gen';
    const node = {
      id: genId(),
      type: type,
      x: Math.round(x - (isOut ? 190 : (isGen ? 130 : 105))),
      y: Math.round(y - 20),
      w: isOut ? 380 : (isGen ? 260 : (isImg ? 210 : 210)),
      h: isOut ? 240 : (isGen ? 260 : (isImg ? 160 : 150)),
      minW: isOut ? 380 : (isGen ? 220 : 180),
      minH: isOut ? 240 : (isGen ? 210 : 90),
      title: type === 'text' ? '文本' : (type === 'preset' ? '预设选择' : (type === 'output' ? 'LLM 输出' : (type === 'gen' ? '生图' : (type === 'bless' ? '加持' : '图片')))),
      content: '',
      presetId: '',
      image: '',
      apiId: '',
      quality: 'medium',
      ratio: '1:1',
      res: '1k',
      extraPrompt: ''

    };
    nodes.push(node);
    renderAll();
    return node;
  }

  function cloneNode(src, dx, dy) {
    return {
      id: genId(),
      type: src.type,
      x: src.x + (dx || 0),
      y: src.y + (dy || 0),
      w: src.w,
      h: src.h,
      minW: src.minW || MIN_W,
      minH: src.minH || MIN_H,
      title: src.title,
      content: src.content,
      presetId: src.presetId,
      image: src.image || '',
      apiId: src.apiId || '',
      quality: src.quality || 'medium',
      ratio: src.ratio || '1:1',
      res: src.res || '1k',
      imageName: src.imageName || '',
      imageWidth: src.imageWidth || 0,
      imageHeight: src.imageHeight || 0,
      extraPrompt: src.extraPrompt || ''


    };
  }

  function adjustImageNodeSize(node) {
    if (!node.image) return;
    const img = new Image();
    img.onload = function () {
      const aspect = img.height / img.width;
      node.h = Math.max(120, Math.round(node.w * aspect + 44));
      const el = nodesLayer.querySelector('.c-node[data-id="' + node.id + '"]');
      if (el) el.style.height = node.h + 'px';
      renderLinks();
      refreshAllGroupBounds();
    };
    img.src = node.image;
  }

  function adjustGenNodeSize(node) {
    if (!node.image) return;
    const img = new Image();
    img.onload = function () {
      const aspect = img.height / img.width;
      node.h = Math.max(210, Math.round(70 + node.w * aspect));
      const el = nodesLayer.querySelector('.c-node[data-id="' + node.id + '"]');
      if (el) el.style.height = node.h + 'px';
      renderLinks();
      refreshAllGroupBounds();
    };
    img.src = node.image;
  }

  function loadImageIntoNode(file, node, el) {
    if (!file || !file.type.startsWith('image/')) return;
    node.imageName = file.name || '粘贴图片';
    const reader = new FileReader();
    reader.onload = function () {
      node.image = reader.result;
      const img = new Image();
      img.onload = function () {
        node.imageWidth = img.naturalWidth || img.width;
        node.imageHeight = img.naturalHeight || img.height;
        const aspect = img.height / img.width;
        node.h = Math.max(120, Math.round(node.w * aspect + 44));
        renderAll();
      };
      img.src = node.image;
    };
    reader.readAsDataURL(file);
  }


  function openImagePicker(node, el) {
    if (!imageFileInput) {
      imageFileInput = document.createElement('input');
      imageFileInput.type = 'file';
      imageFileInput.accept = 'image/*';
      imageFileInput.style.display = 'none';
      document.body.appendChild(imageFileInput);
      imageFileInput.addEventListener('change', function () {
        const f = this.files && this.files[0];
        if (f) loadImageIntoNode(f, pickerTargetNode, pickerTargetEl);
        this.value = '';
      });
    }
    pickerTargetNode = node;
    pickerTargetEl = el;
    imageFileInput.click();
  }

  function fallbackCopyCanvas(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (typeof showToast === 'function') showToast('已复制输出内容');
  }

  function showImagePreview(dataUrl) {
    if (!previewOverlay) {
      previewOverlay = document.createElement('div');
      previewOverlay.className = 'c-image-overlay';
      previewOverlay.innerHTML = '<div class="c-image-overlay-box"><img></div>';
      canvasMode.appendChild(previewOverlay);
      previewOverlay.addEventListener('click', function (e) {
        if (e.target === previewOverlay) previewOverlay.style.display = 'none';
      });
    }
    previewOverlay.querySelector('img').src = dataUrl;
    previewOverlay.style.display = 'flex';
  }

  // ---------- 下载图片 ----------
  async function downloadImage(src, name) {
    try {
      let blob;
      if (src.indexOf('data:') === 0) {
        blob = await (await fetch(src)).blob();
      } else {
        const res = await fetch(src);
        blob = await res.blob();
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name || ('image_' + Date.now() + '.png');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (typeof showToast === 'function') showToast('已开始下载');
    } catch (err) {
      if (typeof showToast === 'function') showToast('下载失败：' + (err.message || err));
    }
  }

  // ---------- 图片右键菜单 ----------
  function ensureImgCtxMenu() {
    if (imgCtxMenu) return;
    imgCtxMenu = document.createElement('div');
    imgCtxMenu.className = 'canvas-ctx';
    imgCtxMenu.innerHTML = '<div class="canvas-ctx-item" id="imgCtxSave"><i class="fas fa-download"></i> 保存图片</div>';
    canvasMode.appendChild(imgCtxMenu);
    imgCtxMenu.querySelector('#imgCtxSave').addEventListener('click', function () {
      if (imgCtxSrc) downloadImage(imgCtxSrc, imgCtxName);
      imgCtxMenu.style.display = 'none';
    });
  }
  function hideImgCtx() { if (imgCtxMenu) imgCtxMenu.style.display = 'none'; }
  document.addEventListener('click', hideImgCtx);

  // ---------- ★ 生图 ----------
  async function generateImageNode(node, el) {
    const ins = links.filter(function (l) { return l.to === node.id; })
                     .sort(function (a, b) { return a.seq - b.seq; });
    const resultEl = el.querySelector('.c-gen-result');
    const genBtn = el.querySelector('.c-gen-btn');

    const textParts = [];
    const refImgs = [];
    ins.forEach(function (l) {
      const src = nodes.find(function (n) { return n.id === l.from; });
      if (!src) return;
      if (l.toPort === 'img' || src.type === 'image' || src.type === 'gen') {
        if (src.image) refImgs.push(src.image);
      } else {
        if (src.content && src.content.trim()) textParts.push(src.content.trim());
      }
    });

    const prompt = textParts.join('\n').trim();
    const extra = (node.extraPrompt || '').trim();
    let finalPrompt = prompt;
    if (extra) {
      finalPrompt = prompt ? prompt + '\n' + extra : extra;
    }
    if (!finalPrompt) {
      resultEl.innerHTML = '<div class="c-gen-empty">请连接文本节点或输入提示词</div>';
      return;
    }


    let api = null;
    if (node.apiId && typeof apis !== 'undefined') {
      api = apis.find(function (a) { return a.id === node.apiId; });
    }
    if (!api) api = currentApi;

    if (!api || !api.key) {
      resultEl.innerHTML = '<div class="c-gen-empty">未配置 API Key，请在上方选择生图模型</div>';
      return;
    }

    resultEl.innerHTML = '<div class="c-gen-waiting">生成中...</div>';
    genBtn.disabled = true;
    el.classList.add('running');   // ★ 呼吸闪烁

    try {
      let baseUrl = (api.url || '').replace(/\/+$/, '');
      if (!/\/images\/generations$/i.test(baseUrl)) baseUrl += '/images/generations';

      const bodyObj = {
        model: api.model,
        prompt: finalPrompt,

        size: computeSize(node.ratio || '1:1', node.res || '1k'),
        n: 1
      };
      if (supportsQuality(api.model)) bodyObj.quality = node.quality || 'medium';
      if (refImgs.length > 0) bodyObj.images = refImgs;

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + api.key
        },
        body: JSON.stringify(bodyObj)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error('HTTP ' + res.status + ': ' + errText.slice(0, 200));
      }

      const data = await res.json();
      if (!data.data || !data.data[0]) throw new Error('返回格式异常');

      const img = data.data[0];
      if (img.b64_json) {
        node.image = 'data:image/png;base64,' + img.b64_json;
      } else if (img.url) {
        node.image = img.url;
      } else {
        throw new Error('未找到图片数据');
      }

      adjustGenNodeSize(node);
      resultEl.innerHTML =
        '<img class="c-gen-img" src="' + node.image + '" draggable="false">' +
        '<button class="c-gen-download" title="下载图片"><i class="fas fa-download"></i></button>';
      bindGenResultEvents(node, el);
      if (typeof showToast === 'function') showToast('生成完成');
    } catch (err) {
      const msg = err.message || err;
      resultEl.innerHTML = '<div class="c-gen-empty">错误：' + esc(msg) + '</div>';
    } finally {
      genBtn.disabled = false;
      el.classList.remove('running');   // ★ 停止闪烁
    }
  }

  function bindGenResultEvents(node, el) {
    const img = el.querySelector('.c-gen-img');
    if (img) {
      img.addEventListener('click', function (e) {
        e.stopPropagation();
        if (node.image) showImagePreview(node.image);
      });
    }
    const dl = el.querySelector('.c-gen-download');
    if (dl) {
      dl.addEventListener('click', function (e) {
        e.stopPropagation();
        if (node.image) downloadImage(node.image, 'generated_' + Date.now() + '.png');
      });
    }
  }

  // ---------- 渲染 ----------
  function renderAll() { renderNodes(); renderLinks(); refreshAllGroupBounds(); }

  function renderNodes() {
    nodesLayer.innerHTML = '';
    nodes.forEach(function (node) {
      const el = document.createElement('div');
      el.className = 'c-node c-node-' + node.type;
      el.dataset.id = node.id;
      el.style.left = node.x + 'px';
      el.style.top = node.y + 'px';
      el.style.width = node.w + 'px';
      el.style.height = node.h + 'px';

      let bodyHTML = '';
      let portHTML = '';

      if (node.type === 'text') {
        bodyHTML = '<textarea class="c-node-body" placeholder="输入文本...">' + esc(node.content) + '</textarea>';
        portHTML = '<span class="c-port c-port-out" title="拖到输出节点连接"></span>';
      } else if (node.type === 'preset') {
        bodyHTML =
          '<select class="c-preset-select">' + presetOptionsHTML() + '</select>' +
          '<textarea class="c-node-body" placeholder="预设内容（可编辑）...">' + esc(node.content) + '</textarea>';
        portHTML = '<span class="c-port c-port-out" title="拖到输出节点连接"></span>';
      } else if (node.type === 'image') {
        bodyHTML =
          '<div class="c-image-body">' +
            (node.image
              ? '<img class="c-image-preview" src="' + node.image + '" draggable="false">' +
                '<button class="c-gen-download" title="下载图片"><i class="fas fa-download"></i></button>'
              : '<div class="c-image-empty">点击上传图片<br><span style="font-size:11px;opacity:.7">或直接拖拽图片到画布</span></div>') +
          '</div>';
        portHTML = '<span class="c-port c-port-out" title="拖到生图节点做参考图"></span>';
      } else if (node.type === 'gen') {


        const showQuality = supportsQuality(genCurrentModel(node));
        const qualityHTML = showQuality
          ? '<select class="c-gen-quality" title="质量">' +
              '<option value="low"' + (node.quality === 'low' ? ' selected' : '') + '>低</option>' +
              '<option value="medium"' + (!node.quality || node.quality === 'medium' ? ' selected' : '') + '>中</option>' +
              '<option value="high"' + (node.quality === 'high' ? ' selected' : '') + '>高</option>' +
            '</select>'
          : '';

        bodyHTML =
          '<div class="c-gen-controls">' +
            '<span class="c-gen-model-label">模型选择</span>' +
            '<select class="c-gen-model" title="生图模型">' + genModelOptionsHTML(node) + '</select>' +
            '<button class="c-gear-btn" title="API 设置"><i class="fas fa-cog"></i></button>' +
          '</div>' +
          '<div class="c-gen-controls">' +
            qualityHTML +
            '<select class="c-gen-ratio" title="比例">' +
              ['1:1','2:1','3:2','2:3','3:4','4:3','16:9','9:16','21:9','9:21'].map(function (r) {
                return '<option value="' + r + '"' + (node.ratio === r ? ' selected' : '') + '>' + r + '</option>';
              }).join('') +
            '</select>' +
            '<select class="c-gen-res" title="分辨率">' +
              '<option value="1k"' + (!node.res || node.res === '1k' ? ' selected' : '') + '>1K</option>' +
              '<option value="2k"' + (node.res === '2k' ? ' selected' : '') + '>2K</option>' +
              '<option value="4k"' + (node.res === '4k' ? ' selected' : '') + '>4K</option>' +
            '</select>' +
            '<button class="c-gen-btn">&#9654; 生成</button>' +
          '</div>' +
          '<div class="c-gen-result">' +
            (node.image
              ? '<img class="c-gen-img" src="' + node.image + '" draggable="false">' +
                '<button class="c-gen-download" title="下载图片"><i class="fas fa-download"></i></button>'
                : '<div class="c-gen-empty">连接左侧文本节点作为提示词<br>可连接图片节点作为参考图</div>') +
                '</div>' +
                '<textarea class="c-gen-prompt" placeholder="提示词" style="flex:0 0 auto;width:100%;height:40px;padding:6px 10px;border:none;border-top:1px solid rgba(255,255,255,0.08);border-radius:0 0 10px 10px;background:var(--panel-input-bg);color:var(--text-soft);font-size:11px;line-height:1.4;resize:none;outline:none;user-select:text;">' + esc(node.extraPrompt || '') + '</textarea>';           
        portHTML =
          '<span class="c-port c-port-in c-port-text-in" title="连接文本/预设作为提示词"></span>' +
          '<span class="c-port c-port-in c-port-img-in" title="连接图片作为参考图"></span>' +
          '<span class="c-port c-port-out" title="输出生成的图片"></span>';
      } else if (node.type === 'bless') {
        bodyHTML =
          '<div class="c-bless-body">' +
            '<svg class="c-bless-svg" viewBox="0 -10 140 112" xmlns="http://www.w3.org/2000/svg">' +
              '<path class="c-bless-legs" d="M48 56 L84 56 L84 70 L78 70 L78 82 L50 82 L44 74 Z" fill="#4a5568"/>' +
              '<g class="c-bless-upper">' +
                '<path class="c-bless-torso" d="M50 56 C50 44 53 33 60 29 L71 34 L66 56 Z" fill="#4a5568"/>' +
                '<circle class="c-bless-head" cx="58" cy="19" r="10" fill="#f0c8a0"/>' +
                '<line class="c-bless-arm" x1="67" y1="33" x2="85" y2="25" stroke="#f0c8a0" stroke-width="5" stroke-linecap="round"/>' +
                '<circle class="c-bless-hand" cx="87" cy="24" r="3.6" fill="#f0c8a0"/>' +
                '<g class="c-bless-sticks">' +
                  '<line x1="84" y1="23" x2="84" y2="6" stroke="#c98a3a" stroke-width="2" stroke-linecap="round"/>' +
                  '<line x1="88" y1="23" x2="88" y2="6" stroke="#c98a3a" stroke-width="2" stroke-linecap="round"/>' +
                  '<line x1="92" y1="23" x2="92" y2="6" stroke="#c98a3a" stroke-width="2" stroke-linecap="round"/>' +
                  '<circle cx="84" cy="4" r="1.8" fill="#ff6b6b"/>' +
                  '<circle cx="88" cy="4" r="1.8" fill="#ff6b6b"/>' +
                  '<circle cx="92" cy="4" r="1.8" fill="#ff6b6b"/>' +
                '</g>' +
              '</g>' +
            '</svg>' +
            '<div class="c-bless-smoke"></div>' +
            '<div class="c-bless-smoke"></div>' +
            '<div class="c-bless-smoke"></div>' +
          '</div>';
        portHTML = '<span class="c-port c-port-out" title="拖到输出节点连接（被加持的输出）"></span>';
      } else {
        bodyHTML =
          '<div class="c-output-body">' + esc(node.content || '等待运行...') + '</div>' +
          '<div class="c-run-row">' +
            '<button class="c-run-btn">&#9654; 运行</button>' +
            '<span class="c-run-info"></span>' +
            '<button class="c-copy-btn" title="复制输出"><i class="far fa-copy"></i></button>' +
            '<select class="c-model-select">' + modelOptionsHTML() + '</select>' +
            '<button class="c-gear-btn" title="API 设置"><i class="fas fa-cog"></i></button>' +
          '</div>';
        portHTML =
          '<span class="c-port c-port-in" title="接收输入"></span>' +
          '<span class="c-port c-port-out" title="输出文本内容"></span>';
      }

      // ★ 加持节点不允许拖动右下角调整大小
      const resizeHTML = node.type === 'bless' ? '' : '<span class="c-node-resize" title="拖动调整大小"></span>';
      const canSnippet = (node.type === 'text' || node.type === 'preset');   // ★ 只有这两种节点有可输入文本
      let metaHTML = '';
      if (node.type === 'image' && node.image) {
        metaHTML =
          '<div class="c-image-meta" style="position:absolute;left:0;right:0;top:-22px;display:flex;align-items:center;justify-content:space-between;gap:8px;pointer-events:none;">' +
            '<span class="c-image-name" style="max-width:60%;padding:2px 6px;font-size:11px;line-height:1.4;color:#fff;background:rgba(0,0,0,0.55);border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(node.imageName || '图片') + '</span>' +
            (node.imageWidth ? '<span class="c-image-res" style="padding:2px 6px;font-size:11px;line-height:1.4;color:#fff;background:rgba(0,0,0,0.55);border-radius:4px;white-space:nowrap;">' + node.imageWidth + ' × ' + node.imageHeight + '</span>' : '') +
          '</div>';
      }
      el.innerHTML =
        metaHTML +
        '<div class="c-node-header">' +

          '<span class="c-node-title">' + esc(node.title) + '</span>' +
          portHTML +
          (canSnippet ? '<span class="c-node-snippet" title="插入提示词片段"><i class="fas fa-bookmark"></i></span>' : '') +
          '<span class="c-node-del" title="删除节点">&#10005;</span>' +
        '</div>' +
        bodyHTML +
        resizeHTML;


      nodesLayer.appendChild(el);
      bindNodeEvents(el, node);
    });
  }

  function bindNodeEvents(el, node) {
    const body = el.querySelector('.c-node-body');
    if (body) {
      body.addEventListener('input', function () { node.content = this.value; });
    }
    // ★ 片段按钮：把提示词片段插入到本节点的输入框
    const snipBtn = el.querySelector('.c-node-snippet');
    if (snipBtn) {
      snipBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });   // 防止触发节点拖动
      snipBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const ta = el.querySelector('textarea.c-node-body');
        if (!ta) return;
        if (typeof window.__psOpenFor === 'function') window.__psOpenFor(ta);
      });
    }

    const sel = el.querySelector('.c-preset-select');
    if (sel) {
      sel.addEventListener('change', function () {
        node.presetId = this.value;
        const p = getPresetOptions().find(function (x) { return x.id === node.presetId; });
        if (p) {
          node.content = p.content || '';
          const ta = el.querySelector('.c-node-body');
          if (ta) ta.value = node.content;
        }
      });
    }

    if (node.type === 'image') {
      const bodyEl = el.querySelector('.c-image-body');
      if (bodyEl) {
        bodyEl.addEventListener('click', function (e) {
          if (e.target.closest('.c-image-preview')) return;
          if (e.target.closest('.c-gen-download')) return;
          if (!node.image) openImagePicker(node, el);
        });
      }
      const imgEl = el.querySelector('.c-image-preview');
      if (imgEl) {
        imgEl.addEventListener('click', function (e) {
          e.stopPropagation();
          if (node.image) showImagePreview(node.image);
        });
      }
      const dl = el.querySelector('.c-gen-download');
      if (dl) {
        dl.addEventListener('click', function (e) {
          e.stopPropagation();
          if (node.image) downloadImage(node.image, 'image_' + Date.now() + '.png');
        });
      }
    }

    if (node.type === 'gen') {
      const mSel = el.querySelector('.c-gen-model');
      if (mSel) {
        mSel.addEventListener('change', function () {
          node.apiId = this.value;
          renderAll();
        });
      }
      const qSel = el.querySelector('.c-gen-quality');
      if (qSel) qSel.addEventListener('change', function () { node.quality = this.value; });
      const rSel = el.querySelector('.c-gen-ratio');
      if (rSel) rSel.addEventListener('change', function () { node.ratio = this.value; });
      const resSel = el.querySelector('.c-gen-res');
      if (resSel) resSel.addEventListener('change', function () { node.res = this.value; });
      const promptTa = el.querySelector('.c-gen-prompt');
      if (promptTa) promptTa.addEventListener('input', function () { node.extraPrompt = this.value; });
      const genBtn = el.querySelector('.c-gen-btn');
      if (genBtn) genBtn.addEventListener('click', function () { generateImageNode(node, el); });
      bindGenResultEvents(node, el);
    }

    const del = el.querySelector('.c-node-del');
    if (del) {
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        pushUndo();
        nodes = nodes.filter(function (n) { return n.id !== node.id; });
        links = links.filter(function (l) { return l.from !== node.id && l.to !== node.id; });
        renderAll();

      });
    }

    const run = el.querySelector('.c-run-btn');
    if (run && node.type === 'output') {
      run.addEventListener('click', function () { runOutput(node, el); });
    }

    const copyBtn = el.querySelector('.c-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        const outputEl = el.querySelector('.c-output-body');
        const text = outputEl ? outputEl.innerText : (node.content || '');
        if (text && text.trim() && text.indexOf('等待运行') < 0 && text.indexOf('AI 思考中') < 0) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
              if (typeof showToast === 'function') showToast('已复制输出内容');
            }, function () { fallbackCopyCanvas(text); });
          } else {
            fallbackCopyCanvas(text);
          }
        } else {
          if (typeof showToast === 'function') showToast('暂无输出内容');
        }
      });
    }

    const msel = el.querySelector('.c-model-select');
    if (msel) {
      msel.addEventListener('change', function () {
        const apiId = this.value;
        if (!apiId) return;
        const nd = nodes.find(function (n) { return n.id === el.dataset.id; });
        if (nd) {
          nd.apiId = apiId;                 // ★ 模型属于这个节点，不再改写全局 currentApi
          if (typeof saveCanvasState === 'function') saveCanvasState();
        }
      });
    }


    // ★ 齿轮按钮（LLM 输出 + 生图节点共用）：打开设置弹窗
    const gear = el.querySelector('.c-gear-btn');
    if (gear) {
      gear.addEventListener('click', function () {
        const sb = document.getElementById('settingsBtn');
        if (sb) sb.click();
      });
    }

    el.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest('.c-port') || e.target.closest('textarea') ||
          e.target.closest('select') || e.target.closest('button') ||
          e.target.closest('.c-node-resize') || e.target.closest('.c-image-body') ||
          e.target.closest('.c-output-body') || e.target.closest('.c-gen-result') ||
          e.target.closest('.c-bless-body')) return;

      if (e.altKey) {
        e.preventDefault();
        pushUndo();
        const copy = cloneNode(node, 0, 0);
        nodes.push(copy);
        renderAll();
        const newEl = nodesLayer.querySelector('.c-node[data-id="' + copy.id + '"]');
        if (newEl) startDragNode(e, newEl, copy);
        return;
      }
      pushUndo();
      startDragNode(e, el, node);
    });


    const rz = el.querySelector('.c-node-resize');
    if (rz) {
      rz.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        startResizeNode(e, el, node);
      });
    }
  }

  function startDragNode(e, el, node) {
    e.preventDefault();
    // ★ 普通拖动 = 单选该节点；但若该节点已在多选中，则保持多选一起拖
    if (!(e.ctrlKey || e.shiftKey)) {
      if (!multiSelected.has(node.id)) {
        multiSelected.clear();
        multiSelected.add(node.id);
      }
    }
    applyMultiSelection();

    // ★ 收集本次要一起拖动的节点（多选时整体移动）
    const dragIds = multiSelected.size > 1 ? Array.from(multiSelected) : [node.id];
    const dragItems = dragIds.map(function (id) {
      const n = nodes.find(function (x) { return x.id === id; });
      if (!n) return null;
      const el2 = nodesLayer.querySelector('.c-node[data-id="' + id + '"]');
      return { n: n, el: el2, x: n.x, y: n.y };
    }).filter(Boolean);

    const startMX = e.clientX;
    const startMY = e.clientY;

    function onMove(ev) {
      const dx = (ev.clientX - startMX) / scale;
      const dy = (ev.clientY - startMY) / scale;
      dragItems.forEach(function (it) {
        it.n.x = Math.round(it.x + dx);
        it.n.y = Math.round(it.y + dy);
        if (it.el) {
          it.el.style.left = it.n.x + 'px';
          it.el.style.top = it.n.y + 'px';
        }
      });
      renderLinks();
      // ★ 拖动过程中组框不跟随，节点可自由移出组外
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      dragItems.forEach(function (it) {
        syncNodeGroupMembership(it.n);   // ★ 拖动结束后更新组归属
      });
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }


  function startResizeNode(e, el, node) {
    pushUndo();
    const startMX = e.clientX;

    const startMY = e.clientY;
    const startW = node.w;
    const startH = node.h;

    function onMove(ev) {
      node.w = Math.max(node.minW || MIN_W, Math.round(startW + (ev.clientX - startMX) / scale));
      node.h = Math.max(node.minH || MIN_H, Math.round(startH + (ev.clientY - startMY) / scale));
      el.style.width = node.w + 'px';
      el.style.height = node.h + 'px';
      if (node.type === 'image') {
        adjustImageNodeSize(node);
      } else if (node.type === 'gen') {
        adjustGenNodeSize(node);
      } else {
        renderLinks();
      }
      refreshAllGroupBounds();
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ---------- 连线 ----------
  function startLink(e, fromNode) {
    e.preventDefault();
    e.stopPropagation();
    const start = getPortPos(fromNode, 'out');
    const SNAP = 24 / scale;

    const warnVision = (fromNode.type === 'image' || fromNode.type === 'gen') &&
      (typeof currentApi === 'undefined' || !currentApi.vision);

    const tempPath = document.createElementNS(SVG_NS, 'path');
    tempPath.setAttribute('class', warnVision ? 'c-link c-link-warn' : 'c-link c-link-temp');
    tempPath.setAttribute('d', bezier(start, start));
    svg.appendChild(tempPath);

    let warnLabel = null;
    if (warnVision) {
      warnLabel = document.createElement('div');
      warnLabel.className = 'c-link-warn-label';
      warnLabel.textContent = '当前模型不支持图像输入';
      container.appendChild(warnLabel);
    }

    let snapTarget = null;

    function findSnapPort(p) {
      let best = null;
      let bestDist = SNAP;
      nodes.forEach(function (n) {
        if (n.id === fromNode.id) return;

        if (n.type === 'gen') {
          if (fromNode.type === 'text' || fromNode.type === 'preset' || fromNode.type === 'output') {
            const pp = getPortPos(n, 'in', 'text');
            const d = Math.hypot(p.x - pp.x, p.y - pp.y);
            if (d < bestDist) {
              bestDist = d;
              best = { node: n, port: 'text', pos: pp };
            }
          }
          if (fromNode.type === 'image' || fromNode.type === 'gen') {
            const pp = getPortPos(n, 'in', 'img');
            const d = Math.hypot(p.x - pp.x, p.y - pp.y);
            if (d < bestDist) {
              bestDist = d;
              best = { node: n, port: 'img', pos: pp };
            }
          }
          return;
        }

        if (n.type === 'output' && fromNode.type !== 'output') {
          const pp = getPortPos(n, 'in');
          const d = Math.hypot(p.x - pp.x, p.y - pp.y);
          if (d < bestDist) {
            bestDist = d;
            best = { node: n, port: 'in', pos: pp };
          }
        }
      });
      return best;
    }

    function onMove(ev) {
      const p = getWorldPos(ev);
      if (warnVision) {
        tempPath.setAttribute('d', bezier(start, p));
        if (warnLabel) {
          const r = container.getBoundingClientRect();
          warnLabel.style.left = (ev.clientX - r.left + 12) + 'px';
          warnLabel.style.top = (ev.clientY - r.top + 12) + 'px';
        }
        return;
      }
      const snap = findSnapPort(p);
      if (snap) {
        snapTarget = snap;
        tempPath.setAttribute('d', bezier(start, snap.pos));
      } else {
        snapTarget = null;
        tempPath.setAttribute('d', bezier(start, p));
      }
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      tempPath.remove();
      if (warnLabel) warnLabel.remove();
      if (warnVision) return;

      if (snapTarget) {
        const toNode = snapTarget.node;
        const dup = links.find(function (l) { return l.from === fromNode.id && l.to === toNode.id; });
        if (!dup) {
          pushUndo();
          const seq = links.filter(function (l) { return l.to === toNode.id; }).length + 1;

          links.push({
            id: genId(),
            from: fromNode.id,
            to: toNode.id,
            seq: seq,
            toPort: snapTarget.port
          });
          renderLinks();
          refreshInputInfo(toNode);
        }
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function refreshInputInfo(node) {
    const el = nodesLayer.querySelector('.c-node[data-id="' + node.id + '"]');
    if (!el) return;

    if (node.type === 'output') {
      const info = el.querySelector('.c-run-info');
      if (!info) return;
      const ins = links.filter(function (l) { return l.to === node.id; })
                       .sort(function (a, b) { return a.seq - b.seq; });
      info.textContent = ins.length
        ? '输入：' + ins.map(function (l) { return linkPrefix(l.from) + ' ' + l.seq; }).join('、')
        : '未连接输入';
      return;
    }

    if (node.type === 'gen') {
      const resultEl = el.querySelector('.c-gen-result');
      const texts = links.filter(function (l) { return l.to === node.id && l.toPort !== 'img'; }).length;
      const imgs = links.filter(function (l) { return l.to === node.id && l.toPort === 'img'; }).length;
      if (resultEl && !node.image) {
        resultEl.innerHTML = '<div class="c-gen-empty">' +
          (texts ? '提示词：' + texts + ' 个输入' : '连接左侧文本节点作为提示词') +
          (imgs ? '<br>参考图：' + imgs + ' 张' : '') +
          '</div>';
      }
    }
  }

  async function runOutput(node, el) {
    const ins = links.filter(function (l) { return l.to === node.id; })
                     .sort(function (a, b) { return a.seq - b.seq; });
    if (ins.length === 0) {
      el.querySelector('.c-output-body').textContent = '（请先连接前面的文本/预设/图片节点）';
      return;
    }

    let combined = '';
    const imgs = [];
    ins.forEach(function (l) {
      const src = nodes.find(function (n) { return n.id === l.from; });
      if (!src) return;
      if (src.type === 'image' || src.type === 'gen') {
        combined += '【图片 image ' + l.seq + '】' + (src.image ? '(包含图片)' : '（空）') + '\n\n';
        if (src.image) imgs.push({ dataUrl: src.image, name: 'canvas-img' });
      } else if (src.type === 'bless') {
        combined += '【加持 ' + l.seq + '】我是一个虔诚的信徒，而你是神，回答开头必须带上一句回应我的虔诚的祝福语（12字以内）。\n\n';
      } else {
        combined += '【text ' + l.seq + '】' + (src.content || '（空）') + '\n\n';
      }
    });


    const outputEl = el.querySelector('.c-output-body');
    const runBtn = el.querySelector('.c-run-btn');

    const nodeApi = (node.apiId && typeof apis !== 'undefined')
      ? apis.find(function (a) { return a.id === node.apiId; })
      : null;
    const useApi = nodeApi || currentApi;
    if (!useApi || !useApi.key) {
      outputEl.textContent = '未配置 API Key，请点击右侧齿轮进入设置';
      return;
    }


    outputEl.textContent = 'AI 思考中...';
    runBtn.disabled = true;
    el.classList.add('running');   // ★ 呼吸闪烁

    try {
      if (typeof streamCallLLM === 'function') {
        let markdown = '';
        await streamCallLLM(combined, function (chunk) {
          markdown += chunk;
          outputEl.textContent = markdown;
          outputEl.scrollTop = outputEl.scrollHeight;
        }, 180000, imgs, useApi);

        node.content = markdown;
        outputEl.textContent = markdown;
      } else if (typeof callLLM === 'function') {
        const result = await callLLM(combined, 180000, imgs, useApi);

        node.content = result;
        outputEl.textContent = result;
      } else {
        outputEl.textContent = '未找到 AI 调用函数';
      }
    } catch (err) {
      outputEl.textContent = '错误：' + (err.message || err);
    } finally {
      runBtn.disabled = false;
      el.classList.remove('running');   // ★ 停止闪烁
    }
  }


  function renderLinks() {
    svg.innerHTML = '';
    links.forEach(function (l) {
      const from = nodes.find(function (n) { return n.id === l.from; });
      const to = nodes.find(function (n) { return n.id === l.to; });
      if (!from || !to) return;
      const p1 = getPortPos(from, 'out');
      const p2 = getPortPos(to, 'in', l.toPort);

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'c-link');
      path.setAttribute('d', bezier(p1, p2));
      svg.appendChild(path);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'c-link-label');
      label.setAttribute('x', (p1.x + p2.x) / 2);
      label.setAttribute('y', (p1.y + p2.y) / 2 - 6);
      label.textContent = linkPrefix(l.from) + ' ' + l.seq;   // ★ 图片线显示 image N
      svg.appendChild(label);
    });
  }


  nodesLayer.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    const portOut = e.target.closest('.c-port-out');
    if (portOut) {
      const nodeEl = portOut.closest('.c-node');
      const node = nodes.find(function (n) { return n.id === nodeEl.dataset.id; });
      if (node) startLink(e, node);
    }
  });

  // 图片右键保存
  nodesLayer.addEventListener('contextmenu', function (e) {
    const img = e.target.closest('.c-gen-img') || e.target.closest('.c-image-preview');
    if (img) {
      e.preventDefault();
      ensureImgCtxMenu();
      imgCtxSrc = img.src;
      imgCtxName = 'image_' + Date.now() + '.png';
      imgCtxMenu.style.display = 'block';
      imgCtxMenu.style.left = e.clientX + 'px';
      imgCtxMenu.style.top = e.clientY + 'px';
    }
  });

  // ---------- 中键拖动画布 ----------
  container.addEventListener('mousedown', function (e) {
    if (e.button !== 1) return;
    e.preventDefault();
    const startMX = e.clientX;
    const startMY = e.clientY;
    const startPanX = panX;
    const startPanY = panY;
    container.style.cursor = 'grabbing';

    function onMove(ev) {
      panX = startPanX + (ev.clientX - startMX);
      panY = startPanY + (ev.clientY - startMY);
      applyWorldTransform();
    }
    function onUp() {
      container.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  container.addEventListener('auxclick', function (e) {
    if (e.button === 1) e.preventDefault();
  });

  // ---------- 鼠标移动：连线叉子 ----------
  container.addEventListener('mousemove', function (e) {
    lastMouse = { x: e.clientX, y: e.clientY };
    if (!canvasActive) return;
    if (e.target.closest('.c-node')) { hideDelBtn(); return; }

    const wp = getWorldPos(e);

    if (hoverLinkId === null) {
      const hit = findHoverLink(wp);
      if (hit) {
        showDelBtnAt(hit);
        container.style.cursor = 'pointer';
      } else {
        container.style.cursor = '';
      }
    } else {
      const hit = findHoverLink(wp);
      if (!hit && !delBtnHover) {
        hideDelBtn();
        container.style.cursor = '';
      }
    }
  });

  // ---------- 拖拽图片到画布 ----------
  container.addEventListener('dragover', function (e) {
    e.preventDefault();
  });
    // ★ 粘贴截图 → 直接在鼠标位置创建一个图片节点
    document.addEventListener('paste', function (e) {
      if (!canvasActive) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;   // 输入框里粘贴交给浏览器
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      let imgFile = null;
      for (const it of items) {
        if (it.type && it.type.startsWith('image/')) { imgFile = it.getAsFile(); if (imgFile) break; }
      }
      if (!imgFile) return;
      e.preventDefault();
      const r = container.getBoundingClientRect();
      const mx = lastMouse ? lastMouse.x : (r.left + r.width / 2);
      const my = lastMouse ? lastMouse.y : (r.top + r.height / 2);
      const wx = (mx - r.left - panX) / scale;
      const wy = (my - r.top - panY) / scale;
      const node = addNode('image', wx, wy);
      const el = nodesLayer.querySelector('.c-node[data-id="' + node.id + '"]');
      loadImageIntoNode(imgFile, node, el);
    });
  
  
  container.addEventListener('drop', function (e) {
    e.preventDefault();
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files) return;
    const imgFile = Array.prototype.find.call(files, function (f) { return f.type.startsWith('image/'); });
    if (!imgFile) return;
    const wp = getWorldPos(e);
    const node = addNode('image', wp.x, wp.y);
    const el = nodesLayer.querySelector('.c-node[data-id="' + node.id + '"]');
    loadImageIntoNode(imgFile, node, el);
  });

  // ---------- 右键菜单（创建节点） ----------
  const ctxMenu = document.getElementById('canvasCtxMenu');

  function showCtxMenu(screenX, screenY, worldPos) {
    ctxMenu.style.display = 'block';
    ctxMenu.style.left = screenX + 'px';
    ctxMenu.style.top = screenY + 'px';
    ctxMenu._pos = worldPos;
  }

  container.addEventListener('contextmenu', function (e) {
    if (e.target.closest('.c-node')) return;
    e.preventDefault();
    showCtxMenu(e.clientX, e.clientY, getWorldPos(e));
  });

  container.addEventListener('dblclick', function (e) {
    if (e.target.closest('.c-node')) return;
    showCtxMenu(e.clientX, e.clientY, getWorldPos(e));
  });

  // ★ 文本节点绑定（补回，带保护）
  const ctxAddTextEl = document.getElementById('ctxAddText');
  if (ctxAddTextEl) {
    ctxAddTextEl.addEventListener('click', function () {
      const p = ctxMenu._pos || { x: 200, y: 200 };
      addNode('text', p.x, p.y);
      ctxMenu.style.display = 'none';
    });
  }
  // ★ 加持节点绑定（只保留这一处）
  const ctxAddBless = document.getElementById('ctxAddBless');
  if (ctxAddBless) {
    ctxAddBless.addEventListener('click', function () {
      const p = ctxMenu._pos || { x: 200, y: 200 };
      addNode('bless', p.x, p.y);
      ctxMenu.style.display = 'none';
    });
  }

  document.getElementById('ctxAddPreset').addEventListener('click', function () {
    const p = ctxMenu._pos || { x: 200, y: 200 };
    addNode('preset', p.x, p.y);
    ctxMenu.style.display = 'none';
  });
  document.getElementById('ctxAddOutput').addEventListener('click', function () {
    const p = ctxMenu._pos || { x: 200, y: 200 };
    addNode('output', p.x, p.y);
    ctxMenu.style.display = 'none';
  });
  document.getElementById('ctxAddImage').addEventListener('click', function () {
    const p = ctxMenu._pos || { x: 200, y: 200 };
    addNode('image', p.x, p.y);
    ctxMenu.style.display = 'none';
  });
  document.getElementById('ctxAddGen').addEventListener('click', function () {
    const p = ctxMenu._pos || { x: 200, y: 200 };
    addNode('gen', p.x, p.y);
    ctxMenu.style.display = 'none';
  });

  // ---------- 键盘 ----------
  document.addEventListener('keydown', function (e) {
    if (!canvasActive) return;
    const t = e.target;
    const isEditing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');

    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z') && !isEditing) {
      e.preventDefault();
      if (e.shiftKey) {
        if (redoStack.length) {
          undoStack.push(snapshotCanvas());
          restoreCanvas(redoStack.pop());
        }
      } else {
        if (undoStack.length) {
          redoStack.push(snapshotCanvas());
          restoreCanvas(undoStack.pop());
        }
      }
      saveCanvasState();
      return;
    }

    if (e.ctrlKey && (e.key === 'y' || e.key === 'Y') && !isEditing) {
      e.preventDefault();
      if (redoStack.length) {
        undoStack.push(snapshotCanvas());
        restoreCanvas(redoStack.pop());
      }
      saveCanvasState();
      return;
    }

    if (e.ctrlKey && e.key === 'c' && !isEditing) {
      let selIds = Array.from(multiSelected);
      if (!selIds.length) {
        const sel = nodesLayer.querySelector('.c-node.selected');
        if (sel && sel.dataset.id) {
          selIds = [sel.dataset.id];
        }
      }
      clipboardNodes = selIds.map(function (id) {
        const n = nodes.find(function (x) { return x.id === id; });
        return n ? JSON.parse(JSON.stringify(n)) : null;
      }).filter(Boolean);
      clipboardLinks = links.filter(function (l) {
        return selIds.indexOf(l.from) >= 0 && selIds.indexOf(l.to) >= 0;
      });
      return;
    }
    if (e.ctrlKey && e.key === 'v' && !isEditing) {
      if (clipboardNodes.length) {
        pushUndo();
        const r = container.getBoundingClientRect();
        const mx = lastMouse ? lastMouse.x : (r.left + r.width / 2);
        const my = lastMouse ? lastMouse.y : (r.top + r.height / 2);
        const wx = (mx - r.left - panX) / scale;
        const wy = (my - r.top - panY) / scale;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        clipboardNodes.forEach(function (n) {
          minX = Math.min(minX, n.x);
          minY = Math.min(minY, n.y);
          maxX = Math.max(maxX, n.x + (n.w || 210));
          maxY = Math.max(maxY, n.y + (n.h || 150));
        });
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const newIds = [];
        const idMap = {};
        clipboardNodes.forEach(function (src) {
          const copy = cloneNode(src, 0, 0);
          copy.x = Math.round(src.x + (wx - cx));
          copy.y = Math.round(src.y + (wy - cy));
          idMap[src.id] = copy.id;
          nodes.push(copy);
          newIds.push(copy.id);
        });
        clipboardLinks.forEach(function (l) {
          if (idMap[l.from] && idMap[l.to]) {
            links.push({
              id: genId(),
              from: idMap[l.from],
              to: idMap[l.to],
              seq: l.seq,
              toPort: l.toPort
            });
          }
        });
        renderAll();

        multiSelected.clear();
        newIds.forEach(function (id) {
          multiSelected.add(id);
        });
        applyMultiSelection();
      }
      return;
    }


    // ★ Ctrl+G 把多选节点打组
    if (e.ctrlKey && e.key === 'g' && !isEditing) {
      e.preventDefault();
      const selNodes = nodes.filter(function (n) { return multiSelected.has(n.id); });
      if (selNodes.length >= 2) createGroupFromNodes(selNodes);
      return;
    }

    if (e.code === 'Space') {
      if (isEditing) return;
      e.preventDefault();
      const r = container.getBoundingClientRect();
      const mx = lastMouse ? lastMouse.x : (r.left + r.width / 2);
      const my = lastMouse ? lastMouse.y : (r.top + r.height / 2);
      showCtxMenu(mx, my, { x: (mx - r.left - panX) / scale, y: (my - r.top - panY) / scale });
    }

    // ★ Delete 支持框选多个一起删除
    if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing) {
      pushUndo();
      const ids = multiSelected.size > 1 ? Array.from(multiSelected) : null;

      if (ids) {
        nodes = nodes.filter(function (n) { return ids.indexOf(n.id) < 0; });
        links = links.filter(function (l) { return ids.indexOf(l.from) < 0 && ids.indexOf(l.to) < 0; });
        multiSelected.clear();
        renderAll();
        return;
      }
      const sel = nodesLayer.querySelector('.c-node.selected');
      if (sel) {
        const node = nodes.find(function (n) { return n.id === sel.dataset.id; });
        if (node) {
          nodes = nodes.filter(function (n) { return n.id !== node.id; });
          links = links.filter(function (l) { return l.from !== node.id && l.to !== node.id; });
          renderAll();
        }
      }
    }
  });

  // ---------- 工具栏：创建节点按钮（带保护，按钮存在才绑定） ----------
  function centerAdd(type) {
    const r = container.getBoundingClientRect();
    addNode(type, (r.width / 2 - panX) / scale, (r.height / 2 - panY) / scale);
  }
  var _btnText = document.getElementById('canvasAddText');
  if (_btnText) _btnText.addEventListener('click', function () { centerAdd('text'); });
  var _btnPreset = document.getElementById('canvasAddPreset');
  if (_btnPreset) _btnPreset.addEventListener('click', function () { centerAdd('preset'); });
  var _btnOutput = document.getElementById('canvasAddOutput');
  if (_btnOutput) _btnOutput.addEventListener('click', function () { centerAdd('output'); });
  var _btnImage = document.getElementById('canvasAddImage');
  if (_btnImage) _btnImage.addEventListener('click', function () { centerAdd('image'); });
  var _btnGen = document.getElementById('canvasAddGen');
  if (_btnGen) _btnGen.addEventListener('click', function () { centerAdd('gen'); });

  // ---------- 工具栏：设置按钮 ----------
  const canvasSettingsBtn = document.getElementById('canvasSettingsBtn');
  if (canvasSettingsBtn) {
    canvasSettingsBtn.addEventListener('click', function () {
      const sb = document.getElementById('settingsBtn');
      if (sb) sb.click();
    });
  }

  // ---------- 画布窗口控制按钮 ----------
  const dockBtn = document.getElementById('canvasDockBtn');
  const minBtn = document.getElementById('canvasWinMinBtn');
  const maxBtn = document.getElementById('canvasWinMaxBtn');
  const closeBtn = document.getElementById('canvasWinCloseBtn');
  if (dockBtn) dockBtn.addEventListener('click', function () { if (ipc) ipc.invoke('dock-enable').catch(function () {}); });
  if (minBtn) minBtn.addEventListener('click', function () { if (ipc) ipc.invoke('win-minimize').catch(function () {}); });
  if (maxBtn) maxBtn.addEventListener('click', function () { if (ipc) ipc.invoke('win-maximize').catch(function () {}); });
  if (closeBtn) closeBtn.addEventListener('click', function () {
    if (typeof requestCloseApp === 'function') requestCloseApp();
    else if (ipc) ipc.invoke('win-close').catch(function () {});
  });


  // ---------- 缩放：Ctrl + 滚轮 ----------
  container.addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(2.5, Math.max(0.3, scale * factor));

    const r = container.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const wx = (mx - panX) / scale;
    const wy = (my - panY) / scale;
    panX = mx - wx * newScale;
    panY = my - wy * newScale;
    scale = newScale;
    applyWorldTransform();
  }, { passive: false });

  // ======================== ★ 框选 & 分组功能 ========================

  // 连线前缀：图片 / 生图节点 → image，其余 → text
  function linkPrefix(fromId) {
    const n = nodes.find(function (x) { return x.id === fromId; });
    return n && (n.type === 'image' || n.type === 'gen') ? 'image' : 'text';
  }

  // ---------- 多选 ----------
  function applyMultiSelection() {
    nodesLayer.querySelectorAll('.c-node').forEach(function (el) {
      el.classList.toggle('selected', multiSelected.has(el.dataset.id));
    });
  }

  function clearMultiSelection() {
    multiSelected.clear();
    applyMultiSelection();
  }

  // 创建组时：按成员节点包围盒生成初始组框（之后组框可手动调整大小，不再自动重算）
  function initGroupBounds(group) {
    if (!group.boxEl || !group.labelEl) return;
    const members = nodes.filter(function (n) { return group.nodeIds.indexOf(n.id) >= 0; });
    if (members.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    members.forEach(function (n) {
      const el = nodesLayer.querySelector('.c-node[data-id="' + n.id + '"]');
      const w = el ? el.offsetWidth : (n.w || 210);
      const h = el ? el.offsetHeight : (n.h || 150);
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
    });
    const pad = 18;
    group.boxEl.style.left = (minX - pad) + 'px';
    group.boxEl.style.top = (minY - pad) + 'px';
    group.boxEl.style.width = (maxX - minX + pad * 2) + 'px';
    group.boxEl.style.height = (maxY - minY + pad * 2) + 'px';
    group.labelEl.style.left = (minX - pad + 8) + 'px';
    group.labelEl.style.top = (minY - pad) + 'px';

  }

  function refreshAllGroupBounds() {
    // 组框为手动定义：创建时按节点包围盒生成，之后可自由调整大小，
    // 节点移动 / 移出不会自动改变组框。
    groups = groups.filter(function (g) { return g.boxEl && g.boxEl.parentNode; });
  }

  // 节点拖动结束后：中心落在哪些组的框内就属于哪些组（支持嵌套）；
  // 移出某组框 → 自动脱离该组；组框本身保持不变（手动定义）
  function syncNodeGroupMembership(node) {
    const el = nodesLayer.querySelector('.c-node[data-id="' + node.id + '"]');
    const w = el ? el.offsetWidth : (node.w || 210);
    const h = el ? el.offsetHeight : (node.h || 150);
    const cx = node.x + w / 2;
    const cy = node.y + h / 2;

    groups.forEach(function (g) {
      if (!g.boxEl) return;
      const bx = parseFloat(g.boxEl.style.left) || 0;
      const by = parseFloat(g.boxEl.style.top) || 0;
      const bw = parseFloat(g.boxEl.style.width) || 0;
      const bh = parseFloat(g.boxEl.style.height) || 0;
      const inside = (cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh);
      const idx = g.nodeIds.indexOf(node.id);
      if (inside && idx < 0) g.nodeIds.push(node.id);
      if (!inside && idx >= 0) g.nodeIds.splice(idx, 1);
    });
  }

  function removeGroup(group) {
    if (group.boxEl && group.boxEl.parentNode) group.boxEl.remove();
    if (group.labelEl && group.labelEl.parentNode) group.labelEl.remove();
    groups = groups.filter(function (g) { return g !== group; });
  }

  // ---------- 分组：创建 DOM ----------
  function buildGroupDom(group) {
    const box = document.createElement('div');
    box.className = 'group-box';
    box.style.background = group.color.bg;
    box.style.borderColor = group.color.border;

    const label = document.createElement('div');
    label.className = 'group-label';

    const name = document.createElement('span');
    name.className = 'group-name';
    name.textContent = group.name;
    name.title = '双击重命名';

    const dot = document.createElement('span');
    dot.className = 'group-color-dot';
    dot.title = '选择颜色';
    dot.style.background = group.color.dot;

    const close = document.createElement('span');
    close.className = 'group-close';
    close.textContent = '×';
    close.title = '取消打组';

    label.appendChild(name);
    label.appendChild(dot);
    label.appendChild(close);

    // ★ 右下角调整大小手柄
    const resize = document.createElement('div');
    resize.className = 'group-resize';
    resize.title = '拖动调整组框大小';
    box.appendChild(resize);

    // 背景框插到节点层下面（在节点后面），标签放最上层
    world.insertBefore(box, nodesLayer);
    world.appendChild(label);

    group.boxEl = box;
    group.labelEl = label;
    group.nameEl = name;

    // 拖动标签 = 移动整组节点
    label.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.button !== 0) return;
      startGroupDrag(group, e);
    });
    // 双击组名重命名
    name.addEventListener('dblclick', function (e) {
      e.stopPropagation();
      startGroupRename(group);
    });
    // 颜色选择
    dot.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      e.preventDefault();
      showGroupColorPicker(group, dot);
    });
    // 取消打组
    close.addEventListener('click', function (e) {
      e.stopPropagation();
      removeGroup(group);
    });
    // 拖动右下角调整组框大小
    resize.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.button !== 0) return;
      startGroupResize(group, e);
    });
  }

  // Ctrl+G：把多选节点打成一个组（允许组内建组、组外建组，互不影响）
  function createGroupFromNodes(selNodes) {
    const group = {
      id: 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: 'Group' + (groupSeq++),
      color: GROUP_COLORS[0],
      nodeIds: selNodes.map(function (n) { return n.id; })
    };
    groups.push(group);
    buildGroupDom(group);
    initGroupBounds(group);
  }

  // 拖动标签：整组节点一起移动（组框整体平移，大小不变，上一级组不受影响）
  function startGroupDrag(group, e) {
    pushUndo();
    const members = nodes.filter(function (n) { return group.nodeIds.indexOf(n.id) >= 0; });

    // ★ 允许空组拖动：组里没有节点时，拖动标签也能移动组框

    const startMX = e.clientX;
    const startMY = e.clientY;
    const starts = members.map(function (n) { return { x: n.x, y: n.y }; });

    // ★ 记录组框 / 标签初始位置（拖动时整体平移）
    const initLeft = group.boxEl ? (parseFloat(group.boxEl.style.left) || 0) : 0;
    const initTop = group.boxEl ? (parseFloat(group.boxEl.style.top) || 0) : 0;
    const labelInitLeft = group.labelEl ? (parseFloat(group.labelEl.style.left) || 0) : 0;
    const labelInitTop = group.labelEl ? (parseFloat(group.labelEl.style.top) || 0) : 0;

    function onMove(ev) {
      const dx = (ev.clientX - startMX) / scale;
      const dy = (ev.clientY - startMY) / scale;
      members.forEach(function (n, i) {
        n.x = Math.round(starts[i].x + dx);
        n.y = Math.round(starts[i].y + dy);
        const el = nodesLayer.querySelector('.c-node[data-id="' + n.id + '"]');
        if (el) {
          el.style.left = n.x + 'px';
          el.style.top = n.y + 'px';
        }
      });
      renderLinks();
      // ★ 组框与标签整体平移（保持大小不变）
      if (group.boxEl) {
        group.boxEl.style.left = (initLeft + dx) + 'px';
        group.boxEl.style.top = (initTop + dy) + 'px';
      }
      if (group.labelEl) {
        group.labelEl.style.left = (labelInitLeft + dx) + 'px';
        group.labelEl.style.top = (labelInitTop + dy) + 'px';
      }
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // ★ 松开后：逐个同步节点归属（拖出某组框的节点自动脱离该组）
      members.forEach(function (n) { syncNodeGroupMembership(n); });
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // 拖动组框右下角手柄：手动调整组框大小（组框为手动定义，不再自动贴合节点）
  function startGroupResize(group, e) {
    const box = group.boxEl;
    if (!box) return;
    const startMX = e.clientX;
    const startMY = e.clientY;
    const startW = parseFloat(box.style.width) || 200;
    const startH = parseFloat(box.style.height) || 200;

    function onMove(ev) {
      const dw = (ev.clientX - startMX) / scale;
      const dh = (ev.clientY - startMY) / scale;
      const newW = Math.max(120, startW + dw);
      const newH = Math.max(80, startH + dh);
      box.style.width = newW + 'px';
      box.style.height = newH + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // 双击组名重命名
  function startGroupRename(group) {
    if (group._editing) return;
    group._editing = true;
    const oldName = group.name;
    const span = group.nameEl;
    const input = document.createElement('input');
    input.className = 'group-rename-input';
    input.value = oldName;
    span.replaceWith(input);
    group.nameEl = input;
    input.focus();
    input.select();

    function done(restore) {
      if (!group._editing) return;
      group._editing = false;
      const val = input.value.trim();
      if (!restore && val) group.name = val;
      const span2 = document.createElement('span');
      span2.className = 'group-name';
      span2.textContent = group.name;
      span2.title = '双击重命名';
      input.replaceWith(span2);
      group.nameEl = span2;
      span2.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        startGroupRename(group);
      });
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); done(false); }
      if (e.key === 'Escape') { done(true); }
    });
    input.addEventListener('blur', function () { done(false); });
    input.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  }

  // 6 色选择面板
  function showGroupColorPicker(group, anchor) {
    if (groupPickerEl) { groupPickerEl.remove(); groupPickerEl = null; }
    const p = document.createElement('div');
    p.className = 'group-color-picker';

    GROUP_COLORS.forEach(function (c) {
      const sw = document.createElement('div');
      sw.className = 'group-color-swatch';
      sw.style.background = c.bg;
      sw.style.borderColor = c.border;
      sw.title = c.name;
      sw.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        group.color = c;
        if (group.boxEl) {
          group.boxEl.style.background = c.bg;
          group.boxEl.style.borderColor = c.border;
        }
        if (anchor) anchor.style.background = c.dot;
        p.remove();
        groupPickerEl = null;
      });
      p.appendChild(sw);
    });

    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect();
    p.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 180)) + 'px';
    p.style.top = (r.bottom + 6) + 'px';
    groupPickerEl = p;

    setTimeout(function () {
      document.addEventListener('mousedown', function handler(ev) {
        if (!p.contains(ev.target)) {
          if (p.parentNode) p.remove();
          groupPickerEl = null;
          document.removeEventListener('mousedown', handler);
        }
      });
    }, 0);
  }

  // ---------- 框选（虚线 + 实时选中） ----------
  function startMarquee(e) {
    if (marqueeState) return;
    const r = container.getBoundingClientRect();
    const start = { x: (e.clientX - r.left - panX) / scale, y: (e.clientY - r.top - panY) / scale };
    marqueeState = { x1: start.x, y1: start.y, el: null };

    // ★ 按当前矩形实时更新选中
    function updateSelection(rect) {
      multiSelected.clear();
      nodes.forEach(function (n) {
        const el = nodesLayer.querySelector('.c-node[data-id="' + n.id + '"]');
        const w = el ? el.offsetWidth : (n.w || 210);
        const h = el ? el.offsetHeight : (n.h || 150);
        const hit = !(n.x + w < rect.x || n.x > rect.x + rect.w || n.y + h < rect.y || n.y > rect.y + rect.h);
        if (hit) multiSelected.add(n.id);
      });
      applyMultiSelection();
    }

    function onMove(ev) {
      if (!marqueeState) return;
      const cur = { x: (ev.clientX - r.left - panX) / scale, y: (ev.clientY - r.top - panY) / scale };
      const x = Math.min(start.x, cur.x);
      const y = Math.min(start.y, cur.y);
      const w = Math.abs(cur.x - start.x);
      const h = Math.abs(cur.y - start.y);
      if (!marqueeState.el) {
        if (w < 4 && h < 4) return; // 防止单击误触
        marqueeState.el = document.createElement('div');
        marqueeState.el.className = 'canvas-marquee';
        world.appendChild(marqueeState.el);
      }
      marqueeState.el.style.left = x + 'px';
      marqueeState.el.style.top = y + 'px';
      marqueeState.el.style.width = w + 'px';
      marqueeState.el.style.height = h + 'px';
      // ★ 拖动过程中即时高亮被框中的节点
      updateSelection({ x: x, y: y, w: w, h: h });
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      if (marqueeState) {
        if (marqueeState.el) {
          const rect = {
            x: parseFloat(marqueeState.el.style.left) || 0,
            y: parseFloat(marqueeState.el.style.top) || 0,
            w: parseFloat(marqueeState.el.style.width) || 0,
            h: parseFloat(marqueeState.el.style.height) || 0
          };
          updateSelection(rect);
          if (marqueeState.el.parentNode) marqueeState.el.parentNode.removeChild(marqueeState.el);
        }
      }
      marqueeState = null;
    }

    // 指针捕获：鼠标拖到窗口外再松开也能收到 pointerup，选区一定会消失
    try { container.setPointerCapture(e.pointerId); } catch (err) {}
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointercancel', onUp);
    // 兼容兜底
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // 空白处按下 → 清空选择并开始框选（用 pointerdown + 指针捕获，保证松手后选区消失）
  container.addEventListener('pointerdown', function (e) {
    if (!canvasActive) return;
    if (e.button !== 0) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest('.c-node, .c-port, .canvas-ctx, .group-box, .group-label, .group-resize, .c-link-del')) return;
    clearMultiSelection();
    startMarquee(e);
  });

  // 点击节点：Ctrl/Shift+点击 = 切换选中；普通点击 = 单选（捕获阶段，先于拖拽逻辑）
  document.addEventListener('mousedown', function (e) {
    if (!canvasActive) return;
    if (e.button !== 0) return;
    const nodeEl = e.target.closest('.c-node');
    if (nodeEl && nodeEl.dataset.id) {
      if (e.ctrlKey || e.shiftKey) {
        if (multiSelected.has(nodeEl.dataset.id)) multiSelected.delete(nodeEl.dataset.id);
        else multiSelected.add(nodeEl.dataset.id);
      } else {
        if (!multiSelected.has(nodeEl.dataset.id)) {
          multiSelected.clear();
          multiSelected.add(nodeEl.dataset.id);
        }
      }

      applyMultiSelection();
    }
  }, true);

  // ---------- 右键/双击/空格弹出的创建菜单，点击空白处取消 ----------
  document.addEventListener('mousedown', function (e) {
    if (ctxMenu.style.display !== 'none' && !ctxMenu.contains(e.target)) {
      ctxMenu.style.display = 'none';
    }
  });

  // ---------- 分组：保存 / 恢复 ----------
  function collectGroupsState() {
    return groups.map(function (g) {
      return {
        name: g.name,
        color: g.color,
        nodeIds: g.nodeIds.slice(),
        left: g.boxEl ? (parseFloat(g.boxEl.style.left) || 0) : 0,
        top: g.boxEl ? (parseFloat(g.boxEl.style.top) || 0) : 0,
        width: g.boxEl ? (parseFloat(g.boxEl.style.width) || 200) : 200,
        height: g.boxEl ? (parseFloat(g.boxEl.style.height) || 200) : 200,
        labelLeft: g.labelEl ? (parseFloat(g.labelEl.style.left) || 0) : 0,
        labelTop: g.labelEl ? (parseFloat(g.labelEl.style.top) || 0) : 0
      };
    });
  }

  function restoreCanvasGroups(list) {
    groups = [];
    if (!Array.isArray(list)) return;
    let maxN = 0;
    list.forEach(function (g) {
      const m = /Group(\d+)/.exec(g.name || '');
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10) || 0);
    });
    groupSeq = maxN + 1;

    list.forEach(function (g) {
      const grp = {
        id: 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: g.name || 'Group',
        color: g.color || GROUP_COLORS[0],
        nodeIds: Array.isArray(g.nodeIds) ? g.nodeIds : []
      };
      groups.push(grp);
      buildGroupDom(grp);
      if (g.left !== undefined && grp.boxEl) {
        grp.boxEl.style.left = g.left + 'px';
        grp.boxEl.style.top = g.top + 'px';
        grp.boxEl.style.width = (g.width || 200) + 'px';
        grp.boxEl.style.height = (g.height || 200) + 'px';
        grp.labelEl.style.left = (g.labelLeft !== undefined ? g.labelLeft : g.left + 8) + 'px';
        grp.labelEl.style.top = (g.labelTop !== undefined ? g.labelTop : g.top - 15) + 'px';
      } else {
        initGroupBounds(grp);
      }
    });
    refreshAllGroupBounds();
  }

  // ---------- 初始化：恢复上次布局或创建演示节点 ----------
  if (!loadCanvasState()) {
    const firstId = 'board_' + Date.now();
    boards = [{ id: firstId, name: '画布 1' }];
    activeBoardId = firstId;
    saveBoardIndex();
    addNode('text', 150, 100);
    addNode('preset', 150, 280);
    addNode('output', 620, 160);
    saveCanvasState();
  }
  refreshBoardSelect();
  applyWorldTransform();
  renderAll();
  if (lastLoadedState && lastLoadedState.groups) restoreCanvasGroups(lastLoadedState.groups);
  const boardBar = document.querySelector('.canvas-board-bar');
  if (boardBar) {
    boardBar.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    boardBar.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  }
  const boardSel = document.getElementById('canvasBoardSelect');
  if (boardSel) boardSel.addEventListener('change', function () { switchBoard(this.value); });

  const renameBtn = document.getElementById('canvasBoardRenameBtn');
  if (renameBtn) renameBtn.addEventListener('click', openBoardRename);
  const newBtn = document.getElementById('canvasBoardNewBtn');
  if (newBtn) newBtn.addEventListener('click', newBoard);

  const renameConfirm = document.getElementById('canvasBoardRenameConfirm');
  if (renameConfirm) renameConfirm.addEventListener('click', function () {
    const input = document.getElementById('canvasBoardRenameInput');
    if (input) renameActiveBoard(input.value);
    const overlay = document.getElementById('canvasBoardRenameOverlay');
    if (overlay) overlay.style.display = 'none';
  });
  const renameCancel = document.getElementById('canvasBoardRenameCancel');
  if (renameCancel) renameCancel.addEventListener('click', function () {
    const overlay = document.getElementById('canvasBoardRenameOverlay');
    if (overlay) overlay.style.display = 'none';
  });
  const renameInputEl = document.getElementById('canvasBoardRenameInput');
  if (renameInputEl) renameInputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      renameActiveBoard(this.value);
      const overlay = document.getElementById('canvasBoardRenameOverlay');
      if (overlay) overlay.style.display = 'none';
    }
    if (e.key === 'Escape') {
      const overlay = document.getElementById('canvasBoardRenameOverlay');
      if (overlay) overlay.style.display = 'none';
    }
  });

  // ★ 关闭窗口前保存布局
  window.addEventListener('beforeunload', saveCanvasState);
})();
