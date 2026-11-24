/* POST /api/calendar/sync { force } — put this person's follow-up dates on their Google Calendar now.
   The app calls it after a follow-up date changes; "Sync now" sends force to redo every event. */

import { readJson, errorResponse } from "@/lib/server";
import { signedIn, adminDb, getSettings, syncCalendar, publicSettings, appUrl } from "@/lib/updates";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const user = await signedIn(request);
    const b = await readJson(request);
    const db = adminDb();
    const s = await getSettings(db, user.id);
    const out = await syncCalendar(db, s, { base: appUrl(request), force: !!b.force });
    return Response.json({ ...out, settings: publicSettings(await getSettings(db, user.id)) });
  } catch (e) {
    return errorResponse(e, "api/calendar/sync");
  }
}
