import { createHash } from "node:crypto";

export function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hash8(input: string): string {
  return sha256hex(input).slice(0, 8);
}
