"use client";

import * as React from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "@/components/providers/ThemeProvider";
import type { ParetoRow } from "@/lib/shift-output/kpi";
import type { TrendPoint } from "@/lib/shift-output/report";

/**
 * V4.10 — biểu đồ Báo cáo Sản lượng ca (recharts, nạp lười qua next/dynamic).
 * Màu: indigo (thương hiệu) cho số lượng, đỏ cho NG, xám cho lưới/trục; đường %
 * tích luỹ / % NG dùng 1 màu nét. Không gradient.
 */
const COLORS = {
  light: { grid: "#e4e4e7", axis: "#71717a", bar: "#4f46e5", ng: "#dc2626", line: "#18181b", muted: "#a1a1aa", tipBg: "#ffffff", tipText: "#18181b" },
  dark: { grid: "#3f3f46", axis: "#a1a1aa", bar: "#818cf8", ng: "#f87171", line: "#fafafa", muted: "#71717a", tipBg: "#18181b", tipText: "#fafafa" },
} as const;

const vn = (n: number, d = 0) => n.toLocaleString("vi-VN", { maximumFractionDigits: d });

function Legend({ items }: { items: Array<{ color: string; label: string; line?: boolean }> }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={i.line ? "h-0.5 w-4" : "h-2.5 w-2.5 rounded-sm"} style={{ backgroundColor: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function ParetoChart({ rows, unit }: { rows: ParetoRow[]; unit: string }) {
  const { resolved } = useTheme();
  const c = COLORS[resolved];
  return (
    <div className="w-full">
      <div className="h-72 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: c.axis, fontSize: 11 }}
              interval={0}
              tickLine={false}
              axisLine={{ stroke: c.grid }}
              height={48}
              tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
            />
            <YAxis yAxisId="v" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <YAxis
              yAxisId="p"
              orientation="right"
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: c.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{ backgroundColor: c.tipBg, border: `1px solid ${c.grid}`, borderRadius: 8, fontSize: 12, color: c.tipText }}
              formatter={(value, name) =>
                name === "cumPct" ? [`${vn(Number(value), 1)}%`, "Tích luỹ"] : [`${vn(Number(value))}${unit}`, "Số lượng"]
              }
            />
            <Bar yAxisId="v" dataKey="value" fill={c.bar} radius={[3, 3, 0, 0]} maxBarSize={40} />
            <Line yAxisId="p" type="monotone" dataKey="cumPct" stroke={c.line} strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend items={[{ color: c.bar, label: `Số lượng${unit ? ` (${unit.trim()})` : ""}` }, { color: c.line, label: "% tích luỹ", line: true }]} />
    </div>
  );
}

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const { resolved } = useTheme();
  const c = COLORS[resolved];
  const data = points.map((p) => ({ ...p, ngPct: p.ngPct ?? undefined, availabilityPct: p.availabilityPct ?? undefined }));
  return (
    <div className="w-full">
      <div className="h-72 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
              tick={{ fill: c.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: c.grid }}
              minTickGap={12}
            />
            <YAxis yAxisId="q" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
            <YAxis
              yAxisId="p"
              orientation="right"
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: c.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{ backgroundColor: c.tipBg, border: `1px solid ${c.grid}`, borderRadius: 8, fontSize: 12, color: c.tipText }}
              labelFormatter={(d) => {
                const s = String(d ?? "");
                return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
              }}
              formatter={(value, name) => {
                if (name === "ok") return [vn(Number(value)), "OK"];
                if (name === "ngPct") return [`${vn(Number(value), 1)}%`, "% NG"];
                return [`${vn(Number(value), 0)}%`, "% khả dụng"];
              }}
            />
            <Bar yAxisId="q" dataKey="ok" fill={c.bar} radius={[3, 3, 0, 0]} maxBarSize={22} />
            <Line yAxisId="p" type="monotone" dataKey="ngPct" stroke={c.ng} strokeWidth={2} dot={false} connectNulls />
            <Line yAxisId="p" type="monotone" dataKey="availabilityPct" stroke={c.line} strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { color: c.bar, label: "SL OK" },
          { color: c.ng, label: "% NG", line: true },
          { color: c.line, label: "% khả dụng", line: true },
        ]}
      />
    </div>
  );
}
