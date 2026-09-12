import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Dataset } from "./types";
import { buildDataset, parseCsvText, parseEventsCsv, parseWorkbookBuffer } from "./parse";

/**
 * 服务端数据集缓存。上传的数据只保存在内存中（带 TTL），不落盘、不外传。
 * Serverless 环境下同一实例内有效；缓存失效时前端会提示重新上传。
 */
const TTL_MS = 30 * 60 * 1000;
const store = new Map<string, { dataset: Dataset; at: number }>();

function gc() {
  const now = Date.now();
  for (const [id, v] of store) if (now - v.at > TTL_MS) store.delete(id);
}

export function putDataset(dataset: Dataset): string {
  gc();
  const id = randomUUID();
  store.set(id, { dataset, at: Date.now() });
  return id;
}

export function getDataset(id: string): Dataset | undefined {
  const hit = store.get(id);
  if (!hit) return undefined;
  hit.at = Date.now();
  return hit.dataset;
}

export const DEMO_DATASET_ID = "demo";

let demoPromise: Promise<Dataset> | null = null;

async function loadDemo(): Promise<Dataset> {
  const dir = path.join(process.cwd(), "public", "demo");
  const [metrics, events] = await Promise.all([
    readFile(path.join(dir, "demo-metrics.csv"), "utf8"),
    readFile(path.join(dir, "demo-events.csv"), "utf8"),
  ]);
  const ds = buildDataset("演示数据（方法演示数据，非真实业务数据）", parseCsvText(metrics), parseEventsCsv(events));
  store.set(DEMO_DATASET_ID, { dataset: ds, at: Date.now() });
  return ds;
}

export function getDemoDataset(): Promise<Dataset> {
  const cached = store.get(DEMO_DATASET_ID);
  if (cached) return Promise.resolve(cached.dataset);
  if (!demoPromise) demoPromise = loadDemo();
  return demoPromise;
}

export async function datasetFromUpload(file: File, eventsFile?: File | null): Promise<Dataset> {
  const name = file.name;
  const buf = await file.arrayBuffer();
  const isExcel = /\.(xlsx|xlsm|xls)$/i.test(name);
  const records = isExcel ? await parseWorkbookBuffer(buf) : parseCsvText(new TextDecoder("utf-8").decode(buf));
  let events = undefined;
  if (eventsFile) {
    const ebuf = await eventsFile.arrayBuffer();
    const etext = /\.(xlsx|xlsm|xls)$/i.test(eventsFile.name)
      ? JSON.stringify(await parseWorkbookBuffer(ebuf))
      : new TextDecoder("utf-8").decode(ebuf);
    events = /\.(xlsx|xlsm|xls)$/i.test(eventsFile.name)
      ? (JSON.parse(etext) as Record<string, unknown>[]).map((r, i) => ({
          id: String(r["id"] ?? "EV" + String(i + 1).padStart(3, "0")),
          date: String(r["date"] ?? ""),
          type: String(r["type"] ?? ""),
          name: String(r["name"] ?? ""),
          scopeDim: r["scope_dim"] ? String(r["scope_dim"]) : undefined,
          scopeValue: r["scope_value"] ? String(r["scope_value"]) : undefined,
          platform: r["platform"] ? String(r["platform"]) : undefined,
          ramp: r["ramp"] != null ? String(r["ramp"]) : undefined,
          layer: r["layer"] ? String(r["layer"]) : undefined,
          metrics: r["metrics"] ? String(r["metrics"]) : undefined,
          source: r["source"] ? String(r["source"]) : undefined,
        }))
      : parseEventsCsv(etext);
  }
  return buildDataset(name, records, events ?? []);
}
