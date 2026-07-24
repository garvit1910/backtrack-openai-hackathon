/**
 * fixtures/cache/ helpers — every stage dumps its output through here.
 * Atomic writes (tmp + rename) so a crash never leaves half-written JSON.
 */
import fs from "node:fs";
import path from "node:path";
import type { StageEmitter } from "../events";

const CACHE_DIR = path.join(process.cwd(), "fixtures", "cache");

export function cachePath(name: string): string {
  return path.join(CACHE_DIR, name);
}

export function writeCache(name: string, data: unknown): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = cachePath(name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function readCache<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(cachePath(name), "utf8")) as T;
  } catch {
    return null;
  }
}

export function truncateJsonl(name: string): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(name), "");
}

export function appendJsonl(name: string, obj: unknown): void {
  fs.appendFileSync(cachePath(name), JSON.stringify(obj) + "\n");
}

export function readJsonl<T>(name: string): T[] {
  try {
    return fs
      .readFileSync(cachePath(name), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as T);
  } catch {
    return [];
  }
}

/**
 * Run the live path; if it throws, replay the committed cache instead so the
 * stream never dies. The stage declares the degradation via meta.source.
 */
export async function withFallback<T>(
  e: StageEmitter,
  opts: {
    live: () => Promise<T>;
    cacheName: string;
    /** items to re-emit one-by-one when falling back */
    items: (cached: T) => unknown[];
    warning: string;
  }
): Promise<T> {
  try {
    return await opts.live();
  } catch (err) {
    const cached = readCache<T>(opts.cacheName);
    if (cached === null) throw err;
    const meta = { source: "cache" as const, warning: `${opts.warning}: ${String(err)}` };
    for (const item of opts.items(cached)) e.item(item, meta);
    return cached;
  }
}
