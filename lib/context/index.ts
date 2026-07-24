/**
 * Person 2 barrel + the ContextStoreApi implementation Person 1's registry
 * binds to (lib/signals/registry.ts → `import { contextStore } from "@/lib/context"`).
 *
 * The orchestrator only ever calls append() and compile(), so both adapters
 * self-heal the layer:
 *  - lazy-seed brand_fact rows from fixtures/brand.yaml on first touch;
 *  - materialize pain_point rows from fixtures/cache/clusters.json before
 *    compiling (the orchestrator never appends those itself);
 *  - detect a fresh run: evidence rows arriving while stale `learning` rows
 *    exist means a new pipeline run started → reset to v1 and re-seed
 *    (research only ever runs before learn within one run).
 */
import fs from "node:fs";
import path from "node:path";
import type { Cluster, ContextRow, ContextStoreApi } from "../schemas";
import { brandRows } from "./brand";
import { compilePack } from "./compile";
import { rowsFromSignals } from "./ingest";
import {
  allRows,
  append,
  beginRun,
  layerVersion,
  snapshot,
} from "./store";

function readClustersCache(): Cluster[] {
  try {
    const file = path.join(process.cwd(), "fixtures", "cache", "clusters.json");
    return JSON.parse(fs.readFileSync(file, "utf8")) as Cluster[];
  } catch {
    return [];
  }
}

async function ensureSeeded(): Promise<void> {
  if (!allRows().some((r) => r.type === "brand_fact")) {
    await append(brandRows());
  }
}

async function ensureClusterRows(): Promise<Cluster[]> {
  const clusters = readClustersCache();
  if (clusters.length) {
    await append(rowsFromSignals(clusters, [])); // dedupe makes this idempotent
  }
  return clusters;
}

function stripStamped(rows: ContextRow[]) {
  return rows.map(({ version: _v, embedding: _e, ...rest }) => rest);
}

export const contextStore: ContextStoreApi = {
  async append(rows: ContextRow[]): Promise<void> {
    const hasEvidence = rows.some((r) => r.type === "evidence");
    const hasLearning = rows.some((r) => r.type === "learning");
    if (hasEvidence && allRows().some((r) => r.type === "learning")) {
      await beginRun(); // stale learnings + fresh research ⇒ new run
    }
    await ensureSeeded();
    await append(stripStamped(rows), { bump: hasLearning });
    if (hasLearning) await snapshot(`v${layerVersion()}`);
  },

  async compile(task): Promise<import("../schemas").ContextPack> {
    await ensureSeeded();
    const clusters = await ensureClusterRows();
    const clusterLabel =
      clusters.find((c) => c.id === task.clusterId)?.label ?? task.clusterId;
    const pack = await compilePack({
      clusterId: task.clusterId,
      clusterLabel,
      segment: task.segment,
    });
    await snapshot(`v${layerVersion()}`);
    return pack;
  },
};

export { beginRun, append, layerVersion, allRows, snapshot } from "./store";
export { retrieve } from "./retrieve";
export { ingestSignals, rowsFromSignals } from "./ingest";
export { compilePack, deriveTasks, runCompileStage, sanitizeRows } from "./compile";
export { brandRows, loadBrand, bannedClaimRegexes } from "./brand";
