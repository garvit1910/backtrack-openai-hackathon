/**
 * Octen web-search client (docs.octen.ai). POST /search with x-api-key.
 * Every call has a hard timeout so a slow query can never stall the stream.
 */

export interface OctenResult {
  title: string;
  url: string;
  highlight?: string;
  full_content?: string;
  time_published?: string;
}

export async function octenSearch(
  query: string,
  opts: { count?: number; topic?: "general" | "news"; timeoutMs?: number } = {}
): Promise<OctenResult[]> {
  const key = process.env.OCTEN_API_KEY?.trim();
  if (!key) throw new Error("OCTEN_API_KEY missing");
  const res = await fetch("https://api.octen.ai/search", {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      count: opts.count ?? 4,
      topic: opts.topic ?? "general",
      highlight: { enable: true, max_tokens: 300 },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
  });
  const json = await res.json();
  if (!res.ok || json.code !== 0)
    throw new Error(`octen ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return (json.data?.results ?? []) as OctenResult[];
}
