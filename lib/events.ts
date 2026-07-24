/**
 * SSE helpers — Person 1 zone, frozen alongside lib/schemas.ts.
 *
 * Everything /api/run emits flows through here. Stages never touch the
 * stream directly: they get a StageEmitter (curried with cycle + stage),
 * so cycle tagging is automatic and payloads stay the only moving part.
 */

import type { Cycle, Stage, StageEvent } from "./schemas";

export type Emit = (e: StageEvent) => void;

export interface StageEmitter {
  cycle: Cycle;
  stage: Stage;
  start: (payload?: unknown, meta?: StageEvent["meta"]) => void;
  item: (payload: unknown, meta?: StageEvent["meta"]) => void;
  tick: (payload: unknown) => void;
  done: (payload?: unknown, meta?: StageEvent["meta"]) => void;
  /** escape hatch for ship's awaiting_approval / shipped */
  raw: Emit;
}

export function emitFor(emit: Emit, cycle: Cycle, stage: Stage): StageEmitter {
  const make =
    (status: StageEvent["status"]) =>
    (payload?: unknown, meta?: StageEvent["meta"]) =>
      emit({ cycle, stage, status, payload, ...(meta ? { meta } : {}) });
  return {
    cycle,
    stage,
    start: make("start"),
    item: make("item") as StageEmitter["item"],
    tick: (payload) => emit({ cycle, stage, status: "tick", payload }),
    done: make("done"),
    raw: emit,
  };
}

export function encodeEvent(e: StageEvent): string {
  return `data: ${JSON.stringify(e)}\n\n`;
}

/**
 * Wrap a run function in an SSE Response for an App Router route handler.
 * Handles client aborts, guards against enqueue-after-close, and sends a
 * heartbeat comment every 15s so proxies/dev servers don't kill the stream
 * during long OpenAI/Octen calls.
 */
export function sseResponse(
  req: Request,
  run: (emit: Emit, signal: AbortSignal) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => safeEnqueue(": hb\n\n"), 15_000);
      const abort = new AbortController();
      req.signal.addEventListener("abort", () => {
        closed = true;
        abort.abort();
        clearInterval(heartbeat);
      });

      try {
        await run((e) => safeEnqueue(encodeEvent(e)), abort.signal);
      } catch (err) {
        safeEnqueue(
          `data: ${JSON.stringify({
            cycle: 1,
            stage: "ingest",
            status: "done",
            meta: { warning: `run crashed: ${String(err)}` },
          })}\n\n`
        );
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by abort */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
