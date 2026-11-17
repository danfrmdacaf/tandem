// Which events of one calendar are about to start for one person. Uses the same calendar logic as the
// application (core.js), so repeating events, multi day events and personal rules behave identically.

/** Wall clock time in a time zone: { date: 'YYYY-MM-DD', naive: milliseconds as if that wall time were UTC }. */
export function localParts(ms, tz) {
  let f;
  try {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch (_e) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const h = +p.hour === 24 ? 0 : +p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, naive: Date.UTC(+p.year, +p.month - 1, +p.day, h, +p.minute) };
}

/**
 * events: [{ id, data }]. Returns the events that start within the next `lead` minutes (and not before now).
 * All day events never notify. Events the person marked optional or hidden never notify. An event for
 * other people only is skipped; an event for nobody in particular is for everyone.
 */
export function findDue(C, { events, nowMs, tz, lead, me, rules, roomId }) {
  const now = localParts(nowMs, tz), horizon = localParts(nowMs + lead * 60000, tz);
  const out = [];
  for (const e of events) {
    const d = e.data;
    if (!d || !d.title || d.allDay || !/^\d{2}:\d{2}$/.test(d.start || "")) continue;
    if (Array.isArray(d.who) && d.who.length && !d.who.includes(me)) continue;
    for (const sd of C.occurrenceStarts(d, now.date, horizon.date)) {
      const at = Date.UTC(+sd.slice(0, 4), +sd.slice(5, 7) - 1, +sd.slice(8, 10), +d.start.slice(0, 2), +d.start.slice(3, 5));
      const minutes = Math.round((at - now.naive) / 60000);
      if (minutes < 0 || minutes > lead) continue;
      if (rules.length && C.ruleStatus(rules, roomId, { id: e.id, data: d, date: sd, start: sd })) continue;
      out.push({ key: `${roomId}:${e.id}:${sd}`, title: d.title, start: d.start, place: d.place || "", trip: d.trip || null, minutes });
    }
  }
  return out;
}

export function message(due) {
  const when = due.minutes <= 0 ? "now" : due.minutes === 1 ? "in 1 minute" : `in ${due.minutes} minutes`;
  const where = due.trip && due.trip.from && due.trip.to ? `${due.trip.from} to ${due.trip.to}` : due.place;
  return { title: due.title, body: `Starts at ${due.start}, ${when}.` + (where ? ` ${where}.` : ""), tag: due.key, url: "./" };
}
