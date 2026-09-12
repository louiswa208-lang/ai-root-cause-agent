import { CAUSES, CAUSE_BY_ID, type Cause } from "../knowledge/project3";
import type { MatchedEvent } from "./events";

export interface CandidateCause {
  causeId: string;
  name: string;
  category: string;
  layer: string;
  /** 命中的线索 */
  signals: string[];
  linkedEventIds: string[];
  needEvidence: string;
  verifyMethod: string;
  excludeCondition: string;
  partner: string;
  score: number;
}

/** 事件类型 → 项目三原因编号（原因只能从原因库来，不允许模型自由生成）。 */
const EVENT_TYPE_TO_CAUSES: Record<string, string[]> = {
  发版: ["Y04"],
  实验: ["Y07"],
  策略: ["Y06", "Y09", "Y10", "Y08"],
  运营活动: ["Y12"],
  治理动作: ["Y11"],
  故障: ["Y05"],
  外部事件: ["Y23", "Y22"],
  口径与埋点: ["Y01", "Y02"],
  推送: ["Y13"],
};

/** 分析信号 → 原因编号。 */
const SIGNAL_TO_CAUSES: Record<string, string[]> = {
  数据覆盖异常: ["Y01", "Y03"],
  结构效应为主: ["Y21", "Y19"],
  供给下降: ["Y15", "Y11"],
  作者集中: ["Y16", "Y18"],
  版本集中: ["Y04", "Y01"],
  单场景集中: ["Y06", "Y13"],
  客单价变化: ["Y19", "Y12"],
  成交转化下降: ["Y10", "Y19", "Y20"],
  搜索入口效率下降: ["Y09"],
  评论供给变化: ["Y16", "Y17"],
  作者回复行为变化: ["Y18", "Y08"],
  热点: ["Y17"],
};

export interface MatchCauseInput {
  layer: string;
  signals: string[];
  events: MatchedEvent[];
}

/**
 * match_root_causes Tool：从项目三「原因—证据矩阵」中按层级、信号与事件筛选候选原因。
 * 不允许凭空生成原因；每条候选都带回需要的证据与验证方法。
 */
export function matchRootCauses(input: MatchCauseInput): CandidateCause[] {
  const scores = new Map<string, { score: number; signals: Set<string>; events: Set<string> }>();
  const bump = (id: string, delta: number, signal?: string, eventId?: string) => {
    const cur = scores.get(id) ?? { score: 0, signals: new Set<string>(), events: new Set<string>() };
    cur.score += delta;
    if (signal) cur.signals.add(signal);
    if (eventId) cur.events.add(eventId);
    scores.set(id, cur);
  };

  for (const ev of input.events) {
    for (const id of EVENT_TYPE_TO_CAUSES[ev.type] ?? []) {
      // 事件本身标了首先影响的链路层时，只保留该层或跨层的原因，避免把互动层事件带出搜索/推荐类原因
      const cause = CAUSE_BY_ID[id];
      if (ev.layer && cause && cause.layer !== "跨层" && cause.layer !== ev.layer) continue;
      bump(id, 0.5 + ev.score * 0.5, "事件：" + ev.name, ev.id);
    }
  }
  for (const sig of input.signals) {
    for (const id of SIGNAL_TO_CAUSES[sig] ?? []) bump(id, 0.6, sig);
  }
  // 层级匹配：首先影响该层或跨层的原因加权
  const out: CandidateCause[] = [];
  for (const [id, s] of scores) {
    const c: Cause | undefined = CAUSE_BY_ID[id];
    if (!c) continue;
    const layerBonus = c.layer === input.layer ? 0.5 : c.layer === "跨层" ? 0.2 : -0.3;
    out.push({
      causeId: c.id,
      name: c.name,
      category: c.category,
      layer: c.layer,
      signals: [...s.signals],
      linkedEventIds: [...s.events],
      needEvidence: c.evidence,
      verifyMethod: c.verify,
      excludeCondition: c.exclude,
      partner: c.partner,
      score: Number((s.score + layerBonus).toFixed(3)),
    });
  }
  // 没有任何命中时，回落到该层的常见原因，提示需要补充事件记录
  if (!out.length) {
    for (const c of CAUSES.filter((x) => x.layer === input.layer).slice(0, 3)) {
      out.push({
        causeId: c.id,
        name: c.name,
        category: c.category,
        layer: c.layer,
        signals: ["按链路层回落匹配，未命中事件"],
        linkedEventIds: [],
        needEvidence: c.evidence,
        verifyMethod: c.verify,
        excludeCondition: c.exclude,
        partner: c.partner,
        score: 0.2,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}
