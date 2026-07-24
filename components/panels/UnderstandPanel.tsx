"use client";

import { fmtMoney } from "@/components/format";
import { useCountUp } from "@/components/useCountUp";
import type { RunState } from "@/components/useRunStream";
import { EmptyHint, Panel } from "./Panel";

/** revenue-at-risk is the reason this product exists — render it huge */
export function UnderstandPanel({ state }: { state: RunState }) {
  const totalAtRisk = state.clusters.reduce((s, c) => s + c.revenueAtRisk, 0);
  const animated = useCountUp(totalAtRisk);
  const top = state.clusters.slice(0, 3);
  const maxShare = Math.max(...top.map((c) => c.share), 0.0001);

  return (
    <Panel
      state={state}
      stage="understand"
      title="Understand — revenue-weighted pain"
      right={top.length > 0 && <span>{state.clusters.length} clusters</span>}
    >
      {top.length === 0 ? (
        <EmptyHint>embeddings cluster the pain, weighted by MRR</EmptyHint>
      ) : (
        <div className="flex h-full flex-col">
          <div className="mb-2">
            <div className="num text-4xl font-bold leading-none tracking-tight text-ink">
              {fmtMoney(animated)}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted">
              MRR at risk across clusters
            </div>
          </div>
          <ul className="mt-1 space-y-1.5">
            {top.map((c, i) => (
              <li key={c.id} className="rise">
                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className={`truncate ${i === 0 ? "text-ink" : "text-ink2"}`}>{c.label}</span>
                  <span className="num shrink-0 text-muted">
                    {c.ticketCount} tickets ·{" "}
                    <span className={c.trend > 0 ? "text-ink" : ""}>
                      {c.trend > 0 ? "+" : ""}
                      {Math.round(c.trend * 100)}%
                    </span>{" "}
                    · {fmtMoney(c.revenueAtRisk)}
                  </span>
                </div>
                <div className="mt-0.5 h-2 w-full rounded-full bg-surface2">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${(c.share / maxShare) * 100}%`,
                      background: i === 0 ? "var(--angle-reliability)" : "color-mix(in srgb, var(--angle-reliability) 45%, transparent)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
