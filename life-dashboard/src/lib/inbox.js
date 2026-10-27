// Finds a new Apple Health export (export*.zip) in the folders you're likely to
// save it to from your iPhone, and unzips it to a temporary folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function inboxFolders(config) {
  const dirs = [path.join(os.homedir(), 'Downloads')];
  if (process.env.OneDrive) dirs.push(process.env.OneDrive, path.join(process.env.OneDrive, 'Downloads'));
  dirs.push(...(config.appleHealth.inboxFolders || []));
  return [...new Set(dirs)].filter((d) => fs.existsSync(d));
}

export function newestExportZip(config) {
  let best = null;
  for (const dir of inboxFolders(config)) {
    for (const name of fs.readdirSync(dir)) {
      if (!/^export.*\.zip$/i.test(name)) continue;
      const file = path.join(dir, name);
      const mtime = fs.statSync(file).mtimeMs;
      if (!best || mtime > best.mtime) best = { file, mtime };
    }
  }
  return best;
}

function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return p;
    if (entry.isDirectory()) { const hit = findFile(p, name); if (hit) return hit; }
  }
  return null;
}

// Unzips with the system's tar (built into Windows 10+ and macOS) or unzip.
// Returns { xml, cleanup }.
export function extractExport(zip) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'life-dashboard-health-'));
  const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true });
  let r = spawnSync('tar', ['-xf', zip, '-C', tmp], { stdio: 'ignore' });
  if (r.status !== 0) r = spawnSync('unzip', ['-q', '-o', zip, '-d', tmp], { stdio: 'ignore' });
  const xml = r.status === 0 ? findFile(tmp, 'export.xml') : null;
  if (!xml) { cleanup(); throw new Error(`Could not unzip ${zip}. Extract it yourself and run "Connect Apple Health.cmd" on the folder.`); }
  return { xml, cleanup };
}
