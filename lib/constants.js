export const SIGNALS = {
  retention: "Employee retention",
  reskilling: "Reskilling",
  transitions: "Career transitions",
  pipeline: "Workforce pipeline",
};

export const STATUSES = ["Needs Validation", "Potential Fit", "Contacted", "Follow-Up", "Not a Fit"];
export const AUTH = ["Decision-maker", "Influencer", "No purchasing authority", "Unknown"];
export const CONNECTIONS = ["Warm", "Referral", "Cold", "Unknown"];
export const CONN_LABEL = { Warm: "Warm (you know them)", Referral: "Referral", Cold: "Cold", Unknown: "Unknown" };
export const CHANNELS = ["Email", "LinkedIn", "Phone", "In person", "Warm intro"];
export const OUTCOMES = ["No response", "Interested", "Meeting booked", "Referred elsewhere", "Not interested"];

/* Includes the three real rejection reasons Joan reported */
export const REASONS = [
  "Bureaucracy, budget or long decision timeline",
  "Doesn't use personality types in their process",
  "Only uses in-house tools",
  "No purchasing authority",
  "Doesn't see career exploration as relevant",
  "Wrong audience (not adults)",
  "Timing",
  "Other",
];

/* An outreach reason that answers a fit criterion sets that criterion to "no" */
export const REASON_FIT = {
  "Only uses in-house tools": "vendors",
  "Bureaucracy, budget or long decision timeline": "buying",
  "Wrong audience (not adults)": "adults",
};
