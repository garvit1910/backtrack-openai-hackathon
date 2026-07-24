"use client";

import type { ContextRowType } from "@/components/contract";
import type { RunState } from "@/components/useRunStream";
import { EmptyHint, Panel } from "./Panel";

const TYPE_TAGS: Record<ContextRowType, string> = {
  brand_fact: "brand",
  pain_point: "pain",
  evidence: "evid",
  segment_insight: "seg",
  learning: "learn",
};

/** the versioned brand context layer — the product's core artifact */
export function CompilePanel({ state }: { state: RunState }) {
  const packs = state.packs[state.cycle] ?? state.packs[1] ?? [];
  const newSet = new Set(state.newRowIds);
  // newest learnings first so the write-back is impossible to miss
  const rows = [...state.rows]
    .sort((a, b) => Number(newSet.has(b.id)) - Number(newSet.has(a.id)))
    .slice(0, 6);

  return (
    <Panel
      state={state}
      stage="compile"
      title="Compile — brand context layer"
      right={
        state.rows.length > 0 && (
          <span>
            <span className="num text-sm font-semibold text-ink">{state.rows.length}</span> rows
          </span>
        )
      }
    >
      {state.rows.length === 0 && packs.length === 0 ? (
        <EmptyHint>signals compile into a versioned, fingerprinted context pack</EmptyHint>
      ) : (
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-center gap-2">
            <span
              key={state.layerVersion}
              className="pop num rounded-md bg-accent/15 px-2 py-0.5 text-lg font-bold text-accent"
            >
              v{state.layerVersion}
            </span>
            <div className="flex flex-wrap gap-1">
              {packs.map((p) => (
                <span
                  key={p.task.segment}
                  className="num rounded border border-hairline px-1.5 py-0.5 text-[10px] text-muted"
                  title={`${p.task.segment} pack · ${p.rows.length} rows`}
                >
                  {p.task.segment.slice(0, 3)} · {p.fingerprint.slice(0, 9)}
                </span>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 space-y-1 overflow-hidden">
            {rows.map((r) => {
              const isNew = newSet.has(r.id);
              return (
                <li
                  key={r.id}
                  className={`flex items-start gap-1.5 rounded px-1.5 py-1 text-[11px] leading-snug ${
                    isNew ? "learn-row border-l-2 border-accent bg-accent/10 text-ink" : "text-ink2"
                  }`}
                >
                  <span
                    className={`mt-px shrink-0 rounded px-1 text-[9px] uppercase tracking-wide ${
                      isNew ? "bg-accent/25 text-accent" : "bg-surface2 text-muted"
                    }`}
                  >
                    {TYPE_TAGS[r.type] ?? r.type}
                  </span>
                  <span className="line-clamp-1">{r.content}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}
