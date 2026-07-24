"use client";

import { fmtMoney } from "@/components/format";
import { SEGMENT_LABELS } from "@/components/theme";
import type { RunState } from "@/components/useRunStream";
import { EmptyHint, Panel } from "./Panel";

export function IngestPanel({ state }: { state: RunState }) {
  const shown = state.recentTickets.slice(-4).reverse();
  return (
    <Panel
      state={state}
      stage="ingest"
      title="Ingest — support tickets"
      right={
        state.ticketCount > 0 && (
          <span className="num text-sm font-semibold text-ink">{state.ticketCount}</span>
        )
      }
    >
      {shown.length === 0 ? (
        <EmptyHint>tickets stream in from the helpdesk</EmptyHint>
      ) : (
        <ul className="space-y-1.5 overflow-hidden">
          {shown.map((t) => (
            <li key={t.id} className="rise rounded-md bg-surface2 px-2 py-1.5">
              <p className="truncate text-xs text-ink">{t.subject}</p>
              <p className="truncate text-[11px] text-muted">
                {t.account.name} · {SEGMENT_LABELS[t.account.segment]} ·{" "}
                <span className="num">{fmtMoney(t.account.mrr)}/mo</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
