import { notFound } from "@/lib/api";
import { getJob } from "@/lib/pipeline/jobs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  return job ? Response.json({ job }) : notFound("Job not found");
}
