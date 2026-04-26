"use client";

import * as React from "react";
import { Plus, FileText, Beaker, Layers, FileEdit } from "lucide-react";
import { BOM_SHEET_KIND_LABELS, type BomSheetKind } from "@iot/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { BomSheetRow } from "@/hooks/useBomSheets";

/**
 * V2.0 Sprint 6 — Tab bar hiển thị sheets của 1 BOM List.
 *
 * - Desktop ≥1024: tabs ngang
 * - Tablet/mobile <1024: dropdown selector (TODO sau, hiện scroll-x)
 *
 * Click tab → switch active sheet (parent component handle filter lines).
 * Nút "+ Thêm sheet" cuối hàng (mở AddSheetDialog).
 */

export interface BomSheetTabsProps {
  sheets: BomSheetRow[];
  activeSheetId: string | null;
  onChange: (sheetId: string) => void;
  onAddSheet?: () => void;
  loading?: boolean;
  className?: string;
  /** Disable nút thêm sheet (vd BOM ACTIVE/OBSOLETE chỉ admin sửa). */
  canAddSheet?: boolean;
}

const KIND_ICON: Record<BomSheetKind, React.ElementType> = {
  PROJECT: FileText,
  MATERIAL: Beaker,
  PROCESS: Layers,
  CUSTOM: FileEdit,
};

const KIND_COLOR: Record<BomSheetKind, string> = {
  PROJECT: "text-indigo-600",
  MATERIAL: "text-emerald-600",
  PROCESS: "text-amber-600",
  CUSTOM: "text-zinc-600",
};

export function BomSheetTabs({
  sheets,
  activeSheetId,
  onChange,
  onAddSheet,
  loading,
  canAddSheet = true,
  className,
}: BomSheetTabsProps) {
  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-1 border-b border-zinc-200 bg-white px-4 py-1.5",
          className,
        )}
        aria-busy="true"
      >
        <div className="h-7 w-32 animate-pulse rounded-sm bg-zinc-100" />
        <div className="h-7 w-32 animate-pulse rounded-sm bg-zinc-100" />
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-1.5 text-sm text-zinc-500",
          className,
        )}
      >
        <span>BOM chưa có sheet nào</span>
        {onAddSheet && canAddSheet ? (
          <Button size="sm" variant="outline" onClick={onAddSheet}>
            <Plus className="mr-1 h-3 w-3" /> Tạo sheet đầu tiên
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label="Sheets của BOM"
      className={cn(
        "flex items-center gap-0.5 overflow-x-auto border-b border-zinc-200 bg-white px-2",
        className,
      )}
    >
      {sheets.map((sheet) => {
        const Icon = KIND_ICON[sheet.kind];
        const isActive = sheet.id === activeSheetId;
        return (
          <button
            key={sheet.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(sheet.id)}
            className={cn(
              "group relative flex h-9 shrink-0 items-center gap-1.5 px-3 text-sm font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1",
              isActive
                ? "text-zinc-900"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700",
            )}
            title={`${sheet.name} · ${BOM_SHEET_KIND_LABELS[sheet.kind]}${
              sheet.kind === "PROJECT" ? ` · ${sheet.lineCount} dòng` : ""
            }`}
          >
            <Icon
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isActive
                  ? KIND_COLOR[sheet.kind]
                  : "text-zinc-400 group-hover:text-zinc-500",
              )}
              aria-hidden="true"
            />
            <span className="max-w-[200px] truncate">{sheet.name}</span>
            {sheet.kind === "PROJECT" && sheet.lineCount > 0 ? (
              <span
                className={cn(
                  "ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 text-[10px] font-medium tabular-nums",
                  isActive
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-zinc-100 text-zinc-600",
                )}
              >
                {sheet.lineCount}
              </span>
            ) : null}
            {isActive ? (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t bg-indigo-500"
              />
            ) : null}
          </button>
        );
      })}

      {onAddSheet && canAddSheet ? (
        <button
          type="button"
          onClick={onAddSheet}
          className="ml-1 inline-flex h-7 items-center gap-1 rounded-sm border border-dashed border-zinc-300 px-2 text-xs font-medium text-zinc-500 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Thêm sheet mới"
          title="Thêm sheet mới vào BOM này"
        >
          <Plus className="h-3 w-3" />
          Thêm sheet
        </button>
      ) : null}
    </div>
  );
}
