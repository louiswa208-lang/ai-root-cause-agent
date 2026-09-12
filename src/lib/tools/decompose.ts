import type { DataRow } from "../data/types";
import { computeMetric, METRIC_DEF_BY_ID, matchRow, type RowFilter } from "../data/metrics";

/** 对数平均：L(a,b) = (a−b) / (ln a − ln b)，a=b 时取 a。 */
export function logMean(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  if (a === b) return a;
  return (a - b) / (Math.log(a) - Math.log(b));
}

export interface FactorContribution {
  factorId: string;
  label: string;
  layer: string;
  base: number;
  current: number;
  contribution: number;
  share: number;
}

export interface DecompositionResult {
  metricId: string;
  method: "LMDI";
  baseValue: number;
  currentValue: number;
  delta: number;
  factors: FactorContribution[];
  dominantFactor: string;
  reconciliation: number;
  note: string;
}

/**
 * run_lmdi Tool：乘法恒等式的加法形式 LMDI 分解。
 * 项目三诊断树主干：M01 = M09 × M12 × M16 × M18。
 * ΔY(Xk) = L(Y1,Y0) × ln(Xk1 / Xk0)，各因子之和严格等于 ΔY（Ang 2005 / 2015）。
 */
export function runLmdi(
  rows: DataRow[],
  metricId: string,
  baseDates: string[],
  currentDate: string,
  filter?: RowFilter,
): DecompositionResult {
  const def = METRIC_DEF_BY_ID[metricId];
  if (!def?.factors?.length) throw new Error(metricId + " 没有定义乘法恒等式，无法做 LMDI 分解");
  const baseRows = rows.filter((r) => baseDates.includes(r.date) && matchRow(r, filter));
  const curRows = rows.filter((r) => r.date === currentDate && matchRow(r, filter));
  const scale = baseDates.length || 1;

  const factorValues = def.factors.map((fid) => {
    const fdef = METRIC_DEF_BY_ID[fid];
    const b = computeMetric(baseRows, fid);
    const c = computeMetric(curRows, fid);
    return {
      fid,
      label: fdef.label,
      layer: fdef.layer,
      base: fdef.kind === "count" ? b.value / scale : b.value,
      current: c.value,
    };
  });

  const y0 = factorValues.reduce((acc, f) => acc * f.base, 1);
  const y1 = factorValues.reduce((acc, f) => acc * f.current, 1);
  const delta = y1 - y0;
  const L = logMean(y1, y0);
  const factors: FactorContribution[] = factorValues.map((f) => {
    const contribution = f.base > 0 && f.current > 0 ? L * Math.log(f.current / f.base) : 0;
    return {
      factorId: f.fid,
      label: f.label,
      layer: f.layer,
      base: f.base,
      current: f.current,
      contribution,
      share: delta === 0 ? 0 : contribution / delta,
    };
  });
  const dominant = [...factors].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0];
  const sum = factors.reduce((a, f) => a + f.contribution, 0);
  return {
    metricId,
    method: "LMDI",
    baseValue: y0,
    currentValue: y1,
    delta,
    factors,
    dominantFactor: dominant?.factorId ?? "",
    reconciliation: sum - delta,
    note: "加法形式 LMDI，各因子贡献之和与总变化对账一致（Ang 2005 / 2015）",
  };
}

export interface SegmentContribution {
  segment: string;
  base: number;
  current: number;
  delta: number;
  share: number;
}

export interface AdditiveResult {
  dimension: string;
  metricId: string;
  delta: number;
  segments: SegmentContribution[];
}

/** run_additive_contribution Tool：加法关系下，各细分对总变化的贡献。 */
export function runAdditiveContribution(
  rows: DataRow[],
  metricId: string,
  dimension: string,
  baseDates: string[],
  currentDate: string,
  filter?: RowFilter,
): AdditiveResult {
  const def = METRIC_DEF_BY_ID[metricId];
  if (def.kind !== "count") throw new Error(metricId + " 是比率型指标，跨细分不可直接相加，应改用结构—效率分解");
  const segments = new Set<string>();
  for (const r of rows) if (matchRow(r, filter)) segments.add(r.dims[dimension] ?? "");
  const scale = baseDates.length || 1;
  const out: SegmentContribution[] = [];
  for (const seg of segments) {
    const segFilter = { ...(filter ?? {}), [dimension]: seg };
    const baseRows = rows.filter((r) => baseDates.includes(r.date) && matchRow(r, segFilter));
    const curRows = rows.filter((r) => r.date === currentDate && matchRow(r, segFilter));
    const base = computeMetric(baseRows, metricId).value / scale;
    const current = computeMetric(curRows, metricId).value;
    out.push({ segment: seg, base, current, delta: current - base, share: 0 });
  }
  const delta = out.reduce((a, s) => a + s.delta, 0);
  for (const s of out) s.share = delta === 0 ? 0 : s.delta / delta;
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { dimension, metricId, delta, segments: out };
}

export interface StructureEfficiencyResult {
  dimension: string;
  metricId: string;
  baseOverall: number;
  currentOverall: number;
  delta: number;
  structureEffect: number;
  efficiencyEffect: number;
  interactionEffect: number;
  dominant: "结构效应" | "效率效应" | "交互项";
  segments: { segment: string; w0: number; w1: number; r0: number; r1: number; structure: number; efficiency: number }[];
  note: string;
}

/**
 * run_structure_efficiency Tool：比率型指标的结构—效率分解（shift-share，Dunn 1960）。
 * 整体率 = Σ 占比 × 细分率；ΔY = Σ(w1−w0)r0 [结构] + Σ w0(r1−r0) [效率] + 交互项。
 */
export function runStructureEfficiency(
  rows: DataRow[],
  metricId: string,
  dimension: string,
  baseDates: string[],
  currentDate: string,
  filter?: RowFilter,
): StructureEfficiencyResult {
  const def = METRIC_DEF_BY_ID[metricId];
  if (def.kind !== "ratio") throw new Error(metricId + " 不是比率型指标，无法做结构—效率分解");
  const segments = new Set<string>();
  for (const r of rows) if (matchRow(r, filter)) segments.add(r.dims[dimension] ?? "");
  const baseRows = rows.filter((r) => baseDates.includes(r.date) && matchRow(r, filter));
  const curRows = rows.filter((r) => r.date === currentDate && matchRow(r, filter));
  const baseTotalDen = computeMetric(baseRows, metricId).denominator ?? 0;
  const curTotalDen = computeMetric(curRows, metricId).denominator ?? 0;
  const detail = [...segments].map((seg) => {
    const b = baseRows.filter((r) => r.dims[dimension] === seg);
    const c = curRows.filter((r) => r.dims[dimension] === seg);
    const bv = computeMetric(b, metricId);
    const cv = computeMetric(c, metricId);
    const w0 = baseTotalDen === 0 ? 0 : (bv.denominator ?? 0) / baseTotalDen;
    const w1 = curTotalDen === 0 ? 0 : (cv.denominator ?? 0) / curTotalDen;
    return { segment: seg, w0, w1, r0: bv.value, r1: cv.value, structure: (w1 - w0) * bv.value, efficiency: w0 * (cv.value - bv.value) };
  });
  const structureEffect = detail.reduce((a, d) => a + d.structure, 0);
  const efficiencyEffect = detail.reduce((a, d) => a + d.efficiency, 0);
  const baseOverall = computeMetric(baseRows, metricId).value;
  const currentOverall = computeMetric(curRows, metricId).value;
  const delta = currentOverall - baseOverall;
  const interactionEffect = delta - structureEffect - efficiencyEffect;
  const ranked: [StructureEfficiencyResult["dominant"], number][] = [
    ["结构效应", Math.abs(structureEffect)],
    ["效率效应", Math.abs(efficiencyEffect)],
    ["交互项", Math.abs(interactionEffect)],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  detail.sort((a, b) => Math.abs(b.structure + b.efficiency) - Math.abs(a.structure + a.efficiency));
  return {
    dimension,
    metricId,
    baseOverall,
    currentOverall,
    delta,
    structureEffect,
    efficiencyEffect,
    interactionEffect,
    dominant: ranked[0][0],
    segments: detail,
    note: "shift-share 结构—效率分解（Dunn 1960）；结构效应为主说明是占比迁移而不是效率变化",
  };
}
