import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseHealthExport } from '../src/lib/health.js';
import { parseICS, expandEvents, isDone, cleanTitle } from '../src/lib/ics.js';

const fixture = (f) => fileURLToPath(new URL(`./fixtures/${f}`, import.meta.url));

test('Apple Health export is reduced to daily summaries', async () => {
  const { days, exportDate, hasExerciseRing } = await parseHealthExport(fixture('export.xml'), { since: '2026-10-01', until: '2026-10-27' });
  assert.equal(exportDate, '2026-10-27 08:00:00 -0700');
  assert.ok(hasExerciseRing);
  const d = days['2026-10-26'];
  assert.equal(d.steps, 6000, 'takes the source with the most steps, does not add iPhone + Watch');
  assert.equal(d.exerciseMin, 30);
  assert.equal(d.activeKcal, 100, 'kJ converted to kcal');
  assert.equal(d.hrv, 50);
  assert.equal(d.rhr, 52);
  assert.deepEqual(d.workouts, [{ date: '2026-10-26', time: '07:00', type: 'Running', minutes: 33, kcal: 310, source: "Sam's Apple Watch" }]);
  assert.equal(days['2025-01-01'], undefined, 'outside the window is dropped');

  const s = days['2026-10-27'].sleep;
  assert.equal(s.source, "Sam's Apple Watch", 'prefers the source with sleep stages over in-bed only');
  assert.equal(s.asleepMin, 450);
  assert.equal(s.deepMin, 60);
  assert.equal(s.remMin, 120);
  assert.equal(s.awakeMin, 15);
  assert.equal(s.bedtime, '23:00');
  assert.equal(s.wake, '06:45');
  assert.equal(days['2026-10-26'].sleep, undefined, 'the night counts toward the wake-up day');
});

test('calendar tasks: time zones, recurrence, exceptions, overrides, cancellations', () => {
  const { calName, events } = parseICS(fs.readFileSync(fixture('tasks.ics'), 'utf8'));
  assert.equal(calName, 'Tasks');
  const occ = expandEvents(events, 'America/Los_Angeles', '2026-10-01', '2026-10-27');
  const on = (date) => occ.filter((o) => o.date === date).map((o) => `${o.time ?? 'all-day'} ${o.title}`);
  assert.deepEqual(on('2026-10-26'), ['all-day Call bank', '07:30 Gym ✓', '09:00 ✓ Write report', '19:00 Late task [x]']);
  assert.deepEqual(on('2026-10-19'), ['07:00 Gym']);
  assert.deepEqual(on('2026-10-21'), [], 'EXDATE removes the occurrence');
  assert.deepEqual(on('2026-10-25'), [], 'cancelled events are skipped');
  assert.deepEqual(on('2026-10-28'), [], 'outside the window');
  assert.equal(occ.filter((o) => o.title === 'Gym' || o.title === 'Gym ✓').length, 2, 'COUNT=4: Oct 19, (21 excluded), 26 edited, 28 outside window');
  assert.deepEqual(occ.filter((o) => o.title === 'Stretch').map((o) => o.date), ['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07']);
  assert.equal(occ.filter((o) => o.title.includes('alarm')).length, 0, 'VALARM text is not a task');

  const markers = ['✓', '✔', '✅', '[x]'];
  assert.ok(isDone('Late task [X]', markers));
  assert.ok(!isDone('Call bank', markers));
  assert.equal(cleanTitle('✓ Write report', markers), 'Write report');
  assert.equal(cleanTitle('Late task [X]', markers), 'Late task');
});
