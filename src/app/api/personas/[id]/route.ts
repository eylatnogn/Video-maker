import { jsonError, notFound } from "@/lib/api";
import { deletePersona, getPersona, setPrimaryPhoto } from "@/lib/pipeline/personas";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const persona = await getPersona(id);
  return persona ? Response.json({ persona }) : notFound("Persona not found");
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { primaryPhotoId?: string };
    if (!body.primaryPhotoId) return Response.json({ error: "primaryPhotoId required" }, { status: 400 });
    return Response.json({ persona: await setPrimaryPhoto(id, body.primaryPhotoId) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return (await deletePersona(id)) ? new Response(null, { status: 204 }) : notFound("Persona not found");
}
