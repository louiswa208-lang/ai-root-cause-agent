import type { DataRow } from "../data/types";
import { buildSeries, computeMetric, METRIC_DEF_BY_ID, type RowFilter } from "../data/metrics";

export interface AnomalyParams {
  /** 基线取近 N 个同 weekday（项目三第四章：同 weekday 历史同期，示例参数） */
  baselineWeeks: number;
  /** 相对偏离阈值（示例参数，不代表实际业务阈值） */
  relativeThreshold: number;
  /** 稳健 z 阈值；NIST 引用 Iglewicz 与 Hoaglin 的建议值 3.5 */
  robustZThreshold: number;
}

export const DEFAULT_ANOMALY_PARAMS: AnomalyParams = {
  baselineWeeks: 8,
  relativeThreshold: 0.05,
  robustZThreshold: 3.5,
};

export interface AnomalyResult {
  metricId: string;
  date: string;
  value: number;
  baseline: number;
  baselineMethod: string;
  baselineDates: string[];
  sampleSize: number;
  deviation: number;
  mad: number;
  robustZ: number | null;
  isAnomaly: boolean;
  direction: "上升" | "下降" | "持平";
  params: AnomalyParams;
  series: { date: string; value: number }[];
  reason: string;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** MAD：中位数绝对偏差（稳健尺度估计）。 */
export function mad(xs: number[]): number {
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

/**
 * detect_anomaly Tool：同 weekday 历史同期基线 + 相对偏离 + 稳健 z 分数
 * （修正 z = 0.6745 × (x − 中位数) ÷ MAD，NIST/SEMATECH 1.3.5.17）。
 */
export function detectAnomaly(
  rows: DataRow[],
  metricId: string,
  targetDate: string,
  filter?: RowFilter,
  params: AnomalyParams = DEFAULT_ANOMALY_PARAMS,
): AnomalyResult {
  const series = buildSeries(rows, metricId, filter);
  const target = series.find((s) => s.date === targetDate);
  const value = target?.value ?? 0;
  const targetDow = new Date(targetDate + "T00:00:00Z").getUTCDay();
  const history = series
    .filter((s) => s.date < targetDate && new Date(s.date + "T00:00:00Z").getUTCDay() === targetDow)
    .slice(-params.baselineWeeks);
  const baseValues = history.map((h) => h.value);
  const baseline = median(baseValues);
  const scale = mad(baseValues);
  const deviation = baseline === 0 ? 0 : (value - baseline) / baseline;
  const robustZ = scale === 0 ? null : (0.6745 * (value - baseline)) / scale;
  const overRelative = Math.abs(deviation) >= params.relativeThreshold;
  const overZ = robustZ !== null && Math.abs(robustZ) >= params.robustZThreshold;
  const isAnomaly = baseValues.length >= 3 && (overRelative || overZ);
  const direction = deviation > 0.001 ? "上升" : deviation < -0.001 ? "下降" : "持平";
  const reason = [
    "基线取近 " + baseValues.length + " 个同 weekday 的中位数",
    "相对偏离 " + (deviation * 100).toFixed(1) + "%（阈值 " + (params.relativeThreshold * 100).toFixed(0) + "%）",
    robustZ === null ? "历史 MAD 为 0，稳健 z 不可用" : "稳健 z=" + robustZ.toFixed(2) + "（阈值 " + params.robustZThreshold + "）",
  ].join("；");
  return {
    metricId,
    date: targetDate,
    value,
    baseline,
    baselineMethod: "同 weekday 历史同期中位数",
    baselineDates: history.map((h) => h.date),
    sampleSize: baseValues.length,
    deviation,
    mad: scale,
    robustZ,
    isAnomaly,
    direction,
    params,
    series: series.map((s) => ({ date: s.date, value: s.value })),
    reason,
  };
}

export interface DataQualityIssue {
  kind: "missing_rows" | "zero_denominator" | "coverage_drop" | "missing_metric";
  message: string;
  blocking: boolean;
}

/** S1 的数据真实性检查：缺行、覆盖骤降、分母为 0。 */
export function checkDataQuality(rows: DataRow[], metricId: string, targetDate: string): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const def = METRIC_DEF_BY_ID[metricId];
  const byDate = new Map<string, DataRow[]>();
  for (const r of rows) {
    const list = byDate.get(r.date);
    if (list) list.push(r);
    else byDate.set(r.date, [r]);
  }
  const dayRows = byDate.get(targetDate) ?? [];
  if (!dayRows.length) {
    issues.push({ kind: "missing_rows", message: "数据中没有 " + targetDate + " 的记录。", blocking: true });
    return issues;
  }
  const counts = [...byDate.entries()].filter(([d]) => d < targetDate).slice(-14).map(([, rs]) => rs.length);
  const avg = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  if (avg > 0 && dayRows.length < avg * 0.6) {
    issues.push({
      kind: "coverage_drop",
      message:
        targetDate + " 的明细行数为 " + dayRows.length + "，明显低于前 14 天均值 " + avg.toFixed(0) +
        "，应先按数据问题排查（项目三 Y01 埋点 / Y03 数据延迟）。",
      blocking: true,
    });
  }
  if (def?.kind === "ratio") {
    const v = computeMetric(dayRows, metricId);
    if (!v.denominator) {
      issues.push({ kind: "zero_denominator", message: metricId + " 的分母在 " + targetDate + " 为 0，比率无法计算。", blocking: true });
    }
  }
  return issues;
}
