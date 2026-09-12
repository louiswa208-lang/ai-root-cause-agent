import type { EventRecord } from "../data/types";

export interface MatchedEvent extends EventRecord {
  dayOffset: number;
  scopeMatch: "完全吻合" | "部分吻合" | "范围不符" | "全局";
  score: number;
  matchReason: string;
}

export interface EventMatchInput {
  targetDate: string;
  /** 影响范围：维度 → 受影响取值 */
  affectedScope: Record<string, string[]>;
  layer?: string;
  windowDays?: number;
}

function dayDiff(a: string, b: string): number {
  return Math.round((new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime()) / 86400000);
}

/**
 * search_event_timeline Tool：在事件时间轴中筛选时间与影响范围都吻合的事件。
 * 时间吻合只说明相关，不能作为因果结论（项目三 S5）。
 */
export function searchEventTimeline(events: EventRecord[], input: EventMatchInput): MatchedEvent[] {
  const windowDays = input.windowDays ?? 3;
  const matched: MatchedEvent[] = [];
  for (const ev of events) {
    if (!ev.date) continue;
    const offset = dayDiff(input.targetDate, ev.date);
    if (offset < 0 || offset > windowDays) continue;
    let scopeMatch: MatchedEvent["scopeMatch"] = "全局";
    let scopeScore = 0.5;
    if (ev.scopeDim && ev.scopeValue) {
      const affected = input.affectedScope[ev.scopeDim] ?? [];
      if (affected.includes(ev.scopeValue)) {
        scopeMatch = "完全吻合";
        scopeScore = 1;
      } else if (affected.length === 0) {
        scopeMatch = "部分吻合";
        scopeScore = 0.4;
      } else {
        scopeMatch = "范围不符";
        scopeScore = 0.1;
      }
    }
    const layerScore = input.layer && ev.layer ? (ev.layer === input.layer ? 1 : 0.4) : 0.6;
    const timeScore = 1 - offset / (windowDays + 1);
    const score = Number((timeScore * 0.4 + scopeScore * 0.4 + layerScore * 0.2).toFixed(3));
    matched.push({
      ...ev,
      dayOffset: offset,
      scopeMatch,
      score,
      matchReason:
        (offset === 0 ? "与异常同日" : offset + " 天前发生") +
        "；影响范围" + scopeMatch +
        (ev.layer ? "；首先影响" + ev.layer : ""),
    });
  }
  return matched.sort((a, b) => b.score - a.score);
}
