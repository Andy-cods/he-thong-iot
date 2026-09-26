"use client";

import * as React from "react";
import { History } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { useActivityLog } from "@/hooks/useBom";

const ACTION_LABELS: Record<string, string> = {
  GRID_SAVE: "Lưu BOM Grid",
  WO_COMPLETED: "Lệnh SX hoàn thành",
  MATERIAL_RECEIVED: "Nhận vật tư",
  CREATE: "Tạo mới",
  UPDATE: "Cập nhật",
  DELETE: "Xoá",
  RELEASE: "Release revision",
};

export interface HistoryDrawerProps {
  bomId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * V1.7-beta — Right drawer 440px hiển thị timeline activity log cho BOM.
 * Trigger qua button "Lịch sử" trong BomWorkspaceTopbar hoặc URL
 * ?drawer=history (deep link từ sub-route /history cũ redirect).
 */
export function HistoryDrawer({ bomId, open, onOpenChange }: HistoryDrawerProps) {
  const query = useActivityLog("bom_template", bomId, open && !!bomId);
  const entries = query.data?.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="md:w-[440px]"> {/* V4.1 UI-X1: điện thoại full-width (w-[440px] tràn màn 390px) */}
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-indigo-500" aria-hidden />
            Lịch sử thay đổi
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2 overflow-y-auto">
          {query.isLoading ? (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </>
          ) : query.isError && entries.length === 0 ? (
            // V4.1 UI-05: lỗi API không được hiện "Chưa có lịch sử".
            <QueryError
              compact
              error={query.error}
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
              title="Không tải được lịch sử thay đổi"
            />
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
              Chưa có lịch sử thay đổi.
            </p>
          ) : (
            <ol className="space-y-2.5">
              {entries.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-400 ring-2 ring-indigo-100 dark:ring-indigo-900/40" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {new Date(entry.at).toLocaleString("vi-VN")}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
