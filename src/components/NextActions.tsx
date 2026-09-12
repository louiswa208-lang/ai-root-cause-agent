"use client";

import { AlertTriangle, Eye, FlaskConical, ListTodo, Wrench } from "lucide-react";
import type { FinalDiagnosis } from "@/lib/agent/state";
import { Card } from "./ui";

const ACTION_ICON = {
  fix: <Wrench size={14} />,
  validate: <FlaskConical size={14} />,
  monitor: <Eye size={14} />,
  align: <AlertTriangle size={14} />,
};

const PRIORITY_TONE: Record<string, string> = {
  P0: "chip-red",
  P1: "chip-amber",
  P2: "chip",
};

const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

/** 下一步行动：紧跟候选原因，回答「知道原因之后做什么」。 */
export function NextActions({ actions }: { actions: FinalDiagnosis["actions"] }) {
  if (!actions.length) return null;
  const sorted = [...actions].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
  );
  return (
    <Card
      icon={<ListTodo size={16} />}
      title="下一步行动"
      hint="按优先级排序。P0 需要立刻处理，P1 是确认结论所必需的验证，P2 为后续观察与数据补齐。"
      bodyClassName="card-pad"
    >
      <ul className="flex flex-col gap-2">
        {sorted.map((a, i) => (
          <li key={i} className="card-quiet flex items-start gap-2.5 p-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface)] text-[var(--blue)]">
              {ACTION_ICON[a.kind] ?? <ListTodo size={14} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={"chip py-0 text-[11px] " + (PRIORITY_TONE[a.priority] ?? "chip")}>{a.priority}</span>
                <span className="text-[13px] font-semibold">{a.type}</span>
                <span className="chip chip-ghost py-0 text-[11px]">{a.owner}</span>
              </div>
              <div className="mt-1 text-[12px] leading-[1.7] text-[var(--ink-2)]">{a.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
