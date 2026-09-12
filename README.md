# 全链路波动归因 Agent（AI Root Cause Agent）

内容 → 互动 → 搜索 → 交易全链路的指标波动归因 Agent：从一句自然语言问题出发，自动完成异常确认、链路层级定位、指标拆解、维度下钻、事件与原因匹配、证据验证，最后输出带置信度的归因结论。

**Agent orchestration is implemented with LangGraph**（`@langchain/langgraph`，TypeScript 版本，与 Next.js 同仓部署）。

- 指标口径、诊断树、原因库来自《内容—互动—搜索—交易全链路波动归因与诊断报告》及其配套 Excel 归因工具（项目三），由脚本导出为 `src/lib/knowledge/project3.ts`：30 个指标、19 条诊断树关系、24 条原因、13 个维度、S1~S7 流程。
- 演示数据为方法演示数据，非真实业务数据；所有阈值为示例参数，不代表实际业务阈值。

## 为什么用 LangGraph

这套业务流程本身就是一张状态图，而不是固定顺序的流水线：**当前一步的分析结果决定下一步该做什么分析**。

- 看后搜 GMV 异常 → 先做四因子拆解，再根据主贡献因子决定进入内容层、搜索层、成交承接还是商品结构诊断；
- 作者回复率异常 → 不做 GMV 四因子拆解，直接进入互动层的分子/分母拆解与作者维度下钻；
- 数据覆盖骤降 → 直接停止业务归因，先验证数据；
- 证据不足 → 调用对照验证工具补充证据，再回到证据评估，直到证据充分或达到最大轮次。

这类「分支 + 循环 + 早停」的控制流，用 LangGraph 的 `StateGraph` + 条件边表达最直接，也便于把每一步的中间状态流式推给前端。

## 架构

```
Next.js (App Router, TypeScript)
├── src/app/api/dataset    数据集：加载演示数据 / 上传 CSV、Excel（SheetJS + PapaParse）
├── src/app/api/diagnose   运行 LangGraph，并用 SSE 把每个节点的结果流式返回
├── src/lib/agent          LangGraph：state / nodes / graph / llm
├── src/lib/tools          确定性分析工具（不依赖 LLM）
├── src/lib/data           schema 识别、指标注册表、解析、内存数据集缓存
└── src/lib/knowledge      项目三导出的指标、诊断树、原因库
```

### State 设计（`src/lib/agent/state.ts`）

用 `Annotation.Root` 定义，随节点执行不断累积：

| 字段 | 说明 |
| --- | --- |
| `userQuery` / `targetMetric` / `targetDate` / `filter` | 解析后的分析对象 |
| `currentStage` | S1~S7，前端进度条直接用它 |
| `dataQualityIssues` / `anomalyResult` | S1 的数据校验与异常识别结果 |
| `currentLayer` / `routePath` | 当前链路层级与实际走过的节点路径 |
| `decompositionResult` / `dominantFactor` | LMDI 四因子拆解与主贡献因子 |
| `layerFinding` / `drillDownResult` / `affectedScope` / `signals` | 分层诊断、维度下钻与影响范围 |
| `matchedEvents` / `candidateCauses` / `evidence` / `comparison` / `confidence` | 事件、候选原因、证据与置信度 |
| `validationLoops` / `needsMoreValidation` | 验证循环的计数与判断 |
| `finalDiagnosis` / `stopReason` | 最终结论或早停原因 |
| `analysisLog` | 结构化执行记录（reducer 追加），前端「分析详情」展示 |

### Node 设计（`src/lib/agent/nodes.ts`）

LLM 节点与确定性 Tool 节点分开，**LLM 不参与任何数学计算**：

| 节点 | 类型 | 作用 |
| --- | --- | --- |
| `parse_user_query` | LLM | 把自然语言问题解析成指标、日期、维度过滤 |
| `validate_dataset` | Tool | schema 校验、缺行与分母检查 |
| `detect_anomaly` | Tool | 同 weekday 基线 + 相对偏离 + 稳健 z |
| `locate_business_layer` | 决策 | 扫描各层指标偏离，定位首发层 |
| `decompose_metric` | Tool | M01 = M09 × M12 × M16 × M18 的 LMDI 分解 |
| `content_diagnosis` / `search_diagnosis` / `transaction_conversion_diagnosis` / `price_structure_diagnosis` / `interaction_diagnosis` | Tool | 四个分层诊断分支 |
| `drill_down_dimensions` | Tool | 维度下钻，定位影响范围 |
| `match_events` / `match_candidate_causes` | Tool | 事件时间轴匹配、从原因库匹配候选原因 |
| `evaluate_evidence` | LLM + Tool | 计算置信度，判断证据是否充分 |
| `run_additional_validation` | Tool | 补充对照验证（双重差分） |
| `generate_final_diagnosis` | LLM | 输出归因结论 |
| `data_quality_stop` / `no_anomaly_stop` | 决策 | 两种早停 |

### Conditional Edge（`src/lib/agent/graph.ts`）

| 条件边 | 判断 | 去向 |
| --- | --- | --- |
| `validate_dataset` | 数据是否可信 | `detect_anomaly` / `data_quality_stop` |
| `detect_anomaly` | 是否超过阈值 | `locate_business_layer` / `no_anomaly_stop` |
| `locate_business_layer` | 指标有无乘法恒等式 | `decompose_metric` / 各分层诊断 |
| `decompose_metric` | LMDI 主贡献因子 | M09→内容层，M12→搜索层，M16→成交承接，M18→商品结构 |
| `evaluate_evidence` | 证据是否充分 | `run_additional_validation` / `generate_final_diagnosis` |

**验证循环**：`evaluate_evidence → run_additional_validation → evaluate_evidence`，由 `AGENT_MAX_VALIDATION_LOOPS`（默认 2）限制最大轮次，避免无限循环。

### Tool 设计（`src/lib/tools`）

全部是确定性 TypeScript 函数，可单独测试：

`detect_schema`、`assess_capability`（数据可分析性检查）、`detect_anomaly`（MAD / 修正 z 分数）、`check_data_quality`、`run_lmdi`、`run_additive_contribution`、`run_structure_efficiency`（shift-share）、`drill_down_dimension`、`analyze_numerator_denominator`、`search_event_timeline`、`match_root_causes`、`compare_groups`（双重差分）、`calculate_confidence`。

#### 事件匹配：时间接近不构成匹配

`search_event_timeline` 与 `match_root_causes` 按固定优先级判定，**业务类型匹配 > 影响层匹配 > 影响范围匹配 > 时间接近**：

1. **业务类型**：事件类型是否可能影响当前诊断的链路层（或事件自己声明了影响该指标）；
2. **影响层**：事件首先影响的层与本次首发层是否一致（跨层事件放行）；
3. **影响范围**：事件的 `scope_dim=scope_value` 与下钻得到的受影响范围是否一致；
4. **时间接近**：权重最低，只做微调。

任何一条硬性条件不满足的事件会被标记为「仅时间接近」，**不作为任何原因的正向证据**，只在时间轴上列出供人工排查。

`causes.ts` 里另有一张「原因 ↔ 事件兼容矩阵」，规定每条原因可以接受哪些事件类型与作用层，例如：

| 原因 | 只接受的事件类型 | 作用层 |
| --- | --- | --- |
| Y01 埋点变更或上报异常 | 口径与埋点 / 发版 / 故障 | 不限 |
| Y09 搜索入口或出词策略变更 | 策略 / 实验 | 搜索层 |
| Y12 运营活动与大促 | 运营活动 / 大促 / 营销活动 / 内容加热 / 投放 | 不限 |
| Y18 作者回复行为变化 | 策略 | 互动层 |

不兼容的事件会被显式记录为「已排除」并附上排除理由，前端在候选原因卡片里直接展示。

#### 数据可分析性检查

`assess_capability` 在 S1 先回答「这份数据能分析什么」：逐项检查 10 类分析所需的字段、维度与事件时间轴，给出 **Data Readiness 百分比**、可执行清单与受限清单（含缺失字段名）。**缺字段不会报错，也不会让模型去猜不存在的数据**——Agent 只用现有字段能支撑的部分给结论，并在行动建议里列出需要补齐的字段。

方法来源：LMDI（Ang 2005 / 2015）、shift-share（Dunn 1960）、修正 z 分数（NIST/SEMATECH 1.3.5.17，引用 Iglewicz & Hoaglin）、双重差分（Card & Krueger 1994）。

### 前端展示

界面按「Modern Data Intelligence Platform」的方向组织，全部图标来自 `lucide-react`：

| 模块 | 说明 |
| --- | --- |
| 数据集卡片 | Data Readiness、可用指标与维度 chips、缺失字段告警、「这份数据能分析什么」清单 |
| Ask Agent | 自然语言输入 + 快捷提问，运行时显示当前阶段与阶段说明 |
| 诊断流程 S1–S7 | 纵向步进器，未执行的阶段显式标为「已跳过」，S6 显示循环轮次 |
| 业务诊断路径 | 内容 → 互动 → 搜索 → 交易四层，高亮本次首发层；互动 → 搜索用虚线表示产品假设关系 |
| 事件时间轴 | 按匹配强度（强 / 中等 / 弱 / 仅时间接近）排序，逐条展示四项判定结果 |
| 候选原因卡片 | 证据分 0~100 及其构成、支撑证据、缺失证据、已排除事件、建议验证方式、需要对接的团队 |
| 归因结论 | 异常幅度 / 首发层与主贡献 / 影响范围 / 首位原因与置信度四张关键卡 + 结论正文 + 口径边界 |
| 下一步行动 | 按 P0/P1/P2 优先级排序，标注动作类型与对接方 |
| Agent 决策过程 | 每个节点的「发现了什么 / 为什么这样判断 / 接下来做什么」，取自 State |
| Execution Trace | 实际执行到的节点、调用的工具、条件边路由结果，可展开查看每步的结构化结果 |

两条展示原则：

- **不展示模型的私有推理过程**。决策模块与 Execution Trace 展示的都是 State 中的确定性结果与路由判断。
- **所有统计结果都带单位**。金额用「元」，相对变化用「%」，比率型指标的绝对变化用「pp」（例如 −58,200 元 / −18.6% / −5.8pp）。LMDI 单因子贡献占比可能超过 100%（反向因子对冲所致），图表旁有 ⓘ 说明这不是计算错误。

## 归因流程

```
S1 验证异常 → S2 定位链路层级 → S3 指标拆解（→ 按主因子分流）→ S4 维度下钻
   → S5 事件与原因匹配 → S6 证据验证（不足则循环补充）→ S7 输出结论
```

置信度分三级：**确认**（有实验/灰度/回滚等对照证据且影响范围一致）、**高度相关**（时间、范围、机制吻合但缺对照）、**候选**（仅时间吻合或指标同期变化）。互动 → 搜索属于产品假设关系，未经实验验证最高只到「候选」。

## 演示案例

演示数据（`public/demo/demo-metrics.csv`，91 天 × 6504 行）注入了四类异常，用于验证不同问题会走不同路径：

| 问题 | 期望路径 | 实际结论 |
| --- | --- | --- |
| 为什么 2026-09-12 的看后搜 GMV 下降了？ | 四因子拆解 → 搜索层 | 看后搜率贡献主要降幅，影响集中在推荐场景，命中「评论区出词策略调整」 |
| 2026-09-05 看后搜 GMV 为什么跌了？ | 四因子拆解 → 商品结构 | 客单价为主因子，品类结构迁移（结构效应为主） |
| 2026-09-10 作者回复率为什么下降？ | 跳过拆解 → 互动层 | 分子（作者回复数）下降，集中在 v28.2，命中「评论管理改版灰度」 |
| 2026-09-11 的看后搜 GMV 怎么了？ | 早停 | 明细行数骤降，先验证数据，不进入业务归因 |

回归脚本：

```bash
npm run dev           # 另开一个终端
node scripts/run-cases.mjs http://127.0.0.1:3000
```

## 数据格式

明细数据（CSV / Excel，一行 = 一天 × 一组维度）：

- 日期列：`date` / `日期`
- 维度列：任意字符串列，例如 `scene`、`category`、`author_tier`、`app_version`
- 度量列（中英文表头均可自动识别）：`exposure`、`effective_view_users`、`search_users`、`l1_search_users`、`l2_search_users`、`order_users`、`gmv`、`comments`、`comment_users`、`author_replies`、`replied_users`、`replied_revisit_users`、`sw_impressions`、`sw_clicks`

事件时间轴（可选，CSV）：`id,date,type,name,scope_dim,scope_value,platform,ramp,layer,metrics,source`。

上传的数据只保存在服务端内存（30 分钟 TTL），不落盘。

## 本地运行

```bash
npm install
cp .env.example .env.local   # 填入 ANTHROPIC_API_KEY
npm run gen:demo             # 可选，重新生成演示数据
npm run dev
```

未配置 `ANTHROPIC_API_KEY` 时，Agent 的 LLM 节点会退化为确定性回退（关键词解析问题 + 模板结论），Graph 的分支与循环仍然完整运行，页面顶部会提示当前处于回退模式。

## 环境变量

支持两个 provider，任选其一即可（两个都配时用 `LLM_PROVIDER` 指定；都不配则走确定性回退）。

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `LLM_PROVIDER` | 否 | `deepseek` 或 `anthropic`，留空时自动选用已配置 Key 的那个 |
| `DEEPSEEK_API_KEY` | 二选一 | DeepSeek API Key（OpenAI 兼容接口，base URL `https://api.deepseek.com`） |
| `DEEPSEEK_MODEL` | 否 | 默认 `deepseek-flash`，也可用 `deepseek-v4-pro` |
| `DEEPSEEK_BASE_URL` | 否 | 自定义网关时才填 |
| `ANTHROPIC_API_KEY` | 二选一 | Claude API Key |
| `ANTHROPIC_MODEL` | 否 | 默认 `claude-sonnet-5` |
| `AGENT_MAX_VALIDATION_LOOPS` | 否 | 验证循环上限，默认 2 |

LLM 节点的结构化输出优先走工具调用（`withStructuredOutput`），失败时自动退回 JSON 模式（`response_format=json_object`）再用 zod 校验，因此对不同 provider 的工具调用实现差异有容错。

**DeepSeek 注意事项**（已在代码中处理）：`deepseek-flash` 默认开启 thinking 模式，而该模式不支持强制 `tool_choice`，会让结构化输出直接 400。因此调用时默认传 `{"thinking": {"type": "disabled"}}`；需要思考模式时设 `DEEPSEEK_THINKING=enabled`（此时 `temperature` 等参数按官方文档不生效，结构化输出会自动走 JSON 兜底）。

## 部署到 Vercel

1. 推送到 GitHub。
2. 在 Vercel 导入该仓库（框架自动识别为 Next.js）。
3. 在 Project Settings → Environment Variables 添加 `ANTHROPIC_API_KEY`。
4. Deploy。

API 路由使用 Node.js runtime，`maxDuration` 已设为 120 秒（`/api/diagnose`）与 60 秒（`/api/dataset`），以容纳 LangGraph 多节点执行与 Excel 解析。

## 事实边界

- 演示数据为方法演示数据，非真实业务数据。
- 阈值（相对偏离 5%、稳健 z 3.5、基线 8 个同 weekday）为示例参数，需按历史数据的误报与漏报校准。
- 事件时间吻合只说明相关；没有对照证据时结论不会给到「确认」。
- 看后搜 GMV 为归因口径，不代表内容创造的增量。
