// Pulls daily time by productivity level from RescueTime into data/rescuetime.json.
//   npm run rescuetime        (key from config.json → rescueTime.apiKey or RESCUETIME_API_KEY)
import { loadConfig, writeSourceData, fail, SOURCE_FILES } from '../lib/config.js';
import { addDays, resolveTimeZone, todayIn } from '../lib/time.js';
import { printTable, isMain } from '../lib/report.js';

const LEVEL = { 2: 'vp', 1: 'p', 0: 'n', '-1': 'd', '-2': 'vd' };

async function getJson(endpoint, params) {
  const url = new URL(`https://www.rescuetime.com/anapi/${endpoint}`);
  url.search = new URLSearchParams({ format: 'json', ...params });
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
  return json;
}

// The website shows time but the daily query came back empty: try other
// shapes of the same request and report what each returns (no key printed).
async function diagnose(key, from, today) {
  console.log('\nNo days came back. Checking what RescueTime returns for other requests:');
  const probes = [
    ['Activities, last 90 days', 'data', { key, perspective: 'rank', restrict_kind: 'overview', restrict_begin: from, restrict_end: today }],
    ['Productivity by hour, today', 'data', { key, perspective: 'interval', resolution_time: 'hour', restrict_kind: 'productivity', restrict_begin: today, restrict_end: today }],
    ['Productivity by day, no date range', 'data', { key, perspective: 'interval', resolution_time: 'day', restrict_kind: 'productivity' }],
    ['Legacy parameter names', 'data', { key, pv: 'interval', rs: 'day', rk: 'productivity', rb: from, re: today }],
    ['Daily summary feed', 'daily_summary_feed', { key }],
  ];
  for (const [label, endpoint, params] of probes) {
    try {
      const j = await getJson(endpoint, params);
      if (Array.isArray(j)) {
        const latest = j[0];
        console.log(`  • ${label}: ${j.length} days${latest ? `, newest ${latest.date} with ${latest.total_hours} h` : ''}`);
      } else {
        const rows = j.rows || [];
        const sample = rows[0] ? ` e.g. [${rows[0].join(', ')}]` : '';
        console.log(`  • ${label}: ${rows.length} rows${sample}${j.notes ? ` (note: ${String(j.notes).slice(0, 120)})` : ''}`);
      }
    } catch (e) {
      console.log(`  • ${label}: ${e.message}`);
    }
  }
  console.log('\nPlease paste these lines to Claude.');
}

export async function syncRescueTime(config) {
  const key = process.env.RESCUETIME_API_KEY || config.rescueTime.apiKey;
  if (!key) throw new Error('No RescueTime key. Create one at https://www.rescuetime.com/anapi/manage then double-click "Connect RescueTime.cmd" and paste it (see README, step 3).');
  const tz = resolveTimeZone(config);
  const today = todayIn(tz);
  const from = addDays(today, -config.historyDays);

  const json = await getJson('data', {
    key, perspective: 'interval', resolution_time: 'day',
    restrict_kind: 'productivity', restrict_begin: from, restrict_end: today,
  });

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
  const hrs = (s) => { const m = Math.round(s / 60); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
  const rows = [];
  for (let i = 13; i >= 0; i--) {
    const date = addDays(today, -i);
    const d = days[date];
    rows.push(d ? [date, hrs(d.totalSec), hrs(d.vp + d.p), hrs(d.n), hrs(d.d + d.vd)] : [date, '—', '—', '—', '—']);
  }
  console.log('\nLast 14 days — compare with your RescueTime dashboard:');
  printTable(['Date', 'Total', 'Productive', 'Neutral', 'Distracting'], rows);
  console.log(`
✓ Saved ${SOURCE_FILES.rescueTime}`);
  if (!dates.length) await diagnose(key, from, today);
}

if (isMain(import.meta.url)) {
  syncRescueTime(loadConfig()).catch((e) => fail(e.message));
}
