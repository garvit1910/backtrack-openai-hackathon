/**
 * Replay engine: re-emits the recorded event log (fixtures/cache/events.jsonl)
 * through the same SSE stream with stage-tuned pacing. Byte-identical events —
 * the UI cannot tell replay from live. This is what runs on stage.
 */
import type { StageEvent } from "../schemas";
import { readJsonl } from "./cache";

type Recorded = StageEvent & { t?: number };

/** ms of delay BEFORE each event, by stage and status */
const PACING: Record<string, { start: number; item: number; tick: number; done: number }> = {
  ingest: { start: 300, item: 15, tick: 15, done: 400 },
  understand: { start: 500, item: 350, tick: 100, done: 600 },
  research: { start: 500, item: 260, tick: 120, done: 600 },
  compile: { start: 400, item: 200, tick: 100, done: 500 },
  create: { start: 400, item: 450, tick: 100, done: 500 },
  test: { start: 400, item: 60, tick: 60, done: 700 },
  learn: { start: 400, item: 500, tick: 100, done: 600 },
  ship: { start: 400, item: 300, tick: 100, done: 800 },
};

// seeded jitter so replays are identical run to run
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function delayFor(e: StageEvent, rand: () => number, speed: number): number {
  const row = PACING[e.stage] ?? PACING.ingest;
  const base =
    e.status === "start"
      ? row.start
      : e.status === "item"
        ? row.item
        : e.status === "tick"
          ? row.tick
          : row.done; // done | awaiting_approval | shipped
  // research items land staggered, as if the fan-out is completing live
  const jitter = e.stage === "research" && e.status !== "start" ? (rand() - 0.5) * 160 : 0;
  return Math.max(0, (base + jitter) * speed);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function hasReplayLog(): boolean {
  return readJsonl<Recorded>("events.jsonl").length > 0;
}

export async function replayRun(
  emit: (e: StageEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const events = readJsonl<Recorded>("events.jsonl");
  const rand = mulberry32(7);
  const speed = Number(process.env.REPLAY_SPEED?.trim() || "1") || 1;
  for (const { t: _drop, ...e } of events) {
    if (signal.aborted) return;
    await sleep(delayFor(e, rand, speed));
    emit(e);
  }
}
