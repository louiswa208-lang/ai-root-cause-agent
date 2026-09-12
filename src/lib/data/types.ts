/** 数据层类型定义：原始行、数据集元信息、指标注册表。 */

/** 解析后的一行：日期 + 维度取值 + 度量值。 */
export interface DataRow {
  date: string; // YYYY-MM-DD
  dims: Record<string, string>;
  measures: Record<string, number>;
}

export interface DatasetMetadata {
  name: string;
  rowCount: number;
  dateColumn: string;
  dateRange: { start: string; end: string };
  dimensions: string[];
  measures: string[];
  /** 可以直接计算的指标编号（项目三口径） */
  availableMetrics: string[];
  warnings: string[];
}

export interface Dataset {
  metadata: DatasetMetadata;
  rows: DataRow[];
  events: EventRecord[];
}

/** 事件时间轴的一条记录，对应项目三 Excel「⑥事件时间轴」。 */
export interface EventRecord {
  id: string;
  date: string;
  type: string; // 发版 / 实验 / 策略 / 运营活动 / 治理动作 / 故障 / 外部事件 / 口径与埋点
  name: string;
  scopeDim?: string;
  scopeValue?: string;
  platform?: string;
  ramp?: string;
  layer?: string;
  metrics?: string;
  source?: string;
}

export type MetricKind = "count" | "ratio";

/** 指标注册表：把项目三的指标口径落到数据列上。 */
export interface MetricDef {
  id: string; // M01 / M12 / H02 ...
  label: string;
  layer: "内容层" | "互动层" | "搜索层" | "交易层";
  kind: MetricKind;
  /** count 型指标直接求和的列 */
  column?: string;
  /** ratio 型指标的分子分母列 */
  numerator?: string;
  denominator?: string;
  unit?: string;
  /** 数学关系：本指标 = factors 的乘积（用于 LMDI） */
  factors?: string[];
}
