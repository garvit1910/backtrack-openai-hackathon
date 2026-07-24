import type { Cluster, EvidenceCard, NewContextRow } from "./contract";
import { append } from "./store";
import { hash8 } from "./util";

/** Pure conversion of Person 1's signals into context rows (deterministic IDs). */
export function rowsFromSignals(
  clusters: Cluster[],
  evidence: EvidenceCard[]
): NewContextRow[] {
  const painRows: NewContextRow[] = clusters.map((c) => {
    const trendWord =
      c.trend > 0.05 ? `growing ${Math.round(c.trend * 100)}%` :
      c.trend < -0.05 ? `shrinking ${Math.round(Math.abs(c.trend) * 100)}%` :
      "flat";
    return {
      id: `pain:${c.id}`,
      type: "pain_point",
      content: `${c.label} — ${c.ticketCount} tickets (${Math.round(c.share * 100)}% of volume, ${trendWord}), $${c.revenueAtRisk.toLocaleString("en-US")} MRR at risk.`,
      clusterId: c.id,
      sourceRefs: c.exemplarTicketIds.map((t) => `ticket:${t}`),
      confidence: 0.9,
    };
  });

  const evidenceRows: NewContextRow[] = evidence.map((e) => ({
    id: `ev:${e.clusterId}:${hash8(e.sourceUrl)}`,
    type: "evidence",
    content:
      e.claim +
      (e.counterpoint ? ` (Counterpoint: ${e.counterpoint})` : "") +
      ` [${e.sourceName}]`,
    clusterId: e.clusterId,
    sourceRefs: [e.sourceUrl],
    confidence: 0.75,
  }));

  return [...painRows, ...evidenceRows];
}

/** Called by Person 1's orchestrator between the research and compile stages. */
export async function ingestSignals(
  clusters: Cluster[],
  evidence: EvidenceCard[]
): Promise<void> {
  await append(rowsFromSignals(clusters, evidence));
}
