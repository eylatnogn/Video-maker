import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import { refreshPendingJobs } from "@/lib/pipeline/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Advances every pending job. Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET`; anything else can call it the same
 * way. It is a safety net for jobs nobody is watching in the browser.
 */
export async function GET(request: Request) {
  const secret = config().cronSecret;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 404 });
  const given = request.headers.get("authorization") ?? "";
  if (!safeEqual(given, `Bearer ${secret}`)) return Response.json({ error: "Forbidden" }, { status: 401 });
  const jobs = await refreshPendingJobs();
  return Response.json({ refreshed: jobs.map((j) => ({ id: j.id, status: j.status })) });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
