/**
 * 端到端案例回归：依次跑若干问题，打印每个案例走过的 Graph 路径与归因结论。
 * 用法：node scripts/run-cases.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://127.0.0.1:3111";

const CASES = [
  { name: "案例 A · 看后搜 GMV 下降（预期：搜索层）", q: "为什么 2026-09-12 的看后搜 GMV 下降了？" },
  { name: "案例 B · 看后搜 GMV 下降（预期：商品结构 / 客单价）", q: "2026-09-05 看后搜 GMV 为什么跌了？" },
  { name: "案例 C · 作者回复率下降（预期：互动层，跳过四因子拆解）", q: "2026-09-10 作者回复率为什么下降？" },
  { name: "案例 D · 数据异常日（预期：早停，不做业务归因）", q: "2026-09-11 的看后搜 GMV 怎么了？" },
];

async function waitForServer(retries = 60) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const r = await fetch(BASE + "/api/dataset");
      if (r.ok) return await r.json();
    } catch {
      /* 服务器还没起来 */
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error("等待服务器超时：" + BASE);
}

async function runCase(c) {
  const res = await fetch(BASE + "/api/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ datasetId: "demo", question: c.q }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + (await res.text()));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const path = [];
  const stages = [];
  const steps = [];
  let diagnosis = null;
  let llm = null;
  let decomposition = null;
  let loops = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const evt = JSON.parse(line.slice(5).trim());
      if (evt.type === "start") llm = evt.llm;
      if (evt.type === "node") {
        path.push(evt.node);
        if (evt.stage && stages[stages.length - 1] !== evt.stage) stages.push(evt.stage);
        for (const s of evt.steps ?? []) steps.push(s);
        if (evt.patch?.decompositionResult) decomposition = evt.patch.decompositionResult;
        if (evt.patch?.finalDiagnosis) diagnosis = evt.patch.finalDiagnosis;
        if (typeof evt.patch?.validationLoops === "number") loops = Math.max(loops, evt.patch.validationLoops);
      }
      if (evt.type === "error") throw new Error("Agent 运行出错：" + evt.message);
    }
  }
  return { path, stages, steps, diagnosis, llm, decomposition, loops };
}

const meta = await waitForServer();
console.log("数据集：", meta.metadata.name, "|", meta.metadata.rowCount, "行 |", meta.metadata.dateRange.start, "~", meta.metadata.dateRange.end);
console.log("可用指标：", meta.metadata.availableMetrics.join(", "));

let failures = 0;
for (const c of CASES) {
  console.log("\n========================================");
  console.log(c.name);
  console.log("问题：", c.q);
  try {
    const r = await runCase(c);
    console.log("LLM：", r.llm?.enabled ? r.llm.model : "未配置 Key（确定性回退）");
    console.log("Graph 路径：", r.path.join(" → "));
    console.log("阶段序列：", r.stages.join(" → "));
    console.log("验证循环轮次：", r.loops);
    if (r.decomposition) {
      console.log(
        "四因子贡献：",
        r.decomposition.factors.map((f) => f.label + " " + (f.share * 100).toFixed(0) + "%").join(" | "),
        "→ 主因子",
        r.decomposition.dominantFactor,
        "| 对账差",
        r.decomposition.reconciliation.toFixed(6),
      );
    }
    if (r.diagnosis) {
      console.log("结论：", r.diagnosis.headline);
      console.log("叙述：", r.diagnosis.narrative);
      console.log(
        "候选原因：",
        r.diagnosis.causes.map((x) => x.causeId + " " + x.name + "（" + x.confidence + "）").join(" | ") || "无",
      );
      console.log("后续动作：", r.diagnosis.actions.map((a) => a.type + "：" + a.detail).join(" | "));
    } else {
      failures += 1;
      console.log("!! 没有拿到归因结论");
    }
  } catch (err) {
    failures += 1;
    console.log("!! 失败：", err.message);
  }
}
console.log("\n完成，失败", failures, "个");
process.exit(failures ? 1 : 0);
