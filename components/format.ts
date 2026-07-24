export function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function fmtPct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtDelta(from: number, to: number): string {
  if (from <= 0) return "—";
  const d = (to / from - 1) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(0)}%`;
}

export function shortId(id: string, n = 9): string {
  return id.length > n ? `${id.slice(0, n)}…` : id;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 24);
  }
}
