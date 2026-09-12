import type { EventRecord } from "../data/types";

export type MatchStrength = "强匹配" | "中等匹配" | "弱匹配" | "仅时间接近";

export interface MatchedEvent extends EventRecord {
  dayOffset: number;
  scopeMatch: "完全吻合" | "部分吻合" | "范围不符" | "全局";
  score: number;
  strength: MatchStrength;
  matchReason: string;
  /** 四个维度的匹配判定，前端逐条展示 */
  criteria: {
    business: { ok: boolean; text: string };
    layer: { ok: boolean; text: string };
    scope: { ok: boolean; text: string };
    time: { ok: boolean; text: string };
  };
}

export interface EventMatchInput {
  targetDate: string;
  /** 影响范围：维度 → 受影响取值 */
  affectedScope: Record<string, string[]>;
  layer?: string;
  /** 本次分析的目标指标，用于判断事件是否可能影响它 */
  targetMetric?: string;
  windowDays?: number;
}

/** 事件类型通常首先影响的链路层（用于业务类型匹配判定）。 */
const EVENT_TYPE_LAYERS: Record<string, string[]> = {
  发版: ["内容层", "互动层", "搜索层", "交易层", "跨层"],
  实验: ["内容层", "互动层", "搜索层", "交易层", "跨层"],
  策略: ["内容层", "互动层", "搜索层", "交易层"],
  运营活动: ["内容层", "交易层"],
  大促: ["交易层"],
  营销活动: ["内容层", "交易层"],
  内容加热: ["内容层"],
  投放: ["内容层", "交易层"],
  推送: ["内容层"],
  治理动作: ["内容层", "互动层"],
  故障: ["内容层", "互动层", "搜索层", "交易层", "跨层"],
  外部事件: ["内容层", "跨层"],
  口径与埋点: ["跨层"],
};

function dayDiff(a: string, b: string): number {
  return Math.round((new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime()) / 86400000);
}

/**
 * search_event_timeline Tool：在事件时间轴中筛选可能解释本次波动的事件。
 *
 * 判定优先级：业务类型匹配 > 影响层匹配 > 影响范围匹配 > 时间接近。
 * **时间接近本身不构成匹配**——只满足时间条件的事件被标为「仅时间接近」，
 * 不能作为归因的正向证据，只在时间轴上列出供人工排查。
 */
export function searchEventTimeline(events: EventRecord[], input: EventMatchInput): MatchedEvent[] {
  const windowDays = input.windowDays ?? 3;
  const matched: MatchedEvent[] = [];

  for (const ev of events) {
    if (!ev.date) continue;
    const offset = dayDiff(input.targetDate, ev.date);
    if (offset < 0 || offset > windowDays) continue;

    // 1) 业务类型匹配：事件类型是否可能影响当前诊断的链路层 / 指标
    const typeLayers = EVENT_TYPE_LAYERS[ev.type] ?? [];
    const declaredMetrics = (ev.metrics ?? "").split(/[,，、\s]+/).filter(Boolean);
    const metricHit = Boolean(input.targetMetric && declaredMetrics.includes(input.targetMetric));
    const businessOk = !input.layer || typeLayers.length === 0 || typeLayers.includes(input.layer) || typeLayers.includes("跨层") || metricHit;
    const businessText = metricHit
      ? "事件声明影响指标 " + input.targetMetric
      : businessOk
        ? "事件类型「" + ev.type + "」可能影响" + (input.layer ?? "该链路")
        : "事件类型「" + ev.type + "」通常不影响" + input.layer;

    // 2) 影响层匹配
    const layerOk = !input.layer || !ev.layer || ev.layer === input.layer || ev.layer === "跨层";
    const layerText = ev.layer
      ? ev.layer === input.layer
        ? "首先影响" + ev.layer + "，与首发层一致"
        : ev.layer === "跨层"
          ? "跨层事件"
          : "首先影响" + ev.layer + "，与首发层（" + input.layer + "）不同"
      : "事件未标注影响层";

    // 3) 影响范围匹配
    let scopeMatch: MatchedEvent["scopeMatch"] = "全局";
    let scopeScore = 0.5;
    let scopeText = "全量生效，无法用范围区分";
    if (ev.scopeDim && ev.scopeValue) {
      const affected = input.affectedScope[ev.scopeDim] ?? [];
      if (affected.includes(ev.scopeValue)) {
        scopeMatch = "完全吻合";
        scopeScore = 1;
        scopeText = "事件范围 " + ev.scopeDim + "=" + ev.scopeValue + " 与实际受影响范围一致";
      } else if (affected.length === 0) {
        scopeMatch = "部分吻合";
        scopeScore = 0.4;
        scopeText = "事件范围为 " + ev.scopeDim + "=" + ev.scopeValue + "，本次未下钻到该维度";
      } else {
        scopeMatch = "范围不符";
        scopeScore = 0.05;
        scopeText = "事件范围 " + ev.scopeDim + "=" + ev.scopeValue + "，实际受影响的是 " + affected.join("、");
      }
    }

    // 4) 时间接近（权重最低）
    const timeScore = 1 - offset / (windowDays + 1);
    const timeText = offset === 0 ? "与异常同日" : offset + " 天前发生";

    const businessScore = businessOk ? 1 : 0;
    const layerScore = layerOk ? (ev.layer === input.layer ? 1 : 0.6) : 0.1;
    const score = Number((businessScore * 0.45 + layerScore * 0.25 + scopeScore * 0.2 + timeScore * 0.1).toFixed(3));

    let strength: MatchStrength;
    if (!businessOk || !layerOk || scopeMatch === "范围不符") strength = "仅时间接近";
    else if (businessOk && layerScore === 1 && scopeMatch === "完全吻合") strength = "强匹配";
    else if (businessOk && (layerScore === 1 || scopeMatch === "完全吻合")) strength = "中等匹配";
    else strength = "弱匹配";

    matched.push({
      ...ev,
      dayOffset: offset,
      scopeMatch,
      score,
      strength,
      matchReason: strength === "仅时间接近"
        ? timeText + "，但" + (!businessOk ? businessText : !layerOk ? layerText : scopeText) + "，不作为正向证据"
        : timeText + "；" + layerText + "；" + scopeText,
      criteria: {
        business: { ok: businessOk, text: businessText },
        layer: { ok: layerOk, text: layerText },
        scope: { ok: scopeMatch === "完全吻合" || scopeMatch === "全局", text: scopeText },
        time: { ok: true, text: timeText },
      },
    });
  }

  return matched.sort((a, b) => b.score - a.score);
}
