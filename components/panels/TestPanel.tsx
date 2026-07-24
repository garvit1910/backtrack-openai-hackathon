"use client";

import type { Angle, BanditState, BanditVariant, Cycle, Segment } from "@/components/contract";
import { SEGMENTS } from "@/components/contract";
import { fmtDelta, fmtPct } from "@/components/format";
import { ANGLE_COLORS, ANGLE_LABELS, SEGMENT_LABELS } from "@/components/theme";
import { betaPdfPoints, posteriorMean } from "@/lib/bandit";
import { FLIGHT_ROUNDS } from "@/lib/agents/mediaBuyer";
import type { BanditView, RunState } from "@/components/useRunStream";
import { EmptyHint, Panel } from "./Panel";

const CHART_W = 240;
const CHART_H = 64;
const X_MAX = 0.08; // CTR posteriors live below 8% — zoom so separation reads

/** mark same-angle twins so the doubled-down variant renders dashed */
function dashFor(variants: BanditVariant[], i: number): string | undefined {
  const angle = variants[i].angle;
  const firstIdx = variants.findIndex((v) => v.angle === angle);
  return firstIdx === i ? undefined : "5 4";
}

function PosteriorChart({ variants }: { variants: BanditVariant[] }) {
  const curves = variants.map((v) => betaPdfPoints(v.alpha, v.beta, 61, X_MAX));
  const maxY = Math.max(...curves.flatMap((c) => c.map((p) => p.y)), 1e-9);
  const toPath = (pts: { x: number; y: number }[], close: boolean) => {
    const cmds = pts.map((p, i) => {
      const x = (p.x / X_MAX) * CHART_W;
      const y = CHART_H - 3 - (p.y / maxY) * (CHART_H - 10);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return close
      ? `${cmds.join(" ")} L ${CHART_W} ${CHART_H - 3} L 0 ${CHART_H - 3} Z`
      : cmds.join(" ");
  };

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="h-16 w-full">
      {[0.02, 0.04, 0.06].map((x) => (
        <line
          key={x}
          x1={(x / X_MAX) * CHART_W}
          y1={4}
          x2={(x / X_MAX) * CHART_W}
          y2={CHART_H - 3}
          stroke="var(--grid)"
          strokeWidth="1"
        />
      ))}
      <line x1={0} y1={CHART_H - 3} x2={CHART_W} y2={CHART_H - 3} stroke="var(--baseline)" strokeWidth="1" />
      {curves.map((pts, i) => (
        <g key={variants[i].creativeId}>
          <path d={toPath(pts, true)} fill={ANGLE_COLORS[variants[i].angle]} opacity="0.10" />
          <path
            d={toPath(pts, false)}
            fill="none"
            stroke={ANGLE_COLORS[variants[i].angle]}
            strokeWidth="2"
            strokeDasharray={dashFor(variants, i)}
          />
        </g>
      ))}
    </svg>
  );
}

function BudgetBar({ variants }: { variants: BanditVariant[] }) {
  const total = variants.reduce((s, v) => s + v.budgetShare, 0) || 1;
  return (
    <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
      {variants.map((v) => (
        <div
          key={v.creativeId}
          className="h-2 rounded-full transition-all duration-300"
          style={{
            width: `${Math.max(1.5, (v.budgetShare / total) * 100)}%`,
            background: ANGLE_COLORS[v.angle],
          }}
        />
      ))}
    </div>
  );
}

function SegmentBandit({
  segment,
  view,
  cycle,
  prior,
}: {
  segment: Segment;
  view: BanditView;
  cycle: Cycle;
  prior?: BanditView;
}) {
  const st = view.states.find((s: BanditState) => s.segment === segment);
  if (!st || st.variants.length === 0) return null;
  const leader = st.variants.reduce((a, b) => (posteriorMean(b) > posteriorMean(a) ? b : a));
  const conf = view.confidence[segment];
  const conv = view.convergedAt[segment];
  const priorConv = prior?.convergedAt[segment];

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink2">
          {SEGMENT_LABELS[segment]}
        </span>
        <span className="num text-[10px] text-muted">
          {conv !== undefined ? (
            <span className="text-accent">locked @ t{conv}</span>
          ) : (
            `t${st.tick}`
          )}
          {cycle === 2 && conv !== undefined && priorConv !== undefined && conv < priorConv && (
            <span className="ml-1 text-good">({priorConv - conv} ticks faster)</span>
          )}
        </span>
      </div>
      <PosteriorChart variants={st.variants} />
      <BudgetBar variants={st.variants} />
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
        {st.variants.map((v, i) => (
          <span key={v.creativeId} className="flex items-center gap-1 text-[9.5px] text-muted">
            <span
              className="inline-block h-1.5 w-3 rounded-full"
              style={{
                background: ANGLE_COLORS[v.angle],
                opacity: dashFor(st.variants, i) ? 0.55 : 1,
              }}
            />
            {ANGLE_LABELS[v.angle]}
            {dashFor(st.variants, i) && "′"}{" "}
            <span className="num">{fmtPct(posteriorMean(v))}</span>
          </span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-ink">
        winning: <span style={{ color: ANGLE_COLORS[leader.angle as Angle] }}>{ANGLE_LABELS[leader.angle]}</span>
        {conf !== undefined && (
          <span className="num text-ink2"> · {Math.round(conf * 100)}% confident</span>
        )}
      </p>
    </div>
  );
}

/** three independent bandits — the personalization claim, live */
export function TestPanel({ state }: { state: RunState }) {
  const cycle: Cycle = state.bandit[2] ? 2 : 1;
  const view = state.bandit[cycle];
  const r1 = state.reports[1];
  const r2 = state.reports[2];
  const c2live = state.bandit[2];

  const avgObserved = (v: BanditView | undefined) => {
    if (!v) return 0;
    let imp = 0;
    let clicks = 0;
    for (const s of v.states)
      for (const va of s.variants) {
        imp += va.impressions;
        clicks += va.clicks;
      }
    return imp > 0 ? clicks / imp : 0;
  };
  const c2Ctr = r2?.avgCtr ?? avgObserved(c2live);

  return (
    <Panel
      state={state}
      stage="test"
      title={`Test — per-segment Thompson bandits (cycle ${cycle})`}
      right={
        view && (
          <span className="num">
            tick {Math.min(view.ticks, FLIGHT_ROUNDS)}/{FLIGHT_ROUNDS} · batch 250/seg
          </span>
        )
      }
    >
      {!view ? (
        <EmptyHint>
          each segment gets its own bandit — impressions flow toward whichever angle its market
          actually clicks
        </EmptyHint>
      ) : (
        <div className="flex h-full flex-col gap-2">
          {(r1 || c2live) && (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {r1 && (
                <span className="num rounded bg-surface2 px-1.5 py-0.5 text-ink2">
                  C1 avg CTR {fmtPct(r1.avgCtr, 2)}
                </span>
              )}
              {cycle === 2 && c2Ctr > 0 && (
                <>
                  <span className="num rounded bg-surface2 px-1.5 py-0.5 text-ink">
                    C2 avg CTR {fmtPct(c2Ctr, 2)}
                  </span>
                  {r1 && (
                    <span
                      key={r2 ? "final" : "live"}
                      className={`num rounded px-1.5 py-0.5 font-semibold ${
                        c2Ctr >= r1.avgCtr ? "bg-accent/15 text-accent" : "bg-surface2 text-ink2"
                      } ${r2 ? "pop" : ""}`}
                    >
                      {fmtDelta(r1.avgCtr, c2Ctr)} vs cycle 1 · equal spend
                    </span>
                  )}
                </>
              )}
            </div>
          )}
          <div className="grid min-h-0 flex-1 grid-cols-3 gap-3">
            {SEGMENTS.map((seg) => (
              <SegmentBandit
                key={seg}
                segment={seg}
                view={view}
                cycle={cycle}
                prior={cycle === 2 ? state.bandit[1] : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
