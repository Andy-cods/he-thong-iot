"use client";

import * as React from "react";
import Link from "next/link";
import { Ban, ExternalLink, User } from "lucide-react";
import { can, type FinInvoiceStatus } from "@iot/shared";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AttachmentField } from "@/components/finance/AttachmentField";
import { ConfirmActionDialog } from "@/components/finance/ConfirmActionDialog";
import { fmtDate, fmtVND } from "@/components/finance/_format";
import {
  useCancelFinInvoice,
  useFinInvoiceDetail,
  useUpdateFinInvoice,
} from "@/hooks/useFinance";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

/**
 * TASK-20260922 — Drawer chi tiết 1 hoá đơn (click 1 dòng trong
 * `InvoicesTab`). User: "file hoá đơn kèm ảnh nếu có đính kèm" — áp dụng
 * tương tự transaction vì `fin_invoice` cũng có `attachmentUrl`.
 *
 * PATCH chỉ cho dueDate/notes/attachmentUrl (khớp `finInvoiceUpdateSchema`
 * — route đã có sẵn, KHÔNG sửa).
 */

const STATUS_LABEL: Record<FinInvoiceStatus, string> = {
  DRAFT: "Nháp",
  UNPAID: "Chưa trả",
  PARTIAL: "Trả một phần",
  PAID: "Đã trả",
  OVERDUE: "Quá hạn",
  CANCELLED: "Đã huỷ",
};

const STATUS_CHIP: Record<FinInvoiceStatus, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  UNPAID: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  PARTIAL: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  PAID: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  OVERDUE: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
  CANCELLED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
};

export function InvoiceDetailSheet({
  invoiceId,
  onOpenChange,
}: {
  invoiceId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: session } = useSession();
  const roles = session?.roles ?? [];
  const canEdit = can(roles, "update", "finance");

  const canSeeSupplier = can(roles, "read", "supplier");

  const detailQuery = useFinInvoiceDetail(invoiceId);
  const inv = detailQuery.data?.data;

  const updateMut = useUpdateFinInvoice(invoiceId ?? "__none__");
  const cancelMut = useCancelFinInvoice();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  // V4.1 TC-11 — gia hạn thanh toán (server tính lại trạng thái quá hạn).
  const [dueDraft, setDueDraft] = React.useState<string>("");
  React.useEffect(() => {
    setDueDraft(inv?.dueDate ?? "");
  }, [inv?.id, inv?.dueDate]);

  if (!invoiceId) return null;

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="right" size="md">
        <SheetHeader>
          <SheetTitle className="text-base">Chi tiết hoá đơn</SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-5">
          {detailQuery.isLoading || !inv ? (
            <div className="space-y-3">
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          ) : (
            <>
              <div>
                <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                  {inv.direction === "IN" ? "Hoá đơn đầu vào" : "Hoá đơn đầu ra"}
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-zinc-900 dark:text-zinc-50">{inv.invoiceNo}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CHIP[inv.status])}>
                    {STATUS_LABEL[inv.status]}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Phát hành {fmtDate(inv.issueDate)}</span>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
                <InfoRow label="Hạn thanh toán" value={fmtDate(inv.dueDate)} />
                <InfoRow label="Tổng tiền" value={<span className="font-mono font-semibold">{fmtVND(inv.totalAmount)}</span>} />
                <InfoRow label="Đã trả" value={<span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">{fmtVND(inv.paidAmount)}</span>} />
                <InfoRow label="Còn nợ" value={<span className="font-mono font-semibold text-rose-600 dark:text-rose-400">{fmtVND(Number(inv.totalAmount) - Number(inv.paidAmount))}</span>} />
              </dl>

              {canEdit && !["CANCELLED", "PAID"].includes(inv.status) && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Gia hạn thanh toán
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={dueDraft}
                      onChange={(e) => setDueDraft(e.target.value)}
                      aria-label="Hạn thanh toán mới"
                      className="w-44"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateMut.isPending || dueDraft === (inv.dueDate ?? "")}
                      onClick={() =>
                        void updateMut
                          .mutateAsync({ dueDate: dueDraft ? (dueDraft as unknown as Date) : null })
                          .catch(() => undefined)
                      }
                    >
                      Lưu hạn mới
                    </Button>
                  </div>
                </div>
              )}

              {inv.supplierName && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {inv.direction === "IN" ? "Nhà cung cấp" : "Khách hàng"}
                  </p>
                  {canSeeSupplier && inv.supplierId ? (
                    <Link
                      href={`/suppliers/${inv.supplierId}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-400"
                    >
                      <User className="h-3.5 w-3.5" aria-hidden="true" />
                      {inv.supplierName}
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  ) : (
                    <p className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      <User className="h-3.5 w-3.5" aria-hidden="true" />
                      {inv.supplierName}
                    </p>
                  )}
                </div>
              )}

              {inv.purchaseOrderId && can(roles, "read", "po") && (
                <div>
                  <Link
                    href={`/procurement/purchase-orders/${inv.purchaseOrderId}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-400"
                  >
                    Xem đơn mua liên quan
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
              )}

              {/* Lịch sử thanh toán (allocation) */}
              {inv.allocations.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Lịch sử thanh toán
                  </p>
                  <ul className="space-y-1.5">
                    {inv.allocations.map((a) => (
                      <li key={a.id} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-sm dark:border-zinc-800">
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {a.payment ? fmtDate(a.payment.paymentDate) : "—"}
                          {a.payment?.code ? ` · ${a.payment.code}` : ""}
                        </span>
                        <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">{fmtVND(a.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {inv.notes && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Ghi chú</p>
                  <p className="text-sm text-zinc-800 dark:text-zinc-200">{inv.notes}</p>
                </div>
              )}

              {/* Chứng từ đính kèm — "file hoá đơn kèm ảnh" */}
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  File hoá đơn / chứng từ đính kèm
                </p>
                <AttachmentField
                  attachmentUrl={inv.attachmentUrl}
                  canEdit={canEdit && inv.status !== "CANCELLED"}
                  onUploaded={async (url) => {
                    // V4.1 TC-05 — PATCH chỉ trường đổi (không gửi lại dueDate/notes cũ).
                    await updateMut.mutateAsync({ attachmentUrl: url });
                  }}
                  uploading={updateMut.isPending}
                />
              </div>

              <div className="border-t border-zinc-100 pt-3 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                Tạo lúc {new Date(inv.createdAt).toLocaleString("vi-VN")}
              </div>
            </>
          )}
        </SheetBody>
        {inv && can(roles, "update", "finance") && inv.status !== "CANCELLED" && Number(inv.paidAmount) === 0 && (
          <SheetFooter>
            <Button
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
              disabled={cancelMut.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              <Ban className="h-3.5 w-3.5" aria-hidden="true" />
              {cancelMut.isPending ? "Đang huỷ…" : "Huỷ hoá đơn"}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
      {inv && (
        <ConfirmActionDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Huỷ hoá đơn?"
          description={`Huỷ hoá đơn ${inv.invoiceNo} (${fmtVND(inv.totalAmount)}). Hoá đơn đã huỷ không tính vào công nợ và không thể thanh toán nữa.`}
          confirmLabel="Huỷ hoá đơn"
          loading={cancelMut.isPending}
          onConfirm={async () => {
            try {
              await cancelMut.mutateAsync(inv.id);
              setConfirmOpen(false);
              onOpenChange(false);
            } catch {
              /* toast lỗi đã hiện ở hook */
            }
          }}
        />
      )}
    </Sheet>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-400 dark:text-zinc-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">{value}</dd>
    </div>
  );
}
