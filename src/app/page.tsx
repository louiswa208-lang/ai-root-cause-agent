"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Compass,
  Layers3,
  PieChart,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  Workflow,
} from "lucide-react";
import { AgentDecisions } from "@/components/AgentDecisions";
import { AppHeader } from "@/components/AppHeader";
import { AskAgent } from "@/components/AskAgent";
import { ContributionChart, TrendChart, type ChartUnit } from "@/components/Charts";
import { DatasetCard } from "@/components/DatasetCard";
import { DiagnosisHero } from "@/components/DiagnosisHero";
import { DiagnosisPath } from "@/components/DiagnosisPath";
import { EventTimeline } from "@/components/EventTimeline";
import { ExecutionTrace } from "@/components/ExecutionTrace";
import { KeyEvidence } from "@/components/KeyEvidence";
import { NextActions } from "@/components/NextActions";
import { RootCauseCards } from "@/components/RootCauseCards";
import { SectionNav, type NavSection } from "@/components/SectionNav";
import { Stepper } from "@/components/Stepper";
import { Card } from "@/components/ui";
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

const STAGE_TITLE: Record<string, string> = {
  S1: "验证异常",
  S2: "定位链路层级",
  S3: "指标拆解",
  S4: "维度下钻",
  S5: "事件与原因匹配",
  S6: "证据验证",
  S7: "输出结论",
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

/** 右侧内容顺序：结论 → 证据 → 链路 → 图表 → 事件 → 原因 → 行动 → Agent → 轨迹 */
const SECTIONS: NavSection[] = [
  { id: "conclusion", label: "归因结论" },
  { id: "evidence", label: "核心证据" },
  { id: "path", label: "诊断路径" },
  { id: "charts", label: "详细证据" },
  { id: "events", label: "事件时间轴" },
  { id: "causes", label: "候选原因" },
  { id: "actions", label: "下一步" },
  { id: "agent", label: "Agent 决策" },
  { id: "trace", label: "执行轨迹" },
];

const NAV_OFFSET = 56;

/**
 * 手写平滑滚动。
 * 部分内嵌浏览器 / 关闭动画的环境里，原生 scrollTo({behavior:"smooth"}) 不生效，
 * 这里用 rAF 自己插值，并尊重系统的「减少动态效果」设置。
 */
function animateScrollTo(el: HTMLElement | null, to: number, onDone?: () => void): void {
  const target = el ?? document.scrollingElement ?? document.documentElement;
  const max = Math.max(0, target.scrollHeight - target.clientHeight);
  const end = Math.max(0, Math.min(to, max));
  const start = target.scrollTop;
  const distance = end - start;

  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || Math.abs(distance) < 2) {
    target.scrollTop = end;
    onDone?.();
    return;
  }

  const duration = Math.min(560, Math.max(220, Math.abs(distance) * 0.35));
  const t0 = performance.now();
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    target.scrollTop = end;
    onDone?.();
  };

  const step = (now: number) => {
    if (settled) return;
    const p = Math.min(1, (now - t0) / duration);
    // easeOutCubic
    target.scrollTop = start + distance * (1 - Math.pow(1 - p, 3));
    if (p < 1) requestAnimationFrame(step);
    else finish();
  };
  requestAnimationFrame(step);

  // 兜底：某些环境（页面不可见、动画被暂停）里 rAF 不会触发，
  // 落位的正确性不能依赖动画帧，超时后直接跳到终点。
  window.setTimeout(finish, duration + 180);
}

function chartUnit(metricId?: string): ChartUnit {
  const def = metricId ? METRIC_DEF_BY_ID[metricId] : undefined;
  if (!def) return "count";
  if (def.kind === "ratio" && def.unit !== "元") return "percent";
  if (def.unit === "元") return "yuan";
  return "count";
}

interface ComparisonLike {
  dimension: string;
  affectedValues: string[];
  controlValues: string[];
  affectedChange: number;
  controlChange: number;
  did: number;
  hasControl: boolean;
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
  const [layerFinding, setLayerFinding] = useState<{ headline: string; details: string[] } | null>(null);
  const [drill, setDrill] = useState<DrillLike | null>(null);
  const [events, setEvents] = useState<EventLike[]>([]);
  const [comparison, setComparison] = useState<ComparisonLike | null>(null);
  const [diagnosis, setDiagnosis] = useState<FinalDiagnosis | null>(null);
  const [targetMetric, setTargetMetric] = useState<string | undefined>();
  const [targetDate, setTargetDate] = useState<string | undefined>();
  const [loops, setLoops] = useState(0);
  const [llm, setLlm] = useState<LlmInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [finished, setFinished] = useState(false);
  const [activeSection, setActiveSection] = useState("conclusion");

  const mainRef = useRef<HTMLElement>(null);
  // 程序化滚动期间暂停滚动监听：每帧 setState 会打断浏览器的平滑滚动
  const jumpingRef = useRef(0);

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
    setLayerFinding(null);
    setDrill(null);
    setEvents([]);
    setComparison(null);
    setDiagnosis(null);
    setTargetMetric(undefined);
    setTargetDate(undefined);
    setLoops(0);
    setError(null);
    setFinished(false);
    setActiveSection("conclusion");
  };

  /** 只滚动右侧 Main；移动端（Main 不自带滚动条）退化为整页滚动。 */
  const scrollMainTo = useCallback((top: number, smooth = true) => {
    const el = mainRef.current;
    const pane = el && el.scrollHeight > el.clientHeight + 4 ? el : null;
    jumpingRef.current = Date.now() + 900;
    if (!smooth) {
      if (pane) pane.scrollTop = top;
      else window.scrollTo(0, top);
      jumpingRef.current = Date.now() + 120;
      return;
    }
    animateScrollTo(pane, top, () => {
      jumpingRef.current = 0;
    });
  }, []);

  const jumpTo = useCallback((id: string) => {
    const target = document.getElementById("sec-" + id);
    const el = mainRef.current;
    if (!target) return;
    setActiveSection(id);
    jumpingRef.current = Date.now() + 900;
    const pane = el && el.scrollHeight > el.clientHeight + 4 ? el : null;
    const top = pane
      ? Math.max(0, target.offsetTop - NAV_OFFSET)
      : Math.max(0, target.getBoundingClientRect().top + window.scrollY - NAV_OFFSET);
    animateScrollTo(pane, top, () => {
      jumpingRef.current = 0;
    });
  }, []);

  const run = useCallback(async () => {
    if (!question.trim() || running) return;
    reset();
    setRunning(true);
    scrollMainTo(0, false);
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
            if (p.layerFinding) setLayerFinding(p.layerFinding);
            if (p.drillDownResult) setDrill(p.drillDownResult);
            if (p.matchedEvents) setEvents(p.matchedEvents);
            if (p.comparison) setComparison(p.comparison);
            if (typeof p.validationLoops === "number") setLoops(p.validationLoops);
            if (p.finalDiagnosis) setDiagnosis(p.finalDiagnosis);
          } else if (evt.type === "error") {
            setError(evt.message);
          }
        }
      }
      setStage(undefined);
      setFinished(true);
      // 诊断完成后回到顶部，确保用户第一眼看到归因结论
      setActiveSection("conclusion");
      scrollMainTo(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [datasetId, question, running, scrollMainTo]);

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
  const outcomeLayer = targetMetric ? METRIC_DEF_BY_ID[targetMetric]?.layer : undefined;

  const skippedStages = useMemo(() => {
    if (!finished) return new Set<string>();
    const all = ["S1", "S2", "S3", "S4", "S5", "S6", "S7"];
    return new Set(all.filter((s) => !doneStages.has(s)));
  }, [finished, doneStages]);

  const started = running || steps.length > 0;

  /** 没有内容的区块不进导航 */
  const visibleSections = useMemo(() => {
    if (!started) return [];
    const has: Record<string, boolean> = {
      conclusion: true,
      evidence: Boolean(anomaly || decomposition || drill || events.length || comparison),
      path: true,
      charts: Boolean(anomaly || decomposition || dimChart.length),
      events: events.length > 0,
      causes: Boolean(diagnosis?.causes.length),
      actions: Boolean(diagnosis?.actions.length),
      agent: decisions.length > 0,
      trace: steps.length > 0,
    };
    return SECTIONS.filter((s) => has[s.id]);
  }, [started, anomaly, decomposition, drill, events, comparison, dimChart, diagnosis, decisions, steps]);

  // 滚动时高亮当前区块（只监听 Main 自己的滚动）
  useEffect(() => {
    const el = mainRef.current;
    if (!el || !visibleSections.length) return;
    // 用时间戳节流，不依赖 requestAnimationFrame：
    // 页面不可见或动画被暂停时 rAF 不会触发，高亮会整个失效。
    let last = 0;
    let timer = 0;
    const compute = () => {
      last = Date.now();
      const top = el.scrollTop + NAV_OFFSET + 12;
      let current = visibleSections[0].id;
      for (const s of visibleSections) {
        const node = document.getElementById("sec-" + s.id);
        if (node && node.offsetTop <= top) current = s.id;
      }
      setActiveSection((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      // 程序化跳转进行中：不更新高亮，避免和跳转目标打架
      if (Date.now() < jumpingRef.current) return;
      const now = Date.now();
      if (now - last >= 80) {
        compute();
      } else {
        window.clearTimeout(timer);
        timer = window.setTimeout(compute, 80);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, [visibleSections]);

  return (
    <div className="flex flex-col lg:h-screen lg:overflow-hidden">
      <AppHeader llm={llm} />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ---------- 左栏：独立滚动 ---------- */}
        <aside className="scroll-pane w-full shrink-0 border-b border-[var(--line)] px-4 py-4 lg:w-[340px] lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-4">
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

        {/* ---------- 右栏：独立滚动 ---------- */}
        <main ref={mainRef} className="scroll-pane relative min-w-0 flex-1">
          {started && <SectionNav sections={visibleSections} active={activeSection} onJump={jumpTo} />}

          <div className="relative mx-auto max-w-[1120px] px-4 pb-16 pt-4 lg:px-6">
            {!started ? (
              <EmptyState
                onUseDemo={() => {
                  setQuestion(QUICK[0].q);
                  void run();
                }}
                disabled={!meta}
              />
            ) : (
              <div className="flex flex-col gap-7">
                {/* 1 · 归因结论 */}
                <section id="sec-conclusion">
                  <DiagnosisHero
                    diagnosis={diagnosis}
                    anomaly={anomaly}
                    decomposition={decomposition}
                    drill={drill}
                    running={running}
                    stage={stage}
                    stageTitle={STAGE_TITLE[stage ?? "S1"] ?? "分析中"}
                  />
                  {diagnosis && (
                    <div className="card mt-3 px-4 py-3">
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-3)]">
                        <ShieldAlert size={13} />
                        口径与边界
                      </div>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {diagnosis.caveats.map((c, i) => (
                          <li key={i} className="t-caption flex gap-1.5 leading-[1.65]">
                            <span>·</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>

                {/* 2 · 核心证据 */}
                {visibleSections.some((s) => s.id === "evidence") && (
                  <Section id="evidence" title="为什么得出这个结论">
                    <KeyEvidence
                      metricId={targetMetric}
                      anomaly={anomaly}
                      decomposition={decomposition}
                      layerFinding={layerFinding}
                      drill={drill}
                      events={events}
                      comparison={comparison}
                    />
                  </Section>
                )}

                {/* 3 · 业务诊断路径 */}
                <Section id="path" title="问题发生在哪一层">
                  <DiagnosisPath
                    activeLayer={activeLayer}
                    visitedLayers={visitedLayers}
                    outcomeLayer={outcomeLayer}
                    note={pathNote(routePath)}
                  />
                </Section>

                {/* 4 · 详细证据（图表） */}
                {visibleSections.some((s) => s.id === "charts") && (
                  <Section id="charts" title="详细证据">
                    <div className="flex flex-col gap-4">
                      {anomaly && (
                        <Card
                          icon={<TrendingDown size={16} />}
                          title="指标趋势与基线"
                          extra={
                            <span className="hidden shrink-0 gap-1.5 sm:flex">
                              <span className="chip">当期 {formatMetricValue(anomaly.metricId, anomaly.value)}</span>
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
                              title={
                                "维度下钻 · " +
                                (DIM_LABEL[drill?.topDimension?.dimension ?? ""] ??
                                  drill?.topDimension?.dimension ??
                                  "")
                              }
                              hint="按维度做加法贡献或结构—效率分解，识别波动集中在哪些细分。占比超过 100% 的原因同左：反向细分会对冲净变化。"
                            >
                              <div className="t-caption mb-1">{drill?.topDimension?.summary}</div>
                              <ContributionChart data={dimChart} unit={metricUnitForChart} height={190} />
                            </Card>
                          )}
                        </div>
                      )}
                    </div>
                  </Section>
                )}

                {/* 5 · 事件时间轴 */}
                {events.length > 0 && (
                  <Section id="events" title="那段时间发生了什么">
                    <EventTimeline events={events} targetDate={targetDate} />
                  </Section>
                )}

                {/* 6 · 候选原因 */}
                {diagnosis && diagnosis.causes.length > 0 && (
                  <Section id="causes" title="可能的原因">
                    <RootCauseCards causes={diagnosis.causes} />
                  </Section>
                )}

                {/* 7 · 下一步行动 */}
                {diagnosis && diagnosis.actions.length > 0 && (
                  <Section id="actions" title="接下来做什么">
                    <NextActions actions={diagnosis.actions} />
                  </Section>
                )}

                {/* 8 · Agent 决策逻辑 */}
                {decisions.length > 0 && (
                  <Section id="agent" title="Agent 是怎么一步步分析的">
                    <AgentDecisions decisions={decisions} />
                  </Section>
                )}

                {/* 9 · 技术执行轨迹 */}
                {steps.length > 0 && (
                  <Section id="trace" title="技术细节">
                    <ExecutionTrace steps={steps} />
                  </Section>
                )}

                <footer className="t-caption flex flex-col gap-1 border-t border-[var(--line)] pt-4 leading-[1.75]">
                  <div className="flex items-start gap-1.5">
                    <Compass size={13} className="mt-0.5 shrink-0" />
                    <span>
                      指标口径、诊断树与原因库来自《内容—互动—搜索—交易全链路波动归因与诊断报告》：M 系列沿用看后搜口径，H 系列为互动层指标。
                    </span>
                  </div>
                  <div>
                    演示数据为<b className="text-[var(--ink-2)]">模拟业务数据，非真实业务数据</b>
                    ；所有阈值为示例参数。事件时间吻合只说明相关，没有对照证据时结论不会给到「确认」。
                  </div>
                </footer>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/** 区块外壳：统一锚点与小标题，用留白与字号拉开层级。 */
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={"sec-" + id}>
      <h2 className="sec-title mb-2.5">{title}</h2>
      {children}
    </section>
  );
}

function EmptyState({ onUseDemo, disabled }: { onUseDemo: () => void; disabled: boolean }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex items-center gap-2.5">
        {[<Search key="a" size={18} />, <Workflow key="b" size={18} />, <Layers3 key="c" size={18} />].map((ic, i) => (
          <span
            key={i}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--blue)] shadow-[var(--shadow-sm)]"
          >
            {ic}
          </span>
        ))}
      </div>

      <h2 className="t-section mt-5 text-[18px]">开始一次归因分析</h2>
      <p className="t-caption mt-2 max-w-[440px] leading-[1.8]">
        输入一个指标异常问题，Agent 会自动完成：异常识别 → 指标拆解 → 维度下钻 → 事件匹配 → 证据验证 → 归因结论。
        不同的问题会走出不同的分析路径。
      </p>

      <button className="btn btn-primary mt-5" onClick={onUseDemo} disabled={disabled}>
        <Sparkles size={15} />
        使用 Demo 问题
      </button>
    </div>
  );
}

function pathNote(routePath: string[]): string | undefined {
  if (!routePath.length) return undefined;
  const skippedDecompose = routePath.includes("interaction_diagnosis") && !routePath.includes("decompose_metric");
  if (routePath.includes("data_quality_stop")) return "本次判定数据不可信，Agent 未进入业务层诊断。";
  if (routePath.includes("no_anomaly_stop")) return "本次偏离未超过阈值，Agent 只做登记，未进入完整归因。";
  if (skippedDecompose) return "目标指标没有乘法恒等式，Agent 跳过了四因子拆解，直接进入所在层的分子/分母拆解。";
  return undefined;
}
