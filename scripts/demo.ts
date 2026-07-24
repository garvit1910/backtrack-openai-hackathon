/**
 * Person 2 end-to-end harness (no orchestrator needed):
 *
 *   npx tsx scripts/demo.ts --phase=c1      # cycle 1 only + validations
 *   npx tsx scripts/demo.ts --phase=full    # both cycles + all assertions (default)
 *   npx tsx scripts/demo.ts --phase=thesis  # injected-learning shift proof
 */
import fs from "node:fs";
import path from "node:path";
import type {
  BanditReport,
  Cluster,
  ContextPack,
  Creative,
  Emit,
  EvidenceCard,
  Segment,
} from "../lib/context/contract";
import { SEGMENTS, banditReportZ, creativeZ } from "../lib/context/contract";
import { bannedClaimRegexes } from "../lib/context/brand";
import { hasKey } from "../lib/context/llm";
import { beginRun, layerVersion } from "../lib/context/store";
import { ingestSignals } from "../lib/context/ingest";
import { compilePack, deriveTasks, runCompileStage } from "../lib/context/compile";
import {
  PROMPT_TEMPLATE_SHA,
  createForPack,
  directedAngle,
  harvestCitations,
  runCreateStage,
} from "../lib/agents/creative";
import { runLearnStage } from "../lib/agents/learner";

/* ------------------------------ plumbing --------------------------------- */

function loadEnvLocal(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

let failures = 0;
function check(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

const emit: Emit = (e) => {
  let extra = "";
  if (e.status === "item" && e.payload && typeof e.payload === "object") {
    const p = e.payload as Record<string, unknown>;
    if (e.stage === "create") extra = ` ${p.id} [${p.angle}] "${p.headline}"`;
    else if (e.stage === "learn") extra = ` ${p.id}: ${String(p.content).slice(0, 90)}…`;
    else if (e.stage === "compile") extra = ` ${p.fingerprint} (${(p.rows as unknown[]).length} rows)`;
  }
  console.log(`  [c${e.cycle}] ${e.stage}:${e.status}${extra}`);
};

function readSamples(): { clusters: Cluster[]; evidence: EvidenceCard[]; report: BanditReport } {
  const dir = path.join(process.cwd(), "fixtures", "samples");
  const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  return {
    clusters: read("clusters.sample.json"),
    evidence: read("evidence.sample.json"),
    report: banditReportZ.parse(read("banditReport.sample.json")) as BanditReport,
  };
}

/** Keep the stand-in report consistent with whatever cycle 1 actually produced
 *  (a live LLM may pick different angles than the mock). In the real system
 *  Person 3 derives the report FROM the creatives, so this is faithful. */
function alignReport(report: BanditReport, creatives: Creative[]): BanditReport {
  const winners = { ...report.winners };
  for (const seg of SEGMENTS) {
    const w = winners[seg];
    if (!w) continue;
    const segCreatives = creatives.filter((c) => c.segment === seg);
    const byAngle = segCreatives.find((c) => c.angle === w.winnerAngle);
    if (byAngle) {
      winners[seg] = { ...w, winnerCreativeId: byAngle.id };
    } else {
      const fallback = segCreatives[0];
      console.log(`  (aligning ${seg}: no ${w.winnerAngle} variant in c1, winner becomes ${fallback.id} [${fallback.angle}])`);
      winners[seg] = { ...w, winnerCreativeId: fallback.id, winnerAngle: fallback.angle };
    }
  }
  return { ...report, winners };
}

/* ------------------------------- cycle 1 ---------------------------------- */

async function runCycle1() {
  const { clusters, evidence } = readSamples();
  await beginRun();
  await ingestSignals(clusters, evidence);
  const tasks = deriveTasks(clusters);
  const packs = await runCompileStage(tasks, 1, emit);
  const creatives = await runCreateStage(packs, 1, emit);
  return { tasks, packs, creatives };
}

function validateCycle1(creatives: Creative[], packs: ContextPack[]): void {
  console.log("\nCycle-1 validations:");
  check(creatives.length === 9, `9 creatives (got ${creatives.length})`);
  check(layerVersion() === 1, `layer version is 1 (got ${layerVersion()})`);
  for (const seg of SEGMENTS) {
    const segC = creatives.filter((c) => c.segment === seg);
    const angles = new Set(segC.map((c) => c.angle));
    check(segC.length === 3 && angles.size === 3, `${seg}: 3 variants, 3 distinct angles [${Array.from(angles).join(", ")}]`);
  }
  const banned = bannedClaimRegexes();
  check(
    creatives.every((c) => banned.every((rx) => !rx.test(c.headline) && !rx.test(c.body))),
    "no banned claims in any copy"
  );
  for (const c of creatives) {
    creativeZ.parse(c);
    const pack = packs.find((p) => p.fingerprint === c.packFingerprint);
    check(!!pack, `${c.id} fingerprint traces to a compiled pack`);
    if (pack) {
      const allowed = harvestCitations(pack);
      const cited = c.citations.ticketIds.length + c.citations.sourceUrls.length;
      check(
        cited > 0 &&
          c.citations.ticketIds.every((t) => allowed.ticketIds.includes(t)) &&
          c.citations.sourceUrls.every((u) => allowed.sourceUrls.includes(u)),
        `${c.id} has ${cited} citation(s), all inside its pack`
      );
    }
  }
}

/* ------------------------------- phases ----------------------------------- */

async function phaseFull(): Promise<void> {
  const { report } = readSamples();
  console.log(`\n=== CYCLE 1 (layer v${1}) — prompt template ${PROMPT_TEMPLATE_SHA.slice(0, 12)} ===`);
  const c1 = await runCycle1();
  validateCycle1(c1.creatives, c1.packs);

  console.log("\n=== LEARN (bandit report → context rows) ===");
  const aligned = alignReport(report, c1.creatives);
  const before = layerVersion();
  const learned = await runLearnStage(aligned, c1.creatives, emit);

  console.log("\n=== CYCLE 2 (identical prompt path) — prompt template " + PROMPT_TEMPLATE_SHA.slice(0, 12) + " ===");
  const packs2 = await runCompileStage(c1.tasks, 2, emit);
  const creatives2 = await runCreateStage(packs2, 2, emit);

  console.log("\nCycle-2 validations:");
  check(before === 1 && layerVersion() === 2, `layer version went 1 → 2 (learner appended ${learned.length} rows)`);
  for (const seg of SEGMENTS) {
    const winner = aligned.winners[seg]!;
    const segC2 = creatives2.filter((c) => c.segment === seg);
    const converged = segC2.filter((c) => c.angle === winner.winnerAngle).length;
    check(converged >= 2, `${seg}: ${converged}/3 cycle-2 variants use learned angle "${winner.winnerAngle}"`);
    const p1 = c1.packs.find((p) => p.task.segment === seg)!;
    const p2 = packs2.find((p) => p.task.segment === seg)!;
    check(p1.fingerprint !== p2.fingerprint, `${seg}: pack fingerprint changed (${p1.fingerprint} → ${p2.fingerprint})`);
  }
  const banned = bannedClaimRegexes();
  check(
    creatives2.every((c) => banned.every((rx) => !rx.test(c.headline) && !rx.test(c.body))),
    "no banned claims in cycle-2 copy"
  );

  const cacheDir = path.join(process.cwd(), "fixtures", "cache");
  for (const f of ["context-v1.json", "context-v2.json", "creatives-c1.json", "creatives-c2.json"]) {
    check(fs.existsSync(path.join(cacheDir, f)), `cache file ${f} exists`);
  }
  const v1 = JSON.parse(fs.readFileSync(path.join(cacheDir, "context-v1.json"), "utf8"));
  const v2 = JSON.parse(fs.readFileSync(path.join(cacheDir, "context-v2.json"), "utf8"));
  const v1Ids = new Set(v1.rows.map((r: { id: string }) => r.id));
  check(
    v1.rows.every((r: { id: string }) => v2.rows.some((s: { id: string }) => s.id === r.id)),
    `append-only: v2 (${v2.rows.length} rows) ⊇ v1 (${v1.rows.length} rows), +${v2.rows.length - v1Ids.size} learned`
  );

  console.log("\n=== PER-SEGMENT DIFF (cycle 1 → cycle 2) ===");
  for (const seg of SEGMENTS) {
    console.log(`\n${seg.toUpperCase()}  (winner: ${aligned.winners[seg]!.winnerAngle})`);
    const a = c1.creatives.filter((c) => c.segment === seg);
    const b = creatives2.filter((c) => c.segment === seg);
    for (let i = 0; i < 3; i++) {
      console.log(`  c1 [${a[i].angle.padEnd(12)}] ${a[i].headline}`);
    }
    for (let i = 0; i < 3; i++) {
      console.log(`  c2 [${b[i].angle.padEnd(12)}] ${b[i].headline}`);
    }
  }
}

async function phaseThesis(): Promise<void> {
  const { clusters, evidence } = readSamples();
  await beginRun();
  await ingestSignals(clusters, evidence);
  const tasks = deriveTasks(clusters);
  const growth = tasks.find((t) => t.segment === "growth")!;

  console.log("=== THESIS CHECK: does one injected learning row steer generation? ===");
  const basePack = await compilePack(growth);
  const base = await createForPack(basePack, 1);
  console.log(`baseline angles: [${base.creatives.map((c) => c.angle).join(", ")}] (${base.generatedBy})`);
  check(directedAngle(basePack) === null, "baseline pack has no learning directive");

  // "service" is deliberately NOT a default growth angle — an unmistakable shift.
  const { append } = await import("../lib/context/store");
  await append(
    [
      {
        id: "learn:test:growth",
        type: "learning",
        content: `For growth accounts, service framing outperformed alternatives on "${growth.clusterLabel}" (est. CTR 5.5% vs 3.1% average). Lead every growth ad with the service angle.`,
        segment: "growth" as Segment,
        clusterId: growth.clusterId,
        sourceRefs: ["bandit:test:growth"],
        confidence: 0.9,
      },
    ],
    { bump: true }
  );
  const shiftedPack = await compilePack(growth);
  const shifted = await createForPack(shiftedPack, 2);
  console.log(`shifted angles:  [${shifted.creatives.map((c) => c.angle).join(", ")}] (${shifted.generatedBy})`);

  check(directedAngle(shiftedPack) === "service", "recompiled pack carries the injected directive first");
  const converged = shifted.creatives.filter((c) => c.angle === "service").length;
  check(converged === 3, `all 3 variants converged on "service" (got ${converged}/3)`);
  check(basePack.fingerprint !== shiftedPack.fingerprint, "pack fingerprint changed");
  console.log("\nheadline shift:");
  for (let i = 0; i < 3; i++) {
    console.log(`  before [${base.creatives[i].angle.padEnd(12)}] ${base.creatives[i].headline}`);
  }
  for (let i = 0; i < 3; i++) {
    console.log(`  after  [${shifted.creatives[i].angle.padEnd(12)}] ${shifted.creatives[i].headline}`);
  }
  await beginRun(); // leave a clean working store behind
}

/* --------------------------------- main ----------------------------------- */

async function main(): Promise<void> {
  loadEnvLocal();
  const phase = process.argv.find((a) => a.startsWith("--phase="))?.slice(8) ?? "full";
  console.log(`Person 2 demo — phase=${phase}, OpenAI key ${hasKey() ? "PRESENT (live mode)" : "absent (mock mode)"}\n`);
  if (phase === "c1") {
    const { creatives, packs } = await runCycle1();
    validateCycle1(creatives, packs);
  } else if (phase === "thesis") {
    await phaseThesis();
  } else {
    await phaseFull();
  }
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
