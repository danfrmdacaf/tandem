// Tandem reminders. A second small edge function: it stores the browsers that asked for reminders and, once a
// minute, tells each of them about events that are about to start. The browser never receives a database
// credential. The key used to sign push messages lives only in the database, which only this server can read.
import { createClient } from "npm:@supabase/supabase-js@2";
import { C } from "./calendar.mjs";
import { sendPush } from "./webpush.mjs";
import { findDue, message } from "./due.mjs";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-tick-secret",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const clean = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function readJson(req: Request): Promise<Record<string, any>> {
  const t = await req.text();
  if (t.length > 60000) throw new Error("Request too large");
  return t ? JSON.parse(t) : {};
}

// Only the push services of the big browsers are accepted, so this server cannot be pointed at other addresses.
function hostOk(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    const h = u.hostname;
    return u.protocol === "https:" && endpoint.length <= 800 && (h === "fcm.googleapis.com" || h === "web.push.apple.com" || h.endsWith(".push.apple.com") ||
      h.endsWith(".push.services.mozilla.com") || h === "updates.push.services.mozilla.com" || h.endsWith(".notify.windows.com"));
  } catch (_e) { return false; }
}

let cfgCache: { at: number; v: Record<string, string> } | null = null;
async function config(): Promise<Record<string, string>> {
  if (cfgCache && Date.now() - cfgCache.at < 60000) return cfgCache.v;
  const { data } = await db.from("tandem_config").select("key, value");
  const v: Record<string, string> = {};
  for (const r of data ?? []) v[r.key] = r.value;
  cfgCache = { at: Date.now(), v };
  return v;
}
async function vapid() {
  const c = await config();
  return { publicKey: c.vapid_public, privateJwk: JSON.parse(c.vapid_private), subject: "https://danfrmdacaf.github.io/tandem/" };
}

async function authKey(raw: string) {
  const dot = raw.indexOf(".");
  if (dot < 3) return null;
  const id = raw.slice(0, dot), secret = raw.slice(dot + 1);
  if (!/^[a-z0-9]{6,32}$/.test(id) || secret.length < 16 || secret.length > 64) return null;
  const { data } = await db.from("tandem_rooms").select("id, secret_hash").eq("id", id).maybeSingle();
  if (!data || (await sha256(secret)) !== data.secret_hash) return null;
  return data;
}

function cleanRules(list: unknown) {
  if (!Array.isArray(list)) return [];
  const out: any[] = [];
  for (const r of list.slice(0, 200)) {
    if (!r || typeof r !== "object" || r.gone || (r.mode !== "hide" && r.mode !== "optional")) continue;
    if (JSON.stringify(r).length > 500) continue;
    out.push(r);
  }
  return out;
}

async function deliver(sub: any, payload: Record<string, unknown>, opts = {}) {
  const res = await sendPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload, await vapid(), opts);
  if (res.status === 404 || res.status === 410) await db.from("tandem_push").delete().eq("id", sub.id);
  return res;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const segs = new URL(req.url).pathname.split("/").filter(Boolean);
    const path = "/" + segs.slice(segs.indexOf("tandem-push") + 1).join("/");

    if (req.method === "GET" && path === "/health") {
      const c = await config();
      return json({ ok: !!c.vapid_public && !!c.vapid_private });
    }

    if (req.method === "POST" && path === "/subscribe") {
      const body = await readJson(req);
      const s = body.sub || {};
      const endpoint = clean(s.endpoint, 800), p256dh = clean(s.keys?.p256dh, 200), auth = clean(s.keys?.auth, 100);
      if (!hostOk(endpoint) || p256dh.length < 80 || auth.length < 16) return json({ error: "That device cannot receive reminders." }, 400);
      let tz = clean(body.tz, 60);
      try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); } catch (_e) { tz = "Europe/London"; }
      const lead = Math.min(120, Math.max(1, Math.round(Number(body.lead) || 10)));
      const rooms: { id: string; me: string; h: string }[] = [];
      for (const r of (Array.isArray(body.rooms) ? body.rooms : []).slice(0, 20)) {
        const a = await authKey(String(r?.key ?? ""));
        if (a && !rooms.some((x) => x.id === a.id)) rooms.push({ id: a.id, me: clean(r.me, 64), h: a.secret_hash });
      }
      if (!rooms.length) return json({ error: "No calendar on this device could be checked." }, 400);
      const id = await sha256(endpoint);
      const { count } = await db.from("tandem_push").select("id", { count: "exact", head: true });
      const { data: ex } = await db.from("tandem_push").select("id").eq("id", id).maybeSingle();
      if (!ex && (count ?? 0) >= 3000) return json({ error: "Reminders are full at the moment. Please try again later." }, 429);
      const row = { id, endpoint, p256dh, auth, tz, lead, rooms, rules: cleanRules(body.rules), updated_at: new Date().toISOString() };
      const { error } = await db.from("tandem_push").upsert(row, { onConflict: "id" });
      if (error) throw error;
      if (body.welcome) {
        await deliver(row, { title: "Reminders are on", body: `Tandem will tell you ${lead} minutes before each event.`, tag: "welcome", url: "./" }, { ttl: 120 });
      }
      return json({ ok: true });
    }

    if (req.method === "POST" && path === "/unsubscribe") {
      const body = await readJson(req);
      await db.from("tandem_push").delete().eq("id", await sha256(clean(body.endpoint, 800)));
      return json({ ok: true });
    }

    if (req.method === "POST" && path === "/test") {
      const body = await readJson(req);
      const { data: sub } = await db.from("tandem_push").select("*").eq("id", await sha256(clean(body.endpoint, 800))).maybeSingle();
      if (!sub) return json({ error: "Reminders are not switched on for this device yet." }, 404);
      const r = await deliver(sub, { title: "Test reminder", body: "If you can read this, reminders work on this device.", tag: "test", url: "./" }, { ttl: 120 });
      return json({ ok: r.status < 300, status: r.status });
    }

    // Called once a minute by the database scheduler.
    if (req.method === "POST" && path === "/tick") {
      const cfg = await config();
      if (!cfg.tick_secret || req.headers.get("x-tick-secret") !== cfg.tick_secret) return json({ error: "Not allowed." }, 401);
      const nowMs = Date.now();
      const { data: subs } = await db.from("tandem_push").select("*").limit(3000);
      const list = subs ?? [];
      if (!list.length) return json({ subs: 0, sent: 0 });
      const roomIds = [...new Set(list.flatMap((s: any) => (s.rooms || []).map((r: any) => r.id)))];
      const { data: hashes } = await db.from("tandem_rooms").select("id, secret_hash").in("id", roomIds);
      const current = new Map((hashes ?? []).map((r: any) => [r.id, r.secret_hash]));
      const maxDate = new Date(nowMs + 2 * 86400000).toISOString().slice(0, 10);
      const events = new Map<string, any[]>();
      for (const id of roomIds) {
        if (!current.has(id)) continue;
        const { data } = await db.from("tandem_items").select("id, data").eq("room", id).eq("kind", "event").eq("deleted", false).lte("data->>date", maxDate).limit(3000);
        events.set(id, data ?? []);
      }
      const jobs: { sub: any; due: any }[] = [];
      for (const sub of list) {
        for (const r of sub.rooms || []) {
          // a calendar whose link was replaced no longer sends reminders to devices that held the old link
          if (current.get(r.id) !== r.h) continue;
          const due = findDue(C, { events: events.get(r.id) || [], nowMs, tz: sub.tz, lead: sub.lead, me: r.me, rules: sub.rules || [], roomId: r.id });
          for (const d of due) jobs.push({ sub, due: d });
        }
      }
      let sent = 0, failed = 0;
      for (let i = 0; i < jobs.length; i += 8) {
        await Promise.all(jobs.slice(i, i + 8).map(async ({ sub, due }) => {
          const { error } = await db.from("tandem_push_sent").insert({ sub: sub.id, k: due.key });
          if (error) return; // already sent
          const res = await deliver(sub, message(due), { ttl: 600 });
          if (res.status < 300) sent++;
          else {
            failed++;
            console.error("push failed", res.status, res.text);
            if (res.status !== 404 && res.status !== 410) await db.from("tandem_push_sent").delete().eq("sub", sub.id).eq("k", due.key);
          }
        }));
      }
      await db.from("tandem_push_sent").delete().lt("at", new Date(nowMs - 3 * 86400000).toISOString());
      return json({ subs: list.length, due: jobs.length, sent, failed });
    }

    return json({ error: "Not found." }, 404);
  } catch (e) {
    console.error(String(e));
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
