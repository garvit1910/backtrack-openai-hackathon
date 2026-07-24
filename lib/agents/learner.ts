import fs from "node:fs";
import path from "node:path";
import type {
  Angle,
  BanditReport,
  ContextRow,
  Creative,
  Emit,
  NewContextRow,
  RunLearner,
  Segment,
} from "../context/contract";
import { SEGMENTS } from "../context/contract";
import { bannedClaimRegexes } from "../context/brand";
import { chatStructured } from "../context/llm";
import { sanitizeRows } from "../context/compile";
import { allRows, append, layerVersion, snapshot } from "../context/store";

const CACHE_DIR = path.join(process.cwd(), "fixtures", "cache");

/* Template rows are the guaranteed path — the learner is the hinge of the
 * whole thesis and must never fail. The LLM call only polishes wording and
 * is discarded unless it keeps the load-bearing tokens. */

const INSIGHT_BY_ANGLE: Record<Angle, (seg: Segment) => string> = {
  value: (s) => `${s} buyers respond to concrete cost and ROI numbers over feature lists — show what switching saves.`,
  speed: (s) => `${s} buyers care most about time-to-value — lead with minutes and days, not capability lists.`,
  trust: (s) => `${s} buyers need security assurance before anything else — put compliance and single sign-on proof first.`,
  reliability: (s) => `${s} buyers want proof things keep working — lead with uptime and recovery behavior.`,
  fit_guidance: (s) => `${s} buyers want an honest fit assessment before committing — invite evaluation, don't oversell.`,
  service: (s) => `${s} buyers weigh human support heavily — put specialists and response times up front.`,
};

function clusterLabelFor(clusterId: string): string {
  const pain = allRows().find((r) => r.id === `pain:${clusterId}`);
  return pain ? pain.content.split(" — ")[0] : clusterId;
}

function templateLearning(
  seg: Segment,
  angle: Angle,
  label: string,
  ctrEstimate: number,
  avgCtr: number
): string {
  const ctr = (ctrEstimate * 100).toFixed(1);
  const avg = (avgCtr * 100).toFixed(1);
  return `For ${seg} accounts, ${angle} framing outperformed alternatives on "${label}" (est. CTR ${ctr}% vs ${avg}% average). Lead every ${seg} ad with the ${angle} angle.`;
}

const POLISH_SCHEMA = {
  type: "object",
  properties: {
    learning: { type: "string" },
    segmentInsight: { type: "string" },
  },
  required: ["learning", "segmentInsight"],
  additionalProperties: false,
};

async function polish(
  seg: Segment,
  angle: Angle,
  learning: string,
  insight: string
): Promise<{ learning: string; segmentInsight: string } | null> {
  const banned = bannedClaimRegexes();
  return chatStructured({
    system:
      "You rewrite ad-performance findings into crisp one-sentence context rows for a brand knowledge layer. Keep every number. The learning MUST contain the literal angle token and the segment name.",
    user: `Segment: ${seg}\nWinning angle token: ${angle}\n\nRewrite these two rows (one sentence each, keep them directive):\nlearning: ${learning}\nsegmentInsight: ${insight}`,
    schemaName: "learner_rows",
    jsonSchema: POLISH_SCHEMA,
    validate: (v) => {
      const out = v as { learning: string; segmentInsight: string };
      const angleRx = new RegExp(`\\b${angle}\\b`, "i");
      const segRx = new RegExp(`\\b${seg}\\b`, "i");
      if (!angleRx.test(out.learning)) throw new Error(`learning must contain the token "${angle}"`);
      if (!segRx.test(out.learning) || !segRx.test(out.segmentInsight))
        throw new Error(`both rows must name the segment "${seg}"`);
      for (const rx of banned) {
        if (rx.test(out.learning) || rx.test(out.segmentInsight))
          throw new Error(`banned claim matched ${rx}`);
      }
      return out;
    },
  });
}

/** Core: BanditReport + (segment → clusterId) map → 1-2 rows per segment.
 *  Builds only — appending is the caller's job. */
export async function buildLearnerRows(
  report: BanditReport,
  clusterBySegment: Partial<Record<Segment, string>>
): Promise<NewContextRow[]> {
  const cycle = report.cycle;
  const rows: NewContextRow[] = [];
  for (const seg of SEGMENTS) {
    const winner = report.winners[seg];
    if (!winner) continue;
    const clusterId = clusterBySegment[seg];
    const label = clusterId ? clusterLabelFor(clusterId) : "the top pain point";
    const learning = templateLearning(
      seg,
      winner.winnerAngle,
      label,
      winner.ctrEstimate,
      report.avgCtr
    );
    const insight = INSIGHT_BY_ANGLE[winner.winnerAngle](seg);
    const polished = await polish(seg, winner.winnerAngle, learning, insight);
    rows.push(
      {
        id: `learn:c${cycle}:${seg}`,
        type: "learning",
        content: polished?.learning ?? learning,
        segment: seg,
        ...(clusterId ? { clusterId } : {}),
        sourceRefs: [`bandit:c${cycle}:${seg}`],
        confidence: winner.confidence,
      },
      {
        id: `insight:c${cycle}:${seg}`,
        type: "segment_insight",
        content: polished?.segmentInsight ?? insight,
        segment: seg,
        ...(clusterId ? { clusterId } : {}),
        sourceRefs: [`bandit:c${cycle}:${seg}`],
        confidence: Math.round(winner.confidence * 0.9 * 100) / 100,
      }
    );
  }
  return rows;
}

/** Frozen cross-zone contract (lib/schemas.ts): returns rows for the
 *  orchestrator to append via contextStore.append (which bumps the layer). */
export const runLearner: RunLearner = async (report, packs) => {
  const clusterBySegment: Partial<Record<Segment, string>> = {};
  for (const pack of packs) {
    clusterBySegment[pack.task.segment] = pack.task.clusterId;
  }
  const rows = await buildLearnerRows(report, clusterBySegment);
  return rows.map((r) => ({ ...r, version: layerVersion() + 1 }));
};

/** Standalone entry point (demo harness): builds, appends (v bump),
 *  snapshots, and streams learn events itself. */
export async function runLearnStage(
  report: BanditReport,
  creatives?: Creative[],
  emit?: Emit
): Promise<ContextRow[]> {
  const cycle = report.cycle;
  emit?.({ cycle, stage: "learn", status: "start" });

  const pool =
    creatives ??
    (JSON.parse(
      fs.readFileSync(path.join(CACHE_DIR, `creatives-c${cycle}.json`), "utf8")
    ) as Creative[]);
  const clusterBySegment: Partial<Record<Segment, string>> = {};
  for (const seg of SEGMENTS) {
    const winner = report.winners[seg];
    if (!winner) continue;
    const creative = pool.find((c) => c.id === winner.winnerCreativeId);
    if (creative) clusterBySegment[seg] = creative.clusterId;
  }

  const rows = await buildLearnerRows(report, clusterBySegment);
  const appended = await append(rows, { bump: true });
  await snapshot(`v${layerVersion()}`);
  for (const row of sanitizeRows(appended)) {
    emit?.({ cycle, stage: "learn", status: "item", payload: row });
  }
  emit?.({
    cycle,
    stage: "learn",
    status: "done",
    payload: { layerVersion: layerVersion(), newRows: appended.length },
  });
  return appended;
}
