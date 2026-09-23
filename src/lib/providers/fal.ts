import type {
  GenerationRequest,
  ProviderStatus,
  SubmitResult,
  VideoProvider,
} from "./types";

/**
 * fal.ai queue adapter.
 *
 * Works with any fal model whose input is `{ video_url, image_url, prompt? }`
 * and whose output is `{ video: { url } }`. The defaults are the two modes of
 * Wan 2.2 Animate: "replace" swaps the person in `video_url` for the person in
 * `image_url` and keeps the background; "animate" drives the reference photo
 * with the clip's motion in a fresh scene. Model ids change often, so both are
 * environment variables; check https://fal.ai/models for the current names.
 *
 * Queue protocol (https://docs.fal.ai/model-endpoints/queue):
 *   POST {baseUrl}/{model}                  -> { request_id, status_url, response_url, cancel_url }
 *   GET  status_url?logs=1                   -> { status: IN_QUEUE|IN_PROGRESS|COMPLETED, logs? }
 *   GET  response_url                        -> model output
 *   PUT  cancel_url                          -> cancel
 */
export interface FalOptions {
  apiKey: string;
  /** Model for mode "replace". */
  modelId: string;
  /** Model for mode "animate". Falls back to `modelId`. */
  animateModelId?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface FalSubmitResponse {
  request_id: string;
  status_url: string;
  response_url: string;
  cancel_url?: string;
}

interface FalStatusResponse {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";
  queue_position?: number;
  logs?: { message: string }[];
}

export function buildFalInput(req: GenerationRequest): Record<string, unknown> {
  const input: Record<string, unknown> = {
    video_url: req.drivingVideoUrl,
    image_url: req.referenceImageUrls[0],
  };
  if (req.prompt) input.prompt = req.prompt;
  return input;
}

export class FalProvider implements VideoProvider {
  readonly id = "fal";
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly opts: FalOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.baseUrl = (opts.baseUrl ?? "https://queue.fal.run").replace(/\/$/, "");
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Key ${this.opts.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  modelFor(mode: GenerationRequest["mode"]): string {
    return mode === "animate" ? (this.opts.animateModelId ?? this.opts.modelId) : this.opts.modelId;
  }

  async submit(req: GenerationRequest): Promise<SubmitResult> {
    const url = new URL(`${this.baseUrl}/${this.modelFor(req.mode)}`);
    if (req.webhookUrl) url.searchParams.set("fal_webhook", req.webhookUrl);
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(buildFalInput(req)),
    });
    if (!res.ok) {
      throw new Error(`fal submit failed (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as FalSubmitResponse;
    return {
      providerRequestId: body.request_id,
      meta: {
        statusUrl: body.status_url,
        responseUrl: body.response_url,
        ...(body.cancel_url ? { cancelUrl: body.cancel_url } : {}),
      },
    };
  }

  async status(providerRequestId: string, meta?: Record<string, string>): Promise<ProviderStatus> {
    const statusUrl = meta?.statusUrl;
    const responseUrl = meta?.responseUrl;
    if (!statusUrl || !responseUrl) {
      return { state: "failed", error: `Missing fal queue URLs for ${providerRequestId}` };
    }
    const res = await this.fetchImpl(`${statusUrl}?logs=1`, { headers: this.headers() });
    if (!res.ok) {
      return { state: "failed", error: `fal status failed (${res.status}): ${await res.text()}` };
    }
    const body = (await res.json()) as FalStatusResponse;
    const logs = body.logs?.map((l) => l.message);
    if (body.status === "IN_QUEUE") return { state: "queued", progress: 0, logs };
    if (body.status === "IN_PROGRESS") return { state: "processing", logs };

    const out = await this.fetchImpl(responseUrl, { headers: this.headers() });
    if (!out.ok) {
      return { state: "failed", error: `fal result failed (${out.status}): ${await out.text()}`, logs };
    }
    const result = (await out.json()) as { video?: { url?: string }; detail?: unknown };
    const outputUrl = result.video?.url;
    if (!outputUrl) {
      return {
        state: "failed",
        error: `fal returned no video: ${JSON.stringify(result.detail ?? result).slice(0, 500)}`,
        logs,
      };
    }
    return { state: "completed", progress: 1, outputUrl, logs };
  }

  async cancel(_providerRequestId: string, meta?: Record<string, string>): Promise<void> {
    if (!meta?.cancelUrl) return;
    await this.fetchImpl(meta.cancelUrl, { method: "PUT", headers: this.headers() });
  }
}
