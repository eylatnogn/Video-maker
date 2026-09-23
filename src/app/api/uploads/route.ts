import { jsonError } from "@/lib/api";
import { config } from "@/lib/config";
import { ValidationError } from "@/lib/pipeline/personas";
import { saveFile, VIDEO_MIMES } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Upload a custom driving video (the clip whose motion gets copied). */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const video = form.get("video");
    if (!(video instanceof File)) throw new ValidationError("video file is required");
    if (!VIDEO_MIMES.has(video.type)) throw new ValidationError(`Unsupported video type: ${video.type || "unknown"}`);
    if (video.size > config().limits.maxVideoBytes) throw new ValidationError("Video is too large");
    const record = await saveFile(new Uint8Array(await video.arrayBuffer()), video.type, video.name);
    return Response.json({ file: record }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
