import { z } from "zod";
import { jsonError } from "@/lib/api";
import { config } from "@/lib/config";
import { ValidationError } from "@/lib/pipeline/personas";
import { registerBlobUpload } from "@/lib/storage";
import { assertUploadAllowed, parseKind } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const Body = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(200),
  kind: z.enum(["image", "video"]),
});

/** Registers an object the browser uploaded directly to Vercel Blob. */
export async function POST(request: Request) {
  try {
    if (config().fileBackend !== "blob") throw new ValidationError("Direct uploads are disabled");
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) throw new ValidationError("url, name and kind are required");
    const { url, name, kind } = parsed.data;
    const record = await registerBlobUpload(url, name);
    assertUploadAllowed(parseKind(kind), record.mime, record.size);
    return Response.json({ file: record }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
