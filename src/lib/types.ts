/** Shared domain types for the avatar video generator. */

export type ISODate = string;

export type FileBackend = "local" | "blob";

export interface FileRecord {
  id: string;
  backend: FileBackend;
  /** Local backend: path relative to the storage root. Blob backend: the blob pathname. */
  relPath: string;
  /** Blob backend only: the public URL of the object. */
  url?: string;
  mime: string;
  size: number;
  originalName: string;
  createdAt: ISODate;
}

export interface Persona {
  id: string;
  name: string;
  photoIds: string[];
  /** The photo the provider receives as the identity reference. */
  primaryPhotoId: string;
  consent: {
    confirmedAt: ISODate;
    statement: string;
  };
  createdAt: ISODate;
}

export type TemplateCategory = "dance" | "sing" | "act" | "custom";

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  /** Seconds. Used for UI and cost estimates only. */
  durationSec: number;
  /** Public path or absolute URL of the driving video, or null when the media is missing. */
  drivingVideoUrl: string | null;
  /** Prompt hint passed to providers that accept text. */
  promptHint?: string;
}

export type GenerationMode = "replace" | "animate";

export type JobStatus =
  | "queued"
  | "submitted"
  | "processing"
  | "completed"
  | "failed"
  | "canceled";

export interface JobEvent {
  at: ISODate;
  status: JobStatus;
  message: string;
}

export interface Job {
  id: string;
  personaId: string;
  /** Either a catalogue template or an uploaded driving video. */
  templateId?: string;
  drivingVideoFileId?: string;
  mode: GenerationMode;
  prompt?: string;
  status: JobStatus;
  progress: number;
  provider: string;
  providerRequestId?: string;
  /** Opaque provider data needed to poll or cancel (for example fal queue URLs). */
  providerMeta?: Record<string, string>;
  /** Local copy of the output once downloaded. */
  outputFileId?: string;
  /** Remote URL returned by the provider, kept as a fallback. */
  outputUrl?: string;
  error?: string;
  events: JobEvent[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Database {
  files: FileRecord[];
  personas: Persona[];
  jobs: Job[];
}
