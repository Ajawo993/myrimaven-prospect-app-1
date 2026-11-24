/* GET /api/calendar/callback — Google sends the person back here after they allow (or refuse) access.
   The signed "state" says who started connecting. The refresh token is stored server-side only,
   then their follow-up dates are put on the calendar straight away. */

import { adminDb, readState, exchangeCode, getSettings, saveSettings, syncCalendar, appUrl } from "@/lib/updates";

export const maxDuration = 60;

export async function GET(request) {
  const url = new URL(request.url);
  const back = (result) => Response.redirect(`${url.origin}/settings?calendar=${result}`, 302);
  if (url.searchParams.get("error")) return back("cancelled");
  const userId = readState(url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!userId || !code) return back("expired");
  try {
    const db = adminDb();
    const t = await exchangeCode(code, url.origin);
    await saveSettings(db, userId, { google_refresh_token: t.refresh, google_email: t.email, calendar_synced: {}, calendar_error: null });
    console.log(`[api/calendar/callback] user ${userId} connected Google Calendar`);
    try {
      const out = await syncCalendar(db, await getSettings(db, userId), { base: appUrl(request) });
      console.log(`[api/calendar/callback] first sync: ${out.saved} events`);
    } catch (e) {
      console.warn(`[api/calendar/callback] first sync failed: ${e.message}${e.detail ? " | " + e.detail : ""}`);
    }
    return back("connected");
  } catch (e) {
    console.error(`[api/calendar/callback] ${e.status || 500} ${e.message}${e.detail ? " | " + e.detail : ""}`);
    return back("failed");
  }
}
