import { RELATIONS } from "../knowledge/project3";
import type { CandidateCause } from "./causes";
import type { CompareGroupsResult } from "./compare";
import type { MatchedEvent } from "./events";

export type ConfidenceLevel = "confirmed" | "highly_related" | "candidate";

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  confirmed: "确认",
  highly_related: "高度相关",
  candidate: "候选",
};

export interface EvidenceItem {
  kind:
    | "事件匹配"
    | "无兼容事件"
    | "事件时间吻合"
    | "影响范围一致"
    | "对照验证"
    | "机制关系"
    | "指标同步变化"
    | "缺少对照";
  detail: string;
  strength: "强" | "中" | "弱";
  relatedCauseId?: string;
}

export interface ConfidenceAssessment {
  causeId: string;
  causeName: string;
  level: ConfidenceLevel;
  levelLabel: string;
  reasons: string[];
  missing: string[];
  /** 该因果链路是否属于产品假设关系：未经实验最高只能到候选 */
  hypothesisCapped: boolean;
  /** 证据分（0~100），由四项确定性判定加总，用于卡片展示与排序 */
  score: number;
  scoreBreakdown: { label: string; got: number; max: number; hit: boolean }[];
  /** 建议的下一步验证方式与对接方，来自原因库 */
  recommendedValidation: string;
  partner: string;
}

/** 判断候选原因涉及的关系类型是否为产品假设（项目三诊断树 X 系列）。 */
function isHypothesisOnly(causeId: string, metricId: string): boolean {
  if (causeId !== "Y08" && causeId !== "Y18") return false;
  // 互动层原因指向搜索 / 内容指标时，属于产品假设关系
  return RELATIONS.some((r) => r.type === "产品假设关系" && r.to.includes(metricId));
}

/**
 * calculate_confidence Tool：按项目三第八章的置信度分级判定。
 * 确认：有随机实验、holdout、随机灰度或回滚证据，且影响范围与原因作用范围一致。
 * 高度相关：时间、影响范围与机制三者吻合，主要替代解释已排除，但缺少对照证据。
 * 候选：只有时间吻合或指标同期变化；产品假设关系在经过实验验证前最高到此级。
 */
export function calculateConfidence(
  cause: CandidateCause,
  evidence: EvidenceItem[],
  metricId: string,
  options: { events: MatchedEvent[]; comparison?: CompareGroupsResult },
): ConfidenceAssessment {
  const reasons: string[] = [];
  const missing: string[] = [];
  const linkedEvents = options.events.filter((e) => cause.linkedEventIds.includes(e.id));
  const timeMatch = linkedEvents.length > 0;
  const scopeMatch = linkedEvents.some((e) => e.scopeMatch === "完全吻合");
  const hasControl = Boolean(options.comparison?.hasControl && Math.abs(options.comparison.did) > 0.02);
  const isExperimentEvidence =
    hasControl &&
    (linkedEvents.some((e) => e.type === "实验" || e.type === "发版") || cause.causeId === "Y07" || cause.causeId === "Y04");
  const hypothesisCapped = isHypothesisOnly(cause.causeId, metricId);

  if (timeMatch) reasons.push("事件时间吻合：" + linkedEvents.map((e) => e.name).join("、"));
  else missing.push("没有找到时间吻合的事件记录");
  if (scopeMatch) reasons.push("影响范围与事件作用范围一致");
  else missing.push("影响范围与事件作用范围未完全对上");
  if (options.comparison) {
    if (hasControl) reasons.push("对照验证：" + options.comparison.summary);
    else missing.push("缺少可用对照组，只能做前后对比");
  } else {
    missing.push("尚未执行对照验证");
  }
  // 只采纳与该原因相关（或通用）的证据，避免把别的原因的事件写成本原因的支撑
  for (const e of evidence) {
    if (e.strength !== "强") continue;
    if (e.relatedCauseId && e.relatedCauseId !== cause.causeId) continue;
    reasons.push(e.detail);
  }

  const mechanism = evidence.some((e) => e.kind === "机制关系") || cause.matchBreakdown.business >= 1;
  let level: ConfidenceLevel = "candidate";
  if (isExperimentEvidence && scopeMatch) level = "confirmed";
  else if (timeMatch && scopeMatch && (hasControl || mechanism)) level = "highly_related";
  if (hypothesisCapped && level !== "confirmed") {
    level = "candidate";
    missing.push("互动 → 搜索属于产品假设关系，未经实验验证最高只能是候选");
  }
  const scoreBreakdown = [
    { label: "业务类型兼容的事件", got: timeMatch ? 40 : 0, max: 40, hit: timeMatch },
    { label: "影响范围一致", got: scopeMatch ? 25 : 0, max: 25, hit: scopeMatch },
    { label: "对照验证", got: hasControl ? 25 : 0, max: 25, hit: hasControl },
    { label: "机制关系可解释", got: mechanism ? 10 : 0, max: 10, hit: mechanism },
  ];
  const score = scoreBreakdown.reduce((n, x) => n + x.got, 0);

  return {
    causeId: cause.causeId,
    causeName: cause.name,
    level,
    levelLabel: CONFIDENCE_LABEL[level],
    // 验证循环会多轮累积证据，这里按内容去重
    reasons: [...new Set(reasons)],
    missing: [...new Set(missing)],
    hypothesisCapped,
    score,
    scoreBreakdown,
    recommendedValidation: cause.verifyMethod,
    partner: cause.partner,
  };
}

/** 证据是否已经足够：决定 LangGraph 是否继续进入验证循环。 */
export function evidenceSufficient(assessments: ConfidenceAssessment[]): boolean {
  if (!assessments.length) return false;
  const best = assessments[0];
  if (best.level === "confirmed") return true;
  if (best.level === "highly_related" && best.missing.every((m) => !m.includes("尚未执行对照验证"))) return true;
  return false;
}
