/* POST /api/find — the finder agent behind "Find organizations" on Discover.
   Searches the web for real organizations matching a description. Signed-in users only,
   counted against their daily AI limit. Nothing is saved: the user reviews each one first. */

import { requireUser, useQuota, readJson, errorResponse, runFinder } from "@/lib/server";

/* several searches plus job checks: let Vercel wait up to a minute */
export const maxDuration = 60;

export async function POST(request) {
  try {
    const user = await requireUser(request);
    await useQuota(user, "ai");
  } catch (e) {
    return errorResponse(e, "api/find");
  }
  const b = await readJson(request);
  const query = String(b.query || "").trim().slice(0, 500);
  if (!query) return Response.json({ error: "Describe who you're looking for" }, { status: 400 });
  try {
    const out = await runFinder({
      query,
      region: String(b.region || "").slice(0, 120),
      skip: (Array.isArray(b.skip) ? b.skip : []).map((x) => String(x).slice(0, 160)).slice(0, 100),
    });
    console.log(`[api/find] "${query}": ${out.steps.length} steps, ${out.candidates.length} found, ${out.unconfirmed} left out, ${out.duplicates} already saved`);
    return Response.json(out);
  } catch (e) {
    return errorResponse(e, "api/find");
  }
}
