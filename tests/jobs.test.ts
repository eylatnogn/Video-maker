import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelJob, createJob, getJob, refreshJob, refreshPendingJobs } from "@/lib/pipeline/jobs";
import { createPersona } from "@/lib/pipeline/personas";
import { MockProvider } from "@/lib/providers/mock";
import { saveFile } from "@/lib/storage";
import type { Job } from "@/lib/types";
import { freshDataDir, photoFile } from "./helpers";

async function setup() {
  await freshDataDir();
  const photo = await photoFile();
  const persona = await createPersona({ name: "Me", consent: true, photoFileIds: [photo.id] });
  const clip = await saveFile(new Uint8Array([1, 2, 3]), "video/mp4", "clip.mp4");
  return { persona, photo, clip };
}

/** Polls refreshJob, advancing the fake clock, until the job is terminal. */
async function drive(id: string, opts: { provider: MockProvider; tick: () => void }, max = 50): Promise<Job> {
  for (let i = 0; i < max; i++) {
    const job = await refreshJob(id, { provider: opts.provider });
    if (["completed", "failed", "canceled"].includes(job.status)) return job;
    opts.tick();
  }
  throw new Error("job never finished");
}

describe("job pipeline", () => {
  let clock = 0;
  const provider = (outputUrl?: string) => new MockProvider({ outputUrl, durationMs: 100, now: () => clock });
  const tick = () => {
    clock += 50;
  };

  beforeEach(() => {
    clock = 1_000;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(new Uint8Array([9, 9, 9]), { headers: { "content-type": "video/mp4" } });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("validates inputs", async () => {
    const { persona } = await setup();
    await expect(createJob({ personaId: "persona_missing", templateId: "x" })).rejects.toThrow(/Persona/);
    await expect(createJob({ personaId: persona.id })).rejects.toThrow(/template or upload/);
    await expect(createJob({ personaId: persona.id, templateId: "nope" })).rejects.toThrow(/Template not found/);
    await expect(createJob({ personaId: persona.id, templateId: "dance-hiphop-01" })).rejects.toThrow(/no video clip/);
    await expect(createJob({ personaId: persona.id, drivingVideoFileId: "file_x" })).rejects.toThrow(/Driving video/);
  });

  it("submits on creation and completes through refreshes, downloading the render", async () => {
    const { persona, photo, clip } = await setup();
    const p = provider("http://cdn.test/out.mp4");
    const submitSpy = vi.spyOn(p, "submit");
    const job = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id, prompt: "  neon  " }, { provider: p });
    expect(job.status).toBe("submitted");
    expect(job.prompt).toBe("neon");
    expect(job.providerRequestId).toMatch(/^mock_/);

    const req = submitSpy.mock.calls[0][0];
    expect(req.referenceImageUrls[0]).toBe(`http://test.local/api/files/${photo.id}`);
    expect(req.drivingVideoUrl).toBe(`http://test.local/api/files/${clip.id}`);
    expect(req.prompt).toBe("neon");
    expect(req.mode).toBe("replace");

    const done = await drive(job.id, { provider: p, tick });
    expect(done.status).toBe("completed");
    expect(done.progress).toBe(1);
    expect(done.outputUrl).toBe("http://cdn.test/out.mp4");
    expect(done.outputFileId).toMatch(/^file_/);
    expect(fetch).toHaveBeenCalledWith("http://cdn.test/out.mp4");
    expect(done.events.map((e) => e.status)).toEqual(
      expect.arrayContaining(["queued", "submitted", "processing", "completed"]),
    );
  });

  it("is a no-op on terminal jobs", async () => {
    const { persona, clip } = await setup();
    const p = provider();
    const job = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id }, { provider: p });
    const done = await drive(job.id, { provider: p, tick });
    const statusSpy = vi.spyOn(p, "status");
    const again = await refreshJob(job.id, { provider: p });
    expect(again.updatedAt).toBe(done.updatedAt);
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it("marks provider failures", async () => {
    const { persona, clip } = await setup();
    const p = provider();
    vi.spyOn(p, "status").mockResolvedValue({ state: "failed", error: "GPU on fire" });
    const job = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id }, { provider: p });
    const done = await refreshJob(job.id, { provider: p });
    expect(done.status).toBe("failed");
    expect(done.error).toBe("GPU on fire");
  });

  it("mock provider fails when the driving URL says so", async () => {
    const p = provider();
    const submitted = await p.submit({
      jobId: "job_x",
      referenceImageUrls: ["http://x/a.png"],
      drivingVideoUrl: "http://x/will-fail.mp4",
      mode: "replace",
    });
    expect(await p.status(submitted.providerRequestId, submitted.meta)).toMatchObject({ state: "failed" });
  });

  it("marks a failed submission without throwing", async () => {
    const { persona, clip } = await setup();
    const p = provider();
    vi.spyOn(p, "submit").mockRejectedValue(new Error("quota exceeded"));
    const job = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id }, { provider: p });
    expect(job.status).toBe("failed");
    expect(job.error).toBe("quota exceeded");
  });

  it("keeps the provider URL when the local download fails", async () => {
    const { persona, clip } = await setup();
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 500 }));
    const p = provider("http://cdn.test/out.mp4");
    const job = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id }, { provider: p });
    const done = await drive(job.id, { provider: p, tick });
    expect(done.status).toBe("completed");
    expect(done.outputFileId).toBeUndefined();
    expect(done.outputUrl).toBe("http://cdn.test/out.mp4");
  });

  it("mock provider echoes the driving clip when no output URL is configured", async () => {
    const { persona, clip } = await setup();
    const p = provider();
    const job = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id }, { provider: p });
    const done = await drive(job.id, { provider: p, tick });
    expect(done.status).toBe("completed");
    expect(done.outputUrl).toBe(`http://test.local/api/files/${clip.id}`);
    expect(done.outputFileId).toBe(clip.id);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("times out", async () => {
    const { persona, clip } = await setup();
    const p = provider();
    const job = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id }, { provider: p });
    const done = await refreshJob(job.id, { provider: p, now: () => Date.now() + 60 * 60 * 1000 });
    expect(done.status).toBe("failed");
    expect(done.error).toMatch(/Timed out/);
  });

  it("cancel is terminal and survives later refreshes", async () => {
    const { persona, clip } = await setup();
    const p = provider();
    const job = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id }, { provider: p });
    await cancelJob(job.id, p);
    tick();
    tick();
    tick();
    const after = await refreshJob(job.id, { provider: p });
    expect(after.status).toBe("canceled");
    expect((await getJob(job.id))?.status).toBe("canceled");
  });

  it("refreshPendingJobs advances every pending job", async () => {
    const { persona, clip } = await setup();
    const p = provider();
    const a = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id }, { provider: p });
    const b = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id }, { provider: p });
    clock += 1000;
    const results = await refreshPendingJobs({ provider: p });
    expect(results.map((j) => j.id).sort()).toEqual([a.id, b.id].sort());
    expect(results.every((j) => j.status === "completed")).toBe(true);
    expect(await refreshPendingJobs({ provider: p })).toEqual([]);
  });
});
