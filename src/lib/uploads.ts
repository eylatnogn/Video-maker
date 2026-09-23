import { config } from "./config";
import { ValidationError } from "./pipeline/personas";
import { IMAGE_MIMES, VIDEO_MIMES } from "./storage";

export type UploadKind = "image" | "video";

export function parseKind(value: unknown): UploadKind {
  if (value === "image" || value === "video") return value;
  throw new ValidationError("kind must be image or video");
}

export function allowedMimes(kind: UploadKind): string[] {
  return [...(kind === "image" ? IMAGE_MIMES : VIDEO_MIMES)];
}

export function maxBytes(kind: UploadKind): number {
  const { limits } = config();
  return kind === "image" ? limits.maxPhotoBytes : limits.maxVideoBytes;
}

export function assertUploadAllowed(kind: UploadKind, mime: string, size: number): void {
  if (!allowedMimes(kind).includes(mime)) {
    throw new ValidationError(`Unsupported ${kind} type: ${mime || "unknown"}`);
  }
  if (size === 0) throw new ValidationError("File is empty");
  if (size > maxBytes(kind)) {
    throw new ValidationError(`File is larger than ${Math.round(maxBytes(kind) / 1024 / 1024)} MB`);
  }
}
