/* GET /api/cron/daily — started once a day by Vercel Cron (vercel.json).
   For each person who turned it on: email them their update, and sync their Google Calendar.
   Only Vercel can start it: Vercel sends "Authorization: Bearer <CRON_SECRET>" and anything else is refused.
   One person's failure is logged and the run carries on with the next. */

import { errorResponse, HttpError } from "@/lib/server";
import { adminDb, runDigest, syncCalendar, updatesConfig, appUrl, localDate } from "@/lib/updates";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request) {
  const started = Date.now();
  try {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret) throw new HttpError(500, "CRON_SECRET isn't set in Vercel");
    if (request.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Not allowed");

    const config = updatesConfig();
    const db = adminDb();
    const { data, error } = await db.from("user_settings").select("*").or("daily_email.eq.true,google_refresh_token.not.is.null");
    if (error) throw Object.assign(new HttpError(500, "Couldn't read user_settings"), { detail: error.message });

    const base = appUrl(request);
    const report = [];
    for (const s of data || []) {
      if (Date.now() - started > 45000) { report.push({ user: s.user_id, skipped: "out of time" }); continue; }
      const r = { user: s.user_id };
      if (config.email && s.daily_email && s.email) {
        if (s.last_digest_on === localDate(s.time_zone)) r.email = "already sent today";
        else {
          try { const out = await runDigest(db, s, { base }); r.email = out.sent ? `sent (${out.due} due, AI ${out.ai ? "on" : "off"})` : out.reason; }
          catch (e) { r.email = "failed: " + e.message; console.error(`[cron/daily] email for ${s.user_id} failed: ${e.message}${e.detail ? " | " + e.detail : ""}`); }
        }
      }
      if (config.calendar && s.google_refresh_token) {
        try { const out = await syncCalendar(db, s, { base }); r.calendar = `${out.saved} saved, ${out.removed} removed, ${out.failed} failed`; }
        catch (e) { r.calendar = "failed: " + e.message; console.error(`[cron/daily] calendar for ${s.user_id} failed: ${e.message}${e.detail ? " | " + e.detail : ""}`); }
      }
      report.push(r);
    }
    console.log(`[cron/daily] ${report.length} people in ${Date.now() - started} ms: ${JSON.stringify(report)}`);
    return Response.json({ ok: true, report });
  } catch (e) {
    return errorResponse(e, "cron/daily");
  }
}
