"use client";

import { Cpu, GitBranch, Network, ShieldCheck } from "lucide-react";
import type { LlmInfo } from "./types";

/** 顶部：产品标识 + 一句话定位 + 技术栈标识。 */
export function AppHeader({ llm }: { llm: LlmInfo | null }) {
  const modelText = llm?.enabled
    ? (llm.provider === "deepseek" ? "DeepSeek" : llm.provider === "anthropic" ? "Anthropic" : llm.provider ?? "LLM") +
      " · " + (llm.model ?? "")
    : "确定性回退模式（未配置 API Key）";

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--blue)] to-[var(--indigo)] text-white shadow-[var(--shadow-md)]">
            <Network size={20} />
          </span>
          <div className="min-w-0">
            <div className="t-section truncate text-[16px]">全链路波动归因 Agent</div>
            <div className="t-caption truncate">
              内容 → 互动 → 搜索 → 交易：异常识别 · 指标拆解 · 事件归因 · 证据验证
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="badge-grad">
            <GitBranch size={13} />
            Orchestrated by LangGraph
          </span>
          <span className="chip" title={modelText}>
            <Cpu size={13} />
            <span className="max-w-[180px] truncate">{modelText}</span>
          </span>
          <span className="chip chip-ghost" title="演示数据为模拟业务数据，不含任何真实业务数据">
            <ShieldCheck size={13} />
            模拟业务数据
          </span>
        </div>
      </div>
    </header>
  );
}
