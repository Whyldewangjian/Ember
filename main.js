const { app, BrowserWindow, ipcMain, screen, dialog, Menu, shell } = require('electron');

const path = require('path');
const fs = require('fs');
const browserModule = require('./js/browser-window');
const updateModule = require('./js/update-check');

let mainWin = null;
let userPinned = false;   // 用户手动置顶状态
let inputActive = false;  // 输入框是否聚焦（聚焦时禁止自动缩回标签）

// ======================== 右侧吸附（贴边小标签） ========================
const DOCK = {
  enabled: false,       // 是否处于贴边模式
  expanded: false,      // 是否展开
  normalBounds: null,   // 正常时的窗口位置
  tabW: 60,             // 标签宽度（px）——与 CSS .dock-tab width 保持一致
  animating: false,     // 是否正在播放动画
  animTimer: null,
  hideTimer: null,
  mainTimer: null
};

// ======================== ★ 通用窗口动画（时间驱动，掉帧不卡） ========================
function animateWindowTo(targetX, targetY, targetW, targetH, duration, onDone) {
  if (!mainWin || mainWin.isDestroyed()) return;
  if (DOCK.animTimer) { clearInterval(DOCK.animTimer); DOCK.animTimer = null; }

  const start = mainWin.getBounds();
  const dx = targetX - start.x;
  const dy = targetY - start.y;
  const dw = targetW - start.width;
  const dh = targetH - start.height;
  const startTime = Date.now();

  DOCK.animating = true;

  DOCK.animTimer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / duration);

    // easeInOutCubic：两头慢中间快，最柔和
    const ease = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    mainWin.setBounds({
      x: Math.round(start.x + dx * ease),
      y: Math.round(start.y + dy * ease),
      width: Math.round(start.width + dw * ease),
      height: Math.round(start.height + dh * ease)
    });

    if (t >= 1) {
      clearInterval(DOCK.animTimer);
      DOCK.animTimer = null;
      DOCK.animating = false;
      if (onDone) onDone();
    }
  }, 16);
}

function notifyRenderer() {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('dock-state-changed', {
      enabled: DOCK.enabled,
      expanded: DOCK.expanded,
      pinned: userPinned
    });
  }
}

// 应用贴边/展开位置（★ 带平滑动画）
function applyDockBounds(expanded) {
  const wa = screen.getPrimaryDisplay().workArea;
  const nb = DOCK.normalBounds;
  if (!nb) return;

  // 只有用户没手动置顶时，才按 dock 状态自动置顶/取消
  mainWin.setAlwaysOnTop(userPinned || !expanded);

  const targetX = expanded
    ? wa.x + wa.width - nb.width
    : wa.x + wa.width - DOCK.tabW;

  // 展开 280ms，缩回 220ms
  animateWindowTo(targetX, nb.y, nb.width, nb.height, expanded ? 280 : 220);
}

function clearHideTimer() {
  if (DOCK.hideTimer) { clearTimeout(DOCK.hideTimer); DOCK.hideTimer = null; }
}

// 鼠标离开后延迟缩回（正在输入时禁止缩回）
function startHideTimer() {
  if (DOCK.hideTimer) return;
  if (inputActive) return;
  DOCK.hideTimer = setTimeout(() => {
    DOCK.hideTimer = null;
    if (inputActive) return;
    if (DOCK.enabled && DOCK.expanded) {
      DOCK.expanded = false;
      applyDockBounds(false);
      notifyRenderer();
    }
  }, 1000);
}

function disableDock() {
  if (!DOCK.enabled) return;
  DOCK.enabled = false;
  DOCK.expanded = false;
  if (DOCK.animTimer) { clearInterval(DOCK.animTimer); DOCK.animTimer = null; }
  DOCK.animating = false;
  mainWin.setAlwaysOnTop(userPinned);
  clearHideTimer();
  notifyRenderer();
}

// ======================== 吸附：平滑移动到右侧变标签 ========================
function animateDockToTab() {
  if (!mainWin || mainWin.isDestroyed()) return;
  if (DOCK.enabled) disableDock();

  const wa = screen.getPrimaryDisplay().workArea;
  const b = mainWin.getBounds();
  const targetX = wa.x + wa.width - DOCK.tabW;

  DOCK.normalBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
  DOCK.enabled = true;
  DOCK.expanded = false;

  // 吸附动画 350ms
  animateWindowTo(targetX, b.y, b.width, b.height, 350, () => {
    mainWin.setAlwaysOnTop(true);
    notifyRenderer();
  });
}

// ======================== 核心：每 300ms 检查窗口位置 + 鼠标位置 ========================
function dockTick() {
  if (!mainWin || mainWin.isDestroyed()) return;
  if (DOCK.animating) return; // 动画期间不处理，避免干扰

  const wa = screen.getPrimaryDisplay().workArea;
  const b = mainWin.getBounds();
  const rightGap = wa.x + wa.width - (b.x + b.width);

  // 贴边状态：用户把窗口拖走（离开贴边区域）→ 解除贴边
  if (DOCK.enabled && rightGap > DOCK.tabW + 40) {
    disableDock();
    return;
  }

  if (!DOCK.enabled) return;

  // 处理鼠标悬停展开 / 移开缩回
  const cursor = screen.getCursorScreenPoint();
  const inside = cursor.x >= b.x && cursor.x <= b.x + b.width &&
                 cursor.y >= b.y && cursor.y <= b.y + b.height;

  if (inside) {
    if (!DOCK.expanded) {
      DOCK.expanded = true;
      applyDockBounds(true);
      notifyRenderer();
    }
    clearHideTimer();
  } else {
    if (DOCK.expanded) startHideTimer();
  }
}

function startMainTimer() {
  if (DOCK.mainTimer) return;
  DOCK.mainTimer = setInterval(dockTick, 300);
}

// ======================== IPC ========================
ipcMain.handle('load-folder-bg', async () => getFolderBgDataUrl());

ipcMain.handle('set-always-on-top', async (event, flag) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    userPinned = !!flag;
    win.setAlwaysOnTop(userPinned);
    console.log('[置顶] 当前状态：', userPinned ? '已置顶' : '已取消');
  }
  return true;
});

ipcMain.handle('set-input-active', (event, active) => {
  inputActive = !!active;
  if (inputActive && DOCK.hideTimer) {
    clearTimeout(DOCK.hideTimer);
    DOCK.hideTimer = null;
  }
  return true;
});

ipcMain.handle('win-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
  return true;
});

ipcMain.handle('win-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
  return true;
});

// ★ 点叉子：直接关闭（确认弹窗由 App 内部实现）
ipcMain.handle('win-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
  return true;
});


ipcMain.handle('dock-enable', () => {
  animateDockToTab();
  return true;
});
// ★ 导出文件：主进程弹保存框 + 写入
ipcMain.handle('save-file-dialog', async (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return await dialog.showSaveDialog(win, options || {});
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    require('fs').writeFileSync(filePath, content, 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

// ★ 读取更新日志


ipcMain.handle('read-changelog', async () => {
  try {
    const p = path.join(__dirname, 'changelog.txt');
    return fs.readFileSync(p, 'utf-8');
  } catch (e) {
    return '（未找到 changelog.txt，请在项目根目录创建）';
  }
});

// 根据文件头判断图片类型（不依赖扩展名）
function detectImageMime(buf) {
  if (!buf || buf.length < 4) {
    const str = buf ? buf.toString('utf-8', 0, 200) : '';
    if (str.trimStart().toLowerCase().startsWith('<svg')) return 'image/svg+xml';
    return 'image/png';
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf[0] === 0x42 && buf[1] === 0x4D) return 'image/bmp';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.toString('ascii', 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (brand === 'heic' || brand === 'heix') return 'image/heic';
  }
  const str = buf.toString('utf-8', 0, 200);
  if (str.trimStart().toLowerCase().startsWith('<svg')) return 'image/svg+xml';
  return 'image/png';
}

// 读取 image 文件夹里的 background 图片
function getFolderBgDataUrl() {
  const folder = path.join(__dirname, 'image');
  try {
    const files = fs.readdirSync(folder);
    const bgFile = files.find(f => {
      const lower = f.toLowerCase();
      const dotIndex = lower.lastIndexOf('.');
      const name = dotIndex > 0 ? lower.slice(0, dotIndex) : lower;
      return name === 'background';
    });
    if (!bgFile) return null;
    const buf = fs.readFileSync(path.join(folder, bgFile));
    const mime = detectImageMime(buf);
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    return null;
  }
}

function createWindow() {
  // ★ 窗口最小尺寸：按布局需要取 1060 × 880，
  //   但永不超过当前屏幕的可用区域（换到小屏也能正常开窗）
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const MIN_W = Math.min(1060, wa.width);
  const MIN_H = Math.min(960, wa.height);

  mainWin = new BrowserWindow({
    width: Math.max(1200, MIN_W),
    height: Math.max(880, MIN_H),
    minWidth: MIN_W,
    minHeight: MIN_H,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    frame: false,
    resizable: true,
    roundedCorners: true,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });


  // ★ 不再拦截关闭/最小化：叉子由 win-close IPC 弹确认框，最小化正常缩到任务栏

  mainWin.on('closed', () => {
    if (DOCK.mainTimer) clearInterval(DOCK.mainTimer);
    if (DOCK.animTimer) clearInterval(DOCK.animTimer);
    DOCK.mainTimer = null;
    DOCK.animTimer = null;
    mainWin = null;
  });

  mainWin.loadFile(path.join(__dirname, 'index.html'));
  startMainTimer();
    // ★ F12 打开开发者工具（调试用）
    mainWin.webContents.on('before-input-event', function (event, input) {
      if (input.type === 'keyDown' && input.key === 'F12') {
        mainWin.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  
}
// ======================== ★ 全局右键菜单（编辑：复制 / 粘贴 / 剪切 / 全选） ========================
app.on('web-contents-created', function (e, contents) {
  contents.on('context-menu', function (event, params) {
    // ★ 图片交给「画布自己」的右键菜单处理，避免弹出两个菜单
    if (params.mediaType === 'image') return;
    if (!params.isEditable && !(params.selectionText && params.selectionText.trim().length) && !params.linkURL) return;


    const hasSel = !!(params.selectionText && params.selectionText.trim().length);
    const template = [];

    if (params.isEditable) {
      template.push(
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'pasteAndMatchStyle', label: '粘贴为纯文本' },
        { role: 'selectAll', label: '全选' }
      );
    } else if (hasSel) {
      template.push(
        { role: 'copy', label: '复制' },
        { role: 'selectAll', label: '全选' }
      );
    } else {
      template.push({ role: 'selectAll', label: '全选' });
    }

    if (params.linkURL) {
      template.unshift({ label: '在浏览器中打开链接', click: function () { shell.openExternal(params.linkURL); } });
    }

    if (!template.length) return;
    Menu.buildFromTemplate(template).popup({
      window: BrowserWindow.fromWebContents(contents) || undefined
    });
  });
});


app.whenReady().then(() => {
  createWindow();
  browserModule.registerBrowserIPC();
  browserModule.setupDownloadManager();
  updateModule.registerUpdateIPC();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
// ★ 创建文件夹
ipcMain.handle('ensure-dir', async (event, dir) => {
  try {
    require('fs').mkdirSync(dir, { recursive: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

// ★ 写二进制文件（图片）
ipcMain.handle('write-binary-file', async (event, filePath, dataUrl) => {
  try {
    const b64 = String(dataUrl).replace(/^data:[^;]+;base64,/, '');
    require('fs').writeFileSync(filePath, Buffer.from(b64, 'base64'));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

// ======================== ★ Agent · 工作文件夹文件操作 ========================
let agentRoots = [];

function agentNorm(p) {
  try { return path.resolve(String(p || '')); } catch (e) { return ''; }
}
function agentInside(p) {
  const np = agentNorm(p);
  if (!np || !agentRoots.length) return false;
  return agentRoots.some(function (r) {
    const nr = agentNorm(r);
    return np === nr || np.startsWith(nr + path.sep);
  });
}
function agentRelOf(abs) {
  const np = agentNorm(abs);
  for (let i = 0; i < agentRoots.length; i++) {
    const nr = agentNorm(agentRoots[i]);
    if (np === nr) return path.basename(np) || np;
    if (np.startsWith(nr + path.sep)) return np.slice(nr.length + 1);
  }
  return np;
}
const AGENT_SKIP = ['node_modules', '.git', '.svn', '.hg', '.cache', '__pycache__'];
const AGENT_MAX_FILES = 6000;
const AGENT_READ_MAX = 512 * 1024;

function agentScan(dir, out, counter) {
  if (!fs.existsSync(dir)) return;
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (let i = 0; i < list.length; i++) {
    if (counter.n >= AGENT_MAX_FILES) return;
    const en = list[i];
    const abs = path.join(dir, en.name);
    if (en.isDirectory()) {
      if (AGENT_SKIP.indexOf(en.name) >= 0) continue;
      out.push({ abs: abs, rel: agentRelOf(abs), type: 'dir', size: 0 });
      agentScan(abs, out, counter);
    } else if (en.isFile()) {
      let size = 0;
      try { size = fs.statSync(abs).size; } catch (e) {}
      out.push({ abs: abs, rel: agentRelOf(abs), type: 'file', size: size });
      counter.n++;
    }
  }
}

// ★ 实时监听工作文件夹变化（去抖后通知渲染层刷新文件树）
let agentWatchers = [];
function agentDebounce(fn, ms) {
  let t = null;
  return function () { if (t) clearTimeout(t); t = setTimeout(fn, ms); };
}
function watchAgentRoots(win) {
  agentWatchers.forEach(function (w) { try { w.close(); } catch (e) {} });
  agentWatchers = [];
  const emit = agentDebounce(function () {
    if (win && !win.isDestroyed()) { try { win.webContents.send('agent-fs-changed'); } catch (e) {} }
  }, 400);
  agentRoots.forEach(function (r) {
    try { if (fs.existsSync(r)) agentWatchers.push(fs.watch(r, { recursive: true }, emit)); } catch (e) {}
  });
}

ipcMain.handle('agent-pick-folders', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || null;
    const r = await dialog.showOpenDialog(win, {
      title: '选择工作文件夹（可多选）',
      properties: ['openDirectory', 'multiSelections']
    });
    if (r.canceled || !r.filePaths || !r.filePaths.length) return { ok: false, canceled: true };
    return { ok: true, folders: r.filePaths.map(function (p) { return { path: p, name: path.basename(p) || p }; }) };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

ipcMain.handle('agent-set-roots', async (event, roots) => {
  try {
    agentRoots = (Array.isArray(roots) ? roots : []).map(agentNorm).filter(function (x) { return !!x; });
    watchAgentRoots(BrowserWindow.fromWebContents(event.sender));   // ★ 建立/重建目录监听
    return { ok: true, count: agentRoots.length };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

ipcMain.handle('agent-list', async () => {
  try {
    const out = [];
    const counter = { n: 0 };
    agentRoots.forEach(function (r) {
      const nr = agentNorm(r);
      out.push({ abs: nr, rel: path.basename(nr) || nr, type: 'root', size: 0 });
      agentScan(nr, out, counter);
    });
    return { ok: true, entries: out, truncated: counter.n >= AGENT_MAX_FILES };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

ipcMain.handle('agent-read-file', async (event, p) => {
  try {
    const np = agentNorm(p);
    if (!agentInside(np)) return { ok: false, error: '路径不在工作文件夹内' };
    if (!fs.existsSync(np)) return { ok: false, error: '文件不存在' };
    const st = fs.statSync(np);
    if (st.isDirectory()) return { ok: false, error: '这是一个文件夹' };
    const buf = fs.readFileSync(np);
    let binary = false;
    const head = buf.slice(0, 8000);
    for (let i = 0; i < head.length; i++) { if (head[i] === 0) { binary = true; break; } }
    if (binary) return { ok: true, binary: true, size: st.size, content: '' };
    let content = buf.toString('utf-8');
    let truncated = false;
    if (content.length > AGENT_READ_MAX) { content = content.slice(0, AGENT_READ_MAX); truncated = true; }
    return { ok: true, binary: false, size: st.size, content: content, truncated: truncated };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

ipcMain.handle('agent-write-file', async (event, p, content) => {
  try {
    const np = agentNorm(p);
    if (!agentInside(np)) return { ok: false, error: '路径不在工作文件夹内' };
    const sub = path.dirname(np);
    if (!fs.existsSync(sub)) fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(np, String(content || ''), 'utf-8');
    return { ok: true, path: np };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

ipcMain.handle('agent-create-file', async (event, p, content) => {
  try {
    const np = agentNorm(p);
    if (!agentInside(np)) return { ok: false, error: '路径不在工作文件夹内' };
    if (fs.existsSync(np)) return { ok: false, error: '文件已存在' };
    const sub = path.dirname(np);
    if (!fs.existsSync(sub)) fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(np, String(content || ''), 'utf-8');
    return { ok: true, path: np };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

ipcMain.handle('agent-create-dir', async (event, p) => {
  try {
    const np = agentNorm(p);
    if (!agentInside(np)) return { ok: false, error: '路径不在工作文件夹内' };
    fs.mkdirSync(np, { recursive: true });
    return { ok: true, path: np };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

ipcMain.handle('agent-delete', async (event, p) => {
  try {
    const np = agentNorm(p);
    if (!agentInside(np)) return { ok: false, error: '路径不在工作文件夹内' };
    if (!fs.existsSync(np)) return { ok: false, error: '目标不存在' };
    const st = fs.statSync(np);
    if (st.isDirectory()) fs.rmSync(np, { recursive: true, force: true });
    else fs.unlinkSync(np);
    return { ok: true, path: np };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

ipcMain.handle('agent-rename', async (event, from, to) => {
  try {
    const nf = agentNorm(from);
    const nt = agentNorm(to);
    if (!agentInside(nf)) return { ok: false, error: '原路径不在工作文件夹内' };
    if (!agentInside(nt)) return { ok: false, error: '目标路径不在工作文件夹内' };
    if (!fs.existsSync(nf)) return { ok: false, error: '原文件不存在' };
    const sub = path.dirname(nt);
    if (!fs.existsSync(sub)) fs.mkdirSync(sub, { recursive: true });
    fs.renameSync(nf, nt);
    return { ok: true, from: nf, to: nt };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

ipcMain.handle('agent-grep', async (event, payload) => {
  try {
    const p = payload || {};
    const pattern = String(p.pattern || '');
    if (!pattern) return { ok: true, matches: [] };
    let re;
    try { re = new RegExp(pattern, 'i'); } catch (e) { return { ok: false, error: '正则无效：' + e.message }; }
    const base = p.path ? agentNorm(p.path) : '';
    const matches = [];
    function walk(dir) {
      if (matches.length >= 300) return;
      if (!fs.existsSync(dir)) return;
      let list;
      try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      for (let i = 0; i < list.length; i++) {
        if (matches.length >= 300) return;
        const en = list[i];
        const abs = path.join(dir, en.name);
        if (en.isDirectory()) { if (AGENT_SKIP.indexOf(en.name) < 0) walk(abs); }
        else if (en.isFile()) {
          let text;
          try {
            const b = fs.readFileSync(abs);
            if (b.indexOf(0) >= 0) return;
            text = b.toString('utf-8');
          } catch (e) { return; }
          const lines = text.split('\n');
          for (let k = 0; k < lines.length; k++) {
            if (matches.length >= 300) return;
            if (re.test(lines[k])) {
              matches.push({ abs: abs, rel: agentRelOf(abs), line: k + 1, text: lines[k].slice(0, 300) });
            }
          }
        }
      }
    }
    if (base && agentInside(base)) walk(base);
    else agentRoots.forEach(walk);
    return { ok: true, matches: matches };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

// ★ 在资源管理器中打开文件夹 / 定位文件（原始方法：shell.openPath / showItemInFolder）
ipcMain.handle('agent-open-path', async (event, p) => {
  try {
    const np = agentNorm(p);
    if (!np || !fs.existsSync(np)) return { ok: false, error: '路径不存在' };
    const st = fs.statSync(np);
    if (st.isDirectory()) {
      const err = await shell.openPath(np);
      if (err) return { ok: false, error: err };
    } else {
      shell.showItemInFolder(np);
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});




/* ============================================================
   APP 工坊 · 「打包为应用」功能（整块粘到 main.js 末尾即可）
   ============================================================ */
   (function () {
    const electron = require('electron');
    const ipcMain = electron.ipcMain;
    const dialog = electron.dialog;
    const shell = electron.shell;
    const BrowserWindow = electron.BrowserWindow;
    const fs = require('fs');
    const path = require('path');
  
    // ---------- 内置壳模板 ----------
    const SHELL_MAIN = `const { app, BrowserWindow, ipcMain } = require('electron');
  const path = require('path');
  
  let win = null;
  
  function createWindow() {
    win = new BrowserWindow({
      width: 1280,
      height: 860,
      minWidth: 640,
      minHeight: 480,
      frame: false,              // ★ 无边框
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
    win.on('maximize',   function () { win.webContents.send('win-state', { maximized: true }); });
    win.on('unmaximize', function () { win.webContents.send('win-state', { maximized: false }); });
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
    close:     function () { ipcRenderer.send('win-close'); },
    onState:   function (cb) { ipcRenderer.on('win-state', function (e, s) { cb(s); }); }
  });
  `;
  
    const SHELL_PKG = '{\n  "name": "app",\n  "version": "1.0.0",\n  "main": "main.js"\n}\n';
  
    // ---------- 注入到作品 HTML 里的无边框标题栏 ----------
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
  
    function injectChrome(html) {
      if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, CHROME_STYLE + '\n</head>');
      else html = CHROME_STYLE + html;
      if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, CHROME_HTML + CHROME_JS + '\n</body>');
      else html = html + CHROME_HTML + CHROME_JS;
      return html;
    }
  
    // ---------- 工具 ----------
    function copyDir(src, dest, skip, onTick) {
      fs.mkdirSync(dest, { recursive: true });
      const list = fs.readdirSync(src, { withFileTypes: true });
      for (const ent of list) {
        if (skip && skip.indexOf(ent.name) >= 0) continue;
        // ★ 跳过所有 .asar / .asar.unpacked：Electron 会把带 .asar 的路径当成压缩包去读，
        //   复制它会抛 "ENOENT, not found in ..."（默认外壳 default_app.asar 就属于这种）
        if (/\.asar$/i.test(ent.name) || /\.asar\.unpacked$/i.test(ent.name)) continue;
        const s = path.join(src, ent.name);
        const d = path.join(dest, ent.name);
        if (ent.isDirectory()) copyDir(s, d, skip, onTick);
        else { fs.copyFileSync(s, d); if (onTick) onTick(); }
      }
    }

  
    function readmeText(name, portable) {
      return [
        name + '  —— 使用说明',
        '',
        portable
          ? '本文件夹是一个完整绿色应用：直接双击 ' + name + '.exe 即可运行，无需安装任何东西。'
          : '本文件夹里是应用外壳（main.js / preload.js / package.json / app.html）。',
        '',
        '窗口是无边框的：拖动顶部 28px 区域可移动窗口，右上角三个按钮是最小化 / 最大化 / 关闭。',
        '',
        portable ? '' : '运行方式（需要本机有 Node.js）：',
        portable ? '' : '  1) 在本文件夹执行：npm install electron',
        portable ? '' : '  2) 再执行：npx electron .',
        '',
        '想做成单文件 exe，可在本文件夹执行：npx electron-builder --win portable',
        '（首次需要联网下载，约 200MB）'
      ].join('\r\n');
    }
  
    // ---------- IPC：打包 ----------
    ipcMain.handle('ws-make-app', async function (event, payload) {
      try {
        const p = payload || {};
        const raw = String(p.html || '');
        if (!raw.trim()) return { ok: false, error: '没有可打包的代码，请先生成' };
  
        const name = String(p.name || '我的应用').replace(/[\\/:*?"<>|]/g, '_').trim() || '我的应用';
        const portable = !!p.portable;
        const notify = function (msg) { try { event.sender.send('ws-pack-progress', msg); } catch (e) {} };
  
        const owner = BrowserWindow.fromWebContents(event.sender) || null;
        const picked = await dialog.showOpenDialog(owner, {
          title: '选择输出位置（将在这里新建「' + name + '」文件夹）',
          properties: ['openDirectory', 'createDirectory']
        });
        if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true };
  
        const target = path.join(picked.filePaths[0], name);
        const files = { 'main.js': SHELL_MAIN, 'preload.js': SHELL_PRELOAD, 'package.json': SHELL_PKG };
  
        fs.mkdirSync(target, { recursive: true });
  
        // 1) 作品 HTML（默认注入无边框标题栏）
        const html = (p.frameless === false) ? raw : injectChrome(raw);
        notify('写入 app.html ...');
        fs.writeFileSync(path.join(target, 'app.html'), html, 'utf8');
  
        // 2) 轻量模式：只给壳文件
        if (!portable) {
          const shellDir = path.join(target, 'electron-shell');
          fs.mkdirSync(shellDir, { recursive: true });
          Object.keys(files).forEach(function (k) { fs.writeFileSync(path.join(shellDir, k), files[k], 'utf8'); });
          fs.writeFileSync(path.join(shellDir, '使用说明.txt'), readmeText(name, false), 'utf8');
          return { ok: true, portable: false, dir: target, exe: '' };
        }
  
        // 3) 重量模式：复制 Ember 自带的 Electron 运行时
        const srcRoot = path.dirname(process.execPath);
        if (!fs.existsSync(path.join(srcRoot, 'resources'))) {
          return { ok: false, error: '取不到 Electron 运行时，请用安装版（NSIS）运行 Ember 后再打包' };
        }
        notify('复制运行时（约 200~300MB，请耐心等待）...');
        let n = 0;
        copyDir(srcRoot, target, ['app.asar', 'app.asar.unpacked', 'app'], function () {
          n++;
          if (n % 300 === 0) notify('复制运行时... 已复制 ' + n + ' 个文件');
        });
  
        // 4) 换上我们自己的 app 目录
        const appDir = path.join(target, 'resources', 'app');
        fs.mkdirSync(appDir, { recursive: true });
        Object.keys(files).forEach(function (k) { fs.writeFileSync(path.join(appDir, k), files[k], 'utf8'); });
  
        // 5) exe 改名
        let exePath = '';
        const oldExe = path.join(target, path.basename(process.execPath));
        const newExe = path.join(target, name + '.exe');
        try {
          if (fs.existsSync(oldExe)) { fs.renameSync(oldExe, newExe); exePath = newExe; }
          else exePath = oldExe;
        } catch (e) { exePath = oldExe; }
  
        fs.writeFileSync(path.join(target, '使用说明.txt'), readmeText(name, true), 'utf8');
        notify('完成');
        return { ok: true, portable: true, dir: target, exe: exePath };
      } catch (err) {
        return { ok: false, error: (err && err.message) ? err.message : String(err) };
      }
    });
  
    // ---------- IPC：打开产物位置 ----------
    ipcMain.handle('ws-open-path', async function (event, p) {
      try {
        if (!p || !fs.existsSync(p)) return { ok: false };
        if (fs.statSync(p).isDirectory()) shell.openPath(p);
        else shell.showItemInFolder(p);
        return { ok: true };
      } catch (e) { return { ok: false }; }
    });

  })();

  
