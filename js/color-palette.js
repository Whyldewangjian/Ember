// ============================================================================
// js/color-palette.js —— 从一张参考图里提取"能直接用"的色板
//
// 为什么需要它：
//   模型看图只能"感觉"配色，说不出具体色值；结果就是画面发灰、色相打架。
//   这里直接从像素里量：主色相、每个色相的 5 档明暗、大面积基色饱和度、强调色占比。
//   量出来的色板写进 PRD 第 7 章，后面照着画就不会跑偏。
//
// 依赖：传入的是 RGBA 位图（Electron nativeImage.toBitmap() 或截图位图都可）
// ============================================================================

function saturation(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === 0) return 0;
  return (mx - mn) / mx;
}
function hueOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const d = mx - mn;
  if (!d) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}
function toHex(r, g, b) {
  return '#' + [r, g, b].map(function (v) {
    const n = Math.max(0, Math.min(255, Math.round(v)));
    return (n < 16 ? '0' : '') + n.toString(16);
  }).join('');
}

const HUE_NAMES = [
  { max: 15, name: '红' }, { max: 45, name: '橙' }, { max: 70, name: '黄' },
  { max: 100, name: '黄绿' }, { max: 150, name: '绿' }, { max: 180, name: '青绿' },
  { max: 200, name: '青' }, { max: 225, name: '天蓝' }, { max: 260, name: '蓝' },
  { max: 290, name: '紫' }, { max: 330, name: '品红' }, { max: 360, name: '红' }
];
function hueName(h) {
  for (let i = 0; i < HUE_NAMES.length; i++) if (h <= HUE_NAMES[i].max) return HUE_NAMES[i].name;
  return '红';
}

// 主体：统计 + 聚类成色板
function extractPalette(bitmap, w, h, opts) {
  opts = opts || {};
  const maxDim = opts.maxDim || 320;          // 大图先粗采样，够用且快
  const step = Math.max(1, Math.floor(Math.max(w, h) / maxDim));

  const buckets = new Map();                  // 5bit 量化颜色 → 计数
  let total = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (i + 3 >= bitmap.length) continue;
      if (bitmap[i + 3] < 20) continue;       // 透明跳过
      const r = bitmap[i], g = bitmap[i + 1], b = bitmap[i + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      buckets.set(key, (buckets.get(key) || 0) + 1);
      total++;
    }
  }
  if (!total) return null;

  // 还原成颜色对象，按面积排序
  const colors = [];
  buckets.forEach(function (n, key) {
    const r = ((key >> 10) & 31) * 255 / 31;
    const g = ((key >> 5) & 31) * 255 / 31;
    const b = (key & 31) * 255 / 31;
    const sat = saturation(r, g, b);
    const hue = hueOf(r, g, b);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    colors.push({ r: r, g: g, b: b, n: n, sat: sat, hue: hue, lum: lum, hex: toHex(r, g, b), pct: n / total });
  });
  colors.sort(function (a, b) { return b.n - a.n; });

  // ① 按 30° 色相分桶，桶面积 ≥2% 才算一个"主色相"
  const byHue = new Map();
  colors.forEach(function (c) {
    if (c.sat < 0.10) return;                 // 近灰不参与色相统计
    const k = Math.floor(c.hue / 30) % 12;
    if (!byHue.has(k)) byHue.set(k, { key: k, colors: [], area: 0, hueSum: 0 });
    const b2 = byHue.get(k);
    b2.colors.push(c);
    b2.area += c.pct;
    b2.hueSum += c.hue * c.pct;
  });

  const hues = [];
  byHue.forEach(function (b2) {
    if (b2.area < 0.02) return;               // 面积太小，不算主色相
    // ② 同一色相内按亮度排序，取 5 档（最暗→最亮）
    const arr = b2.colors.slice().sort(function (a, b) { return a.lum - b.lum; });
    const pick = [];
    const STEPS = Math.min(5, arr.length);
    for (let i = 0; i < STEPS; i++) {
      const idx = Math.round(i * (arr.length - 1) / Math.max(1, STEPS - 1));
      pick.push(arr[idx]);
    }
    // 不足 5 档时用最亮的补（避免只有两三个色的色相）
    while (pick.length < 5) pick.push(arr[arr.length - 1]);
    const hueAvg = b2.hueSum / b2.area;
    const satAvg = pick.reduce(function (s, c) { return s + c.sat; }, 0) / pick.length;
    hues.push({
      hue: Math.round(hueAvg),
      name: hueName(hueAvg),
      area: b2.area,
      sat: satAvg,
      steps: pick.map(function (c) { return c.hex; })
    });
  });
  hues.sort(function (a, b) { return b.area - a.area; });

  // ③ 大面积基色（前 3 色）与强调色（sat ≥ 0.7 且面积 ≥ 0.5%）
  const baseSat = colors.slice(0, 3).reduce(function (s, c) { return s + c.sat; }, 0) / Math.min(3, colors.length);
  const accents = colors.filter(function (c) { return c.sat >= 0.70 && c.pct >= 0.005; })
    .slice(0, 3)
    .map(function (c) { return { hex: c.hex, sat: Math.round(c.sat * 100), pct: Math.round(c.pct * 1000) / 10 }; });
  const hiArea = colors.reduce(function (s, c) { return s + (c.sat >= 0.70 ? c.pct : 0); }, 0);
  const avgSat = colors.reduce(function (s, c) { return s + c.sat * c.pct; }, 0);
  const effective = colors.filter(function (c) { return c.pct >= 0.0015; }).length;

  return {
    hues: hues.slice(0, 8),
    accents: accents,
    stats: {
      effectiveColors: effective,
      hueCount: hues.length,
      avgSat: Math.round(avgSat * 100),
      baseSat: Math.round(baseSat * 100),
      highSatArea: Math.round(hiArea * 1000) / 10
    },
    top: colors.slice(0, 6).map(function (c) {
      return { hex: c.hex, pct: Math.round(c.pct * 1000) / 10, sat: Math.round(c.sat * 100) };
    })
  };
}

// 生成可以直接贴进 PRD 第 7 章的 Markdown 表
function paletteMarkdown(p, title) {
  if (!p) return '（没有提取到颜色）';
  const lines = [];
  lines.push('### 色板（从参考图提取）');
  if (title) lines.push('来源：' + title);
  lines.push('');
  lines.push('| 色相 | 用途 | 5 档色值（暗 → 亮） | 平均饱和度 | 面积占比 |');
  lines.push('|---|---|---|---|---|');
  const useHint = ['植被/地面', '天空/水面', '建筑/木石', '金属/布料', '光效/强调', '阴影/远景', '点缀', '界面'];
  p.hues.forEach(function (h, i) {
    lines.push('| ' + h.name + '(' + h.hue + '°) | ' + (useHint[i] || '其它') + ' | '
      + h.steps.join(' ') + ' | ' + Math.round(h.sat * 100) + '% | '
      + Math.round(h.area * 1000) / 10 + '% |');
  });
  lines.push('');
  if (p.accents.length) {
    lines.push('强调色（饱和度 ≥70%，必须真的用在画面里）：'
      + p.accents.map(function (a) { return a.hex + '（S' + a.sat + '%，约 ' + a.pct + '% 面积）'; }).join('、'));
  } else {
    lines.push('强调色：**这张图里没有高饱和的强调色** —— 做游戏时要自己补 2~3 个（S≥80%），否则画面没有焦点。');
  }
  lines.push('');
  const s = p.stats;
  lines.push('实测指标：有效色 ' + s.effectiveColors + ' · 色相 ' + s.hueCount + ' · 平均饱和度 '
    + s.avgSat + '% · 基色饱和度 ' + s.baseSat + '% · 高饱和面积 ' + s.highSatArea + '%');
  if (s.avgSat < 50) lines.push('⚠ 这张参考图本身偏灰（平均饱和度 < 50%），照着它画会更灰 —— 建议把每个色相的饱和度整体提 10~15%。');
  if (s.highSatArea < 15) lines.push('⚠ 高饱和面积不足 15%，做游戏时要主动加亮色点缀（水面、光效、受光面）。');
  return lines.join('\n');
}

module.exports = { extractPalette, paletteMarkdown, saturation, hueOf, toHex };
