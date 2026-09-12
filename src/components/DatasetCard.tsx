"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Database,
  Layers3,
  Rows3,
  Upload,
  XCircle,
} from "lucide-react";
import type { DatasetMetadata } from "@/lib/data/types";
import type { CapabilityReportLike } from "./types";
import { Card } from "./ui";

const METRIC_LABEL: Record<string, string> = {
  I09: "内容曝光量",
  M09: "有效播放人数",
  I21: "曝光→有效观看效率",
  H01: "评论率",
  H02: "作者回复率",
  H03: "被回复用户复访率",
  M10: "看后搜人数",
  M12: "看后搜率",
  M20: "搜索词点击率",
  L1: "L1 看后搜人数",
  L2: "L2 看后搜人数",
  M04: "成交人数",
  M16: "成交转化率",
  M18: "客单价",
  M01: "看后搜 GMV",
};

const DIM_LABEL: Record<string, string> = {
  scene: "分发场景",
  category: "一级品类",
  author_tier: "作者层级",
  app_version: "端与版本",
};

/**
 * 数据集卡片：先回答「这份数据能分析什么」。
 * 缺字段不报错，而是降级说明哪些分析做不了。
 */
export function DatasetCard({
  meta,
  capability,
  isDemo,
  uploading,
  onUpload,
  onUseDemo,
}: {
  meta: DatasetMetadata | null;
  capability: CapabilityReportLike | null;
  isDemo: boolean;
  uploading: boolean;
  onUpload: (f: File) => void;
  onUseDemo: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!meta) {
    return (
      <Card icon={<Database size={16} />} title="数据集">
        <div className="t-caption pulse">正在加载演示数据…</div>
      </Card>
    );
  }

  const readiness = capability?.readiness ?? null;
  const readyTone = readiness === null ? "var(--ink-3)" : readiness >= 80 ? "var(--green)" : readiness >= 50 ? "var(--blue)" : "var(--amber)";

  return (
    <Card
      icon={<Database size={16} />}
      title="数据集"
      extra={
        <label className="btn btn-sm cursor-pointer">
          <Upload size={13} />
          {uploading ? "解析中…" : "上传"}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
      }
    >
      <div className="t-body font-medium leading-snug">{meta.name}</div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat icon={<Rows3 size={13} />} label="明细行" value={meta.rowCount.toLocaleString("zh-CN")} />
        <MiniStat icon={<Layers3 size={13} />} label="维度" value={String(meta.dimensions.length)} />
        <MiniStat icon={<CalendarDays size={13} />} label="天数" value={String(dayCount(meta))} />
      </div>

      {readiness !== null && (
        <div className="mt-3.5">
          <div className="flex items-baseline justify-between">
            <span className="t-caption">数据完备度 Data Readiness</span>
            <span className="num text-[15px] font-semibold" style={{ color: readyTone }}>
              {readiness}%
            </span>
          </div>
          <div className="meter mt-1.5">
            <i style={{ width: readiness + "%", background: readyTone }} />
          </div>
          <div className="t-caption mt-1.5">
            可执行 {capability!.supported.length} 项分析
            {capability!.unsupported.length > 0 && ` · ${capability!.unsupported.length} 项受限于缺失字段`}
          </div>
        </div>
      )}

      <div className="mt-3.5">
        <div className="t-caption mb-1.5">可用指标</div>
        <div className="flex flex-wrap gap-1.5">
          {meta.availableMetrics.map((m) => (
            <span key={m} className="chip chip-blue" title={METRIC_LABEL[m] ?? m}>
              {METRIC_LABEL[m] ?? m}
            </span>
          ))}
          {!meta.availableMetrics.length && <span className="t-caption">未识别到可计算的指标</span>}
        </div>
      </div>

      <div className="mt-3">
        <div className="t-caption mb-1.5">可下钻维度</div>
        <div className="flex flex-wrap gap-1.5">
          {meta.dimensions.map((d) => (
            <span key={d} className="chip" title={d}>
              {DIM_LABEL[d] ?? d}
            </span>
          ))}
          {!meta.dimensions.length && (
            <span className="chip chip-amber">
              <AlertTriangle size={12} />
              无维度列，无法下钻与做对照
            </span>
          )}
        </div>
      </div>

      {meta.warnings.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {meta.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[12px] leading-[1.6] text-[var(--amber)]">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      {capability && (
        <div className="mt-3 border-t border-[var(--line)] pt-2.5">
          <button
            className="flex w-full items-center gap-1.5 text-[12px] text-[var(--ink-2)] hover:text-[var(--blue)]"
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown size={14} className={"transition-transform " + (open ? "rotate-180" : "")} />
            这份数据能分析什么
          </button>
          {open && (
            <div className="mt-2 flex flex-col gap-1.5">
              {capability.supported.map((s) => (
                <div key={s.id} className="flex items-start gap-1.5 text-[12px] leading-[1.6]">
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[var(--green)]" />
                  <span className="text-[var(--ink-2)]">
                    <span className="muted num mr-1">{s.stage}</span>
                    {s.name}
                  </span>
                </div>
              ))}
              {capability.unsupported.map((u) => (
                <div key={u.id} className="flex items-start gap-1.5 text-[12px] leading-[1.6]">
                  <XCircle size={13} className="mt-0.5 shrink-0 text-[var(--ink-3)]" />
                  <span className="text-[var(--ink-3)]">
                    <span className="num mr-1">{u.stage}</span>
                    {u.name}
                    <span className="text-[var(--amber)]"> · 缺 {u.missing.join("、")}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isDemo && (
        <button className="btn btn-sm mt-3 w-full" onClick={onUseDemo}>
          用回演示数据
        </button>
      )}
      {isDemo && <div className="t-caption mt-3">模拟业务数据，非真实业务数据；阈值为示例参数。</div>}
    </Card>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card-quiet px-2.5 py-2">
      <div className="flex items-center gap-1 text-[var(--ink-3)]">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="num mt-0.5 text-[15px] font-semibold">{value}</div>
    </div>
  );
}

function dayCount(meta: DatasetMetadata): number {
  const a = new Date(meta.dateRange.start + "T00:00:00Z").getTime();
  const b = new Date(meta.dateRange.end + "T00:00:00Z").getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}
