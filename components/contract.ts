/**
 * TEMPORARY contract shim (Person 3 zone).
 *
 * Mirrors the shared contract from the project brief until Person 1 lands the
 * frozen `lib/schemas.ts`. At that point this file's body becomes:
 *
 *   export * from "@/lib/schemas";
 *
 * and any drift surfaces as type errors inside Person 3's zone only.
 * Every Person-3 file imports contract types from HERE, never from lib/schemas.
 */

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

/* ---- Person-3-owned payload shapes (emitted by the media buyer) ---- */

/** payload of every `test`-stage `item` event: one tick across all live segments */
export interface TestTickPayload {
  states: BanditState[];
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

export const STAGES: Stage[] = [
  "ingest",
  "understand",
  "research",
  "compile",
  "create",
  "test",
  "learn",
  "ship",
];
