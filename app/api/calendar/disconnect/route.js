/* POST /api/calendar/disconnect — remove Prospect Desk's events and give the Google access back */

import { errorResponse } from "@/lib/server";
import { signedIn, adminDb, getSettings, disconnectCalendar, publicSettings } from "@/lib/updates";

export async function POST(request) {
  try {
    const user = await signedIn(request);
    const db = adminDb();
    await disconnectCalendar(db, await getSettings(db, user.id));
    console.log(`[api/calendar/disconnect] user ${user.id} disconnected Google Calendar`);
    return Response.json({ settings: publicSettings(await getSettings(db, user.id)) });
  } catch (e) {
    return errorResponse(e, "api/calendar/disconnect");
  }
}
