/**
 * The two-cycle runner. Cycle 1: ingest → understand → research → compile →
 * create → test → learn. Cycle 2: compile → create → test → ship. The stream
 * ends with ship's awaiting_approval event; POST /api/ship completes the loop.
 *
 * Every stage: emits through a cycle-tagged StageEmitter, dumps its artifact
 * to fixtures/cache/, and is wrapped in a last-resort try/catch so one dead
 * stage degrades the run instead of killing the SSE stream.
 */
import type {
  BanditReport,
  ContextPack,
  ContextRow,
  Creative,
  Cycle,
  EvidenceCard,
  ShipBrief,
} from "../schemas";
import { SEGMENTS } from "../schemas";
import { emitFor, type Emit } from "../events";
import { writeCache } from "./cache";
import { getRegistry } from "./registry";
import { runIngest } from "./stages/ingest";
import { runUnderstand } from "./stages/understand";
import { runResearch } from "./stages/research";

/** rows going over SSE never carry embedding vectors */
const stripRows = (pack: ContextPack): ContextPack => ({
  ...pack,
  rows: pack.rows.map(({ embedding: _drop, ...r }) => r as ContextRow),
});

function evidenceToRows(cards: EvidenceCard[]): ContextRow[] {
  return cards.map((c, i) => ({
    id: `ev_${c.clusterId}_${i}`,
    type: "evidence",
    content: c.counterpoint ? `${c.claim} — ${c.counterpoint}` : c.claim,
    clusterId: c.clusterId,
    sourceRefs: [c.sourceUrl],
    confidence: 0.7,
    version: 1,
  }));
}

export async function runPipeline(emit: Emit): Promise<void> {
  const reg = getRegistry();

  /* ------------------------------ cycle 1 ------------------------------ */
  const tickets = await runIngest(emitFor(emit, 1, "ingest"));
  const clusters = await runUnderstand(tickets, emitFor(emit, 1, "understand"));
  const evidence = await runResearch(clusters, tickets, emitFor(emit, 1, "research"));
  await reg.contextStore.append(evidenceToRows(evidence));

  const top = clusters[0];
  const reports: Partial<Record<Cycle, BanditReport>> = {};
  const creativesByCycle: Partial<Record<Cycle, Creative[]>> = {};

  for (const cycle of [1, 2] as Cycle[]) {
    /* compile */
    const pe = emitFor(emit, cycle, "compile");
    pe.start({ clusterId: top.id, clusterLabel: top.label, segments: SEGMENTS });
    const packs: ContextPack[] = [];
    for (const segment of SEGMENTS) {
      const pack = await reg.contextStore.compile({ clusterId: top.id, segment });
      packs.push(pack);
      pe.item(stripRows(pack));
    }
    writeCache(`packs-c${cycle}.json`, packs);
    pe.done({ packs: packs.length, layerVersion: packs[0]?.layerVersion });

    /* create */
    const ce = emitFor(emit, cycle, "create");
    ce.start({ packs: packs.length });
    const creatives: Creative[] = [];
    for (const pack of packs) {
      const cs = await reg.generateCreatives(pack, cycle, {
        onItem: (c) => ce.item(c),
      });
      creatives.push(...cs);
    }
    creativesByCycle[cycle] = creatives;
    writeCache(`creatives-c${cycle}.json`, creatives);
    ce.done({ count: creatives.length });

    /* test */
    const te = emitFor(emit, cycle, "test");
    te.start({ segments: SEGMENTS, variants: creatives.length });
    const report = await reg.runBandit(creatives, cycle, {
      onTick: (states) => te.tick({ states }),
    });
    reports[cycle] = report;
    writeCache(`bandit-c${cycle}.json`, report);
    te.done(report);

    /* learn — cycle 1 only: write winners back into the layer */
    if (cycle === 1) {
      const le = emitFor(emit, 1, "learn");
      le.start({ from: "bandit-c1" });
      const rows = await reg.runLearner(report, packs);
      await reg.contextStore.append(rows);
      for (const r of rows) le.item(r);
      writeCache("learnings.json", rows);
      le.done({ rows: rows.length, layerVersion: 2 });
    }
  }

  /* ------------------------- ship (awaiting) --------------------------- */
  const se = emitFor(emit, 2, "ship");
  se.start({ channel: process.env.SLACK_CHANNEL?.trim() || "#backtalk-demo" });
  const c2 = creativesByCycle[2] ?? [];
  const winners = {} as ShipBrief["winners"];
  for (const segment of SEGMENTS) {
    const w = reports[2]?.winners[segment];
    if (!w) continue;
    const creative = c2.find((c) => c.id === w.winnerCreativeId);
    winners[segment] = {
      creativeId: w.winnerCreativeId,
      angle: w.winnerAngle,
      headline: creative?.headline ?? "",
      ctrEstimate: w.ctrEstimate,
    };
  }
  const seenUrls = new Set<string>();
  const brief: ShipBrief = {
    topClusterLabel: top.label,
    revenueAtRisk: top.revenueAtRisk,
    winners,
    cycle1AvgCtr: reports[1]?.avgCtr ?? 0,
    cycle2AvgCtr: reports[2]?.avgCtr ?? 0,
    evidenceLinks: evidence
      .filter((e) => (seenUrls.has(e.sourceUrl) ? false : seenUrls.add(e.sourceUrl)))
      .slice(0, 4)
      .map((e) => ({ sourceName: e.sourceName, sourceUrl: e.sourceUrl })),
  };
  writeCache("ship.json", brief);
  se.raw({ cycle: 2, stage: "ship", status: "awaiting_approval", payload: brief });
}
