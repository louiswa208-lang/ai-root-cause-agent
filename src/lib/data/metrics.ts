import type { DataRow, MetricDef } from "./types";

/**
 * 指标注册表。口径沿用项目一（M 系列）、项目二（H 系列）与项目三（I 系列），
 * 这里只负责把口径映射到数据列，不重新定义指标。
 */
export const METRIC_DEFS: MetricDef[] = [
  { id: "I09", label: "内容曝光量", layer: "内容层", kind: "count", column: "exposure", unit: "次" },
  { id: "M09", label: "有效播放人数", layer: "内容层", kind: "count", column: "effective_view_users", unit: "人" },
  { id: "I21", label: "曝光→有效观看效率", layer: "内容层", kind: "ratio", numerator: "effective_view_users", denominator: "exposure" },
  { id: "H01", label: "评论率", layer: "互动层", kind: "ratio", numerator: "comment_users", denominator: "effective_view_users" },
  { id: "H02", label: "作者回复率", layer: "互动层", kind: "ratio", numerator: "author_replies", denominator: "comments" },
  { id: "H03", label: "被回复用户复访率", layer: "互动层", kind: "ratio", numerator: "replied_revisit_users", denominator: "replied_users" },
  { id: "M10", label: "看后搜人数", layer: "搜索层", kind: "count", column: "search_users", unit: "人" },
  { id: "M12", label: "看后搜率", layer: "搜索层", kind: "ratio", numerator: "search_users", denominator: "effective_view_users" },
  { id: "M20", label: "内容搜索词点击率", layer: "搜索层", kind: "ratio", numerator: "sw_clicks", denominator: "sw_impressions" },
  { id: "L1", label: "L1 强引导看后搜人数", layer: "搜索层", kind: "count", column: "l1_search_users", unit: "人" },
  { id: "L2", label: "L2 即时主动看后搜人数", layer: "搜索层", kind: "count", column: "l2_search_users", unit: "人" },
  { id: "M04", label: "看后搜成交人数", layer: "交易层", kind: "count", column: "order_users", unit: "人" },
  { id: "M16", label: "看后搜成交转化率", layer: "交易层", kind: "ratio", numerator: "order_users", denominator: "search_users" },
  { id: "M18", label: "看后搜客单价", layer: "交易层", kind: "ratio", numerator: "gmv", denominator: "order_users", unit: "元" },
  { id: "M01", label: "看后搜 GMV", layer: "交易层", kind: "count", column: "gmv", unit: "元", factors: ["M09", "M12", "M16", "M18"] },
];

export const METRIC_DEF_BY_ID: Record<string, MetricDef> = Object.fromEntries(METRIC_DEFS.map((m) => [m.id, m]));

/** 指标别名：用于自然语言解析（中文名 / 口语说法 → 指标编号）。 */
export const METRIC_ALIASES: Record<string, string[]> = {
  M01: ["看后搜gmv", "gmv", "成交金额", "交易额", "看后搜成交金额"],
  M04: ["看后搜成交人数", "成交人数", "下单人数", "购买人数"],
  M16: ["看后搜成交转化率", "成交转化率", "转化率"],
  M18: ["看后搜客单价", "客单价", "客单"],
  M10: ["看后搜人数", "搜索人数"],
  M12: ["看后搜率", "搜索率"],
  M20: ["内容搜索词点击率", "搜索词点击率", "出词点击率"],
  M09: ["有效播放人数", "有效观看", "有效观看人数", "播放人数"],
  I09: ["内容曝光量", "曝光量", "曝光"],
  I21: ["曝光→有效观看效率", "曝光到有效观看", "观看效率"],
  H01: ["评论率"],
  H02: ["作者回复率", "回复率"],
  H03: ["被回复用户复访率", "复访率"],
  L1: ["l1", "强引导看后搜"],
  L2: ["l2", "即时主动看后搜"],
};

export interface MetricValue {
  metricId: string;
  value: number;
  numerator?: number;
  denominator?: number;
}

export type RowFilter = Partial<Record<string, string>>;

export function matchRow(row: DataRow, filter?: RowFilter): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([dim, val]) => val === undefined || row.dims[dim] === val);
}

function sumColumn(rows: DataRow[], column: string): number {
  let total = 0;
  for (const r of rows) total += r.measures[column] ?? 0;
  return total;
}

/** 在给定行集合上计算一个指标（比率型按「分子合计 ÷ 分母合计」，不做行级平均）。 */
export function computeMetric(rows: DataRow[], metricId: string): MetricValue {
  const def = METRIC_DEF_BY_ID[metricId];
  if (!def) throw new Error(`未知指标：${metricId}`);
  if (def.kind === "count") {
    return { metricId, value: sumColumn(rows, def.column!) };
  }
  const numerator = sumColumn(rows, def.numerator!);
  const denominator = sumColumn(rows, def.denominator!);
  return { metricId, value: denominator === 0 ? 0 : numerator / denominator, numerator, denominator };
}

/** 指标在数据集中是否可算：所需列都存在。 */
export function metricAvailable(measures: string[], metricId: string): boolean {
  const def = METRIC_DEF_BY_ID[metricId];
  if (!def) return false;
  const need = def.kind === "count" ? [def.column!] : [def.numerator!, def.denominator!];
  return need.every((c) => measures.includes(c));
}

/** 按日期聚合成时间序列。 */
export function buildSeries(rows: DataRow[], metricId: string, filter?: RowFilter): { date: string; value: number; numerator?: number; denominator?: number }[] {
  const byDate = new Map<string, DataRow[]>();
  for (const r of rows) {
    if (!matchRow(r, filter)) continue;
    const list = byDate.get(r.date);
    if (list) list.push(r);
    else byDate.set(r.date, [r]);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, rs]) => {
      const v = computeMetric(rs, metricId);
      return { date, value: v.value, numerator: v.numerator, denominator: v.denominator };
    });
}

/** 指标的展示单位：比率型为百分比，其余取注册表里的单位。 */
export function metricUnit(metricId: string): string {
  const def = METRIC_DEF_BY_ID[metricId];
  if (!def) return "";
  if (def.kind === "ratio" && def.unit !== "元") return "%";
  return def.unit ?? "";
}

/** 指标绝对值。所有数值一律带单位，禁止输出裸数字。 */
export function formatMetricValue(metricId: string, value: number): string {
  const def = METRIC_DEF_BY_ID[metricId];
  if (!def) return String(value);
  if (def.kind === "ratio" && def.unit !== "元") {
    return `${(value * 100).toFixed(2)}%`;
  }
  if (def.unit === "元") return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 1 })} 元`;
  const num = value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  return def.unit ? `${num} ${def.unit}` : num;
}

/**
 * 指标的「绝对变化量」。
 * 比率型指标的变化用百分点（pp），计数/金额型用原单位，均带正负号。
 * 例：−5.8pp / −58,200 元 / −1,204 人
 */
export function formatMetricDelta(metricId: string, delta: number): string {
  const def = METRIC_DEF_BY_ID[metricId];
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const abs = Math.abs(delta);
  if (!def) return `${sign}${abs}`;
  if (def.kind === "ratio" && def.unit !== "元") {
    return `${sign}${(abs * 100).toFixed(2)}pp`;
  }
  const num = abs.toLocaleString("zh-CN", { maximumFractionDigits: def.unit === "元" ? 1 : 0 });
  return def.unit ? `${sign}${num} ${def.unit}` : `${sign}${num}`;
}

/** 相对变化（比例 → 百分比），带正负号。例：−18.6% */
export function formatPercentChange(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return "—";
  const sign = ratio > 0 ? "+" : ratio < 0 ? "−" : "";
  return `${sign}${(Math.abs(ratio) * 100).toFixed(digits)}%`;
}

/** 百分点差值（两个比率相减的结果），带正负号。例：−5.8pp */
export function formatPp(diff: number, digits = 2): string {
  if (!Number.isFinite(diff)) return "—";
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  return `${sign}${(Math.abs(diff) * 100).toFixed(digits)}pp`;
}

/** 贡献占比（可能超过 100%，此时由前端补充解释）。 */
export function formatShare(share: number, digits = 1): string {
  if (!Number.isFinite(share)) return "—";
  const sign = share < 0 ? "−" : "";
  return `${sign}${(Math.abs(share) * 100).toFixed(digits)}%`;
}
