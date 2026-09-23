import { promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { notFound } from "@/lib/api";
import { absolutePath, fileStream, getFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Serves stored files with HTTP Range support so `<video>` can seek and
 * providers can fetch reference media.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getFile(id);
  if (!record) return notFound("File not found");

  let size: number;
  try {
    size = (await fs.stat(absolutePath(record))).size;
  } catch {
    return notFound("File missing on disk");
  }

  const headers = new Headers({
    "Content-Type": record.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });

  const rangeHeader = request.headers.get("range");
  const match = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader) : null;
  if (match) {
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[2] && match[1] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const body = Readable.toWeb(fileStream(record, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  const body = Readable.toWeb(fileStream(record)) as ReadableStream;
  return new Response(body, { status: 200, headers });
}
