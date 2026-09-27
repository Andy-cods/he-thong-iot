"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { QueryError } from "@/components/ui/query-error";
import { StatusPill } from "@/components/ui/status-badge";
import { useReceivingAudit } from "@/hooks/useReceivingEvents";
import { formatDateTime, formatQty } from "@/lib/format";

/**
 * V4.1 PO-UI: lịch sử nhận hàng (phiếu nhập + dòng đã nhận) — gọn, 2 khối
 * cạnh nhau trên màn rộng, xếp dọc trên điện thoại.
 */
export function PoReceivingHistory({ poId }: { poId: string }) {
  const audit = useReceivingAudit(poId);
  if (audit.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải lịch sử nhận hàng…
      </div>
    );
  }
  if (audit.isError || !audit.data?.data) {
    return (
      <QueryError
        compact
        error={audit.error}
        onRetry={() => void audit.refetch()}
        retrying={audit.isFetching}
        title="Không tải được lịch sử nhận hàng"
      />
    );
  }
  const data = audit.data.data;
  if (data.receipts.length === 0 && data.receiptLines.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Chưa có phiếu nhập nào.</p>;
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="min-w-0">
        <h3 className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Phiếu nhập kho ({data.receipts.length})
        </h3>
        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {data.receipts.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">{r.receiptNo}</p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDateTime(r.receivedAt)}
                  {r.qcNotes && ` · ${r.qcNotes}`}
                </p>
              </div>
              {/* V4.1 UI-07: QC nhận hàng — nhãn tiếng Việt thay mã thô OK/NG. */}
              <StatusPill domain="receiptQc" code={r.qcFlag} />
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0">
        <h3 className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Vật tư đã nhận ({data.receiptLines.length})
        </h3>
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
                <th className="px-3 py-1.5 text-left font-medium">Mã vật tư</th>
                <th className="px-3 py-1.5 text-left font-medium">Tên</th>
                <th className="px-3 py-1.5 text-right font-medium">SL nhận</th>
                <th className="px-3 py-1.5 text-left font-medium">Lô</th>
              </tr>
            </thead>
            <tbody>
              {data.receiptLines.map((l) => (
                <tr key={l.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-3 py-1.5 font-mono text-xs text-zinc-900 dark:text-zinc-100">{l.itemSku ?? "—"}</td>
                  <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300">{l.itemName ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                    {formatQty(l.receivedQty, l.itemUom)}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {l.lotCode ?? l.serialCode ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
