// Reads an Apple Health export and saves a daily summary to data/apple-health.json.
//   npm run health -- "C:\Users\you\Downloads\apple_health_export\export.xml"
// (or set appleHealth.exportPath in config.json). Prints a check table to compare
// against the Health app before you build.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, writeSourceData, fail } from '../lib/config.js';
import { parseHealthExport, HEALTH_TYPES } from '../lib/health.js';
import { addDays, resolveTimeZone, todayIn } from '../lib/time.js';
import { printTable, isMain } from '../lib/report.js';

export async function syncAppleHealth(config, argPath) {
  let file = argPath || config.appleHealth.exportPath;
  if (!file) throw new Error('No export given. Run: npm run health -- "<path to export.xml>"  (see README, step 1)');
  file = path.resolve(file);
  if (!fs.existsSync(file)) throw new Error(`Not found: ${file}`);
  if (fs.statSync(file).isDirectory()) file = path.join(file, 'export.xml');
  if (file.toLowerCase().endsWith('.zip')) throw new Error('That is the .zip. Right-click it → Extract All, then point at apple_health_export\\export.xml');
  if (!fs.existsSync(file)) throw new Error(`No export.xml in that folder: ${path.dirname(file)}`);

  const tz = resolveTimeZone(config);
  const today = todayIn(tz);
  const since = addDays(today, -(config.historyDays + 31)); // +31 for the recovery baseline
  const sizeMb = Math.round(fs.statSync(file).size / 1048576);
  console.log(`Reading ${file} (${sizeMb} MB)… large exports take a minute or two.`);
  const t0 = Date.now();
  const parsed = await parseHealthExport(file, { since, until: today });
  console.log(`Parsed ${parsed.lines.toLocaleString()} lines in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);

  const dates = Object.keys(parsed.days);
  if (!dates.length) throw new Error(`The export has no sleep, heart or activity records since ${since}. Is it a recent export?`);

  writeSourceData('appleHealth', {
    source: 'appleHealth',
    fetchedAt: new Date().toISOString(),
    exportDate: parsed.exportDate,
    exportFile: path.basename(path.dirname(file)) + '/' + path.basename(file),
    hasExerciseRing: parsed.hasExerciseRing,
    days: parsed.days,
  });
  report(parsed, today, config);
}

function report(parsed, today, config) {
  const days = parsed.days;
  const dates = Object.keys(days);
  const count = (fn) => dates.filter((d) => fn(days[d])).length;
  console.log(`\nApple Health export dated ${parsed.exportDate || '(unknown)'}; data from ${dates[0]} to ${dates[dates.length - 1]}.`);
  console.log(`Days with: sleep ${count((d) => d.sleep)} · HRV ${count((d) => d.hrv != null)} · resting HR ${count((d) => d.rhr != null)} · steps ${count((d) => d.steps != null)} · exercise ${count((d) => d.exerciseMin != null)} · workouts ${count((d) => d.workouts)}`);

  const rows = [];
  for (let i = 13; i >= 0; i--) {
    const date = addDays(today, -i);
    const d = days[date] || {};
    const s = d.sleep;
    rows.push([
      date,
      s ? `${((s.asleepMin ?? s.inBedMin) / 60).toFixed(1)}h${s.asleepMin == null ? ' (in bed)' : ''}` : '—',
      s ? `${s.bedtime}→${s.wake}` : '—',
      d.hrv ?? '—', d.rhr ?? '—',
      d.steps?.toLocaleString() ?? '—', d.exerciseMin ?? '—',
      (d.workouts || []).map((w) => `${w.type} ${w.minutes}m`).join(', ') || '—',
    ]);
  }
  console.log('\nLast 14 days — compare a few rows with the Health app:');
  printTable(['Date', 'Sleep', 'Bed→Wake', 'HRV ms', 'RHR', 'Steps', 'Exercise', 'Workouts'], rows);

  const warn = [];
  const nights = dates.filter((d) => days[d].sleep);
  const si = parsed.sleepInfo;
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k.replace('HKCategoryValueSleepAnalysis', '')} ×${n}`).join(', ');
  if (!parsed.typesSeen[HEALTH_TYPES.sleep]) {
    warn.push('No sleep records anywhere in this export, so Sleep shows "no data". To track sleep with an Apple Watch: Health app → Browse → Sleep → Get Started (or Full Schedule & Options), turn on "Track Sleep with Apple Watch", and wear the Watch to bed.');
  } else if (!nights.length) {
    warn.push(`The export has ${parsed.typesSeen[HEALTH_TYPES.sleep]} sleep records, but none in the last ${config.historyDays} days (newest night: ${si.newest}). Sleep shows "no data" until new nights are recorded.`);
    warn.push(`  Sleep records by source: ${top(si.sources)}. By type: ${top(si.values)}.`);
  } else if (!nights.some((d) => days[d].sleep.hasStages)) {
    warn.push(`Sleep found on ${nights.length} nights, but without stages (deep/REM). Sleep score uses hours only.`);
  }
  if (!parsed.typesSeen[HEALTH_TYPES.hrv]) warn.push('No HRV records. Recovery uses resting heart rate only (or shows "no data" without it).');
  if (!parsed.hasExerciseRing) warn.push('No Apple Watch exercise minutes. Training uses logged workouts + steps.');
  const lastData = dates[dates.length - 1];
  if (lastData < addDays(today, -2)) warn.push(`Newest data is ${lastData}. Export again from the Health app to get recent days.`);
  if (warn.length) console.log('\nNotes:\n' + warn.map((w) => `  • ${w}`).join('\n'));
  console.log('\n✓ Saved data/apple-health.json. Next: npm run build');
}

if (isMain(import.meta.url)) {
  syncAppleHealth(loadConfig(), process.argv[2]).catch((e) => fail(e.message));
}
