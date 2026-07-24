/**
 * Understand stage: embed every ticket, k-means them into themes, label the
 * clusters with one LLM call, and weight each theme by revenue at risk.
 * Dumps fixtures/cache/clusters.json (Gate 2 artifact).
 */
import type { Cluster, Segment, Ticket } from "../../schemas";
import { SEGMENTS } from "../../schemas";
import type { StageEmitter } from "../../events";
import { withFallback, writeCache } from "../cache";
import { chatJSON, embedBatch } from "../openai";
import { kmeans, nearestTo } from "../kmeans";

const K = 7; // 6 planted themes + a noise bucket

const DAY = 86_400_000;

function trendOf(tickets: Ticket[], anchor: number): number {
  const recent = tickets.filter((t) => Date.parse(t.createdAt) > anchor - 45 * DAY).length;
  const older = tickets.length - recent;
  if (older === 0) return 1;
  return +(recent / older - 1).toFixed(2);
}

async function computeClusters(
  tickets: Ticket[],
  e: StageEmitter
): Promise<Cluster[]> {
  const texts = tickets.map((t) => `${t.subject}\n${t.body}`);
  const vectors = await embedBatch(texts);
  e.item({ step: "embedded", count: vectors.length, dims: vectors[0].length });

  const { assignments, centroids } = kmeans(vectors, K, 42);

  const groups = new Map<number, number[]>();
  assignments.forEach((c, i) => {
    groups.set(c, [...(groups.get(c) ?? []), i]);
  });

  // one LLM call labels every cluster from its nearest-to-centroid exemplars
  const exemplarText = [...groups.entries()]
    .map(([c, members]) => {
      const nearest = nearestTo(centroids[c], vectors, members, 5);
      const quotes = nearest
        .map((i) => `- ${tickets[i].subject}: ${tickets[i].body.slice(0, 140)}`)
        .join("\n");
      return `Cluster ${c} (${members.length} tickets):\n${quotes}`;
    })
    .join("\n\n");

  const labels = await chatJSON<{ labels: { cluster: number; label: string }[] }>({
    system:
      "You label support-ticket clusters for Crewkit, a B2B team-merch platform. " +
      "Labels are 2-4 word noun phrases a marketer would recognize, e.g. \"Shipping delays\". " +
      'Reply as json: {"labels":[{"cluster":<number>,"label":"..."}]}',
    user: exemplarText,
  });
  const labelMap = new Map(labels.labels.map((l) => [l.cluster, l.label]));

  const anchor = Math.max(...tickets.map((t) => Date.parse(t.createdAt)));
  const clusters: Cluster[] = [...groups.entries()]
    .map(([c, members]) => {
      const ts = members.map((i) => tickets[i]);
      const byAccount = new Map(ts.map((t) => [t.account.name, t.account.mrr]));
      const segmentBreakdown = Object.fromEntries(
        SEGMENTS.map((s) => [s, ts.filter((t) => t.account.segment === s).length])
      ) as Record<Segment, number>;
      const exemplars = nearestTo(centroids[c], vectors, members, 3);
      return {
        id: `cl_${c}`,
        label: labelMap.get(c) ?? `Theme ${c}`,
        share: +(members.length / tickets.length).toFixed(3),
        trend: trendOf(ts, anchor),
        revenueAtRisk: [...byAccount.values()].reduce((a, b) => a + b, 0),
        segmentBreakdown,
        exemplarTicketIds: exemplars.map((i) => tickets[i].id),
        ticketCount: members.length,
      };
    })
    .sort((a, b) => b.revenueAtRisk - a.revenueAtRisk);
  return clusters;
}

export async function runUnderstand(
  tickets: Ticket[],
  e: StageEmitter
): Promise<Cluster[]> {
  e.start({ ticketCount: tickets.length, k: K });
  const clusters = await withFallback(e, {
    live: async () => {
      const clusters = await computeClusters(tickets, e);
      for (const c of clusters) e.item(c);
      return clusters;
    },
    cacheName: "clusters.json",
    items: (cached) => cached as unknown as unknown[],
    warning: "understand fell back to cached clusters",
  });
  writeCache("clusters.json", clusters);
  e.done({
    clusters: clusters.length,
    top: clusters[0]?.label,
    topRevenueAtRisk: clusters[0]?.revenueAtRisk,
  });
  return clusters;
}
