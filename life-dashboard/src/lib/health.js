// Streams an Apple Health export.xml (often >1 GB) line by line and reduces it
// to one small summary per day. Each <Record> and <Workout> start tag sits on
// its own line in Apple's exports, so a line scanner is enough.
import fs from 'node:fs';
import readline from 'node:readline';

const T = 'HKQuantityTypeIdentifier';
const TYPES = {
  steps: `${T}StepCount`,
  activeEnergy: `${T}ActiveEnergyBurned`,
  exercise: `${T}AppleExerciseTime`,
  hrv: `${T}HeartRateVariabilitySDNN`,
  rhr: `${T}RestingHeartRate`,
  sleep: 'HKCategoryTypeIdentifierSleepAnalysis',
};

const SLEEP_STAGE = {
  HKCategoryValueSleepAnalysisInBed: 'inBed',
  HKCategoryValueSleepAnalysisAsleep: 'unspecified',
  HKCategoryValueSleepAnalysisAsleepUnspecified: 'unspecified',
  HKCategoryValueSleepAnalysisAsleepCore: 'core',
  HKCategoryValueSleepAnalysisAsleepDeep: 'deep',
  HKCategoryValueSleepAnalysisAsleepREM: 'rem',
  HKCategoryValueSleepAnalysisAwake: 'awake',
};
const ASLEEP = new Set(['unspecified', 'core', 'deep', 'rem']);

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
function attrs(line) {
  const out = {};
  for (const m of line.matchAll(/(\w+)="([^"]*)"/g)) {
    out[m[1]] = m[2].replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTITIES[e]);
  }
  return out;
}

// "2026-10-26 23:14:05 -0700" -> local wall clock (as written) plus the true instant.
export function parseHealthDate(s) {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)(?: ([+-])(\d\d)(\d\d))?/.exec(s || '');
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const off = m[7] ? (m[7] === '-' ? -1 : 1) * (+m[8] * 60 + +m[9]) : 0;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}`, wall, inst: wall - off * 60000 };
}

// A night belongs to the day you wake up: anything starting after 18:00 counts
// toward the next date, so 23:30 -> 07:00 is one night, and an afternoon nap
// counts toward that same day.
export function nightOf(start) {
  return new Date(start.wall + 6 * 3600000).toISOString().slice(0, 10);
}

function unionMinutes(intervals) {
  const sorted = intervals.map((i) => [i.start, i.end]).sort((a, b) => a[0] - b[0]);
  let total = 0, curStart = null, curEnd = null;
  for (const [s, e] of sorted) {
    if (curEnd === null || s > curEnd) {
      if (curEnd !== null) total += curEnd - curStart;
      curStart = s; curEnd = e;
    } else if (e > curEnd) curEnd = e;
  }
  if (curEnd !== null) total += curEnd - curStart;
  return total / 60000;
}

function bump(map, date, source, value) {
  const bySource = map.get(date) || new Map();
  bySource.set(source, (bySource.get(source) || 0) + value);
  map.set(date, bySource);
}

// iPhone and Watch both record steps/energy; summing them double-counts.
// Take the source with the largest total that day (what the Health app shows).
function maxSource(map) {
  const out = {};
  for (const [date, bySource] of map) out[date] = Math.max(...bySource.values());
  return out;
}

function summarizeNight(samples) {
  const bySource = new Map();
  for (const s of samples) {
    if (!bySource.has(s.source)) bySource.set(s.source, []);
    bySource.get(s.source).push(s);
  }
  const candidates = [];
  for (const [source, list] of bySource) {
    const asleep = list.filter((s) => ASLEEP.has(s.stage));
    const stage = (name) => unionMinutes(list.filter((s) => s.stage === name));
    const inBed = list.filter((s) => s.stage === 'inBed');
    const span = asleep.length ? asleep : inBed;
    if (!span.length) continue;
    const first = span.reduce((a, b) => (a.startWall < b.startWall ? a : b));
    const last = span.reduce((a, b) => (a.endWall > b.endWall ? a : b));
    const deep = stage('deep'), rem = stage('rem'), core = stage('core');
    candidates.push({
      source,
      asleepMin: asleep.length ? Math.round(unionMinutes(asleep)) : null,
      inBedMin: inBed.length ? Math.round(unionMinutes(inBed)) : null,
      deepMin: Math.round(deep), remMin: Math.round(rem), coreMin: Math.round(core),
      awakeMin: Math.round(stage('awake')),
      hasStages: deep + rem + core > 0,
      bedtime: first.startTime,
      wake: last.endTime,
    });
  }
  if (!candidates.length) return null;
  // Prefer a source that tracked actual sleep (with stages if possible) over in-bed only.
  candidates.sort((a, b) =>
    (b.asleepMin !== null) - (a.asleepMin !== null) ||
    b.hasStages - a.hasStages ||
    (b.asleepMin ?? b.inBedMin) - (a.asleepMin ?? a.inBedMin));
  return candidates[0];
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export async function parseHealthExport(filePath, { since, until } = {}) {
  const steps = new Map(), energy = new Map(), exercise = new Map();
  const hrv = new Map(), rhr = new Map();
  const nights = new Map();
  const workouts = [];
  const typesSeen = {};
  let exportDate = null;
  let openWorkout = null;
  let lines = 0;

  const inWindow = (date) => (!since || date >= since) && (!until || date <= until);
  const push = (map, date, v) => { if (!map.has(date)) map.set(date, []); map.get(date).push(v); };

  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  for await (const raw of rl) {
    lines++;
    const line = raw.trimStart();
    if (line.startsWith('<Record ')) {
      const a = attrs(line);
      typesSeen[a.type] = (typesSeen[a.type] || 0) + 1;
      const start = parseHealthDate(a.startDate);
      const end = parseHealthDate(a.endDate);
      if (!start || !end) continue;

      if (a.type === TYPES.sleep) {
        const stage = SLEEP_STAGE[a.value];
        const night = nightOf(start);
        if (!stage || !inWindow(night)) continue;
        push(nights, night, {
          source: a.sourceName, stage, start: start.inst, end: end.inst,
          startWall: start.wall, endWall: end.wall, startTime: start.time, endTime: end.time,
        });
        continue;
      }
      if (!inWindow(start.date)) continue;
      const v = parseFloat(a.value);
      if (!Number.isFinite(v)) continue;
      switch (a.type) {
        case TYPES.steps: bump(steps, start.date, a.sourceName, v); break;
        case TYPES.activeEnergy: bump(energy, start.date, a.sourceName, a.unit === 'kJ' ? v / 4.184 : v); break;
        case TYPES.exercise: bump(exercise, start.date, a.sourceName, v); break;
        case TYPES.hrv: push(hrv, start.date, v); break;
        case TYPES.rhr: push(rhr, start.date, v); break;
      }
    } else if (line.startsWith('<Workout ')) {
      const a = attrs(line);
      typesSeen.Workout = (typesSeen.Workout || 0) + 1;
      const start = parseHealthDate(a.startDate);
      const end = parseHealthDate(a.endDate);
      if (!start || !end) continue;
      let minutes = parseFloat(a.duration);
      if (!Number.isFinite(minutes)) minutes = (end.inst - start.inst) / 60000;
      else if (a.durationUnit === 's') minutes /= 60;
      else if (a.durationUnit === 'hr') minutes *= 60;
      let kcal = parseFloat(a.totalEnergyBurned);
      if (a.totalEnergyBurnedUnit === 'kJ') kcal /= 4.184;
      const w = {
        date: start.date, time: start.time,
        type: (a.workoutActivityType || 'Workout').replace('HKWorkoutActivityType', ''),
        minutes: Math.round(minutes), kcal: Number.isFinite(kcal) ? Math.round(kcal) : null,
        source: a.sourceName,
      };
      if (inWindow(start.date)) workouts.push(w);
      openWorkout = line.endsWith('/>') ? null : w;
    } else if (openWorkout && line.startsWith('<WorkoutStatistics ')) {
      const a = attrs(line);
      if (a.type === TYPES.activeEnergy && openWorkout.kcal === null) {
        const v = parseFloat(a.sum);
        if (Number.isFinite(v)) openWorkout.kcal = Math.round(a.unit === 'kJ' ? v / 4.184 : v);
      }
    } else if (line.startsWith('</Workout>')) {
      openWorkout = null;
    } else if (line.startsWith('<ExportDate ')) {
      exportDate = attrs(line).value || null;
    }
  }

  const days = {};
  const day = (date) => (days[date] ||= {});
  for (const [date, v] of Object.entries(maxSource(steps))) day(date).steps = Math.round(v);
  for (const [date, v] of Object.entries(maxSource(energy))) day(date).activeKcal = Math.round(v);
  for (const [date, v] of Object.entries(maxSource(exercise))) day(date).exerciseMin = Math.round(v);
  for (const [date, vs] of hrv) day(date).hrv = Math.round(mean(vs) * 10) / 10;
  for (const [date, vs] of rhr) day(date).rhr = Math.round(mean(vs) * 10) / 10;
  for (const [date, samples] of nights) {
    const s = summarizeNight(samples);
    if (s) day(date).sleep = s;
  }
  for (const w of workouts) (day(w.date).workouts ||= []).push(w);

  return {
    days: Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b))),
    typesSeen,
    exportDate,
    lines,
    hasExerciseRing: Boolean(typesSeen[TYPES.exercise]),
  };
}

export { TYPES as HEALTH_TYPES };
