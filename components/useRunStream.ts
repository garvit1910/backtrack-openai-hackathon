/**
 * The screen's single source of truth: every panel is a pure view over the
 * RunState produced here by reducing StageEvents — whether they arrive over
 * SSE (/api/run, live or replay) or from the in-browser mock player
 * (components/mock/mockRun.ts, the zero-server fallback). Swapping sources is
 * a mode string.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  BanditReport,
  BanditState,
  Cluster,
  ContextPack,
  ContextRow,
  Creative,
  Cycle,
  EvidenceCard,
  MediaBuyerTickPayload,
  Segment,
  ShipBrief,
  Stage,
  StageEvent,
  Ticket,
} from "@/components/contract";
import { SEGMENTS } from "@/components/contract";
import { mulberry32, winnerConfidence, hashString } from "@/lib/bandit";
import { CONVERGENCE_CONF } from "@/lib/agents/mediaBuyer";
import { playMockRun } from "@/components/mock/mockRun";

export type RunMode = "replay" | "live" | "mock";

export interface BanditView {
  states: BanditState[];
  /** live winner-angle confidence per segment, recomputed client-side each tick */
  confidence: Partial<Record<Segment, number>>;
  convergedAt: Partial<Record<Segment, number>>;
  ticks: number;
}

export interface RunState {
  status: "idle" | "running" | "ended";
  mode: RunMode | null;
  cycle: Cycle;
  activeStage: Stage | null;
  /** keyed `${cycle}:${stage}` */
  stages: Record<string, "active" | "done">;
  ticketCount: number;
  recentTickets: Ticket[];
  ticketsById: Record<string, Ticket>;
  clusters: Cluster[];
  evidence: EvidenceCard[];
  researchPulse: number;
  rows: ContextRow[];
  newRowIds: string[];
  packs: Partial<Record<Cycle, ContextPack[]>>;
  layerVersion: number;
  creatives: Record<Cycle, Creative[]>;
  bandit: Partial<Record<Cycle, BanditView>>;
  reports: Partial<Record<Cycle, BanditReport>>;
  learnPulse: number;
  shipChannel: string | null;
  shipBrief: ShipBrief | null;
  shipped: { delivery?: unknown; zendeskMacro?: { name?: string; status?: string } } | null;
  warnings: string[];
}

export const initialRunState: RunState = {
  status: "idle",
  mode: null,
  cycle: 1,
  activeStage: null,
  stages: {},
  ticketCount: 0,
  recentTickets: [],
  ticketsById: {},
  clusters: [],
  evidence: [],
  researchPulse: 0,
  rows: [],
  newRowIds: [],
  packs: {},
  layerVersion: 1,
  creatives: { 1: [], 2: [] },
  bandit: {},
  reports: {},
  learnPulse: 0,
  shipChannel: null,
  shipBrief: null,
  shipped: null,
  warnings: [],
};

export type RunAction =
  | { type: "reset" }
  | { type: "started"; mode: RunMode }
  | { type: "ended" }
  | { type: "warn"; message: string }
  | { type: "event"; event: StageEvent };

function upsertRows(rows: ContextRow[], incoming: ContextRow[]): ContextRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const r of incoming) byId.set(r.id, r);
  return Array.from(byId.values());
}

/** enrich a tick with client-computed confidence (the wire only carries α/β) */
function banditViewFromTick(
  prev: BanditView | undefined,
  payload: MediaBuyerTickPayload,
): BanditView {
  const confidence: Partial<Record<Segment, number>> = { ...prev?.confidence };
  const convergedAt: Partial<Record<Segment, number>> = {
    ...prev?.convergedAt,
    ...payload.convergedAt,
  };
  for (const state of payload.states) {
    // deterministic per (segment, tick) so re-renders can't flicker the number
    const rng = mulberry32(hashString(state.segment) ^ (state.tick * 2654435761));
    const w = winnerConfidence(state, rng, 400);
    confidence[state.segment] = w.confidence;
    if (
      convergedAt[state.segment] === undefined &&
      state.tick >= 3 &&
      w.confidence >= CONVERGENCE_CONF
    ) {
      convergedAt[state.segment] = state.tick;
    }
  }
  return {
    states: payload.states,
    confidence,
    convergedAt,
    ticks: payload.states[0]?.tick ?? (prev?.ticks ?? 0) + 1,
  };
}

export function reduceRun(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "reset":
      return { ...initialRunState };
    case "started":
      return { ...initialRunState, status: "running", mode: action.mode };
    case "ended":
      return state.status === "running" ? { ...state, status: "ended" } : state;
    case "warn":
      return { ...state, warnings: [...state.warnings, action.message].slice(-6) };
    case "event":
      try {
        return applyEvent(state, action.event);
      } catch (err) {
        return {
          ...state,
          warnings: [...state.warnings, `bad event (${String(err)})`].slice(-6),
        };
      }
  }
}

function applyEvent(state: RunState, e: StageEvent): RunState {
  const key = `${e.cycle}:${e.stage}`;
  let next: RunState = {
    ...state,
    cycle: e.cycle,
    activeStage: e.status === "done" ? state.activeStage : e.stage,
    stages: {
      ...state.stages,
      [key]:
        e.status === "done" || e.status === "shipped" || e.status === "awaiting_approval"
          ? "done"
          : state.stages[key] === "done"
            ? "done"
            : "active",
    },
  };
  if (e.meta?.warning) {
    next = { ...next, warnings: [...next.warnings, e.meta.warning].slice(-6) };
  }

  switch (e.stage) {
    case "ingest": {
      if (e.status === "item" && e.payload && (e.payload as Ticket).id) {
        const t = e.payload as Ticket;
        next.ticketCount = state.ticketCount + 1;
        next.recentTickets = [...state.recentTickets, t].slice(-10);
        next.ticketsById = { ...state.ticketsById, [t.id]: t };
      }
      return next;
    }
    case "understand": {
      if (e.status === "item" && e.payload && (e.payload as Cluster).id) {
        const c = e.payload as Cluster;
        const others = state.clusters.filter((x) => x.id !== c.id);
        next.clusters = [...others, c].sort((a, b) => b.revenueAtRisk - a.revenueAtRisk);
      }
      return next;
    }
    case "research": {
      if (e.status === "item" && e.payload && (e.payload as EvidenceCard).claim) {
        next.evidence = [...state.evidence, e.payload as EvidenceCard];
      }
      if (e.status === "tick") next.researchPulse = state.researchPulse + 1;
      return next;
    }
    case "compile": {
      if (e.status === "item" && e.payload && (e.payload as ContextPack).fingerprint) {
        const pack = e.payload as ContextPack;
        const packs = [...(state.packs[e.cycle] ?? []).filter((p) => p.task.segment !== pack.task.segment), pack];
        next.packs = { ...state.packs, [e.cycle]: packs };
        next.rows = upsertRows(state.rows, pack.rows ?? []);
        next.layerVersion = Math.max(state.layerVersion, pack.layerVersion || 1);
      }
      return next;
    }
    case "create": {
      if (e.status === "item" && e.payload && (e.payload as Creative).id) {
        const c = e.payload as Creative;
        next.creatives = {
          ...state.creatives,
          [e.cycle]: [...state.creatives[e.cycle].filter((x) => x.id !== c.id), c],
        };
      }
      return next;
    }
    case "test": {
      if (e.status === "start") {
        next.bandit = {
          ...state.bandit,
          [e.cycle]: { states: [], confidence: {}, convergedAt: {}, ticks: 0 },
        };
      }
      if (e.status === "tick" && e.payload && (e.payload as MediaBuyerTickPayload).states) {
        next.bandit = {
          ...state.bandit,
          [e.cycle]: banditViewFromTick(
            state.bandit[e.cycle],
            e.payload as MediaBuyerTickPayload,
          ),
        };
      }
      if (e.status === "done" && e.payload && (e.payload as BanditReport).winners) {
        next.reports = { ...state.reports, [e.cycle]: e.payload as BanditReport };
      }
      return next;
    }
    case "learn": {
      if (e.status === "item" && e.payload && (e.payload as ContextRow).id) {
        const row = e.payload as ContextRow;
        next.rows = upsertRows(state.rows, [row]);
        next.newRowIds = [...state.newRowIds, row.id];
      }
      if (e.status === "done") {
        const lv = (e.payload as { layerVersion?: number } | undefined)?.layerVersion ?? 2;
        next.layerVersion = Math.max(state.layerVersion, lv);
        next.learnPulse = state.learnPulse + 1;
      }
      return next;
    }
    case "ship": {
      if (e.status === "start") {
        next.shipChannel =
          (e.payload as { channel?: string } | undefined)?.channel ?? null;
      }
      if (e.status === "awaiting_approval" && e.payload) {
        next.shipBrief = e.payload as ShipBrief;
        next.status = "ended";
      }
      if (e.status === "shipped" && e.payload) {
        next.shipped = e.payload as RunState["shipped"];
      }
      return next;
    }
    default:
      return next;
  }
}

/* --------------------------------- hook --------------------------------- */

export function useRunStream() {
  const [state, dispatch] = useReducer(reduceRun, initialRunState);
  const cleanupRef = useRef<(() => void) | null>(null);

  const dispatchEvent = useCallback((e: StageEvent) => dispatch({ type: "event", event: e }), []);

  const start = useCallback((mode: RunMode) => {
    cleanupRef.current?.();
    dispatch({ type: "started", mode });

    if (mode === "mock") {
      const ac = new AbortController();
      playMockRun((e) => dispatch({ type: "event", event: e }), ac.signal)
        .catch((err) => dispatch({ type: "warn", message: `mock run failed: ${String(err)}` }))
        .finally(() => dispatch({ type: "ended" }));
      cleanupRef.current = () => ac.abort();
      return;
    }

    const es = new EventSource(`/api/run?mode=${mode}`);
    es.onmessage = (m) => {
      try {
        dispatch({ type: "event", event: JSON.parse(m.data) as StageEvent });
      } catch {
        dispatch({ type: "warn", message: "unparseable SSE frame" });
      }
    };
    // the server closing the one-shot stream surfaces as an error; never let
    // EventSource auto-reconnect (it would replay the run on top of itself)
    es.onerror = () => {
      es.close();
      dispatch({ type: "ended" });
    };
    cleanupRef.current = () => es.close();
  }, []);

  useEffect(() => () => cleanupRef.current?.(), []);

  return { state, start, dispatchEvent, SEGMENTS };
}
