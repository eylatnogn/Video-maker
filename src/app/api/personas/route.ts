import { z } from "zod";
import { jsonError } from "@/lib/api";
import { createPersona, listPersonas } from "@/lib/pipeline/personas";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string(),
  consent: z.boolean(),
  photoFileIds: z.array(z.string().min(1)).min(1).max(20),
});

export async function GET() {
  return Response.json({ personas: await listPersonas() });
}

export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "name, consent and photoFileIds are required" }, { status: 400 });
    }
    const persona = await createPersona(parsed.data);
    return Response.json({ persona }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
