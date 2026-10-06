// ======================== DOM 引用 ========================
const appTitle = document.getElementById('appTitle') || { style: {}, textContent: '' };
const appTitleInput = document.getElementById('appTitleInput');
const input1 = document.getElementById('input1');
const input2 = document.getElementById('input2');
const output = document.getElementById('output');
const runBtn = document.getElementById('runBtn');
const stopBtn = document.getElementById('stopBtn');
const settingsBtn = document.getElementById('settingsBtn');
const modal = document.getElementById('modal');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');
const themeSelect = document.getElementById('themeSelect');
const chatFontSelect = document.getElementById('chatFontSelect');
const apiList = document.getElementById('apiList');
const addApiBtn = document.getElementById('addApiBtn');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const copyBtn = document.getElementById('copyBtn');
const saveResultBtn = document.getElementById('saveResultBtn');
const homeModelSelect = document.getElementById('homeModelSelect');

const presetModal = document.getElementById('presetModal');
const presetEditBtn = document.getElementById('presetEditBtn');
const presetCloseBtn = document.getElementById('presetCloseBtn');
const presetAddBtn = document.getElementById('presetAddBtn');
const presetSaveBtn = document.getElementById('presetSaveBtn');
const presetDeleteBtn = document.getElementById('presetDeleteBtn');
const presetSelect = document.getElementById('presetSelect');
const presetList = document.getElementById('presetList');
const presetNameInput = document.getElementById('presetNameInput');
const presetContentInput = document.getElementById('presetContentInput');

const historyBtn = document.getElementById('historyBtn');
const historyOverlay = document.getElementById('historyOverlay');
const historyCloseBtn = document.getElementById('historyCloseBtn');
const historyClearBtn = document.getElementById('historyClearBtn');
const historyListEl = document.getElementById('historyList');

const memRoundsInput = document.getElementById('memRoundsInput');
const clearMemBtn = document.getElementById('clearMemBtn');

const imgPreviewBar = document.getElementById('imgPreviewBar');

const findInput = document.getElementById('findInput');
const findMode = document.getElementById('findMode');
const replaceInput = document.getElementById('replaceInput');
const findRunBtn = document.getElementById('findRunBtn');

// ======================== 标题模式 ========================
const TITLE_MODE = window.TITLE_MODE === 'locked' ? 'locked' : 'editable';
const titleEditSection = document.getElementById('titleEditSection');
if (TITLE_MODE === 'locked' && titleEditSection) {
  titleEditSection.style.display = 'none';
}

// ======================== 数据结构 ========================
let apis = [];
let activeApiId = null;
let currentApi = { url: 'https://api.deepseek.com', key: '', model: 'deepseek-v4-flash', vision: false };

let presets = [];
let deletedPresetIds = [];
let currentEditingPresetId = null;

let historyList = [];
const HISTORY_KEY = 'llm_history';
const HISTORY_MAX = 50;

let convHistory = [];
const CONV_KEY = 'llm_conv_history';
const CONV_MAX = 40;

let pendingImages = [];

// ======================== 主题系统 ========================
const THEMES = {
  default: {
    name: '翠绿（暗色）',
    bgStart: '#0b0d0f', bgEnd: '#131619',
    btn: '#3ecf8e', btnDark: '#2ea877', btnText: '#07231a',
    textMain: '#e8eaed', titleColor: '#f2f4f6',
    inputBg: '#0d0f12', inputText: '#e8eaed', placeholder: '#5f6770',
    inputBorder: 'rgba(255,255,255,0.1)',
    accent: '#3ecf8e', accentDark: '#2ea877',
    accentSoft: 'rgba(62,207,142,0.12)', accentSofter: 'rgba(62,207,142,0.06)',
    borderAccent: 'rgba(62,207,142,0.22)', borderAccentStrong: 'rgba(62,207,142,0.4)',
    cardBg: 'rgba(23,26,30,0.96)', cardBorder: 'rgba(255,255,255,0.07)',
    cardHeaderStart: '#171a1e', cardHeaderEnd: '#14171a',
    modalBg: '#16191d', modalBodyBg: '#101216',
    panelBg: '#16191d', panelHover: '#1d2126',
    panelInputBg: '#0d0f12', panelInputBorder: 'rgba(255,255,255,0.09)',
    textSoft: '#e8eaed', textMuted: '#9aa3ad', textDim: '#5f6770',
    statusBg: 'rgba(255,255,255,0.04)', overlayBg: 'rgba(0,0,0,0.55)',
    mdTitle: '#f2f4f6', mdText: '#d8dce1',
    mdCodeBg: 'rgba(255,255,255,0.08)', mdCodeColor: '#4ade80',
    mdPreBg: '#0b0d0f', mdPreBorder: 'rgba(255,255,255,0.09)',
    mdQuoteColor: '#9aa3ad', mdTableBorder: 'rgba(255,255,255,0.12)',
    mdTableThBg: 'rgba(62,207,142,0.08)', mdLink: '#4ade80', mdHr: 'rgba(255,255,255,0.1)',
    historyHeaderStart: '#1c2024', historyHeaderEnd: '#14171a', historyHeaderText: '#e8eaed',
    toastBg: 'rgba(18,21,24,0.95)', toastBorder: 'rgba(62,207,142,0.35)',
    scrollbar: 'rgba(255,255,255,0.12)', scrollbarHover: 'rgba(255,255,255,0.22)',
    frMarkBg: 'rgba(62,207,142,0.35)',
    icons: {
      history: 'fas fa-history', settings: 'fas fa-cog', input: 'fas fa-comment-dots', preset: 'fas fa-cog',
      presetBadge: 'fas fa-robot', output: 'fas fa-lightbulb', badge: 'fas fa-sparkles', run: 'fas fa-paper-plane',
      settingsTitle: 'fas fa-sliders-h', api: 'fas fa-plug', appearance: 'fas fa-palette', conv: 'fas fa-comments',
      presetList: 'fas fa-list', historyTitle: 'fas fa-history', pin: 'fas fa-thumbtack', clock: 'fas fa-clock'
    }
  },
  blue: {
    name: '湛蓝（暗色）',
    bgStart: '#0a0d14', bgEnd: '#10151f',
    btn: '#4c8dff', btnDark: '#3a6fd8', btnText: '#061426',
    textMain: '#e8ecf2', titleColor: '#f2f5f9',
    inputBg: '#0c1018', inputText: '#e8ecf2', placeholder: '#5a6675',
    inputBorder: 'rgba(255,255,255,0.1)',
    accent: '#4c8dff', accentDark: '#3a6fd8',
    accentSoft: 'rgba(76,141,255,0.12)', accentSofter: 'rgba(76,141,255,0.06)',
    borderAccent: 'rgba(76,141,255,0.22)', borderAccentStrong: 'rgba(76,141,255,0.4)',
    cardBg: 'rgba(20,24,32,0.96)', cardBorder: 'rgba(255,255,255,0.07)',
    cardHeaderStart: '#151a24', cardHeaderEnd: '#12161e',
    modalBg: '#141922', modalBodyBg: '#0e1219',
    panelBg: '#141922', panelHover: '#1b2230',
    panelInputBg: '#0c1018', panelInputBorder: 'rgba(255,255,255,0.09)',
    textSoft: '#e8ecf2', textMuted: '#98a3b3', textDim: '#5a6675',
    statusBg: 'rgba(255,255,255,0.04)', overlayBg: 'rgba(0,0,0,0.55)',
    mdTitle: '#f2f5f9', mdText: '#d8dde6',
    mdCodeBg: 'rgba(76,141,255,0.1)', mdCodeColor: '#7ab0ff',
    mdPreBg: '#0a0d14', mdPreBorder: 'rgba(255,255,255,0.09)',
    mdQuoteColor: '#98a3b3', mdTableBorder: 'rgba(255,255,255,0.12)',
    mdTableThBg: 'rgba(76,141,255,0.08)', mdLink: '#7ab0ff', mdHr: 'rgba(255,255,255,0.1)',
    historyHeaderStart: '#1a2130', historyHeaderEnd: '#12161e', historyHeaderText: '#e8ecf2',
    toastBg: 'rgba(14,18,25,0.95)', toastBorder: 'rgba(76,141,255,0.35)',
    scrollbar: 'rgba(255,255,255,0.12)', scrollbarHover: 'rgba(255,255,255,0.22)',
    frMarkBg: 'rgba(76,141,255,0.35)',
    icons: {
      history: 'fas fa-clock-rotate-left', settings: 'fas fa-sliders-h', input: 'fas fa-keyboard', preset: 'fas fa-list-check',
      presetBadge: 'fas fa-microchip', output: 'fas fa-terminal', badge: 'fas fa-wand-magic-sparkles', run: 'fas fa-bolt',
      settingsTitle: 'fas fa-sliders-h', api: 'fas fa-server', appearance: 'fas fa-fill-drip', conv: 'fas fa-message',
      presetList: 'fas fa-table-list', historyTitle: 'fas fa-clock-rotate-left', pin: 'fas fa-thumbtack', clock: 'fas fa-stopwatch'
    }
  },
  pink: {
    name: '樱粉（暗色）',
    bgStart: '#160d12', bgEnd: '#1d1219',
    btn: '#ff6b9d', btnDark: '#e0548a', btnText: '#2a0717',
    textMain: '#f0e8ec', titleColor: '#f9f2f5',
    inputBg: '#170e14', inputText: '#f0e8ec', placeholder: '#6d5763',
    inputBorder: 'rgba(255,255,255,0.1)',
    accent: '#ff6b9d', accentDark: '#e0548a',
    accentSoft: 'rgba(255,107,157,0.12)', accentSofter: 'rgba(255,107,157,0.06)',
    borderAccent: 'rgba(255,107,157,0.22)', borderAccentStrong: 'rgba(255,107,157,0.4)',
    cardBg: 'rgba(30,20,26,0.96)', cardBorder: 'rgba(255,255,255,0.07)',
    cardHeaderStart: '#211622', cardHeaderEnd: '#1b1118',
    modalBg: '#20151d', modalBodyBg: '#160e14',
    panelBg: '#20151d', panelHover: '#2a1c24',
    panelInputBg: '#160e14', panelInputBorder: 'rgba(255,255,255,0.09)',
    textSoft: '#f0e8ec', textMuted: '#b09aa6', textDim: '#6d5763',
    statusBg: 'rgba(255,255,255,0.04)', overlayBg: 'rgba(0,0,0,0.55)',
    mdTitle: '#f9f2f5', mdText: '#e0d4da',
    mdCodeBg: 'rgba(255,107,157,0.1)', mdCodeColor: '#ff9dbf',
    mdPreBg: '#160d12', mdPreBorder: 'rgba(255,255,255,0.09)',
    mdQuoteColor: '#b09aa6', mdTableBorder: 'rgba(255,255,255,0.12)',
    mdTableThBg: 'rgba(255,107,157,0.08)', mdLink: '#ff9dbf', mdHr: 'rgba(255,255,255,0.1)',
    historyHeaderStart: '#2a1a22', historyHeaderEnd: '#1b1118', historyHeaderText: '#f0e8ec',
    toastBg: 'rgba(22,14,20,0.95)', toastBorder: 'rgba(255,107,157,0.35)',
    scrollbar: 'rgba(255,255,255,0.12)', scrollbarHover: 'rgba(255,255,255,0.22)',
    frMarkBg: 'rgba(255,107,157,0.35)',
    icons: {
      history: 'fas fa-bookmark', settings: 'fas fa-wand-sparkles', input: 'fas fa-feather', preset: 'fas fa-crown',
      presetBadge: 'fas fa-heart', output: 'fas fa-gem', badge: 'fas fa-heart', run: 'fas fa-rocket',
      settingsTitle: 'fas fa-sliders-h', api: 'fas fa-cloud', appearance: 'fas fa-brush', conv: 'fas fa-comment-dots',
      presetList: 'fas fa-box-open', historyTitle: 'fas fa-bookmark', pin: 'fas fa-thumbtack', clock: 'fas fa-hourglass-half'
    }
  },
  orange: {
    name: '橙光（暗色）',
    bgStart: '#0d0e10', bgEnd: '#15171a',
    btn: '#ff9a3c', btnDark: '#e07f1f', btnText: '#1a1105',
    textMain: '#e9ebee', titleColor: '#f5f6f8',
    inputBg: '#101214', inputText: '#e9ebee', placeholder: '#5f6670',
    inputBorder: 'rgba(255,255,255,0.1)',
    accent: '#ff9a3c', accentDark: '#e07f1f',
    accentSoft: 'rgba(255,154,60,0.12)', accentSofter: 'rgba(255,154,60,0.06)',
    borderAccent: 'rgba(255,154,60,0.22)', borderAccentStrong: 'rgba(255,154,60,0.4)',
    cardBg: 'rgba(22,24,28,0.96)', cardBorder: 'rgba(255,255,255,0.07)',
    cardHeaderStart: '#17191d', cardHeaderEnd: '#141619',
    modalBg: '#16181c', modalBodyBg: '#0f1114',
    panelBg: '#16181c', panelHover: '#1e2126',
    panelInputBg: '#0f1114', panelInputBorder: 'rgba(255,255,255,0.09)',
    textSoft: '#e9ebee', textMuted: '#9aa2ac', textDim: '#5f6670',
    statusBg: 'rgba(255,255,255,0.04)', overlayBg: 'rgba(0,0,0,0.55)',
    mdTitle: '#f5f6f8', mdText: '#d9dde2',
    mdCodeBg: 'rgba(255,154,60,0.1)', mdCodeColor: '#ffb36b',
    mdPreBg: '#0d0e10', mdPreBorder: 'rgba(255,255,255,0.09)',
    mdQuoteColor: '#9aa2ac', mdTableBorder: 'rgba(255,255,255,0.12)',
    mdTableThBg: 'rgba(255,154,60,0.08)', mdLink: '#ffb36b', mdHr: 'rgba(255,255,255,0.1)',
    historyHeaderStart: '#1a1d21', historyHeaderEnd: '#141619', historyHeaderText: '#e9ebee',
    toastBg: 'rgba(15,17,20,0.95)', toastBorder: 'rgba(255,154,60,0.35)',
    scrollbar: 'rgba(255,255,255,0.12)', scrollbarHover: 'rgba(255,255,255,0.22)',
    frMarkBg: 'rgba(255,154,60,0.35)',
    icons: {
      history: 'fas fa-history', settings: 'fas fa-cog', input: 'fas fa-comment-dots', preset: 'fas fa-cog',
      presetBadge: 'fas fa-robot', output: 'fas fa-lightbulb', badge: 'fas fa-sparkles', run: 'fas fa-paper-plane',
      settingsTitle: 'fas fa-sliders-h', api: 'fas fa-plug', appearance: 'fas fa-palette', conv: 'fas fa-comments',
      presetList: 'fas fa-list', historyTitle: 'fas fa-history', pin: 'fas fa-thumbtack', clock: 'fas fa-clock'
    }
  }

};

// 应用主题
function applyTheme(themeKey) {
  const t = THEMES[themeKey] || THEMES.default;
  const root = document.documentElement.style;
  root.setProperty('--bg-start', t.bgStart);
  root.setProperty('--bg-end', t.bgEnd);
  root.setProperty('--bg-color', `linear-gradient(135deg, ${t.bgStart} 0%, ${t.bgEnd} 100%)`);
  root.setProperty('--btn-bg', t.btn);
  root.setProperty('--btn-bg-dark', t.btnDark);
  root.setProperty('--btn-text', t.btnText);
  root.setProperty('--text-main', t.textMain);
  root.setProperty('--title-color', t.titleColor);
  root.setProperty('--input-bg', t.inputBg);
  root.setProperty('--input-text', t.inputText);
  root.setProperty('--placeholder', t.placeholder);
  root.setProperty('--input-border', t.inputBorder);
  root.setProperty('--accent', t.accent);
  root.setProperty('--accent-dark', t.accentDark);
  root.setProperty('--accent-soft', t.accentSoft);
  root.setProperty('--accent-softer', t.accentSofter);
  root.setProperty('--border-accent', t.borderAccent);
  root.setProperty('--border-accent-strong', t.borderAccentStrong);
  root.setProperty('--card-bg', t.cardBg);
  root.setProperty('--card-border', t.cardBorder);
  root.setProperty('--card-header-start', t.cardHeaderStart);
  root.setProperty('--card-header-end', t.cardHeaderEnd);
  root.setProperty('--modal-bg', t.modalBg);
  root.setProperty('--modal-body-bg', t.modalBodyBg);
  root.setProperty('--panel-bg', t.panelBg);
  root.setProperty('--panel-hover', t.panelHover);
  root.setProperty('--panel-input-bg', t.panelInputBg);
  root.setProperty('--panel-input-border', t.panelInputBorder);
  root.setProperty('--text-soft', t.textSoft);
  root.setProperty('--text-muted', t.textMuted);
  root.setProperty('--text-dim', t.textDim);
  root.setProperty('--status-bg', t.statusBg);
  root.setProperty('--overlay-bg', t.overlayBg);
  root.setProperty('--md-title', t.mdTitle);
  root.setProperty('--md-text', t.mdText);
  root.setProperty('--md-code-bg', t.mdCodeBg);
  root.setProperty('--md-code-color', t.mdCodeColor);
  root.setProperty('--md-pre-bg', t.mdPreBg);
  root.setProperty('--md-pre-border', t.mdPreBorder);
  root.setProperty('--md-quote-color', t.mdQuoteColor);
  root.setProperty('--md-table-border', t.mdTableBorder);
  root.setProperty('--md-table-th-bg', t.mdTableThBg);
  root.setProperty('--md-link', t.mdLink);
  root.setProperty('--md-hr', t.mdHr);
  root.setProperty('--history-header-start', t.historyHeaderStart);
  root.setProperty('--history-header-end', t.historyHeaderEnd);
  root.setProperty('--history-header-text', t.historyHeaderText);
  root.setProperty('--toast-bg', t.toastBg);
  root.setProperty('--toast-border', t.toastBorder);
  root.setProperty('--scrollbar', t.scrollbar);
  root.setProperty('--scrollbar-hover', t.scrollbarHover);
  root.setProperty('--fr-mark-bg', t.frMarkBg);
  if (t.icons) {
    document.querySelectorAll('[data-icon-key]').forEach(el => {
      const cls = t.icons[el.dataset.iconKey];
      if (cls) el.className = cls;
    });
  }
  localStorage.setItem('llm_theme_key', themeKey);
}

// 应用对话文字大小（只影响对话模式的输入框与消息气泡）
const CHAT_FONT_SIZES = { small: '14px', medium: '16px', large: '18px' };
function applyChatFontSize(size) {
  const px = CHAT_FONT_SIZES[size] || CHAT_FONT_SIZES.small;
  document.documentElement.style.setProperty('--chat-font-size', px);
  localStorage.setItem('llm_chat_font_size', size || 'small');
}

// ======================== 兼容旧缓存 ========================
const THEME_VERSION = 'v19_theme';
if (localStorage.getItem('llm_theme_version') !== THEME_VERSION) {
  localStorage.removeItem('llm_bgColor');
  localStorage.removeItem('llm_bgColorEnd');
  localStorage.removeItem('llm_btnColor');
  localStorage.removeItem('llm_textColor');
  localStorage.removeItem('llm_inputBgColor');
  localStorage.removeItem('llm_titleColor');
  localStorage.removeItem('llm_app_title');
  localStorage.setItem('llm_theme_version', THEME_VERSION);
}

// ======================== Electron 检测 ========================
let isElectron = false;
let ipc = null;
try {
  const { ipcRenderer } = require('electron');
  isElectron = true;
  ipc = ipcRenderer;
} catch (e) { isElectron = false; }

// ======================== 工具函数 ========================
function generateId() { return 'api_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }

function makeDefaultApi() {
  return { id: generateId(), name: 'DeepSeek', url: 'https://api.deepseek.com', key: '', model: 'deepseek-v4-flash', vision: false, genImage: false };
}

function escapeHtml(str) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }


function buildApiUrl(api) { return (api.url || '').replace(/\/+$/, '') + '/chat/completions'; }

function darkenColor(hex, factor = 0.75) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  const r = Math.round(((num >> 16) & 255) * factor);
  const g = Math.round(((num >> 8) & 255) * factor);
  const b = Math.round((num & 255) * factor);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// ======================== Markdown 渲染 ========================
function renderMarkdown(text) {
  const src = String(text == null ? '' : text);
  if (window.marked) {
    try { return (typeof marked.parse === 'function') ? marked.parse(src) : marked(src); }
    catch (e) { return escapeHtml(src).replace(/\n/g, '<br>'); }
  }
  return escapeHtml(src).replace(/\n/g, '<br>');
}

function markdownToPlainText(markdown) {
  if (window.marked) {
    try {
      const temp = document.createElement('div');
      temp.innerHTML = marked.parse(String(markdown == null ? '' : markdown));

      return temp.innerText;
    } catch (e) { return markdown || ''; }
  }
  return markdown || '';
}
function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch (e) { return false; }
}

// ======================== 提示气泡 ========================
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2000);
}
window.alert = function (msg) { showToast(msg); };

// ======================== 完成提示音 ========================
function playDoneSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    const notes = [
      { freq: 1046.5, delay: 0, dur: 0.9 },
      { freq: 1318.5, delay: 0.18, dur: 1.0 }
    ];
    notes.forEach(n => {
      const t0 = ctx.currentTime + n.delay;
      [1, 2, 3].forEach((mult, idx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = n.freq * mult;
        const g = ctx.createGain();
        const vol = [0.5, 0.15, 0.06][idx];
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
        osc.connect(g);
        g.connect(master);
        osc.start(t0);
        osc.stop(t0 + n.dur + 0.05);
      });
    });
  } catch (e) {}
}

// ======================== 对话记忆 ========================
function loadConv() {
  try {
    const saved = localStorage.getItem(CONV_KEY);
    convHistory = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(convHistory)) convHistory = [];
  } catch (e) { convHistory = []; }
}
function saveConv() {
  convHistory = convHistory.slice(-CONV_MAX);
  localStorage.setItem(CONV_KEY, JSON.stringify(convHistory));
}
function clearConv() { convHistory = []; saveConv(); }
function getMemRounds() {
  const val = parseInt(localStorage.getItem('llm_mem_rounds'), 10);
  if (isNaN(val) || val < 0) return 5;
  return Math.min(val, 20);
}
function buildMessages(prompt, images) {
  const currentTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const messages = [{ role: 'system', content: '当前时间是 ' + currentTime + '。你是Ember小助手，一个乐于助人的助手。' }];
  const memRounds = getMemRounds();
  if (memRounds > 0 && convHistory.length > 0) {
    const recent = convHistory.slice(-memRounds * 2);
    messages.push(...recent);
  }
  if (images && images.length > 0) {
    const content = [];
    images.forEach(img => content.push({ type: 'image_url', image_url: { url: img.dataUrl } }));
    content.push({ type: 'text', text: prompt });
    messages.push({ role: 'user', content });
  } else {
    messages.push({ role: 'user', content: prompt });
  }
  return messages;
}
function rememberTurn(userPrompt, assistantText) {
  if (!assistantText || !assistantText.trim()) return;
  convHistory.push({ role: 'user', content: userPrompt });
  convHistory.push({ role: 'assistant', content: assistantText });
  saveConv();
}

// ======================== 初始化数据 ========================
function loadData() {
  const savedTheme = localStorage.getItem('llm_theme_key') || 'default';
  applyTheme(savedTheme);
  applyChatFontSize(localStorage.getItem('llm_chat_font_size') || 'small');

  if (TITLE_MODE !== 'locked') {
    const savedTitle = localStorage.getItem('llm_app_title');
    if (savedTitle) appTitle.textContent = savedTitle;
  }

  const savedApis = localStorage.getItem('llm_apis');
  if (savedApis) {
    try {
      apis = JSON.parse(savedApis);
      if (!Array.isArray(apis) || apis.length === 0) apis = [makeDefaultApi()];
      apis.forEach(function (a) { if (a.genImage === undefined) a.genImage = false; });
    } catch (e) { apis = [makeDefaultApi()]; }
  } else {
    apis = [makeDefaultApi()];
  }

  const savedActive = localStorage.getItem('llm_active_api_id');
  if (savedActive && apis.find(a => a.id === savedActive)) activeApiId = savedActive;
  else activeApiId = apis[0].id;

  loadModelScopes();                    // ★ 读各页面的模型（含旧数据迁移）
  activeApiId = scopeApiId('home');     // ★ 全局 currentApi 只跟随主页
  syncCurrentApi();
  renderHomeModelOptions();
}

// ======================== ★ 按页面的模型（每个页面各自记住自己的模型） ========================
const MODEL_SCOPE_KEY = 'llm_active_api_by_mode';
const MODEL_SCOPES = ['home', 'chat', 'storyboard', 'workshop', 'agent'];

let modelScopes = {};          // { home, chat, storyboard, workshop }

function loadModelScopes() {
  try { modelScopes = JSON.parse(localStorage.getItem(MODEL_SCOPE_KEY) || '{}') || {}; } catch (e) { modelScopes = {}; }
  if (!modelScopes || typeof modelScopes !== 'object') modelScopes = {};
  // ★ 迁移：把旧的单一值铺到每一格（只补缺失/无效的，不覆盖已有选择）
  const legacy = localStorage.getItem('llm_active_api_id');
  const def = (legacy && apis.find(function (a) { return a.id === legacy; }))
    ? legacy
    : (apis[0] ? apis[0].id : '');
  MODEL_SCOPES.forEach(function (s) {
    if (!modelScopes[s] || !apis.find(function (a) { return a.id === modelScopes[s]; })) modelScopes[s] = def;
  });
  saveModelScopes();
}
function saveModelScopes() {
  try { localStorage.setItem(MODEL_SCOPE_KEY, JSON.stringify(modelScopes)); } catch (e) {}
}
// 某个页面当前选中的 apiId
function scopeApiId(scope) {
  if (modelScopes[scope] && apis.find(function (a) { return a.id === modelScopes[scope]; })) return modelScopes[scope];
  return activeApiId;
}
// ★ 某个页面发请求时该用的 api 对象（各模式用它替代直接读 currentApi）
function apiFor(scope) {
  const api = apis.find(function (a) { return a.id === scopeApiId(scope); });
  return api || currentApi;
}
window.scopeApiId = scopeApiId;
window.apiFor = apiFor;

// ★ 按页面切换模型：setActiveModel('chat', id) / setActiveModel('home', id)
//    只传一个参数时视为主页（兼容旧调用）
function setActiveModel(scopeOrId, maybeId) {
  const scope = (maybeId === undefined) ? 'home' : scopeOrId;
  const apiId = (maybeId === undefined) ? scopeOrId : maybeId;
  if (!apis.find(function (a) { return a.id === apiId; })) return;

  modelScopes[scope] = apiId;
  saveModelScopes();

  if (scope === 'home') {
    activeApiId = apiId;                                 // ★ 全局 currentApi 只跟随主页
    localStorage.setItem('llm_active_api_id', apiId);    // 兼容旧键
    syncCurrentApi();
    renderHomeModelOptions();
    checkApiStatus('home');
  } else {
    checkApiStatus(scope);
  }

  // 刷新各页面的下拉（它们各自按自己的 scope 显示选中项）
  if (typeof window.__syncChatModelSelect === 'function') window.__syncChatModelSelect();
  if (typeof window.__syncSbModelSelect === 'function') window.__syncSbModelSelect();
  if (typeof window.__syncWsModelSelect === 'function') window.__syncWsModelSelect();
  if (typeof window.__syncAgentModelSelect === 'function') window.__syncAgentModelSelect();

}
function renderHomeModelOptions() {
  if (!homeModelSelect) return;
  let html = '';
  apis.forEach(function (a) {
    const sel = (a.id === activeApiId) ? ' selected' : '';
    html += '<option value="' + escapeHtml(a.id) + '"' + sel + '>' + escapeHtml(a.model) + '</option>';
  });
  homeModelSelect.innerHTML = html || '<option value="">未配置</option>';
}

if (homeModelSelect) {
  homeModelSelect.addEventListener('change', function () {
    const id = this.value;
    if (!id) return;
    setActiveModel('home', id);       // ★ 主页的模型
    showToast('已切换模型：' + this.options[this.selectedIndex].text);
  });
}

function syncCurrentApi() {
  const api = apis.find(a => a.id === activeApiId);
  if (api) {
    currentApi.url = api.url || 'https://api.deepseek.com';
    currentApi.key = api.key || '';
    currentApi.model = api.model || 'deepseek-v4-flash';
    currentApi.vision = !!api.vision;
  }
  renderImgPreview();   // ★ 模型换了 → 图片上传区的显隐与提示要跟着更新（否则从不支持换成支持时，框不会出现）
}


function saveAllToStorage() {
  localStorage.setItem('llm_apis', JSON.stringify(apis));
  localStorage.setItem('llm_active_api_id', activeApiId);
  localStorage.setItem('llm_mem_rounds', memRoundsInput.value);
  if (TITLE_MODE !== 'locked') {
    localStorage.setItem('llm_app_title', appTitle.textContent);
  }
  // ★ 写回备份文件（--no-sandbox 下 localStorage 是内存临时存储，写文件才能持久化 API 修改）
  try {
    const fs = require('fs');
    const path = require('path');
    fs.writeFileSync(path.join(__dirname, '..', '_apis_recovered.json'), JSON.stringify(apis, null, 2), 'utf8');
  } catch (e) {}
}

// ======================== 渲染 API 列表 ========================
function renderApiList() {
  apiList.innerHTML = '';
  apis.forEach(api => {
    const item = document.createElement('div');
    item.className = 'api-item' + (api.id === activeApiId ? ' active' : '');
    item.dataset.id = api.id;
    item.innerHTML = `
      <div class="api-row">
        <label><i class="fas fa-tag"></i> 名称</label>
        <input type="text" class="api-name-input" value="${escapeHtml(api.name)}" placeholder="例如：DeepSeek">
      </div>

      <div class="api-row">
        <label><i class="fas fa-link"></i> 地址</label>
        <input type="text" class="api-url-input" value="${escapeHtml(api.url)}" placeholder="https://api.deepseek.com">
      </div>
      <div class="api-row">
        <label><i class="fas fa-key"></i> Key</label>
        <input type="password" class="api-key-input" value="${escapeHtml(api.key)}" placeholder="sk-...">
      </div>
      <div class="api-row">
        <label><i class="fas fa-cube"></i> 模型</label>
        <input type="text" class="api-model-input" value="${escapeHtml(api.model)}" placeholder="deepseek-v4-flash">
      </div>
      <div class="api-row vision-row">
        <label><i class="fas fa-eye"></i> 视觉</label>
        <label class="vision-toggle">
          <input type="checkbox" class="vision-check" ${api.vision ? 'checked' : ''}>
          <span>该模型支持看图</span>
        </label>
      </div>
      <div class="api-row vision-row">
        <label><i class="fas fa-magic"></i> 生图</label>
        <label class="vision-toggle">
          <input type="checkbox" class="gen-check" ${api.genImage ? 'checked' : ''}>
          <span>该模型支持生图（勾选后才会出现在画布生图节点的模型下拉中）</span>
        </label>
      </div>
      <div class="api-actions">
        <button class="test-btn"><i class="fas fa-flask"></i> 测试</button>
        <span class="test-result"></span>
        <button class="delete-btn"><i class="fas fa-trash"></i> 删除</button>
      </div>
    `;
    item.querySelector('.test-btn').addEventListener('click', async function () {
      const resultEl = item.querySelector('.test-result');
      await testApiFromInputs(item, resultEl, this);
    });
    item.querySelector('.delete-btn').addEventListener('click', async function () {
      if (apis.length <= 1) { alert('⚠️ 至少需要保留一个 API 配置。'); return; }
      if (!(await showConfirm(`确定删除“${api.name || '未命名'}”吗？`, { danger: true }))) return;
      apis = apis.filter(a => a.id !== api.id);
      if (activeApiId === api.id) activeApiId = apis[0].id;
      // ★ 顺手把主页那一格指向新的当前模型
      if (modelScopes.home === api.id) { modelScopes.home = activeApiId; saveModelScopes(); }
      renderApiList();
      syncCurrentApi();
      checkApiStatus();
    });
    apiList.appendChild(item);
  });
}

// ======================== 测试 API ========================
async function testApiFromInputs(item, resultEl, testBtn) {
  const url = item.querySelector('.api-url-input').value.trim().replace(/\/+$/, '');
  const key = item.querySelector('.api-key-input').value.trim();
  const model = item.querySelector('.api-model-input').value.trim();
  if (!url) { resultEl.innerHTML = '❌ URL 为空'; resultEl.className = 'test-result error'; return; }
  if (!key) { resultEl.innerHTML = '❌ Key 为空'; resultEl.className = 'test-result error'; return; }
  testBtn.disabled = true;
  testBtn.innerHTML = '⏳ 检测中...';
  resultEl.textContent = '';
  resultEl.className = 'test-result';
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: model || 'deepseek-v4-flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      signal: controller.signal
    });
    if (!res.ok) { const errText = await res.text(); throw new Error(`HTTP ${res.status}: ${errText.slice(0, 100)}`); }
    const data = await res.json();
    if (data.choices && data.choices[0]) {
      resultEl.innerHTML = '✅ 连接正常';
      resultEl.className = 'test-result success';
    } else {
      resultEl.innerHTML = '⚠️ 返回格式异常';
      resultEl.className = 'test-result error';
    }
  } catch (err) {
    if (err.name === 'AbortError') resultEl.innerHTML = '⏱️ 请求超时';
    else resultEl.innerHTML = '❌ ' + escapeHtml(err.message || '失败');
    resultEl.className = 'test-result error';
  } finally {
    clearTimeout(timeoutTimer);
    testBtn.disabled = false;
    testBtn.innerHTML = '🧪 测试';
  }
}

const scopeChecking = {};
// ★ 各页面对应的指示灯 id（home 用主页灯，其余用各模式自己的灯）
const SCOPE_DOT = { home: 'statusDot', chat: 'chatStatusDot', storyboard: 'sbStatusDot', workshop: 'wsStatusDot', agent: 'agStatusDot' };

function setScopeDot(scope, type, msg) {
  const label = type === 'green' ? '正常' : type === 'yellow' ? '缓慢' : type === 'red' ? '断开' : '未检测';
  if (scope === 'home') {
    if (statusDot) {
      statusDot.classList.remove('green', 'yellow', 'red');
      if (type !== 'gray') statusDot.classList.add(type);
    }
    const modelName = currentApi.model || '--';
    if (statusText) statusText.textContent = `正在使用模型：${modelName}（${msg || label}）`;
    return;
  }
  const dot = document.getElementById(SCOPE_DOT[scope]);
  if (!dot) return;
  dot.classList.remove('green', 'yellow', 'red', 'gray');
  dot.classList.add(type === 'green' ? 'green' : type === 'yellow' ? 'yellow' : type === 'red' ? 'red' : 'gray');
  dot.title = '模型状态：' + label;
}
function setStatus(type, msg) {
  setScopeDot('home', type, msg);
}
window.setScopeDot = setScopeDot;
window.checkApiStatus = checkApiStatus;



async function checkApiStatus(scope) {
  scope = scope || 'home';
  if (scopeChecking[scope]) return;
  const api = (scope === 'home') ? currentApi : apiFor(scope);
  if (!api.key) {
    setScopeDot(scope, 'gray', '未配置 Key');
    return;
  }
  scopeChecking[scope] = true;
  setScopeDot(scope, 'gray', '检测中...');

  const fullUrl = buildApiUrl(api);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  const startTime = Date.now();
  try {
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.key },
      body: JSON.stringify({ model: api.model || 'deepseek-v4-flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),

      signal: controller.signal
    });
    if (!res.ok) {
      setScopeDot(scope, 'red', '连接失败');
    } else {
      const data = await res.json();
      const elapsed = Date.now() - startTime;
      if (!data.choices || !data.choices[0]) setScopeDot(scope, 'red', '连接失败');
      else if (elapsed > 4000) setScopeDot(scope, 'yellow', '响应缓慢');
      else setScopeDot(scope, 'green', '正常');
    }

  } catch (err) {
    if (err.name === 'AbortError') setScopeDot(scope, 'red', '连接超时');
    else setScopeDot(scope, 'red', '连接失败');
  } finally {
    clearTimeout(timer);
    scopeChecking[scope] = false;
  }
}


// ======================== 设置弹窗 ========================
settingsBtn.addEventListener('click', function () {
  apis = JSON.parse(localStorage.getItem('llm_apis') || '[]');
  if (!Array.isArray(apis) || apis.length === 0) apis = [makeDefaultApi()];
  apis.forEach(function (a) { if (a.genImage === undefined) a.genImage = false; });
  const savedActive = localStorage.getItem('llm_active_api_id');
  if (savedActive && apis.find(a => a.id === savedActive)) activeApiId = savedActive;
  else activeApiId = apis[0].id;
  loadModelScopes();                    // ★ 删过 API 后重新对齐各页面
  activeApiId = scopeApiId('home');
  syncCurrentApi();
  renderHomeModelOptions();
  appTitleInput.value = appTitle.textContent;
  themeSelect.value = localStorage.getItem('llm_theme_key') || 'default';
  chatFontSelect.value = localStorage.getItem('llm_chat_font_size') || 'small';
  memRoundsInput.value = getMemRounds();
  renderApiList();
  modal.classList.add('show');
});

addApiBtn.addEventListener('click', function () {
  const newApi = makeDefaultApi();
  newApi.name = '新 API ' + (apis.length + 1);
  apis.push(newApi);
  renderApiList();
});

cancelBtn.addEventListener('click', function () { modal.classList.remove('show'); });

saveBtn.addEventListener('click', function () {
  if (TITLE_MODE !== 'locked') {
    const newTitle = appTitleInput.value.trim();
    if (newTitle) appTitle.textContent = newTitle;
    else { appTitle.textContent = 'LLM 智能助手'; appTitleInput.value = 'LLM 智能助手'; }
  }
  const items = apiList.querySelectorAll('.api-item');
  const newApis = [];
  for (const item of items) {
    const id = item.dataset.id;
    const name = item.querySelector('.api-name-input').value.trim() || '未命名';
    const url = item.querySelector('.api-url-input').value.trim().replace(/\/+$/, '');
    const key = item.querySelector('.api-key-input').value.trim();
    const model = item.querySelector('.api-model-input').value.trim();
    const vision = item.querySelector('.vision-check') ? item.querySelector('.vision-check').checked : false;
    const genImage = item.querySelector('.gen-check') ? item.querySelector('.gen-check').checked : false;
    newApis.push({ id, name, url, key, model, vision, genImage });
  }
  apis = newApis;
  if (!apis.find(a => a.id === activeApiId)) activeApiId = apis[0] ? apis[0].id : null;

  saveAllToStorage();
  syncCurrentApi();
  renderHomeModelOptions();
  // ★ 保存 API 列表后，刷新各页面的模型下拉（聊天/分镜/工坊/Agent）
  if (typeof window.__syncChatModelSelect === 'function') window.__syncChatModelSelect();
  if (typeof window.__syncSbModelSelect === 'function') window.__syncSbModelSelect();
  if (typeof window.__syncWsModelSelect === 'function') window.__syncWsModelSelect();
  if (typeof window.__syncAgentModelSelect === 'function') window.__syncAgentModelSelect();
  renderImgPreview();

  modal.classList.remove('show');
  setTimeout(() => checkApiStatus(), 200);
  showToast('✅ 设置已保存！');
});

themeSelect.addEventListener('change', function () {
  applyTheme(this.value);
  showToast('🎨 已切换为：' + (THEMES[this.value] ? THEMES[this.value].name : this.value));
});

if (chatFontSelect) {
  chatFontSelect.addEventListener('change', function () {
    applyChatFontSize(this.value);
    showToast('🔠 对话文字大小已切换');
  });
}

clearMemBtn.addEventListener('click', function () { clearConv(); showToast('🧹 对话记忆已清空'); });

// ======================== 图片压缩（参考图 / 对话图片共用） ========================
function processBgFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        const MAX_W = 1920, MAX_H = 1080;
        let w = img.width, h = img.height;
        if (w <= MAX_W && h <= MAX_H) { resolve(dataUrl); return; }
        const ratio = Math.min(MAX_W / w, MAX_H / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const usePng = file.type === 'image/png' || file.type === 'image/webp';
        resolve(canvas.toDataURL(usePng ? 'image/png' : 'image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('无法解析该图片，请换一张试试'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

// ======================== 输入区参考图 ========================
function renderImgPreview() {
  if (!imgPreviewBar) return;

  // ★ 当前模型不支持看图、且还没有图片 → 整块隐藏（连虚线框、边框、内边距、外边距一起收掉），
  //   把这段高度完整让给提示词输入框。
  if (!currentApi.vision && pendingImages.length === 0) {
    imgPreviewBar.style.display = 'none';
    imgPreviewBar.innerHTML = '';
    return;
  }
  imgPreviewBar.style.display = '';

  imgPreviewBar.innerHTML = '';
  if (pendingImages.length === 0) {
    imgPreviewBar.innerHTML = '<div class="img-preview-empty"><i class="fas fa-image"></i> 点击浏览或拖拽图片到此处，或 Ctrl+V 粘贴</div>';
    return;
  }

  pendingImages.forEach((img, idx) => {
    const item = document.createElement('div');
    item.className = 'img-item';
    item.innerHTML = `<img src="${img.dataUrl}" alt="参考图${idx + 1}"><button class="img-item-del" title="删除"><i class="fas fa-times"></i></button>`;
    item.querySelector('.img-item-del').addEventListener('click', function (e) { e.stopPropagation(); removeImage(idx); });
    imgPreviewBar.appendChild(item);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'img-add-btn';
  addBtn.title = '添加图片';
  addBtn.innerHTML = '<i class="fas fa-plus"></i>';
  addBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!currentApi.vision) { showToast('当前模型不支持看图，请切换视觉模型'); return; }
    if (imgFileInput) imgFileInput.click();
  });
  imgPreviewBar.appendChild(addBtn);
}

async function addImage(file) {
  if (!file) return;
  if (!currentApi.vision) { showToast('当前模型不支持看图，请切换视觉模型'); return; }
  if (!file.type.startsWith('image/')) { showToast('请选择图片文件'); return; }
  if (file.size > 10 * 1024 * 1024) { showToast('图片过大，请选择 10MB 以内的图片'); return; }
  try {
    const dataUrl = await processBgFile(file);
    pendingImages.push({ dataUrl: dataUrl, name: file.name });
    renderImgPreview();
    showToast('✅ 已添加参考图：' + file.name);
  } catch (e) { showToast('❌ ' + (e.message || '添加失败')); }
}

function removeImage(idx) { pendingImages.splice(idx, 1); renderImgPreview(); }
function clearImages() { pendingImages = []; renderImgPreview(); }

if (imgPreviewBar) {
  imgPreviewBar.addEventListener('click', function () {
    if (!currentApi.vision) { showToast('当前模型不支持看图，请切换视觉模型'); return; }
    if (imgFileInput) imgFileInput.click();
  });
  imgPreviewBar.addEventListener('dragover', function (e) { e.preventDefault(); this.classList.add('dragover'); });
  imgPreviewBar.addEventListener('dragleave', function () { this.classList.remove('dragover'); });
  imgPreviewBar.addEventListener('drop', function (e) {
    e.preventDefault();
    this.classList.remove('dragover');
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files) {
      for (const f of files) {
        if (f.type.startsWith('image/')) addImage(f);
        else showToast('仅支持图片文件');
      }
    }
  });
}

document.addEventListener('paste', function (e) {
  const ma = document.querySelector('.main-area');
  if (ma && ma.style.display === 'none') return;   // ★ 不在主页（对话/画布/分镜/工坊）时，粘贴交给各自的模块处理
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const it of items) {
    if (it.type && it.type.startsWith('image/')) {
      const file = it.getAsFile();
      if (file) { e.preventDefault(); addImage(file); break; }
    }
  }
});


const imgFileInput = document.createElement('input');
imgFileInput.type = 'file';
imgFileInput.accept = 'image/*';
imgFileInput.multiple = true;
imgFileInput.style.display = 'none';
document.body.appendChild(imgFileInput);
imgFileInput.addEventListener('change', function () {
  const files = this.files;
  if (files) { for (const f of files) addImage(f); }
  this.value = '';
});

// ======================== 搜索 / 替换 + 高亮 ========================
const hlInput1 = document.getElementById('hlInput1');
const hlInput2 = document.getElementById('hlInput2');
let lastKeyword = '';

function escapeHtmlForHl(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function renderHighlighted(text, keyword) {
  const esc = escapeHtmlForHl(text);
  if (!keyword) return esc.replace(/\n/g, '<br>');
  const escK = escapeHtmlForHl(keyword);
  const parts = esc.split(escK);
  return parts.join('<mark class="fr-mark">' + escK + '</mark>').replace(/\n/g, '<br>');
}

function syncAllHighlights() {
  if (hlInput1) hlInput1.innerHTML = renderHighlighted(input1.value, lastKeyword);
  if (hlInput2) hlInput2.innerHTML = renderHighlighted(input2.value, lastKeyword);
}

function bindHlScroll(textarea, hlEl) {
  if (!textarea || !hlEl) return;
  textarea.addEventListener('scroll', function () {
    hlEl.style.transform = 'translate(-' + this.scrollLeft + 'px, -' + this.scrollTop + 'px)';
  });
}
bindHlScroll(input1, hlInput1);
bindHlScroll(input2, hlInput2);

if (input1) input1.addEventListener('input', function () { lastKeyword = ''; syncAllHighlights(); });
if (input2) input2.addEventListener('input', function () { lastKeyword = ''; syncAllHighlights(); });

function notifyInputActive(active) {
  if (isElectron && ipc) ipc.invoke('set-input-active', active).catch(() => {});
}
if (input1) { input1.addEventListener('focus', () => notifyInputActive(true)); input1.addEventListener('blur', () => notifyInputActive(false)); }
if (input2) { input2.addEventListener('focus', () => notifyInputActive(true)); input2.addEventListener('blur', () => notifyInputActive(false)); }

syncAllHighlights();

if (findMode) {
  findMode.addEventListener('change', function () {
    if (this.value === 'replace') { replaceInput.disabled = false; }
    else { replaceInput.disabled = true; replaceInput.value = ''; }
  });
}

if (findRunBtn) {
  findRunBtn.addEventListener('click', function () {
    const keyword = findInput.value;
    if (!keyword) { showToast('请输入搜索内容'); findInput.focus(); return; }
    const mode = findMode.value;
    const targets = [{ el: input1, name: '提示词内容' }, { el: input2, name: '系统预设' }];
    let totalFound = 0, totalReplaced = 0;
    targets.forEach(t => {
      const text = t.el.value;
      if (!text) return;
      if (mode === 'find') totalFound += text.split(keyword).length - 1;
      else {
        const rep = replaceInput.value;
        const count = text.split(keyword).length - 1;
        if (count > 0) { t.el.value = text.split(keyword).join(rep); totalReplaced += count; }
      }
    });
    if (mode === 'find') {
      lastKeyword = keyword;
      syncAllHighlights();
      showToast(totalFound > 0 ? '🔍 共找到 ' + totalFound + ' 处匹配' : '未找到匹配内容');
    } else {
      lastKeyword = '';
      syncAllHighlights();
      showToast(totalReplaced > 0 ? '✅ 已替换 ' + totalReplaced + ' 处' : '未找到匹配内容');
    }
  });
}
// ======================== ★ 搜索/替换栏：默认收起，Ctrl+F 展开、Esc 收起 ========================
(function initFindReplaceToggle() {
  const bar = document.getElementById('findReplaceBar');
  const btn = document.getElementById('frToggleBtn');
  const searchBox = document.getElementById('findInput');
  if (!bar) return;
  let frOpen = false;

  function setFrOpen(v, focusSearch) {
    frOpen = !!v;
    bar.classList.toggle('collapsed', !frOpen);
    if (btn) btn.classList.toggle('active', frOpen);
    if (frOpen && focusSearch && searchBox) {
      searchBox.focus();
      searchBox.select();
    }
  }

  if (btn) {
    btn.addEventListener('click', function () { setFrOpen(!frOpen, !frOpen); });
  }

  document.addEventListener('keydown', function (e) {
    // Ctrl+F（或 Cmd+F）展开并聚焦搜索框
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'f' || e.key === 'F')) {
      if (document.querySelector('.modal-overlay.show')) return;   // 弹窗打开时不抢
      e.preventDefault();
      setFrOpen(true, true);
      return;
    }
    // Esc 收起
    if (e.key === 'Escape' && frOpen) {
      setFrOpen(false, false);
      if (input1) input1.focus();
    }
  });

  setFrOpen(false, false);
})();
// ======================== ★ 「更新日志」只在主页显示，其它模式自动收起 ========================
// 原理：所有模式在切换时都会把 .main-area 的 display 改成 none / ''，
//       这里盯着这个变化，非主页时给 body 加 mode-active（CSS 用它隐藏「更新日志」）
(function watchHomeActive() {
  const ma = document.querySelector('.main-area');
  if (!ma) return;
  function sync() {
    const homeVisible = (ma.style.display !== 'none');
    document.body.classList.toggle('mode-active', !homeVisible);
  }
  new MutationObserver(sync).observe(ma, { attributes: true, attributeFilter: ['style'] });
  sync();
})();



// ======================== 点击遮罩关闭（区分拖拽） ========================
let modalPressState = null;
function setupOverlayClose(overlayEl) {
  overlayEl.addEventListener('mousedown', function (e) {
    modalPressState = { x: e.clientX, y: e.clientY, onOverlay: e.target === overlayEl };
  });
  document.addEventListener('mouseup', function (e) {
    if (!overlayEl.classList.contains('show')) { modalPressState = null; return; }
    if (!modalPressState) return;
    const dx = Math.abs(e.clientX - modalPressState.x);
    const dy = Math.abs(e.clientY - modalPressState.y);
    if (dx < 6 && dy < 6 && modalPressState.onOverlay) overlayEl.classList.remove('show');
    modalPressState = null;
  });
}
setupOverlayClose(modal);
setupOverlayClose(presetModal);

// ======================== 折叠面板 ========================
const colorCollapseGroup = document.getElementById('colorCollapseGroup');
const colorCollapseHeader = document.getElementById('colorCollapseHeader');
if (colorCollapseGroup && colorCollapseHeader) {
  colorCollapseHeader.addEventListener('click', function () { colorCollapseGroup.classList.toggle('open'); });
}
const convCollapseGroup = document.getElementById('convCollapseGroup');
const convCollapseHeader = document.getElementById('convCollapseHeader');
if (convCollapseGroup && convCollapseHeader) {
  convCollapseHeader.addEventListener('click', function () { convCollapseGroup.classList.toggle('open'); });
}

// ======================== 预设管理 ========================
function getDefaultPresets() {
  return (typeof DEFAULT_PRESETS !== 'undefined' && Array.isArray(DEFAULT_PRESETS)) ? DEFAULT_PRESETS : [];
}
function getCustomPresets() {
  try {
    const saved = localStorage.getItem('llm_custom_presets');
    const arr = saved ? JSON.parse(saved) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function getDeletedPresetIds() {
  try {
    const saved = localStorage.getItem('llm_deleted_presets');
    const arr = saved ? JSON.parse(saved) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function savePresets() {
  const defaults = getDefaultPresets();
  const custom = presets.filter(p => {
    const def = defaults.find(d => d.id === p.id);
    if (!def) return true;
    return def.name !== p.name || def.content !== p.content;
  });
  localStorage.setItem('llm_custom_presets', JSON.stringify(custom));
  localStorage.setItem('llm_deleted_presets', JSON.stringify(deletedPresetIds));
}
function loadPresets() {
  const defaults = getDefaultPresets();
  const custom = getCustomPresets();
  deletedPresetIds = getDeletedPresetIds();
  const customIds = new Set(custom.map(p => p.id));
  const visibleDefaults = defaults.filter(d => !customIds.has(d.id) && !deletedPresetIds.includes(d.id));
  presets = [...custom, ...visibleDefaults];
}
function renderPresetSelect() {
  const currentVal = presetSelect.value;
  presetSelect.innerHTML = '<option value="">选择预设...</option>';
  presets.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name || '未命名';
    presetSelect.appendChild(opt);
  });
  if (currentVal && presets.find(p => p.id === currentVal)) presetSelect.value = currentVal;
  else presetSelect.value = '';
}
function renderPresetList() {
  presetList.innerHTML = '';
  if (presets.length === 0) {
    presetList.innerHTML = '<div class="preset-empty">暂无预设，点击下方创建</div>';
  } else {
    presets.forEach(p => {
      const item = document.createElement('div');
      item.className = 'preset-item' + (p.id === currentEditingPresetId ? ' active' : '');
      item.innerHTML = `<div class="preset-item-name">${escapeHtml(p.name || '未命名')}</div><div class="preset-item-preview">${escapeHtml(p.content || '')}</div>`;
      item.addEventListener('click', function () {
        currentEditingPresetId = p.id;
        presetNameInput.value = p.name || '';
        presetContentInput.value = p.content || '';
        renderPresetList();
      });
      presetList.appendChild(item);
    });
  }
}
presetEditBtn.addEventListener('click', function () {
  loadPresets();
  renderPresetList();
  currentEditingPresetId = null;
  presetNameInput.value = '';
  presetContentInput.value = '';
  presetModal.classList.add('show');
});
presetCloseBtn.addEventListener('click', function () { presetModal.classList.remove('show'); });
presetAddBtn.addEventListener('click', function () {
  currentEditingPresetId = null;
  presetNameInput.value = '';
  presetContentInput.value = '';
  renderPresetList();
  presetNameInput.focus();
});
presetSaveBtn.addEventListener('click', function () {
  const name = presetNameInput.value.trim();
  const content = presetContentInput.value;
  if (!name) { showToast('请填写预设名称'); return; }
  if (currentEditingPresetId) {
    const preset = presets.find(p => p.id === currentEditingPresetId);
    if (preset) { preset.name = name; preset.content = content; }
  } else {
    const newPreset = { id: 'preset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4), name: name, content: content };
    presets.push(newPreset);
    currentEditingPresetId = newPreset.id;
  }
  savePresets();
  renderPresetList();
  renderPresetSelect();
  showToast('✅ 预设已保存');
});
presetDeleteBtn.addEventListener('click', async function () {
  if (!currentEditingPresetId) { showToast('请先选择一个预设'); return; }
  if (!(await showConfirm('确定删除该预设吗？', { danger: true }))) return;
  const defaults = getDefaultPresets();
  const isDefault = defaults.some(d => d.id === currentEditingPresetId);
  if (isDefault && !deletedPresetIds.includes(currentEditingPresetId)) deletedPresetIds.push(currentEditingPresetId);
  presets = presets.filter(p => p.id !== currentEditingPresetId);
  currentEditingPresetId = null;
  presetNameInput.value = '';
  presetContentInput.value = '';
  savePresets();
  renderPresetList();
  renderPresetSelect();
});
presetSelect.addEventListener('change', function () {
  const id = this.value;
  const preset = id ? presets.find(p => p.id === id) : null;
  input2.value = preset ? (preset.content || '') : '';
  syncAllHighlights();
});

// ======================== 历史记录 ========================
function loadHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    historyList = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(historyList)) historyList = [];
  } catch (e) { historyList = []; }
}
function saveHistory(input1Text, input2Text, markdown) {
  const rec = { id: 'h_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4), time: new Date().toLocaleString('zh-CN', { hour12: false }), input1: input1Text, input2: input2Text, output: markdown };
  historyList.unshift(rec);
  if (historyList.length > HISTORY_MAX) historyList.length = HISTORY_MAX;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyList));
  renderHistoryList();
}
function renderHistoryList() {
  if (!historyListEl) return;
  historyListEl.innerHTML = '';
  if (historyList.length === 0) {
    historyListEl.innerHTML = '<div class="history-empty"><i class="fas fa-inbox" style="font-size:32px;color:var(--text-dim);margin-bottom:10px;"></i><br>暂无历史记录</div>';
    return;
  }
  historyList.forEach(rec => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="history-item-time">${escapeHtml(rec.time)}</div>
      <div class="history-item-preview">${escapeHtml(rec.input1 || rec.input2 || '(空提问)')}</div>
      <div class="history-item-actions">
        <button class="history-copy-btn" title="复制内容"><i class="far fa-copy"></i></button>
        <button class="history-load-btn" title="载入到界面"><i class="fas fa-undo"></i></button>
        <button class="history-del-btn" title="删除"><i class="fas fa-trash"></i></button>
      </div>`;
    item.querySelector('.history-copy-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      copyTextToClipboard(markdownToPlainText(rec.output)).then(ok => { if (ok) showToast('✅ 已复制到剪贴板'); else showToast('❌ 复制失败'); });
    });
    item.querySelector('.history-load-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      input1.value = rec.input1 || '';
      input2.value = rec.input2 || '';
      syncAllHighlights();
      showMarkdownResult(rec.output);
      closeHistoryPanel();
    });
    item.querySelector('.history-del-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      historyList = historyList.filter(h => h.id !== rec.id);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(historyList));
      renderHistoryList();
    });
    historyListEl.appendChild(item);
  });
}
function showMarkdownResult(markdown) {
  output.classList.add('md-body');
  output.innerHTML = renderMarkdown(markdown);
  copyBtn.style.display = 'flex';
  saveResultBtn.style.display = 'flex';
}
// ======================== ★ 元数据行（模型 / 首字 / 耗时 / 字数 / 估算 tokens） ========================
// 供 主页 / 对话 / 工坊 三处共用
function estTokens(s) {
  const t = String(s == null ? '' : s);
  let cjk = 0, other = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c >= 0x2E80 && c <= 0x9FFF) cjk++; else other++;
  }
  return Math.round(cjk + other * 0.28);
}

function buildMetaHTML(model, t0, t1, inText, outText) {
  const totalSec = t0 ? Math.max(0, (performance.now() - t0) / 1000) : 0;
  const firstSec = (t0 && t1) ? (t1 - t0) / 1000 : 0;
  const inChars = String(inText == null ? '' : inText).length;
  const outChars = String(outText == null ? '' : outText).length;
  const tk = estTokens(inText) + estTokens(outText);
  const tkText = tk >= 1000 ? (tk / 1000).toFixed(1) + 'k' : String(tk);
  return '<span class="om-model">' + escapeHtml(model || '—') + '</span>' +
    (firstSec ? '<span>首字 <b>' + firstSec.toFixed(2) + 's</b></span>' : '') +
    '<span>耗时 <b>' + totalSec.toFixed(1) + 's</b></span>' +
    '<span>入 <b>' + inChars + '</b> · 出 <b>' + outChars + '</b> 字</span>' +
    '<span>≈ <b>' + tkText + '</b> tokens</span>';
}
window.buildMetaHTML = buildMetaHTML;

let outputMetaT0 = 0;
let outputMetaFirst = 0;
function hideOutputMeta() {
  const el = document.getElementById('outputMeta');
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}
function showOutputMeta(outText, inText, t0, t1) {
  const el = document.getElementById('outputMeta');
  if (!el || !t0) return;
  el.innerHTML = buildMetaHTML(currentApi.model, t0, t1, inText, outText);
  el.style.display = 'flex';
}


function openHistoryPanel() { loadHistory(); renderHistoryList(); historyOverlay.classList.add('show'); }
function closeHistoryPanel() { historyOverlay.classList.remove('show'); }
historyBtn.addEventListener('click', openHistoryPanel);
historyCloseBtn.addEventListener('click', closeHistoryPanel);
historyOverlay.addEventListener('click', function (e) { if (e.target === historyOverlay) closeHistoryPanel(); });
historyClearBtn.addEventListener('click', async function () {
  if (!(await showConfirm('确定清空所有历史记录吗？', { danger: true }))) return;
  historyList = [];
  localStorage.removeItem(HISTORY_KEY);
  renderHistoryList();
});

// ======================== 一键复制 ========================
copyBtn.addEventListener('click', async function () {
  const text = output.innerText;
  if (!text || text.trim() === '' || text.includes('等待 AI 回复') || text.includes('思考中')) return;
  copyTextToClipboard(text).then(() => {
    copyBtn.classList.add('copied');
    copyBtn.innerHTML = '<i class="far fa-check-circle"></i> 已复制';
    setTimeout(() => { copyBtn.classList.remove('copied'); copyBtn.innerHTML = '<i class="far fa-copy"></i> 复制'; }, 1500);
  });
});

// ======================== 保存结果（txt） ========================
saveResultBtn.addEventListener('click', function () {
  const text = output.innerText;
  if (!text || text.trim() === '' || text.includes('等待 AI 回复') || text.includes('思考中')) return;
  const defaultName = `AI结果_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
  try {
    const { dialog } = require('electron');
    const fs = require('fs');
    dialog.showSaveDialog({ title: '保存结果', defaultPath: defaultName, filters: [{ name: '文本文件', extensions: ['txt'] }] }).then(result => {
      if (!result.canceled && result.filePath) {
        fs.writeFileSync(result.filePath, text, 'utf-8');
        showToast('✅ 已保存到：\n' + result.filePath);
      }
    });
  } catch (e) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(a.href);
  }
});

// ======================== 输出按钮 ========================
runBtn.addEventListener('click', async function () {
  const text1 = input1.value.trim();
  const text2 = input2.value.trim();
  if (!text1 && !text2 && pendingImages.length === 0) {
    output.classList.remove('md-body');
    output.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>请输入提示词内容或系统预设</p></div>';
    copyBtn.style.display = 'none';
    saveResultBtn.style.display = 'none'; hideOutputMeta();
    return;
  }
  if (pendingImages.length > 0 && !currentApi.vision) {
    output.classList.remove('md-body');
    output.innerHTML = '<div class="empty-state"><i class="fas fa-eye-slash"></i><p>当前模型不支持看图，请在设置中勾选"该模型支持看图"，或移除参考图</p></div>';
    copyBtn.style.display = 'none';
    saveResultBtn.style.display = 'none'; hideOutputMeta();
    return;
  }
  let combined = '';
  if (text1) combined += `【提示词内容】\n${text1}\n`;
  if (text2) combined += `【系统预设】\n${text2}\n`;
  output.classList.remove('md-body');
  output.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>AI 思考中...</p></div>';
  copyBtn.style.display = 'none';
  saveResultBtn.style.display = 'none'; hideOutputMeta();
  runBtn.disabled = true;
  stopBtn.style.display = 'flex';
  let markdown = ''; hideOutputMeta(); outputMetaT0 = performance.now(); outputMetaFirst = 0;
  try {
    markdown = await streamCallLLM(combined, (chunk) => {
      if (!outputMetaFirst) outputMetaFirst = performance.now(); markdown += chunk;
      output.textContent = markdown;
      output.scrollTop = output.scrollHeight;
    }, 180000, pendingImages);
    showMarkdownResult(markdown); showOutputMeta(markdown, combined, outputMetaT0, outputMetaFirst);

    saveHistory(text1, text2, markdown);
    rememberTurn(combined, markdown);
    setStatus('green', '请求成功');
    playDoneSound();
  } catch (err) {
    if (err.name === 'AbortError') {
      if (markdown) {
        showMarkdownResult(markdown); showOutputMeta(markdown, combined, outputMetaT0, outputMetaFirst);

        saveHistory(text1, text2, markdown);
        rememberTurn(combined, markdown);
      } else {
        output.classList.remove('md-body');
        output.innerHTML = '<div class="empty-state"><i class="fas fa-stop-circle"></i><p>请求已停止</p></div>';
      }
      setStatus('yellow', '请求已停止');
      copyBtn.style.display = markdown ? 'flex' : 'none';
      saveResultBtn.style.display = markdown ? 'flex' : 'none';
    } else {
      try {
        const result = await callLLM(combined, 180000, pendingImages);
        showMarkdownResult(result); showOutputMeta(result, combined, outputMetaT0, outputMetaFirst);
        saveHistory(text1, text2, result);
        rememberTurn(combined, result);
        setStatus('green', '请求成功');
        playDoneSound();
      } catch (err2) {
        if (err2.name === 'AbortError') {
          output.classList.remove('md-body');
          output.innerHTML = '<div class="empty-state"><i class="fas fa-stop-circle"></i><p>请求已停止</p></div>';
          setStatus('yellow', '请求已停止');
        } else {
          const errMsg = err2.message || '';
          output.classList.remove('md-body');
          output.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${escapeHtml(errMsg)}</p></div>`;
          if (errMsg.includes('HTTP 429')) setStatus('red', '配额超限');
          else if (errMsg.includes('HTTP 401')) setStatus('red', 'Key 无效');
          else if (errMsg.includes('HTTP 404')) setStatus('red', '接口错误');
          else if (errMsg.includes('HTTP 4')) setStatus('red', '请求错误');
          else setStatus('red', '请求失败');
        }
        copyBtn.style.display = 'none';
        saveResultBtn.style.display = 'none'; hideOutputMeta();
      }
    }
  } finally {
    runBtn.disabled = false;
    stopBtn.style.display = 'none';
    currentController = null;
  }
});

// ======================== 停止按钮 ========================
let currentController = null;
stopBtn.addEventListener('click', function () { if (currentController) currentController.abort(); });

// ======================== 流式调用 LLM ========================
async function streamCallLLM(prompt, onDelta, timeoutMs = 180000, images = [], apiOverride) {
  const A = apiOverride || currentApi;          // ★ 允许调用方指定模型（画布节点用）
  if (!A.key) throw new Error('请在设置中填写 API Key');
  currentController = new AbortController();
  const timeoutTimer = setTimeout(() => currentController.abort(), timeoutMs);
  const url = buildApiUrl(A);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + A.key },
      body: JSON.stringify({ model: A.model, messages: buildMessages(prompt, images), temperature: 0.7, stream: true }),
      signal: currentController.signal
    });
    if (!response.ok) { const errText = await response.text(); throw new Error(`HTTP ${response.status}: ${errText}`); }
    const reader = response.body.getReader();
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
    return fullText;
  } finally { clearTimeout(timeoutTimer); }
}


// ======================== 非流式调用 LLM ========================
async function callLLM(prompt, timeoutMs = 180000, images = [], apiOverride) {
  const A = apiOverride || currentApi;          // ★ 同上
  if (!A.key) throw new Error('请在设置中填写 API Key');
  currentController = new AbortController();
  const timeoutTimer = setTimeout(() => currentController.abort(), timeoutMs);
  const url = buildApiUrl(A);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + A.key },
      body: JSON.stringify({ model: A.model, messages: buildMessages(prompt, images), temperature: 0.7 }),
      signal: currentController.signal
    });
    if (!response.ok) { const errText = await response.text(); throw new Error(`HTTP ${response.status}: ${errText}`); }
    const data = await response.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message) throw new Error('返回格式异常：' + JSON.stringify(data));
    return data.choices[0].message.content;
  } finally { clearTimeout(timeoutTimer); }
}


// ======================== 右下角时间 ========================
function updateTimeDisplay() {
  const now = new Date();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekday = weekdays[now.getDay()];
  document.getElementById('timeDate').textContent = `${month}月${day}日 周${weekday}`;
  document.getElementById('timeClock').textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
}

// ======================== Ctrl+Enter ========================
document.addEventListener('keydown', function (e) {
  if (e.ctrlKey && e.key === 'Enter') {
    if (document.querySelector('.modal-overlay.show')) return;
    runBtn.click();
  }
});

// ======================== 图钉置顶 ========================
const pinBtn = document.getElementById('pinBtn');
let isPinned = false;
if (pinBtn) {
  pinBtn.addEventListener('click', function () {
    isPinned = !isPinned;
    pinBtn.classList.toggle('active', isPinned);
    if (isElectron && ipc) ipc.invoke('set-always-on-top', isPinned).catch(() => {});
    else { showToast('置顶功能仅在 Electron 桌面版中可用'); isPinned = false; pinBtn.classList.remove('active'); }
  });
}
// ======================== 更新日志 ========================
const changelogBtn = document.getElementById('changelogBtn');
const changelogModal = document.getElementById('changelogModal');
const changelogBody = document.getElementById('changelogBody');
const changelogClose = document.getElementById('changelogClose');
if (changelogBtn) {
  changelogBtn.addEventListener('click', async function () {
    if (!changelogModal) return;
    changelogModal.classList.add('show');
    if (changelogBody) changelogBody.textContent = '加载中...';
    try {
      if (isElectron && ipc) {
        const text = await ipc.invoke('read-changelog');
        changelogBody.textContent = text || '（暂无更新日志）';
      } else {
        changelogBody.textContent = '（仅桌面版支持）';
      }
    } catch (e) {
      changelogBody.textContent = '（读取失败）';
    }
  });
}
if (changelogClose) changelogClose.addEventListener('click', function () { changelogModal.classList.remove('show'); });
if (changelogModal) {
  changelogModal.addEventListener('mousedown', function (e) {
    if (e.target === changelogModal) changelogModal.classList.remove('show');
  });
}

// ======================== ★ 检查更新 ========================
const updateBtn = document.getElementById('updateBtn');
const updateModal = document.getElementById('updateModal');
const updateBody = document.getElementById('updateBody');
const updateClose = document.getElementById('updateClose');
const updateAction = document.getElementById('updateAction');

function setUpdateText(t) { if (updateBody) updateBody.textContent = t; }

function fmtSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? (mb.toFixed(1) + ' MB') : (Math.round(bytes / 1024) + ' KB');
}

// 记录最近一次检查结果，供"立即更新"使用
let lastUpdateInfo = null;

function renderUpdateResult(r) {
  if (!updateAction) return;
  updateAction.style.display = 'none';
  updateAction.disabled = false;

  if (!r || !r.ok) {
    setUpdateText('检查失败：' + ((r && r.error) || '未知错误') +
      '\n\n常见原因：\n· 网络不可用\n· js/update-check.js 里的仓库名还没改成你自己的\n· 仓库是私有的（本功能只支持公开仓库）');
    return;
  }
  if (!r.hasUpdate) {
    setUpdateText('当前已是最新版本。\n\n当前版本：v' + r.current + '\n最新版本：v' + r.latest);
    return;
  }

  let text = '发现新版本！\n\n当前版本：v' + r.current + '\n最新版本：v' + r.latest;
  if (r.assetName) text += '\n更新包：' + r.assetName + (r.assetSize ? '（' + fmtSize(r.assetSize) + '）' : '');
  if (r.publishedAt) text += '\n发布时间：' + String(r.publishedAt).slice(0, 10);
  if (r.notes) {
    const notes = String(r.notes).trim();
    text += '\n\n更新内容：\n' + (notes.length > 800 ? notes.slice(0, 800) + '…' : notes);
  }

  if (r.canAutoInstall) {
    text += '\n\n点击下方「立即更新」将自动下载并替换，完成后程序会自动重启。';
    lastUpdateInfo = r;
    updateAction.textContent = '立即更新';
    updateAction.style.display = '';
  } else {
    text += '\n\n该版本没有提供 exe 附件，请手动前往发布页下载。';
    lastUpdateInfo = r;
    updateAction.textContent = '打开发布页';
    updateAction.style.display = '';
  }
  setUpdateText(text);
}

async function doCheckUpdate(manual) {
  if (!isElectron || !ipc) { if (manual) setUpdateText('检查更新仅在 Electron 桌面版中可用'); return; }
  if (manual) setUpdateText('正在检查...');
  try {
    const r = await ipc.invoke('check-update');
    renderUpdateResult(r);
    // 静默检查时，若发现新版就给按钮加个高亮提示
    if (!manual && r && r.ok && r.hasUpdate && updateBtn) {
      updateBtn.textContent = '有新版本';
      updateBtn.style.color = '#ffb84d';
    }
  } catch (e) {
    if (manual) setUpdateText('检查失败：' + (e && e.message ? e.message : String(e)));
  }
}

if (updateBtn) {
  updateBtn.addEventListener('click', function () {
    if (updateModal) updateModal.classList.add('show');
    doCheckUpdate(true);
  });
}
if (updateClose) updateClose.addEventListener('click', function () { if (updateModal) updateModal.classList.remove('show'); });
if (updateModal) {
  updateModal.addEventListener('mousedown', function (e) {
    if (e.target === updateModal) updateModal.classList.remove('show');
  });
}

// 点击「立即更新」：自动下载替换，或跳转发布页
if (updateAction) {
  updateAction.addEventListener('click', async function () {
    if (!lastUpdateInfo) return;
    if (!lastUpdateInfo.canAutoInstall) {
      if (ipc) ipc.invoke('open-release-page', lastUpdateInfo.htmlUrl).catch(function () {});
      return;
    }
    updateAction.disabled = true;
    updateAction.textContent = '下载中...';
    setUpdateText('正在下载新版本，请不要关闭程序...\n\n（下载完成后程序会自动重启）');

    // 主进程通过 update-progress 事件回报进度
    try {
      if (ipc && ipc.on) {
        ipc.on('update-progress', function (ev, p) {
          if (!p) return;
          if (p.stage === 'downloading') {
            const pct = p.total ? Math.round(p.received / p.total * 100) : 0;
            setUpdateText('正在下载新版本...\n\n' + pct + '%   ' +
              fmtSize(p.received) + ' / ' + fmtSize(p.total) +
              '\n\n请勿关闭程序，完成后会自动重启。');
          } else if (p.stage === 'installing') {
            setUpdateText('下载完成，正在替换文件...');
          } else if (p.stage === 'restarting') {
            setUpdateText('更新完成，正在重启...');
          }
        });
      }
      const r = await ipc.invoke('download-update');
      if (r && !r.ok) {
        updateAction.disabled = false;
        updateAction.textContent = '重试';
        setUpdateText('更新失败：' + ((r && r.error) || '未知错误') +
          '\n\n可点击「打开发布页」手动下载。');
      }
    } catch (e) {
      updateAction.disabled = false;
      updateAction.textContent = '重试';
      setUpdateText('更新失败：' + (e && e.message ? e.message : String(e)));
    }
  });
}

// 启动后延迟 5 秒静默检查一次（失败不打扰用户）
setTimeout(function () { doCheckUpdate(false); }, 5000);


// ======================== 初始化 ========================
// ★ 从文件恢复全部数据（--no-sandbox 下 localStorage 是内存临时存储，每次启动从文件读回）
(function restoreAllFromFile() {
  try {
    const fs = require('fs');
    const path = require('path');
    // 1) 首次启动：先用备份文件种入 7 个 API
    const seedFile = path.join(__dirname, '_apis_recovered.json');
    if (fs.existsSync(seedFile) && !localStorage.getItem('llm_apis')) {
      const apis = fs.readFileSync(seedFile, 'utf8');
      localStorage.setItem('llm_apis', apis);
      try {
        const arr = JSON.parse(apis);
        if (Array.isArray(arr) && arr.length > 0) localStorage.setItem('llm_active_api_id', arr[0].id);
      } catch (e2) {}
    }
    // 2) 再从持久化文件恢复全部数据（覆盖上面的种子）
    const storeFile = path.join(__dirname, '_ember_storage.json');
    if (fs.existsSync(storeFile)) {
      const data = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
      for (const k in data) {
        try { localStorage.setItem(k, data[k]); } catch (e3) {}
      }
    }
    // 3) 恢复对话记录（从 _restore_sessions.json 种入，仅当内存里还没有）
    const sessionsFile = path.join(__dirname, '_restore_sessions.json');
    if (fs.existsSync(sessionsFile) && !localStorage.getItem('llm_chat_sessions')) {
      try {
        const sdata = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
        if (sdata && Array.isArray(sdata.sessions) && sdata.sessions.length > 0) {
          localStorage.setItem('llm_chat_sessions', JSON.stringify({
            sessions: sdata.sessions,
            activeId: sdata.activeId || sdata.sessions[0].id
          }));
        }
      } catch (e4) {}
    }
  } catch (e1) {}
})();
// ★ 把全部 localStorage 持久化到文件（--no-sandbox 内存存储的唯一落盘方式）
function persistAllToFile() {
  try {
    const fs = require('fs');
    const path = require('path');
    const storeFile = path.join(__dirname, '_ember_storage.json');
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      try { if (k) data[k] = localStorage.getItem(k); } catch (e) {}
    }
    fs.writeFileSync(storeFile, JSON.stringify(data), 'utf8');
  } catch (e) {}
}
setInterval(persistAllToFile, 10000);
window.addEventListener('beforeunload', persistAllToFile);
loadData();
loadPresets();
renderPresetSelect();
loadHistory();
loadConv();
renderImgPreview();
setTimeout(() => checkApiStatus(), 500);
setInterval(() => checkApiStatus(), 300000);
updateTimeDisplay();
setInterval(updateTimeDisplay, 1000);

// ======================== 窗口控制 ========================
const winMinBtn = document.getElementById('winMinBtn');
const winMaxBtn = document.getElementById('winMaxBtn');
const winCloseBtn = document.getElementById('winCloseBtn');
if (winMinBtn) winMinBtn.addEventListener('click', function () { if (isElectron && ipc) ipc.invoke('win-minimize').catch(() => {}); });
if (winMaxBtn) winMaxBtn.addEventListener('click', function () { if (isElectron && ipc) ipc.invoke('win-maximize').catch(() => {}); });

// ★ 关闭确认弹窗（应用内样式，居中于 App 窗口）
function requestCloseApp() {
  const cm = document.getElementById('closeConfirmModal');
  if (cm) cm.classList.add('show');
}
(function initCloseConfirm() {
  const cm = document.getElementById('closeConfirmModal');
  const ok = document.getElementById('closeConfirmOk');
  const cancel = document.getElementById('closeConfirmCancel');
  if (ok) {
    ok.addEventListener('click', function () {
      if (cm) cm.classList.remove('show');
      if (isElectron && ipc) ipc.invoke('win-close').catch(() => {});
    });
  }
  if (cancel) {
    cancel.addEventListener('click', function () {
      if (cm) cm.classList.remove('show');
    });
  }
  if (cm) {
    cm.addEventListener('mousedown', function (e) {
      if (e.target === cm) cm.classList.remove('show');
    });
  }
  if (winCloseBtn) winCloseBtn.addEventListener('click', requestCloseApp);
})();

// ======================== ★ 通用确认 / 提示弹窗（应用内样式，Promise） ========================
function showConfirm(message, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    const cm = document.getElementById('confirmModal');
    if (!cm) { resolve(true); return; }
    const iconEl = document.getElementById('confirmIcon');
    const msgEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');
    if (iconEl) iconEl.className = 'fas ' + (opts.danger ? 'fa-triangle-exclamation' : (opts.icon || 'fa-circle-question'));
    if (msgEl) msgEl.textContent = message || '';
    if (okBtn) okBtn.innerHTML = '<i class="fas fa-check"></i> ' + (opts.okLabel || '确定');
    if (cancelBtn) { cancelBtn.style.display = ''; cancelBtn.innerHTML = '<i class="fas fa-times"></i> ' + (opts.cancelLabel || '取消'); }
    const box = cm.querySelector('.glass-modal');
    if (box) box.classList.toggle('confirm-danger', !!opts.danger);
    function onOk() { settle(true); }
    function onCancel() { settle(false); }
    function onBg(e) { if (e.target === cm) settle(false); }
    function settle(val) {
      cm.classList.remove('show');
      if (box) box.classList.remove('confirm-danger');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      cm.removeEventListener('mousedown', onBg);
      resolve(val);
    }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    cm.addEventListener('mousedown', onBg);
    cm.classList.add('show');
  });
}
function showAlert(message, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    const cm = document.getElementById('confirmModal');
    if (!cm) { resolve(); return; }
    const iconEl = document.getElementById('confirmIcon');
    const msgEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');
    if (iconEl) iconEl.className = 'fas ' + (opts.danger ? 'fa-triangle-exclamation' : (opts.icon || 'fa-circle-info'));
    if (msgEl) msgEl.textContent = message || '';
    if (okBtn) okBtn.innerHTML = '<i class="fas fa-check"></i> ' + (opts.okLabel || '知道了');
    if (cancelBtn) cancelBtn.style.display = 'none';
    const box = cm.querySelector('.glass-modal');
    if (box) box.classList.toggle('confirm-danger', !!opts.danger);
    function onOk() { settle(); }
    function onBg(e) { if (e.target === cm) settle(); }
    function settle() {
      cm.classList.remove('show');
      if (cancelBtn) cancelBtn.style.display = '';
      if (box) box.classList.remove('confirm-danger');
      okBtn.removeEventListener('click', onOk);
      cm.removeEventListener('mousedown', onBg);
      resolve();
    }
    okBtn.addEventListener('click', onOk);
    cm.addEventListener('mousedown', onBg);
    cm.classList.add('show');
  });
}
window.showConfirm = showConfirm;
window.showAlert = showAlert;


// ======================== 右侧吸附标签状态同步 ========================
if (ipc) {
  ipc.on('dock-state-changed', (e, state) => {
    const dockTab = document.getElementById('dockTab');
    if (!dockTab) return;
    if (state && state.enabled && !state.expanded) dockTab.classList.add('show');
    else dockTab.classList.remove('show');
    const pinBtnEl = document.getElementById('pinBtn');
    if (pinBtnEl && state) {
      isPinned = !!state.pinned;
      pinBtnEl.classList.toggle('active', isPinned);
    }
  });
}

// ★ 吸附按钮
const dockBtn = document.getElementById('dockBtn');
if (dockBtn) {
  dockBtn.addEventListener('click', function () {
    if (isElectron && ipc) ipc.invoke('dock-enable').catch(() => {});
  });
}
// ======================== ★ 把底部按钮行搬进左侧输入栏 ========================
// 目的：不为「输出结果」单独占一整行；宽度跟随左栏（与输入框同宽）；
//       窗口宽度变化不再横向漂移；并自动给左下角的模式按钮组让出空间。
(function relocateRunBar() {
  var bar = document.querySelector('.bottom-bar');
  var left = document.querySelector('.left-panel');
  var area = document.querySelector('.main-area');
  if (!bar || !left) return;
  left.appendChild(bar);

  var corner = document.querySelector('.left-corner');
  var GAP = 8;        // ★ 按钮下沿与模式按钮上沿之间的实际间距（唯一调节点）

  function applyClear() {
    var px = 60;
    if (corner && area) {
      var r = corner.getBoundingClientRect();
      var areaBottom = area.getBoundingClientRect().bottom;   // ★ 从主区底部量，而不是窗口底部
      var need = areaBottom - r.top;                          // 主区底部 → 角落组顶边
      if (need > -200 && need < window.innerHeight) px = Math.max(0, Math.round(need + GAP));
    }
    document.documentElement.style.setProperty('--run-bar-clear', px + 'px');
  }

  applyClear();
  window.addEventListener('resize', applyClear);
})();
