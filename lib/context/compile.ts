import fs from "node:fs";
import path from "node:path";
import type {
  Cluster,
  ContextPack,
  ContextRow,
  Cycle,
  Emit,
  Segment,
  Task,
} from "./contract";
import { SEGMENTS } from "./contract";
import { retrieve } from "./retrieve";
import { layerVersion, snapshot } from "./store";
import { sha256hex } from "./util";

const CACHE_DIR = path.join(process.cwd(), "fixtures", "cache");

/** One task per segment: the cluster with the most revenue at risk for that
 *  segment (revenueAtRisk × that segment's share of the cluster). */
export function deriveTasks(clusters: Cluster[]): Task[] {
  return SEGMENTS.map((segment: Segment) => {
    const top = [...clusters].sort(
      (a, b) =>
        b.revenueAtRisk * b.segmentBreakdown[segment] -
        a.revenueAtRisk * a.segmentBreakdown[segment]
    )[0];
    return { clusterId: top.id, clusterLabel: top.label, segment };
  });
}

/** Strip embeddings before rows leave the process (events, cache dumps). */
export function sanitizeRows(rows: ContextRow[]): ContextRow[] {
  return rows.map(({ embedding: _embedding, ...rest }) => rest);
}

export async function compilePack(task: Task): Promise<ContextPack> {
  const query = `ads for ${task.segment} about ${task.clusterLabel}`;
  const rows = await retrieve(query, {
    segment: task.segment,
    clusterId: task.clusterId,
  });
  const fingerprint = sha256hex(
    `${task.clusterId}|${task.segment}|${layerVersion()}|${rows
      .map((r) => r.id)
      .sort()
      .join(",")}`
  ).slice(0, 12);
  return {
    fingerprint,
    layerVersion: layerVersion(),
    task: { clusterId: task.clusterId, segment: task.segment },
    rows,
  };
}

/** Orchestrator entry point for the compile stage of one cycle. */
export async function runCompileStage(
  tasks: Task[],
  cycle: Cycle,
  emit?: Emit
): Promise<ContextPack[]> {
  emit?.({ cycle, stage: "compile", status: "start" });
  const packs: ContextPack[] = [];
  const dumped: ContextPack[] = [];
  for (const task of tasks) {
    const pack = await compilePack(task);
    packs.push(pack);
    const sanitized = { ...pack, rows: sanitizeRows(pack.rows) };
    dumped.push(sanitized);
    emit?.({ cycle, stage: "compile", status: "item", payload: sanitized });
  }
  await fs.promises.mkdir(CACHE_DIR, { recursive: true });
  await fs.promises.writeFile(
    path.join(CACHE_DIR, `packs-c${cycle}.json`),
    JSON.stringify(dumped, null, 2)
  );
  await snapshot(`v${layerVersion()}`);
  emit?.({
    cycle,
    stage: "compile",
    status: "done",
    payload: {
      layerVersion: layerVersion(),
      fingerprints: packs.map((p) => p.fingerprint),
    },
  });
  return packs;
}
