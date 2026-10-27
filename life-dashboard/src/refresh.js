// One command for the daily routine: re-sync every source that's set up in
// config.json, then rebuild the dashboard. A failing source is reported and its
// previous data kept; the others still sync.
//   npm run refresh
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, SOURCE_FILES, fail } from './lib/config.js';
import { syncAppleHealth } from './sources/apple-health.js';
import { syncCalendar } from './sources/calendar.js';
import { syncRescueTime } from './sources/rescuetime.js';

const config = loadConfig();
if (!config._hasUserConfig) fail('No config.json yet. Copy config.example.json to config.json first (see README).');

const jobs = [];
const exportPath = config.appleHealth.exportPath;
if (exportPath) {
  const xml = fs.existsSync(exportPath) && fs.statSync(exportPath).isDirectory() ? `${exportPath}/export.xml` : exportPath;
  const saved = SOURCE_FILES.appleHealth;
  // Health exports are manual; only re-read when there's a newer one.
  if (fs.existsSync(xml) && fs.existsSync(saved) && fs.statSync(xml).mtimeMs < fs.statSync(saved).mtimeMs) {
    console.log('Apple Health: export unchanged since last sync, skipping. (Export again from the Health app for new days.)');
  } else jobs.push(['Apple Health', () => syncAppleHealth(config)]);
}
if (config.calendar.icsUrl || config.calendar.icsFile) jobs.push(['iCloud Calendar', () => syncCalendar(config)]);
if (config.rescueTime.apiKey || process.env.RESCUETIME_API_KEY) jobs.push(['RescueTime', () => syncRescueTime(config)]);

for (const [name, run] of jobs) {
  console.log(`\n── ${name} ──`);
  try { await run(); } catch (e) { console.error(`✗ ${name}: ${e.message} (kept previous data, if any)`); }
}

console.log('\n── Build ──');
execFileSync(process.execPath, [fileURLToPath(new URL('./build.js', import.meta.url))], { stdio: 'inherit' });
