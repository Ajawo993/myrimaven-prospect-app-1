/* GET /api/status  ->  which server features have keys set */
export const dynamic = "force-dynamic";

import { aiProvider } from "@/lib/server";
import { updatesConfig } from "@/lib/updates";

export function GET() {
  return Response.json({
    ai: !!aiProvider(),
    web: aiProvider() === "anthropic", // web search agents (Research with AI, Find organizations) need Claude
    jobs: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
    email: updatesConfig().email, // daily update email (Resend)
    calendar: updatesConfig().calendar, // Google Calendar follow-ups
  });
}
