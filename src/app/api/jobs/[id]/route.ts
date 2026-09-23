import { notFound } from "@/lib/api";
import { getJob, refreshJob } from "@/lib/pipeline/jobs";

export const dynamic = "force-dynamic";
/** A completed render is downloaded into storage during this request. */
export const maxDuration = 60;

/** Returns the job, checking with the provider first if it is still pending. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return notFound("Job not found");
  return Response.json({ job: await refreshJob(id) });
}
