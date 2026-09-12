"use client";

import { ArrowRight, Brain, Eye, Scale } from "lucide-react";
import type { AgentDecisionLike } from "./types";
import { Card } from "./ui";

const NODE_LABEL: Record<string, string> = {
  validate_dataset: "校验数据",
  detect_anomaly: "确认异常",
  locate_business_layer: "定位链路层级",
  decompose_metric: "四因子拆解",
  content_diagnosis: "内容层诊断",
  search_diagnosis: "搜索层诊断",
  transaction_conversion_diagnosis: "成交承接诊断",
  price_structure_diagnosis: "商品结构诊断",
  interaction_diagnosis: "互动层诊断",
  drill_down_dimensions: "维度下钻",
  match_events: "事件匹配",
  match_candidate_causes: "候选原因匹配",
  evaluate_evidence: "证据评估",
  run_additional_validation: "补充对照验证",
  generate_final_diagnosis: "生成结论",
  data_quality_stop: "数据问题早停",
  no_anomaly_stop: "未达阈值早停",
};

/**
 * Agent 决策过程：每个节点「发现了什么 / 为什么这样判断 / 接下来做什么」。
 * 全部来自 LangGraph State 中的确定性结果，不展示模型私有思维链。
 */
export function AgentDecisions({ decisions }: { decisions: AgentDecisionLike[] }) {
  if (!decisions.length) return null;
  return (
    <Card
      icon={<Brain size={16} />}
      title="Agent 决策过程"
      hint="这里展示的是 Agent 在每个节点基于计算结果做出的判断与路由选择，取自 LangGraph 的 State，不是模型的内部推理过程。"
      bodyClassName="p-0"
    >
      <ol className="flex flex-col">
        {decisions.map((d, i) => (
          <li
            key={d.node + i}
            className={"px-4 py-3.5 " + (i < decisions.length - 1 ? "border-b border-[var(--line)]" : "")}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="chip chip-blue num py-0 text-[11px]">{d.stage}</span>
              <span className="text-[13px] font-semibold">{NODE_LABEL[d.node] ?? d.node}</span>
              <code className="muted text-[11px]">{d.node}</code>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              <Row icon={<Eye size={13} />} label="发现" text={d.found} />
              <Row icon={<Scale size={13} />} label="判断" text={d.why} />
              <Row icon={<ArrowRight size={13} />} label="下一步" text={d.next} accent />
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Row({
  icon,
  label,
  text,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  text: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={
          "mt-0.5 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] " +
          (accent ? "bg-[var(--blue-soft)] text-[var(--blue)]" : "bg-[var(--surface-2)] text-[var(--ink-3)]")
        }
      >
        {icon}
        {label}
      </span>
      <span className={"text-[13px] leading-[1.7] " + (accent ? "text-[var(--blue)]" : "text-[var(--ink-2)]")}>{text}</span>
    </div>
  );
}
