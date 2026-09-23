import type { GenerationMode } from "../types";

/**
 * The contract every video backend implements.
 *
 * The app never talks to a vendor directly; it submits a request, polls for
 * status, and receives a URL. That keeps vendor churn (models get replaced
 * every few months) out of the UI and the job pipeline.
 */
export interface GenerationRequest {
  jobId: string;
  /** Publicly fetchable image URLs of the person, best photo first. */
  referenceImageUrls: string[];
  /** Publicly fetchable URL of the video whose motion (and audio) we reuse. */
  drivingVideoUrl: string;
  /** "replace" swaps the subject inside the driving video; "animate" renders the reference in a fresh scene. */
  mode: GenerationMode;
  prompt?: string;
  /** Where the provider may POST completion callbacks, if it supports webhooks. */
  webhookUrl?: string;
}

export interface SubmitResult {
  providerRequestId: string;
  /** Anything the provider needs back when polling (URLs, tokens). Persisted on the job. */
  meta?: Record<string, string>;
}

export type ProviderState = "queued" | "processing" | "completed" | "failed";

export interface ProviderStatus {
  state: ProviderState;
  /** 0..1 when the provider reports it. */
  progress?: number;
  outputUrl?: string;
  error?: string;
  logs?: string[];
}

export interface VideoProvider {
  readonly id: string;
  submit(req: GenerationRequest): Promise<SubmitResult>;
  status(providerRequestId: string, meta?: Record<string, string>): Promise<ProviderStatus>;
  cancel?(providerRequestId: string, meta?: Record<string, string>): Promise<void>;
}
