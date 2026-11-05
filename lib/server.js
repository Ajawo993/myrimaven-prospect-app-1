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
  return data.user;
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
  if (!r.ok) throw new HttpError(r.status === 429 ? 429 : 502, "Anthropic API returned " + r.status);
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
    "x-openrouter-title": "Myrimaven Prospect Desk",
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
    if (!r.ok) throw new HttpError(502, "OpenRouter returned " + r.status);
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
  const country = process.env.ADZUNA_COUNTRY || "ca";
  const u = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
  u.searchParams.set("app_id", id);
  u.searchParams.set("app_key", key);
  u.searchParams.set("results_per_page", "20");
  u.searchParams.set("company", company);
  u.searchParams.set("max_days_old", "60");
  if (where) u.searchParams.set("where", where);
  const r = await fetch(u, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeMs) });
  if (!r.ok) throw new HttpError(502, "Adzuna returned " + r.status);
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

export function errorResponse(e) {
  const status = e && e.status ? e.status : 500;
  return Response.json({ error: (e && e.message) || "Something went wrong" }, { status });
}
