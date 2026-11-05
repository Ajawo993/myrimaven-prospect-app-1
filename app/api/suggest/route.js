/* POST /api/suggest  {query, region?}  ->  up to 6 suggested organizations,
   with live job-posting counts when Adzuna is set up */
import { suggest, parseJSON, normSuggest } from "@/lib/prompts";
import { askAI, jobPostings, requireUser, readJson, errorResponse } from "@/lib/server";

/* The AI can take up to a minute; let Vercel wait that long */
export const maxDuration = 60;

export async function POST(request) {
  try {
    await requireUser(request);
  } catch (e) {
    return errorResponse(e);
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
    return Response.json(items);
  } catch (e) {
    return errorResponse(e);
  }
}
