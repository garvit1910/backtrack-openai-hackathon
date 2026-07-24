/**
 * STUB learner (Person 1 zone) — turns bandit winners into `learning`
 * context rows until Person 2's lib/agents/learner.ts lands.
 */
import type { ContextRow, RunLearner } from "../../schemas";
import { SEGMENTS } from "../../schemas";

export const runLearner: RunLearner = async (report, packs): Promise<ContextRow[]> => {
  const clusterId = packs[0]?.task.clusterId;
  return SEGMENTS.filter((s) => report.winners[s]).map((segment) => {
    const w = report.winners[segment];
    return {
      id: `stub_learning_${report.cycle}_${segment}`,
      type: "learning",
      content: `${segment} converts best on the ${w.winnerAngle} angle (ctr ${(w.ctrEstimate * 100).toFixed(1)}%, confidence ${(w.confidence * 100).toFixed(0)}%) — lead with ${w.winnerAngle} for this segment.`,
      segment,
      clusterId,
      sourceRefs: [w.winnerCreativeId],
      confidence: w.confidence,
      version: 2,
    };
  });
};
