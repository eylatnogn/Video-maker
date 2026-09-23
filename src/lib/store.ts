import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config";
import type { Database } from "./types";

/**
 * A deliberately small JSON-on-disk store.
 *
 * It keeps the project free of native dependencies and is enough for one
 * small server. Every read goes to disk because Next.js bundles route
 * handlers, pages and instrumentation separately, so module-level state is
 * not shared between them. Mutations take a lock file, which also makes them
 * safe across processes. Swap this for Postgres/SQLite behind the same
 * `Store` interface before running at any real scale.
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

export class JsonFileStore implements Store {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private get lockPath(): string {
    return `${this.filePath}.lock`;
  }

  private async load(): Promise<Database> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return { ...structuredClone(EMPTY), ...(JSON.parse(raw) as Partial<Database>) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return structuredClone(EMPTY);
    }
  }

  private async persist(db: Database): Promise<void> {
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
    await fs.rename(tmp, this.filePath);
  }

  private async acquireLock(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        const handle = await fs.open(this.lockPath, "wx");
        await handle.writeFile(String(process.pid));
        await handle.close();
        return;
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
  }

  private async releaseLock(): Promise<void> {
    await fs.rm(this.lockPath, { force: true });
  }

  read(): Promise<Database> {
    return this.load();
  }

  mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      await this.acquireLock();
      try {
        const db = await this.load();
        const result = await fn(db);
        await this.persist(db);
        return result;
      } finally {
        await this.releaseLock();
      }
    };
    // The in-process queue keeps lock contention between our own callers at zero.
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

let instance: Store | null = null;

export function store(): Store {
  if (!instance) instance = new JsonFileStore(path.join(config().dataDir, "db.json"));
  return instance;
}

export function resetStoreForTests(): void {
  instance = null;
}
