import { CATALOG } from "./catalog";
import { decodeFit } from "./fit";
import { uid, todayISO, fmtDate } from "./format";

/* Build a new prospect from an organization and its assessment */
export function newProspect(org, analysis, generatedBy) {
  const a = analysis || { problems: [], evidence: [], unknowns: [], roles: [], fitConcerns: [] };
  const fit = org.fit ? decodeFit(org.fit) : Object.assign(decodeFit(""), a.fit || {});
  return {
    id: uid(),
    name: org.name,
    sector: org.sector || a.sector || "",
    size: org.size || a.size || "",
    region: org.region || "",
    website: org.website || "",
    summary: org.summary || a.summary || "",
    signals: org.signals || [],
    catalogKey: org.key || "",
    example: false,
    fit,
    fitWhy: a.fitWhy || {},
    jobs: org.jobs || null,
    analysis: {
      problems: a.problems || [],
      evidence: (a.evidence || []).map((e) => ({ text: e.text, source: e.source, checked: !!e.checked })),
      unknowns: (a.unknowns || []).map((t) => ({ text: t, done: false })),
      roles: a.roles || [],
      fitConcerns: a.fitConcerns || [],
      generatedBy: generatedBy || "none",
      generatedAt: todayISO(),
    },
    contacts: [],
    outreach: [],
    status: "Needs Validation",
    fitNote: "",
    nextAction: "",
    followUpDate: "",
    notes: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/* Bring prospects saved by an earlier version up to date */
export function upgrade(p) {
  if (!p.fit) {
    const c = CATALOG.find((x) => x.key === p.catalogKey);
    p.fit = decodeFit(c ? c.fit : "");
  }
  p.fitWhy = p.fitWhy || {};
  p.contacts = p.contacts || [];
  p.outreach = p.outreach || [];
  p.contacts.forEach((c) => { if (!c.connection) c.connection = "Unknown"; });
  p.outreach.forEach((o) => { if (o.reason === "Prefers an internal solution") o.reason = "Only uses in-house tools"; });
  return p;
}

/* Three worked examples: a warm lead, a referral, and a Not a Fit */
export function buildExamples() {
  const by = (k) => CATALOG.find((c) => c.key === k);

  const a = newProspect(by("northgate"), by("northgate").analysis, "sample");
  a.example = true;
  a.status = "Follow-Up";
  const c1 = { id: uid(), name: "Priya Sandhu", role: "Director of Continuing Education", email: "priya.sandhu@example.org", phone: "", authority: "Decision-maker", connection: "Warm", notes: "Met through a former colleague." };
  a.contacts = [c1];
  a.outreach = [{ id: uid(), date: todayISO(-6), contactId: c1.id, connection: "Warm", channel: "Warm intro", outcome: "Interested", reason: "", learned: "Non-completion in two programs is her biggest worry. Budget for next year is set in April." }];
  a.analysis.evidence[0].checked = true;
  a.analysis.unknowns[0].done = true;
  a.nextAction = "Send a one-page pilot outline for one program";
  a.followUpDate = todayISO(4);

  const b = newProspect(by("prairiehealth"), by("prairiehealth").analysis, "sample");
  b.example = true;
  b.status = "Contacted";
  const c2 = { id: uid(), name: "Marcus Lee", role: "HR Generalist", email: "", phone: "", authority: "No purchasing authority", connection: "Warm", notes: "Friendly; offered an introduction." };
  const c3 = { id: uid(), name: "(name not yet known)", role: "VP People & Culture", email: "", phone: "", authority: "Decision-maker", connection: "Referral", notes: "Owns retention initiatives." };
  b.contacts = [c2, c3];
  b.outreach = [{ id: uid(), date: todayISO(-9), contactId: c2.id, connection: "Warm", channel: "Email", outcome: "Referred elsewhere", reason: "No purchasing authority", learned: "Retention projects sit with the VP People & Culture, not HR generalists." }];
  b.nextAction = "Ask Marcus for the introduction to the VP";
  b.followUpDate = todayISO(-1);

  const c = newProspect(by("bowline"), by("bowline").analysis, "sample");
  c.example = true;
  c.status = "Not a Fit";
  c.fit.vendors = "no";
  const c4 = { id: uid(), name: "Dana Kowalski", role: "HR Manager", email: "", phone: "", authority: "Influencer", connection: "Cold", notes: "" };
  c.contacts = [c4];
  c.outreach = [{ id: uid(), date: todayISO(-14), contactId: c4.id, connection: "Cold", channel: "LinkedIn", outcome: "Not interested", reason: "Only uses in-house tools", learned: "They're building an in-house training ladder with their union and aren't looking at outside tools this year." }];
  c.fitNote = "Building their own program. Smaller employers with hands-on training may not need an exploration tool.";

  return [a, b, c];
}

/* Job-posting data as text for the AI, and as an evidence item */
export function jobsText(j) {
  if (!j) return "";
  return `Job postings (Adzuna, last ${j.searched.days} days${j.searched.where ? ", " + j.searched.where : ""}): ${j.count} postings found; ${j.peopleRoles} of the ${Math.min(20, j.count)} most recent are HR, training or talent roles. Recent titles: ${j.sample.map((x) => x.title).join("; ") || "none"}.`;
}

export function jobsEvidence(j) {
  return {
    text: `${j.count} job postings in the last ${j.searched.days} days, ${j.peopleRoles} in HR, training or talent roles.`,
    source: `Adzuna job postings, ${fmtDate(j.checkedAt)}`,
    checked: true,
  };
}

export function guessSignals(a) {
  const t = (a.problems || []).map((p) => p.title.toLowerCase()).join(" ");
  const map = { retention: "retention", reskilling: "reskill", transitions: "transition", pipeline: "pipeline" };
  return Object.keys(map).filter((k) => t.includes(map[k]));
}
