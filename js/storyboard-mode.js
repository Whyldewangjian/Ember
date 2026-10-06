// ======================== 分镜表格模式（独立模块，可整删） ========================
// ★ 本版：1) 规则式提示词（字段＋枚举＋一致性约束，无示例）
//        2) 逐格「镜头信息」＝机位（景别/高度/视角）＋主体（实焦/虚化）
//        3) 朝向拆成「面向＋视角面」并强制自洽（背影不得写表情）
//        4) 隐藏列「单色版描述」 5) 无色彩风格输出强制灰阶
//        6) 单文件分镜看板导出 7) 保存失败可见 + 字段缺失校验
(function () {
  'use strict';

  const btn = document.getElementById('storyboardSwitchBtn');
  const mode = document.getElementById('storyboardMode');
  if (!btn || !mode) return;

  const mainArea = document.querySelector('.main-area');
  const bottomBar = document.querySelector('.bottom-bar');
  let active = false;

  let ipc = null;
  try { ipc = require('electron').ipcRenderer; } catch (e) {}

  // ---------- 模型下拉 ----------
  const modelSelect = document.getElementById('sbModelSelect');
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
      const myId = (typeof window.scopeApiId === 'function') ? window.scopeApiId('storyboard') : activeApiId;
      if (typeof activeApiId !== 'undefined' && a.id === myId) opt.selected = true;

      modelSelect.appendChild(opt);
    });
  }
  if (modelSelect) {
    modelSelect.addEventListener('change', function () {
      const id = this.value;
      if (!id) return;
      if (typeof setActiveModel === 'function') setActiveModel('storyboard', id);   // ★ 只改分镜自己的模型

    });
  }
  window.__syncSbModelSelect = renderModelSelect;

  // ---------- 模式切换 ----------
  function enter() {
    if (active) return;
    if (window.__exitChatMode) window.__exitChatMode();
    if (window.__exitCanvasMode) window.__exitCanvasMode();
    if (window.__exitWorkshopMode) window.__exitWorkshopMode();
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
    renderImageModelSelect();
    renderSizeOptions();
    renderExtraLangSelect();
    renderStyleSelect();
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
  window.__enterStoryboardMode = enter;
  window.__exitStoryboardMode = exit;

  // ---------- 窗口控制 ----------
  function bindWin(id, action) {
    const el = document.getElementById(id);
    if (el && ipc) el.addEventListener('click', function () { ipc.invoke(action).catch(function () {}); });
  }
  bindWin('sbDockBtn', 'dock-enable');
  bindWin('sbWinMinBtn', 'win-minimize');
  bindWin('sbWinMaxBtn', 'win-maximize');
  const sbClose = document.getElementById('sbWinCloseBtn');
  if (sbClose) {
    sbClose.addEventListener('click', function () {
      if (typeof requestCloseApp === 'function') requestCloseApp();
      else if (ipc) ipc.invoke('win-close').catch(function () {});
    });
  }
  const sbSettings = document.getElementById('sbSettingsBtn');
  if (sbSettings) {
    sbSettings.addEventListener('click', function () {
      const sb = document.getElementById('settingsBtn');
      if (sb) sb.click();
    });
  }

  // ---------- 元素 ----------
  const scriptInput = document.getElementById('sbScript');
  const countInput = document.getElementById('sbShotCount');
  const durationInput = document.getElementById('sbDuration');
  const totalDurationInput = document.getElementById('sbTotalDuration');
  const extraInput = document.getElementById('sbExtra');
  const genBtn = document.getElementById('sbGenerateBtn');
  const statusEl = document.getElementById('sbStatus');
  const tableWrap = document.getElementById('sbTableWrap');
  const exportBtn = document.getElementById('sbExportBtn');
  // ★ 镜头连续性
  const contCb = document.getElementById('sbContinuity');
  const bibleInput = document.getElementById('sbBible');
  const bibleRegenBtn = document.getElementById('sbBibleRegen');
  const bibleClearBtn = document.getElementById('sbBibleClear');
  // ★ 镜头语言下拉（读取「片段 / 镜头语言」）
  const extraSelect = document.getElementById('sbExtraSelect');

  let tableData = [];

  // ---------- 标签切换 ----------
  (function initTabs() {
    const tabTable = document.getElementById('sbTabTable');
    const tabImage = document.getElementById('sbTabImage');
    const paneTable = document.getElementById('sbPaneTable');
    const paneImage = document.getElementById('sbPaneImage');
    function switchTab(which) {
      const isTable = which === 'table';
      if (tabTable) tabTable.classList.toggle('active', isTable);
      if (tabImage) tabImage.classList.toggle('active', !isTable);
      if (paneTable) paneTable.style.display = isTable ? 'flex' : 'none';
      if (paneImage) paneImage.style.display = isTable ? 'none' : 'flex';
    }
    if (tabTable) tabTable.addEventListener('click', function () { switchTab('table'); });
    if (tabImage) tabImage.addEventListener('click', function () { switchTab('image'); });
  })();

  // ---------- 数字框清空后失焦自动补 0 ----------
  [countInput, durationInput, totalDurationInput].forEach(function (inp) {
    if (!inp) return;
    inp.addEventListener('blur', function () {
      if (this.value === '' || this.value === null) this.value = '0';
    });
  });

  // ---------- 左右栏拖拽调整比例 ----------
  (function initResizer() {
    const resizer = document.getElementById('sbResizer');
    const leftPanel = mode.querySelector('.app-mode-left');
    if (!resizer || !leftPanel) return;
    resizer.addEventListener('mousedown', function (e) {
      e.preventDefault();
      resizer.classList.add('dragging');
      const startX = e.clientX;
      const startW = leftPanel.offsetWidth;
      function onMove(ev) {
        const w = Math.min(Math.max(startW + (ev.clientX - startX), 240), window.innerWidth - 320);
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

  // ---------- LLM 调用（独立，不污染主页记忆） ----------
  async function callLLM(prompt, onDelta) {
    const A = (typeof window.apiFor === 'function') ? window.apiFor('storyboard') : currentApi;   // ★ 分镜自己的模型
    if (typeof A === 'undefined' || !A.key) {
      throw new Error('请先在设置中配置 API Key');
    }
    const base = (A.url || '').replace(/\/+$/, '');
    const res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + A.key },
      body: JSON.stringify({
        model: A.model,

        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        stream: true
      })
    });
    if (!res.ok) {
      const t = await res.text();
      if (typeof window.setScopeDot === 'function') window.setScopeDot('storyboard', 'red', '连接失败');
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
            if (onDelta) onDelta(delta.content, full);
          }
        } catch (e) {}
      }
    }
    if (typeof window.setScopeDot === 'function') window.setScopeDot('storyboard', 'green', '正常');
    return full;

  }

  // ---------- 解析 Markdown 表格 ----------
  function parseMarkdownTable(md) {
    const rows = [];
    String(md || '').split('\n').forEach(function (raw) {
      const line = raw.trim();
      if (!line.startsWith('|')) return;
      if (/^\|[\s\-:|]+\|?$/.test(line)) return;
      let cells = line.split('|');
      if (cells.length && cells[0].trim() === '') cells.shift();
      if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
      cells = cells.map(function (c) { return c.trim(); });
      if (cells.length) rows.push(cells);
    });
    return rows;
  }

  // ---------- 渲染表格（支持图片单元格） ----------
  const SB_COL_CLASS = {
    '分镜图': 'sb-img-cell',
    '镜号': 'sb-col-no',
    '编号': 'sb-col-no',
    '景别': 'sb-col-shot',
    '时长': 'sb-col-dur',
    '台词/旁白': 'sb-col-line'
  };
  function colClassOf(headerText) {
    const key = (headerText || '').replace(/\s+/g, '');
    return SB_COL_CLASS[key] || '';
  }

  function renderTable(data) {
    tableData = data;
    tableWrap.innerHTML = '';
    if (!data.length) {
      sbHasMonoCol = false;
      tableWrap.innerHTML = '<div class="app-mode-empty"><i class="fas fa-table-cells"></i><p>没有解析到表格内容</p></div>';
      return;
    }

    // ★ 定位「单色版描述」列（默认隐藏，不占表格宽度）
    let monoIdx = -1;
    data[0].forEach(function (c, i) {
      if (String(c).replace(/\s+/g, '') === '单色版描述') monoIdx = i;
    });
    sbHasMonoCol = monoIdx >= 0;

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    const headRow = document.createElement('tr');
    const colClasses = [];
    data[0].forEach(function (cell, idx) {
      const th = document.createElement('th');
      th.textContent = cell;
      const cls = colClassOf(cell);
      colClasses.push(cls);
      if (idx === monoIdx) th.style.display = 'none';
      else if (idx === 0 && cell === '分镜图') th.className = 'sb-img-th';
      else if (cls && cls !== 'sb-img-cell') th.classList.add(cls);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    for (let i = 1; i < data.length; i++) {
      const tr = document.createElement('tr');
      data[i].forEach(function (cell, idx) {
        const td = document.createElement('td');
        if (idx === monoIdx) {
          td.textContent = String(cell == null ? '' : cell);
          td.style.display = 'none';
        } else if (typeof cell === 'string' && cell.indexOf('IMG:') === 0) {
          td.className = 'sb-img-cell';
          const img = document.createElement('img');
          img.src = cell.slice(4);
          img.loading = 'lazy';
          img.className = 'sb-previewable';
          td.appendChild(img);
        } else {
          td.textContent = cell;
          td.contentEditable = 'true';
          if (colClasses[idx]) td.classList.add(colClasses[idx]);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.appendChild(table);
  }

  // ======================== ★ 镜头连续性（文字版） ========================
  function continuityOn() { return !!(contCb && contCb.checked); }
  function currentBible() { return (bibleInput && bibleInput.value || '').trim(); }

  // 用「剧本指纹」判断设定表是不是针对当前剧本生成的
  function scriptSign() {
    const s = (scriptInput && scriptInput.value || '').trim();
    return s.length + '|' + s.slice(0, 120);
  }
  let bibleSign = '';

  // 从 AI 输出里把【设定表】抠出来（到【分镜表】或第一行表格为止）
  function extractBible(text) {
    const t = String(text || '');
    const m = t.match(/【设定表[^\n]*】([\s\S]*?)(?:【分镜表|^\s*\|)/m);
    if (m && m[1] && m[1].trim()) return m[1].trim();
    const m2 = t.match(/(角色[\s\S]*?)(?:\n\s*\|)/);
    return m2 ? m2[1].trim() : '';
  }

  // ======================== ★ 风格判定 / 元信息剥离 / 单元格取文 ========================
  let sbHasMonoCol = false;                 // 表格里是否有「单色版描述」列
  let sbShotMode = 'detail';                // 'mono' | 'detail' | 'mono-fallback' | 'none'
  let sbShotSizes = [];                     // 「景别」列（与逐格一一对应）

  const MONO_RE = /(黑白|单色|灰阶|灰度|素描|线稿|白描|水墨|铅笔|炭笔|钢笔|版画|草图)/;

  // ★ 无色彩风格是否追加"画法优先"提示词（A/B 开关：false = 不加，true = 加）
  const MONO_HINT_PAINT_FIRST = false;

  // 判定当前「画质风格」是否属于无色彩（黑白/线稿/水墨/单色）类
  function isMonoStyle() {
    const sel = document.getElementById('sbImageStyle');
    if (!sel || !sel.value) return false;
    const s = psByCat('style').find(function (x) { return x.id === sel.value; });
    if (!s) return false;
    const text = String(s.name || '') + ' ' + String(s.content || '').slice(0, 300);
    if (/【\s*有色彩\s*】/.test(text)) return false;
    if (/【\s*(无色彩|无彩色|单色|黑白)\s*】/.test(text)) return true;
    return MONO_RE.test(text);
  }

  // ★ 剥掉"给人看"的元信息，只留画面描述
  function stripMeta(s) {
    return String(s || '')
      .replace(/与前镜关系[：:][^。；;\n]*[。；;]?/g, '')
      .replace(/【越轴】/g, '')
      .replace(/【色光事件】/g, '色光：')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // 单元格取文本：隐藏列用 textContent（innerText 对未渲染元素不可靠）
  function cellText(c) {
    if (!c) return '';
    if (c.style && c.style.display === 'none') return (c.textContent || '').trim();
    return (c.innerText || '').trim();
  }

  // ======================== ★ 以下为"提示词层颜色管理"工具 ========================
  // 当前架构未使用（改为"输出转灰阶"），保留以便随时切回。

  const GRAY_TERMS = (function () {
    const multi = [
      ['白',   ['纯白', '雪白', '月白', '奶白', '白色']],
      ['浅灰', ['米白', '银白', '银色', '银灰', '米黄', '浅黄', '淡黄', '柠檬黄', '金黄', '黄色', '米色', '驼色']],
      ['中灰', ['青色', '翠绿', '草绿', '石绿', '深绿', '青绿', '橙色', '橙红', '铁灰', '灰色']],
      ['深灰', ['朱红', '大红', '鲜红', '暗红', '砖红', '酒红', '棕色', '褐色', '咖啡色', '赭石', '朱砂', '石青', '红色']],
      ['黑',   ['深蓝', '藏青', '靛蓝', '墨黑', '深紫', '紫色', '黑色']]
    ];
    const singles = [
      ['浅灰', '黄'], ['浅灰', '金'], ['浅灰', '银'],
      ['中灰', '绿'], ['中灰', '青'], ['中灰', '橙'], ['中灰', '灰'],
      ['深灰', '红'], ['深灰', '棕'], ['深灰', '褐'],
      ['黑',   '蓝'], ['黑',   '紫']
    ];
    const list = [];
    multi.forEach(function (lv) {
      lv[1].forEach(function (t) { list.push({ t: t, w: lv[0], single: false }); });
    });
    singles.forEach(function (p) { list.push({ t: p[1], w: p[0], single: true }); });
    list.sort(function (a, b) { return b.t.length - a.t.length; });
    return list;
  })();

  const SINGLE_TAIL = '色|色系|色调|衣|衫|裙|裤|帽|鞋|袜|围巾|披风|外套|夹克|风衣|制服|发|发丝|发梢|光|皮|布料|棉|麻|金属|搭扣|石|纸|[／\\/，,；;。\\n]|$';

  function translateColorWords(text) {
    let s = String(text || '');
    const hold = [];
    GRAY_TERMS.forEach(function (m) {
      const src = m.single ? (m.t + '(?=' + SINGLE_TAIL + ')') : m.t;
      const re = new RegExp(src, 'g');
      if (!re.test(s)) return;
      re.lastIndex = 0;
      s = s.replace(re, function () {
        hold.push(m.w);
        return '\u0002' + (hold.length - 1) + '\u0002';
      });
    });
    return s.replace(/\u0002(\d+)\u0002/g, function (_, i) { return hold[+i]; });
  }

  function toMonoWords(text) {
    let s = String(text || '');
    if (!s) return '';
    s = s.replace(/(肤色|肉色|皮肤色|脸红|泛红)(偏|较|略)?(白|黑|黄|深|浅|红)?/g, '');
    s = s.replace(/(暖|冷)(?=黄|白|橙|金|灰|蓝|青|红|绿|紫)/g, '');
    s = s.replace(/(暖色|冷色|暖调|冷调|暖光|冷光|暖阳)/g, '');
    s = translateColorWords(s);
    return s.replace(/[、，,]{2,}/g, '、').replace(/\s{2,}/g, ' ').trim();
  }

  function toMono(text) {
    let s = String(text || '');
    if (!s) return '';
    const evs = [];
    s = s.replace(/【色光事件】[^\n]*/g, function (m) {
      evs.push(m);
      return '\u0001EV' + (evs.length - 1) + '\u0001';
    });
    s = s.split('\n').map(function (line) {
      return /(光线|光照|打光|补光|色温|色调|色彩|色相|影调|饱和|明暗|高光|阴影|逆光|侧光|顶光|顺光|漫射|阳光|日光|夕照|朝阳|落日)/.test(line) ? '' : line;
    }).filter(function (l) { return l.trim(); }).join('\n');
    s = s.replace(/\u0001EV(\d+)\u0001/g, function (_, i) { return evs[+i]; });
    s = toMonoWords(s);
    s = s.replace(/[、，,]{2,}/g, '、').replace(/[（(]\s*[)）]/g, '').replace(/[ \t]{2,}/g, ' ');
    return s.replace(/^[、，,；;：\s]+/gm, '').trim();
  }

  function stripGrayField(text) {
    return String(text || '')
      .replace(/[／\/]\s*灰阶\s*[：:][^／\/；;\n]*/g, '')
      .replace(/灰阶\s*[：:][^／\/；;\n]*/g, '')
      .replace(/[／\/]\s*[／\/]/g, '／')
      .trim();
  }

  // ======================== ★ 片段接入（镜头语言 / 画质风格 下拉） ========================
  function psByCat(cat) {
    try { if (typeof window.__psByCat === 'function') return window.__psByCat(cat) || []; } catch (e) {}
    return [];
  }

  function renderExtraLangSelect() {
    if (!extraSelect) return;
    const cur = extraSelect.value;
    const list = psByCat('camera');
    extraSelect.innerHTML = '';
    const o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = '手动输入';
    extraSelect.appendChild(o0);
    list.forEach(function (s) {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.name || '未命名';
      extraSelect.appendChild(o);
    });
    extraSelect.value = (cur && extraSelect.querySelector('option[value="' + cur + '"]')) ? cur : '';
  }

  function renderStyleSelect() {
    if (!imageStyleSelect) return;
    const cur = imageStyleSelect.value;
    const list = psByCat('style');
    imageStyleSelect.innerHTML = '';
    const o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = list.length ? '默认（不额外指定）' : '（片段里还没有"画质风格"）';
    imageStyleSelect.appendChild(o0);
    list.forEach(function (s) {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.name || '未命名';
      imageStyleSelect.appendChild(o);
    });
    imageStyleSelect.value = (cur && imageStyleSelect.querySelector('option[value="' + cur + '"]')) ? cur : '';
  }

  function stylePrefixOf(id) {
    if (!id) return '';
    const s = psByCat('style').find(function (x) { return x.id === id; });
    return s ? String(s.content || '').trim() : '';
  }

  // ---------- 构建分镜表提示词（规则式：字段＋枚举＋一致性约束，不含任何示例） ----------
  function buildPrompt(useCont, bible) {
    const script = (scriptInput.value || '').trim();
    const count = parseInt(countInput.value, 10) || 0;
    const dur = parseInt(durationInput.value, 10) || 0;
    const total = parseInt(totalDurationInput ? totalDurationInput.value : 0, 10) || 0;
    const extra = (extraInput.value || '').trim();

    const lines = [];

    if (useCont) {
      lines.push('你是一名专业的分镜师。请根据下面的剧本，先输出【设定表】，再输出【分镜表】。');
      lines.push('');
      if (bible) {
        lines.push('【第一步：已确定的设定表（必须原样沿用，不得修改，也不要重复贴出来）】');
        lines.push(bible);
        lines.push('注意：上面这份设定表与剧本内容不一致时，也一律以设定表为准。');
      } else {
        lines.push('【第一步：输出设定表（格式固定，只写下面两行，不要多写别的行）】');
        lines.push('角色：角色名：年龄／性别／发型发质／服装（款式＋颜色，一句话带过）／体型／标志特征／灰阶（浅或中或深）（多个角色用「；」分隔）');
        lines.push('场景：场景名：地点／时间／天气／空间结构／陈设与关键道具（多个场景分行列出）');
        lines.push('设定表必须严格依据下面的【剧本】内容，角色与场景要和剧本里写的一致，不要自创。');
        lines.push('★ 严禁出现光线、色温、色调、影调、主色辅色、渲染质感的描述——这些一律由生图时的「画质风格」决定，写在这里会和它冲突（例如黑白线稿风格）。');
        lines.push('★ 服装只写款式与颜色，一句话带过，不要展开描写材质细节与色彩氛围。');
        lines.push('★ 每个角色都要给一个「灰阶」值（浅／中／深），并且不同角色之间要尽量错开，不要都给同一个值——黑白风格下，灰阶就是区分角色的主要手段。');
        lines.push('★ 「灰阶」描述的是角色自身的黑白深浅，不属于"光线／色温／色调／影调"，不受上面那条禁令限制。');
        lines.push('★ 不要写肤色、肉色这类描述——黑白风格下肤色一律用「灰阶」表达。');
      }
      lines.push('');
      lines.push('【第二步：输出分镜表】');
    } else {
      lines.push('你是一名专业的分镜师。请根据下面的剧本，输出一份分镜表。');
    }

    lines.push(
      '',
      '【输出要求】',
      '- 只输出' + (useCont ? '设定表 + 一个 Markdown 表格' : '一个 Markdown 表格') + '，不要任何解释、前言、结语',
      '- 表格列（顺序固定）：镜号 | 景别 | 画面内容 | 单色版描述 | 台词/旁白 | 时长 | 运镜 | 备注',
      '- 镜号从 1 开始递增',
      '- 景别使用：远景/全景/中景/近景/特写',
      '- 时长以秒为单位，写数字',
      '- 每个单元格内不要换行，内容里不要出现多余的表格分隔符',
      '',
      '【画面内容：严格按下面各项依次写全，不许省略、不许换顺序、不许自造取值】',
      '0. 镜头信息：先写「机位＝景别／机位高度／视角」，再写「主体＝…」。',
      '   - 机位三项必须齐全，且与本镜「运镜」列的起幅或落幅一致。',
      '   - 主体项：使用【剧本】中实际出现的角色称呼；画面内每个出现的人或物都要标注「（实焦）」或「（虚化）」，且只允许一个为实焦。',
      '1. 站位：必须同时给出 ① 水平位置（画面左三分之一／画面中／画面右三分之一）② 景深位置（前景／中景／背景）③ 与其它对象或参照物的相对距离。三项缺一视为不合格；禁止"在房间里""在附近"这类无定位信息的表述。',
      '2. 朝向：必须逐字写出两项，取值只能从下面集合里选 ——',
      '   ① 面向：画面左／画面右／画面深处／画面近处／镜头',
      '   ② 视角面：正面／四分之三正面／侧面／四分之三背面／纯背面',
      '   写法固定：先写「面向＝…」，再写「视角面＝…」，最后写视线落点。',
      '   ★ 只写"面朝画面左"而不写「视角面＝…」，视为不合格。',
      '   ★ 一致性：视角面为「背面／四分之三背面」时，本镜不得出现眉、眼、嘴、表情的任何描述；若本镜必须表现表情，视角面只能取「正面／四分之三正面」。两者不可兼得。',
      '3. 动作：必须给出 ① 瞬间状态（起始／进行中／结束）② 双臂、手部、双腿与重心的方位。禁止"准备做某事"这类尚未开始的状态。',
      '4. 表情：仅当视角面为「正面」或「四分之三正面」时，写眉、眼、嘴的形态与视线方向；其余情况本项固定写"面部不可见"。',
      '5. 互动：画面内有两个及以上对象且存在动作互动时，必须写「主动方 → 被动方」的方向关系（由谁、朝谁、从画面哪一侧朝向哪一侧）；无互动写"无"。',
      '6. 环境：只写与该镜主体直接相关的环境元素，1～2 项，不展开。',
      '7. 光线／色彩事件：仅当本镜确实发生光或颜色的变化时，以【色光事件】开头写一句；没有则整项省略。',
      '8. 上述各项依序写在同一行内，总长 70～130 字。',
      '9. 自检：逐项核对上面每一项是否都写到，缺哪项补哪项。',
      '',
      '【单色版描述：专供黑白／无色彩风格生图使用，必须极简】',
      '0. 镜头信息：先写「机位＝景别／机位高度／视角」，再写「主体＝…（实焦）」以及其余对象「（虚化）」。机位必须与「运镜」列的起幅或落幅一致。',
      '1. 依序只写四项：主体是什么／它在画面中的位置／它在做什么／它与前景、背景的相对关系。',
      '2. 总长 30～55 字。用短语，不要修饰语堆叠。',
      '3. 第 4 项必须有（缺了画面会变平）：要能看出近处有什么、远处是什么。',
      '4. 严禁写：表情、情绪、色彩、色温、影调、材质、纹理、氛围、运镜过程、道具清单；严禁写颜色，服装只写类型（不写颜色）。',
      '5. 若写朝向，必须给出「面向＝…」与「视角面＝…」两项，取值同【画面内容】第 2 条；视角面为背面时不得提面部。',
      '6. 不要写"完整画面""清晰可见""细节丰富"这类会诱发平涂的词。',
      '7. 光线或色彩事件（如有）以【色光事件】仅本格：… 写出，不得含颜色，全表不超过四分之一。',
      '8. 自检：能不能看出前景、中景、背景三层？不能就补第 3 项。',
      '',
      '【运镜：禁止使用"固定/推/拉/摇/移/跟/升降"这类单字词】',
      '必须按下面五项依次写全，每项都要给出具体值，缺一视为不合格：',
      '1. 起幅：景别＋机位高度＋角度（平视／俯拍／仰拍）＋焦段感（广角／中焦／长焦）。',
      '2. 运动方式：沿什么路径移动、穿过什么空间关系、绕哪个主体为轴。',
      '3. 速度与时长：写明确切的快慢描述与秒数。',
      '4. 落幅：结束时的主体位置与景别、机位高度与角度的变化。',
      '5. 动机：为什么要这样运动。',
      '句式模板：起幅为【景别+机位高度+角度】，摄影机沿【路径】以【速度】在【时长】内移动到【落幅】，落幅时【主体位置+景别】，机位【高度/角度】发生变化，目的是【动机】。',
      '运镜栏中凡出现单独的"推/拉/摇/移/升/降/跟"字样即视为不合格。全文 60～100 字。'
    );

    if (useCont) {
      lines.push(
        '',
        '【镜头连续性（强制遵守）】',
        '1. 画面内容里出现的角色，必须逐字复用它在外形中的关键特征（发型发色、服装款式与颜色、体型、标志特征），不得换装、换发色、换年龄。',
        '2. 同一场景的连续镜头必须沿用同一空间结构、陈设与道具方位，不得无故改变。',
        '3. 不要在画面内容里描述静态的光线与色彩氛围（见上文第 7 项）；只需保证空间、陈设与道具的连续。',
        '4. 「与前镜关系」写在「备注」列（不要写进画面内容），必须写三项：① 是否同一空间；② 是否同方向移动／视线衔接／新场景（新场景要说明切换理由）；③ 左右关系是否延续（未延续必须说明原因，例如反打）。',
        '5. 全表使用同一套角色称呼，不要给角色起新名字或换称呼。',
        '6. 道具连续性：关键道具在同一场景内必须保持在同一只手／同一位置，除非画面里明确写了它被移动。',
        '',
        '【空间轴线与左右关系（强制遵守）】',
        '1. 每个场景先在心里确定一条「轴线」：连接该场景两个主要角色（或主要角色与重要参照物）的假想连线。',
        '2. 同一场景内的所有镜头，机位必须始终位于轴线的同一侧，不得越轴。',
        '3. 角色之间的左右相对关系必须保持一致：若前一镜某角色在画面左，则同一场景后续镜头里该角色仍在画面左；若在画面右则仍在右。',
        '4. 剧情确实需要越轴时（例如正反打），必须在该镜头开头显式标注【越轴】并写明原因；没有标注就不许翻转。',
        '5. 角色的朝向变化必须有动作依据：若某角色从面向画面一侧变成面向另一侧，必须在动作里写出他转身／回头／被什么吸引。',
        '6. 位置一律用「画面左／画面右／画面上方／画面下方」描述；肢体一律用「角色的左手／右手」。两者严禁混用。'
      );
    }

    lines.push(
      '',
      '【数量与时长规则（严格按以下优先级）】',
      '1. 如果剧本/需求中已经明确写出了镜头数量、单镜时长或视频总时长，一律以剧本里的要求为准；',
      '2. 如果剧本里没有写，则参考下面的参数：',
      '   - 镜头数量：' + (count > 0 ? (count + ' 个（请采用该值）') : '未指定（由你根据内容自行决定合适的数量）'),
      '   - 每镜时长：' + (dur > 0 ? (dur + ' 秒（请采用该值）') : '未指定（由你自行决定每镜时长）'),
      '   - 视频总时长：' + (total > 0 ? (total + ' 秒（请尽量满足，各镜时长合计接近该值）') : '未指定（不限制）'),
      '',
      '【其他参数】',
      extra ? '- 额外要求：' + extra : '',
      '',
      '【剧本】',
      script
    );

    return lines.join('\n');
  }

  // ---------- 生成分镜表（含设定表防呆 + 字段校验） ----------
  let generating = false;
  async function generateStoryboard() {
    if (generating) return;
    const script = (scriptInput.value || '').trim();
    if (!script) { statusEl.textContent = '请先输入剧本内容'; return; }

    const useCont = continuityOn();
    let bible = currentBible();
    let bibleStale = false;
    let needBible = false;

    if (useCont) {
      if (!bible) {
        needBible = true;
      } else if (bibleSign !== scriptSign()) {
        bibleStale = true;
        const regen = await askAsk(
          '检测到剧本内容已改变。\n\n按新剧本重新生成「设定表」？\n\n【确定】＝ 重算（忽略现有设定表，角色/场景以新剧本为准）\n【取消】＝ 沿用现有设定表'
        );
        if (regen) {
          bible = '';
          needBible = true;
          bibleStale = false;
          if (bibleInput) bibleInput.value = '';
        }
      }
    }

    generating = true;
    genBtn.disabled = true;
    if (bibleRegenBtn) bibleRegenBtn.disabled = true;
    statusEl.textContent = '生成中...';
    tableWrap.innerHTML = '<div class="app-mode-empty"><i class="fas fa-spinner fa-spin"></i><p>AI 正在生成分镜表...</p></div>';

    try {
      let lastFull = '';
      await callLLM(buildPrompt(useCont, bible), function (chunk, full) {
        lastFull = full;
        statusEl.textContent = '生成中...（' + lastFull.length + ' 字）';
      });
      statusEl.textContent = '解析中...';

      let gotBible = false;
      if (useCont && needBible && bibleInput) {
        const b = extractBible(lastFull);
        if (b) {
          bibleInput.value = b;
          bibleSign = scriptSign();
          gotBible = true;
        }
      }

      const rows = parseMarkdownTable(lastFull);
      renderTable(rows);
      saveSbState();

      // ★ 规则式字段校验：逐格检查必备字段是否齐全
      let missMsg = '';
      try {
        const head = rows.length ? rows[0] : [];
        let ci = -1;
        for (let i = 0; i < head.length; i++) {
          if (String(head[i]).replace(/\s+/g, '').indexOf('画面内容') >= 0) { ci = i; break; }
        }
        if (ci >= 0 && rows.length > 1) {
          const miss = [];
          for (let i = 1; i < rows.length; i++) {
            const txt = String((rows[i] && rows[i][ci]) || '');
            const bad = [];
            if (txt.indexOf('机位') < 0) bad.push('机位');
            if (txt.indexOf('视角面') < 0) bad.push('视角面');
            if (bad.length) miss.push('第' + i + '格缺' + bad.join('/'));
          }
          if (miss.length) {
            missMsg = ' · ⚠ 字段缺失：' + miss.slice(0, 4).join('；')
              + (miss.length > 4 ? (' 等 ' + miss.length + ' 格') : '');
          }
        }
      } catch (e) {}

      if (rows.length > 1) {
        let tail = '';
        if (gotBible) tail = '（已生成设定表）';
        else if (useCont && bible) tail = bibleStale ? '（沿用现有设定表 · ⚠剧本已变）' : '（沿用现有设定表）';
        statusEl.textContent = '✅ 完成，共 ' + (rows.length - 1) + ' 个镜头' + tail
          + (sbHasMonoCol ? '' : ' · ⚠ 缺少「单色版描述」列（黑白风格会暂时回退用「画面内容」，可重试一次）')
          + missMsg;
      } else {
        statusEl.textContent = '未解析到有效表格，可重试';
      }
    } catch (err) {
      statusEl.textContent = '❌ ' + (err.message || err);
      tableWrap.innerHTML = '<div class="app-mode-empty"><i class="fas fa-triangle-exclamation"></i><p>' + (err.message || err) + '</p></div>';
    } finally {
      generating = false;
      genBtn.disabled = false;
      if (bibleRegenBtn) bibleRegenBtn.disabled = false;
    }
  }
  function askAsk(msg) {
    if (typeof window.showConfirm === 'function') return window.showConfirm(msg);
    try { return Promise.resolve(!!window.confirm(msg)); } catch (e) { return Promise.resolve(false); }
  }
  if (genBtn) genBtn.addEventListener('click', generateStoryboard);

  // ★ 设定表按钮：按剧本重算 / 清空
  if (bibleRegenBtn) {
    bibleRegenBtn.addEventListener('click', function () {
      if (bibleInput) bibleInput.value = '';
      bibleSign = '';
      saveSbState();
      statusEl.textContent = '已清空设定表，正在按当前剧本重新生成...';
      generateStoryboard();
    });
  }
  if (bibleClearBtn) {
    bibleClearBtn.addEventListener('click', function () {
      if (bibleInput) bibleInput.value = '';
      bibleSign = '';
      saveSbState();
      statusEl.textContent = '已清空设定表（下次生成会按当前剧本重新产出）';
    });
  }

  // ---------- 导出：单文件分镜看板（图片内嵌 · 点击放大 · 可另存单张） ----------
  const BOARD_MAX = 1400;
  const BOARD_MIME = 'image/jpeg';
  const BOARD_Q = 0.92;
  const BOARD_EXT = BOARD_MIME === 'image/png' ? '.png' : '.jpg';

  exportBtn.addEventListener('click', async function () {
    const table = tableWrap.querySelector('table');
    if (!table) { statusEl.textContent = '暂无可导出的表格'; return; }

    let pathMod = null;
    try { pathMod = require('path'); } catch (e) {}
    if (!ipc || !ipc.invoke || !pathMod) { statusEl.textContent = '导出功能仅在桌面版可用'; return; }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const result = await ipc.invoke('save-file-dialog', {
      title: '导出分镜看板（选择位置并输入文件名）',
      defaultPath: '分镜看板_' + stamp + '.html',
      filters: [{ name: '网页文件', extensions: ['html'] }, { name: '全部文件', extensions: ['*'] }]
    });
    if (!result || result.canceled || !result.filePath) return;

    let outPath = result.filePath;
    if (!/\.html?$/i.test(outPath)) outPath += '.html';
    const name = pathMod.basename(outPath).replace(/\.[^.]+$/, '') || ('分镜看板_' + stamp);

    const trs = table.querySelectorAll('tr');
    const rows = [];
    trs.forEach(function (tr) {
      const row = [];
      tr.querySelectorAll('th, td').forEach(function (c) {
        if (c.style && c.style.display === 'none') return;
        const im = c.querySelector('img');
        if (im && im.src) row.push({ isImg: true, dataUrl: im.src });
        else row.push({ isImg: false, text: (c.innerText || '').trim() });
      });
      rows.push(row);
    });

    const headCells = rows.length ? rows[0] : [];
    const bodyRows = rows.slice(1);
    const imgList = [];
    bodyRows.forEach(function (row) {
      row.forEach(function (cell) { if (cell.isImg && cell.dataUrl) imgList.push(cell.dataUrl); });
    });

    const esc = function (s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    const escAttr = function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    function shrink(dataUrl) {
      return loadImage(dataUrl).then(function (im) {
        const sc = Math.min(1, BOARD_MAX / Math.max(im.width, im.height));
        const w = Math.max(1, Math.round(im.width * sc));
        const h = Math.max(1, Math.round(im.height * sc));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#ffffff';
        cx.fillRect(0, 0, w, h);
        cx.drawImage(im, 0, 0, w, h);
        try { return cv.toDataURL(BOARD_MIME, BOARD_Q); } catch (e) { return dataUrl; }
      }).catch(function () { return dataUrl; });
    }

    statusEl.textContent = '正在打包看板...（0/' + imgList.length + '）';
    const boardImgs = [];
    for (let i = 0; i < imgList.length; i++) {
      boardImgs.push(await shrink(imgList[i]));
      if (imgList.length) statusEl.textContent = '正在打包看板...（' + (i + 1) + '/' + imgList.length + '）';
    }

    function headIdxOf(kw) {
      for (let i = 0; i < headCells.length; i++) {
        if (!headCells[i].isImg && String(headCells[i].text).replace(/\s+/g, '').indexOf(kw) >= 0) return i;
      }
      return -1;
    }
    const iNo = headIdxOf('镜号'), iShot = headIdxOf('景别'), iDur = headIdxOf('时长');

    let bHead = '<tr>';
    headCells.forEach(function (cell) {
      bHead += '<th>' + esc(cell.isImg ? '分镜图' : cell.text) + '</th>';
    });
    bHead += '</tr>';

    let bBody = '';
    let bPtr = 0;
    bodyRows.forEach(function (row) {
      let tr = '<tr>';
      row.forEach(function (cell) {
        if (cell.isImg) {
          const k = bPtr;
          const no = (iNo >= 0 && row[iNo] && row[iNo].text) ? row[iNo].text : String(k + 1);
          const parts = ['镜 ' + no];
          if (iShot >= 0 && row[iShot] && row[iShot].text) parts.push(row[iShot].text);
          if (iDur >= 0 && row[iDur] && row[iDur].text) parts.push(row[iDur].text + ' 秒');
          const fp = 'shot_' + String(k + 1).padStart(2, '0');
          bPtr++;
          tr += '<td class="img-cell"><img class="zoomable" src="' + (boardImgs[k] || '') + '" alt=""'
             + ' data-file="' + fp + '" data-cap="' + escAttr(parts.join(' · ')) + '"></td>';
        } else {
          tr += '<td>' + esc(cell.text) + '</td>';
        }
      });
      tr += '</tr>';
      bBody += tr;
    });

    const bible = currentBible();

    const boardHtml = [
      '<!DOCTYPE html>',
      '<html lang="zh-CN"><head><meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>' + esc(name) + '</title>',
      '<style>',
      '*{box-sizing:border-box}',
      'body{margin:0;background:#0b0d0f;color:#e8eaed;font-family:-apple-system,"Microsoft YaHei",sans-serif;padding:24px;}',
      'h1{font-size:18px;color:#3ecf8e;margin:0 0 6px;}',
      '.sub{font-size:12px;color:#9aa3ad;margin-bottom:18px;}',
      'h2{font-size:14px;color:#3ecf8e;margin:22px 0 8px;}',
      'pre{white-space:pre-wrap;font-size:13px;line-height:1.7;background:#16191d;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:12px 14px;margin:0 0 18px;}',
      'table{border-collapse:collapse;width:100%;font-size:13px;}',
      'th,td{border:1px solid rgba(255,255,255,.12);padding:8px 10px;text-align:left;vertical-align:top;line-height:1.6;}',
      'th{background:#16191d;color:#3ecf8e;position:sticky;top:0;}',
      'tr:nth-child(even) td{background:rgba(255,255,255,.02);}',
      '.img-cell{width:240px;text-align:center;}',
      'img.zoomable{width:220px;border-radius:6px;display:block;margin:0 auto;cursor:zoom-in;background:#000;}',
      '#lb{display:none;position:fixed;inset:0;background:rgba(0,0,0,.93);z-index:999;align-items:center;justify-content:center;flex-direction:column;padding:24px;cursor:zoom-out;}',
      '#lb img{max-width:96vw;max-height:84vh;object-fit:contain;border-radius:4px;box-shadow:0 12px 48px rgba(0,0,0,.7);}',
      '#lb .cap{color:#d8dce1;font-size:13px;margin-top:12px;}',
      '#lb .cap a{color:#3ecf8e;margin-left:12px;text-decoration:none;border-bottom:1px dashed #3ecf8e;}',
      '#lb .x{position:absolute;top:14px;right:22px;color:#fff;font-size:24px;line-height:1;cursor:pointer;opacity:.75;}',
      '#lb .x:hover{opacity:1;}',
      '@media print{body{background:#fff;color:#000;padding:0}h1,h2{color:#000}pre{border-color:#bbb;background:#f6f6f6}th{background:#eee;color:#000}th,td{border-color:#bbb}tr:nth-child(even) td{background:#fafafa}#lb{display:none!important}img.zoomable{width:200px;cursor:auto}}',
      '</style></head><body>',
      '<h1>' + esc(name) + '</h1>',
      '<div class="sub">共 ' + bodyRows.length + ' 个镜头' + (imgList.length ? ' / ' + imgList.length + ' 张分镜图' : '')
        + ' · 点击图片放大（← → 切换 / Esc 关闭 / 放大后可「另存此图」）</div>',
      bible ? ('<h2>设定表（角色 · 场景）</h2><pre>' + esc(bible) + '</pre>') : '',
      '<table><thead>' + bHead + '</thead><tbody>' + bBody + '</tbody></table>',
      '<div id="lb"><span class="x" id="lbx">&#10005;</span><img id="lbi" alt="">',
      '<div class="cap"><span id="lbc"></span><a id="lbsave" href="#" download="shot' + BOARD_EXT + '">另存此图</a></div></div>',
      '<script>',
      '(function(){',
      '  var lb=document.getElementById("lb"),lbi=document.getElementById("lbi"),lbc=document.getElementById("lbc"),lbs=document.getElementById("lbsave");',
      '  var imgs=Array.prototype.slice.call(document.querySelectorAll("img.zoomable"));',
      '  var cur=-1;',
      '  function show(i){',
      '    if(i<0||i>=imgs.length)return;',
      '    cur=i;',
      '    lbi.src=imgs[i].src;',
      '    lbc.textContent=imgs[i].getAttribute("data-cap")||"";',
      '    lbs.href=imgs[i].src;',
      '    lbs.download=((imgs[i].getAttribute("data-file")||"shot")+"' + BOARD_EXT + '");',
      '    lb.style.display="flex";',
      '  }',
      '  function hide(){lb.style.display="none";lbi.src="";}',
      '  document.addEventListener("click",function(e){',
      '    var t=e.target;',
      '    if(t&&t.classList&&t.classList.contains("zoomable")){show(imgs.indexOf(t));return;}',
      '    if(t&&(t.id==="lb"||t.id==="lbi"||t.id==="lbx")){hide();}',
      '  });',
      '  document.addEventListener("keydown",function(e){',
      '    if(lb.style.display!=="flex")return;',
      '    if(e.key==="Escape")hide();',
      '    else if(e.key==="ArrowRight")show(cur+1);',
      '    else if(e.key==="ArrowLeft")show(cur-1);',
      '  });',
      '})();',
      '</script>',
      '</body></html>'
    ].join('\n');

    const w = await ipc.invoke('write-file', outPath, boardHtml);
    if (w && w.ok === false) { statusEl.textContent = '❌ 写入失败：' + (w.error || ''); return; }

    statusEl.textContent = '✅ 已导出看板：' + outPath
      + '（' + Math.round(boardHtml.length / 1024) + ' KB，' + bodyRows.length + ' 个镜头，' + imgList.length + ' 张图）'
      + (imgList.length ? '' : ' ⚠ 表格里还没有分镜图');
  });

  // ======================== ★ 状态持久化（重开保留内容） ========================
  const SB_KEY = 'llm_storyboard_state';
  let sbSaveTimer = null;

  function readTableFromDom() {
    const table = tableWrap.querySelector('table');
    if (!table) return tableData;
    const rows = [];
    table.querySelectorAll('tr').forEach(function (tr) {
      const cells = [];
      tr.querySelectorAll('th, td').forEach(function (c) {
        const im = c.querySelector('img');
        if (im) cells.push('IMG:' + im.src);
        else cells.push(cellText(c));
      });
      if (cells.length) rows.push(cells);
    });
    return rows;
  }

  /* ---------- ★ 写入失败必须可见（原先是 catch (e) {} 静默吞掉） ---------- */
  let sbFailBanner = null;
  let sbFailCount = 0;

  function sbShowFailBanner(reason, wantLen, gotLen) {
    sbFailCount++;
    if (!sbFailBanner) {
      sbFailBanner = document.createElement('div');
      sbFailBanner.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:18px', 'transform:translateX(-50%)',
        'z-index:99999', 'max-width:70vw', 'padding:10px 14px',
        'border-radius:10px', 'border:1px solid #f2545b',
        'background:rgba(40,10,12,0.96)', 'color:#ffd7d9',
        'font-size:12px', 'line-height:1.6', 'font-family:inherit',
        'box-shadow:0 8px 24px rgba(0,0,0,0.45)', 'white-space:pre-wrap',
        'pointer-events:none', 'display:none'
      ].join(';');
      document.body.appendChild(sbFailBanner);
    }
    sbFailBanner.textContent =
      '⚠ 分镜数据保存失败（累计 ' + sbFailCount + ' 次）\n' +
      '原因：' + reason + '\n' +
      '要写入 ' + wantLen + ' 字符' + (gotLen >= 0 ? '，实际读回 ' + gotLen + ' 字符' : '') + '\n' +
      '界面上的修改没有落盘，重启后会回到旧数据。';
    sbFailBanner.style.display = '';
    console.error('[分镜保存失败]', reason, { want: wantLen, got: gotLen });
  }

  function sbClearFailBanner() {
    if (sbFailBanner) sbFailBanner.style.display = 'none';
    sbFailCount = 0;
  }

  function saveSbState() {
    let json = '';
    try {
      json = JSON.stringify({
        script: scriptInput.value,
        count: countInput.value,
        duration: durationInput.value,
        total: totalDurationInput ? totalDurationInput.value : '0',
        extra: extraInput.value,
        global: globalPromptInput ? globalPromptInput.value : '',
        continuity: continuityOn(),
        bible: currentBible(),
        bibleSign: bibleSign,
        table: readTableFromDom()
      });
    } catch (e) {
      sbShowFailBanner('序列化失败（表格里可能含超大数据）', 0, -1);
      return;
    }

    try {
      localStorage.setItem(SB_KEY, json);
      const back = localStorage.getItem(SB_KEY);
      if (back !== json) {
        sbShowFailBanner('写回校验不一致（写入未生效或被截断）', json.length, back ? back.length : 0);
        return;
      }
      sbClearFailBanner();
    } catch (e) {
      sbShowFailBanner((e && e.name ? e.name : 'Error') + '：' + ((e && e.message) || ''), json.length, -1);
    }
  }
  function saveSbDebounced() {
    clearTimeout(sbSaveTimer);
    sbSaveTimer = setTimeout(saveSbState, 400);
  }

  function loadSbState() {
    try {
      const s = JSON.parse(localStorage.getItem(SB_KEY) || '{}');
      if (s.script != null) scriptInput.value = s.script;
      if (s.count != null) countInput.value = s.count;
      if (s.duration != null) durationInput.value = s.duration;
      if (s.total != null && totalDurationInput) totalDurationInput.value = s.total;
      if (s.extra != null) extraInput.value = s.extra;
      if (s.global != null && globalPromptInput) globalPromptInput.value = s.global;
      if (s.continuity != null && contCb) contCb.checked = !!s.continuity;
      if (s.bible != null && bibleInput) bibleInput.value = s.bible;
      if (s.bibleSign != null) bibleSign = s.bibleSign;
      if (Array.isArray(s.table) && s.table.length) renderTable(s.table);
    } catch (e) {}
  }

  // ======================== ★ 生图流水线（宫格裁切） ========================
  const imageModelSelect = document.getElementById('sbImageModel');
  const imageStyleSelect = document.getElementById('sbImageStyle');
  const imageSizeSelect = document.getElementById('sbImageSize');
  const imageQualityRow = document.getElementById('sbQualityRow');
  const imageQualitySelect = document.getElementById('sbImageQuality');
  const genImagesBtn = document.getElementById('sbGenImagesBtn');
  const imageStatusEl = document.getElementById('sbImageStatus');
  const gridSizeSelect = document.getElementById('sbGridSize');
  const gridInfoEl = document.getElementById('sbGridInfo');
  const globalPromptInput = document.getElementById('sbGlobalPrompt');

  // ★ 想加尺寸就改这里（16:9 的才会出现在下拉框里）
  const SIZE_PRESETS = {
    gpt: [
      '1792x1024', '1536x864', '1024x1024', '1536x1024', '1024x1536',
      '2048x1152', '2048x2048', '2560x1440',
      '3072x1728', '3840x2160'
    ],
    nano: [
      '1024x1024', '1344x768', '768x1344', '1184x864',
      '864x1184', '1248x832', '832x1248', '1536x672'
    ],
    generic: [
      '1024x1024', '1280x720', '720x1280', '1024x768', '768x1024', '1536x1024', '1024x1536',
      '2048x2048', '2560x1440', '1440x2560', '2048x1536', '1536x2048',
      '3072x1728', '3840x2160', '2160x3840'
    ]
  };

  function supportsQuality(model) { return /gpt|gtp/i.test(model || ''); }

  function getSelectedImageApi() {
    if (!imageModelSelect || !imageModelSelect.value || typeof apis === 'undefined') return null;
    return apis.find(function (a) { return a.id === imageModelSelect.value; }) || null;
  }

  function getSizePreset() {
    const api = getSelectedImageApi();
    const model = (api && api.model ? api.model : '').toLowerCase();
    if (/gpt|dall|gtp/.test(model)) return SIZE_PRESETS.gpt;
    if (/nano|banana|gemini/.test(model)) return SIZE_PRESETS.nano;
    return SIZE_PRESETS.generic;
  }

  function isWide16x9(s) {
    const p = String(s).split('x');
    const w = parseInt(p[0], 10), h = parseInt(p[1], 10);
    if (!w || !h) return false;
    return Math.abs((w / h) - (16 / 9)) < 0.12;
  }

  function renderSizeOptions() {
    if (!imageSizeSelect) return;
    const all = getSizePreset();
    const wide = all.filter(isWide16x9);
    const list = wide.length ? wide : all;
    const cur = imageSizeSelect.value;

    imageSizeSelect.innerHTML = '';
    if (!list.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '（无可用尺寸）';
      imageSizeSelect.appendChild(opt);
    } else {
      if (!wide.length) {
        const tip = document.createElement('option');
        tip.value = '';
        tip.disabled = true;
        tip.textContent = '⚠ 该模型未配置 16:9 尺寸，以下非 16:9';
        imageSizeSelect.appendChild(tip);
      }
      list.forEach(function (s) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s + (isWide16x9(s) ? '（16:9）' : '（非16:9）');
        imageSizeSelect.appendChild(opt);
      });
      if (list.indexOf(cur) >= 0) imageSizeSelect.value = cur;
    }
    updateGridInfo();
  }

  function updateGridInfo() {
    if (!gridInfoEl) return;
    const n = parseInt(gridSizeSelect ? gridSizeSelect.value : 2, 10) || 2;
    const size = imageSizeSelect ? imageSizeSelect.value : '';
    const p = String(size).split('x');
    const w = parseInt(p[0], 10), h = parseInt(p[1], 10);
    if (!w || !h) { gridInfoEl.textContent = '请选择大图尺寸'; return; }

    const cw = Math.floor(w / n), ch = Math.floor(h / n);
    const bigRatio = w / h;
    const is16x9 = Math.abs(bigRatio - (16 / 9)) < 0.12;
    const low = cw < 448;
    const huge = w * h > 2560 * 1440;

    let msg = n + '×' + n + ' → 每格约 ' + cw + '×' + ch + '（比例 ' + bigRatio.toFixed(2) + '）';
    if (!is16x9) msg += ' ⚠ 大图不是 16:9，切出的小图也不是 16:9';
    if (low) msg += '（偏小，建议换更大尺寸）';
    if (huge) msg += ' ⚠ 尺寸较大：单格图片体积会明显变大，localStorage 存储压力上升';

    gridInfoEl.textContent = msg;
    gridInfoEl.style.color = (!is16x9 || low || huge) ? '#f5b301' : 'var(--text-dim)';
  }

  function updateQualityVisibility() {
    if (!imageQualityRow) return;
    const api = getSelectedImageApi();
    imageQualityRow.style.display = (api && supportsQuality(api.model)) ? 'flex' : 'none';
  }

  function renderImageModelSelect() {
    if (!imageModelSelect) return;
    const list = (typeof apis !== 'undefined' && Array.isArray(apis))
      ? apis.filter(function (a) { return a.genImage; }) : [];
    imageModelSelect.innerHTML = '';
    if (!list.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '（设置中未勾选支持生图的模型）';
      imageModelSelect.appendChild(opt);
    } else {
      list.forEach(function (a) {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.model || '';
        imageModelSelect.appendChild(opt);
      });
    }
    updateQualityVisibility();
    renderSizeOptions();
  }
  window.__syncSbImageModels = renderImageModelSelect;
  renderImageModelSelect();

  if (imageModelSelect) {
    imageModelSelect.addEventListener('change', function () {
      updateQualityVisibility();
      renderSizeOptions();
    });
  }
  if (gridSizeSelect) gridSizeSelect.addEventListener('change', updateGridInfo);
  if (imageSizeSelect) imageSizeSelect.addEventListener('change', updateGridInfo);

  function setImgStatus(msg) { if (imageStatusEl) imageStatusEl.textContent = msg || ''; }

  async function callImageGen(api, prompt, size, quality) {
    let base = (api.url || '').replace(/\/+$/, '');
    if (!/\/images\/generations$/i.test(base)) base += '/images/generations';
    const body = { model: api.model, prompt: prompt, size: size, n: 1 };
    if (supportsQuality(api.model) && quality) body.quality = quality;
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.key },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      let t = '';
      try { t = (await res.text()).slice(0, 150); } catch (e) {}
      throw new Error('HTTP ' + res.status + (t ? ': ' + t : ''));
    }
    const data = await res.json();
    const img = data.data && data.data[0];
    if (!img) throw new Error('返回格式异常');
    if (img.b64_json) return 'data:image/png;base64,' + img.b64_json;
    if (img.url) return img.url;
    throw new Error('未找到图片数据');
  }

  function toDataUrl(src) {
    if (src.indexOf('data:') === 0) return Promise.resolve(src);
    return fetch(src).then(function (r) { return r.blob(); }).then(function (b) {
      return new Promise(function (resolve) {
        const fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.readAsDataURL(b);
      });
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('图片加载失败')); };
      img.src = src;
    });
  }

  function ensureImageColumn() {
    const table = tableWrap.querySelector('table');
    if (!table) return null;
    const headRow = table.querySelector('thead tr');
    if (!headRow) return table;
    const firstTh = headRow.querySelector('th');
    if (firstTh && firstTh.textContent.trim() === '分镜图') return table;
    const th = document.createElement('th');
    th.textContent = '分镜图';
    th.className = 'sb-img-th';
    headRow.insertBefore(th, headRow.firstChild);
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      const td = document.createElement('td');
      td.className = 'sb-img-cell';
      tr.insertBefore(td, tr.firstChild);
    });
    return table;
  }

  // ★ 取逐格内容：无色彩风格 → 「单色版描述」；有色彩风格 → 「画面内容」；同时取出「景别」列
  function getShotContents(preferMono) {
    const table = tableWrap.querySelector('table');
    sbShotSizes = [];
    if (!table) { sbShotMode = 'none'; return null; }
    const heads = Array.prototype.map.call(table.querySelectorAll('thead th'), function (t) { return t.textContent.trim(); });
    function idxOf(name) {
      for (let i = 0; i < heads.length; i++) if (heads[i].replace(/\s+/g, '') === name) return i;
      return -1;
    }
    function colList(idx) {
      const out = [];
      table.querySelectorAll('tbody tr').forEach(function (tr) {
        out.push(cellText(tr.querySelectorAll('td')[idx]));
      });
      return out;
    }
    let idx = -1;
    if (preferMono) {
      idx = idxOf('单色版描述');
      if (idx >= 0) sbShotMode = 'mono';
    }
    if (idx < 0) {
      idx = idxOf('画面内容');
      if (idx >= 0) sbShotMode = preferMono ? 'mono-fallback' : 'detail';
    }
    if (idx < 0) { sbShotMode = 'none'; return null; }
    const list = colList(idx);
    const sizeIdx = idxOf('景别');
    sbShotSizes = sizeIdx >= 0 ? colList(sizeIdx) : [];
    return list;
  }

  // ★ 提示词：两种风格一致（不做颜色管理），逐格带「镜头信息」
  function buildGridPrompt(cells, n, total, globalSetting, stylePrefix, bible) {
    const mono = isMonoStyle();
    const lines = [];

    lines.push('请在一张 16:9 的画稿上，等分画出 ' + total + ' 个独立的镜头画面（' + n + ' 行 × ' + n + ' 列）。每个格子都是一张独立的写意小画。');
    lines.push('【宫格布局要求】');
    lines.push('1. 格子大小完全相等，严格等分对齐；');
    lines.push('2. 格子之间用极细的淡灰线分隔，不要粗重边框；');
    lines.push('3. 画面中不要出现任何文字、数字、编号、水印；');
    lines.push('4. 严格按「从左到右、从上到下」的顺序排列下列镜头。');
    if (cells.length < total) {
      lines.push('5. 其余 ' + (total - cells.length) + ' 个格子（从第 ' + (cells.length + 1) + ' 格开始）整格填充为纯灰色（#808080），不要绘制任何内容。');
    }

    lines.push('');
    lines.push('【空间关系与镜头信息必须逐字执行（最高优先级）】');
    lines.push('1. 每一格都是一张独立的 16:9 画布；描述里的「画面左／画面右」一律指该格自己的左右，不是整张宫格图的左右。');
    lines.push('2. 人物在该格内的左右位置、身体朝向、视线方向必须严格照字面执行，禁止镜像、禁止左右翻转。');
    lines.push('3. 不得为了构图平衡、对称或美观而改变人或物在该格内的左右位置。');
    lines.push('4. 相邻格子的构图不要互相镜像、不要刻意对称；每一格独立按自己的描述绘制。');
    lines.push('5. 描述里写「位于画面左侧」的人，必须出现在该格画面的左半边，不能挪到右半边。');
    lines.push('6. 「机位＝景别／机位高度／视角」必须严格照做：写"胸口高度／仰拍"就要从低处仰视人物，不得改成平视或俯视。');
    lines.push('7. 标为「主体」的人或物必须占据画面视觉重心，并画成最清晰、最实的那一层；标为「虚化」的人物或物体必须明显弱化（简略、柔化、低对比），只允许一个主体为实焦。');
    lines.push('8. 若写「视角面＝纯背面」，该人物必须只见后背与后脑，绝不能出现正脸、五官或眼神；「四分之三背面」只能是侧后方轮廓，也不得露出正脸。');
    lines.push('9. 描述里若写明某人朝另一人冲／看／指，画面必须能看出这个指向关系：两者要有明确的方向呼应，不得把被动目标画成面向镜头的正面立姿。');

    if (stylePrefix) {
      lines.push('');
      lines.push('【画面风格 · 最高优先级】');
      lines.push(stylePrefix);
      lines.push('整张图的媒介、画法与渲染方式，一律以上面的「画面风格」为准；若它与本文任何其他描述发生冲突，一律以「画面风格」为准。');
    }

    if (globalSetting) {
      lines.push('');
      lines.push('【整体设定】');
      lines.push(globalSetting);
      if (stylePrefix) lines.push('（其中若涉及画法或媒介，一律以「画面风格」为准）');
    }

    if (bible) {
      lines.push('');
      lines.push('【连续性设定（所有格子必须严格一致）】');
      lines.push(bible);
      lines.push('所有格子的角色外形、场景空间结构、陈设与道具位置必须完全一致；只允许机位、景别、动作与表情不同。');
    }

    lines.push('');
    lines.push('【分镜内容（按上述顺序逐格绘制）】');
    cells.forEach(function (c, i) {
      lines.push('第' + (i + 1) + '格：' + stripMeta(c));
    });

    if (mono && MONO_HINT_PAINT_FIRST) {
      lines.push('');
      lines.push('【画法优先 · 最高优先级（覆盖本文一切相反描述）】');
      lines.push('每一格都要当作一张独立的写意速写来画：笔触要可见、要爽快、要有轻重缓急与起收笔。');
      lines.push('用「虚实」和「浓淡」拉开层次：主体实、背景虚；近处浓、远处淡。');
      lines.push('每一格都要有清楚的三层：前景、中景（主体）、背景（大面积留白或极简交代）。');
      lines.push('不要勾线填色式的平涂；也不要为了填满格子硬加东西。');
    }

    return lines.join('\n');
  }

  let imgGenerating = false;
  if (genImagesBtn) {
    genImagesBtn.addEventListener('click', async function () {
      if (imgGenerating) return;
      const table = tableWrap.querySelector('table');
      if (!table) { setImgStatus('请先生成分镜表'); return; }

      const api = getSelectedImageApi();
      if (!api) { setImgStatus('请选择生图模型（需在设置里勾选"支持生图"）'); return; }

      const useMono = isMonoStyle();

      const contents = getShotContents(useMono);
      if (!contents) { setImgStatus('表格里没有可用的描述列（「单色版描述」或「画面内容」）'); return; }

      // ★ 逐格内容 = 「景别」+ 描述（描述里已出现过景别就不再重复拼）
      const cells = [];
      for (let i = 0; i < contents.length; i++) {
        const t = String(contents[i] || '').trim();
        if (!t) continue;
        const sz = String(sbShotSizes[i] || '').trim();
        const needSize = sz && t.indexOf(sz) < 0;
        cells.push(needSize ? (sz + '，' + t) : t);
      }
      if (!cells.length) { setImgStatus('没有可用的镜头内容'); return; }

      const size = (imageSizeSelect && imageSizeSelect.value) ? imageSizeSelect.value : '';
      if (!size) { setImgStatus('请选择大图尺寸'); return; }

      const styleId = imageStyleSelect ? imageStyleSelect.value : '';
      const stylePrefix = stylePrefixOf(styleId);
      const quality = imageQualitySelect ? imageQualitySelect.value : 'medium';
      const globalSetting = globalPromptInput ? globalPromptInput.value.trim() : '';
      const n = parseInt(gridSizeSelect ? gridSizeSelect.value : 2, 10) || 2;
      const total = n * n;
      const bible = continuityOn() ? currentBible() : '';
      const bibleStale = !!bible && bibleSign !== scriptSign();

      if (cells.length > total) {
        setImgStatus('镜头数 ' + cells.length + ' 超过格子数 ' + total + '，请选更大的布局');
        return;
      }

      ensureImageColumn();
      const rows = tableWrap.querySelectorAll('tbody tr');

      imgGenerating = true;
      genImagesBtn.disabled = true;

      function fillCell(rowIndex, dataUrl) {
        const tds = rows[rowIndex].querySelectorAll('td');
        const imgCell = tds[0];
        if (!imgCell) return;
        imgCell.innerHTML = '';
        const img = document.createElement('img');
        img.src = dataUrl;
        img.loading = 'lazy';
        img.className = 'sb-previewable';
        imgCell.appendChild(img);
      }

      try {
        setImgStatus('生成宫格大图（' + n + '×' + n + '，尺寸 ' + size + '，'
          + (useMono ? '无色彩风格：用「单色版描述」，输出转灰阶'
                     : '有色彩风格：用「画面内容」，保留彩色')
          + (sbShotMode === 'mono-fallback' ? '（⚠旧表：无「单色版描述」列，暂用「画面内容」）' : '')
          + (bible ? (bibleStale ? '，含连续性设定⚠剧本已变' : '，含连续性设定') : '')
          + (stylePrefix ? '，风格：' + (imageStyleSelect.options[imageStyleSelect.selectedIndex].textContent || '') : '') + '）...');
        const prompt = buildGridPrompt(cells, n, total, globalSetting, stylePrefix, bible);
        window.__lastGridPrompt = prompt;
        const url = await callImageGen(api, prompt, size, quality);
        const dataUrl = await toDataUrl(url);
        const img = await loadImage(dataUrl);

        const cw = Math.floor(img.width / n);
        const ch = Math.floor(img.height / n);

        // ★ 无色彩风格：像素转灰阶 + 轻度对比拉伸
        function toGray(ctx, w, h) {
          const id = ctx.getImageData(0, 0, w, h);
          const d = id.data;
          let lo = 255, hi = 0;
          for (let k = 0; k < d.length; k += 4) {
            const v = Math.round(0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]);
            d[k] = d[k + 1] = d[k + 2] = v;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
          if (hi - lo > 20 && hi - lo < 220) {
            const span = hi - lo;
            const strength = 0.7;
            for (let k = 0; k < d.length; k += 4) {
              const stretched = (d[k] - lo) * 255 / span;
              let v = d[k] + (stretched - d[k]) * strength;
              if (v < 0) v = 0; else if (v > 255) v = 255;
              d[k] = d[k + 1] = d[k + 2] = Math.round(v);
            }
          }
          ctx.putImageData(id, 0, 0);
        }

        for (let i = 0; i < cells.length; i++) {
          const col = i % n;
          const row = Math.floor(i / n);
          const canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, col * cw, row * ch, cw, ch, 0, 0, cw, ch);
          if (useMono) toGray(ctx, cw, ch);
          fillCell(i, canvas.toDataURL('image/png'));
        }
        saveSbState();
        setImgStatus('✅ 完成：已切分 ' + cells.length + ' 张，每格 ' + cw + '×' + ch + (useMono ? '（已转灰阶）' : ''));
      } catch (err) {
        const em = (err && err.message) ? err.message : String(err);
        setImgStatus('❌ ' + em);
      } finally {
        imgGenerating = false;
        genImagesBtn.disabled = false;
      }
    });
  }

  // ======================== ★ 图片放大预览 ========================
  const sbPreview = document.createElement('div');
  sbPreview.className = 'sb-preview-overlay';
  sbPreview.innerHTML = '<img alt="preview">';
  document.body.appendChild(sbPreview);
  sbPreview.addEventListener('click', function () { sbPreview.style.display = 'none'; });

  if (tableWrap) {
    tableWrap.addEventListener('click', function (e) {
      const img = e.target.closest('img');
      if (img && img.src && img.classList.contains('sb-previewable')) {
        sbPreview.querySelector('img').src = img.src;
        sbPreview.style.display = 'flex';
      }
    });
  }

  // ======================== 事件绑定与初始化 ========================
  [scriptInput, countInput, durationInput, totalDurationInput, extraInput].forEach(function (el) {
    if (el) el.addEventListener('input', saveSbDebounced);
  });
  if (bibleInput) {
    bibleInput.addEventListener('input', function () {
      bibleSign = scriptSign();
      saveSbDebounced();
    });
  }
  if (contCb) contCb.addEventListener('change', saveSbDebounced);
  if (globalPromptInput) globalPromptInput.addEventListener('input', saveSbDebounced);

  if (extraSelect) {
    extraSelect.addEventListener('change', function () {
      const id = this.value;
      if (!id) { if (extraInput) extraInput.focus(); return; }
      const s = psByCat('camera').find(function (x) { return x.id === id; });
      if (s && extraInput) extraInput.value = String(s.content || '').trim();
      saveSbDebounced();
    });
  }
  document.addEventListener('ps-snippets-changed', function () {
    renderExtraLangSelect();
    renderStyleSelect();
  });

  if (tableWrap) {
    new MutationObserver(saveSbDebounced).observe(tableWrap, { childList: true, subtree: true, characterData: true });
  }
  loadSbState();

  /* ★ 启动自检：当前占多大 + 还能不能写 */
  (function sbStorageSelfCheck() {
    try {
      const self = localStorage.getItem(SB_KEY) || '';
      let total = 0;
      Object.keys(localStorage).forEach(function (k) { total += (localStorage.getItem(k) || '').length; });
      console.log('[分镜存储] 本模块 = ' + Math.round(self.length / 1024) + ' KB，localStorage 合计 = ' + Math.round(total / 1024) + ' KB');
      try {
        localStorage.setItem('__quota_probe', 'x'.repeat(1024 * 1024));
        localStorage.removeItem('__quota_probe');
        console.log('[分镜存储] ✅ 配额充足（可正常写入 1MB）');
      } catch (e) {
        console.warn('[分镜存储] ❌ 配额已满或接近上限：' + (e && e.name) + ' ' + ((e && e.message) || ''));
        sbShowFailBanner('启动自检：配额不足（' + (e && e.name) + '）', 0, -1);
      }
    } catch (e) {}
  })();

  /* ★ 预览：把设定表 / 任意文本转成灰度版（当前架构不使用，保留以便回退） */
  window.__sbToMono = toMono;
  window.__sbToMonoBible = function () { return toMono(currentBible()); };
})();
