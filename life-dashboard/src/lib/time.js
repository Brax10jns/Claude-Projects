// Calendar dates are plain 'YYYY-MM-DD' strings in the user's local time zone.
// Day arithmetic goes through UTC so DST never shifts a date.

const DAY_MS = 86400000;

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function dateRange(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function dayNumber(y, m, d) {
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n) {
  const t = new Date(n * DAY_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), dow: t.getUTCDay() };
}

export function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

export function ymd(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(config) {
  const tz = config.timezone;
  if (tz && tz !== 'auto') {
    if (!isValidTimeZone(tz)) throw new Error(`Unknown timezone "${tz}" in your config.json`);
    return tz;
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const formatters = new Map();
function formatterFor(tz) {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return formatters.get(tz);
}

// Wall-clock fields of an instant as seen in a time zone.
export function wallClock(instantMs, tz) {
  const parts = {};
  for (const p of formatterFor(tz).formatToParts(new Date(instantMs))) parts[p.type] = p.value;
  const f = { y: +parts.year, m: +parts.month, d: +parts.day, h: +parts.hour, mi: +parts.minute, s: +parts.second };
  f.date = ymd(f.y, f.m, f.d);
  f.time = `${pad(f.h)}:${pad(f.mi)}`;
  return f;
}

function offsetMs(instantMs, tz) {
  const w = wallClock(instantMs, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(instantMs / 1000) * 1000;
}

// The instant at which a wall-clock time occurs in a time zone.
export function zonedToInstant({ y, m, d, h = 0, mi = 0, s = 0 }, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const first = guess - offsetMs(guess, tz);
  return guess - offsetMs(first, tz);
}

export function todayIn(tz) {
  return wallClock(Date.now(), tz).date;
}
