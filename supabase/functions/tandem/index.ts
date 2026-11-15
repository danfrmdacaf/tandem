// Tandem edge function. Runs on the server and is the only code that touches the database.
// The browser never receives a database credential: it talks to this function with a calendar key
// that only identifies one shared calendar. Written for the Supabase edge runtime (Deno).
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-tandem-key, authorization",
  "Access-Control-Max-Age": "86400",
};
const ALPHA_ID = "abcdefghjkmnpqrstuvwxyz23456789";
const ALPHA_KEY = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const ALPHA_CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const KINDS = ["meta", "member", "event"];
const MAX_EVENTS_PER_ROOM = 5000;
const MAX_ROOMS_PER_DAY = 300;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function rand(n: number, alphabet: string): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += alphabet[x % alphabet.length];
  return s;
}

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readJson(req: Request, max = 300000): Promise<Record<string, any>> {
  const t = await req.text();
  if (t.length > max) throw new Error("Request too large");
  return t ? JSON.parse(t) : {};
}

const clean = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

async function authKey(raw: string) {
  const dot = raw.indexOf(".");
  if (dot < 3) return null;
  const id = raw.slice(0, dot);
  const secret = raw.slice(dot + 1);
  if (!/^[a-z0-9]{6,32}$/.test(id) || secret.length < 16 || secret.length > 64) return null;
  const { data } = await db.from("tandem_rooms").select("id, secret_hash, feed_token").eq("id", id).maybeSingle();
  if (!data) return null;
  if ((await sha256(secret)) !== data.secret_hash) return null;
  return data;
}

const authRoom = (req: Request) => authKey(req.headers.get("x-tandem-key") || "");

// helpers used by the overlays and the feed
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ---- overlays: the events of one calendar shown read only on another ----
const MAX_SHARES_PER_TARGET = 10;

// What leaves the source calendar. In busy mode only the times are sent: the title, place and notes
// stay on the server and never reach the people looking at the shared calendar.
function overlayItem(mode: string, id: string, d: any) {
  if (!d || !isDate(d.date) || !d.title) return null;
  const o: Record<string, unknown> = { date: d.date, allDay: !!d.allDay };
  if (isDate(d.endDate) && d.endDate > d.date) o.endDate = d.endDate;
  if (!d.allDay) {
    o.start = d.start;
    o.end = d.end;
  }
  if (d.repeat) {
    o.repeat = d.repeat;
    if (isDate(d.until)) o.until = d.until;
  }
  if (mode === "busy") {
    o.title = "Busy";
  } else {
    o.title = clean(d.title, 120);
    if (d.place) o.place = clean(d.place, 120);
  }
  return { id, data: o };
}

async function buildOverlays(targetRoom: string, clientTag: string) {
  const { data: shares } = await db.from("tandem_shares").select("id, source_room, mode, label, by_member").eq("target_room", targetRoom);
  const list = shares ?? [];
  const sources: { sh: any; rows: any[] }[] = [];
  const parts: string[] = [];
  for (const sh of list) {
    const { data: rows } = await db.from("tandem_items").select("id, data, deleted, updated_at")
      .eq("room", sh.source_room).eq("kind", "event").limit(3000);
    const all = rows ?? [];
    const latest = all.reduce((m: string, r: any) => (r.updated_at > m ? r.updated_at : m), "");
    parts.push(`${sh.id}.${sh.mode}.${sh.label}.${sh.by_member}.${all.length}.${latest}`);
    sources.push({ sh, rows: all });
  }
  const tag = parts.join("|");
  if (tag === clientTag) return { overlays: null, overlayTag: tag };
  const overlays = sources.map(({ sh, rows }) => ({
    share: sh.id,
    label: sh.label,
    mode: sh.mode,
    by: sh.by_member,
    items: rows.filter((r: any) => !r.deleted).map((r: any) => overlayItem(sh.mode, r.id, r.data)).filter(Boolean),
  }));
  return { overlays, overlayTag: tag };
}

// ---- calendar feed (iCalendar) ----
const icsEsc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

function fold(line: string): string {
  const enc = new TextEncoder();
  let out = "";
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 74) {
      out += cur + "\r\n ";
      cur = ch;
      bytes = 1 + b;
    } else {
      cur += ch;
      bytes += b;
    }
  }
  return out + cur;
}

const compactDate = (d: string) => d.replace(/-/g, "");
const compactTime = (t: string) => (t || "09:00").replace(":", "") + "00";
function addDays(d: string, n: number): string {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day + n));
  return t.toISOString().slice(0, 10);
}
function buildFeed(name: string, members: Record<string, string>, events: { id: string; data: any }[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const L: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Adachi Industries//Tandem//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:" + icsEsc(name),
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const ev of events) {
    const d = ev.data || {};
    if (!isDate(d.date) || !d.title) continue;
    L.push("BEGIN:VEVENT", `UID:${ev.id}@tandem.adachiindustries`, `DTSTAMP:${stamp}`, "SUMMARY:" + icsEsc(clean(d.title, 200)));
    const endDate = isDate(d.endDate) && d.endDate >= d.date ? d.endDate : d.date;
    if (d.allDay) {
      L.push(`DTSTART;VALUE=DATE:${compactDate(d.date)}`, `DTEND;VALUE=DATE:${compactDate(addDays(endDate, 1))}`);
    } else {
      L.push(`DTSTART:${compactDate(d.date)}T${compactTime(d.start)}`, `DTEND:${compactDate(endDate)}T${compactTime(d.end || d.start)}`);
    }
    const rr: Record<string, string> = {
      daily: "FREQ=DAILY",
      weekly: "FREQ=WEEKLY",
      fortnightly: "FREQ=WEEKLY;INTERVAL=2",
      monthly: "FREQ=MONTHLY",
      yearly: "FREQ=YEARLY",
    };
    if (rr[d.repeat]) {
      let rule = rr[d.repeat];
      if (isDate(d.until)) rule += ";UNTIL=" + compactDate(d.until) + (d.allDay ? "" : "T235959");
      L.push("RRULE:" + rule);
    }
    const who = Array.isArray(d.who) && d.who.length ? d.who.map((m: string) => members[m]).filter(Boolean).join(" and ") : "Everyone";
    const desc = ["For: " + who, d.notes ? clean(d.notes, 1500) : ""].filter(Boolean).join("\n");
    L.push("DESCRIPTION:" + icsEsc(desc));
    if (d.place) L.push("LOCATION:" + icsEsc(clean(d.place, 200)));
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}


// ---- accounts ----
// An account is optional. It stores a person's calendars (their keys), Home page layout and preferences so that
// they follow the person to every device. Passwords are stored only as a salted PBKDF2 hash. Session and reset
// tokens are random and only their hashes are stored.
const SITE = Deno.env.get("TANDEM_SITE") || "https://danfrmdacaf.github.io/tandem/";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") || "Tandem <onboarding@resend.dev>";
const PW_ITER = 600000;
const SESSION_DAYS = 90;
const MAX_FILES = 30;
const MAX_FILE_B64 = 2200000;
const COMMON_PASSWORDS = ["password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop", "iloveyou1", "letmein123", "adminadmin", "11111111"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 64);

async function derive(pw: string, saltB64: string, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(saltB64), iterations: iter }, key, 256);
  return b64(new Uint8Array(bits));
}
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function attempts(k: string, windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count } = await db.from("tandem_attempts").select("id", { count: "exact", head: true }).eq("k", k).gte("at", since);
  return count ?? 0;
}
const note = (k: string) => db.from("tandem_attempts").insert({ k });

function passwordProblem(pw: string, email: string): string {
  if (pw.length < 8) return "The password needs at least eight characters.";
  if (pw.length > 200) return "That password is too long.";
  if (COMMON_PASSWORDS.includes(pw.toLowerCase()) || pw.toLowerCase() === email) return "That password is too easy to guess. Please choose another.";
  return "";
}

async function startSession(accountId: string, req: Request): Promise<string> {
  const token = rand(40, ALPHA_KEY);
  const device = clean(req.headers.get("user-agent"), 120);
  await db.from("tandem_sessions").insert({
    id: await sha256(token), account: accountId, device,
    expires_at: new Date(Date.now() + SESSION_DAYS * 86400000).toISOString(),
  });
  return token;
}

async function authAccount(req: Request) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (token.length < 30 || token.length > 80) return null;
  const sid = await sha256(token);
  const { data: s } = await db.from("tandem_sessions").select("id, account, expires_at, last_used").eq("id", sid).maybeSingle();
  if (!s || new Date(s.expires_at).getTime() < Date.now()) return null;
  const { data: a } = await db.from("tandem_accounts").select("id, email, name, profile").eq("id", s.account).maybeSingle();
  if (!a) return null;
  if (Date.now() - new Date(s.last_used).getTime() > 86400000) {
    await db.from("tandem_sessions").update({
      last_used: new Date().toISOString(), expires_at: new Date(Date.now() + SESSION_DAYS * 86400000).toISOString(),
    }).eq("id", sid);
  }
  return { ...a, sid };
}

// The profile holds the calendars an account belongs to, the rules that hide or soften events, and the Home layout.
// Maps are merged one entry at a time and the newest change wins, so two devices never overwrite each other.
const objAt = (x: any) => (x && typeof x === "object" ? Number(x.at) || 0 : 0);
function mergeMap(cur: Record<string, any>, inc: Record<string, any>, max: number, okEntry: (id: string, e: any) => any) {
  const out: Record<string, any> = { ...cur };
  for (const [id, raw] of Object.entries(inc || {})) {
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(id)) continue;
    const e = okEntry(id, raw);
    if (!e) continue;
    if (!out[id] || e.at > objAt(out[id])) out[id] = e;
  }
  const ids = Object.keys(out);
  if (ids.length > max) {
    ids.sort((a, b) => objAt(out[b]) - objAt(out[a]));
    for (const id of ids.slice(max)) delete out[id];
  }
  return out;
}
const okRoom = (_id: string, e: any) => {
  if (!e || typeof e !== "object") return null;
  const at = Number(e.at) || 0;
  if (e.gone) return { gone: true, at };
  const key = String(e.key || "");
  if (!/^[a-z0-9]{6,32}\.[A-Za-z0-9]{16,64}$/.test(key)) return null;
  return { key, me: clean(e.me, 64), at, feedToken: clean(e.feedToken, 64) };
};
const okRule = (_id: string, e: any) => {
  if (!e || typeof e !== "object" || JSON.stringify(e).length > 700) return null;
  const at = Number(e.at) || 0;
  if (e.gone) return { gone: true, at };
  if (e.mode !== "hide" && e.mode !== "optional") return null;
  return e;
};
function mergeProfile(cur: any, inc: any) {
  cur = cur && typeof cur === "object" ? cur : {};
  inc = inc && typeof inc === "object" ? inc : {};
  const out: Record<string, any> = {
    rooms: mergeMap(cur.rooms || {}, inc.rooms || {}, 100, okRoom),
    rules: mergeMap(cur.rules || {}, inc.rules || {}, 400, okRule),
    widgets: cur.widgets || null,
  };
  const w = inc.widgets;
  if (w && typeof w === "object" && Array.isArray(w.val) && w.val.length <= 40 && JSON.stringify(w.val).length < 20000 && objAt(w) > objAt(out.widgets)) {
    out.widgets = { at: objAt(w), val: w.val };
  }
  return out;
}

async function sendMail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  if (!RESEND_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "authorization": "Bearer " + RESEND_KEY, "content-type": "application/json" },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, text, html }),
    });
    if (!res.ok) console.error("mail failed", res.status, (await res.text()).slice(0, 300));
    return res.ok;
  } catch (e) {
    console.error("mail error", String(e));
    return false;
  }
}
const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function resetMail(name: string, link: string) {
  const who = name ? "Hello " + name + "," : "Hello,";
  const text = `${who}

Someone asked to reset the password for the Tandem account that uses this email address. If that was you, open the link below within one hour and choose a new password.

${link}

If you did not ask for this, you can ignore this email and your password will stay the same.

Tandem, built by Daniel Chidi, Founder, Adachi Industries.`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#15181D;max-width:520px">
<p>${escHtml(who)}</p>
<p>Someone asked to reset the password for the Tandem account that uses this email address. If that was you, choose the button below within one hour and set a new password.</p>
<p><a href="${escHtml(link)}" style="display:inline-block;background:#2F5BD9;color:#FFFFFF;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Choose a new password</a></p>
<p style="color:#5C6572;font-size:13px">If the button does not work, copy this address into your browser:<br>${escHtml(link)}</p>
<p>If you did not ask for this, you can ignore this email and your password will stay the same.</p>
<p style="color:#5C6572;font-size:13px">Tandem, built by Daniel Chidi, Founder, Adachi Industries.</p></div>`;
  return { text, html };
}

const safeName = (s: unknown) => clean(s, 40).replace(/[\u0000-\u001f<>]/g, "");
const session = (a: any) => ({ email: a.email, name: a.name });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const url = new URL(req.url);
    const segs = url.pathname.split("/").filter(Boolean);
    const at = segs.indexOf("tandem");
    const path = "/" + segs.slice(at + 1).join("/");

    if (req.method === "GET" && path === "/health") {
      const { error } = await db.from("tandem_rooms").select("id", { count: "exact", head: true });
      return json({ ok: !error });
    }

    if (req.method === "POST" && path === "/room/create") {
      const body = await readJson(req);
      const name = clean(body.name, 60) || "Our calendar";
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count } = await db.from("tandem_rooms").select("id", { count: "exact", head: true }).gte("created_at", since);
      if ((count ?? 0) >= MAX_ROOMS_PER_DAY) {
        return json({ error: "Too many calendars were created today. Please try again tomorrow." }, 429);
      }
      const id = rand(10, ALPHA_ID);
      const secret = rand(28, ALPHA_KEY);
      const feed = rand(28, ALPHA_KEY);
      const { error } = await db.from("tandem_rooms").insert({ id, secret_hash: await sha256(secret), feed_token: feed });
      if (error) throw error;
      await db.from("tandem_items").insert({ room: id, kind: "meta", id: "room", data: { name }, v: Date.now() });
      return json({ roomId: id, key: `${id}.${secret}`, feedToken: feed });
    }

    if (req.method === "POST" && path === "/sync") {
      const room = await authRoom(req);
      if (!room) return json({ error: "That calendar key is not valid." }, 401);
      const body = await readJson(req);
      const push: any[] = Array.isArray(body.push) ? body.push.slice(0, 100) : [];
      let rejected = 0;
      let eventCount = -1;
      let added = 0;
      for (const it of push) {
        const kind = it?.kind;
        const id = clean(it?.id, 64);
        if (!KINDS.includes(kind) || !id) { rejected++; continue; }
        const data = it.data && typeof it.data === "object" ? it.data : {};
        if (JSON.stringify(data).length > 6000) { rejected++; continue; }
        const v = Number(it.v) || 0;
        const { data: ex } = await db.from("tandem_items").select("v").eq("room", room.id).eq("kind", kind).eq("id", id).maybeSingle();
        if (ex && Number(ex.v) > v) continue;
        if (!ex && kind === "event" && !it.deleted) {
          if (eventCount < 0) {
            const r = await db.from("tandem_items").select("id", { count: "exact", head: true })
              .eq("room", room.id).eq("kind", "event").eq("deleted", false);
            eventCount = r.count ?? 0;
          }
          if (eventCount + added >= MAX_EVENTS_PER_ROOM) { rejected++; continue; }
          added++;
        }
        const { error } = await db.from("tandem_items").upsert(
          { room: room.id, kind, id, data, v, deleted: !!it.deleted, updated_at: new Date().toISOString() },
          { onConflict: "room,kind,id" },
        );
        if (error) rejected++;
      }
      const since = typeof body.since === "string" && !isNaN(Date.parse(body.since)) ? body.since : null;
      let q = db.from("tandem_items").select("kind, id, data, v, deleted").eq("room", room.id)
        .order("updated_at", { ascending: true }).limit(3000);
      if (since) q = q.gt("updated_at", since);
      const { data: rows, error } = await q;
      if (error) throw error;
      const ov = await buildOverlays(room.id, typeof body.overlayTag === "string" ? body.overlayTag : "");
      return json({ now: new Date().toISOString(), items: rows ?? [], feedToken: room.feed_token, rejected, ...ov });
    }

    if (req.method === "POST" && path === "/link/create") {
      const room = await authRoom(req);
      if (!room) return json({ error: "That calendar key is not valid." }, 401);
      await db.from("tandem_links").delete().lt("expires_at", new Date().toISOString());
      const code = rand(8, ALPHA_CODE);
      const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
      const { error } = await db.from("tandem_links").insert({ code, room: room.id, key: req.headers.get("x-tandem-key"), expires_at: expiresAt });
      if (error) throw error;
      return json({ code, expiresAt });
    }

    if (req.method === "POST" && path === "/link/redeem") {
      const body = await readJson(req);
      const code = String(body.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length !== 8) return json({ error: "That code is not valid or has expired." }, 404);
      const { data } = await db.from("tandem_links").select("key, expires_at").eq("code", code).maybeSingle();
      if (!data || new Date(data.expires_at).getTime() < Date.now()) return json({ error: "That code is not valid or has expired." }, 404);
      await db.from("tandem_links").delete().eq("code", code);
      return json({ key: data.key });
    }

    if (req.method === "POST" && path === "/share/create") {
      const src = await authRoom(req);
      const body = await readJson(req);
      const tgt = await authKey(String(body.targetKey ?? ""));
      if (!src || !tgt) return json({ error: "That calendar key is not valid." }, 401);
      if (src.id === tgt.id) return json({ error: "A calendar cannot be shown on itself." }, 400);
      const mode = body.mode === "busy" ? "busy" : "details";
      const label = clean(body.label, 60) || "Shared calendar";
      const by = clean(body.by, 64);
      const { data: existing } = await db.from("tandem_shares").select("id").eq("source_room", src.id).eq("target_room", tgt.id).maybeSingle();
      if (existing) {
        const { error } = await db.from("tandem_shares").update({ mode, label, by_member: by }).eq("id", existing.id);
        if (error) throw error;
        return json({ id: existing.id });
      }
      const { count } = await db.from("tandem_shares").select("id", { count: "exact", head: true }).eq("target_room", tgt.id);
      if ((count ?? 0) >= MAX_SHARES_PER_TARGET) return json({ error: "That calendar already shows as many other calendars as it can." }, 400);
      const id = rand(12, ALPHA_ID);
      const { error } = await db.from("tandem_shares").insert({ id, source_room: src.id, target_room: tgt.id, mode, label, by_member: by });
      if (error) throw error;
      return json({ id });
    }

    if (req.method === "POST" && path === "/share/delete") {
      const src = await authRoom(req);
      if (!src) return json({ error: "That calendar key is not valid." }, 401);
      const body = await readJson(req);
      await db.from("tandem_shares").delete().eq("source_room", src.id).eq("target_room", clean(body.targetRoom, 40));
      return json({ ok: true });
    }

    if (req.method === "POST" && path === "/share/list") {
      const src = await authRoom(req);
      if (!src) return json({ error: "That calendar key is not valid." }, 401);
      const { data } = await db.from("tandem_shares").select("id, target_room, mode, label, by_member").eq("source_room", src.id);
      return json({ shares: data ?? [] });
    }

    if (req.method === "POST" && path === "/room/rotate") {
      const room = await authRoom(req);
      if (!room) return json({ error: "That calendar key is not valid." }, 401);
      const secret = rand(28, ALPHA_KEY);
      const feed = rand(28, ALPHA_KEY);
      const { error } = await db.from("tandem_rooms").update({ secret_hash: await sha256(secret), feed_token: feed }).eq("id", room.id);
      if (error) throw error;
      await db.from("tandem_links").delete().eq("room", room.id);
      return json({ key: `${room.id}.${secret}`, feedToken: feed });
    }


    // ---------- accounts ----------
    if (req.method === "POST" && path === "/auth/signup") {
      const body = await readJson(req);
      const email = clean(body.email, 254).toLowerCase();
      const pw = String(body.password ?? "");
      const name = safeName(body.name);
      if (!EMAIL_RE.test(email)) return json({ error: "Please enter a valid email address." }, 400);
      if (!name) return json({ error: "Please enter your name." }, 400);
      const bad = passwordProblem(pw, email);
      if (bad) return json({ error: bad }, 400);
      const ip = ipOf(req);
      if ((await attempts("signup:" + ip, 86400000)) >= 10) return json({ error: "Too many accounts were created from this connection today. Please try again tomorrow." }, 429);
      const { data: ex } = await db.from("tandem_accounts").select("id").eq("email", email).maybeSingle();
      if (ex) return json({ error: "An account with that email address already exists. Try signing in, or reset the password." }, 409);
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      const id = rand(16, ALPHA_ID);
      const { error } = await db.from("tandem_accounts").insert({ id, email, name, pw_salt: salt, pw_iter: PW_ITER, pw_hash: await derive(pw, salt, PW_ITER) });
      if (error) return json({ error: "An account with that email address already exists." }, 409);
      await note("signup:" + ip);
      const token = await startSession(id, req);
      return json({ token, account: { email, name }, profile: {} });
    }

    if (req.method === "POST" && path === "/auth/login") {
      const body = await readJson(req);
      const email = clean(body.email, 254).toLowerCase();
      const pw = String(body.password ?? "").slice(0, 200);
      const ip = ipOf(req);
      if ((await attempts("login:" + email, 900000)) >= 8 || (await attempts("loginip:" + ip, 900000)) >= 40) {
        return json({ error: "Too many attempts. Please wait a few minutes, then try again." }, 429);
      }
      const { data: a } = await db.from("tandem_accounts").select("id, email, name, pw_hash, pw_salt, pw_iter, profile").eq("email", email).maybeSingle();
      const fallbackSalt = b64(new Uint8Array(16));
      const got = await derive(pw, a ? a.pw_salt : fallbackSalt, a ? a.pw_iter : PW_ITER);
      if (!a || !sameText(got, a.pw_hash)) {
        await note("login:" + email);
        await note("loginip:" + ip);
        return json({ error: "That email address and password do not match." }, 401);
      }
      await db.from("tandem_attempts").delete().eq("k", "login:" + email);
      await db.from("tandem_attempts").delete().lt("at", new Date(Date.now() - 86400000).toISOString());
      await db.from("tandem_sessions").delete().lt("expires_at", new Date().toISOString());
      const token = await startSession(a.id, req);
      return json({ token, account: session(a), profile: a.profile || {} });
    }

    if (req.method === "POST" && path === "/auth/logout") {
      const a = await authAccount(req);
      if (a) await db.from("tandem_sessions").delete().eq("id", a.sid);
      return json({ ok: true });
    }

    if (req.method === "POST" && path === "/account/sync") {
      const a = await authAccount(req);
      if (!a) return json({ error: "Please sign in again." }, 401);
      const body = await readJson(req, 400000);
      const merged = mergeProfile(a.profile, body.profile);
      if (JSON.stringify(merged).length > 250000) return json({ error: "The account has too much saved data." }, 413);
      if (body.profile) {
        const { error } = await db.from("tandem_accounts").update({ profile: merged, updated_at: new Date().toISOString() }).eq("id", a.id);
        if (error) throw error;
      }
      return json({ account: session(a), profile: merged });
    }

    if (req.method === "POST" && path === "/account/update") {
      const a = await authAccount(req);
      if (!a) return json({ error: "Please sign in again." }, 401);
      const body = await readJson(req);
      const name = safeName(body.name);
      if (!name) return json({ error: "Please enter your name." }, 400);
      await db.from("tandem_accounts").update({ name, updated_at: new Date().toISOString() }).eq("id", a.id);
      return json({ account: { email: a.email, name } });
    }

    if (req.method === "POST" && path === "/auth/password") {
      const a = await authAccount(req);
      if (!a) return json({ error: "Please sign in again." }, 401);
      const body = await readJson(req);
      const ip = ipOf(req);
      if ((await attempts("login:" + a.email, 900000)) >= 8) return json({ error: "Too many attempts. Please wait a few minutes, then try again." }, 429);
      const { data: row } = await db.from("tandem_accounts").select("pw_hash, pw_salt, pw_iter").eq("id", a.id).single();
      if (!row || !sameText(await derive(String(body.current ?? "").slice(0, 200), row.pw_salt, row.pw_iter), row.pw_hash)) {
        await note("login:" + a.email);
        await note("loginip:" + ip);
        return json({ error: "The current password is not correct." }, 401);
      }
      const next = String(body.next ?? "");
      const bad = passwordProblem(next, a.email);
      if (bad) return json({ error: bad }, 400);
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      await db.from("tandem_accounts").update({ pw_salt: salt, pw_iter: PW_ITER, pw_hash: await derive(next, salt, PW_ITER), updated_at: new Date().toISOString() }).eq("id", a.id);
      await db.from("tandem_sessions").delete().eq("account", a.id).neq("id", a.sid);
      return json({ ok: true });
    }

    if (req.method === "POST" && path === "/auth/delete") {
      const a = await authAccount(req);
      if (!a) return json({ error: "Please sign in again." }, 401);
      const body = await readJson(req);
      const { data: row } = await db.from("tandem_accounts").select("pw_hash, pw_salt, pw_iter").eq("id", a.id).single();
      if (!row || !sameText(await derive(String(body.password ?? "").slice(0, 200), row.pw_salt, row.pw_iter), row.pw_hash)) {
        return json({ error: "The password is not correct." }, 401);
      }
      await db.from("tandem_accounts").delete().eq("id", a.id);
      return json({ ok: true });
    }

    if (req.method === "POST" && path === "/auth/reset/request") {
      const body = await readJson(req);
      const email = clean(body.email, 254).toLowerCase();
      const ip = ipOf(req);
      if (!EMAIL_RE.test(email)) return json({ error: "Please enter a valid email address." }, 400);
      if ((await attempts("reset:" + email, 3600000)) >= 3 || (await attempts("resetip:" + ip, 3600000)) >= 10) {
        return json({ error: "A reset email was requested a few times already. Please wait an hour, then try again." }, 429);
      }
      await note("reset:" + email);
      await note("resetip:" + ip);
      const { data: a } = await db.from("tandem_accounts").select("id, name").eq("email", email).maybeSingle();
      if (a && RESEND_KEY) {
        const token = rand(40, ALPHA_KEY);
        await db.from("tandem_resets").delete().eq("account", a.id);
        await db.from("tandem_resets").insert({ token_hash: await sha256(token), account: a.id, expires_at: new Date(Date.now() + 3600000).toISOString() });
        const m = resetMail(a.name, SITE + "#reset=" + token);
        await sendMail(email, "Reset your Tandem password", m.text, m.html);
      }
      // The answer is the same whether or not an account exists, so this cannot be used to find out who has one.
      return json({ ok: true, mail: !!RESEND_KEY });
    }

    if (req.method === "POST" && path === "/auth/reset/confirm") {
      const body = await readJson(req);
      const token = String(body.token ?? "");
      if (token.length < 30 || token.length > 80) return json({ error: "This reset link is not valid or has expired." }, 400);
      const ip = ipOf(req);
      if ((await attempts("resetconf:" + ip, 900000)) >= 20) return json({ error: "Too many attempts. Please wait a few minutes, then try again." }, 429);
      const th = await sha256(token);
      const { data: r } = await db.from("tandem_resets").select("account, expires_at").eq("token_hash", th).maybeSingle();
      if (!r || new Date(r.expires_at).getTime() < Date.now()) {
        await note("resetconf:" + ip);
        return json({ error: "This reset link is not valid or has expired. Please ask for a new one." }, 400);
      }
      const { data: a } = await db.from("tandem_accounts").select("id, email, name, profile").eq("id", r.account).single();
      const pw = String(body.password ?? "");
      const bad = passwordProblem(pw, a.email);
      if (bad) return json({ error: bad }, 400);
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      await db.from("tandem_accounts").update({ pw_salt: salt, pw_iter: PW_ITER, pw_hash: await derive(pw, salt, PW_ITER), updated_at: new Date().toISOString() }).eq("id", a.id);
      await db.from("tandem_resets").delete().eq("account", a.id);
      await db.from("tandem_sessions").delete().eq("account", a.id);
      const t = await startSession(a.id, req);
      return json({ token: t, account: session(a), profile: a.profile || {} });
    }

    // ---------- ticket files that belong to an account ----------
    if (req.method === "POST" && path === "/file/put") {
      const a = await authAccount(req);
      if (!a) return json({ error: "Please sign in to keep a ticket file." }, 401);
      const body = await readJson(req, MAX_FILE_B64 + 4000);
      const data = String(body.data ?? "");
      if (!data || data.length > MAX_FILE_B64 || !/^[A-Za-z0-9+/=]+$/.test(data)) return json({ error: "That file is too large to keep. The limit is about 1.5 megabytes." }, 413);
      const { count } = await db.from("tandem_files").select("id", { count: "exact", head: true }).eq("account", a.id);
      if ((count ?? 0) >= MAX_FILES) return json({ error: "You have reached the limit of " + MAX_FILES + " saved ticket files. Delete one first." }, 400);
      const type = /^[\w.+-]+\/[\w.+-]+$/.test(String(body.type ?? "")) ? String(body.type).slice(0, 80) : "application/octet-stream";
      const id = rand(20, ALPHA_ID);
      const { error } = await db.from("tandem_files").insert({ id, account: a.id, name: clean(body.name, 120) || "Ticket", type, size: Math.floor(data.length * 0.75), data });
      if (error) throw error;
      return json({ id });
    }

    if (req.method === "POST" && path === "/file/get") {
      const a = await authAccount(req);
      if (!a) return json({ error: "Please sign in to open a ticket file." }, 401);
      const body = await readJson(req);
      const { data } = await db.from("tandem_files").select("name, type, data").eq("account", a.id).eq("id", clean(body.id, 40)).maybeSingle();
      if (!data) return json({ error: "That file is no longer available." }, 404);
      return json(data);
    }

    if (req.method === "POST" && path === "/file/delete") {
      const a = await authAccount(req);
      if (!a) return json({ error: "Please sign in again." }, 401);
      const body = await readJson(req);
      await db.from("tandem_files").delete().eq("account", a.id).eq("id", clean(body.id, 40));
      return json({ ok: true });
    }

    const m = path.match(/^\/feed\/([a-z0-9]+)\/([A-Za-z0-9]+)\.ics$/);
    if (req.method === "GET" && m) {
      const { data: room } = await db.from("tandem_rooms").select("id, feed_token").eq("id", m[1]).maybeSingle();
      if (!room || room.feed_token !== m[2]) return new Response("Not found", { status: 404, headers: CORS });
      const { data: rows } = await db.from("tandem_items").select("kind, id, data").eq("room", room.id).eq("deleted", false).limit(6000);
      const members: Record<string, string> = {};
      let name = "Tandem";
      const events: { id: string; data: any }[] = [];
      for (const r of rows ?? []) {
        if (r.kind === "member") members[r.id] = clean(r.data?.name, 40) || "Someone";
        else if (r.kind === "meta" && r.id === "room") name = clean(r.data?.name, 60) || name;
        else if (r.kind === "event") events.push({ id: r.id, data: r.data });
      }
      return new Response(buildFeed(name, members, events), {
        headers: { ...CORS, "content-type": "text/calendar; charset=utf-8", "cache-control": "no-cache" },
      });
    }

    return json({ error: "Not found." }, 404);
  } catch (e) {
    console.error(String(e));
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
