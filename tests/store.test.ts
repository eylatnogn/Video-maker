import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonFileStore, RedisStore, type RedisLike } from "@/lib/store";
import { fileRecord, freshDataDir } from "./helpers";

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
          db.files.push(fileRecord(`f${i}`));
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
      db.files.push(fileRecord("f1"));
    });
    expect((await b.read()).files.map((f) => f.id)).toEqual(["f1"]);
    await Promise.all([
      a.mutate((db) => {
        db.files.push(fileRecord("f2"));
      }),
      b.mutate((db) => {
        db.files.push(fileRecord("f3"));
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

/** In-memory stand-in for Upstash with real SET NX PX and compare-and-delete semantics. */
class FakeRedis implements RedisLike {
  data = new Map<string, { value: string; expires?: number }>();
  calls = { set: 0 };

  private live(key: string) {
    const entry = this.data.get(key);
    if (entry && entry.expires !== undefined && entry.expires < Date.now()) this.data.delete(key);
    return this.data.get(key);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.live(key);
    return entry ? (JSON.parse(entry.value) as T) : null;
  }

  async set(key: string, value: unknown, opts: { nx: true; px: number }): Promise<"OK" | null> {
    this.calls.set++;
    if (opts.nx && this.live(key)) return null;
    this.data.set(key, { value: JSON.stringify(value), expires: Date.now() + opts.px });
    return "OK";
  }

  async eval<TArgs extends unknown[], TData = unknown>(script: string, keys: string[], args: TArgs): Promise<TData> {
    if (script.includes('"set"')) {
      this.data.set(keys[0], { value: String(args[0]) });
      return "OK" as TData;
    }
    const entry = this.live(keys[0]);
    if (entry && JSON.parse(entry.value) === args[0]) {
      this.data.delete(keys[0]);
      return 1 as TData;
    }
    return 0 as TData;
  }
}

describe("RedisStore", () => {
  it("starts empty, persists and releases its lock", async () => {
    const redis = new FakeRedis();
    const store = new RedisStore(redis, "t:db");
    expect((await store.read()).jobs).toEqual([]);
    await store.mutate((db) => {
      db.files.push(fileRecord("f1"));
    });
    expect((await store.read()).files.map((f) => f.id)).toEqual(["f1"]);
    expect(redis.data.has("t:db:lock")).toBe(false);
    expect((await new RedisStore(redis, "t:db").read()).files).toHaveLength(1);
  });

  it("waits for a lock held by another writer", async () => {
    const redis = new FakeRedis();
    const a = new RedisStore(redis, "t:db");
    const b = new RedisStore(redis, "t:db");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = a.mutate(async (db) => {
      await gate;
      db.files.push(fileRecord("slow"));
    });
    await new Promise((r) => setTimeout(r, 20));
    const fast = b.mutate((db) => {
      db.files.push(fileRecord("fast"));
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(redis.calls.set).toBeGreaterThan(2);
    release();
    await Promise.all([slow, fast]);
    expect((await a.read()).files.map((f) => f.id)).toEqual(["slow", "fast"]);
  });
});
