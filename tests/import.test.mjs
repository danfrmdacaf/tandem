process.env.TZ = 'Europe/London';
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const I = require('../importer.js');
const dir = new URL('./fixtures/', import.meta.url).pathname;

let fails = 0;
const ok = (name, cond, extra) => { if (!cond) { fails++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', name); };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });
const brief = (r) => r.events.map((e) => [e.data.title, e.data.date, e.data.start, e.data.end, e.data.place].join('|'));
const OPT = { startDate: '2026-11-16', until: '2026-12-18', year: 2026 };

/* text and numbers */
eq('a time range with a dash', I.findTimes('Lecture 09:00 - 11:00 JGG10'), { start: '09:00', end: '11:00', rest: 'Lecture JGG10' });
eq('a time range written with am and pm', I.findTimes('9am to 10.30am Seminar').end, '10:30');
eq('a day first date', I.findDate('16/11/2026', 'dmy', 2026).date, '2026-11-16');
eq('a month first date', I.findDate('11/16/2026', 'mdy', 2026).date, '2026-11-16');
eq('a written date with a weekday', I.findDate('Mon 16 Nov 2026', 'dmy', 2026).date, '2026-11-16');
eq('a date without a year takes the given year', I.findDate('16 Nov', 'dmy', 2026).date, '2026-11-16');
eq('csv with quotes, commas and a semicolon delimiter', I.parseCSV('a;b\n"x;y";"he said ""hi"""\n'), [['a', 'b'], ['x;y', 'he said "hi"']]);

/* csv */
const g = I.rowsToEvents(I.parseCSV(fs.readFileSync(dir + 'google.csv', 'utf8')), OPT);
eq('a calendar export is read by its headings', brief(g), ['Dentist|2026-11-16|09:30|10:15|High Street Dental', 'Annie birthday|2026-11-20|||', 'Lecture, Programming|2026-11-17|14:00|16:00|JGG10']);
ok('an all day row is all day', g.events[1].data.allDay === true);
ok('extra columns become notes', /Check up/.test(g.events[0].data.notes));
const wk = I.rowsToEvents(I.parseCSV(fs.readFileSync(dir + 'weekday.csv', 'utf8')), OPT);
ok('weekday rows repeat weekly until the end date', wk.weekly && wk.events.length === 4 && wk.events.every((e) => e.data.repeat === 'weekly' && e.data.until === '2026-12-18'), wk.events.map((e) => e.data));
eq('weekday rows start on the right day', wk.events.map((e) => e.data.date), ['2026-11-16', '2026-11-16', '2026-11-17', '2026-11-19']);
const us = I.rowsToEvents(I.parseCSV(fs.readFileSync(dir + 'us.csv', 'utf8')), OPT);
eq('month first dates are detected', us.events.map((e) => e.data.date), ['2026-11-24', '2026-11-25']);
eq('2pm is read as 14:00', us.events[1].data.start, '14:00');
const again = I.rowsToEvents(I.parseCSV(fs.readFileSync(dir + 'google.csv', 'utf8')), OPT);
eq('the same file gives the same event identifiers', again.events.map((e) => e.id), g.events.map((e) => e.id));
const forced = I.rowsToEvents(I.parseCSV('a,b,c\nx,2026-11-16,09:00\n'), Object.assign({ columns: { title: 0, startDate: 1, startTime: 2 }, headerRow: 0 }, OPT));
eq('chosen columns override the guess', brief(forced), ['x|2026-11-16|09:00|09:00|']);
eq('a row with no date is reported, not guessed', I.rowsToEvents(I.parseCSV('Title,Date\nA,2026-11-16\nB,\n'), OPT).skipped.length, 1);

/* excel */
const d = I.rowsToEvents(await I.readXLSX(fs.readFileSync(dir + 'dated.xlsx')), OPT);
eq('excel date and time cells are read as dates and times', brief(d), ['Programming|2026-11-16|09:00|11:00|JGG10', 'Databases|2026-11-16|14:00|15:00|LT2', 'Networks|2026-11-17|10:00|12:00|LT1']);
const gr = I.rowsToEvents(await I.readXLSX(fs.readFileSync(dir + 'grid.xlsx')), OPT);
ok('a weekly grid is detected', gr.mode === 'grid' && gr.weekly, gr.mode);
ok('a merged two hour cell becomes one two hour event', gr.events.some((e) => e.data.title === 'Programming Lecture' && e.data.start === '09:00' && e.data.end === '11:00'), brief(gr));
ok('grid cells carry the room', gr.events.some((e) => e.data.title === 'Networks' && e.data.place === 'LT1' && e.data.start === '11:00' && e.data.end === '13:00'), brief(gr));
eq('grid events sit on the right weekdays', gr.events.map((e) => e.data.date), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-18', '2026-11-19', '2026-11-20']);
let bad = null; try { await I.readXLSX(Buffer.from('this is not a zip file at all')); } catch (e) { bad = e; }
ok('a file that is not a spreadsheet is refused', !!bad);

/* pdf */
const lib = require('../vendor/pdf.min.js');
lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.js', import.meta.url).pathname;
const ab = (f) => { const b = fs.readFileSync(dir + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const tp = await I.pdfRows(lib, ab('timetable.pdf'));
const tt = I.rowsToEvents(tp.aligned, OPT);
eq('a timetable in a pdf is read as a table', brief(tt), ['Programming Lecture|2026-11-16|09:00|11:00|JGG10', 'Programming Lab|2026-11-16|14:00|15:00|CS4', 'Databases|2026-11-17|10:00|12:00|LT2', 'Networks Seminar|2026-11-19|13:00|14:00|LT1']);
const tl = I.linesToEvents(['Mon 16 Nov 09:00-11:00 Programming Lecture JGG10', 'Tuesday 10:00 - 12:00 Databases LT2'], OPT);
eq('plain lines of text with a date or a weekday are read', tl.events.map((e) => [e.data.title, e.data.date, e.data.repeat || '']), [['Programming Lecture JGG10', '2026-11-16', ''], ['Databases LT2', '2026-11-17', 'weekly']]);

/* tickets */
const tk = I.parseTicket((await I.pdfRows(lib, ab('train.pdf'))).lines.join('\n'), { year: 2026 });
eq('a rail e-ticket gives an outward and a return journey', tk.candidates.map((c) => [c.title, c.date, c.dep, c.arr]), [['Train: London Euston to Manchester Piccadilly', '2026-11-16', '10:30', '12:45'], ['Train: Manchester Piccadilly to London Euston', '2026-11-20', '17:15', '19:32']]);
ok('the booking reference, operator, coach and seat are found', tk.ref === 'K7TQ4M' && tk.candidates[0].carrier === 'Avanti West Coast' && tk.candidates[0].seat === 'Coach C, Seat 45' && tk.candidates[0].cls === 'Standard', tk.candidates[0]);
const sl = I.parseTicket('Departs 23:30 London Euston\nArrives 07:45 Inverness\n21/11/2026\nCaledonian Sleeper\nBooking reference: ZZ12AB', { year: 2026 }).candidates[0];
ok('an overnight journey arrives the next day', sl.arrDate === '2026-11-22' && sl.dep === '23:30' && sl.arr === '07:45', sl);
const rt = I.parseTicket('Your journey\nManchester Piccadilly to London Euston\nFri 20 Nov 2026\nDeparts 17:15   Arrives 19:32\nBooking ref ABC123XY\nLNER', { year: 2026 }).candidates[0];
ok('a route written as from to with times on one line', rt.from === 'Manchester Piccadilly' && rt.to === 'London Euston' && rt.dep === '17:15' && rt.arr === '19:32' && rt.ref === 'ABC123XY', rt);
const fl = I.parseTicket('Flight BA123\nLHR 09:15 -> JFK 12:20\n3 Dec 2026\nBritish Airways\nBooking reference: QWE4RT', { year: 2026 }).candidates[0];
ok('a flight line with two airports', fl.mode === 'flight' && fl.from === 'LHR' && fl.to === 'JFK' && fl.dep === '09:15', fl);
const z = I.openZip(fs.readFileSync(dir + 'ticket.pkpass'));
const pass = I.parsePass(JSON.parse(I.text(await z.get('pass.json')))).candidates[0];
ok('a wallet pass gives its route, time, seat and platform', pass.from === 'Leeds' && pass.to === 'London Kings Cross' && pass.date === '2026-11-27' && pass.dep === '08:03' && /Seat 23B/.test(pass.seat) && /Platform 4/.test(pass.seat) && pass.ref === 'XY12ZT89', pass);
const ev = I.tripToEvent(Object.assign({}, sl), 'me');
const cleaned = require('../core.js').cleanEvent(ev);
ok('a confirmed journey becomes a valid event that ends the next day', !cleaned.error && cleaned.data.endDate === '2026-11-22' && cleaned.data.end === '07:45' && cleaned.data.trip.ref === 'ZZ12AB', cleaned);

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
