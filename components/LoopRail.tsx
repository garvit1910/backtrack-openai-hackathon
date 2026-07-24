"use client";

import type { Stage } from "@/components/contract";
import { STAGES } from "@/components/contract";
import { STAGE_LABELS } from "@/components/theme";
import type { RunState } from "@/components/useRunStream";

const W = 1200;
const H = 158;
const X0 = 75;
const STEP = (W - 2 * X0) / (STAGES.length - 1);

function nodeX(i: number): number {
  return X0 + i * STEP;
}
function nodeY(i: number): number {
  return 66 - Math.sin((i / (STAGES.length - 1)) * Math.PI) * 26;
}

type NodeStatus = "pending" | "active" | "done";

function statusOf(state: RunState, stage: Stage): NodeStatus {
  const cur = state.stages[`${state.cycle}:${stage}`];
  if (cur) return cur;
  if (state.stages[`1:${stage}`] === "done") return "done";
  return "pending";
}

/**
 * The eight stages as a loop: forward rail along a shallow arc, and the
 * learn → compile return edge sweeping back underneath — the write-back that
 * makes it a loop, not a pipeline.
 */
export function LoopRail({ state }: { state: RunState }) {
  const learnI = STAGES.indexOf("learn");
  const compileI = STAGES.indexOf("compile");
  const returnActive = statusOf(state, "learn") !== "pending";
  const returnD = `M ${nodeX(learnI)} ${nodeY(learnI) + 15} C ${nodeX(learnI)} 140, ${nodeX(compileI)} 140, ${nodeX(compileI) + 4} ${nodeY(compileI) + 16}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[150px] w-full select-none" role="img" aria-label="pipeline loop">
      <defs>
        <marker id="loop-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0.6 L7,4 L0,7.4 Z" fill="var(--accent)" />
        </marker>
      </defs>

      {/* forward edges */}
      {STAGES.slice(0, -1).map((stage, i) => {
        const from = statusOf(state, stage);
        const to = statusOf(state, STAGES[i + 1]);
        const lit = from === "done" && to !== "pending";
        const flowing = from === "done" && to === "active";
        return (
          <line
            key={stage}
            x1={nodeX(i) + 15}
            y1={nodeY(i) - ((nodeY(i) - nodeY(i + 1)) / STEP) * 15}
            x2={nodeX(i + 1) - 15}
            y2={nodeY(i + 1) + ((nodeY(i) - nodeY(i + 1)) / STEP) * 15}
            stroke={lit ? "var(--accent)" : "var(--baseline)"}
            strokeWidth={lit ? 2 : 1.4}
            className={flowing ? "edge-flow" : undefined}
          />
        );
      })}

      {/* the thesis: learn writes back into compile */}
      <path
        d={returnD}
        fill="none"
        stroke={returnActive ? "var(--accent)" : "var(--baseline)"}
        strokeWidth={returnActive ? 3 : 1.8}
        markerEnd="url(#loop-arrow)"
        className={statusOf(state, "learn") === "active" ? "edge-flow" : undefined}
        opacity={returnActive ? 1 : 0.75}
      />
      <text
        x={(nodeX(learnI) + nodeX(compileI)) / 2}
        y={150}
        textAnchor="middle"
        fontSize="11"
        fill={returnActive ? "var(--accent)" : "var(--ink-muted)"}
        letterSpacing="0.14em"
      >
        LEARNINGS WRITE BACK → LAYER v{state.layerVersion}
      </text>

      {/* nodes */}
      {STAGES.map((stage, i) => {
        const st = statusOf(state, stage);
        return (
          <g key={stage} className={st === "active" ? "node-active" : undefined}>
            <circle
              cx={nodeX(i)}
              cy={nodeY(i)}
              r={13}
              fill={st === "pending" ? "var(--surface)" : "var(--accent-dim)"}
              stroke={st === "pending" ? "var(--baseline)" : "var(--accent)"}
              strokeWidth={st === "active" ? 2.4 : 1.6}
            />
            {st === "done" && (
              <path
                d={`M ${nodeX(i) - 5} ${nodeY(i)} l 3.4 3.6 l 6.2 -7`}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            )}
            {st === "active" && <circle cx={nodeX(i)} cy={nodeY(i)} r={4.5} fill="var(--accent)" />}
            <text
              x={nodeX(i)}
              y={nodeY(i) - 24}
              textAnchor="middle"
              fontSize="12"
              fill={st === "pending" ? "var(--ink-muted)" : "var(--ink)"}
              letterSpacing="0.12em"
            >
              {STAGE_LABELS[stage].toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
