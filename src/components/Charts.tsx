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

const BLUE = "#2a78d6";
const RED = "#d1584f";
const GRAY = "#9aa0aa";

function fmt(v: number): string {
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(1) + "万";
  if (Math.abs(v) < 1 && v !== 0) return (v * 100).toFixed(2) + "%";
  return v.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}

/** 指标趋势 + 基线参考线（S1 的可视化） */
export function TrendChart({
  series,
  baseline,
  targetDate,
  label,
}: {
  series: { date: string; value: number }[];
  baseline: number;
  targetDate: string;
  label: string;
}) {
  const data = series.slice(-35);
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--ink3)" }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
          <YAxis tick={{ fontSize: 11, fill: "var(--ink3)" }} tickFormatter={fmt} width={56} />
          <Tooltip
            formatter={(v: number) => [fmt(v), label]}
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
          />
          <ReferenceLine y={baseline} stroke={GRAY} strokeDasharray="4 4" label={{ value: "基线", fontSize: 11, fill: GRAY, position: "insideTopRight" }} />
          <ReferenceLine x={targetDate} stroke={RED} strokeDasharray="2 2" />
          <Line type="monotone" dataKey="value" stroke={BLUE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 因子贡献 / 维度贡献条形图 */
export function ContributionChart({
  data,
  height = 190,
}: {
  data: { name: string; value: number; highlight?: boolean }[];
  height?: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: "var(--ink3)" }} tickFormatter={fmt} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--ink2)" }} width={104} />
          <Tooltip
            formatter={(v: number) => [fmt(v), "贡献"]}
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
          />
          <ReferenceLine x={0} stroke="var(--ink3)" />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.highlight ? BLUE : d.value < 0 ? "#e0a3a0" : "#a9c8ee"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
