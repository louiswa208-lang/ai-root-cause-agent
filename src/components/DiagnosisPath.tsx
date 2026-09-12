"use client";

import { ChevronRight, MessageSquare, PlayCircle, Search, ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";
import { Card, Tooltip } from "./ui";

interface LayerDef {
  name: string;
  sub: string;
  metrics: string;
  icon: ReactNode;
}

const LAYERS: LayerDef[] = [
  { name: "内容层", sub: "曝光与观看", metrics: "I09 曝光 · M09 有效播放", icon: <PlayCircle size={17} /> },
  { name: "互动层", sub: "评论与回复", metrics: "H01 评论率 · H02 作者回复率", icon: <MessageSquare size={17} /> },
  { name: "搜索层", sub: "看后搜转化", metrics: "M12 看后搜率 · M20 出词点击率", icon: <Search size={17} /> },
  { name: "交易层", sub: "成交与客单", metrics: "M16 成交转化率 · M18 客单价", icon: <ShoppingCart size={17} /> },
];

/**
 * 全链路诊断路径：把四层链路画出来，并高亮本次实际走到的层。
 * 互动 → 搜索为产品假设关系，用虚线区分。
 */
export function DiagnosisPath({
  activeLayer,
  visitedLayers,
  note,
}: {
  activeLayer?: string;
  visitedLayers: string[];
  note?: string;
}) {
  return (
    <Card
      title="业务诊断路径"
      icon={<ChevronRight size={16} />}
      hint={
        <>
          内容 → 互动 → 搜索 → 交易是项目三诊断树的链路顺序。
          <b className="text-[var(--ink)]">互动 → 搜索属于产品假设关系</b>
          （虚线），未经实验验证时不表述为因果，置信度最高只能到「候选」。
        </>
      }
    >
      <div className="x-scroll pb-1">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:min-w-[560px] sm:items-stretch sm:gap-1.5">
          {LAYERS.map((l, i) => {
            const isActive = activeLayer === l.name;
            const isVisited = visitedLayers.includes(l.name);
            return (
              <div key={l.name} className="flex min-w-0 flex-1 items-stretch gap-1.5">
                <div
                  className={
                    "min-w-0 flex-1 rounded-xl border p-3 transition " +
                    (isActive
                      ? "border-transparent text-white shadow-[var(--shadow-md)]"
                      : isVisited
                        ? "border-[var(--blue)] bg-[var(--blue-soft)]"
                        : "border-[var(--line)] bg-[var(--surface-2)]")
                  }
                  style={isActive ? { background: "linear-gradient(135deg, var(--blue), var(--indigo))" } : undefined}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={isActive ? "text-white" : isVisited ? "text-[var(--blue)]" : "text-[var(--ink-3)]"}>
                      {l.icon}
                    </span>
                    <span
                      className={
                        "text-[13px] font-semibold " +
                        (isActive ? "text-white" : isVisited ? "text-[var(--blue)]" : "text-[var(--ink-3)]")
                      }
                    >
                      {l.name}
                    </span>
                    {isActive && <span className="ml-auto rounded bg-white/20 px-1.5 py-0.5 text-[10px]">首发层</span>}
                  </div>
                  <div className={"mt-1 text-[11px] leading-[1.5] " + (isActive ? "text-white/80" : "muted")}>{l.sub}</div>
                  <div className={"mt-1.5 text-[11px] leading-[1.5] " + (isActive ? "text-white/70" : "muted")}>
                    {l.metrics}
                  </div>
                </div>
                {i < LAYERS.length - 1 && (
                  <div className="hidden shrink-0 items-center sm:flex">
                    <span
                      className={
                        "text-[var(--ink-3)] " + (i === 1 ? "opacity-50" : "")
                      }
                      title={i === 1 ? "互动 → 搜索：产品假设关系" : undefined}
                    >
                      {i === 1 ? <DashedArrow /> : <ChevronRight size={16} />}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {note && <div className="t-caption mt-2.5 leading-[1.65]">{note}</div>}
    </Card>
  );
}

function DashedArrow() {
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-label="产品假设关系">
      <line x1="0" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
      <path d="M14 2.5 L19 6 L14 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
