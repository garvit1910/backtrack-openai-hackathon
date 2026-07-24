/**
 * Zero-server fallback player: replays the committed cache fixtures through
 * the same StageEvent reducer the SSE stream feeds, and runs the REAL bandit
 * engine in the browser for the test stages (seeded — reproducible). If every
 * live stage flakes on demo day, this mode still shows the whole loop.
 *
 * It also demonstrates the full-power cycle-2 path: the cycle-1 champion is
 * carried over with its posterior warm-started, which the live pipeline only
 * gets once creatives keep champion ids across cycles.
 */

import type {
  Cluster,
  ContextPack,
  ContextRow,
  Creative,
  Cycle,
  EvidenceCard,
  ShipBrief,
  StageEvent,
  Ticket,
} from "@/components/contract";
import { SEGMENTS } from "@/components/contract";
import { hashString } from "@/lib/bandit";
import {
  DEMO_SEED,
  runMediaBuyer,
  warmStartFromStates,
} from "@/lib/agents/mediaBuyer";

import ticketsJson from "@/fixtures/tickets.json";
import clustersJson from "@/fixtures/cache/clusters.json";
import evidenceJson from "@/fixtures/cache/evidence.json";
import creativesC1Json from "@/fixtures/cache/creatives-c1.json";
import creativesC2Json from "@/fixtures/cache/creatives-c2.json";
import contextV1Json from "@/fixtures/cache/context-v1.json";
import contextV2Json from "@/fixtures/cache/context-v2.json";

const tickets = ticketsJson as unknown as Ticket[];
const clusters = (clustersJson as unknown as Cluster[])
  .slice()
  .sort((a, b) => b.revenueAtRisk - a.revenueAtRisk);
const evidence = evidenceJson as unknown as EvidenceCard[];
const creativesC1 = creativesC1Json as unknown as Creative[];
const creativesC2 = creativesC2Json as unknown as Creative[];
const contextV1 = (contextV1Json as unknown as { rows: ContextRow[] }).rows;
const contextV2 = (contextV2Json as unknown as { rows: ContextRow[] }).rows;

type Emit = (e: StageEvent) => void;

const PACE = {
  ticket: 110,
  cluster: 350,
  evidenceTick: 140,
  evidenceItem: 380,
  pack: 450,
  creative: 300,
  banditTick: 140,
  learning: 900,
  beat: 600,
};

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

function stripEmbedding(r: ContextRow): ContextRow {
  const { embedding: _drop, ...rest } = r;
  return rest as ContextRow;
}

function makePacks(cycle: Cycle, rows: ContextRow[], clusterId: string): ContextPack[] {
  return SEGMENTS.map((segment) => {
    const relevant = rows.filter((r) => !r.segment || r.segment === segment).map(stripEmbedding);
    const fp = hashString(`${cycle}:${segment}:${relevant.map((r) => r.id).join(",")}`)
      .toString(16)
      .padStart(8, "0");
    return {
      fingerprint: `pk_${fp.slice(0, 8)}`,
      layerVersion: cycle === 1 ? 1 : 2,
      task: { clusterId, segment },
      rows: relevant,
    };
  });
}

export async function playMockRun(emit: Emit, signal: AbortSignal): Promise<void> {
  const aborted = () => signal.aborted;
  const top = clusters[0];

  /* ------------------------------ cycle 1 ------------------------------ */

  emit({ cycle: 1, stage: "ingest", status: "start", payload: { source: "fixtures (offline mock)", expected: tickets.length }, meta: { source: "cache" } });
  // stream a strided sample for pace, but always include every ticket the
  // creatives cite or clusters exemplify — citation clicks must resolve
  const cited = new Set<string>([
    ...[...creativesC1, ...creativesC2].flatMap((c) => c.citations.ticketIds),
    ...clusters.flatMap((c) => c.exemplarTicketIds),
  ]);
  const stride = Math.max(1, Math.floor(tickets.length / 26));
  for (let i = 0; i < tickets.length; i++) {
    if (i % stride !== 0 && !cited.has(tickets[i].id)) continue;
    if (aborted()) return;
    emit({ cycle: 1, stage: "ingest", status: "item", payload: tickets[i] });
    await sleep(PACE.ticket, signal);
  }
  emit({ cycle: 1, stage: "ingest", status: "done", payload: { count: tickets.length } });

  emit({ cycle: 1, stage: "understand", status: "start" });
  for (const c of clusters) {
    if (aborted()) return;
    emit({ cycle: 1, stage: "understand", status: "item", payload: c });
    await sleep(PACE.cluster, signal);
  }
  emit({ cycle: 1, stage: "understand", status: "done", payload: { clusters: clusters.length } });

  emit({ cycle: 1, stage: "research", status: "start" });
  for (const card of evidence.slice(0, 10)) {
    if (aborted()) return;
    emit({ cycle: 1, stage: "research", status: "tick", payload: { query: card.sourceName } });
    await sleep(PACE.evidenceTick, signal);
    emit({ cycle: 1, stage: "research", status: "item", payload: card });
    await sleep(PACE.evidenceItem, signal);
  }
  emit({ cycle: 1, stage: "research", status: "done", payload: { cards: Math.min(10, evidence.length) } });

  const runCompileCreate = async (cycle: Cycle, rows: ContextRow[], creatives: Creative[]) => {
    emit({ cycle, stage: "compile", status: "start", payload: { clusterId: top.id, clusterLabel: top.label, segments: SEGMENTS } });
    const packs = makePacks(cycle, rows, top.id);
    for (const pack of packs) {
      if (aborted()) return packs;
      emit({ cycle, stage: "compile", status: "item", payload: pack });
      await sleep(PACE.pack, signal);
    }
    emit({ cycle, stage: "compile", status: "done", payload: { packs: packs.length, layerVersion: packs[0]?.layerVersion } });

    emit({ cycle, stage: "create", status: "start", payload: { packs: packs.length } });
    for (const c of creatives) {
      if (aborted()) return packs;
      emit({ cycle, stage: "create", status: "item", payload: c });
      await sleep(PACE.creative, signal);
    }
    emit({ cycle, stage: "create", status: "done", payload: { count: creatives.length } });
    return packs;
  };

  await runCompileCreate(1, contextV1, creativesC1);
  if (aborted()) return;

  const c1 = await runMediaBuyer({
    creatives: creativesC1,
    cycle: 1,
    seed: DEMO_SEED,
    tickDelayMs: PACE.banditTick,
    emit,
    signal,
  });
  if (aborted()) return;

  /* ------------------------------- learn -------------------------------- */

  emit({ cycle: 1, stage: "learn", status: "start", payload: { from: "bandit-c1" } });
  await sleep(PACE.beat, signal);
  const learnings: ContextRow[] = SEGMENTS.flatMap((segment) => {
    const w = c1.report.winners[segment];
    if (!w) return [];
    return [
      {
        id: `learning:c1:${segment}`,
        type: "learning" as const,
        content: `${segment} responds to the ${w.winnerAngle} angle — ${(w.ctrEstimate * 100).toFixed(1)}% CTR at ${Math.round(w.confidence * 100)}% confidence (cycle-1 bandit).`,
        segment,
        clusterId: top.id,
        sourceRefs: ["fixtures/cache/bandit-c1.json"],
        confidence: w.confidence,
        version: 2,
      },
    ];
  });
  for (const row of learnings) {
    if (aborted()) return;
    emit({ cycle: 1, stage: "learn", status: "item", payload: row });
    await sleep(PACE.learning, signal);
  }
  emit({ cycle: 1, stage: "learn", status: "done", payload: { rows: learnings.length, layerVersion: 2 } });
  await sleep(PACE.beat, signal);

  /* ------------------------------ cycle 2 ------------------------------ */

  // champion carried over (same id → warm-started posterior), plus Person 2's
  // informed same-angle creative and one challenger — the full-power loop.
  const c2Mix: Creative[] = SEGMENTS.flatMap((segment) => {
    const w = c1.report.winners[segment];
    const fromCache = creativesC2.filter((c) => c.segment === segment);
    if (!w) return fromCache.slice(0, 3);
    const champion = creativesC1.find((c) => c.id === w.winnerCreativeId);
    const aligned = fromCache.filter((c) => c.angle === w.winnerAngle);
    const challenger = fromCache.find((c) => c.angle !== w.winnerAngle);
    const mix = [champion, aligned[0], challenger].filter(Boolean) as Creative[];
    return mix.length >= 2 ? mix : fromCache.slice(0, 3);
  });

  const v2Rows = [...contextV2.filter((r) => r.type !== "learning"), ...learnings];
  await runCompileCreate(2, v2Rows, c2Mix);
  if (aborted()) return;

  const c2 = await runMediaBuyer({
    creatives: c2Mix,
    cycle: 2,
    seed: DEMO_SEED + 500,
    tickDelayMs: PACE.banditTick,
    emit,
    signal,
    warmStart: warmStartFromStates(c1.finalStates),
  });
  if (aborted()) return;

  /* -------------------------------- ship -------------------------------- */

  emit({ cycle: 2, stage: "ship", status: "start", payload: { channel: "#backtalk-demo" } });
  await sleep(PACE.beat, signal);
  const winners = {} as ShipBrief["winners"];
  for (const segment of SEGMENTS) {
    const w = c2.report.winners[segment];
    if (!w) continue;
    const creative = c2Mix.find((c) => c.id === w.winnerCreativeId);
    winners[segment] = {
      creativeId: w.winnerCreativeId,
      angle: w.winnerAngle,
      headline: creative?.headline ?? "",
      ctrEstimate: w.ctrEstimate,
    };
  }
  const seen = new Set<string>();
  const brief: ShipBrief = {
    topClusterLabel: top.label,
    revenueAtRisk: top.revenueAtRisk,
    winners,
    cycle1AvgCtr: c1.report.avgCtr,
    cycle2AvgCtr: c2.report.avgCtr,
    evidenceLinks: evidence
      .filter((e) => (seen.has(e.sourceUrl) ? false : (seen.add(e.sourceUrl), true)))
      .slice(0, 4)
      .map((e) => ({ sourceName: e.sourceName, sourceUrl: e.sourceUrl })),
  };
  emit({ cycle: 2, stage: "ship", status: "awaiting_approval", payload: brief });
}
