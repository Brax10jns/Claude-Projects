import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The code can be re-downloaded or updated any time; your settings, data and the
// built dashboard live in a separate folder that updates never touch:
//   Windows: C:\Users\<you>\LifeDashboard    Mac/Linux: ~/LifeDashboard
// Set LIFE_DASHBOARD_HOME to use another folder.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const HOME = process.env.LIFE_DASHBOARD_HOME || path.join(os.homedir(), 'LifeDashboard');
export const CONFIG_FILE = path.join(HOME, 'config.json');
export const DATA_DIR = path.join(HOME, 'data');
export const DIST_DIR = HOME;

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

const readDefaults = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'config.example.json'), 'utf8'));

// Your config.json layered over config.example.json (defaults). Created on first run.
export function loadConfig() {
  const defaults = readDefaults();
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.mkdirSync(HOME, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'config.example.json'), CONFIG_FILE);
    console.log(`Created your settings file: ${CONFIG_FILE}`);
  }
  let user;
  try {
    user = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (err) {
    throw new Error(`${CONFIG_FILE} is not valid JSON: ${err.message}`);
  }
  return merge(defaults, user);
}

// Change one setting (e.g. "calendar.icsUrl") and keep everything else as is.
export function setConfigValue(keyPath, value) {
  loadConfig();
  const user = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const keys = keyPath.split('.');
  let obj = user;
  for (const k of keys.slice(0, -1)) obj = obj[k] && typeof obj[k] === 'object' ? obj[k] : (obj[k] = {});
  obj[keys[keys.length - 1]] = value;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(user, null, 2) + '\n');
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
