"use client";

import { useState } from "react";
import { LoopRail } from "@/components/LoopRail";
import { fmtPct } from "@/components/format";
import { IngestPanel } from "@/components/panels/IngestPanel";
import { UnderstandPanel } from "@/components/panels/UnderstandPanel";
import { ResearchPanel } from "@/components/panels/ResearchPanel";
import { CompilePanel } from "@/components/panels/CompilePanel";
import { CreatePanel } from "@/components/panels/CreatePanel";
import { TestPanel } from "@/components/panels/TestPanel";
import { LearnPanel } from "@/components/panels/LearnPanel";
import { ShipPanel } from "@/components/panels/ShipPanel";
import { useRunStream, type RunMode } from "@/components/useRunStream";

export default function Home() {
  const { state, start, dispatchEvent } = useRunStream();
  const [mode, setMode] = useState<RunMode>("replay");
  const running = state.status === "running";

  return (
    <main className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-2 px-4 py-3">
      <header className="flex items-center gap-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink">
            Backtalk <span className="text-accent">↺</span>
          </h1>
          <p className="text-[11px] text-muted">feedback in · ads out · every cycle smarter</p>
        </div>

        <span
          key={state.cycle}
          className="pop num ml-2 rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-sm font-bold tracking-wide text-accent"
        >
          CYCLE {state.cycle}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {state.warnings.length > 0 && (
            <span
              className="max-w-[260px] truncate text-[10px] text-muted"
              title={state.warnings.join("\n")}
            >
              ⚠ {state.warnings[state.warnings.length - 1]}
            </span>
          )}
          {state.reports[1] && (
            <span className="num rounded bg-surface px-2 py-1 text-[11px] text-ink2">
              C1 {fmtPct(state.reports[1].avgCtr, 2)}
            </span>
          )}
          {state.reports[2] && (
            <span className="num rounded bg-surface px-2 py-1 text-[11px] text-ink">
              C2 {fmtPct(state.reports[2].avgCtr, 2)}
            </span>
          )}
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as RunMode)}
            disabled={running}
            className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-xs text-ink2 outline-none"
            aria-label="run mode"
          >
            <option value="replay">replay</option>
            <option value="live">live</option>
            <option value="mock">mock (offline)</option>
          </select>
          <button
            onClick={() => start(mode)}
            disabled={running}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-page transition hover:brightness-110 disabled:opacity-50"
          >
            {running ? "running…" : state.status === "ended" ? "run again" : "run the loop"}
          </button>
        </div>
      </header>

      <LoopRail state={state} />

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-3 h-[196px]">
          <IngestPanel state={state} />
        </div>
        <div className="col-span-5 h-[196px]">
          <UnderstandPanel state={state} />
        </div>
        <div className="col-span-4 h-[196px]">
          <ResearchPanel state={state} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-4 h-[228px]">
          <CompilePanel state={state} />
        </div>
        <div className="col-span-8 h-[228px]">
          <CreatePanel state={state} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2 pb-2">
        <div className="col-span-8 h-[240px]">
          <TestPanel state={state} />
        </div>
        <div className="col-span-4 flex h-[240px] flex-col gap-2">
          <div className="min-h-0 flex-1">
            <LearnPanel state={state} />
          </div>
          <div className="min-h-0 flex-1">
            <ShipPanel state={state} dispatchEvent={dispatchEvent} />
          </div>
        </div>
      </div>
    </main>
  );
}
