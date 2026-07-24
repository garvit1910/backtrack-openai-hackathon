/**
 * STUB ContextStore (Person 1 zone) — stands in for Person 2's lib/context
 * until it lands. Fixture-backed: enough signal for the pipeline to run
 * end-to-end, honest about being a stub via row ids.
 */
import crypto from "node:crypto";
import type {
  Cluster,
  ContextPack,
  ContextRow,
  ContextStoreApi,
  Segment,
} from "../../schemas";
import { readCache } from "../cache";

const BRAND_FACTS: string[] = [
  "Crewkit is a B2B team-merch subscription platform: companies order branded apparel and swag kits for their teams on monthly plans.",
  "Crewkit prints on premium blanks and offers reinforced packaging on request.",
  "Crewkit ships to individual remote addresses, not just office docks.",
];

const SEGMENT_INSIGHTS: Record<Segment, string> = {
  starter:
    "Starter accounts are price-sensitive teams under 25 people; they compare per-unit costs openly.",
  growth:
    "Growth accounts order around events (offsites, onboarding classes) and care most about hitting dates.",
  enterprise:
    "Enterprise accounts value reliability guarantees and named support over price.",
};

const rows: ContextRow[] = BRAND_FACTS.map((content, i) => ({
  id: `stub_brand_${i}`,
  type: "brand_fact",
  content,
  sourceRefs: [],
  confidence: 0.9,
  version: 1,
}));

function fingerprint(parts: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 12);
}

export const contextStore: ContextStoreApi = {
  async append(newRows: ContextRow[]): Promise<void> {
    rows.push(...newRows);
  },

  async compile(task: { clusterId: string; segment: Segment }): Promise<ContextPack> {
    const clusters = readCache<Cluster[]>("clusters.json") ?? [];
    const cluster = clusters.find((c) => c.id === task.clusterId);
    const hasLearnings = rows.some((r) => r.type === "learning");
    const layerVersion = hasLearnings ? 2 : 1;

    const packRows: ContextRow[] = [
      ...rows.filter((r) => r.type === "brand_fact"),
      ...(cluster
        ? [
            {
              id: `stub_pain_${cluster.id}`,
              type: "pain_point" as const,
              content: `${cluster.label}: ${cluster.ticketCount} tickets (${Math.round(cluster.share * 100)}% of volume), $${cluster.revenueAtRisk} MRR at risk, trend ${cluster.trend > 0 ? "+" : ""}${cluster.trend}.`,
              clusterId: cluster.id,
              sourceRefs: cluster.exemplarTicketIds,
              confidence: 0.85,
              version: 1,
            },
          ]
        : []),
      {
        id: `stub_seg_${task.segment}`,
        type: "segment_insight",
        content: SEGMENT_INSIGHTS[task.segment],
        segment: task.segment,
        sourceRefs: [],
        confidence: 0.7,
        version: 1,
      },
      ...rows.filter(
        (r) =>
          r.type === "evidence" &&
          (!r.clusterId || r.clusterId === task.clusterId)
      ).slice(0, 5),
      ...rows.filter(
        (r) => r.type === "learning" && (!r.segment || r.segment === task.segment)
      ),
    ];

    return {
      fingerprint: fingerprint([task, layerVersion, packRows.map((r) => r.id)]),
      layerVersion,
      task,
      rows: packRows,
    };
  },
};
