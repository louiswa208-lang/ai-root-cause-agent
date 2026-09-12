import { CAUSES, CAUSE_BY_ID, type Cause } from "../knowledge/project3";
import type { MatchedEvent } from "./events";

export interface CandidateCause {
  causeId: string;
  name: string;
  category: string;
  layer: string;
  /** 命中的数据线索 */
  signals: string[];
  /** 业务类型兼容、可作为正向证据的事件 */
  linkedEventIds: string[];
  /** 时间接近但业务类型不兼容、被显式排除的事件（用于解释「为什么不算证据」） */
  rejectedEvents: { eventId: string; name: string; reason: string }[];
  needEvidence: string;
  verifyMethod: string;
  excludeCondition: string;
  partner: string;
  score: number;
  /** 匹配依据拆解，前端可直接展示 */
  matchBreakdown: { business: number; layer: number; scope: number; time: number };
}

/**
 * 原因 ↔ 事件兼容矩阵。
 *
 * 这是「时间接近就算证据」这一错误的修复点：只有业务类型兼容的事件，
 * 才可能成为某个原因的正向证据；层级与影响范围再做加权；时间只作最后的微调。
 *
 * types  ：该原因可以接受的事件类型
 * layers ：事件必须首先影响的链路层（留空表示不限；事件为「跨层」时一律接受）
 */
const CAUSE_EVENT_COMPAT: Record<string, { types: string[]; layers?: string[] }> = {
  // 数据类：只接受数据 / 技术侧事件
  Y01: { types: ["口径与埋点", "发版", "故障"] },
  Y02: { types: ["口径与埋点"] },
  Y03: { types: ["口径与埋点", "故障"] },
  // 技术类
  Y04: { types: ["发版"] },
  Y05: { types: ["故障"] },
  // 策略与产品类：按首先影响的层区分，避免互动层事件带出搜索类原因
  Y06: { types: ["策略", "实验"], layers: ["内容层"] },
  Y07: { types: ["实验", "发版"] },
  Y08: { types: ["策略", "实验", "发版"], layers: ["互动层"] },
  Y09: { types: ["策略", "实验"], layers: ["搜索层"] },
  Y10: { types: ["策略", "实验"], layers: ["搜索层", "交易层"] },
  Y11: { types: ["治理动作", "策略"], layers: ["内容层"] },
  // 运营类：只接受运营 / 推送 / 投放，不接受搜索或互动策略
  Y12: { types: ["运营活动", "大促", "营销活动", "内容加热", "投放"] },
  Y13: { types: ["推送", "运营活动"], layers: ["内容层"] },
  Y14: { types: ["投放", "运营活动"] },
  // 内容与作者类
  Y15: { types: ["治理动作", "运营活动"], layers: ["内容层"] },
  Y16: { types: [] }, // 爆款 / 头部作者：由数据线索识别，没有对应事件类型
  Y17: { types: ["外部事件"] },
  Y18: { types: ["策略"], layers: ["互动层"] },
  // 商品与承接
  Y19: { types: ["运营活动", "大促"], layers: ["交易层"] },
  Y20: { types: ["故障", "发版", "策略"], layers: ["交易层"] },
  // 用户结构
  Y21: { types: ["投放", "运营活动"] },
  // 外部环境
  Y22: { types: [] },
  Y23: { types: ["外部事件"] },
  Y24: { types: [] },
};

/** 数据线索 → 原因编号（不依赖事件，纯粹由指标表现推出的候选）。 */
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

/** 判断某个事件能否作为该原因的正向证据。 */
export function isEventCompatible(causeId: string, event: MatchedEvent): { ok: boolean; reason: string } {
  const compat = CAUSE_EVENT_COMPAT[causeId];
  if (!compat) return { ok: false, reason: "该原因没有定义可接受的事件类型" };
  // 事件本身在本次分析中只是「时间接近」，对任何原因都不能算正向证据
  if (event.strength === "仅时间接近") {
    return { ok: false, reason: "该事件只是时间接近（" + event.matchReason + "），不构成匹配" };
  }
  if (!compat.types.length) return { ok: false, reason: "该原因依靠数据线索识别，不接受事件作为证据" };
  if (!compat.types.includes(event.type)) {
    return { ok: false, reason: "事件类型「" + event.type + "」与该原因不兼容（仅接受：" + compat.types.join(" / ") + "）" };
  }
  if (compat.layers && event.layer && event.layer !== "跨层" && !compat.layers.includes(event.layer)) {
    return { ok: false, reason: "事件首先影响「" + event.layer + "」，与该原因的作用层（" + compat.layers.join(" / ") + "）不符" };
  }
  return { ok: true, reason: "业务类型与作用层均兼容" };
}

/**
 * match_root_causes Tool：从项目三「原因—证据矩阵」中筛选候选原因。
 *
 * 打分优先级（高 → 低）：业务类型匹配 > 影响层匹配 > 影响范围匹配 > 时间接近。
 * 时间接近本身不构成匹配，必须先通过业务类型兼容性检查。
 */
export function matchRootCauses(input: MatchCauseInput): CandidateCause[] {
  interface Acc {
    business: number;
    layer: number;
    scope: number;
    time: number;
    signals: Set<string>;
    events: Set<string>;
    rejected: { eventId: string; name: string; reason: string }[];
  }
  const acc = new Map<string, Acc>();
  const get = (id: string): Acc => {
    const cur = acc.get(id) ?? { business: 0, layer: 0, scope: 0, time: 0, signals: new Set<string>(), events: new Set<string>(), rejected: [] };
    acc.set(id, cur);
    return cur;
  };

  // 1) 事件 → 原因：先做兼容性检查，不兼容的事件记录到 rejected，不参与打分
  for (const ev of input.events) {
    for (const causeId of Object.keys(CAUSE_EVENT_COMPAT)) {
      const check = isEventCompatible(causeId, ev);
      if (!check.ok) {
        // 只在该原因已被其他线索命中时记录排除理由，避免噪声
        if (acc.has(causeId) && ev.score >= 0.5) {
          get(causeId).rejected.push({ eventId: ev.id, name: ev.name, reason: check.reason });
        }
        continue;
      }
      const a = get(causeId);
      a.business += 1;
      a.events.add(ev.id);
      a.signals.add("事件：" + ev.name);
      if (ev.layer && ev.layer === input.layer) a.layer += 0.6;
      if (ev.scopeMatch === "完全吻合") a.scope += 0.4;
      else if (ev.scopeMatch === "全局") a.scope += 0.15;
      a.time += Math.max(0, 0.2 - ev.dayOffset * 0.05);
    }
  }

  // 2) 数据线索 → 原因
  for (const sig of input.signals) {
    for (const id of SIGNAL_TO_CAUSES[sig] ?? []) {
      const a = get(id);
      a.business += 0.5;
      a.signals.add(sig);
    }
  }

  // 3) 补记不兼容事件的排除理由（对已命中的原因）
  for (const ev of input.events) {
    for (const causeId of acc.keys()) {
      const check = isEventCompatible(causeId, ev);
      const a = acc.get(causeId)!;
      if (!check.ok && ev.score >= 0.5 && !a.rejected.some((r) => r.eventId === ev.id)) {
        a.rejected.push({ eventId: ev.id, name: ev.name, reason: check.reason });
      }
    }
  }

  const out: CandidateCause[] = [];
  for (const [id, a] of acc) {
    const c: Cause | undefined = CAUSE_BY_ID[id];
    if (!c) continue;
    const layerBonus = c.layer === input.layer ? 0.5 : c.layer === "跨层" ? 0.2 : -0.4;
    const score = a.business * 1.0 + a.layer + a.scope + a.time + layerBonus;
    if (score <= 0) continue;
    out.push({
      causeId: c.id,
      name: c.name,
      category: c.category,
      layer: c.layer,
      signals: [...a.signals],
      linkedEventIds: [...a.events],
      rejectedEvents: a.rejected.slice(0, 3),
      needEvidence: c.evidence,
      verifyMethod: c.verify,
      excludeCondition: c.exclude,
      partner: c.partner,
      score: Number(score.toFixed(3)),
      matchBreakdown: {
        business: Number(a.business.toFixed(2)),
        layer: Number((a.layer + layerBonus).toFixed(2)),
        scope: Number(a.scope.toFixed(2)),
        time: Number(a.time.toFixed(2)),
      },
    });
  }

  // 没有任何命中时，回落到该层的常见原因，并说明是回落
  if (!out.length) {
    for (const c of CAUSES.filter((x) => x.layer === input.layer).slice(0, 3)) {
      out.push({
        causeId: c.id,
        name: c.name,
        category: c.category,
        layer: c.layer,
        signals: ["按链路层回落匹配，未命中事件或数据线索"],
        linkedEventIds: [],
        rejectedEvents: [],
        needEvidence: c.evidence,
        verifyMethod: c.verify,
        excludeCondition: c.exclude,
        partner: c.partner,
        score: 0.2,
        matchBreakdown: { business: 0, layer: 0.2, scope: 0, time: 0 },
      });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}
