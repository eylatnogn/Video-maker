import { jsonError } from "@/lib/api";
import { cancelJob } from "@/lib/pipeline/jobs";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return Response.json({ job: await cancelJob(id) });
  } catch (err) {
    return jsonError(err);
  }
}
