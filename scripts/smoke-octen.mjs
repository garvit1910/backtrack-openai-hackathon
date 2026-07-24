// Smoke test: Octen web search API. Run:
//   node --env-file=.env.local scripts/smoke-octen.mjs
const key = process.env.OCTEN_API_KEY?.trim();
if (!key) throw new Error("OCTEN_API_KEY missing");

const res = await fetch("https://api.octen.ai/search", {
  method: "POST",
  headers: { "x-api-key": key, "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "custom branded merch company shipping delay complaints reviews",
    count: 3,
    highlight: { enable: true, max_tokens: 200 },
  }),
});
const json = await res.json();
if (!res.ok || json.code !== 0) {
  throw new Error(`octen ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
}
console.log(`✅ octen ok — latency=${json.meta?.latency}ms, results:`);
for (const r of json.data.results) {
  console.log(`  - ${r.title} | ${r.url}`);
  console.log(`    ${String(r.highlight ?? "").slice(0, 120).replace(/\n/g, " ")}`);
}
