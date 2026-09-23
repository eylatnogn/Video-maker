import { config } from "../config";
import { newId, nowIso } from "../ids";
import { IMAGE_MIMES, saveFile } from "../storage";
import { store } from "../store";
import type { Persona } from "../types";

export const CONSENT_STATEMENT =
  "I confirm these photos are of me, I am at least 18, and I consent to generating videos of my likeness.";

export class ValidationError extends Error {
  readonly status = 400;
}

export interface PhotoUpload {
  data: Uint8Array;
  mime: string;
  name: string;
}

export interface CreatePersonaInput {
  name: string;
  photos: PhotoUpload[];
  consent: boolean;
}

/**
 * Creates a persona from uploaded photos.
 *
 * The consent checkbox is the only gate here. A production deployment must
 * add something stronger (a live selfie compared against the uploads, or an
 * identity check) because a checkbox does not stop someone uploading a
 * photo of somebody else.
 */
export async function createPersona(input: CreatePersonaInput): Promise<Persona> {
  const { limits } = config();
  const name = input.name.trim();
  if (!name) throw new ValidationError("Name is required");
  if (name.length > 60) throw new ValidationError("Name must be 60 characters or fewer");
  if (!input.consent) throw new ValidationError("You must confirm the photos are of you");
  if (input.photos.length < limits.minPhotos) {
    throw new ValidationError(`Upload at least ${limits.minPhotos} photo`);
  }
  if (input.photos.length > limits.maxPhotos) {
    throw new ValidationError(`Upload at most ${limits.maxPhotos} photos`);
  }
  for (const photo of input.photos) {
    if (!IMAGE_MIMES.has(photo.mime)) {
      throw new ValidationError(`Unsupported image type: ${photo.mime || "unknown"}`);
    }
    if (photo.data.byteLength === 0) throw new ValidationError(`${photo.name} is empty`);
    if (photo.data.byteLength > limits.maxPhotoBytes) {
      throw new ValidationError(`${photo.name} is larger than ${limits.maxPhotoBytes / 1024 / 1024} MB`);
    }
  }

  const records = [];
  for (const photo of input.photos) records.push(await saveFile(photo.data, photo.mime, photo.name));

  const persona: Persona = {
    id: newId("persona"),
    name,
    photoIds: records.map((r) => r.id),
    primaryPhotoId: records[0].id,
    consent: { confirmedAt: nowIso(), statement: CONSENT_STATEMENT },
    createdAt: nowIso(),
  };
  await store().mutate((db) => {
    db.personas.push(persona);
  });
  return persona;
}

export async function listPersonas(): Promise<Persona[]> {
  const db = await store().read();
  return [...db.personas].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPersona(id: string): Promise<Persona | undefined> {
  const db = await store().read();
  return db.personas.find((p) => p.id === id);
}

export async function setPrimaryPhoto(personaId: string, photoId: string): Promise<Persona> {
  return store().mutate((db) => {
    const persona = db.personas.find((p) => p.id === personaId);
    if (!persona) throw new ValidationError("Persona not found");
    if (!persona.photoIds.includes(photoId)) throw new ValidationError("Photo does not belong to persona");
    persona.primaryPhotoId = photoId;
    return persona;
  });
}

export async function deletePersona(id: string): Promise<boolean> {
  return store().mutate((db) => {
    const before = db.personas.length;
    db.personas = db.personas.filter((p) => p.id !== id);
    return db.personas.length !== before;
  });
}
