/**
 * Person 2 contract seam.
 *
 * Section A re-exports the FROZEN shared contract (lib/schemas.ts, Person 1).
 * Section B holds Person-2-only helpers. Every Person-2 file imports contract
 * types from HERE, never from lib/schemas directly — so drift surfaces in one
 * place.
 */

import { z } from "zod";
import type { Segment, StageEvent } from "../schemas";

/* ================= SECTION A — frozen shared contract ===================== */

export * from "../schemas";

/* ================= SECTION B — Person 2 helpers (permanent) ================= */

/** Orchestrator-supplied event sink; demo harness passes a console logger. */
export type Emit = (e: StageEvent) => void;

/** One generation task = the top cluster for one segment. */
export interface Task {
  clusterId: string;
  clusterLabel: string;
  segment: Segment;
}

/** Row as handed to store.append(): id is deterministic and caller-supplied;
 *  version + embedding are stamped by the store. */
export type NewContextRow = Omit<
  import("../schemas").ContextRow,
  "version" | "embedding"
>;

const segmentZ = z.enum(["starter", "growth", "enterprise"]);
const angleZ = z.enum([
  "reliability",
  "speed",
  "value",
  "fit_guidance",
  "service",
  "trust",
]);

export const contextRowZ = z.object({
  id: z.string().min(1),
  type: z.enum([
    "brand_fact",
    "pain_point",
    "evidence",
    "segment_insight",
    "learning",
  ]),
  content: z.string().min(1),
  segment: segmentZ.optional(),
  clusterId: z.string().optional(),
  sourceRefs: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  version: z.number().int().positive(),
  embedding: z.array(z.number()).optional(),
});

export const creativeZ = z.object({
  id: z.string().min(1),
  clusterId: z.string().min(1),
  segment: segmentZ,
  angle: angleZ,
  cycle: z.union([z.literal(1), z.literal(2)]),
  kind: z.string().min(1),
  headline: z.string().min(1),
  body: z.string().min(1),
  citations: z.object({
    ticketIds: z.array(z.string()),
    sourceUrls: z.array(z.string()),
  }),
  packFingerprint: z.string().min(1),
});

export const banditReportZ = z.object({
  cycle: z.union([z.literal(1), z.literal(2)]),
  winners: z.record(
    segmentZ,
    z.object({
      winnerCreativeId: z.string(),
      winnerAngle: angleZ,
      ctrEstimate: z.number(),
      confidence: z.number(),
    })
  ),
  avgCtr: z.number(),
});
