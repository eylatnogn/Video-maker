import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Short, URL-safe, unguessable identifiers with a type prefix (e.g. "job_k3j9..."). */
export function newId(prefix: string, length = 16): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}_${out}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
