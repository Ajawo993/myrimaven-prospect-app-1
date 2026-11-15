/* Server-only helpers for the API routes in app/api.
   Keys come from Vercel environment variables and never reach the browser. */

import { createClient } from "@supabase/supabase-js";
import { cleanEnv, checkSupabaseEnv } from "./supabase";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* Once sign-in is set up, the AI and job-posting routes only answer signed-in people,
   so strangers can't use up the API credit. Before that, they stay open. */
export async function requireUser(request) {
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const key = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!checkSupabaseEnv(url, key).ok) return null;
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sign in to use this feature");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data || !data.user) throw new HttpError(401, "Sign in to use this feature");
  return { ...data.user, token };
}

/* ---------- per-user daily limits ---------- */

/* Most requests one person can make in 24 hours. Change in Vercel with LIMIT_AI_PER_DAY / LIMIT_JOBS_PER_DAY. */
const DAILY = {
  ai: () => Number(process.env.LIMIT_AI_PER_DAY) || 40,
  jobs: () => Number(process.env.LIMIT_JOBS_PER_DAY) || 100,
};

/* Rule enforced in code, not in the prompt: refuse once this person has used today's allowance.
   Counts their rows in public.api_usage (supabase/usage_limits.sql), acting as them so RLS applies,
   then records this request. If the table isn't set up yet, it logs a warning and lets the request through. */
export async function useQuota(user, kind) {
  if (!user || !user.token) return; // sign-in not set up: no accounts to count
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const key = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const sb = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${user.token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const limit = DAILY[kind]();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error } = await sb.from("api_usage").select("id", { count: "exact", head: true }).eq("kind", kind).gte("created_at", since);
  if (error) {
    console.warn(`[quota] couldn't check ${kind} usage for user ${user.id}, allowing the request: ${error.message}`);
    return;
  }
  if ((count || 0) >= limit) {
    console.warn(`[quota] user ${user.id} reached the ${kind} limit (${count}/${limit} in 24h)`);
    const e = new HttpError(429, `Daily limit reached: ${limit} ${kind === "ai" ? "AI requests" : "job-posting checks"} per 24 hours`);
    e.code = "daily_limit";
    throw e;
  }
  const ins = await sb.from("api_usage").insert({ kind });
  if (ins.error) console.warn(`[quota] couldn't record ${kind} usage for user ${user.id}: ${ins.error.message}`);
}

/* ---------- breaking things on purpose ---------- */

/* SIMULATE_FAILURE in Vercel ("jobs", "ai" or "jobs,ai") makes that outside service fail on purpose,
   so the failure path can be tested and shown without touching the real keys. Remove it afterwards. */
function simulated(kind) {
  return String(process.env.SIMULATE_FAILURE || "").toLowerCase().split(/[\s,]+/).includes(kind);
}

/* Which AI service answers: OpenRouter if its key is set, otherwise Anthropic.
   OpenRouter defaults to its free-model router, so it can run at no cost. */
export function aiProvider() {
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

/* Send one prompt and get the text answer back.
   timeMs is the most this may take in total, retries included, so the route
   still has time to answer before Vercel's 60-second limit. */
export async function askAI(prompt, maxTokens = 2000, timeMs = 45000) {
  const provider = aiProvider();
  if (provider && simulated("ai")) {
    const e = new HttpError(502, `${provider} returned 500`);
    e.detail = "Simulated outage: SIMULATE_FAILURE includes \"ai\"";
    throw e;
  }
  if (provider === "openrouter") return askOpenRouter(prompt, maxTokens, timeMs);
  if (provider === "anthropic") return askAnthropic(prompt, maxTokens);
  throw new HttpError(501, "AI is not configured");
}

async function askAnthropic(prompt, maxTokens) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) {
    const e = new HttpError(r.status === 429 ? 429 : 502, "Anthropic API returned " + r.status);
    e.detail = (await r.text().catch(() => "")).slice(0, 400);
    throw e;
  }
  const j = await r.json();
  return (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
}

/* OpenRouter (https://openrouter.ai): one key, many models.
   OPENROUTER_MODEL picks one, e.g. "meta-llama/llama-3.3-70b-instruct:free";
   the default "openrouter/free" picks any free model that can do the job. */
async function askOpenRouter(prompt, maxTokens, timeMs) {
  const deadline = Date.now() + timeMs;
  const model = cleanEnv(process.env.OPENROUTER_MODEL) || "openrouter/free";
  const site = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const headers = {
    authorization: `Bearer ${cleanEnv(process.env.OPENROUTER_API_KEY)}`,
    "content-type": "application/json",
    "x-openrouter-title": "Prospect Desk",
  };
  if (site) headers["http-referer"] = site;
  for (let attempt = 0; attempt < 2; attempt++) {
    const left = deadline - Date.now();
    if (attempt > 0 && left < 15000) break; // not enough time for a second try
    let r;
    try {
      r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers,
        /* free models can be slow; stop before Vercel's 60-second limit */
        signal: AbortSignal.timeout(Math.max(left, 1000)),
        body: JSON.stringify({ model, max_tokens: maxTokens * 2, messages: [{ role: "user", content: prompt }] }),
      });
    } catch {
      throw new HttpError(504, "The AI took too long to answer");
    }
    if (r.status === 429) throw new HttpError(429, "OpenRouter rate limit");
    if (r.status === 401 || r.status === 403) throw new HttpError(502, "OpenRouter rejected the API key");
    if (r.status === 402) throw new HttpError(502, "OpenRouter needs credit for this model");
    if (!r.ok) {
      const e = new HttpError(502, "OpenRouter returned " + r.status);
      e.detail = (await r.text().catch(() => "")).slice(0, 400);
      throw e;
    }
    const j = await r.json();
    const msg = j && j.choices && j.choices[0] && j.choices[0].message;
    /* some free models think out loud first; keep only the answer */
    const text = String((msg && msg.content) || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (text) return text;
    /* an empty answer usually means the free model was busy: try once more */
  }
  throw new HttpError(502, "The AI sent back an empty answer");
}

const PEOPLE_ROLES = /(retention|engagement|learning|training|talent|development|career|people|human resources|\bhr\b|recruit|onboard|instructor|educator)/i;
const clean = (s) => String(s || "").replace(/<[^>]+>/g, "").trim();

/* Recent job postings for one employer from Adzuna (https://developer.adzuna.com).
   Returns null when the keys aren't set. Matches by employer name. */
export async function jobPostings(company, where, timeMs = 15000) {
  const id = process.env.ADZUNA_APP_ID;
  const key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) return null;
  if (simulated("jobs")) {
    const e = new HttpError(502, "Adzuna returned 503");
    e.detail = "Simulated outage: SIMULATE_FAILURE includes \"jobs\"";
    throw e;
  }
  const country = process.env.ADZUNA_COUNTRY || "ca";
  const u = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
  u.searchParams.set("app_id", id);
  u.searchParams.set("app_key", key);
  u.searchParams.set("results_per_page", "20");
  u.searchParams.set("company", company);
  u.searchParams.set("max_days_old", "60");
  if (where) u.searchParams.set("where", where);
  let r;
  try {
    r = await fetch(u, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeMs) });
  } catch (err) {
    const e = new HttpError(504, "Adzuna didn't answer in time");
    e.detail = String(err && err.message || err);
    throw e;
  }
  /* the request URL holds the key, so only the status and the reply body are logged, never the URL */
  if (!r.ok) {
    const e = new HttpError(502, "Adzuna returned " + r.status);
    e.detail = (await r.text().catch(() => "")).slice(0, 400);
    throw e;
  }
  const j = await r.json();
  const results = (j.results || []).map((x) => ({
    title: clean(x.title),
    company: clean(x.company && x.company.display_name),
    location: clean(x.location && x.location.display_name),
    url: x.redirect_url || "",
    created: String(x.created || "").slice(0, 10),
  }));
  return {
    count: typeof j.count === "number" ? j.count : results.length,
    peopleRoles: results.filter((x) => PEOPLE_ROLES.test(x.title)).length,
    sample: results.slice(0, 6),
    searched: { company, where: where || "", days: 60, country },
    checkedAt: new Date().toISOString().slice(0, 10),
  };
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/* Log the full error on the server (Vercel → project → Logs), send a short one to the browser */
export function errorResponse(e, where = "api") {
  const status = e && e.status ? e.status : 500;
  const message = (e && e.message) || "Something went wrong";
  if (status >= 500) console.error(`[${where}] ${status} ${message}${e && e.detail ? " | " + e.detail : ""}`, e && !e.status ? e : "");
  else if (status !== 401) console.warn(`[${where}] ${status} ${message}`);
  return Response.json({ error: message, code: (e && e.code) || undefined }, { status });
}
