/* POST /api/research — the research agent on a prospect's page.
   Signed-in users only, counted against their daily AI limit. Nothing is saved here:
   the browser shows the findings and the user decides what to add. */

import { requireUser, useQuota, readJson, errorResponse, runResearch } from "@/lib/server";

/* several model calls and searches: let Vercel wait up to a minute */
export const maxDuration = 60;

export async function POST(request) {
  try {
    const user = await requireUser(request);
    await useQuota(user, "ai");
  } catch (e) {
    return errorResponse(e, "api/research");
  }
  const b = await readJson(request);
  const name = String(b.name || "").trim().slice(0, 200);
  if (!name) return Response.json({ error: "Name the organization to research" }, { status: 400 });
  try {
    const out = await runResearch({
      name,
      website: String(b.website || "").slice(0, 300),
      region: String(b.region || "").slice(0, 120),
      known: String(b.known || "").slice(0, 6000),
    });
    console.log(`[api/research] ${name}: ${out.steps.length} steps, ${out.analysis.evidence.length} evidence kept, ${out.dropped} dropped`);
    return Response.json(out);
  } catch (e) {
    return errorResponse(e, "api/research");
  }
}
