// 本文件由项目三《内容—互动—搜索—交易全链路波动归因与诊断报告》与配套 Excel 归因工具导出生成。
// 来源：字节实习 项目三/_生成脚本/common.py（单一数据源）。请勿手改，重新导出即可。
// Generated from the Project-3 attribution report: metrics dictionary, diagnosis tree,
// dimension list, cause-evidence matrix, S1~S7 flow, confidence levels and methods.


export interface Metric { id: string; layer: string; name: string; definition: string; math: string; upstream: string; downstream: string; dims: string; check: string; source: string; }
export interface Relation { id: string; from: string; to: string; type: "数学关系" | "业务逻辑关系" | "产品假设关系"; expr: string; usage: string; }
export interface Cause { id: string; category: string; name: string; layer: string; metrics: string; signals: string; evidence: string; verify: string; exclude: string; partner: string; confidence: string; }
export interface Dimension { id: string; group: string; name: string; values: string; layers: string; why: string; priority: string; note: string; }
export interface SopStage { stage: string; question: string; actions: string; output: string; next_cond: string; pitfall: string; }
export interface ConfidenceDef { level: string; criteria: string; usage: string; }
export interface MethodCore { id: string; name: string; applies: string; question: string; note: string; }
export interface MethodCausal { id: string; name: string; applies: string; strength: string; premise: string; limit: string; }
export interface EntryPoint { problem: string; layer: string; metrics: string; first: string; }
export interface Pattern { name: string; shape: string; directions: string; }
export interface BaselineDef { name: string; applies: string; how: string; note: string; }

export const METRICS: Metric[] = [
  {
    "id": "I02",
    "layer": "内容层",
    "name": "DAU",
    "definition": "日活跃用户数，几乎所有流量指标的共同分母",
    "math": "DAU = 新增用户 + 活跃留存用户 + 回流用户（加法）",
    "upstream": "—",
    "downstream": "I01、I09",
    "dims": "V10 新老用户／V12 端、版本与机型／V13 地域",
    "check": "先按新老用户拆分，对齐买量、Push 与节假日事件",
    "source": "项目三"
  },
  {
    "id": "I01",
    "layer": "内容层",
    "name": "内容消费量 VV",
    "definition": "全站视频播放次数",
    "math": "VV = DAU × 人均 VV（乘法）",
    "upstream": "I02、I03",
    "downstream": "I06、I10、I18",
    "dims": "V01 分发场景／V02 流量属性／V04 内容形式与时长／V05 一级品类",
    "check": "与总消费时长同看，二者背离时优先检查内容时长结构（V04）",
    "source": "项目三"
  },
  {
    "id": "I03",
    "layer": "内容层",
    "name": "人均 VV",
    "definition": "单个活跃用户的日均播放次数",
    "math": "人均 VV = VV ÷ DAU",
    "upstream": "—",
    "downstream": "I01",
    "dims": "V10 新老用户／V04 内容形式与时长",
    "check": "新客占比变化会稀释均值，先做结构—效率分解",
    "source": "项目三"
  },
  {
    "id": "I06",
    "layer": "内容层",
    "name": "总消费时长",
    "definition": "全站内容消费总时长，与 VV 互为校验",
    "math": "总时长 = DAU × 人均时长 ＝ VV × 平均单次消费时长",
    "upstream": "I02、I01",
    "downstream": "—",
    "dims": "V01 分发场景／V02 流量属性／V04 内容形式与时长／V05 一级品类",
    "check": "与 VV 背离是内容时长结构变化的线索",
    "source": "项目三"
  },
  {
    "id": "I09",
    "layer": "内容层",
    "name": "内容曝光量",
    "definition": "内容被展示给用户的次数",
    "math": "曝光量 = Σ 各分发场景曝光量（加法）＝ DAU × 人均曝光数（乘法）",
    "upstream": "I02、I11",
    "downstream": "M09（经 I21）、I10",
    "dims": "V01 分发场景／V02 流量属性／V05 一级品类",
    "check": "按分发场景与流量属性拆分，先剥离商业流量；核对曝光口径是否变更",
    "source": "项目三"
  },
  {
    "id": "I10",
    "layer": "内容层",
    "name": "曝光→播放转化率",
    "definition": "曝光后实际产生播放的比例，反映分发精准度",
    "math": "转化率 = VV ÷ 内容曝光量",
    "upstream": "I09、I01",
    "downstream": "—",
    "dims": "V01 分发场景／V04 内容形式与时长",
    "check": "分发策略变更的直接观测指标之一，仍需事件与对照佐证",
    "source": "项目三"
  },
  {
    "id": "I11",
    "layer": "内容层",
    "name": "流量分配占比",
    "definition": "各分发场景在总曝光中的占比，反映分发结构",
    "math": "分配占比 = 场景曝光量 ÷ 总曝光量",
    "upstream": "—",
    "downstream": "I09（结构）",
    "dims": "V01 分发场景／V04 内容形式与时长",
    "check": "占比变化时必须做结构—效率分解，防止辛普森悖论",
    "source": "项目三"
  },
  {
    "id": "I14",
    "layer": "内容层",
    "name": "内容供给量",
    "definition": "当日新增可分发内容数量",
    "math": "供给量 = 活跃作者数 × 人均发布量（乘法）",
    "upstream": "I15、I16",
    "downstream": "I09（业务逻辑，存在滞后）",
    "dims": "V05 一级品类／V08 作者层级",
    "check": "向曝光与消费传导存在滞后，时间轴需错位对齐",
    "source": "项目三"
  },
  {
    "id": "I15",
    "layer": "内容层",
    "name": "活跃作者数",
    "definition": "当日有发布行为的作者数",
    "math": "活跃作者数 = 作者总数 × 作者活跃率（乘法）",
    "upstream": "—",
    "downstream": "I14",
    "dims": "V08 作者层级／V05 一级品类",
    "check": "头部作者的变化需按层级单独观察",
    "source": "项目三"
  },
  {
    "id": "I16",
    "layer": "内容层",
    "name": "审核通过率",
    "definition": "发布内容中通过审核可分发的比例",
    "math": "通过率 = 审核通过内容数 ÷ 提交内容数",
    "upstream": "—",
    "downstream": "I14",
    "dims": "V05 一级品类／V04 内容形式与时长",
    "check": "对齐治理策略调整记录",
    "source": "项目三"
  },
  {
    "id": "I21",
    "layer": "内容层",
    "name": "曝光→有效观看效率",
    "definition": "有效播放人数（M09）÷ 内容曝光量（I09）。人数与次数之比，仅作为拆解恒等式中的效率因子，不单独作为考核指标",
    "math": "I21 = M09 ÷ I09",
    "upstream": "I09",
    "downstream": "M09",
    "dims": "V01 分发场景／V04 内容形式与时长／V05 一级品类",
    "check": "与 I10 同看；核对有效观看门槛（项目一 R2）未变更",
    "source": "项目三（新增拆解因子）"
  },
  {
    "id": "M09",
    "layer": "内容层",
    "name": "有效播放人数（有效观看）",
    "definition": "看后搜漏斗的起点：对范围内内容达成有效观看的去重用户数。公式：COUNT(DISTINCT 有效观看用户 ID)；判定：对范围内内容播放≥5 秒（不足5 秒需完播；图文停留≥3 秒）的用户",
    "math": "M09 = I09 × I21",
    "upstream": "I09、I21",
    "downstream": "M10、M12（分母）、H01（分母）",
    "dims": "V01 分发场景／V02 流量属性／V04 内容形式与时长／V05 一级品类／V08 作者层级／V09 是否挂车 / 是否营销加热",
    "check": "先判断是曝光量还是曝光→有效观看效率在变",
    "source": "项目一"
  },
  {
    "id": "H01",
    "layer": "互动层",
    "name": "评论率",
    "definition": "发表评论的用户数 ÷ 有效播放人数（M09），按内容、当日",
    "math": "评论用户数 ÷ M09",
    "upstream": "M09",
    "downstream": "H02（评论供给）；M12（产品假设）",
    "dims": "V05 一级品类／V08 作者层级／V12 端、版本与机型",
    "check": "分子分母分开看；对齐评论功能变更事件",
    "source": "项目二"
  },
  {
    "id": "H02",
    "layer": "互动层",
    "name": "作者回复率",
    "definition": "获得作者回复的评论数 ÷ 评论总数，按作者、7 天以内",
    "math": "作者回复率 = 获得作者回复的评论数 ÷ 评论总数（分母即评论供给）",
    "upstream": "H01、H06",
    "downstream": "H03 的人群规模；M12（产品假设）",
    "dims": "V08 作者层级／V05 一级品类／V18 作品评论量分桶／V12 端、版本与机型",
    "check": "先拆分子（作者回复数）与分母（评论总数）",
    "source": "项目二"
  },
  {
    "id": "H03",
    "layer": "互动层",
    "name": "被回复用户复访率",
    "definition": "获得作者回复的用户中，7 天以内再次观看该作者作品或访问其主页的用户占比",
    "math": "比率指标；被回复用户数由 H02 决定",
    "upstream": "H02",
    "downstream": "M09 与 M12（产品假设）",
    "dims": "V08 作者层级／V05 一级品类",
    "check": "同时看被回复用户数：H02 下降先减少人群规模，比率本身不必然下降",
    "source": "项目二"
  },
  {
    "id": "H04",
    "layer": "互动层",
    "name": "二次互动率",
    "definition": "首次互动用户中，7 天以内再次对同一作者点赞、评论或私信的用户占比",
    "math": "比率指标",
    "upstream": "H01、H03",
    "downstream": "M12（产品假设）",
    "dims": "V08 作者层级／V05 一级品类",
    "check": "对齐通知、评论区展示等互动功能事件",
    "source": "项目二"
  },
  {
    "id": "H05",
    "layer": "互动层",
    "name": "互动用户关注转化率",
    "definition": "评论互动用户中，7 天以内关注该作者的用户占比",
    "math": "比率指标",
    "upstream": "H01",
    "downstream": "M09（产品假设：关注带来复访）",
    "dims": "V08 作者层级／V10 新老用户",
    "check": "对齐关注引导类功能与作者关系工具事件",
    "source": "项目二"
  },
  {
    "id": "H06",
    "layer": "互动层",
    "name": "作者回复时延",
    "definition": "评论发出到作者首次回复的时间中位数",
    "math": "时间中位数",
    "upstream": "作品评论量",
    "downstream": "H02（业务逻辑）",
    "dims": "V08 作者层级／V18 作品评论量分桶／V12 端、版本与机型",
    "check": "评论量上升与作者端工具变化是两个首要方向",
    "source": "项目二"
  },
  {
    "id": "H07",
    "layer": "互动层",
    "name": "评论区入群率",
    "definition": "通过评论区群入口加入作者群的用户数 ÷ 群入口曝光用户数",
    "math": "通过评论区群入口入群用户数 ÷ 群入口曝光用户数",
    "upstream": "群入口曝光",
    "downstream": "关系沉淀",
    "dims": "V08 作者层级／V05 一级品类",
    "check": "先看群入口曝光是否变化",
    "source": "项目二"
  },
  {
    "id": "I18",
    "layer": "互动层",
    "name": "互动率（汇总）",
    "definition": "点赞、评论、分享等互动行为的发生比例；H01~H05 为其细分诊断指标（非严格数学拆解）",
    "math": "互动率 = 互动次数 ÷ VV",
    "upstream": "I01",
    "downstream": "—",
    "dims": "V01 分发场景／V02 流量属性／V04 内容形式与时长／V05 一级品类",
    "check": "汇总指标变化时下钻到 H 系列定位具体环节",
    "source": "项目三"
  },
  {
    "id": "M10",
    "layer": "搜索层",
    "name": "看后搜人数",
    "definition": "发起看后搜行为的去重用户数。公式：COUNT(DISTINCT 发起看后搜的用户 ID)",
    "math": "M10 = M09 × M12；按层级 = L1 + L2（诊断时同一用户按最高层级归属）",
    "upstream": "M09、M12",
    "downstream": "M04",
    "dims": "V15 看后搜层级与入口／V16 搜索词类型／V01 分发场景／V05 一级品类",
    "check": "先判断是 M09 还是 M12 驱动",
    "source": "项目一"
  },
  {
    "id": "M12",
    "layer": "搜索层",
    "name": "看后搜率（人数口径）",
    "definition": "有效观看的用户中有多少比例产生了看后搜。公式：看后搜人数 ÷ 有效播放人数 × 100%",
    "math": "M12 = M10 ÷ M09",
    "upstream": "L1 / L2 结构；M20（业务逻辑）；H01~H05（产品假设）",
    "downstream": "M10",
    "dims": "V15 看后搜层级与入口／V05 一级品类／V09 是否挂车 / 是否营销加热",
    "check": "先拆 L1 / L2，再看 M20 与入口事件，最后看互动层",
    "source": "项目一"
  },
  {
    "id": "L1",
    "layer": "搜索层",
    "name": "L1强引导看后搜",
    "definition": "强引导看后搜：点击内容挂载的搜索词（评论区吸顶词、评论内飘蓝词、视频底部相关搜索等）；时间约束：同一会话",
    "math": "M10 的层级拆分之一",
    "upstream": "搜索词曝光 × M20（业务逻辑）",
    "downstream": "M10",
    "dims": "V15 看后搜层级与入口／V16 搜索词类型",
    "check": "对齐出词策略与搜索入口事件，看搜索词曝光",
    "source": "项目一"
  },
  {
    "id": "L2",
    "layer": "搜索层",
    "name": "L2即时主动看后搜",
    "definition": "即时主动看后搜：有效观看后主动发起搜索（搜索框输入、历史词、联想词、猜你想搜）；时间约束：同一会话内，30 分钟以内",
    "math": "M10 的层级拆分之一",
    "upstream": "内容与搜索意图的相关性、热点",
    "downstream": "M10",
    "dims": "V05 一级品类／V16 搜索词类型／V09 是否挂车 / 是否营销加热",
    "check": "做品类结构—效率分解；看热点退潮与搜索词类型变化",
    "source": "项目一"
  },
  {
    "id": "M20",
    "layer": "搜索层",
    "name": "内容搜索词点击率（L1）",
    "definition": "内容挂载搜索词的引导效率。公式：搜索词点击次数 ÷ 搜索词曝光次数 × 100%",
    "math": "M20 = 搜索词点击次数 ÷ 搜索词曝光次数",
    "upstream": "搜索词曝光",
    "downstream": "L1（业务逻辑）",
    "dims": "V15 看后搜层级与入口／V16 搜索词类型／V05 一级品类",
    "check": "核对分母口径：组件在视频底部栏与评论区顶部各曝光一次（项目二 E07）",
    "source": "项目一"
  },
  {
    "id": "I19",
    "layer": "搜索层",
    "name": "搜索场流量",
    "definition": "搜索场景产生的曝光与消费量，用于区分看后搜变化与全站搜索大盘变化",
    "math": "搜索 VV = DAU × 搜索渗透率 × 搜索人均 VV",
    "upstream": "I02",
    "downstream": "—",
    "dims": "V16 搜索词类型／V04 内容形式与时长",
    "check": "全站搜索同步变化时，优先检查外部环境与搜索侧原因",
    "source": "项目三"
  },
  {
    "id": "M04",
    "layer": "交易层",
    "name": "看后搜成交人数",
    "definition": "通过看后搜链路完成支付的去重用户数。公式：COUNT(DISTINCT 成交用户 ID)",
    "math": "M04 = M10 × M16",
    "upstream": "M10、M16",
    "downstream": "M01",
    "dims": "V17 成交载体／V05 一级品类／V15 看后搜层级与入口",
    "check": "先判断是 M10 还是 M16 驱动",
    "source": "项目一"
  },
  {
    "id": "M16",
    "layer": "交易层",
    "name": "看后搜成交转化率",
    "definition": "发起看后搜的用户中最终成交的比例。公式：看后搜成交人数 ÷ 看后搜人数 × 100%",
    "math": "M16 = M04 ÷ M10",
    "upstream": "商品供给、承接页、支付链路（业务逻辑）",
    "downstream": "M04",
    "dims": "V17 成交载体／V05 一级品类／V16 搜索词类型",
    "check": "看搜索结果页到商品点击、支付成功率与承接页事件",
    "source": "项目一"
  },
  {
    "id": "M18",
    "layer": "交易层",
    "name": "看后搜客单价",
    "definition": "看后搜成交用户的平均消费金额。公式：看后搜 GMV ÷ 看后搜成交人数",
    "math": "M18 = M01 ÷ M04",
    "upstream": "商品结构、价格与大促（业务逻辑）",
    "downstream": "M01",
    "dims": "V05 一级品类／V17 成交载体",
    "check": "类目结构变化先做结构—效率分解；对齐大促与价格事件",
    "source": "项目一"
  },
  {
    "id": "M01",
    "layer": "交易层",
    "name": "看后搜 GMV",
    "definition": "内容通过看后搜链路间接带来的成交金额，衡量内容生态的间接交易价值。公式：Σ（L1 与 L2 看后搜成交子订单的支付金额）",
    "math": "M01 = M04 × M18 ＝ M09 × M12 × M16 × M18",
    "upstream": "M04、M18",
    "downstream": "—",
    "dims": "V17 成交载体／V05 一级品类／V15 看后搜层级与入口",
    "check": "先用四因子分解判断变化首先来自哪一层",
    "source": "项目一"
  }
];

export const RELATIONS: Relation[] = [
  {
    "id": "X01",
    "from": "M04 × M18",
    "to": "M01",
    "type": "数学关系",
    "expr": "M01 = M04 × M18",
    "usage": "判断交易层变化来自成交人数还是客单价"
  },
  {
    "id": "X02",
    "from": "M10 × M16",
    "to": "M04",
    "type": "数学关系",
    "expr": "M04 = M10 × M16",
    "usage": "判断成交人数变化来自搜索规模还是成交承接"
  },
  {
    "id": "X03",
    "from": "M09 × M12",
    "to": "M10",
    "type": "数学关系",
    "expr": "M10 = M09 × M12",
    "usage": "判断看后搜人数变化来自内容流量还是搜索行为"
  },
  {
    "id": "X04",
    "from": "I09 × I21",
    "to": "M09",
    "type": "数学关系",
    "expr": "M09 = I09 × I21",
    "usage": "判断有效观看变化来自曝光量还是曝光效率"
  },
  {
    "id": "X05",
    "from": "L1 + L2",
    "to": "M10",
    "type": "数学关系",
    "expr": "按最高层级归属后 M10 = L1 部分 + L2 部分",
    "usage": "判断搜索规模变化来自强引导入口还是主动搜索"
  },
  {
    "id": "X06",
    "from": "各分发场景曝光",
    "to": "I09",
    "type": "数学关系",
    "expr": "I09 = Σ 场景曝光量；场景结构由 I11 描述",
    "usage": "按场景做贡献度与结构—效率分解"
  },
  {
    "id": "X07",
    "from": "评论总数与作者回复数",
    "to": "H02",
    "type": "数学关系",
    "expr": "H02 = 获得作者回复的评论数 ÷ 评论总数",
    "usage": "评论供给变化本身就会改变 H02"
  },
  {
    "id": "X08",
    "from": "I14 内容供给量",
    "to": "I09 内容曝光量",
    "type": "业务逻辑关系",
    "expr": "可分发内容减少会压缩曝光，传导存在滞后",
    "usage": "时间轴错位对齐后再比较"
  },
  {
    "id": "X09",
    "from": "I16 审核通过率",
    "to": "I14 内容供给量",
    "type": "业务逻辑关系",
    "expr": "治理与审核策略直接改变可分发内容",
    "usage": "对齐治理动作，比较受影响与未受影响品类"
  },
  {
    "id": "X10",
    "from": "M20 内容搜索词点击率",
    "to": "L1 看后搜",
    "type": "业务逻辑关系",
    "expr": "L1 以点击内容挂载的搜索词为触发，点击率与搜索词曝光共同决定 L1 规模",
    "usage": "L1 变化时优先看 M20 与搜索词曝光"
  },
  {
    "id": "X11",
    "from": "H06 作者回复时延",
    "to": "H02 作者回复率",
    "type": "业务逻辑关系",
    "expr": "回复变慢通常伴随回复覆盖下降",
    "usage": "作者回复成本上升的旁证"
  },
  {
    "id": "X12",
    "from": "H02 作者回复率",
    "to": "H03 的人群规模",
    "type": "业务逻辑关系",
    "expr": "被回复用户数随 H02 减少，H03 比率不必然变化",
    "usage": "避免把人群规模变化误读为复访率变化"
  },
  {
    "id": "X13",
    "from": "商品供给、承接页、支付链路",
    "to": "M16",
    "type": "业务逻辑关系",
    "expr": "搜索之后的商品可得性与交易路径决定成交转化",
    "usage": "M16 变化时的首要排查方向"
  },
  {
    "id": "X14",
    "from": "商品结构、价格与大促",
    "to": "M18",
    "type": "业务逻辑关系",
    "expr": "类目结构与价格变化改变客单价",
    "usage": "先做类目结构—效率分解"
  },
  {
    "id": "X15",
    "from": "H01 评论率",
    "to": "M12 看后搜率",
    "type": "产品假设关系",
    "expr": "项目二机制与价值链矩阵：评论互动可能加深兴趣",
    "usage": "只形成候选解释"
  },
  {
    "id": "X16",
    "from": "H02 作者回复率 / H03 被回复用户复访率",
    "to": "M12 看后搜率、M09 有效播放人数",
    "type": "产品假设关系",
    "expr": "项目二 J1：作者回复被看见并带来复访，可能增加 L2 / L3 的发生机会",
    "usage": "验证方式：项目二 T1"
  },
  {
    "id": "X17",
    "from": "H04 二次互动率",
    "to": "M12 看后搜率",
    "type": "产品假设关系",
    "expr": "持续互动可能提高搜索意愿",
    "usage": "只形成候选解释"
  },
  {
    "id": "X18",
    "from": "H05 互动用户关注转化率",
    "to": "M09 有效播放人数",
    "type": "产品假设关系",
    "expr": "关注带来复访，可能增加有效观看",
    "usage": "只形成候选解释"
  },
  {
    "id": "X19",
    "from": "作者回复中的商品实体承接",
    "to": "M20 与 L1 看后搜",
    "type": "产品假设关系",
    "expr": "项目二 J4：作者回复中的实体被承接为搜索入口",
    "usage": "验证方式：项目二 T4"
  }
];

export const CAUSES: Cause[] = [
  {
    "id": "Y01",
    "category": "数据",
    "name": "埋点变更或上报异常",
    "layer": "跨层",
    "metrics": "任一指标",
    "signals": "只出现在单端或单版本；与业务事件不对应；旁证指标不同步",
    "evidence": "埋点发布记录；分端分版本曲线；旁证指标",
    "verify": "旁证指标对照；修复前后对比",
    "exclude": "多端同步变化且旁证指标同向",
    "partner": "数据、客户端",
    "confidence": "埋点记录与旁证指标双重印证方可确认"
  },
  {
    "id": "Y02",
    "category": "数据",
    "name": "口径或计算逻辑变更",
    "layer": "跨层",
    "metrics": "任一指标",
    "signals": "变更当日整体平移，形态干净",
    "evidence": "口径变更记录；新旧口径重算结果",
    "verify": "用旧口径重算当期数据",
    "exclude": "用旧口径重算后波动仍在",
    "partner": "数据",
    "confidence": "重算结果可直接确认"
  },
  {
    "id": "Y03",
    "category": "数据",
    "name": "数据延迟、回补或丢失",
    "layer": "跨层",
    "metrics": "任一指标",
    "signals": "当期偏低、之后回补；分维度加总与总量不一致",
    "evidence": "任务产出时间；勾稽校验结果",
    "verify": "T+N 复看；分维度勾稽",
    "exclude": "产出准时且勾稽一致",
    "partner": "数据",
    "confidence": "复看后数据回归即可确认"
  },
  {
    "id": "Y04",
    "category": "技术",
    "name": "客户端发版问题",
    "layer": "跨层",
    "metrics": "端内相关指标",
    "signals": "随版本放量曲线变化；新旧版本表现分化",
    "evidence": "发版时间轴；分版本指标曲线",
    "verify": "新旧版本对比；灰度与全量对比",
    "exclude": "各版本同步变化",
    "partner": "客户端、QA",
    "confidence": "分版本对照显示差异方可确认"
  },
  {
    "id": "Y05",
    "category": "技术",
    "name": "服务端故障或性能劣化",
    "layer": "跨层",
    "metrics": "I01、I09、M09、M16 等",
    "signals": "起止时间明确；错误率与耗时同步异常；低端机型与弱网更明显",
    "evidence": "故障与告警记录；性能监控",
    "verify": "故障时段对齐；分机型与网络对比",
    "exclude": "性能与错误率指标正常",
    "partner": "服务端、SRE",
    "confidence": "故障记录与时段吻合可定为高度相关"
  },
  {
    "id": "Y06",
    "category": "策略与产品",
    "name": "推荐与分发策略变更",
    "layer": "内容层",
    "metrics": "I09、I10、I11、I21、M09",
    "signals": "分发效率先变；影响集中在个别场景",
    "evidence": "策略上线记录；实验数据",
    "verify": "AB 实验回溯；灰度与全量对比",
    "exclude": "实验组与对照组无差异",
    "partner": "推荐算法、策略产品",
    "confidence": "实验回溯支持方可确认"
  },
  {
    "id": "Y07",
    "category": "策略与产品",
    "name": "实验放量或回滚",
    "layer": "跨层",
    "metrics": "实验涉及指标",
    "signals": "与实验放量比例同步变化；回滚后回归",
    "evidence": "实验放量记录与分组数据",
    "verify": "实验组与对照组对比；检查样本比例失衡",
    "exclude": "实验组与对照组无差异",
    "partner": "实验平台、算法",
    "confidence": "实验对照可直接确认"
  },
  {
    "id": "Y08",
    "category": "策略与产品",
    "name": "评论与互动功能变更",
    "layer": "互动层",
    "metrics": "H01~H07",
    "signals": "互动指标先变；与功能上线时间或版本对齐",
    "evidence": "功能上线与实验记录；分版本数据",
    "verify": "实验对照；受影响与未受影响版本或人群对比",
    "exclude": "未受影响人群同步变化",
    "partner": "互动产品、客户端",
    "confidence": "有对照证据方可确认"
  },
  {
    "id": "Y09",
    "category": "策略与产品",
    "name": "搜索入口或出词策略变更",
    "layer": "搜索层",
    "metrics": "M20、L1 看后搜、M12",
    "signals": "L1 先变、L2 平稳；搜索词曝光或 M20 变化",
    "evidence": "出词策略变更记录；搜索词曝光数据",
    "verify": "按 L1 / L2 拆分对比；实验对照；项目一 L1 holdout",
    "exclude": "L1 与 L2 同步变化且搜索词曝光稳定",
    "partner": "搜索产品、搜索策略",
    "confidence": "实验或 holdout 支持方可确认"
  },
  {
    "id": "Y10",
    "category": "策略与产品",
    "name": "搜索结果排序与承接策略变更",
    "layer": "交易层",
    "metrics": "M16",
    "signals": "M10 稳定而 M16 变化；搜索结果页到商品点击先变",
    "evidence": "搜索策略记录；结果页点击数据",
    "verify": "实验回溯",
    "exclude": "结果页点击与排序相关指标稳定",
    "partner": "搜索策略、电商搜索",
    "confidence": "实验回溯支持方可确认"
  },
  {
    "id": "Y11",
    "category": "策略与产品",
    "name": "治理与审核策略变更",
    "layer": "内容层",
    "metrics": "I16、I14、I09",
    "signals": "审核通过率变化；特定品类供给下降，传导有滞后",
    "evidence": "治理动作记录；品类供给曲线",
    "verify": "受影响品类与未受影响品类对比（双重差分）",
    "exclude": "审核通过率与供给稳定",
    "partner": "内容治理",
    "confidence": "对比结果与时间吻合可定为高度相关"
  },
  {
    "id": "Y12",
    "category": "运营",
    "name": "运营活动与大促",
    "layer": "跨层",
    "metrics": "M01、M18、M16、I01",
    "signals": "与活动日历吻合；结束后回落",
    "evidence": "活动日历；活动覆盖人群",
    "verify": "与历史同类活动对比；活动与非活动人群对比",
    "exclude": "活动覆盖范围与波动范围不一致",
    "partner": "运营",
    "confidence": "日历吻合且覆盖范围一致可定为高度相关"
  },
  {
    "id": "Y13",
    "category": "运营",
    "name": "Push 与召回",
    "layer": "内容层",
    "metrics": "I02、I01、M09",
    "signals": "启动与 DAU 先动；推送后短时集中",
    "evidence": "推送发送记录与量级",
    "verify": "小时级对齐；推送与未推送人群对比",
    "exclude": "未推送人群同步变化",
    "partner": "运营、增长",
    "confidence": "人群对比支持方可确认"
  },
  {
    "id": "Y14",
    "category": "运营",
    "name": "投放买量与渠道变化",
    "layer": "内容层",
    "metrics": "I02、I03、M09",
    "signals": "新增用户占比变化；人均指标被稀释",
    "evidence": "投放预算与消耗；渠道结构",
    "verify": "按新老用户与渠道拆分；结构—效率分解",
    "exclude": "老用户指标同步变化且渠道结构稳定",
    "partner": "增长、商业化",
    "confidence": "结构分解支持可定为高度相关"
  },
  {
    "id": "Y15",
    "category": "内容与作者",
    "name": "内容供给变化",
    "layer": "内容层",
    "metrics": "I14、I15、I09",
    "signals": "活跃作者数或人均发布量变化；传导有滞后",
    "evidence": "供给曲线；作者分层数据",
    "verify": "错位对齐时间轴；按品类与作者层级对比",
    "exclude": "供给稳定",
    "partner": "内容生态运营",
    "confidence": "滞后对齐后吻合可定为高度相关"
  },
  {
    "id": "Y16",
    "category": "内容与作者",
    "name": "头部作者与爆款",
    "layer": "内容层",
    "metrics": "I09、M09、H01、M10",
    "signals": "少数内容或作者贡献了大部分变化",
    "evidence": "内容与作者贡献度排序",
    "verify": "剔除 Top 内容后看剩余部分是否平稳",
    "exclude": "贡献分散",
    "partner": "内容运营、达人运营",
    "confidence": "剔除后平稳即可确认"
  },
  {
    "id": "Y17",
    "category": "内容与作者",
    "name": "热点事件",
    "layer": "内容层",
    "metrics": "I09、M12（L2）、I19",
    "signals": "集中在特定品类；搜索场流量同步变化；站外同步有热度",
    "evidence": "热点时间轴；搜索词热度",
    "verify": "热点品类与非热点品类对比",
    "exclude": "非热点品类同步变化",
    "partner": "内容运营",
    "confidence": "时间与品类吻合可定为高度相关"
  },
  {
    "id": "Y18",
    "category": "内容与作者",
    "name": "作者回复行为变化",
    "layer": "互动层",
    "metrics": "H02、H06",
    "signals": "集中在特定作者层级；评论量上升而回复量不变；回复时延上升",
    "evidence": "作者分层回复数据；评论量分桶",
    "verify": "按作者层级与评论量分桶对比",
    "exclude": "各层级与各分桶同步变化",
    "partner": "作者运营、互动产品",
    "confidence": "分层对比支持可定为高度相关"
  },
  {
    "id": "Y19",
    "category": "商品与承接",
    "name": "商品供给与价格变化",
    "layer": "交易层",
    "metrics": "M16、M18",
    "signals": "特定类目成交转化或客单价变化",
    "evidence": "商品库存与价格数据",
    "verify": "受影响类目与未受影响类目对比",
    "exclude": "商品供给与价格稳定",
    "partner": "电商运营、商家运营",
    "confidence": "类目对比支持可定为高度相关"
  },
  {
    "id": "Y20",
    "category": "商品与承接",
    "name": "承接页面或支付链路问题",
    "layer": "交易层",
    "metrics": "M16",
    "signals": "搜索到商品点击正常，而下单或支付环节下降",
    "evidence": "支付成功率；页面错误率；发版记录",
    "verify": "分环节漏斗对比；故障时段对齐",
    "exclude": "支付成功率与页面错误率正常",
    "partner": "交易链路、支付",
    "confidence": "故障记录与漏斗断点吻合可确认"
  },
  {
    "id": "Y21",
    "category": "用户结构",
    "name": "用户结构变化",
    "layer": "跨层",
    "metrics": "人均类与比率类指标",
    "signals": "各细分效率稳定而整体变化（辛普森悖论）",
    "evidence": "人群结构占比",
    "verify": "结构—效率分解",
    "exclude": "结构效应接近零",
    "partner": "数据、增长",
    "confidence": "分解结果可直接确认结构贡献"
  },
  {
    "id": "Y22",
    "category": "外部环境",
    "name": "节假日与季节",
    "layer": "跨层",
    "metrics": "全链路",
    "signals": "与日历吻合；与去年同期形态一致",
    "evidence": "节假日表；去年同期数据",
    "verify": "节假日对齐基线后看残差",
    "exclude": "对齐后残差仍显著",
    "partner": "—（登记）",
    "confidence": "对齐后偏离消失即可确认"
  },
  {
    "id": "Y23",
    "category": "外部环境",
    "name": "重大外部事件与政策",
    "layer": "跨层",
    "metrics": "全链路",
    "signals": "全网同步；特定品类异常；可能伴随治理动作",
    "evidence": "外部事件时间轴；政策通知",
    "verify": "受影响与未受影响品类或地域对比",
    "exclude": "受影响范围与事件范围不一致",
    "partner": "合规、战略",
    "confidence": "范围与时间吻合可定为高度相关"
  },
  {
    "id": "Y24",
    "category": "外部环境",
    "name": "竞品动作",
    "layer": "跨层",
    "metrics": "全链路",
    "signals": "缓慢流失；难以直接观测",
    "evidence": "第三方行业数据",
    "verify": "作为排除其他原因后的兜底解释",
    "exclude": "其他原因已能解释主要变化",
    "partner": "战略、市场",
    "confidence": "通常只能定为候选"
  }
];

export const DIMENSIONS: Dimension[] = [
  {
    "id": "V01",
    "group": "流量",
    "name": "分发场景与入口",
    "values": "推荐 / 关注 / 搜索 / 同城 / 话题与聚合页 / 私域 / 外部导流；首刷、下滑、Push 唤起等入口",
    "layers": "内容层、搜索层",
    "why": "不同场景由不同策略与团队驱动，是内容流量问题的第一拆分维度",
    "priority": "P0",
    "note": "旧版「入口位置」维度并入"
  },
  {
    "id": "V02",
    "group": "流量",
    "name": "流量属性",
    "values": "自然流量 / 商业流量 / 活动流量",
    "layers": "内容层",
    "why": "商业流量随投放预算变化，需要先剥离",
    "priority": "P0",
    "note": "—"
  },
  {
    "id": "V04",
    "group": "内容",
    "name": "内容形式与时长",
    "values": "短视频 / 图文 / 直播；时长分档",
    "layers": "内容层、互动层",
    "why": "形式与时长结构变化是 VV 与总时长背离的首要解释",
    "priority": "P0",
    "note": "与项目一 R1、项目二内容分类一致；旧版「内容时长」维度并入"
  },
  {
    "id": "V05",
    "group": "内容",
    "name": "一级品类",
    "values": "美妆 / 服饰 / 数码 / 家居 / 知识 / 生活 等",
    "layers": "全链路",
    "why": "内容供给、热点、商品结构的主要落点",
    "priority": "P0",
    "note": "—"
  },
  {
    "id": "V08",
    "group": "内容",
    "name": "作者层级",
    "values": "头部 / 腰部 / 尾部 / 新作者；商家自营 / 达人 / 机构",
    "layers": "内容层、互动层",
    "why": "作者回复行为与供给变化都按作者层级集中",
    "priority": "P0",
    "note": "与项目二作者分类一致"
  },
  {
    "id": "V09",
    "group": "内容",
    "name": "是否挂车 / 是否营销加热",
    "values": "挂车 / 非挂车；营销加热 / 自然",
    "layers": "内容层、交易层",
    "why": "与项目一 R1 的内容范围口径一致，便于看后搜指标交叉解读",
    "priority": "P1",
    "note": "—"
  },
  {
    "id": "V10",
    "group": "用户",
    "name": "新老用户与渠道",
    "values": "新增 / 回流 / 活跃留存；获客渠道",
    "layers": "全链路",
    "why": "新客涌入会同时抬高规模并拉低人均指标，是结构变化的常见来源",
    "priority": "P0",
    "note": "旧版「用户活跃分层」维度并入"
  },
  {
    "id": "V12",
    "group": "环境",
    "name": "端、版本与机型",
    "values": "iOS / Android；App 版本号；机型档位与网络",
    "layers": "跨层",
    "why": "排查数据与技术原因的第一现场",
    "priority": "P0",
    "note": "旧版「机型与网络」维度并入"
  },
  {
    "id": "V13",
    "group": "环境",
    "name": "地域",
    "values": "省份 / 城市线级",
    "layers": "跨层",
    "why": "区分区域性事件与全局性原因",
    "priority": "P1",
    "note": "—"
  },
  {
    "id": "V15",
    "group": "链路",
    "name": "看后搜层级与入口",
    "values": "L1（吸顶词 / 飘蓝词 / 底部相关搜索）/ L2 / L3",
    "layers": "搜索层、交易层",
    "why": "区分强引导入口问题与主动搜索问题",
    "priority": "P0",
    "note": "沿用项目一三层分级；L3 为观察口径"
  },
  {
    "id": "V16",
    "group": "链路",
    "name": "搜索词类型",
    "values": "品牌词 / 品类词 / 达人词 / 泛需求词 / 其他",
    "layers": "搜索层、交易层",
    "why": "不同词类型的成交转化差异大",
    "priority": "P1",
    "note": "沿用项目一 R4 搜索词类型标签"
  },
  {
    "id": "V17",
    "group": "链路",
    "name": "成交载体",
    "values": "直播 / 短视频 / 商品卡 / 其他",
    "layers": "交易层",
    "why": "定位承接问题发生在哪类载体",
    "priority": "P1",
    "note": "沿用项目一成交载体口径"
  },
  {
    "id": "V18",
    "group": "互动",
    "name": "作品评论量分桶",
    "values": "按单条作品评论量分档",
    "layers": "互动层",
    "why": "评论量激增会直接压低作者回复率（X07）",
    "priority": "P1",
    "note": "项目三新增"
  }
];

export const SOP: SopStage[] = [
  {
    "stage": "S1 验证异常",
    "question": "是真实变化，还是埋点、延迟、口径或随机噪声？",
    "actions": "按第四章选基线并计算偏离度与稳健 z；完成异常真实性检查（产出、口径、勾稽、端版本、旁证、实验分流）",
    "output": "异常确认：指标、幅度、起止时间、基线方法",
    "next_cond": "数据可信，且偏离超过已校准的阈值",
    "pitfall": "用相邻日直接比较有周期的指标；把数据问题当作业务问题"
  },
  {
    "stage": "S2 定位链路层级",
    "question": "变化首先出现在内容、互动、搜索、交易哪一层？",
    "actions": "沿诊断树向上游逐层比较偏离幅度与首次偏离时间；对 M01 做四因子分解，得到各层贡献",
    "output": "首发层与传导路径",
    "next_cond": "找到偏离最早、贡献最大的层",
    "pitfall": "从交易异常直接跳到推荐流量分析"
  },
  {
    "stage": "S3 指标拆解",
    "question": "哪个因子贡献了主要变化？",
    "actions": "乘法关系用 LMDI，加法关系用细分贡献，占比 × 效率用结构—效率分解",
    "output": "主贡献因子及贡献占比",
    "next_cond": "各因子贡献之和与总变化对账一致",
    "pitfall": "使用顺序敏感的逐因子替换却不说明顺序"
  },
  {
    "stage": "S4 维度下钻",
    "question": "影响范围在哪里？",
    "actions": "按首发层的优先维度拆分，截取累计贡献达到参数设定的 Top 细分；人数类指标先归属到内容再加总",
    "output": "影响范围画像与 Top 维度",
    "next_cond": "影响范围收敛到可以对应事件的粒度",
    "pitfall": "人数类指标跨维度直接相加；忽略结构变化"
  },
  {
    "stage": "S5 匹配事件与原因",
    "question": "当时发生了什么，哪些原因可能成立？",
    "actions": "在事件时间轴中筛选时间与影响范围都吻合的事件；在原因—证据矩阵中按首发层筛选原因，逐一核对可排除条件",
    "output": "候选原因清单（包括被排除的原因与理由）",
    "next_cond": "每个候选原因都明确了需要的证据",
    "pitfall": "只写最顺手的一个原因"
  },
  {
    "stage": "S6 因果验证",
    "question": "候选原因站得住吗？",
    "actions": "AB 实验回溯、holdout、灰度与全量对比、受影响与未受影响维度对比、回滚前后；无对照时使用准实验方法",
    "output": "验证证据与置信度",
    "next_cond": "置信度达到结论要求，或明确标注为候选",
    "pitfall": "把时间吻合或同步变化当作因果"
  },
  {
    "stage": "S7 输出结论与动作",
    "question": "怎么讲清楚，做什么？",
    "actions": "按第十章模板输出结构化结论，并明确后续动作",
    "output": "归因结论与后续动作",
    "next_cond": "—",
    "pitfall": "只解释不行动"
  }
];

export const CONFIDENCE_LEVELS: ConfidenceDef[] = [
  {
    "level": "确认",
    "criteria": "有随机实验、holdout、随机灰度或回滚证据，且影响范围与原因的作用范围一致",
    "usage": "可以作为决策依据"
  },
  {
    "level": "高度相关",
    "criteria": "时间、影响范围与机制三者吻合，主要替代解释已排除，但缺少对照证据",
    "usage": "可以指导排查与修复，结论需注明证据类型"
  },
  {
    "level": "候选",
    "criteria": "只有时间吻合或指标同期变化；产品假设关系在经过实验验证前最高到此级",
    "usage": "只作为验证方向，不作为结论对外表述"
  }
];

export const METHODS_CORE: MethodCore[] = [
  {
    "id": "F1",
    "name": "贡献度分解",
    "applies": "总量 = 各细分之和（加法）",
    "question": "哪个场景、品类、作者层级贡献了主要变化",
    "note": "人数类指标跨内容维度去重后不可直接相加"
  },
  {
    "id": "F2",
    "name": "因子拆解（LMDI）",
    "applies": "链路恒等式（乘法），如 M01 = M09 × M12 × M16 × M18",
    "question": "变化首先来自哪一层、哪个因子",
    "note": "各因子贡献之和等于总变化且与因子顺序无关；存在零值时需特殊处理（W01、W02）"
  },
  {
    "id": "F3",
    "name": "结构—效率分解",
    "applies": "总量 = Σ 占比 × 效率",
    "question": "是结构变了还是效率变了，防止辛普森悖论",
    "note": "细分过多时结论不易讲清；交互项需单独列示（W03）"
  },
  {
    "id": "F4",
    "name": "事件时间轴对齐",
    "applies": "从候选原因中筛选",
    "question": "当时发生了什么",
    "note": "时间吻合只能证明相关，必须进入验证"
  }
];

export const METHODS_CAUSAL: MethodCausal[] = [
  {
    "id": "F5",
    "name": "在线对照实验回溯",
    "applies": "候选原因本身就是一次实验或随机分流的变更",
    "strength": "确认",
    "premise": "实验分流正确，无样本比例失衡",
    "limit": "只能回答实验覆盖的变更（W07、W08、W09）"
  },
  {
    "id": "F6",
    "name": "Holdout",
    "applies": "需要衡量一类功能或策略的长期整体效果，如项目一 L1 holdout",
    "strength": "确认",
    "premise": "保留小比例用户长期不接受变更",
    "limit": "维护成本高，影响部分用户体验（W08）"
  },
  {
    "id": "F7",
    "name": "灰度与全量对比",
    "applies": "变更按比例逐步放量",
    "strength": "确认或高度相关",
    "premise": "灰度人群分配接近随机",
    "limit": "非随机灰度需按准实验解读"
  },
  {
    "id": "F8",
    "name": "受影响与未受影响对比（双重差分）",
    "applies": "变更只作用于部分品类、地域、版本或作者",
    "strength": "高度相关，满足平行趋势时可接近确认",
    "premise": "变更前两组趋势平行",
    "limit": "存在溢出效应时会低估或高估（W10）"
  },
  {
    "id": "F9",
    "name": "回滚前后 / 中断时间序列",
    "applies": "变更在明确时点上线或回滚，无对照组",
    "strength": "高度相关",
    "premise": "同期没有其他重大事件",
    "limit": "对同期并发事件敏感（W11）"
  },
  {
    "id": "F10",
    "name": "合成控制与贝叶斯结构时间序列",
    "applies": "只有一个受影响单元，需要构造反事实",
    "strength": "高度相关",
    "premise": "存在不受影响、且与目标相关的对照序列",
    "limit": "对对照序列的选择敏感（W12、W13）"
  }
];

export const ENTRY_POINTS: EntryPoint[] = [
  {
    "problem": "内容流量问题",
    "layer": "内容层",
    "metrics": "I09 内容曝光量、M09 有效播放人数、I01 VV、I06 总消费时长",
    "first": "曝光量还是效率在变；VV 与时长是否背离"
  },
  {
    "problem": "互动问题",
    "layer": "互动层",
    "metrics": "H01~H07、I18 互动率（汇总）",
    "first": "分子还是分母在变；是否集中在某类作者或某个版本"
  },
  {
    "problem": "搜索问题",
    "layer": "搜索层",
    "metrics": "M10 看后搜人数、M12 看后搜率、M20 内容搜索词点击率",
    "first": "有效观看还是看后搜率在变；L1 还是 L2 在变"
  },
  {
    "problem": "交易问题",
    "layer": "交易层",
    "metrics": "M04 看后搜成交人数、M16 看后搜成交转化率、M01 看后搜 GMV",
    "first": "看后搜人数、成交转化率、客单价哪个在变"
  }
];

export const PATTERNS: Pattern[] = [
  {
    "name": "台阶式",
    "shape": "某时点跳变到新水平并维持",
    "directions": "发版、口径变更、策略上线、实验全量、治理动作"
  },
  {
    "name": "尖峰式",
    "shape": "短时间大幅偏离后回归",
    "directions": "故障、数据延迟与回补、Push、活动、热点"
  },
  {
    "name": "趋势式",
    "shape": "缓慢持续同向偏移",
    "directions": "内容供给、用户结构、性能劣化、竞品"
  },
  {
    "name": "周期式",
    "shape": "规律性重复起伏",
    "directions": "周内周期、节假日、季节"
  },
  {
    "name": "锯齿式",
    "shape": "高频反复震荡",
    "directions": "实验反复放量与回滚、策略反复调参"
  }
];

export const BASELINES: BaselineDef[] = [
  {
    "name": "同 weekday 历史同期",
    "applies": "周内周期明显的流量与行为指标",
    "how": "取近若干个同 weekday 的中位数，避免与相邻日直接比较",
    "note": "节假日所在周需要单独标注或剔除"
  },
  {
    "name": "移动中位数",
    "applies": "周期不明显、较平稳的比率指标",
    "how": "对异常点不敏感，比移动平均更稳健",
    "note": "对趋势性变化反应较慢"
  },
  {
    "name": "季节—趋势分解（STL）残差",
    "applies": "同时存在周内与年度周期的指标",
    "how": "先剥离趋势与季节成分，再对残差判断异常（W05）",
    "note": "需要足够长的历史序列"
  },
  {
    "name": "去年同期 / 节假日对齐",
    "applies": "节假日、大促期间的指标",
    "how": "按节假日相对位置对齐，而不是按公历日期",
    "note": "节假日日期逐年变化，需维护节假日表"
  },
  {
    "name": "实验对照组",
    "applies": "处于实验中的指标",
    "how": "直接用对照组作为基线，排除大盘共同变化",
    "note": "需检查样本比例失衡（SRM，W09）"
  }
];

export const LAYERS = ["内容层", "互动层", "搜索层", "交易层"] as const;

export const CROSS_LAYER = "跨层";

export type Layer = (typeof LAYERS)[number];

export const METRIC_BY_ID: Record<string, Metric> = Object.fromEntries(METRICS.map((m) => [m.id, m]));

export const CAUSE_BY_ID: Record<string, Cause> = Object.fromEntries(CAUSES.map((c) => [c.id, c]));
