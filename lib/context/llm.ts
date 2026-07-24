import OpenAI from "openai";

const EMBED_MODEL = "text-embedding-3-small";

let client: OpenAI | null | undefined;

export function hasKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

function getClient(): OpenAI | null {
  if (client === undefined) client = hasKey() ? new OpenAI() : null;
  return client;
}

export function chatModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}

/** Embed a batch of texts. Per-item null on failure or when no key is set —
 *  callers must treat null as "fall back to non-vector ranking". */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const c = getClient();
  if (!c || texts.length === 0) return texts.map(() => null);
  try {
    const res = await c.embeddings.create({ model: EMBED_MODEL, input: texts });
    return texts.map((_, i) => res.data[i]?.embedding ?? null);
  } catch {
    return texts.map(() => null);
  }
}

/** One strict structured-output chat call. Retries once on parse/validation
 *  failure, then returns null — callers fall back to their mock path. */
export async function chatStructured<T>(opts: {
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  validate?: (v: unknown) => T; // throw to reject and trigger the retry
}): Promise<T | null> {
  const c = getClient();
  if (!c) return null;
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await c.chat.completions.create({
        model: chatModel(),
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user + feedback },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: opts.schemaName, strict: true, schema: opts.jsonSchema },
        },
      });
      const raw = res.choices[0]?.message?.content;
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      return opts.validate ? opts.validate(parsed) : (parsed as T);
    } catch (err) {
      feedback = `\n\nYour previous answer was rejected: ${err instanceof Error ? err.message : String(err)}. Fix this and answer again.`;
    }
  }
  return null;
}
