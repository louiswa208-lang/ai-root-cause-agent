import { END, START, StateGraph } from "@langchain/langgraph";
import type { Dataset } from "../data/types";
import { METRIC_DEF_BY_ID } from "../data/metrics";
import { createNodes, MAX_LOOPS } from "./nodes";
import { DiagnosisState, type DiagnosisStateType } from "./state";

/**
 * 条件边 1：数据不可信时直接停止业务归因（项目三 S1 的强制要求）。
 */
function routeAfterValidate(state: DiagnosisStateType): "data_quality_stop" | "detect_anomaly" {
  return state.dataQualityIssues.some((i) => i.blocking) ? "data_quality_stop" : "detect_anomaly";
}

/** 条件边 2：未达阈值的波动只登记，不进入完整排查。 */
function routeAfterAnomaly(state: DiagnosisStateType): "locate_business_layer" | "no_anomaly_stop" {
  return state.anomalyResult?.isAnomaly ? "locate_business_layer" : "no_anomaly_stop";
}

type LayerNode =
  | "decompose_metric"
  | "content_diagnosis"
  | "search_diagnosis"
  | "transaction_conversion_diagnosis"
  | "price_structure_diagnosis"
  | "interaction_diagnosis";

/**
 * 条件边 3：按目标指标决定是否做四因子拆解。
 * 有乘法恒等式（M01）→ 先拆解再分流；互动层等指标 → 直接进入所在层诊断。
 */
function routeAfterLocate(state: DiagnosisStateType): LayerNode {
  const metricId = state.targetMetric!;
  if (METRIC_DEF_BY_ID[metricId]?.factors?.length) return "decompose_metric";
  switch (state.currentLayer) {
    case "interaction":
      return "interaction_diagnosis";
    case "content":
      return "content_diagnosis";
    case "search":
      return "search_diagnosis";
    default:
      return metricId === "M18" ? "price_structure_diagnosis" : "transaction_conversion_diagnosis";
  }
}

/**
 * 条件边 4（最关键的一条）：按 LMDI 主贡献因子分流到不同的诊断分支。
 * M09 → 内容层；M12 → 搜索层；M16 → 交易承接；M18 → 商品结构。
 */
function routeByDominantFactor(state: DiagnosisStateType): LayerNode {
  switch (state.dominantFactor) {
    case "M09":
      return "content_diagnosis";
    case "M12":
      return "search_diagnosis";
    case "M16":
      return "transaction_conversion_diagnosis";
    case "M18":
      return "price_structure_diagnosis";
    default:
      return "content_diagnosis";
  }
}

/** 条件边 5：证据不足且还有可验证的数据 → 进入验证循环；否则输出结论。 */
function decideIfMoreValidationNeeded(
  state: DiagnosisStateType,
): "run_additional_validation" | "generate_final_diagnosis" {
  if (state.needsMoreValidation && state.validationLoops < MAX_LOOPS) return "run_additional_validation";
  return "generate_final_diagnosis";
}

/** 构建归因 Agent 的 StateGraph。数据集通过闭包注入各节点，节点内只调用确定性 Tool 与 LLM。 */
export function buildDiagnosisGraph(dataset: Dataset) {
  const n = createNodes(dataset);
  const graph = new StateGraph(DiagnosisState)
    .addNode("parse_user_query", n.parse_user_query)
    .addNode("validate_dataset", n.validate_dataset)
    .addNode("detect_anomaly", n.detect_anomaly)
    .addNode("locate_business_layer", n.locate_business_layer)
    .addNode("decompose_metric", n.decompose_metric)
    .addNode("content_diagnosis", n.content_diagnosis)
    .addNode("search_diagnosis", n.search_diagnosis)
    .addNode("transaction_conversion_diagnosis", n.transaction_conversion_diagnosis)
    .addNode("price_structure_diagnosis", n.price_structure_diagnosis)
    .addNode("interaction_diagnosis", n.interaction_diagnosis)
    .addNode("drill_down_dimensions", n.drill_down_dimensions)
    .addNode("match_events", n.match_events)
    .addNode("match_candidate_causes", n.match_candidate_causes)
    .addNode("evaluate_evidence", n.evaluate_evidence)
    .addNode("run_additional_validation", n.run_additional_validation)
    .addNode("generate_final_diagnosis", n.generate_final_diagnosis)
    .addNode("data_quality_stop", n.data_quality_stop)
    .addNode("no_anomaly_stop", n.no_anomaly_stop)
    .addEdge(START, "parse_user_query")
    .addEdge("parse_user_query", "validate_dataset")
    .addConditionalEdges("validate_dataset", routeAfterValidate, ["data_quality_stop", "detect_anomaly"])
    .addConditionalEdges("detect_anomaly", routeAfterAnomaly, ["locate_business_layer", "no_anomaly_stop"])
    .addConditionalEdges("locate_business_layer", routeAfterLocate, [
      "decompose_metric",
      "content_diagnosis",
      "search_diagnosis",
      "transaction_conversion_diagnosis",
      "price_structure_diagnosis",
      "interaction_diagnosis",
    ])
    .addConditionalEdges("decompose_metric", routeByDominantFactor, [
      "content_diagnosis",
      "search_diagnosis",
      "transaction_conversion_diagnosis",
      "price_structure_diagnosis",
    ])
    .addEdge("content_diagnosis", "drill_down_dimensions")
    .addEdge("search_diagnosis", "drill_down_dimensions")
    .addEdge("transaction_conversion_diagnosis", "drill_down_dimensions")
    .addEdge("price_structure_diagnosis", "drill_down_dimensions")
    .addEdge("interaction_diagnosis", "drill_down_dimensions")
    .addEdge("drill_down_dimensions", "match_events")
    .addEdge("match_events", "match_candidate_causes")
    .addEdge("match_candidate_causes", "evaluate_evidence")
    .addConditionalEdges("evaluate_evidence", decideIfMoreValidationNeeded, [
      "run_additional_validation",
      "generate_final_diagnosis",
    ])
    // 验证循环：补充验证后回到证据评估，直到证据充分或达到最大轮次
    .addEdge("run_additional_validation", "evaluate_evidence")
    .addEdge("generate_final_diagnosis", END)
    .addEdge("data_quality_stop", END)
    .addEdge("no_anomaly_stop", END);

  return graph.compile();
}

/** 供前端与 README 展示的图结构说明。 */
export const GRAPH_SPEC = {
  nodes: [
    { id: "parse_user_query", stage: "S1", kind: "LLM", label: "理解问题" },
    { id: "validate_dataset", stage: "S1", kind: "Tool", label: "校验数据" },
    { id: "detect_anomaly", stage: "S1", kind: "Tool", label: "确认异常" },
    { id: "locate_business_layer", stage: "S2", kind: "决策", label: "定位链路层级" },
    { id: "decompose_metric", stage: "S3", kind: "Tool", label: "四因子拆解" },
    { id: "content_diagnosis", stage: "S3", kind: "Tool", label: "内容层诊断" },
    { id: "search_diagnosis", stage: "S3", kind: "Tool", label: "搜索层诊断" },
    { id: "transaction_conversion_diagnosis", stage: "S3", kind: "Tool", label: "成交承接诊断" },
    { id: "price_structure_diagnosis", stage: "S3", kind: "Tool", label: "商品结构诊断" },
    { id: "interaction_diagnosis", stage: "S3", kind: "Tool", label: "互动层诊断" },
    { id: "drill_down_dimensions", stage: "S4", kind: "Tool", label: "维度下钻" },
    { id: "match_events", stage: "S5", kind: "Tool", label: "匹配事件" },
    { id: "match_candidate_causes", stage: "S5", kind: "Tool", label: "匹配候选原因" },
    { id: "evaluate_evidence", stage: "S6", kind: "LLM", label: "评估证据" },
    { id: "run_additional_validation", stage: "S6", kind: "Tool", label: "补充对照验证" },
    { id: "generate_final_diagnosis", stage: "S7", kind: "LLM", label: "输出结论" },
    { id: "data_quality_stop", stage: "S1", kind: "决策", label: "数据问题早停" },
    { id: "no_anomaly_stop", stage: "S1", kind: "决策", label: "未达阈值早停" },
  ],
  conditionalEdges: [
    { from: "validate_dataset", rule: "数据是否可信", targets: ["detect_anomaly", "data_quality_stop"] },
    { from: "detect_anomaly", rule: "是否超过阈值", targets: ["locate_business_layer", "no_anomaly_stop"] },
    { from: "locate_business_layer", rule: "指标是否有乘法恒等式", targets: ["decompose_metric", "interaction_diagnosis", "content_diagnosis", "search_diagnosis", "transaction_conversion_diagnosis", "price_structure_diagnosis"] },
    { from: "decompose_metric", rule: "LMDI 主贡献因子", targets: ["content_diagnosis", "search_diagnosis", "transaction_conversion_diagnosis", "price_structure_diagnosis"] },
    { from: "evaluate_evidence", rule: "证据是否充分", targets: ["run_additional_validation", "generate_final_diagnosis"] },
  ],
  loop: "evaluate_evidence → run_additional_validation → evaluate_evidence（最多 " + MAX_LOOPS + " 轮）",
};
