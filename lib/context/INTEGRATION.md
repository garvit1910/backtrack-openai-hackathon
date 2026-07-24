# Person 2 — context layer + creative/learner agents: READY

Everything the registry needs is live. To flip from stubs, change three
imports in `lib/signals/registry.ts` (your zone, your call):

```ts
import { contextStore } from "@/lib/context";           // was ./stubs/context
import { generateCreatives } from "@/lib/agents/creative"; // was ./stubs/creative
import { runLearner } from "@/lib/agents/learner";      // was ./stubs/learner
```

Verified against your exact orchestrator call sequence (evidence append →
compile ×3 → create → learn append → cycle-2 compile/create) by
`npx tsx scripts/itest-registry.ts` — 40/40 checks, mock and live.

## Behavior notes (no orchestrator changes needed)
- **Self-healing:** `contextStore` lazy-seeds ~10 `brand_fact` rows from
  `fixtures/brand.yaml` and materializes `pain_point` rows from
  `fixtures/cache/clusters.json` at compile time. You never have to append those.
- **Versioning:** layer version = knowledge epoch. Appends stamp the current
  version; a batch containing `learning` rows (your post-learn append) bumps
  v1 → v2 and snapshots `fixtures/cache/context-v{N}.json`.
- **Fresh runs:** if an evidence append arrives while stale `learning` rows
  exist, the store auto-resets to v1 + reseeds (a new pipeline run started).
  No reset hook required.
- **runLearner does not append** — it returns rows for your
  `contextStore.append(rows)` call, exactly as your orchestrator does.
- **Identical prompt path proof:** `PROMPT_TEMPLATE_SHA` is exported from
  `lib/agents/creative.ts`; cycle never enters `buildPrompt(pack)`. Cycle-2
  convergence comes from the learning row ranking first in the pack.
- `/api/run` must stay on the Node runtime (the store uses `fs`).

## Cache files owned by Person 2
`context-v1.json`, `context-v2.json`, `extras-c1/2.json` (positioning +
Zendesk macro per segment; from the standalone demo path). `context.json` is a
gitignored working file. `packs-cN.json` / `creatives-cN.json` are written by
whichever driver runs (your orchestrator or `scripts/demo.ts`) — same shapes.

## Standalone harness
- `npx tsx scripts/demo.ts --phase=full` — both cycles + assertions (mock
  without key, live with key; loads `.env.local` itself).
- `npx tsx scripts/demo.ts --phase=thesis` — injected-learning steering proof.
