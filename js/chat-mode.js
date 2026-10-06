// ======================== 对话模式（chat-mode v1.3 · 多会话） ========================
(function () {
  'use strict';

  // ---------- 元素 ----------
  const chatBtn = document.getElementById('chatSwitchBtn');
  const chatMode = document.getElementById('chatMode');
  const mainArea = document.querySelector('.main-area');
  const bottomBar = document.querySelector('.bottom-bar');
  const chatList = document.getElementById('chatList');
  const chatInput = document.getElementById('chatInput');
  const chatSendBtn = document.getElementById('chatSendBtn');
  const chatStopBtn = document.getElementById('chatStopBtn');
  const chatClearBtn = document.getElementById('chatClearBtn');
  const chatModelSelect = document.getElementById('chatModelSelect');
  const chatImgPreview = document.getElementById('chatImgPreview');
  // ★ 导出 / 搜索
  const chatExportBtn = document.getElementById('chatExportBtn');
  const chatSearchBtn = document.getElementById('chatSearchBtn');
  const chatSearchBar = document.getElementById('chatSearchBar');
  const chatSearchInput = document.getElementById('chatSearchInput');
  const chatSearchCount = document.getElementById('chatSearchCount');
  const chatSearchClose = document.getElementById('chatSearchClose');
  let chatSearchKeyword = '';
  // ★ 多会话
  const chatNewBtn = document.getElementById('chatNewBtn');
  const chatSessionSelect = document.getElementById('chatSessionSelect');
  const chatSessionDel = document.getElementById('chatSessionDel');

  if (!chatMode || !chatBtn) return;

  let chatActive = false;
  let sending = false;
  let pendingChatImages = [];   // ★ 待发送的参考图（可多张，存 dataUrl）
  let pendingChatFiles = [];    // ★ 待发送的文本/代码附件：[{ id, name, size, content }]

  let chatMessages = [];        // ★ 始终指向"当前会话"的 messages 数组
  const OLD_CHAT_KEY = 'llm_chat_messages';
  const SESSIONS_KEY = 'llm_chat_sessions';
  let sessions = [];            // [{ id, name, messages, time }]
  let currentSessionId = null;

  // ---------- Electron IPC / 窗口控制 ----------
  let ipc = null;
  try { ipc = require('electron').ipcRenderer; } catch (e) {}
  function bindWin(id, action) {
    const el = document.getElementById(id);
    if (el && ipc) el.addEventListener('click', function () { ipc.invoke(action).catch(function () {}); });
  }
  bindWin('chatDockBtn', 'dock-enable');
  bindWin('chatWinMinBtn', 'win-minimize');
  bindWin('chatWinMaxBtn', 'win-maximize');
  const chatWinCloseEl = document.getElementById('chatWinCloseBtn');
  if (chatWinCloseEl) {
    chatWinCloseEl.addEventListener('click', function () {
      if (typeof requestCloseApp === 'function') requestCloseApp();
      else if (ipc) ipc.invoke('win-close').catch(function () {});
    });
  }


  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function renderMd(text) {
    if (typeof renderMarkdown === 'function') return renderMarkdown(text);
    return esc(text).replace(/\n/g, '<br>');
  }
  function nowTime() {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false });
  }
  function scrollToBottom() {
    if (chatList) chatList.scrollTop = chatList.scrollHeight;
  }
  function showTip(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }
  // 取一条消息里的图片列表（兼容旧版单图字段 m.image）
  function msgImages(m) {
    if (m.images && m.images.length) return m.images;
    if (m.image) return [m.image];
    return [];
  }

  // ---------- 复制单条消息 ----------
  function copyMsgText(text) {
    if (typeof copyTextToClipboard === 'function') {
      copyTextToClipboard(text).then(function (ok) { if (ok) showTip('✅ 已复制'); });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showTip('✅ 已复制'); });
    } else {
      showTip('复制失败');
    }
  }

  // ======================== ★ 多会话 ========================
  function getCurrentSession() {
    return sessions.find(function (s) { return s.id === currentSessionId; });
  }
  function renderSessionSelect() {
    if (!chatSessionSelect) return;
    const cur = currentSessionId;
    chatSessionSelect.innerHTML = '';
    sessions.forEach(function (s) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = (s.name || '对话').slice(0, 16) + (s.messages.length ? '（' + s.messages.length + '）' : '');
      chatSessionSelect.appendChild(opt);
    });
    if (cur) chatSessionSelect.value = cur;
  }
  function switchSession(id) {
    const s = sessions.find(function (x) { return x.id === id; });
    if (!s) return;
    currentSessionId = id;
    chatMessages = s.messages;
    chatSearchKeyword = '';
    if (chatSearchInput) chatSearchInput.value = '';
    if (chatSearchBar) chatSearchBar.style.display = 'none';
    renderSessionSelect();
    renderChat();
  }
  function newSession() {
    const s = {
      id: 'cs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: '新对话',
      messages: [],
      time: new Date().toLocaleString('zh-CN', { hour12: false })
    };
    sessions.push(s);
    switchSession(s.id);
    saveChat();
    if (chatInput) chatInput.focus();
  }
  function deleteSession(id) {
    if (sessions.length <= 1) { showTip('至少保留一个对话'); return; }
    sessions = sessions.filter(function (s) { return s.id !== id; });
    if (currentSessionId === id) {
      currentSessionId = sessions[0].id;
      chatMessages = sessions[0].messages;
    }
    renderSessionSelect();
    renderChat();
    saveChat();
    showTip('已删除当前对话');
  }
  // ★ 拦截聊天气泡里的超链接（左键 / 中键都走内嵌浏览器）
  if (chatList) {
    function openChatLink(a) {
      if (a && a.href) {
        if (ipc && ipc.invoke) ipc.invoke('open-browser-window', a.href);
      }
    }
    chatList.addEventListener('click', function (e) {
      const a = e.target.closest('a');
      if (a && a.href) {
        e.preventDefault();
        openChatLink(a);
      }
    });
    // ★ 中键点击也走内嵌浏览器，而不是 Electron 默认新窗口
    chatList.addEventListener('auxclick', function (e) {
      if (e.button !== 1) return;
      const a = e.target.closest('a');
      if (a && a.href) {
        e.preventDefault();
        openChatLink(a);
      }
    });
  }
  // ======================== ★ 消息里的图片：点击放大查看 ========================
  let chatImgOverlay = null;
  function ensureChatImgOverlay() {
    if (chatImgOverlay) return chatImgOverlay;
    chatImgOverlay = document.createElement('div');
    chatImgOverlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99998', 'display:none',
      'align-items:center', 'justify-content:center', 'flex-direction:column',
      'background:rgba(0,0,0,.92)', 'cursor:zoom-out', 'padding:24px'
    ].join(';');
    const im = document.createElement('img');
    im.style.cssText = 'max-width:96vw;max-height:88vh;object-fit:contain;border-radius:6px;box-shadow:0 12px 48px rgba(0,0,0,.7);';
    const tip = document.createElement('div');
    tip.textContent = '点击任意处关闭（Esc 也可以）';
    tip.style.cssText = 'color:#9aa3ad;font-size:12px;margin-top:12px;';
    chatImgOverlay.appendChild(im);
    chatImgOverlay.appendChild(tip);
    chatImgOverlay.addEventListener('click', function () {
      chatImgOverlay.style.display = 'none';
      im.removeAttribute('src');
    });
    document.body.appendChild(chatImgOverlay);
    return chatImgOverlay;
  }

  if (chatList) {
    chatList.addEventListener('click', function (e) {
      const im = e.target.closest('img.chat-msg-img');
      if (!im || !im.src) return;
      e.stopPropagation();
      const ov = ensureChatImgOverlay();
      ov.querySelector('img').src = im.src;
      ov.style.display = 'flex';
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && chatImgOverlay && chatImgOverlay.style.display === 'flex') {
      chatImgOverlay.style.display = 'none';
      chatImgOverlay.querySelector('img').removeAttribute('src');
    }
  });


  // ---------- 模式切换 ----------
  function enterChat() {
    if (chatActive) return;                        // ★ 已在对话模式：无反应
    if (window.__exitCanvasMode) window.__exitCanvasMode(); // 先退出画布模式
    if (window.__exitStoryboardMode) window.__exitStoryboardMode(); // 退出分镜模式
    if (window.__exitWorkshopMode) window.__exitWorkshopMode();     // 退出工坊模式
    if (window.__exitAgentMode) window.__exitAgentMode();           // 退出 Agent 模式
    chatActive = true;
    // ★ 隐藏右下角时间（避免和发送按钮重叠）
    const tdIn = document.querySelector('.time-display');
    if (tdIn) tdIn.style.display = ''; document.body.classList.add('mode-active');

    // ★ 取消主页按钮激活
    const homeIn = document.getElementById('homeSwitchBtn');
    if (homeIn) homeIn.classList.remove('active');
    if (mainArea) mainArea.style.display = 'none';
    if (bottomBar) bottomBar.style.display = 'none';
    const cm = document.getElementById('canvasMode');
    if (cm) cm.style.display = 'none';
    const canvasSwitch = document.getElementById('modeSwitch');
    if (canvasSwitch) {
      canvasSwitch.classList.remove('active');
      canvasSwitch.innerHTML = '<i class="fas fa-project-diagram"></i> 画布';
    }
    chatMode.style.display = 'flex';
    chatBtn.classList.add('active');
    renderModelOptions();
    renderSessionSelect();
    if (!chatList.children.length) renderChat();
    scrollToBottom();
  }

  function exitChat() {
    if (!chatActive) return;
    chatActive = false;
    chatMode.style.display = 'none';
    chatBtn.classList.remove('active');
    // ★ 恢复右下角时间
    const tdOut = document.querySelector('.time-display');
    if (tdOut) tdOut.style.display = ''; document.body.classList.remove('mode-active');

    if (mainArea) mainArea.style.display = '';
    if (bottomBar) bottomBar.style.display = '';
  }

  chatBtn.addEventListener('click', function () {
    if (chatActive) return;                        // ★ 当前模式按钮无反应
    enterChat();
  });

  // ★ 主页按钮：退出对话 + 退出画布，回到主页
  const homeSwitchBtn = document.getElementById('homeSwitchBtn');
  if (homeSwitchBtn) {
    homeSwitchBtn.addEventListener('click', function () {
      exitChat();
      if (window.__exitCanvasMode) window.__exitCanvasMode();
      if (window.__exitStoryboardMode) window.__exitStoryboardMode();
      if (window.__exitWorkshopMode) window.__exitWorkshopMode();
      if (window.__exitAgentMode) window.__exitAgentMode();
      homeSwitchBtn.classList.add('active');
    });
  }

  // ★ 暴露给画布 / 主页按钮调用
  window.__enterChatMode = enterChat;
  window.__exitChatMode = exitChat;

  // ---------- 模型下拉 ----------
  function renderModelOptions() {
    if (!chatModelSelect) return;
    const list = (typeof apis !== 'undefined' && Array.isArray(apis)) ? apis : [];
    let html = '';
    list.forEach(function (a) {
      // ★ 按对话自己的模型显示选中项（不再跟主页共用）
      const myId = (typeof window.scopeApiId === 'function') ? window.scopeApiId('chat') : activeApiId;
      const sel = (typeof activeApiId !== 'undefined' && a.id === myId) ? ' selected' : '';
      html += '<option value="' + esc(a.id) + '"' + sel + '>' + esc(a.model) + '</option>';
    });
    chatModelSelect.innerHTML = html;
  }

  if (chatModelSelect) {
    chatModelSelect.addEventListener('change', function () {
      const id = this.value;
      if (!id || typeof apis === 'undefined' || typeof currentApi === 'undefined') return;
      const api = apis.find(function (a) { return a.id === id; });
      if (!api) return;
      if (typeof setActiveModel === 'function') {
        setActiveModel('chat', id);   // ★ 只改对话自己的模型（不再影响主页/分镜/工坊）
      } else {
        currentApi.url = api.url || 'https://api.deepseek.com';
        currentApi.key = api.key || '';
        currentApi.model = api.model || 'deepseek-v4-flash';
        currentApi.vision = !!api.vision;
      }
    });
  }

  // ---------- 消息渲染（带单条复制按钮） ----------
  function buildBubble(m) {
    const wrap = document.createElement('div');
    wrap.className = 'chat-row ' + (m.role === 'user' ? 'chat-row-user' : 'chat-row-ai');
    const avatar = m.role === 'user' ? '🧑' : '🤖';
    let inner = '<div class="chat-avatar">' + avatar + '</div><div class="chat-bubble-wrap">';
    msgImages(m).forEach(function (img) { inner += '<img class="chat-msg-img" src="' + img + '">'; });
    if (m.files && m.files.length) {                     // ★ 附件卡片（只读展示）
      inner += '<div class="chat-msg-files">' + m.files.map(function (f) {
        return '<span class="chat-file-chip static" title="' + esc(f.name) + '">' +
          '<i class="fas fa-file-lines"></i><span class="cf-name">' + esc(f.name) + '</span>' +
          '<span class="cf-size">' + fmtSize(f.size) + '</span></span>';
      }).join('') + '</div>';
    }
    if (m.content) {
      inner += '<div class="chat-bubble' + (m.role === 'assistant' ? ' chat-bubble-md' : '') + '">' +
        (m.role === 'assistant' ? renderMd(m.content) : esc(m.content)) + '</div>';
    }
    inner += '<div class="chat-meta"><span class="chat-time">' + esc(m.time || '') + '</span>' +
    (m.meta ? '<span class="meta-line chat-meta-line">' + m.meta + '</span>' : '') + '<button class="chat-copy-btn" title="复制消息"><i class="far fa-copy"></i></button></div></div>';

    wrap.innerHTML = inner;


    const copyBtn = wrap.querySelector('.chat-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const text = m.role === 'assistant'
          ? (typeof markdownToPlainText === 'function' ? markdownToPlainText(m.content) : (m.content || ''))
          : (m.content || '');
        if (!text.trim()) return;
        copyMsgText(text);
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(function () {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = '<i class="far fa-copy"></i>';
        }, 1200);
      });
    }
    return wrap;
  }
  function renderChat() {
    if (!chatList) return;
    chatList.innerHTML = '';
    chatMessages.forEach(function (m) { chatList.appendChild(buildBubble(m)); });
    scrollToBottom();
  }

  // ---------- ★ 搜索 ----------
  function highlightTextNodes(el, kw) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      const idx = node.nodeValue.toLowerCase().indexOf(kw.toLowerCase());
      if (idx >= 0) {
        const mark = document.createElement('mark');
        mark.className = 'chat-hl';
        mark.textContent = node.nodeValue.substr(idx, kw.length);
        const frag = document.createDocumentFragment();
        frag.appendChild(document.createTextNode(node.nodeValue.substr(0, idx)));
        frag.appendChild(mark);
        frag.appendChild(document.createTextNode(node.nodeValue.substr(idx + kw.length)));
        node.parentNode.replaceChild(frag, node);
      }
    });
  }
  function renderChatFiltered() {
    const kw = chatSearchKeyword.trim();
    if (!kw) { renderChat(); return; }
    const matched = chatMessages.filter(function (m) {
      return (m.content || '').toLowerCase().indexOf(kw.toLowerCase()) >= 0;
    });
    chatList.innerHTML = '';
    matched.forEach(function (m) {
      const wrap = buildBubble(m);
      const bubble = wrap.querySelector('.chat-bubble');
      if (bubble && m.content) {
        try { highlightTextNodes(bubble, kw); } catch (e) {}
      }
      chatList.appendChild(wrap);
    });
    if (chatSearchCount) {
      chatSearchCount.textContent = matched.length > 0 ? '匹配 ' + matched.length + ' 条' : '无匹配';
    }
  }

  // ---------- ★ 导出（走主进程保存框） ----------
  function exportChat() {
    if (!chatMessages.length) { showTip('暂无对话记录可导出'); return; }
    let md = '# Ember 对话记录\n\n';
    chatMessages.forEach(function (m) {
      const role = m.role === 'user' ? '🧑 用户' : '🤖 AI';
      md += '### ' + role + '（' + (m.time || '') + '）\n\n';
      const _imgs = msgImages(m);
      if (_imgs.length) md += '_[包含图片 ×' + _imgs.length + ']_  \n';
      if (m.files && m.files.length) md += '_[附件：' + m.files.map(function (f) { return f.name; }).join('、') + ']_  \n';

      md += (m.content || '') + '\n\n---\n\n';
    });
    const defaultName = '对话记录_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.md';
    let ipcRenderer = null;
    try { ipcRenderer = require('electron').ipcRenderer; } catch (e) {}
    if (ipcRenderer && ipcRenderer.invoke) {
      ipcRenderer.invoke('save-file-dialog', { title: '导出对话记录', defaultPath: defaultName, filters: [{ name: 'Markdown', extensions: ['md'] }] })
        .then(function (result) {
          if (result && !result.canceled && result.filePath) {
            return ipcRenderer.invoke('write-file', result.filePath, md).then(function (r) {
              if (r && r.ok) showTip('✅ 已导出：' + result.filePath);
              else showTip('❌ 写入失败');
            });
          }
        })
        .catch(function () {});
      return;
    }
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- 记录保存 / 恢复（多会话） ----------
  function saveChat() {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify({ sessions: sessions, activeId: currentSessionId }));
    } catch (e) {}
  }
  function loadChat() {
    try {
      const saved = localStorage.getItem(SESSIONS_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        sessions = (data && Array.isArray(data.sessions)) ? data.sessions : [];
        currentSessionId = data && data.activeId ? data.activeId : null;
      }
    } catch (e) { sessions = []; }

    // ★ 旧版单会话数据迁移成第一个会话
    if (sessions.length === 0) {
      try {
        const old = JSON.parse(localStorage.getItem(OLD_CHAT_KEY) || '[]');
        if (Array.isArray(old) && old.length > 0) {
          const firstName = (old.find(function (m) { return m.role === 'user' && m.content; }) || {}).content || '';
          sessions.push({
            id: 'cs_migrate',
            name: firstName ? firstName.slice(0, 12) : '历史对话',
            messages: old,
            time: new Date().toLocaleString('zh-CN', { hour12: false })
          });
          currentSessionId = 'cs_migrate';
        }
      } catch (e) {}
    }

    // ★ 默认至少一个空会话
    if (sessions.length === 0) {
      sessions.push({
        id: 'cs_' + Date.now(),
        name: '新对话',
        messages: [],
        time: new Date().toLocaleString('zh-CN', { hour12: false })
      });
      currentSessionId = sessions[0].id;
    }
    if (!sessions.find(function (s) { return s.id === currentSessionId; })) {
      currentSessionId = sessions[0].id;
    }
    const cur = getCurrentSession();
    chatMessages = cur ? cur.messages : sessions[0].messages;
  }

  // ---------- 图片（拖入 / 粘贴 / 点击选择，可多张） ----------
  function addChatImage(dataUrl) {
    if (!dataUrl) return;
    pendingChatImages.push(dataUrl);
    renderChatImgPreview();
  }
  function removeChatImage(index) {
    pendingChatImages.splice(index, 1);
    renderChatImgPreview();
  }
  function clearChatImages() {
    pendingChatImages = [];
    renderChatImgPreview();
  }
  function fmtSize(n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function clearChatFiles() {
    pendingChatFiles = [];
    renderChatImgPreview();
  }

  // 待发送区：图片缩略图 + 附件卡片（都可单独删除）
  function renderChatImgPreview() {
    if (!chatImgPreview) return;
    chatImgPreview.innerHTML = '';

    pendingChatImages.forEach(function (dataUrl, idx) {
      const thumb = document.createElement('div');
      thumb.className = 'chat-img-thumb';
      thumb.innerHTML = '<img src="' + dataUrl + '"><span class="chat-img-del" title="移除图片">×</span>';
      thumb.querySelector('.chat-img-del').addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        removeChatImage(idx);
      });
      chatImgPreview.appendChild(thumb);
    });

    pendingChatFiles.forEach(function (f) {
      const chip = document.createElement('div');
      chip.className = 'chat-file-chip';
      chip.title = f.name + '（' + fmtSize(f.size) + '）';
      chip.innerHTML =
        '<i class="fas fa-file-lines"></i>' +
        '<span class="cf-name">' + esc(f.name) + '</span>' +
        '<span class="cf-size">' + fmtSize(f.size) + '</span>' +
        '<span class="chat-file-del" title="移除附件">×</span>';
      chip.addEventListener('click', function (e) { e.stopPropagation(); });   // ★ 不再触发外层"选图片"
      chip.querySelector('.chat-file-del').addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        pendingChatFiles = pendingChatFiles.filter(function (x) { return x.id !== f.id; });
        renderChatImgPreview();
      });
      chatImgPreview.appendChild(chip);
    });
  }

  async function addChatImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (typeof processBgFile === 'function') {
      try {
        const dataUrl = await processBgFile(file);
        addChatImage(dataUrl);
      } catch (e) { showTip('图片处理失败'); }
    } else {
      const reader = new FileReader();
      reader.onload = function () { addChatImage(reader.result); };
      reader.readAsDataURL(file);
    }
  }

  if (chatImgPreview) {
    chatImgPreview.addEventListener('click', function (e) {
      // ★ 点在缩略图 / 附件卡片 / 任一 × 上，都不再弹系统"打开"窗口
      if (e.target.closest('.chat-img-del') ||
          e.target.closest('.chat-img-thumb') ||
          e.target.closest('.chat-file-chip')) return;
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.multiple = true;   // ★ 支持一次选多张参考图
      inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', async function () {
        const fs = this.files;
        if (fs && fs.length) {
          for (const f of Array.prototype.slice.call(fs)) { await addChatImageFile(f); }
        }
        document.body.removeChild(inp);
      });
      inp.click();
    });
  }

  // ---------- ★ 文本 / 代码文件：读成"附件"挂到待发送区 ----------
  const TEXT_EXT = ['txt', 'md', 'markdown', 'json', 'jsonl', 'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'css', 'scss', 'less', 'html', 'htm', 'xml', 'yml', 'yaml', 'py', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'sql', 'sh', 'bat', 'ps1', 'ini', 'conf', 'env', 'log', 'csv', 'vue', 'svelte'];
  const TEXT_MAX_BYTES = 256 * 1024;   // 单个附件上限 256KB：太大既费 token，也会撑爆 localStorage

  function isTextLikeFile(f) {
    if (!f) return false;
    if (f.type && (f.type.startsWith('text/') || f.type === 'application/json' || f.type === 'application/xml')) return true;
    const ext = String(f.name || '').split('.').pop().toLowerCase();
    return TEXT_EXT.indexOf(ext) >= 0;
  }

  function readFileAsText(f) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(new Error('读取失败')); };
      r.readAsText(f);
    });
  }

  async function addChatTextFile(file) {
    if (!file) return;
    if (file.size > TEXT_MAX_BYTES) {
      showTip('⚠ ' + file.name + ' 超过 ' + (TEXT_MAX_BYTES / 1024) + 'KB，未加入附件');
      return;
    }
    if (pendingChatFiles.some(function (x) { return x.name === file.name && x.size === file.size; })) {
      showTip('⚠ ' + file.name + ' 已在附件列表里');
      return;
    }
    try {
      const content = await readFileAsText(file);
      pendingChatFiles.push({
        id: 'cf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: file.name || '未命名文件',
        size: file.size || content.length,
        content: content
      });
      renderChatImgPreview();
      showTip('📎 已添加附件：' + file.name);
    } catch (e) {
      showTip('⚠ ' + file.name + ' 读取失败');
    }
  }

  function insertTextIntoChat(text) {
    if (!chatInput) return;
    const cur = chatInput.value || '';
    const needNl = (cur && !/\n$/.test(cur)) ? '\n' : '';
    chatInput.value = cur + needNl + text;
    chatInput.scrollTop = chatInput.scrollHeight;
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function handleDroppedFiles(fileList) {
    const files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    const imgs = [], texts = [], others = [];
    files.forEach(function (f) {
      if (f.type && f.type.startsWith('image/')) imgs.push(f);
      else if (isTextLikeFile(f)) texts.push(f);
      else others.push(f);
    });

    for (const f of imgs) { await addChatImageFile(f); }
    for (const f of texts) { await addChatTextFile(f); }
    if (others.length) {
      showTip('⚠ 暂不支持的类型：' + others.map(function (f) { return f.name; }).join('、'));
    }
  }

  if (chatMode) {
    let dragDepth = 0;
    chatMode.addEventListener('dragenter', function (e) {
      e.preventDefault();
      dragDepth++;
      chatMode.classList.add('chat-drag-over');
    });
    chatMode.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    chatMode.addEventListener('dragleave', function () {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) chatMode.classList.remove('chat-drag-over');
    });
    chatMode.addEventListener('drop', function (e) {
      e.preventDefault();
      dragDepth = 0;
      chatMode.classList.remove('chat-drag-over');
      const dt = e.dataTransfer;
      if (!dt) return;
      if (dt.files && dt.files.length) handleDroppedFiles(dt.files);
      else if (dt.getData) {
        const t = dt.getData('text/plain');       // 从别处拖来的纯文本，仍直接进输入框
        if (t) insertTextIntoChat(t);
      }
    });
  }


  document.addEventListener('paste', function (e) {
    if (!chatActive) return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    let hasImg = false;
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) { hasImg = true; addChatImageFile(file); }
      }
    }
    if (hasImg) e.preventDefault();   // ★ 粘贴多张图片也一并挂上
  });

  // ---------- 构建发送给 LLM 的消息（含当前会话历史，最多取最近40条防超长） ----------
  // ★ 说明：OpenAI 兼容接口只有 text / image_url 两种内容类型，没有"文件"类型，
  //   所以附件的正文在这里以文本形式并入消息（与 Chatbox 的行为一致）。
  function fileBlocks(files) {
    if (!files || !files.length) return '';
    return files.map(function (f) {
      return '【附件：' + f.name + '】\n' + (f.content || '') + '\n【附件结束：' + f.name + '】';
    }).join('\n\n');
  }
  function composeUserText(text, files) {
    const blocks = fileBlocks(files);
    const body = text || '';
    if (!blocks) return body;
    return (body ? body + '\n\n' : '') + blocks;
  }

  function buildChatMessages(prompt, images) {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const messages = [{ role: 'system', content: '当前时间是 ' + now + '。你是 Ember小助手，一个乐于助人的AI助手。' }];
    const history = chatMessages.slice(-40);
    history.forEach(function (m) {
      if (m.role === 'user') {
        const text = composeUserText(m.content, m.files);   // ★ 附件正文随消息一起给模型
        const imgs = msgImages(m);
        if (imgs.length) {
          const parts = imgs.map(function (img) { return { type: 'image_url', image_url: { url: img } }; });
          parts.push({ type: 'text', text: text });
          messages.push({ role: 'user', content: parts });
        } else {
          messages.push({ role: 'user', content: text });
        }
      } else {
        messages.push({ role: 'assistant', content: m.content });
      }
    });
    if (images && images.length) {
      const parts = [];
      images.forEach(function (img) { parts.push({ type: 'image_url', image_url: { url: img.dataUrl } }); });
      parts.push({ type: 'text', text: prompt });
      messages.push({ role: 'user', content: parts });
    } else {
      messages.push({ role: 'user', content: prompt });
    }
    return messages;
  }

  // ---------- 流式调用（带当前会话历史） ----------
  async function chatStreamLLM(prompt, onDelta, images, timeoutMs) {
    const A = (typeof window.apiFor === 'function') ? window.apiFor('chat') : currentApi;   // ★ 用对话自己的模型
    if (!A.key) throw new Error('请在设置中填写 API Key');
    const base = (A.url || '').replace(/\/+$/, '');
    const controller = new AbortController();
    if (typeof currentController !== 'undefined') currentController = controller;
    const timer = setTimeout(function () { controller.abort(); }, timeoutMs || 600000);
    try {
      const res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + A.key },
        body: JSON.stringify({ model: A.model, messages: buildChatMessages(prompt, images), temperature: 0.7, stream: true }),
        signal: controller.signal
      });
      if (!res.ok) {
        const errText = await res.text();
        if (typeof window.setScopeDot === 'function') window.setScopeDot('chat', 'red', '连接失败');
        throw new Error('HTTP ' + res.status + ': ' + errText.slice(0, 200));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices && json.choices[0] && json.choices[0].delta;
            if (delta && typeof delta.content === 'string') {
              fullText += delta.content;
              if (onDelta) onDelta(delta.content);
            }
          } catch (e) {}
        }
      }
      if (typeof window.setScopeDot === 'function') window.setScopeDot('chat', 'green', '正常');
      return fullText;

    } finally {
      clearTimeout(timer);
    }
  }
  // ---------- 发送 ----------
  async function sendChat() {
    const text = chatInput.value.trim();
    const imgs = pendingChatImages.slice();
    const files = pendingChatFiles.slice();
    if (!text && !imgs.length && !files.length) return;
    if (sending) return;
    // ★ 按对话自己的模型判断有没有配 Key
    const A = (typeof window.apiFor === 'function') ? window.apiFor('chat') : currentApi;
    if (!A.key) { showTip('请先在设置中配置 API Key'); return; }

    // ★ 新会话自动命名（取第一句用户消息开头）
    const s = getCurrentSession();
    if (s && (s.name === '新对话' || s.name === '历史对话') && text) {
      s.name = text.slice(0, 12);
      renderSessionSelect();
    }

    chatMessages.push({
      role: 'user',
      content: text,
      time: nowTime(),
      images: imgs.length ? imgs : undefined,   // ★ 多张参考图随消息保存
      files: files.length ? files : undefined      // ★ 附件（名称/大小/正文）随消息保存
    });
    saveChat();
    chatInput.value = '';
    clearChatImages();
    clearChatFiles();
    // ★ 若处于搜索状态，发消息后恢复完整列表
    if (chatSearchKeyword) {
      chatSearchKeyword = '';
      if (chatSearchInput) chatSearchInput.value = '';
      if (chatSearchBar) chatSearchBar.style.display = 'none';
    }
    renderChat();

    sending = true;
    setSendMode(true);

/* 停止已由发送键兼任，不再显示独立停止键 */


    // AI 占位气泡
    const aiRow = document.createElement('div');
    aiRow.className = 'chat-row chat-row-ai';
    aiRow.innerHTML =
      '<div class="chat-avatar">🤖</div>' +
      '<div class="chat-bubble-wrap"><div class="chat-bubble chat-bubble-md chat-bubble-typing">思考中...</div>' +
      '<div class="chat-time">' + nowTime() + '</div></div>';
    chatList.appendChild(aiRow);
    const aiBubble = aiRow.querySelector('.chat-bubble');
    scrollToBottom();

    const promptText = text || (files.length ? '（我上传了附件，请阅读附件内容后回答）' : '（图片）');

    let markdown = ''; const metaT0 = performance.now(); let metaT1 = 0;
    try {
      markdown = await chatStreamLLM(promptText, function (chunk) {
        if (!metaT1) metaT1 = performance.now(); markdown += chunk;
        aiBubble.innerHTML = renderMd(markdown);
        scrollToBottom();
      }, imgs.map(function (d) { return { dataUrl: d, name: 'chat-img' }; }), 600000);
    } catch (err) {
      if (err.name === 'AbortError') {
        if (markdown) aiBubble.innerHTML = renderMd(markdown);
        else aiBubble.innerHTML = '<span style="color:var(--text-dim)">（已停止）</span>';
      } else {
        aiBubble.innerHTML = '错误：' + esc(err.message || err);
      }
    } finally {
      sending = false;
      setSendMode(false);

/* 同上：独立停止键保持隐藏 */

      if (markdown) {
        chatMessages.push({ role: 'assistant', content: markdown, time: nowTime(), meta: (typeof window.buildMetaHTML === 'function') ? window.buildMetaHTML((typeof window.apiFor === 'function' ? window.apiFor('chat') : currentApi).model, metaT0, metaT1, promptText, markdown) : '' });

        saveChat();
      }
      renderChat();
    }
  }


  chatSendBtn.addEventListener('click', function () { if (sending) { if (typeof currentController !== 'undefined' && currentController) currentController.abort(); return; } sendChat(); });

  chatStopBtn.addEventListener('click', function () {
    if (typeof currentController !== 'undefined' && currentController) currentController.abort();
  });
  chatInput.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); sendChat(); }
  });
// ======================== ★ 发送键兼任停止键（同位置同形态，只换颜色和内容） ========================
function setSendMode(stop) {
  if (!chatSendBtn) return;
  chatSendBtn.classList.toggle('stop-mode', !!stop);
  chatSendBtn.disabled = false;          // ★ 不能禁用，否则"停止"点不了
  chatSendBtn.innerHTML = stop
    ? '<i class="fas fa-stop"></i> 停止'
    : '<i class="fas fa-paper-plane"></i> 发送<kbd class="kbd-hint">Ctrl ↵</kbd>';
}


  // ---------- 清空（只清当前会话） ----------
  chatClearBtn.addEventListener('click', async function () {
    if (!(await showConfirm('确定清空当前对话吗？'))) return;
    chatMessages.length = 0;
    chatSearchKeyword = '';
    if (chatSearchInput) chatSearchInput.value = '';
    if (chatSearchBar) chatSearchBar.style.display = 'none';
    renderChat();
    saveChat();
    showTip('当前对话已清空');
  });

  // ---------- 导出 / 搜索 / 多会话绑定 ----------
  if (chatExportBtn) chatExportBtn.addEventListener('click', exportChat);
  if (chatSearchBtn) {
    chatSearchBtn.addEventListener('click', function () {
      chatSearchBar.style.display = chatSearchBar.style.display === 'none' ? 'flex' : 'none';
      if (chatSearchBar.style.display === 'flex' && chatSearchInput) chatSearchInput.focus();
    });
  }
  if (chatSearchInput) {
    chatSearchInput.addEventListener('input', function () {
      chatSearchKeyword = this.value;
      renderChatFiltered();
    });
  }
  if (chatSearchClose) {
    chatSearchClose.addEventListener('click', function () {
      chatSearchKeyword = '';
      if (chatSearchInput) chatSearchInput.value = '';
      if (chatSearchBar) chatSearchBar.style.display = 'none';
      renderChat();
    });
  }
  if (chatNewBtn) chatNewBtn.addEventListener('click', newSession);
  if (chatSessionSelect) {
    chatSessionSelect.addEventListener('change', function () {
      if (this.value) switchSession(this.value);
    });
  }
  if (chatSessionDel) {
    chatSessionDel.addEventListener('click', function () {
      if (!currentSessionId) return;
      deleteSession(currentSessionId);
    });
  }

  // ---------- 设置按钮（打开设置弹窗） ----------
  const chatSettingsBtn = document.getElementById('chatSettingsBtn');
  if (chatSettingsBtn) {
    chatSettingsBtn.addEventListener('click', function () {
      const sb = document.getElementById('settingsBtn');
      if (sb) sb.click();
    });
  }
  // ★ 供主页统一切换时同步对话下拉
  window.__syncChatModelSelect = function () { renderModelOptions(); };

  // ---------- 初始化 ----------
  loadChat();
  const homeBtnInit = document.getElementById('homeSwitchBtn');
  if (homeBtnInit) homeBtnInit.classList.add('active');
})();
