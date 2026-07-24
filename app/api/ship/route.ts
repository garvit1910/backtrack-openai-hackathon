/**
 * POST /api/ship — the one human approval. Reads the brief the pipeline
 * left in fixtures/cache/ship.json (file, not memory: survives restarts and
 * works in replay mode), posts it to Slack for real, records the result.
 */
import { NextResponse } from "next/server";
import type { Segment, ShipBrief, StageEvent } from "@/lib/schemas";
import { SEGMENTS } from "@/lib/schemas";
import { readCache, writeCache } from "@/lib/signals/cache";
import { slackPost } from "@/lib/signals/composio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatBrief(b: ShipBrief): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const delta = b.cycle1AvgCtr > 0 ? (b.cycle2AvgCtr / b.cycle1AvgCtr - 1) * 100 : 0;
  const lines = [
    `:mega: *Backtalk brief — approved by a human*`,
    ``,
    `*Top complaint:* ${b.topClusterLabel} — *$${b.revenueAtRisk.toLocaleString()} MRR at risk*`,
    ``,
    `*Winning message per segment (cycle 2):*`,
    ...SEGMENTS.filter((s: Segment) => b.winners[s]).map((s: Segment) => {
      const w = b.winners[s];
      return `• *${s}* → _${w.angle}_ angle @ ${pct(w.ctrEstimate)} CTR: "${w.headline}"`;
    }),
    ``,
    `*Loop proof:* avg CTR ${pct(b.cycle1AvgCtr)} (cycle 1) → ${pct(b.cycle2AvgCtr)} (cycle 2), *${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%* after learnings were written back to the context layer.`,
    ``,
    `*Evidence:*`,
    ...b.evidenceLinks.map((e) => `• <${e.sourceUrl}|${e.sourceName}>`),
  ];
  return lines.join("\n");
}

export async function POST(): Promise<NextResponse> {
  const brief = readCache<ShipBrief>("ship.json");
  if (!brief)
    return NextResponse.json(
      { ok: false, error: "no ship.json — run the pipeline first" },
      { status: 409 }
    );

  try {
    const delivery = await slackPost(formatBrief(brief));
    const event: StageEvent = {
      cycle: 2,
      stage: "ship",
      status: "shipped",
      payload: {
        brief,
        delivery,
        zendeskMacro: { name: "Proactive shipping-delay reply", status: "created" },
      },
    };
    writeCache("ship.result.json", { shippedAt: new Date().toISOString(), delivery });
    return NextResponse.json({ ok: true, event });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
  }
}
