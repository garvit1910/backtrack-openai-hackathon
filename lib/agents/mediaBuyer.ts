/**
 * Media Buyer agent — runs the per-segment Thompson Sampling bandits and
 * narrates them as StageEvents.
 *
 * Called by Person 1's orchestrator (server, tickDelayMs 0) and by the mock
 * player in the browser (tickDelayMs ~100 so the charts animate). The final
 * BanditReport is what Person 2's Learner turns into `learning` context rows.
 *
 * Events emitted, in order:
 *   { cycle, stage: 'test', status: 'start',    payload: { segments } }
 *   { cycle, stage: 'test', status: 'item',     payload: { states } }   × ~N ticks
 *   { cycle, stage: 'test', status: 'complete', payload: BanditReport }
 */

import type {
  BanditReport,
  BanditState,
  Creative,
  Cycle,
  Segment,
  StageEvent,
} from "@/components/contract";
import { SEGMENTS } from "@/components/contract";
import {
  DEFAULT_MARKET,
  MarketConfig,
  banditTick,
  initBandit,
  mulberry32,
  summarizeReport,
  winnerConfidence,
} from "@/lib/bandit";

export interface MediaBuyerOptions {
  creatives: Creative[];
  cycle: Cycle;
  seed?: number;
  emit?: (e: StageEvent) => void | Promise<void>;
  /** ms between ticks; 0 (default) for server runs, ~100 for animated mock runs */
  tickDelayMs?: number;
  maxTicks?: number;
  minTicks?: number;
  confidenceThreshold?: number;
  market?: MarketConfig;
  /** cooperative cancellation for the browser player */
  signal?: AbortSignal;
}

export interface MediaBuyerResult {
  report: BanditReport;
  finalStates: BanditState[];
  /** one snapshot of all segment states per round — enough for replay to re-emit ticks */
  tickHistory: BanditState[][];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runMediaBuyer(opts: MediaBuyerOptions): Promise<MediaBuyerResult> {
  const {
    creatives,
    cycle,
    seed = 1337 + cycle,
    emit,
    tickDelayMs = 0,
    maxTicks = 40,
    minTicks = 12,
    confidenceThreshold = 0.95,
    market = DEFAULT_MARKET,
    signal,
  } = opts;

  const rng = mulberry32(seed);
  const creativesById = new Map(creatives.map((c) => [c.id, c]));
  const segments = SEGMENTS.filter((s) => creatives.some((c) => c.segment === s));

  const states = new Map<Segment, BanditState>(
    segments.map((s) => [s, initBandit(creatives, s, cycle)]),
  );
  const converged = new Set<Segment>();
  const tickHistory: BanditState[][] = [];

  await emit?.({ cycle, stage: "test", status: "start", payload: { segments } });

  for (let round = 0; round < maxTicks; round++) {
    if (signal?.aborted) break;
    if (converged.size === segments.length) break;

    for (const segment of segments) {
      if (converged.has(segment)) continue;
      const next = banditTick(states.get(segment)!, creativesById, rng, market);
      states.set(segment, next);
      if (next.tick >= minTicks) {
        const w = winnerConfidence(next, rng);
        if (w.confidence >= confidenceThreshold) converged.add(segment);
      }
    }

    const snapshot = segments.map((s) => states.get(s)!);
    tickHistory.push(snapshot);
    await emit?.({ cycle, stage: "test", status: "item", payload: { states: snapshot } });
    if (tickDelayMs > 0) await sleep(tickDelayMs);
  }

  const finalStates = segments.map((s) => states.get(s)!);
  const report = summarizeReport(finalStates, cycle, rng);
  await emit?.({ cycle, stage: "test", status: "complete", payload: report });

  return { report, finalStates, tickHistory };
}
