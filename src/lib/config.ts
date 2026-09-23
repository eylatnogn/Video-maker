import path from "node:path";

/**
 * All runtime configuration comes from environment variables so the same
 * build runs locally (JSON file + local disk + mock provider) and on Vercel
 * (Upstash Redis + Vercel Blob + fal.ai) without code changes.
 */
export interface AppConfig {
  dataDir: string;
  publicBaseUrl: string;
  provider: "mock" | "fal";
  /** Where the database lives. Auto-detected from the Redis env vars unless STORE_BACKEND is set. */
  storeBackend: "json" | "redis";
  /** Where uploaded and rendered files live. Auto-detected from BLOB_READ_WRITE_TOKEN unless FILE_BACKEND is set. */
  fileBackend: "local" | "blob";
  redis: { url: string | undefined; token: string | undefined };
  blob: { token: string | undefined };
  fal: {
    key: string | undefined;
    /** Model used for mode "replace" (swap the person inside the driving clip). */
    modelId: string;
    /** Model used for mode "animate" (drive the reference photo with the clip's motion). */
    animateModelId: string;
    baseUrl: string;
  };
  mock: {
    /** When unset, the mock returns the driving clip itself so the demo works offline. */
    outputUrl: string | undefined;
    durationMs: number;
  };
  webhookSecret: string | undefined;
  /** Protects the cron endpoint that refreshes pending jobs. Vercel sets the matching header automatically. */
  cronSecret: string | undefined;
  /** Give up on a job after this long. */
  jobTimeoutMs: number;
  limits: {
    maxPhotos: number;
    minPhotos: number;
    maxPhotoBytes: number;
    maxVideoBytes: number;
  };
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const provider = env.VIDEO_PROVIDER === "fal" ? "fal" : "mock";
  const redisUrl = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const redisToken = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  const storeBackend =
    env.STORE_BACKEND === "redis" || env.STORE_BACKEND === "json"
      ? env.STORE_BACKEND
      : redisUrl && redisToken
        ? "redis"
        : "json";
  const fileBackend =
    env.FILE_BACKEND === "blob" || env.FILE_BACKEND === "local"
      ? env.FILE_BACKEND
      : env.BLOB_READ_WRITE_TOKEN
        ? "blob"
        : "local";
  return {
    dataDir: path.resolve(/*turbopackIgnore: true*/ env.DATA_DIR ?? "./data"),
    publicBaseUrl: (
      env.PUBLIC_BASE_URL ??
      (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ??
      "http://localhost:3000"
    ).replace(/\/$/, ""),
    provider,
    storeBackend,
    fileBackend,
    redis: { url: redisUrl, token: redisToken },
    blob: { token: env.BLOB_READ_WRITE_TOKEN },
    fal: {
      key: env.FAL_KEY,
      modelId: env.FAL_MODEL_ID ?? "fal-ai/wan/v2.2-14b/animate/replace",
      animateModelId: env.FAL_ANIMATE_MODEL_ID ?? "fal-ai/wan/v2.2-14b/animate/move",
      baseUrl: (env.FAL_QUEUE_URL ?? "https://queue.fal.run").replace(/\/$/, ""),
    },
    mock: {
      outputUrl: env.MOCK_OUTPUT_URL || undefined,
      durationMs: int(env.MOCK_DURATION_MS, 8000),
    },
    webhookSecret: env.WEBHOOK_SECRET,
    cronSecret: env.CRON_SECRET,
    jobTimeoutMs: int(env.JOB_TIMEOUT_MS, 30 * 60 * 1000),
    limits: {
      maxPhotos: 10,
      minPhotos: 1,
      maxPhotoBytes: 10 * 1024 * 1024,
      maxVideoBytes: 200 * 1024 * 1024,
    },
  };
}

let cached: AppConfig | null = null;

export function config(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Test hook: drop the cached config so a new environment is picked up. */
export function resetConfigForTests(): void {
  cached = null;
}
