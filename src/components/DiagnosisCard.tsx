"use client";

import type { FinalDiagnosis } from "@/lib/agent/state";

const LEVEL_STYLE: Record<string, string> = {
  确认: "bg-[#e3f0dd] text-[#3f6b34] border-transparent",
  高度相关: "bg-[var(--blue-lt)] text-[var(--blue)] border-transparent",
  候选: "bg-[#f5efd8] text-[#8a6d1f] border-transparent",
};

export function DiagnosisCard({ d }: { d: FinalDiagnosis }) {
  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tag tag-blue">S7 归因结论</span>
        <span className="tag">{d.targetDate}</span>
        <span className="tag">{d.layerLabel}</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold">{d.headline}</h3>
      <p className="mt-2 text-sm leading-7">{d.narrative}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { k: "异常与偏离", v: d.deviationText },
          { k: "主贡献因子", v: d.dominantFactorText },
          { k: "影响范围", v: d.topDimensionText },
        ].map((x) => (
          <div key={x.k} className="rounded-lg border border-[var(--line)] p-3">
            <div className="text-xs muted">{x.k}</div>
            <div className="mt-1 text-sm leading-6">{x.v}</div>
          </div>
        ))}
      </div>

      {d.causes.length > 0 && (
        <div className="mt-5">
          <div className="text-sm font-semibold">候选原因与置信度</div>
          <div className="mt-2 flex flex-col gap-2">
            {d.causes.map((c) => (
              <div key={c.causeId} className="rounded-lg border border-[var(--line)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {c.causeId} {c.name}
                  </span>
                  <span className={"tag " + (LEVEL_STYLE[c.confidence] ?? "")}>{c.confidence}</span>
                </div>
                {c.reasons.length > 0 && (
                  <ul className="mt-1.5 list-disc pl-5 text-xs leading-6 muted">
                    {c.reasons.slice(0, 3).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
                {c.missing.length > 0 && (
                  <div className="mt-1 text-xs muted">还缺：{c.missing.slice(0, 2).join("；")}</div>
                )}
                {c.verifyMethod && <div className="mt-1 text-xs muted">验证方法：{c.verifyMethod}</div>}
                {c.partner && <div className="mt-1 text-xs muted">建议协作方：{c.partner}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-sm font-semibold">后续动作</div>
          <ul className="mt-2 list-disc pl-5 text-sm leading-6">
            {d.actions.map((a, i) => (
              <li key={i}>
                <span className="font-medium">{a.type}</span>：{a.detail}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold">口径与边界</div>
          <ul className="mt-2 list-disc pl-5 text-xs leading-6 muted">
            {d.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
