/**
 * Person 3's import seam for the shared contract.
 *
 * lib/schemas.ts landed and froze at Gate 1 — this file now just re-exports it
 * (every Person-3 component imports from here, so the swap was one line), plus
 * Person-3-owned payload extensions that ride inside `StageEvent.payload`
 * (structurally additive; cross-zone consumers only rely on the frozen shapes).
 */

export * from "@/lib/schemas";

import type { Segment, TestTickPayload } from "@/lib/schemas";

/** what the media buyer actually puts in `test`/`tick` events — a superset of TestTickPayload */
export interface MediaBuyerTickPayload extends TestTickPayload {
  /** first tick at which each segment's winning angle hit the confidence bar */
  convergedAt?: Partial<Record<Segment, number>>;
}
