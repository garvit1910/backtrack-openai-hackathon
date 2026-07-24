// Gate 2 runner: ingest + understand → fixtures/cache/clusters.json,
// then score cluster purity against the planted ground truth.
// Run: npx tsx --env-file=.env.local scripts/run-understand.ts
import fs from "node:fs";
import { emitFor } from "../lib/events";
import { loadTickets } from "../lib/signals/stages/ingest";
import { runUnderstand } from "../lib/signals/stages/understand";

const emit = (e: { stage: string; status: string; payload?: unknown }) => {
  if (e.status !== "item" || (e.payload as { id?: string })?.id?.startsWith("cl_"))
    console.log(`[${e.stage}:${e.status}]`, JSON.stringify(e.payload)?.slice(0, 200));
};

async function main() {
  const tickets = loadTickets();
  const clusters = await runUnderstand(tickets, emitFor(emit, 1, "understand"));

  // purity check: majority ground-truth theme per cluster
  const gt = JSON.parse(fs.readFileSync("fixtures/tickets.groundtruth.json", "utf8")) as Record<string, string>;
  console.log("\n— purity vs planted themes —");
  for (const c of clusters) {
    const majority = new Map<string, number>();
    for (const id of c.exemplarTicketIds)
      majority.set(gt[id], (majority.get(gt[id]) ?? 0) + 1);
    const label = [...majority.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    console.log(
      `${c.id} "${c.label}" n=${c.ticketCount} $${c.revenueAtRisk} trend=${c.trend > 0 ? "+" : ""}${c.trend} → exemplars=${label}`
    );
  }
}
main();
