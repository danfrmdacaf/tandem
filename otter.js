/* Tandem. Otto the otter, a small helper in the corner of the screen. Click Otto, type what you want to plan, and
   Otto proposes the event for you to confirm. It understands plain sentences on its own, and it can ask a model
   running on the person's own computer through Ollama for harder wording. Nothing is added without a tap on Add.
   Built by Daniel Chidi, Founder, Adachi Industries. */
(function () {
'use strict';
window.TandemOtter = function (T) {
var S = T.S, C = T.C, A = window.TandemAssistant, ui = T.ui, esc = T.esc, $ = T.$;
if (!A) return;

/* ---------- settings kept on this device ---------- */
function cfg() {
  var c = S.device.assistant || {};
  return { ollama: !!c.ollama, url: c.url || 'http://localhost:11434', model: c.model || '', seen: c.seen || 0 };
}
function setCfg(patch) { S.device.assistant = Object.assign(cfg(), patch); T.save(); }

/* ---------- the character ---------- */
var INK = '#1D2A44', CREAM = '#F7F4EC', CORAL = '#E4572E', TEAL = '#2A9D8F';
var FUR = '#2A9D8F', FUR_DARK = '#1F7A70';
function otterSvg() {
  return '<svg class="ot-svg" viewBox="0 0 96 92" aria-hidden="true" focusable="false">' +
    '<g class="ot-body"><ellipse cx="48" cy="88" rx="31" ry="22" fill="' + FUR + '"/>' +
    '<ellipse cx="48" cy="88" rx="17" ry="18" fill="' + CREAM + '" opacity=".92"/>' +
    '<circle cx="17.5" cy="35" r="6" fill="' + FUR_DARK + '"/><circle cx="78.5" cy="35" r="6" fill="' + FUR_DARK + '"/>' +
    '<ellipse cx="48" cy="49" rx="33" ry="25" fill="' + FUR + '"/>' +
    '<path d="M24 44c5-9 17-12 24-12s19 3 24 12c-8-5-16-6-24-6s-16 1-24 6z" fill="' + FUR_DARK + '" opacity=".55"/>' +
    '<ellipse cx="48" cy="59" rx="22" ry="13.5" fill="' + CREAM + '"/>' +
    '<path class="ot-nose" d="M41.5 52.5c0-2.6 2.8-4 6.5-4s6.5 1.4 6.5 4c0 2.6-3.4 4.6-6.5 4.6s-6.5-2-6.5-4.6z" fill="' + INK + '"/>' +
    '<path class="ot-mouth" d="M43 62c2.4 2.8 7.6 2.8 10 0" fill="none" stroke="' + INK + '" stroke-width="1.8" stroke-linecap="round"/>' +
    '<g fill="' + INK + '" opacity=".4"><circle cx="38" cy="58" r="1"/><circle cx="35" cy="60.5" r="1"/><circle cx="58" cy="58" r="1"/><circle cx="61" cy="60.5" r="1"/></g>' +
    '<g stroke="' + INK + '" stroke-width="1.1" stroke-linecap="round" opacity=".5"><path d="M33 58l-10-2M33 61l-10 3M63 58l10-2M63 61l10 3"/></g>' +
    '<g class="ot-eyes"><circle cx="37" cy="42" r="5.6" fill="' + CREAM + '"/><circle cx="59" cy="42" r="5.6" fill="' + CREAM + '"/>' +
    '<circle class="ot-pl" cx="37" cy="42" r="2.9" fill="' + INK + '"/><circle class="ot-pr" cx="59" cy="42" r="2.9" fill="' + INK + '"/>' +
    '<ellipse class="ot-lid" cx="37" cy="42" rx="6.2" ry="6.2" fill="' + FUR + '"/><ellipse class="ot-lid" cx="59" cy="42" rx="6.2" ry="6.2" fill="' + FUR + '"/></g>' +
    '<g class="ot-glad" fill="none" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"><path d="M32 43.5c1.6-3.8 8.4-3.8 10 0"/><path d="M54 43.5c1.6-3.8 8.4-3.8 10 0"/></g>' +
    '<g class="ot-scarf"><path d="M21 71c9 7 45 7 54 0l2 8c-11 7-47 7-58 0z" fill="' + CORAL + '"/><path d="M62 77l6 14-9 1-3-12z" fill="' + CORAL + '"/><path d="M60 81l5 9" stroke="' + INK + '" stroke-width="1" opacity=".25"/></g>' +
    '<ellipse cx="29" cy="90.5" rx="8" ry="5" fill="' + FUR_DARK + '"/><ellipse cx="67" cy="90.5" rx="8" ry="5" fill="' + FUR_DARK + '"/></g></svg>';
}

/* ---------- page furniture ---------- */
var root = document.createElement('div');
root.id = 'otter-root';
root.innerHTML = '<div class="otter" id="otter" hidden><button type="button" class="ot-btn" id="ot-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="ot-panel" aria-label="Ask Otto to plan something">' + otterSvg() + '</button>' +
  '<div class="ot-tip" id="ot-tip" role="status" hidden></div></div>' +
  '<section class="ot-panel" id="ot-panel" role="dialog" aria-label="Otto, your scheduling helper" hidden>' +
  '<header class="ot-head"><div class="ot-title"><b>Otto</b><span id="ot-mode" class="note"></span></div><button type="button" class="iconbtn" id="ot-gear" aria-label="Otto settings">' + (T.ICON && T.ICON.sliders || '') + '</button><button type="button" class="btn sm" id="ot-close">Close</button></header>' +
  '<div class="ot-set" id="ot-set" hidden></div>' +
  '<div class="ot-log" id="ot-log" aria-live="polite"></div>' +
  '<div class="ot-chips" id="ot-chips"></div>' +
  '<form class="ot-form" id="ot-form"><input type="text" id="ot-in" autocomplete="off" maxlength="400" placeholder="For example, dentist next Friday at 3pm" aria-label="Tell Otto what to plan"><button class="btn primary" type="submit" id="ot-send">Send</button></form></section>';
document.body.appendChild(root);
var el = { otter: $('#otter'), btn: $('#ot-btn'), tip: $('#ot-tip'), panel: $('#ot-panel'), log: $('#ot-log'), form: $('#ot-form'), input: $('#ot-in'), chips: $('#ot-chips'), set: $('#ot-set'), mode: $('#ot-mode') };
var svg = $('.ot-svg', root), pl = $('.ot-pl', root), pr = $('.ot-pr', root);

var st = { open: false, msgs: [], pending: null, busy: false, last: null, fellBack: false, models: [] };
var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- eyes that follow the pointer, a blink now and then ---------- */
var look = { x: 0, y: 0 }, raf = 0, mood = '';
function setMood(m) { mood = m; svg.setAttribute('class', 'ot-svg' + (m ? ' ' + m : '')); if (m === 'think') aim(1.6, -1.8); }
function aim(x, y) {
  look.x = x; look.y = y;
  var t = 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')';
  pl.setAttribute('transform', t); pr.setAttribute('transform', t);
}
document.addEventListener('pointermove', function (e) {
  if (reduce || mood === 'think' || el.otter.hidden || raf) return;
  raf = requestAnimationFrame(function () {
    raf = 0;
    var r = svg.getBoundingClientRect(), cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.45;
    var dx = e.clientX - cx, dy = e.clientY - cy, d = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.min(1, d / 220);
    aim(dx / d * 2.6 * k, dy / d * 2.4 * k);
  });
}, { passive: true });
function blinkLater() {
  setTimeout(function () {
    if (!reduce && !mood && !el.otter.hidden) { svg.classList.add('blink'); setTimeout(function () { svg.classList.remove('blink'); }, 150); }
    blinkLater();
  }, 3200 + Math.random() * 3800);
}
blinkLater();
function happy() { setMood('glad'); setTimeout(function () { if (mood === 'glad') setMood(''); }, 1700); }
function hop() { if (reduce) return; el.btn.classList.remove('hop'); void el.btn.offsetWidth; el.btn.classList.add('hop'); }

/* a short hint the first few times, then Otto stays quiet */
function hint(text, ms) {
  el.tip.textContent = text; el.tip.hidden = false;
  setTimeout(function () { el.tip.hidden = true; }, ms || 7000);
}
function maybeHint() {
  var c = cfg();
  if (c.seen >= 2 || st.open) return;
  setTimeout(function () { if (!st.open && !el.otter.hidden) { hint('Tell me what to add and I will plan it.'); setCfg({ seen: c.seen + 1 }); } }, 2500);
}

/* ---------- messages ---------- */
function say(role, html, extra) { st.msgs.push({ role: role, html: html, extra: extra || null }); drawLog(); }
function drawLog() {
  el.log.innerHTML = st.msgs.map(function (m, i) {
    return '<div class="ot-msg ' + m.role + '">' + m.html + (m.extra && m.extra.card ? card(m.extra.card, i) : '') + '</div>';
  }).join('') + (st.busy ? '<div class="ot-msg bot ot-typing" aria-label="Otto is thinking"><i></i><i></i><i></i></div>' : '');
  el.log.scrollTop = el.log.scrollHeight;
}
function fmtEvent(d) {
  var rep = d.repeat ? ', ' + (C.REPEATS.filter(function (r) { return r[0] === d.repeat; })[0] || ['', 'repeats'])[1].toLowerCase() + (d.until ? ' until ' + T.niceDate(d.until) : '') : '';
  return T.niceDate(d.date) + (d.allDay ? ', all day' : ', ' + d.start + (d.end && d.end !== d.start ? ' to ' + d.end : '')) + rep;
}
function card(c, idx) {
  var done = c.state;
  return '<div class="ot-card">' + c.events.map(function (d) {
    return '<div class="ot-ev"><div class="tt">' + esc(d.title) + '</div><div class="note">' + esc(fmtEvent(d)) + (d.place ? ', ' + esc(d.place) : '') + '</div></div>';
  }).join('') + (done ? '<div class="note">' + (done === 'added' ? 'Added to your calendar.' : 'Not added.') + '</div>' :
    '<div class="actions"><button type="button" class="btn primary sm" data-ot="add" data-i="' + idx + '">Add ' + (c.events.length > 1 ? 'these ' + c.events.length : 'to my calendar') + '</button><button type="button" class="btn sm" data-ot="skip" data-i="' + idx + '">Not now</button></div>') + '</div>';
}

/* ---------- answering ---------- */
function ctxNow() {
  var rm = T.activeRoom();
  return { today: T.today(), me: rm ? rm.me : '', members: T.members() };
}
function plain(s) { return esc(s); }
function dayLines(from, to) {
  var map = C.byDate(T.eventsList(), from, to, T.keepFn(), T.occView(false)), days = Object.keys(map).sort();
  if (!days.length) return null;
  return days.map(function (d) {
    return '<div class="ot-day"><b>' + esc(T.niceDate(d)) + '</b>' + map[d].map(function (o) {
      return '<div>' + esc((o.data.allDay ? 'All day' : (o.data.start || '')) + '  ' + o.data.title + (o.data.place ? ', ' + o.data.place : '')) + '</div>';
    }).join('') + '</div>';
  }).join('');
}
function answerLocal(r) {
  if (r.intent === 'help') return say('bot', plain('Hello. I can add events from a sentence, tell you what is on, and find your free days. Try dentist next Friday at 3pm, or what is on tomorrow.'));
  if (r.intent === 'show') {
    var rows = dayLines(r.from, r.to), nice = r.from === r.to ? T.niceDate(r.from) : (r.label || T.niceDate(r.from) + ' to ' + T.niceDate(r.to));
    return say('bot', rows ? plain('Here is what is on ' + (r.label || nice) + '.') + rows : plain('Nothing is planned ' + (r.label ? r.label : 'on ' + nice) + '.'));
  }
  if (r.intent === 'free') {
    var td = r.from, fr = C.freeTogether(T.eventsList().filter(function (e) { return !e.deleted && e.data && T.keepFn()(e.data); }), td, r.days, T.occView(true));
    var free = fr.filter(function (x) { return x.status === 'free'; }), eve = fr.filter(function (x) { return x.status === 'evening'; });
    var t = (free.length ? 'Nothing is planned on ' + free.map(function (x) { return T.dayName(x.date); }).join(', ') + '. ' : '') + (eve.length ? 'You are free from the evening on ' + eve.map(function (x) { return T.dayName(x.date); }).join(', ') + '.' : '');
    return say('bot', plain(t || 'Every day in ' + r.label + ' has something planned.'));
  }
  if (r.intent === 'ask') {
    st.pending = r.ask === 'date' ? { title: r.title } : { date: r.date, start: r.start };
    return say('bot', plain(r.ask === 'date' ? 'When is ' + r.title + '? You can say a day and a time, such as tomorrow at 3pm.' : 'What should I call it?'));
  }
  if (r.intent === 'add') {
    st.last = r.events;
    return say('bot', plain((r.events.length > 1 ? 'I found ' + r.events.length + ' events. ' : 'Here is what I understood. ') + (r.notes || []).join(' ')) , { card: { events: r.events, state: '' } });
  }
  return say('bot', plain('I did not catch that. Try something like dentist next Friday at 3pm, or what is on tomorrow.'));
}

/* ---------- a model on this computer, through Ollama ---------- */
function ollamaPrompt() {
  var c = ctxNow(), td = c.today, rm = T.activeRoom(), mem = T.members();
  var from = td, to = C.add(td, 21), map = C.byDate(T.eventsList(), from, to, T.keepFn(), T.occView(false));
  var lines = Object.keys(map).sort().map(function (d) {
    return map[d].slice(0, 12).map(function (o) { return d + ' ' + (o.data.allDay ? 'all day' : (o.data.start || '') + '-' + (o.data.end || '')) + ' ' + o.data.title + (o.data.place ? ' at ' + o.data.place : ''); }).join('\n');
  }).join('\n').slice(0, 4000);
  var me = mem.filter(function (m) { return rm && m.id === rm.me; })[0], table = [];
  for (var i = 0; i < 28; i++) { var dd = C.add(td, i); table.push(T.DOW3[C.dow(dd)] + ' ' + dd); }
  return 'You are Otto, the scheduling helper inside the Tandem calendar app. Today is ' + T.dayName(td) + ' ' + td + '. The time now is ' + T.nowHM() + '. The time zone is ' + ((Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || 'local') + '. ' +
    'The person talking to you is ' + (me ? me.name : 'the owner') + '. People in this calendar: ' + (mem.map(function (m) { return m.name; }).join(', ') || 'only the owner') + '.\n' +
    'Reply with JSON only, in this shape: {"reply": "one or two short plain sentences, no emojis", "events": [{"title": "", "date": "YYYY-MM-DD", "start": "HH:MM", "end": "HH:MM", "allDay": false, "place": "", "repeat": "none", "until": "", "who": []}]}.\n' +
    'Put events in the list only when the person asks you to add or schedule something. Otherwise the list is empty and you answer from the schedule below. Never invent events. repeat is one of none, daily, weekly, fortnightly, monthly, yearly. who holds names from the list of people, or is empty for everyone. If something is missing, choose a sensible default, such as one hour, and say so in the reply. Dates must be real dates on or after today unless the person names a past date.\n' +
    'The reply must only describe the events you list, or answer the question. Do not list events that are already in the schedule below. Work out weekdays and dates from this table, never from memory: ' + table.join(', ') + '.\n' +
    'Upcoming events:\n' + (lines || 'none');
}
function ollamaChat(text) {
  var c = cfg(), ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, 90000);
  var hist = st.msgs.filter(function (m) { return m.role === 'user' || (m.role === 'bot' && m.llm); }).slice(-6).map(function (m) { return { role: m.role === 'user' ? 'user' : 'assistant', content: m.role === 'user' ? m.raw : m.llm }; });
  return fetch(c.url.replace(/\/+$/, '') + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
    body: JSON.stringify({ model: c.model, stream: false, format: 'json', options: { temperature: 0 }, messages: [{ role: 'system', content: ollamaPrompt() }].concat(hist, [{ role: 'user', content: text }]) })
  }).then(function (res) {
    clearTimeout(timer);
    if (!res.ok) return res.text().then(function (t) { throw new Error(res.status === 404 ? 'The model ' + c.model + ' is not installed in Ollama.' : 'Ollama answered with an error. ' + t.slice(0, 120)); });
    return res.json();
  }).then(function (j) {
    var raw = String((j.message && j.message.content) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(), data = null;
    try { data = JSON.parse(raw); } catch (e) { var m = /\{[\s\S]*\}/.exec(raw); if (m) { try { data = JSON.parse(m[0]); } catch (e2) { data = null; } } }
    if (!data || typeof data !== 'object') throw new Error('The model did not answer in a form Otto can use.');
    return data;
  }).catch(function (e) { clearTimeout(timer); throw e.name === 'AbortError' ? new Error('Ollama took too long to answer.') : e; });
}
function fromModel(data) {
  var rm = T.activeRoom(), mm = T.members(), td = T.today(), evs = [];
  (Array.isArray(data.events) ? data.events : []).slice(0, 8).forEach(function (r) {
    var who = (Array.isArray(r.who) ? r.who : []).map(function (n) { var f = mm.filter(function (m) { return String(m.name).toLowerCase() === String(n).toLowerCase() || String(m.name).toLowerCase().split(' ')[0] === String(n).toLowerCase(); })[0]; return f ? f.id : (/^(me|i)$/i.test(n) ? rm.me : ''); }).filter(Boolean);
    var c = C.cleanEvent({ title: r.title, date: r.date, allDay: !!r.allDay || !r.start, start: r.start, end: r.end, place: r.place, repeat: r.repeat, until: r.until, who: who.length ? who : [rm.me] });
    if (c.error || c.data.date < C.add(td, -1)) return;
    var dup = T.eventsList().some(function (e) { return !e.deleted && e.data && !e.data.ov && String(e.data.title).toLowerCase() === c.data.title.toLowerCase() && e.data.date === c.data.date && (e.data.start || '') === (c.data.start || ''); });
    if (!dup) evs.push(c.data);
  });
  return { reply: String(data.reply || '').slice(0, 400), events: evs };
}

function send(text) {
  text = text.trim(); if (!text || st.busy) return;
  st.msgs.push({ role: 'user', html: esc(text), raw: text }); el.input.value = ''; drawLog();
  var pend = st.pending, full = text; st.pending = null;
  if (pend) full = pend.title ? pend.title + ' ' + text : (pend.date ? text + ' ' + pend.date : text) + (pend.start ? ' at ' + pend.start : '');
  var local = A.parse(full, ctxNow()), c = cfg();
  var useModel = c.ollama && c.model && (local.intent === 'add' || local.intent === 'unknown' || local.intent === 'ask');
  if (!useModel) { answerLocal(local); return; }
  st.busy = true; setMood('think'); drawLog();
  ollamaChat(full).then(function (data) {
    var r = fromModel(data); st.busy = false; setMood('');
    if (r.events.length) { st.last = r.events; say('bot', plain(r.reply || 'Here is what I understood.'), { card: { events: r.events, state: '' } }); st.msgs[st.msgs.length - 1].llm = JSON.stringify(data); }
    else if (r.reply) { say('bot', plain(r.reply)); st.msgs[st.msgs.length - 1].llm = JSON.stringify(data); }
    else answerLocal(local);
  }).catch(function (e) {
    st.busy = false; setMood('');
    if (!st.fellBack) { st.fellBack = true; say('bot', plain('I could not use Ollama (' + (e.message || 'no answer') + '), so I used my built in understanding instead. You can check the connection in my settings.')); }
    answerLocal(local);
  });
}

/* ---------- adding what was confirmed ---------- */
function confirm(i, yes) {
  var m = st.msgs[i], rm = T.activeRoom(); if (!m || !m.extra || !m.extra.card || m.extra.card.state || !rm) return;
  if (!yes) { m.extra.card.state = 'skipped'; drawLog(); return; }
  var first = '', n = 0;
  m.extra.card.events.forEach(function (d) {
    var c = C.cleanEvent(Object.assign({}, d, { by: rm.me, who: d.who && d.who.length ? d.who : (d.who ? [] : [rm.me]) }));
    if (c.error) return;
    T.put('event', T.uid(), c.data, false, true); n++; if (!first || c.data.date < first) first = c.data.date;
  });
  if (!n) return;
  T.save(); T.setStatus('Saving'); T.scheduleSync(100);
  m.extra.card.state = 'added'; if (first) ui.date = first; T.render(); drawLog(); happy(); hop();
  say('bot', plain(n === 1 ? 'Done. I added it for ' + T.niceDate(first) + '.' : 'Done. I added ' + n + ' events.'));
}

/* ---------- settings ---------- */
function drawSettings() {
  var c = cfg(), safari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent) && !/iPhone|iPad/.test(navigator.userAgent), phone = /iPhone|iPad|Android/.test(navigator.userAgent);
  el.set.innerHTML = '<label class="chk"><input type="checkbox" id="ot-use"' + (c.ollama ? ' checked' : '') + '> Use a model on this computer through Ollama</label>' +
    '<p class="note">Otto always understands plain sentences by itself. Ollama is optional and helps with harder wording. Everything stays on your computer.</p>' +
    '<label class="f">Ollama address<input type="text" id="ot-url" value="' + esc(c.url) + '" autocomplete="off"></label>' +
    '<label class="f">Model<select id="ot-model">' + (st.models.length ? st.models : (c.model ? [c.model] : [])).map(function (m) { return '<option value="' + esc(m) + '"' + (m === c.model ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + (st.models.length || c.model ? '' : '<option value="">Press Check the connection</option>') + '</select></label>' +
    '<div class="actions"><button type="button" class="btn sm" id="ot-test">Check the connection</button><span class="note" id="ot-test-msg" role="status"></span></div>' +
    '<details class="disc"><summary>How to switch it on</summary><div class="stack" style="gap:8px"><p class="note">1. Start Ollama on your computer.</p>' +
    '<p class="note">2. Allow this page to talk to it. On a Mac, run this in Terminal, then quit and reopen Ollama:</p>' +
    '<div class="linkbox">launchctl setenv OLLAMA_ORIGINS "' + esc(location.origin) + '"</div>' +
    '<p class="note">3. Press Check the connection and choose a model.</p>' +
    (phone ? '<p class="note">An iPhone, iPad or Android phone cannot reach Ollama on your computer, so Otto uses its built in understanding there.</p>' : '') +
    (safari ? '<p class="note">Safari blocks a web page from reaching a program on your own computer. Use Chrome, Edge or Firefox on this computer for Ollama.</p>' : '') +
    '<p class="note">Chrome may ask to allow access to devices on your network. Choose Allow.</p></div></details>';
}
function testOllama() {
  var url = ($('#ot-url').value || '').trim().replace(/\/+$/, ''), msg = $('#ot-test-msg'); msg.textContent = 'Checking';
  fetch(url + '/api/tags').then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json(); }).then(function (j) {
    var names = (j.models || []).map(function (m) { return m.name; }), c = cfg();
    if (!names.length) { msg.textContent = 'Ollama is running, but no models are installed. Run: ollama pull llama3'; return; }
    var pref = ['llama3', 'gemma3', 'mistral', 'hermes3', 'qwen'], pick = names.filter(function (n) { return n === c.model; })[0] || names.filter(function (n) { return pref.some(function (p) { return n.indexOf(p) === 0; }); }).sort(function (a, b) { return pref.findIndex(function (p) { return a.indexOf(p) === 0; }) - pref.findIndex(function (p) { return b.indexOf(p) === 0; }); })[0] || names[0];
    st.models = names; setCfg({ url: url, model: pick }); drawSettings(); $('#ot-test-msg').textContent = 'Connected. ' + names.length + (names.length === 1 ? ' model found.' : ' models found.'); head();
  }).catch(function (e) { msg.textContent = 'Could not reach Ollama at ' + url + '. Check that it is running and that step 2 was done.'; });
}
function head() { var c = cfg(); el.mode.textContent = c.ollama && c.model ? ' with ' + c.model : ' built in'; }

/* ---------- opening and closing ---------- */
function chips() {
  el.chips.innerHTML = ['What is on tomorrow?', 'When am I free this week?', 'Lunch tomorrow at 1pm'].map(function (t) { return '<button type="button" class="ot-chip" data-ot="chip">' + esc(t) + '</button>'; }).join('');
}
function open() {
  st.open = true; el.panel.hidden = false; el.btn.setAttribute('aria-expanded', 'true'); el.tip.hidden = true; head(); chips(); hop();
  if (!st.msgs.length) say('bot', plain('Hello, I am Otto. Tell me what to plan, for example dentist next Friday at 3pm. I will show you the event before anything is added.'));
  else drawLog();
  setTimeout(function () { el.input.focus(); }, 60);
}
function close() { st.open = false; el.panel.hidden = true; el.set.hidden = true; el.btn.setAttribute('aria-expanded', 'false'); el.btn.focus(); }

el.btn.addEventListener('click', function () { if (st.open) close(); else open(); });
$('#ot-close').addEventListener('click', close);
$('#ot-gear').addEventListener('click', function () { el.set.hidden = !el.set.hidden; if (!el.set.hidden) drawSettings(); });
el.form.addEventListener('submit', function (e) { e.preventDefault(); send(el.input.value); });
el.panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
el.panel.addEventListener('click', function (e) {
  var t = e.target.closest('[data-ot]'); if (!t) return;
  if (t.dataset.ot === 'chip') send(t.textContent);
  else if (t.dataset.ot === 'add') confirm(+t.dataset.i, true);
  else if (t.dataset.ot === 'skip') confirm(+t.dataset.i, false);
});
el.panel.addEventListener('change', function (e) {
  if (e.target.id === 'ot-use') { setCfg({ ollama: e.target.checked }); head(); }
  else if (e.target.id === 'ot-model') { setCfg({ model: e.target.value }); head(); }
  else if (e.target.id === 'ot-url') setCfg({ url: e.target.value.trim() });
});
el.panel.addEventListener('click', function (e) { if (e.target.id === 'ot-test') testOllama(); });

/* shown only when a calendar is open */
T.onRender = function () {
  var on = !!T.activeRoom();
  if (el.otter.hidden === on) { el.otter.hidden = !on; if (on) maybeHint(); }
  if (!on && st.open) close();
};
T.onRender();
};
})();
