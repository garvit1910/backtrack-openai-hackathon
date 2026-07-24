"use client";

import { fmtPct } from "@/components/format";
import { ANGLE_COLORS } from "@/components/theme";
import type { RunState } from "@/components/useRunStream";
import { EmptyHint, Panel } from "./Panel";

/** the emotional peak: cycle-1 winners become layer rows, v1 flips to v2 */
export function LearnPanel({ state }: { state: RunState }) {
  const learnings = state.rows.filter((r) => state.newRowIds.includes(r.id));
  const flipped = state.learnPulse > 0;
  const r1 = state.reports[1];

  return (
    <Panel state={state} stage="learn" title="Learn — write winners back">
      {learnings.length === 0 ? (
        <EmptyHint>
          {r1 ? "distilling bandit winners into the layer…" : "waiting for cycle-1 results"}
        </EmptyHint>
      ) : (
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className={`num text-lg font-bold ${flipped ? "text-muted line-through" : "text-ink"}`}>
              v1
            </span>
            <span className="text-accent">→</span>
            <span
              key={state.learnPulse}
              className={`num text-2xl font-bold ${flipped ? "pop text-accent" : "text-muted"}`}
            >
              v2
            </span>
            <span className="ml-1 text-[11px] text-muted">
              {learnings.length} learning{learnings.length === 1 ? "" : "s"} written into the layer
            </span>
          </div>
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-hidden">
            {learnings.slice(0, 3).map((row, i) => {
              const winner = row.segment && r1?.winners[row.segment];
              return (
                <li
                  key={row.id}
                  className="learn-row rounded-md border-l-2 border-accent bg-accent/10 px-2 py-1.5"
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  <p className="line-clamp-2 text-[11px] leading-snug text-ink">
                    {winner && (
                      <span
                        className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ background: ANGLE_COLORS[winner.winnerAngle] }}
                      />
                    )}
                    {row.content}
                  </p>
                  {winner && (
                    <p className="num mt-0.5 text-[10px] text-muted">
                      {fmtPct(winner.ctrEstimate)} CTR · {Math.round(winner.confidence * 100)}% conf
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {flipped && (
            <p className="text-[11px] text-ink2">
              cycle 2 now regenerates <span className="text-accent">through the smarter layer</span> ↺
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
