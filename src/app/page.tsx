"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContributionChart, TrendChart } from "@/components/Charts";
import { DetailLog } from "@/components/DetailLog";
import { DiagnosisCard } from "@/components/DiagnosisCard";
import { StageTimeline } from "@/components/StageTimeline";
import type { AnalysisStep, FinalDiagnosis } from "@/lib/agent/state";
import type { DatasetMetadata } from "@/lib/data/types";

interface AnomalyLike {
  metricId: string;
  value: number;
  baseline: number;
  deviation: number;
  direction: string;
  series: { date: string; value: number }[];
  reason: string;
  isAnomaly: boolean;
}
interface FactorLike {
  factorId: string;
  label: string;
  layer: string;
  contribution: number;
  share: number;
}
interface DecompositionLike {
  delta: number;
  factors: FactorLike[];
  dominantFactor: string;
  reconciliation: number;
}
interface DrillLike {
  topDimension?: { dimension: string; summary: string; topSegments: { segment: string; delta: number; share: number }[] };
  dimensions: { dimension: string; summary: string; topSegments: { segment: string; delta: number; share: number }[] }[];
}
interface EventLike {
  id: string;
  date: string;
  type: string;
  name: string;
  matchReason: string;
  scopeMatch: string;
}

const EXAMPLES = [
  { label: "看后搜 GMV 下降", q: "为什么 2026-09-12 的看后搜 GMV 下降了？" },
  { label: "客单价异常", q: "2026-09-05 看后搜 GMV 为什么跌了？" },
  { label: "作者回复率下降", q: "2026-09-10 作者回复率为什么下降？" },
  { label: "数据异常日", q: "2026-09-11 的看后搜 GMV 怎么了？" },
];

export default function Home() {
  const [meta, setMeta] = useState<DatasetMetadata | null>(null);
  const [datasetId, setDatasetId] = useState<string>("demo");
  const [isDemo, setIsDemo] = useState(true);
  const [question, setQuestion] = useState(EXAMPLES[0].q);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AnalysisStep[]>([]);
  const [stage, setStage] = useState<string | undefined>();
  const [doneStages, setDoneStages] = useState<Set<string>>(new Set());
  const [anomaly, setAnomaly] = useState<AnomalyLike | null>(null);
  const [decomposition, setDecomposition] = useState<DecompositionLike | null>(null);
  const [drill, setDrill] = useState<DrillLike | null>(null);
  const [events, setEvents] = useState<EventLike[]>([]);
  const [diagnosis, setDiagnosis] = useState<FinalDiagnosis | null>(null);
  const [llm, setLlm] = useState<{ enabled: boolean; model: string | null } | null>(null);
  const [routePath, setRoutePath] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/dataset")
      .then((r) => r.json())
      .then((d) => {
        setMeta(d.metadata);
        setDatasetId(d.datasetId);
      })
      .catch(() => setError("演示数据加载失败"));
  }, []);

  const reset = () => {
    setSteps([]);
    setStage(undefined);
    setDoneStages(new Set());
    setAnomaly(null);
    setDecomposition(null);
    setDrill(null);
    setEvents([]);
    setDiagnosis(null);
    setRoutePath([]);
    setError(null);
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
        const msg = await res.text();
        throw new Error(msg || "请求失败");
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
            if (evt.stage) {
              setStage(evt.stage);
              setDoneStages((prev) => new Set([...prev, evt.stage]));
            }
            setRoutePath((prev) => [...prev, evt.node]);
            const p = evt.patch ?? {};
            if (p.anomalyResult) setAnomaly(p.anomalyResult);
            if (p.decompositionResult) setDecomposition(p.decompositionResult);
            if (p.drillDownResult) setDrill(p.drillDownResult);
            if (p.matchedEvents) setEvents(p.matchedEvents);
            if (p.finalDiagnosis) setDiagnosis(p.finalDiagnosis);
          } else if (evt.type === "error") {
            setError(evt.message);
          }
        }
      }
      setStage(undefined);
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
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const factorChart = useMemo(
    () =>
      decomposition?.factors.map((f) => ({
        name: f.label,
        value: Number(f.contribution.toFixed(1)),
        highlight: f.factorId === decomposition.dominantFactor,
      })) ?? [],
    [decomposition],
  );
  const dimChart = useMemo(() => {
    const top = drill?.topDimension;
    if (!top) return [];
    return top.topSegments.slice(0, 6).map((s) => ({ name: s.segment, value: Number(s.delta.toFixed(1)) }));
  }, [drill]);

  return (
    <main className="mx-auto max-w-[1180px] px-5 py-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">全链路波动归因 Agent</h1>
          <p className="mt-1 text-sm muted">
            内容 → 互动 → 搜索 → 交易：从指标异常到归因结论，自动完成拆解、下钻、原因匹配与证据验证
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="tag tag-blue">Agent orchestration: LangGraph</span>
          {llm && (
            <span className="tag">{llm.enabled ? "推理模型：" + llm.model : "未配置 API Key · 确定性回退模式"}</span>
          )}
        </div>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-[330px_1fr]">
        <aside className="flex flex-col gap-4">
          <section className="panel p-4">
            <div className="text-sm font-semibold">数据集</div>
            {meta ? (
              <div className="mt-2 text-xs leading-6 muted">
                <div className="text-[var(--ink)]">{meta.name}</div>
                <div>
                  {meta.rowCount.toLocaleString("zh-CN")} 行 · {meta.dateRange.start} ~ {meta.dateRange.end}
                </div>
                <div>维度：{meta.dimensions.join("、") || "无"}</div>
                <div>可用指标：{meta.availableMetrics.join("、")}</div>
                {meta.warnings.map((w, i) => (
                  <div key={i} className="text-[#b06b20]">
                    {w}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs muted">加载中…</div>
            )}
            <div className="mt-3 flex gap-2">
              <button className="btn text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? "解析中…" : "上传 CSV / Excel"}
              </button>
              {!isDemo && (
                <button
                  className="btn text-xs"
                  onClick={() =>
                    fetch("/api/dataset")
                      .then((r) => r.json())
                      .then((d) => {
                        setMeta(d.metadata);
                        setDatasetId(d.datasetId);
                        setIsDemo(true);
                        reset();
                      })
                  }
                >
                  用回演示数据
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
              }}
            />
          </section>

          <section className="panel p-4">
            <div className="text-sm font-semibold">要诊断什么</div>
            <textarea
              className="mt-2"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="例如：为什么 2026-09-12 的看后搜 GMV 下降了？"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e.label} className="tag hover:border-[var(--blue)]" onClick={() => setQuestion(e.q)}>
                  {e.label}
                </button>
              ))}
            </div>
            <button className="btn btn-primary mt-3 w-full" onClick={() => void run()} disabled={running || !meta}>
              {running ? "诊断中…" : "开始诊断"}
            </button>
            {error && <div className="mt-2 text-xs text-[#c0392b]">{error}</div>}
          </section>

          <section className="panel p-4">
            <div className="text-sm font-semibold">诊断进度</div>
            <div className="mt-2">
              <StageTimeline current={stage} done={doneStages} />
            </div>
            {routePath.length > 0 && (
              <div className="mt-3 border-t border-[var(--line)] pt-2 text-xs muted">
                本次路径：{routePath.filter((n) => n !== "parse_user_query").join(" → ")}
              </div>
            )}
          </section>
        </aside>

        <section className="flex flex-col gap-4">
          {!anomaly && !running && !diagnosis && (
            <div className="panel p-6 text-sm leading-7 muted">
              选择或输入一个问题后点「开始诊断」。Agent 会按 S1~S7 逐步分析：先确认数据与异常，再判断变化首先出现在哪一层，
              然后拆解主贡献因子、下钻影响范围、匹配事件与候选原因，证据不足时会自动补充对照验证，最后输出归因结论。
              不同的异常会走不同的分析路径。
            </div>
          )}

          {anomaly && (
            <div className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">指标趋势与基线</div>
                <div className="text-xs muted">{anomaly.reason}</div>
              </div>
              <div className="mt-2">
                <TrendChart
                  series={anomaly.series}
                  baseline={anomaly.baseline}
                  targetDate={diagnosis?.targetDate ?? ""}
                  label={anomaly.metricId}
                />
              </div>
            </div>
          )}

          {decomposition && (
            <div className="panel p-4">
              <div className="text-sm font-semibold">四因子拆解（LMDI）</div>
              <div className="mt-1 text-xs muted">
                M01 = M09 × M12 × M16 × M18，总变化 {decomposition.delta.toFixed(0)}，对账差{" "}
                {decomposition.reconciliation.toFixed(6)}
              </div>
              <div className="mt-2">
                <ContributionChart data={factorChart} />
              </div>
            </div>
          )}

          {dimChart.length > 0 && (
            <div className="panel p-4">
              <div className="text-sm font-semibold">影响范围（{drill?.topDimension?.dimension}）</div>
              <div className="mt-1 text-xs muted">{drill?.topDimension?.summary}</div>
              <div className="mt-2">
                <ContributionChart data={dimChart} height={160} />
              </div>
            </div>
          )}

          {events.length > 0 && (
            <div className="panel p-4">
              <div className="text-sm font-semibold">匹配到的事件</div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {events.slice(0, 4).map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="tag">{e.date}</span>
                    <span className="tag">{e.type}</span>
                    <span className="text-[var(--ink)]">{e.name}</span>
                    <span className="muted">（{e.matchReason}）</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {diagnosis && <DiagnosisCard d={diagnosis} />}
          <DetailLog steps={steps} />
        </section>
      </div>

      <footer className="mt-8 text-xs leading-6 muted">
        指标口径来自《内容—互动—搜索—交易全链路波动归因与诊断报告》：M 系列沿用看后搜口径，H 系列为互动层指标，
        原因库为项目三的原因—证据矩阵。演示数据为方法演示数据，非真实业务数据；阈值为示例参数。
      </footer>
    </main>
  );
}
