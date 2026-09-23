import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelJob, createJob, getJob, runJob } from "@/lib/pipeline/jobs";
import { createPersona } from "@/lib/pipeline/personas";
import { MockProvider } from "@/lib/providers/mock";
import { saveFile } from "@/lib/storage";
import { freshDataDir, PNG_BYTES } from "./helpers";

const noSleep = async () => {};

async function setup() {
  await freshDataDir();
  const persona = await createPersona({
    name: "Me",
    consent: true,
    photos: [{ data: PNG_BYTES, mime: "image/png", name: "a.png" }],
  });
  const clip = await saveFile(new Uint8Array([1, 2, 3]), "video/mp4", "clip.mp4");
  return { persona, clip };
}

describe("job pipeline", () => {
  let clock = 0;
  const provider = () => new MockProvider({ outputUrl: "http://test.local/out.mp4", durationMs: 100, now: () => clock });

  beforeEach(() => {
    clock = 0;
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

  it("runs a job to completion and stores the render locally", async () => {
    const { persona, clip } = await setup();
    const p = provider();
    const submitSpy = vi.spyOn(p, "submit");
    const job = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id, prompt: "  neon  " });
    expect(job.status).toBe("queued");
    expect(job.prompt).toBe("neon");

    const run = runJob(job.id, {
      provider: p,
      pollIntervalMs: 0,
      sleep: async () => {
        clock += 50;
      },
    });
    const done = await run;
    expect(done.status).toBe("completed");
    expect(done.progress).toBe(1);
    expect(done.outputUrl).toBe("http://test.local/out.mp4");
    expect(done.outputFileId).toMatch(/^file_/);
    expect(done.events.map((e) => e.status)).toEqual(
      expect.arrayContaining(["queued", "submitted", "processing", "completed"]),
    );

    const req = submitSpy.mock.calls[0][0];
    expect(req.referenceImageUrls[0]).toBe(`http://test.local/api/files/${persona.primaryPhotoId}`);
    expect(req.drivingVideoUrl).toBe(`http://test.local/api/files/${clip.id}`);
    expect(req.prompt).toBe("neon");
    expect(req.mode).toBe("replace");
  });

  it("marks provider failures", async () => {
    await freshDataDir();
    const persona = await createPersona({
      name: "Me",
      consent: true,
      photos: [{ data: PNG_BYTES, mime: "image/png", name: "a.png" }],
    });
    const clip = await saveFile(new Uint8Array([1]), "video/mp4", "will-fail.mp4");
    const p = provider();
    vi.spyOn(p, "status").mockResolvedValue({ state: "failed", error: "GPU on fire" });
    const job = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id });
    const done = await runJob(job.id, { provider: p, pollIntervalMs: 0, sleep: noSleep });
    expect(done.status).toBe("failed");
    expect(done.error).toBe("GPU on fire");
  });

  it("keeps the provider URL when the local download fails", async () => {
    const { persona, clip } = await setup();
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 500 }));
    const job = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id });
    const done = await runJob(job.id, {
      provider: provider(),
      pollIntervalMs: 0,
      sleep: async () => {
        clock += 1000;
      },
    });
    expect(done.status).toBe("completed");
    expect(done.outputFileId).toBeUndefined();
    expect(done.outputUrl).toBe("http://test.local/out.mp4");
  });

  it("mock provider echoes the driving clip when no output URL is configured", async () => {
    const { persona, clip } = await setup();
    const job = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id });
    const done = await runJob(job.id, {
      provider: new MockProvider({ durationMs: 1, now: () => clock }),
      pollIntervalMs: 0,
      sleep: async () => {
        clock += 10;
      },
    });
    expect(done.status).toBe("completed");
    expect(done.outputUrl).toBe(`http://test.local/api/files/${clip.id}`);
    expect(done.outputFileId).toBe(clip.id);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("times out", async () => {
    const { persona, clip } = await setup();
    const job = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id });
    const done = await runJob(job.id, { provider: provider(), pollIntervalMs: 0, timeoutMs: -1, sleep: noSleep });
    expect(done.status).toBe("failed");
    expect(done.error).toMatch(/Timed out/);
  });

  it("cancel stops the poll loop", async () => {
    const { persona, clip } = await setup();
    const p = provider();
    const job = await createJob({ personaId: persona.id, drivingVideoFileId: clip.id });
    let polls = 0;
    const run = runJob(job.id, {
      provider: p,
      pollIntervalMs: 0,
      sleep: async () => {
        if (++polls === 2) await cancelJob(job.id, p);
      },
    });
    const done = await run;
    expect(done.status).toBe("canceled");
    expect((await getJob(job.id))?.status).toBe("canceled");
  });
});
