/**
 * Research stage: for the top clusters by revenue at risk, fan out parallel
 * Octen searches (competitor claims, review complaints, pricing, news), then
 * distill each cluster's hits into EvidenceCards with real source URLs.
 *
 * Events: tick per completed search ({query, hits}), item per EvidenceCard.
 * Dumps fixtures/cache/evidence.json.
 */
import type { Cluster, EvidenceCard, Ticket } from "../../schemas";
import type { StageEmitter } from "../../events";
import { withFallback, writeCache } from "../cache";
import { chatJSON } from "../openai";
import { octenSearch, type OctenResult } from "../octen";

const COMPETITORS = ["SwagUp", "Printfection", "Custom Ink", "Gemnote"];

function queriesFor(cluster: Cluster): { query: string; topic?: "news" }[] {
  const dim = cluster.label.toLowerCase();
  return [
    { query: `corporate branded merch platform ${dim} customer complaints reviews` },
    { query: `${COMPETITORS[0]} reviews ${dim}` },
    { query: `${COMPETITORS[1]} vs ${COMPETITORS[2]} ${dim} comparison` },
    { query: `${COMPETITORS[3]} customer experience ${dim}` },
    { query: `custom swag company pricing turnaround time guarantees` },
    { query: `corporate gifting merch industry ${dim} 2026`, topic: "news" },
  ];
}

interface Hit extends OctenResult {
  index: number;
}

async function fanOut(cluster: Cluster, e: StageEmitter): Promise<Hit[]> {
  const queries = queriesFor(cluster);
  const settled = await Promise.allSettled(
    queries.map(async (q) => {
      const results = await octenSearch(q.query, { topic: q.topic, count: 4 });
      e.tick({ clusterId: cluster.id, query: q.query, hits: results.length });
      return results;
    })
  );
  const seen = new Set<string>();
  const hits: Hit[] = [];
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const r of s.value) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      hits.push({ ...r, index: hits.length });
    }
  }
  if (hits.length === 0) throw new Error(`no octen results for ${cluster.label}`);
  return hits;
}

async function distill(
  cluster: Cluster,
  hits: Hit[],
  exemplars: Ticket[]
): Promise<EvidenceCard[]> {
  const sources = hits
    .map(
      (h) =>
        `[${h.index}] ${h.title} (${h.url})\n${(h.highlight ?? "").slice(0, 280).replace(/\n/g, " ")}`
    )
    .join("\n\n");
  const complaints = exemplars
    .map((t) => `- "${t.subject}"`)
    .join("\n");

  const out = await chatJSON<{
    cards: { claim: string; counterpoint?: string; sourceIndex: number }[];
  }>({
    system:
      "You are a market researcher for Crewkit, a B2B team-merch platform. " +
      "Customers complain about a theme; you mine live search results for evidence " +
      "an ad writer can cite: competitor weaknesses on this exact dimension, market " +
      "stats, review pull-quotes. Each card: claim (one concrete sentence grounded in " +
      "a source), optional counterpoint (the nuance or opposing fact), and the " +
      "sourceIndex of the single source that supports the claim. Only use facts that " +
      'appear in the sources. Reply as json: {"cards":[{"claim":"...","counterpoint":"...","sourceIndex":0}]} ' +
      "with 4-6 cards.",
    user: `Complaint theme: ${cluster.label} (${cluster.ticketCount} tickets, $${cluster.revenueAtRisk} MRR at risk)\n\nSample complaints:\n${complaints}\n\nSearch results:\n${sources}`,
  });

  return out.cards
    .filter((c) => hits[c.sourceIndex])
    .map((c) => {
      const src = hits[c.sourceIndex];
      return {
        clusterId: cluster.id,
        claim: c.claim,
        ...(c.counterpoint ? { counterpoint: c.counterpoint } : {}),
        sourceUrl: src.url,
        sourceName: new URL(src.url).hostname.replace(/^www\./, ""),
      };
    });
}

export async function runResearch(
  clusters: Cluster[],
  tickets: Ticket[],
  e: StageEmitter
): Promise<EvidenceCard[]> {
  const top = clusters.slice(0, 3);
  e.start({ clusters: top.map((c) => ({ id: c.id, label: c.label })) });

  const cards = await withFallback(e, {
    live: async () => {
      const ticketById = new Map(tickets.map((t) => [t.id, t]));
      const perCluster = await Promise.allSettled(
        top.map(async (cluster) => {
          const hits = await fanOut(cluster, e);
          const exemplars = cluster.exemplarTicketIds
            .map((id) => ticketById.get(id))
            .filter((t): t is Ticket => !!t);
          const cards = await distill(cluster, hits, exemplars);
          for (const card of cards) e.item(card);
          return cards;
        })
      );
      const all = perCluster
        .filter((r): r is PromiseFulfilledResult<EvidenceCard[]> => r.status === "fulfilled")
        .flatMap((r) => r.value);
      if (all.length === 0) throw new Error("research produced zero evidence cards");
      return all;
    },
    cacheName: "evidence.json",
    items: (cached) => cached as unknown as unknown[],
    warning: "research fell back to cached evidence",
  });

  writeCache("evidence.json", cards);
  e.done({ cards: cards.length });
  return cards;
}
