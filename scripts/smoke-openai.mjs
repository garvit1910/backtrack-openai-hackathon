// Smoke test: OpenAI embeddings + chat. Run:
//   node --env-file=.env.local scripts/smoke-openai.mjs
const key = process.env.OPENAI_API_KEY?.trim();
if (!key) throw new Error("OPENAI_API_KEY missing");

const emb = await fetch("https://api.openai.com/v1/embeddings", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "text-embedding-3-small",
    input: ["my crewkit hoodies arrived two weeks late again"],
  }),
});
const embJson = await emb.json();
if (!emb.ok) throw new Error(`embeddings ${emb.status}: ${JSON.stringify(embJson)}`);
console.log(
  `✅ embeddings ok — dims=${embJson.data[0].embedding.length}, tokens=${embJson.usage.total_tokens}`
);

for (const model of ["gpt-5-mini", "gpt-4o-mini"]) {
  const chat = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: 'Reply with json: {"ok":true}' }],
      response_format: { type: "json_object" },
    }),
  });
  const chatJson = await chat.json();
  if (chat.ok) {
    console.log(`✅ chat ok — model=${model}, reply=${chatJson.choices[0].message.content}`);
    break;
  }
  console.log(`⚠️ ${model} failed (${chat.status}): ${chatJson.error?.message ?? ""} — trying next`);
}
