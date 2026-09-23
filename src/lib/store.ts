import { promises as fs } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import { config } from "./config";
import type { Database } from "./types";

/**
 * A deliberately small document store: the whole database is one JSON
 * value, read on every access and written under a lock.
 *
 * Two backends share the interface: a JSON file with a lock file for local
 * runs, and Redis (Upstash) for serverless deployments where no filesystem
 * survives between requests. Every read goes to the backend because Next.js
 * bundles route handlers, pages and instrumentation separately, so
 * module-level caches are not shared between them.
 *
 * This is fine for a single-tenant app with hundreds of records. Replace it
 * with a relational store behind the same interface before multi-tenant use.
 */
export interface Store {
  read(): Promise<Database>;
  /** Apply a read-modify-write mutation atomically with respect to every other writer. */
  mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T>;
}

const EMPTY: Database = { files: [], personas: [], jobs: [] };
const LOCK_RETRY_MS = 10;
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_STALE_MS = 30_000;

function withDefaults(parsed: Partial<Database> | null | undefined): Database {
  return { ...structuredClone(EMPTY), ...(parsed ?? {}) };
}

/** Serialises mutations from one process so they never contend for the backend lock. */
abstract class QueuedStore implements Store {
  private queue: Promise<unknown> = Promise.resolve();

  abstract read(): Promise<Database>;
  protected abstract locked<T>(fn: () => Promise<T>): Promise<T>;
  protected abstract persist(db: Database): Promise<void>;

  mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
    const run = () =>
      this.locked(async () => {
        const db = await this.read();
        const result = await fn(db);
        await this.persist(db);
        return result;
      });
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

export class JsonFileStore extends QueuedStore {
  constructor(private readonly filePath: string) {
    super();
  }

  private get lockPath(): string {
    return `${this.filePath}.lock`;
  }

  async read(): Promise<Database> {
    try {
      return withDefaults(JSON.parse(await fs.readFile(this.filePath, "utf8")));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return withDefaults(null);
    }
  }

  protected async persist(db: Database): Promise<void> {
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
    await fs.rename(tmp, this.filePath);
  }

  protected async locked<T>(fn: () => Promise<T>): Promise<T> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        const handle = await fs.open(this.lockPath, "wx");
        await handle.writeFile(String(process.pid));
        await handle.close();
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        const stat = await fs.stat(this.lockPath).catch(() => null);
        if (stat && Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          await fs.rm(this.lockPath, { force: true });
          continue;
        }
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${this.lockPath}`);
        await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
      }
    }
    try {
      return await fn();
    } finally {
      await fs.rm(this.lockPath, { force: true });
    }
  }
}

/** The subset of the Upstash client the Redis store needs; kept small so tests can fake it. */
export interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts: { nx: true; px: number }): Promise<unknown>;
  eval<TArgs extends unknown[], TData = unknown>(script: string, keys: string[], args: TArgs): Promise<TData>;
}

const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

export class RedisStore extends QueuedStore {
  constructor(
    private readonly redis: RedisLike,
    private readonly key = "video-maker:db",
  ) {
    super();
  }

  private get lockKey(): string {
    return `${this.key}:lock`;
  }

  async read(): Promise<Database> {
    return withDefaults(await this.redis.get<Partial<Database>>(this.key));
  }

  protected async persist(db: Database): Promise<void> {
    // Plain SET without options; the lock guarantees we hold the latest copy.
    await this.redis.eval(`return redis.call("set", KEYS[1], ARGV[1])`, [this.key], [JSON.stringify(db)]);
  }

  protected async locked<T>(fn: () => Promise<T>): Promise<T> {
    const token = `${process.pid}:${Date.now()}:${Math.random()}`;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      const ok = await this.redis.set(this.lockKey, token, { nx: true, px: LOCK_STALE_MS });
      if (ok === "OK") break;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${this.lockKey}`);
      await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
    }
    try {
      return await fn();
    } finally {
      await this.redis.eval(RELEASE_SCRIPT, [this.lockKey], [token]);
    }
  }
}

let instance: Store | null = null;

export function store(): Store {
  if (instance) return instance;
  const cfg = config();
  if (cfg.storeBackend === "redis") {
    if (!cfg.redis.url || !cfg.redis.token) throw new Error("STORE_BACKEND=redis requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
    instance = new RedisStore(new Redis({ url: cfg.redis.url, token: cfg.redis.token, automaticDeserialization: true }));
  } else {
    instance = new JsonFileStore(path.join(cfg.dataDir, "db.json"));
  }
  return instance;
}

export function resetStoreForTests(): void {
  instance = null;
}
