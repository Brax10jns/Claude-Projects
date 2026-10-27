// Pulls daily time by productivity level from RescueTime into data/rescuetime.json.
//   npm run rescuetime        (key from config.json → rescueTime.apiKey or RESCUETIME_API_KEY)
import { loadConfig, writeSourceData, fail } from '../lib/config.js';
import { addDays, resolveTimeZone, todayIn } from '../lib/time.js';
import { printTable, isMain } from '../lib/report.js';

const LEVEL = { 2: 'vp', 1: 'p', 0: 'n', '-1': 'd', '-2': 'vd' };

export async function syncRescueTime(config) {
  const key = process.env.RESCUETIME_API_KEY || config.rescueTime.apiKey;
  if (!key) throw new Error('No RescueTime key. Create one at https://www.rescuetime.com/anapi/manage and put it in config.json → rescueTime.apiKey (see README, step 3).');
  const tz = resolveTimeZone(config);
  const today = todayIn(tz);
  const from = addDays(today, -config.historyDays);

  const url = new URL('https://www.rescuetime.com/anapi/data');
  url.search = new URLSearchParams({
    key, format: 'json', perspective: 'interval', resolution_time: 'day',
    restrict_kind: 'productivity', restrict_begin: from, restrict_end: today,
  });
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Could not reach RescueTime: ${err.cause?.message || err.message}`);
  }
  const body = await res.text();
  let json;
  try { json = JSON.parse(body); } catch { throw new Error(`RescueTime answered ${res.status} with something that isn't JSON: ${body.slice(0, 200)}`); }
  if (json.error || !res.ok) throw new Error(`RescueTime: ${json.messages || json.error || res.status}. Check the API key.`);

  const h = json.row_headers || [];
  const iDate = h.indexOf('Date'), iSec = h.findIndex((x) => /time spent/i.test(x)), iProd = h.indexOf('Productivity');
  if (iDate < 0 || iSec < 0 || iProd < 0) throw new Error(`Unexpected RescueTime columns: ${h.join(', ')}`);

  const days = {};
  for (const row of json.rows || []) {
    const date = String(row[iDate]).slice(0, 10);
    const d = (days[date] ||= { vp: 0, p: 0, n: 0, d: 0, vd: 0, totalSec: 0 });
    const level = LEVEL[String(row[iProd])];
    if (!level) continue;
    d[level] += row[iSec];
    d.totalSec += row[iSec];
  }
  writeSourceData('rescueTime', { source: 'rescueTime', fetchedAt: new Date().toISOString(), days });

  const dates = Object.keys(days).sort();
  console.log(`\nRescueTime: ${dates.length} days with tracked time between ${from} and ${today}.`);
  if (!dates.length) console.log('  Nothing tracked yet. Make sure RescueTime is running on your laptop, then try again tomorrow.');
  const hrs = (s) => (s / 3600).toFixed(1);
  const rows = [];
  for (let i = 13; i >= 0; i--) {
    const date = addDays(today, -i);
    const d = days[date];
    rows.push(d ? [date, hrs(d.totalSec), hrs(d.vp + d.p), hrs(d.n), hrs(d.d + d.vd)] : [date, '—', '—', '—', '—']);
  }
  console.log('\nLast 14 days (hours) — compare with your RescueTime dashboard:');
  printTable(['Date', 'Total', 'Productive', 'Neutral', 'Distracting'], rows);
  console.log('\n✓ Saved data/rescuetime.json. Next: npm run build');
}

if (isMain(import.meta.url)) {
  syncRescueTime(loadConfig()).catch((e) => fail(e.message));
}
