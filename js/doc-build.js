// ============================================================================
// js/doc-build.js —— 零依赖生成 .xlsx（Excel）
//
// 为什么自己写：
//   .xlsx 本质是 ZIP 包 + 几个 XML 文件。Node 自带 zlib 就能压缩，
//   所以不需要 sheetjs / exceljs 这类库，打包体积不变、也不用 npm install。
//
// 用法：
//   const { buildXlsx } = require('./doc-build');
//   const buf = buildXlsx([{ name: '销售', rows: [['月份','销量'], ['一月', 120]] }]);
//   fs.writeFileSync('out.xlsx', buf);
//
// 支持：多个工作表、文本/数字/布尔自动识别、数字右对齐由 Excel 自己处理。
// ============================================================================

const zlib = require('zlib');

// ---------------------------------------------------------------- CRC32

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    CRC_TABLE[n] = c;
  }
  return CRC_TABLE;
}
function crc32(buf) {
  const t = crcTable();
  let c = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ t[(c ^ buf[i]) & 0xFF];
  return (c ^ (-1)) >>> 0;
}

// ---------------------------------------------------------------- ZIP 打包

function dosDateTime(d) {
  const date = d || new Date();
  const time = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() / 2) & 0x1F);
  const day = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0x0F) << 5) | (date.getDate() & 0x1F);
  return { time: time, date: day };
}

// files: [{ name: 'xl/workbook.xml', data: Buffer|string }]
function zip(files) {
  const chunks = [];      // 本地文件数据
  const central = [];     // 中央目录
  let offset = 0;
  const dt = dosDateTime();

  files.forEach(function (f) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), 'utf8');
    const comp = zlib.deflateRawSync(raw);
    const crc = crc32(raw);

    // ---- 本地文件头 ----
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);           // version needed
    lh.writeUInt16LE(0x0800, 6);       // flag: UTF-8 文件名
    lh.writeUInt16LE(8, 8);            // method: deflate
    lh.writeUInt16LE(dt.time, 10);
    lh.writeUInt16LE(dt.date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);

    chunks.push(lh, nameBuf, comp);

    // ---- 中央目录项 ----
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);           // version made by
    cd.writeUInt16LE(20, 6);           // version needed
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(dt.time, 12);
    cd.writeUInt16LE(dt.date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);           // extra
    cd.writeUInt16LE(0, 32);           // comment
    cd.writeUInt16LE(0, 34);           // disk start
    cd.writeUInt16LE(0, 36);           // internal attrs
    cd.writeUInt32LE(0, 38);           // external attrs
    cd.writeUInt32LE(offset, 42);      // local header offset
    central.push(cd, nameBuf);

    offset += lh.length + nameBuf.length + comp.length;
  });

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([Buffer.concat(chunks), cdBuf, eocd]);
}

// ---------------------------------------------------------------- XML 工具

function xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');   // XML 不允许的控制字符
}

// 0 -> A, 25 -> Z, 26 -> AA
function colName(idx) {
  let s = '';
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

// Excel 工作表名限制：≤31 字符，不能含 \ / ? * [ ] :
function safeSheetName(name, fallbackIdx) {
  let s = String(name || ('Sheet' + (fallbackIdx + 1))).replace(/[\\\/\?\*\[\]:]/g, '_');
  s = s.slice(0, 31);
  if (!s.trim()) s = 'Sheet' + (fallbackIdx + 1);
  return s;
}

// ---------------------------------------------------------------- XLSX 生成

/**
 * buildXlsx(sheets)
 * sheets: [{ name: '工作表名', rows: [[单元格, 单元格, ...], ...] }]
 * 单元格可以是 string / number / boolean / null
 */
function buildXlsx(sheets) {
  if (!Array.isArray(sheets) || !sheets.length) {
    sheets = [{ name: 'Sheet1', rows: [] }];
  }
  if (sheets.length > 50) sheets = sheets.slice(0, 50);   // 防御：别生成上百个表

  const files = [];
  const sheetXmls = [];
  const usedNames = {};

  // ---- 各工作表 XML ----
  sheets.forEach(function (sh, si) {
    const rows = Array.isArray(sh && sh.rows) ? sh.rows : [];
    let x = '';
    rows.forEach(function (row, ri) {
      const cells = Array.isArray(row) ? row : [row];
      const rowNum = ri + 1;
      let cellsXml = '';
      cells.forEach(function (v, ci) {
        const ref = colName(ci) + rowNum;
        if (v === null || v === undefined || v === '') return;   // 空单元格直接跳过

        if (typeof v === 'number' && isFinite(v)) {
          cellsXml += '<c r="' + ref + '"><v>' + v + '</v></c>';
        } else if (typeof v === 'boolean') {
          cellsXml += '<c r="' + ref + '" t="b"><v>' + (v ? 1 : 0) + '</v></c>';
        } else {
          // 纯数字字符串也当数字，方便 Excel 直接求和
          const s = String(v);
          if (/^-?\d+(\.\d+)?$/.test(s) && s.length < 15) {
            cellsXml += '<c r="' + ref + '"><v>' + s + '</v></c>';
          } else {
            cellsXml += '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(s) + '</t></is></c>';
          }
        }
      });
      if (cellsXml) x += '<row r="' + rowNum + '">' + cellsXml + '</row>';
    });

    const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetData>' + x + '</sheetData></worksheet>';

    files.push({ name: 'xl/worksheets/sheet' + (si + 1) + '.xml', data: sheetXml });

    // 工作表名去重
    let nm = safeSheetName(sh && sh.name, si);
    if (usedNames[nm]) {
      let k = 2;
      while (usedNames[nm + '_' + k]) k++;
      nm = (nm.slice(0, 28) + '_' + k);
    }
    usedNames[nm] = true;
    sheetXmls.push({ name: nm, idx: si + 1 });
  });

  // ---- workbook.xml ----
  let sheetsTag = '';
  sheetXmls.forEach(function (s, i) {
    sheetsTag += '<sheet name="' + xmlEsc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
  });
  files.push({
    name: 'xl/workbook.xml',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + sheetsTag + '</sheets></workbook>'
  });

  // ---- workbook rels ----
  let rels = '';
  sheetXmls.forEach(function (s, i) {
    rels += '<Relationship Id="rId' + (i + 1) + '" ' +
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
      'Target="worksheets/sheet' + s.idx + '.xml"/>';
  });
  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      rels + '</Relationships>'
  });

  // ---- 根 rels ----
  files.push({
    name: '_rels/.rels',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" ' +
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ' +
      'Target="xl/workbook.xml"/></Relationships>'
  });

  // ---- [Content_Types].xml ----
  let overrides = '';
  sheetXmls.forEach(function (s) {
    overrides += '<Override PartName="/xl/worksheets/sheet' + s.idx + '.xml" ' +
      'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
  });
  files.push({
    name: '[Content_Types].xml',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ' +
      'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      overrides + '</Types>'
  });

  return zip(files);
}

module.exports = { buildXlsx, zip, crc32 };
