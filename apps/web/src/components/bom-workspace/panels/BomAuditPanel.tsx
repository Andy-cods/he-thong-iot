"use client";

import * as React from "react";
import { Activity, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useBomAuditLog } from "@/hooks/useBom";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Tạo",
  UPDATE: "Cập nhật",
  DELETE: "Xoá",
  LOGIN: "Đăng nhập",
  LOGOUT: "Đăng xuất",
  RELEASE: "Phát hành",
  SNAPSHOT: "Snapshot",
  POST: "Đăng",
  CANCEL: "Huỷ",
  UPLOAD: "Tải lên",
  COMMIT: "Commit",
  TRANSITION: "Chuyển trạng thái",
  RESERVE: "Reserve",
  ISSUE: "Xuất kho",
  RECEIVE: "Nhập kho",
  APPROVE: "Duyệt",
  CONVERT: "Chuyển đổi",
  WO_START: "Bắt đầu WO",
  WO_PAUSE: "Tạm dừng WO",
  WO_RESUME: "Tiếp tục WO",
  WO_COMPLETE: "Hoàn thành WO",
  ECO_SUBMIT: "Gửi ECO",
  ECO_APPROVE: "Duyệt ECO",
  ECO_APPLY: "Áp dụng ECO",
  ECO_REJECT: "Từ chối ECO",
  QC_CHECK: "QC kiểm tra",
};

const OBJECT_TYPE_LABELS: Record<string, string> = {
  bom_template: "BOM",
  bom_revision: "BOM revision",
  bom_snapshot_line: "Snapshot line",
  sales_order: "Đơn hàng",
  work_order: "Lệnh SX",
  purchase_request: "Yêu cầu mua",
  purchase_order: "Đơn mua",
  item: "Vật tư",
  user: "User",
};

const ACTION_TONE: Record<string, string> = {
  CREATE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  UPDATE: "border-blue-200 bg-blue-50 text-blue-700",
  DELETE: "border-red-200 bg-red-50 text-red-700",
  TRANSITION: "border-indigo-200 bg-indigo-50 text-indigo-700",
  RESERVE: "border-amber-200 bg-amber-50 text-amber-700",
  ISSUE: "border-orange-200 bg-orange-50 text-orange-700",
  RECEIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  APPROVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CANCEL: "border-red-200 bg-red-50 text-red-700",
};

/**
 * V2.0 P2 W6 — TASK-20260427-013.
 *
 * BomAuditPanel — gộp audit log từ:
 *   - bom_template (entity = BOM hiện tại)
 *   - sales_order (orders dùng BOM này)
 *   - bom_snapshot_line (lines của các orders đó)
 *
 * Hiển thị timeline 100 record gần nhất.
 */
export function BomAuditPanel({ bomId }: { bomId: string }) {
  const query = useBomAuditLog(bomId);
  const rows = query.data?.data ?? [];

  if (query.isLoading && rows.length === 0) {
    return (
      <div className="space-y-1 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-xs text-zinc-500">
        Chưa có lịch sử thao tác.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50/60 px-3 py-2">
        <Activity className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
        <span className="text-xs font-medium text-zinc-700">
          {rows.length} sự kiện gần đây
        </span>
        <span className="ml-auto text-[10px] text-zinc-400">
          (BOM + đơn hàng + snapshot lines)
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm">
            <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-1.5 text-left font-medium">Thời gian</th>
              <th className="px-3 py-1.5 text-left font-medium">Người</th>
              <th className="px-3 py-1.5 text-left font-medium">Hành động</th>
              <th className="px-3 py-1.5 text-left font-medium">Đối tượng</th>
              <th className="px-3 py-1.5 text-left font-medium">Ghi chú</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const actionLabel = ACTION_LABELS[r.action] ?? r.action;
              const actionTone =
                ACTION_TONE[r.action] ??
                "border-zinc-200 bg-zinc-100 text-zinc-700";
              const objectLabel =
                OBJECT_TYPE_LABELS[r.objectType] ?? r.objectType;
              return (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <td className="px-3 py-1.5 align-top font-mono text-[10px] tabular-nums text-zinc-500 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {formatDate(r.occurredAt, "dd/MM/yyyy HH:mm")}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 align-top text-[11px] text-zinc-700">
                    {r.actorUsername ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 align-top">
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-sm border px-1.5 text-[10px] font-medium",
                        actionTone,
                      )}
                    >
                      {actionLabel}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 align-top text-[11px] text-zinc-700">
                    <span className="font-medium">{objectLabel}</span>
                    {r.objectId && (
                      <span className="ml-1 font-mono text-[10px] text-zinc-400">
                        #{r.objectId.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 align-top text-[11px] text-zinc-600">
                    {r.notes ?? <span className="text-zinc-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
