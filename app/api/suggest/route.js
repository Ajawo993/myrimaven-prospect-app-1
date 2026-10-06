/* POST /api/suggest  {query, region?}  ->  up to 6 suggested organizations,
   with live job-posting counts when Adzuna is set up */
import { suggest, parseJSON, normSuggest } from "@/lib/prompts";
import { askClaude, jobPostings, readJson, errorResponse } from "@/lib/server";

export async function POST(request) {
  const b = await readJson(request);
  try {
    const text = await askClaude(suggest(b.query, b.region), 2000);
    const items = normSuggest(parseJSON(text));
    const counts = await Promise.allSettled(
      items.map((x) => (x.kind === "organization" ? jobPostings(x.name, b.region || "") : Promise.resolve(null)))
    );
    counts.forEach((c, i) => {
      if (c.status === "fulfilled" && c.value) items[i].postings = { count: c.value.count, peopleRoles: c.value.peopleRoles };
    });
    return Response.json(items);
  } catch (e) {
    return errorResponse(e);
  }
}
