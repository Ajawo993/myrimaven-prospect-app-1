/* GET /api/jobs?company=...&where=...  ->  recent job postings for one employer (Adzuna) */
import { jobPostings, requireUser, errorResponse } from "@/lib/server";

export async function GET(request) {
  try {
    await requireUser(request);
  } catch (e) {
    return errorResponse(e);
  }
  const q = new URL(request.url).searchParams;
  const company = String(q.get("company") || "").trim().slice(0, 160);
  if (!company) return Response.json({ error: "company is required" }, { status: 400 });
  try {
    const data = await jobPostings(company, String(q.get("where") || "").slice(0, 120));
    if (!data) return Response.json({ error: "Job postings are not configured" }, { status: 501 });
    return Response.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
