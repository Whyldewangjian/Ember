/* ============================================================================
 *  「充值并获取 API」弹窗：渲染 + 打开外链 + 复制链接
 *  内容全部来自 js/recharge-content.js，这里只负责画出来
 * ==========================================================================*/
(function () {
  'use strict';

  var C = window.EMBER_RECHARGE || {};
  var ipc = null;
  try { ipc = require('electron').ipcRenderer; } catch (e) {}

  var btn = document.getElementById('rechargeBtn');
  var modal = document.getElementById('rechargeModal');
  var body = document.getElementById('rechargeBody');
  var closeBtn = document.getElementById('rechargeClose');
  if (!btn || !modal || !body) return;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function openExternal(url) {
    try {
      if (ipc) { ipc.invoke('open-external-url', url); return; }
    } catch (e) {}
    window.open(url, '_blank');
  }

  // 能力标签：能 → 绿色实心；不能 → 灰色描边
  function capTag(icon, label, on) {
    return '<span class="rc-cap ' + (on ? 'on' : 'off') + '">'
      + '<i class="fas fa-' + icon + '"></i>' + label + '</span>';
  }

  // 复制文本（带后备方案）
  function copyPlain(text, done) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallback(); });
        return;
      }
    } catch (e) {}
    fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      done();
    }
  }

  function render() {
    var link = C.link || '';
    var h = [];

    // 说明
    h.push('<div class="rc-intro">');
    (C.intro || []).forEach(function (t) { h.push('<p>' + esc(t) + '</p>'); });
    h.push('</div>');

    // 链接区
    h.push('<div class="rc-linkbox">');
    h.push('<div class="rc-linkrow"><span class="rc-linklabel">推荐链接</span>'
      + '<code class="rc-linktext" id="rcLinkText">' + esc(link) + '</code></div>');
    h.push('<div class="rc-linkbtns">'
      + '<button class="rc-primary" id="rcOpenBtn"><i class="fas fa-arrow-up-right-from-square"></i> 打开开通页面</button>'
      + '<button class="rc-ghost" id="rcCopyBtn"><i class="far fa-copy"></i> 复制链接</button>'
      + '</div>');
    h.push('</div>');

    // 操作步骤（支持子条目 + 截图）
    if ((C.steps || []).length) {
      h.push('<div class="rc-section-title">' + esc(C.stepsTitle || '操作步骤') + '</div>');
      h.push('<ol class="rc-steps">');
      C.steps.forEach(function (s) {
        h.push('<li>');
        h.push('<b>' + esc(s.title) + '</b>');
        if (s.desc) h.push('<span class="rc-step-desc">' + esc(s.desc) + '</span>');
        if ((s.items || []).length) {
          h.push('<ul class="rc-sub">');
          s.items.forEach(function (it) { h.push('<li>' + esc(it) + '</li>'); });
          h.push('</ul>');
        }
        if (s.img) {
          h.push('<div class="rc-figure"><img src="' + esc(s.img) + '" alt="" '
            + 'onerror="this.parentNode.classList.add(\'rc-figure-missing\');this.remove()">'
            + '<span>（截图待补）</span></div>');
        }
        h.push('</li>');
      });
      h.push('</ol>');
    }

    // 模型对照表
    h.push('<div class="rc-section-title">' + esc(C.modelsTitle || '模型怎么选') + '</div>');
    var rows = C.models || [];
    if (!rows.length) {
      h.push('<div class="rc-empty">' + esc(C.modelsNote || '稍后补充。') + '</div>');
      h.push('<table class="rc-table"><thead><tr><th>模型名称</th><th>推荐用途</th><th>说明</th></tr></thead><tbody>'
        + '<tr><td class="rc-dim">（待填）</td><td class="rc-dim">（待填）</td><td class="rc-dim">（待填）</td></tr>'
        + '</tbody></table>');
    } else {
      h.push('<table class="rc-table rc-table-model">');
      h.push('<thead><tr><th>模型名称</th><th>推荐用途</th><th>说明</th></tr></thead><tbody>');
      rows.forEach(function (r) {
        h.push('<tr>');
        h.push('<td class="rc-model-name"><span class="rc-model-text">' + esc(r.model) + '</span>'
          + '<button class="rc-copy-model" data-model="' + esc(r.model) + '" title="复制模型名">'
          + '<i class="far fa-copy"></i></button></td>');
        h.push('<td>' + esc(r.use) + '</td>');
        h.push('<td class="rc-caps">'
          + capTag('eye', '视觉', !!r.vision)
          + capTag('paintbrush', '生图', !!r.image)
          + '</td>');
        h.push('</tr>');
      });
      h.push('</tbody></table>');
      h.push('<div class="rc-cap-legend">'
        + '<span class="rc-cap on"><i class="fas fa-eye"></i>视觉</span>'
        + '<span class="rc-cap off"><i class="fas fa-eye"></i>视觉</span>'
        + '表示能看懂图片 / 不能 · '
        + '<span class="rc-cap on"><i class="fas fa-paintbrush"></i>生图</span>'
        + '<span class="rc-cap off"><i class="fas fa-paintbrush"></i>生图</span>'
        + '表示能出图 / 不能</div>');
    }

    // 联网搜索 Key
    if ((C.searchSteps || []).length) {
      h.push('<div class="rc-section-title">' + esc(C.searchTitle || '免费获取联网搜索 Key') + '</div>');
      h.push('<ol class="rc-steps rc-steps-plain">');
      C.searchSteps.forEach(function (t) { h.push('<li>' + esc(t) + '</li>'); });
      h.push('</ol>');
      if (C.searchNote) h.push('<div class="rc-note">' + esc(C.searchNote) + '</div>');
    }

    if (C.footerTip) h.push('<div class="rc-footer-tip"><i class="fas fa-shield-halved"></i> ' + esc(C.footerTip) + '</div>');

    body.innerHTML = h.join('');

    // 绑定
    var openB = document.getElementById('rcOpenBtn');
    if (openB) openB.addEventListener('click', function () { if (link) openExternal(link); });

    // 每个模型名后面的复制按钮
    body.querySelectorAll('.rc-copy-model').forEach(function (mb) {
      mb.addEventListener('click', function () {
        var name = mb.getAttribute('data-model') || '';
        var done = function () {
          mb.innerHTML = '<i class="fas fa-check"></i>';
          mb.classList.add('copied');
          setTimeout(function () {
            mb.innerHTML = '<i class="far fa-copy"></i>';
            mb.classList.remove('copied');
          }, 1200);
        };
        copyPlain(name, done);
      });
    });
    var copyB = document.getElementById('rcCopyBtn');
    if (copyB) copyB.addEventListener('click', function () {
      copyPlain(link, function () {
        copyB.innerHTML = '<i class="fas fa-check"></i> 已复制';
        setTimeout(function () { copyB.innerHTML = '<i class="far fa-copy"></i> 复制链接'; }, 1500);
      });
    });
  }

  function open() {
    if (!body.innerHTML.trim()) render();
    modal.classList.add('show');
  }
  function close() { modal.classList.remove('show'); }

  btn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('show')) close();
  });
})();
