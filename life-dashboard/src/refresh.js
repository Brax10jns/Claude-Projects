// One command for the daily routine: re-sync every source that's set up, then
// rebuild the dashboard. A failing source is reported and its previous data
// kept; the others still sync. A new Apple Health export*.zip in Downloads or
// OneDrive is picked up automatically.
//   npm run refresh            (add --log to also append to LifeDashboard/update.log)
import fs from 'node:fs';
import path from 'node:path';
import { format } from 'node:util';
import { loadConfig, readSourceData, HOME } from './lib/config.js';
import { newestExportZip, extractExport } from './lib/inbox.js';
import { syncAppleHealth } from './sources/apple-health.js';
import { syncCalendar } from './sources/calendar.js';
import { syncRescueTime } from './sources/rescuetime.js';
import { runBuild } from './build.js';

if (process.argv.includes('--log')) {
  fs.mkdirSync(HOME, { recursive: true });
  const logFile = path.join(HOME, 'update.log');
  // Keep the log small: start fresh once it passes ~200 KB.
  if (fs.existsSync(logFile) && fs.statSync(logFile).size > 200_000) fs.rmSync(logFile);
  const write = (args) => fs.appendFileSync(logFile, format(...args) + '\n');
  for (const level of ['log', 'error']) {
    const orig = console[level];
    console[level] = (...args) => { orig(...args); write(args); };
  }
  console.log(`\n===== ${new Date().toLocaleString()} =====`);
}

const config = loadConfig();
let failed = false;
const run = async (name, fn) => {
  console.log(`\n── ${name} ──`);
  try { await fn(); } catch (e) { failed = true; console.error(`✗ ${name}: ${e.message} (kept previous data, if any)`); }
};

// Apple Health: a fixed export path from config, or the newest export*.zip
// that arrived after the last import.
const saved = readSourceData('appleHealth');
const lastImport = saved ? Date.parse(saved.fetchedAt) : 0;
if (config.appleHealth.exportPath) {
  await run('Apple Health', () => syncAppleHealth(config));
} else {
  const zip = newestExportZip(config);
  if (zip && zip.mtime > lastImport) {
    await run('Apple Health', async () => {
      console.log(`New export found: ${zip.file}`);
      const { xml, cleanup } = extractExport(zip.file);
      try { await syncAppleHealth(config, xml); } finally { cleanup(); }
    });
  } else {
    console.log(`\n── Apple Health ──\nNo new export since ${saved ? saved.fetchedAt.slice(0, 10) : 'never'}. Export from the Health app into Downloads (or OneDrive) to add new days.`);
  }
}
if (config.calendar.icsUrl || config.calendar.icsFile) await run('iCloud Calendar', () => syncCalendar(config));
if (config.rescueTime.apiKey || process.env.RESCUETIME_API_KEY) await run('RescueTime', () => syncRescueTime(config));

await run('Build', () => runBuild());
process.exitCode = failed ? 1 : 0;
