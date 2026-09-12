"use client";

import { Ban, CheckCircle2, CircleAlert, FlaskConical, Target, Users } from "lucide-react";
import type { FinalDiagnosis } from "@/lib/agent/state";
import { Card, ScoreBar } from "./ui";

type CauseItem = FinalDiagnosis["causes"][number];

const LEVEL_TONE: Record<string, string> = {
  确认: "chip-green",
  高度相关: "chip-blue",
  候选: "chip-amber",
};

/** 候选原因卡片：证据分 + 支撑证据 + 缺失证据 + 建议验证 + 对接方。 */
export function RootCauseCards({ causes }: { causes: CauseItem[] }) {
  if (!causes.length) return null;
  return (
    <Card
      icon={<Target size={16} />}
      title="候选原因"
      hint="证据分由四项确定性判定加总：业务类型兼容的事件 40 分、影响范围一致 25 分、对照验证 25 分、机制关系可解释 10 分。"
      bodyClassName="p-0"
    >
      <div className="flex flex-col">
        {causes.map((c, i) => (
          <article key={c.causeId} className={"px-4 py-4 " + (i < causes.length - 1 ? "border-b border-[var(--line)]" : "")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="num chip chip-ghost py-0 text-[11px] font-semibold">{c.causeId}</span>
              <h3 className="text-[14px] font-semibold">{c.name}</h3>
              <span className={"chip py-0 text-[11px] " + (LEVEL_TONE[c.confidence] ?? "chip")}>{c.confidence}</span>
              <span className="ml-auto">
                <ScoreBar score={c.score} />
              </span>
            </div>

            {c.scoreBreakdown?.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {c.scoreBreakdown.map((b) => (
                  <span
                    key={b.label}
                    className={"chip py-0 text-[11px] " + (b.hit ? "chip-blue" : "chip-ghost")}
                    title={b.label + "：" + b.got + " / " + b.max + " 分"}
                  >
                    {b.hit ? <CheckCircle2 size={11} /> : <CircleAlert size={11} />}
                    {b.label} {b.got}/{b.max}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Block icon={<CheckCircle2 size={13} />} title="支撑证据" tone="green" items={c.reasons} empty="暂无可计入的正向证据" />
              <Block icon={<CircleAlert size={13} />} title="缺失证据" tone="amber" items={c.missing} empty="无明显缺口" />
            </div>

            {c.supportingEvents?.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="t-caption">关联事件</span>
                {c.supportingEvents.map((e) => (
                  <span key={e.id} className="chip chip-wrap chip-blue py-0 text-[11px]">
                    {e.date} {e.name}（{e.strength}）
                  </span>
                ))}
              </div>
            )}

            {c.rejectedEvents?.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {c.rejectedEvents.map((r) => (
                  <div key={r.eventId} className="flex items-start gap-1.5 text-[12px] leading-[1.6] text-[var(--ink-3)]">
                    <Ban size={12} className="mt-0.5 shrink-0" />
                    <span>
                      已排除「{r.name}」：{r.reason}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="card-quiet flex items-start gap-2 p-2.5">
                <FlaskConical size={14} className="mt-0.5 shrink-0 text-[var(--blue)]" />
                <div>
                  <div className="t-caption">建议验证方式</div>
                  <div className="mt-0.5 text-[12px] leading-[1.6] text-[var(--ink-2)]">{c.verifyMethod || "—"}</div>
                </div>
              </div>
              <div className="card-quiet flex items-start gap-2 p-2.5">
                <Users size={14} className="mt-0.5 shrink-0 text-[var(--indigo)]" />
                <div>
                  <div className="t-caption">需要对接</div>
                  <div className="mt-0.5 text-[12px] leading-[1.6] text-[var(--ink-2)]">{c.partner || "—"}</div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function Block({
  icon,
  title,
  tone,
  items,
  empty,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "green" | "amber";
  items: string[];
  empty: string;
}) {
  const color = tone === "green" ? "var(--green)" : "var(--amber)";
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color }}>
        {icon}
        {title}
      </div>
      <ul className="mt-1.5 flex flex-col gap-1">
        {items.length ? (
          items.map((t, i) => (
            <li key={i} className="flex gap-1.5 text-[12px] leading-[1.65] text-[var(--ink-2)]">
              <span style={{ color }}>·</span>
              <span>{t}</span>
            </li>
          ))
        ) : (
          <li className="t-caption">{empty}</li>
        )}
      </ul>
    </div>
  );
}
