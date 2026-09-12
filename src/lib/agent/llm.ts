import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";

/**
 * LLM 封装：Agent 的推理节点（解析问题、判断证据、写结论）走这里。
 * 数学计算一律交给确定性 Tool，LLM 不参与计算。
 * 没有配置 API Key 时退化为确定性回退，保证 Demo 仍可运行（前端会提示）。
 */
export function llmEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function modelName(): string {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
}

function createModel(temperature = 0) {
  return new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: modelName(),
    temperature,
    maxTokens: 1600,
  });
}

/** 结构化输出：把 LLM 的判断限制在给定 schema 内。 */
export async function structured<T extends z.ZodTypeAny>(
  schema: T,
  system: string,
  user: string,
): Promise<z.infer<T> | null> {
  if (!llmEnabled()) return null;
  try {
    const model = createModel().withStructuredOutput(schema, { name: "result" });
    return (await model.invoke([
      { role: "system", content: system },
      { role: "user", content: user },
    ])) as z.infer<T>;
  } catch (err) {
    console.error("[llm] structured 调用失败：", err);
    return null;
  }
}

/** 纯文本输出：用于最终归因结论的叙述部分。 */
export async function text(system: string, user: string, temperature = 0.2): Promise<string | null> {
  if (!llmEnabled()) return null;
  try {
    const res = await createModel(temperature).invoke([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    const content = res.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((c) => (typeof c === "string" ? c : "text" in c ? String((c as { text: string }).text) : ""))
        .join("")
        .trim();
    }
    return null;
  } catch (err) {
    console.error("[llm] text 调用失败：", err);
    return null;
  }
}

export const ANALYST_SYSTEM = [
  "你是内容平台的数据分析助手，服务于「内容—互动—搜索—交易」全链路波动归因。",
  "严格遵守以下约束：",
  "1. 不做任何数学计算，所有数字来自确定性工具的输出，你只负责解释与判断。",
  "2. 不编造平台内部数据、实验结果或原因；候选原因只能来自给定的原因库。",
  "3. 区分三类信息：事实（工具算出来的）、产品判断（基于事实的分析）、产品假设（需要实验验证）。",
  "4. 互动指标与搜索指标之间是产品假设关系，不能写成因果。",
  "5. 用中文、业务语言表达，不输出代码、JSON 之外的格式，不复述推理过程。",
].join("\n");
