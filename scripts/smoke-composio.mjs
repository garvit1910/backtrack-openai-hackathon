// Smoke test: Composio auth + Slack connectivity. Run:
//   node --env-file=.env.local scripts/smoke-composio.mjs [--send]
// Without --send: verifies the API key and lists Slack connected accounts.
// With --send: actually posts a test message to SLACK_CHANNEL.
import { Composio } from "@composio/core";

const apiKey = process.env.COMPOSIO_API_KEY?.trim();
if (!apiKey) throw new Error("COMPOSIO_API_KEY missing");
const userId = (process.env.COMPOSIO_USER_ID ?? "default").trim();
const channel = (process.env.SLACK_CHANNEL ?? "#backtalk-demo").trim();

const composio = new Composio({ apiKey });

const accounts = await composio.connectedAccounts.list({});
const items = accounts.items ?? accounts;
console.log(`✅ composio auth ok — ${items.length} connected account(s):`);
for (const a of items) {
  console.log(
    `  - toolkit=${a.toolkit?.slug ?? a.appName ?? "?"} status=${a.status} userId=${a.userId ?? a.entityId ?? "?"} id=${a.id}`
  );
}

const slack = items.find(
  (a) => (a.toolkit?.slug ?? a.appName ?? "").toLowerCase() === "slack"
);
if (!slack) {
  console.log("⚠️ no Slack connected account — connect one in the Composio dashboard, or set SLACK_WEBHOOK_URL fallback");
  process.exit(0);
}

if (process.argv.includes("--send")) {
  const result = await composio.tools.execute("SLACK_SEND_MESSAGE", {
    userId: slack.userId ?? slack.entityId ?? userId,
    arguments: { channel, text: "Backtalk smoke test — ignore 🛠️" },
  });
  console.log(`✅ slack send: ${JSON.stringify(result).slice(0, 400)}`);
} else {
  console.log(`ℹ️ Slack connected (userId=${slack.userId ?? slack.entityId ?? userId}). Re-run with --send to post a test message to ${channel}.`);
}
