/* GET  /api/updates  -> this person's update and calendar settings (never the Google token)
   POST /api/updates  { dailyEmail, timeZone } -> turn the daily email on or off */

import { readJson, errorResponse } from "@/lib/server";
import { signedIn, adminDb, getSettings, saveSettings, publicSettings, updatesConfig } from "@/lib/updates";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const user = await signedIn(request);
    const config = updatesConfig();
    if (!config.email && !config.calendar) return Response.json({ config, settings: null });
    const s = await getSettings(adminDb(), user.id);
    return Response.json({ config, settings: publicSettings({ ...s, email: s.email || user.email }) });
  } catch (e) {
    return errorResponse(e, "api/updates");
  }
}

export async function POST(request) {
  try {
    const user = await signedIn(request);
    const b = await readJson(request);
    const db = adminDb();
    const changes = { email: user.email };
    if (typeof b.dailyEmail === "boolean") changes.daily_email = b.dailyEmail;
    if (b.timeZone) {
      try { new Intl.DateTimeFormat("en", { timeZone: String(b.timeZone) }); changes.time_zone = String(b.timeZone).slice(0, 60); } catch { /* ignore an unknown zone */ }
    }
    await saveSettings(db, user.id, changes);
    console.log(`[api/updates] user ${user.id} daily email ${changes.daily_email ? "on" : "off"}`);
    return Response.json({ settings: publicSettings(await getSettings(db, user.id)) });
  } catch (e) {
    return errorResponse(e, "api/updates");
  }
}
