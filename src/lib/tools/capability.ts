import type { DatasetMetadata } from "../data/types";
import { METRIC_DEF_BY_ID } from "../data/metrics";

/**
 * 数据可分析性检查：不假设上传的数据一定包含所有字段。
 * 能分析多少就分析多少，缺什么明确说明，不让模型猜不存在的数据。
 */
export interface CapabilityItem {
  id: string;
  name: string;
  /** 需要的规范列名 */
  requires: string[];
  /** 是否需要维度列 */
  needsDimension?: boolean;
  /** 是否需要事件时间轴 */
  needsEvents?: boolean;
  /** 这一步在 S1~S7 中对应的阶段 */
  stage: string;
}

const CAPABILITIES: CapabilityItem[] = [
  { id: "anomaly", name: "异常识别与基线对比", requires: [], stage: "S1" },
  { id: "gmv_lmdi", name: "看后搜 GMV 四因子拆解", requires: ["effective_view_users", "search_users", "order_users", "gmv"], stage: "S3" },
  { id: "content", name: "内容层曝光与观看效率诊断", requires: ["exposure", "effective_view_users"], stage: "S3" },
  { id: "l1l2", name: "L1 / L2 搜索入口拆分", requires: ["l1_search_users", "l2_search_users"], stage: "S3" },
  { id: "sw_ctr", name: "搜索词点击率（M20）分析", requires: ["sw_impressions", "sw_clicks"], stage: "S3" },
  { id: "interaction", name: "互动层作者回复率（H02）诊断", requires: ["comments", "author_replies"], stage: "S3" },
  { id: "revisit", name: "被回复用户复访率（H03）验证", requires: ["replied_users", "replied_revisit_users"], stage: "S3" },
  { id: "drilldown", name: "维度下钻定位影响范围", requires: [], needsDimension: true, stage: "S4" },
  { id: "events", name: "事件时间轴匹配", requires: [], needsEvents: true, stage: "S5" },
  { id: "compare", name: "受影响 / 未受影响对照验证", requires: [], needsDimension: true, stage: "S6" },
];

const FIELD_LABEL: Record<string, string> = {
  exposure: "内容曝光量 exposure",
  effective_view_users: "有效播放人数 effective_view_users",
  search_users: "看后搜人数 search_users",
  l1_search_users: "L1 看后搜人数 l1_search_users",
  l2_search_users: "L2 看后搜人数 l2_search_users",
  order_users: "看后搜成交人数 order_users",
  gmv: "看后搜 GMV gmv",
  comments: "评论数 comments",
  comment_users: "评论用户数 comment_users",
  author_replies: "作者回复数 author_replies",
  replied_users: "被回复用户数 replied_users",
  replied_revisit_users: "被回复用户复访数 replied_revisit_users",
  sw_impressions: "搜索词曝光次数 sw_impressions",
  sw_clicks: "搜索词点击次数 sw_clicks",
};

export interface CapabilityReport {
  readiness: number;
  supported: { id: string; name: string; stage: string }[];
  unsupported: { id: string; name: string; stage: string; missing: string[] }[];
  missingFields: string[];
  hasEvents: boolean;
  dimensionCount: number;
  /** 本次问题所需但缺失的能力（按目标指标筛选） */
  blockingForMetric: string[];
}

/** 目标指标 → 诊断这个指标至少需要的能力。 */
const METRIC_REQUIRED_CAPS: Record<string, string[]> = {
  M01: ["gmv_lmdi"],
  M04: ["gmv_lmdi"],
  M16: ["gmv_lmdi"],
  M18: ["gmv_lmdi"],
  M10: [],
  M12: ["l1l2"],
  M20: ["sw_ctr"],
  H01: ["interaction"],
  H02: ["interaction"],
  H03: ["revisit"],
  I09: ["content"],
  M09: ["content"],
};

export function assessCapability(meta: DatasetMetadata, targetMetric?: string, eventCount = 0): CapabilityReport {
  const measures = new Set(meta.measures);
  const supported: CapabilityReport["supported"] = [];
  const unsupported: CapabilityReport["unsupported"] = [];
  const missingFields = new Set<string>();

  for (const cap of CAPABILITIES) {
    const missing: string[] = [];
    for (const f of cap.requires) if (!measures.has(f)) missing.push(FIELD_LABEL[f] ?? f);
    if (cap.needsDimension && meta.dimensions.length === 0) missing.push("至少一个维度列（如 场景 / 品类 / 版本）");
    if (cap.needsEvents && eventCount === 0) missing.push("事件时间轴（events CSV）");
    if (missing.length) {
      unsupported.push({ id: cap.id, name: cap.name, stage: cap.stage, missing });
      for (const f of cap.requires) if (!measures.has(f)) missingFields.add(FIELD_LABEL[f] ?? f);
    } else {
      supported.push({ id: cap.id, name: cap.name, stage: cap.stage });
    }
  }

  const readiness = Math.round((supported.length / CAPABILITIES.length) * 100);
  const needed = targetMetric ? METRIC_REQUIRED_CAPS[targetMetric] ?? [] : [];
  const blockingForMetric = needed.filter((id) => unsupported.some((u) => u.id === id));

  return {
    readiness,
    supported,
    unsupported,
    missingFields: [...missingFields],
    hasEvents: eventCount > 0,
    dimensionCount: meta.dimensions.length,
    blockingForMetric,
  };
}

/** 某个指标是否可以直接计算。 */
export function metricComputable(meta: DatasetMetadata, metricId: string): boolean {
  const def = METRIC_DEF_BY_ID[metricId];
  if (!def) return false;
  return meta.availableMetrics.includes(metricId);
}
