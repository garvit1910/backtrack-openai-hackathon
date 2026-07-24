/**
 * OpenAI client (raw fetch, no SDK): batched embeddings with a
 * content-addressed disk cache, plus a JSON-mode chat helper.
 */
import crypto from "node:crypto";
import { readCache, writeCache } from "./cache";

const EMBED_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "gpt-5-mini";
const EMBED_CACHE = "embeddings.json";

function key(): string {
  const k = process.env.OPENAI_API_KEY?.trim();
  if (!k) throw new Error("OPENAI_API_KEY missing");
  return k;
}

const sha = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);

let embedCache: Record<string, number[]> | null = null;
let inflight: Promise<unknown> = Promise.resolve();

/**
 * Embed texts, hitting OpenAI only for cache misses. Never recomputes:
 * cache is content-addressed by sha256(model + text) and persisted to
 * fixtures/cache/embeddings.json. Calls are serialized so concurrent stages
 * can't race the cache file.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const run = inflight.then(async () => {
    embedCache ??= readCache<Record<string, number[]>>(EMBED_CACHE) ?? {};
    const hashes = texts.map((t) => sha(`${EMBED_MODEL}:${t}`));
    const missing: { i: number; text: string }[] = [];
    texts.forEach((t, i) => {
      if (!embedCache![hashes[i]]) missing.push({ i, text: t });
    });

    for (let b = 0; b < missing.length; b += 100) {
      const batch = missing.slice(b, b + 100);
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EMBED_MODEL,
          input: batch.map((m) => m.text),
        }),
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(`embeddings ${res.status}: ${JSON.stringify(json.error ?? json).slice(0, 300)}`);
      json.data.forEach((d: { index: number; embedding: number[] }, j: number) => {
        embedCache![hashes[batch[j].i]] = d.embedding;
      });
    }
    if (missing.length > 0) writeCache(EMBED_CACHE, embedCache);
    return hashes.map((h) => embedCache![h]);
  });
  inflight = run.catch(() => {});
  return run;
}

/** Single JSON-mode chat call; returns the parsed object. */
export async function chatJSON<T>(opts: {
  system?: string;
  user: string;
  model?: string;
}): Promise<T> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? CHAT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: opts.user },
      ],
    }),
  });
  const json = await res.json();
  if (!res.ok)
    throw new Error(`chat ${res.status}: ${JSON.stringify(json.error ?? json).slice(0, 300)}`);
  return JSON.parse(json.choices[0].message.content) as T;
}
