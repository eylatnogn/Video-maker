import { config } from "../config";
import { newId, nowIso } from "../ids";
import { IMAGE_MIMES } from "../storage";
import { store } from "../store";
import type { Persona } from "../types";

export const CONSENT_STATEMENT =
  "I confirm these photos are of me, I am at least 18, and I consent to generating videos of my likeness.";

export class ValidationError extends Error {
  readonly status = 400;
}

export interface CreatePersonaInput {
  name: string;
  /** Ids of files already uploaded through the uploads API, best photo first. */
  photoFileIds: string[];
  consent: boolean;
}

/**
 * Creates a persona from previously uploaded photos.
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
  const ids = [...new Set(input.photoFileIds)];
  if (ids.length < limits.minPhotos) {
    throw new ValidationError(`Upload at least ${limits.minPhotos} photo`);
  }
  if (ids.length > limits.maxPhotos) {
    throw new ValidationError(`Upload at most ${limits.maxPhotos} photos`);
  }
  const db = await store().read();
  for (const id of ids) {
    const file = db.files.find((f) => f.id === id);
    if (!file) throw new ValidationError(`Unknown photo ${id}`);
    if (!IMAGE_MIMES.has(file.mime)) {
      throw new ValidationError(`${file.originalName} is not a supported image`);
    }
    if (file.size === 0) throw new ValidationError(`${file.originalName} is empty`);
    if (file.size > limits.maxPhotoBytes) {
      throw new ValidationError(`${file.originalName} is larger than ${limits.maxPhotoBytes / 1024 / 1024} MB`);
    }
  }

  const persona: Persona = {
    id: newId("persona"),
    name,
    photoIds: ids,
    primaryPhotoId: ids[0],
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
