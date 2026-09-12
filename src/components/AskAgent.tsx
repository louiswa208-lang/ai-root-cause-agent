"use client";

import { AlertCircle, Loader2, Play, Sparkles } from "lucide-react";
import { Card } from "./ui";

export interface QuickQuestion {
  label: string;
  q: string;
}

/** 提问区：自然语言输入 + 快捷问题。 */
export function AskAgent({
  question,
  setQuestion,
  onRun,
  running,
  disabled,
  error,
  quick,
}: {
  question: string;
  setQuestion: (v: string) => void;
  onRun: () => void;
  running: boolean;
  disabled: boolean;
  error: string | null;
  quick: QuickQuestion[];
}) {
  return (
    <Card icon={<Sparkles size={16} />} title="Ask Agent">
      <textarea
        rows={3}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onRun();
        }}
        placeholder="用一句话描述要诊断什么，例如：为什么 2026-09-12 的看后搜 GMV 下降了？"
      />

      <div className="mt-2.5">
        <div className="t-caption mb-1.5">快捷提问</div>
        <div className="flex flex-wrap gap-1.5">
          {quick.map((e) => (
            <button
              key={e.label}
              className="chip chip-ghost cursor-pointer transition hover:border-[var(--blue)] hover:text-[var(--blue)]"
              onClick={() => setQuestion(e.q)}
              disabled={running}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <button className="btn btn-primary mt-3 w-full" onClick={onRun} disabled={running || disabled || !question.trim()}>
        {running ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
        {running ? "Agent 分析中…" : "开始诊断"}
      </button>
      <div className="t-caption mt-1.5 text-center">⌘/Ctrl + Enter 也可发起</div>

      {error && (
        <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-[var(--red-soft)] p-2.5 text-[12px] leading-[1.6] text-[var(--red)]">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </Card>
  );
}
