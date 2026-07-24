"use client";

import { useState } from "react";
import type { Creative, Ticket } from "@/components/contract";
import { SEGMENTS } from "@/components/contract";
import { domainOf, shortId } from "@/components/format";
import { ANGLE_COLORS, ANGLE_LABELS, SEGMENT_LABELS } from "@/components/theme";
import type { RunState } from "@/components/useRunStream";
import { EmptyHint, Panel } from "./Panel";

function AdCard({
  creative,
  onCite,
}: {
  creative: Creative;
  onCite: (t: Ticket | null, ref: string) => void;
}) {
  return (
    <article className="rise rounded-md bg-surface2 p-2">
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: ANGLE_COLORS[creative.angle] }}
        />
        <span className="text-[10px] uppercase tracking-wide text-ink2">
          {ANGLE_LABELS[creative.angle]}
        </span>
        <span className="ml-auto text-[9px] uppercase text-muted">{creative.kind.replace("_", " ")}</span>
      </div>
      <p className="line-clamp-2 text-xs font-medium leading-snug text-ink">{creative.headline}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {creative.citations.ticketIds.slice(0, 2).map((id) => (
          <button
            key={id}
            onClick={() => onCite(null, id)}
            className="num rounded border border-hairline px-1 py-px text-[9px] text-accent hover:bg-accent/10"
          >
            ▸ {shortId(id)}
          </button>
        ))}
        {creative.citations.sourceUrls.slice(0, 1).map((u) => (
          <span key={u} className="rounded border border-hairline px-1 py-px text-[9px] text-muted">
            {domainOf(u)}
          </span>
        ))}
      </div>
    </article>
  );
}

/** ad variants stream in with their receipts: every card cites the tickets it came from */
export function CreatePanel({ state }: { state: RunState }) {
  const [quote, setQuote] = useState<{ ticket: Ticket | null; ref: string } | null>(null);
  const creatives = state.creatives[state.cycle].length
    ? state.creatives[state.cycle]
    : state.creatives[1];

  const cite = (_t: Ticket | null, ref: string) =>
    setQuote({ ticket: state.ticketsById[ref] ?? null, ref });

  return (
    <Panel
      state={state}
      stage="create"
      title={`Create — cited ad variants (cycle ${state.cycle})`}
      right={
        creatives.length > 0 && (
          <span className="num text-sm font-semibold text-ink">{creatives.length}</span>
        )
      }
    >
      {creatives.length === 0 ? (
        <EmptyHint>the creative agent writes through the context pack — citations included</EmptyHint>
      ) : (
        <div className="flex h-full flex-col gap-2">
          <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-hidden">
            {SEGMENTS.map((seg) => {
              const cards = creatives.filter((c) => c.segment === seg).slice(-2).reverse();
              return (
                <div key={seg} className="min-w-0 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
                    {SEGMENT_LABELS[seg]}
                  </div>
                  {cards.map((c) => (
                    <AdCard key={c.id} creative={c} onCite={cite} />
                  ))}
                </div>
              );
            })}
          </div>
          <div className="h-11 shrink-0 rounded-md border border-hairline bg-surface2/60 px-2 py-1 text-[11px]">
            {quote ? (
              <div className="flex h-full items-start justify-between gap-2">
                <p className="line-clamp-2 leading-snug text-ink2">
                  {quote.ticket ? (
                    <>
                      <span className="text-ink">“{quote.ticket.subject}”</span>{" "}
                      <span className="text-muted">
                        — {quote.ticket.account.name}: {quote.ticket.body}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">source ticket {quote.ref} (not in stream yet)</span>
                  )}
                </p>
                <button onClick={() => setQuote(null)} className="text-muted hover:text-ink">
                  ✕
                </button>
              </div>
            ) : (
              <p className="pt-1.5 text-center text-muted/70">
                click a ▸ citation to hear the customer’s own words
              </p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
