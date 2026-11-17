// The parts of the calendar logic that the reminder function needs: when an event occurs, and which personal
// rules apply. This is the same logic as core.js in the application, and tests/push.test.mjs checks that the
// two agree on many generated events.
const MS = 86400000;
const pad = (n) => String(n).padStart(2, "0");
const parse = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const fmt = (ms) => { const d = new Date(ms); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); };
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parse(s));
const add = (s, n) => fmt(parse(s) + n * MS);
const diff = (a, b) => Math.round((parse(b) - parse(a)) / MS);
const dow = (s) => new Date(parse(s)).getUTCDay();
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monthStart = (s) => s.slice(0, 8) + "01";
const addMonths = (s, n) => { const m = +s.slice(5, 7) - 1 + n, y = +s.slice(0, 4) + Math.floor(m / 12); return y + "-" + pad((((m % 12) + 12) % 12) + 1) + "-01"; };
const spanOf = (ev) => (ev.endDate && isDate(ev.endDate) && ev.endDate >= ev.date ? diff(ev.date, ev.endDate) : 0);

export function occurrenceStarts(ev, from, to) {
  const len = spanOf(ev), res = [];
  if (!isDate(ev.date)) return res;
  if (!ev.repeat || ev.repeat === "none") {
    if (ev.date <= to && add(ev.date, len) >= from) res.push(ev.date);
    return res;
  }
  const hardEnd = ev.until && isDate(ev.until) && ev.until < to ? ev.until : to;
  const lowStart = add(from, -len);
  let d, k;
  if (ev.repeat === "daily" || ev.repeat === "weekly" || ev.repeat === "fortnightly") {
    const step = ev.repeat === "daily" ? 1 : ev.repeat === "weekly" ? 7 : 14;
    k = lowStart > ev.date ? Math.ceil(diff(ev.date, lowStart) / step) : 0;
    for (d = add(ev.date, k * step); d <= hardEnd; d = add(d, step)) res.push(d);
    return res;
  }
  if (ev.repeat === "monthly") {
    const day = +ev.date.slice(8);
    let cursor = lowStart > ev.date ? monthStart(lowStart) : monthStart(ev.date);
    for (let g = 0; g < 1200 && cursor <= hardEnd; g++) {
      const y = +cursor.slice(0, 4), m = +cursor.slice(5, 7);
      if (day <= daysInMonth(y, m)) {
        d = y + "-" + pad(m) + "-" + pad(day);
        if (d >= ev.date && d <= hardEnd && add(d, len) >= from) res.push(d);
      }
      cursor = addMonths(cursor, 1);
    }
    return res;
  }
  if (ev.repeat === "yearly") {
    const mm = ev.date.slice(5, 7), dd = ev.date.slice(8);
    for (let yr = Math.max(+ev.date.slice(0, 4), +lowStart.slice(0, 4) - 1); yr <= +hardEnd.slice(0, 4); yr++) {
      if (mm === "02" && dd === "29" && daysInMonth(yr, 2) < 29) continue;
      d = yr + "-" + mm + "-" + dd;
      if (d >= ev.date && d <= hardEnd && add(d, len) >= from) res.push(d);
    }
  }
  return res;
}

export const normTitle = (t) => String(t || "").trim().replace(/\s+/g, " ").toLowerCase();

export function ruleMatches(rule, roomId, o) {
  if (!rule || rule.gone || (rule.room && rule.room !== "*" && rule.room !== roomId)) return false;
  let has = false;
  const d = o.data || {};
  if (rule.ev) { has = true; if (o.id !== rule.ev) return false; }
  if (rule.title) { has = true; if (normTitle(d.title) !== rule.title) return false; }
  if (rule.after || rule.before) {
    has = true;
    if (d.allDay || !d.start) return false;
    if (rule.after && d.start < rule.after) return false;
    if (rule.before && d.start >= rule.before) return false;
  }
  if (!has) return false;
  if (rule.day && o.start !== rule.day) return false;
  if (rule.days && rule.days.length && rule.days.indexOf(dow(o.date)) < 0) return false;
  return true;
}
export function ruleStatus(rules, roomId, o) {
  let st = null;
  for (const r of rules) { if (ruleMatches(r, roomId, o)) { if (r.mode === "hide") return "hide"; st = "optional"; } }
  return st;
}
export const C = { occurrenceStarts, ruleStatus, ruleMatches, normTitle };
