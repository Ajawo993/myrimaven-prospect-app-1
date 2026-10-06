/* Joan's fit criteria. The rating counts which are met; it is not a prediction. */
export const CRIT = [
  { k: "adults", label: "Serves adults", hint: "Not a K–12 school", deal: true },
  { k: "problem", label: "Evidence of a career alignment problem", hint: "Retention, program switching, reskilling, transitions", deal: true },
  { k: "size", label: "Larger organization", hint: "Roughly 200+ staff or learners" },
  { k: "hiring", label: "Active hiring or workforce change", hint: "Job postings, restructuring, new programs" },
  { k: "decider", label: "Decision-maker reachable", hint: "Someone who can approve a purchase", auto: "contacts" },
  { k: "vendors", label: "Open to outside tools", hint: "Not in-house only", deal: true },
  { k: "buying", label: "Manageable buying process", hint: "No heavy bureaucracy or long timelines" },
  { k: "warm", label: "Warm connection", hint: "You know someone there, or have a referral", auto: "contacts" },
];

export const RANK = { Strong: 0, Moderate: 1, Weak: 2 };

/* "yyn?..." -> {adults:"yes", problem:"yes", size:"no", hiring:"unknown", ...} in CRIT order */
export function decodeFit(code) {
  return Object.fromEntries(CRIT.map((c, i) => [c.k, ({ y: "yes", n: "no" })[code && code[i]] || "unknown"]));
}

export function fitOf(p) {
  const v = Object.assign(decodeFit(""), (p && p.fit) || {});
  const auto = {};
  const cs = (p && p.contacts) || [];
  if (cs.some((c) => c.authority === "Decision-maker")) { v.decider = "yes"; auto.decider = true; }
  if (cs.some((c) => c.connection === "Warm" || c.connection === "Referral")) { v.warm = "yes"; auto.warm = true; }
  const yes = CRIT.filter((c) => v[c.k] === "yes");
  const no = CRIT.filter((c) => v[c.k] === "no");
  const unk = CRIT.filter((c) => v[c.k] === "unknown");
  const deal = no.filter((c) => c.deal);
  const rating = deal.length ? "Weak" : yes.length >= 5 ? "Strong" : yes.length >= 3 ? "Moderate" : "Weak";
  return { v, auto, yes, no, unk, deal, rating };
}

export function fitSort(a, b) {
  const fa = fitOf(a), fb = fitOf(b);
  return RANK[fa.rating] - RANK[fb.rating] || fb.yes.length - fa.yes.length || fa.no.length - fb.no.length;
}
