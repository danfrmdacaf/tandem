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

/* colours */
ok('white text on a dark colour', C.inkOn('#3A6EA5') === '#FFFFFF');
ok('dark text on a light colour', C.inkOn('#F5D76E') === '#15181D');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
