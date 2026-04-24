"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useOrderActivityLog,
  useUpdateProductionNotes,
  type SalesOrderRow,
} from "@/hooks/useOrders";

/**
 * V1.9 Phase 3 — Section "Ghi chú + Lịch sử" cho tab Sản xuất.
 *
 * - 1 textarea cho production_notes (last-write-wins, không versionLock).
 * - Timeline audit đọc từ /api/orders/[code]/activity-log (100 record mới nhất).
 */
interface OrderNotesSectionProps {
  order: SalesOrderRow;
  orderCode: string;
  readOnly?: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Tạo",
  UPDATE: "Cập nhật",
  DELETE: "Xóa",
  TRANSITION: "Chuyển trạng thái",
  RESERVE: "Cấp phát",
  ISSUE: "Xuất kho",
  RECEIVE: "Nhận hàng",
  APPROVE: "Phê duyệt",
  CONVERT: "Chuyển đổi",
  WO_START: "Bắt đầu WO",
  WO_PAUSE: "Tạm dừng WO",
  WO_RESUME: "Tiếp tục WO",
  WO_COMPLETE: "Hoàn thành WO",
  SNAPSHOT: "Snapshot",
  RELEASE: "Release",
  POST: "Post",
  CANCEL: "Huỷ",
};

const OBJECT_TYPE_LABELS: Record<string, string> = {
  sales_order: "Đơn hàng",
  bom_snapshot_line: "Snapshot line",
  work_order: "Work Order",
  purchase_order: "PO",
};

export function OrderNotesSection({
  order,
  orderCode,
  readOnly,
}: OrderNotesSectionProps) {
  const activity = useOrderActivityLog(orderCode);
  const mutate = useUpdateProductionNotes(orderCode);

  const [draft, setDraft] = React.useState(order.productionNotes ?? "");
  const [dirty, setDirty] = React.useState(false);

  // Sync when upstream changes (after save).
  React.useEffect(() => {
    if (!dirty) setDraft(order.productionNotes ?? "");
  }, [order.productionNotes, dirty]);

  const handleSave = async () => {
    try {
      await mutate.mutateAsync({ productionNotes: draft.trim() || null });
      toast.success("Đã lưu ghi chú sản xuất.");
      setDirty(false);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "FORBIDDEN") {
        toast.error("Bạn không có quyền cập nhật ghi chú đơn hàng.");
      } else {
        toast.error(e.message ?? "Lưu ghi chú thất bại.");
      }
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* Notes editor */}
      <section className="rounded-md border border-zinc-200 bg-white lg:col-span-3">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
          <MessageSquarePlus
            className="h-4 w-4 text-zinc-500"
            aria-hidden="true"
          />
          <h3 className="text-sm font-medium text-zinc-900">
            Ghi chú sản xuất
          </h3>
          {order.productionNotesUpdatedAt && (
            <span className="ml-auto text-[11px] text-zinc-500">
              Cập nhật{" "}
              {formatDate(order.productionNotesUpdatedAt, "dd/MM HH:mm")}
            </span>
          )}
        </div>
        <div className="space-y-3 px-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="production-notes" uppercase>
              Nội dung
            </Label>
            <Textarea
              id="production-notes"
              rows={6}
              maxLength={4000}
              placeholder="VD: Khách yêu cầu ưu tiên lô đầu giao 2026-05-10; chú ý siết lực 30Nm cho bu-lông M8..."
              value={draft}
              disabled={readOnly}
              onChange={(e) => {
                setDraft(e.target.value);
                setDirty(true);
              }}
            />
            <p className="text-[11px] text-zinc-500">
              Ghi chú ngắn cho toàn đơn hàng. Lịch sử chi tiết xem ở cột bên
              phải.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            {dirty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(order.productionNotes ?? "");
                  setDirty(false);
                }}
                disabled={mutate.isPending}
              >
                Hoàn tác
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={!dirty || mutate.isPending || readOnly}
            >
              {mutate.isPending && (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              )}
              Ghi nhận
            </Button>
          </div>
        </div>
      </section>

      {/* Activity timeline */}
      <section className="rounded-md border border-zinc-200 bg-white lg:col-span-2">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
          <History className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          <h3 className="text-sm font-medium text-zinc-900">
            Lịch sử thao tác
          </h3>
          {activity.data?.data && (
            <span className="ml-auto text-[11px] text-zinc-500">
              {activity.data.data.length} sự kiện
            </span>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {activity.isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2
                className="h-4 w-4 animate-spin text-zinc-400"
                aria-hidden="true"
              />
            </div>
          ) : activity.isError ? (
            <div className="px-4 py-4 text-xs text-red-600">
              Không tải được lịch sử.
            </div>
          ) : !activity.data?.data || activity.data.data.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-500">
              Chưa có thao tác nào được ghi nhận.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {activity.data.data.map((ev) => {
                const actionLabel = ACTION_LABELS[ev.action] ?? ev.action;
                const typeLabel =
                  OBJECT_TYPE_LABELS[ev.objectType] ?? ev.objectType;
                return (
                  <li key={ev.id} className="px-4 py-2.5">
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                          ev.action === "CREATE"
                            ? "bg-emerald-500"
                            : ev.action === "DELETE" || ev.action === "CANCEL"
                              ? "bg-red-500"
                              : ev.action.startsWith("WO_")
                                ? "bg-indigo-500"
                                : "bg-zinc-400",
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                          <span className="font-medium text-zinc-900">
                            {actionLabel}
                          </span>
                          <span className="text-zinc-400">·</span>
                          <span className="text-zinc-600">{typeLabel}</span>
                          {ev.actorUsername && (
                            <>
                              <span className="text-zinc-400">·</span>
                              <span className="font-mono text-indigo-600">
                                {ev.actorUsername}
                              </span>
                            </>
                          )}
                        </div>
                        {ev.notes && (
                          <p className="mt-0.5 truncate text-[11px] text-zinc-600">
                            {ev.notes}
                          </p>
                        )}
                        <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
                          {formatDate(ev.occurredAt, "dd/MM/yyyy HH:mm")}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
