"use client";

import { domainOf } from "@/components/format";
import type { RunState } from "@/components/useRunStream";
import { EmptyHint, Panel } from "./Panel";

export function ResearchPanel({ state }: { state: RunState }) {
  const searching =
    state.stages[`${state.cycle}:research`] === "active" && state.researchPulse > 0;
  const shown = state.evidence.slice(-3).reverse();

  return (
    <Panel
      state={state}
      stage="research"
      title="Research — live market evidence"
      right={
        <>
          {searching && <span className="animate-pulse text-accent">searching…</span>}
          {state.evidence.length > 0 && (
            <span className="num text-sm font-semibold text-ink">{state.evidence.length}</span>
          )}
        </>
      }
    >
      {shown.length === 0 ? (
        <EmptyHint>parallel live search returns claims with real sources</EmptyHint>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((card, i) => (
            <li key={`${card.sourceUrl}-${i}`} className="rise rounded-md bg-surface2 px-2 py-1.5">
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className="rounded border border-hairline px-1 py-px text-[10px] text-accent">
                  {card.sourceName || domainOf(card.sourceUrl)}
                </span>
              </div>
              <p className="line-clamp-2 text-[11px] leading-snug text-ink2">{card.claim}</p>
              {card.counterpoint && (
                <p className="line-clamp-1 text-[11px] italic text-muted">↳ {card.counterpoint}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
