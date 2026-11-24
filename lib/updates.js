/* Server-only: the daily update email and Google Calendar follow-ups.

   Both run without the person being there (Vercel's daily cron), so they read the database with
   the Supabase secret key instead of the person's sign-in. Every query below filters by user_id,
   and everything ends up only with that same person: their own inbox and their own calendar.
   Nothing here ever emails a prospect. Drafts in the update are for the person to edit and send.

   Keys (Vercel → Settings → Environment Variables, never in code):
     SUPABASE_SECRET_KEY    reads settings and prospects for the cron
     RESEND_API_KEY         sends the email
     CRON_SECRET            only Vercel's cron can start the daily run
     GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET   the Google Cloud OAuth client */

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cleanEnv } from "./supabase";
import { HttpError, askAI, requireUser } from "./server";

const DEFAULT_TZ = "America/Edmonton";
const FROM = () => cleanEnv(process.env.DIGEST_FROM) || "Prospect Desk <onboarding@resend.dev>";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- what's switched on ---------- */

export function updatesConfig() {
  const db = !!cleanEnv(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    email: db && !!cleanEnv(process.env.RESEND_API_KEY),
    calendar: db && !!cleanEnv(process.env.GOOGLE_CLIENT_ID) && !!cleanEnv(process.env.GOOGLE_CLIENT_SECRET),
    cron: !!cleanEnv(process.env.CRON_SECRET),
  };
}

/* The public address of the app, for links in emails and calendar events */
export function appUrl(request) {
  const set = cleanEnv(process.env.APP_URL).replace(/\/+$/, "");
  if (set) return set;
  const prod = cleanEnv(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (prod) return "https://" + prod;
  return request ? new URL(request.url).origin : "";
}

/* The routes the app calls need a signed-in person */
export async function signedIn(request) {
  const user = await requireUser(request);
  if (!user) throw new HttpError(501, "Sign-in isn't set up");
  return user;
}

/* ---------- database (secret key, server only) ---------- */

export function adminDb() {
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const key = cleanEnv(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) throw new HttpError(501, "SUPABASE_SECRET_KEY isn't set in Vercel");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export async function getSettings(db, userId) {
  const { data, error } = await db.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw dbError(error);
  return data || { user_id: userId, daily_email: false, time_zone: DEFAULT_TZ, calendar_synced: {} };
}

export async function saveSettings(db, userId, changes) {
  const { error } = await db.from("user_settings").upsert({ user_id: userId, ...changes, updated_at: new Date().toISOString() });
  if (error) throw dbError(error);
}

function dbError(error) {
  const e = new HttpError(500, /user_settings/.test(error.message || "") ? "Run supabase/updates.sql in Supabase first" : "Database error");
  e.detail = error.message;
  return e;
}

/* This person's prospects, with what the update needs. Contact emails and phone numbers aren't read. */
export async function prospectsFor(db, userId) {
  const { data, error } = await db
    .from("prospects")
    .select("id, name, region, status, next_action, follow_up_date, fit_note, updated_at, contacts(id, name, role), outreach(date, channel, outcome, contact_id, learned)")
    .eq("user_id", userId);
  if (error) throw dbError(error);
  return (data || []).map((r) => ({
    id: r.id,
    name: r.name,
    region: r.region || "",
    status: r.status,
    nextAction: r.next_action || "",
    followUpDate: r.follow_up_date || "",
    fitNote: r.fit_note || "",
    updatedAt: r.updated_at,
    contacts: r.contacts || [],
    outreach: (r.outreach || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))),
  }));
}

/* ---------- the daily update ---------- */

export function localDate(tz, when = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
  }
}

const addDays = (ymd, n) => {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);

/* Sort prospects into what needs attention. Rules, not AI, decide what goes in. */
export function buildDigest(prospects, today) {
  const active = prospects.filter((p) => p.status !== "Not a Fit");
  const byDate = (a, b) => a.followUpDate.localeCompare(b.followUpDate);
  const overdue = active.filter((p) => p.followUpDate && p.followUpDate < today).sort(byDate);
  const dueToday = active.filter((p) => p.followUpDate === today);
  const soon = active.filter((p) => p.followUpDate > today && p.followUpDate <= addDays(today, 7)).sort(byDate);
  const noDate = active.filter((p) => !p.followUpDate && ["Potential Fit", "Contacted", "Follow-Up"].includes(p.status)).slice(0, 5);
  const yesterday = Date.now() - 24 * 3600 * 1000;
  const changed = prospects.filter((p) => Date.parse(p.updatedAt) > yesterday).length;
  return { today, overdue, dueToday, soon, noDate, changed, total: prospects.length, empty: !overdue.length && !dueToday.length && !soon.length && !noDate.length };
}

function lastTouch(p) {
  const o = p.outreach[0];
  if (!o) return "no outreach logged yet";
  const c = p.contacts.find((x) => x.id === o.contact_id);
  return `${o.date}: ${o.channel || "contact"}${c ? ` with ${c.name}${c.role ? ` (${c.role})` : ""}` : ""}, ${o.outcome}${o.learned ? `. Learned: ${o.learned}` : ""}`;
}

/* Claude writes the summary and a first-draft message for each follow-up that's due.
   It only sees this person's own notes, and the result is checked before use. */
export function digestPrompt(d) {
  const due = [...d.overdue, ...d.dueToday].slice(0, 8);
  const lines = due.map((p) => [
    `id: ${p.id}`,
    `organization: ${p.name}${p.region ? ` (${p.region})` : ""}`,
    `status: ${p.status}`,
    `follow-up date: ${p.followUpDate}${p.followUpDate < d.today ? ` (${daysBetween(p.followUpDate, d.today)} days overdue)` : " (today)"}`,
    `planned next step: ${p.nextAction || "not written down"}`,
    `last contact: ${lastTouch(p)}`,
    p.contacts[0] ? `main contact: ${p.contacts[0].name}${p.contacts[0].role ? `, ${p.contacts[0].role}` : ""}` : "main contact: none saved",
  ].join("\n")).join("\n\n");
  return `You help a small business owner keep up with B2B prospects for a career-exploration program. Today is ${d.today}.

These follow-ups are due:

${lines}

${d.soon.length} more are due in the next 7 days and ${d.noDate.length} active prospects have no follow-up date.

Return only JSON, no other text:
{"summary": "two short sentences on what matters most today", "items": [{"id": "<id from above>", "why": "one line on why this one, from the notes", "draft": "a short follow-up message to the main contact, under 90 words, friendly and specific to the notes, no invented facts, ends with one clear question"}]}

Use only the facts above. If there's no contact, write the draft to "Hi there". The owner will edit and send these themselves.`;
}

export function parseDigest(text, d) {
  const s = String(text || "");
  const j = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
  const ids = new Set([...d.overdue, ...d.dueToday].map((p) => p.id));
  const items = (Array.isArray(j.items) ? j.items : [])
    .filter((x) => x && ids.has(String(x.id)))
    .map((x) => ({ id: String(x.id), why: String(x.why || "").slice(0, 300), draft: String(x.draft || "").slice(0, 900) }));
  return { summary: String(j.summary || "").slice(0, 500), items };
}

export async function writeDigest(d) {
  if (!d.overdue.length && !d.dueToday.length) return { summary: "", items: [], ai: false };
  try {
    const text = await askAI(digestPrompt(d), 1800, 25000);
    return { ...parseDigest(text, d), ai: true };
  } catch (e) {
    // Failure path: the update still goes out, just without the AI summary and drafts
    console.warn(`[updates] AI part of the daily update failed, sending without it: ${e.message}${e.detail ? " | " + e.detail : ""}`);
    return { summary: "", items: [], ai: false, aiFailed: true };
  }
}

const fmt = (ymd) => new Date(ymd + "T12:00:00Z").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function renderEmail(d, w, base) {
  const link = (p) => `${base}/prospects/${encodeURIComponent(p.id)}`;
  const drafts = new Map(w.items.map((x) => [x.id, x]));
  const due = [...d.overdue, ...d.dueToday];
  const subject = due.length
    ? `${due.length} follow-up${due.length === 1 ? "" : "s"} due today${d.overdue.length ? ` (${d.overdue.length} overdue)` : ""}`
    : d.soon.length ? `Nothing due today, ${d.soon.length} this week` : "Your Prospect Desk update";

  const S = { h: "font:600 15px/1.3 Arial,sans-serif;margin:24px 0 8px;color:#16222e", card: "border:1px solid #dde3ea;border-radius:8px;padding:12px 14px;margin:0 0 10px", m: "color:#5b6875;font-size:13px", a: "color:#1f6f8b" };
  const T = [];
  const H = [`<div style="font:14px/1.5 Arial,sans-serif;color:#16222e;max-width:620px">`, `<p style="${S.m}">Prospect Desk · ${esc(fmt(d.today))}</p>`];
  T.push(`Prospect Desk update for ${fmt(d.today)}`, "");

  if (w.summary) { H.push(`<p style="font-size:15px">${esc(w.summary)}</p>`); T.push(w.summary, ""); }
  if (w.aiFailed) { H.push(`<p style="${S.m}">The AI summary and drafts couldn't be written this time, so here's the plain list.</p>`); T.push("(The AI summary and drafts couldn't be written this time, so here's the plain list.)", ""); }

  if (due.length) {
    H.push(`<h2 style="${S.h}">Due now</h2>`);
    T.push("DUE NOW");
    for (const p of due) {
      const x = drafts.get(p.id);
      const when = p.followUpDate < d.today ? `${daysBetween(p.followUpDate, d.today)} days overdue` : "today";
      H.push(`<div style="${S.card}"><b><a style="${S.a}" href="${esc(link(p))}">${esc(p.name)}</a></b> <span style="${S.m}">· ${esc(p.status)} · ${esc(when)}</span>`);
      H.push(`<div>${esc(p.nextAction || "No next step written down")}</div>`);
      if (x && x.why) H.push(`<div style="${S.m};margin-top:4px">${esc(x.why)}</div>`);
      if (x && x.draft) H.push(`<div style="margin-top:8px;padding:8px 10px;background:#f3f6f8;border-radius:6px;white-space:pre-wrap">${esc(x.draft)}</div><div style="${S.m};font-size:12px">Draft only: edit it and send it yourself.</div>`);
      H.push(`</div>`);
      T.push(`- ${p.name} (${p.status}, ${when}): ${p.nextAction || "no next step written down"}`, `  ${link(p)}`);
      if (x && x.draft) T.push(`  Draft: ${x.draft.replace(/\n/g, "\n  ")}`);
    }
    T.push("");
  }
  if (d.soon.length) {
    H.push(`<h2 style="${S.h}">Coming up this week</h2><ul style="padding-left:18px;margin:0">`);
    T.push("COMING UP THIS WEEK");
    d.soon.forEach((p) => {
      H.push(`<li><a style="${S.a}" href="${esc(link(p))}">${esc(p.name)}</a> <span style="${S.m}">· ${esc(fmt(p.followUpDate))} · ${esc(p.nextAction || p.status)}</span></li>`);
      T.push(`- ${fmt(p.followUpDate)}: ${p.name} (${p.nextAction || p.status})`);
    });
    H.push(`</ul>`);
    T.push("");
  }
  if (d.noDate.length) {
    H.push(`<h2 style="${S.h}">Active but no follow-up date</h2><ul style="padding-left:18px;margin:0">`);
    T.push("ACTIVE BUT NO FOLLOW-UP DATE");
    d.noDate.forEach((p) => {
      H.push(`<li><a style="${S.a}" href="${esc(link(p))}">${esc(p.name)}</a> <span style="${S.m}">· ${esc(p.status)}</span></li>`);
      T.push(`- ${p.name} (${p.status})`);
    });
    H.push(`</ul>`);
    T.push("");
  }
  if (d.empty) { H.push(`<p>Nothing is due and every active prospect has a follow-up date. Nice.</p>`); T.push("Nothing is due and every active prospect has a follow-up date.", ""); }

  const foot = `${d.total} prospects${d.changed ? `, ${d.changed} changed in the last day` : ""}. Turn this email off in Prospect Desk → account menu → Updates & calendar.`;
  H.push(`<p style="${S.m};margin-top:24px;border-top:1px solid #dde3ea;padding-top:10px">${esc(foot)} <a style="${S.a}" href="${esc(base)}/settings">Settings</a></p></div>`);
  T.push(foot);
  return { subject, html: H.join("\n"), text: T.join("\n") };
}

export async function sendEmail({ to, subject, html, text }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${cleanEnv(process.env.RESEND_API_KEY)}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ from: FROM(), to: [to], subject, html, text }),
  }).catch(() => null);
  if (!r) throw new HttpError(504, "Resend didn't answer");
  if (r.ok) return (await r.json().catch(() => ({}))).id || "";
  const body = await r.text().catch(() => "");
  if (r.status === 403 && /own email|verify a domain|testing emails/i.test(body)) {
    const e = new HttpError(502, "Resend can only send to the email address on your Resend account until you verify a domain. Sign up to Resend with the same email you use for Prospect Desk.");
    e.code = "resend_owner_only";
    e.detail = body.slice(0, 300);
    throw e;
  }
  const e = new HttpError(502, "Resend returned " + r.status);
  e.detail = body.slice(0, 300);
  throw e;
}

/* One person's update, start to finish. force = send even if nothing is due ("Send me one now"). */
export async function runDigest(db, settings, { base, force = false } = {}) {
  const tz = settings.time_zone || DEFAULT_TZ;
  const today = localDate(tz);
  const prospects = await prospectsFor(db, settings.user_id);
  const d = buildDigest(prospects, today);
  if (d.empty && !force) return { sent: false, reason: "nothing due", today };
  const w = await writeDigest(d);
  const mail = renderEmail(d, w, base);
  const id = await sendEmail({ to: settings.email, ...mail });
  await saveSettings(db, settings.user_id, { last_digest_on: today });
  return { sent: true, id, today, subject: mail.subject, ai: w.ai, due: d.overdue.length + d.dueToday.length };
}

/* ---------- Google Calendar ---------- */

const SCOPES = "openid email https://www.googleapis.com/auth/calendar.events";
const secret = () => cleanEnv(process.env.GOOGLE_CLIENT_SECRET);
const b64url = (s) => Buffer.from(s).toString("base64url");

/* The "state" sent to Google and back: says which user started connecting, signed so it can't be forged, valid 15 minutes */
export function signState(userId, now = Date.now()) {
  const payload = b64url(JSON.stringify({ u: userId, e: now + 15 * 60 * 1000, n: crypto.randomBytes(8).toString("hex") }));
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return payload + "." + sig;
}

export function readState(state, now = Date.now()) {
  const [payload, sig] = String(state || "").split(".");
  if (!payload || !sig) return null;
  const want = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const j = JSON.parse(Buffer.from(payload, "base64url").toString());
    return j.e > now && j.u ? j.u : null;
  } catch {
    return null;
  }
}

export const redirectUri = (origin) => `${origin}/api/calendar/callback`;

export function googleAuthUrl(userId, origin) {
  const q = new URLSearchParams({
    client_id: cleanEnv(process.env.GOOGLE_CLIENT_ID),
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline", // gives a refresh token, so the daily run can update the calendar
    prompt: "consent",
    include_granted_scopes: "true",
    state: signState(userId),
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + q;
}

async function tokenCall(params) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ client_id: cleanEnv(process.env.GOOGLE_CLIENT_ID), client_secret: secret(), ...params }),
  }).catch(() => null);
  if (!r) throw new HttpError(504, "Google didn't answer");
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new HttpError(j.error === "invalid_grant" ? 401 : 502, j.error === "invalid_grant" ? "Google access expired. Connect Google Calendar again." : "Google returned " + r.status);
    e.code = j.error === "invalid_grant" ? "calendar_expired" : undefined;
    e.detail = JSON.stringify(j).slice(0, 300);
    throw e;
  }
  return j;
}

export async function exchangeCode(code, origin) {
  const j = await tokenCall({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  let email = "";
  try { email = JSON.parse(Buffer.from(String(j.id_token).split(".")[1], "base64url").toString()).email || ""; } catch { /* no email: fine */ }
  if (!j.refresh_token) {
    const e = new HttpError(502, "Google didn't give long-term access. Remove Prospect Desk at myaccount.google.com/permissions and connect again.");
    e.detail = "no refresh_token in token response";
    throw e;
  }
  return { refresh: j.refresh_token, access: j.access_token, email };
}

export const accessFrom = async (refresh) => (await tokenCall({ refresh_token: refresh, grant_type: "refresh_token" })).access_token;

/* Same prospect -> same event id every time, so a sync updates the event instead of making a copy.
   Google allows letters a-v and digits; hex fits. */
export const eventId = (userId, prospectId) => "pd" + crypto.createHash("sha1").update(userId + ":" + prospectId).digest("hex");

export function eventFor(p, base) {
  const url = `${base}/prospects/${encodeURIComponent(p.id)}`;
  return {
    summary: `Follow up: ${p.name}`,
    description: `${p.nextAction || "No next step written down."}\n\nStatus: ${p.status}\nOpen in Prospect Desk: ${url}`,
    start: { date: p.followUpDate },
    end: { date: addDays(p.followUpDate, 1) },
    transparency: "transparent", // an all-day reminder, not "busy"
    reminders: { useDefault: true },
    source: { title: "Prospect Desk", url },
    status: "confirmed",
  };
}

/* What a synced event looked like, to tell if it needs updating */
export const signature = (p) => p.followUpDate + "|" + crypto.createHash("sha1").update([p.name, p.nextAction, p.status].join("\n")).digest("hex").slice(0, 10);

/* Which events to add or change and which to remove, from the prospects and what was synced last time */
export function planSync(prospects, synced, force = false) {
  const want = new Map(prospects.filter((p) => p.followUpDate && p.status !== "Not a Fit").map((p) => [p.id, p]));
  const put = [...want.values()].filter((p) => force || synced[p.id] !== signature(p));
  const drop = Object.keys(synced).filter((id) => !want.has(id));
  return { put, drop, total: want.size };
}

async function gcal(method, url, token, body) {
  const r = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    signal: AbortSignal.timeout(10000),
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  if (!r) throw new HttpError(504, "Google Calendar didn't answer");
  return r;
}

async function calErr(r) {
  const e = new HttpError(r.status === 403 ? 403 : 502, r.status === 403 ? "Google Calendar refused (is the Calendar API enabled in Google Cloud?)" : "Google Calendar returned " + r.status);
  e.detail = (await r.text().catch(() => "")).slice(0, 300);
  return e;
}

export async function putEvent(token, id, body) {
  let r = await gcal("PUT", `${CAL}/${id}`, token, { ...body, id });
  if (r.status === 404) r = await gcal("POST", CAL, token, { ...body, id }); // first time: create it
  if (!r.ok) throw await calErr(r);
}

export async function dropEvent(token, id) {
  const r = await gcal("DELETE", `${CAL}/${id}`, token);
  if (!r.ok && r.status !== 404 && r.status !== 410) throw await calErr(r); // already gone is fine
}

/* Bring this person's calendar in line with their follow-up dates */
export async function syncCalendar(db, settings, { base, force = false, prospects } = {}) {
  if (!settings.google_refresh_token) return { connected: false };
  let token;
  try {
    token = await accessFrom(settings.google_refresh_token);
  } catch (e) {
    if (e.code === "calendar_expired") await saveSettings(db, settings.user_id, { google_refresh_token: null, calendar_error: e.message });
    throw e;
  }
  const list = prospects || (await prospectsFor(db, settings.user_id));
  const synced = { ...(settings.calendar_synced || {}) };
  const plan = planSync(list, synced, force);
  let done = 0;
  let failed = 0;
  let firstErr = null;
  for (const p of plan.put) {
    try {
      await putEvent(token, eventId(settings.user_id, p.id), eventFor(p, base));
      synced[p.id] = signature(p);
      done++;
    } catch (e) {
      failed++;
      firstErr = firstErr || e;
      console.warn(`[calendar] couldn't save the event for ${p.id}: ${e.message}${e.detail ? " | " + e.detail : ""}`);
    }
  }
  let removed = 0;
  for (const id of plan.drop) {
    try {
      await dropEvent(token, eventId(settings.user_id, id));
      delete synced[id];
      removed++;
    } catch (e) {
      failed++;
      firstErr = firstErr || e;
    }
  }
  await saveSettings(db, settings.user_id, { calendar_synced: synced, calendar_error: failed ? `${failed} event(s) couldn't be synced: ${firstErr.message}` : null });
  if (failed && !done && !removed) throw firstErr;
  return { connected: true, saved: done, removed, failed, total: plan.total };
}

/* Disconnect: take Prospect Desk's events off the calendar, then give the access back to Google */
export async function disconnectCalendar(db, settings) {
  const refresh = settings.google_refresh_token;
  if (refresh) {
    try {
      const token = await accessFrom(refresh);
      for (const id of Object.keys(settings.calendar_synced || {})) await dropEvent(token, eventId(settings.user_id, id)).catch(() => {});
    } catch { /* access already gone: nothing to remove */ }
    await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(refresh), { method: "POST", signal: AbortSignal.timeout(8000) }).catch(() => {});
  }
  await saveSettings(db, settings.user_id, { google_refresh_token: null, google_email: null, calendar_synced: {}, calendar_error: null });
}

/* What the settings page shows. Never includes the Google token. */
export function publicSettings(s) {
  return {
    dailyEmail: !!s.daily_email,
    email: s.email || "",
    timeZone: s.time_zone || DEFAULT_TZ,
    lastSent: s.last_digest_on || "",
    calendar: { connected: !!s.google_refresh_token, email: s.google_email || "", events: Object.keys(s.calendar_synced || {}).length, error: s.calendar_error || "" },
  };
}
