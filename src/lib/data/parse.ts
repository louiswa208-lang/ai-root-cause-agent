import Papa from "papaparse";
import type { DataRow, Dataset, DatasetMetadata, EventRecord } from "./types";
import { METRIC_DEFS, metricAvailable } from "./metrics";

/** 列名别名：中文表头 / 英文表头 → 规范列名。detect_schema 使用。 */
const COLUMN_ALIASES: Record<string, string[]> = {
  exposure: ["exposure", "内容曝光量", "曝光量", "曝光次数", "impressions"],
  effective_view_users: ["effective_view_users", "有效播放人数", "有效观看人数", "有效观看", "effective_views"],
  search_users: ["search_users", "看后搜人数", "搜索人数"],
  l1_search_users: ["l1_search_users", "l1看后搜人数", "强引导看后搜人数"],
  l2_search_users: ["l2_search_users", "l2看后搜人数", "即时主动看后搜人数"],
  order_users: ["order_users", "看后搜成交人数", "成交人数", "下单人数"],
  gmv: ["gmv", "看后搜gmv", "成交金额", "交易额"],
  comments: ["comments", "评论数", "评论总数"],
  comment_users: ["comment_users", "评论用户数", "评论人数"],
  author_replies: ["author_replies", "作者回复数", "被作者回复的评论数", "作者回复评论数"],
  replied_users: ["replied_users", "被回复用户数"],
  replied_revisit_users: ["replied_revisit_users", "被回复用户复访数", "被回复后复访用户数"],
  sw_impressions: ["sw_impressions", "搜索词曝光次数", "出词曝光"],
  sw_clicks: ["sw_clicks", "搜索词点击次数", "出词点击"],
};

const DATE_ALIASES = ["date", "日期", "dt", "stat_date", "统计日期"];

const DIMENSION_LABELS: Record<string, string> = {
  scene: "分发场景",
  category: "一级品类",
  author_tier: "作者层级",
  app_version: "端与版本",
  traffic_type: "流量属性",
  user_type: "新老用户",
};

function norm(s: string): string {
  return String(s).trim().toLowerCase().replace(/\s|_/g, "");
}

function canonicalMeasure(header: string): string | null {
  const n = norm(header);
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some((a) => norm(a) === n)) return key;
  }
  return null;
}

function isDateColumn(header: string): boolean {
  return DATE_ALIASES.some((a) => norm(a) === norm(header));
}

function normalizeDate(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  if (/^\d{8}$/.test(s)) return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8);
  const num = Number(s);
  if (Number.isFinite(num) && num > 20000 && num < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export interface SchemaResult {
  dateColumn: string | null;
  dimensionColumns: string[];
  measureColumns: { source: string; canonical: string }[];
  unmapped: string[];
}

/** detect_schema Tool：识别日期列、维度列与可用度量列。 */
export function detectSchema(headers: string[], sample: Record<string, unknown>[]): SchemaResult {
  let dateColumn: string | null = null;
  const dimensionColumns: string[] = [];
  const measureColumns: { source: string; canonical: string }[] = [];
  const unmapped: string[] = [];
  for (const h of headers) {
    if (!dateColumn && (isDateColumn(h) || sample.some((r) => normalizeDate(r[h]) !== null))) {
      dateColumn = h;
      continue;
    }
    const canonical = canonicalMeasure(h);
    if (canonical) {
      measureColumns.push({ source: h, canonical });
      continue;
    }
    const values = sample.map((r) => r[h]).filter((v) => v !== undefined && v !== null && v !== "");
    const numericRatio = values.length ? values.filter((v) => Number.isFinite(Number(v))).length / values.length : 0;
    if (numericRatio > 0.9 && values.length > 0) unmapped.push(h);
    else dimensionColumns.push(h);
  }
  return { dateColumn, dimensionColumns, measureColumns, unmapped };
}

export function dimensionLabel(dim: string): string {
  return DIMENSION_LABELS[dim] ?? dim;
}

function toRows(records: Record<string, unknown>[], schema: SchemaResult): DataRow[] {
  const rows: DataRow[] = [];
  for (const rec of records) {
    const date = schema.dateColumn ? normalizeDate(rec[schema.dateColumn]) : null;
    if (!date) continue;
    const dims: Record<string, string> = {};
    for (const d of schema.dimensionColumns) dims[d] = String(rec[d] ?? "").trim();
    const measures: Record<string, number> = {};
    for (const m of schema.measureColumns) {
      const raw = rec[m.source];
      const num = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, ""));
      measures[m.canonical] = Number.isFinite(num) ? num : 0;
    }
    rows.push({ date, dims, measures });
  }
  return rows;
}

export function buildDataset(name: string, records: Record<string, unknown>[], events: EventRecord[] = []): Dataset {
  const headers = records.length ? Object.keys(records[0]) : [];
  const schema = detectSchema(headers, records.slice(0, 50));
  const rows = toRows(records, schema);
  const measures = schema.measureColumns.map((m) => m.canonical);
  const dates = rows.map((r) => r.date).sort();
  const availableMetrics = METRIC_DEFS.filter((d) => metricAvailable(measures, d.id)).map((d) => d.id);
  const warnings: string[] = [];
  if (!schema.dateColumn) warnings.push("未识别到日期列，无法做基线与趋势分析。");
  if (!rows.length) warnings.push("没有解析到有效数据行。");
  if (schema.unmapped.length) warnings.push("以下数值列未匹配到项目三指标口径，已忽略：" + schema.unmapped.join("、"));
  if (!availableMetrics.includes("M01")) warnings.push("数据中缺少 GMV 相关列，看后搜 GMV 四因子拆解不可用。");
  const metadata: DatasetMetadata = {
    name,
    rowCount: rows.length,
    dateColumn: schema.dateColumn ?? "",
    dateRange: { start: dates[0] ?? "", end: dates[dates.length - 1] ?? "" },
    dimensions: schema.dimensionColumns,
    measures,
    availableMetrics,
    warnings,
  };
  return { metadata, rows, events };
}

export function parseCsvText(text: string): Record<string, unknown>[] {
  const res = Papa.parse<Record<string, unknown>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });
  return res.data.filter((r) => r && Object.keys(r).length > 0);
}

/** 解析 xlsx / xls（SheetJS 在服务端动态引入，不进前端包）。 */
export async function parseWorkbookBuffer(buf: ArrayBuffer): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
}

export function parseEventsCsv(text: string): EventRecord[] {
  const records = parseCsvText(text);
  return records.map((r, i) => ({
    id: String(r["id"] ?? "EV" + String(i + 1).padStart(3, "0")),
    date: normalizeDate(r["date"]) ?? "",
    type: String(r["type"] ?? ""),
    name: String(r["name"] ?? ""),
    scopeDim: r["scope_dim"] ? String(r["scope_dim"]) : undefined,
    scopeValue: r["scope_value"] ? String(r["scope_value"]) : undefined,
    platform: r["platform"] ? String(r["platform"]) : undefined,
    ramp: r["ramp"] != null ? String(r["ramp"]) : undefined,
    layer: r["layer"] ? String(r["layer"]) : undefined,
    metrics: r["metrics"] ? String(r["metrics"]) : undefined,
    source: r["source"] ? String(r["source"]) : undefined,
  }));
}
