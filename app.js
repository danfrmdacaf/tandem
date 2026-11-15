/* Tandem. A shared calendar for two people or a small group.
   Built by Daniel Chidi, Founder, Adachi Industries.

   The browser keeps a full copy of each calendar on the device, so it works offline. Changes are sent to a
   small server function, which stores them and returns what other people changed. */
(function () {
'use strict';
var C = window.TandemCore;
var API = (window.TANDEM_CONFIG || {}).api;

/* ---------- helpers ---------- */
var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function localToday() { var n = new Date(); return n.getFullYear() + '-' + C.pad(n.getMonth() + 1) + '-' + C.pad(n.getDate()); }
function nowHM() { var n = new Date(); return C.pad(n.getHours()) + ':' + C.pad(n.getMinutes()); }
function dayName(d) { return DOW[C.dow(d)]; }
function niceDate(d) { return dayName(d) + ' ' + (+d.slice(8)) + ' ' + MONTHS[+d.slice(5, 7) - 1]; }
function relDay(d, today) {
  var n = C.diff(today, d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n > 1 && n < 7) return dayName(d);
  return DOW3[C.dow(d)] + ' ' + (+d.slice(8)) + ' ' + MONTHS[+d.slice(5, 7) - 1];
}
var ICON = {
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>'
};

/* ---------- storage ---------- */
var LS_KEY = 'tandem.v1';
function defaultWidgets() {
  return [
    { id: 'w1', type: 'today', size: 'm', style: 'plain' },
    { id: 'w2', type: 'countdown', size: 's', style: 'bold' },
    { id: 'w3', type: 'next', size: 's', style: 'outline' },
    { id: 'w4', type: 'week', size: 'l', style: 'plain' },
    { id: 'w5', type: 'free', size: 'm', style: 'plain' },
    { id: 'w6', type: 'month', size: 'l', style: 'outline' }
  ];
}
function blank() { return { rooms: [], active: null, data: {}, device: { view: 'home', widgets: defaultWidgets(), hidden: {} } }; }
function load() {
  try {
    var j = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (j && j.rooms) { var b = blank(); j.device = Object.assign(b.device, j.device || {}); j.data = j.data || {}; return j; }
  } catch (e) { /* storage unavailable */ }
  return blank();
}
var S = load();
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
function R(id) {
  var d = S.data[id];
  if (!d) d = S.data[id] = { meta: { name: 'Calendar', v: 0 }, members: {}, events: {}, outbox: [], since: null };
  return d;
}
function activeRoom() { return S.rooms.filter(function (r) { return r.id === S.active; })[0] || null; }
var lastV = 0;
function nextV() { lastV = Math.max(Date.now(), lastV + 1); return lastV; }

/* ---------- data selectors ---------- */
function members() {
  var rm = activeRoom(); if (!rm) return [];
  var d = R(rm.id);
  return Object.keys(d.members).filter(function (id) { return !d.members[id].deleted; }).map(function (id) {
    return { id: id, name: d.members[id].name || 'Someone', colour: d.members[id].colour || C.PALETTE[7] };
  }).sort(function (a, b) { return (a.id === rm.me ? -1 : b.id === rm.me ? 1 : 0) || a.name.localeCompare(b.name); });
}
function memberMap() { var m = {}; members().forEach(function (x) { m[x.id] = x; }); return m; }
function myColour() { var m = memberMap()[(activeRoom() || {}).me]; return m ? m.colour : C.PALETTE[0]; }
function eventsList() {
  var rm = activeRoom(); if (!rm) return [];
  var d = R(rm.id);
  return Object.keys(d.events).map(function (id) { return { id: id, data: d.events[id].data, deleted: d.events[id].deleted }; });
}
function hiddenSet() { var rm = activeRoom(); return rm ? (S.device.hidden[rm.id] || []) : []; }
function keepFn() {
  var hid = hiddenSet(), mm = memberMap();
  return function (data) {
    var who = (data.who || []).filter(function (id) { return mm[id]; });
    if (!who.length) return true;
    return who.some(function (id) { return hid.indexOf(id) < 0; });
  };
}
function barAttrs(data) {
  var mm = memberMap(), who = (data.who || []).filter(function (id) { return mm[id]; });
  if (who.length === 1) return { cls: 'bar', style: '--c1:' + mm[who[0]].colour };
  if (who.length === 2) return { cls: 'bar two', style: '--c1:' + mm[who[0]].colour + ';--c2:' + mm[who[1]].colour };
  return { cls: 'bar', style: '' };
}
function whoText(data) {
  var mm = memberMap(), names = (data.who || []).map(function (id) { return mm[id] && mm[id].name; }).filter(Boolean);
  return names.length ? names.join(' and ') : 'Everyone';
}
function dotFor(data) {
  var mm = memberMap(), who = (data.who || []).filter(function (id) { return mm[id]; });
  return who.length === 1 ? mm[who[0]].colour : null;
}

/* ---------- network and sync ---------- */
function api(path, opts) {
  opts = opts || {};
  if (!API) return Promise.reject(new Error('Tandem has not been configured.'));
  var headers = { 'content-type': 'application/json' };
  if (opts.key) headers['x-tandem-key'] = opts.key;
  return fetch(API + path, { method: 'POST', headers: headers, body: JSON.stringify(opts.body || {}) }).then(function (res) {
    return res.json().catch(function () { return null; }).then(function (json) {
      if (!res.ok) { var err = new Error((json && json.error) || 'The request did not succeed.'); err.status = res.status; throw err; }
      return json;
    });
  });
}
function setStatus(t) { var el = $('#status'); if (el) el.textContent = t; ui.status = t; }
function applyItems(rid, items) {
  var d = R(rid), changed = false;
  (items || []).forEach(function (it) {
    var cur = it.kind === 'event' ? d.events[it.id] : it.kind === 'member' ? d.members[it.id] : (it.id === 'room' ? d.meta : null);
    if (cur && cur.v > it.v) return;
    if (it.kind === 'event') d.events[it.id] = { data: it.data, v: it.v, deleted: !!it.deleted };
    else if (it.kind === 'member') d.members[it.id] = Object.assign({}, it.data, { v: it.v, deleted: !!it.deleted });
    else if (it.kind === 'meta' && it.id === 'room') d.meta = Object.assign({}, it.data, { v: it.v });
    else return;
    changed = true;
  });
  return changed;
}
var syncing = false, syncTimer = null;
function scheduleSync(ms) { clearTimeout(syncTimer); syncTimer = setTimeout(function () { syncRoom(S.active); }, ms == null ? 400 : ms); }
function syncRoom(rid) {
  var room = S.rooms.filter(function (r) { return r.id === rid; })[0];
  if (!room || syncing) return Promise.resolve(false);
  if (navigator.onLine === false) { setStatus('Offline. Changes are kept on this device.'); return Promise.resolve(false); }
  var d = R(rid), push = d.outbox.slice(0, 100);
  syncing = true; setStatus('Syncing');
  return api('/sync', { key: room.key, body: { since: d.since, push: push } }).then(function (res) {
    d.outbox = d.outbox.filter(function (o) { return !push.some(function (p) { return p.kind === o.kind && p.id === o.id && p.v === o.v; }); });
    var changed = applyItems(rid, res.items);
    d.since = new Date(Date.parse(res.now) - 5000).toISOString();
    room.feedToken = res.feedToken; room.invalid = false;
    save(); setStatus('Up to date');
    syncing = false;
    if (changed || push.length) render();
    if (d.outbox.length) scheduleSync(100);
    return true;
  }).catch(function (e) {
    syncing = false;
    if (e && e.status === 401) { room.invalid = true; save(); setStatus('This calendar link is no longer valid.'); }
    else setStatus(d.outbox.length ? 'Waiting to sync' : 'Could not reach the server');
    return false;
  });
}
function put(kind, id, data, deleted) {
  var rm = activeRoom(); if (!rm) return;
  var d = R(rm.id), v = nextV();
  if (kind === 'event') d.events[id] = { data: data, v: v, deleted: !!deleted };
  else if (kind === 'member') d.members[id] = Object.assign({}, data, { v: v, deleted: !!deleted });
  else d.meta = Object.assign({}, data, { v: v });
  d.outbox = d.outbox.filter(function (o) { return !(o.kind === kind && o.id === id); });
  d.outbox.push({ kind: kind, id: id, data: data, v: v, deleted: !!deleted });
  save(); setStatus('Saving'); scheduleSync(400);
}

/* ---------- ui state ---------- */
var ui = { date: localToday(), edit: false, status: '', code: null, deferredInstall: null };
function today() { return localToday(); }

/* ---------- widgets ---------- */
var WIDGETS = [['today', 'Today'], ['next', 'Next up'], ['countdown', 'Countdown'], ['week', 'This week'], ['free', 'Free together'], ['month', 'Month']];
var SIZES = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']];
var STYLES = [['plain', 'Plain'], ['bold', 'Bold'], ['outline', 'Outline']];
var LIMITS = { today: { s: 2, m: 4, l: 9 }, next: { s: 2, m: 3, l: 7 } };

function eventRow(o, td, opts) {
  var dot = dotFor(o.data), st = dot ? ' style="--c:' + dot + '"' : '';
  return '<div class="row"><span class="tm">' + esc(opts && opts.day ? relDay(o.date, td) : (o.data.allDay ? 'All day' : (o.data.start || ''))) + '</span><span class="dot"' + st + '></span><span class="tx">' + esc(o.data.title) + (opts && opts.day && !o.data.allDay && o.data.start ? ' <span class="sub">' + esc(o.data.start) + '</span>' : '') + '</span></div>';
}
function widgetBody(w) {
  var td = today(), evs = eventsList(), keep = keepFn(), now = nowHM(), body = '';
  var filtered = evs.filter(function (e) { return !e.deleted && e.data && keep(e.data); });
  if (w.type === 'today') {
    var occ = (C.byDate(filtered, td, td)[td] || []).filter(function (o) { return !(o.start === o.end && !o.data.allDay && o.data.end && o.data.end < now); });
    var lim = LIMITS.today[w.size];
    body = '<h4>Today</h4><div class="wl">' + (occ.length ? occ.slice(0, lim).map(function (o) { return eventRow(o, td); }).join('') + (occ.length > lim ? '<div class="sub">and ' + (occ.length - lim) + ' more</div>' : '') : '<div class="sub">Nothing else planned today.</div>') + '</div>';
  } else if (w.type === 'next') {
    var up = C.upcoming(filtered, td, now, LIMITS.next[w.size]);
    body = '<h4>Next up</h4><div class="wl">' + (up.length ? up.map(function (o) { return eventRow(o, td, { day: true }); }).join('') : '<div class="sub">Nothing coming up.</div>') + '</div>';
  } else if (w.type === 'countdown') {
    var target = null;
    if (w.pin) { var pe = filtered.filter(function (e) { return e.id === w.pin; })[0]; if (pe) { var st = C.occurrenceStarts(pe.data, td, C.add(td, 800)); if (st.length) target = { date: st[0], title: pe.data.title }; } }
    if (!target) {
      var cands = C.upcoming(filtered, C.add(td, 1), '00:00', 40), pick = cands.filter(function (o) { return o.data.allDay; })[0] || cands[0];
      if (pick) target = { date: pick.date, title: pick.data.title };
    }
    if (target) {
      var n = C.diff(td, target.date);
      body = '<h4>Countdown</h4><div class="big">' + n + '</div><div class="cd"><strong>' + (n === 1 ? 'day until ' : 'days until ') + '</strong>' + esc(target.title) + '</div>' + (w.size === 's' ? '' : '<div class="sub">' + esc(niceDate(target.date)) + '</div>');
    } else body = '<h4>Countdown</h4><div class="sub">Add an event and its countdown will appear here.</div>';
  } else if (w.type === 'week') {
    var mon = C.monday(td), map = C.byDate(filtered, mon, C.add(mon, 6)), cells = '';
    for (var i = 0; i < 7; i++) {
      var d = C.add(mon, i), list = map[d] || [];
      cells += '<div class="d' + (d === td ? ' today' : '') + '"><span>' + DOW3[C.dow(d)].slice(0, w.size === 's' ? 1 : 3) + '</span><span class="n">' + (+d.slice(8)) + '</span><span class="dots2">' +
        list.slice(0, 3).map(function (o) { var c = dotFor(o.data); return '<i' + (c ? ' style="--c:' + c + '"' : '') + '></i>'; }).join('') + '</span></div>';
    }
    body = '<h4>This week</h4><div class="wk">' + cells + '</div>';
    if (w.size === 'l') {
      var upw = C.upcoming(filtered, td, now, 4);
      body += '<div class="wl">' + upw.map(function (o) { return eventRow(o, td, { day: true }); }).join('') + '</div>';
    }
  } else if (w.type === 'free') {
    var fr = C.freeTogether(filtered, td, 7);
    var freeDays = fr.filter(function (x) { return x.status === 'free'; }), eveDays = fr.filter(function (x) { return x.status === 'evening'; });
    if (w.size === 's') {
      var nx = freeDays[0] || eveDays[0];
      body = '<h4>Free together</h4><div class="big" style="font-size:26px">' + (nx ? esc(relDay(nx.date, td)) : 'None') + '</div><div class="sub">' + (nx ? (nx.status === 'free' ? 'The next day with nothing planned.' : 'Free from the evening.') : 'No free day this week.') + '</div>';
    } else {
      body = '<h4>Free together</h4><div class="free">' + fr.map(function (x) { return '<div class="' + x.status + '">' + DOW3[C.dow(x.date)] + '</div>'; }).join('') + '</div>' +
        '<div class="sub">' + (freeDays.length ? 'Nothing planned on ' + freeDays.map(function (x) { return dayName(x.date); }).join(', ') + '. ' : '') + (eveDays.length ? 'Free from the evening on ' + eveDays.map(function (x) { return dayName(x.date); }).join(', ') + '.' : '') + (!freeDays.length && !eveDays.length ? 'Every day this week has something planned.' : '') + '</div>';
    }
  } else if (w.type === 'month') {
    var first = C.monthStart(td), start = C.monday(first), last = C.add(C.addMonths(first, 1), -1), end = C.add(C.monday(last), 6);
    var mp = C.byDate(filtered, start, end), cs = '';
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(function (l) { cs += '<span class="out">' + l + '</span>'; });
    for (var dd = start; dd <= end; dd = C.add(dd, 1)) {
      cs += '<span class="' + (dd === td ? 'today ' : '') + (mp[dd] ? 'has ' : '') + (dd.slice(0, 7) !== td.slice(0, 7) ? 'out' : '') + '">' + (+dd.slice(8)) + '</span>';
    }
    body = '<h4>' + MONTHS[+td.slice(5, 7) - 1] + '</h4><div class="mini">' + cs + '</div>';
  }
  return body;
}
function widgetHtml(w, idx, total, edit) {
  var col = myColour(), ink = C.inkOn(col);
  var bar = '';
  if (edit) {
    bar = '<div class="wedit">' +
      '<button type="button" data-act="w-left" data-i="' + idx + '"' + (idx === 0 ? ' disabled' : '') + ' aria-label="Move earlier">Earlier</button>' +
      '<button type="button" data-act="w-right" data-i="' + idx + '"' + (idx === total - 1 ? ' disabled' : '') + ' aria-label="Move later">Later</button>' +
      '<select data-w="' + idx + ':size" aria-label="Size">' + SIZES.map(function (s) { return '<option value="' + s[0] + '"' + (w.size === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select>' +
      '<select data-w="' + idx + ':style" aria-label="Design">' + STYLES.map(function (s) { return '<option value="' + s[0] + '"' + (w.style === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select>' +
      (w.type === 'countdown' ? '<select data-w="' + idx + ':pin" aria-label="Event">' + '<option value="">Next event</option>' + eventsList().filter(function (e) { return !e.deleted && e.data; }).slice(0, 80).map(function (e) { return '<option value="' + esc(e.id) + '"' + (w.pin === e.id ? ' selected' : '') + '>' + esc(e.data.title) + '</option>'; }).join('') + '</select>' : '') +
      '<button type="button" data-act="w-remove" data-i="' + idx + '">Remove</button></div>';
  }
  return '<article class="w ' + w.size + ' st-' + w.style + '" style="--c:' + col + ';--wi:' + ink + '">' + widgetBody(w) + bar + '</article>';
}

/* ---------- views ---------- */
function peopleBar() {
  var ms = members(), hid = hiddenSet();
  if (ms.length < 2) return '';
  return '<div class="people" role="group" aria-label="Show or hide people">' + ms.map(function (m) {
    return '<button type="button" class="person" data-act="toggle-person" data-id="' + esc(m.id) + '" aria-pressed="' + (hid.indexOf(m.id) < 0) + '"><span class="dot" style="--c:' + m.colour + '"></span>' + esc(m.name) + '</button>';
  }).join('') + '</div>';
}
function occItem(o) {
  var b = barAttrs(o.data), t = C.timeLabel(o);
  return '<button type="button" class="item" data-act="event" data-id="' + esc(o.id) + '" data-date="' + o.date + '"><span class="' + b.cls + '" style="' + b.style + '"></span><span class="in"><div class="tt">' + esc(o.data.title) + '</div><div class="sub">' + esc([t, o.data.place, whoText(o.data)].filter(Boolean).join('  ·  ')) + '</div></span></button>';
}
function viewHome() {
  var td = today(), list = S.device.widgets;
  var h = '<div class="boardbar"><div><h2>' + esc(niceDate(td)) + '</h2></div><div class="spacer"></div>' +
    (ui.edit ? '<button type="button" class="btn" data-act="w-add">Add a widget</button><button type="button" class="btn primary" data-act="w-done">Done</button>' : '<button type="button" class="btn" data-act="w-edit">Edit Home</button>') + '</div>';
  h += '<div class="board">' + list.map(function (w, i) { return widgetHtml(w, i, list.length, ui.edit); }).join('') + '</div>';
  if (!list.length) h += '<div class="empty">Your Home page is empty. Choose Edit Home, then Add a widget.</div>';
  return h;
}
function viewMonth() {
  var first = C.monthStart(ui.date), start = C.monday(first), last = C.add(C.addMonths(first, 1), -1), end = C.add(C.monday(last), 6);
  var map = C.byDate(eventsList(), start, end, keepFn()), td = today();
  var h = '<div class="mgrid">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (x) { return '<div class="dh">' + x + '</div>'; }).join('');
  for (var d = start; d <= end; d = C.add(d, 1)) {
    var occ = map[d] || [], w = C.dow(d);
    h += '<button type="button" class="cell' + (d.slice(0, 7) !== first.slice(0, 7) ? ' out' : '') + (w === 0 || w === 6 ? ' wkend' : '') + (d === td ? ' today' : '') + '" data-act="day" data-date="' + d + '" aria-label="' + esc(niceDate(d)) + '"><span class="dn">' + (+d.slice(8)) + '</span><div class="chips">' +
      occ.slice(0, 3).map(function (o) { var b = barAttrs(o.data); return '<div class="chip"><span class="' + b.cls + '" style="' + b.style + '"></span><span class="t">' + (o.data.allDay || !o.data.start ? '' : '<span class="tm">' + esc(o.data.start) + '</span>') + esc(o.data.title) + '</span></div>'; }).join('') +
      (occ.length > 3 ? '<div class="more">and ' + (occ.length - 3) + ' more</div>' : '') + '</div><div class="dots">' +
      occ.slice(0, 6).map(function (o) { var c = dotFor(o.data); return '<span class="dot"' + (c ? ' style="--c:' + c + '"' : '') + '></span>'; }).join('') + '</div></button>';
  }
  return h + '</div>';
}
function viewWeek() {
  var mon = C.monday(ui.date), map = C.byDate(eventsList(), mon, C.add(mon, 6), keepFn()), td = today(), h = '<div class="wgrid">';
  for (var i = 0; i < 7; i++) {
    var d = C.add(mon, i), occ = map[d] || [];
    h += '<div class="dcol' + (d === td ? ' today' : '') + '"><h3><span>' + DOW3[C.dow(d)] + ' ' + (+d.slice(8)) + '</span><button type="button" class="iconbtn" style="width:28px;height:28px" data-act="add" data-date="' + d + '" aria-label="Add an event on ' + esc(niceDate(d)) + '">' + ICON.plus + '</button></h3>' +
      (occ.length ? occ.map(occItem).join('') : '<div class="note">Free</div>') + '</div>';
  }
  return h + '</div>';
}
function viewAgenda() {
  var td = today(), from = ui.date < td ? td : ui.date, to = C.add(from, 59), map = C.byDate(eventsList(), from, to, keepFn()), days = Object.keys(map).sort();
  if (!days.length) return '<div class="empty">Nothing is planned in the next sixty days.</div>';
  return '<div class="agenda">' + days.map(function (d) {
    return '<section><h3>' + esc(relDay(d, td) === 'Today' || relDay(d, td) === 'Tomorrow' ? relDay(d, td) + ', ' + (+d.slice(8)) + ' ' + MONTHS[+d.slice(5, 7) - 1] : niceDate(d)) + '</h3><div class="list">' + map[d].map(occItem).join('') + '</div></section>';
  }).join('') + '</div>';
}
function periodLabel() {
  var v = S.device.view;
  if (v === 'month') return MONTHS[+ui.date.slice(5, 7) - 1] + ' ' + ui.date.slice(0, 4);
  if (v === 'week') { var m = C.monday(ui.date), e = C.add(m, 6); return (+m.slice(8)) + ' ' + MONTHS[+m.slice(5, 7) - 1] + ' to ' + (+e.slice(8)) + ' ' + MONTHS[+e.slice(5, 7) - 1]; }
  if (v === 'agenda') return 'Coming up';
  return '';
}
function viewWelcome() {
  return '<div class="welcome"><img class="logo" src="icons/icon-192.png" alt="Tandem icon"><h1>Tandem</h1>' +
    '<p>Tandem is a shared calendar for two people or a small group. Each person has a colour, so you can see at a glance who is busy and when you are free together.</p>' +
    '<p>Create a calendar and send the other person an invitation link, or join one that has already been shared with you. Nobody needs an account.</p>' +
    createCard() + joinCard() +
    '<p class="foot">Built by Daniel Chidi, Founder, Adachi Industries.</p></div>';
}
function colourPicker(name, selected) {
  return '<div class="swatches" role="group" aria-label="Choose your colour">' + C.PALETTE.map(function (c) {
    return '<button type="button" data-act="pick-colour" data-group="' + name + '" data-colour="' + c + '" style="--c:' + c + '" aria-pressed="' + (c === selected) + '" aria-label="Colour ' + c + '"></button>';
  }).join('') + '</div>';
}
function createCard() {
  return '<form class="card" id="createform"><h3>Create a calendar</h3>' +
    '<label class="f">Calendar name<input type="text" id="cr-name" maxlength="60" placeholder="For example, Daniel and Annie" required></label>' +
    '<label class="f">Your name<input type="text" id="cr-me" maxlength="40" required></label>' +
    '<fieldset><legend>Your colour</legend>' + colourPicker('create', C.PALETTE[0]) + '</fieldset>' +
    '<div class="err" id="cr-err"></div><button class="btn primary block" type="submit">Create calendar</button></form>';
}
function joinCard() {
  return '<form class="card" id="joinform"><h3>Join a calendar</h3>' +
    '<label class="f">Invitation link or eight character code<input type="text" id="jn-code" autocomplete="off" autocapitalize="off" required></label>' +
    '<div class="err" id="jn-err"></div><button class="btn block" type="submit">Join</button></form>';
}

/* ---------- main render ---------- */
function render() {
  var app = $('#app'), rm = activeRoom();
  if (!rm) { app.innerHTML = viewWelcome(); document.title = 'Tandem'; return; }
  var d = R(rm.id), v = S.device.view, name = d.meta.name || 'Calendar';
  document.title = name + ' | Tandem';
  var h = '<div class="top"><button type="button" class="room" data-act="rooms"><span class="rn">' + esc(name) + '</span>' + ICON.down + '</button><div class="spacer"></div><span class="status" id="status" role="status" aria-live="polite">' + esc(ui.status) + '</span>' +
    '<button type="button" class="iconbtn" data-act="settings" aria-label="Settings">' + ICON.sliders + '</button></div>';
  h += '<div class="controls"><div class="seg" role="group" aria-label="View">' + [['home', 'Home'], ['month', 'Month'], ['week', 'Week'], ['agenda', 'Agenda']].map(function (x) {
    return '<button type="button" data-act="view" data-v="' + x[0] + '" aria-pressed="' + (v === x[0]) + '">' + x[1] + '</button>';
  }).join('') + '</div>';
  if (v !== 'home' && v !== 'agenda') {
    h += '<div class="navgrp"><button type="button" class="iconbtn" data-act="prev" aria-label="Earlier">' + ICON.left + '</button><button type="button" class="btn sm" data-act="today">Today</button><button type="button" class="iconbtn" data-act="next" aria-label="Later">' + ICON.right + '</button><span class="period">' + esc(periodLabel()) + '</span></div>';
  }
  h += '<div class="spacer"></div><button type="button" class="btn primary addbtn" data-act="add">Add event</button></div>';
  h += peopleBar();
  if (rm.invalid) h += '<div class="empty">This calendar link is no longer valid. Ask for a new invitation, or remove it in Settings.</div>';
  h += v === 'home' ? viewHome() : v === 'month' ? viewMonth() : v === 'week' ? viewWeek() : viewAgenda();
  h += '<button type="button" class="fab" data-act="add">' + ICON.plus + 'Add event</button>';
  var y = window.scrollY;
  app.innerHTML = h;
  window.scrollTo(0, y);
}

/* ---------- dialogs ---------- */
function openDialog(html) {
  var dlg = $('#dlg'); $('#dlg-in').innerHTML = html;
  if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
}
function closeDialog() { var dlg = $('#dlg'); if (dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); } }

function openDay(date) {
  var map = C.byDate(eventsList(), date, date, keepFn()), occ = map[date] || [];
  openDialog('<div class="actions"><h2>' + esc(niceDate(date)) + '</h2><span class="spacer"></span><button type="button" class="btn sm" data-act="close">Close</button></div>' +
    (occ.length ? '<div class="stack">' + occ.map(occItem).join('') + '</div>' : '<p class="note">Nothing is planned on this day.</p>') +
    '<button type="button" class="btn primary" data-act="add" data-date="' + date + '">Add an event</button>');
}
function whoChips(selected) {
  return '<div class="whochips" id="ev-who">' + members().map(function (m) {
    return '<button type="button" data-act="toggle-who" data-id="' + esc(m.id) + '" aria-pressed="' + (selected.indexOf(m.id) >= 0) + '"><span class="dot" style="--c:' + m.colour + '"></span>' + esc(m.name) + '</button>';
  }).join('') + '</div><div class="note">Choose nobody to show it as an event for everyone.</div>';
}
function openEvent(id, date) {
  var rm = activeRoom(); if (!rm) return;
  var ex = id ? R(rm.id).events[id] : null, d = ex ? ex.data : { date: date || ui.date, allDay: false, start: '09:00', end: '10:00', who: [rm.me], repeat: 'none' };
  var rep = d.repeat || 'none';
  openDialog('<form id="evform" data-id="' + esc(id || '') + '"><div class="stack">' +
    '<h2>' + (id ? 'Edit event' : 'New event') + '</h2>' +
    '<label class="f">Title<input type="text" id="ev-title" maxlength="120" required value="' + esc(d.title || '') + '"></label>' +
    '<div class="row2"><label class="f">Date<input type="date" id="ev-date" required value="' + esc(d.date) + '"></label><label class="f">Ends on<input type="date" id="ev-enddate" value="' + esc(d.endDate || d.date) + '"></label></div>' +
    '<label class="chk"><input type="checkbox" id="ev-allday"' + (d.allDay ? ' checked' : '') + '> All day</label>' +
    '<div class="row2" id="ev-times"' + (d.allDay ? ' hidden' : '') + '><label class="f">Starts<input type="time" id="ev-start" value="' + esc(d.start || '09:00') + '"></label><label class="f">Finishes<input type="time" id="ev-end" value="' + esc(d.end || d.start || '10:00') + '"></label></div>' +
    '<fieldset><legend>Who is it for</legend>' + whoChips(d.who || []) + '</fieldset>' +
    '<div class="row2"><label class="f">Repeats<select id="ev-repeat">' + C.REPEATS.map(function (r) { return '<option value="' + r[0] + '"' + (rep === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></label>' +
    '<label class="f" id="ev-untilrow"' + (rep === 'none' ? ' hidden' : '') + '>Repeats until<input type="date" id="ev-until" value="' + esc(d.until || '') + '"></label></div>' +
    (id && rep !== 'none' ? '<div class="note">Changes apply to every occurrence of a repeating event.</div>' : '') +
    '<label class="f">Place<input type="text" id="ev-place" maxlength="120" value="' + esc(d.place || '') + '"></label>' +
    '<label class="f">Notes<textarea id="ev-notes" maxlength="1500">' + esc(d.notes || '') + '</textarea></label>' +
    '<div class="err" id="ev-err"></div>' +
    '<div class="actions">' + (id ? '<button type="button" class="btn danger" data-act="delete-event">Delete</button>' : '') + '<span class="spacer"></span><button type="button" class="btn" data-act="close">Cancel</button><button type="submit" class="btn primary">Save</button></div>' +
    '</div></form>');
  setTimeout(function () { var t = $('#ev-title'); if (t && !id) t.focus(); }, 50);
}

function shareUrl() { var rm = activeRoom(); return location.href.split('#')[0].split('?')[0] + '#join=' + rm.key; }
function feedUrl() { var rm = activeRoom(); return rm && rm.feedToken ? API + '/feed/' + rm.id + '/' + rm.feedToken + '.ics' : ''; }
function openSettings() {
  var rm = activeRoom(); if (!rm) return;
  var d = R(rm.id), ms = members(), feed = feedUrl(), url = shareUrl();
  var people = ms.map(function (m) {
    return '<div class="stack" style="gap:8px"><label class="f">Name' + (m.id === rm.me ? ' (you)' : '') + '<input type="text" data-person="' + esc(m.id) + '" maxlength="40" value="' + esc(m.name) + '"></label>' +
      '<div class="swatches" role="group" aria-label="Colour for ' + esc(m.name) + '">' + C.PALETTE.map(function (c) { return '<button type="button" data-act="person-colour" data-id="' + esc(m.id) + '" data-colour="' + c + '" style="--c:' + c + '" aria-pressed="' + (c === m.colour) + '" aria-label="Colour ' + c + '"></button>'; }).join('') + '</div></div>';
  }).join('');
  openDialog('<div class="actions"><h2>Settings</h2><span class="spacer"></span><button type="button" class="btn sm" data-act="close">Close</button></div>' +
    '<div class="sect"><h3>Calendar</h3><label class="f">Calendar name<input type="text" id="st-name" maxlength="60" value="' + esc(d.meta.name || '') + '"></label></div>' +
    '<div class="sect"><h3>People</h3>' + people + '</div>' +
    '<div class="sect"><h3>Invite someone or open this calendar on another device</h3>' +
    '<p class="note">Anyone who has this link can see and change the calendar. Share it only with people you trust.</p>' +
    '<div class="linkbox" id="st-link">' + esc(url) + '</div>' +
    '<div class="actions"><button type="button" class="btn" data-act="copy-link">Copy the link</button>' + (navigator.share ? '<button type="button" class="btn" data-act="share-link">Share</button>' : '') +
    '<a class="btn" href="mailto:?subject=' + encodeURIComponent('Join our calendar on Tandem') + '&body=' + encodeURIComponent('Open this link to join the calendar "' + (d.meta.name || 'Calendar') + '" on Tandem:\n\n' + url) + '">Email the link</a></div>' +
    '<p class="note">To open the calendar on another of your own devices, email the link to yourself and open it there. Alternatively, show a short code and type it on the other device. The code works once and expires after ten minutes.</p>' +
    '<div class="actions"><button type="button" class="btn" data-act="make-code">Show a short code</button></div><div id="st-code"></div></div>' +
    '<div class="sect"><h3>Use the calendar in your own calendar application</h3>' +
    '<p class="note">A website cannot place a widget on the home screen of an iPhone, an iPad or an Android phone. The reliable alternative is to subscribe to this calendar in the Calendar application on your device. Its own widgets will then show the events from Tandem, and it keeps updating by itself. The subscription is read only.</p>' +
    (feed ? '<div class="linkbox">' + esc(feed.replace('https://', 'webcal://')) + '</div><div class="actions"><button type="button" class="btn" data-act="copy-feed">Copy the subscription address</button><a class="btn" href="' + esc(feed.replace('https://', 'webcal://')) + '">Subscribe</a></div>' : '<p class="note">The subscription address appears after the first successful sync.</p>') + '</div>' +
    '<div class="sect"><h3>Add Tandem to your home screen</h3>' + (ui.deferredInstall ? '<button type="button" class="btn primary" data-act="install">Install Tandem</button>' : '') +
    '<p class="note">On an iPhone or iPad, open Tandem in Safari, tap the Share button, then choose Add to Home Screen. ' +
    'On Android, open the browser menu and choose Install application. On a Mac, use Safari, then File, then Add to Dock, or use the install icon in the address bar of Chrome or Edge.</p>' +
    '<p class="note">On an iPhone or iPad, the installed application keeps its own copy of the data, separate from Safari. Open it once and join again with the invitation link or a short code.</p></div>' +
    '<div class="sect"><h3>Calendars on this device</h3>' + S.rooms.map(function (r) { return '<div class="note">' + (r.id === S.active ? 'Current: ' : '') + esc(R(r.id).meta.name || 'Calendar') + '</div>'; }).join('') +
    '<div class="actions"><button type="button" class="btn" data-act="new-or-join">Create or join another</button><button type="button" class="btn danger" data-act="leave">Remove this calendar from this device</button></div>' +
    '<p class="note">Removing a calendar only affects this device. The calendar stays available to everyone else who has the link.</p></div>' +
    '<p class="foot">Tandem is built by Daniel Chidi, Founder, Adachi Industries.</p>');
}
function openRooms() {
  openDialog('<div class="actions"><h2>Your calendars</h2><span class="spacer"></span><button type="button" class="btn sm" data-act="close">Close</button></div>' +
    '<div>' + S.rooms.map(function (r) { return '<button type="button" class="listrow" data-act="switch-room" data-id="' + esc(r.id) + '"><span class="grow">' + esc(R(r.id).meta.name || 'Calendar') + '</span>' + (r.id === S.active ? '<span class="note">Current</span>' : '') + '</button>'; }).join('') + '</div>' +
    '<button type="button" class="btn" data-act="new-or-join">Create or join another</button>');
}
function openNewOrJoin() { openDialog('<div class="actions"><h2>Create or join</h2><span class="spacer"></span><button type="button" class="btn sm" data-act="close">Close</button></div>' + createCard() + joinCard()); }
function openGallery() {
  openDialog('<div class="actions"><h2>Choose a widget</h2><span class="spacer"></span><button type="button" class="btn sm" data-act="close">Close</button></div>' +
    '<p class="note">Pick a design to add it to your Home page. You can change its size and design afterwards with Edit Home.</p>' +
    WIDGETS.map(function (t) {
      var size = t[0] === 'countdown' ? 's' : 'm';
      return '<div class="sect"><h3>' + t[1] + '</h3><div class="gal">' + STYLES.map(function (st) {
        var w = { id: 'p', type: t[0], size: size, style: st[0] };
        return '<button type="button" class="pick" data-act="w-pick" data-type="' + t[0] + '" data-style="' + st[0] + '" data-size="' + size + '" aria-label="Add ' + esc(t[1]) + ', ' + st[1] + ' design"><span class="pv ' + (size === 's' ? 'pvs' : 'pvm') + '">' + widgetHtml(w, 0, 1, false) + '</span></button>';
      }).join('') + '</div></div>';
    }).join(''));
}
function showCode(code, expiresAt) {
  var el = $('#st-code'); if (!el) return;
  el.innerHTML = '<div class="code">' + esc(code.slice(0, 4) + ' ' + code.slice(4)) + '</div><p class="note">Open Tandem on the other device, choose Join, and type this code. It works once and expires at ' + esc(new Date(expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) + '.</p>';
}

/* ---------- creating and joining ---------- */
function afterJoin() {
  if (location.hash.indexOf('join=') >= 0) history.replaceState(null, '', location.pathname + location.search);
  closeDialog(); S.device.view = S.device.view || 'home'; save(); render(); syncRoom(S.active);
}
function createRoom(name, me, colour) {
  return api('/room/create', { body: { name: name } }).then(function (res) {
    var mid = uid();
    S.rooms.push({ id: res.roomId, key: res.key, feedToken: res.feedToken, me: mid });
    S.active = res.roomId;
    R(res.roomId).meta = { name: name, v: nextV() };
    put('member', mid, { name: me, colour: colour });
    afterJoin();
  });
}
function parseKey(text) {
  var t = String(text || '').trim(), m = t.match(/[#?&]join=([A-Za-z0-9.]+)/);
  if (m) return m[1];
  if (/^[a-z0-9]{6,32}\.[A-Za-z0-9]{16,64}$/.test(t)) return t;
  return null;
}
function joinWithKey(key) {
  var rid = key.split('.')[0], existing = S.rooms.filter(function (r) { return r.id === rid; })[0];
  if (existing) { S.active = rid; save(); afterJoin(); return Promise.resolve(); }
  return api('/sync', { key: key, body: { since: null, push: [] } }).then(function (res) {
    var tmp = { members: {}, name: 'Calendar' };
    res.items.forEach(function (it) {
      if (it.kind === 'member' && !it.deleted) tmp.members[it.id] = it.data;
      if (it.kind === 'meta' && it.id === 'room') tmp.name = it.data.name || tmp.name;
    });
    pendingJoin = { key: key, rid: rid, res: res, tmp: tmp };
    var ids = Object.keys(tmp.members);
    openDialog('<h2>Join ' + esc(tmp.name) + '</h2><p class="note">Who are you? If you are already in this calendar and are opening it on another device, choose your name.</p>' +
      '<div>' + ids.map(function (id) { return '<button type="button" class="listrow" data-act="join-as" data-id="' + esc(id) + '"><span class="dot" style="--c:' + esc(tmp.members[id].colour || C.PALETTE[7]) + '"></span><span class="grow">' + esc(tmp.members[id].name || 'Someone') + '</span></button>'; }).join('') + '</div>' +
      '<form class="card" id="newpersonform"><h3>I am new here</h3><label class="f">Your name<input type="text" id="np-name" maxlength="40" required></label>' +
      '<fieldset><legend>Your colour</legend>' + colourPicker('new', C.PALETTE[ids.length % C.PALETTE.length]) + '</fieldset><div class="err" id="np-err"></div><button class="btn primary block" type="submit">Join calendar</button></form>');
  });
}
var pendingJoin = null;
function finishJoin(meId, isNew, name, colour) {
  var pj = pendingJoin; if (!pj) return;
  S.rooms.push({ id: pj.rid, key: pj.key, feedToken: pj.res.feedToken, me: meId || uid() });
  var room = S.rooms[S.rooms.length - 1];
  S.active = pj.rid;
  R(pj.rid).meta = { name: pj.tmp.name, v: 1 };
  applyItems(pj.rid, pj.res.items);
  R(pj.rid).since = new Date(Date.parse(pj.res.now) - 5000).toISOString();
  if (isNew) { room.me = uid(); put('member', room.me, { name: name, colour: colour }); }
  pendingJoin = null;
  if (location.hash.indexOf('join=') >= 0) history.replaceState(null, '', location.pathname + location.search);
  afterJoin();
}

/* ---------- events ---------- */
document.addEventListener('click', function (e) {
  if (e.target.tagName === 'DIALOG') { closeDialog(); return; }
  var t = e.target.closest('[data-act]'); if (!t) return;
  var a = t.dataset.act, rm = activeRoom();
  if (a === 'close') closeDialog();
  else if (a === 'rooms') openRooms();
  else if (a === 'settings') openSettings();
  else if (a === 'view') { S.device.view = t.dataset.v; ui.date = today(); save(); render(); }
  else if (a === 'prev' || a === 'next') {
    var n = a === 'next' ? 1 : -1;
    ui.date = S.device.view === 'week' ? C.add(ui.date, 7 * n) : C.addMonths(C.monthStart(ui.date), n);
    render();
  }
  else if (a === 'today') { ui.date = today(); render(); }
  else if (a === 'day') openDay(t.dataset.date);
  else if (a === 'add') { closeDialog(); openEvent(null, t.dataset.date || (S.device.view === 'month' || S.device.view === 'week' ? null : today())); }
  else if (a === 'event') { closeDialog(); openEvent(t.dataset.id, t.dataset.date); }
  else if (a === 'toggle-who') t.setAttribute('aria-pressed', t.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  else if (a === 'toggle-person') {
    var hid = (S.device.hidden[rm.id] || []).slice(), i = hid.indexOf(t.dataset.id);
    if (i >= 0) hid.splice(i, 1); else hid.push(t.dataset.id);
    S.device.hidden[rm.id] = hid; save(); render();
  }
  else if (a === 'delete-event') { var id = $('#evform').dataset.id; var ex = R(rm.id).events[id]; if (ex) put('event', id, ex.data, true); closeDialog(); render(); }
  else if (a === 'pick-colour') {
    $$('[data-act="pick-colour"][data-group="' + t.dataset.group + '"]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    t.setAttribute('aria-pressed', 'true');
  }
  else if (a === 'person-colour') {
    var m = R(rm.id).members[t.dataset.id]; if (m) { put('member', t.dataset.id, { name: m.name, colour: t.dataset.colour }); render(); openSettings(); }
  }
  else if (a === 'copy-link' || a === 'copy-feed') {
    var txt = a === 'copy-link' ? shareUrl() : feedUrl().replace('https://', 'webcal://');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { t.textContent = 'Copied'; }, function () { t.textContent = 'Select the text above and copy it'; });
    else t.textContent = 'Select the text above and copy it';
  }
  else if (a === 'share-link') { if (navigator.share) navigator.share({ title: 'Join our calendar on Tandem', url: shareUrl() }).catch(function () {}); }
  else if (a === 'make-code') {
    t.disabled = true;
    api('/link/create', { key: rm.key }).then(function (r) { showCode(r.code, r.expiresAt); t.disabled = false; }).catch(function (err) { var el = $('#st-code'); if (el) el.innerHTML = '<div class="err">' + esc(err.message) + '</div>'; t.disabled = false; });
  }
  else if (a === 'install') { if (ui.deferredInstall) { ui.deferredInstall.prompt(); ui.deferredInstall = null; closeDialog(); } }
  else if (a === 'new-or-join') openNewOrJoin();
  else if (a === 'switch-room') { S.active = t.dataset.id; save(); closeDialog(); ui.date = today(); render(); syncRoom(S.active); }
  else if (a === 'leave') {
    if (!rm) return;
    S.rooms = S.rooms.filter(function (r) { return r.id !== rm.id; }); delete S.data[rm.id]; S.active = S.rooms.length ? S.rooms[0].id : null;
    save(); closeDialog(); render();
  }
  else if (a === 'w-edit') { ui.edit = true; render(); }
  else if (a === 'w-done') { ui.edit = false; save(); render(); }
  else if (a === 'w-add') openGallery();
  else if (a === 'w-pick') { S.device.widgets.push({ id: 'w' + Date.now(), type: t.dataset.type, size: t.dataset.size, style: t.dataset.style }); ui.edit = true; save(); closeDialog(); render(); }
  else if (a === 'w-remove') { S.device.widgets.splice(+t.dataset.i, 1); save(); render(); }
  else if (a === 'w-left' || a === 'w-right') {
    var i2 = +t.dataset.i, j = a === 'w-left' ? i2 - 1 : i2 + 1, ws = S.device.widgets;
    if (j >= 0 && j < ws.length) { var tmp = ws[i2]; ws[i2] = ws[j]; ws[j] = tmp; save(); render(); }
  }
  else if (a === 'join-as') finishJoin(t.dataset.id, false);
});

document.addEventListener('change', function (e) {
  var el = e.target, rm = activeRoom();
  if (el.id === 'ev-allday') { $('#ev-times').hidden = el.checked; }
  else if (el.id === 'ev-repeat') { $('#ev-untilrow').hidden = el.value === 'none'; }
  else if (el.id === 'st-name' && rm) { put('meta', 'room', { name: el.value.trim().slice(0, 60) || 'Calendar' }); render(); }
  else if (el.dataset.person && rm) { var m = R(rm.id).members[el.dataset.person]; if (m) { put('member', el.dataset.person, { name: el.value.trim().slice(0, 40) || m.name, colour: m.colour }); render(); } }
  else if (el.dataset.w) {
    var p = el.dataset.w.split(':'), w = S.device.widgets[+p[0]]; if (w) { w[p[1]] = el.value; save(); render(); }
  }
});

document.addEventListener('submit', function (e) {
  e.preventDefault();
  var f = e.target, rm = activeRoom();
  if (f.id === 'evform' && rm) {
    var who = $$('#ev-who button[aria-pressed="true"]').map(function (b) { return b.dataset.id; });
    var r = C.cleanEvent({
      title: $('#ev-title').value, date: $('#ev-date').value, endDate: $('#ev-enddate').value, allDay: $('#ev-allday').checked,
      start: $('#ev-start').value, end: $('#ev-end').value, who: who, repeat: $('#ev-repeat').value, until: $('#ev-until').value,
      place: $('#ev-place').value, notes: $('#ev-notes').value, by: rm.me
    });
    if (r.error) { $('#ev-err').textContent = r.error; return; }
    put('event', f.dataset.id || uid(), r.data);
    closeDialog(); ui.date = r.data.date; render();
  } else if (f.id === 'createform') {
    var name = $('#cr-name').value.trim(), me = $('#cr-me').value.trim(), col = ($('[data-group="create"][aria-pressed="true"]') || {}).dataset;
    var err = $('#cr-err'); err.textContent = '';
    createRoom(name, me, col ? col.colour : C.PALETTE[0]).catch(function (x) { err.textContent = x.message || 'The calendar could not be created.'; });
  } else if (f.id === 'joinform') {
    var raw = $('#jn-code').value, jerr = $('#jn-err'); jerr.textContent = '';
    var key = parseKey(raw);
    var p = key ? joinWithKey(key) : api('/link/redeem', { body: { code: raw } }).then(function (res) { return joinWithKey(res.key); });
    p.catch(function (x) { jerr.textContent = x.message || 'That link or code could not be used.'; });
  } else if (f.id === 'newpersonform') {
    var nm = $('#np-name').value.trim(), nc = ($('[data-group="new"][aria-pressed="true"]') || {}).dataset;
    if (!nm) { $('#np-err').textContent = 'Please enter your name.'; return; }
    finishJoin(null, true, nm, nc ? nc.colour : C.PALETTE[1]);
  }
});

window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); ui.deferredInstall = e; });
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.active) syncRoom(S.active); });
window.addEventListener('online', function () { if (S.active) syncRoom(S.active); });
window.addEventListener('offline', function () { setStatus('Offline. Changes are kept on this device.'); });
setInterval(function () { if (document.visibilityState === 'visible' && S.active) syncRoom(S.active); }, 20000);

/* ---------- start ---------- */
function start() {
  var q = new URLSearchParams(location.search);
  if (q.get('view') && ['home', 'month', 'week', 'agenda'].indexOf(q.get('view')) >= 0) S.device.view = q.get('view');
  if (S.active && !activeRoom()) S.active = S.rooms[0] ? S.rooms[0].id : null;
  if (!S.active && S.rooms.length) S.active = S.rooms[0].id;
  render();
  var key = parseKey(location.hash);
  if (key) joinWithKey(key).catch(function (x) { openDialog('<h2>This link could not be used</h2><p class="note">' + esc(x.message || 'The invitation link is not valid.') + '</p><button type="button" class="btn" data-act="close">Close</button>'); });
  else if (S.active) syncRoom(S.active);
  if (q.get('action') === 'add' && activeRoom()) openEvent(null, today());
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) navigator.serviceWorker.register('sw.js').catch(function () {});
}
start();
})();
