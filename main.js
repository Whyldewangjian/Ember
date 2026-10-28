const { app, BrowserWindow, ipcMain, screen, dialog, Menu, shell } = require('electron');

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const docParse = require('./js/doc-parse');
const docBuild = require('./js/doc-build');
const browserModule = require('./js/browser-window');
const updateModule = require('./js/update-check');
const githubAuthModule = require('./js/github-auth');
const pageCheckModule = require('./js/page-check');
const agentShellModule = require('./js/agent-shell');

let mainWin = null;

// ======================== ★ 单实例锁（只对打包后的正式版生效） ========================
// 为什么需要：
//   两个 Ember 同时跑会抢同一个 Chromium 用户数据目录（Local Storage\leveldb），
//   后启动的那个拿不到数据库锁 → 界面全空 → 用户以为"数据丢了"。
//   所以正式版只允许一个实例：第二次双击不新开窗口，而是把已有窗口唤到最前。
//   开发版（npm start）不加锁，方便同时开几个对比测试。
const SINGLE_INSTANCE_OK = app.isPackaged ? app.requestSingleInstanceLock() : true;
if (!SINGLE_INSTANCE_OK) {
  app.quit();
} else {
  app.on('second-instance', function () {
    if (!mainWin || mainWin.isDestroyed()) return;
    try { if (mainWin.isMinimized()) mainWin.restore(); } catch (e) {}
    try { mainWin.show(); } catch (e) {}
    try { mainWin.focus(); } catch (e) {}
  });
}
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
  // ★ 原来的 Math.min(960, ...) 让最小高度达到 960px，
  //   在 1080p 屏上可用高度约 1040 → 几乎拖不动高度。
  //   改成 620，既保证排版不塌，又能自由拉高。
  const MIN_H = Math.min(620, wa.height);

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
      contextIsolation: false,
      // ★ 正式版彻底禁用开发者工具（开发时仍可用，方便调试）
      devTools: !app.isPackaged
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

  // ★ 开发者工具：只在【开发时】可用，打包后的正式版彻底关掉
  //   （正式版能开 F12 等于把源码和内部逻辑敞开给任何人看）
  if (app.isPackaged) {
    mainWin.webContents.on('before-input-event', function (event, input) {
      const k = input.key || '';
      // F12 / Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+U（查看源码）
      const isDevKey = (input.type === 'keyDown') && (
        k === 'F12'
        || (input.control && input.shift && /^[iIjJcC]$/.test(k))
        || (input.control && /^[uU]$/.test(k))
      );
      if (isDevKey) {
        event.preventDefault();
        return;
      }
    });
    // 关掉菜单里可能残留的开发者工具项
    mainWin.webContents.on('devtools-opened', function () {
      try { mainWin.webContents.closeDevTools(); } catch (e) {}
    });
  } else {
    // 开发时保留 F12，方便调试
    mainWin.webContents.on('before-input-event', function (event, input) {
      if (input.type === 'keyDown' && input.key === 'F12') {
        mainWin.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }

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
  // ★ 没拿到单实例锁（已有实例在跑）→ 什么都不做，让进程安静退出
  if (!SINGLE_INSTANCE_OK) return;
  createWindow();
  browserModule.registerBrowserIPC();
  browserModule.setupDownloadManager();
  updateModule.registerUpdateIPC();
  githubAuthModule.registerGithubAuthIPC();
  pageCheckModule.registerPageCheckIPC();   // ★ 让 Agent 能"看到"网页跑起来的结果
  agentShellModule.registerShellIPC();      // ★ 给 Agent 一个常驻 PowerShell（装依赖/构建/看长日志）
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

// ★ 扫描资产：<工作文件夹>/assets/<类型>/<名字>/meta.json
//   返回给渲染进程做 @ 列表，以及系统提示里的资产索引。
ipcMain.handle('agent-scan-assets', async () => {
  try {
    const out = [];
    agentRoots.forEach(function (r) {
      const root = agentNorm(r);
      const assetsDir = path.join(root, 'assets');
      if (!fs.existsSync(assetsDir)) return;
      let types = [];
      try { types = fs.readdirSync(assetsDir, { withFileTypes: true }); } catch (e) { return; }
      types.forEach(function (t) {
        if (!t.isDirectory()) return;
        const typeDir = path.join(assetsDir, t.name);
        let items = [];
        try { items = fs.readdirSync(typeDir, { withFileTypes: true }); } catch (e) { return; }
        items.forEach(function (it) {
          if (!it.isDirectory()) return;
          const dir = path.join(typeDir, it.name);
          const metaPath = path.join(dir, 'meta.json');
          if (!fs.existsSync(metaPath)) return;
          let meta = {};
          try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (e) { meta = {}; }
          const previewPath = path.join(dir, 'preview.html');
          out.push({
            id: meta.id || (t.name.replace(/s$/, '') + '.' + it.name),
            name: meta.name || it.name,
            type: meta.type || t.name.replace(/s$/, ''),
            dir: dir,
            metaPath: metaPath,
            preview: fs.existsSync(previewPath) ? previewPath : '',
            frameSize: Array.isArray(meta.frameSize) ? meta.frameSize : null,
            hasSpriteJs: fs.existsSync(path.join(dir, 'sprite.js'))
          });
        });
      });
    });
    return { ok: true, assets: out };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

ipcMain.handle('agent-read-file', async (event, p) => {
  try {
    const np = agentNorm(p);
    if (!agentInside(np)) return { ok: false, error: '路径不在工作文件夹内' };
    if (!fs.existsSync(np)) return { ok: false, error: '文件不存在' };
    const st = fs.statSync(np);
    if (st.isDirectory()) return { ok: false, error: '这是一个文件夹' };
    const buf = fs.readFileSync(np);

    // ★ Office 文档（docx/xlsx/pptx）本质是 ZIP，会被下面的"二进制检测"挡掉。
    //   这里先尝试提取纯文本，成功就把文字交给模型（Agent 就能读文档并总结了）。
    const ext = path.extname(np).slice(1).toLowerCase();
    if (docParse.isSupported(ext)) {
      const text = docParse.extractText(buf, ext);
      if (text != null && String(text).trim() !== '') {
        const label = ext === 'docx' ? 'Word 文档'
          : ext === 'xlsx' ? 'Excel 表格'
          : 'PowerPoint 演示文稿';
        let content = '【' + label + '：' + path.basename(np) + '】\n\n' + text;
        let truncated = false;
        if (content.length > AGENT_READ_MAX) { content = content.slice(0, AGENT_READ_MAX); truncated = true; }
        return {
          ok: true, binary: false, size: st.size,
          content: content, truncated: truncated, docType: ext
        };
      }
      // 解析失败就继续走原来的二进制/文本判断
    }

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

ipcMain.handle('agent-append-file', async (event, p, content) => {
  try {
    const np = agentNorm(p);
    if (!agentInside(np)) return { ok: false, error: '路径不在工作文件夹内' };
    const sub = path.dirname(np);
    if (!fs.existsSync(sub)) fs.mkdirSync(sub, { recursive: true });
    fs.appendFileSync(np, String(content == null ? '' : content), 'utf-8');
    return { ok: true, path: np, size: fs.statSync(np).size };
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

// ★ 小游戏：把应用内自带的 phaser.min.js 复制到游戏文件所在目录（断网也能玩）
ipcMain.handle('game-copy-phaser', async (event, filePath) => {
  try {
    const np = agentNorm(filePath);
    if (!agentInside(np)) return { ok: false, error: '路径不在工作文件夹内' };
    const dir = path.dirname(np);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const src = path.join(__dirname, 'lib', 'phaser.min.js');
    if (!fs.existsSync(src)) return { ok: false, error: '应用内缺少 lib/phaser.min.js' };

    const dst = path.join(dir, 'phaser.min.js');
    if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
    return { ok: true, path: dst };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

// ======================== ★ 画布参考图：存成文件，不塞 localStorage ========================
// 背景：画布把参考图以 base64 存进 localStorage，几张图就把配额（5-10MB）撑爆，
//       之后所有 setItem 都静默失败 → 画布、对话、API 配置一起丢。
// 现在：图片写到 userData/canvas-images/<sha1>.<ext>，localStorage 只存文件名。
const CANVAS_IMG_DIR_NAME = 'canvas-images';
// ★ 惰性获取目录：避免在 app ready 之前调用 app.getPath
function canvasImgDir() {
  return path.join(app.getPath('userData'), CANVAS_IMG_DIR_NAME);
}

function ensureCanvasImgDir() {
  const dir = canvasImgDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// 存一张 dataUrl 图片，按内容哈希命名（同样的图只存一份），返回文件名
ipcMain.handle('canvas-image-save', async (event, dataUrl) => {
  try {
    const s = String(dataUrl || '');
    if (!s.startsWith('data:')) return { ok: false, error: '不是 data URL' };
    ensureCanvasImgDir();

    const m = /^data:([^;]+);base64,(.*)$/s.exec(s);
    if (!m) return { ok: false, error: 'data URL 格式不支持' };
    const mime = m[1];
    const b64 = m[2];
    const extMap = {
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
      'image/gif': 'gif', 'image/bmp': 'bmp', 'image/avif': 'avif'
    };
    const ext = extMap[mime] || 'png';

    const buf = Buffer.from(b64, 'base64');
    const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20);
    const name = hash + '.' + ext;
    const full = path.join(canvasImgDir(), name);

    if (!fs.existsSync(full)) fs.writeFileSync(full, buf);
    return { ok: true, name: name, size: buf.length };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

// 读回一张图片，返回 dataUrl
ipcMain.handle('canvas-image-load', async (event, name) => {
  try {
    const n = path.basename(String(name || ''));   // ★ 只取文件名，禁止路径穿越
    if (!n) return { ok: false, error: '文件名为空' };
    const full = path.join(canvasImgDir(), n);
    if (!fs.existsSync(full)) return { ok: false, error: '图片文件不存在' };

    const buf = fs.readFileSync(full);
    const lower = n.toLowerCase();
    let mime = 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg';
    else if (lower.endsWith('.webp')) mime = 'image/webp';
    else if (lower.endsWith('.gif')) mime = 'image/gif';
    else if (lower.endsWith('.bmp')) mime = 'image/bmp';
    else if (lower.endsWith('.avif')) mime = 'image/avif';

    return { ok: true, dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64'), size: buf.length };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

// 删除一张不再使用的图片（可选调用）
ipcMain.handle('canvas-image-delete', async (event, name) => {
  try {
    const n = path.basename(String(name || ''));
    if (!n) return { ok: false };
    const full = path.join(canvasImgDir(), n);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

// 供用户查看/清理图片目录
ipcMain.handle('canvas-images-info', async () => {
  try {
    const dir = ensureCanvasImgDir();
    const files = fs.readdirSync(dir);
    let total = 0;
    files.forEach(function (f) {
      try { total += fs.statSync(path.join(dir, f)).size; } catch (e) {}
    });
    return { ok: true, dir: dir, count: files.length, bytes: total };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});
// ======================== 画布参考图 IPC 结束 ========================

// ======================== ★ 联网搜索（Tavily）========================
// 在【主进程】发请求，避免渲染进程的 CORS 限制。
// Key 由用户填在「设置 → 联网搜索」，存 localStorage；每次调用由渲染层传进来。
function httpPostJson(urlStr, bodyObj, headers, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const https = require('https');
    const u = new URL(urlStr);
    const payload = Buffer.from(JSON.stringify(bodyObj), 'utf8');
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': payload.length
      }, headers || {}),
      timeout: timeoutMs || 30000
    }, function (res) {
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('HTTP ' + res.statusCode + ': ' + text.slice(0, 300)));
        }
        try { resolve(JSON.parse(text)); }
        catch (e) { reject(new Error('返回内容不是 JSON：' + text.slice(0, 200))); }
      });
    });
    req.on('timeout', function () { req.destroy(new Error('请求超时')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// 联网搜索：返回 { ok, answer, results:[{title,url,content}] }
ipcMain.handle('web-search', async (event, payload) => {
  try {
    const key = String((payload && payload.key) || '').trim();
    const query = String((payload && payload.query) || '').trim();
    if (!key) return { ok: false, error: '未配置 Tavily API Key（设置 → 联网搜索）' };
    if (!query) return { ok: false, error: '搜索关键词为空' };

    const maxResults = Math.min(10, Math.max(1, parseInt((payload && payload.maxResults), 10) || 5));
    const depth = (payload && payload.depth === 'advanced') ? 'advanced' : 'basic';

    const data = await httpPostJson('https://api.tavily.com/search', {
      api_key: key,
      query: query,
      search_depth: depth,
      max_results: maxResults,
      include_answer: true,
      include_raw_content: false
    }, { 'Authorization': 'Bearer ' + key }, 45000);

    const results = (data.results || []).map(function (r) {
      return {
        title: r.title || '',
        url: r.url || '',
        content: String(r.content || '').slice(0, 2000),
        score: r.score
      };
    });
    return { ok: true, query: data.query || query, answer: data.answer || '', results: results };
  } catch (e) {
    return { ok: false, error: (e && e.message) ? e.message : String(e) };
  }
});
// ======================== 联网搜索 IPC 结束 ========================

// ======================== ★ 生成 Office 文件 ========================
// Agent 可以创建真正的 .xlsx（不是改后缀的文本文件）。
ipcMain.handle('doc-create-xlsx', async (event, p, sheets) => {
  try {
    const np = agentNorm(p);
    if (!agentInside(np)) return { ok: false, error: '路径不在工作文件夹内' };
    const target = /\.xlsx$/i.test(np) ? np : (np + '.xlsx');
    const sub = path.dirname(target);
    if (!fs.existsSync(sub)) fs.mkdirSync(sub, { recursive: true });
    const buf = docBuild.buildXlsx(sheets);
    fs.writeFileSync(target, buf);
    return { ok: true, path: target, size: buf.length };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});
// ======================== 生成 Office 文件 结束 ========================




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
  
    // ---------- IPC：Agent 把 html 打包成 exe（无对话框，输出到游戏文件夹旁） ----------
    ipcMain.handle('agent-pack-app', async function (event, payload) {
      try {
        const p = payload || {};
        const htmlPath = path.resolve(String(p.path || ''));
        if (!/\.html?$/i.test(htmlPath)) return { ok: false, error: '请提供 index.html 的绝对路径' };
        if (!fs.existsSync(htmlPath)) return { ok: false, error: '文件不存在：' + htmlPath };

        const gameDir = path.dirname(htmlPath);
        const entry = path.relative(gameDir, htmlPath).replace(/\\/g, '/');
        const rawName = String(p.name || '').trim() || path.basename(gameDir) || '我的应用';
        const name = rawName.replace(/[\\/:*?"<>|]/g, '_');
        // ★ 产物必须留在【游戏文件夹内部】，绝不能放到工作文件夹外面
        const target = path.join(gameDir, 'dist');
        if (fs.existsSync(target)) {
          try { fs.rmSync(target, { recursive: true, force: true }); } catch (e) {
            return { ok: false, error: '无法清理旧的 dist 目录（可能 exe 还在运行）：' + target };
          }
        }

        const srcRoot = path.dirname(process.execPath);
        if (!fs.existsSync(path.join(srcRoot, 'resources'))) {
          return { ok: false, error: '取不到 Electron 运行时（请用安装版运行 Ember 后再打包）' };
        }
        fs.mkdirSync(target, { recursive: true });
        copyDir(srcRoot, target, ['app.asar', 'app.asar.unpacked', 'app']);

        // 整个游戏目录 → resources\app-web
        // ★ 用逐文件复制的 copyDir（跳过 dist 自身），不能用 fs.cpSync：
        //   cpSync 会在"源包含目标"时直接抛 EINVAL，即使加 filter 也来不及生效
        const webDir = path.join(target, 'resources', 'app-web');
        if (fs.existsSync(webDir)) fs.rmSync(webDir, { recursive: true, force: true });
        copyDir(gameDir, webDir, ['dist', 'node_modules', '.git']);

        const appDir = path.join(target, 'resources', 'app');
        fs.mkdirSync(appDir, { recursive: true });
        const shellMain = [
          "const { app, BrowserWindow } = require('electron');",
          "const path = require('path');",
          "function create() {",
          "  const w = new BrowserWindow({ width: 1100, height: 760, backgroundColor: '#0b0d0f',",
          "    show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });",
          "  w.setMenuBarVisibility(false);",
          "  w.loadFile(path.join(__dirname, '..', 'app-web', '" + entry + "'));",
          "  w.once('ready-to-show', function () { w.show(); });",
          "}",
          "app.whenReady().then(create);",
          "app.on('window-all-closed', function () { app.quit(); });",
          ""
        ].join('\r\n');
        fs.writeFileSync(path.join(appDir, 'main.js'), shellMain, 'utf8');
        fs.writeFileSync(path.join(appDir, 'package.json'),
          JSON.stringify({ name: 'ember-packed-app', version: '1.0.0', main: 'main.js' }, null, 2), 'utf8');

        let exePath = '';
        const oldExe = path.join(target, path.basename(process.execPath));
        const newExe = path.join(target, name + '.exe');
        try {
          if (fs.existsSync(oldExe)) { fs.renameSync(oldExe, newExe); exePath = newExe; }
          else exePath = oldExe;
        } catch (e) { exePath = oldExe; }

        return { ok: true, dir: target, exe: exePath };
      } catch (err) {
        return { ok: false, error: (err && err.message) ? err.message : String(err) };
      }
    });

    // ---------- 布局体检：解析生成的 pptx，report 给模型当"眼睛" ----------
    //   返回人类可读的问题清单；没有问题时返回空字符串。
    function inspectPptx(filePath) {
      try {
        const zlib = require('zlib');
        const buf = fs.readFileSync(filePath);
        const EMU = 914400;
        const slides = [];
        let i = 0;
        while (i < buf.length - 4) {
          if (buf.readUInt32LE(i) !== 0x04034b50) { i++; continue; }
          const method = buf.readUInt16LE(i + 8);
          const csize = buf.readUInt32LE(i + 18);
          const nameLen = buf.readUInt16LE(i + 26);
          const extraLen = buf.readUInt16LE(i + 28);
          const name = buf.slice(i + 30, i + 30 + nameLen).toString('utf8');
          const dataStart = i + 30 + nameLen + extraLen;
          const comp = buf.slice(dataStart, dataStart + csize);
          if (/^ppt\/slides\/slide\d+\.xml$/.test(name)) {
            try {
              const xml = (method === 0 ? comp : zlib.inflateRawSync(comp)).toString('utf8');
              slides.push({ name: name, xml: xml });
            } catch (e) {}
          }
          i = dataStart + csize;
        }
        slides.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });

        const problems = [];
        slides.forEach(function (sl, idx) {
          const pageNo = idx + 1;
          const parts = sl.xml.split('<p:sp>').slice(1);
          parts.forEach(function (sp) {
            const off = sp.match(/<a:off x="(\d+)" y="(\d+)"\/>/);
            const ext = sp.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
            if (!off || !ext) return;
            const x = +off[1] / EMU, y = +off[2] / EMU, w = +ext[1] / EMU, h = +ext[2] / EMU;
            const texts = [].concat.apply([], Array.from(sp.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map(function (m) { return m[1]; }));
            const full = texts.join('');
            if (!full.trim()) return;
            const sizes = Array.from(sp.matchAll(/sz="(\d+)"/g)).map(function (m) { return +m[1] / 100; });
            const fs0 = sizes.length ? Math.max.apply(null, sizes) : 18;
            let ems = 0;
            for (let k = 0; k < full.length; k++) ems += (full.charCodeAt(k) > 255 ? 1.0 : 0.55);
            const perLine = Math.max(1, (w * 72) / (fs0 * 1.08));
            let lines = Math.max(1, Math.ceil(ems / perLine));
            lines = Math.max(lines, texts.length);
            const needH = (lines * fs0 * 1.5) / 72 + 0.12;
            const shot = '「' + full.slice(0, 14) + (full.length > 14 ? '…' : '') + '」';
            if (x + w > 13.45 || y + h > 7.55) {
              problems.push('第' + pageNo + '页 ' + shot + ' 超出页面边界（右' + (x + w).toFixed(1) + ' 底' + (y + h).toFixed(1) + '，版心 13.33×7.5）');
            } else if (needH > h * 1.02) {
              problems.push('第' + pageNo + '页 ' + shot + ' 文字溢出文本框（框高 ' + h.toFixed(1) + ' 寸，需 ' + needH.toFixed(1) + ' 寸）');
            }
            if (fs0 < 12 && full.length > 20) {
              problems.push('第' + pageNo + '页 ' + shot + ' 字号只有 ' + fs0 + 'pt，太小了（内容太多，请拆页）');
            }
            if (fs0 >= 30 && texts.length === 1) {
              const cx = x + w / 2;
              if (Math.abs(cx - 13.33 / 2) > 0.35) {
                problems.push('第' + pageNo + '页 ' + shot + ' 是大标题但没水平居中（中心 ' + cx.toFixed(2) + '，应为 6.66）');
              }
            }
          });
        });
        if (!problems.length) return '';
        return '【布局体检报告】发现 ' + problems.length + ' 个问题：\n- ' + problems.slice(0, 12).join('\n- ')
          + (problems.length > 12 ? '\n…（其余略）' : '')
          + '\n请修改脚本里的坐标/字号/文字量，重新 run-node；修完再看报告，直到没有溢出。';
      } catch (e) {
        try { console.error('[布局体检失败] ' + (e && e.message)); } catch (e2) {}
        return '';
      }
    }

    // ---------- IPC：执行一段 Node 脚本（给 Agent 用，例如生成 pptx） ----------
    //   思路：不放模板、不设 schema —— 让模型自己写 pptxgenjs 代码，我们只负责跑。
    //   脚本在它自己的目录里执行；环境里预置了 pptxgen（lib/pptxgen.bundle.js）。
    ipcMain.handle('agent-run-node', async (event, scriptPath) => {
      try {
        const np = agentNorm(scriptPath);
        if (!agentInside(np)) return { ok: false, error: '路径不在工作文件夹内' };
        if (!fs.existsSync(np)) return { ok: false, error: '脚本不存在：' + np };

        const dir = path.dirname(np);
        const code = fs.readFileSync(np, 'utf8');
        const libPath = path.join(__dirname, 'lib', 'pptxgen.bundle.js');
        const hasPptx = fs.existsSync(libPath);

        // 前置：把 pptxgen 注入成全局变量，模型直接 new pptxgen() 即可。
        //   ★ 不能直接 require：bundle 是浏览器 UMD，Node 里 require 会报 "JSZip is not defined"。
        //   ★ 做法：放进 vm 沙箱（不给 window，让它走 Node 分支），再取出 PptxGenJS。
        const prelude = hasPptx
          ? [
            "try {",
            "  const __vm = require('vm'), __fs = require('fs');",
            "  const __src = __fs.readFileSync(" + JSON.stringify(libPath) + ", 'utf8');",
            "  const __box = { require, process, console, Buffer, setTimeout, clearTimeout, setInterval, clearInterval, URL };",
            "  __vm.createContext(__box);",
            "  __vm.runInContext(__src, __box, { filename: 'pptxgen.bundle.js' });",
            "  const __Base = __box.PptxGenJS;",
            "  if (typeof __Base !== 'function') throw new Error('未取到 PptxGenJS');",
            "  // ★★ 排版兜底：不依赖模型自觉，这里强制给每个文本框补上自动缩放 + 夹到版心内",
            "  const __W = 13.33, __H = 7.5, __M = 0.25;",
            "  function __fixOpts(o) {",
            "    o = Object.assign({}, o || {});",
            "    if (o.fit === undefined) o.fit = 'shrink';",
            "    if (o.wrap === undefined) o.wrap = true;",
            "    if (typeof o.x === 'number' && typeof o.w === 'number') {",
            "      if (o.x < 0) o.x = 0;",
            "      if (o.x + o.w > __W) o.w = Math.max(0.5, __W - o.x - __M);",
            "    }",
            "    if (typeof o.y === 'number' && typeof o.h === 'number') {",
            "      if (o.y < 0) o.y = 0;",
            "      if (o.y + o.h > __H) o.h = Math.max(0.3, __H - o.y - __M);",
            "    }",
            "    // ★ 写了 align:center 却没落在页面正中 → 自动吸附到水平中心",
            "    if (o.align === 'center' && typeof o.x === 'number' && typeof o.w === 'number') {",
            "      var __cx = o.x + o.w / 2;",
            "      if (Math.abs(__cx - __W / 2) > 0.25) o.x = Math.round(((__W - o.w) / 2) * 100) / 100;",
            "    }",
            "    return o;",
            "  }",
            "  class EmberPptx extends __Base {",
            "    addSlide() {",
            "      const s = super.addSlide.apply(this, arguments);",
            "      const orig = s.addText.bind(s);",
            "      s.addText = function (text, opts) {",
            "        var __t = Array.isArray(text) ? text.map(function (x) { return (x && x.text) || ''; }).join('') : String(text || '');",
            "        if (__t.length > 400) console.warn('[排版提示] 单个文本框有 ' + __t.length + ' 字，建议拆成多页：' + __t.slice(0, 24) + '…');",
            "        var o = __fixOpts(opts);",
            "        // ★ 按文本实际占位反算字号：不指望任何软件帮忙自动缩放",
            "        if (__t && typeof o.w === 'number' && typeof o.h === 'number') {",
            "          var fs = o.fontSize || 18;",
            "          var ems = 0;",
            "          for (var i = 0; i < __t.length; i++) { ems += (__t.charCodeAt(i) > 255 ? 1.0 : 0.55); }",
            "          var emPerLine = Math.max(1, (o.w * 72) / (fs * 1.18));",
            "          var lines = Math.max(1, Math.ceil(ems / emPerLine));",
            "          // ★ 文本数组里的 breakLine 会强制换行 —— 行数至少要等于条目数，否则严重低估",
            "          if (Array.isArray(text) && text.length > 1) lines = Math.max(lines, text.length);",
            "          var needH = (lines * fs * 1.7) / 72 + 0.16;   // 行距按 1.7 估 + 内边距：宁可留白，不许顶出去",
            "          if (needH > o.h) {",
            "            // ① 先看页面下方还有没有空间：有就加高框（保住字号和设计感）",
            "            var availBelow = __H - o.y - __M;",
            "            if (needH <= availBelow) {",
            "              o.h = Math.round(needH * 100) / 100;",
            "            } else {",
            "              // ② 实在放不下，才缩字号（并且把框拉到最大可用高度）",
            "              o.h = Math.max(o.h, availBelow);",
            "              var k = availBelow / needH;",
            "              o.fontSize = Math.max(9, Math.floor(fs * k * 100) / 100);",
            "              if (o.fontSize <= 9 && (needH * k) > availBelow * 1.4) {",
            "                console.warn('[排版提示] 这段文字在 ' + o.w + 'x' + o.h + ' 的框里放不下（约 ' + __t.length + ' 字），建议拆页或缩短');",
            "              }",
            "            }",
            "          }",
            "        }",
            "        return orig(text, o);",
            "      };",
            "      const origT = s.addTable ? s.addTable.bind(s) : null;",
            "      if (origT) s.addTable = function (rows, opts) { return origT(rows, __fixOpts(opts)); };",
            "      return s;",
            "    }",
            "  }",
            "  global.pptxgen = EmberPptx;",
            "} catch (e) { console.error('[pptxgen 加载失败] ' + e.message); }",
            ""
          ].join("\n")
          : "console.error('[提示] 缺少 lib/pptxgen.bundle.js，生成 PPT 的能力不可用');\n";
        const wrapped = prelude + '(async function(){\n' + code + '\n})().catch(e => { console.error(e && e.stack || e); process.exit(1); });\n';

        const tmp = path.join(dir, '.ember-run-' + Date.now() + '.js');
        fs.writeFileSync(tmp, wrapped, 'utf8');

        const out = await new Promise(function (resolve) {
          let stdout = '', stderr = '', done = false;
          let child;
          try {
            child = require('child_process').execFile(
              process.execPath, [tmp],
              {
                cwd: dir,
                timeout: 180000,
                env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }),
                maxBuffer: 8 * 1024 * 1024
              },
              function (err, so, se) {
                if (done) return;
                done = true;
                resolve({
                  ok: !err,
                  code: err && typeof err.code !== 'undefined' ? err.code : 0,
                  stdout: String(so || ''),
                  stderr: String(se || '') + (err && err.killed ? '\n（执行超时，已强制结束）' : '')
                });
              }
            );
          } catch (e) {
            if (!done) { done = true; resolve({ ok: false, stdout: '', stderr: '启动 Node 失败：' + (e.message || e) }); }
            return;
          }
          child.on('error', function (e) {
            if (!done) { done = true; resolve({ ok: false, stdout: '', stderr: '启动 Node 失败：' + (e.message || e) }); }
          });
        });

        try { fs.unlinkSync(tmp); } catch (e) {}

        // ★ 生成了 pptx 就顺手体检，把问题清单塞进返回值给模型看
        try {
          const made = fs.readdirSync(dir).filter(function (n) { return /\.pptx$/i.test(n); })
            .map(function (n) { return { n: n, t: fs.statSync(path.join(dir, n)).mtimeMs }; })
            .filter(function (o) { return Date.now() - o.t < 5 * 60 * 1000; })
            .sort(function (a, b) { return b.t - a.t; });
          if (made.length) {
            const rep = inspectPptx(path.join(dir, made[0].n));
            if (rep) out.report = rep;
          }
        } catch (e) {}

        return out;
      } catch (e) {
        return { ok: false, error: (e && e.message) || String(e) };
      }
    });

    // ---------- IPC：启动一个 exe（测试打包产物用） ----------
    ipcMain.handle('agent-run-exe', async function (event, p) {
      try {
        const f = path.resolve(String(p || ''));
        if (!fs.existsSync(f)) return { ok: false, error: '文件不存在：' + f };
        const err = await shell.openPath(f);   // 交给系统启动，等同于双击
        if (err) return { ok: false, error: err };
        return { ok: true };
      } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
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

    // ---------- IPC：用系统浏览器打开网址（充值页、搜索服务等） ----------
    ipcMain.handle('open-external-url', async function (event, url) {
      try {
        const u = String(url || '').trim();
        if (!/^https?:\/\//i.test(u)) return { ok: false, error: '只允许 http/https 链接' };
        await shell.openExternal(u);
        return { ok: true };
      } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
    });

  })();

  
