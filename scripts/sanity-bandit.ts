/**
 * Sanity harness for the bandit engine. Run: npx tsx scripts/sanity-bandit.ts
 *
 * 1. betaPdfPoints stays finite at α+β = 10,000 (log-gamma overflow guard)
 * 2. same seed ⇒ byte-identical BanditReport (determinism)
 * 3. across many seeds each segment's winner matches its hidden market
 *    preference ≥ 90% of the time (the discovery mechanism works)
 * 4. honesty check: an aligned cycle-2 creative mix beats cycle 1's spread mix,
 *    and a deliberately MISALIGNED mix does not (no rigging anywhere)
 */

import type { Angle, Creative, Cycle, Segment } from "../components/contract";
import { SEGMENTS } from "../components/contract";
import { DEFAULT_MARKET, betaPdfPoints } from "../lib/bandit";
import { runMediaBuyer } from "../lib/agents/mediaBuyer";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function mockCreative(segment: Segment, angle: Angle, cycle: Cycle, idx = 0): Creative {
  return {
    id: `mock-${cycle}-${segment}-${angle}-${idx}`,
    clusterId: "cl-mock",
    segment,
    angle,
    cycle,
    kind: "ad",
    headline: `${angle} for ${segment}`,
    body: "",
    citations: { ticketIds: [], sourceUrls: [] },
    packFingerprint: "pk_mock",
  };
}

const spreadMix: Creative[] = SEGMENTS.flatMap((s) =>
  (["reliability", "speed", "value"] as Angle[]).map((a) => mockCreative(s, a, 1)),
);

async function main() {
  // 1 — numeric stability
  const pts = betaPdfPoints(400, 9600);
  check(
    "betaPdfPoints finite at alpha+beta=10k",
    pts.every((p) => Number.isFinite(p.y)),
    `peak density ${Math.max(...pts.map((p) => p.y)).toFixed(1)}`,
  );

  // 2 — determinism
  const a = await runMediaBuyer({ creatives: spreadMix, cycle: 1, seed: 42 });
  const b = await runMediaBuyer({ creatives: spreadMix, cycle: 1, seed: 42 });
  check(
    "same seed => identical report",
    JSON.stringify(a.report) === JSON.stringify(b.report),
  );

  // 3 — discovery across seeds
  const SEEDS = 50;
  const hits: Record<Segment, number> = { starter: 0, growth: 0, enterprise: 0 };
  for (let seed = 1; seed <= SEEDS; seed++) {
    const { report } = await runMediaBuyer({ creatives: spreadMix, cycle: 1, seed });
    for (const s of SEGMENTS) {
      if (report.winners[s]?.winnerAngle === DEFAULT_MARKET.prefs[s]) hits[s]++;
    }
  }
  for (const s of SEGMENTS) {
    check(
      `${s} discovers hidden pref (${DEFAULT_MARKET.prefs[s]})`,
      hits[s] / SEEDS >= 0.9,
      `${hits[s]}/${SEEDS} seeds`,
    );
  }

  // 4 — the two-cycle thesis, and its control
  const alignedMix: Creative[] = SEGMENTS.flatMap((s) => [
    mockCreative(s, DEFAULT_MARKET.prefs[s], 2, 0),
    mockCreative(s, DEFAULT_MARKET.prefs[s], 2, 1),
    mockCreative(s, "trust", 2, 2), // one challenger off-preference
  ]);
  const misalignedMix: Creative[] = SEGMENTS.flatMap((s) =>
    (["fit_guidance", "service", "trust"] as Angle[])
      .filter((a) => a !== DEFAULT_MARKET.prefs[s])
      .slice(0, 3)
      .map((a, i) => mockCreative(s, a, 2, i)),
  );

  let alignedWins = 0;
  let misalignedWins = 0;
  const CYCLE_SEEDS = 20;
  for (let seed = 100; seed < 100 + CYCLE_SEEDS; seed++) {
    const c1 = await runMediaBuyer({ creatives: spreadMix, cycle: 1, seed });
    const c2good = await runMediaBuyer({ creatives: alignedMix, cycle: 2, seed });
    const c2bad = await runMediaBuyer({ creatives: misalignedMix, cycle: 2, seed });
    if (c2good.report.avgCtr > c1.report.avgCtr) alignedWins++;
    if (c2bad.report.avgCtr > c1.report.avgCtr) misalignedWins++;
  }
  check(
    "aligned cycle-2 mix beats cycle 1",
    alignedWins === CYCLE_SEEDS,
    `${alignedWins}/${CYCLE_SEEDS} seeds`,
  );
  check(
    "misaligned cycle-2 mix does NOT beat cycle 1 (no rigging)",
    misalignedWins === 0,
    `${misalignedWins}/${CYCLE_SEEDS} seeds`,
  );

  // representative magnitudes for the demo narrative
  const c1 = await runMediaBuyer({ creatives: spreadMix, cycle: 1, seed: 7 });
  const c2 = await runMediaBuyer({ creatives: alignedMix, cycle: 2, seed: 7 });
  console.log(
    `\ncycle1 avgCtr ${(c1.report.avgCtr * 100).toFixed(2)}%  (${c1.tickHistory.length} rounds)` +
      `\ncycle2 avgCtr ${(c2.report.avgCtr * 100).toFixed(2)}%  (${c2.tickHistory.length} rounds)` +
      `\ndelta ${(((c2.report.avgCtr - c1.report.avgCtr) / c1.report.avgCtr) * 100).toFixed(0)}%`,
  );

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall sanity checks passed");
}

main();
