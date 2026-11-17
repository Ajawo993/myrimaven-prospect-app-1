/* AI prompts and response clean-up, used by the API routes in app/api. */

export const CONTEXT = `The client is an early-stage company that offers a personality-based career exploration sandbox for adults. Its founder is looking for ORGANIZATIONS that might pay for it. A good prospect has a "career alignment problem": employee retention, reskilling needs, career transitions, students or staff switching out of programs or roles, or workforce pipeline problems. The client has no paying organizational customer yet, so the ideal customer is still being discovered.
What the client has learned so far: about 30 cold emails to K-12 schools got no replies, and they are focused on organizations that serve adults. They believe larger organizations would use the tool better, but small ones are easier to reach. Some contacts lacked purchasing authority. Real rejections: a post-secondary stakeholder cited bureaucracy, budget and long decision timelines; a recruiter didn't use personality types in their process; one person only uses tools developed in-house. Career coaches are not a current target.
The client wants to understand WHY an organization might be a prospect, not a score.`;

export const FIT_KEYS = ["adults", "problem", "size", "hiring", "vendors", "buying"];

export function analysis(name, website, notes) {
  return `${CONTEXT}

Assess this organization for the client.
Organization: ${name}
Website: ${website || "(not given)"}
What the client knows or has found (job postings, news, conversation notes, job-board data; may be empty):
"""
${String(notes || "").slice(0, 8000)}
"""

Rules:
- Do not give a score and do not tell the client whether to contact them. Give them the reasoning so they can decide.
- Keep evidence honest. For each evidence item, set "source" to "Your notes" when it comes from the text above, "Job postings" when it comes from job-board data above, or "General knowledge, verify" when it comes from your own background knowledge. Never invent specific numbers, dates or quotes.
- If you know little about this organization, say so in the summary and lean on unknowns.
- Unknowns are questions the client must answer before investing outreach time (budget, who decides, whether the problem is real).
- Roles are job titles (not names) most likely to own the problem or the budget.
- For "fit", judge each criterion as "yes", "no" or "unknown", with a short reason. Use "unknown" unless the evidence supports yes or no.
adults: the organization serves or employs adults (not a K-12 school)
problem: there is evidence of a career alignment problem
size: a larger organization, roughly 200+ staff or learners
hiring: active hiring or workforce change (growth, restructuring, new programs)
vendors: open to buying outside tools (not in-house only)
buying: a manageable buying process (no heavy bureaucracy or very long timelines)

Reply with only JSON in this shape:
{"summary":"1-2 sentences","sector":"short sector label","size":"short size label or empty","problems":[{"title":"Employee retention | Reskilling | Career transitions | Workforce pipeline | other short label","detail":"one sentence"}],"evidence":[{"text":"one sentence","source":"Your notes | Job postings | General knowledge, verify"}],"unknowns":["question"],"roles":["job title"],"fitConcerns":["reason it might not be a fit"],"fit":{"adults":{"value":"yes","why":"..."},"problem":{"value":"unknown","why":"..."},"size":{"value":"yes","why":"..."},"hiring":{"value":"unknown","why":"..."},"vendors":{"value":"unknown","why":"..."},"buying":{"value":"unknown","why":"..."}}}`;
}

export function suggest(query, region) {
  return `${CONTEXT}

The client is looking for: ${String(query || "organizations with a career alignment problem").slice(0, 1000)}
Region: ${String(region || "any").slice(0, 200)}

Suggest up to 6 candidates. Prefer adult-focused, larger organizations. Avoid K-12 schools and career coaches unless the client asks for them. Only name a specific organization if you are confident it exists; otherwise describe a type of organization (kind "type") the client could search for. Never invent facts about a named organization; give reasons as things to check.

Reply with only a JSON array:
[{"name":"organization name or organization type","kind":"organization | type","sector":"short label","region":"where","signals":["retention | reskilling | transitions | pipeline"],"rationale":"one sentence on why it might have the problem","verify":"one concrete way Joan can check the signal"}]`;
}

export function parseJSON(text) {
  const t = String(text || "").trim();
  const tries = [t];
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1]);
  const a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  for (const s of tries) { try { return JSON.parse(s); } catch (_) {} }
  return null;
}

const str = (v, n) => String(v == null ? "" : v).slice(0, n || 400);
const strArr = v => Array.isArray(v) ? v.map(x => typeof x === "string" ? x : (x && (x.text || x.title)) || "").filter(Boolean).map(x => str(x)).slice(0, 8) : [];
const fitVal = v => { const s = String(v || "").toLowerCase(); return s === "yes" || s === "no" ? s : "unknown"; };

export function normAnalysis(r) {
  r = r && typeof r === "object" ? r : {};
  const fit = {}, fitWhy = {};
  const f = r.fit && typeof r.fit === "object" ? r.fit : {};
  FIT_KEYS.forEach(k => {
    const e = f[k];
    fit[k] = fitVal(e && typeof e === "object" ? e.value : e);
    if (e && typeof e === "object" && e.why) fitWhy[k] = str(e.why, 300);
  });
  return {
    summary: str(r.summary, 600), sector: str(r.sector, 80), size: str(r.size, 80),
    problems: (Array.isArray(r.problems) ? r.problems : []).map(p => typeof p === "string" ? { title: str(p, 80), detail: "" } : { title: str(p && p.title, 80), detail: str(p && p.detail) }).filter(p => p.title).slice(0, 5),
    evidence: (Array.isArray(r.evidence) ? r.evidence : []).map(e => typeof e === "string" ? { text: str(e), source: "AI" } : { text: str(e && e.text), source: str((e && e.source) || "AI", 80) }).filter(e => e.text).slice(0, 8),
    unknowns: strArr(r.unknowns), roles: strArr(r.roles), fitConcerns: strArr(r.fitConcerns), fit, fitWhy
  };
}

const SIGNAL_KEYS = ["retention", "reskilling", "transitions", "pipeline"];
export function normSuggest(r) {
  return (Array.isArray(r) ? r : []).filter(x => x && x.name).slice(0, 6).map(x => ({
    name: str(x.name, 160), kind: x.kind === "type" ? "type" : "organization", sector: str(x.sector, 80), region: str(x.region, 80),
    signals: strArr(x.signals).filter(s => SIGNAL_KEYS.includes(s)), rationale: str(x.rationale), verify: str(x.verify)
  }));
}

/* ---------- research agent (Research with AI on a prospect's page) ---------- */

export function researchPrompt(name, website, region, known) {
  return `${CONTEXT}

You are researching one organization for the client, in several steps, using your tools:
- web_search: find the organization's own website and recent, specific facts: news about growth, layoffs, restructuring, retention, training or reskilling programs, partnerships, and who leads HR, training or talent.
- check_job_postings: call it once, with the employer's name as people would write it, to see its recent job postings.
- submit_research: call it once at the end with your findings. Your work only counts if you call it.

Organization: ${name}
Website: ${website || "(not given: find it)"}
Region: ${region || "(not given)"}
What the client already knows (don't repeat it as new evidence; use it to decide what to look for):
"""
${String(known || "").slice(0, 6000)}
"""

Rules:
- Make sure you have the right organization. If several share the name, use the region and website to pick one, and say which in the summary.
- Every evidence item must come from a page your web_search returned: give that page's exact URL. For job-posting facts use the url "adzuna". Never cite a page you didn't get from a search, and never invent numbers, dates, names or quotes.
- Prefer facts from the last two years, and say when something is older.
- Answer each fit question "yes", "no" or "unknown" with a short reason. Use "unknown" unless what you found supports yes or no.
- Unknowns are questions the client still has to answer before reaching out. Roles are job titles, not people's names.
- Do not tell the client whether to contact them. Give the reasoning.
${FIT_KEYS.map((k) => "  " + k).join("\n")} are the fit questions, defined as:
adults: the organization serves or employs adults (not a K-12 school)
problem: there is evidence of a career alignment problem
size: a larger organization, roughly 200+ staff or learners
hiring: active hiring or workforce change (growth, restructuring, new programs)
vendors: open to buying outside tools (not in-house only)
buying: a manageable buying process (no heavy bureaucracy or very long timelines)`;
}

const FIT_ANSWER = {
  type: "object",
  properties: { value: { type: "string", enum: ["yes", "no", "unknown"] }, why: { type: "string" } },
  required: ["value", "why"],
};

/* The tools the research agent can use besides web search. Their inputs come from the model,
   so the server checks everything it gets back (runResearch in lib/server.js). */
export const RESEARCH_TOOLS = [
  {
    name: "check_job_postings",
    description: "Count this employer's job postings in Canada from the last 60 days, and how many are HR, training or talent roles. Call it once.",
    input_schema: {
      type: "object",
      properties: {
        employer: { type: "string", description: "The employer's name as people would write it" },
        region: { type: "string", description: "City or province, or empty" },
      },
      required: ["employer"],
    },
  },
  {
    name: "submit_research",
    description: "Submit your findings. Call this once, at the end.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "1-2 sentences: who they are and why they might or might not be a prospect" },
        website: { type: "string", description: "The organization's official website, if found" },
        sector: { type: "string" },
        size: { type: "string" },
        evidence: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            properties: { text: { type: "string", description: "One sentence" }, url: { type: "string", description: "Exact URL from your search results, or \"adzuna\"" } },
            required: ["text", "url"],
          },
        },
        problems: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } }, required: ["title"] } },
        unknowns: { type: "array", items: { type: "string" } },
        roles: { type: "array", items: { type: "string" } },
        fitConcerns: { type: "array", items: { type: "string" } },
        fit: { type: "object", properties: Object.fromEntries(FIT_KEYS.map((k) => [k, FIT_ANSWER])) },
      },
      required: ["summary", "evidence", "fit"],
    },
  },
];

/* ---------- finder agent (Suggest organizations, when the app uses Claude) ---------- */

export function finderPrompt(query, region, skip) {
  const already = (skip || []).slice(0, 80).join("; ");
  return `${CONTEXT}

Find real, specific organizations that match what the client is looking for, using web_search. Then call submit_candidates once.

Looking for: ${String(query || "organizations with a career alignment problem").slice(0, 500)}
Region: ${String(region || "anywhere in Canada").slice(0, 120)}
${already ? `Skip these, the client already has them: ${already}` : ""}

How to work:
- Search for recent, specific signals: news about hiring growth, layoffs or restructuring, retention or turnover problems, new training or reskilling programs, and careers pages. Search for signals, not for lists of companies.
- Only include an organization if a page from your searches shows it exists and says something relevant about it. Give that page's exact URL as evidence. Never cite a page you didn't get from a search, and never invent numbers, dates or names.
- Skip K-12 schools and career coaches. Prefer organizations with roughly 200+ staff or learners.
- Up to 6 organizations. Fewer, well-evidenced ones are better than many weak ones.
- For each fit question answer "yes", "no" or "unknown" with a short reason; use "unknown" unless a page supports yes or no.`;
}

export const FINDER_TOOLS = [
  {
    name: "submit_candidates",
    description: "Submit the organizations you found. Call this once, at the end.",
    input_schema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "The organization's real name" },
              website: { type: "string" },
              region: { type: "string" },
              sector: { type: "string" },
              size: { type: "string" },
              why: { type: "string", description: "1-2 sentences: why it might have a career alignment problem" },
              evidence: {
                type: "array",
                maxItems: 4,
                items: {
                  type: "object",
                  properties: { text: { type: "string" }, url: { type: "string", description: "Exact URL from your search results" } },
                  required: ["text", "url"],
                },
              },
              problems: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } }, required: ["title"] } },
              unknowns: { type: "array", items: { type: "string" } },
              roles: { type: "array", items: { type: "string" } },
              fit: { type: "object", properties: Object.fromEntries(FIT_KEYS.map((k) => [k, FIT_ANSWER])) },
            },
            required: ["name", "why", "evidence", "fit"],
          },
        },
      },
      required: ["candidates"],
    },
  },
];
