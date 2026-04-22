"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

/**
 * V1.7-beta.2.4 — 4 KPI tồn kho (Tổng / Sẵn dùng / Giữ QC / Đã giữ chỗ).
 *
 * Dùng chung giữa:
 *   - BomGridPro `InventoryPopover` (size="xs", compact popover width 360px).
 *   - Items Detail `/items/[id]` tab Tồn kho (size="md", card width full).
 *
 * Source of truth: GET /api/items/[id]/inventory-summary → summary.{totalQty,
 * availableQty, holdQty, reservedQty}.
 */

export interface InventoryKpiSummary {
  totalQty: number;
  availableQty: number;
  holdQty: number;
  reservedQty: number;
  consumedQty?: number;
  expiredQty?: number;
}

export interface InventoryKpiCardsProps {
  summary: InventoryKpiSummary;
  size?: "xs" | "md";
  className?: string;
}

const KPI_DEFS: Array<{
  key: keyof Omit<InventoryKpiSummary, "consumedQty" | "expiredQty">;
  label: string;
  accent: "indigo" | "emerald" | "amber" | "blue";
  hint?: string;
}> = [
  {
    key: "totalQty",
    label: "Tổng tồn",
    accent: "indigo",
    hint: "Tồn thực tế toàn bộ lot",
  },
  {
    key: "availableQty",
    label: "Sẵn dùng",
    accent: "emerald",
    hint: "Lot AVAILABLE, cấp phát được",
  },
  {
    key: "holdQty",
    label: "Giữ QC",
    accent: "amber",
    hint: "Lot HOLD, chờ QC thả",
  },
  {
    key: "reservedQty",
    label: "Đã giữ chỗ",
    accent: "blue",
    hint: "Reservation ACTIVE cho WO / PO",
  },
];

const ACCENT_CLASS: Record<"indigo" | "emerald" | "amber" | "blue", string> = {
  indigo: "text-indigo-700",
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  blue: "text-blue-700",
};

export function InventoryKpiCards({
  summary,
  size = "md",
  className,
}: InventoryKpiCardsProps) {
  const compact = size === "xs";
  return (
    <div
      className={cn(
        "grid gap-2",
        compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4 gap-3",
        className,
      )}
    >
      {KPI_DEFS.map((def) => (
        <KpiCard
          key={def.key}
          label={def.label}
          value={summary[def.key] ?? 0}
          accent={def.accent}
          hint={compact ? undefined : def.hint}
          size={size}
        />
      ))}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
  hint,
  size,
}: {
  label: string;
  value: number;
  accent: "indigo" | "emerald" | "amber" | "blue";
  hint?: string;
  size: "xs" | "md";
}) {
  const compact = size === "xs";
  return (
    <div
      className={cn(
        "rounded-md border border-zinc-100 bg-zinc-50/60",
        compact ? "px-2 py-1.5" : "px-3 py-2.5",
      )}
    >
      <div
        className={cn(
          "font-medium uppercase tracking-wide text-zinc-500",
          compact ? "text-[10px]" : "text-[11px]",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "font-mono font-semibold tabular-nums",
          compact ? "text-[15px]" : "text-xl",
          ACCENT_CLASS[accent],
        )}
      >
        {formatNumber(value)}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-zinc-500">{hint}</div>
      ) : null}
    </div>
  );
}
