/**
 * STUB creative agent (Person 1 zone) — deterministic template ads until
 * Person 2's lib/agents/creative.ts lands. Cites the pack like the real
 * one must: ticketIds from the pain_point row, sourceUrls from evidence rows.
 */
import type { Angle, ContextPack, Creative, Cycle, GenerateCreatives, Segment } from "../../schemas";

const ANGLES_BY_SEGMENT: Record<Segment, Angle[]> = {
  starter: ["value", "speed", "trust"],
  growth: ["speed", "reliability", "service"],
  enterprise: ["reliability", "trust", "service"],
};

const HEADLINES: Record<Angle, (seg: Segment, cycle: Cycle) => string> = {
  reliability: (s, c) =>
    c === 1
      ? "Merch that arrives when we said it would."
      : "On-time or on us: date-guaranteed team merch.",
  speed: (s, c) =>
    c === 1
      ? "Offsite in three weeks? Kits in two."
      : "Rush-ready: swag kits that beat your deadline.",
  value: (s, c) =>
    c === 1
      ? "Premium team merch without the platform-fee bloat."
      : "Same budget, better hoodies. Do the math with us.",
  fit_guidance: () => "Size charts a human actually checked.",
  service: () => "A named human answers in hours, not weeks.",
  trust: () => "See every complaint we fixed — receipts included.",
};

export const generateCreatives: GenerateCreatives = async (
  pack: ContextPack,
  cycle: Cycle,
  opts?: { onItem?: (c: Creative) => void }
): Promise<Creative[]> => {
  const { segment, clusterId } = pack.task;
  const pain = pack.rows.find((r) => r.type === "pain_point");
  const evidence = pack.rows.filter((r) => r.type === "evidence");
  const learning = pack.rows.find(
    (r) => r.type === "learning" && (!r.segment || r.segment === segment)
  );

  // cycle 1 explores all angles equally; cycle 2 doubles down on the angle the
  // learner wrote back (two executions of the winner + one challenger) so the
  // portfolio wastes less budget on losing angles — that's the CTR lift.
  let variants: { angle: Angle; exec: string }[] = ANGLES_BY_SEGMENT[segment].map(
    (angle) => ({ angle, exec: "a" })
  );
  if (cycle === 2 && learning) {
    const winner = ANGLES_BY_SEGMENT[segment].find((a) => learning.content.includes(a));
    if (winner) {
      const challenger = ANGLES_BY_SEGMENT[segment].find((a) => a !== winner)!;
      variants = [
        { angle: winner, exec: "a" },
        { angle: winner, exec: "b" },
        { angle: challenger, exec: "a" },
      ];
    }
  }

  const creatives = variants.map(({ angle, exec }, i) => {
    const c: Creative = {
      id: `cr_c${cycle}_${segment}_${angle}_${exec}`,
      clusterId,
      segment,
      angle,
      cycle,
      kind: "paid_social",
      // "b" execution reuses the other cycle's copy as a second treatment
      headline: HEADLINES[angle](segment, exec === "b" ? 1 : cycle),
      body:
        `${pain?.content ?? "Teams keep getting burned on merch."} ` +
        (evidence[i % Math.max(evidence.length, 1)]?.content ??
          "Crewkit fixes the part everyone complains about.") +
        (cycle === 2 && learning ? ` (${learning.content})` : ""),
      citations: {
        ticketIds: (pain?.sourceRefs ?? []).slice(0, 3),
        sourceUrls: evidence.flatMap((e) => e.sourceRefs).slice(0, 3),
      },
      packFingerprint: pack.fingerprint,
    };
    opts?.onItem?.(c);
    return c;
  });
  return creatives;
};
