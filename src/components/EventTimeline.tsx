"use client";

import { CalendarClock, Check, X } from "lucide-react";
import type { EventLike } from "./types";
import { Card } from "./ui";

const STRENGTH_TONE: Record<EventLike["strength"], { chip: string; dot: string }> = {
  强匹配: { chip: "chip-green", dot: "var(--green)" },
  中等匹配: { chip: "chip-blue", dot: "var(--blue)" },
  弱匹配: { chip: "chip-amber", dot: "var(--amber)" },
  仅时间接近: { chip: "chip", dot: "var(--ink-3)" },
};

/**
 * 事件时间轴：按匹配强度排序，并逐条说明四项判定。
 * 「仅时间接近」的事件会被明确标注为不作为证据。
 */
export function EventTimeline({ events, targetDate }: { events: EventLike[]; targetDate?: string }) {
  if (!events.length) return null;
  const usable = events.filter((e) => e.strength !== "仅时间接近").length;

  return (
    <Card
      icon={<CalendarClock size={16} />}
      title="事件时间轴"
      hint={
        <>
          匹配优先级：<b className="text-[var(--ink)]">业务类型 &gt; 影响层 &gt; 影响范围 &gt; 时间接近</b>。
          时间接近本身不构成匹配——业务类型或影响范围不符的事件会被标为「仅时间接近」，不作为该原因的正向证据。
        </>
      }
      extra={
        <span className="t-caption whitespace-nowrap">
          {events.length} 条 · {usable} 条可用
        </span>
      }
      bodyClassName="p-0"
    >
      <ol className="flex flex-col">
        {events.map((e, i) => {
          const tone = STRENGTH_TONE[e.strength] ?? STRENGTH_TONE["弱匹配"];
          const dimmed = e.strength === "仅时间接近";
          return (
            <li
              key={e.id}
              className={
                "flex gap-3 px-4 py-3.5 " +
                (i < events.length - 1 ? "border-b border-[var(--line)] " : "") +
                (dimmed ? "opacity-70" : "")
              }
            >
              <div className="flex flex-col items-center pt-0.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tone.dot }} />
                {i < events.length - 1 && <span className="mt-1 w-px flex-1 bg-[var(--line)]" style={{ minHeight: 16 }} />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="num text-[12px] font-semibold text-[var(--ink-2)]">{e.date}</span>
                  <span className="chip chip-wrap py-0 text-[11px]">{e.type}</span>
                  {e.layer && <span className="chip py-0 text-[11px]">{e.layer}</span>}
                  <span className={"chip py-0 text-[11px] " + tone.chip}>{e.strength}</span>
                  {e.ramp && <span className="chip py-0 text-[11px]">放量 {e.ramp}</span>}
                </div>

                <div className={"mt-1 text-[13px] font-medium " + (dimmed ? "text-[var(--ink-2)]" : "")}>{e.name}</div>

                <div className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  <Criterion ok={e.criteria.business.ok} label="业务类型" text={e.criteria.business.text} />
                  <Criterion ok={e.criteria.layer.ok} label="影响层" text={e.criteria.layer.text} />
                  <Criterion ok={e.criteria.scope.ok} label="影响范围" text={e.criteria.scope.text} />
                  <Criterion
                    ok
                    label="时间"
                    text={e.criteria.time.text + (targetDate ? "（异常日 " + targetDate + "）" : "")}
                  />
                </div>

                {dimmed && (
                  <div className="mt-2 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-[12px] leading-[1.6] text-[var(--ink-3)]">
                    不作为正向证据：{e.matchReason}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Criterion({ ok, label, text }: { ok: boolean; label: string; text: string }) {
  return (
    <div className="flex items-start gap-1.5 text-[12px] leading-[1.55]">
      <span className={"mt-0.5 shrink-0 " + (ok ? "text-[var(--green)]" : "text-[var(--ink-3)]")}>
        {ok ? <Check size={12} /> : <X size={12} />}
      </span>
      <span className="muted shrink-0">{label}</span>
      <span className={ok ? "text-[var(--ink-2)]" : "text-[var(--ink-3)]"}>{text}</span>
    </div>
  );
}
