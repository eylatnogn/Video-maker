import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetConfigForTests } from "@/lib/config";
import { setProviderForTests } from "@/lib/providers";
import { saveFile } from "@/lib/storage";
import { resetStoreForTests } from "@/lib/store";
import type { FileRecord } from "@/lib/types";

/** Points DATA_DIR at a fresh temp directory and clears cached singletons. */
export async function freshDataDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "video-maker-test-"));
  process.env.DATA_DIR = dir;
  process.env.PUBLIC_BASE_URL = "http://test.local";
  process.env.VIDEO_PROVIDER = "mock";
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.FILE_BACKEND;
  delete process.env.STORE_BACKEND;
  resetConfigForTests();
  resetStoreForTests();
  setProviderForTests(null);
  return dir;
}

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

export function photoFile(name = "a.png"): Promise<FileRecord> {
  return saveFile(PNG_BYTES, "image/png", name);
}

export function fileRecord(id: string): FileRecord {
  return { id, backend: "local", relPath: "", mime: "", size: 0, originalName: "", createdAt: "" };
}
