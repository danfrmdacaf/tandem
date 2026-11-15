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
  function byDate(events, from, to, keep, occKeep) {
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
          var o = { id: e.id, data: e.data, date: day, start: start, end: end, first: i === 0, last: i === len, key: e.id + ':' + start };
          if (occKeep && !occKeep(o)) continue;
          (out[day] = out[day] || []).push(o);
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
  function upcoming(events, today, now, limit, horizon, occKeep) {
    var to = add(today, horizon || 180), map = byDate(events, today, to, null, occKeep), list = [];
    Object.keys(map).sort().forEach(function (day) {
      map[day].forEach(function (o) {
        if (day === today && !o.data.allDay && o.data.end && o.last && o.start === o.end && o.data.end < now) return;
        if (o.first || day === today) list.push(o);
      });
    });
    return list.slice(0, limit || 50);
  }

  /* for each of the next n days: free, evening (everything finishes by 17:30) or busy */
  function freeTogether(events, from, n, occKeep) {
    var to = add(from, n - 1), map = byDate(events, from, to, null, occKeep), res = [];
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
    /* where an event came from, and travel details */
    if (raw.imp) { d.imp = String(raw.imp).slice(0, 24); if (raw.impn) d.impn = String(raw.impn).slice(0, 60); }
    if (raw.trip && typeof raw.trip === 'object') {
      var t = {};
      ['mode', 'from', 'to', 'dep', 'arr', 'arrDate', 'ref', 'seat', 'carrier', 'cls'].forEach(function (k) { if (raw.trip[k]) t[k] = String(raw.trip[k]).trim().slice(0, 80); });
      if (Object.keys(t).length) d.trip = t;
    }
    if (raw.att && typeof raw.att === 'object' && raw.att.id) {
      d.att = { id: String(raw.att.id).slice(0, 40), name: String(raw.att.name || 'Ticket').slice(0, 120), type: String(raw.att.type || '').slice(0, 80) };
      if (raw.att.by) d.att.by = String(raw.att.by).slice(0, 64);
    }
    return { data: d };
  }

  /* ---------- personal rules: hide an event, or mark it optional ----------
     A rule only changes what one person sees. It never changes the event itself, so it never reaches anyone else.
     rule = { id, room, mode: 'hide' | 'optional', ev?, day?, title?, after?, before?, days? }
     Every field that is present has to match. A rule with none of ev, title, after or before matches nothing. */
  function normTitle(t) { return String(t || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
  function ruleMatches(rule, roomId, o) {
    if (!rule || rule.gone || (rule.room && rule.room !== '*' && rule.room !== roomId)) return false;
    var has = false, d = o.data || {};
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
  /* 'hide', 'optional' or null. Hiding wins over optional. */
  function ruleStatus(rules, roomId, o) {
    var st = null;
    for (var i = 0; i < rules.length; i++) {
      if (ruleMatches(rules[i], roomId, o)) { if (rules[i].mode === 'hide') return 'hide'; st = 'optional'; }
    }
    return st;
  }
  var DAYSETS = { all: null, weekdays: [1, 2, 3, 4, 5], weekend: [0, 6] };
  function describeRule(r, dowNames) {
    var parts = [];
    if (r.title && !r.ev) parts.push('every event called \u201c' + (r.label || r.title) + '\u201d');
    else if (r.ev) parts.push((r.label ? '\u201c' + r.label + '\u201d' : 'one event') + (r.day ? ' on ' + r.day.split('-').reverse().join('/') : ', every time it repeats'));
    else parts.push('every event');
    if (r.after && r.before) parts.push('starting from ' + r.after + ' until ' + r.before);
    else if (r.after) parts.push('starting at or after ' + r.after);
    else if (r.before) parts.push('starting before ' + r.before);
    if (r.days && r.days.length && r.days.length < 7) parts.push('on ' + r.days.map(function (x) { return (dowNames || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])[x]; }).join(', '));
    return parts.join(' ');
  }

  /* ---------- reading calendar files (iCalendar) ----------
     Returns { events: [{ id, data }], skipped, simplified, truncated }. The ids are stable, built from the
     identifier and start of each event, so importing the same file again updates the events instead of
     duplicating them. Times written in UTC are converted to the time zone of the device. Times that carry
     a named time zone or none are read as local time. */
  function unesc(s) { return String(s || '').replace(/\\([nN,;\\])/g, function (m, c) { return c === 'n' || c === 'N' ? '\n' : c; }); }
  function hash64(s) {
    var a = 0x811c9dc5, b = 0x9e3779b9;
    for (var i = 0; i < s.length; i++) {
      a = Math.imul(a ^ s.charCodeAt(i), 16777619);
      b = Math.imul(b ^ s.charCodeAt(i), 2246822519); b ^= b >>> 13;
    }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36);
  }
  function parseStamp(v) {
    var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(v || '').trim());
    if (!m) return null;
    if (m[4] === undefined) return { date: m[1] + '-' + m[2] + '-' + m[3], time: null };
    if (m[7]) {
      var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
      return { date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), time: pad(d.getHours()) + ':' + pad(d.getMinutes()) };
    }
    return { date: m[1] + '-' + m[2] + '-' + m[3], time: m[4] + ':' + m[5] };
  }
  function durationMinutes(v) {
    var m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v || '').trim());
    if (!m) return null;
    return (+m[1] || 0) * 10080 + (+m[2] || 0) * 1440 + (+m[3] || 0) * 60 + (+m[4] || 0);
  }
  var ICS_DAYS = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };

  function parseICS(text, opts) {
    var max = (opts && opts.max) || 1000;
    var lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    var out = [], skipped = 0, simplified = 0, truncated = false, inEv = false, inAlarm = false, props = null;

    function handle(list) {
      var p = {};
      list.forEach(function (x) { if (!(x.name in p)) p[x.name] = x; });
      if (!p.DTSTART || !p.SUMMARY || p['RECURRENCE-ID'] || (p.STATUS && /cancel/i.test(p.STATUS.value))) { skipped++; return; }
      var title = unesc(p.SUMMARY.value).trim();
      var st = parseStamp(p.DTSTART.value);
      if (!title || !st) { skipped++; return; }
      var raw = { title: title, date: st.date, allDay: st.time === null };
      var en = p.DTEND ? parseStamp(p.DTEND.value) : null;
      var mins = p.DURATION ? durationMinutes(p.DURATION.value) : null;
      if (raw.allDay) {
        if (en && en.date > st.date) raw.endDate = add(en.date, -1);
        else if (mins && mins >= 2880) raw.endDate = add(st.date, Math.ceil(mins / 1440) - 1);
      } else {
        raw.start = st.time;
        if (en && en.time !== null) {
          if (en.date > st.date) {
            if (en.date === add(st.date, 1) && en.time === '00:00') raw.end = '23:59';
            else { raw.endDate = en.date; raw.end = en.time; }
          } else raw.end = en.time < st.time ? st.time : en.time;
        } else if (mins !== null) {
          var t = Date.UTC(+st.date.slice(0, 4), +st.date.slice(5, 7) - 1, +st.date.slice(8), +st.time.slice(0, 2), +st.time.slice(3), 0) + mins * 60000;
          var e = new Date(t), ed = e.getUTCFullYear() + '-' + pad(e.getUTCMonth() + 1) + '-' + pad(e.getUTCDate()), et = pad(e.getUTCHours()) + ':' + pad(e.getUTCMinutes());
          if (ed > st.date) { if (ed === add(st.date, 1) && et === '00:00') raw.end = '23:59'; else { raw.endDate = ed; raw.end = et; } } else raw.end = et;
        } else raw.end = st.time;
      }
      if (p.LOCATION) raw.place = unesc(p.LOCATION.value);
      if (p.DESCRIPTION) raw.notes = unesc(p.DESCRIPTION.value);
      var base = cleanEvent(raw);
      if (base.error) { skipped++; return; }
      base = base.data;
      var span = spanOf(base);

      /* the repeat rule, as far as Tandem can express it */
      var rule = {};
      if (p.RRULE) p.RRULE.value.split(';').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) rule[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1); });
      var interval = +rule.INTERVAL || 1, repeat = null, variants = [{ suffix: '', date: base.date }], ok = true, f = rule.FREQ;
      if (f) {
        var days = rule.BYDAY ? rule.BYDAY.toUpperCase().split(',') : null;
        var plain = !rule.BYMONTHDAY && !rule.BYSETPOS && !rule.BYYEARDAY && !rule.BYWEEKNO;
        if (!plain) ok = false;
        else if (f === 'DAILY' && interval === 1 && !days && !rule.BYMONTH) repeat = 'daily';
        else if (f === 'WEEKLY' && (interval === 1 || interval === 2) && !rule.BYMONTH) {
          repeat = interval === 1 ? 'weekly' : 'fortnightly';
          if (days) {
            var uniq = days.filter(function (x, i) { return days.indexOf(x) === i; });
            if (!uniq.every(function (x) { return x in ICS_DAYS; })) ok = false;
            else if (!(uniq.length === 1 && ICS_DAYS[uniq[0]] === (dow(base.date) + 6) % 7)) {
              var startIdx = (dow(base.date) + 6) % 7;
              variants = uniq.map(function (x) {
                var off = ICS_DAYS[x] - startIdx;
                return { suffix: x, date: add(base.date, off >= 0 ? off : off + 7 * interval) };
              }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
            }
          }
        }
        else if (f === 'MONTHLY' && interval === 1 && !days && !rule.BYMONTH) repeat = 'monthly';
        else if (f === 'YEARLY' && interval === 1 && !days && !rule.BYMONTH) repeat = 'yearly';
        else ok = false;
        if (!ok) { repeat = null; variants = [{ suffix: '', date: base.date }]; simplified++; }
      }
      var until = null;
      if (repeat && rule.UNTIL) { var us = parseStamp(rule.UNTIL); if (us) until = us.date; }
      if (repeat && rule.COUNT && !until) {
        var n = Math.min(+rule.COUNT || 0, 1000), all = [];
        variants.forEach(function (v) { occurrenceStarts({ date: v.date, repeat: repeat }, v.date, add(v.date, 3700)).forEach(function (d) { all.push(d); }); });
        all.sort();
        if (n > 0 && all.length) until = all[Math.min(n, all.length) - 1];
      }
      if (p.EXDATE) simplified++;

      variants.forEach(function (v) {
        if (until && v.date > until) return;
        if (out.length >= max) { truncated = true; return; }
        var data = Object.assign({}, base, { date: v.date });
        delete data.endDate;
        if (span > 0) data.endDate = add(v.date, span);
        if (repeat) { data.repeat = repeat; if (until) data.until = until; }
        out.push({ id: 'i' + hash64([p.UID ? p.UID.value : title, p.DTSTART.value, v.suffix].join('|')), data: data });
      });
    }

    for (var li = 0; li < lines.length; li++) {
      var ln = lines[li];
      if (ln === 'BEGIN:VEVENT') { inEv = true; inAlarm = false; props = []; continue; }
      if (ln === 'END:VEVENT') { if (props) handle(props); inEv = false; props = null; continue; }
      if (!inEv) continue;
      if (ln === 'BEGIN:VALARM') { inAlarm = true; continue; }
      if (ln === 'END:VALARM') { inAlarm = false; continue; }
      if (inAlarm || !ln) continue;
      var c = ln.indexOf(':'); if (c < 1) continue;
      props.push({ name: ln.slice(0, c).split(';')[0].toUpperCase(), value: ln.slice(c + 1) });
    }
    return { events: out, skipped: skipped, simplified: simplified, truncated: truncated };
  }


  /* ---------- writing a calendar file (iCalendar) ---------- */
  function icsEsc(t) { return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function foldLine(line) {
    var out = '', cur = '', bytes = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], cp = line.codePointAt(i), n = cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
      if (cp > 65535) { ch = line.slice(i, i + 2); i++; }
      if (bytes + n > 74) { out += cur + '\r\n '; cur = ch; bytes = 1 + n; } else { cur += ch; bytes += n; }
    }
    return out + cur;
  }
  /* events: [{ id, data, deleted }], members: { id: name } */
  function toICS(name, events, members) {
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Adachi Industries//Tandem//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEsc(name || 'Tandem')];
    var RR = { daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', fortnightly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };
    var cd = function (d) { return d.replace(/-/g, ''); };
    events.forEach(function (e) {
      var d = e.data; if (e.deleted || !d || !d.title || !isDate(d.date)) return;
      var end = d.endDate && isDate(d.endDate) && d.endDate >= d.date ? d.endDate : d.date;
      L.push('BEGIN:VEVENT', 'UID:' + e.id + '@tandem.adachiindustries', 'DTSTAMP:' + stamp, 'SUMMARY:' + icsEsc(d.title));
      if (d.allDay) L.push('DTSTART;VALUE=DATE:' + cd(d.date), 'DTEND;VALUE=DATE:' + cd(add(end, 1)));
      else L.push('DTSTART:' + cd(d.date) + 'T' + (d.start || '09:00').replace(':', '') + '00', 'DTEND:' + cd(end) + 'T' + (d.end || d.start || '09:00').replace(':', '') + '00');
      if (RR[d.repeat]) L.push('RRULE:' + RR[d.repeat] + (d.until && isDate(d.until) ? ';UNTIL=' + cd(d.until) + (d.allDay ? '' : 'T235959') : ''));
      var who = (d.who || []).map(function (m) { return members && members[m]; }).filter(Boolean).join(' and ');
      var desc = [who ? 'For: ' + who : '', d.notes || ''].filter(Boolean).join('\n');
      if (desc) L.push('DESCRIPTION:' + icsEsc(desc));
      if (d.place) L.push('LOCATION:' + icsEsc(d.place));
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.map(foldLine).join('\r\n') + '\r\n';
  }

  return {
    toICS: toICS, parseICS: parseICS, ruleMatches: ruleMatches, ruleStatus: ruleStatus, normTitle: normTitle, describeRule: describeRule, DAYSETS: DAYSETS, hash64: hash64,
    pad: pad, isDate: isDate, parse: parse, fmt: fmt, add: add, diff: diff, dow: dow, monday: monday, monthStart: monthStart,
    addMonths: addMonths, daysInMonth: daysInMonth, PALETTE: PALETTE, REPEATS: REPEATS, occurrenceStarts: occurrenceStarts,
    byDate: byDate, timeLabel: timeLabel, upcoming: upcoming, freeTogether: freeTogether, inkOn: inkOn, cleanEvent: cleanEvent,
    startMinutes: startMinutes
  };
});
