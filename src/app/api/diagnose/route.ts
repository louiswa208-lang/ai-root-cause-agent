import { buildDiagnosisGraph, GRAPH_SPEC } from "@/lib/agent/graph";
import { providerInfo } from "@/lib/agent/llm";
import { DEMO_DATASET_ID, getDataset, getDemoDataset } from "@/lib/data/store";
import type { AgentDecision, AnalysisStep } from "@/lib/agent/state";

export const runtime = "nodejs";
export const maxDuration = 120;

interface DiagnoseBody {
  datasetId?: string;
  question?: string;
}

/**
 * POST /api/diagnose —— 运行 LangGraph 归因 Agent，并以 SSE 把每个节点的结果流式推给前端。
 * 前端据此展示「当前阶段 / 已完成 / 待执行」，以及每一步的结构化决策摘要。
 */
export async function POST(req: Request) {
  const body = (await req.json()) as DiagnoseBody;
  const question = (body.question ?? "").trim();
  if (!question) return new Response(JSON.stringify({ error: "请输入要诊断的问题" }), { status: 400 });

  const dataset =
    !body.datasetId || body.datasetId === DEMO_DATASET_ID ? await getDemoDataset() : getDataset(body.datasetId);
  if (!dataset) {
    return new Response(JSON.stringify({ error: "数据集已过期，请重新上传", code: "DATASET_EXPIRED" }), { status: 410 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode("data: " + JSON.stringify(payload) + "\n\n"));
      try {
        send({
          type: "start",
          graph: GRAPH_SPEC,
          llm: providerInfo(),
          dataset: dataset.metadata,
        });
        const graph = buildDiagnosisGraph(dataset);
        const iterator = await graph.stream(
          { userQuery: question },
          { streamMode: "updates", recursionLimit: 40 },
        );
        let finalState: Record<string, unknown> = {};
        for await (const chunk of iterator) {
          for (const [node, update] of Object.entries(chunk as Record<string, Record<string, unknown>>)) {
            if (!update) continue;
            finalState = { ...finalState, ...update };
            const steps = (update.analysisLog as AnalysisStep[] | undefined) ?? [];
            const decisions = (update.agentDecisions as AgentDecision[] | undefined) ?? [];
            send({
              type: "node",
              node,
              stage: update.currentStage,
              steps,
              decisions,
              patch: {
                capabilityReport: update.capabilityReport,
                dataQualityIssues: update.dataQualityIssues,
                signals: update.signals,
                affectedScope: update.affectedScope,
                targetMetric: update.targetMetric,
                targetDate: update.targetDate,
                currentLayer: update.currentLayer,
                dominantFactor: update.dominantFactor,
                anomalyResult: update.anomalyResult,
                decompositionResult: update.decompositionResult,
                layerFinding: update.layerFinding,
                drillDownResult: update.drillDownResult,
                matchedEvents: update.matchedEvents,
                candidateCauses: update.candidateCauses,
                confidence: update.confidence,
                comparison: update.comparison,
                validationLoops: update.validationLoops,
                needsMoreValidation: update.needsMoreValidation,
                finalDiagnosis: update.finalDiagnosis,
                stopReason: update.stopReason,
              },
            });
          }
        }
        send({ type: "done", state: finalState });
      } catch (err) {
        console.error("[api/diagnose] 运行失败", err);
        send({ type: "error", message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
