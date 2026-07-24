import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { NewContextRow } from "./contract";

export interface BrandConfig {
  brand: { name: string; oneLiner: string };
  tone: { descriptors: string[] };
  voice: { exemplar: string };
  vocabulary: { use: string[]; avoid: string[] };
  bannedClaims: string[];
  proofStyle: string;
}

let cached: BrandConfig | null = null;

export function loadBrand(): BrandConfig {
  if (!cached) {
    const file = path.join(process.cwd(), "fixtures", "brand.yaml");
    cached = parse(fs.readFileSync(file, "utf8")) as BrandConfig;
  }
  return cached;
}

/** brand.yaml → ~10 brand_fact rows with deterministic IDs (idempotent seed). */
export function brandRows(): NewContextRow[] {
  const b = loadBrand();
  const row = (slug: string, content: string): NewContextRow => ({
    id: `brand:${slug}`,
    type: "brand_fact",
    content,
    sourceRefs: ["fixtures/brand.yaml"],
    confidence: 1,
  });
  return [
    row("identity", `${b.brand.name}: ${b.brand.oneLiner}`),
    row("tone", `Copy must sound ${b.tone.descriptors.join(", ")}.`),
    row("voice-exemplar", `Voice exemplar: "${b.voice.exemplar}"`),
    row("vocab-use", `Prefer the words: ${b.vocabulary.use.join(", ")}.`),
    row("vocab-avoid", `Avoid buzzwords: ${b.vocabulary.avoid.join(", ")}.`),
    row("proof-style", b.proofStyle),
    ...b.bannedClaims.map((claim, i) =>
      row(`banned-${i + 1}`, `Never use the claim "${claim}" in any copy.`)
    ),
  ];
}

/** Case-insensitive word-boundary matchers for banned claims. */
export function bannedClaimRegexes(): RegExp[] {
  return loadBrand().bannedClaims.map((claim) => {
    const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i");
  });
}
