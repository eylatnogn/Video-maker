import path from "node:path";

/**
 * All runtime configuration comes from environment variables so the same
 * build runs locally with the mock provider and in production with a real one.
 */
export interface AppConfig {
  dataDir: string;
  publicBaseUrl: string;
  provider: "mock" | "fal";
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
  /** Polling interval for provider status checks. */
  pollIntervalMs: number;
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
  return {
    dataDir: path.resolve(/*turbopackIgnore: true*/ env.DATA_DIR ?? "./data"),
    publicBaseUrl: (env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    provider,
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
    pollIntervalMs: int(env.POLL_INTERVAL_MS, 4000),
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
