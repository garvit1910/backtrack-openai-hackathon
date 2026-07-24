import type { Angle, Segment, Stage } from "@/components/contract";

/** fixed angle→hue assignment (validated dataviz palette) — never reordered per chart */
export const ANGLE_COLORS: Record<Angle, string> = {
  reliability: "var(--angle-reliability)",
  speed: "var(--angle-speed)",
  value: "var(--angle-value)",
  fit_guidance: "var(--angle-fit_guidance)",
  service: "var(--angle-service)",
  trust: "var(--angle-trust)",
};

export const ANGLE_LABELS: Record<Angle, string> = {
  reliability: "reliability",
  speed: "speed",
  value: "value",
  fit_guidance: "fit guidance",
  service: "service",
  trust: "trust",
};

export const SEGMENT_LABELS: Record<Segment, string> = {
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};

export const STAGE_LABELS: Record<Stage, string> = {
  ingest: "Ingest",
  understand: "Understand",
  research: "Research",
  compile: "Compile",
  create: "Create",
  test: "Test",
  learn: "Learn",
  ship: "Ship",
};
