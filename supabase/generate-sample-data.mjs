/* Generates the synthetic data for Myrimaven Prospect Desk.

   Run with:  node supabase/generate-sample-data.mjs

   It writes three files:
     lib/catalog-more.js     45 more fictional organizations for Discover (the app's offline copy)
     supabase/seed.sql       all 60 organizations, for the organizations table
     supabase/sample_data.sql  the starter workspace every new account gets: 40 prospects with
                               contacts, outreach, evidence and open questions

   Everything is invented. Names of organizations and people are fictional, emails use the
   reserved .example domain, and phone numbers use the reserved 555-01xx range. A fixed random
   seed means running it again produces exactly the same data. */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CORE_ORGANIZATIONS } from "../lib/catalog-core.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- reproducible randomness ---------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261023);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const chance = (p) => rand() < p;
function sample(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

/* ---------- sector knowledge ---------- */
const SECTORS = {
  health: {
    label: "Healthcare employer",
    problems: [
      ["Employee retention", "Frontline staff leave in their first year when the work doesn't match what they expected."],
      ["Workforce pipeline", "Hard-to-fill clinical roles could be filled by steering existing support staff toward them."],
      ["Career transitions", "Staff burning out of bedside roles need a path into other work inside the organization."],
    ],
    evidence: ["Posts the same frontline openings month after month.", "Annual report names staff retention as a priority for next year.", "Runs a tuition-support program but no tool to help staff choose a path.", "Local news coverage of staffing shortages at its sites."],
    unknowns: ["Who owns retention: HR, Learning & Development, or each site?", "Is there budget for staff-development tools this year?", "Would a union need to be consulted before a new tool?"],
    roles: ["Director, People & Culture", "Manager, Learning & Development", "Retention Lead"],
    concerns: ["Health employers often prefer tools already inside their HR system.", "Approvals can move slowly in larger health organizations."],
    sources: ["Job postings (sample)", "Annual report (sample)", "Website (sample)", "News article (sample)"],
  },
  postsec: {
    label: "Post-secondary",
    problems: [
      ["Career transitions", "Adult learners enroll without a clear target role and switch programs or drop out."],
      ["Workforce pipeline", "Programs lose students who would stay with better early career exploration."],
    ],
    evidence: ["Program-transfer and completion rates are named as goals in its strategic plan.", "Offers a first-term career exploration workshop with no assessment tool.", "Career centre lists two advisors for several thousand learners.", "Launched new short credentials aimed at working adults."],
    unknowns: ["Which office owns retention: student services or the academic deans?", "How long does a new learner-facing tool take to approve?", "Is there grant funding for student-success pilots?"],
    roles: ["Director, Student Success", "Career Centre Manager", "Dean, Continuing Studies"],
    concerns: ["Post-secondary buying is slow: an earlier contact cited bureaucracy, budget and long timelines.", "Career services may see this as overlapping with existing advising."],
    sources: ["Strategic plan (sample)", "Website (sample)", "Program announcements (sample)"],
  },
  manufacturing: {
    label: "Manufacturing",
    problems: [
      ["Reskilling", "Automation is changing operator roles; some staff need a path into maintenance, programming or inspection."],
      ["Workforce pipeline", "Apprentices pick a trade early and some leave when it doesn't suit them."],
    ],
    evidence: ["Announced a multi-year automation upgrade at its main plant.", "Posts apprenticeship openings every spring.", "Careers page promotes internal promotion but lists no development program.", "Hired a workforce development coordinator this year."],
    unknowns: ["Does the training lead have budget authority for new tools?", "How many apprentices leave in their first year?", "Is training built in-house with the union?"],
    roles: ["Workforce Development Coordinator", "HR Manager", "Plant Manager"],
    concerns: ["Shop-floor staff may prefer hands-on assessments to an online tool."],
    sources: ["News release (sample)", "Job postings (sample)", "Website (sample)", "LinkedIn (sample)"],
  },
  energy: {
    label: "Energy services",
    problems: [
      ["Career transitions", "Restructuring means some field staff must move into new kinds of work or leave."],
      ["Reskilling", "New service lines need skills the current workforce doesn't have."],
    ],
    evidence: ["Announced a new lower-carbon service division.", "Reported workforce reductions at two field locations.", "Posts openings for roles that didn't exist two years ago.", "Investor update mentions redeploying staff rather than hiring."],
    unknowns: ["Do they offer redeployment or outplacement support today?", "Is HR centralized or run by each region?", "Who signs off on workforce-transition spending?"],
    roles: ["VP Human Resources", "Talent Development Lead", "Workforce Transition Manager"],
    concerns: ["Outplacement is often bought from established firms through long procurement."],
    sources: ["Investor update (sample)", "News article (sample)", "Job postings (sample)"],
  },
  finance: {
    label: "Financial services",
    problems: [
      ["Career transitions", "Branch and service roles are shifting to advisory and digital work that won't suit everyone."],
      ["Employee retention", "Experienced staff leave when they can't see a future role during restructuring."],
    ],
    evidence: ["Posted a career pathing role in HR.", "Consolidated branches and opened a central contact centre.", "Employee survey results cite unclear career paths.", "Member newsletter announces new advisory roles."],
    unknowns: ["Has the career pathing role been filled, and what tools do they plan to use?", "Does their HR software already include a career-pathing feature?"],
    roles: ["Director of People", "Career Pathing Lead", "Chief Operating Officer"],
    concerns: ["May already use a career-pathing feature in their HR software."],
    sources: ["Job posting (sample)", "Member newsletter (sample)", "Employer reviews (sample)"],
  },
  logistics: {
    label: "Transportation & warehousing",
    problems: [
      ["Employee retention", "Drivers and warehouse staff leave early when they can't see a next step."],
      ["Reskilling", "Automation in warehouses is changing roles and creating maintenance and dispatch openings."],
    ],
    evidence: ["Opened an automated distribution centre.", "Runs near-constant driver recruitment ads.", "Careers page advertises \"grow with us\" with no development program listed."],
    unknowns: ["Is there an HR or training lead, or does the owner decide?", "Are they building their own training ladder?"],
    roles: ["HR Manager", "Operations Director", "Driver Development Lead"],
    concerns: ["May build training in-house with their union."],
    sources: ["News release (sample)", "Job postings (sample)", "Website (sample)"],
  },
  hospitality: {
    label: "Hospitality & retail",
    problems: [
      ["Employee retention", "Seasonal and part-time staff rarely return, so the company re-hires and re-trains every year."],
      ["Workforce pipeline", "Few frontline staff move up into supervisor and manager roles."],
    ],
    evidence: ["Posts dozens of seasonal roles each spring.", "Promotes a \"grow your career with us\" program, but few staff move into year-round roles.", "Employer reviews mention unclear paths to supervisor roles."],
    unknowns: ["Is turnover seen as a problem or as a normal cost of the business?", "Who owns staff development: head office or each location?"],
    roles: ["Director of Human Resources", "Talent Development Manager", "Regional Operations Manager"],
    concerns: ["They may accept high turnover as normal for the industry."],
    sources: ["Job postings (sample)", "Website (sample)", "Employer reviews (sample)"],
  },
  trades: {
    label: "Construction & trades",
    problems: [
      ["Workforce pipeline", "Apprentices and labourers don't know which trade fits them, and some leave mid-apprenticeship."],
      ["Employee retention", "Skilled workers leave for competitors when there's no clear path to lead or estimator roles."],
    ],
    evidence: ["Sponsors apprentices in three trades.", "Hiring for site supervisors and estimators.", "Industry association lists it as a training partner."],
    unknowns: ["Does the owner make every purchasing decision?", "How many apprentices finish their program with them?"],
    roles: ["Owner / President", "Safety & Training Manager", "HR Generalist"],
    concerns: ["Smaller trades firms may prefer informal mentoring to a structured tool."],
    sources: ["Job postings (sample)", "Industry association (sample)", "Website (sample)"],
  },
  tech: {
    label: "Technology",
    problems: [
      ["Employee retention", "Support and junior staff leave when they can't see a path into specialist roles."],
      ["Career transitions", "People moving into tech from other careers need help choosing a direction."],
    ],
    evidence: ["Help-desk roles are reposted every few months.", "Runs an internal mentoring program.", "Employer reviews describe clear promotion paths and low turnover."],
    unknowns: ["Is there a career alignment problem at all, or just normal turnover?", "Who owns learning and development?"],
    roles: ["Head of People", "Engineering Manager", "Co-founder / CEO"],
    concerns: ["May have little or no career alignment problem.", "Tech teams often build their own internal tools."],
    sources: ["Job postings (sample)", "Employer reviews (sample)", "LinkedIn (sample)"],
  },
  gov: {
    label: "Municipal government",
    problems: [
      ["Workforce pipeline", "Many staff are near retirement and roles need successors from inside."],
      ["Career transitions", "Staff in shrinking roles could move into hard-to-fill ones with the right guidance."],
    ],
    evidence: ["Council report flags upcoming retirements in operations and finance.", "Posts the same technical roles repeatedly.", "Runs a succession-planning pilot."],
    unknowns: ["Does buying a tool require a public procurement process?", "Which department would own it?"],
    roles: ["Director, Human Resources", "Organizational Development Advisor", "Chief Administrative Officer"],
    concerns: ["Public procurement can be slow and formal."],
    sources: ["Council report (sample)", "Job postings (sample)", "Website (sample)"],
  },
  nonprofit: {
    label: "Non-profit employment services",
    problems: [
      ["Career transitions", "Clients are adults between careers who need to find a direction before choosing training."],
      ["Workforce pipeline", "Funders measure job placement, so better early direction improves outcomes."],
    ],
    evidence: ["Runs career decision-making workshops for adults.", "Annual report highlights clients who changed direction mid-program.", "Partners with local employers on placement."],
    unknowns: ["Can program budgets buy a tool, or does it need funder approval?", "Would counsellors use it with clients, or would clients use it alone?"],
    roles: ["Executive Director", "Program Manager", "Employment Counsellor"],
    concerns: ["Funding cycles may limit when they can buy.", "Small staff, even though they serve many adults."],
    sources: ["Annual report (sample)", "Program page (sample)", "Website (sample)"],
  },
  food: {
    label: "Food processing & agriculture",
    problems: [
      ["Employee retention", "Plant workers leave within months, so the company is always hiring."],
      ["Reskilling", "New equipment needs operators and technicians the current workforce doesn't have."],
    ],
    evidence: ["Advertises production roles almost every week.", "Invested in a new processing line this year.", "Offers a newcomer hiring program."],
    unknowns: ["What is first-year turnover in production roles?", "Who decides on training tools: plant or head office?"],
    roles: ["Plant HR Manager", "Training Coordinator", "Director of Operations"],
    concerns: ["Language and shift schedules may limit how staff could use an online tool."],
    sources: ["Job postings (sample)", "News release (sample)", "Website (sample)"],
  },
  staffing: {
    label: "Recruitment & staffing",
    problems: [["Workforce pipeline", "Placements that don't fit the candidate end early, which costs the agency and its client."]],
    evidence: ["Advertises \"the right fit, the first time\" as a service promise.", "Places candidates in many different industries."],
    unknowns: ["Would they pay for a fit tool, or expect candidates to use it free?", "Do they use personality in matching at all?"],
    roles: ["Director of Operations", "Recruitment Manager"],
    concerns: ["A recruiter Joan spoke with didn't use personality types in their process.", "They may want a screening score, which Myrimaven doesn't offer."],
    sources: ["Website (sample)"],
  },
  k12: {
    label: "K–12 education",
    problems: [["Workforce pipeline", "Students must take career education, but exploration tools are limited."]],
    evidence: ["Career education is required for graduation."],
    unknowns: ["Would the district buy centrally, or does each school decide?"],
    roles: ["Career Education Coordinator", "Assistant Superintendent"],
    concerns: ["About 30 cold emails to K–12 schools got no replies.", "Myrimaven is focused on adults."],
    sources: ["Curriculum page (sample)"],
  },
  coaching: {
    label: "Career coaching",
    problems: [["Career transitions", "Clients are mid-career adults exploring new paths."]],
    evidence: ["Offers one-on-one career transition packages."],
    unknowns: ["Would coaches see the sandbox as a tool or as a competitor?"],
    roles: ["Founder"],
    concerns: ["Career coaches aren't a current target; Joan expects the approach clashes with their methods, but this is untested."],
    sources: ["Website (sample)"],
  },
};

/* ---------- 45 more fictional organizations ----------
   [key, name, sector, staff/learners, size label, region, open roles, signals, fit (adults, problem, size, hiring, decider, vendors, buying, warm), summary] */
const MORE = [
  ["larkspur", "Larkspur Continuing Care", "health", 900, "~900 staff", "Calgary", 46, ["retention", "pipeline"], "yyyy?y??", "Continuing-care operator with five sites and steady turnover among health care aides."],
  ["southgate", "Southgate Community Health Centres", "health", 450, "~450 staff", "Edmonton", 18, ["retention"], "yyyy????", "Network of community clinics where front-desk and outreach staff turn over quickly."],
  ["bowmont", "Bowmont Seniors Living", "health", 600, "~600 staff", "Red Deer", 30, ["retention", "transitions"], "yyyy?y??", "Seniors-living company moving recreation and support staff into care roles."],
  ["northernlights", "Northern Lights Physiotherapy Group", "health", 120, "~120 staff", "Grande Prairie", 6, ["retention"], "y?n??y??", "Physiotherapy clinic group where assistants rarely stay more than two years."],
  ["meadowlark", "Meadowlark Home Support", "health", 140, "~140 caregivers", "Lethbridge", 12, ["retention", "transitions"], "yyn??y??", "Home-support agency that hires many career changers with no care experience."],
  ["ashcroft", "Ashcroft Polytechnic", "postsec", 7000, "~7,000 learners", "Calgary", 14, ["transitions", "pipeline"], "yyy??yn?", "Polytechnic where first-year learners often switch out of trades and health programs."],
  ["riverside", "Riverside Community College", "postsec", 4200, "~4,200 students", "Medicine Hat", 9, ["transitions"], "yyy??yn?", "Regional college with a large adult upgrading program and low completion in some streams."],
  ["mapleton", "Mapleton University Extension", "postsec", 3000, "~3,000 adult learners", "Edmonton", 5, ["transitions", "reskilling"], "yyy??y??", "University extension unit selling short courses to working adults changing careers."],
  ["kensington", "Kensington Language & Career Centre", "postsec", 800, "~800 adult learners", "Calgary", 4, ["transitions"], "yyy??yy?", "Private career college for newcomers combining language training with job preparation."],
  ["ironbridge", "Ironbridge Fabrication", "manufacturing", 650, "~650 staff", "Nisku", 28, ["reskilling", "pipeline"], "yyyy?y??", "Steel fabricator adding robotic welding cells and retraining manual welders."],
  ["clearwater", "Clearwater Packaging", "manufacturing", 300, "~300 staff", "Calgary", 11, ["retention"], "y?yy?y??", "Packaging plant with high turnover on night shifts."],
  ["summitprecision", "Summit Precision Components", "manufacturing", 150, "~150 staff", "Airdrie", 7, ["reskilling"], "yyn??yy?", "Machine shop moving operators onto CNC programming."],
  ["graniteridge", "Granite Ridge Cabinetry", "manufacturing", 90, "~90 staff", "Okotoks", 3, [], "y?n??yy?", "Family-owned cabinet maker with a small, long-serving team."],
  ["redwater", "Redwater Midstream", "energy", 1200, "~1,200 staff", "Edmonton", 35, ["transitions", "reskilling"], "yyyy??n?", "Pipeline and processing company restructuring its field operations."],
  ["tamarack", "Tamarack Solar Services", "energy", 220, "~220 staff", "Calgary", 24, ["reskilling", "pipeline"], "yyyy?yy?", "Solar installer hiring former oilfield workers and retraining them."],
  ["foothillspipeline", "Foothills Pipeline Maintenance", "energy", 500, "~500 staff", "Drayton Valley", 15, ["transitions"], "yyy??n??", "Maintenance contractor that builds its own training and redeployment programs."],
  ["northwind", "Northwind Drilling", "energy", 350, "~350 staff", "Nisku", 4, ["transitions"], "yyyy????", "Drilling company that has cut two crews and is moving staff into new service lines."],
  ["chinookmutual", "Chinook Mutual Insurance", "finance", 900, "~900 staff", "Calgary", 22, ["transitions", "retention"], "yyyy?y??", "Insurer automating claims work and moving adjusters into new roles."],
  ["parkland", "Parkland Savings & Credit", "finance", 350, "~350 staff", "Red Deer", 9, ["transitions"], "yyy??y??", "Credit union closing small branches and opening a member advice centre."],
  ["beacon", "Beacon Wealth Partners", "finance", 70, "~70 staff", "Calgary", 2, [], "y?n??yy?", "Boutique wealth firm with low turnover and a small team."],
  ["keystonebenefits", "Keystone Benefits Administrators", "finance", 260, "~260 staff", "Edmonton", 13, ["retention"], "yyyy?y??", "Benefits administrator whose call-centre staff turn over within a year."],
  ["crossroads", "Crossroads Freight Lines", "logistics", 750, "~750 staff", "Calgary", 40, ["retention"], "yyyy?y??", "Trucking company that is always recruiting long-haul drivers."],
  ["westline", "Westline Courier", "logistics", 400, "~400 staff", "Edmonton", 19, ["retention", "reskilling"], "yyyy????", "Courier moving dispatchers onto new routing software."],
  ["heartlandrail", "Heartland Rail Services", "logistics", 1100, "~1,100 staff", "Edmonton", 26, ["pipeline"], "yyyy?nn?", "Rail services company with its own training academy and union agreements."],
  ["juniper", "Juniper Hotel Group", "hospitality", 800, "~800 staff", "Banff", 64, ["retention", "pipeline"], "yyyy?y??", "Mountain hotel group that re-hires most of its seasonal staff every year."],
  ["harvesttable", "Harvest Table Restaurants", "hospitality", 1400, "~1,400 staff", "Calgary", 55, ["retention"], "yyyy????", "Restaurant group where few servers move up into kitchen or management roles."],
  ["outfield", "Outfield Sporting Goods", "hospitality", 600, "~600 staff", "Calgary", 21, ["retention"], "y?yy?y??", "Sporting-goods retailer with part-time staff who rarely stay a second season."],
  ["cornerpantry", "Corner Pantry Grocers", "hospitality", 2000, "~2,000 staff", "Western Canada", 48, ["retention", "pipeline"], "yyyy??n?", "Regional grocery chain with a central HR team and a long approval process."],
  ["stonebridge", "Stonebridge Construction", "trades", 550, "~550 staff", "Calgary", 17, ["pipeline"], "yyyy?y??", "General contractor sponsoring apprentices across several trades."],
  ["prairiesparks", "Prairie Sparks Electrical", "trades", 180, "~180 staff", "Lethbridge", 8, ["pipeline"], "yyn??yy?", "Electrical contractor whose apprentices often leave mid-program."],
  ["highline", "Highline Mechanical", "trades", 240, "~240 staff", "Edmonton", 10, ["retention", "pipeline"], "yyyy?yy?", "Mechanical contractor short on site supervisors and estimators."],
  ["pixelforge", "Pixelforge Studios", "tech", 90, "~90 staff", "Calgary", 3, [], "ynn??yy?", "Game studio with low turnover and an internal mentoring program."],
  ["ledgerline", "Ledgerline Software", "tech", 350, "~350 staff", "Calgary", 12, ["transitions"], "y?yy?n??", "Accounting software company that builds its own internal learning tools."],
  ["northstarit", "Northstar IT Services", "tech", 600, "~600 staff", "Edmonton", 31, ["retention", "transitions"], "yyyy?y??", "Managed IT provider whose help-desk staff leave within 18 months."],
  ["larchmere", "Town of Larchmere", "gov", 350, "~350 staff", "Central Alberta", 8, ["pipeline"], "yyy??yn?", "Small town administration preparing for a wave of retirements."],
  ["silverleaf", "Silverleaf County", "gov", 600, "~600 staff", "Southern Alberta", 14, ["pipeline", "transitions"], "yyyy?yn?", "Rural county running a succession-planning pilot in operations."],
  ["newpaths", "New Paths Employment Society", "nonprofit", 45, "~45 staff, ~2,000 clients a year", "Calgary", 2, ["transitions"], "yyn??yy?", "Employment non-profit running career-change programs for adults."],
  ["bridgeway", "Bridgeway Newcomer Services", "nonprofit", 120, "~120 staff, ~3,500 clients a year", "Edmonton", 5, ["transitions", "pipeline"], "yyn??yy?", "Settlement agency helping newcomers restart careers in Canada."],
  ["secondwind", "Second Wind Veterans Transition", "nonprofit", 25, "~25 staff, ~400 clients a year", "Western Canada", 1, ["transitions"], "yyn??y??", "Small charity helping military veterans move into civilian careers."],
  ["goldenprairie", "Golden Prairie Foods", "food", 1600, "~1,600 staff", "Brooks", 52, ["retention", "reskilling"], "yyyy?y??", "Meat-processing plant with high first-year turnover on production lines."],
  ["sunfield", "Sunfield Agri Cooperative", "food", 300, "~300 staff", "Camrose", 6, ["reskilling"], "y?y??yy?", "Farm co-operative training staff on new grain-handling equipment."],
  ["talentbridge", "Talentbridge Staffing", "staffing", 90, "~90 staff", "Calgary", 0, ["pipeline"], "y?n??y??", "Staffing agency placing adults in office and light-industrial roles."],
  ["aspengrove", "Aspen Grove School District", "k12", 6000, "~45 schools", "Central Alberta", 0, ["pipeline"], "ny?????n", "School district with a required high-school career education course."],
  ["compasspoint", "Compass Point Coaching", "coaching", 4, "4 coaches", "Edmonton", 0, ["transitions"], "y?nn????", "Small coaching practice helping professionals change careers."],
  ["willowbrook", "Willowbrook Regional Health Training Office", "health", 2400, "~2,400 staff served", "Northern Alberta", 9, ["pipeline", "transitions"], "yyyy?nn?", "Training office for a regional health employer that builds its own programs."],
];

const SIGNAL_LABEL = { retention: "Employee retention", reskilling: "Reskilling", transitions: "Career transitions", pipeline: "Workforce pipeline" };

function buildOrganization([key, name, sectorKey, people, size, region, roles, signals, fit, summary]) {
  const s = SECTORS[sectorKey];
  const problems = s.problems.filter(([t]) => signals.some((sig) => SIGNAL_LABEL[sig] === t));
  const chosenProblems = (problems.length ? problems : s.problems.slice(0, 1)).map(([title, detail]) => ({ title, detail }));
  const evidence = sample(s.evidence, Math.min(s.evidence.length, int(2, 3))).map((text, i) => ({ text, source: s.sources[i % s.sources.length] }));
  if (roles > 0) evidence.unshift({ text: `About ${roles} open roles posted in the last two months.`, source: "Job postings (sample)" });
  return {
    key, name, sector: s.label, size, region, signals, fit,
    hiring: roles > 0 ? `~${roles} open roles (sample)` : sectorKey === "k12" || sectorKey === "coaching" ? "Not checked" : "Few postings",
    summary,
    ...(sectorKey === "k12" || sectorKey === "coaching" ? { outside: true } : {}),
    analysis: {
      problems: chosenProblems,
      evidence,
      unknowns: sample(s.unknowns, Math.min(s.unknowns.length, int(1, 3))),
      roles: s.roles.slice(0, int(2, s.roles.length)),
      fitConcerns: sample(s.concerns, Math.min(s.concerns.length, int(1, 2))),
    },
    _sector: sectorKey,
    _people: people,
  };
}

const more = MORE.map(buildOrganization);
const allOrgs = [...CORE_ORGANIZATIONS.map((o) => ({ ...o })), ...more];
const SECTOR_OF_CORE = { kestrel: "manufacturing", prairiehealth: "health", fieldstone: "health", summitcu: "finance", northgate: "postsec", westbrook: "postsec", cedarvalley: "nonprofit", aspenridge: "hospitality", helix: "energy", bowline: "logistics", ironwood: "energy", ridgeline: "staffing", lumen: "tech", brightwater: "k12", corbel: "coaching" };
allOrgs.forEach((o) => { if (!o._sector) o._sector = SECTOR_OF_CORE[o.key]; });

/* ---------- fit rating (same rules as lib/fit.js) ---------- */
const CRIT = ["adults", "problem", "size", "hiring", "decider", "vendors", "buying", "warm"];
const DEAL = new Set(["adults", "problem", "vendors"]);
const decode = (code) => Object.fromEntries(CRIT.map((k, i) => [k, ({ y: "yes", n: "no" })[code[i]] || "unknown"]));
function rating(fit, contacts = []) {
  const v = { ...fit };
  if (contacts.some((c) => c.authority === "Decision-maker")) v.decider = "yes";
  if (contacts.some((c) => c.connection === "Warm" || c.connection === "Referral")) v.warm = "yes";
  const yes = CRIT.filter((k) => v[k] === "yes").length;
  if (CRIT.some((k) => v[k] === "no" && DEAL.has(k))) return "Weak";
  return yes >= 5 ? "Strong" : yes >= 3 ? "Moderate" : "Weak";
}

/* ---------- people (fictional) ---------- */
const FIRST = ["Amara", "Daniel", "Priyanka", "Marcus", "Sofia", "Wei", "Hannah", "Omar", "Leila", "Jordan", "Grace", "Mateo", "Aisha", "Connor", "Mei", "Tariq", "Natalie", "Raj", "Elena", "Kofi", "Isabelle", "Hiroshi", "Fatima", "Liam", "Chloe", "Arjun", "Noor", "Ethan", "Yasmin", "Gabriel", "Lucía", "Ben", "Anika", "Samuel", "Rosa", "Kai", "Maya", "Victor", "Zoe", "Andre"];
const LAST = ["Okafor", "Bergstrom", "Nguyen", "Desjardins", "Kaur", "Thompson", "Alvarez", "Haddad", "MacLeod", "Petrov", "Chen", "Lindqvist", "Mensah", "O'Brien", "Sato", "Rahman", "Fontaine", "Gill", "Kowalczyk", "Abara", "Moreau", "Ivanova", "Delgado", "Whitehorse", "Park", "Ferreira", "Novak", "Eriksen", "Bello", "Sandoval", "Tremblay", "Yusuf", "Hartley", "Marchetti", "Osei", "Laurent", "Duarte", "Kim", "Fraser", "Anand"];
const usedNames = new Set();
function personName() {
  for (;;) { const n = `${pick(FIRST)} ${pick(LAST)}`; if (!usedNames.has(n)) { usedNames.add(n); return n; } }
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
let phoneN = 100;

/* ---------- the starter workspace: 40 prospects ---------- */
const STATUS_PLAN = { Strong: ["Follow-Up", "Follow-Up", "Contacted", "Potential Fit", "Follow-Up", "Contacted"], Moderate: ["Contacted", "Potential Fit", "Needs Validation", "Not a Fit", "Contacted", "Needs Validation"], Weak: ["Not a Fit", "Needs Validation", "Not a Fit", "Needs Validation"] };
const NOT_FIT_REASON = {
  postsec: "Bureaucracy, budget or long decision timeline", gov: "Bureaucracy, budget or long decision timeline",
  energy: "Only uses in-house tools", logistics: "Only uses in-house tools", tech: "Doesn't see career exploration as relevant",
  staffing: "Doesn't use personality types in their process", k12: "Wrong audience (not adults)", coaching: "Doesn't see career exploration as relevant",
  hospitality: "Timing", food: "Timing", finance: "Only uses in-house tools", health: "Bureaucracy, budget or long decision timeline",
  manufacturing: "Timing", trades: "Doesn't see career exploration as relevant", nonprofit: "Timing",
};
const REASON_FIT = { "Only uses in-house tools": "vendors", "Bureaucracy, budget or long decision timeline": "buying", "Wrong audience (not adults)": "adults" };
const LEARNED = {
  "Interested": [
    (o, c) => `${c.role.split(",")[0]} confirmed turnover is a top concern and wants to see how the sandbox works.`,
    () => "Interested in a small pilot with one team before committing budget.",
    () => "Asked how other organizations measure results; wants something to show leadership.",
    () => "Budget for next year is set in the spring, so timing matters.",
  ],
  "Meeting booked": [
    () => "Booked a 30-minute demo; they want to bring their L&D lead.",
    () => "Agreed to a call with the person who owns the training budget.",
  ],
  "Referred elsewhere": [
    () => "Pointed me to the director who owns retention projects.",
    () => "Not their area; suggested contacting Learning & Development instead.",
    () => "Said HR generalists don't buy tools; the VP People does.",
  ],
  "No response": [() => "", () => "", () => "No reply after two weeks; try a warm introduction instead."],
  "Not interested": {
    "Bureaucracy, budget or long decision timeline": () => "Any new tool needs a procurement review that can take most of a year.",
    "Only uses in-house tools": () => "They build their own training tools and don't buy from outside vendors.",
    "Doesn't use personality types in their process": () => "They match people on skills and availability only, not personality.",
    "Wrong audience (not adults)": () => "Their students are teenagers; Myrimaven is built for adults.",
    "Timing": () => "Interested in principle, but no budget or time until next fiscal year.",
    "Doesn't see career exploration as relevant": () => "Turnover is low and people already have clear paths, so there's no problem to solve.",
  },
};
const NEXT_ACTION = {
  "Needs Validation": ["Check job postings for HR or training roles", "Find out who owns retention", "Confirm their staff numbers", "Look for a warm introduction"],
  "Potential Fit": ["Ask a former colleague for an introduction", "Draft a short note to the HR director", "Find the right contact on LinkedIn"],
  "Contacted": ["Follow up if no reply by next week", "Send a one-page overview", "Try a second contact in L&D"],
  "Follow-Up": ["Send a pilot outline for one team", "Book a demo with the L&D lead", "Share a short case example", "Confirm budget timing before the call"],
  "Not a Fit": [""],
};

function buildProspect(org, status, idx) {
  const s = SECTORS[org._sector];
  const fit = decode(org.fit);
  const nContacts = status === "Needs Validation" ? int(0, 1) : status === "Potential Fit" ? int(1, 2) : int(1, 3);
  const contacts = [];
  const roles = org.analysis.roles && org.analysis.roles.length ? org.analysis.roles : s.roles;
  for (let i = 0; i < nContacts; i++) {
    const name = personName();
    const [first, last] = name.toLowerCase().split(" ");
    const authority = i === 0 && (status === "Follow-Up" || chance(0.35)) ? "Decision-maker" : pick(["Influencer", "Influencer", "No purchasing authority", "Unknown"]);
    const connection = pick(status === "Follow-Up" ? ["Warm", "Warm", "Referral", "Cold"] : ["Warm", "Referral", "Cold", "Cold", "Unknown"]);
    contacts.push({
      id: `${org.key}-c${i + 1}`,
      name,
      role: roles[i % roles.length],
      email: chance(0.8) ? `${first}.${last.replace(/[^a-z]/g, "")}@${slug(org.name).slice(0, 18)}.example` : "",
      phone: chance(0.4) ? `403-555-0${phoneN++}` : "",
      authority,
      connection,
      notes: pick(["", "", "Met at a regional HR association event.", "Former colleague of a friend.", "Found through the company website.", "Spoke on a panel about retention.", "Recommended by an earlier contact."]),
    });
  }

  /* outreach history, oldest first, as days before the seeding date */
  const outreach = [];
  if (["Contacted", "Follow-Up", "Not a Fit"].includes(status) && contacts.length) {
    const n = status === "Contacted" ? int(1, 3) : int(2, 4);
    let day = -int(20, 85);
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const c = contacts[Math.min(i, contacts.length - 1)];
      let outcome, reason = "";
      if (last && status === "Follow-Up") outcome = pick(["Interested", "Meeting booked", "Interested"]);
      else if (last && status === "Not a Fit") { outcome = "Not interested"; reason = NOT_FIT_REASON[org._sector]; }
      else if (c.connection === "Cold") outcome = pick(["No response", "No response", "No response", "Referred elsewhere"]);
      else outcome = pick(["Referred elsewhere", "No response", "Interested"]);
      if (outcome === "Referred elsewhere" && chance(0.5)) reason = "No purchasing authority";
      const learnedFn = outcome === "Not interested" ? LEARNED["Not interested"][reason] : pick(LEARNED[outcome]);
      outreach.push({
        id: `${org.key}-o${i + 1}`,
        dayOffset: day,
        contactId: c.id,
        connection: c.connection,
        channel: c.connection === "Warm" ? pick(["Warm intro", "Email", "Phone"]) : c.connection === "Referral" ? pick(["Email", "Warm intro"]) : pick(["Email", "LinkedIn", "LinkedIn"]),
        outcome,
        reason,
        learned: learnedFn(org, c),
      });
      day += int(5, 18);
      if (day > -1) day = -1;
    }
  }

  if (status === "Not a Fit") {
    const reason = NOT_FIT_REASON[org._sector];
    const k = REASON_FIT[reason];
    if (k) fit[k] = "no";
  }

  const evidence = org.analysis.evidence.map((e, i) => ({ text: e.text, source: e.source, checked: status !== "Needs Validation" && (i === 0 || chance(0.4)) }));
  const unknowns = org.analysis.unknowns.map((t, i) => ({ text: t, done: ["Follow-Up", "Not a Fit"].includes(status) && i === 0 && chance(0.7) }));
  if (chance(0.25)) unknowns.push({ text: pick(["Who signs off on vendor tools?", "Would this compete with an existing HR system?", "Is there an internal champion?"]), done: false, mine: true });

  const followUp = status === "Follow-Up" ? int(-6, 14) : status === "Contacted" && chance(0.6) ? int(3, 12) : status === "Potential Fit" && chance(0.5) ? int(5, 20) : null;
  const notFitNote = status === "Not a Fit" ? (LEARNED["Not interested"][NOT_FIT_REASON[org._sector]] || (() => ""))() : "";

  return {
    key: org.key,
    createdOffset: Math.min(-1, (outreach[0] ? outreach[0].dayOffset : -int(3, 40)) - int(2, 10)),
    payload: {
      name: org.name, sector: org.sector, size: org.size, region: org.region, website: "",
      summary: org.summary, signals: org.signals, catalogKey: org.key, example: false,
      fit, fitWhy: {}, jobs: null,
      analysis: {
        problems: org.analysis.problems, roles: org.analysis.roles, fitConcerns: org.analysis.fitConcerns,
        generatedBy: "sample", generatedAt: "", evidence, unknowns,
      },
      contacts, outreach,
      status,
      fitNote: notFitNote,
      nextAction: pick(NEXT_ACTION[status]),
      followUpOffset: followUp,
      notes: chance(0.3) ? pick(["Joan has a former colleague here.", "Came up at a networking event.", "Large adult workforce; worth a closer look.", "Check again after their budget cycle."]) : "",
    },
  };
}

/* Choose 40 organizations and give each a status that fits its rating */
const ranked = allOrgs.map((o) => ({ o, r: rating(decode(o.fit)) }));
const byRating = { Strong: [], Moderate: [], Weak: [] };
ranked.forEach(({ o, r }) => byRating[r].push(o));
const chosen = [
  ...sample(byRating.Strong, Math.min(byRating.Strong.length, 14)),
  ...sample(byRating.Moderate, Math.min(byRating.Moderate.length, 16)),
  ...sample(byRating.Weak, Math.min(byRating.Weak.length, 10)),
];
const counters = { Strong: 0, Moderate: 0, Weak: 0 };
const starter = chosen.map((o, i) => {
  const r = rating(decode(o.fit));
  const plan = STATUS_PLAN[r];
  const status = plan[counters[r]++ % plan.length];
  return buildProspect(o, status, i);
});

/* ---------- write lib/catalog-more.js ---------- */
const clean = (o) => { const { _sector, _people, ...rest } = o; return rest; };
writeFileSync(join(ROOT, "lib/catalog-more.js"),
  `/* Generated by supabase/generate-sample-data.mjs. Fictional organizations. Don't edit by hand. */\nexport const MORE_ORGANIZATIONS = ${JSON.stringify(more.map(clean), null, 1)};\n`);

/* ---------- write supabase/seed.sql ---------- */
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const arr = (a) => "array[" + a.map(q).join(", ") + "]::text[]";
const orgRows = allOrgs.map((c) => `  (${[q(c.key), q(c.name), q(c.sector), q(c.size), q(c.region), q(c.summary), q(c.hiring || ""), arr(c.signals), q(c.fit), c.outside ? "true" : "false", q(JSON.stringify(c.analysis)) + "::jsonb"].join(", ")})`);
writeFileSync(join(ROOT, "supabase/seed.sql"), `-- Myrimaven Prospect Desk: the ${allOrgs.length} fictional sample organizations shown on Discover.
-- Generated by supabase/generate-sample-data.mjs. Run after schema.sql.
-- Running it again updates the rows instead of duplicating them.

insert into public.organizations (key, name, sector, size, region, summary, hiring, signals, fit_code, outside_focus, assessment) values
${orgRows.join(",\n")}
on conflict (key) do update set
  name = excluded.name, sector = excluded.sector, size = excluded.size, region = excluded.region,
  summary = excluded.summary, hiring = excluded.hiring, signals = excluded.signals, fit_code = excluded.fit_code,
  outside_focus = excluded.outside_focus, assessment = excluded.assessment;
`);

/* ---------- write supabase/sample_data.sql ---------- */
const tplRows = starter.map((t, i) => `  (${i + 1}, ${q(t.key)}, ${t.createdOffset}, ${q(JSON.stringify(t.payload))}::jsonb)`);
const counts = {
  prospects: starter.length,
  contacts: starter.reduce((n, t) => n + t.payload.contacts.length, 0),
  outreach: starter.reduce((n, t) => n + t.payload.outreach.length, 0),
  evidence: starter.reduce((n, t) => n + t.payload.analysis.evidence.length, 0),
  unknowns: starter.reduce((n, t) => n + t.payload.analysis.unknowns.length, 0),
};
const statusCounts = starter.reduce((m, t) => ((m[t.payload.status] = (m[t.payload.status] || 0) + 1), m), {});
writeFileSync(join(ROOT, "supabase/sample_data.sql"), `-- Myrimaven Prospect Desk: the starter workspace every account gets.
-- Generated by supabase/generate-sample-data.mjs. Run after schema.sql and seed.sql.
-- It's safe to run more than once.
--
-- Each account gets its own private copy of ${counts.prospects} prospects with ${counts.contacts} contacts,
-- ${counts.outreach} outreach entries, ${counts.evidence} pieces of evidence and ${counts.unknowns} open questions.
-- Dates are relative to the day the copy is made, so the data always looks current.
-- Everything is fictional: invented people, .example emails and 555-01xx phone numbers.

-- ───────────────────────── the template ─────────────────────────
create table if not exists public.starter_prospects (
  id             integer primary key,
  organization_key text not null references public.organizations (key) on delete cascade,
  created_offset integer not null,   -- days before the copy is made
  payload        jsonb not null      -- one prospect, in the same shape the app saves
);
alter table public.starter_prospects enable row level security;  -- no policies: users can't read it directly

truncate public.starter_prospects;
insert into public.starter_prospects (id, organization_key, created_offset, payload) values
${tplRows.join(",\n")};

-- ───────────────────────── copy the template into one account ─────────────────────────
-- Ids are derived from the account id, so each account gets its own rows and
-- running this twice for the same account updates instead of duplicating.
create or replace function public.seed_starter_workspace(target uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  t record;
  p jsonb;
  n integer := 0;
  tag text := substr(md5(target::text), 1, 8);
begin
  for t in select * from public.starter_prospects order by id loop
    p := t.payload;
    p := p || jsonb_build_object(
      'id', 'sp-' || tag || '-' || t.organization_key,
      'createdAt', floor(extract(epoch from (now() + make_interval(days => t.created_offset))) * 1000),
      'followUpDate', case when p ? 'followUpOffset' and jsonb_typeof(p -> 'followUpOffset') = 'number'
                           then (current_date + (p ->> 'followUpOffset')::int)::text else '' end,
      'contacts', coalesce((select jsonb_agg(c || jsonb_build_object('id', tag || '-' || (c ->> 'id')) order by i)
                            from jsonb_array_elements(p -> 'contacts') with ordinality as x(c, i)), '[]'::jsonb),
      'outreach', coalesce((select jsonb_agg((o - 'dayOffset') || jsonb_build_object(
                              'id', tag || '-' || (o ->> 'id'),
                              'contactId', tag || '-' || (o ->> 'contactId'),
                              'date', (current_date + (o ->> 'dayOffset')::int)::text) order by i)
                            from jsonb_array_elements(p -> 'outreach') with ordinality as y(o, i)), '[]'::jsonb)
    ) - 'followUpOffset';
    perform public._save_prospect_as(target, p);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.seed_starter_workspace(uuid) from public, anon, authenticated;

-- ───────────────────────── every new account starts with the workspace ─────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.seed_starter_workspace(new.id);
  exception when others then
    raise warning 'Starter workspace not created for %: %', new.id, sqlerrm;  -- never block sign-up
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_seed_workspace on auth.users;
create trigger on_auth_user_created_seed_workspace
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── wipe and reload your own data ─────────────────────────
-- The app's "Reset sample data" button calls this.
create or replace function public.reset_my_workspace() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  delete from public.prospects where user_id = uid;   -- contacts, outreach, evidence, unknowns go with it
  return public.seed_starter_workspace(uid);
end;
$$;
revoke all on function public.reset_my_workspace() from public, anon;
grant execute on function public.reset_my_workspace() to authenticated;

-- ───────────────────────── add the sample prospects, keep your own ─────────────────────────
-- The app's "Load sample prospects" button calls this. It adds the sample prospects
-- (or brings back any that were changed or removed) and leaves your own prospects alone.
create or replace function public.load_sample_data() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return public.seed_starter_workspace(uid);
end;
$$;
revoke all on function public.load_sample_data() from public, anon;
grant execute on function public.load_sample_data() to authenticated;

-- ───────────────────────── accounts that already exist ─────────────────────────
-- Give the starter workspace to existing accounts that have no prospects yet.
select public.seed_starter_workspace(u.id)
from auth.users u
where not exists (select 1 from public.prospects p where p.user_id = u.id);
`);

console.log(`Organizations: ${allOrgs.length} (${CORE_ORGANIZATIONS.length} hand-written + ${more.length} generated)`);
console.log("Ratings:", Object.fromEntries(Object.entries(byRating).map(([k, v]) => [k, v.length])));
console.log("Starter workspace per account:", counts);
console.log("Statuses:", statusCounts);
