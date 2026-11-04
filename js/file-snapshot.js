// ============================================================================
// js/file-snapshot.js —— 改动快照（改坏能回退）
//
// 为什么要有它：
//   Agent 改文件是"直接覆盖"，改坏了没法回到上一版。尤其"给旧项目换装/重构"这种操作，
//   没有回退机制就不敢让它动。
//
// 存放位置：<工作文件夹>/.ember-backup/<snap-id>/
//   · 每个快照一个目录，里面是原文件的副本 + manifest.json
//   · 只保留最近 N 次（默认 10），避免越滚越大
//   · 超过 8 MB 的文件不备份（省时间/空间），但会记一笔"未备份"
//
// 回退语义：
//   · 原来是"写入/删除/重命名"的 → 用副本覆盖回去
//   · 原来是"新建"的 → 回退就是把它删掉
// ============================================================================
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = '.ember-backup';
const KEEP = 10;
const MAX_BYTES = 8 * 1024 * 1024;

function backupRoot(rootDir) {
  return path.join(String(rootDir), BACKUP_DIR);
}

function prune(rootDir) {
  try {
    const root = backupRoot(rootDir);
    if (!fs.existsSync(root)) return;
    const dirs = fs.readdirSync(root, { withFileTypes: true })
      .filter(function (d) { return d.isDirectory(); })
      .map(function (d) {
        let t = 0;
        try { t = fs.statSync(path.join(root, d.name)).mtimeMs; } catch (e) {}
        return { name: d.name, t: t };
      })
      .sort(function (a, b) { return b.t - a.t; });
    dirs.slice(KEEP).forEach(function (d) {
      try { fs.rmSync(path.join(root, d.name), { recursive: true, force: true }); } catch (e) {}
    });
  } catch (e) {}
}

// items: [{ kind: 'write'|'create'|'delete'|'rename', abs, to? }]
function snapshot(rootDir, items) {
  if (!rootDir) return { ok: false, error: '没有工作文件夹' };
  const list = Array.isArray(items) ? items : [];
  const id = 'snap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const dir = path.join(backupRoot(rootDir), id);
  const entries = [];

  list.forEach(function (it) {
    const abs = it && it.abs;
    if (!abs) return;
    let exists = false, size = 0, isDir = false;
    try {
      if (fs.existsSync(abs)) {
        const st = fs.statSync(abs);
        exists = true; isDir = st.isDirectory(); size = st.size;
      }
    } catch (e) {}

    if (!exists) {
      entries.push({ kind: 'create', abs: abs, existed: false });
      return;
    }
    if (isDir) {
      entries.push({ kind: 'dir', abs: abs, existed: true, note: '目录未备份（只备份文件）' });
      return;
    }
    if (size > MAX_BYTES) {
      entries.push({ kind: 'big', abs: abs, existed: true, size: size, note: '超过 8MB 未备份' });
      return;
    }
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const dst = path.join(dir, entries.length + '-' + path.basename(abs));
      fs.copyFileSync(abs, dst);
      entries.push({
        kind: it.kind || 'write',
        abs: abs,
        backup: dst,
        existed: true,
        size: size,
        to: it.to || ''
      });
    } catch (e) {
      entries.push({ kind: 'failed', abs: abs, existed: true, error: (e && e.message) || String(e) });
    }
  });

  if (!entries.length) return { ok: true, id: '', entries: [] };
  try {
    fs.writeFileSync(path.join(dir, 'manifest.json'),
      JSON.stringify({ id: id, at: Date.now(), entries: entries }, null, 2), 'utf8');
  } catch (e) { return { ok: false, error: '写 manifest 失败：' + ((e && e.message) || e) }; }
  prune(rootDir);
  return { ok: true, id: id, dir: dir, entries: entries };
}

function restore(rootDir, id) {
  if (!rootDir) return { ok: false, error: '没有工作文件夹' };
  if (!id) return { ok: false, error: '没有快照 id' };
  const dir = path.join(backupRoot(rootDir), String(id));
  const mf = path.join(dir, 'manifest.json');
  if (!fs.existsSync(mf)) {
    return { ok: false, error: '这个快照已经过期（只保留最近 ' + KEEP + ' 次）' };
  }
  let man;
  try { man = JSON.parse(fs.readFileSync(mf, 'utf8')); }
  catch (e) { return { ok: false, error: '快照损坏：' + ((e && e.message) || e) }; }

  const restored = [], removed = [], skipped = [], failed = [];
  (man.entries || []).forEach(function (e2) {
    try {
      if (!e2.existed) {
        if (fs.existsSync(e2.abs)) {
          const st = fs.statSync(e2.abs);
          if (st.isDirectory()) fs.rmSync(e2.abs, { recursive: true, force: true });
          else fs.unlinkSync(e2.abs);
          removed.push(e2.abs);
        }
        return;
      }
      if (!e2.backup || !fs.existsSync(e2.backup)) {
        skipped.push({ path: e2.abs, reason: e2.note || '没有备份' });
        return;
      }
      const d = path.dirname(e2.abs);
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      fs.copyFileSync(e2.backup, e2.abs);
      restored.push(e2.abs);
    } catch (err) {
      failed.push({ path: e2.abs, error: (err && err.message) || String(err) });
    }
  });
  return {
    ok: failed.length === 0,
    restored: restored,
    removed: removed,
    skipped: skipped,
    failed: failed
  };
}

function listSnapshots(rootDir) {
  try {
    const root = backupRoot(rootDir);
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(function (d) { return d.isDirectory(); })
      .map(function (d) {
        const p = path.join(root, d.name);
        let at = 0, count = 0;
        try {
          const man = JSON.parse(fs.readFileSync(path.join(p, 'manifest.json'), 'utf8'));
          at = man.at || 0;
          count = (man.entries || []).length;
        } catch (e) {}
        return { id: d.name, at: at, files: count };
      })
      .sort(function (a, b) { return b.at - a.at; });
  } catch (e) { return []; }
}

module.exports = { snapshot, restore, prune, listSnapshots, BACKUP_DIR, KEEP, MAX_BYTES };
