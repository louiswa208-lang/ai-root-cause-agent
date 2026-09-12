"use client";

import {
  ActivitySquare,
  AlertTriangle,
  Crosshair,
  Eye,
  FlaskConical,
  Gauge,
  Layers,
  ListTodo,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import type { FinalDiagnosis } from "@/lib/agent/state";
import { Card } from "./ui";

/** S7 结论：四张关键卡 + 结论正文 + 口径边界。 */
export function FinalDiagnosisPanel({ d }: { d: FinalDiagnosis }) {
  const top = d.causes[0];
  return (
    <Card icon={<ActivitySquare size={16} />} title="归因结论">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--blue-soft)] px-4 py-3">
        <div className="t-caption">{d.targetDate} · {d.metricLabel}（{d.metricId}）</div>
        <div className="t-section mt-1 text-[17px] leading-snug">{d.headline}</div>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <KeyCard icon={<Gauge size={14} />} label="异常幅度" value={d.deviationText} />
        <KeyCard icon={<Layers size={14} />} label="首发层与主贡献" value={d.dominantFactorText} />
        <KeyCard icon={<Crosshair size={14} />} label="影响范围" value={d.topDimensionText} />
        <KeyCard
          icon={<FlaskConical size={14} />}
          label="首位原因与置信度"
          value={top ? `${top.causeId} ${top.name}` : "未匹配到候选原因"}
          tag={top ? `${top.confidence} · 证据分 ${top.score}/100` : undefined}
        />
      </div>

      <p className="t-body mt-3.5 text-[var(--ink-2)]">{d.narrative}</p>

      <ActionPanel actions={d.actions} />

      <div className="mt-4 border-t border-[var(--line)] pt-3">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-3)]">
          <ShieldAlert size={13} />
          口径与边界
        </div>
        <ul className="mt-1.5 flex flex-col gap-1">
          {d.caveats.map((c, i) => (
            <li key={i} className="t-caption flex gap-1.5 leading-[1.65]">
              <span>·</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function KeyCard({ icon, label, value, tag }: { icon: React.ReactNode; label: string; value: string; tag?: string }) {
  return (
    <div className="card-quiet p-3">
      <div className="flex items-center gap-1.5 text-[var(--ink-3)]">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="num mt-1.5 text-[13px] font-semibold leading-[1.55]">{value}</div>
      {tag && <div className="mt-1.5"><span className="chip chip-blue py-0 text-[11px]">{tag}</span></div>}
    </div>
  );
}

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

/** 行动建议：类型图标 + 优先级 + 对接方。 */
export function ActionPanel({ actions }: { actions: FinalDiagnosis["actions"] }) {
  if (!actions.length) return null;
  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold">
        <ListTodo size={14} className="text-[var(--blue)]" />
        下一步行动
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {actions.map((a, i) => (
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
    </div>
  );
}
