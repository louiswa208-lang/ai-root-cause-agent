"use client";

import { useState } from "react";
import type { AnalysisStep } from "@/lib/agent/state";

const KIND_LABEL: Record<AnalysisStep["kind"], string> = {
  llm: "模型判断",
  tool: "分析工具",
  decision: "路径决策",
  system: "系统",
};

/**
 * 分析详情：展示 Agent 走过的路径、调用了哪些工具、为什么这样选下一步。
 * 只展示结构化决策摘要，不展示模型的推理过程。
 */
export function DetailLog({ steps }: { steps: AnalysisStep[] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  if (!steps.length) return null;
  return (
    <div className="panel p-4">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen((v) => !v)}>
        <span className="text-sm font-semibold">分析详情（{steps.length} 步）</span>
        <span className="text-xs muted">{open ? "收起" : "展开"}</span>
      </button>
      {open && (
        <ol className="mt-3 flex flex-col gap-2">
          {steps.map((s, i) => (
            <li key={i} className="rounded-lg border border-[var(--line)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tag tag-blue">{s.stage}</span>
                <span className="text-sm font-medium">{s.title}</span>
                <span className="tag">{KIND_LABEL[s.kind]}</span>
                {s.toolName && <span className="tag">{s.toolName}</span>}
              </div>
              <div className="mt-1.5 text-xs leading-6">{s.detail}</div>
              {s.decision && <div className="mt-1 text-xs text-[var(--blue)]">下一步：{s.decision}</div>}
              {s.payload != null && (
                <div className="mt-1">
                  <button className="text-xs muted underline" onClick={() => setExpanded(expanded === i ? null : i)}>
                    {expanded === i ? "隐藏原始输出" : "查看工具原始输出"}
                  </button>
                  {expanded === i && (
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-[var(--bg)] p-2 text-[11px] leading-5">
                      {JSON.stringify(s.payload, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
