import { ChatAnthropic } from "@langchain/anthropic";
import { ChatDeepSeek } from "@langchain/deepseek";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";

/**
 * LLM 封装：Agent 的推理节点（解析问题、判断证据、写结论）走这里。
 * 数学计算一律交给确定性 Tool，LLM 不参与计算。
 *
 * 支持两个 provider：
 *   - deepseek  ：DEEPSEEK_API_KEY，默认模型 deepseek-flash，base URL https://api.deepseek.com
 *   - anthropic ：ANTHROPIC_API_KEY，默认模型 claude-sonnet-5
 * 未配置任何 Key 时退化为确定性回退，Graph 的分支与循环照常运行。
 *
 * DeepSeek 注意事项（来自官方文档实测）：
 *   1. deepseek-flash 默认开启 thinking 模式，该模式不支持强制 tool_choice，
 *      会让 withStructuredOutput 报 400，因此这里默认传 {"thinking":{"type":"disabled"}}；
 *      需要思考模式时设 DEEPSEEK_THINKING=enabled。
 *   2. JSON 兜底要显式开启 response_format=json_object，并且提示里必须出现 "json" 字样。
 */
export type Provider = "deepseek" | "anthropic";

export function activeProvider(): Provider | null {
  const explicit = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  if (explicit === "deepseek") return process.env.DEEPSEEK_API_KEY ? "deepseek" : null;
  if (explicit === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function llmEnabled(): boolean {
  return activeProvider() !== null;
}

export function modelName(): string {
  const provider = activeProvider();
  if (provider === "deepseek") return process.env.DEEPSEEK_MODEL || "deepseek-flash";
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  return "";
}

function thinkingEnabled(): boolean {
  return (process.env.DEEPSEEK_THINKING || "disabled").trim().toLowerCase() === "enabled";
}

export function providerInfo(): { enabled: boolean; provider: Provider | null; model: string | null } {
  const provider = activeProvider();
  return { enabled: provider !== null, provider, model: provider ? modelName() : null };
}

function createModel(temperature = 0, jsonMode = false): BaseChatModel | null {
  const provider = activeProvider();
  if (provider === "deepseek") {
    const modelKwargs: Record<string, unknown> = { thinking: { type: thinkingEnabled() ? "enabled" : "disabled" } };
    if (jsonMode) modelKwargs.response_format = { type: "json_object" };
    return new ChatDeepSeek({
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: modelName(),
      temperature: thinkingEnabled() ? undefined : temperature,
      maxTokens: 2000,
      modelKwargs,
      configuration: process.env.DEEPSEEK_BASE_URL ? { baseURL: process.env.DEEPSEEK_BASE_URL } : undefined,
    });
  }
  if (provider === "anthropic") {
    return new ChatAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: modelName(),
      temperature,
      maxTokens: 2000,
    });
  }
  return null;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        typeof c === "string" ? c : c && typeof c === "object" && "text" in c ? String((c as { text: string }).text) : "",
      )
      .join("")
      .trim();
  }
  return "";
}

/** 从模型返回里截出第一个 JSON 对象（JSON 兜底解析用）。 */
function firstJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```json/gi, "```").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  for (let end = cleaned.lastIndexOf("}"); end > start; end = cleaned.lastIndexOf("}", end - 1)) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      /* 继续向前找配对的右括号 */
    }
  }
  return null;
}

/** 由 zod schema 生成一份字段说明，供 JSON 兜底时提示模型。 */
function describeSchema(schema: z.ZodTypeAny): string {
  const shape = (schema as unknown as { shape?: Record<string, z.ZodTypeAny> }).shape;
  if (!shape) return "{}";
  const fields = Object.entries(shape).map(([key, value]) => {
    const desc = (value as { description?: string }).description;
    const typeName = (value as unknown as { _def?: { typeName?: string } })._def?.typeName ?? "";
    const t = typeName.replace("Zod", "").toLowerCase();
    return `  "${key}": <${t || "value"}>${desc ? "  // " + desc : ""}`;
  });
  return "{\n" + fields.join(",\n") + "\n}";
}

/**
 * 结构化输出：把 LLM 的判断限制在给定 schema 内。
 * 先用 withStructuredOutput（工具调用）；失败则退回 JSON 模式再用 zod 校验。
 */
export async function structured<T extends z.ZodTypeAny>(
  schema: T,
  system: string,
  user: string,
): Promise<z.infer<T> | null> {
  const model = createModel();
  if (model) {
    try {
      const bound = model.withStructuredOutput(schema, { name: "result" });
      const out = (await bound.invoke([
        { role: "system", content: system },
        { role: "user", content: user },
      ])) as z.infer<T>;
      if (out) return out;
    } catch (err) {
      console.warn("[llm] 结构化输出失败，改用 JSON 模式兜底：", (err as Error).message);
    }
  }
  const jsonModel = createModel(0, true);
  if (!jsonModel) return null;
  try {
    const res = await jsonModel.invoke([
      { role: "system", content: system + "\n只输出一个 json 对象，不要代码块、不要解释。" },
      {
        role: "user",
        content: user + "\n\n请按下面的 json 结构输出（字段名必须一致）：\n" + describeSchema(schema),
      },
    ]);
    const parsed = firstJsonObject(extractText(res.content));
    if (!parsed) {
      console.warn("[llm] JSON 兜底没有解析到对象");
      return null;
    }
    const check = schema.safeParse(parsed);
    if (!check.success) {
      console.warn("[llm] JSON 兜底结果不符合 schema：", check.error.issues.map((i) => i.path.join(".")).join(", "));
      return null;
    }
    return check.data as z.infer<T>;
  } catch (err) {
    console.error("[llm] JSON 兜底同样失败：", (err as Error).message);
    return null;
  }
}

/** 纯文本输出：用于最终归因结论的叙述部分。 */
export async function text(system: string, user: string, temperature = 0.2): Promise<string | null> {
  const model = createModel(temperature);
  if (!model) return null;
  try {
    const res = await model.invoke([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    const out = extractText(res.content).trim();
    if (!out) {
      console.warn("[llm] 模型返回空内容");
      return null;
    }
    return out;
  } catch (err) {
    console.error("[llm] text 调用失败：", (err as Error).message);
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
  "5. 用中文、业务语言表达，不复述推理过程。",
].join("\n");
