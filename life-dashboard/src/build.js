// Scores every day and bakes the result into one self-contained HTML file:
//   ~/LifeDashboard/life-dashboard.html (see src/lib/config.js)
// Connected sources (a file in data/) are real; the rest get DEMO data, which is
// kept in separate, labeled series and never counted in a real Life Score.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, readSourceData, ROOT, DIST_DIR, fail } from './lib/config.js';
import { addDays, resolveTimeZone, todayIn } from './lib/time.js';
import { isMain } from './lib/report.js';
import { PILLARS, PILLAR_SOURCE, computePillarSeries, computeLife } from './scores.js';
import { demoAppleHealth, demoRescueTime, demoCalendar } from './demo.js';
import { iconDataUri } from './icon.js';

const SOURCES = {
  appleHealth: { label: 'Apple Health', demo: demoAppleHealth },
  rescueTime: { label: 'RescueTime', demo: demoRescueTime },
  calendar: { label: 'iCloud Calendar', demo: demoCalendar },
};

export function buildPayload(config, { today, tz, read = readSourceData } = {}) {
  const dates = [];
  for (let i = config.historyDays - 1; i >= 0; i--) dates.push(addDays(today, -i));

  const sources = {}, inputs = {};
  for (const [id, def] of Object.entries(SOURCES)) {
    const data = read(id);
    const real = Boolean(data);
    inputs[id] = real ? data : def.demo(dates);
    const dataDates = Object.keys(inputs[id].days).filter((d) => d <= today).sort();
    sources[id] = {
      label: def.label,
      mode: real ? 'real' : 'demo',
      fetchedAt: real ? data.fetchedAt : null,
      latestDate: real ? dataDates[dataDates.length - 1] || null : null,
      note: real && id === 'appleHealth' && data.exportDate ? `Export from ${data.exportDate.slice(0, 10)}` :
        real && id === 'calendar' && data.calName ? `Calendar "${data.calName}"` : null,
    };
  }

  const pillars = {};
  for (const p of PILLARS) {
    const src = PILLAR_SOURCE[p];
    pillars[p] = { mode: sources[src].mode, source: src, days: computePillarSeries(p, inputs[src], dates, config) };
  }

  // Activity keeps adding up after the export was taken, so the export's own day
  // is "so far": shown, but kept out of the Life Score until a later export.
  const exportedAt = sources.appleHealth.mode === 'real' && inputs.appleHealth.exportDate;
  if (exportedAt) {
    const day = exportedAt.slice(0, 10), time = exportedAt.slice(11, 16);
    const t = pillars.training.days[day];
    if (t) Object.assign(t, { partial: true, partialAt: time });
  }

  // Real pillars only, unless nothing is connected: then a DEMO Life Score from demo pillars only.
  const realOnes = PILLARS.filter((p) => pillars[p].mode === 'real');
  const lifeMode = realOnes.length ? 'real' : 'demo';
  const lifeSet = Object.fromEntries(PILLARS.filter((p) => pillars[p].mode === lifeMode).map((p) => [p, pillars[p].days]));
  const life = { mode: lifeMode, pillars: Object.keys(lifeSet), days: computeLife(lifeSet, dates, config.weights) };

  return {
    generatedAt: new Date().toISOString(),
    today, tz, dates,
    goals: config.goals,
    weights: config.weights,
    sources, pillars, life,
  };
}

export function bake(payload) {
  const template = fs.readFileSync(path.join(ROOT, 'src', 'template.html'), 'utf8');
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return template.replace('"__LIFE_DATA__"', () => json).replace(/__ICON__/g, () => iconDataUri());
}

if (isMain(import.meta.url)) {
  try {
    const config = loadConfig();
    const tz = resolveTimeZone(config);
    const payload = buildPayload(config, { today: todayIn(tz), tz });
    fs.mkdirSync(DIST_DIR, { recursive: true });
    const out = path.join(DIST_DIR, 'life-dashboard.html');
    fs.writeFileSync(out, bake(payload));

    console.log(`\nBuilt ${out}`);
    for (const s of Object.values(payload.sources)) {
      console.log(`  ${s.mode === 'real' ? '● real' : '○ DEMO'}  ${s.label}${s.latestDate ? ` (latest day ${s.latestDate})` : ''}`);
    }
    const t = payload.life.days[payload.today];
    console.log(`\nToday's Life Score: ${t ? t.score : 'no data'}${payload.life.mode === 'demo' ? ' (DEMO preview — nothing connected yet)' : t ? ` from ${t.used.join(', ')}` : ''}`);
    const last = [...payload.dates].reverse().find((d) => d < payload.today && payload.life.days[d]);
    if (payload.life.mode === 'real' && last) console.log(`Latest full day: ${last} → ${payload.life.days[last].score} from ${payload.life.days[last].used.join(', ')}`);
    console.log('Open the file in your browser, or run "npm run serve" to open it on your phone.\n');
  } catch (e) {
    fail(e.message);
  }
}
