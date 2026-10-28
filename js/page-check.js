// ============================================================================
// js/page-check.js —— 让 Agent 能"看到"自己做出来的网页
//
// 背景：Agent 写完 index.html 只会说"完成了"，它根本不知道页面报没报错、白不白屏。
// Codex 之所以强，很大一部分是它能跑起来看结果；这里用隐藏窗口给 Ember 补上这一环。
//
// 做法：开一个不可见的 BrowserWindow 加载本地 html，收集
//   · console 的 error / warning
//   · 载入失败、渲染进程崩溃
//   · DOM 探测：有没有 canvas、页面上的错误提示文字、可见文字长度
// 然后把结果作为工具结果交回给模型，或直接给用户看。
// ============================================================================
const { ipcMain, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT = 15000;   // 整个检查最多 15 秒
const SETTLE_MS = 900;           // 载入完成后再等一会儿，让脚本跑起来

function normalizeFile(p) {
  let f = String(p || '').trim();
  if (!f) return '';
  if (/^file:\/\//i.test(f)) {
    try { f = decodeURIComponent(f.replace(/^file:\/\//i, '')); } catch (e) { f = f.replace(/^file:\/\//i, ''); }
  }
  f = f.replace(/\//g, path.sep);
  return path.normalize(f);
}

// ---------------------------------------------------------------- 色彩体检
// 用截图取像素算色彩统计。为什么不用 canvas.getImageData：
// Phaser 多数走 WebGL，getImageData 拿不到；而 capturePage 截图是可靠的。
function analyzeColors(bitmap, w, h) {
  if (!bitmap || !bitmap.length) return null;
  const buckets = new Map();      // 5bit/通道 量化后的颜色 → 像素数
  let total = 0;
  let sumSat = 0;
  // 采样步长：像素多时隔行取样，保证速度
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 60000)));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (i + 3 >= bitmap.length) continue;
      const a = bitmap[i + 3];
      if (a < 20) continue;                       // 透明跳过
      const r = bitmap[i], g = bitmap[i + 1], b = bitmap[i + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      buckets.set(key, (buckets.get(key) || 0) + 1);
      total++;
      sumSat += saturation(r, g, b);
    }
  }
  if (!total) return null;
  const arr = [];
  buckets.forEach((n, key) => {
    const r = ((key >> 10) & 31) * 255 / 31;
    const g = ((key >> 5) & 31) * 255 / 31;
    const b = (key & 31) * 255 / 31;
    arr.push({ r, g, b, n, sat: saturation(r, g, b), hue: hueOf(r, g, b) });
  });
  arr.sort((a1, b1) => b1.n - a1.n);

  // 有效色：占比 ≥ 0.15% 的（过滤抗锯齿噪点）
  const effective = arr.filter((c) => c.n / total >= 0.0015);
  // 主色相：按 30 度分桶，累计占比 ≥ 2% 的才算一个色相
  const hueBuckets = new Map();
  arr.forEach((c) => {
    if (c.sat < 8) return;                        // 近似灰的不算色相
    const k = Math.floor(c.hue / 30) % 12;
    hueBuckets.set(k, (hueBuckets.get(k) || 0) + c.n);
  });
  const hueCount = Array.from(hueBuckets.values()).filter((n) => n / total >= 0.02).length;

  // 加权平均饱和度
  const avgSat = sumSat / total;
  // 高饱和面积占比
  let hiArea = 0;
  arr.forEach((c) => { if (c.sat >= 0.7) hiArea += c.n; });
  // 大面积基色（前 3 名）的平均饱和度
  const baseAvg = arr.slice(0, 3).reduce((s, c) => s + c.sat, 0) / Math.min(3, arr.length);

  return {
    colors: arr.length,
    effectiveColors: effective.length,
    hueCount: hueCount,
    avgSat: Math.round(avgSat * 100),
    baseSat: Math.round(baseAvg * 100),
    highSatArea: Math.round((hiArea / total) * 1000) / 10,
    top: arr.slice(0, 6).map((c) => ({
      hex: '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''),
      pct: Math.round((c.n / total) * 1000) / 10,
      sat: Math.round(c.sat * 100)
    }))
  };
}

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

function checkPage(filePath, timeoutMs) {
  const file = normalizeFile(filePath);
  return new Promise((resolve) => {
    let win = null;
    let done = false;
    let timer = null;
    const logs = [];

    const finish = (result) => {
      if (done) return;
      done = true;
      if (timer) { try { clearTimeout(timer); } catch (e) {} }
      try { if (win && !win.isDestroyed()) win.destroy(); } catch (e) {}
      resolve(Object.assign({ file: file }, result));
    };

    if (!file) return finish({ ok: false, error: '没有给出文件路径' });
    if (!fs.existsSync(file)) return finish({ ok: false, error: '文件不存在：' + file });

    try {
      win = new BrowserWindow({
        show: false,
        width: 800,
        height: 450,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          backgroundThrottling: false,
          offscreen: false
        }
      });
      const wc = win.webContents;

      wc.on('console-message', (event, level, message) => {
        // level: 0 verbose / 1 info / 2 warning / 3 error
        if (level >= 2) {
          const line = (level === 3 ? '[错误] ' : '[警告] ') + String(message || '').slice(0, 300);
          if (logs.length < 60) logs.push(line);
        }
      });
      wc.on('render-process-gone', () => {
        finish({ ok: false, error: '页面渲染进程崩溃（可能是内存或显卡问题）', logs: logs.slice(0, 20) });
      });
      wc.on('did-fail-load', (event, code, desc) => {
        logs.push('[载入失败] ' + desc + ' (' + code + ')');
      });

      timer = setTimeout(() => {
        finish({ ok: false, error: '页面在 ' + Math.round((timeoutMs || DEFAULT_TIMEOUT) / 1000) + ' 秒内没有加载完成', logs: logs.slice(0, 20) });
      }, timeoutMs || DEFAULT_TIMEOUT);

      wc.once('did-finish-load', () => {
        setTimeout(async () => {
          try {
            const probe = await wc.executeJavaScript(
              '(function(){' +
              '  var cvs = document.querySelectorAll("canvas");' +
              '  var errEl = document.getElementById("err") || document.getElementById("error") || document.getElementById("rotate");' +
              '  var txt = (document.body ? (document.body.innerText || "") : "").replace(/\\s+/g, " ").trim();' +
              '  return {' +
              '    canvas: cvs.length,' +
              '    canvasSize: cvs.length ? (cvs[0].width + "x" + cvs[0].height) : "",' +
              '    errText: errEl ? String(errEl.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 200) : "",' +
              '    title: document.title || "",' +
              '    textLen: txt.length,' +
              '    text: txt.slice(0, 200)' +
              '  };' +
              '})()'
            );
            const errors = logs.filter((l) => l.indexOf('[错误]') === 0);
            const warns = logs.filter((l) => l.indexOf('[警告]') === 0);
            // 判定：有 console 错误 / 页面错误提示文字 / 既没画布也没文字（白屏）
            const blank = !probe.canvas && probe.textLen < 5;
            const ok = errors.length === 0 && !probe.errText && !blank;

            // ★ 色彩体检：截图取像素，算色数/色相数/饱和度
            let colorStats = null;
            try {
              const img = await win.webContents.capturePage();
              if (img && !img.isEmpty()) {
                const size = img.getSize();
                const bmp = img.toBitmap();     // RGBA
                colorStats = analyzeColors(bmp, size.width, size.height);
              }
            } catch (e2) { colorStats = null; }

            finish({
              ok: ok,
              blank: blank,
              errors: errors.slice(0, 12),
              warnings: warns.slice(0, 8),
              probe: probe,
              color: colorStats
            });
          } catch (e) {
            finish({ ok: false, error: '探测页面内容失败：' + (e && e.message ? e.message : String(e)), logs: logs.slice(0, 20) });
          }
        }, SETTLE_MS);
      });

      win.loadFile(file);
    } catch (e) {
      finish({ ok: false, error: '打开页面失败：' + (e && e.message ? e.message : String(e)) });
    }
  });
}

// 把检查结果压成一段人能读、模型也能读的文字
function formatReport(r) {
  const lines = [];
  if (!r) return '页面自检失败：没有拿到结果';
  if (r.error) {
    lines.push('页面自检失败：' + r.error);
    if (r.logs && r.logs.length) lines.push('控制台输出（前几条）：\n' + r.logs.slice(0, 8).join('\n'));
    return lines.join('\n');
  }
  if (r.ok) {
    lines.push('页面自检通过：没有 console 错误' + (r.probe && r.probe.canvas ? '，画布 ' + r.probe.canvas + ' 个（' + r.probe.canvasSize + '）' : '') + '。');
    if (r.probe && r.probe.title) lines.push('标题：' + r.probe.title);
    if (r.warnings && r.warnings.length) lines.push('警告 ' + r.warnings.length + ' 条：\n' + r.warnings.slice(0, 5).join('\n'));
  } else {
    lines.push('页面自检未通过。');
    if (r.blank) lines.push('· 页面是空白的：没有画布，也没有可见文字');
    if (r.errors && r.errors.length) lines.push('· console 错误 ' + r.errors.length + ' 条：\n  ' + r.errors.join('\n  '));
    if (r.probe && r.probe.errText) lines.push('· 页面上的错误提示：' + r.probe.errText);
    if (r.probe && !r.probe.canvas) lines.push('· 没有找到 canvas 元素');
    if (r.probe && r.probe.textLen < 5 && !r.blank) lines.push('· 页面几乎没有任何文字内容');
    if (r.warnings && r.warnings.length) lines.push('· 警告：\n  ' + r.warnings.slice(0, 5).join('\n  '));
  }

  // ★ 色彩体检结论（不管通过与否都给，因为"色数太少"不影响能不能跑）
  const c = r.color;
  if (c) {
    const problems = [];
    if (c.effectiveColors < 64) problems.push('同屏有效色只有 ' + c.effectiveColors + ' 个（现代像素游戏一般 80 到 200，少于 64 会像 8 位机）');
    if (c.baseSat < 35) problems.push('大面积基色饱和度只有 ' + c.baseSat + '%（低于 35% 画面会发灰）');
    if (c.hueCount < 3) problems.push('色相只有 ' + c.hueCount + ' 个（太单色）');
    if (c.highSatArea < 1) problems.push('高饱和颜色面积只有 ' + c.highSatArea + '%（画面缺视觉焦点）');
    lines.push('');
    lines.push('色彩体检：有效色 ' + c.effectiveColors + ' 个 · 色相 ' + c.hueCount + ' 个'
      + ' · 平均饱和度 ' + c.avgSat + '% · 基色饱和度 ' + c.baseSat + '% · 高饱和面积 ' + c.highSatArea + '%');
    if (c.top && c.top.length) {
      lines.push('面积最大的几个颜色：' + c.top.map(function (t) { return t.hex + '(' + t.pct + '%, S' + t.sat + ')'; }).join(' '));
    }
    if (problems.length) {
      lines.push('色彩问题：');
      problems.forEach(function (p) { lines.push('· ' + p); });
      lines.push('改法：加明暗阶梯（每主色 5 档）、把基色饱和度提到 35% 以上、加 2 到 3 个 80% 以上的强调色。');
    }
  }
  return lines.join('\n');
}

function registerPageCheckIPC() {
  ipcMain.handle('agent-check-page', async (event, filePath, timeoutMs) => {
    try {
      const r = await checkPage(filePath, timeoutMs);
      r.text = formatReport(r);
      return r;
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e), text: '页面自检异常：' + ((e && e.message) || e) };
    }
  });
}

module.exports = { registerPageCheckIPC, checkPage, formatReport };
