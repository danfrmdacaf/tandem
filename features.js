/* Tandem features that sit on top of the calendar: accounts, personal rules (hide an event or mark it optional),
   importing timetables and files, travel tickets, search and export.
   Built by Daniel Chidi, Founder, Adachi Industries. */
(function () {
'use strict';
window.TandemFeatures = function (T) {
var C = T.C, I = T.I, S = T.S, R = T.R, esc = T.esc, $ = T.$, $$ = T.$$, api = T.api, ui = T.ui;
var MAX_TICKET_BYTES = 1500000;
var MAX_IMPORT_BYTES = 6000000;

/* ---------- small helpers ---------- */
function flash(msg) { ui.flash = msg; }
function toast(msg) { T.setStatus(msg); }
function now() { return Date.now(); }
function pwField(name, label, auto) {
  return '<label class="f">' + label + '<input type="password" name="' + name + '" autocomplete="' + auto + '" minlength="8" maxlength="200" required></label>';
}
function bytesToB64(buf) {
  var b = new Uint8Array(buf), s = '', step = 0x8000;
  for (var i = 0; i < b.length; i += step) s += String.fromCharCode.apply(null, b.subarray(i, i + step));
  return btoa(s);
}
function b64ToBytes(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function readFile(file, as) {
  return new Promise(function (res, rej) {
    var rd = new FileReader();
    rd.onload = function () { res(rd.result); };
    rd.onerror = function () { rej(new Error('That file could not be read.')); };
    if (as === 'text') rd.readAsText(file); else rd.readAsArrayBuffer(file);
  });
}
function extOf(name) { var m = /\.([A-Za-z0-9]+)$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise(function (res, rej) {
    var s = document.createElement('script'); s.src = 'vendor/pdf.min.js';
    s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; res(window.pdfjsLib); };
    s.onerror = function () { rej(new Error('The PDF reader could not be loaded. Please check your connection and try again.')); };
    document.head.appendChild(s);
  });
}

/* ---------- ticket files kept on this device (works with no signal at the station) ---------- */
var idb = {
  open: function () {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('no storage')); return; }
      var rq = indexedDB.open('tandem-files', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('files', { keyPath: 'id' }); };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  },
  put: function (rec) { return idb.open().then(function (db) { return new Promise(function (res, rej) { var tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(rec); tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error); }; }); }).catch(function () {}); },
  get: function (id) { return idb.open().then(function (db) { return new Promise(function (res, rej) { var rq = db.transaction('files').objectStore('files').get(id); rq.onsuccess = function () { res(rq.result || null); }; rq.onerror = function () { rej(rq.error); }; }); }).catch(function () { return null; }); },
  del: function (id) { return idb.open().then(function (db) { return new Promise(function (res) { var tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete(id); tx.oncomplete = function () { res(); }; }); }).catch(function () {}); }
};

/* =====================================================================
   Accounts
   ===================================================================== */
var acctBusy = false, acctTimer = null;
T.acctName = function () { return S.account ? S.account.name : ''; };

function acctPayload() {
  var rooms = {};
  S.rooms.forEach(function (r) { rooms[r.id] = { key: r.key, me: r.me, at: r.at || 1, feedToken: r.feedToken || '' }; });
  Object.keys(S.goneRooms).forEach(function (id) { if (!rooms[id]) rooms[id] = { gone: true, at: S.goneRooms[id] }; });
  return { rooms: rooms, rules: S.rules, widgets: { at: S.device.widgetsAt || 0, val: S.device.widgets } };
}
function acctApply(profile) {
  var changed = false, added = [];
  profile = profile || {};
  Object.keys(profile.rooms || {}).forEach(function (id) {
    var e = profile.rooms[id], loc = S.rooms.filter(function (r) { return r.id === id; })[0];
    if (e.gone) {
      if (loc && (loc.at || 1) < e.at) { S.rooms = S.rooms.filter(function (r) { return r.id !== id; }); delete S.data[id]; changed = true; }
      if (!loc || (loc.at || 1) < e.at) S.goneRooms[id] = Math.max(S.goneRooms[id] || 0, e.at);
    } else {
      if (S.goneRooms[id] && S.goneRooms[id] > e.at) return;
      if (!loc) { S.rooms.push({ id: id, key: e.key, me: e.me, feedToken: e.feedToken || '', at: e.at }); delete S.goneRooms[id]; added.push(id); changed = true; }
      else if (e.at > (loc.at || 1)) { loc.key = e.key; loc.me = e.me; loc.at = e.at; loc.invalid = false; changed = true; }
    }
  });
  Object.keys(profile.rules || {}).forEach(function (id) {
    var e = profile.rules[id], l = S.rules[id];
    if (!l || e.at > (l.at || 0)) { S.rules[id] = e; changed = true; }
  });
  var w = profile.widgets;
  if (w && Array.isArray(w.val) && w.at > (S.device.widgetsAt || 0)) { S.device.widgets = w.val; S.device.widgetsAt = w.at; changed = true; }
  if (S.active && !T.activeRoom()) S.active = S.rooms[0] ? S.rooms[0].id : null;
  if (!S.active && S.rooms.length) S.active = S.rooms[0].id;
  S.device.view = S.device.view || 'home';
  T.save();
  return { changed: changed, added: added };
}
function syncAdded(ids) {
  var first = S.active;
  (function next(list) {
    if (!list.length) return;
    var id = list[0];
    var go = function () { return T.syncRoom(id).then(function () { next(list.slice(1)); }); };
    if (id === first) { next(list.slice(1)); return; }
    go();
  })(ids);
}
T.acctSchedule = function (ms) { if (!S.account) return; clearTimeout(acctTimer); acctTimer = setTimeout(function () { T.acctSync(); }, ms == null ? 800 : ms); };
T.acctSync = function () {
  if (!S.account || acctBusy || navigator.onLine === false) return Promise.resolve();
  acctBusy = true;
  return api('/account/sync', { token: S.account.token, body: { profile: acctPayload() } }).then(function (res) {
    acctBusy = false;
    S.account.name = res.account.name; S.account.email = res.account.email;
    var r = acctApply(res.profile);
    if (r.changed) { T.render(); if (S.active) T.syncRoom(S.active).then(function () { syncAdded(r.added); }); }
  }).catch(function (e) {
    acctBusy = false;
    if (e && e.status === 401) { S.account = null; T.save(); ui.authMsg = 'You have been signed out. Please sign in again to keep your calendars up to date on this device.'; ui.authTab = 'signin'; T.render(); }
  });
};
function showRecovery(code, intro) {
  ui.rc = code;
  T.openDialog('<h2>Save your recovery code</h2><div class="stack"><p class="note">' + esc(intro) + '</p><div class="code" style="font-size:19px;letter-spacing:0.06em">' + esc(code) + '</div>' +
    '<div class="actions"><button type="button" class="btn" data-act="rc-copy">Copy the code</button><button type="button" class="btn" data-act="rc-download">Download it as a file</button></div>' +
    '<p class="note">Anyone with this code and your email address can choose a new password for your account, so keep it private. It works for one reset, and a fresh code is given each time it is used. You can make a new one at any time in Settings.</p>' +
    '<label class="chk"><input type="checkbox" id="rc-ok"> I have saved this code somewhere safe</label><button type="button" class="btn primary block" id="rc-done" data-act="rc-done" disabled>Continue</button></div>');
}
function onAuth(res, keepDialog) {
  S.account = { token: res.token, email: res.account.email, name: res.account.name };
  ui.authMsg = '';
  var r = acctApply(res.profile);
  T.save();
  if (!keepDialog) T.closeDialog();
  T.render();
  T.acctSync();
  if (S.active) T.syncRoom(S.active).then(function () { syncAdded(r.added); });
  if (res.recovery) showRecovery(res.recovery, res.fromRecovery ? 'Your password has been changed and you are signed in. Here is a new recovery code to replace the one you just used.' : 'Your account is ready. Please keep this recovery code. If you ever forget your password, it is how you choose a new one.');
}
function signOutLocal() {
  var keepView = S.device.view;
  Object.keys(S).forEach(function (k) { delete S[k]; });
  S.rooms = []; S.active = null; S.data = {}; S.rules = {}; S.goneRooms = {}; S.account = null;
  S.device = { view: keepView || 'month', cal: 'month', widgets: [], widgetsAt: 0, hidden: {}, hideOptional: false };
  S.device.widgets = defaultWidgetsCopy();
  T.save();
}
function defaultWidgetsCopy() {
  return [{ id: 'w1', type: 'today', size: 'm', style: 'plain' }, { id: 'w2', type: 'countdown', size: 's', style: 'plain' }, { id: 'w3', type: 'next', size: 's', style: 'plain' },
    { id: 'w4', type: 'week', size: 'l', style: 'plain' }, { id: 'w5', type: 'free', size: 'm', style: 'plain' }, { id: 'w6', type: 'month', size: 'l', style: 'plain' }];
}

/* the sign in and sign up forms, used on the first page and inside a dialog */
function authHtml() {
  var tab = ui.authTab || 'signup', msg = ui.authMsg ? '<div class="notice" role="status">' + esc(ui.authMsg) + '</div>' : '';
  var tabs = '<div class="seg" role="group" aria-label="Account">' + [['signup', 'Create an account'], ['signin', 'Sign in']].map(function (x) {
    return '<button type="button" data-act="auth-tab" data-tab="' + x[0] + '" aria-pressed="' + (tab === x[0] || (tab === 'forgot' && x[0] === 'signin')) + '">' + x[1] + '</button>';
  }).join('') + '</div>';
  var body;
  if (tab === 'signup') {
    body = '<form class="stack" id="signupform" data-form="signup"><label class="f">Your name<input type="text" name="name" autocomplete="name" maxlength="40" required></label>' +
      '<label class="f">Email address<input type="email" name="email" autocomplete="email" maxlength="254" required></label>' + pwField('password', 'Password, at least eight characters', 'new-password') +
      '<label class="chk"><input type="checkbox" data-showpw> Show the password</label><div class="err" data-err></div><button class="btn primary block" type="submit">Create account</button></form>' +
      '<p class="note">An account keeps your calendars, your Home page and your preferences, so they are there on every device you sign in on. You will be given a recovery code to keep, which lets you choose a new password if you ever forget it.</p>';
  } else if (tab === 'forgot') {
    body = '<form class="stack" id="recoverform" data-form="recover"><p class="note">Enter the email address of your account, the recovery code you saved when you created it, and a new password.</p>' +
      '<label class="f">Email address<input type="email" name="email" autocomplete="email" maxlength="254" required></label>' +
      '<label class="f">Recovery code<input type="text" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="30" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" required></label>' +
      pwField('password', 'New password, at least eight characters', 'new-password') + '<label class="chk"><input type="checkbox" data-showpw> Show the password</label>' +
      '<div class="err" data-err></div><button class="btn primary block" type="submit">Set the new password</button><button type="button" class="btn block" data-act="auth-tab" data-tab="signin">Back to sign in</button></form>' +
      '<details class="disc"><summary>I do not have my recovery code</summary><form class="stack" id="forgotform" data-form="forgot"><p class="note">If reset emails have been switched on for Tandem, enter your email address and a link to choose a new password will be sent. If they have not, nothing is sent and you will be told.</p>' +
      '<label class="f">Email address<input type="email" name="email" autocomplete="email" maxlength="254" required></label><div class="err" data-err></div><div class="notice" data-ok hidden></div>' +
      '<button class="btn block" type="submit">Email me a reset link</button></form></details>';
  } else {
    body = '<form class="stack" id="signinform" data-form="signin"><label class="f">Email address<input type="email" name="email" autocomplete="email" maxlength="254" required></label>' +
      pwField('password', 'Password', 'current-password') + '<label class="chk"><input type="checkbox" data-showpw> Show the password</label><div class="err" data-err></div>' +
      '<button class="btn primary block" type="submit">Sign in</button><button type="button" class="linkbtn" data-act="auth-tab" data-tab="forgot">I have forgotten my password</button></form>';
  }
  return '<div class="card stack">' + tabs + msg + body + '</div>';
}
T.welcomeHtml = function () {
  if (S.account) {
    return '<div class="welcome"><img class="logo" src="icons/icon-192.png" alt="Tandem icon"><h1>Welcome, ' + esc(S.account.name) + '</h1>' +
      '<p>Your account is ready. Create your first calendar or join one that has been shared with you. Everything you add is saved to your account, so it is there on every device.</p>' +
      T.createCard() + T.joinCard() +
      '<p><button type="button" class="linkbtn" data-act="signout-ask">Sign out</button></p><p class="foot">Built by Daniel Chidi, Founder, Adachi Industries.</p></div>';
  }
  return '<div class="welcome"><img class="logo" src="icons/icon-192.png" alt="Tandem icon"><h1>Tandem</h1>' +
    '<p>Tandem is a calendar for you and the people you share your time with. Keep your own calendars, share one with a partner or friend, see when you are free together, bring in your timetable, and keep your train tickets next to your plans.</p>' +
    authHtml() +
    '<details class="card"><summary>Use Tandem without an account</summary><p class="note">You can create a calendar or join one with an invitation link and use it straight away. It stays on this device and in the shared calendar. An account is only needed to have the same calendars on every device.</p>' + T.createCard() + T.joinCard() + '</details>' +
    '<p class="foot">Built by Daniel Chidi, Founder, Adachi Industries.</p></div>';
};
function openAuthDialog(tab) {
  ui.authTab = tab || 'signup';
  T.openDialog('<div class="actions"><h2>Your account</h2><span class="spacer"></span><button type="button" class="btn sm" data-act="close">Close</button></div>' + authHtml());
}
function authSection() {
  if (!S.account) {
    return '<div class="sect"><h3>Account</h3><p class="note">You are using Tandem without an account. With an account, the calendars on this device, your Home page and your preferences are saved and appear on every device you sign in on.</p>' +
      '<div class="actions"><button type="button" class="btn primary" data-act="auth-open" data-tab="signup">Create an account</button><button type="button" class="btn" data-act="auth-open" data-tab="signin">Sign in</button></div></div>';
  }
  return '<div class="sect"><h3>Account</h3><p class="note">Signed in as <strong>' + esc(S.account.email) + '</strong>. Your calendars, Home page and preferences are saved to this account.</p>' +
    '<form class="stack" data-form="rename" style="gap:8px"><label class="f">Your name<input type="text" name="name" maxlength="40" value="' + esc(S.account.name) + '" required></label><div class="err" data-err></div><div class="actions"><button type="submit" class="btn">Save name</button></div></form>' +
    '<details class="disc"><summary>Change password</summary><form class="stack" data-form="password" style="gap:8px">' + pwField('current', 'Current password', 'current-password') + pwField('next', 'New password, at least eight characters', 'new-password') + '<div class="err" data-err></div><div class="notice" data-ok hidden></div><div class="actions"><button type="submit" class="btn">Change password</button></div></form></details>' +
    '<details class="disc"><summary>Recovery code</summary><form class="stack" data-form="newrecovery" style="gap:8px"><p class="note">Your recovery code lets you choose a new password if you forget it. If you have lost it or want a fresh one, make a new code. The old one stops working. Please enter your password to confirm.</p>' + pwField('password', 'Password', 'current-password') + '<div class="err" data-err></div><div class="actions"><button type="submit" class="btn">Make a new recovery code</button></div></form></details>' +
    '<div id="st-signout" class="actions"><button type="button" class="btn" data-act="signout-ask">Sign out</button></div>' +
    '<details class="disc"><summary>Delete my account</summary><form class="stack" data-form="delete" style="gap:8px"><p class="note">This removes your account, your saved ticket files and your preferences. The calendars themselves are not deleted and stay available to everyone who has their link. Please enter your password to confirm.</p>' + pwField('password', 'Password', 'current-password') + '<div class="err" data-err></div><div class="actions"><button type="submit" class="btn danger">Delete my account</button></div></form></details></div>';
}
T.sections.top.push(authSection);

function resetDialog(token) {
  ui.resetToken = token;
  T.openDialog('<h2>Choose a new password</h2><form class="stack" data-form="reset">' + pwField('password', 'New password, at least eight characters', 'new-password') + '<label class="chk"><input type="checkbox" data-showpw> Show the password</label><div class="err" data-err></div><button class="btn primary block" type="submit">Save the new password</button></form>' +
    '<p class="note">After this you will be signed in. Every other device will need to sign in again.</p>');
}
T.start = function () {
  var m = /[#&]reset=([A-Za-z0-9]{30,80})/.exec(location.hash);
  if (m) { history.replaceState(null, '', location.pathname + location.search); setTimeout(function () { resetDialog(m[1]); }, 50); }
  return false;
};

function formErr(f, msg) { var el = f.querySelector('[data-err]'); if (el) el.textContent = msg || ''; var ok = f.querySelector('[data-ok]'); if (ok && msg) ok.hidden = true; }
function busy(f, on) { $$('button[type="submit"]', f).forEach(function (b) { b.disabled = on; }); }

T.hooks.submit.push(function (f) {
  var kind = f.dataset && f.dataset.form; if (!kind) return false;
  var el = f.elements, body, path;
  formErr(f, '');
  if (kind === 'signup') { path = '/auth/signup'; body = { name: el.name.value, email: el.email.value, password: el.password.value }; }
  else if (kind === 'signin') { path = '/auth/login'; body = { email: el.email.value, password: el.password.value }; }
  else if (kind === 'forgot') {
    busy(f, true);
    api('/auth/reset/request', { body: { email: el.email.value } }).then(function (r) {
      busy(f, false);
      var ok = f.querySelector('[data-ok]');
      ok.textContent = r.mail ? 'If an account uses that email address, a link to choose a new password is on its way. It works once and expires after one hour. Please check your spam folder too.' : 'Reset emails are not switched on, so nothing was sent. Please use your recovery code instead.';
      ok.hidden = false;
    }).catch(function (e) { busy(f, false); formErr(f, e.message); });
    return true;
  }
  else if (kind === 'recover') {
    busy(f, true);
    api('/auth/recovery/confirm', { body: { email: el.email.value, code: el.code.value, password: el.password.value } }).then(function (res) { busy(f, false); res.fromRecovery = true; onAuth(res); })
      .catch(function (e) { busy(f, false); formErr(f, e.message); });
    return true;
  }
  else if (kind === 'newrecovery') {
    busy(f, true);
    api('/auth/recovery/new', { token: S.account.token, body: { password: el.password.value } }).then(function (res) { busy(f, false); showRecovery(res.recovery, 'This is your new recovery code. The old one no longer works.'); })
      .catch(function (e) { busy(f, false); formErr(f, e.message); });
    return true;
  }
  else if (kind === 'reset') { path = '/auth/reset/confirm'; body = { token: ui.resetToken, password: el.password.value }; }
  else if (kind === 'rename') {
    api('/account/update', { token: S.account.token, body: { name: el.name.value } }).then(function (r) { S.account.name = r.account.name; T.save(); toast('Name saved'); }).catch(function (e) { formErr(f, e.message); });
    return true;
  }
  else if (kind === 'password') {
    busy(f, true);
    api('/auth/password', { token: S.account.token, body: { current: el.current.value, next: el.next.value } }).then(function () {
      busy(f, false); f.reset(); var ok = f.querySelector('[data-ok]'); ok.textContent = 'Your password has been changed. Your other devices will need to sign in again.'; ok.hidden = false;
    }).catch(function (e) { busy(f, false); formErr(f, e.message); });
    return true;
  }
  else if (kind === 'delete') {
    busy(f, true);
    api('/auth/delete', { token: S.account.token, body: { password: el.password.value } }).then(function () { signOutLocal(); T.closeDialog(); T.render(); }).catch(function (e) { busy(f, false); formErr(f, e.message); });
    return true;
  }
  else return false;
  busy(f, true);
  api(path, { body: body }).then(function (res) { busy(f, false); onAuth(res); }).catch(function (e) { busy(f, false); formErr(f, e.message); });
  return true;
});
T.hooks.change.push(function (el) {
  if (el.id === 'rc-ok') { var b = $('#rc-done'); if (b) b.disabled = !el.checked; return true; }
  if (el.dataset && el.dataset.showpw !== undefined) { $$('input[type="password"],input[data-pw]', el.closest('form')).forEach(function (i) { i.setAttribute('data-pw', '1'); i.type = el.checked ? 'text' : 'password'; }); return true; }
  return false;
});
T.hooks.click.push(function (a, t) {
  if (a === 'rc-copy') { if (navigator.clipboard && ui.rc) navigator.clipboard.writeText(ui.rc).then(function () { t.textContent = 'Copied'; }, function () { t.textContent = 'Select the code and copy it'; }); return true; }
  if (a === 'rc-download') {
    var blob = new Blob(['Tandem recovery code\n' + (S.account ? S.account.email : '') + '\n\n' + ui.rc + '\n\nKeep this private. With this code and your email address, a new password can be chosen for your Tandem account.\n'], { type: 'text/plain' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'tandem-recovery-code.txt'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    return true;
  }
  if (a === 'rc-done') { ui.rc = null; T.closeDialog(); return true; }
  if (a === 'auth-tab') { ui.authTab = t.dataset.tab; ui.authMsg = ''; var card = t.closest('.card'); if (card && card.parentNode) { var tmp = document.createElement('div'); tmp.innerHTML = authHtml(); card.parentNode.replaceChild(tmp.firstChild, card); } return true; }
  if (a === 'auth-open') { openAuthDialog(t.dataset.tab); return true; }
  if (a === 'signout-ask') {
    T.openDialog('<h2>Sign out</h2><p class="note">Your calendars, Home page and preferences stay saved in your account. They are removed from this device and come back when you sign in again. Anything that has not finished syncing is sent first.</p>' +
      '<div class="actions"><button type="button" class="btn primary" data-act="signout-do">Sign out</button><button type="button" class="btn" data-act="close">Cancel</button></div>');
    return true;
  }
  if (a === 'signout-do') {
    t.disabled = true;
    var tok = S.account && S.account.token;
    (T.acctSync() || Promise.resolve()).then(function () { return disablePush(); }).then(function () { return api('/auth/logout', { token: tok }).catch(function () {}); }).then(function () { signOutLocal(); T.closeDialog(); T.render(); });
    return true;
  }
  return false;
});

/* =====================================================================
   Personal rules: hide an event, or mark it optional
   ===================================================================== */
function fmtDay(d) { return T.niceDate(d); }
function occOf(ev, date) { var m = C.byDate([ev], date, date)[date]; return m && m[0]; }
function describe(r) { return C.describeRule(r, T.DOW3); }
function whoText(d) { var mm = T.memberMap(), n = (d.who || []).map(function (id) { return mm[id] && mm[id].name; }).filter(Boolean); return n.length ? n.join(' and ') : 'Everyone'; }

function tripHtml(d) {
  var t = d.trip; if (!t) return '';
  var rows = [];
  if (t.from || t.to) rows.push(['Route', (t.from || '') + (t.from && t.to ? ' to ' : '') + (t.to || '')]);
  if (t.dep) rows.push(['Departs', t.dep + (d.date ? ', ' + fmtDay(d.date) : '')]);
  if (t.arr) rows.push(['Arrives', t.arr + (t.arrDate ? ', ' + fmtDay(t.arrDate) : '')]);
  if (t.carrier) rows.push(['Operator', t.carrier]);
  if (t.ref) rows.push(['Booking reference', t.ref]);
  if (t.seat) rows.push(['Seat', t.seat]);
  if (t.cls) rows.push(['Class', t.cls]);
  return '<div class="kv">' + rows.map(function (r) { return '<div class="k">' + esc(r[0]) + '</div><div>' + esc(r[1]) + '</div>'; }).join('') + '</div>';
}

/* the notes of a journey repeat what the travel details already show, so those lines are left out here */
function notesText(d) {
  if (!d.notes) return '';
  if (!d.trip) return d.notes;
  var t = d.trip, dup = [t.carrier, t.ref ? 'Booking reference: ' + t.ref : '', t.seat, t.cls ? t.cls + ' class' : ''].filter(Boolean);
  return d.notes.split('\n').filter(function (l) { return dup.indexOf(l) < 0; }).join('\n').trim();
}
T.openSheet = function (id, date) {
  var rm = T.activeRoom(); if (!rm) return;
  var ev = T.eventsList().filter(function (e) { return e.id === id; })[0]; if (!ev) return;
  var d = ev.data, own = !d.ov, occ = occOf(ev, date || d.date), label = occ ? C.timeLabel(occ) : '';
  var rules = occ ? T.ruleList().filter(function (r) { return C.ruleMatches(r, rm.id, occ); }) : [];
  var h = '<div class="actions"><h2>' + esc(d.title) + '</h2><span class="spacer"></span><button type="button" class="btn sm" data-act="close">Close</button></div><div class="stack">' +
    '<div>' + esc(fmtDay(date || d.date)) + (label ? ', ' + esc(label) : '') + '</div>' +
    (d.repeat ? '<div class="note">Repeats ' + esc((C.REPEATS.filter(function (r) { return r[0] === d.repeat; })[0] || ['', 'regularly'])[1].toLowerCase()) + (d.until ? ' until ' + esc(fmtDay(d.until)) : '') + '</div>' : '') +
    (d.place ? '<div>' + esc(d.place) + '</div>' : '') +
    (own ? '<div class="note">For ' + esc(whoText(d)) + '</div>' : '<div class="note">Shown from ' + esc(d.ovLabel) + '. ' + (d.ovMode === 'busy' ? 'Only the times are shared, so the title and details stay private. ' : '') + 'It can only be changed in the calendar it comes from.</div>') +
    tripHtml(d) + (notesText(d) ? '<div class="pre">' + esc(notesText(d)) + '</div>' : '') +
    (d.att ? '<div class="ticketbox" id="sheet-ticket">' + ticketBox(d, rm) + '</div>' : '');
  if (rules.length) {
    h += '<div class="stack" style="gap:6px"><div class="note"><strong>Your rules for this event</strong></div>' + rules.map(function (r) {
      return '<div class="shrow"><span class="grow">' + (r.mode === 'hide' ? 'Hidden: ' : 'Optional: ') + esc(describe(r)) + '</span><button type="button" class="btn sm" data-act="rule-remove" data-id="' + esc(r.id) + '">Remove</button></div>';
    }).join('') + '</div>';
  }
  h += '<div class="actions">' + (own ? '<button type="button" class="btn primary" data-act="edit-event" data-id="' + esc(id) + '" data-date="' + esc(date || d.date) + '">Edit</button>' : '') +
    '<button type="button" class="btn" data-act="rule-open" data-mode="optional">Mark as optional</button><button type="button" class="btn" data-act="rule-open" data-mode="hide">Do not show this</button></div>' +
    '<div id="rule-form"></div><p class="note">Optional and hidden events change only what you see. Nobody else is told, and the event itself is not changed.</p></div>';
  T.openDialog(h);
  ui.sheet = { id: id, date: date || d.date, ev: ev };
};
function ruleForm(mode) {
  var sh = ui.sheet, d = sh.ev.data, rep = !!d.repeat, dayWord = T.dayName(sh.date), st = d.start || '13:00';
  var opts = [['occ', 'Only on ' + fmtDay(sh.date)]];
  if (rep) opts.push(['ev', 'Every time this event repeats']);
  opts.push(['title', 'Every event called “' + d.title + '”']);
  if (!d.allDay) opts.push(['after', 'Every event that starts at or after a time I choose']);
  return '<div class="card stack" style="gap:10px"><strong>' + (mode === 'hide' ? 'Do not show this' : 'Mark as optional') + '</strong>' +
    '<label class="f">Which events<select id="rl-scope">' + opts.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('') + '</select></label>' +
    '<div id="rl-after" class="stack" hidden style="gap:10px"><div class="row2"><label class="f">Starting at or after<input type="time" id="rl-time" value="' + esc(st) + '"></label>' +
    '<label class="f">On<select id="rl-days"><option value="all">Every day</option><option value="weekdays">Weekdays</option><option value="weekend">Weekends</option><option value="this">Only on ' + esc(dayWord) + 's</option></select></label></div></div>' +
    '<div class="actions"><button type="button" class="btn primary" data-act="rule-apply" data-mode="' + mode + '">' + (mode === 'hide' ? 'Hide' : 'Mark optional') + '</button><button type="button" class="btn" data-act="rule-cancel">Cancel</button></div></div>';
}
function makeRule(mode, crit, label) {
  var rm = T.activeRoom(), r = Object.assign({ id: T.uid(), room: rm.id, mode: mode, at: now(), label: String(label || '').slice(0, 60) }, crit);
  S.rules[r.id] = r; T.save(); T.acctSchedule();
  return r;
}
T.hooks.click.push(function (a, t, e, rm) {
  if (a === 'rule-open') { var box = $('#rule-form'); if (box) { box.innerHTML = ruleForm(t.dataset.mode); box.scrollIntoView({ block: 'nearest' }); } return true; }
  if (a === 'rule-cancel') { var b2 = $('#rule-form'); if (b2) b2.innerHTML = ''; return true; }
  if (a === 'rule-apply') {
    var sh = ui.sheet, d = sh.ev.data, scope = $('#rl-scope').value, mode = t.dataset.mode, crit = {}, label = d.title;
    if (scope === 'occ') { crit = { ev: sh.id, day: occOf(sh.ev, sh.date) ? occOf(sh.ev, sh.date).start : sh.date }; }
    else if (scope === 'ev') crit = { ev: sh.id };
    else if (scope === 'title') crit = { title: C.normTitle(d.title) };
    else {
      var tm = $('#rl-time').value || '13:00', dv = $('#rl-days').value;
      crit = { after: tm };
      if (dv === 'weekdays') crit.days = [1, 2, 3, 4, 5]; else if (dv === 'weekend') crit.days = [0, 6]; else if (dv === 'this') crit.days = [C.dow(sh.date)];
      label = '';
    }
    makeRule(mode, crit, label);
    T.closeDialog(); T.render(); toast(mode === 'hide' ? 'Hidden. Use Hidden events above the calendar to see it again.' : 'Marked as optional');
    return true;
  }
  if (a === 'rule-remove') {
    var r = S.rules[t.dataset.id]; if (r) { r.gone = true; r.at = now(); T.save(); T.acctSchedule(); }
    T.closeDialog(); T.render(); toast('Rule removed');
    return true;
  }
  return false;
});
T.hooks.change.push(function (el) {
  if (el.id === 'rl-scope') { $('#rl-after').hidden = el.value !== 'after'; return true; }
  return false;
});

/* settings: the rules a person has made, and a way to add one without opening an event */
T.sections.middle.push(function (rm) {
  var rules = T.ruleList();
  var list = rules.length ? rules.map(function (r) {
    return '<div class="shrow"><span class="grow">' + (r.mode === 'hide' ? 'Not shown: ' : 'Optional: ') + esc(describe(r)) + '</span><button type="button" class="btn sm" data-act="rule-remove-settings" data-id="' + esc(r.id) + '">Remove</button></div>';
  }).join('') : '<p class="note">You have not hidden anything or marked anything as optional yet. Choose an event in the calendar, then Mark as optional or Do not show this.</p>';
  return '<div class="sect"><h3>Optional and hidden events</h3><p class="note">These rules only change what you see. They are saved to your account if you have one.</p>' + list +
    '<details class="disc"><summary>Add a rule</summary><form class="stack" data-form="addrule" style="gap:8px">' +
    '<label class="f">What to do<select name="mode"><option value="optional">Mark as optional</option><option value="hide">Do not show</option></select></label>' +
    '<label class="f">Events called (leave empty for any title)<input type="text" name="title" maxlength="60"></label>' +
    '<div class="row2"><label class="f">Starting at or after<input type="time" name="after"></label><label class="f">Starting before<input type="time" name="before"></label></div>' +
    '<label class="f">On<select name="days"><option value="all">Every day</option><option value="weekdays">Weekdays</option><option value="weekend">Weekends</option></select></label>' +
    '<div class="err" data-err></div><div class="actions"><button type="submit" class="btn">Add the rule</button></div></form></details></div>';
});
T.hooks.submit.push(function (f) {
  if (f.dataset.form !== 'addrule') return false;
  var el = f.elements, crit = {}, title = el.title.value.trim();
  if (title) crit.title = C.normTitle(title);
  if (el.after.value) crit.after = el.after.value;
  if (el.before.value) crit.before = el.before.value;
  if (!crit.title && !crit.after && !crit.before) { formErr(f, 'Please give a title or a time.'); return true; }
  if (el.days.value === 'weekdays') crit.days = [1, 2, 3, 4, 5]; else if (el.days.value === 'weekend') crit.days = [0, 6];
  makeRule(el.mode.value, crit, title);
  ui.flash = 'The rule has been added.'; T.render(); T.openSettings();
  return true;
});
T.hooks.click.push(function (a, t) {
  if (a === 'rule-remove-settings') { var r = S.rules[t.dataset.id]; if (r) { r.gone = true; r.at = now(); T.save(); T.acctSchedule(); } T.render(); T.openSettings(); return true; }
  return false;
});

/* =====================================================================
   Tickets
   ===================================================================== */
function ticketBox(d, rm) {
  var att = d.att, mine = att.by === rm.me || !att.by;
  var local = /^local/.test(att.id);
  return '<div><strong>Ticket</strong> <span class="note">' + esc(att.name) + '</span></div>' +
    '<div class="actions"><button type="button" class="btn primary" data-act="ticket-download">Download ticket</button><button type="button" class="btn" data-act="ticket-open">Open ticket</button>' +
    (mine ? '<button type="button" class="btn danger" data-act="ticket-remove">Remove the file</button>' : '') + '</div>' +
    '<div class="note" id="ticket-msg">' + (mine ? (local ? 'This ticket file is kept on this device only. Sign in to keep it on all your devices.' : 'A copy is kept on this device once you have opened it, so it works with no signal.') : 'The ticket file belongs to the person who added it, so it is not shared.') + '</div>';
}
function getTicketFile(att) {
  return idb.get(att.id).then(function (rec) {
    if (rec) return rec;
    if (!S.account || /^local/.test(att.id)) throw new Error('This ticket file is not on this device. Sign in as the person who added it, or add it again.');
    return api('/file/get', { token: S.account.token, body: { id: att.id } }).then(function (r) {
      var rec2 = { id: att.id, name: r.name, type: r.type, bytes: b64ToBytes(r.data).buffer };
      return idb.put(rec2).then(function () { return rec2; });
    });
  });
}
T.hooks.click.push(function (a, t, e, rm) {
  if (a === 'ticket-download' || a === 'ticket-open') {
    var sh = ui.sheet, att = sh && sh.ev.data.att, msg = $('#ticket-msg'); if (!att) return true;
    if (msg) msg.textContent = 'Getting the ticket';
    getTicketFile(att).then(function (rec) {
      var url = URL.createObjectURL(new Blob([rec.bytes], { type: rec.type || 'application/octet-stream' }));
      if (a === 'ticket-download') { var link = document.createElement('a'); link.href = url; link.download = rec.name || 'ticket'; document.body.appendChild(link); link.click(); link.remove(); }
      else { var w = window.open(url, '_blank'); if (!w) { location.href = url; } }
      if (msg) msg.textContent = 'Done.';
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }).catch(function (er) { if (msg) msg.textContent = er.message || 'The ticket could not be opened.'; });
    return true;
  }
  if (a === 'ticket-remove') {
    var s2 = ui.sheet, ev = s2 && R(rm.id).events[s2.id]; if (!ev) return true;
    var att2 = ev.data.att, nd = Object.assign({}, ev.data); delete nd.att;
    T.put('event', s2.id, nd);
    if (att2) { idb.del(att2.id); if (S.account && !/^local/.test(att2.id)) api('/file/delete', { token: S.account.token, body: { id: att2.id } }).catch(function () {}); }
    T.closeDialog(); T.render(); toast('The ticket file was removed');
    return true;
  }
  return false;
});

var TYPES = [['train', 'Train'], ['coach', 'Coach or bus'], ['flight', 'Flight'], ['ferry', 'Ferry'], ['journey', 'Other journey or event']];
function openTicket() {
  ui.tk = { file: null, cands: [], on: [], notice: '' };
  T.openDialog('<div class="actions"><h2>Add a ticket</h2><span class="spacer"></span><button type="button" class="btn sm" data-act="close">Close</button></div>' +
    '<div class="stack"><p class="note">Download your ticket from the train company, coach company, airline or event seller. Then choose the file here. Tandem reads the date, the times and the route and adds the journey to your calendar, and keeps the ticket so you can download it again from the event. It works with PDF tickets, Apple Wallet passes and calendar files.</p>' +
    '<label class="f">Choose the ticket you downloaded<input type="file" id="tk-file" accept=".pdf,.pkpass,.ics,application/pdf,text/calendar,image/*"></label>' +
    '<details class="disc"><summary>Or paste the text of a booking email</summary><label class="f">Booking details<textarea id="tk-text" maxlength="8000" placeholder="Paste the text of your confirmation email here"></textarea></label><div class="actions"><button type="button" class="btn" data-act="tk-read-text">Read this text</button></div></details>' +
    '<div class="err" id="tk-err"></div><div id="tk-body" class="stack"></div></div>');
}
function blankCand() { return { mode: 'train', date: T.today(), dep: '', arr: '', arrDate: '', from: '', to: '', ref: '', carrier: '', seat: '', cls: '', title: '' }; }
function showCandidates(cands, notice) {
  var tk = ui.tk; tk.cands = cands.length ? cands : [blankCand()]; tk.on = tk.cands.map(function () { return true; });
  tk.notice = notice || (cands.length ? '' : 'The details could not be found automatically, so please check and fill them in.');
  drawTicketForm();
}
function drawTicketForm() {
  var tk = ui.tk, box = $('#tk-body'); if (!box) return;
  var h = tk.notice ? '<div class="notice">' + esc(tk.notice) + '</div>' : '';
  h += '<p class="note">Please check what was found. You can change anything before it is added.</p>';
  tk.cands.forEach(function (c, i) {
    h += '<fieldset class="card stack" data-cand="' + i + '" style="gap:8px"><label class="chk"><input type="checkbox" data-tk-on="' + i + '"' + (tk.on[i] ? ' checked' : '') + '> Add this journey</label>' +
      '<label class="f">Title<input type="text" data-f="title" maxlength="120" value="' + esc(c.title) + '"></label>' +
      '<div class="row2"><label class="f">Type<select data-f="mode">' + TYPES.map(function (x) { return '<option value="' + x[0] + '"' + (c.mode === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label><label class="f">Date<input type="date" data-f="date" value="' + esc(c.date) + '"></label></div>' +
      '<div class="row2"><label class="f">Departs<input type="time" data-f="dep" value="' + esc(c.dep) + '"></label><label class="f">Arrives<input type="time" data-f="arr" value="' + esc(c.arr) + '"></label></div>' +
      '<label class="f">Arrival date, only if it is a different day<input type="date" data-f="arrDate" value="' + esc(c.arrDate) + '"></label>' +
      '<div class="row2"><label class="f">From<input type="text" data-f="from" maxlength="60" value="' + esc(c.from) + '"></label><label class="f">To<input type="text" data-f="to" maxlength="60" value="' + esc(c.to) + '"></label></div>' +
      '<div class="row2"><label class="f">Booking reference<input type="text" data-f="ref" maxlength="40" value="' + esc(c.ref) + '"></label><label class="f">Seat or coach<input type="text" data-f="seat" maxlength="60" value="' + esc(c.seat) + '"></label></div>' +
      '<input type="hidden" data-f="carrier" value="' + esc(c.carrier) + '"><input type="hidden" data-f="cls" value="' + esc(c.cls) + '"></fieldset>';
  });
  if (tk.file) {
    var big = tk.file.size > MAX_TICKET_BYTES;
    h += '<div class="note">' + (big ? 'The file is too large to keep (the limit is about 1.5 megabytes), so only the times will be added.' : 'The file <strong>' + esc(tk.file.name) + '</strong> will be kept with the event so you can download it later.' + (S.account ? '' : ' You are not signed in, so it is kept on this device only.')) + '</div>';
  }
  h += '<div class="err" id="tk-save-err"></div><div class="actions"><button type="button" class="btn primary" data-act="tk-save">Add to my calendar</button><button type="button" class="btn" data-act="close">Cancel</button></div>';
  box.innerHTML = h;
}
function readCandidatesFrom() {
  return ui.tk.cands.map(function (c, i) {
    var fs = $('[data-cand="' + i + '"]'), out = Object.assign({}, c); if (!fs) return out;
    $$('[data-f]', fs).forEach(function (inp) { out[inp.dataset.f] = inp.value.trim(); });
    return out;
  });
}
function readTicketFile(file) {
  var err = $('#tk-err'); if (err) err.textContent = '';
  if (file.size > MAX_IMPORT_BYTES) { err.textContent = 'That file is too large to read.'; return; }
  var ext = extOf(file.name), tk = ui.tk;
  tk.file = { name: file.name, type: file.type || (ext === 'pdf' ? 'application/pdf' : ext === 'pkpass' ? 'application/vnd.apple.pkpass' : ''), size: file.size, buf: null };
  var body = $('#tk-body'); if (body) body.innerHTML = '<p class="note">Reading the ticket</p>';
  readFile(file).then(function (buf) {
    tk.file.buf = buf;
    if (ext === 'pdf' || file.type === 'application/pdf') {
      return loadPdfJs().then(function (lib) { return I.pdfRows(lib, buf.slice(0)); }).then(function (pr) { var r = I.parseTicket(pr.lines.join('\n')); showCandidates(r.candidates); });
    }
    if (ext === 'pkpass') {
      var z = I.openZip(buf);
      return z.get('pass.json').then(function (u8) { if (!u8) throw new Error('That pass could not be read.'); var r = I.parsePass(JSON.parse(I.text(u8))); if (r.notes) r.candidates[0].notes = r.notes; showCandidates(r.candidates); });
    }
    if (ext === 'ics' || file.type === 'text/calendar') {
      var res = C.parseICS(new TextDecoder().decode(new Uint8Array(buf)));
      showCandidates(res.events.slice(0, 12).map(function (e) { var d = e.data; return Object.assign(blankCand(), { mode: 'journey', title: d.title, date: d.date, dep: d.start || '', arr: d.end && d.end !== d.start ? d.end : '', arrDate: d.endDate || '', from: d.place || '' }); }));
      return null;
    }
    if (/^image\//.test(file.type)) { showCandidates([], 'This is a picture, so the times cannot be read automatically. Please fill them in. The picture will be kept with the event.'); return null; }
    throw new Error('That kind of file is not supported. Please choose a PDF, an Apple Wallet pass (.pkpass) or a calendar file (.ics), or paste the booking email.');
  }).catch(function (er) { tk.file = null; if (body) body.innerHTML = ''; if (err) err.textContent = er.message || 'That file could not be read.'; });
}
function saveTicket() {
  var rm = T.activeRoom(), tk = ui.tk, err = $('#tk-save-err'); if (!rm || !tk) return;
  err.textContent = '';
  var cands = readCandidatesFrom().filter(function (c, i) { return tk.on[i]; });
  if (!cands.length) { err.textContent = 'Please choose at least one journey to add.'; return; }
  var events = [];
  for (var i = 0; i < cands.length; i++) {
    var c = cands[i];
    if (!c.date) { err.textContent = 'Every journey needs a date.'; return; }
    if (!c.title) c.title = ({ train: 'Train', coach: 'Coach', flight: 'Flight', ferry: 'Ferry', journey: 'Journey' }[c.mode] || 'Journey') + (c.from && c.to ? ': ' + c.from + ' to ' + c.to : '');
    var cl = C.cleanEvent(I.tripToEvent(c, rm.me));
    if (cl.error) { err.textContent = cl.error; return; }
    cl.data.who = [rm.me];
    events.push(cl.data);
  }
  var btn = $('[data-act="tk-save"]'); if (btn) btn.disabled = true;
  var keep = tk.file && tk.file.buf && tk.file.size <= MAX_TICKET_BYTES;
  var attP = Promise.resolve(null);
  if (keep) {
    var f = tk.file;
    attP = (S.account ? api('/file/put', { token: S.account.token, body: { name: f.name, type: f.type || 'application/octet-stream', data: bytesToB64(f.buf) } }).then(function (r) { return r.id; }) : Promise.resolve('local' + T.uid()))
      .then(function (id) { return idb.put({ id: id, name: f.name, type: f.type, bytes: f.buf }).then(function () { return { id: id, name: f.name, type: f.type, by: rm.me }; }); });
  }
  attP.then(function (att) {
    events.forEach(function (d) { if (att) d.att = att; T.put('event', T.uid(), d, false, true); });
    T.save(); T.setStatus('Saving'); T.scheduleSync(100);
    var first = events.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
    T.closeDialog(); T.ui.date = first.date; T.render(); toast('Added ' + events.length + (events.length === 1 ? ' journey' : ' journeys'));
  }).catch(function (er) { if (btn) btn.disabled = false; err.textContent = (er && er.message) || 'The ticket could not be saved.'; });
}
T.hooks.click.push(function (a, t) {
  if (a === 'open-ticket') { openTicket(); return true; }
  if (a === 'tk-read-text') {
    var txt = $('#tk-text').value.trim(); if (!txt) return true;
    ui.tk.file = null; var r = I.parseTicket(txt); showCandidates(r.candidates); return true;
  }
  if (a === 'tk-save') { saveTicket(); return true; }
  return false;
});
T.hooks.change.push(function (el) {
  if (el.id === 'tk-file') { if (el.files && el.files[0]) readTicketFile(el.files[0]); return true; }
  if (el.dataset && el.dataset.tkOn !== undefined) { ui.tk.on[+el.dataset.tkOn] = el.checked; return true; }
  return false;
});

/* =====================================================================
   Importing a timetable or a file
   ===================================================================== */
function openImport() {
  ui.imp = null;
  T.openDialog('<div class="actions"><h2>Import a file</h2><span class="spacer"></span><button type="button" class="btn sm" data-act="close">Close</button></div>' +
    '<div class="stack"><p class="note">Choose a timetable or a list of events as a CSV file, an Excel sheet (.xlsx), a PDF or a calendar file (.ics). Tandem works out which column is which, or reads a weekly grid, and shows you what it found before anything is added. Everything is read on this device.</p>' +
    '<label class="f">Choose a file<input type="file" id="imp-file" accept=".csv,.xlsx,.pdf,.ics,text/csv,application/pdf,text/calendar,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>' +
    '<div class="err" id="imp-err"></div><div id="imp-body" class="stack"></div></div>');
}
function readImportFile(file) {
  var err = $('#imp-err'), body = $('#imp-body'); err.textContent = ''; body.innerHTML = '<p class="note">Reading the file</p>';
  if (file.size > MAX_IMPORT_BYTES) { body.innerHTML = ''; err.textContent = 'That file is too large to read.'; return; }
  var ext = extOf(file.name), start = T.today();
  var im = ui.imp = { name: file.name, kind: ext, rows: null, alt: null, lines: null, icsEvents: null, order: 'auto', startDate: start, until: C.add(start, 84), columns: null, off: {}, optAfter: '' };
  var p;
  if (ext === 'csv' || ext === 'txt' || file.type === 'text/csv') p = readFile(file, 'text').then(function (t) { im.rows = I.parseCSV(t); });
  else if (ext === 'xlsx') p = readFile(file).then(function (b) { return I.readXLSX(b); }).then(function (rows) { im.rows = rows; });
  else if (ext === 'pdf') p = readFile(file).then(function (b) { return loadPdfJs().then(function (lib) { return I.pdfRows(lib, b); }); }).then(function (pr) { im.rows = pr.aligned || pr.rows; im.alt = pr.aligned ? pr.rows : null; im.lines = pr.lines; });
  else if (ext === 'ics' || file.type === 'text/calendar') p = readFile(file, 'text').then(function (t) { var r = C.parseICS(t); im.icsEvents = r.events; im.icsInfo = r; });
  else if (ext === 'xls' || ext === 'numbers' || ext === 'doc' || ext === 'docx') p = Promise.reject(new Error('That kind of file cannot be read directly. Please save it as an Excel .xlsx, a CSV or a PDF and choose that instead.'));
  else p = Promise.reject(new Error('That kind of file is not supported. Please choose a CSV, an Excel .xlsx, a PDF or a calendar .ics file.'));
  p.then(function () { computeImport(); drawImport(); }).catch(function (e) { ui.imp = null; body.innerHTML = ''; err.textContent = e.message || 'That file could not be read.'; });
}
function computeImport() {
  var im = ui.imp, o = { startDate: im.startDate, until: im.until || '', year: +T.today().slice(0, 4) };
  if (im.order !== 'auto') o.order = im.order;
  if (im.columns) { o.columns = im.columns; o.headerRow = im.headerRow; o.notesCols = im.notesCols; }
  var res;
  if (im.icsEvents) res = { events: im.icsEvents.map(function (e, i) { return { id: e.id, row: i, data: e.data }; }), mode: 'ics', weekly: false, skipped: [], headers: [], columns: {} };
  else {
    res = I.rowsToEvents(im.rows, o);
    if (!res.events.length && im.alt) res = I.rowsToEvents(im.alt, o);
    if (!res.events.length && im.lines) res = I.linesToEvents(im.lines, o);
  }
  im.res = res;
}
var ROLE_LABELS = [['title', 'Title'], ['startDate', 'Date'], ['day', 'Day of the week'], ['time', 'Time or time range'], ['startTime', 'Start time'], ['endTime', 'End time'], ['endDate', 'End date'], ['place', 'Place'], ['allday', 'All day']];
function evLine(d) {
  var when = d.repeat ? 'Every ' + T.DOW[C.dow(d.date)] : T.niceDate(d.date);
  return when + (d.allDay ? ', all day' : d.start ? ', ' + d.start + (d.end && d.end !== d.start ? ' to ' + d.end : '') : '');
}
function drawImport() {
  var im = ui.imp, res = im.res, body = $('#imp-body'); if (!body) return;
  var n = res.events.length, picked = res.events.filter(function (e, i) { return !im.off[i]; }).length;
  var h = '';
  if (!n) {
    h += '<div class="err">No events could be found in this file.</div><p class="note">If the file is a table, make sure the first rows have headings such as Title, Date, Start and End, or Day and Time. A scanned picture inside a PDF cannot be read.</p>';
  } else {
    h += '<p><strong>' + n + (n === 1 ? ' event' : ' events') + '</strong> found in ' + esc(im.name) + '. ' + (res.weekly ? 'This looks like a weekly timetable, so each one repeats every week.' : '') + '</p>';
    if (res.weekly) {
      h += '<div class="row2"><label class="f">Repeat every week from<input type="date" id="imp-start" value="' + esc(im.startDate) + '"></label><label class="f">Until<input type="date" id="imp-until" value="' + esc(im.until || '') + '"></label></div>' +
        '<div class="note">The end date is set twelve weeks ahead. Change it to the last day of your term, or clear it to repeat with no end.</div>';
    }
    h += '<div class="implist">' + res.events.slice(0, 250).map(function (e, i) {
      return '<label class="chk"><input type="checkbox" data-imp-off="' + i + '"' + (im.off[i] ? '' : ' checked') + '><span><span class="tt">' + esc(e.data.title) + '</span> <span class="note">' + esc(evLine(e.data)) + (e.data.place ? ', ' + esc(e.data.place) : '') + '</span></span></label>';
    }).join('') + (n > 250 ? '<div class="note">and ' + (n - 250) + ' more, which will be added too unless you cancel</div>' : '') + '</div>';
    h += '<label class="f">Mark events that start at or after this time as optional (leave empty for none)<input type="time" id="imp-opt" value="' + esc(im.optAfter) + '"></label>' +
      '<div class="note">For example, if the sessions after 1 pm each day are optional for you, enter 13:00. They stay in your calendar, shown softly, and are left out of your free time and countdowns.</div>';
  }
  if (res.skipped && res.skipped.length) h += '<div class="note">' + res.skipped.length + (res.skipped.length === 1 ? ' row was' : ' rows were') + ' left out because ' + (res.skipped.length === 1 ? 'it' : 'they') + ' had no usable date or title.</div>';
  if (im.icsInfo && (im.icsInfo.skipped || im.icsInfo.simplified)) h += '<div class="note">' + (im.icsInfo.skipped ? im.icsInfo.skipped + ' cancelled or incomplete entries were left out. ' : '') + (im.icsInfo.simplified ? im.icsInfo.simplified + ' events use a repeat rule that Tandem cannot follow exactly.' : '') + '</div>';
  if (im.rows && !im.icsEvents && (res.mode === 'table' || res.mode === 'weekday')) {
    var hd = res.headers || [];
    h += '<details class="disc"><summary>The columns are not right? Change them</summary><div class="stack" style="gap:8px">' +
      ROLE_LABELS.map(function (r) {
        var cur = res.columns[r[0]];
        return '<label class="f">' + r[1] + '<select data-imp-col="' + r[0] + '"><option value="-1">Not in the file</option>' + (res.rows ? '' : '') + hd.map(function (x, i) { return '<option value="' + i + '"' + (cur === i ? ' selected' : '') + '>' + esc(x || 'Column ' + (i + 1)) + '</option>'; }).join('') + '</select></label>';
      }).join('') +
      '<label class="f">Dates are written<select id="imp-order"><option value="auto"' + (im.order === 'auto' ? ' selected' : '') + '>Detect it</option><option value="dmy"' + (im.order === 'dmy' ? ' selected' : '') + '>Day first, 16/11/2026</option><option value="mdy"' + (im.order === 'mdy' ? ' selected' : '') + '>Month first, 11/16/2026</option></select></label></div></details>';
  }
  h += '<div class="actions"><button type="button" class="btn primary" data-act="imp-do"' + (picked ? '' : ' disabled') + '>Add ' + picked + (picked === 1 ? ' event' : ' events') + '</button><button type="button" class="btn" data-act="close">Cancel</button></div>';
  body.innerHTML = h;
}
function doImport() {
  var rm = T.activeRoom(), im = ui.imp; if (!rm || !im || !im.res) return;
  var batch = T.uid().slice(0, 10), name = im.name.slice(0, 60), count = 0;
  var opt = $('#imp-opt'); if (opt) im.optAfter = opt.value;
  im.res.events.forEach(function (e, i) {
    if (im.off[i]) return;
    var d = Object.assign({}, e.data, { who: [rm.me], by: rm.me, imp: batch, impn: name });
    T.put('event', e.id, d, false, true); count++;
  });
  if (im.optAfter) makeRule('optional', { after: im.optAfter }, '');
  T.save(); T.setStatus('Saving'); T.scheduleSync(100);
  var first = im.res.events.filter(function (e, i) { return !im.off[i]; }).map(function (e) { return e.data.date; }).sort()[0];
  ui.imp = null; ui.flash = 'Added ' + count + (count === 1 ? ' event' : ' events') + ' from ' + name + '. You can remove them all together in Settings if this was not what you wanted.';
  T.closeDialog(); if (first) T.ui.date = first; T.render(); T.openSettings();
}
T.hooks.click.push(function (a, t) {
  if (a === 'open-import') { openImport(); return true; }
  if (a === 'imp-do') { doImport(); return true; }
  return false;
});
T.hooks.change.push(function (el) {
  var im = ui.imp;
  if (el.id === 'imp-file') { if (el.files && el.files[0]) readImportFile(el.files[0]); return true; }
  if (!im) return false;
  if (el.dataset && el.dataset.impOff !== undefined) { im.off[+el.dataset.impOff] = !el.checked; var b = $('[data-act="imp-do"]'), n = im.res.events.filter(function (e, i) { return !im.off[i]; }).length; if (b) { b.disabled = !n; b.textContent = 'Add ' + n + (n === 1 ? ' event' : ' events'); } return true; }
  if (el.id === 'imp-start') { im.startDate = el.value || im.startDate; computeImport(); drawImport(); return true; }
  if (el.id === 'imp-until') { im.until = el.value; computeImport(); drawImport(); return true; }
  if (el.id === 'imp-opt') { im.optAfter = el.value; return true; }
  if (el.id === 'imp-order') { im.order = el.value; computeImport(); drawImport(); return true; }
  if (el.dataset && el.dataset.impCol) {
    var cols = Object.assign({}, im.res.columns); var v = +el.value;
    if (v < 0) delete cols[el.dataset.impCol]; else cols[el.dataset.impCol] = v;
    im.columns = cols; im.headerRow = im.res.headerRow; im.notesCols = im.res.notesCols || [];
    computeImport(); drawImport(); return true;
  }
  return false;
});

/* imports can be taken back together, and the whole calendar can be saved as a file */
function importGroups(rm) {
  var d = R(rm.id), g = {};
  Object.keys(d.events).forEach(function (id) { var e = d.events[id]; if (e.deleted || !e.data || !e.data.imp) return; var k = e.data.imp; (g[k] = g[k] || { id: k, name: e.data.impn || 'Imported file', ids: [] }).ids.push(id); });
  return Object.keys(g).map(function (k) { return g[k]; });
}
T.sections.middle.push(function (rm) {
  var groups = importGroups(rm);
  return '<div class="sect"><h3>Imported files</h3>' + (groups.length ? groups.map(function (g) {
    return '<div class="shrow" data-imp-group="' + esc(g.id) + '"><span class="grow">' + esc(g.name) + ', ' + g.ids.length + (g.ids.length === 1 ? ' event' : ' events') + '</span><button type="button" class="btn sm danger" data-act="imp-undo-ask" data-id="' + esc(g.id) + '">Remove</button></div>';
  }).join('') + '<p class="note">Removing an imported file takes all of its events out of this calendar. Events you added yourself are not touched.</p>' : '<p class="note">Files you import appear here, so you can take a whole import back in one step.</p>') +
    '<div class="actions"><button type="button" class="btn" data-act="open-import">Import a file</button><button type="button" class="btn" data-act="export-ics">Download this calendar as a file</button></div></div>';
});
T.hooks.click.push(function (a, t, e, rm) {
  if (a === 'imp-undo-ask') {
    var row = t.closest('[data-imp-group]'); row.innerHTML = '<span class="grow">Remove every event from this file?</span><button type="button" class="btn sm danger" data-act="imp-undo-do" data-id="' + esc(t.dataset.id) + '">Remove them</button><button type="button" class="btn sm" data-act="settings">Keep them</button>';
    return true;
  }
  if (a === 'imp-undo-do') {
    var g = importGroups(rm).filter(function (x) { return x.id === t.dataset.id; })[0];
    if (g) { g.ids.forEach(function (id) { var ev = R(rm.id).events[id]; if (ev) T.put('event', id, ev.data, true, true); }); T.save(); T.setStatus('Saving'); T.scheduleSync(100); ui.flash = 'Removed ' + g.ids.length + ' events.'; T.render(); T.openSettings(); }
    return true;
  }
  if (a === 'export-ics') {
    var d = R(rm.id), evs = Object.keys(d.events).map(function (id) { return { id: id, data: d.events[id].data, deleted: d.events[id].deleted }; });
    var mm = {}; Object.keys(d.members).forEach(function (id) { mm[id] = d.members[id].name; });
    var blob = new Blob([C.toICS(d.meta.name || 'Tandem', evs, mm)], { type: 'text/calendar' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = (d.meta.name || 'tandem').replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.ics'; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    return true;
  }
  return false;
});

/* =====================================================================
   Search
   ===================================================================== */
function runSearch(q) {
  var box = $('#sr-body'); if (!box) return;
  q = q.trim().toLowerCase(); if (q.length < 2) { box.innerHTML = '<p class="note">Type at least two letters.</p>'; return; }
  var td = T.today(), from = C.add(td, -60), to = C.add(td, 400), out = [];
  T.eventsList().forEach(function (e) {
    if (e.deleted || !e.data) return;
    var d = e.data, hay = [d.title, d.place, d.notes, d.trip && d.trip.ref, d.trip && d.trip.from, d.trip && d.trip.to].join(' ').toLowerCase();
    if (hay.indexOf(q) < 0) return;
    var starts = C.occurrenceStarts(d, from, to), next = starts.filter(function (s) { return s >= td; })[0] || starts[starts.length - 1] || d.date;
    out.push({ id: e.id, d: d, date: next, past: next < td });
  });
  out.sort(function (a, b) { return (a.past - b.past) || (a.date < b.date ? -1 : 1); });
  box.innerHTML = out.length ? out.slice(0, 60).map(function (o) {
    return '<button type="button" class="listrow" data-act="event" data-id="' + esc(o.id) + '" data-date="' + esc(o.date) + '"><span class="grow"><div class="tt">' + esc(o.d.title) + '</div><div class="note">' + esc(T.niceDate(o.date) + (o.d.start && !o.d.allDay ? ', ' + o.d.start : '') + (o.past ? ' (past)' : '')) + '</div></span></button>';
  }).join('') : '<p class="note">Nothing matches that.</p>';
}
T.hooks.click.push(function (a) {
  if (a === 'search') {
    T.openDialog('<div class="actions"><h2>Search</h2><span class="spacer"></span><button type="button" class="btn sm" data-act="close">Close</button></div><div class="stack"><input type="search" id="sr-q" placeholder="Title, place, notes or booking reference" autocomplete="off"><div id="sr-body" class="stack" style="gap:0"><p class="note">Type at least two letters.</p></div></div>');
    setTimeout(function () { var i = $('#sr-q'); if (i) i.focus(); }, 60);
    return true;
  }
  return false;
});
document.addEventListener('input', function (e) { if (e.target && e.target.id === 'sr-q') runSearch(e.target.value); });

/* =====================================================================
   Reminders: a notification shortly before an event starts, even when Tandem is closed
   ===================================================================== */
var PUSH_API = String((window.TANDEM_CONFIG || {}).api || '').replace(/\/tandem$/, '/tandem-push');
var VAPID = (window.TANDEM_CONFIG || {}).vapid;
function pushPost(path, body) {
  return fetch(PUSH_API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (j) { if (!res.ok) { var e = new Error(j.error || 'That did not work.'); e.status = res.status; throw e; } return j; });
  });
}
function pushSupport() {
  var ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  return { ios: ios, standalone: standalone, ok: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window };
}
function keyBytes(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return b64ToBytes(s); }
function pushState() { return S.device.push || { on: false, lead: 10 }; }
function getSub() { return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription().then(function (sub) { return { reg: reg, sub: sub }; }); }); }
function pushBody(sub, welcome) {
  return {
    sub: sub.toJSON(), tz: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || 'Europe/London', lead: pushState().lead, welcome: !!welcome,
    rooms: S.rooms.filter(function (r) { return !r.invalid; }).map(function (r) { return { key: r.key, me: r.me }; }),
    rules: Object.keys(S.rules).map(function (k) { return S.rules[k]; }).filter(function (r) { return !r.gone; }).map(function (r) { var c = Object.assign({}, r); delete c.label; return c; })
  };
}
var pushTimer = null;
T.pushSchedule = function (ms) { if (!pushState().on) return; clearTimeout(pushTimer); pushTimer = setTimeout(pushSync, ms == null ? 2500 : ms); };
function pushSync() {
  if (!pushState().on || !pushSupport().ok || !S.rooms.length) return Promise.resolve();
  if (Notification.permission !== 'granted') { S.device.push = { on: false, lead: pushState().lead }; T.save(); return Promise.resolve(); }
  return getSub().then(function (x) {
    var p = x.sub ? Promise.resolve(x.sub) : x.reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) });
    return p.then(function (sub) { return pushPost('/subscribe', pushBody(sub, false)); });
  }).catch(function () {});
}
function enablePush(lead) {
  if (!VAPID) return Promise.reject(new Error('Reminders are not set up in this copy of Tandem.'));
  return Notification.requestPermission().then(function (perm) {
    if (perm !== 'granted') throw new Error('Notifications are blocked for Tandem. Allow them in the settings of your device or browser, then try again.');
    return getSub();
  }).then(function (x) {
    return (x.sub ? Promise.resolve(x.sub) : x.reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
  }).then(function (sub) {
    S.device.push = { on: true, lead: lead };
    return pushPost('/subscribe', pushBody(sub, true));
  }).then(function () { T.save(); });
}
function disablePush() {
  S.device.push = { on: false, lead: pushState().lead }; T.save();
  if (!pushSupport().ok) return Promise.resolve();
  return getSub().then(function (x) { if (!x.sub) return; var ep = x.sub.endpoint; return x.sub.unsubscribe().then(function () { return pushPost('/unsubscribe', { endpoint: ep }); }); }).catch(function () {});
}
var baseSchedule = T.acctSchedule;
T.acctSchedule = function (ms) { T.pushSchedule(); return baseSchedule(ms); };
setTimeout(pushSync, 4000);
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') T.pushSchedule(1500); });

function remindersSection() {
  var sp = pushSupport(), st = pushState(), lead = st.lead || 10, h = '<div class="sect"><h3>Reminders</h3>';
  if (!sp.ok || (sp.ios && !sp.standalone)) {
    h += '<p class="note">Tandem can send a notification shortly before an event starts, even when it is closed. ' + (sp.ios ? 'On an iPhone or an iPad this only works once Tandem is on the Home Screen: open Tandem in Safari, tap the Share button, choose Add to Home Screen, then open Tandem from the Home Screen and come back to this page. It needs iOS or iPadOS 16.4 or newer.' : 'This browser does not support notifications. Please use a recent version of Safari, Chrome, Edge or Firefox.') + '</p></div>';
    return h;
  }
  var opts = [5, 10, 15, 30, 60].map(function (n) { return '<option value="' + n + '"' + (lead === n ? ' selected' : '') + '>' + n + ' minutes before</option>'; }).join('');
  if (st.on) {
    h += '<p class="note">Reminders are <strong>on for this device</strong>. Each device is switched on separately, so do the same on your phone, tablet and computer.</p>' +
      '<label class="f">Tell me<select data-push-lead>' + opts + '</select></label>' +
      '<div class="actions"><button type="button" class="btn" data-act="push-test">Send a test reminder</button><button type="button" class="btn" data-act="push-off">Turn off</button></div>';
  } else {
    h += '<p class="note">Get a notification shortly before an event starts, on this device, even when Tandem is closed.</p>' +
      '<label class="f">Tell me<select data-push-lead>' + opts + '</select></label>' +
      '<div class="actions"><button type="button" class="btn primary" data-act="push-on">Turn on reminders</button></div>';
  }
  h += '<div class="note" id="push-msg" role="status"></div>' +
    '<p class="note">Reminders are for timed events in your calendars that are for you or for everyone. Events you have marked as optional or hidden, and all day events, never send one. Your device tells Tandem which calendars to watch, so removing a calendar or replacing its link stops its reminders.</p></div>';
  return h;
}
T.sections.top.push(remindersSection);
T.hooks.click.push(function (a, t) {
  var msg = $('#push-msg');
  if (a === 'push-on') {
    var sel = $('[data-push-lead]'), lead = sel ? +sel.value : 10; t.disabled = true;
    if (msg) msg.textContent = 'Please allow notifications when your device asks.';
    enablePush(lead).then(function () { ui.flash = 'Reminders are on for this device. A confirmation notification is on its way.'; T.openSettings(); })
      .catch(function (e) { t.disabled = false; if (msg) msg.textContent = e.message || 'Reminders could not be switched on.'; });
    return true;
  }
  if (a === 'push-off') { disablePush().then(function () { ui.flash = 'Reminders are off for this device.'; T.openSettings(); }); return true; }
  if (a === 'push-test') {
    getSub().then(function (x) { if (!x.sub) throw new Error('This device is not signed up for reminders yet.'); if (msg) msg.textContent = 'Sending'; return pushPost('/test', { endpoint: x.sub.endpoint }); })
      .then(function (r) { if (msg) msg.textContent = r.ok ? 'Sent. It should arrive within a few seconds.' : 'The notification service did not accept it (' + r.status + '). Try turning reminders off and on again.'; })
      .catch(function (e) { if (msg) msg.textContent = e.message || 'The test could not be sent.'; });
    return true;
  }
  return false;
});
T.hooks.change.push(function (el) {
  if (el.dataset && el.dataset.pushLead !== undefined) { var st = pushState(); S.device.push = { on: st.on, lead: +el.value }; T.save(); if (st.on) pushSync(); return true; }
  return false;
});
};
})();
