// ============================================================================
// js/pptx-build.js —— 生成 pptx（版式由代码控制，模型只给内容）
//
// 为什么这么设计：
//   让模型"直接写 pptx"必然会破版 —— 它控制不住字号、换行、溢出。
//   这里把版式全部写死在代码里，模型只填 { layout, title, bullets, ... }。
//
// 核心难点是"文字溢出"，处理顺序：
//   ① 按字数估算行数（中文 1 字 ≈ 1 个字号宽，英文 ≈ 0.55）
//   ② 放不下 → 逐档降字号（到下限为止）
//   ③ 还放不下 → 自动续页（继续用同一版式，标题加 (续)）
//
// 版式：cover / bullets / two-col / image-text / table / big-number / end
// 主题：light（浅色商务）/ dark（深色科技）
// ============================================================================
const fs = require('fs');
const path = require('path');

const W = 13.333, H = 7.5, M = 0.9;
const GRID_COLS = 12;

const THEMES = {
  light: {
    bg: 'FFFFFF', ink: '1A1A2E', sub: '6B7280', accent: 'E94560',
    soft: 'F5F6F8', line: 'E5E7EB', dark: '12121C', onAccent: 'FFFFFF',
    font: 'Microsoft YaHei', mono: 'Consolas'
  },
  dark: {
    bg: '12121C', ink: 'F2F5F7', sub: '9096A3', accent: '4ED6C1',
    soft: '1B1B28', line: '2C2C3C', dark: '0C0C14', onAccent: '08110F',
    font: 'Microsoft YaHei', mono: 'Consolas'
  }
};

// 字号阶梯（不允许自定义中间值）
const SIZE = { h1: 42, h2: 28, h3: 17, body: 13, small: 10 };

function isCJK(ch) { return /[\u3000-\u9fff\uff00-\uffef]/.test(ch); }
// 估算字符串宽度（单位：em）
function emWidth(str) {
  let w = 0;
  for (const ch of String(str)) w += isCJK(ch) ? 1 : 0.55;
  return w;
}
// 在给定宽度（英寸）和字号（pt）下，估算需要多少行
function estimateLines(str, boxWIn, fontPt) {
  const perLineEm = (boxWIn * 72) / fontPt;      // 一行能放多少 em
  if (perLineEm <= 0) return 999;
  const lines = String(str).split('\n');
  let total = 0;
  lines.forEach(function (ln) {
    total += Math.max(1, Math.ceil(emWidth(ln) / perLineEm));
  });
  return total;
}
// 在给定框内，找出能放下的最大字号（从 base 往下试）
function fitSize(items, boxWIn, boxHIn, basePt, minPt, lineGap) {
  const sizes = [basePt];
  for (let s = basePt - 1; s >= minPt; s--) sizes.push(s);
  for (const pt of sizes) {
    const lineH = (pt * (lineGap || 1.4)) / 72;   // 英寸
    let totalH = 0;
    for (const it of items) totalH += estimateLines(it, boxWIn, pt) * lineH;
    if (totalH <= boxHIn) return pt;
  }
  return -1;   // 再小也放不下 → 调用方续页
}

function makeBuilder(pptxgen) {
  return function build(spec, outPath) {
    const theme = THEMES[spec.theme] || THEMES.light;
    const pres = new pptxgen();
    pres.defineLayout({ name: 'W16x9', width: W, height: H });
    pres.layout = 'W16x9';

    const notes = [];

    function bg(s, color) {
      s.background = { color: color || theme.bg };
      s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.055, fill: { color: theme.accent } });
    }
    function footer(s, idx, total) {
      s.addText(spec.footer || spec.title || '', {
        x: M, y: 6.95, w: 6, h: 0.28, fontSize: SIZE.small, color: theme.sub, fontFace: theme.font
      });
      if (total) {
        s.addText(idx + ' / ' + total, {
          x: W - M - 1, y: 6.95, w: 1, h: 0.28, fontSize: SIZE.small, color: theme.sub,
          align: 'right', fontFace: theme.font
        });
      }
    }
    function head(s, title, subtitle, withFooter, idx, total) {
      bg(s);
      s.addText(title, {
        x: M, y: 0.5, w: W - M * 2, h: 0.62, fontSize: SIZE.h2, bold: true,
        color: theme.ink, fontFace: theme.font, valign: 'middle'
      });
      if (subtitle) {
        s.addText(subtitle, {
          x: M, y: 1.12, w: W - M * 2, h: 0.34, fontSize: SIZE.body, color: theme.sub, fontFace: theme.font
        });
      }
      s.addShape(pres.ShapeType.rect, {
        x: M, y: subtitle ? 1.56 : 1.24, w: 1.1, h: 0.045, fill: { color: theme.accent }
      });
      if (withFooter) footer(s, idx, total);
    }
    function takeaway(s, text) {
      if (!text) return;
      s.addShape(pres.ShapeType.rect, { x: M, y: 5.85, w: W - M * 2, h: 0.64, fill: { color: theme.soft } });
      s.addShape(pres.ShapeType.rect, { x: M, y: 5.85, w: 0.055, h: 0.64, fill: { color: theme.accent } });
      s.addText(text, {
        x: M + 0.3, y: 5.85, w: W - M * 2 - 0.55, h: 0.64, fontSize: SIZE.body,
        color: theme.ink, fontFace: theme.font, valign: 'middle'
      });
    }

    // ---------------- 版式 ----------------
    const LAYOUTS = {
      cover: function (sl) {
        const s = pres.addSlide();
        bg(s, spec.theme === 'dark' ? theme.dark : theme.dark);
        s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.1, h: H, fill: { color: theme.accent } });
        const titlePt = fitSize([sl.title || ''], 9.5, 1.6, SIZE.h1, 28);
        s.addText(sl.title || '', {
          x: 1.15, y: 2.45, w: 9.5, h: 1.0, fontSize: titlePt > 0 ? titlePt : 28, bold: true,
          color: 'FFFFFF', fontFace: theme.font
        });
        if (sl.subtitle) {
          s.addText(sl.subtitle, {
            x: 1.2, y: 3.5, w: 9.5, h: 0.6, fontSize: SIZE.h3, color: 'C3C8D2', fontFace: theme.font
          });
        }
        s.addShape(pres.ShapeType.rect, { x: 1.2, y: 4.3, w: 1.4, h: 0.045, fill: { color: theme.accent } });
        if (sl.subtitle2) {
          s.addText(sl.subtitle2, {
            x: 1.2, y: 4.55, w: 8, h: 0.35, fontSize: SIZE.body, color: '8B92A0', fontFace: theme.font
          });
        }
        notes.push({ layout: 'cover', ok: true });
      },

      bullets: function (sl) {
        const items = (sl.bullets || []).map(String);
        if (!items.length) return;
        const boxW = W - M * 2 - 0.55;
        let start = 0;
        let part = 1;
        while (start < items.length) {
          const s = pres.addSlide();
          const title = part === 1 ? (sl.title || '') : ((sl.title || '') + '（续 ' + part + '）');
          head(s, title, part === 1 ? sl.subtitle : '', true, 0, 0);
          // 每页最多 4 条，且能放下
          const maxLines = 4;
          let take = Math.min(maxLines, items.length - start);
          let pt = -1;
          while (take >= 1) {
            pt = fitSize(items.slice(start, start + take), boxW, 3.5, SIZE.h3, 12, 1.5);
            if (pt > 0) break;
            take--;
          }
          if (take < 1) { take = 1; pt = 12; notes.push({ layout: 'bullets', warn: '文字过长，已用最小字号' }); }
          // ★ 按可用高度均分：条目少时铺开，条目多时紧凑
          const areaTop = 1.95, areaBottom = 5.62;
          const heights = [];
          let sumH = 0;
          for (let i = 0; i < take; i++) {
            const lineH = (pt * 1.5) / 72;
            const h = Math.max(0.42, estimateLines(items[start + i], boxW, pt) * lineH);
            heights.push(h); sumH += h;
          }
          const gap = Math.max(0.22, Math.min(0.55, (areaBottom - areaTop - sumH) / Math.max(1, take)));
          let y = areaTop;
          for (let i = 0; i < take; i++) {
            const txt = items[start + i];
            const h = heights[i];
            s.addShape(pres.ShapeType.ellipse, {
              x: M, y: y + 0.06, w: 0.3, h: 0.3, fill: { color: theme.accent }
            });
            s.addText(String(start + i + 1), {
              x: M, y: y + 0.04, w: 0.3, h: 0.3, fontSize: SIZE.small, bold: true,
              color: theme.onAccent, align: 'center', valign: 'middle', fontFace: theme.font
            });
            s.addText(txt, {
              x: M + 0.5, y: y, w: boxW, h: h, fontSize: pt, color: theme.ink,
              fontFace: theme.font, valign: 'top', lineSpacingMultiple: 1.5
            });
            y += h + gap;
          }
          if (part === 1) takeaway(s, sl.takeaway);
          notes.push({ layout: 'bullets', items: take, size: pt });
          start += take;
          part++;
        }
      },

      'two-col': function (sl) {
        const s = pres.addSlide();
        head(s, sl.title || '', sl.subtitle, true, 0, 0);
        const colW = (W - M * 2 - 0.6) / 2, top = 1.95, ch = 3.5;
        const cols = [
          { title: (sl.left && sl.left.title) || '左', items: ((sl.left && sl.left.items) || []).map(String),
            fill: theme.soft, line: theme.line, bar: theme.sub, titleColor: theme.sub, text: theme.sub, lw: 1 },
          { title: (sl.right && sl.right.title) || '右', items: ((sl.right && sl.right.items) || []).map(String),
            fill: spec.theme === 'dark' ? '1E2A33' : 'FFF6F7', line: theme.accent, bar: theme.accent,
            titleColor: theme.accent, text: theme.ink, lw: 1.25 }
        ];
        cols.forEach(function (c2, i) {
          const x = M + i * (colW + 0.6);
          s.addShape(pres.ShapeType.rect, {
            x: x, y: top, w: colW, h: ch, fill: { color: c2.fill }, line: { color: c2.line, width: c2.lw }
          });
          s.addShape(pres.ShapeType.rect, { x: x, y: top, w: colW, h: 0.05, fill: { color: c2.bar } });
          s.addText(c2.title, {
            x: x + 0.35, y: top + 0.26, w: colW - 0.7, h: 0.42, fontSize: SIZE.h3, bold: true,
            color: c2.titleColor, fontFace: theme.font
          });
          const boxW = colW - 0.7;
          const pt = fitSize(c2.items, boxW, ch - 1.0, SIZE.body + 1, 10, 1.5);
          const usePt = pt > 0 ? pt : 10;
          if (pt < 0) notes.push({ layout: 'two-col', warn: c2.title + ' 内容过多，已用最小字号' });
          s.addText(c2.items.map(function (t) {
            return { text: t, options: { bullet: { code: '25CF' }, fontSize: usePt, color: c2.text, breakLine: true, paraSpaceAfter: 8 } };
          }), {
            x: x + 0.35, y: top + 0.8, w: boxW, h: ch - 0.95, fontFace: theme.font, valign: 'middle'
          });
        });
        takeaway(s, sl.takeaway);
        notes.push({ layout: 'two-col' });
      },

      'image-text': function (sl) {
        const s = pres.addSlide();
        head(s, sl.title || '', sl.subtitle, true, 0, 0);
        const boxW = 5.6;
        const items = (sl.bullets || []).map(String);
        const pt = fitSize(items, boxW, 3.2, SIZE.h3, 11, 1.5);
        const usePt = pt > 0 ? pt : 11;
        if (pt < 0) notes.push({ layout: 'image-text', warn: '左侧文字过多，已用最小字号' });
        s.addText(items.map(function (t) {
          return { text: t, options: { bullet: { code: '25CF' }, fontSize: usePt, color: theme.ink, breakLine: true, paraSpaceAfter: 8 } };
        }), { x: M, y: 2.0, w: boxW, h: 3.3, fontFace: theme.font, valign: 'top' });

        // 图片区：给了路径就用图，没给就画占位框
        const rx = M + boxW + 0.7, ry = 1.95, rw = W - rx - M, rh = 3.6;
        const imgPath = sl.image && fs.existsSync(sl.image) ? sl.image : '';
        if (imgPath) {
          try {
            s.addImage({ path: imgPath, x: rx, y: ry, w: rw, h: rh, sizing: { type: 'cover', w: rw, h: rh } });
            notes.push({ layout: 'image-text', image: path.basename(imgPath) });
          } catch (e) {
            s.addShape(pres.ShapeType.rect, { x: rx, y: ry, w: rw, h: rh, fill: { color: theme.soft }, line: { color: theme.line, width: 1 } });
            s.addText('图片加载失败', { x: rx, y: ry + rh / 2 - 0.2, w: rw, h: 0.4, fontSize: SIZE.body, color: theme.sub, align: 'center', fontFace: theme.font });
            notes.push({ layout: 'image-text', warn: '图片加载失败：' + imgPath });
          }
        } else {
          s.addShape(pres.ShapeType.rect, { x: rx, y: ry, w: rw, h: rh, fill: { color: theme.soft }, line: { color: theme.line, width: 1 } });
          s.addText(sl.imageHint || '（配图位置）', {
            x: rx, y: ry + rh / 2 - 0.2, w: rw, h: 0.4, fontSize: SIZE.body, color: theme.sub,
            align: 'center', fontFace: theme.font
          });
          notes.push({ layout: 'image-text', placeholder: true });
        }
        takeaway(s, sl.takeaway);
      },

      table: function (sl) {
        const s = pres.addSlide();
        head(s, sl.title || '', sl.subtitle, true, 0, 0);
        const rows = (sl.table || []).map(function (r) { return r.map(String); });
        if (!rows.length) return;
        const head3 = rows[0].map(function (t) {
          return { text: t, options: { bold: true, color: theme.onAccent, fill: { color: theme.ink }, fontSize: SIZE.body, fontFace: theme.font } };
        });
        const body = rows.slice(1).map(function (r) {
          return r.map(function (t) {
            return { text: t, options: { color: theme.ink, fontSize: SIZE.body - 1, fontFace: theme.font } };
          });
        });
        s.addTable([head3].concat(body), {
          x: M, y: 1.95, w: W - M * 2, rowH: 0.55,
          border: { type: 'solid', color: theme.line, pt: 1 },
          fontFace: theme.font, fontSize: SIZE.body - 1, color: theme.ink, valign: 'middle',
          fill: { color: theme.bg }, align: 'left'
        });
        if (sl.note) {
          s.addText(sl.note, { x: M, y: 5.2, w: W - M * 2, h: 0.3, fontSize: SIZE.small, color: theme.sub, fontFace: theme.font });
        }
        takeaway(s, sl.takeaway);
        notes.push({ layout: 'table', rows: rows.length });
      },

      'big-number': function (sl) {
        const s = pres.addSlide();
        head(s, sl.title || '', sl.subtitle, true, 0, 0);
        const nums = (sl.numbers || []).slice(0, 3);
        const cw = (W - M * 2 - (nums.length - 1) * 0.4) / Math.max(1, nums.length);
        nums.forEach(function (n, i) {
          const x = M + i * (cw + 0.4);
          s.addShape(pres.ShapeType.rect, { x: x, y: 2.0, w: cw, h: 2.6, fill: { color: theme.soft }, line: { color: theme.line, width: 1 } });
          s.addShape(pres.ShapeType.rect, { x: x, y: 2.0, w: cw, h: 0.05, fill: { color: theme.accent } });
          s.addText(String(n.value || ''), {
            x: x + 0.25, y: 2.35, w: cw - 0.5, h: 0.9, fontSize: 40, bold: true, color: theme.accent, fontFace: theme.font
          });
          s.addText(String(n.label || ''), {
            x: x + 0.25, y: 3.3, w: cw - 0.5, h: 0.5, fontSize: SIZE.h3, color: theme.ink, fontFace: theme.font
          });
          if (n.desc) {
            const pt = fitSize([String(n.desc)], cw - 0.5, 0.9, SIZE.body - 1, 9, 1.4);
            s.addText(String(n.desc), {
              x: x + 0.25, y: 3.85, w: cw - 0.5, h: 0.9, fontSize: pt > 0 ? pt : 9, color: theme.sub,
              fontFace: theme.font, lineSpacingMultiple: 1.4
            });
          }
        });
        takeaway(s, sl.takeaway);
        notes.push({ layout: 'big-number', count: nums.length });
      },

      end: function (sl) {
        const s = pres.addSlide();
        bg(s, theme.dark);
        s.addText(sl.title || '谢谢', {
          x: 0, y: 2.6, w: W, h: 0.95, fontSize: SIZE.h1, bold: true, color: 'FFFFFF',
          align: 'center', fontFace: theme.font
        });
        if (sl.subtitle) {
          s.addText(sl.subtitle, {
            x: 0, y: 3.6, w: W, h: 0.45, fontSize: SIZE.h3, color: '8B92A0', align: 'center', fontFace: theme.font
          });
        }
        s.addShape(pres.ShapeType.rect, { x: (W - 1.4) / 2, y: 4.3, w: 1.4, h: 0.045, fill: { color: theme.accent } });
        notes.push({ layout: 'end' });
      }
    };

    // ---------------- 逐页生成 ----------------
    const slides = Array.isArray(spec.slides) ? spec.slides : [];
    slides.forEach(function (sl) {
      const fn = LAYOUTS[sl.layout];
      if (!fn) { notes.push({ layout: sl.layout, error: '未知版式' }); return; }
      try { fn(sl); } catch (e) { notes.push({ layout: sl.layout, error: (e && e.message) || String(e) }); }
    });

    // 页面总数补齐到页脚（生成后统一改不了，这里简单起见不加页码）
    return pres.writeFile({ fileName: outPath }).then(function (f) {
      return {
        ok: true,
        file: f,
        slides: slides.length,
        notes: notes,
        warn: notes.filter(function (n) { return n.warn || n.error; })
      };
    }).catch(function (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    });
  };
}

module.exports = { makeBuilder, THEMES, SIZE, GRID_COLS, W, H, M };
