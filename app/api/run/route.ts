/**
 * GET /api/run — the pipeline as an SSE stream.
 *   ?mode=live|replay overrides the DEMO env var.
 *   live: runs the real two-cycle pipeline, records every event to
 *         fixtures/cache/events.jsonl (the replay source).
 *   replay: re-emits the recorded log with stage-tuned pacing.
 */
import { sseResponse, type Emit } from "@/lib/events";
import { appendJsonl, truncateJsonl } from "@/lib/signals/cache";
import { runPipeline } from "@/lib/signals/orchestrator";
import { hasReplayLog, replayRun } from "@/lib/signals/replay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const requested = url.searchParams.get("mode") ?? process.env.DEMO?.trim() ?? "live";
  const mode = requested === "replay" && hasReplayLog() ? "replay" : "live";

  return sseResponse(req, async (emit, signal) => {
    if (mode === "replay") {
      await replayRun(emit, signal);
      return;
    }
    // live: record everything for future replays
    truncateJsonl("events.jsonl");
    const t0 = Date.now();
    const recording: Emit = (e) => {
      appendJsonl("events.jsonl", { ...e, t: Date.now() - t0 });
      emit(e);
    };
    await runPipeline(recording);
  });
}
