/* POST /api/calendar/start -> { url }: the Google page where the person allows calendar access.
   Google sends them back to /api/calendar/callback. */

import { errorResponse, HttpError } from "@/lib/server";
import { signedIn, googleAuthUrl, updatesConfig } from "@/lib/updates";

export async function POST(request) {
  try {
    const user = await signedIn(request);
    if (!updatesConfig().calendar) throw new HttpError(501, "Google Calendar isn't set up (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_SECRET_KEY)");
    return Response.json({ url: googleAuthUrl(user.id, new URL(request.url).origin) });
  } catch (e) {
    return errorResponse(e, "api/calendar/start");
  }
}
