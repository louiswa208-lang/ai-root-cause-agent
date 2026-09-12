import type { DataRow } from "../data/types";
import { computeMetric, formatMetricValue, formatMetricDelta, formatPercentChange, formatPp, matchRow } from "../data/metrics";

export interface CompareGroupsInput {
  metricId: string;
  dimension: string;
  /** 受影响的取值（实验组 / 受影响版本 / 受影响品类） */
  affectedValues: string[];
  /** 事件发生日（含当日为「后」） */
  eventDate: string;
  /** 前后各取多少天 */
  windowDays?: number;
  targetDate: string;
}

export interface CompareGroupsResult {
  metricId: string;
  dimension: string;
  affectedValues: string[];
  controlValues: string[];
  affectedBefore: number;
  affectedAfter: number;
  controlBefore: number;
  controlAfter: number;
  affectedChange: number;
  controlChange: number;
  /** 双重差分：受影响组变化 − 未受影响组变化 */
  did: number;
  hasControl: boolean;
  summary: string;
  method: "受影响与未受影响维度对比（双重差分）";
}

function datesBetween(all: string[], from: string, to: string): string[] {
  return all.filter((d) => d >= from && d <= to);
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * compare_groups Tool：受影响 vs 未受影响维度、事件前 vs 事件后的双重差分对比。
 * 满足平行趋势假设时可接近确认（Card & Krueger 1994）；否则只作为高度相关的旁证。
 */
export function compareGroups(rows: DataRow[], input: CompareGroupsInput): CompareGroupsResult {
  const windowDays = input.windowDays ?? 7;
  const allDates = [...new Set(rows.map((r) => r.date))].sort();
  const beforeDates = datesBetween(allDates, shiftDate(input.eventDate, -windowDays), shiftDate(input.eventDate, -1));
  const afterDates = datesBetween(allDates, input.eventDate, input.targetDate);
  const allValues = [...new Set(rows.map((r) => r.dims[input.dimension]).filter(Boolean))];
  const controlValues = allValues.filter((v) => !input.affectedValues.includes(v));

  const agg = (dates: string[], values: string[]) => {
    const subset = rows.filter((r) => dates.includes(r.date) && values.includes(r.dims[input.dimension]));
    return computeMetric(subset, input.metricId).value / (dates.length || 1);
  };
  // 比率型指标按合并口径计算，不除以天数
  const aggRatio = (dates: string[], values: string[]) => {
    const subset = rows.filter((r) => dates.includes(r.date) && values.includes(r.dims[input.dimension]));
    return computeMetric(subset, input.metricId).value;
  };
  const isRatio = computeMetric(rows.slice(0, 1), input.metricId).denominator !== undefined;
  const calc = isRatio ? aggRatio : agg;

  const affectedBefore = calc(beforeDates, input.affectedValues);
  const affectedAfter = calc(afterDates, input.affectedValues);
  const controlBefore = controlValues.length ? calc(beforeDates, controlValues) : 0;
  const controlAfter = controlValues.length ? calc(afterDates, controlValues) : 0;
  const affectedChange = affectedBefore === 0 ? 0 : (affectedAfter - affectedBefore) / affectedBefore;
  const controlChange = controlBefore === 0 ? 0 : (controlAfter - controlBefore) / controlBefore;
  const did = affectedChange - controlChange;
  const hasControl = controlValues.length > 0;
  const affectedDelta = affectedAfter - affectedBefore;
  const summary = hasControl
    ? "受影响组（" + input.affectedValues.join("、") + "）" +
      formatMetricValue(input.metricId, affectedBefore) + " → " + formatMetricValue(input.metricId, affectedAfter) +
      "（" + formatMetricDelta(input.metricId, affectedDelta) + "，" + formatPercentChange(affectedChange) + "）；" +
      "对照组（" + controlValues.join("、") + "）" + formatPercentChange(controlChange) + "；" +
      "双重差分（两组相对变化之差）" + formatPp(did)
    : "数据中没有未受影响的对照组，只能给出受影响组前后对比：" +
      formatMetricValue(input.metricId, affectedBefore) + " → " + formatMetricValue(input.metricId, affectedAfter) +
      "（" + formatMetricDelta(input.metricId, affectedDelta) + "，" + formatPercentChange(affectedChange) + "）";
  return {
    metricId: input.metricId,
    dimension: input.dimension,
    affectedValues: input.affectedValues,
    controlValues,
    affectedBefore,
    affectedAfter,
    controlBefore,
    controlAfter,
    affectedChange,
    controlChange,
    did,
    hasControl,
    summary,
    method: "受影响与未受影响维度对比（双重差分）",
  };
}

/** 事件前后对比（无对照组时的中断时间序列式比较）。 */
export function compareBeforeAfter(
  rows: DataRow[],
  metricId: string,
  eventDate: string,
  targetDate: string,
  windowDays = 7,
  filter?: Record<string, string>,
): { before: number; after: number; change: number; summary: string } {
  const allDates = [...new Set(rows.map((r) => r.date))].sort();
  const beforeDates = datesBetween(allDates, shiftDate(eventDate, -windowDays), shiftDate(eventDate, -1));
  const afterDates = datesBetween(allDates, eventDate, targetDate);
  const pick = (dates: string[]) => rows.filter((r) => dates.includes(r.date) && matchRow(r, filter));
  const before = computeMetric(pick(beforeDates), metricId).value;
  const after = computeMetric(pick(afterDates), metricId).value;
  const change = before === 0 ? 0 : (after - before) / before;
  return {
    before,
    after,
    change,
    summary: "事件前 " + formatMetricValue(metricId, before) + " → 事件后 " + formatMetricValue(metricId, after) +
      "（" + formatMetricDelta(metricId, after - before) + "，" + formatPercentChange(change) + "）",
  };
}
