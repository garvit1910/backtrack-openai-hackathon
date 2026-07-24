/**
 * Person 2 contract seam.
 *
 * SECTION A mirrors the shared contract from the project brief (and is kept
 * field-identical to Person 3's shim in components/contract.ts) until Person 1
 * lands the frozen `lib/schemas.ts`. At that point Section A is deleted and
 * replaced with:
 *
 *   export * from "@/lib/schemas";
 *
 * SECTION B (Person-2-only helpers) survives the merge. Every Person-2 file
 * imports contract types from HERE, never from lib/schemas directly.
 */

import { z } from "zod";

/* ================= SECTION A — shared contract (temporary) ================= */

export type Segment = "starter" | "growth" | "enterprise";

export type Angle =
  | "reliability"
  | "speed"
  | "value"
  | "fit_guidance"
  | "service"
  | "trust";

export type Stage =
  | "ingest"
  | "understand"
  | "research"
  | "compile"
  | "create"
  | "test"
  | "learn"
  | "ship";

export type Cycle = 1 | 2;

export interface Ticket {
  id: string;
  subject: string;
  body: string;
  createdAt: string;
  account: {
    name: string;
    segment: Segment;
    mrr: number;
  };
}

export interface Cluster {
  id: string;
  label: string;
  /** share of all tickets, 0..1 */
  share: number;
  /** trend as fractional change, e.g. +0.42 = growing 42% */
  trend: number;
  revenueAtRisk: number;
  segmentBreakdown: Record<Segment, number>;
  exemplarTicketIds: string[];
  ticketCount: number;
}

export interface EvidenceCard {
  clusterId: string;
  claim: string;
  counterpoint?: string;
  sourceUrl: string;
  sourceName: string;
}

export type ContextRowType =
  | "brand_fact"
  | "pain_point"
  | "evidence"
  | "segment_insight"
  | "learning";

export interface ContextRow {
  id: string;
  type: ContextRowType;
  content: string;
  segment?: Segment;
  clusterId?: string;
  sourceRefs: string[];
  confidence: number;
  version: number;
  embedding?: number[];
}

export interface ContextPack {
  fingerprint: string;
  layerVersion: number;
  task: {
    clusterId: string;
    segment: Segment;
  };
  rows: ContextRow[];
}

export interface Creative {
  id: string;
  clusterId: string;
  segment: Segment;
  angle: Angle;
  cycle: Cycle;
  kind: string;
  headline: string;
  body: string;
  citations: {
    ticketIds: string[];
    sourceUrls: string[];
  };
  packFingerprint: string;
}

export interface BanditVariant {
  creativeId: string;
  angle: Angle;
  alpha: number;
  beta: number;
  impressions: number;
  clicks: number;
  /** smoothed share of the impression budget, 0..1 */
  budgetShare: number;
}

export interface BanditState {
  segment: Segment;
  cycle: Cycle;
  tick: number;
  variants: BanditVariant[];
}

export interface SegmentWinner {
  winnerCreativeId: string;
  winnerAngle: Angle;
  ctrEstimate: number;
  confidence: number;
}

export interface BanditReport {
  cycle: Cycle;
  winners: Record<Segment, SegmentWinner>;
  avgCtr: number;
}

export type StageStatus = "start" | "item" | "complete";

export interface StageEvent {
  cycle: Cycle;
  stage: Stage;
  status: StageStatus;
  payload?: unknown;
}

export const SEGMENTS: Segment[] = ["starter", "growth", "enterprise"];

export const ANGLES: Angle[] = [
  "reliability",
  "speed",
  "value",
  "fit_guidance",
  "service",
  "trust",
];

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
export type NewContextRow = Omit<ContextRow, "version" | "embedding">;

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
