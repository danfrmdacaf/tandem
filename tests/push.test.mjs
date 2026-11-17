import { createRequire } from 'module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const C = require('../core.js');
const { findDue, localParts, message } = await import('../supabase/functions/tandem-push/due.mjs');
const { C: CF, occurrenceStarts: occF, ruleStatus: ruleF } = await import('../supabase/functions/tandem-push/calendar.mjs');
const { encryptPayload, vapidHeader, b64u, unb64u } = await import('../supabase/functions/tandem-push/webpush.mjs');

let fails = 0;
const ok = (name, cond, extra) => { if (!cond) { fails++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', name); };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });

const at = (iso) => Date.parse(iso);
const ev = (id, data) => ({ id, data: Object.assign({ title: 'Event', date: '2026-11-17', allDay: false, start: '10:00', end: '11:00', who: [] }, data) });
const run = (events, nowIso, o = {}) => findDue(CF, Object.assign({ events, nowMs: at(nowIso), tz: 'Europe/London', lead: 10, me: 'me', rules: [], roomId: 'r1' }, o));

/* the window */
eq('an event 8 minutes away is due', run([ev('a', {})], '2026-11-17T09:52:00Z').map((d) => d.minutes), [8]);
eq('an event exactly ten minutes away is due', run([ev('a', {})], '2026-11-17T09:50:30Z').map((d) => d.minutes), [10]);
eq('an event 11 minutes away is not due yet', run([ev('a', {})], '2026-11-17T09:49:00Z'), []);
eq('an event starting this minute is still due', run([ev('a', {})], '2026-11-17T10:00:20Z').map((d) => d.minutes), [0]);
eq('an event that has started is not due', run([ev('a', {})], '2026-11-17T10:01:00Z'), []);
eq('a longer lead time widens the window', run([ev('a', {})], '2026-11-17T09:40:00Z', { lead: 30 }).map((d) => d.minutes), [20]);

/* the time zone belongs to the person, because events are written as wall clock times */
eq('a person in New York is told at their own 9:52', run([ev('a', {})], '2026-11-17T14:52:00Z', { tz: 'America/New_York' }).map((d) => d.minutes), [8]);
eq('the same moment is too early for someone in London', run([ev('a', {})], '2026-11-17T14:52:00Z'), []);
eq('an unknown time zone falls back instead of failing', run([ev('a', {})], '2026-11-17T09:52:00Z', { tz: 'Not/AZone' }).length, 1);
eq('wall clock parts across midnight', localParts(at('2026-11-17T23:57:00Z'), 'Europe/London').date, '2026-11-17');

/* repeats, midnight, who it is for */
eq('a weekly event is found on a later week', run([ev('w', { date: '2026-11-03', repeat: 'weekly' })], '2026-11-17T09:55:00Z').length, 1);
eq('a weekly event is not found on another weekday', run([ev('w', { date: '2026-11-03', repeat: 'weekly' })], '2026-11-18T09:55:00Z').length, 0);
eq('just before midnight finds an event just after it', run([ev('m', { date: '2026-11-18', start: '00:05' })], '2026-11-17T23:57:00Z').map((d) => d.minutes), [8]);
eq('all day events never notify', run([ev('b', { allDay: true })], '2026-11-17T09:55:00Z'), []);
eq('an event for someone else is skipped', run([ev('x', { who: ['annie'] })], '2026-11-17T09:55:00Z'), []);
eq('an event for me is found', run([ev('x', { who: ['annie', 'me'] })], '2026-11-17T09:55:00Z').length, 1);
eq('a deleted-looking event with no title is skipped', run([{ id: 'z', data: { date: '2026-11-17', start: '10:00' } }], '2026-11-17T09:55:00Z'), []);

/* personal rules silence the reminder */
const rules = (r) => run([ev('a', { title: 'Programming Lab', start: '14:00' })], '2026-11-17T13:55:00Z', { rules: r });
eq('an optional rule silences it', rules([{ room: 'r1', mode: 'optional', after: '13:00' }]), []);
eq('a hide rule silences it', rules([{ room: 'r1', mode: 'hide', ev: 'a' }]), []);
eq('a rule for another calendar does not', rules([{ room: 'r2', mode: 'hide', ev: 'a' }]).length, 1);
eq('a removed rule does not', rules([{ room: 'r1', mode: 'hide', ev: 'a', gone: true }]).length, 1);

/* the copy of the calendar logic used by the server agrees with the one in the application */
let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
let diffs = 0, checked = 0;
for (let i = 0; i < 600; i++) {
  const base = C.add('2026-01-01', rnd(400));
  const e = { date: base, endDate: rnd(4) === 0 ? C.add(base, rnd(4)) : undefined, repeat: ['none', 'daily', 'weekly', 'fortnightly', 'monthly', 'yearly'][rnd(6)], until: rnd(3) === 0 ? C.add(base, rnd(300)) : undefined, start: '10:00', allDay: false, title: 'T' + rnd(3) };
  const from = C.add('2026-06-01', rnd(300)), to = C.add(from, rnd(40));
  checked++; if (JSON.stringify(C.occurrenceStarts(e, from, to)) !== JSON.stringify(occF(e, from, to))) diffs++;
  const rule = [{ room: 'r', mode: rnd(2) ? 'hide' : 'optional', title: rnd(2) ? 't' + rnd(3) : undefined, after: rnd(2) ? '09:00' : undefined, days: rnd(2) ? [rnd(7)] : undefined, ev: rnd(5) === 0 ? 'x' : undefined }];
  const o = { id: 'x', data: e, date: from, start: from };
  checked++; if (C.ruleStatus(rule, 'r', o) !== ruleF(rule, 'r', o)) diffs++;
}
eq('the server copy and the application agree on ' + checked + ' generated cases', diffs, 0);

/* the message */
eq('the message says when', message(run([ev('a', { place: 'JGG10' })], '2026-11-17T09:52:00Z')[0]).body, 'Starts at 10:00, in 8 minutes. JGG10.');
ok('a journey is described by its route', message({ title: 'Train', start: '10:30', minutes: 10, place: '', trip: { from: 'London Euston', to: 'Manchester' }, key: 'k' }).body.includes('London Euston to Manchester'));
eq('one minute is singular', message({ title: 'x', start: '10:00', minutes: 1, place: '', trip: null, key: 'k' }).body, 'Starts at 10:00, in 1 minute.');

/* encryption: the receiving side, written from the specification, can read what is sent */
const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const auth = crypto.randomBytes(16);
const text = JSON.stringify({ title: 'Lecture', body: 'Starts at 09:00. Café' });
const body = new Uint8Array(await encryptPayload(b64u(ua.getPublicKey()), b64u(auth), text));
const salt = body.subarray(0, 16), idlen = body[20], asPub = Buffer.from(body.subarray(21, 21 + idlen)), cipher = body.subarray(21 + idlen);
const shared = ua.computeSecret(asPub);
const hk = (ikm, s, info, n) => Buffer.from(crypto.hkdfSync('sha256', ikm, s, info, n));
const ikm = hk(shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]), 32);
const cek = hk(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hk(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(Buffer.from(cipher.subarray(cipher.length - 16)));
const plain = Buffer.concat([d.update(Buffer.from(cipher.subarray(0, cipher.length - 16))), d.final()]);
ok('a message decrypts to the original with the padding marker at the end', plain.subarray(0, plain.length - 1).toString() === text && plain[plain.length - 1] === 2);
eq('the record size field is 4096 and the key length 65', [new DataView(body.buffer, body.byteOffset).getUint32(16), idlen], [4096, 65]);
ok('two messages are never encrypted the same way', Buffer.compare(Buffer.from(await encryptPayload(b64u(ua.getPublicKey()), b64u(auth), text)), Buffer.from(body)) !== 0);

/* the VAPID proof */
const kp = await crypto.webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.webcrypto.subtle.exportKey('jwk', kp.privateKey);
const pub = b64u(new Uint8Array(await crypto.webcrypto.subtle.exportKey('raw', kp.publicKey)));
const hdr = await vapidHeader('https://web.push.apple.com/some/endpoint', 'https://danfrmdacaf.github.io/tandem/', pub, jwk, 1800000000);
const m = /^vapid t=([^,]+), k=(.+)$/.exec(hdr), [h1, h2, h3] = m[1].split('.');
ok('the VAPID signature verifies with the public key', await crypto.webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, unb64u(h3), new TextEncoder().encode(h1 + '.' + h2)));
const claims = JSON.parse(Buffer.from(h2, 'base64url'));
eq('the claims name the push service and expire in twelve hours', [claims.aud, claims.exp - 1800000000], ['https://web.push.apple.com', 43200]);

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
