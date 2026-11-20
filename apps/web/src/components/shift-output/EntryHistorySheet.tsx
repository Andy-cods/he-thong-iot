"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { useShiftEntryHistory } from "@/hooks/useShiftOutput";

/** V4.10 — lịch sử tạo / sửa / xoá / chốt của 1 dòng (audit_event, bất biến). */
const ACTION_LABEL: Record<string, string> = {
  CREATE: "Tạo",
  UPDATE: "Sửa",
  DELETE: "Xoá",
  TRANSITION: "Chốt",
};

const FIELD_LABEL: Record<string, string> = {
  qtyOk: "OK",
  qtyNg: "NG",
  qtyPlanned: "Kế hoạch",
  qtyRework: "Sửa lại",
  downtimeMin: "Phút dừng",
  workStart: "Giờ chạy từ",
  workEnd: "Giờ chạy đến",
  shiftMinutes: "Phút chạy",
  operatorId: "Người (danh mục)",
  operatorName: "Người",
  materialLot: "Lô phôi",
  notes: "Ghi chú",
  defects: "Chi tiết lỗi",
  downtimes: "Chi tiết dừng",
  prodDate: "Ngày",
  shiftId: "Ca",
  machineId: "Máy",
  partId: "Mã hàng",
  status: "Trạng thái",
};

const show = (v: unknown) => (v == null || v === "" ? "—" : Array.isArray(v) ? `${v.length} mục` : String(v));

export function EntryHistorySheet({ entryId, onClose }: { entryId: string | null; onClose: () => void }) {
  const q = useShiftEntryHistory(entryId);
  return (
    <Sheet open={!!entryId} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent side="right" size="md" className="overflow-y-auto">
        <div className="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
          <SheetTitle className="text-lg font-semibold">Lịch sử sửa</SheetTitle>
        </div>
        <div className="space-y-3 p-4">
          {q.isLoading ? <Skeleton className="h-32 rounded-xl" /> : null}
          {q.isError ? <p className="text-md text-red-600">{(q.error as Error).message}</p> : null}
          <ol className="space-y-3">
            {(q.data ?? []).map((ev) => {
              const keys =
                ev.action === "UPDATE" || ev.action === "TRANSITION"
                  ? Object.keys({ ...(ev.before ?? {}), ...(ev.after ?? {}) }).filter((k) => k in FIELD_LABEL)
                  : [];
              return (
                <li key={ev.id} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-md font-semibold text-zinc-900 dark:text-zinc-50">{ACTION_LABEL[ev.action] ?? ev.action}</span>
                    <time className="text-sm tabular-nums text-zinc-500">{formatDateTime(ev.occurredAt)}</time>
                  </div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">{ev.actorName ?? ev.actorUsername ?? "—"}</div>
                  {keys.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {keys.map((k) => (
                        <li key={k} className="flex flex-wrap gap-x-1.5">
                          <span className="text-zinc-500">{FIELD_LABEL[k]}:</span>
                          <span className="text-zinc-500 line-through">{show(ev.before?.[k])}</span>
                          <span aria-hidden="true">→</span>
                          <span className="font-medium text-zinc-900 dark:text-zinc-50">{show(ev.after?.[k])}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {ev.notes ? <p className="mt-1.5 text-sm italic text-zinc-700 dark:text-zinc-300">“{ev.notes}”</p> : null}
                </li>
              );
            })}
          </ol>
          {q.data && q.data.length === 0 ? <p className="text-md text-zinc-500">Chưa có lịch sử.</p> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
