import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonFileStore } from "@/lib/store";
import { freshDataDir } from "./helpers";

describe("JsonFileStore", () => {
  it("starts empty and persists mutations", async () => {
    const dir = await freshDataDir();
    const file = path.join(dir, "db.json");
    const store = new JsonFileStore(file);
    expect((await store.read()).personas).toEqual([]);
    await store.mutate((db) => {
      db.jobs.push({
        id: "job_1",
        personaId: "p",
        mode: "replace",
        status: "queued",
        progress: 0,
        provider: "mock",
        events: [],
        createdAt: "a",
        updatedAt: "a",
      });
    });
    const reloaded = new JsonFileStore(file);
    expect((await reloaded.read()).jobs.map((j) => j.id)).toEqual(["job_1"]);
    expect(JSON.parse(await fs.readFile(file, "utf8")).jobs).toHaveLength(1);
  });

  it("serialises concurrent mutations", async () => {
    const dir = await freshDataDir();
    const store = new JsonFileStore(path.join(dir, "db.json"));
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        store.mutate(async (db) => {
          await new Promise((r) => setTimeout(r, 1));
          db.files.push({ id: `f${i}`, relPath: "", mime: "", size: 0, originalName: "", createdAt: "" });
        }),
      ),
    );
    expect((await store.read()).files).toHaveLength(25);
  });

  it("read returns a copy, not the live object", async () => {
    const dir = await freshDataDir();
    const store = new JsonFileStore(path.join(dir, "db.json"));
    const a = await store.read();
    a.personas.push({} as never);
    expect((await store.read()).personas).toHaveLength(0);
  });

  it("two store instances on the same file see each other's writes", async () => {
    const dir = await freshDataDir();
    const file = path.join(dir, "db.json");
    const a = new JsonFileStore(file);
    const b = new JsonFileStore(file);
    expect((await b.read()).files).toHaveLength(0);
    await a.mutate((db) => {
      db.files.push({ id: "f1", relPath: "", mime: "", size: 0, originalName: "", createdAt: "" });
    });
    expect((await b.read()).files.map((f) => f.id)).toEqual(["f1"]);
    await Promise.all([
      a.mutate((db) => {
        db.files.push({ id: "f2", relPath: "", mime: "", size: 0, originalName: "", createdAt: "" });
      }),
      b.mutate((db) => {
        db.files.push({ id: "f3", relPath: "", mime: "", size: 0, originalName: "", createdAt: "" });
      }),
    ]);
    expect((await a.read()).files.map((f) => f.id).sort()).toEqual(["f1", "f2", "f3"]);
    await expect(fs.stat(`${file}.lock`)).rejects.toThrow();
  });

  it("removes a stale lock instead of hanging", async () => {
    const dir = await freshDataDir();
    const file = path.join(dir, "db.json");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${file}.lock`, "dead");
    const old = new Date(Date.now() - 60_000);
    await fs.utimes(`${file}.lock`, old, old);
    const store = new JsonFileStore(file);
    await store.mutate((db) => {
      db.jobs = [];
    });
    expect((await store.read()).jobs).toEqual([]);
  });
});
