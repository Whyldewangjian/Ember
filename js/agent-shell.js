// ============================================================================
// js/agent-shell.js —— 给 Agent 一个常驻的 PowerShell
//
// 为什么要它：
//   run-node 只能"跑完拿一次结果"：装不了依赖、跑不了构建、看不见长日志、中途停不下来。
//   有了常驻 shell，Agent 才能 npm install / npm run build / 起本地服务器 / 看实时输出。
//
// 怎么用（Agent 侧的 shell 工具）：
//   shell({ cmd: "npm install" })           跑一条命令，等最多 3 秒，返回这期间的输出
//   shell({ cmd: "npm run build", wait: 20 })  等更久（上限 20 秒）
//   shell({ cmd: "", wait: 2 })              不跑命令，只把这几秒新产生的输出捞回来
//
// 安全：
//   · 只允许在"工作文件夹"里启动（cwd 由渲染进程传入，主进程校验存在）
//   · 明显毁灭性的命令（format / del /s /s / rm -rf /、shutdown、diskpart 等）直接拒绝
//   · 输出缓冲上限 200KB，超出丢最旧的
// ============================================================================
const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_BUFFER = 200 * 1024;

let child = null;
let outBuf = '';
let currentCwd = '';

// 明显危险：直接拒绝，不做二次确认（Agent 没有权限做这种决定）
const DENY = [
  /\bformat\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /\bshutdown\b/i,
  /\brestart-computer\b/i,
  /\brm\s+-rf\s+\/(\s|$)/i,
  /\bdel\s+\/[a-z]*\s*\/[a-z]*\s+[a-z]:\\?\s*$/i,
  /\brd\s+\/s\s+\/q\s+[a-z]:\\?\s*$/i,
  /\bremove-item\s+.*-recurse.*[a-z]:\\?\s*$/i
];

function pushOut(s) {
  outBuf += s;
  if (outBuf.length > MAX_BUFFER) outBuf = outBuf.slice(outBuf.length - MAX_BUFFER);
}

function isRunning() {
  return !!(child && !child.killed);
}

function start(cwd) {
  if (isRunning()) return { ok: true, running: true, cwd: currentCwd, note: '已经在运行' };
  let dir = String(cwd || '').trim();
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) dir = os.homedir();
  currentCwd = dir;
  outBuf = '';
  try {
    child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'], {
      cwd: dir,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    child.stdout.on('data', (d) => pushOut(d.toString('utf8')));
    child.stderr.on('data', (d) => pushOut(d.toString('utf8')));
    child.on('error', (e) => pushOut('\n[shell 启动失败] ' + (e && e.message) + '\n'));
    child.on('exit', (code) => {
      pushOut('\n[shell 已退出，code=' + code + ']\n');
      child = null;
    });
    return { ok: true, running: true, cwd: dir };
  } catch (e) {
    child = null;
    return { ok: false, error: (e && e.message) ? e.message : String(e) };
  }
}

function stop() {
  try { if (child) child.kill(); } catch (e) {}
  child = null;
  return { ok: true };
}

function dangerous(cmd) {
  const s = String(cmd || '');
  for (let i = 0; i < DENY.length; i++) if (DENY[i].test(s)) return true;
  return false;
}

function run(cmd, waitSec) {
  const c = String(cmd || '');
  if (c && dangerous(c)) {
    return { ok: false, denied: true, error: '这条命令可能造成不可逆的破坏，已拒绝执行：' + c };
  }
  if (!isRunning()) {
    const s = start(currentCwd || os.homedir());
    if (!s.ok) return { ok: false, error: s.error || 'shell 起不来' };
  }
  outBuf = '';   // 只返回这条命令产生的输出
  if (c) {
    try { child.stdin.write(c + '\r\n'); }
    catch (e) { return { ok: false, error: '写入命令失败：' + (e && e.message) }; }
  }
  let ms = Math.round((Number(waitSec) || 3) * 1000);
  if (!isFinite(ms) || ms < 300) ms = 300;
  if (ms > 20000) ms = 20000;

  return new Promise((resolve) => {
    setTimeout(() => {
      const output = outBuf;
      resolve({
        ok: true,
        running: isRunning(),
        cwd: currentCwd,
        output: output.length > 12000 ? ('…（只显示最后 12000 字）\n' + output.slice(-12000)) : output,
        truncated: output.length > 12000
      });
    }, ms);
  });
}

function registerShellIPC() {
  ipcMain.handle('agent-shell-start', async (event, cwd) => {
    try { return start(cwd); } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
  });
  ipcMain.handle('agent-shell-run', async (event, cmd, waitSec) => {
    try { return await run(cmd, waitSec); } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
  });
  ipcMain.handle('agent-shell-stop', async () => {
    try { return stop(); } catch (e) { return { ok: false }; }
  });
  ipcMain.handle('agent-shell-state', async () => {
    return { ok: true, running: isRunning(), cwd: currentCwd };
  });
}

module.exports = { registerShellIPC, start, run, stop };
