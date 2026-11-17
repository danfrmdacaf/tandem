/* Tandem. A shared calendar for two people or a small group.
   Built by Daniel Chidi, Founder, Adachi Industries.

   The browser keeps a full copy of each calendar on the device, so it works offline. Changes are sent to a
   small server function, which stores them and returns what other people changed. */
(function () {
'use strict';
var C = window.TandemCore;
var API = (window.TANDEM_CONFIG || {}).api;
var T = { hooks: { click: [], change: [], submit: [] }, sections: { top: [], middle: [] }, after: { settings: [] } };

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
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-6.5 8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.8" cy="7" r="1"/><circle cx="4.8" cy="12" r="1"/><circle cx="4.8" cy="17" r="1"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8.5 7.5L12 4l3.5 3.5"/><path d="M7 10H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>'
};

/* ---------- storage ---------- */
var LS_KEY = 'tandem.v1';
function defaultWidgets() {
  return [
    { id: 'w1', type: 'today', size: 'm', style: 'plain' },
    { id: 'w2', type: 'countdown', size: 's', style: 'plain' },
    { id: 'w3', type: 'next', size: 's', style: 'plain' },
    { id: 'w4', type: 'week', size: 'l', style: 'plain' },
    { id: 'w5', type: 'free', size: 'm', style: 'plain' },
    { id: 'w6', type: 'month', size: 'l', style: 'plain' }
  ];
}
function blank() { return { rooms: [], active: null, data: {}, rules: {}, goneRooms: {}, account: null, device: { view: 'month', cal: 'month', widgets: defaultWidgets(), widgetsAt: 0, hidden: {}, hideOptional: false } }; }
function load() {
  try {
    var j = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (j && j.rooms) { var b = blank(); j.device = Object.assign(b.device, j.device || {}); j.data = j.data || {}; j.rules = j.rules || {}; j.goneRooms = j.goneRooms || {}; j.account = j.account || null; return j; }
  } catch (e) { /* storage unavailable */ }
  return blank();
}
var S = load();
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
function R(id) {
  var d = S.data[id];
  if (!d) d = S.data[id] = { meta: { name: 'Calendar', v: 0 }, members: {}, events: {}, outbox: [], since: null };
  if (!d.overlays) d.overlays = { tag: '', list: [] };
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
  var own = Object.keys(d.events).map(function (id) { return { id: id, data: d.events[id].data, deleted: d.events[id].deleted }; });
  return own.concat(overlayEvents(d));
}
/* events of other calendars that people have chosen to show here. They are read only and carry the colour of
   the person who shared them. */
function overlayEvents(d) {
  var out = [];
  d.overlays.list.forEach(function (sh) {
    (sh.items || []).forEach(function (it) {
      out.push({ id: 'ov:' + sh.share + ':' + it.id, deleted: false, data: Object.assign({}, it.data, { ov: true, ovShare: sh.share, ovLabel: sh.label, ovMode: sh.mode, who: sh.by ? [sh.by] : [] }) });
    });
  });
  return out;
}
function overlayList() { var rm = activeRoom(); return rm ? R(rm.id).overlays.list : []; }
function hiddenSet() { var rm = activeRoom(); return rm ? (S.device.hidden[rm.id] || []) : []; }
/* personal rules: events this person has hidden or marked optional. They change only what this person sees. */
function ruleList() {
  var rm = activeRoom(); if (!rm) return [];
  return Object.keys(S.rules).map(function (k) { return S.rules[k]; }).filter(function (r) { return !r.gone && (r.room === '*' || r.room === rm.id); });
}
/* A filter for occurrences. It also tags each one with o.st, which is 'hide', 'optional' or null.
   strict drops optional events too, for free time and countdowns. */
function occView(strict) {
  var rm = activeRoom(), rules = ruleList();
  if (!rm) return null;
  var showHidden = ui.showHidden, hideOpt = S.device.hideOptional;
  return function (o) {
    var st = rules.length ? C.ruleStatus(rules, rm.id, o) : null;
    o.st = st;
    if (strict) return !st;
    if (st === 'hide') return !!showHidden;
    if (st === 'optional') return !hideOpt;
    return true;
  };
}
function keepFn() {
  var hid = hiddenSet(), mm = memberMap();
  return function (data) {
    if (data.ov) return hid.indexOf('ov:' + data.ovShare) < 0 && (data.who || []).every(function (id) { return !mm[id] || hid.indexOf(id) < 0; });
    var who = (data.who || []).filter(function (id) { return mm[id]; });
    if (!who.length) return true;
    return who.some(function (id) { return hid.indexOf(id) < 0; });
  };
}
function barAttrs(data) {
  var mm = memberMap(), who = (data.who || []).filter(function (id) { return mm[id]; });
  if (data.ov) return { cls: 'bar ov', style: who.length ? '--c1:' + mm[who[0]].colour : '' };
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
  if (opts.token) headers.authorization = 'Bearer ' + opts.token;
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
  return api('/sync', { key: room.key, body: { since: d.since, push: push, overlayTag: d.overlays.tag } }).then(function (res) {
    d.outbox = d.outbox.filter(function (o) { return !push.some(function (p) { return p.kind === o.kind && p.id === o.id && p.v === o.v; }); });
    var changed = applyItems(rid, res.items);
    if (res.overlays) { d.overlays = { tag: res.overlayTag || '', list: res.overlays }; changed = true; }
    d.since = new Date(Date.parse(res.now) - 5000).toISOString();
    room.feedToken = res.feedToken; room.invalid = false;
    save(); setStatus('Up to date');
    syncing = false;
    if (changed || push.length) render();
    if (d.outbox.length) scheduleSync(100);
    return true;
  }).catch(function (e) {
    syncing = false;
    if (e && e.status === 401) { room.invalid = true; save(); render(); setStatus('This calendar link is no longer valid.'); }
    else setStatus(d.outbox.length ? 'Waiting to sync' : 'Could not reach the server');
    return false;
  });
}
function put(kind, id, data, deleted, quiet) {
  var rm = activeRoom(); if (!rm) return;
  var d = R(rm.id), v = nextV();
  if (kind === 'event') d.events[id] = { data: data, v: v, deleted: !!deleted };
  else if (kind === 'member') d.members[id] = Object.assign({}, data, { v: v, deleted: !!deleted });
  else d.meta = Object.assign({}, data, { v: v });
  d.outbox = d.outbox.filter(function (o) { return !(o.kind === kind && o.id === id); });
  d.outbox.push({ kind: kind, id: id, data: data, v: v, deleted: !!deleted });
  if (quiet) return;
  save(); setStatus('Saving'); scheduleSync(400);
}

/* ---------- ui state ---------- */
var ui = { date: localToday(), edit: false, status: '', code: null, deferredInstall: null, showHidden: false, update: false };
function widgetsChanged() { S.device.widgetsAt = Date.now(); save(); if (T.acctSchedule) T.acctSchedule(); }
function today() { return localToday(); }

/* ---------- widgets ---------- */
var WIDGETS = [['today', 'Today'], ['next', 'Next up'], ['countdown', 'Countdown'], ['week', 'This week'], ['free', 'Free together'], ['month', 'Month']];
var SIZES = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']];
var STYLES = [['plain', 'Plain'], ['bold', 'Bold'], ['outline', 'Outline']];
var LIMITS = { today: { s: 2, m: 4, l: 9 }, next: { s: 2, m: 3, l: 7 } };

function eventRow(o, td, opts) {
  var dot = dotFor(o.data), st = dot ? ' style="--c:' + dot + '"' : '';
  return '<div class="row' + (o.st === 'optional' ? ' opt' : o.st === 'hide' ? ' hid' : '') + '"><span class="tm">' + esc(opts && opts.day ? relDay(o.date, td) : (o.data.allDay ? 'All day' : (o.data.start || ''))) + '</span><span class="dot"' + st + '></span><span class="tx">' + esc(o.data.title) + (opts && opts.day && !o.data.allDay && o.data.start ? ' <span class="sub">' + esc(o.data.start) + '</span>' : '') + '</span></div>';
}
function widgetBody(w) {
  var td = today(), evs = eventsList(), keep = keepFn(), now = nowHM(), body = '', vf = occView(false), vs = occView(true);
  var filtered = evs.filter(function (e) { return !e.deleted && e.data && keep(e.data); });
  if (w.type === 'today') {
    var occ = (C.byDate(filtered, td, td, null, vf)[td] || []).filter(function (o) { return !(o.start === o.end && !o.data.allDay && o.data.end && o.data.end < now); });
    var lim = LIMITS.today[w.size];
    body = '<h4>Today</h4><div class="wl">' + (occ.length ? occ.slice(0, lim).map(function (o) { return eventRow(o, td); }).join('') + (occ.length > lim ? '<div class="sub">and ' + (occ.length - lim) + ' more</div>' : '') : '<div class="sub">Nothing else planned today.</div>') + '</div>';
  } else if (w.type === 'next') {
    var up = C.upcoming(filtered, td, now, LIMITS.next[w.size], undefined, vf);
    body = '<h4>Next up</h4><div class="wl">' + (up.length ? up.map(function (o) { return eventRow(o, td, { day: true }); }).join('') : '<div class="sub">Nothing coming up.</div>') + '</div>';
  } else if (w.type === 'countdown') {
    var target = null, own = filtered.filter(function (e) { return !e.data.ov; });
    if (w.pin) { var pe = own.filter(function (e) { return e.id === w.pin; })[0]; if (pe) { var st = C.occurrenceStarts(pe.data, td, C.add(td, 800)); if (st.length) target = { date: st[0], title: pe.data.title }; } }
    if (!target) {
      var cands = C.upcoming(own, C.add(td, 1), '00:00', 40, undefined, vs), pick = cands.filter(function (o) { return o.data.allDay; })[0] || cands[0];
      if (pick) target = { date: pick.date, title: pick.data.title };
    }
    if (target) {
      var n = C.diff(td, target.date);
      body = '<h4>Countdown</h4><div class="big">' + n + '</div><div class="cd"><strong>' + (n === 1 ? 'day until ' : 'days until ') + '</strong>' + esc(target.title) + '</div>' + (w.size === 's' ? '' : '<div class="sub">' + esc(niceDate(target.date)) + '</div>');
    } else body = '<h4>Countdown</h4><div class="sub">Add an event and its countdown will appear here.</div>';
  } else if (w.type === 'week') {
    var mon = C.monday(td), map = C.byDate(filtered, mon, C.add(mon, 6), null, vf), cells = '';
    for (var i = 0; i < 7; i++) {
      var d = C.add(mon, i), list = map[d] || [];
      cells += '<div class="d' + (d === td ? ' today' : '') + '"><span>' + DOW3[C.dow(d)].slice(0, w.size === 's' ? 1 : 3) + '</span><span class="n">' + (+d.slice(8)) + '</span><span class="dots2">' +
        list.slice(0, 3).map(function (o) { var c = dotFor(o.data); return '<i' + (c ? ' style="--c:' + c + '"' : '') + '></i>'; }).join('') + '</span></div>';
    }
    body = '<h4>This week</h4><div class="wk">' + cells + '</div>';
    if (w.size === 'l') {
      var upw = C.upcoming(filtered, td, now, 4, undefined, vf);
      body += '<div class="wl">' + upw.map(function (o) { return eventRow(o, td, { day: true }); }).join('') + '</div>';
    }
  } else if (w.type === 'free') {
    var fr = C.freeTogether(filtered, td, 7, vs);
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
    var mp = C.byDate(filtered, start, end, null, vf), cs = '';
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
      (w.type === 'countdown' ? '<select data-w="' + idx + ':pin" aria-label="Event">' + '<option value="">Next event</option>' + eventsList().filter(function (e) { return !e.deleted && e.data && !e.data.ov; }).slice(0, 80).map(function (e) { return '<option value="' + esc(e.id) + '"' + (w.pin === e.id ? ' selected' : '') + '>' + esc(e.data.title) + '</option>'; }).join('') + '</select>' : '') +
      '<button type="button" data-act="w-remove" data-i="' + idx + '">Remove</button></div>';
  }
  return '<article class="w ' + w.size + ' st-' + w.style + '" style="--c:' + col + ';--wi:' + ink + '">' + widgetBody(w) + bar + '</article>';
}

/* ---------- views ---------- */
function peopleBar() {
  var ms = members(), hid = hiddenSet(), ovs = overlayList(), mm = memberMap();
  if (ms.length < 2 && !ovs.length) return '';
  return '<div class="people" role="group" aria-label="Show or hide people and shared calendars">' + ms.map(function (m) {
    return '<button type="button" class="person" data-act="toggle-person" data-id="' + esc(m.id) + '" aria-pressed="' + (hid.indexOf(m.id) < 0) + '"><span class="dot" style="--c:' + m.colour + '"></span>' + esc(m.name) + '</button>';
  }).join('') + ovs.map(function (sh) {
    var col = mm[sh.by] ? mm[sh.by].colour : '';
    return '<button type="button" class="person ovp" data-act="toggle-person" data-id="ov:' + esc(sh.share) + '" aria-pressed="' + (hid.indexOf('ov:' + sh.share) < 0) + '"><span class="dot ov"' + (col ? ' style="--c:' + col + '"' : '') + '></span>' + esc(sh.label) + '</button>';
  }).join('') + '</div>';
}
/* chips to bring back optional and hidden events, shown only when the person has set rules */
function filterBar() {
  var rules = ruleList(), nh = rules.filter(function (r) { return r.mode === 'hide'; }).length, no = rules.length - nh;
  if (!rules.length) return '';
  return '<div class="people" role="group" aria-label="Optional and hidden events">' +
    (no ? '<button type="button" class="person" data-act="toggle-optional" aria-pressed="' + !S.device.hideOptional + '">Optional events</button>' : '') +
    (nh ? '<button type="button" class="person" data-act="toggle-hidden" aria-pressed="' + !!ui.showHidden + '">Hidden events</button>' : '') + '</div>';
}
function occItem(o) {
  var b = barAttrs(o.data), t = C.timeLabel(o);
  return '<button type="button" class="item' + (o.data.ov ? ' ov' : '') + (o.st === 'optional' ? ' opt' : o.st === 'hide' ? ' hid' : '') + '" data-act="event" data-id="' + esc(o.id) + '" data-date="' + o.date + '"><span class="' + b.cls + '" style="' + b.style + '"></span><span class="in"><div class="tt">' + esc(o.data.title) + (o.data.att ? ' <span class="tag">Ticket</span>' : '') + (o.st === 'optional' ? ' <span class="tag">Optional</span>' : o.st === 'hide' ? ' <span class="tag">Hidden</span>' : '') + '</div><div class="sub">' + esc([t, o.data.place, o.data.ov ? o.data.ovLabel : whoText(o.data)].filter(Boolean).join('  ·  ')) + '</div></span></button>';
}
function viewHome() {
  var td = today(), list = S.device.widgets;
  var h = '<div class="boardbar"><div><h2>' + esc(niceDate(td)) + '</h2></div><div class="spacer"></div>' +
    (ui.edit ? '<button type="button" class="btn" data-act="w-add">Add a widget</button><button type="button" class="btn primary" data-act="w-done">Done</button>' : '<button type="button" class="btn" data-act="w-edit">Edit Home</button>') + '</div>';
  h += (T.startCard ? T.startCard() : '') + (T.checklist ? T.checklist() : '');
  h += '<div class="board">' + list.map(function (w, i) { return widgetHtml(w, i, list.length, ui.edit); }).join('') + '</div>';
  if (!list.length) h += '<div class="empty">Your Home page is empty. Choose Edit Home, then Add a widget.</div>';
  return h;
}
var PX = 48;
function wide() { return window.innerWidth >= 860; }
function isCalView(v) { return v === 'month' || v === 'week' || v === 'day'; }
function calView() { return isCalView(S.device.cal) ? S.device.cal : 'month'; }
function hmMin(s) { var m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function fmtMin(m) { m = Math.max(0, Math.min(1439, m)); return C.pad(Math.floor(m / 60)) + ':' + C.pad(m % 60); }
function occCls(o) { return (o.data.ov ? ' ov' : '') + (o.st === 'optional' ? ' opt' : o.st === 'hide' ? ' hid' : ''); }
function chipBtn(o) {
  var b = barAttrs(o.data);
  return '<button type="button" class="chip' + occCls(o) + '" data-act="event" data-id="' + esc(o.id) + '" data-date="' + o.date + '"><span class="' + b.cls + '" style="' + b.style + '"></span><span class="t">' + (o.data.allDay || !o.data.start ? '' : '<span class="tm">' + esc(o.data.start) + '</span>') + esc(o.data.title) + '</span></button>';
}
function viewMonth() {
  var first = C.monthStart(ui.date), start = C.monday(first), last = C.add(C.addMonths(first, 1), -1), end = C.add(C.monday(last), 6);
  var map = C.byDate(eventsList(), start, end, keepFn(), occView(false)), td = today();
  var h = '<div class="mgrid">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (x) { return '<div class="dh">' + x + '</div>'; }).join('');
  for (var d = start; d <= end; d = C.add(d, 1)) {
    var occ = map[d] || [], w = C.dow(d);
    h += '<button type="button" class="cell' + (d.slice(0, 7) !== first.slice(0, 7) ? ' out' : '') + (w === 0 || w === 6 ? ' wkend' : '') + (d === td ? ' today' : '') + (d === ui.date ? ' sel' : '') + '" data-act="day" data-date="' + d + '" aria-label="' + esc(niceDate(d)) + (occ.length ? ', ' + occ.length + (occ.length === 1 ? ' event' : ' events') : '') + '" aria-pressed="' + (d === ui.date) + '"><span class="dn">' + (+d.slice(8)) + '</span><div class="chips">' +
      occ.slice(0, 3).map(function (o) { var b = barAttrs(o.data); return '<div class="chip' + occCls(o) + '"><span class="' + b.cls + '" style="' + b.style + '"></span><span class="t">' + (o.data.allDay || !o.data.start ? '' : '<span class="tm">' + esc(o.data.start) + '</span>') + esc(o.data.title) + '</span></div>'; }).join('') +
      (occ.length > 3 ? '<div class="more">and ' + (occ.length - 3) + ' more</div>' : '') + '</div><div class="dots">' +
      occ.slice(0, 6).map(function (o) { var c = dotFor(o.data); return '<span class="dot' + (o.data.ov ? ' ov' : '') + '"' + (c ? ' style="--c:' + c + '"' : '') + '></span>'; }).join('') + '</div></button>';
  }
  return h + '</div>';
}
/* A week or a day drawn against the hours. Only events that start and finish on the same day are placed on the
   hours. Longer and all day events sit in a strip above. Events that overlap share the width of the column. */
function lanes(items) {
  var ends = [], cluster = [], cEnd = -1;
  function flush() { var n = 0; cluster.forEach(function (i) { n = Math.max(n, i.lane + 1); }); cluster.forEach(function (i) { i.n = n; }); cluster = []; }
  items.sort(function (a, b) { return a.s - b.s || b.e - a.e; });
  items.forEach(function (it) {
    if (cluster.length && it.s >= cEnd) { flush(); ends = []; cEnd = -1; }
    var l = 0; while (ends[l] !== undefined && ends[l] > it.s) l++;
    ends[l] = it.e; it.lane = l; cluster.push(it); cEnd = Math.max(cEnd, it.e);
  });
  flush();
  return items;
}
function timeGrid(days) {
  var map = C.byDate(eventsList(), days[0], days[days.length - 1], keepFn(), occView(false)), td = today(), now = hmMin(nowHM());
  var strip = {}, timed = {}, lo = 7 * 60, hi = 21 * 60, anyStrip = false;
  days.forEach(function (d) {
    strip[d] = []; timed[d] = [];
    (map[d] || []).forEach(function (o) {
      var s = o.data.allDay ? null : hmMin(o.data.start);
      if (s !== null && o.first && o.last) {
        var e = hmMin(o.data.end); if (e === null || e <= s) e = Math.min(s + 45, 1440);
        timed[d].push({ o: o, s: s, e: e });
        lo = Math.min(lo, Math.floor(s / 60) * 60); hi = Math.max(hi, Math.ceil(e / 60) * 60);
      } else { strip[d].push(o); anyStrip = true; }
    });
  });
  var H = (hi - lo) / 60 * PX, n = days.length;
  var h = '<div class="tg" style="--n:' + n + ';--px:' + PX + 'px"><div class="tgrow tgh"><div></div>' + days.map(function (d) {
    return '<button type="button" class="tgd' + (d === td ? ' today' : '') + (d === ui.date ? ' sel' : '') + '" data-act="day" data-date="' + d + '" aria-pressed="' + (d === ui.date) + '"><span>' + DOW3[C.dow(d)] + '</span><b>' + (+d.slice(8)) + '</b></button>';
  }).join('') + '</div>';
  if (anyStrip) h += '<div class="tgrow tga"><div class="tgl">All day</div>' + days.map(function (d) { return '<div class="tgac">' + strip[d].map(chipBtn).join('') + '</div>'; }).join('') + '</div>';
  h += '<div class="tgrow tgb" style="height:' + H + 'px"><div class="tgl tgax">';
  for (var m = lo; m < hi; m += 60) h += '<span style="top:' + ((m - lo) / 60 * PX) + 'px">' + fmtMin(m) + '</span>';
  h += '</div>';
  days.forEach(function (d) {
    h += '<div class="tgc' + (d === td ? ' today' : '') + '" data-act="slot" data-date="' + d + '" data-lo="' + lo + '" aria-label="Add an event on ' + esc(niceDate(d)) + '">';
    lanes(timed[d]).forEach(function (it) {
      var o = it.o, b = barAttrs(o.data), top = (it.s - lo) / 60 * PX, ht = Math.max((it.e - it.s) / 60 * PX - 2, 22), w = 100 / it.n;
      h += '<button type="button" class="tev' + occCls(o) + '" data-act="event" data-id="' + esc(o.id) + '" data-date="' + o.date + '" style="top:' + top + 'px;height:' + ht + 'px;left:' + (it.lane * w) + '%;width:calc(' + w + '% - 3px);' + b.style + '"><span class="tm">' + esc(o.data.start) + '</span><span class="tt">' + esc(o.data.title) + '</span>' + (ht > 44 && o.data.place ? '<span class="pl">' + esc(o.data.place) + '</span>' : '') + '</button>';
    });
    if (d === td && now >= lo && now <= hi) h += '<i class="nowline" style="top:' + ((now - lo) / 60 * PX) + 'px"></i>';
    h += '</div>';
  });
  return h + '</div></div>';
}
function viewWeek() {
  var mon = C.monday(ui.date), days = [];
  for (var i = 0; i < 7; i++) days.push(C.add(mon, i));
  if (wide()) return timeGrid(days);
  var map = C.byDate(eventsList(), mon, C.add(mon, 6), keepFn(), occView(false)), td = today(), h = '<div class="wgrid">';
  days.forEach(function (d) {
    var occ = map[d] || [];
    h += '<div class="dcol' + (d === td ? ' today' : '') + '"><h3><span>' + DOW3[C.dow(d)] + ' ' + (+d.slice(8)) + '</span><button type="button" class="iconbtn" style="width:28px;height:28px" data-act="add" data-date="' + d + '" aria-label="Add an event on ' + esc(niceDate(d)) + '">' + ICON.plus + '</button></h3>' +
      (occ.length ? occ.map(occItem).join('') : '<div class="note">Free</div>') + '</div>';
  });
  return h + '</div>';
}
function viewDay() { return timeGrid([ui.date]); }
function viewAgenda() {
  var td = today(), from = ui.date < td ? td : ui.date, to = C.add(from, 59), map = C.byDate(eventsList(), from, to, keepFn(), occView(false)), days = Object.keys(map).sort();
  if (!days.length) return '<div class="empty">Nothing is planned in the next sixty days.<div class="actions" style="justify-content:center;margin-top:12px"><button type="button" class="btn primary" data-act="add">Add an event</button><button type="button" class="btn" data-act="open-import">Import a file</button></div></div>';
  return '<div class="agenda">' + days.map(function (d) {
    return '<section><h3>' + esc(relDay(d, td) === 'Today' || relDay(d, td) === 'Tomorrow' ? relDay(d, td) + ', ' + (+d.slice(8)) + ' ' + MONTHS[+d.slice(5, 7) - 1] : niceDate(d)) + '</h3><div class="list">' + map[d].map(occItem).join('') + '</div></section>';
  }).join('') + '</div>';
}
/* the selected day, beside the calendar on a large screen and under it on a phone */
function dayPanel() {
  var date = ui.date, td = today(), n = C.diff(td, date), occ = C.byDate(eventsList(), date, date, keepFn(), occView(false))[date] || [];
  var rel = n === 0 ? '<span class="pill acc">Today</span>' : n === 1 ? '<span class="pill">Tomorrow</span>' : n === -1 ? '<span class="pill">Yesterday</span>' : '';
  return '<section class="card dp" id="daypanel" aria-label="Selected day"><div class="dayhead"><h3>' + esc(niceDate(date)) + '</h3>' + rel + '<span class="pill">' + occ.length + (occ.length === 1 ? ' event' : ' events') + '</span></div>' +
    (occ.length ? '<div class="stack" style="gap:8px">' + occ.map(occItem).join('') + '</div>' : '<p class="note">Nothing is planned on this day.</p>') +
    '<div class="actions" style="margin-top:12px"><button type="button" class="btn primary" data-act="add" data-date="' + date + '">Add an event</button>' + (S.device.view !== 'day' ? '<button type="button" class="btn" data-act="go-day" data-date="' + date + '">Open this day</button>' : '') + '</div></section>';
}
function periodLabel() {
  var v = S.device.view;
  if (v === 'month') return MONTHS[+ui.date.slice(5, 7) - 1] + ' ' + ui.date.slice(0, 4);
  if (v === 'week') { var m = C.monday(ui.date), e = C.add(m, 6); return (+m.slice(8)) + ' ' + MONTHS[+m.slice(5, 7) - 1] + ' to ' + (+e.slice(8)) + ' ' + MONTHS[+e.slice(5, 7) - 1]; }
  if (v === 'day') return niceDate(ui.date);
  return '';
}
function viewWelcome() {
  return T.welcomeHtml ? T.welcomeHtml() : '';
}
function colourPicker(name, selected) {
  return '<div class="swatches" role="group" aria-label="Choose your colour">' + C.PALETTE.map(function (c) {
    return '<button type="button" data-act="pick-colour" data-group="' + name + '" data-colour="' + c + '" style="--c:' + c + '" aria-pressed="' + (c === selected) + '" aria-label="Colour ' + c + '"></button>';
  }).join('') + '</div>';
}
function createCard() {
  return '<form class="card" id="createform"><h3>Create a calendar</h3>' +
    '<label class="f">Calendar name<input type="text" id="cr-name" maxlength="60" placeholder="For example, My timetable, or Daniel and Annie" required></label>' +
    '<label class="f">Your name<input type="text" id="cr-me" maxlength="40" value="' + esc(T.acctName ? T.acctName() : '') + '" required></label>' +
    '<label class="chk"><input type="checkbox" id="cr-solo"> This is my own calendar, just for me for now</label>' +
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
  if (!rm) { app.innerHTML = (T.banner ? T.banner() : '') + viewWelcome(); document.title = 'Tandem'; if (T.onRender) T.onRender(); return; }
  var d = R(rm.id), v = S.device.view, name = d.meta.name || 'Calendar';
  if (['home', 'month', 'week', 'day', 'agenda'].indexOf(v) < 0) v = S.device.view = 'home';
  var cal = isCalView(v), tab = cal ? 'calendar' : v;
  document.title = name + ' | Tandem';
  var tabs = [['home', 'Home', ICON.home], ['calendar', 'Calendar', ICON.cal], ['agenda', 'Agenda', ICON.list]];
  var h = '<header class="top"><button type="button" class="room" data-act="rooms" aria-label="Switch calendar, current calendar ' + esc(name) + '"><img class="mark" src="icons/favicon-32.png" alt=""><span class="rn">' + esc(name) + '</span>' + ICON.down + '</button>' +
    '<nav class="tabs" aria-label="Main">' + tabs.map(function (x) { return '<button type="button" class="tab" data-act="view" data-v="' + x[0] + '"' + (tab === x[0] ? ' aria-current="page"' : '') + '>' + x[1] + '</button>'; }).join('') + '</nav>' +
    '<div class="spacer"></div><span class="status" id="status" role="status" aria-live="polite">' + esc(ui.status) + '</span>' +
    (T.installButton ? T.installButton() : '') +
    '<button type="button" class="iconbtn" data-act="search" aria-label="Search events">' + ICON.search + '</button>' +
    '<button type="button" class="btn primary addbtn" data-act="menu-add">' + ICON.plus + 'Add</button>' +
    '<button type="button" class="iconbtn" data-act="settings" aria-label="Settings">' + ICON.sliders + '</button></header>';
  h += T.banner ? T.banner() : '';
  if (cal) {
    h += '<div class="controls"><div class="seg" role="group" aria-label="Calendar view">' + [['month', 'Month'], ['week', 'Week'], ['day', 'Day']].map(function (x) {
      return '<button type="button" data-act="view" data-v="' + x[0] + '" aria-pressed="' + (v === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div><div class="navgrp"><button type="button" class="iconbtn" data-act="prev" aria-label="Earlier">' + ICON.left + '</button><button type="button" class="btn sm" data-act="today">Today</button><button type="button" class="iconbtn" data-act="next" aria-label="Later">' + ICON.right + '</button></div><span class="period">' + esc(periodLabel()) + '</span></div>';
  }
  h += peopleBar() + filterBar();
  if (rm.invalid) h += '<div class="empty">This calendar link is no longer valid. It may have been replaced. Ask for the new invitation link and open it on this device, or remove the calendar in Settings.</div>';
  if (v === 'home') h += viewHome();
  else if (v === 'agenda') h += viewAgenda();
  else {
    var panel = v === 'month' || (v === 'week' && wide());
    h += T.startCard ? T.startCard() : '';
    h += '<div class="layout' + (panel ? '' : ' solo') + '"><div class="main">' + (v === 'month' ? viewMonth() : v === 'week' ? viewWeek() : viewDay()) + '</div>' +
      (panel ? '<aside class="aside">' + dayPanel() + (T.quickCard ? T.quickCard() : '') + '</aside>' : '') + '</div>';
  }
  h += '<nav class="bottomnav" aria-label="Main">' +
    [['home', 'Home', ICON.home], ['calendar', 'Calendar', ICON.cal]].map(function (x) { return '<button type="button" data-act="view" data-v="' + x[0] + '"' + (tab === x[0] ? ' aria-current="page"' : '') + '>' + x[2] + '<span>' + x[1] + '</span></button>'; }).join('') +
    '<button type="button" class="bn-add" data-act="menu-add" aria-label="Add">' + ICON.plus + '</button>' +
    '<button type="button" data-act="view" data-v="agenda"' + (tab === 'agenda' ? ' aria-current="page"' : '') + '>' + ICON.list + '<span>Agenda</span></button>' +
    '<button type="button" data-act="menu-more">' + ICON.more + '<span>More</span></button></nav>';
  var y = window.scrollY;
  app.innerHTML = h;
  window.scrollTo(0, y);
  if (T.onRender) T.onRender();
}

/* ---------- dialogs ---------- */
function openDialog(html) {
  var dlg = $('#dlg'); $('#dlg-in').innerHTML = html;
  if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
}
function closeDialog() { var dlg = $('#dlg'); if (dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); } }

function whoChips(selected) {
  return '<div class="whochips" id="ev-who">' + members().map(function (m) {
    return '<button type="button" data-act="toggle-who" data-id="' + esc(m.id) + '" aria-pressed="' + (selected.indexOf(m.id) >= 0) + '"><span class="dot" style="--c:' + m.colour + '"></span>' + esc(m.name) + '</button>';
  }).join('') + '</div><div class="note">Choose nobody to show it as an event for everyone.</div>';
}
function openEvent(id, date, start, end) {
  var rm = activeRoom(); if (!rm) return;
  var ex = id ? R(rm.id).events[id] : null, d = ex ? ex.data : { date: date || ui.date, allDay: false, start: start || '09:00', end: end || (start ? fmtMin((hmMin(start) || 0) + 60) : '10:00'), who: [rm.me], repeat: 'none' };
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
  var d = R(rm.id), ms = members(), feed = feedUrl(), url = shareUrl(), flash = ui.flash || ''; ui.flash = '';
  var ovs = overlayList();
  var people = ms.map(function (m) {
    return '<div class="stack" style="gap:8px"><label class="f">Name' + (m.id === rm.me ? ' (you)' : '') + '<input type="text" data-person="' + esc(m.id) + '" maxlength="40" value="' + esc(m.name) + '"></label>' +
      '<div class="swatches" role="group" aria-label="Colour for ' + esc(m.name) + '">' + C.PALETTE.map(function (c) { return '<button type="button" data-act="person-colour" data-id="' + esc(m.id) + '" data-colour="' + c + '" style="--c:' + c + '" aria-pressed="' + (c === m.colour) + '" aria-label="Colour ' + c + '"></button>'; }).join('') + '</div></div>';
  }).join('');
  openDialog('<div class="actions"><h2>Settings</h2><span class="spacer"></span><button type="button" class="btn sm" data-act="close">Close</button></div>' +
    (flash ? '<div class="notice" role="status">' + esc(flash) + '</div>' : '') +
    (T.sections.top || []).map(function (f) { return f(rm); }).join('') +
    '<div class="sect"><h3>Calendar</h3><label class="f">Calendar name<input type="text" id="st-name" maxlength="60" value="' + esc(d.meta.name || '') + '"></label></div>' +
    '<div class="sect"><h3>People</h3>' + people + '</div>' +
    '<div class="sect"><h3>Invite someone or open this calendar on another device</h3>' +
    '<p class="note">Anyone who has this link can see and change the calendar. Share it only with people you trust.</p>' +
    '<div class="linkbox" id="st-link">' + esc(url) + '</div>' +
    '<div class="actions"><button type="button" class="btn" data-act="copy-link">Copy the link</button>' + (navigator.share ? '<button type="button" class="btn" data-act="share-link">Share</button>' : '') +
    '<a class="btn" href="mailto:?subject=' + encodeURIComponent('Join our calendar on Tandem') + '&body=' + encodeURIComponent('Open this link to join the calendar "' + (d.meta.name || 'Calendar') + '" on Tandem:\n\n' + url) + '">Email the link</a></div>' +
    '<p class="note">To open the calendar on another of your own devices, email the link to yourself and open it there. Alternatively, show a short code and type it on the other device. The code works once and expires after ten minutes.</p>' +
    '<div class="actions"><button type="button" class="btn" data-act="make-code">Show a short code</button></div><div id="st-code"></div></div>' +
    '<div class="sect"><h3>Show this calendar on another calendar</h3>' +
    '<p class="note">Choose another calendar on this device and the events of this one will appear there, so the people in it can see when you are busy. They can see them but cannot change them, and nothing they add there ever comes back into this calendar. Choose Show as busy only to share the times without the titles, places or notes: those are never sent. You can stop at any time.</p>' +
    '<div id="st-shares" class="stack" style="gap:8px"><p class="note">Loading</p></div><div class="note" id="st-share-msg" role="status"></div></div>' +
    (ovs.length ? '<div class="sect"><h3>Other calendars shown here</h3>' + ovs.map(function (sh) { return '<div class="note"><strong>' + esc(sh.label) + '</strong>: ' + (sh.mode === 'busy' ? 'busy times only' : 'titles and places') + '</div>'; }).join('') +
      '<p class="note">These are read only. Use the filter above the calendar to hide one on this device. The person who shared it can stop sharing in their own settings.</p></div>' : '') +
    (T.sections.middle || []).map(function (f) { return f(rm); }).join('') +
    '<div class="sect"><h3>Use the calendar in your own calendar application</h3>' +
    '<p class="note">A website cannot place a widget on the home screen of an iPhone, an iPad or an Android phone. The reliable alternative is to subscribe to this calendar in the Calendar application on your device. Its own widgets will then show the events from Tandem, and it keeps updating by itself. The subscription is read only.</p>' +
    (feed ? '<div class="linkbox">' + esc(feed.replace('https://', 'webcal://')) + '</div><div class="actions"><button type="button" class="btn" data-act="copy-feed">Copy the subscription address</button><a class="btn" href="' + esc(feed.replace('https://', 'webcal://')) + '">Subscribe</a></div>' : '<p class="note">The subscription address appears after the first successful sync.</p>') + '</div>' +
    '<div class="sect"><h3>Security</h3>' +
    '<p class="note">Anyone who has the invitation link can see and change this calendar, so treat it like a password. If the link has reached someone it should not have, replace it. The old link, any old short code and the old subscription address then stop working at once. Everyone you still want in the calendar will need the new link.</p>' +
    '<div id="st-rotate"><button type="button" class="btn" data-act="rotate-ask">Replace the invitation link</button></div></div>' +
    '<div class="sect"><h3>Add Tandem to your home screen</h3>' + (ui.deferredInstall ? '<button type="button" class="btn primary" data-act="install">Install Tandem</button>' : '') +
    '<p class="note">On an iPhone or iPad, open Tandem in Safari, tap the Share button, then choose Add to Home Screen. ' +
    'On Android, open the browser menu and choose Install application. On a Mac, use Safari, then File, then Add to Dock, or use the install icon in the address bar of Chrome or Edge.</p>' +
    '<p class="note">On an iPhone or iPad, the installed application keeps its own copy of the data, separate from Safari. Open it once and join again with the invitation link or a short code.</p></div>' +
    '<div class="sect"><h3>Calendars on this device</h3>' + S.rooms.map(function (r) { return '<div class="note">' + (r.id === S.active ? 'Current: ' : '') + esc(R(r.id).meta.name || 'Calendar') + '</div>'; }).join('') +
    '<div class="actions"><button type="button" class="btn" data-act="new-or-join">Create or join another</button><button type="button" class="btn danger" data-act="leave">Remove this calendar from this device</button></div>' +
    '<p class="note">Removing a calendar only affects this device. The calendar stays available to everyone else who has the link.</p></div>' +
    '<p class="foot">Tandem is built by Daniel Chidi, Founder, Adachi Industries.</p>');
  loadShares();
  (T.after.settings || []).forEach(function (f) { f(rm); });
}

/* ---------- showing this calendar on another ---------- */
function shareControls(rm, list) {
  var others = S.rooms.filter(function (r) { return r.id !== rm.id && !r.invalid; });
  if (!others.length) return '<p class="note">To show this calendar on another one, first create or join a second calendar on this device. It will then appear here.</p>';
  var byTarget = {}; (list || []).forEach(function (x) { byTarget[x.target_room] = x; });
  return others.map(function (r) {
    var cur = byTarget[r.id] ? byTarget[r.id].mode : 'off', nm = R(r.id).meta.name || 'Calendar';
    return '<div class="shrow"><span class="grow">' + esc(nm) + '</span><select data-share="' + esc(r.id) + '" aria-label="Show this calendar on ' + esc(nm) + '">' +
      [['off', 'Not shown'], ['details', 'Show details'], ['busy', 'Show as busy only']].map(function (o) { return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>';
  }).join('');
}
function loadShares() {
  var rm = activeRoom(); if (!rm || !$('#st-shares')) return;
  api('/share/list', { key: rm.key }).then(function (r) { var b = $('#st-shares'); if (b && activeRoom() === rm) b.innerHTML = shareControls(rm, r.shares); })
    .catch(function () { var b = $('#st-shares'); if (b) b.innerHTML = '<p class="note">This could not be loaded. Please try again when you are online.</p>'; });
}
function shareLabel(rm) { var m = memberMap()[rm.me]; return (m ? m.name + "'s calendar" : (R(rm.id).meta.name || 'Shared calendar')).slice(0, 60); }
function setShare(rm, el) {
  var tr = S.rooms.filter(function (r) { return r.id === el.dataset.share; })[0]; if (!tr) return;
  var mode = el.value, msg = $('#st-share-msg'); el.disabled = true; if (msg) msg.textContent = '';
  var p = mode === 'off' ? api('/share/delete', { key: rm.key, body: { targetRoom: tr.id } })
    : api('/share/create', { key: rm.key, body: { targetKey: tr.key, mode: mode, by: tr.me, label: shareLabel(rm) } });
  p.then(function () { el.disabled = false; if (msg) msg.textContent = mode === 'off' ? 'This calendar is no longer shown there.' : 'Saved. It will appear there within a few seconds.'; })
    .catch(function (e) { el.disabled = false; if (msg) msg.textContent = e.message || 'That did not work. Please try again.'; loadShares(); });
}

/* a read only look at an event that belongs to another calendar */
function openOverlayEvent(id, date) {
  var ev = eventsList().filter(function (e) { return e.id === id; })[0]; if (!ev) return;
  var d = ev.data, occ = (C.byDate([ev], date, date)[date] || [])[0], t = occ ? C.timeLabel(occ) : '';
  openDialog('<div class="actions"><h2>' + esc(d.title) + '</h2><span class="spacer"></span><button type="button" class="btn sm" data-act="close">Close</button></div>' +
    '<div class="stack"><div>' + esc(niceDate(date || d.date)) + (t ? ', ' + esc(t) : '') + '</div>' + (d.place ? '<div class="note">' + esc(d.place) + '</div>' : '') +
    '<div class="note">Shown from ' + esc(d.ovLabel) + '. ' + (d.ovMode === 'busy' ? 'Only the times are shared, so the title and details stay private. ' : '') + 'It is read only here. It can only be changed in the calendar it comes from.</div></div>');
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
  closeDialog(); S.device.view = S.device.view || 'home'; save(); render(); syncRoom(S.active); if (T.acctSchedule) T.acctSchedule(300);
}
function createRoom(name, me, colour, solo) {
  return api('/room/create', { body: { name: name } }).then(function (res) {
    var mid = uid();
    S.rooms.push({ id: res.roomId, key: res.key, feedToken: res.feedToken, me: mid, at: Date.now() });
    delete S.goneRooms[res.roomId];
    S.active = res.roomId;
    R(res.roomId).meta = { name: name, v: nextV() };
    if (solo) put('meta', 'room', { name: name, solo: true }, false, true);
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
  if (existing) {
    /* a link for a calendar already on this device: confirm it, and keep it if the link was replaced */
    return api('/sync', { key: key, body: { since: null, push: [] } }).then(function (res) {
      existing.key = key; existing.invalid = false; existing.at = Date.now(); if (res.feedToken) existing.feedToken = res.feedToken;
      S.active = rid; save(); afterJoin();
    });
  }
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
      '<form class="card" id="newpersonform"><h3>I am new here</h3><label class="f">Your name<input type="text" id="np-name" maxlength="40" value="' + esc(T.acctName ? T.acctName() : '') + '" required></label>' +
      '<fieldset><legend>Your colour</legend>' + colourPicker('new', C.PALETTE[ids.length % C.PALETTE.length]) + '</fieldset><div class="err" id="np-err"></div><button class="btn primary block" type="submit">Join calendar</button></form>');
  });
}
var pendingJoin = null;
function finishJoin(meId, isNew, name, colour) {
  var pj = pendingJoin; if (!pj) return;
  S.rooms.push({ id: pj.rid, key: pj.key, feedToken: pj.res.feedToken, me: meId || uid(), at: Date.now() });
  delete S.goneRooms[pj.rid];
  var room = S.rooms[S.rooms.length - 1];
  S.active = pj.rid;
  R(pj.rid).meta = { name: pj.tmp.name, v: 1 };
  applyItems(pj.rid, pj.res.items);
  if (pj.res.overlays) R(pj.rid).overlays = { tag: pj.res.overlayTag || '', list: pj.res.overlays };
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
  for (var hi = 0; hi < T.hooks.click.length; hi++) if (T.hooks.click[hi](a, t, e, rm) === true) return;
  if (a === 'close') closeDialog();
  else if (a === 'rooms') openRooms();
  else if (a === 'settings') openSettings();
  else if (a === 'view') {
    var nv = t.dataset.v; if (nv === 'calendar') nv = calView();
    if (isCalView(nv)) S.device.cal = nv;
    if (nv === 'home') ui.date = today();
    S.device.view = nv; save(); render(); window.scrollTo(0, 0);
  }
  else if (a === 'prev' || a === 'next') {
    var n = a === 'next' ? 1 : -1, v0 = S.device.view;
    if (v0 === 'week') ui.date = C.add(ui.date, 7 * n);
    else if (v0 === 'day') ui.date = C.add(ui.date, n);
    else { var m0 = C.addMonths(C.monthStart(ui.date), n); ui.date = m0.slice(0, 7) === today().slice(0, 7) ? today() : m0; }
    render();
  }
  else if (a === 'today') { ui.date = today(); render(); }
  else if (a === 'day') {
    ui.date = t.dataset.date; render();
    if (!wide() && S.device.view === 'month') { var dp = $('#daypanel'); if (dp && dp.scrollIntoView) dp.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }
  else if (a === 'go-day') { ui.date = t.dataset.date; S.device.cal = 'day'; S.device.view = 'day'; save(); render(); window.scrollTo(0, 0); }
  else if (a === 'slot') {
    var box = t.getBoundingClientRect(), mins = Math.floor(((e.clientY - box.top) / PX * 60 + (+t.dataset.lo)) / 30) * 30;
    closeDialog(); openEvent(null, t.dataset.date, fmtMin(mins), fmtMin(mins + 60));
  }
  else if (a === 'add') { closeDialog(); openEvent(null, t.dataset.date || (isCalView(S.device.view) ? ui.date : today())); }
  else if (a === 'reload-app') location.reload();
  else if (a === 'event') { closeDialog(); if (T.openSheet) T.openSheet(t.dataset.id, t.dataset.date); else if (String(t.dataset.id).indexOf('ov:') === 0) openOverlayEvent(t.dataset.id, t.dataset.date); else openEvent(t.dataset.id, t.dataset.date); }
  else if (a === 'edit-event') { closeDialog(); openEvent(t.dataset.id, t.dataset.date); }
  else if (a === 'toggle-optional') { S.device.hideOptional = !S.device.hideOptional; save(); render(); }
  else if (a === 'toggle-hidden') { ui.showHidden = !ui.showHidden; render(); }
  else if (a === 'rotate-ask') {
    var rb = $('#st-rotate');
    if (rb) rb.innerHTML = '<div class="stack" style="gap:8px"><p class="note"><strong>Replace the link now?</strong> Every other device, including your own other devices, will lose access until it is given the new link. This cannot be undone.</p><div class="actions"><button type="button" class="btn danger" data-act="rotate-do">Replace the link</button><button type="button" class="btn" data-act="rotate-cancel">Keep the current link</button></div><div class="err" id="st-rotate-err"></div></div>';
  }
  else if (a === 'rotate-cancel') { var rc = $('#st-rotate'); if (rc) rc.innerHTML = '<button type="button" class="btn" data-act="rotate-ask">Replace the invitation link</button>'; }
  else if (a === 'rotate-do') {
    t.disabled = true;
    api('/room/rotate', { key: rm.key }).then(function (r) {
      rm.key = r.key; rm.feedToken = r.feedToken; rm.invalid = false; rm.at = Date.now(); save(); if (T.acctSchedule) T.acctSchedule(300);
      ui.flash = 'The invitation link has been replaced. The old link, short codes and subscription address no longer work. Copy the new link below and send it to the people who should keep access.';
      openSettings();
    }).catch(function (err) { t.disabled = false; var el = $('#st-rotate-err'); if (el) el.textContent = err.message || 'The link could not be replaced.'; });
  }
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
    S.rooms = S.rooms.filter(function (r) { return r.id !== rm.id; }); delete S.data[rm.id]; S.goneRooms[rm.id] = Date.now(); S.active = S.rooms.length ? S.rooms[0].id : null;
    save(); closeDialog(); render(); if (T.acctSchedule) T.acctSchedule(300);
  }
  else if (a === 'w-edit') { ui.edit = true; render(); }
  else if (a === 'w-done') { ui.edit = false; widgetsChanged(); render(); }
  else if (a === 'w-add') openGallery();
  else if (a === 'w-pick') { S.device.widgets.push({ id: 'w' + Date.now(), type: t.dataset.type, size: t.dataset.size, style: t.dataset.style }); ui.edit = true; widgetsChanged(); closeDialog(); render(); }
  else if (a === 'w-remove') { S.device.widgets.splice(+t.dataset.i, 1); widgetsChanged(); render(); }
  else if (a === 'w-left' || a === 'w-right') {
    var i2 = +t.dataset.i, j = a === 'w-left' ? i2 - 1 : i2 + 1, ws = S.device.widgets;
    if (j >= 0 && j < ws.length) { var tmp = ws[i2]; ws[i2] = ws[j]; ws[j] = tmp; widgetsChanged(); render(); }
  }
  else if (a === 'join-as') finishJoin(t.dataset.id, false);
});

document.addEventListener('change', function (e) {
  var el = e.target, rm = activeRoom();
  for (var hi = 0; hi < T.hooks.change.length; hi++) if (T.hooks.change[hi](el, e, rm) === true) return;
  if (el.id === 'ev-allday') { $('#ev-times').hidden = el.checked; }
  else if (el.id === 'ev-repeat') { $('#ev-untilrow').hidden = el.value === 'none'; }
  else if (el.dataset.share && rm) { setShare(rm, el); }
  else if (el.id === 'st-name' && rm) { put('meta', 'room', { name: el.value.trim().slice(0, 60) || 'Calendar' }); render(); }
  else if (el.dataset.person && rm) { var m = R(rm.id).members[el.dataset.person]; if (m) { put('member', el.dataset.person, { name: el.value.trim().slice(0, 40) || m.name, colour: m.colour }); render(); } }
  else if (el.dataset.w) {
    var p = el.dataset.w.split(':'), w = S.device.widgets[+p[0]]; if (w) { w[p[1]] = el.value; widgetsChanged(); render(); }
  }
});

document.addEventListener('submit', function (e) {
  e.preventDefault();
  var f = e.target, rm = activeRoom();
  for (var hi = 0; hi < T.hooks.submit.length; hi++) if (T.hooks.submit[hi](f, e, rm) === true) return;
  if (f.id === 'evform' && rm) {
    var who = $$('#ev-who button[aria-pressed="true"]').map(function (b) { return b.dataset.id; });
    var r = C.cleanEvent({
      title: $('#ev-title').value, date: $('#ev-date').value, endDate: $('#ev-enddate').value, allDay: $('#ev-allday').checked,
      start: $('#ev-start').value, end: $('#ev-end').value, who: who, repeat: $('#ev-repeat').value, until: $('#ev-until').value,
      place: $('#ev-place').value, notes: $('#ev-notes').value, by: rm.me
    });
    var prior = f.dataset.id ? R(rm.id).events[f.dataset.id] : null;
    if (prior && prior.data && !r.error) ['trip', 'att', 'imp', 'impn'].forEach(function (k) { if (prior.data[k]) r.data[k] = prior.data[k]; });
    if (r.error) { $('#ev-err').textContent = r.error; return; }
    put('event', f.dataset.id || uid(), r.data);
    closeDialog(); ui.date = r.data.date; render();
  } else if (f.id === 'createform') {
    var name = $('#cr-name').value.trim(), me = $('#cr-me').value.trim(), col = ($('[data-group="create"][aria-pressed="true"]') || {}).dataset;
    var err = $('#cr-err'); err.textContent = '';
    createRoom(name, me, col ? col.colour : C.PALETTE[0], $('#cr-solo') && $('#cr-solo').checked).catch(function (x) { err.textContent = x.message || 'The calendar could not be created.'; });
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

window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); ui.deferredInstall = e; if (S.active) render(); });
window.addEventListener('appinstalled', function () { ui.deferredInstall = null; if (S.active) render(); });
var wasWide = wide(), resizeTimer = null;
window.addEventListener('resize', function () {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function () { var w = wide(); if (w !== wasWide) { wasWide = w; if (S.active && !$('dialog[open]')) render(); } }, 150);
});
/* when a new version of the application has been installed in the background, offer to load it */
if ('serviceWorker' in navigator) {
  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadController) { ui.update = true; render(); } hadController = true; });
}
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.active) syncRoom(S.active); });
window.addEventListener('online', function () { if (S.active) syncRoom(S.active); });
window.addEventListener('offline', function () { setStatus('Offline. Changes are kept on this device.'); });
setInterval(function () { if (document.visibilityState === 'visible' && S.active) syncRoom(S.active); }, 20000);
setInterval(function () { if (document.visibilityState === 'visible' && T.acctSync) T.acctSync(); }, 60000);

/* ---------- shared with the account, import and ticket features (features.js) ---------- */
T.C = C; T.I = window.TandemImport; T.S = S; T.R = R; T.api = api; T.put = put; T.save = save; T.render = render; T.esc = esc; T.uid = uid; T.$ = $; T.$$ = $$;
T.openDialog = openDialog; T.closeDialog = closeDialog; T.activeRoom = activeRoom; T.members = members; T.memberMap = memberMap; T.eventsList = eventsList;
T.niceDate = niceDate; T.dayName = dayName; T.today = today; T.ui = ui; T.setStatus = setStatus; T.syncRoom = syncRoom; T.scheduleSync = scheduleSync;
T.openSettings = openSettings; T.openEvent = openEvent; T.openOverlayEvent = openOverlayEvent; T.createCard = createCard; T.joinCard = joinCard; T.colourPicker = colourPicker;
T.joinWithKey = joinWithKey; T.createRoom = createRoom; T.ruleList = ruleList; T.occView = occView; T.keepFn = keepFn; T.relDay = relDay; T.DOW = DOW; T.MONTHS = MONTHS; T.DOW3 = DOW3;
T.nowHM = nowHM; T.ICON = ICON; T.wide = wide; T.parseKey = parseKey; T.afterJoin = afterJoin; T.openRooms = openRooms; T.openNewOrJoin = openNewOrJoin;
if (window.TandemFeatures) window.TandemFeatures(T);
if (window.TandemShell) window.TandemShell(T);
if (window.TandemOtter) window.TandemOtter(T);

/* ---------- start ---------- */
function start() {
  var q = new URLSearchParams(location.search);
  if (T.start && T.start()) return;
  if (q.get('view') && ['home', 'month', 'week', 'day', 'agenda'].indexOf(q.get('view')) >= 0) { S.device.view = q.get('view'); if (isCalView(q.get('view'))) S.device.cal = q.get('view'); }
  if (S.active && !activeRoom()) S.active = S.rooms[0] ? S.rooms[0].id : null;
  if (!S.active && S.rooms.length) S.active = S.rooms[0].id;
  render();
  if (T.acctSync) T.acctSync();
  var key = parseKey(location.hash);
  if (key) joinWithKey(key).catch(function (x) { openDialog('<h2>This link could not be used</h2><p class="note">' + esc(x.message || 'The invitation link is not valid.') + '</p><button type="button" class="btn" data-act="close">Close</button>'); });
  else if (S.active) syncRoom(S.active);
  if (q.get('action') === 'add' && activeRoom()) openEvent(null, today());
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) navigator.serviceWorker.register('sw.js').catch(function () {});
}
start();
})();
