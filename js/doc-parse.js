// ============================================================================
// js/doc-parse.js —— 零依赖的 Office 文档文本提取
//
// 为什么不用 mammoth / xlsx 这类库：
//   .docx / .xlsx / .pptx 本质都是 ZIP 包，里面是 XML。
//   Node 自带 zlib 就能解 deflate，所以不需要任何第三方依赖，
//   打包体积不变，也不会因为用户没跑 npm install 而报"模块找不到"。
//
// 支持：
//   .docx  → 段落、标题、列表、表格（转成制表符分隔的文本）
//   .xlsx  → 各工作表转 TSV（含共享字符串解析，数字/公式/布尔都处理）
//   .pptx  → 每页幻灯片提取文字
//
// 用法：
//   const { extractText, isSupported } = require('./doc-parse');
//   const text = extractText(buffer, 'docx');   // 失败返回 null
// ============================================================================

const zlib = require('zlib');

// ---------------------------------------------------------------- ZIP 读取器

function findEOCD(buf) {
  // End of Central Directory: 0x06054b50，从末尾往前找（注释最长 65535）
  const minPos = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) return i;
  }
  return -1;
}

// 列出 ZIP 内所有条目：{ name, method, compSize, size, localOffset }
function listZipEntries(buf) {
  const eocd = findEOCD(buf);
  if (eocd < 0) return null;

  let count = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);
  let cdSize = buf.readUInt32LE(eocd + 12);

  // ZIP64 兜底：字段全是 0xFFFF/0xFFFFFFFF 时，去 ZIP64 EOCD 里取
  if (count === 0xFFFF || cdOffset === 0xFFFFFFFF) {
    const locator = eocd - 20;
    if (locator > 0 && buf.readUInt32LE(locator) === 0x07064b50) {
      const z64 = Number(buf.readBigUInt64LE(locator + 8));
      if (z64 > 0 && buf.readUInt32LE(z64) === 0x06064b50) {
        count = Number(buf.readBigUInt64LE(z64 + 32));
        cdSize = Number(buf.readBigUInt64LE(z64 + 40));
        cdOffset = Number(buf.readBigUInt64LE(z64 + 48));
      }
    }
  }

  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length) break;
    if (buf.readUInt32LE(p) !== 0x02014b50) break;   // central directory 签名
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    entries.push({ name: name, method: method, compSize: compSize, size: size, localOffset: localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// 读出某个条目的原始内容（自动解压）
function readZipEntry(buf, entry) {
  const p = entry.localOffset;
  if (p + 30 > buf.length) return null;
  if (buf.readUInt32LE(p) !== 0x04034b50) return null;   // local file header 签名
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const dataStart = p + 30 + nameLen + extraLen;

  // 有些包 central directory 里的 compSize 为 0（流式写入），用下一个条目偏移兜底
  let compSize = entry.compSize;
  const dataEnd = dataStart + compSize;
  const raw = buf.slice(dataStart, dataEnd);

  if (entry.method === 0) return raw;                    // 未压缩
  if (entry.method === 8) {
    try { return zlib.inflateRawSync(raw); } catch (e) { return null; }
  }
  return null;                                           // 其它算法不支持
}

// ---------------------------------------------------------------- XML 小工具

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&#39;': "'", '&nbsp;': ' '
};

function decodeEntities(s) {
  return String(s || '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, function (m) { return ENTITIES[m] || m; })
    .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
}

// 只保留 <w:t> / <a:t> 里的文字（Word / PPT 都用 t 标签存文本）
function collectTextNodes(xml, tag) {
  const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'g');
  let out = '';
  let m;
  while ((m = re.exec(xml)) !== null) out += decodeEntities(m[1]);
  return out;
}

// ---------------------------------------------------------------- .docx

function parseDocx(buf) {
  const entries = listZipEntries(buf);
  if (!entries) return null;
  const main = entries.find(function (e) { return e.name === 'word/document.xml'; });
  if (!main) return null;
  const xmlBuf = readZipEntry(buf, main);
  if (!xmlBuf) return null;
  const xml = xmlBuf.toString('utf8');

  const lines = [];
  let cur = '';

  // 逐段扫描：处理段落、表格、换行、制表符
  const re = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>|<w:tab\s*\/>|<w:br\s*\/>/g;
  let m;
  let lastIndex = 0;

  function flushLine() {
    const t = cur.replace(/\s+$/, '');
    if (t.trim()) lines.push(t);
    cur = '';
  }

  while ((m = re.exec(xml)) !== null) {
    lastIndex = re.lastIndex;
    if (m[0].startsWith('<w:tab')) { cur += '\t'; continue; }
    if (m[0].startsWith('<w:br')) { flushLine(); continue; }
    // <w:p> 段落：取出该段所有 <w:t>（含被拆分的 run）
    const paraXml = m[1] || '';
    const text = collectTextNodes(paraXml, 'w:t');
    // 段落内若有 <w:tab/> 转成制表符
    const tabs = (paraXml.match(/<w:tab\s*\/>/g) || []).length;
    cur += text;
    if (tabs > 0) cur += '\t'.repeat(tabs);
    flushLine();
  }
  // 收尾：处理不在 <w:p> 里的散文字
  if (cur.trim()) lines.push(cur.trim());

  const out = lines.join('\n');
  return out.trim() ? out : null;
}

// ---------------------------------------------------------------- .xlsx

function parseXlsx(buf) {
  const entries = listZipEntries(buf);
  if (!entries) return null;

  // 1. 共享字符串表
  const shared = [];
  const ssEntry = entries.find(function (e) { return e.name === 'xl/sharedStrings.xml'; });
  if (ssEntry) {
    const ssBuf = readZipEntry(buf, ssEntry);
    if (ssBuf) {
      const xml = ssBuf.toString('utf8');
      const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
      let m;
      while ((m = re.exec(xml)) !== null) shared.push(collectTextNodes(m[1], 't'));
    }
  }

  // 2. 工作表（按文件名排序，sheet1、sheet2…）
  const sheetEntries = entries
    .filter(function (e) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name); })
    .sort(function (a, b) {
      const na = parseInt((a.name.match(/sheet(\d+)/) || [0, 0])[1], 10);
      const nb = parseInt((b.name.match(/sheet(\d+)/) || [0, 0])[1], 10);
      return na - nb;
    });
  if (!sheetEntries.length) return null;

  // 工作表名（xl/workbook.xml）
  const sheetNames = {};
  const wbEntry = entries.find(function (e) { return e.name === 'xl/workbook.xml'; });
  if (wbEntry) {
    const wbBuf = readZipEntry(buf, wbEntry);
    if (wbBuf) {
      const wbXml = wbBuf.toString('utf8');
      const re = /<sheet\b[^>]*\bname\s*=\s*"([^"]*)"[^>]*\br:id\s*=\s*"([^"]*)"[^>]*>/g;
      let m, idx = 1;
      while ((m = re.exec(wbXml)) !== null) { sheetNames[idx++] = decodeEntities(m[1]); }
    }
  }

  function colToIndex(letters) {
    let n = 0;
    for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }

  const outParts = [];
  sheetEntries.forEach(function (se, si) {
    const sBuf = readZipEntry(buf, se);
    if (!sBuf) return;
    const xml = sBuf.toString('utf8');
    const title = sheetNames[si + 1] || ('工作表' + (si + 1));
    const rows = [];

    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    let rm;
    while ((rm = rowRe.exec(xml)) !== null) {
      const rowXml = rm[1];
      const cells = {};
      let maxCol = -1;
      const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
      let cm;
      while ((cm = cellRe.exec(rowXml)) !== null) {
        const attrs = cm[1] || cm[3] || '';
        const inner = cm[2] || '';
        const refM = attrs.match(/\br\s*=\s*"([A-Z]+)\d+"/);
        if (!refM) continue;
        const col = colToIndex(refM[1]);
        const typeM = attrs.match(/\bt\s*=\s*"([^"]*)"/);
        const type = typeM ? typeM[1] : 'n';
        let val = '';

        if (type === 's') {                       // 共享字符串
          const vM = inner.match(/<v>([\s\S]*?)<\/v>/);
          const idx = vM ? parseInt(vM[1], 10) : -1;
          val = (idx >= 0 && shared[idx] != null) ? shared[idx] : '';
        } else if (type === 'inlineStr') {        // 内联字符串
          val = collectTextNodes(inner, 't');
        } else if (type === 'str') {              // 公式结果字符串
          const vM = inner.match(/<v>([\s\S]*?)<\/v>/);
          val = vM ? decodeEntities(vM[1]) : '';
        } else if (type === 'b') {                // 布尔
          const vM = inner.match(/<v>([\s\S]*?)<\/v>/);
          val = vM ? (vM[1] === '1' ? 'TRUE' : 'FALSE') : '';
        } else {                                   // 数字
          const vM = inner.match(/<v>([\s\S]*?)<\/v>/);
          val = vM ? decodeEntities(vM[1]) : collectTextNodes(inner, 't');
        }
        cells[col] = val;
        if (col > maxCol) maxCol = col;
      }

      if (maxCol >= 0) {
        const arr = [];
        for (let c = 0; c <= maxCol; c++) arr.push(cells[c] != null ? String(cells[c]) : '');
        // 全空行跳过
        if (arr.some(function (x) { return x.trim() !== ''; })) rows.push(arr.join('\t'));
      }
    }

    if (rows.length) outParts.push('=== ' + title + ' ===\n' + rows.join('\n'));
  });

  return outParts.length ? outParts.join('\n\n') : null;
}

// ---------------------------------------------------------------- .pptx

function parsePptx(buf) {
  const entries = listZipEntries(buf);
  if (!entries) return null;

  const slides = entries
    .filter(function (e) { return /^ppt\/slides\/slide\d+\.xml$/.test(e.name); })
    .sort(function (a, b) {
      const na = parseInt((a.name.match(/slide(\d+)/) || [0, 0])[1], 10);
      const nb = parseInt((b.name.match(/slide(\d+)/) || [0, 0])[1], 10);
      return na - nb;
    });
  if (!slides.length) return null;

  const parts = [];
  slides.forEach(function (s, i) {
    const sBuf = readZipEntry(buf, s);
    if (!sBuf) return;
    const xml = sBuf.toString('utf8');
    // 每个 <a:p> 段落一行
    const paras = [];
    const re = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const t = collectTextNodes(m[1], 'a:t').replace(/\s+$/, '');
      if (t.trim()) paras.push(t);
    }
    if (paras.length) parts.push('=== 幻灯片 ' + (i + 1) + ' ===\n' + paras.join('\n'));
  });

  return parts.length ? parts.join('\n\n') : null;
}

// ---------------------------------------------------------------- 对外接口

const SUPPORTED = {
  docx: parseDocx,
  xlsx: parseXlsx,
  pptx: parsePptx
};

function isSupported(ext) {
  return Object.prototype.hasOwnProperty.call(SUPPORTED, String(ext || '').toLowerCase());
}

function extractText(buf, ext) {
  const fn = SUPPORTED[String(ext || '').toLowerCase()];
  if (!fn) return null;
  try { return fn(buf); } catch (e) { return null; }
}

module.exports = { extractText, isSupported, SUPPORTED };
