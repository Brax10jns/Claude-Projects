// Every score is 0-100 and computed here, the same way for real and demo inputs.
// A pillar with no data for a day scores null ("no data"), never zero.
import { addDays } from './lib/time.js';

export const PILLARS = ['sleep', 'recovery', 'training', 'work', 'tasks'];
export const PILLAR_SOURCE = {
  sleep: 'appleHealth', recovery: 'appleHealth', training: 'appleHealth',
  work: 'rescueTime', tasks: 'calendar',
};

const clamp = (x, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));
const round = (x) => Math.round(x);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };

// Sleep: 75% hours vs goal, 25% restorative share (deep + REM, target 40% of sleep).
export function scoreSleep(day, goals) {
  const s = day?.sleep;
  if (!s) return null;
  const minutes = s.asleepMin ?? s.inBedMin;
  if (!minutes) return null;
  const hours = minutes / 60;
  const duration = clamp((100 * hours) / goals.sleepHours);
  let score = duration;
  let restorative = null;
  if (s.hasStages && s.asleepMin) {
    restorative = (s.deepMin + s.remMin) / s.asleepMin;
    score = 0.75 * duration + 0.25 * clamp((100 * restorative) / 0.4);
  }
  return {
    score: round(score),
    hours: Math.round(hours * 10) / 10,
    inBedOnly: s.asleepMin === null,
    restorativePct: restorative === null ? null : round(restorative * 100),
    deepMin: s.deepMin, remMin: s.remMin, coreMin: s.coreMin, awakeMin: s.awakeMin,
    hasStages: s.hasStages, bedtime: s.bedtime, wake: s.wake,
  };
}

// Recovery: today's HRV and resting HR against your own previous 30 days
// (needs at least 7 days of history). HRV up and RHR down = better recovered.
// 50 = your normal; +/-2 standard deviations reaches 100 / 0.
export const BASELINE_DAYS = 30, MIN_BASELINE = 7;
export function scoreRecovery(days, date) {
  const today = days[date];
  if (!today || (today.hrv == null && today.rhr == null)) return null;
  const prior = [];
  for (let i = 1; i <= BASELINE_DAYS; i++) {
    const d = days[addDays(date, -i)];
    if (d) prior.push(d);
  }
  const hrvHist = prior.map((d) => d.hrv).filter((v) => v != null && v > 0).map(Math.log);
  const rhrHist = prior.map((d) => d.rhr).filter((v) => v != null);
  const parts = [];
  const out = { hrv: today.hrv ?? null, rhr: today.rhr ?? null, hrvBase: null, rhrBase: null };
  if (today.hrv != null && today.hrv > 0 && hrvHist.length >= MIN_BASELINE) {
    const z = (Math.log(today.hrv) - mean(hrvHist)) / Math.max(sd(hrvHist), 0.05);
    parts.push([0.65, clamp(50 + 25 * z)]);
    out.hrvBase = Math.round(Math.exp(mean(hrvHist)));
  }
  if (today.rhr != null && rhrHist.length >= MIN_BASELINE) {
    const z = (today.rhr - mean(rhrHist)) / Math.max(sd(rhrHist), 1);
    parts.push([0.35, clamp(50 - 25 * z)]);
    out.rhrBase = Math.round(mean(rhrHist) * 10) / 10;
  }
  if (!parts.length) return { score: null, calibrating: true, baselineDays: Math.max(hrvHist.length, rhrHist.length), ...out };
  const w = parts.reduce((a, [wt]) => a + wt, 0);
  return { score: round(parts.reduce((a, [wt, v]) => a + wt * v, 0) / w), ...out };
}

// Training: 70% exercise minutes vs goal, 30% steps vs goal. Without an Apple
// Watch exercise ring, workout minutes stand in for exercise minutes.
export function scoreTraining(day, goals, hasExerciseRing) {
  if (!day) return null;
  const workouts = day.workouts || [];
  const steps = day.steps ?? null;
  if (day.exerciseMin == null && steps == null && !workouts.length) return null;
  const workoutMin = workouts.reduce((a, w) => a + w.minutes, 0);
  const exercise = hasExerciseRing ? day.exerciseMin ?? workoutMin : workoutMin;
  const parts = [[0.7, clamp((100 * exercise) / goals.exerciseMinutes)]];
  if (steps != null) parts.push([0.3, clamp((100 * steps) / goals.steps)]);
  const w = parts.reduce((a, [wt]) => a + wt, 0);
  return {
    score: round(parts.reduce((a, [wt, v]) => a + wt * v, 0) / w),
    exerciseMin: exercise, steps, activeKcal: day.activeKcal ?? null,
    workouts: workouts.map(({ type, minutes, kcal, time }) => ({ type, minutes, kcal, time })),
  };
}

// Work (RescueTime): 60% focused hours (very productive + productive) vs goal,
// 40% RescueTime's productivity pulse. Under the minimum tracked time = no data.
export function scoreWork(day, goals, minTrackedMinutes) {
  if (!day || !day.totalSec) return null;
  const trackedMin = day.totalSec / 60;
  const focusHours = (day.vp + day.p) / 3600;
  const pulse = (100 * (4 * day.vp + 3 * day.p + 2 * day.n + day.d)) / (4 * day.totalSec);
  const base = {
    focusHours: Math.round(focusHours * 10) / 10,
    trackedHours: Math.round((trackedMin / 60) * 10) / 10,
    pulse: round(pulse),
    distractedHours: Math.round(((day.d + day.vd) / 3600) * 10) / 10,
  };
  if (trackedMin < minTrackedMinutes) return { score: null, belowMinimum: true, ...base };
  return { score: round(0.6 * clamp((100 * focusHours) / goals.focusHours) + 0.4 * pulse), ...base };
}

// Tasks (calendar): share of the day's tasks marked done. Nothing planned = no data.
export function scoreTasks(day) {
  const tasks = day?.tasks || [];
  if (!tasks.length) return null;
  const done = tasks.filter((t) => t.done).length;
  return { score: round((100 * done) / tasks.length), done, total: tasks.length, tasks };
}

export function computePillarSeries(pillar, input, dates, config) {
  const out = {};
  for (const date of dates) {
    let r = null;
    if (pillar === 'sleep') r = scoreSleep(input.days[date], config.goals);
    else if (pillar === 'recovery') r = scoreRecovery(input.days, date);
    else if (pillar === 'training') r = scoreTraining(input.days[date], config.goals, input.hasExerciseRing);
    else if (pillar === 'work') r = scoreWork(input.days[date], config.goals, config.work.minTrackedMinutes);
    else if (pillar === 'tasks') r = scoreTasks(input.days[date]);
    out[date] = r;
  }
  return out;
}

// Life Score: weighted mean of the pillars that have a score that day, with
// the weights of missing pillars redistributed. Partial (still-running) days
// are left out. Callers pass only pillars of one kind (all real, or all demo)
// so demo values never enter a real score.
export function computeLife(pillarSeries, dates, weights) {
  const out = {};
  for (const date of dates) {
    let sum = 0, wsum = 0;
    const used = [];
    for (const [name, series] of Object.entries(pillarSeries)) {
      const s = series[date]?.score;
      if (s == null || series[date].partial) continue;
      const w = weights[name] ?? 0;
      if (w <= 0) continue;
      sum += w * s; wsum += w; used.push(name);
    }
    out[date] = wsum ? { score: round(sum / wsum), used } : null;
  }
  return out;
}
