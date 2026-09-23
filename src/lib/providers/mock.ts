import type {
  GenerationRequest,
  ProviderStatus,
  SubmitResult,
  VideoProvider,
} from "./types";

/**
 * Simulates a queue-based provider without network access or state.
 *
 * Everything needed to answer a status query is encoded in the request id,
 * so it behaves the same across serverless instances. A request "renders"
 * for `durationMs` and then resolves to `outputUrl`, or to the driving clip
 * itself when no output URL is configured, so the demo needs no network at
 * all. A driving video URL containing "fail" exercises the failure path.
 */
export class MockProvider implements VideoProvider {
  readonly id = "mock";

  constructor(
    private readonly options: { outputUrl?: string; durationMs: number; now?: () => number },
  ) {}

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  async submit(req: GenerationRequest): Promise<SubmitResult> {
    const fail = req.drivingVideoUrl.includes("fail") ? "1" : "0";
    return {
      providerRequestId: `mock_${this.now()}_${fail}_${req.jobId}`,
      meta: { outputUrl: this.options.outputUrl ?? req.drivingVideoUrl },
    };
  }

  async status(providerRequestId: string, meta?: Record<string, string>): Promise<ProviderStatus> {
    const match = /^mock_(\d+)_([01])_/.exec(providerRequestId);
    if (!match) return { state: "failed", error: "Unknown mock request" };
    if (match[2] === "1") return { state: "failed", error: "Mock provider was asked to fail" };
    const elapsed = this.now() - Number(match[1]);
    const progress = Math.min(1, elapsed / this.options.durationMs);
    if (progress >= 1) {
      return { state: "completed", progress: 1, outputUrl: meta?.outputUrl };
    }
    return {
      state: progress === 0 ? "queued" : "processing",
      progress,
      logs: [`mock render ${Math.round(progress * 100)}%`],
    };
  }

  async cancel(): Promise<void> {
    /* nothing to cancel: the job record is the source of truth */
  }
}
