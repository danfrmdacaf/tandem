/* Tandem file readers. They turn a downloaded file into calendar events or into a travel booking.
   Nothing here talks to a server: the file is read on the device and only the events that the person
   confirms are saved. Works in the browser and in the tests.

   Supported: tables (csv, Excel .xlsx, PDF) that list events by date, by weekday, or as a weekly grid;
   tickets (PDF, Apple Wallet .pkpass, calendar .ics, or pasted text). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.TandemImport = factory(root.TandemCore);
})(typeof self !== 'undefined' ? self : this, function (C) {
  var pad = C.pad;
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  var WEEKDAYS = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, weds: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };

  function todayLocal() { var n = new Date(); return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); }
  function weekdayIndex(s) {
    var m = /^\s*(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)[a-z]*\.?\s*$/i.exec(String(s || ''));
    return m ? WEEKDAYS[m[1].toLowerCase()] : -1;
  }
  function clean(s) { return String(s == null ? '' : s).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim(); }

  /* ---------- csv ---------- */
  function parseCSV(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    var first = text.slice(0, 4000), best = ',', bestN = 0;
    [',', ';', '\t', '|'].forEach(function (d) {
      var q = false, n = 0;
      for (var i = 0; i < first.length; i++) { var ch = first[i]; if (ch === '"') q = !q; else if (!q && ch === d) n++; else if (!q && ch === '\n') break; }
      if (n > bestN) { bestN = n; best = d; }
    });
    var rows = [], row = [], cell = '', q2 = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q2) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q2 = false; } else cell += c;
      } else if (c === '"' && cell === '') q2 = true;
      else if (c === best) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
      else cell += c;
      if (rows.length > 20000) break;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  /* ---------- zip (for Excel files and Apple Wallet passes) ---------- */
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  var MAX_INFLATE = 30 * 1024 * 1024;
  function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('This browser cannot open compressed files. Please update it, or save the file as csv.'));
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    var reader = stream.getReader(), parts = [], total = 0;
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) { var out = new Uint8Array(total), o = 0; parts.forEach(function (p) { out.set(p, o); o += p.length; }); return out; }
        total += r.value.length;
        if (total > MAX_INFLATE) { reader.cancel(); throw new Error('That file is too large to read.'); }
        parts.push(r.value); return pump();
      });
    }
    return pump();
  }
  /* returns { names: [...], get(name) -> Promise<Uint8Array> } */
  function openZip(buf) {
    var b = new Uint8Array(buf), e = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) { if (u32(b, i) === 0x06054b50) { e = i; break; } }
    if (e < 0) throw new Error('That does not look like a valid file.');
    var count = u16(b, e + 10), off = u32(b, e + 16), entries = {}, names = [];
    for (var k = 0; k < count && k < 5000; k++) {
      if (u32(b, off) !== 0x02014b50) break;
      var method = u16(b, off + 10), csize = u32(b, off + 20), usize = u32(b, off + 24), nl = u16(b, off + 28), el = u16(b, off + 30), cl = u16(b, off + 32), lo = u32(b, off + 42);
      var name = new TextDecoder().decode(b.subarray(off + 46, off + 46 + nl));
      entries[name] = { method: method, csize: csize, usize: usize, lo: lo }; names.push(name);
      off += 46 + nl + el + cl;
    }
    return {
      names: names,
      get: function (name) {
        var en = entries[name]; if (!en) return Promise.resolve(null);
        if (en.usize > MAX_INFLATE) return Promise.reject(new Error('That file is too large to read.'));
        var lo = en.lo, ds = lo + 30 + u16(b, lo + 26) + u16(b, lo + 28), data = b.subarray(ds, ds + en.csize);
        if (en.method === 0) return Promise.resolve(data);
        if (en.method === 8) return inflateRaw(data);
        return Promise.reject(new Error('That file uses a compression method that is not supported.'));
      }
    };
  }
  function text(u8) { return new TextDecoder('utf-8').decode(u8); }
  function xmlDecode(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); }).replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); }).replace(/&amp;/g, '&'); }

  /* ---------- Excel ---------- */
  function colIndex(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64); return n - 1; }
  function serialToStrings(v, kind) {
    var days = Math.floor(v), frac = v - days, mins = Math.round(frac * 1440), d = '', t = '';
    if (mins >= 1440) { days += 1; mins -= 1440; }
    if (kind !== 'time') d = C.fmt(Date.UTC(1899, 11, 30) + days * 86400000);
    if (kind !== 'date' && (kind === 'time' || mins > 0)) t = pad(Math.floor(mins / 60)) + ':' + pad(mins % 60);
    return (d + (d && t ? ' ' : '') + t);
  }
  function numFmtKind(id, code) {
    if (id >= 14 && id <= 17) return 'date';
    if (id === 22) return 'datetime';
    if ((id >= 18 && id <= 21) || (id >= 45 && id <= 47)) return 'time';
    if (code) {
      var c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').toLowerCase();
      var hasD = /[dy]/.test(c), hasT = /h|s/.test(c) || /m{1,2}:/.test(c) || /:m/.test(c);
      if (hasD && hasT) return 'datetime';
      if (hasD || /mmm/.test(c)) return 'date';
      if (hasT) return 'time';
    }
    return null;
  }
  function readXLSX(buf) {
    var z;
    try { z = openZip(buf); } catch (e) { return Promise.reject(e); }
    var sheets = z.names.filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); });
    if (!sheets.length) return Promise.reject(new Error('No sheet was found in that file.'));
    return Promise.all([z.get('xl/sharedStrings.xml'), z.get('xl/styles.xml')].concat(sheets.map(function (n) { return z.get(n); }))).then(function (parts) {
      var shared = [];
      if (parts[0]) text(parts[0]).split(/<si[ >]/).slice(1).forEach(function (si) {
        var s = '', re = /<t[^>]*>([\s\S]*?)<\/t>/g, m; while ((m = re.exec(si))) s += m[1]; shared.push(xmlDecode(s));
      });
      var custom = {}, xfKinds = [];
      if (parts[1]) {
        var st = text(parts[1]), nm, nre = /<numFmt [^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g;
        while ((nm = nre.exec(st))) custom[nm[1]] = xmlDecode(nm[2]);
        var cx = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st);
        if (cx) { var xre = /<xf [^>]*?numFmtId="(\d+)"/g, xm; while ((xm = xre.exec(cx[1]))) xfKinds.push(numFmtKind(+xm[1], custom[xm[1]])); }
      }
      var best = null;
      sheets.forEach(function (name, si) {
        var xml = text(parts[2 + si]), grid = [], count = 0, m;
        var cre = /<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        while ((m = cre.exec(xml))) {
          var attrs = m[1], body = m[2] || '', ref = /r="([A-Z]+)(\d+)"/.exec(attrs); if (!ref) continue;
          var r = +ref[2] - 1, c = colIndex(ref[1]); if (r > 6000 || c > 80) continue;
          var t = /t="(\w+)"/.exec(attrs), s = /\bs="(\d+)"/.exec(attrs), v = /<v>([\s\S]*?)<\/v>/.exec(body), val = '';
          if (t && t[1] === 'inlineStr') { var ts = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body); val = ts ? xmlDecode(ts[1]) : ''; }
          else if (v) {
            if (t && t[1] === 's') val = shared[+v[1]] || '';
            else if (t && (t[1] === 'str' || t[1] === 'e')) val = xmlDecode(v[1]);
            else if (t && t[1] === 'b') val = v[1] === '1' ? 'TRUE' : 'FALSE';
            else { var num = parseFloat(v[1]), kind = s ? xfKinds[+s[1]] : null; val = kind && isFinite(num) ? serialToStrings(num, kind) : String(v[1]); }
          }
          if (val !== '') { (grid[r] = grid[r] || [])[c] = clean(val); count++; }
        }
        var mre = /<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g, mm;
        while ((mm = mre.exec(xml))) {
          var r1 = +mm[2] - 1, r2 = +mm[4] - 1, c1 = colIndex(mm[1]), c2 = colIndex(mm[3]), top = grid[r1] && grid[r1][c1];
          if (top && r2 - r1 < 60 && c2 - c1 < 30) for (var rr = r1; rr <= r2; rr++) for (var cc = c1; cc <= c2; cc++) { (grid[rr] = grid[rr] || [])[cc] = top; }
        }
        if (!best || count > best.count) best = { count: count, grid: grid };
      });
      var rows = [];
      for (var i = 0; i < best.grid.length; i++) { var row = best.grid[i] || [], out = []; for (var j = 0; j < row.length; j++) out.push(row[j] || ''); rows.push(out); }
      return rows;
    });
  }

  /* ---------- PDF (through pdf.js, which the application loads on demand) ---------- */
  function pdfRows(lib, buf) {
    return lib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, disableFontFace: true }).promise.then(function (doc) {
      var pages = [], n = Math.min(doc.numPages, 40), chain = Promise.resolve();
      for (var p = 1; p <= n; p++) (function (pn) {
        chain = chain.then(function () { return doc.getPage(pn).then(function (pg) { return pg.getTextContent(); }).then(function (tc) { pages.push(tc.items); }); });
      })(p);
      return chain.then(function () { return pdfItemsToRows(pages); });
    });
  }
  /* pages: arrays of { str, transform, width }. Returns { rows, aligned, lines } */
  function pdfItemsToRows(pages) {
    var allLines = [];
    pages.forEach(function (items) {
      var list = items.filter(function (it) { return clean(it.str); }).map(function (it) { return { s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.transform[3]) || 10 }; });
      list.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
      var lines = [];
      list.forEach(function (it) {
        var ln = lines[lines.length - 1];
        if (ln && Math.abs(ln.y - it.y) <= Math.max(2.5, it.h * 0.45)) ln.items.push(it); else lines.push({ y: it.y, items: [it] });
      });
      lines.forEach(function (ln) {
        ln.items.sort(function (a, b) { return a.x - b.x; });
        var cells = [];
        ln.items.forEach(function (it) {
          var last = cells[cells.length - 1];
          if (last && it.x - last.end < it.h * 0.9) { last.text += (it.x - last.end > it.h * 0.12 ? ' ' : '') + it.s; last.end = it.x + it.w; }
          else cells.push({ text: it.s, x: it.x, end: it.x + it.w });
        });
        cells.forEach(function (c) { c.text = clean(c.text); });
        allLines.push(cells.filter(function (c) { return c.text; }));
      });
    });
    var lines = allLines.filter(function (l) { return l.length; });
    var seq = lines.map(function (l) { return l.map(function (c) { return c.text; }); });
    var xs = []; lines.forEach(function (l) { l.forEach(function (c) { xs.push(c.x); }); });
    xs.sort(function (a, b) { return a - b; });
    var anchors = []; xs.forEach(function (x) { if (!anchors.length || x - anchors[anchors.length - 1].last > 7) anchors.push({ x: x, last: x }); else anchors[anchors.length - 1].last = x; });
    var aligned = null;
    if (anchors.length && anchors.length <= 24) {
      aligned = lines.map(function (l) {
        var row = anchors.map(function () { return ''; });
        l.forEach(function (c) {
          var bi = 0, bd = 1e9; anchors.forEach(function (a, i) { var d = Math.abs(c.x - a.x); if (d < bd) { bd = d; bi = i; } });
          row[bi] = row[bi] ? row[bi] + ' ' + c.text : c.text;
        });
        return row;
      });
    }
    return { rows: seq, aligned: aligned, lines: seq.map(function (r) { return r.join('  '); }) };
  }

  /* ---------- reading dates and times out of text ---------- */
  var MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  var DATE_RES = [
    { re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, f: function (m) { return [+m[1], +m[2], +m[3]]; } },
    { re: /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})\b/, f: function (m, o) { var a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000; return o === 'mdy' ? [y, a, b] : [y, b, a]; } },
    { re: new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?[ \\-]+' + MON_RE + '\\.?,?(?:[ \\-]+(\\d{4}|\\d{2})(?![\\d:]))?\\b', 'i'), f: function (m, o, yr) { var y = m[3] ? +m[3] : yr; if (y < 100) y += 2000; return [y, MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]]; } },
    { re: new RegExp('\\b' + MON_RE + '\\.?[ \\-]+(\\d{1,2})(?:st|nd|rd|th)?(?:,?[ \\-]+(\\d{4})(?![\\d:]))?\\b', 'i'), f: function (m, o, yr) { var y = m[3] ? +m[3] : yr; return [y, MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]]; } }
  ];
  /* returns { date, rest } where rest is the text with the date removed */
  function findDate(str, order, year) {
    str = String(str || '');
    for (var i = 0; i < DATE_RES.length; i++) {
      var m = DATE_RES[i].re.exec(str);
      if (!m) continue;
      var p = DATE_RES[i].f(m, order, year), ds = p[0] + '-' + pad(p[1]) + '-' + pad(p[2]);
      if (C.isDate(ds) && p[1] >= 1 && p[1] <= 12 && p[2] >= 1 && p[2] <= 31) {
        var rest = (str.slice(0, m.index) + ' ' + str.slice(m.index + m[0].length)).replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?/ig, ' ');
        return { date: ds, rest: clean(rest) };
      }
    }
    return null;
  }
  var T = '(\\d{1,2})(?:[:.h](\\d{2}))?(?::\\d{2})?\\s*([ap]\\.?m\\.?)?';
  function hm(h, m, ap) {
    h = +h; m = m ? +m : 0;
    if (ap) { ap = ap.toLowerCase(); if (ap[0] === 'p' && h < 12) h += 12; if (ap[0] === 'a' && h === 12) h = 0; }
    if (h > 23 || m > 59) return null;
    return pad(h) + ':' + pad(m);
  }
  /* returns { start, end, rest } for the first time or time range found */
  function findTimes(str) {
    str = String(str || '');
    var range = new RegExp('(?:^|[^\\d:.])' + T + '\\s*(?:-|\u2013|\u2014|to|until)\\s*' + T + '(?![\\d])', 'i').exec(str);
    function ok(h, m, ap, whole) { return m !== undefined || ap || /[:.h]/.test(whole); }
    if (range) {
      var a = range[1], am = range[2], aa = range[3], b = range[4], bm = range[5], ba = range[6];
      if ((am !== undefined || aa) && (bm !== undefined || ba) || (am !== undefined && bm !== undefined)) {
        if (!aa && ba) aa = ba;
        var s = hm(a, am, aa), e = hm(b, bm, ba);
        if (s && e) return { start: s, end: e, rest: clean(str.replace(range[0].replace(/^[^\d]/, ''), ' ')) };
      }
    }
    var one = new RegExp('(?:^|[^\\d:.])' + T + '(?![\\d])', 'ig'), m;
    while ((m = one.exec(str))) {
      var hasClock = m[2] !== undefined || m[3], full = m[0];
      if (!hasClock) continue;
      var t = hm(m[1], m[2], m[3]);
      if (t) { var lead = /^[^\d]/.test(full) ? 1 : 0; return { start: t, end: null, rest: clean(str.slice(0, m.index + lead) + ' ' + str.slice(m.index + full.length)) }; }
    }
    return { start: null, end: null, rest: clean(str) };
  }
  function truthy(s) { return /^(true|yes|y|1|x|all day)$/i.test(clean(s)); }

  /* ---------- table to events ---------- */
  var ROLE_TESTS = [
    ['allday', /\ball.?day\b/],
    ['endDate', /^(end|finish|to|until)\b.*\bdate\b|\bdate\b.*\b(end|finish)\b/],
    ['startDate', /^date$|\bstart.*date\b|^date\b|\bevent date\b|\bdate of\b/],
    ['startTime', /\bstart.*time\b|^time (from|start)|^starts?$|^begin(s)?$|^from( time)?$/],
    ['endTime', /\bend.*time\b|\bfinish.*time\b|^time (to|end)|^ends?$|^finish(es)?$|^to( time)?$|^until$/],
    ['time', /^(time|times|hours|slot|period)$/],
    ['day', /^(day|weekday|day of week|dow)$/],
    ['title', /^(subject|title|summary|event|event name|name|module|course|class|activity|lesson|unit|session|topic|what|module name|course name|description of event)$|\b(title|subject|module name)\b/],
    ['place', /location|room|venue|where|place|building|campus|site/],
    ['notes', /description|notes?|details|comment|lecturer|staff|tutor|teacher|instructor|type|group|code|organi[sz]er/]
  ];
  function roleOf(h) {
    var s = clean(h).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    for (var i = 0; i < ROLE_TESTS.length; i++) if (ROLE_TESTS[i][1].test(s)) return ROLE_TESTS[i][0];
    return null;
  }
  function weekdayNamesIn(row) { var n = 0; row.forEach(function (c) { if (weekdayIndex(c) >= 0) n++; }); return n; }

  function guessHeader(rows) {
    var best = -1, bestScore = 1;
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var seen = {}, score = 0;
      rows[i].forEach(function (c) { var r = roleOf(c); if (r && !seen[r]) { seen[r] = 1; score++; } });
      if (score > bestScore || (score === bestScore && best < 0 && score >= 2)) { best = i; bestScore = score; }
    }
    return best;
  }

  function decideOrder(values) {
    var dm = 0, md = 0;
    values.forEach(function (v) { var m = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/.exec(v || ''); if (m) { if (+m[1] > 12) dm++; if (+m[2] > 12) md++; } });
    return md > dm ? 'mdy' : 'dmy';
  }

  /* rows: array of arrays of strings. opts: { columns, startDate, until, year, order, headerRow }.
     Returns { events, mode, weekly, headers, columns, headerRow, skipped, order } */
  function rowsToEvents(rows, opts) {
    opts = opts || {};
    rows = rows.map(function (r) { return r.map(clean); }).filter(function (r) { return r.some(function (c) { return c; }); });
    var year = opts.year || +todayLocal().slice(0, 4);
    var res = { events: [], mode: 'table', weekly: false, headers: [], columns: {}, headerRow: -1, skipped: [], order: opts.order || 'dmy' };
    if (!rows.length) return res;

    /* a weekly grid: weekday names across the top, times down the side */
    var gridHead = -1;
    for (var gi = 0; gi < Math.min(rows.length, 12); gi++) if (weekdayNamesIn(rows[gi]) >= 3) { gridHead = gi; break; }
    if (gridHead >= 0 && !opts.columns) {
      var g = gridToEvents(rows, gridHead, opts);
      if (g.events.length) { res.events = g.events; res.mode = 'grid'; res.weekly = true; res.headerRow = gridHead; res.headers = rows[gridHead]; return finishWeekly(res, opts); }
    }

    var hr = opts.headerRow !== undefined ? opts.headerRow : guessHeader(rows);
    var headers = hr >= 0 ? rows[hr] : [];
    var cols = {};
    if (opts.columns) cols = Object.assign({}, opts.columns);
    else if (hr >= 0) {
      headers.forEach(function (h, i) { var r = roleOf(h); if (r && r !== 'notes' && cols[r] === undefined) cols[r] = i; });
    }
    var body = rows.slice(hr + 1);
    if (!opts.columns && hr < 0) cols = guessColumns(body);
    var notesCols = [];
    if (opts.notesCols) notesCols = opts.notesCols;
    else if (hr >= 0 && !opts.columns) headers.forEach(function (h, i) { if (roleOf(h) === 'notes') notesCols.push(i); });
    res.headers = headers; res.columns = cols; res.headerRow = hr; res.notesCols = notesCols;

    var dateVals = [];
    body.forEach(function (r) { ['startDate', 'endDate'].forEach(function (k) { if (cols[k] !== undefined) dateVals.push(r[cols[k]]); }); });
    var order = opts.order || decideOrder(dateVals);
    res.order = order;
    var cell = function (r, k) { return cols[k] !== undefined && cols[k] >= 0 ? clean(r[cols[k]]) : ''; };

    body.forEach(function (r, ri) {
      var title = cell(r, 'title');
      var sd = null, st = null, et = null, ed = null, dayIdx = -1, tx;
      var sdText = cell(r, 'startDate');
      if (sdText) { var f = findDate(sdText, order, year); if (f) { sd = f.date; tx = findTimes(f.rest); if (tx.start) { st = tx.start; if (tx.end) et = tx.end; } } else if (weekdayIndex(sdText) >= 0) dayIdx = weekdayIndex(sdText); }
      var dayText = cell(r, 'day');
      if (!sd && dayText && weekdayIndex(dayText) >= 0) dayIdx = weekdayIndex(dayText);
      if (!sd && dayIdx < 0 && dayText) { var f2 = findDate(dayText, order, year); if (f2) sd = f2.date; }
      var timeText = cell(r, 'time'), stText = cell(r, 'startTime'), etText = cell(r, 'endTime');
      if (timeText) { tx = findTimes(timeText); if (tx.start && !st) { st = tx.start; if (tx.end && !et) et = tx.end; } }
      if (stText) {
        tx = findTimes(stText);
        if (tx.start) { st = tx.start; if (tx.end && !et) et = tx.end; }
        if (!sd) { var f3 = findDate(stText, order, year); if (f3) sd = f3.date; }
      }
      if (etText) {
        tx = findTimes(etText);
        if (tx.start) et = tx.start;
        var f4 = findDate(etText, order, year); if (f4) ed = f4.date;
      }
      var edText = cell(r, 'endDate');
      if (edText) { var f5 = findDate(edText, order, year); if (f5) { ed = f5.date; if (!et) { tx = findTimes(f5.rest); if (tx.start) et = tx.start; } } }
      if (!title && !sd && dayIdx < 0) return;
      if (!title) { res.skipped.push({ row: ri, why: 'no title' }); return; }
      if (!sd && dayIdx < 0) { res.skipped.push({ row: ri, why: 'no date', title: title }); return; }
      var allDay = cols.allday !== undefined ? truthy(cell(r, 'allday')) : false;
      if (!st) allDay = true;
      var raw = { title: title, date: sd, allDay: allDay };
      if (!allDay) { raw.start = st; raw.end = et || st; }
      if (ed && sd && ed > sd) raw.endDate = ed;
      var place = cell(r, 'place'); if (place) raw.place = place;
      var nl = [];
      notesCols.forEach(function (ci) { var v = clean(r[ci]); if (v && v !== title) nl.push((clean(headers[ci]) && headers.length ? clean(headers[ci]) + ': ' : '') + v); });
      if (nl.length) raw.notes = nl.join('\n');
      if (dayIdx >= 0 && !sd) { raw._dow = dayIdx; res.weekly = true; res.mode = 'weekday'; }
      pushRaw(res, raw, ri);
    });
    if (res.weekly) return finishWeekly(res, opts);
    return finalize(res);
  }

  function guessColumns(body) {
    var cols = {}, n = 0;
    body.slice(0, 40).forEach(function (r) { n = Math.max(n, r.length); });
    var score = [];
    for (var c = 0; c < n; c++) {
      var d = 0, t = 0, w = 0, x = 0, len = 0, cnt = 0;
      body.slice(0, 40).forEach(function (r) {
        var v = clean(r[c]); if (!v) return; cnt++; len += v.length;
        if (findDate(v, 'dmy', 2026)) d++; else if (weekdayIndex(v) >= 0) w++;
        if (findTimes(v).start) t++; else x++;
      });
      score.push({ c: c, d: d, t: t, w: w, x: x, avg: cnt ? len / cnt : 0, cnt: cnt });
    }
    score.forEach(function (s) {
      if (s.d > s.cnt * 0.5 && cols.startDate === undefined) cols.startDate = s.c;
      else if (s.w > s.cnt * 0.5 && cols.day === undefined) cols.day = s.c;
      else if (s.t > s.cnt * 0.5 && cols.time === undefined) cols.time = s.c;
    });
    var cand = score.filter(function (s) { return s.cnt && [cols.startDate, cols.day, cols.time].indexOf(s.c) < 0; }).sort(function (a, b) { return b.avg - a.avg; });
    if (cand[0]) cols.title = cand[0].c;
    if (cand[1]) cols.place = cand[1].c;
    return cols;
  }

  function pushRaw(res, raw, ri) {
    var cleaned = C.cleanEvent({ title: raw.title, date: raw.date || '2000-01-03', endDate: raw.endDate, allDay: raw.allDay, start: raw.start, end: raw.end, place: raw.place, notes: raw.notes });
    if (cleaned.error) { res.skipped.push({ row: ri, why: cleaned.error, title: raw.title }); return; }
    var data = cleaned.data;
    if (raw._dow !== undefined) data._dow = raw._dow;
    res.events.push({ row: ri, data: data });
  }

  /* weekday-only events repeat every week from a start date until an end date */
  function finishWeekly(res, opts) {
    var start = opts.startDate || todayLocal(), until = opts.until || '';
    res.events = res.events.map(function (e) {
      var d = Object.assign({}, e.data), dow = d._dow; delete d._dow;
      if (dow === undefined) return e;
      var delta = (dow - C.dow(start) + 7) % 7;
      d.date = C.add(start, delta); d.repeat = 'weekly';
      if (until && until >= d.date) d.until = until;
      delete d.endDate;
      return { row: e.row, data: d };
    });
    return finalize(res);
  }

  function gridToEvents(rows, head, opts) {
    var hdr = rows[head], dayCols = [];
    hdr.forEach(function (c, i) { var w = weekdayIndex(c); if (w >= 0) dayCols.push({ i: i, dow: w }); });
    var slots = [];
    for (var r = head + 1; r < rows.length; r++) {
      var label = '';
      for (var c = 0; c < (dayCols[0] ? dayCols[0].i : 1); c++) if (rows[r][c]) { label = rows[r][c]; break; }
      var tx = findTimes(label);
      if (tx.start) slots.push({ r: r, start: tx.start, end: tx.end });
    }
    var events = [];
    dayCols.forEach(function (dc) {
      var open = null;
      function close(endAt) {
        if (!open) return;
        var raw = { title: open.title, date: '2000-01-03', allDay: false, start: open.start, end: endAt || open.end || open.start };
        if (open.place) raw.place = open.place;
        var cl = C.cleanEvent(raw);
        if (!cl.error) { var d = cl.data; d._dow = dc.dow; events.push({ row: open.r, data: d }); }
        open = null;
      }
      slots.forEach(function (sl, si) {
        var v = clean(rows[sl.r][dc.i]), nextStart = slots[si + 1] ? slots[si + 1].start : null, slotEnd = sl.end || nextStart || addHour(sl.start);
        if (!v) { close(); return; }
        var parts = v.split(/\s*[\n|]\s*|\s+-\s+/).filter(Boolean), title = parts[0], place = parts.slice(1).join(', ');
        if (open && open.key === v) { open.end = slotEnd; return; }
        close();
        open = { key: v, title: title, place: place, start: sl.start, end: slotEnd, r: sl.r };
      });
      close();
    });
    return { events: events };
  }
  function addHour(t) { var h = +t.slice(0, 2) + 1; return h > 23 ? '23:59' : pad(h) + t.slice(2); }

  function finalize(res) {
    var seen = {}, out = [];
    res.events.forEach(function (e) {
      var d = e.data;
      var id = 'i' + C.hash64(['tbl', d.title, d.date, d.start || '', d.end || '', d.place || '', d.repeat || ''].join('|'));
      if (seen[id]) return; seen[id] = 1;
      out.push({ id: id, row: e.row, data: d });
    });
    res.events = out;
    return res;
  }

  /* ---------- plain lines of text (for PDFs that are not tables) ---------- */
  function linesToEvents(lines, opts) {
    opts = opts || {};
    var year = opts.year || +todayLocal().slice(0, 4), order = opts.order || decideOrder(lines);
    var res = { events: [], mode: 'text', weekly: false, headers: [], columns: {}, headerRow: -1, skipped: [], order: order }, curDate = null;
    lines.forEach(function (ln, i) {
      var line = clean(ln); if (!line) return;
      var f = findDate(line, order, year), rest = f ? f.rest : line, dow = -1;
      if (f) curDate = f.date;
      var wd = /^\s*(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)[a-z]*\.?,?\s+/i.exec(line);
      if (!f && wd) { dow = weekdayIndex(wd[1]); rest = line.slice(wd[0].length); }
      var tx = findTimes(rest);
      if (!tx.start) return;
      var title = clean(tx.rest.replace(/^[-\u2013\u2014:,|\s]+|[-\u2013\u2014:,|\s]+$/g, ''));
      if (title.length < 2) return;
      var raw = { title: title, date: f ? f.date : (dow < 0 ? curDate : null), allDay: false, start: tx.start, end: tx.end || tx.start };
      if (dow >= 0) { raw._dow = dow; res.weekly = true; res.mode = 'weekday-text'; }
      else if (!raw.date) return;
      pushRaw(res, raw, i);
    });
    if (res.weekly) return finishWeekly(res, opts);
    return finalize(res);
  }

  /* ---------- tickets ---------- */
  var TRAIN_CARRIERS = ['Avanti West Coast', 'LNER', 'Great Western Railway', 'GWR', 'CrossCountry', 'Cross Country', 'Northern', 'TransPennine Express', 'ScotRail', 'Southeastern', 'Southern', 'Thameslink', 'Great Northern', 'Greater Anglia', 'c2c', 'Chiltern Railways', 'East Midlands Railway', 'Elizabeth line', 'Lumo', 'Hull Trains', 'Grand Central', 'Merseyrail', 'South Western Railway', 'West Midlands Railway', 'London Northwestern Railway', 'Transport for Wales', 'Eurostar', 'Heathrow Express', 'Gatwick Express', 'Stansted Express', 'Caledonian Sleeper'];
  var COACH_CARRIERS = ['National Express', 'Megabus', 'FlixBus', 'Stagecoach'];
  var AIR_CARRIERS = ['Ryanair', 'easyJet', 'British Airways', 'Jet2', 'Wizz Air', 'Virgin Atlantic', 'TUI', 'Lufthansa', 'KLM', 'Air France', 'Emirates', 'Qatar Airways'];
  var CARRIERS = TRAIN_CARRIERS.concat(COACH_CARRIERS, AIR_CARRIERS);
  function hasAny(low, list) { return list.some(function (c) { return low.indexOf(c.toLowerCase()) >= 0; }); }
  function modeOf(t) {
    var low = t.toLowerCase();
    if (hasAny(low, TRAIN_CARRIERS) || /\b(train|rail|railway|railcard|e-?ticket|underground|tube|tram|platform)\b/i.test(t)) return 'train';
    if (/\b(boarding pass|flight|airline|gate|terminal|airport)\b/i.test(t) || hasAny(low, AIR_CARRIERS)) return 'flight';
    if (/\b(bus|coach (?:station|travel|service))\b/i.test(t) || hasAny(low, COACH_CARRIERS)) return 'coach';
    if (/\b(ferry|sailing|crossing)\b/i.test(t)) return 'ferry';
    return 'journey';
  }
  var MODE_WORD = { train: 'Train', coach: 'Coach', flight: 'Flight', ferry: 'Ferry', journey: 'Journey' };
  function placeOk(s) {
    s = clean(s).replace(/^[-\u2013\u2014:,|\s]+|[-\u2013\u2014:,|\s]+$/g, '');
    if (s.length < 3 || s.length > 48) return '';
    if (/^\d/.test(s) || !/[A-Za-z]{3}/.test(s)) return '';
    if (/\b(ticket|class|coach|seat|fare|price|adult|child|railcard|passenger|valid|reference|booking|total|£|€|\$|platform|journey|outbound|return|inbound|depart|arrive|duration|change|via|route|operator|on time|standard|first)\b/i.test(s)) return '';
    return s;
  }
  function addDay(d, n) { return C.add(d, n); }

  /* text of a ticket in, candidate journeys out */
  function parseTicket(raw, opts) {
    opts = opts || {};
    var year = opts.year || +todayLocal().slice(0, 4), order = opts.order || 'dmy';
    var lines = String(raw || '').replace(/\r/g, '\n').split('\n').map(clean).filter(Boolean);
    var whole = lines.join('\n'), mode = modeOf(whole);
    var carrier = ''; CARRIERS.forEach(function (c) { if (!carrier && whole.toLowerCase().indexOf(c.toLowerCase()) >= 0) carrier = c; });
    var ref = '', rm = /(?:booking|confirmation|reservation|reference|ref|pnr|order|collection|ticket)\s*(?:number|no\.?|code|ref\.?|reference|id)?\s*[:#\-]?\s*([A-Z0-9]{5,12})\b/.exec(whole);
    if (rm && /[0-9]/.test(rm[1]) || (rm && /^[A-Z]{6}$/.test(rm[1]))) ref = rm[1];
    var seat = '', sm = /seats?\s*(?:no\.?|number)?\s*[:#]?\s*([0-9]{1,3}[A-Z]?)\b/i.exec(whole); if (sm) seat = sm[1];
    var coach = '', cm = /\bcoach\s*[:#]?\s*([A-Za-z0-9]{1,2})\b/i.exec(whole); if (cm && /^[A-Z0-9]{1,2}$/.test(cm[1])) coach = cm[1];
    var cls = '', clm = /\b(standard|first|business|economy|premium economy|premium)(?:\s+class)?\b/i.exec(whole); if (clm) cls = clm[1][0].toUpperCase() + clm[1].slice(1).toLowerCase();
    var seatText = [coach ? 'Coach ' + coach : '', seat ? 'Seat ' + seat : ''].filter(Boolean).join(', ');

    /* stops: a time together with a place */
    var stops = [], curDate = null, pendingDate = null;
    lines.forEach(function (ln, i) {
      var f = findDate(ln, order, year); if (f) { curDate = f.date; }
      var rest = f ? f.rest : ln;
      var two = /^(.{3,40}?)\s+(\d{1,2}[:.]\d{2})\s*(?:->|\u2192|\u2013|-|to)\s*(.{3,40}?)\s+(\d{1,2}[:.]\d{2})\s*$/.exec(rest);
      if (two && placeOk(two[1]) && placeOk(two[3])) {
        stops.push({ time: hm(two[2].split(/[:.]/)[0], two[2].split(/[:.]/)[1]), place: placeOk(two[1]), kind: 'dep', date: curDate, line: i });
        stops.push({ time: hm(two[4].split(/[:.]/)[0], two[4].split(/[:.]/)[1]), place: placeOk(two[3]), kind: 'arr', date: curDate, line: i });
        return;
      }
      var kind = /\b(depart|departs|departure|dep|leaves|leaving|from|outbound|out)\b/i.test(rest) ? 'dep' : /\b(arrive|arrives|arrival|arr|arriving|to)\b/i.test(rest) ? 'arr' : null;
      var m = /^(?:(?:depart(?:s|ure|ing)?|arriv(?:e|es|al|ing)|dep|arr|from|to|leaves|at)\b[:\s-]*)*(\d{1,2}[:.]\d{2})\s*(?:[-\u2013\u2014:|]\s*)?(.*)$/i.exec(rest);
      var time = null, place = '';
      if (m) { time = hm(m[1].split(/[:.]/)[0], m[1].split(/[:.]/)[1]); place = placeOk(m[2]); if (!place && lines[i + 1] && !/\d{1,2}[:.]\d{2}/.test(lines[i + 1])) place = placeOk(lines[i + 1]); }
      else {
        var m2 = /^(.*?)[\s:,-]+(?:at\s+)?(\d{1,2}[:.]\d{2})\s*$/.exec(rest);
        if (m2) { time = hm(m2[2].split(/[:.]/)[0], m2[2].split(/[:.]/)[1]); place = placeOk(m2[1].replace(/\b(depart|departs|departure|arrive|arrives|arrival|dep|arr|from|to)\b[:\s-]*/ig, '')); }
      }
      if (time && place) stops.push({ time: time, place: place, kind: kind, date: curDate, line: i });
    });
    var legs = [];
    for (var i = 0; i < stops.length - 1;) {
      var a = stops[i], b = stops[i + 1];
      if (a.kind === 'arr' && b.kind !== 'arr') { i++; continue; }
      legs.push({ dep: a, arr: b }); i += 2;
    }
    var out = [];
    legs.forEach(function (lg) {
      var date = lg.dep.date || curDate, arrDate = '';
      if (date && lg.arr.time < lg.dep.time) arrDate = addDay(date, 1);
      out.push(candidate(date, lg.dep.time, lg.arr.time, arrDate, lg.dep.place, lg.arr.place));
    });
    if (!out.length) {
      var rt = /\bfrom\s+([A-Z][\w .'&-]{2,40}?)\s+to\s+([A-Z][\w .'&-]{2,40})/.exec(whole) || /([A-Z][\w .'&-]{2,40}?)\s+(?:to|\u2192|->|\u2013)\s+([A-Z][\w .'&-]{2,40})/.exec(whole);
      var times = []; var tre = /\b(\d{1,2})[:.](\d{2})\b/g, tm; while ((tm = tre.exec(whole))) { var t = hm(tm[1], tm[2]); if (t) times.push(t); }
      var fd = null; lines.some(function (ln) { var f = findDate(ln, order, year); if (f) { fd = f.date; return true; } return false; });
      if (times.length || rt || fd) {
        var from = rt ? placeOk(rt[1]) : '', to = rt ? placeOk(rt[2]) : '';
        var ad = fd && times[1] && times[0] && times[1] < times[0] ? addDay(fd, 1) : '';
        out.push(candidate(fd, times[0] || '', times[1] || '', ad, from, to));
      }
    }
    function candidate(date, dep, arr, arrDate, from, to) {
      var c = { mode: mode, date: date || '', dep: dep || '', arr: arr || '', arrDate: arrDate || '', from: from || '', to: to || '', ref: ref, carrier: carrier, seat: seatText, cls: cls };
      c.title = (MODE_WORD[mode] || 'Journey') + (from && to ? ': ' + from + ' to ' + to : from ? ' from ' + from : to ? ' to ' + to : '');
      return c;
    }
    return { candidates: out, mode: mode, ref: ref, carrier: carrier };
  }

  /* an Apple Wallet pass: structured, so no guessing is needed */
  function parsePass(pass) {
    var fields = [], groups = ['headerFields', 'primaryFields', 'secondaryFields', 'auxiliaryFields', 'backFields'], style = null;
    ['boardingPass', 'eventTicket', 'generic', 'coupon', 'storeCard'].forEach(function (k) { if (pass[k]) { style = k; groups.forEach(function (g) { (pass[k][g] || []).forEach(function (f) { fields.push({ label: clean(f.label || f.key), value: clean(typeof f.value === 'object' ? JSON.stringify(f.value) : f.value), key: String(f.key || '').toLowerCase() }); }); }); } });
    var get = function (re) { var f = fields.filter(function (x) { return re.test(x.key) || re.test(x.label.toLowerCase()); })[0]; return f ? f.value : ''; };
    var rel = pass.relevantDate || pass.expirationDate || '', date = '', dep = '';
    var d = rel ? new Date(rel) : null;
    if (d && !isNaN(d)) { date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); dep = pad(d.getHours()) + ':' + pad(d.getMinutes()); if (dep === '00:00') dep = ''; }
    var from = get(/origin|depart|from|^org$/), to = get(/destination|arriv|^to$|^dst$/);
    var org = clean(pass.organizationName), desc = clean(pass.description);
    var mode = style === 'boardingPass' ? ((pass.boardingPass.transitType || '').replace('PKTransitType', '').toLowerCase() === 'train' ? 'train' : (pass.boardingPass.transitType || '').indexOf('Bus') >= 0 ? 'coach' : (pass.boardingPass.transitType || '').indexOf('Boat') >= 0 ? 'ferry' : 'flight') : 'journey';
    var title = from && to ? (MODE_WORD[mode] || 'Journey') + ': ' + from + ' to ' + to : (org || desc || 'Ticket') + (desc && org && desc !== org ? ': ' + desc : '');
    var seat = get(/seat/), gateF = fields.filter(function (x) { return /gate|platform/.test(x.key) || /gate|platform/.test(x.label.toLowerCase()); })[0], gate = gateF && gateF.value ? clean(gateF.label) + ' ' + gateF.value : '';
    var c = { mode: mode, date: date, dep: dep, arr: '', arrDate: '', from: from, to: to, ref: clean(pass.barcode && pass.barcode.message ? '' : '') || get(/booking|reference|confirmation|pnr|ticket/), carrier: org, seat: [seat ? 'Seat ' + seat : '', gate ? gate : ''].filter(Boolean).join(', '), cls: get(/class/), title: title };
    var notes = fields.filter(function (f) { return f.value && f.label; }).slice(0, 14).map(function (f) { return f.label + ': ' + f.value; }).join('\n');
    return { candidates: [c], mode: mode, notes: notes, ref: c.ref, carrier: org };
  }

  /* Turns a confirmed candidate into the stored shape of an event. */
  function tripToEvent(c, by) {
    var arrDate = c.arrDate && c.arrDate > c.date ? c.arrDate : '';
    var notes = [];
    if (c.carrier) notes.push(c.carrier);
    if (c.ref) notes.push('Booking reference: ' + c.ref);
    if (c.seat) notes.push(c.seat);
    if (c.cls) notes.push(c.cls + ' class');
    if (c.notes) notes.push(c.notes);
    var raw = {
      title: c.title || (MODE_WORD[c.mode] || 'Journey'), date: c.date, endDate: arrDate, allDay: !c.dep,
      start: c.dep || '', end: arrDate ? (c.arr || c.dep) : (c.arr && c.arr >= c.dep ? c.arr : c.dep),
      place: c.from ? (c.to ? c.from + ' to ' + c.to : c.from) : '', notes: notes.join('\n'), by: by,
      trip: { mode: c.mode, from: c.from, to: c.to, dep: c.dep, arr: c.arr, arrDate: arrDate, ref: c.ref, seat: c.seat, carrier: c.carrier, cls: c.cls }
    };
    return raw;
  }

  return {
    parseCSV: parseCSV, openZip: openZip, readXLSX: readXLSX, pdfRows: pdfRows, pdfItemsToRows: pdfItemsToRows,
    rowsToEvents: rowsToEvents, linesToEvents: linesToEvents, parseTicket: parseTicket, parsePass: parsePass, tripToEvent: tripToEvent,
    findDate: findDate, findTimes: findTimes, roleOf: roleOf, weekdayIndex: weekdayIndex, text: text
  };
});
