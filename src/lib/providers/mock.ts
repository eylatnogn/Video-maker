import type {
  GenerationRequest,
  ProviderStatus,
  SubmitResult,
  VideoProvider,
} from "./types";

interface MockEntry {
  startedAt: number;
  req: GenerationRequest;
  canceled: boolean;
}

/**
 * Simulates a queue-based provider without network access. Each request
 * "renders" for `durationMs` and then resolves to `outputUrl`, or to the
 * driving clip itself when no output URL is configured, so the demo needs no
 * network at all. A driving video URL containing "fail" exercises the failure path.
 */
export class MockProvider implements VideoProvider {
  readonly id = "mock";
  private readonly entries = new Map<string, MockEntry>();
  private counter = 0;

  constructor(
    private readonly options: { outputUrl?: string; durationMs: number; now?: () => number },
  ) {}

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  async submit(req: GenerationRequest): Promise<SubmitResult> {
    const id = `mock_${++this.counter}_${req.jobId}`;
    this.entries.set(id, { startedAt: this.now(), req, canceled: false });
    return { providerRequestId: id };
  }

  async status(providerRequestId: string): Promise<ProviderStatus> {
    const entry = this.entries.get(providerRequestId);
    if (!entry) return { state: "failed", error: "Unknown mock request" };
    if (entry.canceled) return { state: "failed", error: "Canceled" };
    if (entry.req.drivingVideoUrl.includes("fail")) {
      return { state: "failed", error: "Mock provider was asked to fail" };
    }
    const elapsed = this.now() - entry.startedAt;
    const progress = Math.min(1, elapsed / this.options.durationMs);
    if (progress >= 1) {
      return { state: "completed", progress: 1, outputUrl: this.options.outputUrl ?? entry.req.drivingVideoUrl };
    }
    return {
      state: progress === 0 ? "queued" : "processing",
      progress,
      logs: [`mock render ${Math.round(progress * 100)}%`],
    };
  }

  async cancel(providerRequestId: string): Promise<void> {
    const entry = this.entries.get(providerRequestId);
    if (entry) entry.canceled = true;
  }
}
