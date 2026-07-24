// Research runner: Octen fan-out over top-3 clusters → fixtures/cache/evidence.json
// Run: npx tsx --env-file=.env.local scripts/run-research.ts
import { emitFor } from "../lib/events";
import type { Cluster } from "../lib/schemas";
import { readCache } from "../lib/signals/cache";
import { loadTickets } from "../lib/signals/stages/ingest";
import { runResearch } from "../lib/signals/stages/research";

const emit = (e: { stage: string; status: string; payload?: unknown; meta?: unknown }) => {
  const tag = e.meta ? ` meta=${JSON.stringify(e.meta)}` : "";
  console.log(`[${e.stage}:${e.status}]${tag}`, JSON.stringify(e.payload)?.slice(0, 220));
};

async function main() {
  const clusters = readCache<Cluster[]>("clusters.json");
  if (!clusters) throw new Error("run scripts/run-understand.ts first");
  const cards = await runResearch(clusters, loadTickets(), emitFor(emit, 1, "research"));
  console.log(`\n✅ ${cards.length} evidence cards → fixtures/cache/evidence.json`);
}
main();
