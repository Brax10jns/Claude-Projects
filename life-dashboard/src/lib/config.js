import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = path.join(ROOT, 'data');
export const DIST_DIR = path.join(ROOT, 'dist');

export const SOURCE_FILES = {
  appleHealth: path.join(DATA_DIR, 'apple-health.json'),
  calendar: path.join(DATA_DIR, 'calendar.json'),
  rescueTime: path.join(DATA_DIR, 'rescuetime.json'),
};

function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base[k] || {}, v) : v;
  }
  return out;
}

// config.json (yours, gitignored) layered over config.example.json (defaults).
export function loadConfig() {
  const defaults = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.example.json'), 'utf8'));
  const userPath = path.join(ROOT, 'config.json');
  if (!fs.existsSync(userPath)) return { ...defaults, _hasUserConfig: false };
  let user;
  try {
    user = JSON.parse(fs.readFileSync(userPath, 'utf8'));
  } catch (err) {
    throw new Error(`config.json is not valid JSON: ${err.message}`);
  }
  return { ...merge(defaults, user), _hasUserConfig: true };
}

export function writeSourceData(source, payload) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SOURCE_FILES[source], JSON.stringify(payload));
}

export function readSourceData(source) {
  const file = SOURCE_FILES[source];
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}
