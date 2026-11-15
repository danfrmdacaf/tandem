/* Tandem calendar logic. Pure functions with no browser dependencies, so the same file runs in the
   application and in the tests. Dates are plain strings in the form YYYY-MM-DD and are handled in UTC,
   so daylight saving changes cannot shift an event by a day. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TandemCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MS = 86400000;
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var isDate = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parse(s)); };
  function parse(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fmt(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function add(s, n) { return fmt(parse(s) + n * MS); }
  function diff(a, b) { return Math.round((parse(b) - parse(a)) / MS); }
  function dow(s) { return new Date(parse(s)).getUTCDay(); }
  function monday(s) { var w = dow(s); return add(s, w === 0 ? -6 : 1 - w); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function monthStart(s) { return s.slice(0, 8) + '01'; }
  function addMonths(s, n) {
    var m = +s.slice(5, 7) - 1 + n, y = +s.slice(0, 4) + Math.floor(m / 12);
    return y + '-' + pad((((m % 12) + 12) % 12) + 1) + '-01';
  }

  var PALETTE = ['#E4572E', '#2A9D8F', '#3A6EA5', '#B5651D', '#8E5BA8', '#4C9F38', '#D1495B', '#6B7280'];
  var REPEATS = [['none', 'Does not repeat'], ['daily', 'Every day'], ['weekly', 'Every week'], ['fortnightly', 'Every two weeks'], ['monthly', 'Every month'], ['yearly', 'Every year']];

  /* number of days one occurrence spans, minus one */
  function spanOf(ev) { return ev.endDate && isDate(ev.endDate) && ev.endDate >= ev.date ? diff(ev.date, ev.endDate) : 0; }

  /* start dates of every occurrence that touches the window [from, to] */
  function occurrenceStarts(ev, from, to) {
    var len = spanOf(ev), res = [];
    if (!isDate(ev.date)) return res;
    if (!ev.repeat || ev.repeat === 'none') {
      if (ev.date <= to && add(ev.date, len) >= from) res.push(ev.date);
      return res;
    }
    var hardEnd = ev.until && isDate(ev.until) && ev.until < to ? ev.until : to;
    var lowStart = add(from, -len);
    var d, k;
    if (ev.repeat === 'daily' || ev.repeat === 'weekly' || ev.repeat === 'fortnightly') {
      var step = ev.repeat === 'daily' ? 1 : ev.repeat === 'weekly' ? 7 : 14;
      k = lowStart > ev.date ? Math.ceil(diff(ev.date, lowStart) / step) : 0;
      for (d = add(ev.date, k * step); d <= hardEnd; d = add(d, step)) res.push(d);
      return res;
    }
    if (ev.repeat === 'monthly') {
      var day = +ev.date.slice(8), cursor = lowStart > ev.date ? monthStart(lowStart) : monthStart(ev.date);
      for (var g = 0; g < 1200 && cursor <= hardEnd; g++) {
        var y = +cursor.slice(0, 4), m = +cursor.slice(5, 7);
        if (day <= daysInMonth(y, m)) {
          d = y + '-' + pad(m) + '-' + pad(day);
          if (d >= ev.date && d <= hardEnd && add(d, len) >= from) res.push(d);
        }
        cursor = addMonths(cursor, 1);
      }
      return res;
    }
    if (ev.repeat === 'yearly') {
      var mm = ev.date.slice(5, 7), dd = ev.date.slice(8);
      for (var yr = Math.max(+ev.date.slice(0, 4), +lowStart.slice(0, 4) - 1); yr <= +hardEnd.slice(0, 4); yr++) {
        if (mm === '02' && dd === '29' && daysInMonth(yr, 2) < 29) continue;
        d = yr + '-' + mm + '-' + dd;
        if (d >= ev.date && d <= hardEnd && add(d, len) >= from) res.push(d);
      }
    }
    return res;
  }

  function startMinutes(data) { return data.allDay || !data.start ? -1 : +data.start.slice(0, 2) * 60 + +data.start.slice(3, 5); }

  /* map of date -> occurrences, for every day in [from, to].
     events is an array of { id, data, deleted }. keep is an optional filter on the event data. */
  function byDate(events, from, to, keep) {
    var out = {};
    events.forEach(function (e) {
      if (e.deleted || !e.data || !e.data.title) return;
      if (keep && !keep(e.data)) return;
      var len = spanOf(e.data);
      occurrenceStarts(e.data, from, to).forEach(function (start) {
        var end = add(start, len);
        for (var i = 0; i <= len; i++) {
          var day = add(start, i);
          if (day < from || day > to) continue;
          (out[day] = out[day] || []).push({ id: e.id, data: e.data, date: day, start: start, end: end, first: i === 0, last: i === len, key: e.id + ':' + start });
        }
      });
    });
    Object.keys(out).forEach(function (d) {
      out[d].sort(function (a, b) {
        return startMinutes(a.data) - startMinutes(b.data) || (a.data.title || '').localeCompare(b.data.title || '');
      });
    });
    return out;
  }

  /* the text shown for the time of an occurrence on a given day */
  function timeLabel(o) {
    var d = o.data;
    if (d.allDay) return 'All day';
    if (!d.start) return '';
    if (o.start === o.end) return d.start + (d.end && d.end !== d.start ? '–' + d.end : '');
    if (o.first) return 'From ' + d.start;
    if (o.last) return 'Until ' + (d.end || d.start);
    return 'All day';
  }

  /* next occurrences from today onwards, soonest first. now is the current time as HH:MM. */
  function upcoming(events, today, now, limit, horizon) {
    var to = add(today, horizon || 180), map = byDate(events, today, to), list = [];
    Object.keys(map).sort().forEach(function (day) {
      map[day].forEach(function (o) {
        if (day === today && !o.data.allDay && o.data.end && o.last && o.start === o.end && o.data.end < now) return;
        if (o.first || day === today) list.push(o);
      });
    });
    return list.slice(0, limit || 50);
  }

  /* for each of the next n days: free, evening (everything finishes by 17:30) or busy */
  function freeTogether(events, from, n) {
    var to = add(from, n - 1), map = byDate(events, from, to), res = [];
    for (var i = 0; i < n; i++) {
      var day = add(from, i), occ = map[day] || [], status = 'free';
      if (occ.length) {
        status = occ.every(function (o) { return !o.data.allDay && o.start === o.end && (o.data.end || o.data.start || '99:99') <= '17:30'; }) ? 'evening' : 'busy';
      }
      res.push({ date: day, status: status, count: occ.length });
    }
    return res;
  }

  /* text colour that stays readable on a person's colour */
  function inkOn(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#15181D' : '#FFFFFF';
  }

  /* turn form input into a clean, storable event, or return an error message */
  function cleanEvent(raw) {
    var title = String(raw.title || '').trim().slice(0, 120);
    if (!title) return { error: 'Please give the event a title.' };
    if (!isDate(raw.date)) return { error: 'Please choose a date.' };
    var d = { title: title, date: raw.date, allDay: !!raw.allDay };
    if (isDate(raw.endDate) && raw.endDate > raw.date) d.endDate = raw.endDate;
    if (!d.allDay) {
      d.start = /^\d{2}:\d{2}$/.test(raw.start || '') ? raw.start : '09:00';
      d.end = /^\d{2}:\d{2}$/.test(raw.end || '') ? raw.end : d.start;
      if (!d.endDate && d.end < d.start) return { error: 'The event ends before it starts. Please check the times.' };
    }
    d.who = Array.isArray(raw.who) ? raw.who.filter(Boolean).slice(0, 12) : [];
    var rep = raw.repeat;
    if (['daily', 'weekly', 'fortnightly', 'monthly', 'yearly'].indexOf(rep) >= 0) {
      d.repeat = rep;
      if (isDate(raw.until) && raw.until >= raw.date) d.until = raw.until;
    }
    if (raw.place) d.place = String(raw.place).trim().slice(0, 120);
    if (raw.notes) d.notes = String(raw.notes).trim().slice(0, 1500);
    if (raw.by) d.by = raw.by;
    return { data: d };
  }

  return {
    pad: pad, isDate: isDate, parse: parse, fmt: fmt, add: add, diff: diff, dow: dow, monday: monday, monthStart: monthStart,
    addMonths: addMonths, daysInMonth: daysInMonth, PALETTE: PALETTE, REPEATS: REPEATS, occurrenceStarts: occurrenceStarts,
    byDate: byDate, timeLabel: timeLabel, upcoming: upcoming, freeTogether: freeTogether, inkOn: inkOn, cleanEvent: cleanEvent,
    startMinutes: startMinutes
  };
});
