"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Compass, Loader2, PieChart, Sparkles, TrendingDown } from "lucide-react";
import { AgentDecisions } from "@/components/AgentDecisions";
import { AppHeader } from "@/components/AppHeader";
import { AskAgent } from "@/components/AskAgent";
import { ContributionChart, TrendChart, type ChartUnit } from "@/components/Charts";
import { DatasetCard } from "@/components/DatasetCard";
import { DiagnosisPath } from "@/components/DiagnosisPath";
import { EventTimeline } from "@/components/EventTimeline";
import { ExecutionTrace } from "@/components/ExecutionTrace";
import { FinalDiagnosisPanel } from "@/components/FinalDiagnosisPanel";
import { RootCauseCards } from "@/components/RootCauseCards";
import { Stepper } from "@/components/Stepper";
import { Card, EmptyHint } from "@/components/ui";
import type {
  AgentDecisionLike,
  AnomalyLike,
  CapabilityReportLike,
  DecompositionLike,
  DrillLike,
  EventLike,
  LlmInfo,
} from "@/components/types";
import type { AnalysisStep, FinalDiagnosis } from "@/lib/agent/state";
import { METRIC_DEF_BY_ID, formatMetricDelta, formatMetricValue } from "@/lib/data/metrics";
import type { DatasetMetadata } from "@/lib/data/types";

const QUICK = [
  { label: "看后搜 GMV 下降", q: "为什么 2026-09-12 的看后搜 GMV 下降了？" },
  { label: "客单价异常", q: "2026-09-05 看后搜 GMV 为什么跌了？" },
  { label: "作者回复率下降", q: "2026-09-10 作者回复率为什么下降？" },
  { label: "疑似数据问题", q: "2026-09-11 的看后搜 GMV 怎么了？" },
];

const STAGE_DESC: Record<string, string> = {
  S1: "正在校验数据并确认异常是否成立",
  S2: "正在扫描各层指标，定位变化首先出现在哪一层",
  S3: "正在拆解指标，定位主贡献环节",
  S4: "正在下钻维度，确认影响范围",
  S5: "正在匹配事件与候选原因",
  S6: "正在评估证据强度，必要时补充对照验证",
  S7: "正在生成归因结论与行动建议",
};

const LAYER_OF_NODE: Record<string, string> = {
  content_diagnosis: "内容层",
  interaction_diagnosis: "互动层",
  search_diagnosis: "搜索层",
  transaction_conversion_diagnosis: "交易层",
  price_structure_diagnosis: "交易层",
};

const DIM_LABEL: Record<string, string> = {
  scene: "分发场景",
  category: "一级品类",
  author_tier: "作者层级",
  app_version: "端与版本",
};

function chartUnit(metricId?: string): ChartUnit {
  const def = metricId ? METRIC_DEF_BY_ID[metricId] : undefined;
  if (!def) return "count";
  if (def.kind === "ratio" && def.unit !== "元") return "percent";
  if (def.unit === "元") return "yuan";
  return "count";
}

export default function Home() {
  const [meta, setMeta] = useState<DatasetMetadata | null>(null);
  const [datasetId, setDatasetId] = useState("demo");
  const [isDemo, setIsDemo] = useState(true);
  const [question, setQuestion] = useState(QUICK[0].q);
  const [running, setRunning] = useState(false);

  const [steps, setSteps] = useState<AnalysisStep[]>([]);
  const [decisions, setDecisions] = useState<AgentDecisionLike[]>([]);
  const [stage, setStage] = useState<string | undefined>();
  const [doneStages, setDoneStages] = useState<Set<string>>(new Set());
  const [routePath, setRoutePath] = useState<string[]>([]);
  const [capability, setCapability] = useState<CapabilityReportLike | null>(null);
  const [anomaly, setAnomaly] = useState<AnomalyLike | null>(null);
  const [decomposition, setDecomposition] = useState<DecompositionLike | null>(null);
  const [drill, setDrill] = useState<DrillLike | null>(null);
  const [events, setEvents] = useState<EventLike[]>([]);
  const [diagnosis, setDiagnosis] = useState<FinalDiagnosis | null>(null);
  const [targetMetric, setTargetMetric] = useState<string | undefined>();
  const [targetDate, setTargetDate] = useState<string | undefined>();
  const [loops, setLoops] = useState(0);
  const [llm, setLlm] = useState<LlmInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [finished, setFinished] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/dataset")
      .then((r) => r.json())
      .then((d) => {
        setMeta(d.metadata);
        setDatasetId(d.datasetId);
        setCapability(d.capability ?? null);
        setLlm(d.llm ?? null);
      })
      .catch(() => setError("演示数据加载失败，请刷新页面重试"));
  }, []);

  const reset = () => {
    setSteps([]);
    setDecisions([]);
    setStage(undefined);
    setDoneStages(new Set());
    setRoutePath([]);
    setAnomaly(null);
    setDecomposition(null);
    setDrill(null);
    setEvents([]);
    setDiagnosis(null);
    setTargetMetric(undefined);
    setTargetDate(undefined);
    setLoops(0);
    setError(null);
    setFinished(false);
  };

  const run = useCallback(async () => {
    if (!question.trim() || running) return;
    reset();
    setRunning(true);
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId, question }),
      });
      if (!res.ok || !res.body) {
        let msg = "请求失败";
        try {
          msg = (await res.json()).error ?? msg;
        } catch {
          /* 保留默认提示 */
        }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.type === "start") {
            setLlm(evt.llm);
          } else if (evt.type === "node") {
            if (evt.steps?.length) setSteps((prev) => [...prev, ...evt.steps]);
            if (evt.decisions?.length) setDecisions((prev) => [...prev, ...evt.decisions]);
            if (evt.stage) {
              setStage(evt.stage);
              setDoneStages((prev) => new Set([...prev, evt.stage]));
            }
            setRoutePath((prev) => [...prev, evt.node]);
            const p = evt.patch ?? {};
            if (p.capabilityReport) setCapability(p.capabilityReport);
            if (p.targetMetric) setTargetMetric(p.targetMetric);
            if (p.targetDate) setTargetDate(p.targetDate);
            if (p.anomalyResult) setAnomaly(p.anomalyResult);
            if (p.decompositionResult) setDecomposition(p.decompositionResult);
            if (p.drillDownResult) setDrill(p.drillDownResult);
            if (p.matchedEvents) setEvents(p.matchedEvents);
            if (typeof p.validationLoops === "number") setLoops(p.validationLoops);
            if (p.finalDiagnosis) setDiagnosis(p.finalDiagnosis);
          } else if (evt.type === "error") {
            setError(evt.message);
          }
        }
      }
      setStage(undefined);
      setFinished(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [datasetId, question, running]);

  const onUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/dataset", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "上传失败");
      setMeta(d.metadata);
      setDatasetId(d.datasetId);
      setIsDemo(false);
      setCapability(d.capability ?? null);
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const useDemo = () => {
    fetch("/api/dataset")
      .then((r) => r.json())
      .then((d) => {
        setMeta(d.metadata);
        setDatasetId(d.datasetId);
        setIsDemo(true);
        setCapability(d.capability ?? null);
        reset();
      })
      .catch(() => setError("演示数据加载失败"));
  };

  const metricUnitForChart = chartUnit(targetMetric ?? anomaly?.metricId);

  const factorChart = useMemo(
    () =>
      decomposition?.factors.map((f) => ({
        name: f.label,
        value: f.contribution,
        share: f.share,
        highlight: f.factorId === decomposition.dominantFactor,
      })) ?? [],
    [decomposition],
  );

  const dimChart = useMemo(() => {
    const top = drill?.topDimension;
    if (!top) return [];
    return top.topSegments.slice(0, 6).map((s) => ({ name: s.segment, value: s.delta, share: s.share }));
  }, [drill]);

  const hasOverShare = useMemo(
    () => factorChart.some((f) => Math.abs(f.share ?? 0) > 1) || dimChart.some((d) => Math.abs(d.share ?? 0) > 1),
    [factorChart, dimChart],
  );

  const visitedLayers = useMemo(
    () => [...new Set(routePath.map((n) => LAYER_OF_NODE[n]).filter(Boolean))],
    [routePath],
  );
  const activeLayer = visitedLayers[visitedLayers.length - 1];

  const skippedStages = useMemo(() => {
    if (!finished) return new Set<string>();
    const all = ["S1", "S2", "S3", "S4", "S5", "S6", "S7"];
    return new Set(all.filter((s) => !doneStages.has(s)));
  }, [finished, doneStages]);

  const started = running || steps.length > 0;

  return (
    <div className="relative z-[1] min-h-screen">
      <AppHeader llm={llm} />

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-5 px-4 py-5 lg:grid-cols-12 lg:px-8 lg:py-7">
        {/* 侧栏：320–360px，桌面端 sticky */}
        <aside className="flex min-w-0 flex-col gap-4 lg:col-span-4 xl:col-span-3">
          <div className="flex flex-col gap-4 lg:sticky lg:top-[84px]">
            <DatasetCard
              meta={meta}
              capability={capability}
              isDemo={isDemo}
              uploading={uploading}
              onUpload={onUpload}
              onUseDemo={useDemo}
            />
            <AskAgent
              question={question}
              setQuestion={setQuestion}
              onRun={() => void run()}
              running={running}
              disabled={!meta}
              error={error}
              quick={QUICK}
            />
            <Stepper current={stage} done={doneStages} skipped={skippedStages} loops={loops} />
          </div>
        </aside>

        {/* 主区 */}
        <div ref={resultRef} className="flex min-w-0 flex-col gap-4 lg:col-span-8 xl:col-span-9">
          {running && (
            <div className="card flex items-center gap-3 px-4 py-3.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                style={{ background: "linear-gradient(135deg, var(--blue), var(--indigo))" }}
              >
                <Loader2 size={17} className="spin" />
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">
                  Agent 正在执行 {stage ?? "S1"} · {stageTitle(stage)}
                </div>
                <div className="t-caption mt-0.5 truncate">{STAGE_DESC[stage ?? "S1"]}</div>
              </div>
              <span className="ml-auto hidden shrink-0 sm:block">
                <span className="chip chip-blue">
                  已执行 {steps.length} 个节点
                </span>
              </span>
            </div>
          )}

          {!started && (
            <Card bodyClassName="p-0">
              <EmptyHint icon={<Sparkles size={20} />} title="输入一个问题，Agent 会自己决定怎么查">
                Agent 按 S1–S7 逐步分析：先确认数据可信与异常成立，再定位变化首先出现在哪一层，然后拆解主贡献因子、
                下钻影响范围、按业务类型匹配事件与候选原因；证据不足时会自动回到对照验证，直到证据充分或达到轮次上限。
                不同的问题会走出不同的路径——数据有问题时甚至不会进入业务归因。
              </EmptyHint>
            </Card>
          )}

          {started && <DiagnosisPath activeLayer={activeLayer} visitedLayers={visitedLayers} note={pathNote(routePath)} />}

          {anomaly && (
            <Card
              icon={<TrendingDown size={16} />}
              title="指标趋势与基线"
              extra={
                <span className="hidden shrink-0 gap-1.5 sm:flex">
                  <span className="chip">
                    当期 {formatMetricValue(anomaly.metricId, anomaly.value)}
                  </span>
                  <span className={"chip " + (anomaly.value < anomaly.baseline ? "chip-red" : "chip-green")}>
                    {formatMetricDelta(anomaly.metricId, anomaly.value - anomaly.baseline)}
                  </span>
                </span>
              }
            >
              <TrendChart
                series={anomaly.series}
                baseline={anomaly.baseline}
                targetDate={targetDate ?? ""}
                label={METRIC_DEF_BY_ID[anomaly.metricId]?.label ?? anomaly.metricId}
                unit={chartUnit(anomaly.metricId)}
              />
              <div className="t-caption mt-2 leading-[1.65]">{anomaly.reason}</div>
            </Card>
          )}

          {(decomposition || dimChart.length > 0) && (
            <div className="grid gap-4 xl:grid-cols-2">
              {decomposition && (
                <Card
                  icon={<PieChart size={16} />}
                  title="四因子拆解（LMDI）"
                  hint={
                    <>
                      M01 = M09 × M12 × M16 × M18，按 LMDI 加法分解（Ang 2005/2015）。
                      {hasOverShare && (
                        <>
                          {" "}
                          <b className="text-[var(--ink)]">单个因子的贡献占比可以超过 100%</b>
                          ：当某些因子同向下拉、另一些反向对冲时，下拉因子的贡献会大于净变化，
                          各因子占比之和仍为 100%。这不是计算错误。
                        </>
                      )}
                    </>
                  }
                >
                  <div className="t-caption mb-1">
                    总变化 {formatMetricDelta(targetMetric ?? "M01", decomposition.delta)}，对账差{" "}
                    {decomposition.reconciliation.toFixed(6)}
                  </div>
                  <ContributionChart data={factorChart} unit={metricUnitForChart} />
                </Card>
              )}

              {dimChart.length > 0 && (
                <Card
                  icon={<BarChart3 size={16} />}
                  title={"影响范围 · " + (DIM_LABEL[drill?.topDimension?.dimension ?? ""] ?? drill?.topDimension?.dimension ?? "")}
                  hint="按维度做加法贡献或结构—效率分解，识别波动集中在哪些细分。占比超过 100% 的原因同左：反向细分会对冲净变化。"
                >
                  <div className="t-caption mb-1">{drill?.topDimension?.summary}</div>
                  <ContributionChart data={dimChart} unit={metricUnitForChart} height={190} />
                </Card>
              )}
            </div>
          )}

          <EventTimeline events={events} targetDate={targetDate} />

          {diagnosis && diagnosis.causes.length > 0 && <RootCauseCards causes={diagnosis.causes} />}

          {diagnosis && <FinalDiagnosisPanel d={diagnosis} />}

          <AgentDecisions decisions={decisions} />

          <ExecutionTrace steps={steps} />
        </div>
      </main>

      <footer className="mx-auto max-w-[1400px] px-4 pb-8 lg:px-8">
        <div className="divider mb-4" />
        <div className="t-caption flex flex-col gap-1 leading-[1.75]">
          <div className="flex items-center gap-1.5">
            <Compass size={13} />
            指标口径、诊断树与原因库来自《内容—互动—搜索—交易全链路波动归因与诊断报告》：M 系列沿用看后搜口径，
            H 系列为互动层指标。
          </div>
          <div>
            演示数据为<b className="text-[var(--ink-2)]">模拟业务数据，非真实业务数据</b>
            ；所有阈值为示例参数，不代表实际业务阈值。事件时间吻合只说明相关，没有对照证据时结论不会给到「确认」。
          </div>
        </div>
      </footer>
    </div>
  );
}

function stageTitle(stage?: string): string {
  const map: Record<string, string> = {
    S1: "验证异常",
    S2: "定位链路层级",
    S3: "指标拆解",
    S4: "维度下钻",
    S5: "事件与原因匹配",
    S6: "证据验证",
    S7: "输出结论",
  };
  return map[stage ?? "S1"] ?? "分析中";
}

function pathNote(routePath: string[]): string | undefined {
  if (!routePath.length) return undefined;
  const skippedDecompose = routePath.includes("interaction_diagnosis") && !routePath.includes("decompose_metric");
  if (routePath.includes("data_quality_stop")) return "本次判定数据不可信，Agent 未进入业务层诊断。";
  if (routePath.includes("no_anomaly_stop")) return "本次偏离未超过阈值，Agent 只做登记，未进入完整归因。";
  if (skippedDecompose) return "目标指标没有乘法恒等式，Agent 跳过了四因子拆解，直接进入所在层的分子/分母拆解。";
  return undefined;
}
