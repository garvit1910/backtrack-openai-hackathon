import fs from "node:fs";
import path from "node:path";
import type { ContextRow, NewContextRow } from "./contract";
import { brandRows } from "./brand";
import { embedBatch } from "./llm";

const CACHE_DIR = path.join(process.cwd(), "fixtures", "cache");
const STORE_FILE = path.join(CACHE_DIR, "context.json");

interface StoreState {
  version: number;
  rows: ContextRow[];
  byId: Map<string, ContextRow>;
  writeLock: Promise<void>;
}

/* globalThis stash: Next dev re-instantiates modules per bundle/HMR pass;
 * a plain module-level singleton would silently fork state between routes. */
const g = globalThis as typeof globalThis & { __backtalkStore?: StoreState };

function state(): StoreState {
  if (!g.__backtalkStore) {
    g.__backtalkStore = {
      version: 1,
      rows: [],
      byId: new Map(),
      writeLock: Promise.resolve(),
    };
    rehydrate(g.__backtalkStore);
  }
  return g.__backtalkStore;
}

function rehydrate(s: StoreState): void {
  try {
    if (!fs.existsSync(STORE_FILE)) return;
    const data = JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) as {
      version: number;
      rows: ContextRow[];
    };
    s.version = data.version;
    s.rows = data.rows;
    s.byId = new Map(data.rows.map((r) => [r.id, r]));
  } catch {
    /* corrupt or absent working file — start empty */
  }
}

function persist(): Promise<void> {
  const s = state();
  const payload = JSON.stringify({ version: s.version, rows: s.rows }, null, 2);
  s.writeLock = s.writeLock.then(() =>
    fs.promises
      .mkdir(CACHE_DIR, { recursive: true })
      .then(() => fs.promises.writeFile(STORE_FILE, payload))
  );
  return s.writeLock;
}

/** Reset to an empty v1 layer and seed brand facts. The orchestrator must
 *  call this once at the start of every live run. */
export async function beginRun(): Promise<void> {
  const s = state();
  s.version = 1;
  s.rows = [];
  s.byId.clear();
  await append(brandRows());
}

/**
 * Append rows (dedupes by deterministic id, embeds content, persists).
 * Stamps the CURRENT layer version. Pass { bump: true } to advance the layer
 * first — only the learner does this: a version is a knowledge epoch that
 * advances when the bandit feedback loop closes, not on every write.
 */
export async function append(
  newRows: NewContextRow[],
  opts?: { bump?: boolean }
): Promise<ContextRow[]> {
  const s = state();
  const fresh = newRows.filter((r) => !s.byId.has(r.id));
  if (fresh.length === 0) return [];
  if (opts?.bump) s.version += 1;
  const embeddings = await embedBatch(fresh.map((r) => r.content));
  const stamped: ContextRow[] = fresh.map((r, i) => ({
    ...r,
    version: s.version,
    ...(embeddings[i] ? { embedding: embeddings[i]! } : {}),
  }));
  for (const row of stamped) {
    s.rows.push(row);
    s.byId.set(row.id, row);
  }
  await persist();
  return stamped;
}

export function layerVersion(): number {
  return state().version;
}

export function allRows(): ContextRow[] {
  return [...state().rows];
}

/** Immutable snapshot for the replay contract (embeddings stripped — they are
 *  an internal index, not part of the demo story). */
export async function snapshot(label: string): Promise<string> {
  const s = state();
  const file = path.join(CACHE_DIR, `context-${label}.json`);
  const rows = s.rows.map(({ embedding: _embedding, ...rest }) => rest);
  await fs.promises.mkdir(CACHE_DIR, { recursive: true });
  await fs.promises.writeFile(
    file,
    JSON.stringify({ version: s.version, rows }, null, 2)
  );
  return file;
}
