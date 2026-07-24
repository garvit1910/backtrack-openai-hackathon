/**
 * Person 2 integration test: drives contextStore / generateCreatives /
 * runLearner through EXACTLY the call sequence Person 1's orchestrator uses
 * (lib/signals/orchestrator.ts), including a second run in the same process
 * to prove the fresh-run auto-reset.
 *
 *   npx tsx scripts/itest-registry.ts            # live if key present
 *   OPENAI_API_KEY= npx tsx scripts/itest-registry.ts   # forced mock
 */
import fs from "node:fs";
import path from "node:path";
import type {
  BanditReport,
  ContextPack,
  ContextRow,
  Creative,
  Cycle,
  EvidenceCard,
  Segment,
} from "../lib/schemas";
import { SEGMENTS } from "../lib/schemas";
import { contextStore, allRows, layerVersion } from "../lib/context";
import { generateCreatives } from "../lib/agents/creative";
import { runLearner } from "../lib/agents/learner";

let failures = 0;
function check(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

/* verbatim from lib/signals/orchestrator.ts */
function evidenceToRows(cards: EvidenceCard[]): ContextRow[] {
  return cards.map((c, i) => ({
    id: `ev_${c.clusterId}_${i}`,
    type: "evidence",
    content: c.counterpoint ? `${c.claim} — ${c.counterpoint}` : c.claim,
    clusterId: c.clusterId,
    sourceRefs: [c.sourceUrl],
    confidence: 0.7,
    version: 1,
  }));
}

function readCacheJson<T>(name: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "fixtures", "cache", name), "utf8")
  ) as T;
}

async function orchestratorRun(runLabel: string): Promise<void> {
  console.log(`\n--- simulated orchestrator run (${runLabel}) ---`);
  const evidence = readCacheJson<EvidenceCard[]>("evidence.json");
  const clusters = readCacheJson<{ id: string }[]>("clusters.json");
  const top = clusters[0];

  await contextStore.append(evidenceToRows(evidence.slice(0, 8)));
  check(layerVersion() === 1, `after research append: layer v1 (got v${layerVersion()})`);
  check(!allRows().some((r) => r.type === "learning"), "no stale learning rows");
  check(allRows().some((r) => r.type === "brand_fact"), "brand facts auto-seeded");

  const creativesByCycle: Partial<Record<Cycle, Creative[]>> = {};
  let packsC1: ContextPack[] = [];
  for (const cycle of [1, 2] as Cycle[]) {
    const packs: ContextPack[] = [];
    for (const segment of SEGMENTS) {
      packs.push(await contextStore.compile({ clusterId: top.id, segment }));
    }
    if (cycle === 1) packsC1 = packs;
    check(
      packs.every((p) => p.layerVersion === (cycle === 1 ? 1 : 2)),
      `cycle ${cycle} packs report layerVersion ${cycle === 1 ? 1 : 2}`
    );
    check(
      packs.every((p) => p.rows.some((r) => r.type === "pain_point" && r.clusterId === top.id)),
      `cycle ${cycle} packs contain the pain row (auto-materialized)`
    );

    const creatives: Creative[] = [];
    let streamed = 0;
    for (const pack of packs) {
      const cs = await generateCreatives(pack, cycle, { onItem: () => streamed++ });
      creatives.push(...cs);
    }
    creativesByCycle[cycle] = creatives;
    check(creatives.length === 9 && streamed === 9, `cycle ${cycle}: 9 creatives, 9 streamed`);
    check(
      creatives.every((c) => c.citations.ticketIds.length + c.citations.sourceUrls.length > 0),
      `cycle ${cycle}: every creative cited`
    );

    if (cycle === 1) {
      const report: BanditReport = {
        cycle: 1,
        winners: {
          starter: { winnerCreativeId: creatives[0].id, winnerAngle: creatives[0].angle, ctrEstimate: 0.05, confidence: 0.85 },
          growth: { winnerCreativeId: creatives[3].id, winnerAngle: creatives[3].angle, ctrEstimate: 0.06, confidence: 0.9 },
          enterprise: { winnerCreativeId: creatives[6].id, winnerAngle: creatives[6].angle, ctrEstimate: 0.04, confidence: 0.8 },
        },
        avgCtr: 0.03,
      };
      const rows = await runLearner(report, packsC1);
      check(rows.length === 6, `learner returned 6 rows (got ${rows.length})`);
      check(layerVersion() === 1, "runLearner itself does NOT bump (orchestrator appends)");
      await contextStore.append(rows);
      check(layerVersion() === 2, `learning append bumped layer to v2 (got v${layerVersion()})`);

      const winners = report.winners;
      for (const seg of SEGMENTS) {
        const learned = allRows().find((r) => r.id === `learn:c1:${seg}`);
        const angleOk =
          !!learned &&
          new RegExp(`\\b${winners[seg]!.winnerAngle}\\b`, "i").test(learned.content);
        check(angleOk, `${seg} learning row names its angle "${winners[seg]!.winnerAngle}"`);
      }
    } else {
      const winners = readWinnersFromRows();
      for (const seg of SEGMENTS) {
        const segC = creativesByCycle[2]!.filter((c) => c.segment === seg);
        const conv = segC.filter((c) => c.angle === winners[seg]).length;
        check(conv >= 2, `${seg}: ${conv}/3 cycle-2 variants converged on "${winners[seg]}"`);
      }
    }
  }
}

function readWinnersFromRows(): Record<Segment, string> {
  const out = {} as Record<Segment, string>;
  for (const seg of SEGMENTS) {
    const row = allRows().find((r) => r.id === `learn:c1:${seg}`);
    const m = row?.content.match(/\b(reliability|speed|value|fit_guidance|service|trust)\b/i);
    out[seg] = m?.[1].toLowerCase() ?? "";
  }
  return out;
}

async function main(): Promise<void> {
  // env: intentionally NOT loading .env.local unless already in env — run
  // `npx tsx scripts/itest-registry.ts` after exporting the key for live mode.
  await orchestratorRun("A: cold start");
  await orchestratorRun("B: second run, same process — must auto-reset");
  console.log(failures === 0 ? "\nALL REGISTRY CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
