"use client";

import * as React from "react";
import { Loader2, Package, Receipt, ScanLine, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useReceivingAudit } from "@/hooks/useReceivingEvents";
import { QueryError } from "@/components/ui/query-error";
import { StatusPill } from "@/components/ui/status-badge";
import { formatDateTime, formatQty } from "@/lib/format";
import type { PORow } from "@/hooks/usePurchaseOrders";

/**
 * V3.2 — drawer hiển thị lịch sử nhận hàng cho 1 PO.
 *
 * 3 sections:
 *   1. Inbound receipts (header) — RCV-yymm-NNNN
 *   2. Receipt lines — chi tiết item nhận
 *   3. Raw scan events — audit barcode + timestamp
 */
export interface ReceivingHistoryDrawerProps {
  po: PORow | null;
  onClose: () => void;
}

// V4.1 UI-07/08: nhãn + màu QC từ lib/status.ts (domain "receiptQc") — bỏ QC_BADGE
// cục bộ ("OK"/"NG"/"Chờ KCS" → "Đạt"/"Không đạt"/"Chờ kiểm"). Mã lạ coi như chờ kiểm.
function qcCode(flag: string | null | undefined): "OK" | "NG" | "PENDING" {
  return flag === "OK" || flag === "NG" ? flag : "PENDING";
}
// V4.1 UI-15: formatDateTime chung (giờ VN) thay hàm cục bộ.

export function ReceivingHistoryDrawer({ po, onClose }: ReceivingHistoryDrawerProps) {
  const open = po !== null;
  const audit = useReceivingAudit(open ? po!.id : null);
  const data = audit.data?.data;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" size="lg" className="flex flex-col p-0 md:w-[640px]"> {/* V4.1 UI-X1: điện thoại full-width */}
        <SheetHeader className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="flex items-center gap-2 text-lg">
                <Receipt className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
                Lịch sử nhận hàng
              </SheetTitle>
              <SheetDescription className="mt-1">
                <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">{po?.poNo}</span>
                {po?.supplierName && <> · {po.supplierName}</>}
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto bg-zinc-50/40 p-6 dark:bg-zinc-950/40">
          {audit.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500 dark:text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Đang tải lịch sử…
            </div>
          ) : audit.isError ? (
            // V4.1 UI-05: khối lỗi chung + nút "Thử lại".
            <QueryError
              error={audit.error}
              onRetry={() => void audit.refetch()}
              retrying={audit.isFetching}
              title="Không tải được lịch sử nhận hàng"
            />
          ) : !data ? null : (
            <div className="space-y-6">

              {/* Section 1: Receipts */}
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  <Receipt className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden />
                  Phiếu nhập kho
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {data.receipts.length}
                  </span>
                </h3>
                {data.receipts.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                    Chưa có phiếu nhập nào.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.receipts.map((r) => (
                      <li key={r.id} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-bold text-indigo-700 dark:text-indigo-400">{r.receiptNo}</span>
                          <StatusPill domain="receiptQc" code={qcCode(r.qcFlag)} />
                        </div>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {formatDateTime(r.receivedAt)}
                          {r.qcNotes && <> · {r.qcNotes}</>}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Section 2: Receipt lines */}
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  <Package className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden />
                  Chi tiết vật tư
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {data.receiptLines.length}
                  </span>
                </h3>
                {data.receiptLines.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                    Chưa có dòng nào.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 dark:bg-zinc-800">
                        <tr className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          <th className="px-3 py-2.5 text-left">Mã vật tư</th>
                          <th className="px-3 py-2.5 text-left">Tên</th>
                          <th className="px-3 py-2.5 text-right">SL</th>
                          <th className="px-3 py-2.5 text-left">Lô / Serial</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.receiptLines.map((ln) => (
                          <tr key={ln.id} className="border-t border-zinc-50 dark:border-zinc-800">
                            <td className="px-3 py-2.5 font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">{ln.itemSku ?? "—"}</td>
                            <td className="px-3 py-2.5 text-sm text-zinc-700 dark:text-zinc-300">{ln.itemName ?? "—"}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                              {formatQty(ln.receivedQty)}
                              {ln.itemUom && <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">{ln.itemUom.toUpperCase()}</span>}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                              {ln.lotCode ?? ln.serialCode ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Section 3: Scan events */}
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  <ScanLine className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden />
                  Lịch sử quét barcode
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {data.scanEvents.length}
                  </span>
                </h3>
                {data.scanEvents.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                    Chưa có lượt quét nào.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.scanEvents.slice(0, 50).map((ev) => {
                      return (
                        <li key={ev.id} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                          <StatusPill domain="receiptQc" code={qcCode(ev.qcStatus)} />
                          <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">{ev.sku}</span>
                          <span className="font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">×{formatQty(ev.qty)}</span>
                          {ev.lotNo && <span className="text-xs text-zinc-500 dark:text-zinc-400">lô {ev.lotNo}</span>}
                          <span className="ml-auto text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
                            {formatDateTime(ev.scannedAt)}
                          </span>
                        </li>
                      );
                    })}
                    {data.scanEvents.length > 50 && (
                      <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
                        Hiển thị 50/{data.scanEvents.length} sự kiện gần nhất.
                      </p>
                    )}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
