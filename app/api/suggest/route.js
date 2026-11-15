/* POST /api/suggest  {query, region?}  ->  up to 6 suggested organizations,
   with live job-posting counts when Adzuna is set up */
import { suggest, parseJSON, normSuggest } from "@/lib/prompts";
import { askAI, jobPostings, requireUser, useQuota, readJson, errorResponse } from "@/lib/server";

/* The AI can take up to a minute; let Vercel wait that long */
export const maxDuration = 60;

export async function POST(request) {
  try {
    const user = await requireUser(request);
    await useQuota(user, "ai");
  } catch (e) {
    return errorResponse(e, "api/suggest");
  }
  const b = await readJson(request);
  const started = Date.now();
  try {
    const text = await askAI(suggest(b.query, b.region), 2000, 40000);
    const items = normSuggest(parseJSON(text));
    /* Job-posting counts are extra: use the time that's left (at most 8 seconds), or skip them */
    const left = 55000 - (Date.now() - started);
    const counts = left < 3000 ? [] : await Promise.allSettled(
      items.map((x) => (x.kind === "organization" ? jobPostings(x.name, b.region || "", Math.min(left - 1000, 8000)) : Promise.resolve(null)))
    );
    counts.forEach((c, i) => {
      if (c.status === "fulfilled" && c.value) items[i].postings = { count: c.value.count, peopleRoles: c.value.peopleRoles };
    });
    /* job counts are optional: if Adzuna fails the suggestions still go back, just without them */
    const failed = counts.find((c) => c.status === "rejected");
    if (failed) console.error(`[api/suggest] job-posting counts skipped: ${failed.reason && failed.reason.message}${failed.reason && failed.reason.detail ? " | " + failed.reason.detail : ""}`);
    if (left < 3000) console.warn("[api/suggest] job-posting counts skipped: not enough time left");
    return Response.json(items);
  } catch (e) {
    return errorResponse(e, "api/suggest");
  }
}
