import { config } from "../config";
import { newId, nowIso } from "../ids";
import { provider as defaultProvider } from "../providers";
import type { VideoProvider } from "../providers/types";
import { importRemoteFile, publicFileUrl } from "../storage";
import { store } from "../store";
import { getTemplate } from "../templates";
import type { GenerationMode, Job, JobStatus } from "../types";
import { ValidationError } from "./personas";

/**
 * Job lifecycle without a background process.
 *
 * - `createJob` validates, stores and submits to the provider in one go.
 * - `refreshJob` performs a single provider status check. It is called by
 *   the job endpoint whenever a client asks about a pending job, by the
 *   cron endpoint, and (indirectly) by the provider webhook. That keeps
 *   every request short, which is what serverless platforms require.
 */
export interface CreateJobInput {
  personaId: string;
  templateId?: string;
  drivingVideoFileId?: string;
  mode?: GenerationMode;
  prompt?: string;
}

export interface JobOptions {
  provider?: VideoProvider;
  now?: () => number;
}

const TERMINAL: ReadonlySet<JobStatus> = new Set(["completed", "failed", "canceled"]);

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL.has(status);
}

async function patchJob(id: string, patch: Partial<Job>, message?: string): Promise<Job> {
  return store().mutate((db) => {
    const job = db.jobs.find((j) => j.id === id);
    if (!job) throw new Error(`Job ${id} vanished`);
    Object.assign(job, patch, { updatedAt: nowIso() });
    if (message) job.events.push({ at: job.updatedAt, status: job.status, message });
    return structuredClone(job);
  });
}

export async function createJob(input: CreateJobInput, opts: JobOptions = {}): Promise<Job> {
  const db = await store().read();
  const persona = db.personas.find((p) => p.id === input.personaId);
  if (!persona) throw new ValidationError("Persona not found");
  if (!input.templateId && !input.drivingVideoFileId) {
    throw new ValidationError("Choose a template or upload a driving video");
  }
  if (input.templateId) {
    const template = await getTemplate(input.templateId);
    if (!template) throw new ValidationError("Template not found");
    if (!template.drivingVideoUrl) {
      throw new ValidationError("That template has no video clip installed yet");
    }
  }
  if (input.drivingVideoFileId && !db.files.some((f) => f.id === input.drivingVideoFileId)) {
    throw new ValidationError("Driving video not found");
  }
  const prompt = input.prompt?.trim();
  if (prompt && prompt.length > 500) throw new ValidationError("Prompt must be 500 characters or fewer");

  const now = nowIso();
  const job: Job = {
    id: newId("job"),
    personaId: input.personaId,
    templateId: input.templateId,
    drivingVideoFileId: input.drivingVideoFileId,
    mode: input.mode ?? "replace",
    prompt: prompt || undefined,
    status: "queued",
    progress: 0,
    provider: config().provider,
    events: [{ at: now, status: "queued", message: "Job created" }],
    createdAt: now,
    updatedAt: now,
  };
  await store().mutate((db) => {
    db.jobs.push(job);
  });
  return submitJob(job.id, opts);
}

export async function listJobs(): Promise<Job[]> {
  const db = await store().read();
  return [...db.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getJob(id: string): Promise<Job | undefined> {
  const db = await store().read();
  return db.jobs.find((j) => j.id === id);
}

export async function cancelJob(id: string, videoProvider: VideoProvider = defaultProvider()): Promise<Job> {
  const job = await getJob(id);
  if (!job) throw new ValidationError("Job not found");
  if (isTerminal(job.status)) return job;
  if (job.providerRequestId && videoProvider.cancel) {
    try {
      await videoProvider.cancel(job.providerRequestId, job.providerMeta);
    } catch (err) {
      /* best effort: the local state wins */
      console.warn(`cancel failed for ${id}:`, err);
    }
  }
  return patchJob(id, { status: "canceled" }, "Canceled by user");
}

/** Resolves the URLs a provider needs for this job. Throws if anything is missing. */
async function resolveInputs(job: Job): Promise<{ referenceImageUrls: string[]; drivingVideoUrl: string; prompt?: string }> {
  const db = await store().read();
  const persona = db.personas.find((p) => p.id === job.personaId);
  if (!persona) throw new Error("Persona was deleted");
  const ordered = [persona.primaryPhotoId, ...persona.photoIds.filter((p) => p !== persona.primaryPhotoId)];
  const referenceImageUrls = ordered.flatMap((id) => {
    const file = db.files.find((f) => f.id === id);
    return file ? [publicFileUrl(file)] : [];
  });
  if (referenceImageUrls.length === 0) throw new Error("Persona has no photos on file");

  let drivingVideoUrl: string;
  let prompt = job.prompt;
  if (job.drivingVideoFileId) {
    const file = db.files.find((f) => f.id === job.drivingVideoFileId);
    if (!file) throw new Error("Driving video is missing");
    drivingVideoUrl = publicFileUrl(file);
  } else {
    const template = await getTemplate(job.templateId ?? "");
    if (!template?.drivingVideoUrl) throw new Error("Template clip is missing");
    drivingVideoUrl = template.drivingVideoUrl.startsWith("http")
      ? template.drivingVideoUrl
      : `${config().publicBaseUrl}${template.drivingVideoUrl}`;
    prompt = prompt ?? template.promptHint;
  }
  return { referenceImageUrls, drivingVideoUrl, prompt };
}

/** Sends a queued job to the provider. Safe to call again: it is a no-op once submitted. */
export async function submitJob(id: string, opts: JobOptions = {}): Promise<Job> {
  const job = await getJob(id);
  if (!job) throw new Error(`Job ${id} not found`);
  if (job.providerRequestId || isTerminal(job.status)) return job;
  const cfg = config();
  const videoProvider = opts.provider ?? defaultProvider();
  try {
    const inputs = await resolveInputs(job);
    const webhookUrl = cfg.webhookSecret
      ? `${cfg.publicBaseUrl}/api/webhooks/${videoProvider.id}?job=${job.id}&secret=${encodeURIComponent(cfg.webhookSecret)}`
      : undefined;
    const submitted = await videoProvider.submit({
      jobId: job.id,
      referenceImageUrls: inputs.referenceImageUrls,
      drivingVideoUrl: inputs.drivingVideoUrl,
      mode: job.mode,
      prompt: inputs.prompt,
      webhookUrl,
    });
    return patchJob(
      id,
      {
        status: "submitted",
        provider: videoProvider.id,
        providerRequestId: submitted.providerRequestId,
        providerMeta: submitted.meta,
      },
      `Submitted to ${videoProvider.id} as ${submitted.providerRequestId}`,
    );
  } catch (err) {
    return patchJob(id, { status: "failed", error: errorMessage(err) }, `Submit failed: ${errorMessage(err)}`);
  }
}

/**
 * One provider status check. Returns the job unchanged when it is already
 * terminal, so it is cheap to call on every read of a job.
 */
export async function refreshJob(id: string, opts: JobOptions = {}): Promise<Job> {
  let job = await getJob(id);
  if (!job) throw new Error(`Job ${id} not found`);
  if (isTerminal(job.status)) return job;
  if (!job.providerRequestId) job = await submitJob(id, opts);
  if (isTerminal(job.status) || !job.providerRequestId) return job;

  const now = opts.now ? opts.now() : Date.now();
  if (now - Date.parse(job.createdAt) > config().jobTimeoutMs) {
    return patchJob(id, { status: "failed", error: "Timed out waiting for provider" }, "Timed out");
  }

  const videoProvider = opts.provider ?? defaultProvider();
  let status;
  try {
    status = await videoProvider.status(job.providerRequestId, job.providerMeta);
  } catch (err) {
    return patchJob(id, {}, `Status check error: ${errorMessage(err)}`);
  }

  if (status.state === "failed") {
    return patchJob(id, { status: "failed", error: status.error ?? "Provider failed" }, `Failed: ${status.error ?? "unknown"}`);
  }
  if (status.state === "completed" && status.outputUrl) {
    return finalize(id, status.outputUrl);
  }
  const nextStatus: JobStatus = status.state === "processing" ? "processing" : "submitted";
  const lastLog = status.logs?.at(-1);
  const alreadyLogged = lastLog !== undefined && job.events.some((e) => e.message === lastLog);
  return patchJob(
    id,
    { status: nextStatus, progress: status.progress ?? job.progress },
    nextStatus !== job.status ? `Provider is ${status.state}` : alreadyLogged ? undefined : lastLog,
  );
}

/** Refreshes every pending job. Used by the cron endpoint. */
export async function refreshPendingJobs(opts: JobOptions = {}): Promise<Job[]> {
  const pending = (await listJobs()).filter((j) => !isTerminal(j.status));
  const results: Job[] = [];
  for (const job of pending) {
    try {
      results.push(await refreshJob(job.id, opts));
    } catch (err) {
      console.error(`refresh ${job.id}`, err);
    }
  }
  return results;
}

/** Records the provider output. Used by the refresh path and by webhooks. */
export async function finalize(id: string, outputUrl: string): Promise<Job> {
  const job = await getJob(id);
  if (!job) throw new Error(`Job ${id} not found`);
  if (isTerminal(job.status)) return job;
  const ownFileId = await localFileId(outputUrl);
  if (ownFileId) {
    return patchJob(id, { status: "completed", progress: 1, outputUrl, outputFileId: ownFileId }, "Render ready");
  }
  try {
    const file = await importRemoteFile(outputUrl, `${id}.mp4`);
    return patchJob(id, { status: "completed", progress: 1, outputUrl, outputFileId: file.id }, "Render downloaded");
  } catch (err) {
    return patchJob(
      id,
      { status: "completed", progress: 1, outputUrl },
      `Render finished; local copy failed (${errorMessage(err)}), serving provider URL`,
    );
  }
}

export async function failJob(id: string, error: string): Promise<Job> {
  const job = await getJob(id);
  if (!job) throw new Error(`Job ${id} not found`);
  if (isTerminal(job.status)) return job;
  return patchJob(id, { status: "failed", error }, `Failed: ${error}`);
}

/** If the URL is one of our own stored files, return that file id. */
async function localFileId(url: string): Promise<string | undefined> {
  const prefix = `${config().publicBaseUrl}/api/files/`;
  if (url.startsWith(prefix)) {
    const id = url.slice(prefix.length).split(/[/?#]/)[0];
    return id.startsWith("file_") ? id : undefined;
  }
  const db = await store().read();
  return db.files.find((f) => f.url === url)?.id;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
