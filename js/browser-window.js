// browser-window.js —— 内嵌浏览页面窗口（无边框 + WebContentsView）+ 下载管理 + 右键菜单
const { BrowserWindow, WebContentsView, ipcMain, session, shell, Menu, clipboard } = require('electron');
const path = require('path');

const browserWindows = new Set(); let previewWin = null;   // ★ 预览窗口单例（App工坊用）

const TOOLBAR_H = 47;    // 工具栏高度（与 CSS 一致）
const PANEL_H = 330;     // 下载面板高度

function createBrowserWindow(url) {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#0b0d0f',
    autoHideMenuBar: true,
    frame: false,
    roundedCorners: true,
    title: '浏览页面',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'browser.html'));

  const view = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true } });
  win.contentView.addChildView(view);

  let panelOpen = false;
  function layout() {
    if (win.isDestroyed()) return;
    const b = win.getContentBounds();
    const top = TOOLBAR_H + (panelOpen ? PANEL_H : 0);
    view.setBounds({ x: 0, y: top, width: b.width, height: Math.max(0, b.height - top) });
  }
  layout();
  win.on('resize', layout);

  const wc = view.webContents;
  if (url) { try { wc.loadURL(url); } catch (e) {} }

  // target="_blank" 不弹裸窗口，在当前视图内打开
  wc.setWindowOpenHandler(function (details) {
    try { wc.loadURL(details.url); } catch (e) {}
    return { action: 'deny' };
  });

  // 右键菜单
  wc.on('context-menu', function (event, params) {
    const template = [];
    if (params.linkURL) {
      template.push({ label: '在新窗口打开链接', click: function () { createBrowserWindow(params.linkURL); } });
      template.push({ label: '复制链接地址', click: function () { clipboard.writeText(params.linkURL); } });
      template.push({ type: 'separator' });
    }
    if (params.mediaType === 'image' && params.srcURL) {
      template.push({ label: '图片另存为…', click: function () { wc.downloadURL(params.srcURL); } });
      template.push({ label: '复制图片', click: function () { wc.copyImageAt(params.x, params.y); } });
      template.push({ type: 'separator' });
    }
    if (params.isEditable) {
      template.push({ label: '剪切', role: 'cut', enabled: params.editFlags.canCut });
      template.push({ label: '复制', role: 'copy', enabled: params.editFlags.canCopy });
      template.push({ label: '粘贴', role: 'paste', enabled: params.editFlags.canPaste });
      template.push({ label: '全选', role: 'selectAll' });
      template.push({ type: 'separator' });
    } else if (params.selectionText) {
      template.push({ label: '复制', role: 'copy' });
      template.push({ label: '复制（纯文本）', click: function () { clipboard.writeText(params.selectionText); } });
      template.push({ type: 'separator' });
    }
    template.push({ label: '后退', enabled: wc.canGoBack(), click: function () { wc.goBack(); } });
    template.push({ label: '前进', enabled: wc.canGoForward(), click: function () { wc.goForward(); } });
    template.push({ label: '刷新', click: function () { wc.reload(); } });
    template.push({ type: 'separator' });
    template.push({ label: '复制当前网址', click: function () { clipboard.writeText(wc.getURL()); } });
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: win });
  });

  function pushState() {
    if (win.isDestroyed()) return;
    let st = { url: '', canGoBack: false, canGoForward: false, loading: false };
    try {
      st = { url: wc.getURL(), canGoBack: wc.canGoBack(), canGoForward: wc.canGoForward(), loading: wc.isLoading() };
    } catch (e) {}
    win.webContents.send('browser-state', st);
  }
  ['did-navigate', 'did-navigate-in-page', 'did-start-loading', 'did-stop-loading', 'page-title-updated'].forEach(function (ev) {
    wc.on(ev, pushState);
  });

  win._browserView = view;
  win._setPanel = function (open) { panelOpen = open; layout(); };

  browserWindows.add(win);

  // 窗口关闭时销毁网页视图（停止视频/音频，释放内存）
  win.on('close', function () {
    try {
      if (view && !view.webContents.isDestroyed()) view.webContents.close();
    } catch (e) {}
  });
  win.on('closed', function () {
    browserWindows.delete(win);
    try {
      if (view && !view.webContents.isDestroyed()) view.webContents.close();
    } catch (e) {}
  });

  return win;
}

function registerBrowserIPC() {
  ipcMain.handle('open-browser-window', (event, url) => {
    createBrowserWindow(url);
    return true;
  });

  // ★ APP工坊：预览生成的 HTML（写临时文件后用浏览页打开）
  ipcMain.handle('preview-html', async (event, html) => {
    try {
      const os = require('os');
      // ★ 固定文件名，反复覆盖 —— 不再往临时目录堆文件
      const file = path.join(os.tmpdir(), 'ember-preview.html');
      require('fs').writeFileSync(file, html, 'utf-8');
      const url = 'file:///' + file.replace(/\\/g, '/');

      // ★ 已有预览窗口 → 只刷新内容，不新建（这是"越点越卡"的根治）
      if (previewWin && !previewWin.isDestroyed()) {
        try {
          previewWin.show();
          previewWin.focus();
          const view = previewWin._browserView;
          const wc = view && view.webContents;
          if (wc && !wc.isDestroyed()) {
            wc.loadURL(url + '?t=' + Date.now());   // 加时间戳绕过缓存，确保读到新内容
          }
        } catch (e) {}
        return { ok: true, url: url, reused: true };
      }

      // 没有才新建，并且关掉时把单例清空
      previewWin = createBrowserWindow(url);
      previewWin.on('closed', function () { previewWin = null; });
      return { ok: true, url: url, reused: false };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  });


  ipcMain.handle('browser-nav', (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !win._browserView) return false;
    const wc = win._browserView.webContents;
    const a = payload && payload.action;
    try {
      if (a === 'back' && wc.canGoBack()) wc.goBack();
      else if (a === 'forward' && wc.canGoForward()) wc.goForward();
      else if (a === 'reload') wc.reload();
      else if (a === 'stop') wc.stop();
      else if (a === 'go' && payload.url) wc.loadURL(payload.url);
    } catch (e) {}
    return true;
  });

  ipcMain.handle('browser-toggle-panel', (event, open) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && win._setPanel) win._setPanel(!!open);
    return true;
  });

  ipcMain.handle('bwin-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
    return true;
  });
  ipcMain.handle('bwin-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) { win.isMaximized() ? win.unmaximize() : win.maximize(); }
    return true;
  });
  ipcMain.handle('bwin-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
    return true;
  });

  ipcMain.handle('open-downloaded-file', (event, p) => {
    if (p) shell.openPath(p);
    return true;
  });
  ipcMain.handle('show-downloaded-file', (event, p) => {
    if (p) shell.showItemInFolder(p);
    return true;
  });
}

// 下载管理：广播给所有浏览页面窗口
function setupDownloadManager() {
  session.defaultSession.on('will-download', (event, item) => {
    const id = 'dl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const filename = item.getFilename();

    function send(payload) {
      browserWindows.forEach(function (w) {
        if (!w.isDestroyed()) w.webContents.send('download-update', payload);
      });
    }

    send({ id, filename, state: 'progressing', received: 0, total: item.getTotalBytes() });

    item.on('updated', function () {
      send({ id, filename, state: 'progressing', received: item.getReceivedBytes(), total: item.getTotalBytes() });
    });

    item.once('done', function (e, state) {
      send({
        id, filename, state: state,
        received: item.getReceivedBytes(),
        total: item.getTotalBytes(),
        filePath: state === 'completed' ? item.getSavePath() : ''
      });
    });
  });
}

module.exports = { createBrowserWindow, registerBrowserIPC, setupDownloadManager };
