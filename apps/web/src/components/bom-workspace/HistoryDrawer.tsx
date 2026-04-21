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
      <SheetContent side="right" className="w-[440px] sm:max-w-[440px]">
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
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500">
              Chưa có lịch sử thay đổi.
            </p>
          ) : (
            <ol className="space-y-2.5">
              {entries.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-400 ring-2 ring-indigo-100" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-800">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
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
