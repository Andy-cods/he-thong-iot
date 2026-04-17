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
 * V2 BulkActionBar — Linear-inspired compact (design-spec §2.4).
 *
 * - Sticky bottom, height 48px (thay 56px V1).
 * - bg white border-t zinc-200 shadow-sm (thay V1 dark bar, vì content density cao
 *   dark bar làm nặng viewport — impl-plan §8.T7 ghi zinc-900 nhưng nhìn theo
 *   design-spec §2.4 ASCII test lại: test với white để khớp form/detail section).
 * - Font 13px.
 * - Left: count "Đã chọn {n} / {total}" + link "Chọn tất cả {total} khớp filter".
 * - Right buttons size sm: "Xuất Excel" ghost + "Xoá {n}" destructive + "Huỷ" ghost.
 * - Slide-up 150ms khi selectedCount > 0.
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
        "sticky bottom-0 z-sticky flex h-12 flex-wrap items-center gap-3 border-t border-zinc-200 bg-white px-4 shadow-sm",
        "animate-in slide-in-from-bottom-2 duration-150 ease-out",
      )}
    >
      <div className="text-base font-medium text-zinc-900">
        Đã chọn{" "}
        <span className="tabular-nums">{count.toLocaleString("vi-VN")}</span>
        {totalMatching > 0 && (
          <span className="text-zinc-500">
            {" "}/ {totalMatching.toLocaleString("vi-VN")}
          </span>
        )}
        {mode === "all-matching" && (
          <span className="ml-1 text-zinc-500">(tất cả khớp filter)</span>
        )}
      </div>

      {showSelectAllHint && (
        <button
          type="button"
          onClick={onSelectAllMatching}
          className="text-base font-medium text-blue-600 underline-offset-2 transition-colors hover:text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          Chọn tất cả {totalMatching.toLocaleString("vi-VN")} khớp filter
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        {onExport && (
          <Button variant="ghost" size="sm" onClick={onExport}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Xuất Excel
          </Button>
        )}
        {onDelete && (
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Xoá {count.toLocaleString("vi-VN")}
          </Button>
        )}
        {onClear && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            aria-label="Huỷ chọn"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Huỷ
          </Button>
        )}
      </div>
    </div>
  );
}
