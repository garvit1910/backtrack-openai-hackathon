/**
 * Outbound ship actions. Primary: Composio SLACK_SEND_MESSAGE through the
 * user's connected Slack account. Fallback: raw incoming webhook
 * (SLACK_WEBHOOK_URL). Either way the Slack message is real.
 */
import { Composio } from "@composio/core";

export interface ShipDelivery {
  via: "composio" | "webhook";
  detail: string;
}

async function viaComposio(text: string): Promise<ShipDelivery> {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new Error("COMPOSIO_API_KEY missing");
  const channel = process.env.SLACK_CHANNEL?.trim() || "#backtalk-demo";

  const composio = new Composio({ apiKey });
  const accounts = await composio.connectedAccounts.list({});
  const items = (accounts as { items?: unknown[] }).items ?? [];
  const slack = (items as Array<{ toolkit?: { slug?: string }; userId?: string; id?: string }>).find(
    (a) => a.toolkit?.slug?.toLowerCase() === "slack"
  );
  if (!slack) throw new Error("no Slack connected account in Composio");

  const userId = slack.userId ?? process.env.COMPOSIO_USER_ID?.trim() ?? "default";
  const result = (await composio.tools.execute("SLACK_SEND_MESSAGE", {
    userId,
    arguments: { channel, text },
  })) as { successful?: boolean; error?: string };
  if (result.successful === false)
    throw new Error(`SLACK_SEND_MESSAGE failed: ${result.error ?? "unknown"}`);
  return { via: "composio", detail: `posted to ${channel} as ${userId}` };
}

async function viaWebhook(text: string): Promise<ShipDelivery> {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url) throw new Error("SLACK_WEBHOOK_URL missing");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`webhook ${res.status}: ${await res.text()}`);
  return { via: "webhook", detail: "posted via incoming webhook" };
}

export async function slackPost(text: string): Promise<ShipDelivery> {
  try {
    return await viaComposio(text);
  } catch (composioErr) {
    try {
      return await viaWebhook(text);
    } catch (webhookErr) {
      throw new Error(
        `Slack delivery failed — composio: ${String(composioErr)}; webhook: ${String(webhookErr)}`
      );
    }
  }
}
