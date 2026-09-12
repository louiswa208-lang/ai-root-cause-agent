"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Code2, Cpu, GitBranch, Terminal, Wrench } from "lucide-react";
import type { AnalysisStep } from "@/lib/agent/state";
import { Card } from "./ui";

const KIND_META: Record<string, { label: string; icon: React.ReactNode; chip: string }> = {
  llm: { label: "LLM Node", icon: <Cpu size={12} />, chip: "chip-blue" },
  tool: { label: "Tool Node", icon: <Wrench size={12} />, chip: "chip-green" },
  decision: { label: "Conditional Edge", icon: <GitBranch size={12} />, chip: "chip-amber" },
  system: { label: "System", icon: <Terminal size={12} />, chip: "chip" },
};

/**
 * Execution Trace：LangGraph 实际执行到的节点、调用的工具与路由决策。
 * 只展示结构化执行记录，不展示模型私有推理过程。
 */
export function ExecutionTrace({ steps }: { steps: AnalysisStep[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  // 技术细节，默认折叠，不抢占普通用户视线
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;

  return (
    <Card
      icon={<Code2 size={16} />}
      title="Execution Trace"
      extra={
        <button
          type="button"
          className="btn btn-sm shrink-0"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {open ? "收起" : "展开技术执行轨迹"}
        </button>
      }
      hint="LangGraph 实际执行到的节点、调用的确定性工具与条件边的路由结果。不包含模型的内部推理过程。主要服务于开发与技术评审。"
      bodyClassName="p-0"
    >
      {!open && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-3">
          <span className="t-caption">本次共执行 {steps.length} 个节点：</span>
          {[...new Set(steps.map((s) => s.node))].slice(0, 8).map((n) => (
            <code key={n} className="chip chip-ghost py-0 font-mono text-[11px]">
              {n}
            </code>
          ))}
          {new Set(steps.map((s) => s.node)).size > 8 && <span className="t-caption">…</span>}
        </div>
      )}
      <ol className={"scroll-thin max-h-[560px] " + (open ? "" : "hidden")}>
        {steps.map((s, i) => {
          const meta = KIND_META[s.kind] ?? KIND_META.system;
          const expanded = openIdx === i;
          return (
            <li key={i} className={i < steps.length - 1 ? "border-b border-[var(--line)]" : ""}>
              <div className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="num text-[11px] font-semibold text-[var(--ink-3)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="num chip chip-ghost py-0 text-[11px]">{s.stage}</span>
                  <span className={"chip py-0 text-[11px] " + meta.chip}>
                    {meta.icon}
                    {meta.label}
                  </span>
                  <span className="text-[13px] font-semibold">{s.title}</span>
                  <code className="muted text-[11px]">{s.node}</code>
                </div>

                <div className="mt-1.5 text-[12px] leading-[1.7] text-[var(--ink-2)]">{s.detail}</div>

                {s.toolName && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="t-caption">调用工具</span>
                    {s.toolName.split(" / ").map((t) => (
                      <code key={t} className="chip py-0 font-mono text-[11px]">
                        {t}()
                      </code>
                    ))}
                  </div>
                )}

                {s.decision && (
                  <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5">
                    <GitBranch size={12} className="mt-0.5 shrink-0 text-[var(--blue)]" />
                    <span className="text-[12px] leading-[1.6] text-[var(--ink-2)]">{s.decision}</span>
                  </div>
                )}

                {s.payload !== undefined && (
                  <>
                    <button
                      className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--ink-3)] hover:text-[var(--blue)]"
                      onClick={() => setOpenIdx(expanded ? null : i)}
                    >
                      <ChevronDown size={12} className={"transition-transform " + (expanded ? "rotate-180" : "")} />
                      {expanded ? "收起" : "查看该步的结构化结果"}
                    </button>
                    {expanded && (
                      <pre className="scroll-thin x-scroll mt-1.5 max-h-[260px] rounded-lg bg-[var(--surface-2)] p-2.5 font-mono text-[11px] leading-[1.6] text-[var(--ink-2)]">
                        {safeJson(s.payload)}
                      </pre>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function safeJson(v: unknown): string {
  try {
    const text = JSON.stringify(v, null, 2) ?? "";
    return text.length > 8000 ? text.slice(0, 8000) + "\n… （已截断）" : text;
  } catch {
    return String(v);
  }
}
