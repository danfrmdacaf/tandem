/* Tandem. The parts of the interface that help people find things: the Add menu, the More menu, the install
   guide, the first steps list and the banners. Built by Daniel Chidi, Founder, Adachi Industries. */
(function () {
'use strict';
window.TandemShell = function (T) {
var S = T.S, C = T.C, ui = T.ui, esc = T.esc, $ = T.$, ICON = T.ICON;
var DAY = 86400000;

/* ---------- what device and browser this is ---------- */
function platform() {
  var ua = navigator.userAgent || '', plat = navigator.platform || '';
  var ipadOs = plat === 'MacIntel' && navigator.maxTouchPoints > 1;
  var ios = /iPhone|iPad|iPod/.test(ua) || ipadOs;
  var android = /Android/.test(ua);
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var iosOther = ios && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  var firefox = /Firefox\//.test(ua) && !ios;
  var edgeOrChrome = /Edg\/|Chrome\//.test(ua) && !ios;
  return { ios: ios, ipad: /iPad/.test(ua) || ipadOs, android: android, standalone: standalone, iosOther: iosOther, firefox: firefox, chromium: edgeOrChrome, mac: /Mac/.test(plat) && !ios, win: /Win/.test(plat) };
}
function appUrl() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
function head(title) { return '<div class="actions"><h2>' + esc(title) + '</h2><span class="spacer"></span><button type="button" class="btn sm" data-act="close">Close</button></div>'; }
function row(act, title, text, extra) {
  return '<button type="button" class="listrow" data-act="' + act + '"' + (extra || '') + '><span class="grow"><div class="tt">' + esc(title) + '</div><div class="note">' + esc(text) + '</div></span></button>';
}

/* ---------- the Add menu ---------- */
function openAddMenu() {
  var rm = T.activeRoom();
  T.openDialog(head('Add to ' + (rm ? (T.R(rm.id).meta.name || 'your calendar') : 'your calendar')) +
    '<div>' +
    row('add', 'New event', 'Add a single event or one that repeats.') +
    row('open-import', 'Import a timetable or a file', 'From a CSV file, an Excel sheet, a PDF or a calendar file. Tandem works out the columns for you.') +
    row('open-ticket', 'Add a ticket', 'Read a train, coach or flight ticket and add the journey, with the ticket kept alongside it.') +
    row('invite', 'Invite someone', 'Share this calendar with a link or a short code.') +
    row('new-or-join', 'Create or join another calendar', 'Keep a separate calendar, or join one that someone has shared with you.') +
    '</div>');
}

/* ---------- the More menu ---------- */
function openMoreMenu() {
  var plat = platform();
  T.openDialog(head('More') + '<div>' +
    row('search', 'Search', 'Find an event by title, place, notes or booking reference.') +
    row('rooms', 'Your calendars', 'Switch between the calendars on this device.') +
    row('settings', 'Reminders', 'Choose to be notified before an event starts.') +
    (plat.standalone ? '' : row('install-guide', 'Get the app', 'Put Tandem on your Home Screen so it opens like an app.')) +
    row('share-app', 'Send Tandem to someone', 'Share the link to the app itself.') +
    (S.account ? row('settings', 'Account', 'Signed in as ' + S.account.email + '.') : row('auth-open', 'Create an account or sign in', 'Keep your calendars on every device.', ' data-tab="signup"')) +
    row('settings', 'Settings', 'Calendar name, people, sharing, security and more.') +
    '</div><p class="foot">Tandem is built by Daniel Chidi, Founder, Adachi Industries.</p>');
}

/* ---------- inviting someone ---------- */
function openInvite() {
  var rm = T.activeRoom(); if (!rm) return;
  var url = location.href.split('#')[0].split('?')[0] + '#join=' + rm.key, name = T.R(rm.id).meta.name || 'Calendar';
  T.openDialog(head('Invite someone') + '<div class="stack">' +
    '<p class="note">Anyone who has this link can see and change <strong>' + esc(name) + '</strong>, so send it only to people you trust.</p>' +
    '<div class="linkbox">' + esc(url) + '</div>' +
    '<div class="actions"><button type="button" class="btn primary" data-act="copy-link">Copy the link</button>' + (navigator.share ? '<button type="button" class="btn" data-act="share-link">Share</button>' : '') +
    '<a class="btn" href="mailto:?subject=' + encodeURIComponent('Join our calendar on Tandem') + '&body=' + encodeURIComponent('Open this link to join the calendar "' + name + '" on Tandem:\n\n' + url) + '">Email the link</a></div>' +
    '<div class="sect"><h3>On an iPhone or an iPad</h3><p class="note">The Home Screen app keeps its own storage, so a link opened in Safari does not reach it. The easiest way is for the other person to add Tandem to their Home Screen first, open it, and then choose Join a calendar and type a short code.</p>' +
    '<div class="actions"><button type="button" class="btn" data-act="make-code">Show a short code</button></div><div id="st-code"></div></div></div>');
}

/* ---------- installing ---------- */
function shareIcon() { return '<span class="inl">' + ICON.share + '</span>'; }
function guideSteps(p) {
  if (p.standalone) return '<div class="notice">Tandem is already installed on this device. You are using it now.</div>';
  if (p.ios && !p.iosOther) {
    return '<ol class="steps"><li>Stay in <strong>Safari</strong>, the browser you are in now.</li>' +
      '<li>Tap the <strong>Share</strong> button ' + shareIcon() + '. On an iPhone it is at the bottom of the screen. On an iPad it is at the top right.</li>' +
      '<li>Scroll the list and tap <strong>Add to Home Screen</strong>.</li><li>Tap <strong>Add</strong>. Tandem appears with its icon on your Home Screen.</li>' +
      '<li>Open Tandem <strong>from the Home Screen</strong> from now on, not from Safari.</li></ol>' +
      '<p class="note">Apple does not let a website install itself with one tap, so these steps are needed on every iPhone and iPad. It takes about ten seconds.</p>' +
      '<p class="note">Reminders need iOS or iPadOS 16.4 or newer, and they only work from the Home Screen app.</p>';
  }
  if (p.ios) {
    return '<ol class="steps"><li>Tap the <strong>Share</strong> button ' + shareIcon() + ' in the browser.</li><li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li></ol>' +
      '<p class="note">If you cannot find Add to Home Screen, open this page in <strong>Safari</strong> and follow the same steps. Safari is the most reliable on iPhone and iPad.</p>' +
      '<div class="actions"><button type="button" class="btn" data-act="copy-app">Copy the link to open in Safari</button></div>';
  }
  if (p.android) {
    return (ui.deferredInstall ? '<button type="button" class="btn primary block" data-act="install-now">Install Tandem</button><p class="note">Your browser will ask you to confirm. Tandem then appears on your Home Screen.</p>' :
      '<ol class="steps"><li>Open the browser menu, the three dots at the top right.</li><li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li><li>Confirm. Tandem appears on your Home Screen.</li></ol>');
  }
  if (p.mac && !p.chromium && !p.firefox) {
    return '<ol class="steps"><li>In Safari, open the <strong>File</strong> menu.</li><li>Choose <strong>Add to Dock</strong>.</li><li>Tandem opens in its own window and stays in your Dock.</li></ol>';
  }
  if (p.chromium) {
    return (ui.deferredInstall ? '<button type="button" class="btn primary block" data-act="install-now">Install Tandem</button><p class="note">Tandem then opens in its own window and can be found like any other application.</p>' :
      '<ol class="steps"><li>Look for the install icon at the right of the address bar, or open the browser menu.</li><li>Choose <strong>Install Tandem</strong>.</li></ol>');
  }
  if (p.firefox) return '<p class="note">Firefox does not install web apps on a computer. Use Safari, Chrome or Edge to install Tandem, or keep this page bookmarked.</p>';
  return '<p class="note">Open the browser menu and look for an option to install the app or add it to your Home Screen.</p>';
}
function openGuide() {
  var p = platform();
  T.openDialog(head('Get the Tandem app') + '<div class="stack">' + guideSteps(p) +
    '<div class="sect"><h3>Send it to someone</h3><p class="note">Share the link to Tandem so someone else can install it on their own device.</p>' +
    '<div class="actions"><button type="button" class="btn" data-act="share-app">Share Tandem</button><button type="button" class="btn" data-act="copy-app">Copy the link</button></div></div></div>');
}
function installNow() {
  var ev = ui.deferredInstall; if (!ev) { openGuide(); return; }
  ev.prompt(); ui.deferredInstall = null;
  if (ev.userChoice) ev.userChoice.then(function () { T.closeDialog(); T.render(); });
}
T.installButton = function () {
  if (platform().standalone) return '';
  return '<button type="button" class="btn sm instbtn" data-act="' + (ui.deferredInstall ? 'install-now' : 'install-guide') + '">Get the app</button>';
};
T.banner = function () {
  var h = '';
  if (ui.update) h += '<div class="banner" role="status"><div class="grow"><strong>A new version of Tandem is ready.</strong></div><button type="button" class="btn primary sm" data-act="reload-app">Update now</button></div>';
  var p = platform(), at = S.device.bannerAt;
  if (!p.standalone && !(at && Date.now() - at < 7 * DAY)) {
    h += '<div class="banner" role="region" aria-label="Install Tandem"><div class="grow"><strong>Put Tandem on your Home Screen</strong><div class="sub">It opens like an app, works without a connection and can remind you before an event.</div></div>' +
      '<button type="button" class="btn primary sm" data-act="' + (ui.deferredInstall ? 'install-now' : 'install-guide') + '">' + (ui.deferredInstall ? 'Install' : 'Show me how') + '</button><button type="button" class="btn sm" data-act="banner-hide">Not now</button></div>';
  }
  return h;
};

/* ---------- first steps ---------- */
function stats() {
  var rm = T.activeRoom(); if (!rm) return null;
  var d = T.R(rm.id), live = Object.keys(d.events).map(function (k) { return d.events[k]; }).filter(function (e) { return !e.deleted && e.data; });
  return {
    events: live.length, imported: live.some(function (e) { return !!e.data.imp; }), ticket: live.some(function (e) { return !!(e.data.att || e.data.trip); }),
    people: Object.keys(d.members).filter(function (k) { return !d.members[k].deleted; }).length, push: !!(S.device.push && S.device.push.on), installed: platform().standalone, account: !!S.account
  };
}
T.startCard = function () {
  var st = stats(); if (!st || st.events > 0) return '';
  return '<section class="card start"><h3>Start your calendar</h3><p class="note">Choose how you want to begin. You can do all of these later from the Add button.</p><div class="tiles">' +
    '<button type="button" class="tile" data-act="add"><b>Add an event</b><span>Type in a lecture, a shift or a plan.</span></button>' +
    '<button type="button" class="tile" data-act="open-import"><b>Import a timetable</b><span>CSV, Excel, PDF or a calendar file.</span></button>' +
    '<button type="button" class="tile" data-act="open-ticket"><b>Add a ticket</b><span>Train, coach or flight, with the times read for you.</span></button>' +
    '<button type="button" class="tile" data-act="invite"><b>Invite someone</b><span>Share this calendar with a link.</span></button></div></section>';
};
T.checklist = function () {
  var st = stats(); if (!st || st.events === 0 || S.device.checkHidden) return '';
  var items = [
    [st.events > 0, 'Add an event', 'add', ''], [st.imported, 'Import your timetable', 'open-import', ''], [st.ticket, 'Add a train or flight ticket', 'open-ticket', ''],
    [st.people > 1, 'Invite someone', 'invite', ''], [st.push, 'Turn on reminders', 'settings', ''],
    [st.installed, 'Put Tandem on your Home Screen', 'install-guide', ''], [st.account, 'Create an account to keep your calendars on every device', 'auth-open', ' data-tab="signup"']
  ];
  var done = items.filter(function (i) { return i[0]; }).length;
  if (done === items.length) return '';
  return '<section class="card"><div class="dayhead"><h3>Getting the most from Tandem</h3><span class="pill">' + done + ' of ' + items.length + '</span><span class="spacer"></span><button type="button" class="linkbtn" data-act="check-hide">Hide this list</button></div><div class="check">' +
    items.map(function (i) { return '<button type="button" class="ck' + (i[0] ? ' done' : '') + '" data-act="' + i[2] + '"' + i[3] + (i[0] ? ' tabindex="-1"' : '') + '><span class="box" aria-hidden="true"></span><span class="grow">' + esc(i[1]) + '</span></button>'; }).join('') + '</div></section>';
};
T.quickCard = function () {
  return '<section class="card"><h3 style="font-size:14px;margin-bottom:6px">Quick actions</h3>' +
    row('open-import', 'Import a timetable or file', 'CSV, Excel, PDF or calendar file.') + row('open-ticket', 'Add a ticket', 'Train, coach or flight.') + row('invite', 'Invite someone', 'Link or short code.') + '</section>';
};

/* ---------- actions ---------- */
T.hooks.click.push(function (a, t) {
  if (a === 'menu-add') { openAddMenu(); return true; }
  if (a === 'menu-more') { openMoreMenu(); return true; }
  if (a === 'invite') { openInvite(); return true; }
  if (a === 'install-guide') { openGuide(); return true; }
  if (a === 'install-now') { installNow(); return true; }
  if (a === 'banner-hide') { S.device.bannerAt = Date.now(); T.save(); T.render(); return true; }
  if (a === 'check-hide') { S.device.checkHidden = true; T.save(); T.render(); return true; }
  if (a === 'share-app') {
    if (navigator.share) navigator.share({ title: 'Tandem', text: 'Tandem is a shared calendar built by Daniel Chidi, Founder, Adachi Industries.', url: appUrl() }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(appUrl()).then(function () { t.textContent = 'Link copied'; });
    return true;
  }
  if (a === 'copy-app') {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(appUrl()).then(function () { t.textContent = 'Copied'; }, function () { t.textContent = appUrl(); });
    else t.textContent = appUrl();
    return true;
  }
  return false;
});
};
})();
