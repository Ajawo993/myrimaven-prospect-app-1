/* Browser-side calls to the app's own API routes in app/api */

async function apiCall(url, body, signal) {
  let r;
  try {
    r = await fetch(url, body
      ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal }
      : { signal });
  } catch (e) {
    throw { code: e && e.name === "AbortError" ? "cancelled" : "network" };
  }
  if (!r.ok) throw { code: r.status === 501 ? "not_configured" : r.status === 429 ? "rate_limited" : "upstream_error" };
  return r.json();
}

export const fetchStatus = () => apiCall("/api/status");
export const aiAnalysis = (name, website, notes, signal) => apiCall("/api/analyze", { name, website, notes }, signal);
export const aiSuggest = (query, region, signal) => apiCall("/api/suggest", { query, region }, signal);
export const fetchJobs = (company, where) =>
  apiCall(`/api/jobs?company=${encodeURIComponent(company)}&where=${encodeURIComponent(where || "")}`);

/* Turn an error into a message for the person. Returns [message, aiNowOff]. */
export function aiErr(e) {
  const c = e && e.code;
  if (c === "not_configured") return ["AI analysis isn't connected in this version. You can still use the sample organizations and add prospects by hand.", true];
  if (c === "cancelled") return ["", false];
  if (c === "network") return ["Couldn't reach the server. Check your connection and try again.", false];
  if (c === "rate_limited") return ["Too many AI requests right now. Wait a minute, then try again.", false];
  return ["The AI request failed. Try again.", false];
}
