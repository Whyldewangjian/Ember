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

  // ★ Agent 预览专用：读取 HTML，并把相对引用的本地 js/css 内联进去
  //
  // 为什么需要这个：
  //   Agent 的预览用的是 iframe.srcdoc，且没有 allow-same-origin，
  //   处于"不透明源"状态。这种 iframe 里 <script src="./game.js"> 这类
  //   相对路径请求会被拦掉，导致 HTML 里的画面能显示、但脚本不执行。
  //   把本地 js/css 直接内联成 <script>...</script> / <style>...</style>，
  //   预览就完整了。外链（http/https//data:）保持原样不动。
  ipcMain.handle('agent-read-file-inline', async (event, p) => {
    try {
      const fs = require('fs');
      const np = path.resolve(String(p || ''));
      if (!fs.existsSync(np)) return { ok: false, error: '文件不存在' };

      const st = fs.statSync(np);
      if (st.isDirectory()) return { ok: false, error: '这是一个文件夹' };

      const buf = fs.readFileSync(np);
      const head = buf.slice(0, 8000);
      for (let i = 0; i < head.length; i++) {
        if (head[i] === 0) return { ok: true, binary: true, size: st.size, content: '' };
      }

      let content = buf.toString('utf-8');
      if (!/\.html?$/i.test(np)) {
        return { ok: true, binary: false, size: st.size, content: content, inlined: 0 };
      }

      const root = path.dirname(np);
      let inlinedCount = 0;
      const skipped = [];

      // 安全的相对路径解析：不允许跳出 HTML 所在目录之外太远（允许子目录）
      function resolveLocal(ref) {
        const clean = String(ref).split('?')[0].split('#')[0].trim();
        if (!clean) return null;
        if (/^(https?:|data:|blob:|mailto:|javascript:|#)/i.test(clean)) return null;
        const abs = path.resolve(root, clean.replace(/^\.\//, ''));
        // 只允许读取 root 之下的文件
        const rel = path.relative(root, abs);
        if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
        return abs;
      }

      // 内联 <script src="..."></script>
      content = content.replace(/<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
        function (m, pre, src, post) {
          const abs = resolveLocal(src);
          if (!abs) return m;
          try {
            if (!fs.existsSync(abs)) { skipped.push(src); return m; }
            const code = fs.readFileSync(abs, 'utf-8');
            inlinedCount++;
            // 防止脚本内容里出现 </script> 提前闭合标签
            const safe = code.replace(/<\/script>/gi, '<\\/script>');
            return '<script' + pre + post + '>\n' + safe + '\n</script>';
          } catch (e) { skipped.push(src); return m; }
        });

      // 内联 <link rel="stylesheet" href="...">
      content = content.replace(/<link\b([^>]*?)\bhref\s*=\s*["']([^"']+)["']([^>]*?)\/?>/gi,
        function (m, pre, href, post) {
          const isCss = /rel\s*=\s*["']?stylesheet/i.test(pre + post);
          if (!isCss) return m;
          const abs = resolveLocal(href);
          if (!abs) return m;
          try {
            if (!fs.existsSync(abs)) { skipped.push(href); return m; }
            const css = fs.readFileSync(abs, 'utf-8');
            inlinedCount++;
            return '<style>\n' + css + '\n</style>';
          } catch (e) { skipped.push(href); return m; }
        });

      return {
        ok: true,
        binary: false,
        size: st.size,
        content: content,
        inlined: inlinedCount,
        skipped: skipped.slice(0, 10)
      };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
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
      //
      // ★ 注意：这里必须用 loadFile 而不是 loadURL('file://...?t=时间戳')。
      //   Chromium 对 file:// 协议的查询字符串处理不规范，同一个文件路径
      //   即使 ?t= 变化也可能命中同一份缓存，导致预览一直显示上一次的旧内容。
      //   loadFile 是 Electron 原生的文件加载方式，每次都会重新读取磁盘。
      if (previewWin && !previewWin.isDestroyed()) {
        try {
          previewWin.show();
          previewWin.focus();
          const view = previewWin._browserView;
          const wc = view && view.webContents;
          if (wc && !wc.isDestroyed()) {
            wc.loadFile(file);
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
