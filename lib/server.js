/* Server-only helpers for the API routes in app/api.
   Keys come from Vercel environment variables and never reach the browser. */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function askClaude(prompt, maxTokens = 2000) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(501, "AI is not configured");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new HttpError(r.status === 429 ? 429 : 502, "Anthropic API returned " + r.status);
  const j = await r.json();
  return (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
}

const PEOPLE_ROLES = /(retention|engagement|learning|training|talent|development|career|people|human resources|\bhr\b|recruit|onboard|instructor|educator)/i;
const clean = (s) => String(s || "").replace(/<[^>]+>/g, "").trim();

/* Recent job postings for one employer from Adzuna (https://developer.adzuna.com).
   Returns null when the keys aren't set. Matches by employer name. */
export async function jobPostings(company, where) {
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
  const r = await fetch(u, { headers: { accept: "application/json" } });
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
