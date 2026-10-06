/* GET /api/status  ->  which server features have keys set */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ai: !!process.env.ANTHROPIC_API_KEY,
    jobs: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
  });
}
