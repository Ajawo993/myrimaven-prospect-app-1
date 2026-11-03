/* GET /api/status  ->  which server features have keys set */
export const dynamic = "force-dynamic";

import { aiProvider } from "@/lib/server";

export function GET() {
  return Response.json({
    ai: !!aiProvider(),
    jobs: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
  });
}
