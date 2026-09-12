"use client";

import {
  Check,
  CircleDashed,
  FileSearch,
  GitFork,
  Loader2,
  ListChecks,
  Layers,
  Microscope,
  MinusCircle,
  Radar,
  Split,
} from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "./ui";

interface StepDef {
  id: string;
  title: string;
  desc: string;
  icon: ReactNode;
}

const STEPS: StepDef[] = [
  { id: "S1", title: "验证异常", desc: "数据校验 + 基线对比，确认波动是否真实", icon: <FileSearch size={15} /> },
  { id: "S2", title: "定位链路层级", desc: "扫描各层指标，判断变化首先出现在哪一层", icon: <Layers size={15} /> },
  { id: "S3", title: "指标拆解", desc: "因子拆解或分子分母拆解，定位主贡献环节", icon: <Split size={15} /> },
  { id: "S4", title: "维度下钻", desc: "确认影响范围是全局还是集中在某些细分", icon: <Microscope size={15} /> },
  { id: "S5", title: "事件与原因匹配", desc: "按业务类型兼容性筛选事件，匹配候选原因", icon: <Radar size={15} /> },
  { id: "S6", title: "证据验证", desc: "计算置信度，证据不足时自动补充对照验证", icon: <GitFork size={15} /> },
  { id: "S7", title: "输出结论", desc: "给出归因结论、置信度与下一步行动", icon: <ListChecks size={15} /> },
];

export type StepState = "done" | "active" | "skipped" | "pending";

/** S1~S7 纵向步进器：未执行的阶段显式标为「已跳过」，而不是留空。 */
export function Stepper({
  current,
  done,
  skipped,
  loops,
}: {
  current?: string;
  done: Set<string>;
  skipped: Set<string>;
  loops: number;
}) {
  const stateOf = (id: string): StepState => {
    if (current === id) return "active";
    if (skipped.has(id)) return "skipped";
    if (done.has(id)) return "done";
    return "pending";
  };

  return (
    <Card icon={<ListChecks size={16} />} title="诊断流程 S1–S7" bodyClassName="px-4 pb-4 pt-3">
      <ol className="flex flex-col">
        {STEPS.map((s, i) => {
          const st = stateOf(s.id);
          const last = i === STEPS.length - 1;
          return (
            <li key={s.id} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <StepDot state={st} icon={s.icon} />
                {!last && (
                  <span
                    className="w-px flex-1"
                    style={{
                      minHeight: 18,
                      background: st === "done" || st === "active" ? "var(--blue)" : "var(--line)",
                      opacity: st === "done" || st === "active" ? 0.45 : 1,
                    }}
                  />
                )}
              </div>
              <div className={"pb-3 " + (last ? "pb-0" : "")}>
                <div className="flex items-center gap-1.5">
                  <span className="num text-[11px] font-semibold text-[var(--ink-3)]">{s.id}</span>
                  <span
                    className={
                      "text-[13px] font-semibold " +
                      (st === "pending" || st === "skipped" ? "text-[var(--ink-3)]" : "text-[var(--ink)]")
                    }
                  >
                    {s.title}
                  </span>
                  {st === "active" && <span className="chip chip-blue py-0 text-[11px]">进行中</span>}
                  {st === "skipped" && <span className="chip py-0 text-[11px]">已跳过</span>}
                  {s.id === "S6" && loops > 0 && st !== "pending" && (
                    <span className="chip chip-blue py-0 text-[11px]">循环 {loops} 轮</span>
                  )}
                </div>
                <div className="t-caption mt-0.5 leading-[1.55]">{s.desc}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function StepDot({ state, icon }: { state: StepState; icon: ReactNode }) {
  const base = "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition";
  if (state === "active") {
    return (
      <span
        className={base + " border-transparent text-white shadow-[var(--shadow-md)]"}
        style={{ background: "linear-gradient(135deg, var(--blue), var(--indigo))" }}
      >
        <Loader2 size={14} className="spin" />
      </span>
    );
  }
  if (state === "done") {
    return <span className={base + " border-transparent bg-[var(--blue-soft)] text-[var(--blue)]"}>{icon ?? <Check size={14} />}</span>;
  }
  if (state === "skipped") {
    return <span className={base + " border-dashed border-[var(--line-strong)] bg-transparent text-[var(--ink-3)]"}><MinusCircle size={14} /></span>;
  }
  return <span className={base + " border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-3)]"}><CircleDashed size={14} /></span>;
}
