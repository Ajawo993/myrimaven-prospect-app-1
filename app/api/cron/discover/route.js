/* GET /api/cron/discover — the weekly discovery agent, started by Vercel Cron (vercel.json).
   Vercel calls it every day; it only searches when the last successful run is a week old,
   so if a week's run fails, it tries again the next day without anyone doing anything.
   Only Vercel can start it: it must send "Authorization: Bearer <CRON_SECRET>". */

import { errorResponse, HttpError } from "@/lib/server";
import { adminDb } from "@/lib/updates";
import { runDiscovery, lastGoodRun, isDue } from "@/lib/discovery";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret) throw new HttpError(500, "CRON_SECRET isn't set in Vercel");
    if (request.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Not allowed");
    if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(501, "The discovery agent needs ANTHROPIC_API_KEY");

    const db = adminDb();
    const last = await lastGoodRun(db);
    if (!isDue(last)) {
      console.log(`[cron/discover] not due: last run ${last.toISOString()}`);
      return Response.json({ ok: true, skipped: "not due yet", last });
    }
    const out = await runDiscovery(db);
    console.log(`[cron/discover] added ${out.added.length} (${out.added.join(", ") || "none"}); ${out.skipped} already known, ${out.unconfirmed} unconfirmed, ${out.searches} searches; themes: ${out.themes.join(" | ")}`);
    return Response.json({ ok: true, ...out });
  } catch (e) {
    return errorResponse(e, "cron/discover");
  }
}
