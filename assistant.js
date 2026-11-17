/* Tandem assistant. Turns a sentence such as "dentist next friday at 3pm" into an event, or a question such as
   "what is on tomorrow" into a range of days. It needs no network and no model, so it works on every device.
   The chat window can hand the same sentence to a model running on the person's own computer for harder wording.
   Built by Daniel Chidi, Founder, Adachi Industries. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.TandemAssistant = factory(root.TandemCore);
})(typeof self !== 'undefined' ? self : this, function (C) {
  var pad = C.pad;
  var DAYS = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
  var DAY_RE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tues|thurs|thur|sun|mon|tue|wed|thu|fri|sat)';
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  var MON_RE = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';

  function upcoming(today, dow, strict) { var d = (dow - C.dow(today) + 7) % 7; if (d === 0 && strict) d = 7; return C.add(today, d); }
  function mk(y, m, d) { var s = y + '-' + pad(m) + '-' + pad(d); var t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? s : null; }
  function cut(t, m) { return (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/\s+/g, ' '); }

  /* ---------- times ---------- */
  function hour(h, ap, hint) {
    h = +h;
    if (ap === 'pm' && h < 12) h += 12; else if (ap === 'am' && h === 12) h = 0;
    else if (!ap && h >= 1 && h <= 7) h += 12;
    return h;
  }
  function hm(h, m) { return pad(h) + ':' + pad(m || 0); }
  function findTimes(t) {
    var m, out = { start: '', end: '', text: t };
    /* a range */
    m = /\b(?:from\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|to|until|till)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/.exec(t);
    if (m && (m[3] || m[6] || m[2] || m[5] || /\bfrom\s*$/.test(t.slice(0, m.index + 5)) || /^from/.test(m[0]))) {
      var a1 = m[3] || m[6] || '', a2 = m[6] || m[3] || '';
      var s = hour(m[1], a1), e = hour(m[4], a2);
      if (!m[3] && m[6] && s > e) s -= 12;
      if (s < 24 && e < 24) { out.start = hm(s, +m[2] || 0); out.end = hm(e, +m[5] || 0); out.text = cut(t, m); return out; }
    }
    m = /\b(?:at|@|around|by|from|starting)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/.exec(t)
      || /\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/.exec(t) || /\b(\d{1,2})()\s*(am|pm)\b/.exec(t);
    if (m && +m[1] < 24 && (!m[2] || +m[2] < 60)) { out.start = hm(hour(m[1], m[3]), +m[2] || 0); out.text = cut(t, m); return out; }
    m = /\b(noon|midday)\b/.exec(t);
    if (m) { out.start = '12:00'; out.text = cut(t, m); }
    return out;
  }
  function findDuration(t) {
    var m = /\bfor\s+(\d+(?:\.\d+)?|an?|half an?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/.exec(t);
    if (!m) return { mins: 0, text: t };
    var n = /^an?$/.test(m[1]) ? 1 : /^half/.test(m[1]) ? 0.5 : parseFloat(m[1]);
    return { mins: Math.round(/^h/.test(m[2]) ? n * 60 : n), text: cut(t, m) };
  }

  /* ---------- dates ---------- */
  function findDate(t, today) {
    var m, y = +today.slice(0, 4), found = null;
    function yearFor(mo, d, explicit) { if (explicit) return explicit; var s = mk(y, mo, d); return s && s < today ? mk(y + 1, mo, d) : s; }
    if ((m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t))) found = { date: mk(+m[1], +m[2], +m[3]), m: m };
    else if ((m = /\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{4}|\d{2}))?\b/.exec(t)) && +m[2] <= 12 && +m[1] <= 31) {
      var yy = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : 0;
      found = { date: yy ? mk(yy, +m[2], +m[1]) : yearFor(+m[2], +m[1]), m: m };
    }
    else if ((m = new RegExp('\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + MON_RE + '(?:\\s+(\\d{4}))?\\b').exec(t))) found = { date: yearFor(MONTHS[m[2].slice(0, 3)], +m[1], m[3] ? +m[3] : 0), m: m };
    else if ((m = new RegExp('\\b' + MON_RE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b').exec(t))) found = { date: yearFor(MONTHS[m[1].slice(0, 3)], +m[2], m[3] ? +m[3] : 0), m: m };
    else if ((m = /\bday after tomorrow\b/.exec(t))) found = { date: C.add(today, 2), m: m };
    else if ((m = /\b(?:tomorrow|tmrw|tmr)\b/.exec(t))) found = { date: C.add(today, 1), m: m };
    else if ((m = /\b(today|tonight|this evening)\b/.exec(t))) found = { date: today, m: m, tonight: /tonight|evening/.test(m[1]) };
    else if ((m = /\bin\s+(\d+|a|an|one|two|three)\s+(day|days|week|weeks|month|months)\b/.exec(t))) {
      var n = { a: 1, an: 1, one: 1, two: 2, three: 3 }[m[1]] || +m[1];
      found = { date: /^month/.test(m[2]) ? C.addMonths(today, n) : C.add(today, n * (/^week/.test(m[2]) ? 7 : 1)), m: m };
    }
    else if ((m = new RegExp('\\b(next|this|on|coming)?\\s*' + DAY_RE + '\\b').exec(t))) {
      var dow = DAYS[m[2]], d = upcoming(today, dow, true);
      if (m[1] === 'next' && C.diff(C.monday(today), C.monday(d)) === 0) d = C.add(d, 7);
      found = { date: d, m: m, weekday: dow };
    }
    else if ((m = /\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)\b/.exec(t)) || (m = /\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/.exec(t))) {
      var mo = +today.slice(5, 7), s2 = mk(y, mo, +m[1]);
      if (!s2 || s2 < today) { var nm = mo === 12 ? [y + 1, 1] : [y, mo + 1]; s2 = mk(nm[0], nm[1], +m[1]); }
      found = { date: s2, m: m };
    }
    if (!found || !found.date) return { date: '', text: t };
    found.text = cut(t, found.m);
    return found;
  }

  /* ---------- the sentence ---------- */
  var FILLER = /^(?:(?:please|hey|hi|otto|can you|could you|would you|i need to|i have to|i want to|i would like to|i'd like to|i have|i've got|i got|i am|i'm|there is|there's|we have|we are|let's|lets|just)\s+)+/;
  var VERBS = /^(?:add|schedule|book|put|create|set up|setup|plan|remind me to|remind me|reserve|log|enter|note|make|block out|block)\s+(?:in\s+|a\s+|an\s+|the\s+|my\s+)*/;
  var TAIL = /\s+(?:to|in|on|into)\s+(?:my|the|our)\s+(?:calendar|diary|schedule|agenda)\b/;

  function tidyTitle(s) {
    s = s.replace(TAIL, ' ').replace(/[,.;!?]+/g, ' ').replace(/\s+/g, ' ').trim();
    var prev;
    do { prev = s; s = s.replace(FILLER, '').replace(VERBS, '').trim(); } while (s !== prev);
    s = s.replace(/^(?:on|at|for|from|to|in|by|the|a|an|and|then|every|each|until|till)\s+/g, '').replace(/\s+(?:on|at|for|from|to|in|by|the|a|an|and|every|each|until|till|next|this)$/g, '').trim();
    s = s.replace(/\bmy\b/g, 'my');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  /* the sentence is matched in lower case, so names get their capitals back from what the person typed */
  function restoreCase(title, original) {
    var words = {};
    String(original).replace(/[A-Za-z][A-Za-z'\-]*/g, function (w) { if (w !== w.toLowerCase() || w === 'I') words[w.toLowerCase()] = w; return w; });
    return title.split(' ').map(function (w, i) { return words[w.toLowerCase()] && i > 0 ? words[w.toLowerCase()] : w; }).join(' ');
  }

  function parseWho(t, ctx) {
    var members = ctx.members || [], names = {}, me = ctx.me;
    members.forEach(function (m) { names[String(m.name).toLowerCase().split(' ')[0]] = m.id; });
    var m = /\bfor\s+((?:[a-z]+)(?:\s*(?:,|and|&)\s*[a-z]+)*)\b/.exec(t);
    if (!m) return { who: [me], text: t, set: false };
    var parts = m[1].split(/\s*(?:,|and|&)\s*/), ids = [], ok = true, everyone = false;
    parts.forEach(function (p) {
      if (p === 'me' || p === 'myself') ids.push(me);
      else if (p === 'us' || p === 'everyone' || p === 'both' || p === 'all') everyone = true;
      else if (names[p]) ids.push(names[p]);
      else ok = false;
    });
    if (!ok || (!ids.length && !everyone)) return { who: [me], text: t, set: false };
    return { who: everyone ? [] : ids.filter(function (x, i, a) { return a.indexOf(x) === i; }), text: cut(t, m), set: true };
  }

  function parseRepeat(t, today) {
    var m, out = { repeat: '', until: '', weekday: -1, text: t };
    if ((m = new RegExp('\\bevery\\s+(?:other\\s+)?' + DAY_RE + '\\b').exec(t))) { out.repeat = /other/.test(m[0]) ? 'fortnightly' : 'weekly'; out.weekday = DAYS[m[1]]; out.text = cut(t, m); }
    else if ((m = /\bevery\s+(weekday|day|week|fortnight|month|year)\b|\b(daily|weekly|fortnightly|monthly|yearly)\b|\bevery\s+other\s+week\b/.exec(t))) {
      var w = m[1] || m[2] || 'fortnight';
      out.repeat = { weekday: 'daily', day: 'daily', week: 'weekly', fortnight: 'fortnightly', month: 'monthly', year: 'yearly', daily: 'daily', weekly: 'weekly', fortnightly: 'fortnightly', monthly: 'monthly', yearly: 'yearly' }[w] || 'weekly';
      out.text = cut(t, m);
    }
    if (out.repeat) {
      var u = /\b(?:until|till|up to|through)\s+(.+)$/.exec(out.text);
      if (u) { var d = findDate(u[1], today); if (d.date) { out.until = d.date; out.text = out.text.slice(0, u.index); } }
    }
    return out;
  }

  var ADD_RE = /\b(add|schedule|book|put|create|set up|setup|plan|remind me|reserve|log|enter|block out)\b/;
  var SHOW_RE = /\b(what(?:'s|s| is| are| do)?|show|list|tell me|do i have|have i got|am i busy|any(?:thing| plans| events)?|agenda|what's on|whats on)\b/;
  var FREE_RE = /\b(free|available|availability|spare|gaps?|when can|when could|when am i)\b/;

  function parse(text, ctx) {
    ctx = ctx || {};
    var today = ctx.today, original = String(text || '').trim();
    var t = ' ' + original.toLowerCase().replace(/[’]/g, "'") + ' ';
    t = t.replace(/\s+/g, ' ');
    if (!original) return { intent: 'unknown' };
    if (/^\s*(hi|hello|hey|help|what can you do|how do you work)\b/.test(t) && t.length < 40) return { intent: 'help' };

    if (FREE_RE.test(t) && !ADD_RE.test(t)) {
      var nextWeek = /\bnext week\b/.test(t), from = nextWeek ? C.add(C.monday(today), 7) : today;
      return { intent: 'free', from: from, days: 7, label: nextWeek ? 'next week' : 'the next seven days' };
    }
    var whoR = parseWho(t, ctx); t = whoR.text;
    var rep = parseRepeat(t, today); t = rep.text;
    var dur = findDuration(t); t = dur.text;
    var tm = findTimes(t); t = tm.text;
    var dt = findDate(t, today); t = dt.text;
    var hasDate = !!dt.date, hasTime = !!tm.start;

    var isShow = SHOW_RE.test(' ' + original.toLowerCase() + ' ') && !ADD_RE.test(t) && /\?|^\s*(what|show|list|tell|do i|have i|am i|any)/.test(original.toLowerCase());
    if (isShow) {
      var lower = original.toLowerCase(), from2 = dt.date || today, to2 = from2, label = '';
      if (/\bnext week\b/.test(lower)) { from2 = C.add(C.monday(today), 7); to2 = C.add(from2, 6); label = 'next week'; }
      else if (/\bthis week\b|\bthe week\b|\bthis coming week\b/.test(lower)) { from2 = C.monday(today); to2 = C.add(from2, 6); label = 'this week'; }
      else if (/\bthis month\b/.test(lower)) { from2 = today; to2 = C.add(C.addMonths(C.monthStart(today), 1), -1); label = 'this month'; }
      else if (/\bnext month\b/.test(lower)) { from2 = C.addMonths(C.monthStart(today), 1); to2 = C.add(C.addMonths(from2, 1), -1); label = 'next month'; }
      return { intent: 'show', from: from2, to: to2, label: label };
    }

    if (!hasDate && !hasTime && !rep.repeat && !ADD_RE.test(' ' + original.toLowerCase() + ' ')) return { intent: 'unknown' };

    var date = dt.date;
    if (rep.repeat && rep.weekday >= 0 && !date) date = upcoming(today, rep.weekday, false);
    if (!date && hasTime) date = today;
    var title = tidyTitle(t.replace(/\b(next|this|on|at)\s*$/g, ''));
    if (!title) return { intent: 'ask', ask: 'title', date: date, start: tm.start };
    if (!date) return { intent: 'ask', ask: 'date', title: title };

    var ev = { title: restoreCase(title, original), date: date, who: whoR.who };
    var notes = [];
    var low = (title + ' ' + original).toLowerCase();
    if (!tm.start && dt.tonight) tm.start = '19:00';
    if (!tm.start && /\blunch\b/.test(low) && !/\ball day\b/.test(low)) { tm.start = '12:30'; notes.push('I took lunch to be at 12:30.'); }
    if (!tm.start && /\b(morning)\b/.test(low)) tm.start = '09:00';
    if (!tm.start && /\b(afternoon)\b/.test(low)) tm.start = '14:00';
    if (!tm.start && /\b(evening)\b/.test(low)) tm.start = '19:00';
    if (/\ball[- ]day\b/.test(low) || !tm.start) {
      ev.allDay = true;
      ev.title = tidyTitle(ev.title.replace(/\ball[- ]day\b/i, ''));
      if (!/\ball[- ]day\b/.test(low)) notes.push('I made it an all day event because you gave no time. Tell me a time if you want one.');
    } else {
      ev.allDay = false; ev.start = tm.start;
      if (tm.end) ev.end = tm.end;
      else { var sm = +tm.start.slice(0, 2) * 60 + +tm.start.slice(3), em = Math.min(sm + (dur.mins || 60), 1439); ev.end = hm(Math.floor(em / 60), em % 60); }
    }
    if (rep.repeat) { ev.repeat = rep.repeat; if (rep.until) ev.until = rep.until; }
    var at = /\bat\s+(?:the\s+)?([A-Z][\w' ]{2,40})$/.exec(original.trim().replace(/[.!?]+$/, ''));
    if (at && /^[A-Z]/.test(at[1]) && !/\d/.test(at[1])) { ev.place = at[1].trim(); ev.title = tidyTitle(ev.title.replace(new RegExp('\\s+at\\s+' + at[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'), '')) || ev.title; }
    return { intent: 'add', events: [ev], notes: notes };
  }

  return { parse: parse, findTimes: findTimes, findDate: findDate, tidyTitle: tidyTitle };
});
