import { z } from "zod";
import type { Dataset } from "../data/types";
import {
  METRIC_ALIASES,
  METRIC_DEF_BY_ID,
  computeMetric,
  formatMetricDelta,
  formatMetricValue,
  formatPercentChange,
  formatShare,
} from "../data/metrics";
import { dimensionLabel } from "../data/parse";
import { DEFAULT_ANOMALY_PARAMS, checkDataQuality, detectAnomaly } from "../tools/anomaly";
import { runAdditiveContribution, runLmdi, runStructureEfficiency } from "../tools/decompose";
import { analyzeNumeratorDenominator, drillDownDimensions } from "../tools/drilldown";
import { searchEventTimeline } from "../tools/events";
import { isEventCompatible, matchRootCauses } from "../tools/causes";
import { assessCapability } from "../tools/capability";
import { compareGroups } from "../tools/compare";
import { calculateConfidence, evidenceSufficient, type EvidenceItem } from "../tools/confidence";
import { ANALYST_SYSTEM, llmEnabled, structured, text } from "./llm";
import {
  LAYER_LABEL,
  logStep,
  type AgentDecision,
  type BusinessLayer,
  type DiagnosisStateType,
  type FinalDiagnosis,
  type LayerFinding,
} from "./state";

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

/** 带正负号的相对变化，所有偏离一律用它输出。 */
function dev(x: number): string {
  return formatPercentChange(x);
}

/** 拼接两句话，避免出现「。。」这样的重复标点。 */
function joinSentences(a: string, b: string): string {
  const head = a.trim().replace(/[。；;]+$/, "");
  return b ? head + "。" + b : head + "。";
}

/** 截断过长文本，保证前端展示的是结论而不是长篇推理。 */
function trim(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max) + "…";
}

function decide(node: string, stage: AgentDecision["stage"], found: string, why: string, next: string): AgentDecision[] {
  return [{ node, stage, found, why, next }];
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
    // 可分析性检查：缺字段不报错，而是明确说明哪些分析能做、哪些做不了
    const capability = assessCapability(dataset.metadata, metricId, dataset.events.length);
    const capText =
      "可执行 " + capability.supported.length + "/" + (capability.supported.length + capability.unsupported.length) +
      " 项分析（数据完备度 " + capability.readiness + "%）" +
      (capability.unsupported.length
        ? "；受限项：" + capability.unsupported.map((u) => u.name + "（缺 " + u.missing.join("、") + "）").join("；")
        : "");
    return {
      dataQualityIssues: issues,
      capabilityReport: capability,
      currentStage: "S1" as const,
      agentDecisions: decide(
        "validate_dataset",
        "S1",
        joinSentences(issues.length ? issues.map((i) => i.message).join("；") : "行数、日期覆盖与分母检查全部通过", capText),
        issues.some((i) => i.blocking)
          ? "数据本身不可信时，业务归因的前提不成立"
          : capability.blockingForMetric.length
            ? "数据可信，但诊断 " + metricId + " 需要的部分分析因缺字段无法执行，将只用现有字段能支撑的结论，不对缺失数据做任何推测"
            : "数据可信，本次目标指标所需的分析能力齐备",
        issues.some((i) => i.blocking) ? "转入数据质量早停，先验证数据" : "进入异常识别（detect_anomaly）",
      ),
      analysisLog: logStep(
        "validate_dataset",
        "S1",
        "tool",
        "校验数据",
        joinSentences(issues.length ? issues.map((i) => i.message).join("；") : "数据行数、日期覆盖与分母检查均通过", capText),
        { toolName: "validate_dataset / assess_capability", payload: { rowCount: dataset.metadata.rowCount, issues, capability } },
      ),
    };
  }

  /** S1 · Tool 节点：异常识别（同 weekday 基线 + 稳健 z）。 */
  async function detect_anomaly(state: DiagnosisStateType) {
    const metricId = state.targetMetric!;
    const res = detectAnomaly(dataset.rows, metricId, state.targetDate!, state.filter, DEFAULT_ANOMALY_PARAMS);
    const detail =
      metricLabel(metricId) + " 当期 " + formatMetricValue(metricId, res.value) + "，基线 " +
      formatMetricValue(metricId, res.baseline) + "，" + formatMetricDelta(metricId, res.value - res.baseline) +
      "（" + dev(res.deviation) + "）。" + res.reason;
    return {
      anomalyResult: res,
      currentStage: "S1" as const,
      agentDecisions: decide(
        "detect_anomaly",
        "S1",
        detail,
        res.isAnomaly
          ? "偏离超过示例阈值（相对偏离 " + pct(res.params.relativeThreshold) + "，稳健 z " + res.params.robustZThreshold + "）"
          : "偏离在正常波动范围内",
        res.isAnomaly ? "进入链路层级定位（locate_business_layer）" : "转入未达阈值早停，只做登记",
      ),
      analysisLog: logStep("detect_anomaly", "S1", "tool", "确认异常", detail, { toolName: "detect_anomaly", payload: res }),
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
      .map((s) => s.label + " " + dev(s.deviation) + (s.isAnomaly ? "（超阈值）" : ""))
      .join("；");
    return {
      currentLayer: layer,
      currentStage: "S2" as const,
      routePath: ["locate_business_layer"],
      agentDecisions: decide(
        "locate_business_layer",
        "S2",
        "目标指标属于" + LAYER_LABEL[layer] + "。各层指标扫描：" + detail,
        hasChain
          ? metricId + " 存在乘法恒等式（M01 = M09 × M12 × M16 × M18），可以先用因子拆解定位主贡献环节"
          : metricId + " 没有乘法恒等式，四因子拆解对它不成立",
        hasChain
          ? "执行 LMDI 四因子拆解（decompose_metric），再按主因子分流"
          : "跳过因子拆解，直接进入" + LAYER_LABEL[layer] + "诊断",
      ),
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
    const detail =
      "M01 = M09 × M12 × M16 × M18。总变化 " + formatMetricDelta(metricId, res.delta) + "，各因子贡献：" +
      res.factors.map((f) => f.label + " " + formatMetricDelta(metricId, f.contribution) + "（占总变化 " + formatShare(f.share) + "）").join("；") +
      "。对账差 " + res.reconciliation.toFixed(6) + " " + (METRIC_DEF_BY_ID[metricId]?.unit ?? "");
    return {
      decompositionResult: res,
      dominantFactor: res.dominantFactor,
      currentStage: "S3" as const,
      routePath: ["decompose_metric"],
      agentDecisions: decide(
        "decompose_metric",
        "S3",
        detail,
        dom.label + " 的贡献占比最大（" + formatShare(dom.share) + "），是本次波动的主要来源；LMDI 对账差接近 0，说明拆解完整",
        "按主贡献因子分流，进入" + dom.layer + "诊断分支",
      ),
      analysisLog: logStep(
        "decompose_metric",
        "S3",
        "tool",
        "指标拆解",
        detail,
        { toolName: "run_lmdi", payload: res, decision: "主贡献因子：" + dom.label + "（" + dom.factorId + "）" },
      ),
    };
  }

  function layerNode(layer: BusinessLayer, node: string, run: (state: DiagnosisStateType) => LayerFinding) {
    return async (state: DiagnosisStateType) => {
      const raw = run(state);
      const finding: LayerFinding = { ...raw, signals: [...new Set(raw.signals)] };
      return {
        currentLayer: layer,
        layerFinding: finding,
        signals: finding.signals,
        currentStage: "S3" as const,
        routePath: [node],
        agentDecisions: decide(
          node,
          "S3",
          finding.headline + "：" + finding.details.join("；"),
          finding.signals.length
            ? "这些表现命中了数据线索：" + finding.signals.join("、") + "，可以用来缩小原因范围"
            : "该层指标表现未命中已知的数据线索",
          "进入维度下钻（drill_down_dimensions），确认影响范围是全局还是局部",
        ),
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
        "内容曝光量 " + dev(exposure.deviation),
        eff ? "曝光→有效观看效率 " + dev(eff.deviation) : "数据中无曝光效率列",
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
      details.push("L1 强引导看后搜 " + dev(l1Dev) + "，L2 即时主动看后搜 " + dev(l2Dev));
    }
    if (dataset.metadata.availableMetrics.includes("M20")) {
      const m20 = detectAnomaly(dataset.rows, "M20", date, state.filter);
      details.push("内容搜索词点击率 " + dev(m20.deviation) + "（" + formatMetricValue("M20", m20.baseline) + " → " + formatMetricValue("M20", m20.value) + "）");
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
        "看后搜成交转化率 " + dev(m16.deviation) + "（" + formatMetricValue("M16", m16.baseline) + " → " + formatMetricValue("M16", m16.value) + "）",
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
      agentDecisions: decide(
        "drill_down_dimensions",
        "S4",
        res.dimensions.map((d) => dimensionLabel(d.dimension) + "：" + d.summary).join("；") || "数据集中没有可下钻的维度列",
        Object.keys(affectedScope).length
          ? "波动集中在部分细分而不是全局，说明更可能是局部动作而非全局策略"
          : "波动没有收敛到单一细分，需要在事件匹配时同时考虑全量生效的动作",
        "进入事件匹配（match_events），用影响范围筛掉范围不符的事件",
      ),
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
      targetMetric: state.targetMetric,
      windowDays: 3,
    });
    const usable = events.filter((e) => e.strength !== "仅时间接近");
    const timeOnly = events.filter((e) => e.strength === "仅时间接近");
    return {
      matchedEvents: events,
      currentStage: "S5" as const,
      agentDecisions: decide(
        "match_events",
        "S5",
        (events.length
          ? "窗口内共 " + events.length + " 条事件；" +
            (usable.length
              ? "业务类型与影响范围可对应的有 " + usable.length + " 条：" +
                usable.slice(0, 3).map((e) => e.date + " " + e.type + "「" + e.name + "」（" + e.strength + "）").join("；")
              : "没有业务类型可对应的事件")
          : "事件时间轴在该窗口内没有记录") +
          (timeOnly.length
            ? "。仅时间接近、不作为证据的有 " + timeOnly.length + " 条：" +
              timeOnly.slice(0, 3).map((e) => "「" + e.name + "」（" + e.matchReason + "）").join("；")
            : ""),
        "事件匹配按「业务类型 > 影响层 > 影响范围 > 时间」判定；时间接近但业务类型或影响范围不符的事件不能作为正向证据",
        "进入候选原因匹配（match_candidate_causes），只用可对应的事件支撑原因",
      ),
      analysisLog: logStep(
        "match_events",
        "S5",
        "tool",
        "匹配事件",
        events.length
          ? events.slice(0, 4).map((e) => e.date + " " + e.type + "「" + e.name + "」[" + e.strength + "]（" + e.matchReason + "）").join("；")
          : "事件时间轴中没有时间吻合的记录",
        { toolName: "search_event_timeline", payload: events.slice(0, 6) },
      ),
    };
  }

  /** S5 · Tool 节点：从项目三原因库匹配候选原因。 */
  async function match_candidate_causes(state: DiagnosisStateType) {
    const layerLabel = state.currentLayer ? LAYER_LABEL[state.currentLayer] : "跨层";
    const causes = matchRootCauses({ layer: layerLabel, signals: state.signals, events: state.matchedEvents });
    const rejected = causes.flatMap((c) => c.rejectedEvents.map((r) => c.causeId + " 排除「" + r.name + "」：" + r.reason));
    return {
      candidateCauses: causes,
      currentStage: "S5" as const,
      agentDecisions: decide(
        "match_candidate_causes",
        "S5",
        causes.map((c) => c.causeId + " " + c.name + "（命中：" + c.signals.join("、") + "）").join("；") || "原因库中没有匹配项",
        "候选原因来自项目三原因库，按「业务类型兼容 → 作用层 → 影响范围 → 时间」排序" +
          (rejected.length ? "；已显式排除不兼容事件：" + rejected.slice(0, 3).join("；") : ""),
        "进入证据评估（evaluate_evidence），按证据强度给出置信度",
      ),
      analysisLog: logStep(
        "match_candidate_causes",
        "S5",
        "tool",
        "匹配候选原因",
        causes.map((c) => c.causeId + " " + c.name + "（命中：" + c.signals.join("、") + "）").join("；") +
          (rejected.length ? "。排除：" + rejected.slice(0, 3).join("；") : ""),
        { toolName: "match_root_causes", payload: causes },
      ),
    };
  }

  /** S6 · LLM + Tool 节点：评估证据是否充分。 */
  async function evaluate_evidence(state: DiagnosisStateType) {
    const evidence: EvidenceItem[] = [];
    const top = state.candidateCauses[0];
    // 只有「业务类型与首位候选原因兼容」的事件才算正向证据；仅时间接近的事件不计入
    const supportingEvent = top
      ? state.matchedEvents.find((e) => e.strength !== "仅时间接近" && isEventCompatible(top.causeId, e).ok)
      : undefined;
    if (supportingEvent) {
      evidence.push({
        kind: "事件匹配",
        detail: "与 " + top!.causeId + " 业务类型兼容的事件：" + supportingEvent.name + "（" + supportingEvent.strength + "，" + supportingEvent.matchReason + "）",
        strength: supportingEvent.strength === "强匹配" ? "强" : supportingEvent.strength === "中等匹配" ? "中" : "弱",
        relatedCauseId: top?.causeId,
      });
    } else if (state.matchedEvents.length) {
      evidence.push({
        kind: "无兼容事件",
        detail: "窗口内的事件与候选原因业务类型不兼容或影响范围不符，仅时间接近，不作为正向证据",
        strength: "弱",
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
      reason: z.string().describe("一句话说明判断依据，不超过 60 个汉字，只给结论不要展开推理过程"),
      comment: z.string().describe("一句话说明当前证据强弱，不超过 40 个汉字"),
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
        "reason 与 comment 都只写结论，各控制在一两句话内，不要罗列推理步骤。",
      ].join("\n"),
    );
    if (judged) {
      needMore = judged.needMoreValidation && canValidate && state.validationLoops < MAX_LOOPS;
      // 兜底截断：前端只展示结论性判断，不展示长篇推理
      reason = trim(judged.reason, 120);
    }
    return {
      evidence,
      confidence: assessments,
      needsMoreValidation: needMore,
      nextAction: needMore ? "run_additional_validation" : "generate_final_diagnosis",
      currentStage: "S6" as const,
      llmUsed: Boolean(judged),
      agentDecisions: decide(
        "evaluate_evidence",
        "S6",
        assessments.map((a) => a.causeName + "：" + a.levelLabel + "（证据分 " + a.score + "/100）").join("；") || "没有可评估的候选原因",
        reason,
        needMore
          ? "回到补充验证（run_additional_validation），做第 " + (state.validationLoops + 1) + " 轮对照，上限 " + MAX_LOOPS + " 轮"
          : "进入结论生成（generate_final_diagnosis）",
      ),
      analysisLog: logStep(
        "evaluate_evidence",
        "S6",
        judged ? "llm" : "decision",
        "评估证据",
        (judged?.comment ? trim(judged.comment, 80) + " " : "") +
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
      agentDecisions: decide(
        "run_additional_validation",
        "S6",
        res.summary,
        res.hasControl
          ? "用未受影响的细分作对照，可以把「整体大盘同期变化」这一替代解释排除掉"
          : "数据里没有未受影响的细分，只能做前后对比，证据强度有限",
        "回到证据评估（evaluate_evidence），用新证据重新判定置信度",
      ),
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
      const cause = state.candidateCauses.find((x) => x.causeId === c.causeId);
      const supportingEvents = (cause?.linkedEventIds ?? [])
        .map((id) => state.matchedEvents.find((e) => e.id === id))
        .filter((e): e is NonNullable<typeof e> => Boolean(e))
        .map((e) => ({ id: e.id, name: e.name, date: e.date, strength: e.strength }));
      return {
        causeId: c.causeId,
        name: c.causeName,
        confidence: c.levelLabel,
        reasons: c.reasons,
        missing: c.missing,
        verifyMethod: cause?.verifyMethod ?? c.recommendedValidation,
        partner: cause?.partner ?? c.partner,
        score: c.score,
        scoreBreakdown: c.scoreBreakdown,
        supportingEvents,
        rejectedEvents: cause?.rejectedEvents ?? [],
      };
    });
    const actions: FinalDiagnosis["actions"] = [];
    const best = state.confidence[0];
    if (state.dataQualityIssues.length) {
      actions.push({
        type: "修复数据问题",
        detail: "先处理数据质量问题：" + state.dataQualityIssues.map((i) => i.message).join("；"),
        priority: "P0",
        owner: "数据",
        kind: "fix",
      });
    }
    if (best?.level === "confirmed") {
      actions.push({
        type: "修复或回滚",
        detail: "原因已确认，按验证结论推动修复或回滚，并复看指标是否回归基线",
        priority: "P0",
        owner: causes[0]?.partner || "对应业务方",
        kind: "fix",
      });
    } else if (best?.level === "highly_related") {
      actions.push({
        type: "发起对照验证",
        detail: "补充对照证据（" + (causes[0]?.verifyMethod || "实验或准实验") + "），确认后再推动动作",
        priority: "P1",
        owner: causes[0]?.partner || "策略、实验平台",
        kind: "validate",
      });
    } else {
      actions.push({
        type: "补齐证据后再判断",
        detail: "当前只到候选级别，缺少：" + (causes[0]?.missing.slice(0, 2).join("；") || "对照证据") + "，先补齐再下结论",
        priority: "P1",
        owner: causes[0]?.partner || "数据、策略",
        kind: "validate",
      });
    }
    if (state.capabilityReport?.unsupported.length) {
      actions.push({
        type: "补齐数据字段",
        detail: "以下分析因缺字段无法执行：" +
          state.capabilityReport.unsupported.slice(0, 2).map((u) => u.name + "（缺 " + u.missing.join("、") + "）").join("；"),
        priority: "P2",
        owner: "数据",
        kind: "align",
      });
    }
    actions.push({
      type: "设定观察窗口",
      detail: "对 " + metricLabel(metricId) + " 与影响范围内的细分设定复看窗口，确认是否回归基线",
      priority: "P2",
      owner: "分析",
      kind: "monitor",
    });
    const caveats = [
      "结论基于当前数据集与事件记录，事件时间吻合只说明相关。",
      "互动指标与搜索、交易指标之间为产品假设关系，需实验验证后才能表述为因果。",
      "看后搜 GMV 为项目一的归因口径，不代表内容创造的增量。",
    ];
    const deviationText = metricLabel(metricId) + " " + anomaly.direction + " " + dev(anomaly.deviation) +
      "（当期 " + formatMetricValue(metricId, anomaly.value) + "，基线 " + formatMetricValue(metricId, anomaly.baseline) +
      "，绝对变化 " + formatMetricDelta(metricId, anomaly.value - anomaly.baseline) + "）";
    const dominantFactorText = dom
      ? dom.label + " 贡献 " + formatMetricDelta(metricId, dom.contribution) + "（占总变化 " + formatShare(dom.share) + "），首发层为" + dom.layer
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
        "因子拆解：" + (state.decompositionResult ? state.decompositionResult.factors.map((f) => f.label + " " + formatMetricDelta(metricId, f.contribution) + "（占总变化 " + formatShare(f.share) + "）").join("；") : "无"),
        "分层诊断：" + (state.layerFinding ? state.layerFinding.headline + "——" + state.layerFinding.details.join("；") : "无"),
        "影响范围：" + topDimensionText,
        "匹配事件：" + (state.matchedEvents.slice(0, 2).map((e) => e.date + " " + e.name).join("；") || "无"),
        "候选原因与置信度：" + causes.map((c) => c.causeId + " " + c.name + "=" + c.confidence).join("；"),
        "对照验证：" + (state.comparison?.summary ?? "未执行"),
      ].join("\n"),
    )) ?? fallbackNarrative;

    const finalDiagnosis: FinalDiagnosis = {
      headline: metricLabel(metricId) + " " + anomaly.direction + " " + dev(anomaly.deviation) + "，首发层为" + layerLabel,
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
      agentDecisions: decide(
        "generate_final_diagnosis",
        "S7",
        finalDiagnosis.headline + "；" + (causes.length ? "首位候选原因 " + causes[0].causeId + " " + causes[0].name + "（" + causes[0].confidence + "，证据分 " + causes[0].score + "/100）" : "未匹配到候选原因"),
        "证据已达到当前数据可支撑的最高等级，继续循环不会提高置信度",
        "输出结论与行动建议，流程结束（END）",
      ),
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
        {
          causeId: "Y01", name: "埋点变更或上报异常", confidence: "候选", reasons: [msg],
          missing: ["需要数据侧确认"], verifyMethod: "旁证指标对照；修复前后对比", partner: "数据、客户端",
          score: 40,
          scoreBreakdown: [
            { label: "数据线索命中", got: 40, max: 40, hit: true },
            { label: "影响范围一致", got: 0, max: 25, hit: false },
            { label: "对照验证", got: 0, max: 25, hit: false },
            { label: "机制关系可解释", got: 0, max: 10, hit: false },
          ],
          supportingEvents: [], rejectedEvents: [],
        },
        {
          causeId: "Y03", name: "数据延迟、回补或丢失", confidence: "候选", reasons: [msg],
          missing: ["需要查看任务产出时间"], verifyMethod: "T+N 复看；分维度勾稽", partner: "数据",
          score: 40,
          scoreBreakdown: [
            { label: "数据线索命中", got: 40, max: 40, hit: true },
            { label: "影响范围一致", got: 0, max: 25, hit: false },
            { label: "对照验证", got: 0, max: 25, hit: false },
            { label: "机制关系可解释", got: 0, max: 10, hit: false },
          ],
          supportingEvents: [], rejectedEvents: [],
        },
      ],
      actions: [
        { type: "确认数据完整性", detail: "核对明细行数与任务产出时间，确认是否为延迟或回补", priority: "P0", owner: "数据", kind: "fix" },
        { type: "数据修复后重跑", detail: "数据补齐后重新发起归因，再判断是否存在业务问题", priority: "P1", owner: "分析", kind: "validate" },
      ],
      caveats: ["当前异常可能来自数据问题，业务归因暂不成立。"],
      narrative: "当前异常可能来自数据问题：" + msg.replace(/。$/, "") + "。按项目三 S1 的要求，数据不可信时不进入业务归因，先确认数据完整性。",
    };
    return {
      finalDiagnosis,
      stopReason: "data_quality",
      currentStage: "S1" as const,
      agentDecisions: decide(
        "data_quality_stop",
        "S1",
        msg,
        "数据不可信时，任何业务归因都可能把数据问题误判成业务问题",
        "停止 S2~S7，先做数据验证，数据修复后再重新发起归因",
      ),
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
      deviationText: metricLabel(state.targetMetric!) + " " + a.direction + " " + dev(a.deviation) +
        "（当期 " + formatMetricValue(state.targetMetric!, a.value) + "，基线 " + formatMetricValue(state.targetMetric!, a.baseline) + "）",
      dominantFactorText: "未拆解",
      topDimensionText: "未下钻",
      causes: [],
      actions: [
        { type: "登记归档", detail: "偏离未超过阈值，按轻量排查登记即可", priority: "P2", owner: "分析", kind: "monitor" },
        { type: "校准阈值", detail: "当前阈值为示例参数，需按历史误报与漏报重新校准后再复看", priority: "P2", owner: "分析", kind: "align" },
      ],
      caveats: ["阈值为示例参数，需按历史数据的误报与漏报校准。"],
      narrative: metricLabel(state.targetMetric!) + " 在 " + state.targetDate + " 的偏离为 " + dev(a.deviation) +
        "，未超过当前阈值（相对偏离 " + pct(a.params.relativeThreshold) + "，稳健 z " + a.params.robustZThreshold +
        "）。按项目三的执行分级，只做登记，不进入完整排查。",
    };
    return {
      finalDiagnosis,
      stopReason: "no_anomaly",
      currentStage: "S1" as const,
      agentDecisions: decide(
        "no_anomaly_stop",
        "S1",
        a.reason,
        "偏离未超过示例阈值，按项目三的执行分级属于轻量排查范围",
        "只做登记，不进入完整归因流程",
      ),
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
