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
  "Access-Control-Allow-Headers": "content-type, x-tandem-key",
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

async function readJson(req: Request): Promise<Record<string, any>> {
  const t = await req.text();
  if (t.length > 300000) throw new Error("Request too large");
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
