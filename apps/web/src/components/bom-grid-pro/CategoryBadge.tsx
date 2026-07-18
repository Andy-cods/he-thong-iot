"use client";

import * as React from "react";
import type { BomFlatRow } from "@/lib/bom-grid/flatten-tree";
import { cn } from "@/lib/utils";

/**
 * V3.7.37 — CategoryBadge thay KindDropdown.
 *
 * User feedback: "category để tên theo cột excel, ko cần tùy chọn, chỉ có
 * thương mại / GTAM / đặt gia công ngoài thôi".
 *
 * Display-only badge từ metadata.category (raw Excel text). 3 giá trị chuẩn:
 *   - "Thương mại"          (com)  — blue   — hàng có sẵn mua từ NCC
 *   - "GTAM"                (gtam) — purple — hàng tự gia công nội bộ GTAM
 *   - "Đặt gia công ngoài"  (out)  — orange — hàng đặt gia công bên ngoài
 *
 * Text khác / rỗng → fallback xám "—". Edit qua BomLineSheet, không inline.
 */

export interface CategoryBadgeProps {
  row: BomFlatRow;
}

type CategoryStyle = {
  color: "blue" | "purple" | "orange" | "zinc";
  label: string;
};

function classifyCategory(raw: string | undefined | null): CategoryStyle {
  const text = (raw ?? "").trim();
  const norm = text.toLowerCase();

  if (norm === "thương mại" || norm === "thuong mai" || norm === "com")
    return { color: "blue", label: "Thương mại" };
  if (norm === "gtam") return { color: "purple", label: "GTAM" };
  if (
    norm.includes("đặt gia công ngoài") ||
    norm.includes("dat gia cong ngoai") ||
    norm.includes("gia công ngoài") ||
    norm === "out" ||
    norm === "outsource"
  )
    return { color: "orange", label: "Đặt gia công ngoài" };

  // Fallback giữ raw text user nhập (nếu khác 3 chuẩn).
  return { color: "zinc", label: text || "—" };
}

const COLOR_CLASS: Record<CategoryStyle["color"], string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:ring-blue-800",
  purple: "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:ring-purple-800",
  orange: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:ring-orange-800",
  zinc: "bg-zinc-100 text-zinc-500 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700",
};

export function CategoryBadge({ row }: CategoryBadgeProps) {
  // Group rows (cụm lắp có con) — không render badge.
  if (row.kind === "group") return null;

  const meta = (row.node.metadata ?? {}) as { category?: unknown };
  const raw = typeof meta.category === "string" ? meta.category : null;
  const style = classifyCategory(raw);

  if (style.label === "—") {
    return <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded px-1.5 text-[11px] font-medium ring-1 ring-inset",
        COLOR_CLASS[style.color],
      )}
      title={`Category (Excel): ${style.label}`}
    >
      {style.label}
    </span>
  );
}

/** 3 giá trị chuẩn cho dropdown trong BomLineSheet edit dialog. */
export const CATEGORY_OPTIONS = [
  { value: "Thương mại", label: "Thương mại", hint: "Có sẵn · Mua NCC" },
  { value: "GTAM", label: "GTAM", hint: "Tự gia công nội bộ" },
  {
    value: "Đặt gia công ngoài",
    label: "Đặt gia công ngoài",
    hint: "Đặt gia công bên ngoài theo yêu cầu",
  },
] as const;
