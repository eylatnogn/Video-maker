import { jsonError } from "@/lib/api";
import { ValidationError } from "@/lib/pipeline/personas";
import { saveFile } from "@/lib/storage";
import { assertUploadAllowed, parseKind } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * Multipart upload through the server. Used when files live on local disk.
 * On Vercel the request body is capped at 4.5 MB, so the browser uploads
 * straight to Blob instead (see ./token and /api/files).
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const kind = parseKind(form.get("kind"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("file is required");
    assertUploadAllowed(kind, file.type, file.size);
    const record = await saveFile(new Uint8Array(await file.arrayBuffer()), file.type, file.name);
    return Response.json({ file: record }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
