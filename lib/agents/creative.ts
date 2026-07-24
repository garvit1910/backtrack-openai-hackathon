import fs from "node:fs";
import path from "node:path";
import type {
  Angle,
  ContextPack,
  Creative,
  Cycle,
  Emit,
  GenerateCreatives,
  Segment,
} from "../context/contract";
import { ANGLES, SEGMENTS, creativeZ } from "../context/contract";
import { bannedClaimRegexes, loadBrand } from "../context/brand";
import { chatStructured } from "../context/llm";
import { sha256hex } from "../context/util";

const CACHE_DIR = path.join(process.cwd(), "fixtures", "cache");
const KINDS = ["paid_social", "search_ad", "linkedin_sponsored"] as const;

/* ------------------------------------------------------------------------ *
 * The prompt path. TEMPLATE is a static constant and buildPrompt() takes
 * ONLY the pack — `cycle` never reaches either. Cycle 1's angle diversity
 * and cycle 2's convergence are the SAME instruction (rule 1), resolved
 * differently by whether the pack contains a learning row.
 * ------------------------------------------------------------------------ */

const TEMPLATE = `You are the creative agent for a B2B brand. You receive a compiled context pack: typed rows of brand facts, customer pain points, market evidence, segment insights and bandit learnings, ordered by priority — earlier rows dominate later ones.

Rules:
1. If any row has type "learning", treat it as a binding directive: ALL THREE ad variants must use the angle it names, differing only in execution (hook, proof point, call to action). If no "learning" row exists, the three variants must use three DIFFERENT angles.
2. Angles must come from exactly: reliability, speed, value, fit_guidance, service, trust.
3. Every factual claim must be traceable to a pack row. Cite only ticket IDs and source URLs from the ALLOWED CITATIONS list; every variant needs at least one citation.
4. Obey every brand_fact row: tone, vocabulary, and claims that must never be used.
5. Headlines are at most 9 words. Bodies are 2-3 sentences, specific and numerate.

Besides the three variants, return a one-sentence positioning line for this segment and a short, empathetic Zendesk macro (a support reply) that references the pain point and what is being done about it.`;

export const PROMPT_TEMPLATE_SHA = sha256hex(TEMPLATE);

export function buildPrompt(pack: ContextPack): string {
  const rows = pack.rows
    .map(
      (r) =>
        `- [${r.type}${r.segment ? `/${r.segment}` : ""}] (${r.id}) ${r.content}`
    )
    .join("\n");
  const allowed = harvestCitations(pack);
  return [
    `Task: three ad variants for the "${pack.task.segment}" segment about cluster "${pack.task.clusterId}" (${packLabel(pack)}).`,
    ``,
    `Context pack ${pack.fingerprint} (layer v${pack.layerVersion}), rows in priority order:`,
    rows,
    ``,
    `ALLOWED CITATIONS`,
    `Ticket IDs: ${allowed.ticketIds.join(", ") || "(none)"}`,
    `Source URLs: ${allowed.sourceUrls.join(", ") || "(none)"}`,
  ].join("\n");
}

/* ----------------------------- pack helpers ------------------------------ */

/** Cluster label, recovered from the cluster's pain_point row. */
export function packLabel(pack: ContextPack): string {
  const pain = pack.rows.find((r) => r.id === `pain:${pack.task.clusterId}`);
  return pain ? pain.content.split(" — ")[0] : pack.task.clusterId;
}

export function harvestCitations(pack: ContextPack): {
  ticketIds: string[];
  sourceUrls: string[];
} {
  const refs = pack.rows.flatMap((r) => r.sourceRefs);
  return {
    ticketIds: Array.from(new Set(refs.filter((x) => x.startsWith("ticket:")).map((x) => x.slice(7)))),
    sourceUrls: Array.from(new Set(refs.filter((x) => /^https?:/.test(x)))),
  };
}

/** The angle a learning row directs, if the pack contains one. */
export function directedAngle(pack: ContextPack): Angle | null {
  for (const row of pack.rows) {
    if (row.type !== "learning") continue;
    const content = row.content.toLowerCase();
    for (const angle of ANGLES) {
      if (new RegExp(`\\b${angle}\\b`).test(content)) return angle;
    }
  }
  return null;
}

/* ------------------------------ mock spine -------------------------------- *
 * Deterministic and thesis-preserving: honors learning rows exactly like
 * rule 1 tells the real model to. The whole demo works without a key.
 * -------------------------------------------------------------------------- */

const SEGMENT_ANGLES: Record<Segment, Angle[]> = {
  starter: ["value", "fit_guidance", "service"],
  growth: ["speed", "reliability", "value"],
  enterprise: ["trust", "reliability", "service"],
};

interface VariantDraft {
  angle: Angle;
  kind: string;
  headline: string;
  body: string;
  ticketIds: string[];
  sourceUrls: string[];
}

interface CreativeBatch {
  positioning: string;
  zendeskMacro: string;
  variants: VariantDraft[];
}

function mockCopy(angle: Angle, segment: Segment, label: string): { headline: string; body: string } {
  const pain = label.toLowerCase();
  switch (angle) {
    case "value":
      return {
        headline: "Team kits without the per-unit sticker shock",
        body: `"${pain}" is where merch budgets quietly die. Crewkit prices every print run per unit up front — so ${segment} teams see exactly what a kit costs before they commit.`,
      };
    case "speed":
      return {
        headline: "Offsite on the 14th? Kits land the 10th",
        body: `Teams burned by "${pain}" don't need apologies — they need a ship date that holds. Crewkit locks your print run and tracks every box to the door.`,
      };
    case "trust":
      return {
        headline: "The merch partner your finance team will clear",
        body: `Clean invoices, a named account owner, and an on-time record you can audit. Crewkit takes "${pain}" off procurement's risk list instead of adding to it.`,
      };
    case "reliability":
      return {
        headline: "Kits that arrive counted, sized and intact",
        body: `Crushed boxes and short counts shouldn't be a quarterly ritual. Crewkit QCs every print run and reinforces packaging — so "${pain}" stops being a ticket category.`,
      };
    case "fit_guidance":
      return {
        headline: "Map your size curve before you order",
        body: `Not sure Crewkit fits a ${segment} team like yours? A sample kit and a 10-minute size-curve check tell you honestly before a single blank gets printed.`,
      };
    case "service":
      return {
        headline: "A named human on every order",
        body: `Crewkit account owners answer inside a business day and stay on it until "${pain}" is closed for good. That's the support ${segment} teams keep mentioning.`,
      };
  }
}

export function mockBatch(pack: ContextPack): CreativeBatch {
  const segment = pack.task.segment;
  const label = packLabel(pack);
  const directed = directedAngle(pack);
  const angles: Angle[] = directed
    ? [directed, directed, directed]
    : SEGMENT_ANGLES[segment];
  const allowed = harvestCitations(pack);
  const clusterRefs = harvestCitations({
    ...pack,
    rows: pack.rows.filter((r) => r.clusterId === pack.task.clusterId),
  });
  const ticketIds = (clusterRefs.ticketIds.length ? clusterRefs.ticketIds : allowed.ticketIds).slice(0, 2);
  const sourceUrls = (clusterRefs.sourceUrls.length ? clusterRefs.sourceUrls : allowed.sourceUrls).slice(0, 1);
  const brand = loadBrand();
  return {
    positioning: `For ${segment} teams, ${brand.brand.name} turns "${label}" from a churn driver into the reason they switch.`,
    zendeskMacro: `Hi {{ticket.requester.first_name}} — thanks for flagging this. We hear you on ${label.toLowerCase()}: the team has shipped fixes here and your account is flagged for the next drop. Reply to this ticket and I'll personally track your order through.`,
    variants: angles.map((angle, i) => {
      const { headline, body } = mockCopy(angle, segment, label);
      // Distinguish execution when a learning row converges all three angles.
      const suffix = directed && i > 0 ? (i === 1 ? " See the numbers." : " Start this week.") : "";
      return {
        angle,
        kind: KINDS[i],
        headline,
        body: body + suffix,
        ticketIds,
        sourceUrls,
      };
    }),
  };
}

/* ------------------------------ validation -------------------------------- */

function validateBatch(batch: CreativeBatch, pack: ContextPack): string[] {
  const problems: string[] = [];
  const allowed = harvestCitations(pack);
  const directed = directedAngle(pack);
  const banned = bannedClaimRegexes();

  if (batch.variants.length !== 3) {
    problems.push(`expected exactly 3 variants, got ${batch.variants.length}`);
  }
  const angles = batch.variants.map((v) => v.angle);
  if (directed) {
    if (!angles.every((a) => a === directed)) {
      problems.push(
        `pack contains a learning directive for angle "${directed}" but variants used [${angles.join(", ")}]`
      );
    }
  } else if (new Set(angles).size !== angles.length) {
    problems.push(`variants must use three different angles, got [${angles.join(", ")}]`);
  }
  batch.variants.forEach((v, i) => {
    if (v.ticketIds.length + v.sourceUrls.length === 0) {
      problems.push(`variant ${i + 1} has no citations`);
    }
    for (const t of v.ticketIds) {
      if (!allowed.ticketIds.includes(t)) problems.push(`variant ${i + 1} cites unknown ticket "${t}"`);
    }
    for (const u of v.sourceUrls) {
      if (!allowed.sourceUrls.includes(u)) problems.push(`variant ${i + 1} cites unknown source "${u}"`);
    }
    for (const rx of banned) {
      if (rx.test(v.headline) || rx.test(v.body)) {
        problems.push(`variant ${i + 1} uses a banned claim (${rx})`);
      }
    }
  });
  return problems;
}

/* ------------------------------- real path -------------------------------- */

const BATCH_JSON_SCHEMA = {
  type: "object",
  properties: {
    positioning: { type: "string" },
    zendeskMacro: { type: "string" },
    variants: {
      type: "array",
      items: {
        type: "object",
        properties: {
          angle: { type: "string", enum: [...ANGLES] },
          kind: { type: "string", enum: [...KINDS] },
          headline: { type: "string" },
          body: { type: "string" },
          ticketIds: { type: "array", items: { type: "string" } },
          sourceUrls: { type: "array", items: { type: "string" } },
        },
        required: ["angle", "kind", "headline", "body", "ticketIds", "sourceUrls"],
        additionalProperties: false,
      },
    },
  },
  required: ["positioning", "zendeskMacro", "variants"],
  additionalProperties: false,
};

async function llmBatch(pack: ContextPack): Promise<CreativeBatch | null> {
  return chatStructured<CreativeBatch>({
    system: TEMPLATE,
    user: buildPrompt(pack),
    schemaName: "creative_batch",
    jsonSchema: BATCH_JSON_SCHEMA,
    validate: (v) => {
      const batch = v as CreativeBatch;
      const problems = validateBatch(batch, pack);
      if (problems.length) throw new Error(problems.join("; "));
      return batch;
    },
  });
}

/* ----------------------------- orchestration ------------------------------ */

export interface CreateResult {
  creatives: Creative[];
  positioning: string;
  zendeskMacro: string;
  generatedBy: "llm" | "mock";
}

export async function createForPack(
  pack: ContextPack,
  cycle: Cycle
): Promise<CreateResult> {
  const fromLlm = await llmBatch(pack); // null when keyless or twice-invalid
  const batch = fromLlm ?? mockBatch(pack);
  const creatives: Creative[] = batch.variants.map((v, i) => ({
    id: `cr-c${cycle}-${pack.task.segment}-${i + 1}`,
    clusterId: pack.task.clusterId,
    segment: pack.task.segment,
    angle: v.angle,
    cycle,
    kind: v.kind,
    headline: v.headline,
    body: v.body,
    citations: { ticketIds: v.ticketIds, sourceUrls: v.sourceUrls },
    packFingerprint: pack.fingerprint,
  }));
  creatives.forEach((c) => creativeZ.parse(c));
  return {
    creatives,
    positioning: batch.positioning,
    zendeskMacro: batch.zendeskMacro,
    generatedBy: fromLlm ? "llm" : "mock",
  };
}

/** Orchestrator entry point for the create stage of one cycle.
 *  Dumps creatives-c{cycle}.json from the exact array streamed as items. */
/** Frozen cross-zone contract (lib/schemas.ts): what Person 1's registry
 *  binds to. The orchestrator owns events and cache dumps in that flow. */
export const generateCreatives: GenerateCreatives = async (pack, cycle, opts) => {
  const result = await createForPack(pack, cycle);
  for (const creative of result.creatives) opts?.onItem?.(creative);
  return result.creatives;
};

export async function runCreateStage(
  packs: ContextPack[],
  cycle: Cycle,
  emit?: Emit
): Promise<Creative[]> {
  emit?.({ cycle, stage: "create", status: "start" });
  const all: Creative[] = [];
  const extras: Record<string, { positioning: string; zendeskMacro: string; generatedBy: string }> = {};
  for (const pack of packs) {
    const result = await createForPack(pack, cycle);
    for (const creative of result.creatives) {
      all.push(creative);
      emit?.({ cycle, stage: "create", status: "item", payload: creative });
    }
    extras[pack.task.segment] = {
      positioning: result.positioning,
      zendeskMacro: result.zendeskMacro,
      generatedBy: result.generatedBy,
    };
  }
  all.sort(
    (a, b) =>
      SEGMENTS.indexOf(a.segment) - SEGMENTS.indexOf(b.segment) ||
      a.id.localeCompare(b.id)
  );
  await fs.promises.mkdir(CACHE_DIR, { recursive: true });
  await fs.promises.writeFile(
    path.join(CACHE_DIR, `creatives-c${cycle}.json`),
    JSON.stringify(all, null, 2)
  );
  await fs.promises.writeFile(
    path.join(CACHE_DIR, `extras-c${cycle}.json`),
    JSON.stringify(extras, null, 2)
  );
  emit?.({
    cycle,
    stage: "create",
    status: "done",
    payload: { count: all.length, promptTemplateSha: PROMPT_TEMPLATE_SHA },
  });
  return all;
}
