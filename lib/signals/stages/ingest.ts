/**
 * Ingest stage: load support tickets (fixtures stand in for a live
 * Composio/Zendesk pull) and stream them one-by-one so the UI can animate
 * the queue filling up.
 */
import fs from "node:fs";
import path from "node:path";
import type { Ticket } from "../../schemas";
import type { StageEmitter } from "../../events";

export function loadTickets(): Ticket[] {
  const file = path.join(process.cwd(), "fixtures", "tickets.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as Ticket[];
}

export async function runIngest(e: StageEmitter): Promise<Ticket[]> {
  const tickets = loadTickets();
  e.start({ source: "zendesk-fixtures", expected: tickets.length });
  for (const t of tickets) e.item(t);
  const accounts = new Set(tickets.map((t) => t.account.name));
  const totalMrr = [...new Map(tickets.map((t) => [t.account.name, t.account.mrr])).values()].reduce(
    (a, b) => a + b,
    0
  );
  e.done({ count: tickets.length, accounts: accounts.size, totalMrr });
  return tickets;
}
