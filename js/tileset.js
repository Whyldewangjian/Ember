// ============================================================================
// js/tileset.js —— 素材包（tileset）的索引与预览
//
// 为什么不"切成一张张小图"：
//   游戏里标准做法是保留一整张图（sheet），用 drawImage 的源矩形去取格子。
//   切成碎图反而多几百个文件、加载更慢、也不方便改。
//   所以这里只做两件事：
//     ① 生成 tiles.json：图块网格信息（每格第几行第几列）
//     ② 生成 preview.html：把这堆格子放大 + 标上编号，让用户对着看、给地块起名
//
// 产出供游戏使用：
//   const T = tiles;                       // tiles.json 内容
//   drawTile(ctx, img, index, dx, dy)      // 见下面的 drawTile 片段
// ============================================================================
const fs = require('fs');
const path = require('path');

const DEFAULT_TILE = 16;

// 生成 tiles.json
function buildIndex(sheetPath, opt) {
  opt = opt || {};
  const tile = Number(opt.tileSize) || DEFAULT_TILE;
  const cols = Number(opt.cols) || 0;
  const rows = Number(opt.rows) || 0;
  const colors = Array.isArray(opt.colors) ? opt.colors : [];   // 每块的平均色（主进程算好传进来）
  const tiles = [];
  if (cols > 0 && rows > 0) {
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const col = colors[i] || null;
        tiles.push({
          i: i++, c: c, r: r,
          hex: col ? col.hex : '',
          kind: col ? col.kind : '',
          alpha: col && typeof col.tr === 'number' ? Math.round(col.tr * 100) / 100 : 1
        });
      }
    }
  }
  // 按"感觉"分好类，模型一眼能看出哪些编号是草/水/土/石
  const byKind = {};
  tiles.forEach(function (t) {
    if (!t.kind) return;
    if (!byKind[t.kind]) byKind[t.kind] = [];
    byKind[t.kind].push(t.i);
  });
  return {
    sheet: path.basename(sheetPath),
    sheetPath: sheetPath,
    tileSize: tile,
    cols: cols,
    rows: rows,
    tiles: tiles,
    byKind: byKind,
    // 命名留空，等用户/Agent 对完预览页再填（比如 { "1": "grass", "2": "water" }）
    names: opt.names || {},
    attribution: opt.attribution || ''
  };
}

// 生成预览页（自带网格、编号、放大、点击复制编号）
function buildPreviewHtml(index, opt) {
  opt = opt || {};
  const sheetName = index.sheet;
  const zoom = opt.zoom || 4;
  const label = opt.label || sheetName;
  const attrib = index.attribution || '';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>素材包预览 · ${escapeHtml(label)}</title>
<style>
  body{margin:0;background:#0e151d;color:#e9f0e9;font:13px/1.5 system-ui,"Microsoft YaHei",sans-serif}
  .wrap{max-width:1100px;margin:0 auto;padding:18px}
  h1{font-size:17px;margin:0 0 4px}
  .sub{color:#8fa3ad;font-size:11.5px;margin-bottom:12px}
  .bar{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
  button{background:#1f2c38;color:#e9f0e9;border:1px solid #2b3a45;border-radius:6px;padding:5px 10px;font:inherit;font-size:12.5px;cursor:pointer}
  button.on{background:#e0b45a;border-color:#e0b45a;color:#1a1206;font-weight:600}
  .grid{display:grid;gap:2px;background:#0a1218;padding:8px;border:1px solid #2b3a45;width:max-content}
  .cell{position:relative;background:#101a22;cursor:pointer}
  .cell canvas{display:block;image-rendering:pixelated}
  .cell .idx{position:absolute;left:1px;top:0;font-size:9px;color:#7fd1e0;background:rgba(0,0,0,.55);padding:0 2px;line-height:1.3}
  .cell:hover{outline:1px solid #e0b45a}
  .cell.sel{outline:2px solid #e0b45a}
  .tip{position:fixed;right:14px;bottom:12px;background:#16212b;border:1px solid #2b3a45;border-radius:8px;padding:8px 12px;font-size:12px;color:#cfe0e8;display:none}
  .attr{margin-top:12px;color:#7e939e;font-size:11px}
</style></head>
<body><div class="wrap">
  <h1>${escapeHtml(label)} · 素材包预览</h1>
  <div class="sub">${index.cols} 列 × ${index.rows} 行 · 每格 ${index.tileSize}×${index.tileSize} 像素 · 点击格子复制编号</div>
  <div class="bar">
    <button data-z="2">小 2×</button>
    <button data-z="4" class="on">标准 4×</button>
    <button data-z="6">大 6×</button>
    <button id="btnName">显示名称</button>
  </div>
  <div class="grid" id="grid"></div>
  <div class="attr">${attrib ? '素材来源：' + escapeHtml(attrib) : ''}</div>
</div>
<div class="tip" id="tip"></div>
<script>
const IDX = ${JSON.stringify(index)};
const grid = document.getElementById('grid');
const tip = document.getElementById('tip');
let zoom = ${zoom};
let showName = false;
let sel = -1;

const img = new Image();
img.src = IDX.sheet;
img.onload = function () { render(); };
img.onerror = function () {
  document.querySelector('.sub').textContent = '找不到图片：' + IDX.sheet + '（要和本页放在同一目录）';
};

function render() {
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = 'repeat(' + IDX.cols + ', ' + (IDX.tileSize * zoom) + 'px)';
  IDX.tiles.forEach(function (t) {
    const d = document.createElement('div');
    d.className = 'cell' + (t.i === sel ? ' sel' : '');
    const cv = document.createElement('canvas');
    const s = IDX.tileSize * zoom;
    cv.width = s; cv.height = s;
    cv.style.width = s + 'px'; cv.style.height = s + 'px';
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, t.c * IDX.tileSize, t.r * IDX.tileSize, IDX.tileSize, IDX.tileSize, 0, 0, s, s);
    d.appendChild(cv);
    if (t.hex) {
      d.title = '#' + t.i + '  ' + (t.kind || '') + '  ' + t.hex + (t.alpha < 0.65 ? '  透明 ' + Math.round((1 - t.alpha) * 100) + '%（可叠放）' : '');
      const dot = document.createElement('span');
      dot.style.cssText = 'position:absolute;right:1px;top:0;width:7px;height:7px;border:1px solid #000;background:' + t.hex;
      d.appendChild(dot);
    }
    const lab = document.createElement('span');
    lab.className = 'idx';
    const nm = IDX.names && IDX.names[t.i];
    lab.textContent = showName && nm ? (t.i + ' ' + nm) : String(t.i);
    d.appendChild(lab);
    d.addEventListener('click', function () {
      sel = t.i;
      render();
      const text = String(t.i);
      try {
        navigator.clipboard.writeText(text);
      } catch (e) {}
      tip.style.display = 'block';
      tip.textContent = '已复制编号 ' + text + '（第 ' + t.r + ' 行 第 ' + t.c + ' 列）';
      setTimeout(function () { tip.style.display = 'none'; }, 1600);
    });
    grid.appendChild(d);
  });
}

document.querySelectorAll('[data-z]').forEach(function (b) {
  b.addEventListener('click', function () {
    zoom = parseInt(b.dataset.z, 10);
    document.querySelectorAll('[data-z]').forEach(function (x) { x.classList.toggle('on', x === b); });
    render();
  });
});
document.getElementById('btnName').addEventListener('click', function () {
  showName = !showName;
  this.classList.toggle('on', showName);
  render();
});
</script>
</body></html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 一次性产出：tiles.json + preview.html（放到 sheet 同目录）
function generate(sheetPath, opt) {
  opt = opt || {};
  const dir = path.dirname(sheetPath);
  const index = buildIndex(sheetPath, opt);
  const jsonPath = path.join(dir, opt.jsonName || 'tiles.json');
  const htmlPath = path.join(dir, opt.htmlName || 'tiles-preview.html');
  fs.writeFileSync(jsonPath, JSON.stringify(index, null, 2), 'utf8');
  fs.writeFileSync(htmlPath, buildPreviewHtml(index, {
    zoom: opt.zoom || 4,
    label: opt.label || path.basename(sheetPath),
    attribution: opt.attribution || index.attribution
  }), 'utf8');
  return { ok: true, json: jsonPath, html: htmlPath, index: index };
}

// 给游戏用的绘制片段（工具会把这段交给模型）
const DRAW_SNIPPET = `// 1) preload：把素材图当"精灵表"加载（按格切）
this.load.spritesheet('terrain', 'assets/tiles/basictiles.png', {
  frameWidth: TILES.tileSize, frameHeight: TILES.tileSize
});

// 2) create：用编号拼地图（编号就是 tiles.json 里的 i）
const map = [
  [11, 11, 12],
  [66, 66, 12],
  [21, 21, 12]
];
for (let r = 0; r < map.length; r++) {
  for (let c = 0; c < map[r].length; c++) {
    this.add.image(c * TILES.tileSize, r * TILES.tileSize, 'terrain', map[r][c])
      .setOrigin(0, 0);
  }
}`;

module.exports = { generate, buildIndex, buildPreviewHtml, DRAW_SNIPPET, DEFAULT_TILE };
