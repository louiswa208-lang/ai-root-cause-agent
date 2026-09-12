"use client";

export const STAGES = [
  { id: "S1", label: "验证异常", hint: "确认数据可信、偏离是否超过阈值" },
  { id: "S2", label: "定位链路层级", hint: "判断变化首先出现在哪一层" },
  { id: "S3", label: "指标拆解", hint: "找出主贡献因子" },
  { id: "S4", label: "维度下钻", hint: "定位影响范围" },
  { id: "S5", label: "原因匹配", hint: "匹配事件与候选原因" },
  { id: "S6", label: "证据验证", hint: "判断证据是否充分" },
  { id: "S7", label: "输出结论", hint: "形成归因结论与后续动作" },
] as const;

export function StageTimeline({ current, done }: { current?: string; done: Set<string> }) {
  return (
    <ol className="flex flex-col gap-1">
      {STAGES.map((s) => {
        const isDone = done.has(s.id) && s.id !== current;
        const isCurrent = s.id === current;
        return (
          <li key={s.id} className="flex items-start gap-3 py-1.5">
            <span
              className={
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] " +
                (isDone
                  ? "bg-[var(--blue)] text-white"
                  : isCurrent
                    ? "bg-[var(--blue-lt)] text-[var(--blue)] pulse"
                    : "border border-[var(--line)] text-[var(--ink3)]")
              }
            >
              {isDone ? "✓" : isCurrent ? "●" : "○"}
            </span>
            <div className="min-w-0">
              <div className={"text-sm " + (isCurrent ? "font-semibold text-[var(--blue)]" : isDone ? "" : "muted")}>
                {s.label}
              </div>
              <div className="text-xs muted">{s.hint}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
