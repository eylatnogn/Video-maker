import { config } from "../config";
import { newId, nowIso } from "../ids";
import { provider as defaultProvider } from "../providers";
import type { VideoProvider } from "../providers/types";
import { importRemoteFile, publicFileUrl } from "../storage";
import { store } from "../store";
import { getTemplate } from "../templates";
import type { GenerationMode, Job, JobStatus } from "../types";
import { ValidationError } from "./personas";

export interface CreateJobInput {
  personaId: string;
  templateId?: string;
  drivingVideoFileId?: string;
  mode?: GenerationMode;
  prompt?: string;
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

export async function createJob(input: CreateJobInput): Promise<Job> {
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
  return job;
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
  const referenceImageUrls = ordered.map(publicFileUrl);

  let drivingVideoUrl: string;
  let prompt = job.prompt;
  if (job.drivingVideoFileId) {
    drivingVideoUrl = publicFileUrl(job.drivingVideoFileId);
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

export interface RunOptions {
  provider?: VideoProvider;
  pollIntervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const running = new Set<string>();

/**
 * Drives one job from "queued" to a terminal state: submit, poll until the
 * provider finishes, then copy the output into local storage.
 *
 * It is idempotent per process (a second call for a running job returns
 * immediately) and survives a restart because a job found in "submitted" or
 * "processing" is resumed from its persisted provider request id.
 */
export async function runJob(id: string, opts: RunOptions = {}): Promise<Job> {
  if (running.has(id)) return (await getJob(id))!;
  running.add(id);
  try {
    return await runJobInner(id, opts);
  } finally {
    running.delete(id);
  }
}

async function runJobInner(id: string, opts: RunOptions): Promise<Job> {
  const cfg = config();
  const videoProvider = opts.provider ?? defaultProvider();
  const pollIntervalMs = opts.pollIntervalMs ?? cfg.pollIntervalMs;
  const timeoutMs = opts.timeoutMs ?? cfg.jobTimeoutMs;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  let job = await getJob(id);
  if (!job) throw new Error(`Job ${id} not found`);
  if (isTerminal(job.status)) return job;

  if (!job.providerRequestId) {
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
      job = await patchJob(
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

  const startedAt = Date.parse(job.updatedAt);
  let lastLogged = "";
  for (;;) {
    const fresh = await getJob(id);
    if (!fresh || isTerminal(fresh.status)) return fresh ?? job;
    if (Date.now() - startedAt > timeoutMs) {
      return patchJob(id, { status: "failed", error: "Timed out waiting for provider" }, "Timed out");
    }

    let status;
    try {
      status = await videoProvider.status(fresh.providerRequestId!, fresh.providerMeta);
    } catch (err) {
      await patchJob(id, {}, `Status check error: ${errorMessage(err)}`);
      await sleep(pollIntervalMs);
      continue;
    }

    const lastLog = status.logs?.at(-1);
    const logMessage = lastLog && lastLog !== lastLogged ? lastLog : undefined;
    if (logMessage) lastLogged = logMessage;

    if (status.state === "failed") {
      return patchJob(id, { status: "failed", error: status.error ?? "Provider failed" }, `Failed: ${status.error ?? "unknown"}`);
    }
    if (status.state === "completed" && status.outputUrl) {
      return finalize(id, status.outputUrl);
    }
    const nextStatus: JobStatus = status.state === "processing" ? "processing" : "submitted";
    await patchJob(
      id,
      { status: nextStatus, progress: status.progress ?? fresh.progress },
      nextStatus !== fresh.status ? `Provider is ${status.state}` : logMessage,
    );
    await sleep(pollIntervalMs);
  }
}

/** Records the provider output. Used by the poll loop and by webhooks. */
export async function finalize(id: string, outputUrl: string): Promise<Job> {
  const job = await getJob(id);
  if (!job) throw new Error(`Job ${id} not found`);
  if (isTerminal(job.status)) return job;
  const ownFileId = localFileId(outputUrl);
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

/** On boot, pick up jobs that were mid-flight when the process last stopped. */
export async function resumeUnfinishedJobs(opts: RunOptions = {}): Promise<string[]> {
  const jobs = await listJobs();
  const pending = jobs.filter((j) => !isTerminal(j.status));
  for (const job of pending) void runJob(job.id, opts).catch((err) => console.error(`resume ${job.id}`, err));
  return pending.map((j) => j.id);
}

/** If the URL points at this app's own file route, return that file id. */
function localFileId(url: string): string | undefined {
  const prefix = `${config().publicBaseUrl}/api/files/`;
  if (!url.startsWith(prefix)) return undefined;
  const id = url.slice(prefix.length).split(/[/?#]/)[0];
  return id.startsWith("file_") ? id : undefined;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
