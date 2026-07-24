"use client";

import { useState } from "react";
import type { Segment, StageEvent } from "@/components/contract";
import { SEGMENTS } from "@/components/contract";
import { fmtDelta, fmtMoney, fmtPct } from "@/components/format";
import { ANGLE_COLORS, SEGMENT_LABELS } from "@/components/theme";
import type { RunState } from "@/components/useRunStream";
import { EmptyHint, Panel } from "./Panel";

export function ShipPanel({
  state,
  dispatchEvent,
}: {
  state: RunState;
  dispatchEvent: (e: StageEvent) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const brief = state.shipBrief;

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      if (state.mode === "mock") {
        // offline fallback: no server — simulate the confirmation locally
        await new Promise((r) => setTimeout(r, 700));
        dispatchEvent({
          cycle: 2,
          stage: "ship",
          status: "shipped",
          payload: {
            delivery: { channel: state.shipChannel ?? "#backtalk-demo", mode: "mock" },
            zendeskMacro: { name: "Proactive shipping-delay reply", status: "created" },
          },
          meta: { source: "stub", warning: "mock mode: nothing actually sent" },
        });
        return;
      }
      const res = await fetch("/api/ship", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; event?: StageEvent; error?: string };
      if (json.ok && json.event) dispatchEvent(json.event);
      else setError(json.error ?? `ship failed (${res.status})`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const delivery = state.shipped?.delivery as
    | { channel?: string; mode?: string }
    | undefined;

  return (
    <Panel state={state} stage="ship" title="Ship — one human approval">
      {!brief ? (
        <EmptyHint>the loop ends with a human — approve to ship the brief to Slack</EmptyHint>
      ) : state.shipped ? (
        <ul className="space-y-1.5 text-xs text-ink2">
          <li className="rise">
            <span className="text-good">✓</span> Slack brief posted
            {delivery?.channel ? ` → ${delivery.channel}` : ""}
            {delivery?.mode === "mock" && <span className="text-muted"> (mock)</span>}
          </li>
          <li className="rise" style={{ animationDelay: "120ms" }}>
            <span className="text-good">✓</span>{" "}
            {(state.shipped.zendeskMacro?.name ?? "helpdesk macro") + " "}
            {state.shipped.zendeskMacro?.status ?? "created"}
          </li>
          <li className="rise" style={{ animationDelay: "240ms" }}>
            <span className="text-good">✓</span> run archived → fixtures/cache
          </li>
        </ul>
      ) : (
        <div className="flex h-full flex-col gap-1.5">
          <p className="text-[11px] leading-snug text-ink2">
            <span className="text-ink">{brief.topClusterLabel}</span> ·{" "}
            <span className="num">{fmtMoney(brief.revenueAtRisk)} at risk</span> · CTR{" "}
            <span className="num">
              {fmtPct(brief.cycle1AvgCtr, 2)} → {fmtPct(brief.cycle2AvgCtr, 2)}
            </span>{" "}
            <span className="num text-accent">
              ({fmtDelta(brief.cycle1AvgCtr, brief.cycle2AvgCtr)})
            </span>
          </p>
          <ul className="min-h-0 flex-1 space-y-1 overflow-hidden text-[10.5px] text-muted">
            {SEGMENTS.filter((s: Segment) => brief.winners[s]).map((s: Segment) => {
              const w = brief.winners[s];
              return (
                <li key={s} className="flex items-center gap-1.5 truncate">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: ANGLE_COLORS[w.angle] }}
                  />
                  <span className="shrink-0 text-ink2">{SEGMENT_LABELS[s]}</span>
                  <span className="num shrink-0">{fmtPct(w.ctrEstimate)}</span>
                  <span className="truncate">“{w.headline}”</span>
                </li>
              );
            })}
          </ul>
          {error && <p className="text-[10px] text-red-400">{error}</p>}
          <button
            onClick={approve}
            disabled={busy}
            className="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-page transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "shipping…" : "Approve & ship to Slack"}
          </button>
        </div>
      )}
    </Panel>
  );
}
