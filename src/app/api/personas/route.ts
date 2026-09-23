import { jsonError } from "@/lib/api";
import { createPersona, listPersonas } from "@/lib/pipeline/personas";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ personas: await listPersonas() });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const photos = [];
    for (const entry of form.getAll("photos")) {
      if (!(entry instanceof File)) continue;
      photos.push({
        data: new Uint8Array(await entry.arrayBuffer()),
        mime: entry.type,
        name: entry.name,
      });
    }
    const persona = await createPersona({
      name: String(form.get("name") ?? ""),
      consent: form.get("consent") === "on" || form.get("consent") === "true",
      photos,
    });
    return Response.json({ persona }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
