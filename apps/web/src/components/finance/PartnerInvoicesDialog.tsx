"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate, fmtVND } from "@/components/finance/_format";
import { InvoiceDetailSheet } from "@/components/finance/InvoiceDetailSheet";
import { useFinInvoicesList } from "@/hooks/useFinance";
import { cn } from "@/lib/utils";

/**
 * TASK-20260922 — Click 1 dòng NHÀ CUNG CẤP trong bảng "Chi tiết theo nhà
 * cung cấp" (công nợ phải trả) → mở danh sách hoá đơn CHƯA TRẢ HẾT của NCC
 * đó (filter `supplierId`, đã hỗ trợ sẵn ở `listFinInvoices`/API — KHÔNG
 * sửa route). Click tiếp 1 hoá đơn → mở `InvoiceDetailSheet` đã có sẵn.
 *
 * Chỉ dùng cho PHẢI TRẢ (direction=IN, có supplierId FK thật) — phải thu
 * (OUT) không có FK khách hàng nên không có gì để filter chính xác, xem
 * giới hạn ghi ở `getReceivablesByCustomer` repo.
 */
export function PartnerInvoicesDialog({
  supplierId,
  supplierName,
  onOpenChange,
}: {
  supplierId: string | null;
  supplierName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState<string | null>(null);

  const query = useFinInvoicesList({
    direction: "IN",
    supplierId: supplierId ?? undefined,
    page: 1,
    pageSize: 100,
  });
  const rows = (query.data?.data ?? []).filter((inv) => inv.status !== "CANCELLED" && inv.status !== "PAID");

  if (!supplierId) return null;

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Hoá đơn chưa trả hết — {supplierName}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {query.isLoading ? (
              [...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
            ) : rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
                Không còn hoá đơn nào chưa trả hết.
              </p>
            ) : (
              rows.map((inv) => {
                const isOverdue = inv.status === "OVERDUE";
                return (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => setSelectedInvoiceId(inv.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
                      isOverdue
                        ? "border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20"
                        : "border-zinc-200 dark:border-zinc-800",
                    )}
                  >
                    <div>
                      <p className="font-mono font-semibold text-zinc-900 dark:text-zinc-50">{inv.invoiceNo}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Hạn {fmtDate(inv.dueDate)}{isOverdue && " · Quá hạn"}
                      </p>
                    </div>
                    <p className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                      {fmtVND(Number(inv.totalAmount) - Number(inv.paidAmount))}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
      {selectedInvoiceId && (
        <InvoiceDetailSheet
          invoiceId={selectedInvoiceId}
          onOpenChange={(open) => { if (!open) setSelectedInvoiceId(null); }}
        />
      )}
    </>
  );
}
