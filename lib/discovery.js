/* Server-only: the weekly discovery agent.

   Once a week, with nobody clicking anything, it runs the finder agent (lib/server.js runFinder) on two
   search themes, keeps only organizations whose evidence links to a page its web searches really returned,
   skips any already on Discover, and adds the rest to Discover as real organizations ("Found by agent").
   It never touches anyone's Prospects: a person still decides what to save.

   Started by Vercel Cron every day (vercel.json); it only does the work when the last successful run
   is 7 or more days old, so a failed week is retried the next day by itself.
   Needs ANTHROPIC_API_KEY (Claude with web search), SUPABASE_SECRET_KEY and CRON_SECRET. */

import { runFinder, HttpError } from "./server";
import { CRIT } from "./fit";

/* What to look for, rotating week by week so the list grows in different directions */
export const THEMES = [
  "Employers announcing layoffs, restructuring or redeployment of staff into new roles",
  "Employers with high staff turnover or that just launched a retention or internal mobility program",
  "Organizations launching reskilling, upskilling or apprenticeship programs for adult workers",
  "Post-secondary continuing education divisions and adult learning programs for career changers",
  "Healthcare and continuing-care employers struggling to fill or keep frontline roles",
  "Energy, utilities and industrial employers moving workers into new kinds of work",
  "Non-profits and agencies running career transition or employment programs for adults",
  "Financial services and retail employers moving staff into new advisory or digital roles",
];

export const MAX_AGENT_ORGS = () => Number(process.env.DISCOVERY_MAX) || 60; // oldest agent finds go first after this
export const MIN_DAYS_BETWEEN = 6.5;
const REGION = () => String(process.env.DISCOVERY_REGION || "Alberta, Canada").trim();

export function weekNumber(d = new Date()) {
  return Math.floor(d.getTime() / (7 * 24 * 3600 * 1000));
}

export function themesFor(d = new Date()) {
  const w = weekNumber(d);
  return [THEMES[(w * 2) % THEMES.length], THEMES[(w * 2 + 1) % THEMES.length]];
}

export const normName = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/\b(inc|incorporated|ltd|limited|llc|llp|corp|corporation|co|company|the)\b\.?/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const slug = (s) => normName(s).replace(/ /g, "-").slice(0, 50);

/* Which of the app's four signals a finding points to, from the agent's own words */
const SIGNAL_WORDS = {
  retention: /retention|turnover|retain|attrition|leav(e|ing)/i,
  reskilling: /reskill|upskill|retrain|training|apprentice|automation/i,
  transitions: /transition|layoff|restructur|redeploy|career change|changer/i,
  pipeline: /pipeline|shortage|hard.to.fill|recruit|vacanc/i,
};

export function signalsOf(c) {
  const text = [c.summary, ...(c.analysis.problems || []).map((p) => `${p.title} ${p.detail}`)].join(" ");
  return Object.keys(SIGNAL_WORDS).filter((k) => SIGNAL_WORDS[k].test(text));
}

export const fitCode = (fit) => CRIT.map((c) => ({ yes: "y", no: "n" })[fit && fit[c.k]] || "?").join("");

/* A finder candidate -> an organizations row */
export function toRow(c, now = new Date()) {
  const a = c.analysis || {};
  return {
    key: "ag-" + slug(c.name),
    name: c.name,
    sector: c.sector || a.sector || "",
    size: c.size || a.size || "",
    region: c.region || "",
    summary: c.summary || "",
    website: c.website || "",
    hiring: c.jobs ? `${c.jobs.count}${c.jobs.more ? "+" : ""} postings on Adzuna in the last 60 days` : "Not checked",
    signals: signalsOf(c),
    fit_code: fitCode(a.fit),
    outside_focus: false,
    assessment: {
      summary: c.summary || "",
      problems: a.problems || [],
      evidence: a.evidence || [],
      unknowns: a.unknowns || [],
      roles: a.roles || [],
      fitConcerns: a.fitConcerns || [],
      fitWhy: a.fitWhy || {},
    },
    source: "agent",
    found_at: now.toISOString(),
  };
}

/* Should today's cron do the weekly run? Only if the last good run is at least MIN_DAYS_BETWEEN days old. */
export async function lastGoodRun(db) {
  const { data, error } = await db.from("discovery_runs").select("ran_at").eq("status", "ok").order("ran_at", { ascending: false }).limit(1);
  if (error) throw Object.assign(new HttpError(500, "Run supabase/discovery.sql in Supabase first"), { detail: error.message });
  return data && data[0] ? new Date(data[0].ran_at) : null;
}

export function isDue(last, now = new Date()) {
  return !last || now - last >= MIN_DAYS_BETWEEN * 24 * 3600 * 1000;
}

/* The weekly run. `find` is runFinder, swappable for tests. */
export async function runDiscovery(db, { now = new Date(), find = runFinder, timeMs = 46000 } = {}) {
  const started = Date.now();
  const themes = themesFor(now);
  const region = REGION();

  const { data: orgs, error } = await db.from("organizations").select("key, name, source, found_at");
  if (error) throw Object.assign(new HttpError(500, "Couldn't read organizations"), { detail: error.message });
  const known = new Set((orgs || []).map((o) => normName(o.name)));
  const keys = new Set((orgs || []).map((o) => o.key));
  // the agent is told about real organizations already on Discover (the fictional samples don't matter to it)
  const skip = (orgs || []).filter((o) => o.source === "agent").sort((a, b) => String(b.found_at).localeCompare(String(a.found_at))).map((o) => o.name);

  /* two searches side by side; one failing doesn't stop the other */
  const results = await Promise.allSettled(themes.map((query) => find({ query, region, skip }, timeMs)));
  const errors = results.filter((r) => r.status === "rejected").map((r) => r.reason);
  if (errors.length === results.length) {
    const e = errors[0];
    await logRun(db, { themes, region, status: "failed", added: 0, skipped: 0, note: `${e.message}${e.detail ? " | " + e.detail : ""}`.slice(0, 500), ms: Date.now() - started });
    throw e;
  }

  const rows = [];
  let skipped = 0, unconfirmed = 0, searches = 0;
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    unconfirmed += r.value.unconfirmed || 0;
    skipped += r.value.duplicates || 0;
    searches += (r.value.steps || []).filter((s) => s.kind === "search").length;
    for (const c of r.value.candidates || []) {
      const row = toRow(c, now);
      if (known.has(normName(c.name)) || keys.has(row.key) || !(row.assessment.evidence || []).length) { skipped++; continue; }
      known.add(normName(c.name));
      keys.add(row.key);
      rows.push(row);
    }
  }

  if (rows.length) {
    const ins = await db.from("organizations").insert(rows);
    if (ins.error) {
      await logRun(db, { themes, region, status: "failed", added: 0, skipped, note: "insert failed: " + ins.error.message, ms: Date.now() - started });
      throw Object.assign(new HttpError(500, "Couldn't add organizations"), { detail: ins.error.message });
    }
  }
  const removed = await trimOld(db);
  const note = [
    errors.length ? `one search failed: ${errors[0].message}` : "",
    unconfirmed ? `${unconfirmed} left out for missing evidence` : "",
    removed ? `${removed} oldest removed to stay under ${MAX_AGENT_ORGS()}` : "",
  ].filter(Boolean).join("; ");
  await logRun(db, { themes, region, status: "ok", added: rows.length, skipped, note, ms: Date.now() - started });
  return { added: rows.map((r) => r.name), skipped, unconfirmed, searches, removed, themes, failedSearches: errors.length };
}

/* Keep Discover from growing forever: past the cap, the oldest agent finds go (saved prospects keep their copy) */
async function trimOld(db) {
  const { data } = await db.from("organizations").select("key, found_at").eq("source", "agent").order("found_at", { ascending: false });
  const extra = (data || []).slice(MAX_AGENT_ORGS()).map((o) => o.key);
  if (!extra.length) return 0;
  await db.from("organizations").delete().in("key", extra);
  return extra.length;
}

async function logRun(db, r) {
  const { error } = await db.from("discovery_runs").insert({
    theme: r.themes.join(" | ").slice(0, 500), region: r.region, status: r.status, added: r.added, skipped: r.skipped, note: r.note || null, duration_ms: r.ms,
  });
  if (error) console.error(`[cron/discover] couldn't log the run: ${error.message}`);
}
