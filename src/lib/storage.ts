import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { config } from "./config";
import { newId, nowIso } from "./ids";
import { store } from "./store";
import type { FileRecord } from "./types";

/**
 * Local-disk blob storage. Files live under `<DATA_DIR>/files` and are served
 * by `/api/files/[id]`. Replace `saveFile`/`fileStream` with an S3/R2 client
 * for production; nothing else needs to change because callers only ever
 * hold a `FileRecord` id.
 */

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

function filesRoot(): string {
  return path.join(config().dataDir, "files");
}

export async function saveFile(
  data: Uint8Array,
  mime: string,
  originalName: string,
): Promise<FileRecord> {
  const ext = EXT_BY_MIME[mime] ?? "bin";
  const id = newId("file");
  const relPath = `${id}.${ext}`;
  const abs = path.join(filesRoot(), relPath);
  await fs.mkdir(filesRoot(), { recursive: true });
  await fs.writeFile(abs, data);
  const record: FileRecord = {
    id,
    relPath,
    mime,
    size: data.byteLength,
    originalName,
    createdAt: nowIso(),
  };
  await store().mutate((db) => {
    db.files.push(record);
  });
  return record;
}

export async function getFile(id: string): Promise<FileRecord | undefined> {
  const db = await store().read();
  return db.files.find((f) => f.id === id);
}

export function absolutePath(record: FileRecord): string {
  return path.join(filesRoot(), record.relPath);
}

export function fileStream(record: FileRecord, range?: { start: number; end: number }) {
  return createReadStream(absolutePath(record), range);
}

/** Absolute URL a third-party provider can fetch. Requires PUBLIC_BASE_URL to be reachable from the internet. */
export function publicFileUrl(fileId: string): string {
  return `${config().publicBaseUrl}/api/files/${fileId}`;
}

/** Download a remote asset (for example a finished render) into local storage. */
export async function importRemoteFile(url: string, originalName: string): Promise<FileRecord> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const mime = (res.headers.get("content-type") ?? "video/mp4").split(";")[0].trim();
  const buf = new Uint8Array(await res.arrayBuffer());
  return saveFile(buf, mime, originalName);
}
