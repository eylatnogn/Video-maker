import { describe, expect, it, vi } from "vitest";
import { buildFalInput, FalProvider } from "@/lib/providers/fal";

const req = {
  jobId: "job_1",
  referenceImageUrls: ["https://x/ref.jpg", "https://x/ref2.jpg"],
  drivingVideoUrl: "https://x/clip.mp4",
  mode: "replace" as const,
  prompt: "neon",
  webhookUrl: "https://app/api/webhooks/fal?job=job_1&secret=s",
};

function fetchMock(handlers: Record<string, (init?: RequestInit) => Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    for (const [prefix, handler] of Object.entries(handlers)) {
      if (url.startsWith(prefix)) return handler(init);
    }
    return new Response("no handler for " + url, { status: 404 });
  }) as unknown as typeof fetch;
}

describe("FalProvider", () => {
  it("maps the request to the model input", () => {
    expect(buildFalInput(req)).toEqual({ video_url: "https://x/clip.mp4", image_url: "https://x/ref.jpg", prompt: "neon" });
  });

  it("submits to the queue and keeps the returned URLs", async () => {
    const fetchImpl = fetchMock({
      "https://queue.fal.run/owner/model": (init) => {
        expect((init?.headers as Record<string, string>).Authorization).toBe("Key k");
        expect(JSON.parse(String(init?.body))).toMatchObject({ image_url: "https://x/ref.jpg" });
        return Response.json({
          request_id: "r1",
          status_url: "https://queue.fal.run/owner/model/requests/r1/status",
          response_url: "https://queue.fal.run/owner/model/requests/r1",
          cancel_url: "https://queue.fal.run/owner/model/requests/r1/cancel",
        });
      },
    });
    const p = new FalProvider({ apiKey: "k", modelId: "owner/model", fetchImpl });
    const result = await p.submit(req);
    expect(result.providerRequestId).toBe("r1");
    expect(result.meta?.statusUrl).toContain("/status");
    const calledUrl = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl).toContain("fal_webhook=");
  });

  it("routes animate mode to its own model", async () => {
    const fetchImpl = fetchMock({
      "https://queue.fal.run/owner/animate": () =>
        Response.json({ request_id: "r2", status_url: "https://q/s", response_url: "https://q/r" }),
    });
    const p = new FalProvider({ apiKey: "k", modelId: "owner/replace", animateModelId: "owner/animate", fetchImpl });
    expect((await p.submit({ ...req, mode: "animate" })).providerRequestId).toBe("r2");
  });

  it("reports queue, progress and completion", async () => {
    let status = "IN_QUEUE";
    const fetchImpl = fetchMock({
      "https://q/status": () => Response.json({ status, logs: [{ message: "step 1" }] }),
      "https://q/result": () => Response.json({ video: { url: "https://cdn/out.mp4" } }),
    });
    const p = new FalProvider({ apiKey: "k", modelId: "m", fetchImpl });
    const meta = { statusUrl: "https://q/status", responseUrl: "https://q/result" };
    expect(await p.status("r1", meta)).toMatchObject({ state: "queued" });
    status = "IN_PROGRESS";
    expect(await p.status("r1", meta)).toMatchObject({ state: "processing", logs: ["step 1"] });
    status = "COMPLETED";
    expect(await p.status("r1", meta)).toMatchObject({ state: "completed", outputUrl: "https://cdn/out.mp4" });
  });

  it("surfaces HTTP errors as failures", async () => {
    const fetchImpl = fetchMock({ "https://q/status": () => new Response("boom", { status: 500 }) });
    const p = new FalProvider({ apiKey: "k", modelId: "m", fetchImpl });
    const s = await p.status("r1", { statusUrl: "https://q/status", responseUrl: "https://q/result" });
    expect(s.state).toBe("failed");
    expect(s.error).toMatch(/500/);
    await expect(p.submit(req)).rejects.toThrow(/submit failed/);
  });
});
