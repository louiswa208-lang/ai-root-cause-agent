import type { DataRow } from "../data/types";
import { METRIC_DEF_BY_ID, type RowFilter } from "../data/metrics";
import { runAdditiveContribution, runStructureEfficiency } from "./decompose";

export interface DimensionFinding {
  dimension: string;
  method: "加法贡献" | "结构—效率分解";
  /** 该维度是否解释了主要变化 */
  concentration: number;
  topSegments: { segment: string; delta: number; share: number; note?: string }[];
  structureShare?: number;
  efficiencyShare?: number;
  summary: string;
}

export interface DrillDownResult {
  metricId: string;
  dimensions: DimensionFinding[];
  topDimension?: DimensionFinding;
  /** 累计贡献阈值（示例参数，可配置） */
  cumulativeThreshold: number;
}

/**
 * drill_down_dimension Tool：按维度定位影响范围。
 * count 型指标用加法贡献；ratio 型指标用结构—效率分解，避免把结构变化误判成效率变化。
 */
export function drillDownDimensions(
  rows: DataRow[],
  metricId: string,
  dimensions: string[],
  baseDates: string[],
  currentDate: string,
  filter?: RowFilter,
  cumulativeThreshold = 0.8,
): DrillDownResult {
  const def = METRIC_DEF_BY_ID[metricId];
  const findings: DimensionFinding[] = [];
  for (const dim of dimensions) {
    try {
      if (def.kind === "count") {
        const res = runAdditiveContribution(rows, metricId, dim, baseDates, currentDate, filter);
        const same = res.segments.filter((s) => Math.sign(s.delta) === Math.sign(res.delta) && s.delta !== 0);
        const top: { segment: string; delta: number; share: number }[] = [];
        let cum = 0;
        for (const s of same) {
          top.push({ segment: s.segment, delta: s.delta, share: s.share });
          cum += s.share;
          if (cum >= cumulativeThreshold) break;
        }
        findings.push({
          dimension: dim,
          method: "加法贡献",
          concentration: top.length ? cum / Math.max(top.length, 1) : 0,
          topSegments: top,
          summary:
            top.length === 0
              ? "该维度上没有同向的主要贡献细分"
              : top.map((t) => t.segment + " 贡献 " + (t.share * 100).toFixed(0) + "%").join("，"),
        });
      } else {
        const res = runStructureEfficiency(rows, metricId, dim, baseDates, currentDate, filter);
        const total = Math.abs(res.structureEffect) + Math.abs(res.efficiencyEffect) + Math.abs(res.interactionEffect) || 1;
        const top = res.segments
          .filter((s) => Math.sign(s.structure + s.efficiency) === Math.sign(res.delta) && s.structure + s.efficiency !== 0)
          .slice(0, 3)
          .map((s) => ({
            segment: s.segment,
            delta: s.structure + s.efficiency,
            share: res.delta === 0 ? 0 : (s.structure + s.efficiency) / res.delta,
            note: Math.abs(s.structure) > Math.abs(s.efficiency) ? "占比迁移为主" : "细分率变化为主",
          }));
        findings.push({
          dimension: dim,
          method: "结构—效率分解",
          concentration: Math.max(Math.abs(res.structureEffect), Math.abs(res.efficiencyEffect)) / total,
          topSegments: top,
          structureShare: res.delta === 0 ? 0 : res.structureEffect / res.delta,
          efficiencyShare: res.delta === 0 ? 0 : res.efficiencyEffect / res.delta,
          summary:
            res.dominant +
            "为主（结构 " + ((res.delta === 0 ? 0 : res.structureEffect / res.delta) * 100).toFixed(0) +
            "% / 效率 " + ((res.delta === 0 ? 0 : res.efficiencyEffect / res.delta) * 100).toFixed(0) + "%）",
        });
      }
    } catch {
      // 该维度不可用时跳过
    }
  }
  const ranked = [...findings].sort((a, b) => {
    const aTop = a.topSegments[0]?.share ?? 0;
    const bTop = b.topSegments[0]?.share ?? 0;
    return Math.abs(bTop) - Math.abs(aTop);
  });
  return { metricId, dimensions: findings, topDimension: ranked[0], cumulativeThreshold };
}

/** 互动层专用：比率指标的分子 / 分母拆解（项目三场景 C 的第一步）。 */
export interface NumeratorDenominatorResult {
  metricId: string;
  numeratorLabel: string;
  denominatorLabel: string;
  numeratorBase: number;
  numeratorCurrent: number;
  denominatorBase: number;
  denominatorCurrent: number;
  numeratorChange: number;
  denominatorChange: number;
  driver: "分子下降" | "分母上升" | "分子上升" | "分母下降" | "两者同向";
  summary: string;
}

export function analyzeNumeratorDenominator(
  rows: DataRow[],
  metricId: string,
  baseDates: string[],
  currentDate: string,
  filter?: RowFilter,
): NumeratorDenominatorResult {
  const def = METRIC_DEF_BY_ID[metricId];
  if (def.kind !== "ratio") throw new Error(metricId + " 不是比率型指标");
  const scale = baseDates.length || 1;
  const sum = (dates: string[] | null, col: string) =>
    rows
      .filter((r) => (dates ? dates.includes(r.date) : r.date === currentDate))
      .filter((r) => !filter || Object.entries(filter).every(([k, v]) => r.dims[k] === v))
      .reduce((a, r) => a + (r.measures[col] ?? 0), 0);
  const nB = sum(baseDates, def.numerator!) / scale;
  const nC = sum(null, def.numerator!);
  const dB = sum(baseDates, def.denominator!) / scale;
  const dC = sum(null, def.denominator!);
  const nChange = dB === 0 ? 0 : (nC - nB) / (nB || 1);
  const dChange = dB === 0 ? 0 : (dC - dB) / dB;
  let driver: NumeratorDenominatorResult["driver"];
  if (Math.abs(nChange) >= Math.abs(dChange)) driver = nChange < 0 ? "分子下降" : "分子上升";
  else driver = dChange > 0 ? "分母上升" : "分母下降";
  if (Math.sign(nChange) === Math.sign(dChange) && Math.abs(Math.abs(nChange) - Math.abs(dChange)) < 0.02) driver = "两者同向";
  const label: Record<string, string> = {
    comments: "评论总数",
    author_replies: "作者回复数",
    comment_users: "评论用户数",
    effective_view_users: "有效播放人数",
    replied_users: "被回复用户数",
    replied_revisit_users: "被回复后复访用户数",
    search_users: "看后搜人数",
    order_users: "看后搜成交人数",
    gmv: "看后搜 GMV",
    sw_clicks: "搜索词点击次数",
    sw_impressions: "搜索词曝光次数",
    exposure: "内容曝光量",
  };
  return {
    metricId,
    numeratorLabel: label[def.numerator!] ?? def.numerator!,
    denominatorLabel: label[def.denominator!] ?? def.denominator!,
    numeratorBase: nB,
    numeratorCurrent: nC,
    denominatorBase: dB,
    denominatorCurrent: dC,
    numeratorChange: nChange,
    denominatorChange: dChange,
    driver,
    summary:
      (label[def.numerator!] ?? def.numerator!) + " 变化 " + (nChange * 100).toFixed(1) + "%，" +
      (label[def.denominator!] ?? def.denominator!) + " 变化 " + (dChange * 100).toFixed(1) + "%，判定为" + driver,
  };
}
