import { Annotation } from "@langchain/langgraph";
import type { DatasetMetadata } from "../data/types";
import type { AnomalyResult, DataQualityIssue } from "../tools/anomaly";
import type { DecompositionResult } from "../tools/decompose";
import type { DrillDownResult, NumeratorDenominatorResult } from "../tools/drilldown";
import type { MatchedEvent } from "../tools/events";
import type { CandidateCause } from "../tools/causes";
import type { CompareGroupsResult } from "../tools/compare";
import type { ConfidenceAssessment, EvidenceItem } from "../tools/confidence";

export type Stage = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";
export type BusinessLayer = "content" | "interaction" | "search" | "transaction";

export const LAYER_LABEL: Record<BusinessLayer, string> = {
  content: "内容层",
  interaction: "互动层",
  search: "搜索层",
  transaction: "交易层",
};

/** Agent 每走一步留下的结构化记录（前端「分析详情」展示的就是它，不展示模型思维链）。 */
export interface AnalysisStep {
  node: string;
  stage: Stage;
  title: string;
  detail: string;
  kind: "llm" | "tool" | "decision" | "system";
  toolName?: string;
  decision?: string;
  payload?: unknown;
  at: number;
}

export interface LayerFinding {
  layer: BusinessLayer;
  headline: string;
  details: string[];
  signals: string[];
  numeratorDenominator?: NumeratorDenominatorResult;
  extra?: Record<string, unknown>;
}

export interface FinalDiagnosis {
  headline: string;
  layerLabel: string;
  metricId: string;
  metricLabel: string;
  targetDate: string;
  deviationText: string;
  dominantFactorText: string;
  topDimensionText: string;
  causes: {
    causeId: string;
    name: string;
    confidence: string;
    reasons: string[];
    missing: string[];
    verifyMethod: string;
    partner: string;
  }[];
  actions: { type: string; detail: string }[];
  caveats: string[];
  narrative: string;
}

/** LangGraph StateGraph 的状态定义。 */
export const DiagnosisState = Annotation.Root({
  userQuery: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  datasetMetadata: Annotation<DatasetMetadata | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  targetMetric: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  targetDate: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  dateRange: Annotation<{ start: string; end: string } | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  filter: Annotation<Record<string, string> | undefined>({ reducer: (_, b) => b, default: () => undefined }),

  currentStage: Annotation<Stage>({ reducer: (_, b) => b, default: () => "S1" }),
  dataQualityIssues: Annotation<DataQualityIssue[]>({ reducer: (_, b) => b, default: () => [] }),
  anomalyResult: Annotation<AnomalyResult | undefined>({ reducer: (_, b) => b, default: () => undefined }),

  currentLayer: Annotation<BusinessLayer | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  routePath: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  decompositionResult: Annotation<DecompositionResult | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  dominantFactor: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  layerFinding: Annotation<LayerFinding | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  drillDownResult: Annotation<DrillDownResult | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  affectedScope: Annotation<Record<string, string[]>>({ reducer: (_, b) => b, default: () => ({}) }),
  signals: Annotation<string[]>({ reducer: (a, b) => [...new Set([...a, ...b])], default: () => [] }),

  matchedEvents: Annotation<MatchedEvent[]>({ reducer: (_, b) => b, default: () => [] }),
  candidateCauses: Annotation<CandidateCause[]>({ reducer: (_, b) => b, default: () => [] }),
  evidence: Annotation<EvidenceItem[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  comparison: Annotation<CompareGroupsResult | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  confidence: Annotation<ConfidenceAssessment[]>({ reducer: (_, b) => b, default: () => [] }),

  validationLoops: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  needsMoreValidation: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  nextAction: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  stopReason: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  finalDiagnosis: Annotation<FinalDiagnosis | undefined>({ reducer: (_, b) => b, default: () => undefined }),

  llmUsed: Annotation<boolean>({ reducer: (a, b) => a || b, default: () => false }),
  analysisLog: Annotation<AnalysisStep[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
});

export type DiagnosisStateType = typeof DiagnosisState.State;

export function logStep(
  node: string,
  stage: Stage,
  kind: AnalysisStep["kind"],
  title: string,
  detail: string,
  extra?: Partial<AnalysisStep>,
): AnalysisStep[] {
  return [{ node, stage, kind, title, detail, at: Date.now(), ...extra }];
}
