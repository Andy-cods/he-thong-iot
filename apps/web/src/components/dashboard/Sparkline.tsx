"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Sparkline — mini bar chart SVG inline (TASK-20260427-027).
 *
 * KISS: tự vẽ SVG, không thêm dependency. Dùng cho card "Sản xuất nội bộ"
 * hiển thị trend WO completed 7 ngày qua.
 *
 * - Bars cao tỉ lệ với count, min height 2px (để bar=0 vẫn hiện vạch nhẹ).
 * - Bar cuối (today) tô đậm hơn (current emphasis).
 * - Aria label đọc tổng + range cho screen reader.
 */
export interface SparklineDatum {
  date: string;
  count: number;
}

export interface SparklineProps {
  data: SparklineDatum[];
  className?: string;
  /** Color tone — hiện hỗ trợ rose/emerald/indigo. */
  tone?: "rose" | "emerald" | "indigo";
  height?: number;
  ariaLabel?: string;
}

const TONE: Record<NonNullable<SparklineProps["tone"]>, {
  bar: string;
  barLast: string;
  baseLine: string;
}> = {
  rose: {
    bar: "#fda4af", // rose-300
    barLast: "#e11d48", // rose-600
    baseLine: "#ffe4e6", // rose-100
  },
  emerald: {
    bar: "#6ee7b7",
    barLast: "#059669",
    baseLine: "#d1fae5",
  },
  indigo: {
    bar: "#a5b4fc",
    barLast: "#4338ca",
    baseLine: "#e0e7ff",
  },
};

export function Sparkline({
  data,
  className,
  tone = "rose",
  height = 56,
  ariaLabel,
}: SparklineProps) {
  const pad = 4;
  const width = 200; // viewBox width — scale với CSS
  const innerH = height - pad * 2;
  const colors = TONE[tone];

  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          "flex h-14 items-center justify-center rounded-md bg-zinc-50 text-xs text-zinc-400",
          className,
        )}
      >
        Chưa có dữ liệu
      </div>
    );
  }

  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  const barW = (width - pad * 2) / data.length;
  const gap = Math.min(barW * 0.18, 3);
  const drawBarW = Math.max(2, barW - gap);

  return (
    <svg
      role="img"
      aria-label={
        ariaLabel ?? `Trend ${data.length} ngày, tổng ${total} hoàn tất`
      }
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-14 w-full", className)}
    >
      {/* baseline */}
      <line
        x1={pad}
        y1={height - pad}
        x2={width - pad}
        y2={height - pad}
        stroke={colors.baseLine}
        strokeWidth={1}
      />

      {data.map((d, i) => {
        const ratio = max > 0 ? d.count / max : 0;
        const h = Math.max(2, Math.round(ratio * innerH));
        const x = pad + i * barW + gap / 2;
        const y = height - pad - h;
        const isLast = i === data.length - 1;
        return (
          <rect
            key={`${d.date}-${i}`}
            x={x}
            y={y}
            width={drawBarW}
            height={h}
            rx={1.5}
            fill={isLast ? colors.barLast : colors.bar}
          >
            <title>{`${d.date}: ${d.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
