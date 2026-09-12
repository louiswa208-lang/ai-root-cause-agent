import { z } from "zod";
import type { Dataset } from "../data/types";
import { METRIC_ALIASES, METRIC_DEF_BY_ID, computeMetric, formatMetricValue } from "../data/metrics";
import { dimensionLabel } from "../data/parse";
import { DEFAULT_ANOMALY_PARAMS, checkDataQuality, detectAnomaly } from "../tools/anomaly";
import { runAdditiveContribution, runLmdi, runStructureEfficiency } from "../tools/decompose";
import { analyzeNumeratorDenominator, drillDownDimensions } from "../tools/drilldown";
import { searchEventTimeline } from "../tools/events";
import { matchRootCauses } from "../tools/causes";
import { compareGroups } from "../tools/compare";
import { calculateConfidence, evidenceSufficient, type EvidenceItem } from "../tools/confidence";
import { ANALYST_SYSTEM, llmEnabled, structured, text } from "./llm";
import { LAYER_LABEL, logStep, type BusinessLayer, type DiagnosisStateType, type FinalDiagnosis, type LayerFinding } from "./state";

const MAX_LOOPS = Number(process.env.AGENT_MAX_VALIDATION_LOOPS ?? 2);

function lastDate(ds: Dataset): string {
  return ds.metadata.dateRange.end;
}

function metricLabel(id: string): string {
  return METRIC_DEF_BY_ID[id]?.label ?? id;
}

function layerOf(metricId: string): BusinessLayer {
  const layer = METRIC_DEF_BY_ID[metricId]?.layer;
  if (layer === "内容层") return "content";
  if (layer === "互动层") return "interaction";
  if (layer === "搜索层") return "search";
  return "transaction";
}

function pct(x: number): string {
  return (x * 100).toFixed(1) + "%";
}

/** 确定性回退的问题解析（没有 API Key 时使用）。 */
function fallbackParse(query: string, ds: Dataset): { metricId: string; date: string; filter?: Record<string, string> } {
  const q = query.toLowerCase().replace(/\s/g, "");
  let metricId = "";
  let bestLen = 0;
  for (const [id, aliases] of Object.entries(METRIC_ALIASES)) {
    if (!ds.metadata.availableMetrics.includes(id)) continue;
    for (const a of aliases) {
      const key = a.toLowerCase().replace(/\s/g, "");
      if (q.includes(key) && key.length > bestLen) {
        metricId = id;
        bestLen = key.length;
      }
    }
  }
  if (!metricId) metricId = ds.metadata.availableMetrics.includes("M01") ? "M01" : ds.metadata.availableMetrics[0];
  const m = query.match(/(\d{4})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
  let date = lastDate(ds);
  if (m) date = m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  else {
    const md = query.match(/(\d{1,2})[月/-](\d{1,2})/);
    if (md) {
      const year = ds.metadata.dateRange.end.slice(0, 4);
      date = year + "-" + md[1].padStart(2, "0") + "-" + md[2].padStart(2, "0");
    }
  }
  const filter: Record<string, string> = {};
  for (const dim of ds.metadata.dimensions) {
    const values = [...new Set(ds.rows.map((r) => r.dims[dim]).filter(Boolean))];
    for (const v of values) {
      if (v && v.length > 1 && query.includes(v)) filter[dim] = v;
    }
  }
  return { metricId, date, filter: Object.keys(filter).length ? filter : undefined };
}

export function createNodes(dataset: Dataset) {
  const dims = dataset.metadata.dimensions;

  /** S1 · LLM 节点：把自然语言问题解析成分析对象。 */
  async function parse_user_query(state: DiagnosisStateType) {
    const available = dataset.metadata.availableMetrics
      .map((id) => id + "（" + metricLabel(id) + "）")
      .join("、");
    const dimHint = dims
      .map((d) => d + "：" + [...new Set(dataset.rows.map((r) => r.dims[d]).filter(Boolean))].slice(0, 8).join("/"))
      .join("；");
    const schema = z.object({
      metricId: z.string().describe("指标编号，必须来自可用指标列表"),
      date: z.string().describe("要诊断的日期，格式 YYYY-MM-DD"),
      filter: z.record(z.string()).optional().describe("可选的维度过滤，键为维度列名"),
      restated: z.string().describe("用一句话复述这次要诊断什么"),
    });
    const parsed = await structured(
      schema,
      ANALYST_SYSTEM,
      [
        "用户问题：" + state.userQuery,
        "可用指标：" + available,
        "可用维度与取值：" + dimHint,
        "数据日期范围：" + dataset.metadata.dateRange.start + " 至 " + dataset.metadata.dateRange.end,
        "请判断用户想诊断哪个指标、哪一天。若未指明日期，取数据中的最后一天。",
      ].join("\n"),
    );
    const fb = fallbackParse(state.userQuery, dataset);
    const metricId = parsed?.metricId && METRIC_DEF_BY_ID[parsed.metricId] ? parsed.metricId : fb.metricId;
    const date = parsed?.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : fb.date;
    const filter = parsed?.filter && Object.keys(parsed.filter).length ? parsed.filter : fb.filter;
    return {
      targetMetric: metricId,
      targetDate: date,
      filter,
      currentStage: "S1" as const,
      llmUsed: Boolean(parsed),
      datasetMetadata: dataset.metadata,
      analysisLog: logStep(
        "parse_user_query",
        "S1",
        "llm",
        "理解问题",
        (parsed?.restated ?? "按关键词解析") + "：诊断 " + date + " 的" + metricLabel(metricId) + "（" + metricId + "）" +
          (filter ? "，限定 " + Object.entries(filter).map(([k, v]) => dimensionLabel(k) + "=" + v).join("、") : ""),
        { decision: parsed ? "LLM 解析" : "确定性回退解析（模型未启用或调用失败）" },
      ),
    };
  }

  /** S1 · Tool 节点：数据集校验与数据真实性检查。 */
  async function validate_dataset(state: DiagnosisStateType) {
    const metricId = state.targetMetric!;
    const date = state.targetDate!;
    const issues = checkDataQuality(dataset.rows, metricId, date);
    const missingMetric = !dataset.metadata.availableMetrics.includes(metricId);
    if (missingMetric) {
      issues.push({ kind: "missing_metric", message: "数据集中缺少计算 " + metricId + " 所需的列。", blocking: true });
    }
    return {
      dataQualityIssues: issues,
      currentStage: "S1" as const,
      analysisLog: logStep(
        "validate_dataset",
        "S1",
        "tool",
        "校验数据",
        issues.length ? issues.map((i) => i.message).join("；") : "数据行数、日期覆盖与分母检查均通过",
        { toolName: "validate_dataset / detect_schema", payload: { rowCount: dataset.metadata.rowCount, issues } },
      ),
    };
  }

  /** S1 · Tool 节点：异常识别（同 weekday 基线 + 稳健 z）。 */
  async function detect_anomaly(state: DiagnosisStateType) {
    const metricId = state.targetMetric!;
    const res = detectAnomaly(dataset.rows, metricId, state.targetDate!, state.filter, DEFAULT_ANOMALY_PARAMS);
    return {
      anomalyResult: res,
      currentStage: "S1" as const,
      analysisLog: logStep(
        "detect_anomaly",
        "S1",
        "tool",
        "确认异常",
        metricLabel(metricId) + " 当期 " + formatMetricValue(metricId, res.value) + "，基线 " +
          formatMetricValue(metricId, res.baseline) + "，" + res.direction + " " + pct(Math.abs(res.deviation)) + "。" + res.reason,
        { toolName: "detect_anomaly", payload: res },
      ),
    };
  }

  /** S2 · 节点：定位链路层级（比较各层指标偏离，判断首发层）。 */
  async function locate_business_layer(state: DiagnosisStateType) {
    const metricId = state.targetMetric!;
    const layer = layerOf(metricId);
    const probes = ["M09", "M12", "M16", "M18", "H02", "H01"].filter((m) =>
      dataset.metadata.availableMetrics.includes(m),
    );
    const layerScan = probes.map((m) => {
      const r = detectAnomaly(dataset.rows, m, state.targetDate!, state.filter, DEFAULT_ANOMALY_PARAMS);
      return { metricId: m, label: metricLabel(m), layer: METRIC_DEF_BY_ID[m].layer, deviation: r.deviation, isAnomaly: r.isAnomaly };
    });
    const moved = layerScan.filter((s) => s.isAnomaly).sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
    const hasChain = Boolean(METRIC_DEF_BY_ID[metricId]?.factors?.length);
    const detail = layerScan
      .map((s) => s.label + " " + (s.deviation >= 0 ? "+" : "") + pct(s.deviation) + (s.isAnomaly ? "（超阈值）" : ""))
      .join("；");
    return {
      currentLayer: layer,
      currentStage: "S2" as const,
      routePath: ["locate_business_layer"],
      analysisLog: logStep(
        "locate_business_layer",
        "S2",
        "decision",
        "定位链路层级",
        "目标指标属于" + LAYER_LABEL[layer] + "。各层扫描：" + detail +
          (hasChain ? "。该指标有乘法恒等式，进入四因子拆解。" : "。该指标无乘法恒等式，直接进入所在层诊断。"),
        {
          decision: hasChain ? "进入 decompose_metric" : "跳过 GMV 四因子拆解，直接进入 " + LAYER_LABEL[layer] + "诊断",
          payload: { layerScan, moved },
        },
      ),
    };
  }

  /** S3 · Tool 节点：看后搜 GMV 四因子 LMDI 拆解。 */
  async function decompose_metric(state: DiagnosisStateType) {
    const metricId = state.targetMetric!;
    const baseDates = state.anomalyResult?.baselineDates ?? [];
    const res = runLmdi(dataset.rows, metricId, baseDates, state.targetDate!, state.filter);
    const dom = res.factors.find((f) => f.factorId === res.dominantFactor)!;
    return {
      decompositionResult: res,
      dominantFactor: res.dominantFactor,
      currentStage: "S3" as const,
      routePath: ["decompose_metric"],
      analysisLog: logStep(
        "decompose_metric",
        "S3",
        "tool",
        "指标拆解",
        "M01 = M09 × M12 × M16 × M18。总变化 " + res.delta.toFixed(0) + "，各因子贡献：" +
          res.factors.map((f) => f.label + " " + f.contribution.toFixed(0) + "（" + pct(f.share) + "）").join("；") +
          "。对账差 " + res.reconciliation.toFixed(6),
        { toolName: "run_lmdi", payload: res, decision: "主贡献因子：" + dom.label + "（" + dom.factorId + "）" },
      ),
    };
  }

  function layerNode(layer: BusinessLayer, node: string, run: (state: DiagnosisStateType) => LayerFinding) {
    return async (state: DiagnosisStateType) => {
      const finding = run(state);
      return {
        currentLayer: layer,
        layerFinding: finding,
        signals: finding.signals,
        currentStage: "S3" as const,
        routePath: [node],
        analysisLog: logStep(node, "S3", "tool", finding.headline, finding.details.join("；"), {
          toolName: node,
          payload: finding,
        }),
      };
    };
  }

  const content_diagnosis = layerNode("content", "content_diagnosis", (state) => {
    const base = state.anomalyResult?.baselineDates ?? [];
    const date = state.targetDate!;
    const exposure = detectAnomaly(dataset.rows, "I09", date, state.filter);
    const eff = dataset.metadata.availableMetrics.includes("I21")
      ? detectAnomaly(dataset.rows, "I21", date, state.filter)
      : null;
    const sceneDim = dims.includes("scene") ? "scene" : dims[0];
    const bySc = sceneDim ? runAdditiveContribution(dataset.rows, "I09", sceneDim, base, date, state.filter) : null;
    const signals: string[] = [];
    if (eff && Math.abs(eff.deviation) > Math.abs(exposure.deviation)) signals.push("单场景集中");
    if (bySc && Math.abs(bySc.segments[0]?.share ?? 0) > 0.5) signals.push("单场景集中");
    signals.push("供给下降");
    return {
      layer: "content",
      headline: "内容层诊断：曝光规模还是曝光效率",
      details: [
        "内容曝光量 " + (exposure.deviation >= 0 ? "+" : "") + pct(exposure.deviation),
        eff ? "曝光→有效观看效率 " + (eff.deviation >= 0 ? "+" : "") + pct(eff.deviation) : "数据中无曝光效率列",
        bySc ? "曝光变化最集中的" + dimensionLabel(sceneDim) + "：" + bySc.segments.slice(0, 2).map((s) => s.segment + "（" + pct(s.share) + "）").join("、") : "",
      ].filter(Boolean),
      signals,
      extra: { exposure, efficiency: eff, bySegment: bySc },
    };
  });

  const search_diagnosis = layerNode("search", "search_diagnosis", (state) => {
    const date = state.targetDate!;
    const base = state.anomalyResult?.baselineDates ?? [];
    const details: string[] = [];
    const signals: string[] = [];
    const hasL1 = dataset.metadata.availableMetrics.includes("L1");
    let l1Dev = 0;
    let l2Dev = 0;
    if (hasL1) {
      const l1 = detectAnomaly(dataset.rows, "L1", date, state.filter);
      const l2 = detectAnomaly(dataset.rows, "L2", date, state.filter);
      l1Dev = l1.deviation;
      l2Dev = l2.deviation;
      details.push("L1 强引导看后搜 " + (l1Dev >= 0 ? "+" : "") + pct(l1Dev) + "，L2 即时主动看后搜 " + (l2Dev >= 0 ? "+" : "") + pct(l2Dev));
    }
    if (dataset.metadata.availableMetrics.includes("M20")) {
      const m20 = detectAnomaly(dataset.rows, "M20", date, state.filter);
      details.push("内容搜索词点击率 " + (m20.deviation >= 0 ? "+" : "") + pct(m20.deviation));
      if (m20.deviation < -0.03) signals.push("搜索入口效率下降");
    }
    if (Math.abs(l1Dev) > Math.abs(l2Dev) && l1Dev < 0) signals.push("搜索入口效率下降");
    const catDim = dims.includes("category") ? "category" : dims[0];
    if (catDim) {
      const se = runStructureEfficiency(dataset.rows, "M12", catDim, base, date, state.filter);
      details.push("看后搜率按" + dimensionLabel(catDim) + "做结构—效率分解：" + se.dominant + "为主");
      if (se.dominant === "结构效应") signals.push("结构效应为主");
    }
    return {
      layer: "search",
      headline: "搜索层诊断：入口效率还是搜索意愿",
      details,
      signals,
      extra: { l1Dev, l2Dev },
    };
  });

  const transaction_conversion_diagnosis = layerNode("transaction", "transaction_conversion_diagnosis", (state) => {
    const date = state.targetDate!;
    const base = state.anomalyResult?.baselineDates ?? [];
    const m16 = detectAnomaly(dataset.rows, "M16", date, state.filter);
    const catDim = dims.includes("category") ? "category" : dims[0];
    const se = catDim ? runStructureEfficiency(dataset.rows, "M16", catDim, base, date, state.filter) : null;
    const signals = ["成交转化下降"];
    if (se?.dominant === "结构效应") signals.push("结构效应为主");
    return {
      layer: "transaction",
      headline: "交易层诊断：成交承接",
      details: [
        "看后搜成交转化率 " + (m16.deviation >= 0 ? "+" : "") + pct(m16.deviation),
        se ? "按" + dimensionLabel(catDim) + "分解：" + se.dominant + "为主" : "",
      ].filter(Boolean),
      signals,
      extra: { m16, structure: se },
    };
  });

  const price_structure_diagnosis = layerNode("transaction", "price_structure_diagnosis", (state) => {
    const date = state.targetDate!;
    const base = state.anomalyResult?.baselineDates ?? [];
    const catDim = dims.includes("category") ? "category" : dims[0];
    const se = runStructureEfficiency(dataset.rows, "M18", catDim, base, date, state.filter);
    const signals = ["客单价变化"];
    if (se.dominant === "结构效应") signals.push("结构效应为主");
    return {
      layer: "transaction",
      headline: "交易层诊断：客单价与商品结构",
      details: [
        "客单价 " + formatMetricValue("M18", se.baseOverall) + " → " + formatMetricValue("M18", se.currentOverall),
        "结构效应 " + se.structureEffect.toFixed(1) + "，效率效应 " + se.efficiencyEffect.toFixed(1) + "，" + se.dominant + "为主",
        "占比变化最大的细分：" + se.segments.slice(0, 2).map((s) => s.segment + "（占比 " + pct(s.w0) + "→" + pct(s.w1) + "）").join("、"),
      ],
      signals,
      extra: { structure: se },
    };
  });

  const interaction_diagnosis = layerNode("interaction", "interaction_diagnosis", (state) => {
    const metricId = state.targetMetric!;
    const date = state.targetDate!;
    const base = state.anomalyResult?.baselineDates ?? [];
    const nd = analyzeNumeratorDenominator(dataset.rows, metricId, base, date, state.filter);
    const signals: string[] = [];
    if (nd.driver === "分母上升") signals.push("评论供给变化");
    if (nd.driver === "分子下降") signals.push("作者回复行为变化");
    const authorDim = dims.includes("author_tier") ? "author_tier" : undefined;
    const details = [nd.summary];
    if (authorDim) {
      const se = runStructureEfficiency(dataset.rows, metricId, authorDim, base, date, state.filter);
      details.push("按" + dimensionLabel(authorDim) + "分解：" + se.dominant + "为主，" +
        se.segments.slice(0, 2).map((s) => s.segment + "（" + pct(s.r0) + "→" + pct(s.r1) + "）").join("、"));
      if (se.segments.some((s) => Math.abs(s.r1 - s.r0) > 0.05)) signals.push("作者集中");
    }
    return {
      layer: "interaction",
      headline: "互动层诊断：先拆分子与分母",
      details,
      signals,
      numeratorDenominator: nd,
      extra: {},
    };
  });

  /** S4 · Tool 节点：维度下钻，定位影响范围。 */
  async function drill_down_dimensions(state: DiagnosisStateType) {
    const metricId = state.targetMetric!;
    const base = state.anomalyResult?.baselineDates ?? [];
    const res = drillDownDimensions(dataset.rows, metricId, dims, base, state.targetDate!, state.filter);
    const affectedScope: Record<string, string[]> = {};
    const signals: string[] = [];
    for (const f of res.dimensions) {
      const top = f.topSegments.filter((s) => Math.abs(s.share) >= 0.4).map((s) => s.segment);
      if (top.length) affectedScope[f.dimension] = top;
      if (top.length && f.dimension === "app_version") signals.push("版本集中");
      if (top.length && f.dimension === "author_tier") signals.push("作者集中");
      if (top.length && f.dimension === "scene") signals.push("单场景集中");
      if ((f.structureShare ?? 0) > 0.6) signals.push("结构效应为主");
    }
    return {
      drillDownResult: res,
      affectedScope,
      signals,
      currentStage: "S4" as const,
      analysisLog: logStep(
        "drill_down_dimensions",
        "S4",
        "tool",
        "维度下钻",
        res.dimensions.map((d) => dimensionLabel(d.dimension) + "：" + d.summary).join("；") || "没有可用维度",
        { toolName: "drill_down_dimension", payload: res, decision: "影响范围：" + (Object.entries(affectedScope).map(([k, v]) => dimensionLabel(k) + "=" + v.join("/")).join("，") || "未收敛到单一细分") },
      ),
    };
  }

  /** S5 · Tool 节点：事件时间轴匹配。 */
  async function match_events(state: DiagnosisStateType) {
    const layerLabel = state.currentLayer ? LAYER_LABEL[state.currentLayer] : undefined;
    const events = searchEventTimeline(dataset.events, {
      targetDate: state.targetDate!,
      affectedScope: state.affectedScope,
      layer: layerLabel,
      windowDays: 3,
    });
    return {
      matchedEvents: events,
      currentStage: "S5" as const,
      analysisLog: logStep(
        "match_events",
        "S5",
        "tool",
        "匹配事件",
        events.length
          ? events.slice(0, 3).map((e) => e.date + " " + e.type + "「" + e.name + "」（" + e.matchReason + "）").join("；")
          : "事件时间轴中没有时间吻合的记录",
        { toolName: "search_event_timeline", payload: events.slice(0, 5) },
      ),
    };
  }

  /** S5 · Tool 节点：从项目三原因库匹配候选原因。 */
  async function match_candidate_causes(state: DiagnosisStateType) {
    const layerLabel = state.currentLayer ? LAYER_LABEL[state.currentLayer] : "跨层";
    const causes = matchRootCauses({ layer: layerLabel, signals: state.signals, events: state.matchedEvents });
    return {
      candidateCauses: causes,
      currentStage: "S5" as const,
      analysisLog: logStep(
        "match_candidate_causes",
        "S5",
        "tool",
        "匹配候选原因",
        causes.map((c) => c.causeId + " " + c.name + "（命中：" + c.signals.join("、") + "）").join("；"),
        { toolName: "match_root_causes", payload: causes },
      ),
    };
  }

  /** S6 · LLM + Tool 节点：评估证据是否充分。 */
  async function evaluate_evidence(state: DiagnosisStateType) {
    const evidence: EvidenceItem[] = [];
    const top = state.candidateCauses[0];
    if (state.matchedEvents.length) {
      evidence.push({
        kind: "事件时间吻合",
        detail: "匹配到事件：" + state.matchedEvents[0].name + "（" + state.matchedEvents[0].matchReason + "）",
        strength: state.matchedEvents[0].scopeMatch === "完全吻合" ? "强" : "中",
        relatedCauseId: top?.causeId,
      });
    }
    if (Object.keys(state.affectedScope).length) {
      evidence.push({
        kind: "影响范围一致",
        detail: "影响范围收敛到 " + Object.entries(state.affectedScope).map(([k, v]) => dimensionLabel(k) + "=" + v.join("/")).join("，"),
        strength: "中",
      });
    }
    if (state.comparison) {
      evidence.push({
        kind: state.comparison.hasControl ? "对照验证" : "缺少对照",
        detail: state.comparison.summary,
        strength: state.comparison.hasControl ? "强" : "弱",
      });
    }
    const assessments = state.candidateCauses.slice(0, 3).map((c) =>
      calculateConfidence(c, [...state.evidence, ...evidence], state.targetMetric!, {
        events: state.matchedEvents,
        comparison: state.comparison,
      }),
    );
    const sufficient = evidenceSufficient(assessments);
    const canValidate = Boolean(
      state.matchedEvents.find((e) => e.scopeDim && e.scopeValue) || Object.keys(state.affectedScope).length,
    );
    let needMore = !sufficient && canValidate && state.validationLoops < MAX_LOOPS;
    let reason = needMore ? "候选原因缺少对照证据，继续补充验证" : sufficient ? "证据已达到当前可得的最高等级" : "没有更多可用于验证的数据";

    const schema = z.object({
      needMoreValidation: z.boolean(),
      reason: z.string(),
      comment: z.string().describe("一句话说明当前证据强弱"),
    });
    const judged = await structured(
      schema,
      ANALYST_SYSTEM,
      [
        "当前候选原因：" + state.candidateCauses.map((c) => c.causeId + " " + c.name).join("；"),
        "已有证据：" + [...state.evidence, ...evidence].map((e) => e.kind + "：" + e.detail).join("；"),
        "当前置信度判定：" + assessments.map((a) => a.causeName + "=" + a.levelLabel).join("；"),
        "是否还有可用于对照验证的数据：" + (canValidate ? "有" : "没有"),
        "已执行验证轮次：" + state.validationLoops + "（上限 " + MAX_LOOPS + "）",
        "请判断是否需要再做一次对照验证。只有在还有可用数据且当前证据不足以支撑结论时才需要。",
      ].join("\n"),
    );
    if (judged) {
      needMore = judged.needMoreValidation && canValidate && state.validationLoops < MAX_LOOPS;
      reason = judged.reason;
    }
    return {
      evidence,
      confidence: assessments,
      needsMoreValidation: needMore,
      nextAction: needMore ? "run_additional_validation" : "generate_final_diagnosis",
      currentStage: "S6" as const,
      llmUsed: Boolean(judged),
      analysisLog: logStep(
        "evaluate_evidence",
        "S6",
        judged ? "llm" : "decision",
        "评估证据",
        (judged?.comment ? judged.comment + " " : "") +
          assessments.map((a) => a.causeName + "：" + a.levelLabel).join("；") + "。" + reason,
        { decision: needMore ? "证据不足 → 继续验证" : "证据充分 → 输出结论", payload: assessments },
      ),
    };
  }

  /** S6 · Tool 节点：补充对照验证（LangGraph 循环的一部分）。 */
  async function run_additional_validation(state: DiagnosisStateType) {
    // 优先选与实际影响范围一致的事件；事件范围与影响范围不符时，改用下钻得到的影响范围做对照
    // 影响范围按「下钻出的 Top 维度」优先排序，避免拿一个不相关的维度去做对照
    const topDim = state.drillDownResult?.topDimension?.dimension;
    const scopeEntries = Object.entries(state.affectedScope).sort((a, b) =>
      a[0] === topDim ? -1 : b[0] === topDim ? 1 : 0,
    );
    const ev =
      state.matchedEvents.find(
        (e) => e.scopeDim && e.scopeValue && (state.affectedScope[e.scopeDim] ?? []).includes(e.scopeValue),
      ) ?? (scopeEntries.length ? undefined : state.matchedEvents.find((e) => e.scopeDim && e.scopeValue));
    let dimension = ev?.scopeDim;
    let affectedValues = ev?.scopeValue ? [ev.scopeValue] : undefined;
    if (!dimension || !affectedValues) {
      const entry = scopeEntries[0];
      if (entry) {
        dimension = entry[0];
        affectedValues = entry[1];
      }
    }
    if (!dimension || !affectedValues?.length) {
      return {
        needsMoreValidation: false,
        validationLoops: state.validationLoops + 1,
        currentStage: "S6" as const,
        analysisLog: logStep("run_additional_validation", "S6", "tool", "补充验证", "没有可用的对照维度，跳过验证", {
          toolName: "compare_groups",
        }),
      };
    }
    const eventDate = ev?.date ?? state.targetDate!;
    const res = compareGroups(dataset.rows, {
      metricId: state.targetMetric!,
      dimension,
      affectedValues,
      eventDate,
      targetDate: state.targetDate!,
      windowDays: 7,
    });
    return {
      comparison: res,
      validationLoops: state.validationLoops + 1,
      currentStage: "S6" as const,
      routePath: ["run_additional_validation"],
      analysisLog: logStep(
        "run_additional_validation",
        "S6",
        "tool",
        "补充对照验证",
        res.summary,
        { toolName: "compare_groups", payload: res, decision: "回到 evaluate_evidence 重新判定置信度" },
      ),
    };
  }

  /** S7 · LLM 节点：生成最终归因结论。 */
  async function generate_final_diagnosis(state: DiagnosisStateType) {
    const metricId = state.targetMetric!;
    const anomaly = state.anomalyResult!;
    const layerLabel = state.currentLayer ? LAYER_LABEL[state.currentLayer] : "未定位";
    const dom = state.decompositionResult?.factors.find((f) => f.factorId === state.dominantFactor);
    const topDim = state.drillDownResult?.topDimension;
    const causes = state.confidence.map((c) => {
      const cause = state.candidateCauses.find((x) => x.causeId === c.causeId)!;
      return {
        causeId: c.causeId,
        name: c.causeName,
        confidence: c.levelLabel,
        reasons: c.reasons,
        missing: c.missing,
        verifyMethod: cause?.verifyMethod ?? "",
        partner: cause?.partner ?? "",
      };
    });
    const actions: { type: string; detail: string }[] = [];
    const best = state.confidence[0];
    if (best?.level === "confirmed") actions.push({ type: "修复 / 回滚", detail: "已确认原因，按验证结论推动修复或回滚，并复看指标是否回归" });
    else if (best?.level === "highly_related") actions.push({ type: "发起验证实验", detail: "补充对照证据（" + (causes[0]?.verifyMethod || "实验或准实验") + "），确认后再行动" });
    else actions.push({ type: "持续监控", detail: "当前只能到候选级别，设定观察窗口并补齐事件记录" });
    if (state.dataQualityIssues.length) actions.push({ type: "修复", detail: "先处理数据质量问题：" + state.dataQualityIssues.map((i) => i.message).join("；") });
    const caveats = [
      "结论基于当前数据集与事件记录，事件时间吻合只说明相关。",
      "互动指标与搜索、交易指标之间为产品假设关系，需实验验证后才能表述为因果。",
      "看后搜 GMV 为项目一的归因口径，不代表内容创造的增量。",
    ];
    const deviationText = metricLabel(metricId) + " " + anomaly.direction + " " + pct(Math.abs(anomaly.deviation)) +
      "（当期 " + formatMetricValue(metricId, anomaly.value) + "，基线 " + formatMetricValue(metricId, anomaly.baseline) + "）";
    const dominantFactorText = dom
      ? dom.label + " 贡献 " + pct(Math.abs(dom.share)) + "，首发层为" + dom.layer
      : state.layerFinding
        ? state.layerFinding.details.join("；")
        : "未做因子拆解";
    const topDimensionText = topDim
      ? dimensionLabel(topDim.dimension) + "：" + topDim.summary
      : "影响范围未收敛到单一细分";

    const fallbackNarrative = [
      deviationText + "。",
      "变化首先出现在" + layerLabel + "：" + dominantFactorText + "。",
      "影响范围：" + topDimensionText + "。",
      causes.length
        ? "候选原因：" + causes.map((c) => c.causeId + " " + c.name + "（" + c.confidence + "）").join("；") + "。"
        : "未匹配到候选原因。",
      state.comparison ? "对照验证：" + state.comparison.summary + "。" : "",
    ].filter(Boolean).join("");

    const narrative = (await text(
      ANALYST_SYSTEM,
      [
        "请用 4~6 句话写出归因结论，顺序为：先说层级，再说主贡献因子，然后说影响范围，最后说候选原因与置信度。",
        "不要重复罗列所有数字，只引用关键数字。不要给出数据以外的原因。",
        "指标与偏离：" + deviationText,
        "首发层：" + layerLabel,
        "因子拆解：" + (state.decompositionResult ? state.decompositionResult.factors.map((f) => f.label + " " + pct(f.share)).join("；") : "无"),
        "分层诊断：" + (state.layerFinding ? state.layerFinding.headline + "——" + state.layerFinding.details.join("；") : "无"),
        "影响范围：" + topDimensionText,
        "匹配事件：" + (state.matchedEvents.slice(0, 2).map((e) => e.date + " " + e.name).join("；") || "无"),
        "候选原因与置信度：" + causes.map((c) => c.causeId + " " + c.name + "=" + c.confidence).join("；"),
        "对照验证：" + (state.comparison?.summary ?? "未执行"),
      ].join("\n"),
    )) ?? fallbackNarrative;

    const finalDiagnosis: FinalDiagnosis = {
      headline: metricLabel(metricId) + " " + anomaly.direction + " " + pct(Math.abs(anomaly.deviation)) + "，首发层为" + layerLabel,
      layerLabel,
      metricId,
      metricLabel: metricLabel(metricId),
      targetDate: state.targetDate!,
      deviationText,
      dominantFactorText,
      topDimensionText,
      causes,
      actions,
      caveats,
      narrative,
    };
    return {
      finalDiagnosis,
      currentStage: "S7" as const,
      llmUsed: narrative !== fallbackNarrative,
      analysisLog: logStep("generate_final_diagnosis", "S7", "llm", "输出结论", finalDiagnosis.headline, {
        payload: finalDiagnosis,
        decision: narrative === fallbackNarrative ? "模板结论（模型未启用或调用失败）" : "LLM 结论",
      }),
    };
  }

  /** 早停：数据问题。 */
  async function data_quality_stop(state: DiagnosisStateType) {
    const msg = state.dataQualityIssues.map((i) => i.message).join("；");
    const finalDiagnosis: FinalDiagnosis = {
      headline: "先验证数据，不进入业务归因",
      layerLabel: "跨层",
      metricId: state.targetMetric ?? "",
      metricLabel: metricLabel(state.targetMetric ?? ""),
      targetDate: state.targetDate ?? "",
      deviationText: "未计算",
      dominantFactorText: "未拆解",
      topDimensionText: "未下钻",
      causes: [
        { causeId: "Y01", name: "埋点变更或上报异常", confidence: "候选", reasons: [msg], missing: ["需要数据侧确认"], verifyMethod: "旁证指标对照；修复前后对比", partner: "数据、客户端" },
        { causeId: "Y03", name: "数据延迟、回补或丢失", confidence: "候选", reasons: [msg], missing: ["需要查看任务产出时间"], verifyMethod: "T+N 复看；分维度勾稽", partner: "数据" },
      ],
      actions: [{ type: "修复", detail: "先确认数据完整性，再重新发起归因" }],
      caveats: ["当前异常可能来自数据问题，业务归因暂不成立。"],
      narrative: "当前异常可能来自数据问题：" + msg.replace(/。$/, "") + "。按项目三 S1 的要求，数据不可信时不进入业务归因，先确认数据完整性。",
    };
    return {
      finalDiagnosis,
      stopReason: "data_quality",
      currentStage: "S1" as const,
      analysisLog: logStep("data_quality_stop", "S1", "decision", "停止业务归因", msg, { decision: "数据问题优先，跳过 S2~S7" }),
    };
  }

  /** 早停：未达异常阈值。 */
  async function no_anomaly_stop(state: DiagnosisStateType) {
    const a = state.anomalyResult!;
    const finalDiagnosis: FinalDiagnosis = {
      headline: "未达到异常阈值，只做登记",
      layerLabel: state.currentLayer ? LAYER_LABEL[state.currentLayer] : "—",
      metricId: state.targetMetric!,
      metricLabel: metricLabel(state.targetMetric!),
      targetDate: state.targetDate!,
      deviationText: metricLabel(state.targetMetric!) + " " + a.direction + " " + pct(Math.abs(a.deviation)),
      dominantFactorText: "未拆解",
      topDimensionText: "未下钻",
      causes: [],
      actions: [{ type: "登记归档", detail: "偏离未超过阈值，按轻量排查登记即可" }],
      caveats: ["阈值为示例参数，需按历史数据的误报与漏报校准。"],
      narrative: metricLabel(state.targetMetric!) + " 在 " + state.targetDate + " 的偏离为 " + pct(a.deviation) +
        "，未超过当前阈值（相对偏离 " + pct(a.params.relativeThreshold) + "，稳健 z " + a.params.robustZThreshold +
        "）。按项目三的执行分级，只做登记，不进入完整排查。",
    };
    return {
      finalDiagnosis,
      stopReason: "no_anomaly",
      currentStage: "S1" as const,
      analysisLog: logStep("no_anomaly_stop", "S1", "decision", "未达阈值", a.reason, { decision: "轻量排查：登记后结束" }),
    };
  }

  return {
    parse_user_query,
    validate_dataset,
    detect_anomaly,
    locate_business_layer,
    decompose_metric,
    content_diagnosis,
    search_diagnosis,
    transaction_conversion_diagnosis,
    price_structure_diagnosis,
    interaction_diagnosis,
    drill_down_dimensions,
    match_events,
    match_candidate_causes,
    evaluate_evidence,
    run_additional_validation,
    generate_final_diagnosis,
    data_quality_stop,
    no_anomaly_stop,
  };
}

export { MAX_LOOPS };
