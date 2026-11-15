process.env.TZ = 'Europe/London';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const C = require('../core.js');

let fails = 0;
const ok = (name, cond, extra) => { if (!cond) { fails++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', name); };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });

/* dates */
eq('monday of a Sunday is the previous Monday', C.monday('2026-11-15'), '2026-11-09');
eq('monday of a Monday is itself', C.monday('2026-11-16'), '2026-11-16');
eq('add crosses a month and a year', C.add('2026-12-30', 3), '2027-01-02');
eq('addMonths wraps the year', C.addMonths('2026-11-01', 3), '2027-02-01');
eq('addMonths goes backwards', C.addMonths('2026-01-01', -1), '2025-12-01');

/* one-off and multi-day events */
const trip = { id: 't', data: { title: 'Trip', date: '2026-11-29', endDate: '2026-12-02', allDay: true } };
const m1 = C.byDate([trip], '2026-11-30', '2026-12-31');
eq('multi-day event shows on the days inside the window only', Object.keys(m1), ['2026-11-30', '2026-12-01', '2026-12-02']);
ok('first and last flags are right', m1['2026-12-02'][0].last === true && m1['2026-11-30'][0].first === false);

/* repeats */
const dinner = { id: 'd', data: { title: 'Dinner', date: '2026-11-20', start: '19:00', end: '21:00', repeat: 'weekly', until: '2026-12-11' } };
eq('weekly with an end date', C.occurrenceStarts(dinner.data, '2026-11-01', '2027-01-31'), ['2026-11-20', '2026-11-27', '2026-12-04', '2026-12-11']);
eq('weekly window starting late skips earlier occurrences', C.occurrenceStarts(dinner.data, '2026-12-01', '2026-12-31'), ['2026-12-04', '2026-12-11']);
eq('fortnightly', C.occurrenceStarts({ date: '2026-11-02', repeat: 'fortnightly' }, '2026-11-01', '2026-12-15'), ['2026-11-02', '2026-11-16', '2026-11-30', '2026-12-14']);
eq('daily for three days', C.occurrenceStarts({ date: '2026-11-02', repeat: 'daily', until: '2026-11-04' }, '2026-11-01', '2026-11-30'), ['2026-11-02', '2026-11-03', '2026-11-04']);
eq('monthly on the 31st skips short months', C.occurrenceStarts({ date: '2026-10-31', repeat: 'monthly' }, '2026-10-01', '2027-01-31'), ['2026-10-31', '2026-12-31', '2027-01-31']);
eq('monthly on the 15th', C.occurrenceStarts({ date: '2026-09-15', repeat: 'monthly' }, '2026-11-01', '2027-01-31'), ['2026-11-15', '2026-12-15', '2027-01-15']);
eq('yearly birthday', C.occurrenceStarts({ date: '2020-03-08', repeat: 'yearly' }, '2026-01-01', '2027-12-31'), ['2026-03-08', '2027-03-08']);
eq('yearly 29 February only in leap years', C.occurrenceStarts({ date: '2024-02-29', repeat: 'yearly' }, '2025-01-01', '2028-12-31'), ['2028-02-29']);
eq('repeat does not start before its first date', C.occurrenceStarts({ date: '2026-12-01', repeat: 'weekly' }, '2026-11-01', '2026-12-10'), ['2026-12-01', '2026-12-08']);
const longRepeat = C.occurrenceStarts({ date: '2026-11-30', endDate: '2026-12-02', repeat: 'monthly' }, '2026-12-01', '2026-12-31');
eq('a repeating multi-day event is found when the window starts inside it, and again next month', longRepeat, ['2026-11-30', '2026-12-30']);

/* sorting, deleted events and filters */
const evs = [
  { id: 'a', data: { title: 'Late', date: '2026-11-20', start: '20:00', end: '21:00' } },
  { id: 'b', data: { title: 'All day thing', date: '2026-11-20', allDay: true } },
  { id: 'c', data: { title: 'Early', date: '2026-11-20', start: '08:00', end: '09:00' } },
  { id: 'x', deleted: true, data: { title: 'Gone', date: '2026-11-20', start: '10:00' } }
];
eq('all day first, then by time, deleted removed', C.byDate(evs, '2026-11-20', '2026-11-20')['2026-11-20'].map(o => o.id), ['b', 'c', 'a']);
eq('filter hides events', Object.keys(C.byDate(evs, '2026-11-20', '2026-11-20', d => d.title === 'Early')).length, 1);

/* labels */
eq('time label for a timed event', C.timeLabel({ data: { start: '19:00', end: '21:00' }, start: '2026-11-20', end: '2026-11-20' }), '19:00–21:00');
eq('time label for all day', C.timeLabel({ data: { allDay: true }, start: 'a', end: 'a' }), 'All day');
eq('time label on the first day of a long timed event', C.timeLabel({ data: { start: '22:00', end: '08:00' }, start: '2026-11-20', end: '2026-11-21', first: true, last: false }), 'From 22:00');

/* upcoming */
const up = C.upcoming(evs, '2026-11-20', '12:00', 10);
eq('upcoming drops events that already finished today', up.map(o => o.id), ['b', 'a']);

/* free together */
const week = [
  { id: '1', data: { title: 'Lecture', date: '2026-11-23', start: '09:00', end: '12:00' } },
  { id: '2', data: { title: 'Dinner out', date: '2026-11-24', start: '19:00', end: '21:00' } },
  { id: '3', data: { title: 'Away', date: '2026-11-25', allDay: true } }
];
eq('free together statuses', C.freeTogether(week, '2026-11-23', 4).map(x => x.status), ['evening', 'busy', 'busy', 'free']);

/* event cleaning */
ok('empty title is rejected', C.cleanEvent({ title: ' ', date: '2026-11-20' }).error);
ok('bad date is rejected', C.cleanEvent({ title: 'x', date: 'tomorrow' }).error);
ok('end before start is rejected', C.cleanEvent({ title: 'x', date: '2026-11-20', start: '10:00', end: '09:00' }).error);
const good = C.cleanEvent({ title: ' Cinema ', date: '2026-11-20', start: '18:00', end: '20:30', who: ['m1', ''], repeat: 'weekly', until: '2026-12-31', place: 'Light', notes: 'Bring cards', by: 'm1' }).data;
eq('clean event keeps what matters', good, { title: 'Cinema', date: '2026-11-20', allDay: false, start: '18:00', end: '20:30', who: ['m1'], repeat: 'weekly', until: '2026-12-31', place: 'Light', notes: 'Bring cards', by: 'm1' });
ok('until before the date is dropped', C.cleanEvent({ title: 'x', date: '2026-11-20', allDay: true, repeat: 'weekly', until: '2026-11-01' }).data.until === undefined);
ok('an overnight timed event is allowed when it ends on a later day', !C.cleanEvent({ title: 'x', date: '2026-11-20', endDate: '2026-11-21', start: '22:00', end: '07:00' }).error);


/* reading calendar files */
const ics = (...ev) => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n' + ev.map(e => 'BEGIN:VEVENT\r\n' + e.join('\r\n') + '\r\nEND:VEVENT\r\n').join('') + 'END:VCALENDAR\r\n';
const one = (...lines) => C.parseICS(ics(lines));
let r = one('UID:a', 'DTSTART;VALUE=DATE:20261123', 'DTEND;VALUE=DATE:20261124', 'SUMMARY:Exam');
ok('single all day event', r.events.length === 1 && r.events[0].data.allDay && r.events[0].data.date === '2026-11-23' && !r.events[0].data.endDate, r);
r = one('UID:b', 'DTSTART;VALUE=DATE:20261123', 'DTEND;VALUE=DATE:20261126', 'SUMMARY:Trip');
eq('multi day all day event ends on the last day, not the exclusive end', r.events[0].data.endDate, '2026-11-25');
r = one('UID:c', 'DTSTART:20260715T080000Z', 'DTEND:20260715T090000Z', 'SUMMARY:Call');
eq('UTC time is converted to local summer time', [r.events[0].data.start, r.events[0].data.end], ['09:00', '10:00']);
r = one('UID:d', 'DTSTART:20261119T090000', 'DTEND:20261119T120000', 'SUMMARY:Lab');
eq('floating time is kept as written', [r.events[0].data.start, r.events[0].data.end], ['09:00', '12:00']);
r = one('UID:e', 'DTSTART;TZID=Europe/London:20261119T090000', 'DURATION:PT1H30M', 'SUMMARY:Seminar');
eq('duration gives the end time', r.events[0].data.end, '10:30');
r = one('UID:f', 'DTSTART:20261119T220000', 'DTEND:20261120T000000', 'SUMMARY:Late');
ok('ending at midnight stays on the same day', r.events[0].data.end === '23:59' && !r.events[0].data.endDate, r.events[0].data);
r = one('UID:g', 'DTSTART:20261119T090000', 'DTEND:20261119T100000', 'SUMMARY:Maths\\, part one\\nbring a pen', 'LOCATION:Room 4\; level 2', 'DESCRIPTION:Line one\\nLine two');
eq('text escapes are undone', [r.events[0].data.title, r.events[0].data.place, r.events[0].data.notes], ['Maths, part one\nbring a pen', 'Room 4; level 2', 'Line one\nLine two']);
const folded = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:h\r\nDTSTART;VALUE=DATE:20261123\r\nSUMMARY:A very long\r\n  title that was folded\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
eq('folded lines are joined', C.parseICS(folded).events[0].data.title, 'A very long title that was folded');
r = one('UID:i', 'DTSTART:20261123T090000', 'DTEND:20261123T100000', 'RRULE:FREQ=WEEKLY;COUNT=3', 'SUMMARY:Weekly');
ok('weekly count becomes an end date', r.events.length === 1 && r.events[0].data.repeat === 'weekly' && r.events[0].data.until === '2026-12-07', r.events[0].data);
r = one('UID:j', 'DTSTART:20261123T090000', 'DTEND:20261123T100000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T000000Z', 'SUMMARY:Two days');
eq('weekly on two days becomes two repeating events', r.events.map(e => [e.data.date, e.data.repeat, e.data.until]), [['2026-11-23', 'weekly', '2026-12-31'], ['2026-11-25', 'weekly', '2026-12-31']]);
r = one('UID:k', 'DTSTART:20261125T090000', 'DTEND:20261125T100000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR', 'SUMMARY:Mixed');
eq('days earlier in the week start the following week', r.events.map(e => e.data.date), ['2026-11-25', '2026-11-27', '2026-11-30']);
r = one('UID:l', 'DTSTART:20261123T090000', 'DTEND:20261123T100000', 'RRULE:FREQ=DAILY;INTERVAL=3', 'SUMMARY:Odd');
ok('an unsupported rule imports one occurrence and is counted', r.events.length === 1 && !r.events[0].data.repeat && r.simplified === 1, r);
r = C.parseICS(ics(['UID:m', 'DTSTART:20261123T090000', 'RECURRENCE-ID:20261123T090000', 'SUMMARY:Moved'], ['UID:n', 'DTSTART:20261123T090000', 'STATUS:CANCELLED', 'SUMMARY:Gone'], ['UID:o', 'DTSTART:20261123T090000', 'SUMMARY:Kept']));
ok('moved and cancelled instances are skipped', r.events.length === 1 && r.skipped === 2, r);
r = C.parseICS(ics(['UID:p', 'DTSTART:20261123T090000', 'DTEND:20261123T100000', 'SUMMARY:Real', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder text', 'END:VALARM']));
ok('reminder blocks do not leak into the event', r.events[0].data.notes === undefined, r.events[0].data);
const again = [C.parseICS(ics(['UID:q', 'DTSTART:20261123T090000', 'SUMMARY:Same'])).events[0].id, C.parseICS(ics(['UID:q', 'DTSTART:20261123T090000', 'SUMMARY:Same'])).events[0].id, C.parseICS(ics(['UID:q2', 'DTSTART:20261123T090000', 'SUMMARY:Same'])).events[0].id];
ok('ids are stable for the same event and differ otherwise', again[0] === again[1] && again[0] !== again[2], again);
r = C.parseICS(ics(['UID:1', 'DTSTART:20261123T090000', 'SUMMARY:A'], ['UID:2', 'DTSTART:20261124T090000', 'SUMMARY:B'], ['UID:3', 'DTSTART:20261125T090000', 'SUMMARY:C']), { max: 2 });
ok('the limit is respected and reported', r.events.length === 2 && r.truncated, r);

/* personal rules: hide an event or mark it optional, for one person only */
const mk = (id, data) => ({ id, data: Object.assign({ date: '2026-11-16', allDay: false, start: '09:00', end: '10:00' }, data) });
const lec = mk('l1', { title: 'Programming Lecture', start: '09:00', end: '11:00', repeat: 'weekly' });
const lab = mk('l2', { title: 'Programming Lab', start: '14:00', end: '16:00', repeat: 'weekly' });
const occ = (e, d) => C.byDate([e], d, d)[d][0];
ok('an event rule matches that event only', C.ruleStatus([{ room: 'r', mode: 'hide', ev: 'l1' }], 'r', occ(lec, '2026-11-23')) === 'hide' && C.ruleStatus([{ room: 'r', mode: 'hide', ev: 'l1' }], 'r', occ(lab, '2026-11-23')) === null);
ok('a rule for one day leaves the other days alone', C.ruleStatus([{ room: 'r', mode: 'hide', ev: 'l1', day: '2026-11-23' }], 'r', occ(lec, '2026-11-23')) === 'hide' && C.ruleStatus([{ room: 'r', mode: 'hide', ev: 'l1', day: '2026-11-23' }], 'r', occ(lec, '2026-11-30')) === null);
ok('a title rule ignores case and spacing', C.ruleStatus([{ room: 'r', mode: 'optional', title: C.normTitle('programming  lab') }], 'r', occ(lab, '2026-11-16')) === 'optional');
const after1 = { room: 'r', mode: 'optional', after: '13:00' };
ok('after one o clock marks the afternoon only', C.ruleStatus([after1], 'r', occ(lab, '2026-11-16')) === 'optional' && C.ruleStatus([after1], 'r', occ(lec, '2026-11-16')) === null);
ok('a time rule never matches an all day event', C.ruleStatus([after1], 'r', occ(mk('a', { title: 'Birthday', allDay: true }), '2026-11-16')) === null);
ok('a weekday set restricts a rule', C.ruleStatus([{ room: 'r', mode: 'optional', after: '13:00', days: [2] }], 'r', occ(lab, '2026-11-16')) === null && C.ruleStatus([{ room: 'r', mode: 'optional', after: '13:00', days: [1] }], 'r', occ(lab, '2026-11-16')) === 'optional');
ok('hide wins over optional', C.ruleStatus([after1, { room: 'r', mode: 'hide', ev: 'l2' }], 'r', occ(lab, '2026-11-16')) === 'hide');
ok('a rule belongs to its own calendar', C.ruleStatus([{ room: 'other', mode: 'hide', ev: 'l1' }], 'r', occ(lec, '2026-11-16')) === null && C.ruleStatus([{ room: '*', mode: 'hide', ev: 'l1' }], 'r', occ(lec, '2026-11-16')) === 'hide');
ok('a rule with no condition matches nothing', C.ruleStatus([{ room: 'r', mode: 'hide' }], 'r', occ(lec, '2026-11-16')) === null);
ok('a removed rule does nothing', C.ruleStatus([{ room: 'r', mode: 'hide', ev: 'l1', gone: true }], 'r', occ(lec, '2026-11-16')) === null);
const optMap = C.byDate([lec, lab], '2026-11-16', '2026-11-16', null, (o) => C.ruleStatus([after1], 'r', o) !== 'optional');
eq('the occurrence filter removes optional events from a day', optMap['2026-11-16'].map((o) => o.id), ['l1']);
eq('free time ignores optional events', C.freeTogether([lab], '2026-11-16', 1, (o) => C.ruleStatus([after1], 'r', o) !== 'optional')[0].status, 'free');
const tr = C.cleanEvent({ title: 'Train', date: '2026-11-20', start: '10:30', end: '12:45', trip: { mode: 'train', from: 'A', to: 'B', junk: 'x' }, att: { id: 'f1', name: 't.pdf', type: 'application/pdf', by: 'm' }, imp: 'b1', impn: 'file.csv' }).data;
ok('travel details, attachment and import tag are kept, unknown fields are not', tr.trip.from === 'A' && !tr.trip.junk && tr.att.id === 'f1' && tr.imp === 'b1' && tr.impn === 'file.csv', tr);

/* writing a calendar file, and reading it back */
const out = C.toICS('Our, calendar', [
  { id: 'e1', data: { title: 'Dinner; with Annie', date: '2026-11-20', allDay: false, start: '19:00', end: '21:00', place: 'Soho', notes: 'Book a table\nBring cash', who: ['a'], repeat: 'weekly', until: '2026-12-18' } },
  { id: 'e2', data: { title: 'Trip', date: '2026-12-01', endDate: '2026-12-03', allDay: true } },
  { id: 'e3', data: { title: 'Gone', date: '2026-12-01', allDay: true }, deleted: true }
], { a: 'Annie' });
const back = C.parseICS(out).events;
ok('an exported file reads back with the same events', back.length === 2 && back[0].data.title === 'Dinner; with Annie' && back[0].data.start === '19:00' && back[0].data.repeat === 'weekly' && back[0].data.until === '2026-12-18' && back[0].data.place === 'Soho' && back[1].data.endDate === '2026-12-03' && back[1].data.allDay, back);
ok('lines in the exported file are folded to 75 bytes', out.split('\r\n').every((l) => Buffer.byteLength(l) <= 75));

/* colours */
ok('white text on a dark colour', C.inkOn('#3A6EA5') === '#FFFFFF');
ok('dark text on a light colour', C.inkOn('#F5D76E') === '#15181D');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
