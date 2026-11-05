import { appSecret } from "@/lib/app-config";
import { runSync } from "@/lib/sync/engine";
import { secretsMatch } from "@/lib/token-crypto";

export const maxDuration = 300;

/**
 * Vercel Cron calls this once a day (see vercel.json), sending CRON_SECRET as a
 * bearer token. With no secret configured it refuses every request.
 */
export async function GET(request: Request) {
  const expected = appSecret();
  const provided = request.headers.get("authorization");
  if (!expected || !secretsMatch(provided, `Bearer ${expected}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const outcome = await runSync("scheduled");
  return Response.json(outcome, {
    status: outcome.status === "failed" ? 500 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
