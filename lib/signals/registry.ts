/**
 * The ONLY cross-zone seam. The orchestrator binds to Person 2/3 exports
 * exclusively through here; each import swaps from stub to real with a
 * one-line edit when the owner says their module is ready.
 *
 * NOTE: because this file (transitively) imports "@/..."-aliased modules,
 * anything touching the registry runs inside Next only — standalone tsx
 * scripts stick to the stage modules (relative imports).
 */
import type {
  BanditState,
  ContextStoreApi,
  GenerateCreatives,
  RunBandit,
  RunLearner,
} from "../schemas";
import { contextStore } from "./stubs/context"; // WHEN P2 LANDS: "@/lib/context"
import { generateCreatives } from "./stubs/creative"; // WHEN P2 LANDS: "@/lib/agents/creative"
import { runLearner } from "./stubs/learner"; // WHEN P2 LANDS: "@/lib/agents/learner"
import { runMediaBuyer } from "@/lib/agents/mediaBuyer"; // REAL (Person 3)

export interface Registry {
  contextStore: ContextStoreApi;
  generateCreatives: GenerateCreatives;
  runLearner: RunLearner;
  runBandit: RunBandit;
}

/** Adapt Person 3's runMediaBuyer to the frozen RunBandit contract.
 *  Accepts tick payloads on either "item" (early shim) or "tick" status. */
const runBandit: RunBandit = async (creatives, cycle, { onTick }) => {
  const { report } = await runMediaBuyer({
    creatives,
    cycle,
    tickDelayMs: 0,
    emit: (ev: { status: string; payload?: unknown }) => {
      const p = ev.payload as { states?: BanditState[] } | undefined;
      if ((ev.status === "item" || ev.status === "tick") && p?.states)
        onTick(p.states);
    },
  });
  return report;
};

export function getRegistry(): Registry {
  return { contextStore, generateCreatives, runLearner, runBandit };
}
