/**
 * FROZEN SHARED CONTRACT — Backtalk
 *
 * Owner: Person 1. After Gate 1 this file is FROZEN: nobody (including
 * Person 1) changes existing shapes. Additive changes only in emergencies,
 * announced in the team channel first.
 *
 * Persons 2 & 3 import all cross-zone types from here and implement the
 * function contracts at the bottom (ContextStoreApi, GenerateCreatives,
 * RunLearner, RunBandit). Person 1's orchestrator calls those through
 * lib/signals/registry.ts — the only cross-zone seam in the repo.
 */

/* ------------------------------ primitives ------------------------------ */

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

/* ------------------------------ data shapes ----------------------------- */

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
  /** Σ MRR of accounts with tickets in this cluster */
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
  /** one sentence */
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

/* ------------------------------- events --------------------------------- */

export type StageStatus =
  | "start"
  | "item"
  | "tick"
  | "done"
  | "awaiting_approval"
  | "shipped";

export interface StageEvent {
  cycle: Cycle;
  stage: Stage;
  status: StageStatus;
  payload?: unknown;
  /** degradation signaling: a stage that fell back to cache says so here */
  meta?: { source?: "live" | "cache" | "stub"; warning?: string };
}

/** payload of every `test`-stage `tick` event: one tick across all segments */
export interface TestTickPayload {
  states: BanditState[];
}

/** payload of the cycle-2 `ship` `awaiting_approval` event, and what
 *  POST /api/ship reads from fixtures/cache/ship.json */
export interface ShipBrief {
  topClusterLabel: string;
  revenueAtRisk: number;
  winners: Record<
    Segment,
    { creativeId: string; angle: Angle; headline: string; ctrEstimate: number }
  >;
  cycle1AvgCtr: number;
  cycle2AvgCtr: number;
  evidenceLinks: { sourceName: string; sourceUrl: string }[];
}

/* -------------------- cross-zone function contracts ---------------------- */
/* Person 1's orchestrator calls these via lib/signals/registry.ts.          */
/* Stubs live in lib/signals/stubs/ until the real modules land.             */

/** Person 2 — lib/context (the versioned brand context layer) */
export interface ContextStoreApi {
  /** research + learner rows enter the layer through here */
  append(rows: ContextRow[]): Promise<void>;
  /** embedding-retrieved, fingerprinted pack for one (cluster, segment) task */
  compile(task: { clusterId: string; segment: Segment }): Promise<ContextPack>;
}

/** Person 2 — lib/agents/creative.ts */
export type GenerateCreatives = (
  pack: ContextPack,
  cycle: Cycle,
  opts?: { onItem?: (c: Creative) => void }
) => Promise<Creative[]>;

/** Person 2 — lib/agents/learner.ts: winners → new `learning` ContextRows */
export type RunLearner = (
  report: BanditReport,
  packs: ContextPack[]
) => Promise<ContextRow[]>;

/** Person 3 — lib/agents/mediaBuyer.ts: runs all segments for one cycle,
 *  calling onTick once per tick with the state of every segment's bandit */
export type RunBandit = (
  creatives: Creative[],
  cycle: Cycle,
  opts: { onTick: (states: BanditState[]) => void }
) => Promise<BanditReport>;

/* ------------------------------ constants -------------------------------- */

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
