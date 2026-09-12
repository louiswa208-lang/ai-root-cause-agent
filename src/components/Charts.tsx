"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BLUE = "#2563eb";
const INDIGO = "#4f46e5";
const RED = "#c8372d";
const GRAY = "#8a97ab";

/** 指标单位：ratio 用百分比，其余按注册表单位。 */
export type ChartUnit = "percent" | "yuan" | "count" | "pp";

/**
 * 轴刻度格式化。
 * 关键点：先按单位决定小数位，再检查同一组刻度格式化后是否重复，
 * 重复就提高精度——这样坐标轴不会出现「0、0、0」这种重复刻度。
 */
function formatValue(v: number, unit: ChartUnit, digits: number): string {
  if (unit === "percent") return (v * 100).toFixed(digits) + "%";
  if (unit === "pp") return v.toFixed(digits) + "pp";
  if (unit === "yuan") {
    if (Math.abs(v) >= 10000) return (v / 10000).toFixed(Math.max(1, digits)) + " 万元";
    return v.toFixed(digits) + " 元";
  }
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(Math.max(1, digits)) + " 万";
  return v.toFixed(digits);
}

/** 产生等距且互不重复的刻度。 */
function buildTicks(values: number[], unit: ChartUnit, count = 5): { ticks: number[]; digits: number } {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return { ticks: [], digits: 0 };
  let min = Math.min(...finite, 0);
  let max = Math.max(...finite, 0);
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const step = (max - min) / (count - 1);
  const ticks = Array.from({ length: count }, (_, i) => min + step * i);

  // 逐步提高精度，直到所有刻度的显示文本互不相同
  for (let digits = unit === "percent" ? 1 : 0; digits <= 4; digits++) {
    const labels = ticks.map((t) => formatValue(t, unit, digits));
    if (new Set(labels).size === labels.length) return { ticks, digits };
  }
  return { ticks, digits: 4 };
}

/** 指标趋势 + 基线参考线（S1）。 */
export function TrendChart({
  series,
  baseline,
  targetDate,
  label,
  unit,
}: {
  series: { date: string; value: number }[];
  baseline: number;
  targetDate: string;
  label: string;
  unit: ChartUnit;
}) {
  const data = series.slice(-35);
  const { ticks, digits } = buildTicks([...data.map((d) => d.value), baseline], unit, 5);
  const fmt = (v: number) => formatValue(v, unit, digits);
  const domain: [number, number] | undefined = ticks.length ? [ticks[0], ticks[ticks.length - 1]] : undefined;

  return (
    <div style={{ width: "100%", height: 230 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 14, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--ink-3)" }}
            tickFormatter={(d: string) => d.slice(5)}
            minTickGap={26}
            axisLine={{ stroke: "var(--line)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--ink-3)" }}
            tickFormatter={fmt}
            ticks={ticks}
            domain={domain}
            width={78}
            axisLine={false}
            tickLine={false}
            allowDataOverflow={false}
          />
          <Tooltip
            formatter={(v: number) => [formatValue(v, unit, unit === "percent" ? 2 : 1), label]}
            labelFormatter={(d) => String(d)}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              fontSize: 12,
              boxShadow: "var(--shadow-lg)",
            }}
          />
          <ReferenceLine
            y={baseline}
            stroke={GRAY}
            strokeDasharray="5 4"
            label={{ value: "基线 " + fmt(baseline), fontSize: 11, fill: GRAY, position: "insideTopRight" }}
          />
          {targetDate && <ReferenceLine x={targetDate} stroke={RED} strokeDasharray="3 3" />}
          <Line type="monotone" dataKey="value" stroke={BLUE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 因子 / 维度贡献条形图。所有数值带单位。 */
export function ContributionChart({
  data,
  unit,
  height = 200,
  valueLabel = "贡献",
}: {
  data: { name: string; value: number; share?: number; highlight?: boolean }[];
  unit: ChartUnit;
  height?: number;
  valueLabel?: string;
}) {
  const { ticks, digits } = buildTicks(data.map((d) => d.value), unit, 5);
  const fmt = (v: number) => formatValue(v, unit, digits);
  const domain: [number, number] | undefined = ticks.length ? [ticks[0], ticks[ticks.length - 1]] : undefined;

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "var(--ink-3)" }}
            tickFormatter={fmt}
            ticks={ticks}
            domain={domain}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--ink-2)" }}
            width={112}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            formatter={(v: number, _n, item) => {
              const share = (item?.payload as { share?: number } | undefined)?.share;
              const text =
                formatValue(v, unit, unit === "percent" ? 2 : 1) +
                (share !== undefined ? "（占总变化 " + (share * 100).toFixed(1) + "%）" : "");
              return [text, valueLabel];
            }}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              fontSize: 12,
              boxShadow: "var(--shadow-lg)",
            }}
          />
          <ReferenceLine x={0} stroke="var(--line-strong)" />
          <Bar dataKey="value" radius={[0, 5, 5, 0]} maxBarSize={26}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.highlight ? (d.value < 0 ? RED : INDIGO) : d.value < 0 ? "#e8b3ae" : "#a8c4f0"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
