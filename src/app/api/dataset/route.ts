import { NextResponse } from "next/server";
import { DEMO_DATASET_ID, datasetFromUpload, getDemoDataset, putDataset } from "@/lib/data/store";
import { providerInfo } from "@/lib/agent/llm";
import { assessCapability } from "@/lib/tools/capability";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/dataset —— 加载演示数据集，返回元信息。 */
export async function GET() {
  const ds = await getDemoDataset();
  return NextResponse.json({
    datasetId: DEMO_DATASET_ID,
    metadata: ds.metadata,
    events: ds.events,
    capability: assessCapability(ds.metadata, undefined, ds.events.length),
    llm: providerInfo(),
    isDemo: true,
  });
}

/** POST /api/dataset —— 上传 CSV / Excel（可选附带事件时间轴），解析后缓存在服务端内存。 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const eventsFile = form.get("events");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传数据文件（CSV 或 Excel）" }, { status: 400 });
    }
    const ds = await datasetFromUpload(file, eventsFile instanceof File ? eventsFile : null);
    if (!ds.rows.length) {
      return NextResponse.json({ error: "没有解析到有效数据行，请检查日期列与表头", metadata: ds.metadata }, { status: 422 });
    }
    const datasetId = putDataset(ds);
    return NextResponse.json({
      datasetId,
      metadata: ds.metadata,
      events: ds.events,
      capability: assessCapability(ds.metadata, undefined, ds.events.length),
      llm: providerInfo(),
      isDemo: false,
    });
  } catch (err) {
    console.error("[api/dataset] 解析失败", err);
    return NextResponse.json({ error: "文件解析失败：" + (err as Error).message }, { status: 500 });
  }
}
