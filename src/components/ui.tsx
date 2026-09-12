"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";

/** 区块卡片：统一标题行 + 内容区。 */
export function Card({
  icon,
  title,
  extra,
  hint,
  children,
  className = "",
  bodyClassName = "card-pad",
}: {
  icon?: ReactNode;
  title?: ReactNode;
  extra?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={"card rise " + className}>
      {title && (
        <header className="card-head">
          {icon && <span className="flex items-center text-[var(--blue)]">{icon}</span>}
          <h2 className="t-section min-w-0 flex-1 truncate">{title}</h2>
          {hint && <Tooltip text={hint} />}
          {extra}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** 悬浮说明：用于解释「贡献度超过 100%」这类需要口径说明的数字。 */
export function Tooltip({ text, label }: { text: ReactNode; label?: string }) {
  return (
    <span className="group relative inline-flex items-center align-middle">
      <span className="inline-flex cursor-help items-center gap-1 text-[var(--ink-3)] hover:text-[var(--blue)]">
        <Info size={14} />
        {label && <span className="text-[12px]">{label}</span>}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-30 hidden w-[280px] rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2.5 text-[12px] leading-[1.6] font-normal text-[var(--ink-2)] shadow-[var(--shadow-lg)] group-hover:block"
      >
        {text}
      </span>
    </span>
  );
}

/** 关键数字卡：数值必须带单位，由调用方传入格式化后的字符串。 */
export function Stat({
  label,
  value,
  sub,
  tone = "default",
  icon,
  hint,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: "default" | "up" | "down" | "blue";
  icon?: ReactNode;
  hint?: ReactNode;
}) {
  const color =
    tone === "down" ? "text-[var(--red)]" : tone === "up" ? "text-[var(--green)]" : tone === "blue" ? "text-[var(--blue)]" : "";
  return (
    <div className="card-quiet p-3.5">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-[var(--ink-3)]">{icon}</span>}
        <span className="t-caption flex-1">{label}</span>
        {hint && <Tooltip text={hint} />}
      </div>
      <div className={"t-metric-sm mt-1.5 " + color}>{value}</div>
      {sub && <div className="t-caption mt-1">{sub}</div>}
    </div>
  );
}

export function Chip({
  children,
  tone = "default",
  icon,
  title,
}: {
  children: ReactNode;
  tone?: "default" | "blue" | "green" | "amber" | "red" | "ghost";
  icon?: ReactNode;
  title?: string;
}) {
  return (
    <span className={"chip chip-" + tone} title={title}>
      {icon}
      {children}
    </span>
  );
}

/** 证据分进度条。 */
export function ScoreBar({ score }: { score: number }) {
  const tone = score >= 75 ? "var(--green)" : score >= 50 ? "var(--blue)" : "var(--amber)";
  return (
    <div className="flex items-center gap-2">
      <div className="meter w-[72px]">
        <i style={{ width: Math.max(4, Math.min(100, score)) + "%", background: tone }} />
      </div>
      <span className="num text-[12px] font-semibold" style={{ color: tone }}>
        {score}
        <span className="muted font-normal">/100</span>
      </span>
    </div>
  );
}

export function EmptyHint({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--blue-soft)] text-[var(--blue)]">
        {icon}
      </span>
      <div className="t-section">{title}</div>
      {children && <div className="t-caption max-w-[520px] leading-[1.75]">{children}</div>}
    </div>
  );
}
