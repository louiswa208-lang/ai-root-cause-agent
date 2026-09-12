"use client";

import { BarChart3, CalendarCheck, Crosshair, FlaskConical, Layers, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { METRIC_DEF_BY_ID, formatMetricDelta, formatPercentChange, formatPp, formatShare } from "@/lib/data/metrics";
import type { AnomalyLike, DecompositionLike, DrillLike, EventLike } from "./types";
import { Card } from "./ui";

interface ComparisonLike {
  dimension: string;
  affectedValues: string[];
  controlValues: string[];
  affectedChange: number;
  controlChange: number;
  did: number;
  hasControl: boolean;
}

interface LayerFindingLike {
  headline: string;
  details: string[];
}

interface EvidenceCard {
  kind: string;
  icon: ReactNode;
  facts: { label: string; value: string; tone?: "down" | "up" }[];
  note: string;
}

const DIM_LABEL: Record<string, string> = {
  scene: "分发场景",
  category: "一级品类",
  author_tier: "作者层级",
  app_version: "端与版本",
};

/**
 * 核心证据：回答「为什么 Agent 会得出这个结论」。
 * 全部由已经算好的 State 结果拼装，不做任何新的计算或推断。
 */
export function KeyEvidence({
  metricId,
  anomaly,
  decomposition,
  layerFinding,
  drill,
  events,
  comparison,
}: {
  metricId?: string;
  anomaly: AnomalyLike | null;
  decomposition: DecompositionLike | null;
  layerFinding: LayerFindingLike | null;
  drill: DrillLike | null;
  events: EventLike[];
  comparison: ComparisonLike | null;
}) {
  const cards: EvidenceCard[] = [];
  const mid = metricId ?? anomaly?.metricId ?? "M01";

  // 01 异常本身
  if (anomaly) {
    cards.push({
      kind: "异常确认",
      icon: <Sparkles size={14} />,
      facts: [
        { label: "相对偏离", value: formatPercentChange(anomaly.deviation), tone: anomaly.deviation < 0 ? "down" : "up" },
        { label: "绝对变化", value: formatMetricDelta(anomaly.metricId, anomaly.value - anomaly.baseline) },
      ],
      note: "偏离超过阈值，且同 weekday 基线对比稳定，波动成立而非日常抖动。",
    });
  }

  // 02 指标拆解
  if (decomposition) {
    const dom = decomposition.factors.find((f) => f.factorId === decomposition.dominantFactor);
    if (dom) {
      cards.push({
        kind: "指标拆解",
        icon: <BarChart3 size={14} />,
        facts: [
          { label: dom.label, value: formatShare(dom.share) },
          { label: "绝对贡献", value: formatMetricDelta(mid, dom.contribution), tone: dom.contribution < 0 ? "down" : "up" },
        ],
        note: `变化主要由${dom.label}驱动，其余因子贡献有限或起反向对冲作用。`,
      });
    }
  }

  // 03 分层诊断
  if (layerFinding?.details?.length) {
    cards.push({
      kind: "分层诊断",
      icon: <Layers size={14} />,
      facts: layerFinding.details.slice(0, 2).map((d) => ({ label: "", value: d })),
      note: layerFinding.headline,
    });
  }

  // 04 影响范围
  const topSeg = drill?.topDimension?.topSegments?.[0];
  if (topSeg && drill?.topDimension) {
    cards.push({
      kind: "影响范围",
      icon: <Crosshair size={14} />,
      facts: [
        { label: DIM_LABEL[drill.topDimension.dimension] ?? drill.topDimension.dimension, value: topSeg.segment },
        { label: "贡献占比", value: formatShare(topSeg.share) },
      ],
      note: "波动高度集中在该细分，不属于全局性大盘变化。",
    });
  }

  // 05 事件匹配
  const ev = events.find((e) => e.strength !== "仅时间接近");
  if (ev) {
    cards.push({
      kind: "事件匹配",
      icon: <CalendarCheck size={14} />,
      facts: [
        { label: ev.date, value: ev.name },
        { label: "匹配强度", value: ev.strength },
      ],
      note: "事件类型、首发层与影响范围三项均与异常吻合，不是仅靠时间接近。",
    });
  } else if (events.length) {
    cards.push({
      kind: "事件匹配",
      icon: <CalendarCheck size={14} />,
      facts: [{ label: "窗口内事件", value: `${events.length} 条，均为「仅时间接近」` }],
      note: "没有业务类型兼容的事件，时间接近本身不作为正向证据。",
    });
  }

  // 06 对照验证
  if (comparison) {
    cards.push({
      kind: "对照验证",
      icon: <FlaskConical size={14} />,
      facts: comparison.hasControl
        ? [
            {
              label: "受影响组",
              value: formatPercentChange(comparison.affectedChange),
              tone: comparison.affectedChange < 0 ? "down" : "up",
            },
            {
              label: "对照组",
              value: formatPercentChange(comparison.controlChange),
              tone: comparison.controlChange < 0 ? "down" : "up",
            },
            { label: "双重差分", value: formatPp(comparison.did), tone: comparison.did < 0 ? "down" : "up" },
          ]
        : [{ label: "说明", value: "数据中没有可用对照组，只做了前后对比" }],
      note: comparison.hasControl
        ? "两组走势明显分化，排除了「大盘同期普涨普跌」这一替代解释。"
        : "缺少对照组，证据强度受限，结论不会给到「确认」级别。",
    });
  }

  if (!cards.length) return null;

  return (
    <Card
      icon={<Sparkles size={16} />}
      title="核心证据"
      hint="这里汇总支撑上述结论最关键的几条证据。完整的图表与逐条判定在下方各区块展开。"
      extra={<span className="t-caption whitespace-nowrap">{cards.length} 条</span>}
      bodyClassName="card-pad"
    >
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c, i) => (
          <article key={c.kind + i} className="card-quiet flex flex-col p-3.5">
            <div className="flex items-center gap-1.5">
              <span className="num text-[11px] font-semibold text-[var(--ink-3)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[var(--blue)]">{c.icon}</span>
              <span className="text-[12px] font-semibold">{c.kind}</span>
            </div>

            <dl className="mt-2 flex flex-1 flex-col gap-1">
              {c.facts.map((f, j) => (
                <div key={j} className="flex items-baseline gap-2">
                  {f.label && <dt className="t-caption shrink-0">{f.label}</dt>}
                  <dd
                    className={
                      "num text-[13px] font-semibold leading-[1.5] " +
                      (f.tone === "down"
                        ? "text-[var(--red)]"
                        : f.tone === "up"
                          ? "text-[var(--green)]"
                          : "text-[var(--ink)]")
                    }
                  >
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="t-caption mt-2 border-t border-[var(--line)] pt-2 leading-[1.6]">{c.note}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}
