import { config } from "../config";
import { FalProvider } from "./fal";
import { MockProvider } from "./mock";
import type { VideoProvider } from "./types";

let instance: VideoProvider | null = null;

/** The provider selected by VIDEO_PROVIDER. Constructed once per process. */
export function provider(): VideoProvider {
  if (instance) return instance;
  const cfg = config();
  if (cfg.provider === "fal") {
    if (!cfg.fal.key) throw new Error("VIDEO_PROVIDER=fal requires FAL_KEY");
    instance = new FalProvider({
      apiKey: cfg.fal.key,
      modelId: cfg.fal.modelId,
      animateModelId: cfg.fal.animateModelId,
      baseUrl: cfg.fal.baseUrl,
    });
  } else {
    instance = new MockProvider({ outputUrl: cfg.mock.outputUrl, durationMs: cfg.mock.durationMs });
  }
  return instance;
}

export function setProviderForTests(p: VideoProvider | null): void {
  instance = p;
}
