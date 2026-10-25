// ======================== DOM 引用 ========================
const appTitle = document.getElementById('appTitle') || { style: {}, textContent: '' };const appTitleInput = document.getElementById('appTitleInput');

// ======================== ★ 流式自动滚动（上滚查看历史时不被拽回底部） ========================
// 规则：只有用户停留在底部附近时才自动跟随；一旦上滚就停住，滚回底部后恢复。
(function () {
  function bind(el) {
    if (!el || el.__stickBound) return;
    el.__stickBound = true;
    el.__stick = true;
    el.addEventListener('scroll', function () {
      var gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      el.__stick = gap < 60;      // 距底部 60px 内视为"跟随中"
    }, { passive: true });
  }
  window.emberStick = {
    follow: function (el) {
      if (!el) return;
      bind(el);
      if (el.__stick !== false) el.scrollTop = el.scrollHeight;
    },
    reset: function (el) {
      if (!el) return;
      bind(el);
      el.__stick = true;
      el.scrollTop = el.scrollHeight;
    },
    isFree: function (el) { return !!(el && el.__stick === false); }
  };
})();
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

const clearMemBtn = document.getElementById('clearMemBtn');   // 设置里的「清空对话记忆」已移除，元素不存在时留 null 即可
const tavilyKeyInput = document.getElementById('tavilyKeyInput');   // ★ 联网搜索 Key

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

// 应用文字大小（对话模式的输入框与消息气泡 + 画布模式的字号）
const CHAT_FONT_SIZES = { small: '14px', medium: '16px', large: '18px' };
const CANVAS_FONT_BASE = 14;   // ★ 以「小」= 14px 作为画布 1 倍基准
function applyChatFontSize(size) {
  const px = CHAT_FONT_SIZES[size] || CHAT_FONT_SIZES.small;
  document.documentElement.style.setProperty('--chat-font-size', px);
  // ★ 画布模式跟着一起缩放：小 = 1、中 ≈ 1.143、大 ≈ 1.286
  //    画布 CSS 里的字号统一写成 calc(原值 * var(--canvas-fs-scale, 1))
  const scale = (parseFloat(px) || CANVAS_FONT_BASE) / CANVAS_FONT_BASE;
  document.documentElement.style.setProperty('--canvas-fs-scale', String(scale));
  // ★ 全局缩放系数：主页 / 分镜 / 工坊 / Agent 的输入框与输出文字都用它
  document.documentElement.style.setProperty('--fs-scale', String(scale));
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
  // ★ 设置里的「对话记忆轮数」已移除；这里只保留一个默认值，
  //   供仍会调用 buildMessages 的旧路径使用（主页提示词生成已改成不带历史）
  return 5;
}
function buildMessages(prompt, images) {
  return buildMessagesInner(prompt, images, false);
}

// ★ 画布模式专用：不带主页的对话记忆
//
// 为什么需要单独一份：
//   buildMessages() 会把 convHistory（主页的对话记忆）拼进 messages，
//   而画布是四个模式里唯一复用这个函数的，结果就变成
//   "主页聊过的内容会跑进画布的 LLM 节点里"，造成每个节点不是独立问答。
//   分镜表格和 Agent 都有自己的组装逻辑，所以不受影响——画布应该是第三个。
//
// 画布的上下文只应该来自【画布内的节点连线】：
//   在画布上把「LLM 输出」节点连到下一个「LLM」节点，那才是用户主动给的上下文。
function buildCanvasMessages(prompt, images) {
  return buildMessagesInner(prompt, images, true);
}

function buildMessagesInner(prompt, images, isolate) {
  const currentTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const messages = [{ role: 'system', content: '当前时间是 ' + currentTime + '。你是Ember小助手，一个乐于助人的助手。' }];
  if (!isolate) {
    const memRounds = getMemRounds();
    if (memRounds > 0 && convHistory.length > 0) {
      const recent = convHistory.slice(-memRounds * 2);
      messages.push(...recent);
    }
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
  renderGenModelOptions();   // ★ 生图模型跟着一起刷新
}

if (homeModelSelect) {
  homeModelSelect.addEventListener('change', function () {
    const id = this.value;
    if (!id) return;
    setActiveModel('home', id);       // ★ 主页的模型
    showToast('已切换模型：' + this.options[this.selectedIndex].text);
  });
}

// ======================== ★ 右侧「生图」区 ========================
const GEN_MODEL_KEY = 'llm_home_gen_api';

function genApiList() {
  try { return (typeof apis !== 'undefined' ? apis : []).filter(function (a) { return a.genImage; }); }
  catch (e) { return []; }
}

function renderGenModelOptions() {
  const el = document.getElementById('genModelSelect');
  if (!el) return;
  const list = genApiList();
  if (!list.length) {
    el.innerHTML = '<option value="">未配置生图模型</option>';
    return;
  }
  let saved = '';
  try { saved = localStorage.getItem(GEN_MODEL_KEY) || ''; } catch (e) {}
  el.innerHTML = list.map(function (a) {
    return '<option value="' + escapeHtml(a.id) + '">' + escapeHtml(a.model || a.name) + '</option>';
  }).join('');
  if (saved && list.some(function (a) { return a.id === saved; })) el.value = saved;
  applyGenModelRestriction();   // 选项重建后重新套用尺寸限制
}

// 取右边 AI 回复的当前文字（可编辑过）
function genPromptText() {
  const out = document.getElementById('output');
  if (!out || !out.classList.contains('md-body')) return '';
  return String(out.innerText || '').replace(/\u00a0/g, ' ').trim();
}

function downloadImageFile(src, idx) {
  const a = document.createElement('a');
  a.href = src;
  a.download = 'ember-' + Date.now() + (idx ? '-' + (idx + 1) : '') + '.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// 显示生成结果（生图成功 / 恢复上次结果 共用，支持多张）
let homeGenItems = [];   // [{ src, ref }]
function showGenResult(srcs) {
  const genArea = document.getElementById('genArea');
  if (!genArea) return;
  const arr = (Array.isArray(srcs) ? srcs : [srcs]).filter(Boolean);
  if (!arr.length) return;
  homeGenItems = arr.map(function (s) { return { src: s, ref: '' }; });

  genArea.innerHTML = '<div class="gen-grid' + (arr.length > 1 ? ' multi' : '') + '">'
    + arr.map(function (s, i) {
        return '<img src="' + s + '" alt="生成结果" class="gen-img" data-i="' + i + '">';
      }).join('')
    + '</div>'
    + '<button class="gen-download" title="保存图片"><i class="fas fa-download"></i></button>';

  genArea.querySelectorAll('img.gen-img').forEach(function (img) {
    img.addEventListener('click', function (e) {
      e.stopPropagation();
      showImagePreview(img.getAttribute('src'));   // ★ 点图放大，点任意处关闭
    });
  });
  const dl = genArea.querySelector('.gen-download');
  if (dl) {
    dl.addEventListener('click', function () {
      homeGenItems.forEach(function (it, i) {
        setTimeout(function () { downloadImageFile(it.src, i); }, i * 300);
      });
    });
  }
}

// 尺寸换算（画布里的 computeSize 在闭包里取不到，这里本地实现一份）
function genComputeSize(ratio, res) {
  const maxSide = res === '2k' ? 2048 : (res === '4k' ? 3840 : 1024);
  const p = String(ratio || '1:1').split(':');
  const rw = parseInt(p[0], 10) || 1;
  const rh = parseInt(p[1], 10) || 1;
  let w, h;
  if (rw >= rh) { w = maxSide; h = Math.round(maxSide * rh / rw); }
  else { h = maxSide; w = Math.round(maxSide * rw / rh); }
  return (Math.floor(w / 2) * 2) + 'x' + (Math.floor(h / 2) * 2);
}

// ======================== ★ 主页状态：自动保存 / 自动恢复 ========================
function genSupportsQuality(model) { return /gpt|gtp/i.test(model || ''); }

const HOME_STATE_KEY = 'llm_home_state_v1';
let homeSaveTimer = null;

function homeStateSnapshot() {
  return {
    form: {
      style: homeVal(optStyle), shot: homeVal(optShot), angle: homeVal(optAngle),
      place: homeVal(optPlace), time: homeVal(optTime), light: homeVal(optLight),
      desc: input1 ? input1.value : ''
    },
    refs: (typeof pendingImages !== 'undefined' ? pendingImages : [])
      .filter(function (p) { return p.ref; })
      .map(function (p) { return { ref: p.ref, label: p.label || '' }; }),
    gen: homeGenItems.filter(function (it) { return it.ref; }).map(function (it) { return it.ref; }),
    output: (output && output.classList.contains('md-body')) ? output.innerText : ''
  };
}

// 图片太大，不能进 localStorage：先落盘，只记文件名
async function persistHomeImages() {
  if (!isElectron || !ipc) return;
  for (let i = 0; i < pendingImages.length; i++) {
    const p = pendingImages[i];
    if (p.ref || !p.dataUrl || String(p.dataUrl).slice(0, 5) !== 'data:') continue;
    try {
      const r = await ipc.invoke('canvas-image-save', p.dataUrl);
      if (r && r.ok && r.name) p.ref = r.name;
    } catch (e) {}
  }
  for (let j = 0; j < homeGenItems.length; j++) {
    const it = homeGenItems[j];
    if (it.ref || !it.src || String(it.src).slice(0, 5) !== 'data:') continue;
    try {
      const r = await ipc.invoke('canvas-image-save', it.src);
      if (r && r.ok && r.name) it.ref = r.name;
    } catch (e) {}
  }
}

function saveHomeState(immediate) {
  clearTimeout(homeSaveTimer);
  const run = async function () {
    try {
      await persistHomeImages();
      localStorage.setItem(HOME_STATE_KEY, JSON.stringify(homeStateSnapshot()));
    } catch (e) {}
  };
  if (immediate) run(); else homeSaveTimer = setTimeout(run, 500);
}

async function restoreHomeState() {
  let st = null;
  try { st = JSON.parse(localStorage.getItem(HOME_STATE_KEY) || 'null'); } catch (e) {}
  if (!st) return;

  if (st.form) {
    if (optStyle) optStyle.value = st.form.style || '';
    if (optShot) optShot.value = st.form.shot || '';
    if (optAngle) optAngle.value = st.form.angle || '';
    if (optPlace) optPlace.value = st.form.place || '';
    if (optTime) optTime.value = st.form.time || '';
    if (optLight) optLight.value = st.form.light || '';
    if (input1 && typeof st.form.desc === 'string') input1.value = st.form.desc;
    [optStyle, optShot, optAngle, optLight].forEach(function (s) { syncAiDefault(s); });
    if (input1) input1.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // 参考图：存的是文件名，逐个读回 data URL
  if (st.refs && st.refs.length && isElectron && ipc && pendingImages.length === 0) {
    for (let i = 0; i < st.refs.length; i++) {
      const it = st.refs[i];
      try {
        const r = await ipc.invoke('canvas-image-load', it.ref);
        if (r && r.ok && r.dataUrl) {
          pendingImages.push({
            dataUrl: r.dataUrl, name: it.ref,
            label: it.label || ('图' + (i + 1)), ref: it.ref
          });
        }
      } catch (e) {}
    }
    renderImgPreview();
  }

  // 生成结果（可能多张）
  if (st.gen && isElectron && ipc) {
    const gs = Array.isArray(st.gen) ? st.gen : (st.gen ? [st.gen] : []);
    const srcs = [], refs = [];
    for (let k = 0; k < gs.length; k++) {
      try {
        const r = await ipc.invoke('canvas-image-load', gs[k]);
        if (r && r.ok && r.dataUrl) { srcs.push(r.dataUrl); refs.push(gs[k]); }
      } catch (e) {}
    }
    if (srcs.length) {
      showGenResult(srcs);
      srcs.forEach(function (s, i) { if (homeGenItems[i]) homeGenItems[i].ref = refs[i] || ''; });
    }
  }

  // AI 回复的提示词
  if (st.output) showMarkdownResult(st.output);
}

// ★ 清空当前页：字段 / 参考图 / 提示词 / 生成图
async function clearHomeAll() {
  const ok = (typeof showConfirm === 'function')
    ? await showConfirm('清空当前页？参考图、生成的提示词和图片都会被删除。', { danger: true, okLabel: '清空' })
    : true;
  if (!ok) return;

  // 1. 表单字段
  [optStyle, optShot, optAngle, optLight].forEach(function (s) {
    if (!s) return;
    s.value = '';
    syncAiDefault(s);
  });
  if (optPlace) optPlace.value = '';
  if (optTime) optTime.value = '';
  if (input1) {
    input1.value = '';
    input1.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // 2. 参考图
  pendingImages = [];
  renderImgPreview();

  // 3. 生成结果
  homeGenItems = [];
  const genArea = document.getElementById('genArea');
  if (genArea) {
    genArea.innerHTML = '<div class="gen-empty"><i class="fas fa-image"></i><p>点上方「生图」把结果画在这里</p></div>';
  }

  // 4. AI 回复
  if (output) {
    output.classList.remove('md-body');
    output.removeAttribute('contenteditable');
    output.innerHTML = '<div class="empty-state"><i class="fas fa-arrow-right"></i><p>等待 AI 回复...</p></div>';
  }
  if (copyBtn) copyBtn.style.display = 'none';
  if (saveResultBtn) saveResultBtn.style.display = 'none';
  try { hideOutputMeta(); } catch (e) {}

  // 5. 本地状态
  try { localStorage.removeItem(HOME_STATE_KEY); } catch (e) {}
  showToast('已清空本页');
}

// 启动时恢复（等其它初始化跑完）
window.addEventListener('load', function () {
  setTimeout(function () { restoreHomeState(); }, 300);
});

// ★ 某些生图模型尺寸受限：选中后比例/清晰度锁死，不允许改
const GEN_MODEL_RESTRICT = [
  { test: /nano-?banana-?lite/i, ratio: '1:1', res: '1k', tip: '该模型只支持 1:1 / 1K' }
];

// ★ GPT Image 2.5 系列支持 5 档画质 + 最多 4 张
const GEN_Q5 = [['low', '低画质'], ['medium', '标准画质'], ['high', '高画质'], ['xhigh', '超高画质'], ['max', '极致画质']];

function genQualityMode(model) {
  const m = String(model || '');
  if (!/gpt|gtp/i.test(m)) return 'none';
  if (/2[.\-]?5|sunburst|flare/i.test(m)) return 'five';
  return 'three';
}

// 依据当前模型显示/隐藏「画质」「数量」
function applyGenQualityUI(model) {
  const qSel = document.getElementById('genQualitySelect');
  const cSel = document.getElementById('genCountSelect');
  const mode = genQualityMode(model);
  if (qSel) {
    if (mode !== 'five') {
      qSel.style.display = 'none';
    } else {
      qSel.style.display = '';
      const keep = qSel.value;
      qSel.innerHTML = GEN_Q5.map(function (p) {
        return '<option value="' + p[0] + '">' + p[1] + '</option>';
      }).join('');
      if (GEN_Q5.some(function (p) { return p[0] === keep; })) qSel.value = keep;
    }
  }
  if (cSel) cSel.style.display = (mode === 'five') ? '' : 'none';
}

function genRestrictionFor(model) {
  const name = String(model || '');
  for (let i = 0; i < GEN_MODEL_RESTRICT.length; i++) {
    if (GEN_MODEL_RESTRICT[i].test.test(name)) return GEN_MODEL_RESTRICT[i];
  }
  return null;
}

// 依据当前选中的生图模型，锁定或放开比例 / 清晰度
function applyGenModelRestriction() {
  const sel = document.getElementById('genModelSelect');
  const ratioSel = document.getElementById('genRatioSelect');
  const resSel = document.getElementById('genResSelect');
  if (!sel) return;

  const list = genApiList();
  const api = list.find(function (a) { return a.id === sel.value; }) || list[0];
  const rule = api ? genRestrictionFor(api.model) : null;

  applyGenQualityUI(api ? api.model : '');

  // 先全部放开
  [ratioSel, resSel].forEach(function (el) {
    if (!el) return;
    el.disabled = false;
    el.classList.remove('is-locked');
    el.removeAttribute('title');
  });

  if (rule) {
    if (ratioSel) {
      ratioSel.value = rule.ratio;
      ratioSel.disabled = true;
      ratioSel.classList.add('is-locked');
      ratioSel.title = rule.tip;
    }
    if (resSel) {
      resSel.value = rule.res;
      resSel.disabled = true;
      resSel.classList.add('is-locked');
      resSel.title = rule.tip;
    }
  } else {
    // 换回不受限的模型：恢复用户上次的选择
    try {
      const r = localStorage.getItem('llm_home_gen_ratio');
      if (r && ratioSel) ratioSel.value = r;
      const s = localStorage.getItem('llm_home_gen_res');
      if (s && resSel) resSel.value = s;
    } catch (e) {}
  }
}

// 「带参考图」开关：有参考图才显示，并显示张数
function syncGenRefToggle() {
  const wrap = document.getElementById('genRefWrap');
  const cnt = document.getElementById('genRefCount');
  if (!wrap) return;
  const n = pendingImages.length;
  wrap.style.display = n ? 'inline-flex' : 'none';
  if (cnt) cnt.textContent = n ? ('×' + n) : '';
}

async function runHomeGen() {
  const genRunBtn = document.getElementById('genRunBtn');
  const genArea = document.getElementById('genArea');
  const genSel = document.getElementById('genModelSelect');
  const ratioSel = document.getElementById('genRatioSelect');
  const resSel = document.getElementById('genResSelect');
  if (!genArea || !genRunBtn) return;

  const prompt = genPromptText();
  if (!prompt) { showToast('请先在上方生成提示词，或直接在里面写'); return; }

  const list = genApiList();
  if (!list.length) { showToast('还没有生图模型：到「设置」里给某个模型勾选「用于生图」'); return; }
  const api = list.find(function (a) { return a.id === (genSel ? genSel.value : ''); }) || list[0];
  if (!api.key) { showToast('这个生图模型还没填 API Key'); return; }

  const ratio = ratioSel ? ratioSel.value : '1:1';
  const resLevel = resSel ? resSel.value : '1k';
  // ★ 生图模型看不懂 @"图1" 这种引用标记，发给它之前先去掉
  const finalPrompt = prompt.replace(/@"[^"]{1,30}"/g, '').replace(/[ \t]{2,}/g, ' ').trim() || prompt;
  let withRef = false;
  try {
    // 被模型限制锁死时，不覆盖用户原来的偏好
    if (!ratioSel || !ratioSel.disabled) localStorage.setItem('llm_home_gen_ratio', ratio);
    if (!resSel || !resSel.disabled) localStorage.setItem('llm_home_gen_res', resLevel);
  } catch (e) {}

  genRunBtn.disabled = true;
  genArea.innerHTML = '<div class="gen-empty"><i class="fas fa-spinner fa-spin"></i><p>生成中，请稍候…</p></div>';
  const t0 = Date.now();

  try {
    // ★ 带参考图时必须走「图片编辑」接口：文生图接口不接受 images
    const useRefEl = document.getElementById('genUseRef');
    withRef = !!(useRefEl && useRefEl.checked && pendingImages.length > 0);

    let root = (api.url || '').replace(/\/+$/, '').replace(/\/images\/(generations|edits)$/i, '');
    const baseUrl = root + (withRef ? '/images/edits' : '/images/generations');

    const base = {
      model: api.model,
      prompt: finalPrompt,
      n: 1
    };

    // 画质：2.5 系列走 5 档，其它 gpt 系列仍固定 medium
    const qMode = genQualityMode(api.model);
    if (qMode === 'five') {
      const qSel = document.getElementById('genQualitySelect');
      const cSel = document.getElementById('genCountSelect');
      base.quality = (qSel && qSel.value) || 'medium';
      base.n = Math.max(1, Math.min(4, parseInt(cSel && cSel.value, 10) || 1));
    } else if (genSupportsQuality(api.model)) {
      base.quality = 'medium';
    }

    // ★ 把参考图一起传给生图模型
    //   接口要求 images 是对象数组：{ image_url: 'data:image/...' }
    if (withRef) {
      base.images = pendingImages.map(function (p) { return { image_url: p.dataUrl }; });
    }

    // ★ 比例只用 size: "宽x高"
    //   实测这个中转会忽略 aspect_ratio（返回 200 但出方图），只有 size 生效
    const payloads = [Object.assign({ size: genComputeSize(ratio, resLevel) }, base)];

    let data = null, lastErr = '';
    for (let pi = 0; pi < payloads.length; pi++) {
      const resp = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.key },
        body: JSON.stringify(payloads[pi])
      });
      if (resp.ok) { data = await resp.json(); break; }
      const errText = await resp.text();
      lastErr = 'HTTP ' + resp.status + '：' + String(errText).slice(0, 160);
      if (pi === payloads.length - 1) throw new Error(lastErr);
    }
    if (!data) throw new Error(lastErr || '生成失败');
    const list = (data && Array.isArray(data.data)) ? data.data : [];
    const imgs = list.map(function (it) {
      return it.b64_json ? ('data:image/png;base64,' + it.b64_json) : it.url;
    }).filter(Boolean);
    if (!imgs.length) throw new Error('接口返回格式异常，没拿到图片');

    // ★ 渲染结果（抽成函数，恢复上次结果时也用它）
    showGenResult(imgs);
    saveHomeState(true);
    // 报告真实出图尺寸，方便判断服务端有没有按比例来
    const probe = new Image();
    probe.onload = function () {
      showToast('✅ 生图完成 · 实际 ' + probe.naturalWidth + '×' + probe.naturalHeight
        + '（请求 ' + ratio + '，' + ((Date.now() - t0) / 1000).toFixed(1) + 's）');
    };
    probe.onerror = function () { showToast('✅ 生图完成'); };
    probe.src = imgs[0];
  } catch (e) {
    const msg = String(e.message || '生成失败');
    let hint = '';
    if (withRef) {
      hint = /编辑接口|edit|mask|蒙版|不接受参考图/i.test(msg)
        ? '这个模型是「文生图」模式，不支持参考图：换成带 edit / 编辑 字样的模型，或取消勾选「带参考图」'
        : '已附带参考图：若该模型不支持参考图，取消勾选「带参考图」再试';
    }
    genArea.innerHTML = '<div class="gen-empty gen-err"><i class="fas fa-triangle-exclamation"></i><p>'
      + escapeHtml(msg) + '</p>'
      + (hint ? '<p class="gen-hint">' + escapeHtml(hint) + '</p>' : '')
      + '</div>';
  } finally {
    genRunBtn.disabled = false;
  }
}

(function bindGenUI() {
  const sel = document.getElementById('genModelSelect');
  const btn = document.getElementById('genRunBtn');
  const ratioSel = document.getElementById('genRatioSelect');
  const resSel = document.getElementById('genResSelect');
  if (sel) {
    sel.addEventListener('change', function () {
      try { localStorage.setItem(GEN_MODEL_KEY, this.value); } catch (e) {}
      applyGenModelRestriction();   // ★ 换模型后重新判断尺寸是否受限
    });
    renderGenModelOptions();
    applyGenModelRestriction();
  }
  // 比例 / 尺寸：记住上次选择
  try {
    const r = localStorage.getItem('llm_home_gen_ratio');
    if (r && ratioSel) ratioSel.value = r;
    const s = localStorage.getItem('llm_home_gen_res');
    if (s && resSel) resSel.value = s;
    const qSel = document.getElementById('genQualitySelect');
    const q = localStorage.getItem('llm_home_gen_quality');
    if (q && qSel) qSel.value = q;
    const cSel = document.getElementById('genCountSelect');
    const c = localStorage.getItem('llm_home_gen_count');
    if (c && cSel) cSel.value = c;

    // 记住画质 / 数量
    if (qSel) qSel.addEventListener('change', function () {
      try { localStorage.setItem('llm_home_gen_quality', this.value); } catch (e) {}
    });
    if (cSel) cSel.addEventListener('change', function () {
      try { localStorage.setItem('llm_home_gen_count', this.value); } catch (e) {}
    });
  } catch (e) {}
  syncGenRefToggle();
  if (btn) btn.addEventListener('click', runHomeGen);

  const clearBtn = document.getElementById('clearHomeBtn');
  if (clearBtn) clearBtn.addEventListener('click', clearHomeAll);
})();

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
  // ★ 联网搜索用的 Tavily Key（留空 = 关闭联网搜索）
  if (tavilyKeyInput) {
    const tk = String(tavilyKeyInput.value || '').trim();
    if (tk) localStorage.setItem('llm_tavily_key', tk);
    else localStorage.removeItem('llm_tavily_key');
  }
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
  if (tavilyKeyInput) tavilyKeyInput.value = localStorage.getItem('llm_tavily_key') || '';
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
    showToast('🔠 文字大小已切换');
  });
}

if (clearMemBtn) clearMemBtn.addEventListener('click', function () { clearConv(); showToast('🧹 对话记忆已清空'); });

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

  // ★ 参考图区始终显示；模型不支持看图时变灰并给出提示
  const canSee = !!(currentApi && currentApi.vision);
  syncGenRefToggle();   // 生图那边的「带参考图」开关跟着图片数量走
  imgPreviewBar.style.display = '';
  imgPreviewBar.classList.toggle('is-disabled', !canSee);

  imgPreviewBar.innerHTML = '';
  if (pendingImages.length === 0) {
    imgPreviewBar.innerHTML = canSee
      ? '<div class="img-preview-empty"><i class="fas fa-image"></i> 点击浏览或拖拽图片到此处，或 Ctrl+V 粘贴（加完双击名字可改名）</div>'
      : '<div class="img-preview-empty"><i class="fas fa-eye-slash"></i> 当前模型不支持看图 —— 请选择支持看图的模型后才能上传参考图</div>';
    return;
  }

  pendingImages.forEach((img, idx) => {
    const item = document.createElement('div');
    item.className = 'img-item';
    const label = imgLabel(img, idx);
    item.innerHTML = `<img src="${img.dataUrl}" alt="${escapeHtml(label)}">`
      + `<span class="img-item-name" title="双击改名">${escapeHtml(label)}</span>`
      + `<button class="img-item-del" title="删除"><i class="fas fa-times"></i></button>`;
    item.querySelector('.img-item-del').addEventListener('click', function (e) { e.stopPropagation(); removeImage(idx); });

    // ★ 点已上传的图 → 放大预览（不再新增图片）
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      showImagePreview(img.dataUrl);
    });

    // ★ 双击名字改名 → 同步替换已插入的 @"旧名"
    const nmEl = item.querySelector('.img-item-name');
    nmEl.addEventListener('click', function (e) { e.stopPropagation(); });
    nmEl.addEventListener('dblclick', function (e) {
      e.stopPropagation();
      nmEl.contentEditable = 'true';
      nmEl.focus();
      const r = document.createRange();
      r.selectNodeContents(nmEl);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(r);
    });
    nmEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); nmEl.blur(); }
    });
    nmEl.addEventListener('blur', function () {
      nmEl.contentEditable = 'false';
      const oldName = imgLabel(img, idx);
      let nm = String(nmEl.textContent || '').replace(/[""\n\r\t]/g, '').trim().slice(0, 20);
      if (!nm) nm = '图' + (idx + 1);
      img.label = nm;
      replaceRefToken(oldName, nm);
      renderImgPreview();
    });

    imgPreviewBar.appendChild(item);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'img-add-btn';
  addBtn.title = canSee ? '添加图片' : '需要支持看图的模型';
  addBtn.innerHTML = '<i class="fas fa-plus"></i>';
  addBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!currentApi.vision) { showToast('当前模型不支持看图，请切换支持看图的模型'); return; }
    if (imgFileInput) imgFileInput.click();
  });
  imgPreviewBar.appendChild(addBtn);

  // 不支持看图时，在图片后面补一句说明
  if (!canSee) {
    const warn = document.createElement('span');
    warn.className = 'img-preview-warn';
    warn.textContent = '当前模型不支持看图，参考图暂时不可用';
    imgPreviewBar.appendChild(warn);
  }
}

async function addImage(file) {
  if (!file) return;
  if (!currentApi.vision) { showToast('当前模型不支持看图，请切换视觉模型'); return; }
  if (!file.type.startsWith('image/')) { showToast('请选择图片文件'); return; }
  if (file.size > 10 * 1024 * 1024) { showToast('图片过大，请选择 10MB 以内的图片'); return; }
  try {
    const dataUrl = await processBgFile(file);
    let n = 1;
    while (pendingImages.some(function (p) { return p.label === ('图' + n); })) n++;
    pendingImages.push({ dataUrl: dataUrl, name: file.name, label: '图' + n });
    renderImgPreview();
    saveHomeState(true);   // ★ 立刻保存（图片会落盘，只存文件名）
    showToast('✅ 已添加参考图：图' + n);
  } catch (e) { showToast('❌ ' + (e.message || '添加失败')); }
}

function removeImage(idx) { pendingImages.splice(idx, 1); renderImgPreview(); saveHomeState(true); }
function clearImages() { pendingImages = []; renderImgPreview(); saveHomeState(true); }

// ★ 参考图放大预览
let imgLightbox = null;
function showImagePreview(src) {
  if (!imgLightbox) {
    imgLightbox = document.createElement('div');
    imgLightbox.className = 'img-lightbox';
    imgLightbox.innerHTML = '<img alt="参考图预览">';
    imgLightbox.addEventListener('click', function () { imgLightbox.classList.remove('show'); });
    document.body.appendChild(imgLightbox);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && imgLightbox) imgLightbox.classList.remove('show');
    });
  }
  imgLightbox.querySelector('img').src = src;
  imgLightbox.classList.add('show');
}

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
// ★ 设置弹窗不再支持「点外面关闭」——只能点「保存设置」或「取消」，
//   否则容易手误关掉，API 配置还没保存就丢了。
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
// ★ 联网搜索设置分组
const webCollapseGroup = document.getElementById('webCollapseGroup');
const webCollapseHeader = document.getElementById('webCollapseHeader');
if (webCollapseGroup && webCollapseHeader) {
  webCollapseHeader.addEventListener('click', function () { webCollapseGroup.classList.toggle('open'); });
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
// 系统预设卡片已移除，这个按钮不存在了 → 加空值保护，避免整段脚本中断
if (presetEditBtn) presetEditBtn.addEventListener('click', function () {
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
  output.classList.remove('plain-body');
  output.classList.add('md-body');
  output.innerHTML = renderMarkdown(markdown);
  output.setAttribute('contenteditable', 'true');   // ★ 结果可直接改，改完再生图
  copyBtn.style.display = 'flex';
  saveResultBtn.style.display = 'flex';
  try { saveHomeState(); } catch (e) {}             // ★ 记住这次结果
}

// ★ 原样显示（不渲染 markdown）—— 视频提示词用这个：
//   渲染后复制出去会把 ### / ** / --- / * 这些分隔符号全部吃掉，粘贴到别的工具里就变成一坨
function showPlainResult(text) {
  output.classList.remove('md-body');
  output.classList.add('plain-body');
  output.textContent = text;
  output.setAttribute('contenteditable', 'true');
  copyBtn.style.display = 'flex';
  saveResultBtn.style.display = 'flex';
  try { saveHomeState(); } catch (e) {}
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

// ======================== ★ 主页：结构化提示词（生图） ========================
// 每个下拉选项都对应一段写死的提示词片段，避免模型自己瞎猜风格/景别/光线的含义
const HOME_STYLE_FRAG = {
  '电影感':   { pos: '电影级画面，宽银幕构图，浅景深，体积光，高动态范围，胶片颗粒', neg: '卡通，插画，低清，塑料感' },
  '写实摄影': { pos: '写实摄影质感，真实相机成像，自然光影，皮肤与材质细节清晰，浅景深', neg: '绘画，3D 渲染，过度磨皮，变形' },
  '3D 渲染':  { pos: '3D 渲染，CG 质感，柔和棚拍布光，材质细节丰富，干净边缘', neg: '照片，噪点，平面插画' },
  '黑白日漫': { pos: '黑白日漫，网点阴影，清晰墨线，强明暗对比', neg: '彩色，写实照片，3D 渲染' },
  '彩色日漫': { pos: '彩色日漫，赛璐璐上色，干净线条，鲜明配色', neg: '写实照片，3D 渲染，脏色' },
  '油画':     { pos: '油画质感，厚涂笔触，可见画布纹理，古典色调', neg: '照片，3D 渲染，数码平涂' },
  '国风水墨': { pos: '中国水墨，留白构图，墨色浓淡变化，宣纸纹理', neg: '照片，浓艳色彩，3D 渲染' },
  '赛博朋克': { pos: '赛博朋克，霓虹冷暖对比，湿润地面反光，高对比', neg: '小清新，低饱和，白天暖光' }
};
const HOME_SHOT_FRAG = {
  // ---- 拍人（人像口径，用户按"拍到哪"选）----
  '面部特写': '面部特写，只取头部，面部占满画面，五官细节清晰',
  '头肩像': '头肩像，取头部到肩部，突出表情与气质',
  '胸像': '胸像，取头部到胸口，兼顾表情与上半身姿态',
  '半身像': '半身像，取头部到腰部，可见手臂与手部动作',
  '牛仔镜头': '牛仔镜头，取头部到大腿中部，兼顾人物与随身道具',
  '七分身': '七分身像，取头部到膝盖，兼顾人物与部分环境',
  '全身像': '全身像，从头到脚完整入画，留出上下空间',
  '环境人像': '环境人像，人物与所处环境同时呈现，环境占比不小于人物',
  // ---- 拍景（影视口径）----
  '大远景 EWS': '大远景，主体极小，环境占比极大，建立空间关系',
  '远景 WS': '远景，主体较小，可看清整体环境与地形',
  '全景 FS': '全景，主体全身完整入画，留出上下空间',
  '中全景 MFS': '中全景，膝盖以上，兼顾人物与场景',
  '中景 MS': '中景，腰部以上，强调动作与姿态',
  '近景 MCU': '近景，胸部以上，突出表情与神态',
  '特写 CU': '特写，面部或关键局部占满画面，细节清晰',
  '大特写 ECU': '大特写，只取眼睛/嘴唇/纹理等极小局部',
  '微距 Macro': '微距摄影，极近距离，浅景深，细节极致'
};
const HOME_ANGLE_FRAG = {
  '正面': '正面朝向镜头，身体与面部正对观者，构图端正',
  '四分之三侧': '四分之三侧脸，面部略转向一侧，仍保留眼神交流，人像常用角度',
  '平视': '平视机位，与主体视线齐平，稳定自然',
  '仰拍': '低角度仰拍，主体显得高大有压迫感',
  '俯拍': '高角度俯拍，强调环境与主体位置关系',
  '顶拍': '垂直向下顶视，平面构成感强',
  '贴地低角度': '机位贴近地面，前景夸张，空间纵深强',
  '荷兰角': '画面倾斜的荷兰角，制造不安与动感',
  '过肩': '过肩视角，前景带肩，视线引向主体',
  '正侧': '正侧面拍摄，轮廓线条清晰',
  '背侧': '背侧视角，主体背影偏侧，制造悬念',
  '主观视角': '第一人称主观视角，代入感强',
  '镜面反射': '通过镜面/水面反射构图，画面层次丰富'
};
const HOME_LIGHT_FRAG = {
  '顺光': '顺光照明，光线从机位方向打来，阴影少，色彩还原准确',
  '侧光': '侧光照明，明暗交界线清晰，立体感与材质质感强',
  '侧逆光': '侧逆光，主体边缘受光，轮廓分明，背景略压暗',
  '逆光': '逆光，主体近乎剪影，边缘保留高光轮廓',
  '顶光': '顶光，眼窝与下颌投下阴影，气氛压抑或戏剧化',
  '黄金时刻': '日落前后的黄金时刻，低角度暖金色光，长投影',
  '蓝调时刻': '日落后蓝调时刻，冷蓝色环境光，天空通透',
  '阴天柔光': '阴天散射柔光，光线均匀，无硬阴影',
  '窗户光': '单侧窗户光，柔和过渡，室内明暗层次自然',
  '丁达尔光束': '丁达尔效应，可见光柱穿过缝隙或树冠',
  '月光': '冷调月光，低照度，高对比，安静氛围',
  '伦勃朗光': '伦勃朗光，脸颊暗部出现三角形光斑，立体感强',
  '蝴蝶光': '蝴蝶光，机位正上方打光，鼻下形成对称蝴蝶形阴影',
  '环形光': '环形光，光源与视线约 30–45 度，鼻侧带小投影',
  '分割光': '分割光，面部一明一暗各占一半，戏剧张力强',
  '三点布光': '三点布光，主光＋辅光＋轮廓光，主体与背景分离清晰',
  '轮廓光': '强轮廓光勾边，主体从暗背景中剥离',
  '柔光箱': '大面积柔光箱，光质柔和均匀，过渡细腻',
  '硬光': '硬光直打，边缘锐利，投影浓重，质感强烈',
  '霓虹光': '霓虹光源，品红与青色对比，环境反射明显',
  '双色补光': '冷暖双色补光，一侧暖橙一侧冷蓝，色相对撞',
  '火光': '火光照明，暖橙色跳动光斑，明暗不均',
  '烛光': '烛光，低照度暖黄，近处亮、远处迅速衰减',
  '体积光': '体积光，空气中可见光束，尘埃颗粒明显',
  '高调': '高调布光，整体明亮，阴影浅，干净通透',
  '低调': '低调布光，大面积暗部，少量高光勾勒主体',
  '剪影': '逆光剪影，主体近乎全黑，只保留轮廓'
};

const homeTypeSel = document.getElementById('homeTypeSel');
const homeImgForm = document.getElementById('homeImgForm');
const homeVideoSoon = document.getElementById('homeVideoSoon');
const homeDescLabel = document.getElementById('homeDescLabel');
const optStyle = document.getElementById('optStyle');
const optShot = document.getElementById('optShot');
const optAngle = document.getElementById('optAngle');
const optPlace = document.getElementById('optPlace');
const optTime = document.getElementById('optTime');
const optLight = document.getElementById('optLight');
const HOME_TYPE_KEY = 'llm_home_prompt_type';

function homeVal(el) { return el ? String(el.value || '').trim() : ''; }

function syncAiDefault(sel) {
  if (sel) sel.classList.toggle('ai-default', !sel.value);
}
[optStyle, optShot, optAngle, optLight].forEach(function (s) {
  if (!s) return;
  syncAiDefault(s);
  s.addEventListener('change', function () { syncAiDefault(s); saveHomeState(); });
});

// 文字类输入：改动就存（含 @ 引用）
[input1, optPlace, optTime].forEach(function (el) {
  if (!el) return;
  el.addEventListener('input', function () { saveHomeState(); });
});

// 参考图的展示名（默认 图1/图2…，可双击改名）
function imgLabel(img, i) {
  return (img && img.label) ? img.label : ('图' + (i + 1));
}

// ---------------- 提示词语言（中文 / English） ----------------
const LANG_KEY = 'llm_home_prompt_lang';
let homeLang = 'zh';
(function bindHomeLang() {
  const seg = document.getElementById('langSeg');
  try { homeLang = localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh'; } catch (e) {}
  if (!seg) return;
  function paint() {
    seg.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-lang') === homeLang);
    });
  }
  paint();
  seg.querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () {
      homeLang = b.getAttribute('data-lang') || 'zh';
      paint();
      try { localStorage.setItem(LANG_KEY, homeLang); } catch (e) {}
    });
  });
})();

// 把结构化字段拼成最终提示词
function composeHomePrompt() {
  const parts = [];
  const isEn = homeLang === 'en';

  // ★ 强约束：只要一条可直接执行的提示词，禁止解释/多方案/参数说明
  parts.push([
    '【任务】把下面的设定整理成一条可以直接粘贴到生图工具里使用的提示词。',
    '【硬性要求】',
    '1. 只输出提示词正文，不要解释、不要开场白、不要标题、不要编号；',
    '2. 只给一个版本，不要「方案一 / 方案二 / 以下是 / 已为您整理」这类内容；',
    '3. 不要输出参数说明、优化建议、模型名称、工具用法；',
    isEn ? '4. 整段结果必须全部是英文，禁止出现任何中文字符（包括标签）；'
         : '4. 用中文输出；',
    isEn ? '5. 负面提示词单独占一行，以「Negative prompt:」开头；'
         : '5. 负面提示词单独占一行，以「负面提示词：」开头；',
    '6. 参考图已经提供的元素不要再重复描述。'
  ].join('\n'));

  const style = homeVal(optStyle);
  const shot = homeVal(optShot);
  const angle = homeVal(optAngle);
  const place = homeVal(optPlace);
  const time = homeVal(optTime);
  const light = homeVal(optLight);
  const desc = input1 ? input1.value.trim() : '';

  if (pendingImages.length) {
    const names = pendingImages.map(function (img, i) { return imgLabel(img, i); }).join('、');
    parts.push('【参考图】共 ' + pendingImages.length + ' 张：' + names +
      '\n· 文中 @"图N" 表示引用对应名字的参考图；参考图已经提供的元素，不要在提示词里重复描述');
  }
  if (style && HOME_STYLE_FRAG[style]) parts.push('【风格】' + HOME_STYLE_FRAG[style].pos);
  if (shot && HOME_SHOT_FRAG[shot]) parts.push('【景别】' + HOME_SHOT_FRAG[shot]);
  if (angle && HOME_ANGLE_FRAG[angle]) parts.push('【角度】' + HOME_ANGLE_FRAG[angle]);
  if (place) parts.push('【拍摄地点】' + place);
  if (time) parts.push('【拍摄时间】' + time);
  if (light && HOME_LIGHT_FRAG[light]) parts.push('【光线】' + HOME_LIGHT_FRAG[light]);
  if (desc) parts.push('【画面内容】' + desc);
  if (style && HOME_STYLE_FRAG[style] && HOME_STYLE_FRAG[style].neg) {
    parts.push((isEn ? '[Negative prompt] ' : '【负面提示词】') + HOME_STYLE_FRAG[style].neg);
  }
  return parts.join('\n');
}

// 类型切换：生图 / 视频（视频暂为占位）
// ======================== 视频提示词 ========================
// ★ Ember 只做两件事：收集用户填的内容 + 拼成一段说明；怎么写成提示词交给 AI
const SHOT_LANG = {
  '运动 · 品牌广告': [
    ['红牛式极限运动广告', '超广角贴脸 · 强逆光剪影 · 超慢动作 · 碎切加速'],
    ['运动品牌大片', '低机位冲刺 · 贴地跟随 · 速度模糊 · 鼓点剪辑'],
    ['汽车广告', '车漆高光扫过 · 贴地滑轨 · 环绕转盘 · 慢动作水花'],
    ['时尚大片', '慢动作布料翻飞 · 闪光灯节奏 · 高对比硬光 · 定点环绕'],
    ['产品特写广告', '微距推近 · 旋转陈列 · 高光沿边缘滑动']
  ],
  '英雄 · 登场': [
    ['英雄出场', '低角度仰拍 · 逆光剪影 · 缓缓推近 · 音乐爆发点'],
    ['反派登场', '俯拍压迫 · 极慢推近 · 大面积阴影 · 局部打光'],
    ['史诗登场', '航拍拉升 + 环绕旋转 + 边缘高光 + 尘埃粒子'],
    ['王者归来', '背影起手 · 长焦压缩 · 正面推轨 · 众人仰视'],
    ['武侠出场', '低机位 · 衣袂慢动作 · 落叶雨丝 · 留白构图']
  ],
  '动作 · 追逐': [
    ['好莱坞街头追逐', '手持跟拍 · 跳切 · 贴地后视镜 · 气流震动'],
    ['追车漂移', '车侧低机位 · 甩尾跟随 · 轮胎烟雾 · 升格慢镜'],
    ['枪战对峙', '快速正反打 · 特写穿插 · 慢推静止段 · 火光闪频'],
    ['近身格斗', '手持贴身 · 快速摇镜 · 拳拳顿点 · 短暂定格'],
    ['爆炸逃生', '升格慢动作 · 冲击波推镜 · 碎片飞向镜头'],
    ['特种部队突入', '第一人称推门 · 破门瞬间 · 手持跟随 · 烟雾弹']
  ],
  '喜剧': [
    ['荒诞喜剧', '固定机位冷面旁观 · 突兀跳切 · 反高潮构图'],
    ['尴尬冷场', '长时间静止 · 缓慢推近脸部 · 只听见环境音'],
    ['快节奏闹剧', '加速播放 · 抽搐式剪辑 · 多线并置'],
    ['黑色幽默', '平静的长镜头配荒诞内容 · 突兀硬切'],
    ['伪纪录片', '手持晃动 · 突然变焦 · 对镜头说话']
  ],
  '悬疑 · 恐怖': [
    ['恐怖悬疑', '长镜头潜行 · 暗部占大半 · 缓慢推近 · 突然静止'],
    ['心理压迫', '缓慢环绕 · 畸变广角 · 浅景深 · 声音抽离'],
    ['惊吓瞬间', '长时间静止 → 突袭跳切 + 贴脸特写'],
    ['罪案现场', '俯拍全景 · 缓慢横移 · 冷调硬光 · 证物特写']
  ],
  '情感 · 文艺': [
    ['浪漫邂逅', '柔光 · 浅景深 · 缓慢环绕 · 逆光发丝'],
    ['情绪崩溃', '手持轻晃 · 脸部大特写 · 长焦压缩 · 虚焦背景'],
    ['怀旧回忆', '暖调偏黄 · 颗粒感 · 缓慢升降 · 柔边光晕'],
    ['孤独疏离', '大留白构图 · 固定机位长镜头 · 人物极小'],
    ['离别', '背身长镜头 · 缓慢拉远 · 光线渐暗']
  ],
  '史诗 · 自然': [
    ['自然纪录片', '航拍大远景 · 延时云层 · 长焦动物特写 · 微距生态'],
    ['史诗风景', '宽画幅缓慢横移 · 黄金时刻 · 人物作为比例参照'],
    ['灾难降临', '低角度仰望 · 大体积压迫 · 慢推 · 尘雾翻涌']
  ],
  '科幻 · 未来': [
    ['赛博朋克夜景', '霓虹雨夜 · 广角贴近 · 缓慢推轨 · 湿地面反光'],
    ['科幻压迫感', '巨大物体仰拍 · 缓慢上升 · 冷蓝 + 硬边光'],
    ['未来实验室', '纯白环境 · 对称构图 · 滑轨横移 · 冷调柔光']
  ],
  '动画 · 游戏': [
    ['日系动漫感', '高速切换 · 速度线 · 决定性瞬间定格 · 逆光光斑'],
    ['游戏实机感', '第一人称跟随 · 轻微 HUD 晃动 · 贴地冲刺'],
    ['定格动画', '逐帧跳跃感 · 微缩布景 · 柔和高光']
  ],
  '结构 · 叙事': [
    ['一镜到底', '不剪辑 · 连续跟随 · 镜头不断重新构图'],
    ['蒙太奇段落', '多个片段快速并列 · 靠节奏与重复建立情绪'],
    ['平行叙事', '两个场景交替切换 · 最后汇合']
  ]
};
let vidMode = 'single';

function vidBuildLang() {
  const cat = document.getElementById('vidLangCat');
  const item = document.getElementById('vidLangItem');
  if (!cat || !item) return;
  cat.innerHTML = '<option value="">— 先选类别 —</option>';
  Object.keys(SHOT_LANG).forEach(function (k) {
    const o = document.createElement('option');
    o.value = k; o.textContent = k;
    cat.appendChild(o);
  });
  item.innerHTML = '<option value="">— 先选类别 —</option>';
  cat.onchange = function () {
    const k = cat.value;
    item.innerHTML = '';
    if (!k) { item.innerHTML = '<option value="">— 先选类别 —</option>'; return; }
    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = '— 选具体类型 —';
    item.appendChild(ph);
    SHOT_LANG[k].forEach(function (p) {
      const o = document.createElement('option');
      o.value = p[0];
      o.textContent = p[0] + '｜' + p[1];
      item.appendChild(o);
    });
  };
}

function vidInit() {
  const box = document.getElementById('homeVideoForm');
  if (!box) return;
  vidBuildLang();
  const seg = document.getElementById('vidModeSeg');
  if (seg) {
    seg.addEventListener('click', function (e) {
      const b = e.target.closest('button[data-mode]');
      if (!b) return;
      vidMode = b.getAttribute('data-mode');
      Array.prototype.forEach.call(seg.querySelectorAll('button'), function (x) {
        x.classList.toggle('on', x === b);
      });
      document.getElementById('vidSingleBox').style.display = (vidMode === 'single') ? '' : 'none';
      document.getElementById('vidMultiBox').style.display = (vidMode === 'multi') ? '' : 'none';
      const lb = document.getElementById('vidDescLabel');
      if (lb) lb.textContent = (vidMode === 'single') ? '画面内容' : '补充说明（自然语言：节奏 / 情绪 / 必须有 / 不要出现…）';
      const ta = document.getElementById('vidDesc');
      if (ta) ta.placeholder = (vidMode === 'single')
        ? '描述这一镜发生了什么：谁在做什么 + 环境 + 光线（打 @ 可引用参考图）\n例：林川推门进来，把旧怀表放在柜台上'
        : '用自然语言写清楚要说明的点和约束（打 @ 可引用参考图）：\n· 节奏：前段慢、后段加速\n· 情绪：压抑 → 爆发\n· 必须有：雨、霓虹、逆光背影\n· 不要出现：人脸特写';
    });
  }
}

// 把用户填的东西合并成一段说明交给 AI（不掺任何"该怎么写"的规则）
function composeVideoPrompt() {
  const g = function (id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
  const frag = function (map, key) { return (key && map[key]) ? map[key] : key; };
  const parts = [];
  parts.push('【任务】把下面的设定写成一条可以直接粘贴到 Seedance 视频生成工具里的提示词。');
  parts.push('只输出提示词正文，不要解释、不要开场白、不要标题、不要编号。');

  if (vidMode === 'single') {
    parts.push('【镜头】单镜头，一镜到底');
    const dur = g('vidDur'); if (dur) parts.push('【时长】' + dur + ' 秒');
    const ratio = g('vidRatio'); if (ratio) parts.push('【画面比例】' + ratio);
    const shot = g('vidShot'); if (shot) parts.push('【景别】' + frag(HOME_SHOT_FRAG, shot));
    const angle = g('vidAngle'); if (angle) parts.push('【角度】' + frag(HOME_ANGLE_FRAG, angle));
    const light = g('vidLight'); if (light) parts.push('【光线】' + frag(HOME_LIGHT_FRAG, light));
    const motion = g('vidMotion'); if (motion) parts.push('【镜头运动】' + motion);
    const place = g('vidPlace'); if (place) parts.push('【地点】' + place);
    const time = g('vidTime'); if (time) parts.push('【时间】' + time);
    const style = g('vidStyle'); if (style && HOME_STYLE_FRAG[style]) parts.push('【风格】' + HOME_STYLE_FRAG[style].pos);
    const desc = g('vidDesc'); if (desc) parts.push('【画面内容】' + desc);
  } else {
    const total = g('vidTotalDur');
    const cnt = g('vidShotCount');
    if (total) parts.push('【总时长】' + total + ' 秒');
    if (cnt) parts.push('【镜头数量】' + cnt + ' 个');
    const ratio = g('vidRatio2'); if (ratio) parts.push('【画面比例】' + ratio);
    const story = g('vidStory'); if (story) parts.push('【故事梗概】' + story);
    const cat = g('vidLangCat');
    const item = g('vidLangItem');
    const lang = [];
    if (cat) lang.push(cat);
    if (item) lang.push(item);
    if (lang.length) parts.push('【镜头语言】' + lang.join(' / '));
    const place2 = g('vidPlace2'); if (place2) parts.push('【地点】' + place2);
    const time2 = g('vidTime2'); if (time2) parts.push('【时间】' + time2);
    const style2 = g('vidStyle2');
    if (style2 && HOME_STYLE_FRAG[style2]) {
      parts.push('【风格】' + HOME_STYLE_FRAG[style2].pos);
      if (HOME_STYLE_FRAG[style2].neg) parts.push('【该风格要避免的】' + HOME_STYLE_FRAG[style2].neg);
    }
    const noAudio = document.getElementById('vidNoAudio');
    if (noAudio && noAudio.checked) {
      parts.push('【必须禁止·前后都要写】');
      parts.push('生成的提示词里，**最开头**和**最结尾**各要有一句明确的中文说明：'
        + '不要背景音乐、不要字幕。两句都要有，不要只写一处。');
    }
    const desc = g('vidDesc'); if (desc) parts.push('【补充说明】' + desc);
    // ★ 多镜头：分镜脚本的层级结构 + 用符号分块（否则模型会挤成一大段）
    parts.push([
      '',
      '【输出结构】严格按下面这个层级写，**必须换行、必须用符号分块**：',
      '',
      '### 场景环境',
      '<整体环境 + 光线 + 场景里的主要物件>',
      '',
      '### 事件',
      '<这一段拍的是什么>',
      '',
      '### 物理特性',
      '<影像质感 / 镜头语言 / 运动表现>',
      '',
      '---',
      '',
      '#### **镜头 1：【四到八字的概括】**',
      '* **时长：** X 秒',
      '* **衔接逻辑：** <为什么从上一镜切到这里>',
      '* **构图与运镜：** <机位、怎么动、什么景别>',
      '* **画面内容：** <谁在做什么、位置关系、怎么走线>',
      '* **环境与地貌：** <这一镜里能看到的环境细节>',
      '',
      '---',
      '',
      '#### **镜头 2：【四到八字的概括】**',
      '* **时长：** X 秒',
      '* **衔接逻辑：** ……',
      '* **构图与运镜：** ……',
      '* **画面内容：** ……',
      '* **环境与地貌：** ……',
      '',
      '---',
      '',
      '（后面每个镜头都按上面这五条写，镜头之间用一条 --- 分隔）',
      '',
      '### 结尾强制渲染与控制参数',
      '<画质 / 器材 / 质感这类收尾参数>',
      '',
      '**避免：** <不要出现的东西>',
      '',
      '【硬性要求】',
      '- 一共写 ' + (cnt || 'N') + ' 个镜头；',
      (total ? '- 各镜头标注的秒数加起来要等于 ' + total + ' 秒；' : ''),
      '- 镜头之间用 --- 分隔，字段用 * 开头，标题用 ### / ####；',
      '- 禁止把所有内容写成一大段；',
      '- 只输出这份脚本本身，不要解释、不要开场白。'
    ].join('\n'));
  }

  const refs = g('vidRefs');
  if (refs) parts.push('【已有参考图（这些不要描述外观）】' + refs);

  if (homeLang === 'en') parts.push('【语言】用英文输出。');
  return parts.join('\n');
}

// ======================== 生图 / 视频提示词 切换 ========================
const HOME_OUT_KEY = 'llm_home_out_';
const homeGenBar = document.querySelector('.gen-bar');
const homeGenCard = document.getElementById('genCard');
let lastHomeType = 'img';

function homeTypeNow() {
  return (homeTypeSel && homeTypeSel.value === 'video') ? 'video' : 'img';
}
function saveHomeOutput(type) {
  try { localStorage.setItem(HOME_OUT_KEY + type, output.innerHTML); } catch (e) {}
}
function restoreHomeOutput(type) {
  let html = '';
  try { html = localStorage.getItem(HOME_OUT_KEY + type) || ''; } catch (e) {}
  const has = !!html && html.indexOf('empty-state') < 0;
  output.classList.remove('md-body');
  output.innerHTML = has ? html : '<div class="empty-state"><i class="fas fa-arrow-right"></i><p>等待 AI 回复...</p></div>';
  if (copyBtn) copyBtn.style.display = has ? '' : 'none';
  if (saveResultBtn) saveResultBtn.style.display = has ? '' : 'none';
  if (!has) { try { hideOutputMeta(); } catch (e) {} }
}

function applyHomeType() {
  const isImg = !homeTypeSel || homeTypeSel.value !== 'video';
  // 切换前先把「上一个模式」的回复存下来，再恢复「新模式」的回复
  const now = isImg ? 'img' : 'video';
  if (now !== lastHomeType) {
    saveHomeOutput(lastHomeType);
    lastHomeType = now;
    restoreHomeOutput(now);
  }
  if (homeImgForm) homeImgForm.style.display = isImg ? '' : 'none';
  const vf = document.getElementById('homeVideoForm');
  if (vf) vf.style.display = isImg ? 'none' : '';
  // 视频的输入区（标题 / 大输入框 / 已有参考图）跟着一起显隐
  ['vidDescLabel', 'vidDescWrap', 'vidRefBlock'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.style.display = isImg ? 'none' : '';
  });
  if (homeVideoSoon) homeVideoSoon.style.display = 'none';
  if (homeDescLabel) homeDescLabel.style.display = isImg ? '' : 'none';
  // ★ 视频模式不生成图片：把「生图工具条」和「生成结果」整块藏掉
  if (homeGenBar) homeGenBar.style.display = isImg ? '' : 'none';
  if (homeGenCard) homeGenCard.style.display = isImg ? '' : 'none';
  const wrap = input1 ? input1.closest('.fr-textarea-wrap') : null;
  if (wrap) wrap.style.display = isImg ? '' : 'none';
  try { localStorage.setItem(HOME_TYPE_KEY, isImg ? 'img' : 'video'); } catch (e) {}
}
if (homeTypeSel) {
  try {
    const saved = localStorage.getItem(HOME_TYPE_KEY);
    if (saved === 'video') homeTypeSel.value = 'video';
  } catch (e) {}
  lastHomeType = (homeTypeSel.value === 'video') ? 'video' : 'img';
  homeTypeSel.addEventListener('change', function () {
    applyHomeType();
  });
  try { vidInit(); } catch (e) {}
  applyHomeType();
  // ★ 打开软件时，把当前模式上次的生成结果恢复出来（两种模式各存各的）
  try { restoreHomeOutput(lastHomeType); } catch (e) {}
}

// ---------------- @ 引用参考图 ----------------
let atPopEl = null, atFieldEl = null, atTokenStart = -1;

function ensureAtPop() {
  if (atPopEl && document.body.contains(atPopEl)) return atPopEl;
  atPopEl = document.createElement('div');
  atPopEl.className = 'at-pop';
  document.body.appendChild(atPopEl);
  return atPopEl;
}
function hideAtPop() {
  if (atPopEl) atPopEl.classList.remove('show');
  atFieldEl = null;
  atTokenStart = -1;
}
function renderAtPop() {
  const pop = ensureAtPop();
  if (!pendingImages.length) {
    pop.innerHTML = '<div class="at-empty">还没有参考图</div>';
    return;
  }
  pop.innerHTML = pendingImages.map(function (img, i) {
    const label = imgLabel(img, i);
    return '<div class="at-item" data-idx="' + i + '" data-label="' + escapeHtml(label) + '">' +
      '<img class="t" src="' + img.dataUrl + '" alt="">' +
      '<span class="nm">' + escapeHtml(label) + '</span>' +
      '<span class="sub">@"' + escapeHtml(label) + '"</span></div>';
  }).join('');
  pop.querySelectorAll('.at-item').forEach(function (it) {
    it.addEventListener('mousedown', function (e) {
      e.preventDefault();
      insertRefToken(it.getAttribute('data-label'));
    });
  });
}
// ★ 用一个隐藏镜像元素量出"光标在屏幕上的位置"
function getCaretCoords(el) {
  const isInput = el.tagName === 'INPUT';
  const cs = window.getComputedStyle(el);
  const mirror = document.createElement('div');

  ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
   'textTransform', 'wordSpacing', 'textIndent', 'paddingTop', 'paddingRight',
   'paddingBottom', 'paddingLeft', 'boxSizing'].forEach(function (p) {
    mirror.style[p] = cs[p];
  });
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.borderWidth = '0';
  mirror.style.overflow = 'hidden';
  mirror.style.boxSizing = 'border-box';   // 宽高口径与 textarea.clientWidth 对齐
  mirror.style.whiteSpace = isInput ? 'pre' : 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.width = isInput ? 'auto' : (el.clientWidth + 'px');

  const caret = el.selectionStart == null ? el.value.length : el.selectionStart;
  mirror.textContent = el.value.slice(0, caret);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const rect = el.getBoundingClientRect();
  const mRect = mirror.getBoundingClientRect();
  const kRect = marker.getBoundingClientRect();
  document.body.removeChild(mirror);

  const bL = parseFloat(cs.borderLeftWidth) || 0;
  const bT = parseFloat(cs.borderTopWidth) || 0;
  const dx = kRect.left - mRect.left;   // 已含 padding
  const dy = kRect.top - mRect.top;
  const lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) * 1.5) || 20;

  return {
    x: rect.left + bL + dx - (el.scrollLeft || 0),
    y: rect.top + bT + dy - (el.scrollTop || 0),
    lineHeight: lh
  };
}

function showAtPop(field) {
  const pop = ensureAtPop();
  renderAtPop();
  pop.style.minWidth = '200px';
  pop.classList.add('show');   // 先显示才能量到真实高度

  const c = getCaretCoords(field);
  const pw = pop.offsetWidth || 220;
  const ph = pop.offsetHeight || 200;
  const vw = window.innerWidth, vh = window.innerHeight;

  // 水平：跟随光标，不出右边
  let left = c.x;
  if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);

  // 垂直：光标下一行；下方放不下就翻到光标上方
  let top = c.y + (c.lineHeight || 20) + 4;
  if (top + ph > vh - 8) top = Math.max(8, c.y - ph - 6);

  pop.style.left = Math.round(left) + 'px';
  pop.style.top = Math.round(top) + 'px';
}
function insertRefToken(label) {
  if (!atFieldEl || atTokenStart < 0) return;
  const el = atFieldEl;
  const token = '@"' + label + '"';
  const v = el.value;
  const caret = el.selectionStart == null ? v.length : el.selectionStart;
  el.value = v.slice(0, atTokenStart) + token + v.slice(caret);
  const np = atTokenStart + token.length;
  el.focus();
  try { el.setSelectionRange(np, np); } catch (e) {}
  el.dispatchEvent(new Event('input', { bubbles: true }));
  hideAtPop();
}
function bindAtField(field) {
  // 兼容旧调用：现在统一用 document 上的事件委托，这里保留空实现
  return field;
}

// ★ 用事件委托：任何带 data-at 的输入框都能触发（避免逐个绑定漏掉）
function maybeShowAt(el) {
  if (!el || !el.getAttribute || !el.getAttribute('data-at')) return;
  const pos = el.selectionStart == null ? el.value.length : el.selectionStart;
  const before = el.value.slice(0, pos);
  const m = before.match(/@([^@"\s]*)$/);
  if (!m) { hideAtPop(); return; }
  atFieldEl = el;
  atTokenStart = pos - m[0].length;
  showAtPop(el);
}
document.addEventListener('input', function (e) { maybeShowAt(e.target); });
// 输入法 / 个别情况下 input 不触发，用 keyup 兜底
document.addEventListener('keyup', function (e) {
  if (e.key === '@' || e.key === '2' || e.key === 'Backspace') maybeShowAt(e.target);
});
document.addEventListener('compositionend', function (e) { maybeShowAt(e.target); });

// Esc 关闭
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') hideAtPop();
});

// 点空白处关闭（只认真正点在弹层外面）
document.addEventListener('mousedown', function (e) {
  if (!atPopEl || !atPopEl.classList.contains('show')) return;
  if (atPopEl.contains(e.target)) return;
  if (e.target === atFieldEl) return;   // 点回输入框里继续输入，不要关
  hideAtPop();
}, true);

// 改名后，把输入框里已插入的 @"旧名" 一起换掉
function replaceRefToken(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return;
  const from = '@"' + oldName + '"';
  const to = '@"' + newName + '"';
  // ★ 扫所有带 data-at 的输入框（含视频提示词里的地点/时间/故事梗概/补充说明）
  const fields = Array.prototype.slice.call(document.querySelectorAll('[data-at]'));
  if (input1 && fields.indexOf(input1) < 0) fields.push(input1);
  fields.forEach(function (el) {
    if (!el || !el.value || el.value.indexOf(from) < 0) return;
    el.value = el.value.split(from).join(to);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

// ======================== 输出按钮 ========================
runBtn.addEventListener('click', async function () {
  // ★ 视频提示词：合并用户填的内容 → 交给 AI 写成提示词
  if (homeTypeSel && homeTypeSel.value === 'video') {
    const vCombined = composeVideoPrompt();
    const hasText = (document.getElementById('vidDesc') || {}).value || '';
    const hasStory = (document.getElementById('vidStory') || {}).value || '';
    if (!String(hasText).trim() && !String(hasStory).trim()) {
      output.classList.remove('md-body');
      output.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>请先填写「画面内容」（多镜头填「故事梗概」或「补充说明」）</p></div>';
      copyBtn.style.display = 'none';
      saveResultBtn.style.display = 'none'; hideOutputMeta();
      return;
    }
    output.classList.remove('md-body');
    output.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>AI 思考中...</p></div>';
    copyBtn.style.display = 'none';
    saveResultBtn.style.display = 'none'; hideOutputMeta();
    runBtn.disabled = true;
    stopBtn.style.display = 'flex';
    window.emberStick.reset(output);
    let vMd = ''; hideOutputMeta(); outputMetaT0 = performance.now(); outputMetaFirst = 0;
    try {
      vMd = await streamCallLLM(vCombined, (chunk) => {
        if (!outputMetaFirst) outputMetaFirst = performance.now(); vMd += chunk;
        output.textContent = vMd;
        window.emberStick.follow(output);
      }, 180000, pendingImages, null, false);   // ★ 最后两个参数：不指定模型 / 不带历史记忆
      showPlainResult(vMd); showOutputMeta(vMd, vCombined, outputMetaT0, outputMetaFirst);
      rememberTurn(vCombined, vMd);
      setStatus('green', '请求成功');
      playDoneSound();
    } catch (err) {
      if (err.name === 'AbortError') {
        if (vMd) { showPlainResult(vMd); showOutputMeta(vMd, vCombined, outputMetaT0, outputMetaFirst); }
        else { output.innerHTML = '<div class="empty-state"><i class="fas fa-stop-circle"></i><p>请求已停止</p></div>'; }
        setStatus('yellow', '请求已停止');
      } else {
        output.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>' +
          (err && err.message ? err.message : '请求失败') + '</p></div>';
        setStatus('red', '请求失败');
      }
    } finally {
      runBtn.disabled = false;
      stopBtn.style.display = 'none';
      copyBtn.style.display = vMd ? 'flex' : 'none';
      saveResultBtn.style.display = vMd ? 'flex' : 'none';
    }
    return;
  }
  const text1 = composeHomePrompt();   // ★ 结构化字段 + 画面内容描述
  const text2 = input2.value.trim();
  // ★ 判空必须看「用户真正填了什么」——
  //   不能用 composeHomePrompt() 的返回值为准，它永远带着【任务】【硬性要求】那段说明，
  //   所以永远非空，导致一个都不填也能提交出去。
  const hasForm = !!(input1 && input1.value.trim())
    || !!(optStyle && homeVal(optStyle))
    || !!(optShot && homeVal(optShot))
    || !!(optAngle && homeVal(optAngle))
    || !!(optPlace && homeVal(optPlace))
    || !!(optTime && homeVal(optTime))
    || !!(optLight && homeVal(optLight));
  if (!hasForm && !text2 && pendingImages.length === 0) {
    output.classList.remove('md-body');
    output.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>请至少填写画面内容描述，或选择风格 / 景别 / 角度</p></div>';
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
  window.emberStick.reset(output);   // ★ 新一轮开始：重新吸附到底部
  let markdown = ''; hideOutputMeta(); outputMetaT0 = performance.now(); outputMetaFirst = 0;
  try {
    markdown = await streamCallLLM(combined, (chunk) => {
      if (!outputMetaFirst) outputMetaFirst = performance.now(); markdown += chunk;
      output.textContent = markdown;
      window.emberStick.follow(output);   // ★ 用户上滚时不抢滚动条
    }, 180000, pendingImages, null, false);   // ★ 不带历史记忆：每次生成都是全新的，不参考上一次结果
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
// ★ 所有"在途"的请求控制器。停止按钮中止全部；
//   每个请求自己只清理自己的，互不影响。
let liveControllers = new Set();
stopBtn.addEventListener('click', function () {
  liveControllers.forEach(function (c) { try { c.abort(); } catch (e) {} });
  if (currentController) { try { currentController.abort(); } catch (e) {} }
});

// ======================== 流式调用 LLM ========================
async function streamCallLLM(prompt, onDelta, timeoutMs = 180000, images = [], apiOverride, useMemory) {
  const A = apiOverride || currentApi;          // ★ 允许调用方指定模型（画布节点用）
  if (!A.key) throw new Error('请在设置中填写 API Key');
  // ★★ 关键修复：每个请求用【自己的】控制器，并让超时定时器只中止自己。
  //    原写法是 setTimeout(() => currentController.abort())，箭头函数读的是全局变量；
  //    一旦上一次请求的定时器没被清掉，它触发时就会把【这一次】的请求掐断，
  //    表现为"没结果、也没报错"的静默失败（切模型后偶发复现）。
  const myController = new AbortController();
  currentController = myController;
  liveControllers.add(myController);
  const timeoutTimer = setTimeout(function () { try { myController.abort(); } catch (e) {} }, timeoutMs);
  const url = buildApiUrl(A);
  // ★ useMemory 传 false 时不带主页对话记忆（画布用）
  const msgs = (useMemory === false) ? buildCanvasMessages(prompt, images) : buildMessages(prompt, images);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + A.key },
      body: JSON.stringify({ model: A.model, messages: msgs, temperature: 0.7, stream: true }),
      signal: myController.signal
    });
    if (!response.ok) { const errText = await response.text(); throw new Error(`HTTP ${response.status}: ${errText}`); }
    // ★ 诊断信息：出错时能看到服务器到底返回了什么
    const dbg = 'HTTP ' + response.status +
      '  Content-Type=' + (response.headers.get('content-type') || '(无)') +
      '  model=' + A.model + '  url=' + url;
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';
    // ★ 诊断用：记录收到过什么、有没有解析出内容
    let sawAnyData = false;         // 有没有收到 data: 行
    let sawUnparsed = '';           // 收到了但取不出文字时的原始片段
    let reasoningText = '';         // 只累积思考内容，不混进正文
    let rawHead = '';               // 原始响应开头（诊断用）
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (rawHead.length < 400) rawHead = (rawHead + buffer).slice(0, 400);
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        sawAnyData = true;
        try {
          const json = JSON.parse(data);
          const delta = json.choices && json.choices[0] && json.choices[0].delta;
          if (!delta) {
            if (!sawUnparsed) sawUnparsed = data.slice(0, 300);
            continue;
          }
          // ★ 正式回答：content
          if (typeof delta.content === 'string' && delta.content) {
            fullText += delta.content;
            if (onDelta) onDelta(delta.content);
            continue;
          }
          // ★ 不少模型/中转商把流式文字放在 reasoning_content（推理内容）里。
          //   这里只收集、不当作正文、也不推给界面 —— 思考过程不该出现在结果里。
          const reasonChunk = (typeof delta.reasoning_content === 'string' && delta.reasoning_content)
            ? delta.reasoning_content
            : (typeof delta.reasoning === 'string' ? delta.reasoning : '');
          if (reasonChunk) {
            reasoningText += reasonChunk;
            continue;
          }
          if (!sawUnparsed) sawUnparsed = data.slice(0, 300);
        } catch (e) {
          if (!sawUnparsed) sawUnparsed = data.slice(0, 300);
        }
      }
    }
    // ★ 一个字符都没解析出来时，给一个能看懂的提示，而不是白屏
    if (!fullText) {
      const head = (rawHead || buffer || '').replace(/[\r\n]+/g, ' ').slice(0, 400);
      if (!sawAnyData) {
        throw new Error('接口没有返回流式(SSE)数据。\n' + dbg + '\n原始响应开头：' + (head || '(空)'));
      }
      throw new Error('收到数据但没能解析出文字。\n' + dbg + '\n片段：' + (sawUnparsed || '(空)'));
    }
    // ★ 只收到推理内容、没有正式回答时：把推理内容返回（不加任何中文说明）
    if (!fullText && reasoningText) return reasoningText;
    return fullText;
  } finally {
    clearTimeout(timeoutTimer);
    liveControllers.delete(myController);
    if (currentController === myController) currentController = null;
  }
}


// ======================== 非流式调用 LLM ========================
async function callLLM(prompt, timeoutMs = 180000, images = [], apiOverride, useMemory) {
  const A = apiOverride || currentApi;          // ★ 同上
  if (!A.key) throw new Error('请在设置中填写 API Key');
  // ★ 同上：每个请求用自己的控制器，超时只中止自己
  const myController = new AbortController();
  currentController = myController;
  liveControllers.add(myController);
  const timeoutTimer = setTimeout(function () { try { myController.abort(); } catch (e) {} }, timeoutMs);
  const url = buildApiUrl(A);
  // ★ useMemory 传 false 时不带主页对话记忆（画布用）
  const msgs = (useMemory === false) ? buildCanvasMessages(prompt, images) : buildMessages(prompt, images);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + A.key },
      body: JSON.stringify({ model: A.model, messages: msgs, temperature: 0.7 }),
      signal: myController.signal
    });
    if (!response.ok) { const errText = await response.text(); throw new Error(`HTTP ${response.status}: ${errText}`); }
    const data = await response.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message) throw new Error('返回格式异常：' + JSON.stringify(data));
    return data.choices[0].message.content;
  } finally {
    clearTimeout(timeoutTimer);
    liveControllers.delete(myController);
    if (currentController === myController) currentController = null;
  }
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
