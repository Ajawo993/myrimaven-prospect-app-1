/* POST /api/analyze  {name, website?, notes?}  ->  "Why is this a prospect?" assessment */
import { analysis, parseJSON, normAnalysis } from "@/lib/prompts";
import { askClaude, requireUser, readJson, errorResponse } from "@/lib/server";

export async function POST(request) {
  try {
    await requireUser(request);
  } catch (e) {
    return errorResponse(e);
  }
  const b = await readJson(request);
  const name = String(b.name || "").trim().slice(0, 200);
  if (!name) return Response.json({ error: "Organization name is required" }, { status: 400 });
  try {
    const text = await askClaude(analysis(name, String(b.website || "").slice(0, 200), String(b.notes || "").slice(0, 8000)), 2500);
    const data = parseJSON(text);
    if (!data) return Response.json({ error: "The AI answer came back in an unexpected shape" }, { status: 502 });
    return Response.json(normAnalysis(data));
  } catch (e) {
    return errorResponse(e);
  }
}
