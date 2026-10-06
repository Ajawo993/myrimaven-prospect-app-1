/* AI prompts and response clean-up, used by the API routes in app/api. */

export const CONTEXT = `Myrimaven is an early-stage company that offers a personality-based career exploration sandbox for adults. Joan, its founder, is looking for ORGANIZATIONS that might pay for it. A good prospect has a "career alignment problem": employee retention, reskilling needs, career transitions, students or staff switching out of programs or roles, or workforce pipeline problems. Myrimaven has no paying organizational customer yet, so the ideal customer is still being discovered.
What Joan has learned so far: about 30 cold emails to K-12 schools got no replies, and she is focused on organizations that serve adults. She believes larger organizations would use the tool better, but small ones are easier to reach. Some contacts lacked purchasing authority. Real rejections: a post-secondary stakeholder cited bureaucracy, budget and long decision timelines; a recruiter didn't use personality types in their process; one person only uses tools developed in-house. Career coaches are not a current target.
Joan wants to understand WHY an organization might be a prospect, not a score.`;

export const FIT_KEYS = ["adults", "problem", "size", "hiring", "vendors", "buying"];

export function analysis(name, website, notes) {
  return `${CONTEXT}

Assess this organization for Joan.
Organization: ${name}
Website: ${website || "(not given)"}
What Joan knows or has found (job postings, news, conversation notes, job-board data; may be empty):
"""
${String(notes || "").slice(0, 8000)}
"""

Rules:
- Do not give a score and do not tell Joan whether to contact them. Give her the reasoning so she can decide.
- Keep evidence honest. For each evidence item, set "source" to "Joan's notes" when it comes from the text above, "Job postings" when it comes from job-board data above, or "General knowledge, verify" when it comes from your own background knowledge. Never invent specific numbers, dates or quotes.
- If you know little about this organization, say so in the summary and lean on unknowns.
- Unknowns are questions Joan must answer before investing outreach time (budget, who decides, whether the problem is real).
- Roles are job titles (not names) most likely to own the problem or the budget.
- For "fit", judge each criterion as "yes", "no" or "unknown", with a short reason. Use "unknown" unless the evidence supports yes or no.
adults: the organization serves or employs adults (not a K-12 school)
problem: there is evidence of a career alignment problem
size: a larger organization, roughly 200+ staff or learners
hiring: active hiring or workforce change (growth, restructuring, new programs)
vendors: open to buying outside tools (not in-house only)
buying: a manageable buying process (no heavy bureaucracy or very long timelines)

Reply with only JSON in this shape:
{"summary":"1-2 sentences","sector":"short sector label","size":"short size label or empty","problems":[{"title":"Employee retention | Reskilling | Career transitions | Workforce pipeline | other short label","detail":"one sentence"}],"evidence":[{"text":"one sentence","source":"Joan's notes | Job postings | General knowledge, verify"}],"unknowns":["question"],"roles":["job title"],"fitConcerns":["reason it might not be a fit"],"fit":{"adults":{"value":"yes","why":"..."},"problem":{"value":"unknown","why":"..."},"size":{"value":"yes","why":"..."},"hiring":{"value":"unknown","why":"..."},"vendors":{"value":"unknown","why":"..."},"buying":{"value":"unknown","why":"..."}}}`;
}

export function suggest(query, region) {
  return `${CONTEXT}

Joan is looking for: ${String(query || "organizations with a career alignment problem").slice(0, 1000)}
Region: ${String(region || "any").slice(0, 200)}

Suggest up to 6 candidates. Prefer adult-focused, larger organizations. Avoid K-12 schools and career coaches unless Joan asks for them. Only name a specific organization if you are confident it exists; otherwise describe a type of organization (kind "type") she could search for. Never invent facts about a named organization; give reasons as things to check.

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
