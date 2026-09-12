/** 前端用到的、由 /api/diagnose 流式下发的数据形状。 */

export interface AnomalyLike {
  metricId: string;
  value: number;
  baseline: number;
  deviation: number;
  direction: string;
  series: { date: string; value: number }[];
  reason: string;
  isAnomaly: boolean;
}

export interface FactorLike {
  factorId: string;
  label: string;
  layer: string;
  contribution: number;
  share: number;
}

export interface DecompositionLike {
  delta: number;
  factors: FactorLike[];
  dominantFactor: string;
  reconciliation: number;
}

export interface DrillDimension {
  dimension: string;
  summary: string;
  topSegments: { segment: string; delta: number; share: number }[];
  structureShare?: number;
}

export interface DrillLike {
  topDimension?: DrillDimension;
  dimensions: DrillDimension[];
}

export interface EventLike {
  id: string;
  date: string;
  type: string;
  name: string;
  layer?: string;
  scopeDim?: string;
  scopeValue?: string;
  ramp?: string;
  platform?: string;
  source?: string;
  matchReason: string;
  scopeMatch: string;
  strength: "强匹配" | "中等匹配" | "弱匹配" | "仅时间接近";
  score: number;
  dayOffset: number;
  criteria: {
    business: { ok: boolean; text: string };
    layer: { ok: boolean; text: string };
    scope: { ok: boolean; text: string };
    time: { ok: boolean; text: string };
  };
}

export interface CapabilityReportLike {
  readiness: number;
  supported: { id: string; name: string; stage: string }[];
  unsupported: { id: string; name: string; stage: string; missing: string[] }[];
  missingFields: string[];
  hasEvents: boolean;
  dimensionCount: number;
  blockingForMetric: string[];
}

export interface AgentDecisionLike {
  node: string;
  stage: string;
  found: string;
  why: string;
  next: string;
}

export interface LlmInfo {
  enabled: boolean;
  provider?: string | null;
  model: string | null;
}

export const LAYER_ORDER = ["内容层", "互动层", "搜索层", "交易层"] as const;
export type LayerName = (typeof LAYER_ORDER)[number];
