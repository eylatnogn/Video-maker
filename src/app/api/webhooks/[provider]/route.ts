import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import { failJob, finalize, getJob } from "@/lib/pipeline/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Optional completion callback. The poll loop already handles completion,
 * so this only shortens the wait. Enabled by setting WEBHOOK_SECRET.
 *
 * fal payload: { request_id, status: "OK" | "ERROR", payload?: { video: { url } }, error?: string }
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const secret = config().webhookSecret;
  if (!secret) return Response.json({ error: "Webhooks disabled" }, { status: 404 });

  const url = new URL(request.url);
  const given = url.searchParams.get("secret") ?? "";
  if (!safeEqual(given, secret)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const jobId = url.searchParams.get("job") ?? "";
  const job = await getJob(jobId);
  if (!job) return Response.json({ error: "Unknown job" }, { status: 404 });
  if (job.provider !== provider) return Response.json({ error: "Provider mismatch" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as {
    request_id?: string;
    status?: string;
    payload?: { video?: { url?: string } };
    error?: string;
  };
  if (body.request_id && job.providerRequestId && body.request_id !== job.providerRequestId) {
    return Response.json({ error: "Request id mismatch" }, { status: 400 });
  }

  if (body.status === "OK" && body.payload?.video?.url) {
    await finalize(job.id, body.payload.video.url);
  } else if (body.status === "ERROR") {
    await failJob(job.id, body.error ?? "Provider reported an error");
  }
  return Response.json({ ok: true });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
