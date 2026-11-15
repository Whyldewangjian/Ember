// ============================================================================
// js/device-info.js —— 设备/串口能力（Ember 自己的，不靠模型拼 shell 命令）
//
// 为什么单独做：
//   靠模型现场拼 PowerShell 去查 USB / 抓串口日志，会踩三个坑：
//     ① 中文输出按 UTF-8 解码 → 乱码（PowerShell 5.1 实际是 GBK）
//     ② 输出超过 12000 字被截断
//     ③ 分两次读时缓冲区被清空 → 中间的输出丢了
//   这三件事都是"机制问题"，不该指望提示词解决。
//
// 能力：
//   listUsb()        枚举 USB 设备（VID/PID/实例ID/描述/接口），纯注册表，不用 WMI
//   listSerial()     列出串口（COM 号 + 设备名）
//   readSerial()     打开串口被动读 N 秒（抓启动日志用，不乱发数据）
//   resetAndRead()   先复位（DTR/RTS 时序）再读 N 秒
//
// 关于编码：所有 PowerShell 调用都在同一条命令里先设 OutputEncoding=UTF8，
// 并且用 -EncodedCommand（Base64/UTF-16LE）传命令，绕开 stdin 的 GBK 问题。
// ============================================================================
const { spawn } = require('child_process');

function psEncoded(script, timeoutMs) {
  return new Promise(function (resolve) {
    const b64 = Buffer.from(String(script), 'utf16le').toString('base64');
    const ps = spawn('powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', b64],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    const t = setTimeout(function () {
      try { ps.kill(); } catch (e) {}
      resolve({ ok: false, error: '超时（' + (timeoutMs || 20000) + 'ms）', output: Buffer.concat(out).toString('utf8') });
    }, timeoutMs || 20000);
    ps.stdout.on('data', function (d) { out.push(d); });
    ps.stderr.on('data', function (d) { err.push(d); });
    ps.on('error', function (e) {
      clearTimeout(t);
      resolve({ ok: false, error: (e && e.message) || String(e), output: '' });
    });
    ps.on('exit', function (code) {
      clearTimeout(t);
      const stdout = Buffer.concat(out).toString('utf8');
      const stderr = Buffer.concat(err).toString('utf8');
      resolve({ ok: code === 0, code: code, output: stdout, stderr: stderr });
    });
  });
}

// 每条脚本都带这一行，保证中文不乱码
const UTF8_PRELUDE = '$ErrorActionPreference="Stop";' +
  '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;' +
  '$OutputEncoding=[System.Text.Encoding]::UTF8;';

// ---------- USB 设备 ----------
async function listUsb() {
  const script = UTF8_PRELUDE + `
$rows = @()
$roots = @('HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\USB',
           'HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\USBSTOR')
foreach ($r in $roots) {
  if (-not (Test-Path $r)) { continue }
  Get-ChildItem $r -ErrorAction SilentlyContinue | ForEach-Object {
    $vidPid = $_.PSChildName
    $parent = $_.PSPath
    # 该设备下的所有实例（"接口"就是带 &MI_xx 的）
    Get-ChildItem $parent -ErrorAction SilentlyContinue | ForEach-Object {
      $inst = $_.PSChildName
      $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      $rows += [pscustomobject]@{
        vidpid   = $vidPid
        instance = $inst
        desc     = [string]$props.DeviceDesc
        friendly = [string]$props.FriendlyName
        svc      = [string]$props.Service
        cls      = [string]$props.Class
      }
    }
  }
}
$rows | ConvertTo-Json -Compress -Depth 4`;
  const r = await psEncoded(script, 25000);
  if (!r.ok) return { ok: false, error: r.error || r.stderr || ('exit ' + r.code) };
  let arr = [];
  try {
    const j = JSON.parse(String(r.output || '[]').trim() || '[]');
    arr = Array.isArray(j) ? j : [j];
  } catch (e) {
    return { ok: false, error: '解析失败：' + String(r.output).slice(0, 200) };
  }
  // 精简：按 vidpid 分组，标出"这个设备有几个接口"
  const devices = arr.map(function (x) {
    const inst = String(x.instance || '');
    const m = inst.match(/&MI_([0-9A-Fa-f]{2})/);
    return {
      vidpid: String(x.vidpid || ''),
      instance: inst,
      interface: m ? m[1] : '',         // 空 = 主设备；有值 = 复合接口
      desc: String(x.desc || ''),
      friendly: String(x.friendly || ''),
      service: String(x.svc || ''),
      cls: String(x.cls || '')
    };
  }).filter(function (d) { return d.vidpid || d.desc; });

  // 汇总
  const byVidPid = {};
  devices.forEach(function (d) {
    if (!byVidPid[d.vidpid]) byVidPid[d.vidpid] = { vidpid: d.vidpid, desc: d.desc || d.friendly, ifaces: [], serial: '' };
    const g = byVidPid[d.vidpid];
    if (d.interface) g.ifaces.push(d.interface);
    if (d.service) g.service = d.service;
    const sn = d.instance.split('\\').pop();
    if (sn && /^[0-9A-Fa-f:]{12,}$/.test(sn.replace(/&MI_\w+/, ''))) g.serial = sn;
  });
  return {
    ok: true,
    total: devices.length,
    groups: Object.keys(byVidPid).map(function (k) { return byVidPid[k]; }),
    devices: devices
  };
}

// ---------- 串口 ----------
async function listSerial() {
  const script = UTF8_PRELUDE + `
$out = @()
$sc = 'HKLM:\\HARDWARE\\DEVICEMAP\\SERIALCOMM'
if (Test-Path $sc) {
  $p = Get-ItemProperty $sc
  $p.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
    $out += [pscustomobject]@{ device = $_.Name; port = [string]$_.Value }
  }
}
$out | ConvertTo-Json -Compress -Depth 3`;
  const r = await psEncoded(script, 15000);
  if (!r.ok) return { ok: false, error: r.error || r.stderr || ('exit ' + r.code) };
  let arr = [];
  try {
    const j = JSON.parse(String(r.output || '[]').trim() || '[]');
    arr = Array.isArray(j) ? j : [j];
  } catch (e) { arr = []; }
  return { ok: true, ports: arr };
}

// ---------- 串口读取（被动 / 复位后）----------
// ms：读多久；baud：默认 115200；reset：是否用 DTR/RTS 拉低复位
async function readSerial(port, ms, baud, reset) {
  const p = String(port || "").replace(/[^A-Za-z0-9]/g, "");
  const dur = Math.max(500, Math.min(60000, Number(ms) || 5000));
  const rate = Number(baud) || 115200;
  if (!p) return { ok: false, error: "端口号为空" };
  const resetBlock = reset
    ? [
        "  $port.DtrEnable = $true",
        "  $port.RtsEnable = $true",
        "  Start-Sleep -Milliseconds 120",
        "  $port.RtsEnable = $false",
        "  Start-Sleep -Milliseconds 120",
        "  $port.DtrEnable = $false"
      ].join("\n")
    : "";
  const lines = [
    UTF8_PRELUDE,
    "$port = New-Object System.IO.Ports.SerialPort -ArgumentList @('" + p + "', " + rate + ", [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)",
    "$port.ReadTimeout = 200",
    "try { $port.Open() } catch { Write-Output (\"OPEN_FAIL:\" + $_.Exception.Message); exit 1 }",
    resetBlock,
    "$sb = New-Object System.Text.StringBuilder",
    "$deadline = (Get-Date).AddMilliseconds(" + dur + ")",
    "while ((Get-Date) -lt $deadline) {",
    "  try { $s = $port.ReadExisting(); if ($s -and $s.Length -gt 0) { [void]$sb.Append($s) } } catch { }",
    "  Start-Sleep -Milliseconds 50",
    "}",
    "try { $port.Close() } catch { }",
    "$text = $sb.ToString()",
    "Write-Output (\"---META--- bytes=\" + $text.Length + \" ms=" + dur + " baud=" + rate + " reset=" + (reset ? "yes" : "no") + "\")",
    "Write-Output $text"
  ];
  const r = await psEncoded(lines.filter(Boolean).join("\n"), dur + 15000);
  if (!r.ok) return { ok: false, error: r.error || r.stderr || ("exit " + r.code) };
  const out = String(r.output || "");
  const meta = out.match(/---META---[^\n]*/);
  const body = out.replace(/---META---[^\n]*\n?/, "");
  if (/OPEN_FAIL:/.test(body.slice(0, 300))) {
    return { ok: false, error: body.split("\n")[0] };
  }
  return {
    ok: true,
    port: p,
    bytes: body.length,
    meta: meta ? meta[0] : "",
    text: body,
    hints: extractHints(body)
  };
}

function extractHints(text) {
  const t = String(text || '');
  const grab = function (re) {
    const m = t.match(re);
    return m ? m[1].trim() : '';
  };
  return {
    rom: grab(/ESP-ROM:(\S+)/),
    chipRev: grab(/Chip rev:\s*(v[\d.]+)/),
    idf: grab(/ESP-IDF:\s*(\S+)/),
    project: grab(/Project name:\s*(\S+)/),
    appVersion: grab(/App version:\s*(\S+)/),
    compileTime: grab(/Compile time:\s*([^\r\n]+)/),
    board: grab(/Board:\s*UUID=([0-9a-f-]+)/),
    sku: grab(/SKU=([\w-]+)/),
    hostname: grab(/DHCP hostname:\s*(\S+)/),
    ip: grab(/sta ip:\s*([\d.]+)/),
    mac: grab(/sta \(([0-9a-f:]{17})\)/),
    flash: grab(/spi_flash: detected chip:\s*(\S+)/),
    sramFree: grab(/free sram:\s*(\d+)/)
  };
}

module.exports = { listUsb, listSerial, readSerial, extractHints };
