import { z } from "zod";
import { jsonError } from "@/lib/api";
import { createJob, listJobs } from "@/lib/pipeline/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

/** Creates the job and submits it to the provider before responding. */
export async function POST(request: Request) {
  try {
    const parsed = CreateJobSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
    }
    const job = await createJob(parsed.data);
    return Response.json({ job }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
