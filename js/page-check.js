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
            finish({
              ok: ok,
              blank: blank,
              errors: errors.slice(0, 12),
              warnings: warns.slice(0, 8),
              probe: probe
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
    return lines.join('\n');
  }
  lines.push('页面自检未通过。');
  if (r.blank) lines.push('· 页面是空白的：没有画布，也没有可见文字');
  if (r.errors && r.errors.length) lines.push('· console 错误 ' + r.errors.length + ' 条：\n  ' + r.errors.join('\n  '));
  if (r.probe && r.probe.errText) lines.push('· 页面上的错误提示：' + r.probe.errText);
  if (r.probe && !r.probe.canvas) lines.push('· 没有找到 canvas 元素');
  if (r.probe && r.probe.textLen < 5 && !r.blank) lines.push('· 页面几乎没有任何文字内容');
  if (r.warnings && r.warnings.length) lines.push('· 警告：\n  ' + r.warnings.slice(0, 5).join('\n  '));
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
