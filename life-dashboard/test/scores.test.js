import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreSleep, scoreRecovery, scoreTraining, scoreWork, scoreTasks, computeLife } from '../src/scores.js';
import { buildPayload } from '../src/build.js';
import { addDays } from '../src/lib/time.js';

const goals = { sleepHours: 8, exerciseMinutes: 30, steps: 8000, focusHours: 5 };

test('sleep: hours vs goal plus restorative share', () => {
  const s = scoreSleep({ sleep: { asleepMin: 480, deepMin: 96, remMin: 96, coreMin: 288, awakeMin: 10, hasStages: true } }, goals);
  assert.equal(s.score, 100);
  assert.equal(scoreSleep({ sleep: { asleepMin: 240, hasStages: false } }, goals).score, 50);
  assert.equal(scoreSleep({}, goals), null);
});

test('recovery: calibrates first, then scores against your own baseline', () => {
  const days = {};
  for (let i = 1; i <= 10; i++) days[addDays('2026-10-27', -i)] = { hrv: 50 + (i % 3) - 1, rhr: 55 + (i % 2) };
  assert.equal(scoreRecovery({ '2026-10-27': { hrv: 50 } }, '2026-10-27').calibrating, true);
  const normal = scoreRecovery({ ...days, '2026-10-27': { hrv: 50, rhr: 55.5 } }, '2026-10-27');
  assert.ok(Math.abs(normal.score - 50) <= 3, `normal day ≈ 50, got ${normal.score}`);
  const good = scoreRecovery({ ...days, '2026-10-27': { hrv: 70, rhr: 50 } }, '2026-10-27');
  const bad = scoreRecovery({ ...days, '2026-10-27': { hrv: 35, rhr: 62 } }, '2026-10-27');
  assert.ok(good.score > 85 && bad.score < 15, `${good.score} / ${bad.score}`);
  assert.equal(scoreRecovery(days, '2026-10-27'), null);
});

test('training, work and tasks', () => {
  assert.equal(scoreTraining({ exerciseMin: 30, steps: 8000 }, goals, true).score, 100);
  assert.equal(scoreTraining({ steps: 4000 }, goals, true).score, 15, 'watch worn, no exercise = 0 exercise');
  assert.equal(scoreTraining(undefined, goals, true), null);
  const h = 3600;
  assert.equal(scoreWork({ vp: 5 * h, p: 0, n: 0, d: 0, vd: 0, totalSec: 5 * h }, goals, 30).score, 100);
  assert.equal(scoreWork({ vp: 600, p: 0, n: 0, d: 0, vd: 0, totalSec: 600 }, goals, 30).score, null);
  assert.equal(scoreWork(undefined, goals, 30), null);
  assert.deepEqual(scoreTasks({ tasks: [{ done: true }, { done: false }] }).score, 50);
  assert.equal(scoreTasks({ tasks: [] }), null);
});

test('life score reweights around missing pillars', () => {
  const life = computeLife({ sleep: { d: { score: 80 } }, work: { d: null }, tasks: { d: { score: 40 } } }, ['d', 'e'], { sleep: 30, work: 40, tasks: 10 });
  assert.deepEqual(life.d, { score: 70, used: ['sleep', 'tasks'] });
  assert.equal(life.e, null);
});

const config = {
  historyDays: 14, goals, work: { minTrackedMinutes: 30 },
  weights: { sleep: 25, recovery: 20, training: 15, work: 20, tasks: 20 },
};

test('nothing connected: everything is DEMO, including the Life Score', () => {
  const p = buildPayload(config, { today: '2026-10-27', tz: 'UTC', read: () => null });
  assert.equal(p.life.mode, 'demo');
  for (const pl of Object.values(p.pillars)) assert.equal(pl.mode, 'demo');
  assert.ok(p.life.days['2026-10-27'].score != null);
});

test('demo data never enters a real Life Score', () => {
  const tasks = { days: { '2026-10-27': { tasks: [{ title: 'a', done: true }, { title: 'b', done: false }] } } };
  const p = buildPayload(config, { today: '2026-10-27', tz: 'UTC', read: (id) => (id === 'calendar' ? { fetchedAt: 'x', ...tasks } : null) });
  assert.equal(p.life.mode, 'real');
  assert.deepEqual(p.life.pillars, ['tasks']);
  assert.deepEqual(p.life.days['2026-10-27'], { score: 50, used: ['tasks'] });
  assert.equal(p.life.days['2026-10-26'], null, 'connected source with no data that day = no data, not demo');
  assert.equal(p.pillars.tasks.days['2026-10-26'], null);
  assert.equal(p.pillars.sleep.mode, 'demo');
  assert.ok(p.pillars.sleep.days['2026-10-26'].score != null, 'demo pillars still preview');
});
