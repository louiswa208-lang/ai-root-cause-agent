"use client";

import { Crosshair, Gauge, Layers, Loader2, ShieldQuestion, Split, Target } from "lucide-react";
import type { FinalDiagnosis } from "@/lib/agent/state";
import { METRIC_DEF_BY_ID, formatMetricValue, formatPercentChange, formatShare } from "@/lib/data/metrics";
import type { AnomalyLike, DecompositionLike, DrillLike } from "./types";

const LEVEL_TONE: Record<string, string> = {
  确认: "chip-green",
  高度相关: "chip-blue",
  候选: "chip-amber",
};

/**
 * 归因结论 Hero：右侧第一屏的最高视觉权重区域。
 * 先回答「结论是什么」，再用四张关键卡回答「发生了什么 / 问题在哪 / 主因子是谁 / 最可信原因」。
 */
export function DiagnosisHero({
  diagnosis,
  anomaly,
  decomposition,
  drill,
  running,
  stage,
  stageTitle,
}: {
  diagnosis: FinalDiagnosis | null;
  anomaly: AnomalyLike | null;
  decomposition: DecompositionLike | null;
  drill: DrillLike | null;
  running: boolean;
  stage?: string;
  stageTitle: string;
}) {
  // 分析尚未完成：只展示已确认的中间发现，结论区标为 Pending
  if (running || !diagnosis) {
    return (
      <div className="hero p-5">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: "linear-gradient(135deg, var(--blue), var(--indigo))" }}
          >
            <Loader2 size={18} className="spin" />
          </span>
          <div className="min-w-0">
            <div className="t-section text-[17px]">Agent 正在诊断…</div>
            <div className="t-caption mt-0.5">
              当前阶段 {stage ?? "S1"} · {stageTitle}
            </div>
          </div>
          <span className="ml-auto hidden shrink-0 sm:block">
            <span className="chip">
              <ShieldQuestion size={13} />
              归因结论 Pending
            </span>
          </span>
        </div>

        {(anomaly || decomposition || drill) && (
          <div className="mt-4 border-t border-[var(--line)] pt-3">
            <div className="t-caption mb-2">当前已发现</div>
            <div className="flex flex-wrap gap-1.5">
              {anomaly && (
                <span className="chip chip-wrap chip-blue">
                  {METRIC_DEF_BY_ID[anomaly.metricId]?.label ?? anomaly.metricId} {formatPercentChange(anomaly.deviation)}
                </span>
              )}
              {decomposition && (
                <span className="chip chip-wrap chip-blue">
                  主贡献因子 {dominantLabel(decomposition)}（{formatShare(dominantShare(decomposition))}）
                </span>
              )}
              {drill?.topDimension?.topSegments?.[0] && (
                <span className="chip chip-wrap chip-blue">
                  影响集中在 {drill.topDimension.topSegments[0].segment}
                </span>
              )}
            </div>
            <div className="t-caption mt-2.5 leading-[1.65]">
              以上为中间结果。证据验证完成前不作为最终归因结论。
            </div>
          </div>
        )}
      </div>
    );
  }

  const top = diagnosis.causes[0];
  const metricDef = METRIC_DEF_BY_ID[diagnosis.metricId];
  const dir = anomaly ? (anomaly.deviation < 0 ? "↓" : "↑") : "";
  const devText = anomaly ? formatPercentChange(anomaly.deviation).replace(/^[+−]/, "") : "";

  return (
    <div>
      <div className="hero p-5">
        <div className="t-caption">
          {diagnosis.targetDate} · {diagnosis.metricLabel}（{diagnosis.metricId}）
        </div>

        <h1 className="t-metric mt-1.5 flex flex-wrap items-baseline gap-x-2">
          <span>{diagnosis.metricLabel}</span>
          {anomaly && (
            <span className={anomaly.deviation < 0 ? "text-[var(--red)]" : "text-[var(--green)]"}>
              {dir} {devText}
            </span>
          )}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Fact icon={<Layers size={14} />} label="首发层" value={diagnosis.layerLabel} />
          {top && <Fact icon={<Target size={14} />} label="首位原因" value={`${top.causeId} ${top.name}`} />}
          {top && (
            <span className="flex items-center gap-1.5">
              <span className="t-caption">置信度</span>
              <span className={"chip py-0 text-[11px] " + (LEVEL_TONE[top.confidence] ?? "chip")}>{top.confidence}</span>
            </span>
          )}
        </div>

        <p className="t-body mt-3.5 border-t border-[var(--line)] pt-3 text-[var(--ink-2)]">
          {shorten(diagnosis.narrative)}
        </p>
      </div>

      {/* 四张关键摘要卡 */}
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <KeyCard
          icon={<Gauge size={14} />}
          label="异常幅度"
          value={anomaly ? formatPercentChange(anomaly.deviation) : "—"}
          tone={anomaly && anomaly.deviation < 0 ? "down" : "up"}
          rows={
            anomaly
              ? [
                  ["当前值", formatMetricValue(anomaly.metricId, anomaly.value)],
                  ["基线", formatMetricValue(anomaly.metricId, anomaly.baseline)],
                ]
              : []
          }
        />
        <KeyCard
          icon={<Split size={14} />}
          label="主贡献因子"
          value={decomposition ? dominantLabel(decomposition) : diagnosis.layerLabel + "诊断"}
          rows={
            decomposition
              ? [["贡献占比", formatShare(dominantShare(decomposition))]]
              : [["说明", "该指标无乘法恒等式，未做因子拆解"]]
          }
        />
        <KeyCard
          icon={<Crosshair size={14} />}
          label="影响范围"
          value={drill?.topDimension?.topSegments?.[0]?.segment ?? "未收敛"}
          rows={
            drill?.topDimension?.topSegments?.[0]
              ? [["贡献占比", formatShare(drill.topDimension.topSegments[0].share)]]
              : [["说明", "波动未集中到单一细分"]]
          }
        />
        <KeyCard
          icon={<Target size={14} />}
          label="首位原因"
          value={top ? top.causeId : "—"}
          rows={
            top
              ? [
                  ["原因", top.name],
                  ["证据分", `${top.score}/100`],
                ]
              : [["说明", "未匹配到候选原因"]]
          }
          badge={top?.confidence}
          badgeTone={top ? LEVEL_TONE[top.confidence] : undefined}
        />
      </div>

      {metricDef?.unit === "元" && (
        <div className="t-caption mt-2">看后搜 GMV 为归因口径，不代表内容创造的增量。</div>
      )}
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="text-[var(--ink-3)]">{icon}</span>
      <span className="t-caption">{label}</span>
      <span className="truncate text-[13px] font-semibold">{value}</span>
    </span>
  );
}

function KeyCard({
  icon,
  label,
  value,
  rows,
  tone,
  badge,
  badgeTone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  rows: [string, string][];
  tone?: "up" | "down";
  badge?: string;
  badgeTone?: string;
}) {
  const color = tone === "down" ? "text-[var(--red)]" : tone === "up" ? "text-[var(--green)]" : "";
  return (
    <div className="card card-pad !p-3.5">
      <div className="flex items-center gap-1.5 text-[var(--ink-3)]">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <div className={"t-metric-sm mt-1.5 truncate " + color} title={value}>
        {value}
      </div>
      {badge && <div className="mt-1.5"><span className={"chip py-0 text-[11px] " + (badgeTone ?? "chip")}>{badge}</span></div>}
      <dl className="mt-1.5 flex flex-col gap-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2 text-[12px]">
            <dt className="muted shrink-0">{k}</dt>
            <dd className="num truncate text-right text-[var(--ink-2)]" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function dominantLabel(d: DecompositionLike): string {
  return d.factors.find((f) => f.factorId === d.dominantFactor)?.label ?? d.dominantFactor;
}

function dominantShare(d: DecompositionLike): number {
  return d.factors.find((f) => f.factorId === d.dominantFactor)?.share ?? 0;
}

/** Hero 里的结论正文控制在 2~4 句，完整版在下方各区块展开。 */
function shorten(text: string, maxSentences = 4): string {
  const parts = text.split(/(?<=。)/).filter(Boolean);
  if (parts.length <= maxSentences) return text;
  return parts.slice(0, maxSentences).join("");
}
