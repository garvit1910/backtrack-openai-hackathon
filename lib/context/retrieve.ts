import type { ContextRow, Segment } from "./contract";
import { allRows } from "./store";
import { embedBatch } from "./llm";

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

const EVIDENCE_CAP = 4;
const DEFAULT_K = 20;

/**
 * Tiered, deterministic retrieval:
 *   tier 0 — learning + segment_insight for this segment: ALWAYS in, FIRST.
 *            (This single rule is what makes cycle 2 differ from cycle 1.)
 *   tier 1 — every brand_fact, in seed order.
 *   tier 2 — evidence, cluster-matched first then by cosine, capped at 4.
 *   tier 3 — pain_point and anything else, cluster-matched first then cosine,
 *            filling up to k.
 * Fallback when the query embedding fails or most rows are unembedded:
 * identical tiers ranked by recency (append order), id tie-break.
 */
export async function retrieve(
  query: string,
  opts: { segment: Segment; clusterId: string; k?: number }
): Promise<ContextRow[]> {
  const k = opts.k ?? DEFAULT_K;
  const rows = allRows();
  const [qEmb] = await embedBatch([query]);
  const embeddedCount = rows.filter((r) => r.embedding).length;
  const useCosine = !!qEmb && embeddedCount >= rows.length / 2;

  const recency = new Map(rows.map((r, i) => [r.id, i]));
  const score = (r: ContextRow): number =>
    useCosine && r.embedding ? cosine(qEmb!, r.embedding) : 0;

  // Higher is better; deterministic at every level.
  const rank = (a: ContextRow, b: ContextRow): number => {
    const clusterA = a.clusterId === opts.clusterId ? 1 : 0;
    const clusterB = b.clusterId === opts.clusterId ? 1 : 0;
    if (clusterA !== clusterB) return clusterB - clusterA;
    if (useCosine) {
      const diff = score(b) - score(a);
      if (Math.abs(diff) > 1e-9) return diff;
    }
    const rec = (recency.get(b.id) ?? 0) - (recency.get(a.id) ?? 0);
    if (rec !== 0) return rec;
    return a.id.localeCompare(b.id);
  };

  const tier0 = rows
    .filter(
      (r) =>
        (r.type === "learning" || r.type === "segment_insight") &&
        (!r.segment || r.segment === opts.segment)
    )
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "learning" ? -1 : 1;
      return rank(a, b);
    });

  const tier1 = rows.filter((r) => r.type === "brand_fact");

  // The task cluster's pain rows are the claim substrate (ticket citations
  // live in their sourceRefs) — always in, ahead of evidence.
  const tierPain = rows.filter(
    (r) => r.type === "pain_point" && r.clusterId === opts.clusterId
  );

  const tier2 = rows
    .filter((r) => r.type === "evidence")
    .sort(rank)
    .slice(0, EVIDENCE_CAP);

  const picked = new Set(
    [...tier0, ...tier1, ...tierPain, ...tier2].map((r) => r.id)
  );
  // Fill tier: never other segments' learning/segment_insight rows — a foreign
  // learning row in the pack would read as a binding directive to the agent.
  const tier3 = rows
    .filter(
      (r) =>
        !picked.has(r.id) &&
        r.type !== "evidence" &&
        r.type !== "learning" &&
        r.type !== "segment_insight"
    )
    .sort(rank);

  const result = [...tier0, ...tier1, ...tierPain, ...tier2];
  for (const row of tier3) {
    if (result.length >= k) break;
    result.push(row);
  }
  return result;
}
