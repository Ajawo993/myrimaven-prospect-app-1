/* POST /api/updates/test — "Send me one now": today's update straight away, to the signed-in person only.
   Counts against the daily AI limit, since Claude writes the drafts. */

import { useQuota, errorResponse, HttpError } from "@/lib/server";
import { signedIn, adminDb, getSettings, runDigest, updatesConfig, appUrl } from "@/lib/updates";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const user = await signedIn(request);
    if (!updatesConfig().email) throw new HttpError(501, "Email isn't set up (RESEND_API_KEY and SUPABASE_SECRET_KEY)");
    await useQuota(user, "ai");
    const db = adminDb();
    const s = await getSettings(db, user.id);
    const out = await runDigest(db, { ...s, email: user.email }, { base: appUrl(request), force: true });
    console.log(`[api/updates/test] sent to user ${user.id}: "${out.subject}" (AI ${out.ai ? "on" : "off"})`);
    return Response.json(out);
  } catch (e) {
    return errorResponse(e, "api/updates/test");
  }
}
