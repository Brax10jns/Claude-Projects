// Reads your iCloud "Tasks" calendar and saves tasks per day to data/calendar.json.
// Every event in that calendar is a task; it's done when its title contains ✓ or [x].
//   npm run calendar                     (uses calendar.icsUrl or calendar.icsFile from config.json)
//   npm run calendar -- "<webcal link or .ics file>"
import fs from 'node:fs';
import { loadConfig, writeSourceData, fail } from '../lib/config.js';
import { parseICS, expandEvents, isDone, cleanTitle } from '../lib/ics.js';
import { addDays, resolveTimeZone, todayIn } from '../lib/time.js';
import { printTable, isMain } from '../lib/report.js';

async function readCalendar(where) {
  if (/^(webcal|https?):\/\//i.test(where)) {
    const url = where.replace(/^webcal:/i, 'https:');
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': 'life-dashboard' } });
    } catch (err) {
      throw new Error(`Could not reach the calendar link: ${err.cause?.message || err.message}`);
    }
    if (!res.ok) throw new Error(`Calendar link answered ${res.status}. In the Calendar app, check the Tasks calendar is still shared as "Public Calendar" and copy the link again.`);
    return res.text();
  }
  if (!fs.existsSync(where)) throw new Error(`Not found: ${where}`);
  return fs.readFileSync(where, 'utf8');
}

export async function syncCalendar(config, arg) {
  const where = arg || config.calendar.icsUrl || config.calendar.icsFile;
  if (!where) throw new Error('No calendar set. Put your public iCloud link in config.json → calendar.icsUrl (see README, step 2).');
  const text = await readCalendar(where);
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('That link did not return a calendar (.ics). Copy the "Public Calendar" link again.');

  const { calName, events } = parseICS(text);
  const tz = resolveTimeZone(config);
  const today = todayIn(tz);
  const from = addDays(today, -config.historyDays);
  const markers = config.calendar.doneMarkers;
  const occurrences = expandEvents(events, tz, from, today);

  const days = {};
  for (const o of occurrences) {
    (days[o.date] ||= { tasks: [] }).tasks.push({
      title: cleanTitle(o.title, markers) || '(untitled)',
      done: isDone(o.title, markers),
      time: o.time,
    });
  }
  writeSourceData('calendar', { source: 'calendar', fetchedAt: new Date().toISOString(), calName, eventCount: events.length, days });

  const dates = Object.keys(days).sort();
  const all = occurrences.length, done = occurrences.filter((o) => isDone(o.title, markers)).length;
  console.log(`\nCalendar "${calName || 'unnamed'}": ${events.length} events in the feed → ${all} tasks between ${from} and ${today} (${done} marked done).`);
  if (!all) {
    console.log('  No tasks in that range. Add a few events to the Tasks calendar (✓ in the title when done), then run this again.');
  } else {
    console.log(`Days with tasks: ${dates.length}, from ${dates[0]} to ${dates[dates.length - 1]}.`);
    const rows = [];
    for (let i = 13; i >= 0; i--) {
      const date = addDays(today, -i);
      const t = days[date]?.tasks || [];
      rows.push([date, t.length ? `${t.filter((x) => x.done).length}/${t.length}` : '—',
        t.slice(0, 3).map((x) => `${x.done ? '✓' : '·'} ${x.title}`).join('  ') + (t.length > 3 ? ` +${t.length - 3}` : '')]);
    }
    console.log('\nLast 14 days — compare with your Tasks calendar:');
    printTable(['Date', 'Done', 'Tasks'], rows);
  }
  console.log('\n✓ Saved data/calendar.json. Next: npm run build');
}

if (isMain(import.meta.url)) {
  syncCalendar(loadConfig(), process.argv[2]).catch((e) => fail(e.message));
}
