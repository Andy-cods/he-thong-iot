"use client";

import * as React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "@/components/providers/ThemeProvider";
import { fmtCompactVN, fmtVNDFull } from "@/components/finance/_format";
import type { CashflowPoint } from "@/hooks/useFinance";

/**
 * Biểu đồ dòng tiền theo ngày — ComposedChart (cột Thu/Chi + đường luỹ kế
 * Net). Bọc "use client" bắt buộc (Recharts dùng ResizeObserver, xem
 * wave-2-finance.md §E.3). Dark mode: đọc `useTheme().resolved` để đổi màu
 * trục/lưới/tooltip — Recharts không tự đọc CSS variable/`dark:` class.
 */

// Màu theo palette dự án (đồng bộ emerald=thu / rose=chi đã dùng ở POTab/AccountingTab).
const COLORS = {
  light: {
    grid: "#e4e4e7", // zinc-200
    axis: "#71717a", // zinc-500
    tooltipBg: "#ffffff",
    tooltipBorder: "#e4e4e7",
    tooltipText: "#18181b",
    in: "#059669", // emerald-600
    out: "#e11d48", // rose-600
    net: "#4f46e5", // indigo-600
  },
  dark: {
    grid: "#3f3f46", // zinc-700
    axis: "#a1a1aa", // zinc-400
    tooltipBg: "#18181b", // zinc-900
    tooltipBorder: "#3f3f46",
    tooltipText: "#fafafa",
    in: "#34d399", // emerald-400
    out: "#fb7185", // rose-400
    net: "#818cf8", // indigo-400
  },
} as const;

function fmtAxisDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m) return `${m[3]}/${m[2]}`;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

/**
 * V4.1 (UI) — trục tiền: "1,5 tr" / "2,3 tỷ" / "850 N" (dấu phẩy thập phân kiểu
 * Việt). Trước đây `toFixed(0)` làm 1,5 tr thành "2tr", dưới 1 triệu hiện số thô.
 */
function fmtAxisVND(v: number): string {
  if (v === 0) return "0";
  return fmtCompactVN(v);
}

export function CashflowChart({ data }: { data: CashflowPoint[] }) {
  const { resolved } = useTheme();
  const c = COLORS[resolved];

  // Đường Net dạng luỹ kế (cumulative) — trực quan hoá "xu hướng tăng
  // trưởng" theo đúng yêu cầu gốc (bar = dòng tiền theo ngày, line = xu hướng).
  const chartData = React.useMemo(() => {
    let cumulative = 0;
    return data.map((p) => {
      cumulative += p.net;
      return { ...p, cumulativeNet: cumulative };
    });
  }, [data]);

  return (
    <div className="h-72 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtAxisDate}
            tick={{ fill: c.axis, fontSize: 11 }}
            axisLine={{ stroke: c.grid }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmtAxisVND}
            tick={{ fill: c.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: c.tooltipBg,
              border: `1px solid ${c.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
              color: c.tooltipText,
            }}
            labelFormatter={(label) => fmtAxisDate(String(label ?? ""))}
            formatter={(value, name) => {
              const label = name === "in" ? "Thu" : name === "out" ? "Chi" : "Luỹ kế";
              return [fmtVNDFull(Number(value ?? 0)), label];
            }}
          />
          <Bar dataKey="in" name="in" fill={c.in} radius={[3, 3, 0, 0]} maxBarSize={24} />
          <Bar dataKey="out" name="out" fill={c.out} radius={[3, 3, 0, 0]} maxBarSize={24} />
          <Line
            type="monotone"
            dataKey="cumulativeNet"
            name="net"
            stroke={c.net}
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <LegendDot color={c.in} label="Thu" />
        <LegendDot color={c.out} label="Chi" />
        <LegendDot color={c.net} label="Luỹ kế ròng" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
