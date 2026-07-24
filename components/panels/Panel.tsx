"use client";

import type { ReactNode } from "react";
import type { Stage } from "@/components/contract";
import type { RunState } from "@/components/useRunStream";

export function Panel({
  state,
  stage,
  title,
  right,
  className = "",
  children,
}: {
  state: RunState;
  stage: Stage;
  title: string;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const status =
    state.stages[`${state.cycle}:${stage}`] ??
    (state.stages[`1:${stage}`] === "done" ? "done" : undefined);
  const active = status === "active";
  return (
    <section className={`panel flex h-full min-h-0 flex-col p-3 ${active ? "panel-active" : ""} ${className}`}>
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {title}
          {status === "done" && <span className="ml-1.5 text-accent">✓</span>}
        </h2>
        <div className="flex items-baseline gap-2 text-[11px] text-muted">{right}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-center text-xs text-muted/80">{children}</p>;
}
