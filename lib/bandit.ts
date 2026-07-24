/**
 * Thompson Sampling bandit engine + hidden-preference market simulator.
 *
 * Pure functions only: no I/O, no Date.now, no Math.random. Every stochastic
 * function takes an explicit RNG so the same seed reproduces the same run —
 * on the server (orchestrator / cache generation) and in the browser (mock
 * rehearsal) alike.
 *
 * The market sim is the honesty mechanism of the two-cycle demo: each segment
 * has a fixed hidden preference over angles, and true CTR = base + alignment
 * bonus. Cycle 2 only scores higher if generation actually concentrated on the
 * angles the cycle-1 bandit discovered. Nothing here knows about cycles.
 */

import type {
  Angle,
  BanditReport,
  BanditState,
  BanditVariant,
  Creative,
  Cycle,
  Segment,
  SegmentWinner,
} from "@/components/contract";
import { SEGMENTS } from "@/components/contract";

/* ------------------------------- RNG ---------------------------------- */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a — stable per-creative jitter so a creative's quality is a fixed fact of the world */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* --------------------------- special functions ------------------------- */

const LANCZOS_G = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Lanczos (g=7) — stays finite where Gamma(x) itself would overflow, e.g. α+β ≈ 10⁴ */
export function logGamma(x: number): number {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let acc = 0.99999999999980993;
  for (let i = 0; i < LANCZOS_G.length; i++) acc += LANCZOS_G[i] / (z + i + 1);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(acc);
}

export function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

export function betaPdf(x: number, a: number, b: number): number {
  if (x <= 0 || x >= 1) return 0;
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logBeta(a, b));
}

export interface PdfPoint {
  x: number;
  y: number;
}

/**
 * Beta PDF sampled for rendering. Domain defaults to [0, 0.15] — CTR
 * posteriors are needle-thin on [0, 1]. Raw densities are returned; the chart
 * normalizes by the max across all curves so sharper = more confident reads.
 */
export function betaPdfPoints(
  a: number,
  b: number,
  n = 101,
  xMax = 0.15,
): PdfPoint[] {
  const pts: PdfPoint[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * xMax;
    pts.push({ x, y: betaPdf(x, a, b) });
  }
  return pts;
}

/* ----------------------------- sampling -------------------------------- */

function sampleNormal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Marsaglia–Tsang; shape < 1 handled via the U^(1/a) boost */
export function sampleGamma(shape: number, rng: Rng): number {
  if (shape < 1) {
    let u = 0;
    while (u === 0) u = rng();
    return sampleGamma(shape + 1, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = sampleNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(a: number, b: number, rng: Rng): number {
  const x = sampleGamma(a, rng);
  const y = sampleGamma(b, rng);
  return x / (x + y);
}

/* ---------------------------- market sim ------------------------------- */

export interface MarketConfig {
  baseCtr: number;
  alignBonus: number;
  /** the hidden per-segment preference the bandit has to discover */
  prefs: Record<Segment, Angle>;
  /** amplitude of fixed per-creative quality jitter */
  jitterAmp: number;
}

export const DEFAULT_MARKET: MarketConfig = {
  baseCtr: 0.02,
  alignBonus: 0.05,
  prefs: {
    starter: "value",
    growth: "speed",
    enterprise: "reliability",
  },
  jitterAmp: 0.005,
};

/** Ground-truth CTR of a creative shown to a segment. Fixed for the whole run. */
export function trueCtr(
  creative: Pick<Creative, "id" | "angle">,
  segment: Segment,
  market: MarketConfig = DEFAULT_MARKET,
): number {
  const aligned = creative.angle === market.prefs[segment];
  const jitter = ((hashString(creative.id) / 0xffffffff) * 2 - 1) * market.jitterAmp;
  return Math.max(0.001, market.baseCtr + (aligned ? market.alignBonus : 0) + jitter);
}

/* --------------------------- bandit proper ------------------------------ */

export const TICK_BATCH = 250;
const ALLOC_DRAWS = 32;
const BUDGET_EMA = 0.3;

export function initBandit(
  creatives: Creative[],
  segment: Segment,
  cycle: Cycle,
): BanditState {
  const variants: BanditVariant[] = creatives
    .filter((c) => c.segment === segment)
    .map((c) => ({
      creativeId: c.id,
      angle: c.angle,
      alpha: 1,
      beta: 1,
      impressions: 0,
      clicks: 0,
      budgetShare: 1 / Math.max(1, creatives.filter((x) => x.segment === segment).length),
    }));
  return { segment, cycle, tick: 0, variants };
}

/**
 * One Thompson tick: sample θ ~ Beta(α, β) per variant ALLOC_DRAWS times,
 * split a fixed impression batch by win counts, simulate clicks at true CTR,
 * update posteriors. Returns a new state; never mutates.
 */
export function banditTick(
  state: BanditState,
  creativesById: Map<string, Creative>,
  rng: Rng,
  market: MarketConfig = DEFAULT_MARKET,
  batchSize = TICK_BATCH,
): BanditState {
  const n = state.variants.length;
  if (n === 0) return { ...state, tick: state.tick + 1 };

  const wins = new Array<number>(n).fill(0);
  for (let d = 0; d < ALLOC_DRAWS; d++) {
    let best = 0;
    let bestTheta = -1;
    for (let i = 0; i < n; i++) {
      const v = state.variants[i];
      const theta = sampleBeta(v.alpha, v.beta, rng);
      if (theta > bestTheta) {
        bestTheta = theta;
        best = i;
      }
    }
    wins[best]++;
  }

  const variants = state.variants.map((v, i) => {
    const share = wins[i] / ALLOC_DRAWS;
    const impressions = Math.round(share * batchSize);
    const creative = creativesById.get(v.creativeId);
    const p = creative ? trueCtr(creative, state.segment, market) : market.baseCtr;
    let clicks = 0;
    for (let k = 0; k < impressions; k++) if (rng() < p) clicks++;
    return {
      ...v,
      alpha: v.alpha + clicks,
      beta: v.beta + (impressions - clicks),
      impressions: v.impressions + impressions,
      clicks: v.clicks + clicks,
      budgetShare: v.budgetShare * (1 - BUDGET_EMA) + share * BUDGET_EMA,
    };
  });

  return { ...state, tick: state.tick + 1, variants };
}

export function posteriorMean(v: BanditVariant): number {
  return v.alpha / (v.alpha + v.beta);
}

/** Monte-Carlo P(current leader beats every other variant) */
export function winnerConfidence(
  state: BanditState,
  rng: Rng,
  draws = 500,
): { creativeId: string; angle: Angle; confidence: number } {
  const n = state.variants.length;
  if (n === 0) return { creativeId: "", angle: "value", confidence: 0 };
  if (n === 1) {
    const only = state.variants[0];
    return { creativeId: only.creativeId, angle: only.angle, confidence: 1 };
  }
  let leader = 0;
  for (let i = 1; i < n; i++) {
    if (posteriorMean(state.variants[i]) > posteriorMean(state.variants[leader])) leader = i;
  }
  let winsForLeader = 0;
  for (let d = 0; d < draws; d++) {
    let best = 0;
    let bestTheta = -1;
    for (let i = 0; i < n; i++) {
      const v = state.variants[i];
      const theta = sampleBeta(v.alpha, v.beta, rng);
      if (theta > bestTheta) {
        bestTheta = theta;
        best = i;
      }
    }
    if (best === leader) winsForLeader++;
  }
  const lv = state.variants[leader];
  return {
    creativeId: lv.creativeId,
    angle: lv.angle,
    confidence: winsForLeader / draws,
  };
}

export function observedCtr(state: BanditState): number {
  const imp = state.variants.reduce((s, v) => s + v.impressions, 0);
  const clicks = state.variants.reduce((s, v) => s + v.clicks, 0);
  return imp > 0 ? clicks / imp : 0;
}

export function summarizeReport(
  states: BanditState[],
  cycle: Cycle,
  rng: Rng,
): BanditReport {
  const winners = {} as Record<Segment, SegmentWinner>;
  for (const segment of SEGMENTS) {
    const state = states.find((s) => s.segment === segment);
    if (!state) continue;
    const w = winnerConfidence(state, rng);
    const wv = state.variants.find((v) => v.creativeId === w.creativeId);
    winners[segment] = {
      winnerCreativeId: w.creativeId,
      winnerAngle: w.angle,
      ctrEstimate: wv ? posteriorMean(wv) : 0,
      confidence: w.confidence,
    };
  }
  const totalImp = states.reduce(
    (s, st) => s + st.variants.reduce((a, v) => a + v.impressions, 0),
    0,
  );
  const totalClicks = states.reduce(
    (s, st) => s + st.variants.reduce((a, v) => a + v.clicks, 0),
    0,
  );
  return {
    cycle,
    winners,
    avgCtr: totalImp > 0 ? totalClicks / totalImp : 0,
  };
}
