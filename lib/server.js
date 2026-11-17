/* Server-only helpers for the API routes in app/api.
   Keys come from Vercel environment variables and never reach the browser. */

import { createClient } from "@supabase/supabase-js";
import { cleanEnv, checkSupabaseEnv } from "./supabase";
import { researchPrompt, RESEARCH_TOOLS, finderPrompt, FINDER_TOOLS, normAnalysis } from "./prompts";
import { fitOf, RANK } from "./fit";

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
/* "Alberta Health Services Inc." -> "alberta health services": lower case, no punctuation or company suffixes */
const SUFFIX = /\b(inc|incorporated|ltd|limited|llc|llp|corp|corporation|co|company|the)\b/g;
function normName(s) {
  return String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
}
/* Does a posting's employer name belong to the organization we searched for? */
function sameEmployer(searched, employer) {
  const a = normName(searched), b = normName(employer);
  if (!a || !b) return false;
  if (a === b || b.includes(a)) return true; // "alberta health services" in "alberta health services edmonton zone"
  const words = a.split(" ").filter((w) => w.length > 2);
  return words.length > 0 && words.every((w) => b.split(" ").includes(w));
}

/* Recent postings by one employer. Adzuna's own "company" filter only accepts Adzuna's exact internal
   employer name (anything else is a 400 error), so this searches for ads that mention the name and then
   keeps only the ones whose employer actually matches it. */
export async function jobPostings(company, where, timeMs = 15000) {
  /* cleanEnv drops stray spaces or quote marks pasted along with the keys */
  const id = cleanEnv(process.env.ADZUNA_APP_ID);
  const key = cleanEnv(process.env.ADZUNA_APP_KEY);
  if (!id || !key) return null;
  if (simulated("jobs")) {
    const e = new HttpError(502, "Adzuna returned 503");
    e.detail = "Simulated outage: SIMULATE_FAILURE includes \"jobs\"";
    throw e;
  }
  const country = cleanEnv(process.env.ADZUNA_COUNTRY) || "ca";
  const u = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
  u.searchParams.set("app_id", id);
  u.searchParams.set("app_key", key);
  u.searchParams.set("results_per_page", "50");
  u.searchParams.set("what_phrase", company);
  u.searchParams.set("max_days_old", "60");
  u.searchParams.set("content-type", "application/json");
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
  let j;
  try {
    j = await r.json();
  } catch {
    const e = new HttpError(502, "Adzuna sent back something that wasn't JSON");
    e.detail = `status ${r.status}`;
    throw e;
  }
  const all = (j.results || []).map((x) => ({
    title: clean(x.title),
    company: clean(x.company && x.company.display_name),
    location: clean(x.location && x.location.display_name),
    url: x.redirect_url || "",
    created: String(x.created || "").slice(0, 10),
  }));
  /* ads that only mention the name (a recruiter, a partner) don't count as this employer's postings */
  const results = all.filter((x) => sameEmployer(company, x.company));
  return {
    count: results.length,
    more: all.length >= 50 && results.length >= 40, // the first page was nearly all theirs: likely more than 50
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


/* ---------- agents: Claude works in steps with tools ---------- */

const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n || 400);

/* One agent run: call Claude with tools until it calls `submitName`, at most `turns` times and within
   `timeMs`. Web searches run on Anthropic's side; any other tool goes to `onTool`, which runs it here.
   Every search and tool call is recorded in `steps`, and every page the searches returned in `seen`.
   On the last turn, or with under 15 seconds left, Claude is made to submit what it has. */
async function agentLoop({ label, prompt, tools, submitName, onTool, steps, seen, turns, timeMs }) {
  const deadline = Date.now() + timeMs;
  const messages = [{ role: "user", content: prompt }];
  for (let turn = 0; turn < turns; turn++) {
    const left = deadline - Date.now();
    const mustSubmit = turn === turns - 1 || left < 15000;
    const body = { model: MODEL, max_tokens: 4000, tools, messages };
    if (mustSubmit) body.tool_choice = { type: "tool", name: submitName };
    let r;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": cleanEnv(process.env.ANTHROPIC_API_KEY), "anthropic-version": "2023-06-01", "content-type": "application/json" },
        signal: AbortSignal.timeout(Math.max(left, 5000)),
        body: JSON.stringify(body),
      });
    } catch {
      const e = new HttpError(504, "The search took too long");
      e.detail = `${label} stopped after ${steps.length} steps`;
      throw e;
    }
    if (!r.ok) {
      const e = new HttpError(r.status === 429 ? 429 : 502, "Anthropic API returned " + r.status);
      e.detail = (await r.text().catch(() => "")).slice(0, 400);
      throw e;
    }
    const j = await r.json();
    const content = j.content || [];
    const results = [];
    let submitted = null;
    for (const b of content) {
      if (b.type === "server_tool_use" && b.name === "web_search") {
        steps.push({ kind: "search", query: str(b.input && b.input.query, 200) });
      } else if (b.type === "web_search_tool_result") {
        if (Array.isArray(b.content)) {
          b.content.forEach((x) => { if (x && x.url) seen.set(x.url, str(x.title, 200)); });
        } else if (b.content && b.content.error_code) {
          steps.push({ kind: "note", text: "A web search failed: " + b.content.error_code });
          console.warn(`[${label}] web search error: ${b.content.error_code}`);
        }
      } else if (b.type === "tool_use" && b.name === submitName) {
        submitted = b.input || {};
      } else if (b.type === "tool_use") {
        const out = onTool ? await onTool(b, deadline) : { content: "Unknown tool.", is_error: true };
        results.push({ type: "tool_result", tool_use_id: b.id, ...out });
      }
    }
    if (submitted) return submitted;
    messages.push({ role: "assistant", content });
    if (j.stop_reason === "pause_turn") continue; // Anthropic paused its own search loop: resume it
    if (results.length) messages.push({ role: "user", content: results });
    else messages.push({ role: "user", content: `Now call ${submitName} with what you found.` });
  }
  const e = new HttpError(502, "The search ended without findings");
  e.detail = `${label}: ${steps.length} steps, ${seen.size} pages found`;
  throw e;
}

function needsClaude() {
  if (aiProvider() !== "anthropic") {
    const e = new HttpError(501, "This needs the Claude API (ANTHROPIC_API_KEY)");
    e.code = "needs_claude";
    throw e;
  }
  if (simulated("ai")) {
    const e = new HttpError(502, "anthropic returned 500");
    e.detail = "Simulated outage: SIMULATE_FAILURE includes \"ai\"";
    throw e;
  }
}

const webSearch = (maxUses) => ({ type: "web_search_20250305", name: "web_search", max_uses: maxUses, user_location: { type: "approximate", country: "CA", region: "Alberta" } });

/* Keep evidence only if its link is a page the searches returned (or the job check). */
function checkedEvidence(list, seen, jobsChecked) {
  const kept = [];
  let dropped = 0;
  for (const e of Array.isArray(list) ? list : []) {
    const text = str(e && e.text);
    const url = str(e && e.url, 600);
    if (!text) continue;
    if (url === "adzuna" && jobsChecked) kept.push({ text, source: "Job postings (Adzuna)" });
    else if (seen.has(url)) kept.push({ text, source: url });
    else dropped++;
  }
  return { kept, dropped };
}

/* ---------- research agent: one organization, in depth ---------- */

/* Rules enforced in code, not the prompt: at most 5 model calls and 4 web searches within timeMs;
   evidence kept only if its link is a page the searches returned; fit answers only yes/no/unknown.
   Returns the findings plus every step, so the user sees the work before anything is saved. */
export async function runResearch({ name, website, region, known }, timeMs = 50000) {
  needsClaude();
  const steps = [];
  const seen = new Map();
  let jobs = null;
  const onTool = async (b, deadline) => {
    if (b.name !== "check_job_postings") return { content: "Unknown tool.", is_error: true };
    const employer = str(b.input && b.input.employer, 120) || name;
    const where = str(b.input && b.input.region, 80) || region || "";
    try {
      if (jobs) throw new Error("Job postings were already checked in this run.");
      const res = await jobPostings(employer, where, Math.min(10000, Math.max(deadline - Date.now() - 12000, 2000)));
      if (!res) throw new Error("Job postings aren't connected in this app.");
      jobs = res;
      steps.push({ kind: "jobs", employer, count: res.count, more: !!res.more, peopleRoles: res.peopleRoles });
      return { content: `${res.count}${res.more ? "+" : ""} postings by ${employer} in the last 60 days; ${res.peopleRoles} are HR, training or talent roles. Recent titles: ${res.sample.map((x) => x.title).join("; ") || "none"}.` };
    } catch (err) {
      steps.push({ kind: "note", text: "Job postings couldn't be checked: " + (err.message || "error") });
      if (err.status) console.error(`[api/research] job check failed: ${err.message}${err.detail ? " | " + err.detail : ""}`);
      return { content: "Job postings couldn't be checked: " + (err.message || "error") + ". Continue without them.", is_error: true };
    }
  };
  const submitted = await agentLoop({
    label: "api/research", prompt: researchPrompt(name, website, region, known),
    tools: [webSearch(4), ...RESEARCH_TOOLS], submitName: "submit_research",
    onTool, steps, seen, turns: 5, timeMs,
  });
  const { kept, dropped } = checkedEvidence(submitted.evidence, seen, !!jobs);
  if (dropped) console.warn(`[api/research] dropped ${dropped} evidence item(s) whose link wasn't in the search results`);
  const site = str(submitted.website, 300);
  return {
    analysis: { ...normAnalysis(submitted), evidence: kept.slice(0, 8), website: /^https?:\/\//.test(site) ? site : "" },
    steps,
    sources: [...seen].slice(0, 20).map(([url, title]) => ({ url, title })),
    jobs,
    dropped,
  };
}

/* ---------- finder agent: real organizations that match a description ---------- */

/* Rules enforced in code: at most 4 model calls and 5 web searches; an organization is only shown if
   at least one piece of its evidence links to a page the searches returned (so it's real and checkable);
   organizations the user already has are skipped; job postings are checked by the server, not the model;
   the fit rating comes from lib/fit.js, never from the model. */
export async function runFinder({ query, region, skip }, timeMs = 52000) {
  needsClaude();
  const started = Date.now();
  const steps = [];
  const seen = new Map();
  const skipNames = new Set((skip || []).map(normName).filter(Boolean));
  const submitted = await agentLoop({
    label: "api/find", prompt: finderPrompt(query, region, skip),
    tools: [webSearch(5), ...FINDER_TOOLS], submitName: "submit_candidates",
    steps, seen, turns: 4, timeMs: Math.max(timeMs - 10000, 15000), // leaves time for the job checks
  });
  let unconfirmed = 0, duplicates = 0;
  const picked = new Set();
  const candidates = [];
  for (const c of Array.isArray(submitted.candidates) ? submitted.candidates : []) {
    const name = str(c && c.name, 160);
    const key = normName(name);
    if (!name || !key) continue;
    if (skipNames.has(key) || picked.has(key)) { duplicates++; continue; }
    const { kept } = checkedEvidence(c.evidence, seen, false);
    if (!kept.length) { unconfirmed++; continue; }
    picked.add(key);
    const a = normAnalysis({ ...c, evidence: [] });
    const site = str(c.website, 300);
    candidates.push({
      name, website: /^https?:\/\//.test(site) ? site : "", region: str(c.region, 80) || region || "",
      sector: a.sector, size: a.size, summary: str(c.why, 500),
      analysis: { ...a, summary: str(c.why, 500), evidence: kept.slice(0, 6) },
      jobs: null,
    });
    if (candidates.length >= 6) break;
  }
  if (unconfirmed) console.warn(`[api/find] left out ${unconfirmed} organization(s) with no evidence from the search results`);

  /* job postings for each, in parallel, with the time that's left (at most 8 seconds) */
  const left = timeMs - (Date.now() - started);
  if (left > 3000) {
    const counts = await Promise.allSettled(candidates.map((c) => jobPostings(c.name, c.region, Math.min(left - 1000, 8000))));
    counts.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) {
        candidates[i].jobs = r.value;
        if (r.value.count >= 5 && candidates[i].analysis.fit.hiring === "unknown") {
          candidates[i].analysis.fit.hiring = "yes";
          candidates[i].analysis.fitWhy.hiring = `${r.value.count}${r.value.more ? "+" : ""} postings on Adzuna in the last 60 days.`;
        }
      }
    });
    const failed = counts.find((r) => r.status === "rejected");
    if (failed) console.error(`[api/find] job-posting checks skipped: ${failed.reason && failed.reason.message}`);
  }

  /* rank by the app's own fit rules */
  candidates.forEach((c) => { const f = fitOf({ fit: c.analysis.fit }); c.rating = f.rating; c.yes = f.yes.length; });
  candidates.sort((a, b) => RANK[a.rating] - RANK[b.rating] || b.yes - a.yes);
  return { candidates, steps, pages: seen.size, unconfirmed, duplicates };
}
