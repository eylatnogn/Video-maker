import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { jsonError } from "@/lib/api";
import { config } from "@/lib/config";
import { ValidationError } from "@/lib/pipeline/personas";
import { allowedMimes, maxBytes, parseKind } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * Issues short-lived client tokens so the browser can upload straight to
 * Vercel Blob, bypassing the serverless body-size limit. The browser then
 * registers the finished object with POST /api/files.
 */
export async function POST(request: Request) {
  try {
    const cfg = config();
    if (cfg.fileBackend !== "blob") throw new ValidationError("Direct uploads are disabled");
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      token: cfg.blob.token,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = clientPayload ? (JSON.parse(clientPayload) as { kind?: unknown }) : {};
        const kind = parseKind(payload.kind);
        if (!pathname.startsWith("uploads/")) throw new ValidationError("Invalid upload path");
        return {
          allowedContentTypes: allowedMimes(kind),
          maximumSizeInBytes: maxBytes(kind),
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ kind }),
        };
      },
      onUploadCompleted: async () => {
        /* The browser registers the file via /api/files; nothing to do here. */
      },
    });
    return Response.json(result);
  } catch (err) {
    return jsonError(err);
  }
}
