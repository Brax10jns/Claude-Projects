// Minimal iCalendar (RFC 5545) reader for a published iCloud "Tasks" calendar:
// VEVENTs, recurring rules (DAILY/WEEKLY/MONTHLY/YEARLY), EXDATEs, edited
// single occurrences (RECURRENCE-ID) and cancellations.
import { dayNumber, fromDayNumber, isValidTimeZone, wallClock, ymd, pad, zonedToInstant } from './time.js';

function unescapeText(v) {
  return v.replace(/\\([nN]|,|;|\\)/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

function parseLine(line) {
  // NAME;PARAM=a;PARAM="b:c":VALUE  (the first colon outside quotes ends the params)
  let inQuote = false, idx = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuote = !inQuote;
    else if (line[i] === ':' && !inQuote) { idx = i; break; }
  }
  if (idx < 0) return null;
  const [name, ...paramParts] = line.slice(0, idx).split(';');
  const params = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(idx + 1) };
}

export function parseICS(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let calName = null, cur = null, nested = 0;
  for (const raw of lines) {
    if (!raw) continue;
    const p = parseLine(raw);
    if (!p) continue;
    if (p.name === 'BEGIN') {
      if (p.value === 'VEVENT') cur = { exdates: [] };
      else if (cur) nested++;
      continue;
    }
    if (p.name === 'END') {
      if (p.value === 'VEVENT' && cur) { events.push(cur); cur = null; }
      else if (cur) nested--;
      continue;
    }
    if (!cur) {
      if (p.name === 'X-WR-CALNAME') calName = unescapeText(p.value);
      continue;
    }
    if (nested > 0) continue; // inside VALARM etc.
    switch (p.name) {
      case 'UID': cur.uid = p.value; break;
      case 'SUMMARY': cur.summary = unescapeText(p.value); break;
      case 'STATUS': cur.status = p.value.toUpperCase(); break;
      case 'DTSTART': cur.start = parseDateValue(p.value, p.params); break;
      case 'RRULE': cur.rrule = parseRRule(p.value); break;
      case 'RECURRENCE-ID': cur.recurrenceId = parseDateValue(p.value, p.params); break;
      case 'EXDATE':
        for (const v of p.value.split(',')) {
          const d = parseDateValue(v, p.params);
          if (d) cur.exdates.push(d);
        }
        break;
    }
  }
  return { calName, events };
}

export function parseDateValue(value, params = {}) {
  const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const allDay = params.VALUE === 'DATE' || !m[4];
  return {
    y: +m[1], m: +m[2], d: +m[3],
    h: allDay ? 0 : +m[4], mi: allDay ? 0 : +m[5], s: allDay ? 0 : +(m[6] || 0),
    allDay,
    utc: Boolean(m[7]),
    tzid: params.TZID && isValidTimeZone(params.TZID) ? params.TZID : null,
  };
}

function parseRRule(value) {
  const r = {};
  for (const part of value.split(';')) {
    const [k, v] = part.split('=');
    if (k && v !== undefined) r[k.toUpperCase()] = v;
  }
  return {
    freq: r.FREQ,
    interval: Math.max(1, parseInt(r.INTERVAL || '1', 10)),
    count: r.COUNT ? parseInt(r.COUNT, 10) : null,
    until: r.UNTIL ? parseDateValue(r.UNTIL) : null,
    byDay: r.BYDAY ? r.BYDAY.split(',').map((d) => {
      const mm = /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(d);
      return mm ? { n: mm[1] ? parseInt(mm[1], 10) : null, dow: WEEKDAYS.indexOf(mm[2]) } : null;
    }).filter(Boolean) : null,
    byMonthDay: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
  };
}
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// Convert a parsed date value to the user's local calendar date and HH:MM.
export function toLocal(dt, tz) {
  if (dt.allDay) return { date: ymd(dt.y, dt.m, dt.d), time: null };
  let inst;
  if (dt.utc) inst = Date.UTC(dt.y, dt.m - 1, dt.d, dt.h, dt.mi, dt.s);
  else if (dt.tzid) inst = zonedToInstant(dt, dt.tzid);
  else return { date: ymd(dt.y, dt.m, dt.d), time: `${pad(dt.h)}:${pad(dt.mi)}` }; // floating time
  const w = wallClock(inst, tz);
  return { date: w.date, time: w.time };
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function nthWeekday(y, m, dow, n) {
  const len = daysInMonth(y, m);
  const days = [];
  for (let d = 1; d <= len; d++) if (fromDayNumber(dayNumber(y, m, d)).dow === dow) days.push(d);
  const d = n > 0 ? days[n - 1] : days[days.length + n];
  return d ? dayNumber(y, m, d) : null;
}

// Day numbers (in the event's own zone) of each occurrence, in order.
function* occurrenceDays(start, rule) {
  const s = dayNumber(start.y, start.m, start.d);
  const { freq, interval } = rule;
  for (let k = 0; k < 20000; k++) {
    let batch = [];
    if (freq === 'DAILY') batch = [s + k * interval];
    else if (freq === 'WEEKLY') {
      const startDow = fromDayNumber(s).dow;
      const weekStart = s - ((startDow + 6) % 7) + k * 7 * interval; // weeks start Monday
      const dows = rule.byDay ? rule.byDay.map((b) => b.dow) : [startDow];
      batch = dows.map((dow) => weekStart + ((dow + 6) % 7)).sort((a, b) => a - b);
    } else if (freq === 'MONTHLY') {
      const mIdx = start.m - 1 + k * interval;
      const y = start.y + Math.floor(mIdx / 12), m = (mIdx % 12) + 1;
      if (rule.byDay) batch = rule.byDay.map((b) => nthWeekday(y, m, b.dow, b.n ?? 1));
      else {
        const mdays = rule.byMonthDay || [start.d];
        batch = mdays.map((d) => {
          const day = d < 0 ? daysInMonth(y, m) + d + 1 : d;
          return day >= 1 && day <= daysInMonth(y, m) ? dayNumber(y, m, day) : null;
        });
      }
      batch = batch.filter((x) => x !== null).sort((a, b) => a - b);
    } else if (freq === 'YEARLY') {
      const y = start.y + k * interval;
      if (start.d <= daysInMonth(y, start.m)) batch = [dayNumber(y, start.m, start.d)];
    } else return;
    for (const d of batch) if (d >= s) yield d;
  }
}

function key(local) {
  return `${local.date}T${local.time ?? ''}`;
}

// Expand every event into local occurrences between two dates (inclusive).
export function expandEvents(events, tz, fromDate, toDate) {
  const overrides = new Map(); // uid -> Map(key -> event)
  for (const e of events) {
    if (e.recurrenceId && e.uid) {
      if (!overrides.has(e.uid)) overrides.set(e.uid, new Map());
      overrides.get(e.uid).set(key(toLocal(e.recurrenceId, tz)), e);
    }
  }
  const out = [];
  const emit = (e, dt) => {
    if (e.status === 'CANCELLED' || !e.start) return;
    const local = toLocal(dt, tz);
    if (local.date >= fromDate && local.date <= toDate) out.push({ title: e.summary || '', ...local });
  };

  for (const e of events) {
    if (e.recurrenceId || !e.start) continue;
    if (!e.rrule || !e.rrule.freq) { emit(e, e.start); continue; }

    const ex = new Set(e.exdates.map((d) => key(toLocal(d, tz))));
    const ov = overrides.get(e.uid) || new Map();
    const until = e.rrule.until ? toLocal(e.rrule.until, tz) : null;
    let n = 0;
    for (const dn of occurrenceDays(e.start, e.rrule)) {
      const { y, m, d } = fromDayNumber(dn);
      const occ = { ...e.start, y, m, d };
      const local = toLocal(occ, tz);
      if (until && (until.time === null ? local.date > until.date : key(local) > key(until))) break;
      if (local.date > toDate) break;
      n++;
      if (e.rrule.count && n > e.rrule.count) break;
      const k = key(local);
      if (ex.has(k)) continue;
      if (ov.has(k)) { const o = ov.get(k); emit(o, o.start); ov.delete(k); continue; }
      emit(e, occ);
    }
  }
  // Edited occurrences whose original slot was never reached (moved, or beyond the window).
  for (const ov of overrides.values()) for (const o of ov.values()) emit(o, o.start);
  return out.sort((a, b) => key(a).localeCompare(key(b)));
}

export function isDone(title, markers) {
  const t = title.toLowerCase();
  return markers.some((m) => t.includes(m.toLowerCase()));
}

export function cleanTitle(title, markers) {
  let t = title;
  for (const m of markers) t = t.split(m).join('').split(m.toUpperCase()).join('');
  return t.replace(/\s{2,}/g, ' ').trim();
}
