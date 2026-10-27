// DEMO inputs for sources that aren't connected yet, shaped exactly like the real
// data files so they run through the same scoring. Seeded by date: stable across builds.
// Output from here is always tagged mode: 'demo' and never enters a real Life Score.
import { addDays } from './lib/time.js';

function rng(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r, lo, hi) => lo + r() * (hi - lo);
const weekday = (date) => new Date(date + 'T12:00:00Z').getUTCDay();
const hhmm = (min) => `${String(Math.floor(((min % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(Math.round(((min % 60) + 60) % 60)).padStart(2, '0')}`;

export function demoAppleHealth(dates) {
  const days = {};
  for (const date of [...Array(31).keys()].reverse().map((i) => addDays(dates[0], -i - 1)).concat(dates)) {
    const r = rng('health' + date);
    const weekend = [0, 6].includes(weekday(date));
    const asleep = Math.round(between(r, 330, 500) + (weekend ? 35 : 0));
    const bed = Math.round(between(r, 22 * 60 + 15, 24 * 60 + 40) + (weekend ? 30 : 0));
    const deep = Math.round(asleep * between(r, 0.11, 0.2));
    const rem = Math.round(asleep * between(r, 0.17, 0.26));
    const trained = r() < 0.6;
    const types = ['Running', 'TraditionalStrengthTraining', 'Cycling', 'Yoga', 'HighIntensityIntervalTraining'];
    const workoutMin = Math.round(between(r, 25, 70));
    days[date] = {
      sleep: {
        source: 'DEMO', asleepMin: asleep, inBedMin: asleep + Math.round(between(r, 15, 45)),
        deepMin: deep, remMin: rem, coreMin: asleep - deep - rem, awakeMin: Math.round(between(r, 5, 30)),
        hasStages: true, bedtime: hhmm(bed), wake: hhmm(bed + asleep + 25),
      },
      hrv: Math.round(between(r, 38, 72) * (asleep / 450)),
      rhr: Math.round(between(r, 50, 58) + (asleep < 380 ? 3 : 0)),
      steps: Math.round(between(r, 3500, 13500)),
      activeKcal: Math.round(between(r, 250, 750) + (trained ? 300 : 0)),
      exerciseMin: trained ? workoutMin + Math.round(between(r, 0, 15)) : Math.round(between(r, 3, 20)),
      ...(trained ? { workouts: [{ type: types[Math.floor(r() * types.length)], minutes: workoutMin, kcal: workoutMin * 9, time: hhmm(Math.round(between(r, 6 * 60, 19 * 60))) }] } : {}),
    };
  }
  return { days, hasExerciseRing: true };
}

export function demoRescueTime(dates) {
  const days = {};
  for (const date of dates) {
    const r = rng('work' + date);
    const weekend = [0, 6].includes(weekday(date));
    if (weekend && r() < 0.6) continue;
    const total = (weekend ? between(r, 1, 3) : between(r, 5.5, 9.5)) * 3600;
    const vp = total * between(r, 0.25, 0.5), p = total * between(r, 0.1, 0.2);
    const d = total * between(r, 0.05, 0.15), vd = total * between(r, 0.02, 0.1);
    days[date] = { vp, p, d, vd, n: Math.max(0, total - vp - p - d - vd), totalSec: total };
  }
  return { days };
}

const DEMO_TASKS = ['Inbox zero', 'Write weekly update', 'Review pull requests', 'Plan sprint', 'Call dentist',
  'Groceries', 'Pay bills', 'Read 30 min', 'Prep 1:1 notes', 'Fix bike', 'Meal prep', 'Draft proposal'];
export function demoCalendar(dates) {
  const days = {};
  for (const date of dates) {
    const r = rng('tasks' + date);
    const n = Math.floor(between(r, 2, 7));
    const doneRate = between(r, 0.4, 1);
    const tasks = [];
    for (let i = 0; i < n; i++) {
      tasks.push({ title: DEMO_TASKS[Math.floor(r() * DEMO_TASKS.length)], done: r() < doneRate, time: hhmm(9 * 60 + i * 75) });
    }
    days[date] = { tasks };
  }
  return { days };
}
