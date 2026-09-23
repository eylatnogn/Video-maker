"use client";

import { upload } from "@vercel/blob/client";
import type { FileRecord } from "@/lib/types";

export type UploadKind = "image" | "video";

interface PublicConfig {
  provider: string;
  directUpload: boolean;
  limits: { maxPhotos: number; minPhotos: number; maxPhotoBytes: number; maxVideoBytes: number };
}

let cached: Promise<PublicConfig> | null = null;

export function publicConfig(): Promise<PublicConfig> {
  if (!cached) {
    cached = fetch("/api/config").then(async (r) => {
      if (!r.ok) throw new Error("Could not load app config");
      return (await r.json()) as PublicConfig;
    });
    cached.catch(() => (cached = null));
  }
  return cached;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    return ((await res.json()) as { error?: string }).error ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Uploads one file and returns its record.
 *
 * With the blob backend the bytes go from the browser straight to Vercel
 * Blob (the API only issues a token), which sidesteps the platform's request
 * body limit. Otherwise the file is posted to the API as multipart.
 */
export async function uploadFile(file: File, kind: UploadKind): Promise<FileRecord> {
  const cfg = await publicConfig();
  const max = kind === "image" ? cfg.limits.maxPhotoBytes : cfg.limits.maxVideoBytes;
  if (file.size > max) throw new Error(`${file.name} is larger than ${Math.round(max / 1024 / 1024)} MB`);

  if (cfg.directUpload) {
    const blob = await upload(`uploads/${file.name}`, file, {
      access: "public",
      handleUploadUrl: "/api/uploads/token",
      clientPayload: JSON.stringify({ kind }),
      contentType: file.type,
    });
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: blob.url, name: file.name, kind }),
    });
    if (!res.ok) throw new Error(await readError(res, "Could not register upload"));
    return ((await res.json()) as { file: FileRecord }).file;
  }

  const form = new FormData();
  form.set("kind", kind);
  form.set("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res, "Upload failed"));
  return ((await res.json()) as { file: FileRecord }).file;
}
