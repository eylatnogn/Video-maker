import { after } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import { createJob, listJobs, runJob } from "@/lib/pipeline/jobs";

export const dynamic = "force-dynamic";

const CreateJobSchema = z
  .object({
    personaId: z.string().min(1),
    templateId: z.string().min(1).optional(),
    drivingVideoFileId: z.string().min(1).optional(),
    mode: z.enum(["replace", "animate"]).optional(),
    prompt: z.string().max(500).optional(),
  })
  .refine((v) => v.templateId || v.drivingVideoFileId, {
    message: "templateId or drivingVideoFileId is required",
  });

export async function GET() {
  return Response.json({ jobs: await listJobs() });
}

export async function POST(request: Request) {
  try {
    const parsed = CreateJobSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
    }
    const job = await createJob(parsed.data);
    // The render runs after the response is sent. Move this to a worker queue
    // once you run more than one server instance.
    after(() => runJob(job.id).catch((err) => console.error(`job ${job.id}`, err)));
    return Response.json({ job }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
