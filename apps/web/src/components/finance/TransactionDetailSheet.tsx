"use client";

import * as React from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Ban, ExternalLink, Pencil, Receipt, User } from "lucide-react";
import { z } from "zod";
import { can } from "@iot/shared";
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
import { fmtDate, fmtVND } from "@/components/finance/_format";
import { VoidConfirmDialog } from "@/components/finance/VoidConfirmDialog";
import {
  useFinAccountsList,
  useFinCategoriesList,
  useFinInvoicesList,
  useUpdateFinTransaction,
  useVoidFinTransaction,
  type FinTransactionRow,
} from "@/hooks/useFinance";
import { useSuppliersList } from "@/hooks/useSuppliers";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

/**
 * TASK-20260922 — Drawer chi tiết 1 khoản thu chi (click 1 dòng trong
 * `CashbookTab`). Yêu cầu user: "khi click vào 1 khoản thu chi bất kì nó sẽ
 * hiển thị thông tin chi tiết, file hoá đơn kèm ảnh nếu có đính kèm".
 *
 * PATCH chỉ cho phép description/attachmentUrl/categoryId (khớp
 * `finTransactionUpdateSchema` — route đã có sẵn, KHÔNG sửa).
 */

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  POSTED: "Đã ghi sổ",
  VOID: "Đã huỷ",
};

const editSchema = z.object({
  description: z.string().trim().max(2000).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
});
type EditForm = z.infer<typeof editSchema>;

export function TransactionDetailSheet({
  row,
  onOpenChange,
}: {
  row: FinTransactionRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: session } = useSession();
  const roles = session?.roles ?? [];
  const canEdit = can(roles, "update", "finance");

  const accountsQuery = useFinAccountsList({ isActive: true });
  const categoriesQuery = useFinCategoriesList(row ? { direction: row.direction } : {});
  const suppliersQuery = useSuppliersList({ pageSize: 200, isActive: true });
  const invoicesQuery = useFinInvoicesList(
    row?.invoiceId ? { direction: row.direction, pageSize: 200 } : { pageSize: 1 },
  );

  const account = accountsQuery.data?.data.find((a) => a.id === row?.accountId);
  const category = categoriesQuery.data?.data.find((c) => c.id === row?.categoryId);
  const supplier = suppliersQuery.data?.data.find((s) => s.id === row?.supplierId);
  const invoice = invoicesQuery.data?.data.find((i) => i.id === row?.invoiceId);

  const updateMut = useUpdateFinTransaction(row?.id ?? "__none__");
  const voidMut = useVoidFinTransaction();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const [editingDesc, setEditingDesc] = React.useState(false);
  const { register, handleSubmit, reset } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { description: row?.description ?? "" },
  });

  React.useEffect(() => {
    reset({ description: row?.description ?? "" });
    setEditingDesc(false);
  }, [row?.id, row?.description, reset]);

  if (!row) return null;

  const onSaveDesc = async (data: EditForm) => {
    await updateMut.mutateAsync({
      description: data.description ?? null,
      attachmentUrl: row.attachmentUrl,
      categoryId: row.categoryId,
    });
    setEditingDesc(false);
  };

  const onChangeCategory = async (categoryId: string) => {
    await updateMut.mutateAsync({
      description: row.description,
      attachmentUrl: row.attachmentUrl,
      categoryId: categoryId || null,
    });
  };

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="right" size="md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" aria-hidden="true" />
            Chi tiết giao dịch
          </SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-5">
          {/* Mã + số tiền lớn */}
          <div>
            <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">{row.code}</p>
            <p
              className={cn(
                "mt-1 font-mono text-3xl font-bold tabular-nums",
                row.direction === "IN" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
              )}
            >
              {row.direction === "IN" ? "+" : "-"}
              {fmtVND(row.amount)}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={cn(
                  "inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  row.status === "VOID"
                    ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
                )}
              >
                {STATUS_LABEL[row.status]}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{fmtDate(row.transactionDate)}</span>
            </div>
          </div>

          {/* Thông tin cơ bản */}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
            <InfoRow label="Tài khoản" value={account?.name ?? "—"} />
            <InfoRow
              label="Danh mục"
              value={
                canEdit ? (
                  <select
                    value={row.categoryId ?? ""}
                    onChange={(e) => void onChangeCategory(e.target.value)}
                    disabled={row.status === "VOID" || updateMut.isPending}
                    className="h-7 w-full rounded-md border border-zinc-200 bg-white px-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  >
                    <option value="">— Không chọn —</option>
                    {(categoriesQuery.data?.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  category?.name ?? "—"
                )
              }
              full
            />
          </dl>

          {/* Diễn giải — inline edit */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Diễn giải</p>
              {canEdit && row.status !== "VOID" && !editingDesc && (
                <Button size="icon-sm" variant="ghost" onClick={() => setEditingDesc(true)} aria-label="Sửa diễn giải">
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>
            {editingDesc ? (
              <form onSubmit={(e) => void handleSubmit(onSaveDesc)(e)} className="flex items-center gap-2">
                <Input {...register("description")} autoFocus className="flex-1" />
                <Button type="submit" size="sm" disabled={updateMut.isPending}>Lưu</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setEditingDesc(false); reset({ description: row.description ?? "" }); }}>Huỷ</Button>
              </form>
            ) : (
              <p className="text-sm text-zinc-800 dark:text-zinc-200">{row.description || "—"}</p>
            )}
          </div>

          {/* Đối tác / PO liên quan */}
          {(supplier || row.purchaseOrderId) && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Nhà cung cấp / Đơn mua
              </p>
              <div className="space-y-1">
                {supplier && (
                  <Link
                    href={`/suppliers/${supplier.id}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-400"
                  >
                    <User className="h-3.5 w-3.5" aria-hidden="true" />
                    {supplier.name}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>
                )}
                {row.purchaseOrderId && (
                  <div>
                    <Link
                      href={`/procurement/purchase-orders/${row.purchaseOrderId}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-400"
                    >
                      Xem đơn mua liên quan
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Hoá đơn liên quan */}
          {row.invoiceId && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Hoá đơn liên quan
              </p>
              {invoicesQuery.isLoading ? (
                <Skeleton className="h-10 rounded-lg" />
              ) : invoice ? (
                <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700">
                  <div>
                    <p className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">{invoice.invoiceNo}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Đã trả {fmtVND(invoice.paidAmount)} / {fmtVND(invoice.totalAmount)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">—</p>
              )}
            </div>
          )}

          {/* Chứng từ đính kèm */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Chứng từ đính kèm
            </p>
            <AttachmentField
              attachmentUrl={row.attachmentUrl}
              canEdit={canEdit && row.status !== "VOID"}
              onUploaded={async (url) => {
                await updateMut.mutateAsync({
                  description: row.description,
                  categoryId: row.categoryId,
                  attachmentUrl: url,
                });
              }}
              uploading={updateMut.isPending}
            />
          </div>

          {/* Người tạo */}
          <div className="border-t border-zinc-100 pt-3 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
            Tạo lúc {new Date(row.createdAt).toLocaleString("vi-VN")}
          </div>
        </SheetBody>
        {can(roles, "update", "finance") && row.status !== "VOID" && (
          <SheetFooter>
            <Button
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
              disabled={voidMut.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              <Ban className="h-3.5 w-3.5" aria-hidden="true" />
              {voidMut.isPending ? "Đang huỷ…" : "Huỷ giao dịch"}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
      <VoidConfirmDialog
        target={confirmOpen ? { id: row.id, code: row.code, amount: row.amount } : null}
        kind="giao dịch"
        onClose={() => setConfirmOpen(false)}
        onConfirm={async (id) => {
          await voidMut.mutateAsync(id);
          onOpenChange(false);
        }}
      />
    </Sheet>
  );
}

function InfoRow({
  label,
  value,
  full,
}: {
  label: string;
  value: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn(full && "col-span-2")}>
      <dt className="text-xs text-zinc-400 dark:text-zinc-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">{value}</dd>
    </div>
  );
}
