"use client";

import * as React from "react";
import { Download, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BulkActionBarProps {
  count: number;
  /** Tổng tất cả match filter (phục vụ prompt "Chọn tất cả X khớp"). */
  totalMatching: number;
  mode: "none" | "visible" | "all-matching";
  onSelectAllMatching?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onClear?: () => void;
}

/**
 * BulkActionBar — sticky bottom bar xuất hiện khi count > 0 (design-spec §2.4).
 *
 * Khi mode="visible" và count = số visible trên trang → show link
 * "Chọn tất cả {totalMatching} khớp bộ lọc".
 */
export function BulkActionBar({
  count,
  totalMatching,
  mode,
  onSelectAllMatching,
  onDelete,
  onExport,
  onClear,
}: BulkActionBarProps) {
  if (count === 0) return null;

  const showSelectAllHint =
    mode === "visible" && count < totalMatching && onSelectAllMatching;

  return (
    <div
      role="region"
      aria-label={`Đã chọn ${count} vật tư`}
      className={cn(
        "sticky bottom-0 z-sticky flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-4 py-3 shadow-md",
        "animate-in slide-in-from-bottom-2 duration-base",
      )}
    >
      <div className="text-sm font-medium text-slate-900">
        Đã chọn{" "}
        <span className="tabular-nums">{count.toLocaleString("vi-VN")}</span>
        {mode === "all-matching" && (
          <span className="ml-1 text-slate-500">(tất cả khớp filter)</span>
        )}
      </div>

      {showSelectAllHint && (
        <button
          type="button"
          onClick={onSelectAllMatching}
          className="text-sm font-medium text-info-strong underline underline-offset-2 hover:text-info"
        >
          Chọn tất cả {totalMatching.toLocaleString("vi-VN")} khớp bộ lọc
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        {onExport && (
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Xuất Excel
          </Button>
        )}
        {onDelete && (
          <Button variant="danger" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Xoá {count}
          </Button>
        )}
        {onClear && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            aria-label="Huỷ chọn"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
