import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { del, head, put } from "@vercel/blob";
import { config } from "./config";
import { newId, nowIso } from "./ids";
import { store } from "./store";
import type { FileRecord } from "./types";

/**
 * Blob storage with two backends.
 *
 * - local: files under `<DATA_DIR>/files`, streamed by `/api/files/[id]`.
 * - blob:  Vercel Blob objects with public URLs; `/api/files/[id]` redirects.
 *
 * Callers only ever hold a `FileRecord`, so the backend is invisible to them.
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

export function extensionFor(mime: string): string {
  return EXT_BY_MIME[mime] ?? "bin";
}

function filesRoot(): string {
  return path.join(config().dataDir, "files");
}

async function record(partial: Omit<FileRecord, "createdAt">): Promise<FileRecord> {
  const rec: FileRecord = { ...partial, createdAt: nowIso() };
  await store().mutate((db) => {
    db.files.push(rec);
  });
  return rec;
}

export async function saveFile(data: Uint8Array, mime: string, originalName: string): Promise<FileRecord> {
  const cfg = config();
  const id = newId("file");
  const relPath = `${id}.${extensionFor(mime)}`;
  if (cfg.fileBackend === "blob") {
    const blob = await put(`uploads/${relPath}`, Buffer.from(data), {
      access: "public",
      contentType: mime,
      addRandomSuffix: false,
      token: cfg.blob.token,
    });
    return record({ id, backend: "blob", relPath: blob.pathname, url: blob.url, mime, size: data.byteLength, originalName });
  }
  await fs.mkdir(filesRoot(), { recursive: true });
  await fs.writeFile(path.join(filesRoot(), relPath), data);
  return record({ id, backend: "local", relPath, mime, size: data.byteLength, originalName });
}

/**
 * Registers an object the browser uploaded straight to Vercel Blob. The
 * object is verified with the store before it is trusted.
 */
export async function registerBlobUpload(url: string, originalName: string): Promise<FileRecord> {
  const cfg = config();
  if (cfg.fileBackend !== "blob") throw new Error("Direct uploads are only available with the blob backend");
  const meta = await head(url, { token: cfg.blob.token });
  return record({
    id: newId("file"),
    backend: "blob",
    relPath: meta.pathname,
    url: meta.url,
    mime: meta.contentType,
    size: meta.size,
    originalName,
  });
}

export async function getFile(id: string): Promise<FileRecord | undefined> {
  const db = await store().read();
  return db.files.find((f) => f.id === id);
}

export function absolutePath(rec: FileRecord): string {
  return path.join(filesRoot(), rec.relPath);
}

export function fileStream(rec: FileRecord, range?: { start: number; end: number }) {
  return createReadStream(absolutePath(rec), range);
}

/** Absolute URL a third-party provider can fetch. Local files need PUBLIC_BASE_URL to be reachable from the internet. */
export function publicFileUrl(rec: FileRecord): string {
  return rec.url ?? `${config().publicBaseUrl}/api/files/${rec.id}`;
}

/** Download a remote asset (for example a finished render) into storage. */
export async function importRemoteFile(url: string, originalName: string): Promise<FileRecord> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const mime = (res.headers.get("content-type") ?? "video/mp4").split(";")[0].trim();
  const buf = new Uint8Array(await res.arrayBuffer());
  return saveFile(buf, mime, originalName);
}

export async function deleteFile(rec: FileRecord): Promise<void> {
  if (rec.backend === "blob" && rec.url) {
    await del(rec.url, { token: config().blob.token });
  } else {
    await fs.rm(absolutePath(rec), { force: true });
  }
  await store().mutate((db) => {
    db.files = db.files.filter((f) => f.id !== rec.id);
  });
}
