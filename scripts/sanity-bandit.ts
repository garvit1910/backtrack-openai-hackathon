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
import { runMediaBuyer, warmStartFromStates } from "../lib/agents/mediaBuyer";

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

  // 4 — the two-cycle thesis (aggregate, equal spend), and its control.
  // c2 mix mirrors the real loop: carried champion (warm posterior) + informed
  // same-angle twin + runner-up challenger.
  let deltaSum = 0;
  let alignedWins = 0;
  let misalignedWins = 0;
  const CYCLE_SEEDS = 30;
  for (let seed = 100; seed < 100 + CYCLE_SEEDS; seed++) {
    const c1 = await runMediaBuyer({ creatives: spreadMix, cycle: 1, seed });
    const warm = warmStartFromStates(c1.finalStates);
    const alignedMix: Creative[] = SEGMENTS.flatMap((s) => {
      const learned = c1.report.winners[s]?.winnerAngle ?? DEFAULT_MARKET.prefs[s];
      const champion =
        spreadMix.find((c) => c.id === c1.report.winners[s]?.winnerCreativeId) ??
        mockCreative(s, learned, 1);
      const challenger = (["reliability", "speed", "value"] as Angle[]).find(
        (a) => a !== learned,
      )!;
      return [champion, mockCreative(s, learned, 2, 1), mockCreative(s, challenger, 2, 2)];
    });
    const misalignedMix: Creative[] = SEGMENTS.flatMap((s) =>
      (["fit_guidance", "service", "trust"] as Angle[])
        .filter((a) => a !== DEFAULT_MARKET.prefs[s])
        .slice(0, 3)
        .map((a, i) => mockCreative(s, a, 2, i)),
    );
    const c2good = await runMediaBuyer({
      creatives: alignedMix,
      cycle: 2,
      seed: seed + 500,
      warmStart: warm,
    });
    const c2bad = await runMediaBuyer({ creatives: misalignedMix, cycle: 2, seed: seed + 500 });
    deltaSum += (c2good.report.avgCtr - c1.report.avgCtr) / c1.report.avgCtr;
    if (c2good.report.avgCtr > c1.report.avgCtr) alignedWins++;
    if (c2bad.report.avgCtr > c1.report.avgCtr) misalignedWins++;
  }
  check(
    "aligned cycle-2 mix beats cycle 1 in most seeds",
    alignedWins / CYCLE_SEEDS >= 0.7,
    `${alignedWins}/${CYCLE_SEEDS} seeds, mean delta +${((deltaSum / CYCLE_SEEDS) * 100).toFixed(1)}%`,
  );
  check(
    "mean aligned delta is positive",
    deltaSum > 0,
  );
  check(
    "misaligned cycle-2 mix does NOT beat cycle 1 (no rigging)",
    misalignedWins === 0,
    `${misalignedWins}/${CYCLE_SEEDS} seeds`,
  );

  // the fixed demo seed the mock run replays — keep in sync with DEMO_SEED
  const DEMO_SEED = 36;
  const c1 = await runMediaBuyer({ creatives: spreadMix, cycle: 1, seed: DEMO_SEED });
  const warm = warmStartFromStates(c1.finalStates);
  const demoC2: Creative[] = SEGMENTS.flatMap((s) => {
    const learned = c1.report.winners[s]!.winnerAngle;
    const champion = spreadMix.find((c) => c.id === c1.report.winners[s]!.winnerCreativeId)!;
    const challenger = (["reliability", "speed", "value"] as Angle[]).find((a) => a !== learned)!;
    return [champion, mockCreative(s, learned, 2, 1), mockCreative(s, challenger, 2, 2)];
  });
  const c2 = await runMediaBuyer({
    creatives: demoC2,
    cycle: 2,
    seed: DEMO_SEED + 500,
    warmStart: warm,
  });
  const demoDelta = (c2.report.avgCtr - c1.report.avgCtr) / c1.report.avgCtr;
  check("demo seed 36 delta >= +10%", demoDelta >= 0.1, `+${(demoDelta * 100).toFixed(1)}%`);
  console.log(
    `\ndemo seed ${DEMO_SEED}: cycle1 ${(c1.report.avgCtr * 100).toFixed(2)}% → cycle2 ${(c2.report.avgCtr * 100).toFixed(2)}%  (+${(demoDelta * 100).toFixed(1)}%)` +
      `\nconvergence ticks c1 ${SEGMENTS.map((s) => c1.convergedAt[s] ?? "-").join("/")} → c2 ${SEGMENTS.map((s) => c2.convergedAt[s] ?? "-").join("/")}`,
  );

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall sanity checks passed");
}

main();
