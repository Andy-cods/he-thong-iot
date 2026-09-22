"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { AlertTriangle, Ban, Plus, Receipt } from "lucide-react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import {
  can,
  FIN_INVOICE_STATUSES,
  finInvoiceCreateSchema,
  type FinDirection,
  type FinInvoiceCreate,
  type FinInvoiceStatus,
} from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SupplierPicker, type SupplierPickerValue } from "@/components/procurement/SupplierPicker";
import { fmtDate, fmtVND } from "@/components/finance/_format";
import {
  useCancelFinInvoice,
  useCreateFinInvoice,
  useFinInvoicesList,
  type FinInvoiceRow,
} from "@/hooks/useFinance";
import { useSuppliersList } from "@/hooks/useSuppliers";
import { useSession } from "@/hooks/useSession";
import type { FinInvoiceFilter } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/** Tab "Hoá đơn" — bảng `fin_invoice` (hoá đơn vào/ra) + tạo mới + huỷ. */

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

export function InvoicesTab() {
  const { data: session } = useSession();
  const roles = session?.roles ?? [];
  const canWrite = can(roles, "create", "finance");
  const canCancel = can(roles, "update", "finance");

  const [urlState, setUrlState] = useQueryStates(
    {
      direction: parseAsStringEnum(["all", "IN", "OUT"]).withDefault("all"),
      status: parseAsStringEnum(["all", ...FIN_INVOICE_STATUSES]).withDefault("all"),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
    },
    { history: "replace", shallow: true },
  );

  const filter: FinInvoiceFilter = React.useMemo(
    () => ({
      direction: urlState.direction === "all" ? undefined : urlState.direction,
      status: urlState.status === "all" ? undefined : [urlState.status],
      page: urlState.page,
      pageSize: urlState.pageSize,
    }),
    [urlState],
  );

  const query = useFinInvoicesList(filter);
  const suppliersQuery = useSuppliersList({ pageSize: 200, isActive: true });
  const supplierMap = new Map((suppliersQuery.data?.data ?? []).map((s) => [s.id, s]));
  const cancelMut = useCancelFinInvoice();

  const total = query.data?.meta.total ?? 0;
  const rows = query.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));
  const isEmpty = !query.isLoading && rows.length === 0;
  const hasFilter = urlState.direction !== "all" || urlState.status !== "all";

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDirection, setCreateDirection] = React.useState<FinDirection>("IN");

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50/30 dark:bg-zinc-950/30">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Trang chủ", href: "/" },
              { label: "Tài chính" },
              { label: "Hoá đơn" },
            ]}
          />
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Hoá đơn
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{total.toLocaleString("vi-VN")}</span> hoá đơn
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setCreateDirection("IN"); setCreateOpen(true); }}>
              <Plus className="h-4 w-4" aria-hidden="true" /> HĐ đầu vào
            </Button>
            <Button size="sm" onClick={() => { setCreateDirection("OUT"); setCreateOpen(true); }}>
              <Plus className="h-4 w-4" aria-hidden="true" /> HĐ đầu ra
            </Button>
          </div>
        )}
      </header>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <div className="flex items-center gap-1.5">
          {(["all", "IN", "OUT"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => void setUrlState({ direction: d, page: 1 })}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                urlState.direction === d
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
              )}
            >
              {d === "all" ? "Tất cả" : d === "IN" ? "Đầu vào (mua)" : "Đầu ra (bán)"}
            </button>
          ))}
        </div>
        <select
          value={urlState.status}
          onChange={(e) => void setUrlState({ status: e.target.value as typeof urlState.status, page: 1 })}
          className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <option value="all">Tất cả trạng thái</option>
          {FIN_INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={() => void setUrlState({ direction: "all", status: "all", page: 1 })}>
            Xoá lọc
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {query.isLoading ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        ) : isEmpty ? (
          hasFilter ? (
            <EmptyState preset="no-filter-match" title="Không có hoá đơn khớp bộ lọc" />
          ) : (
            <EmptyState preset="no-data" title="Chưa có hoá đơn nào" description="Tạo hoá đơn đầu vào (từ NCC) hoặc đầu ra (cho khách hàng)." actions={canWrite ? <Button size="sm" onClick={() => setCreateOpen(true)}>Tạo hoá đơn</Button> : undefined} />
          )
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Số HĐ</th>
                    <th className="px-4 py-2.5 text-left">Chiều</th>
                    <th className="px-4 py-2.5 text-left">Đối tác</th>
                    <th className="px-4 py-2.5 text-left">Ngày phát hành</th>
                    <th className="px-4 py-2.5 text-left">Hạn thanh toán</th>
                    <th className="px-4 py-2.5 text-right">Tổng tiền</th>
                    <th className="px-4 py-2.5 text-right">Đã trả</th>
                    <th className="px-4 py-2.5 text-center">Trạng thái</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {rows.map((inv) => {
                    const isOverdue = inv.status === "OVERDUE";
                    return (
                      <tr key={inv.id} className={cn("hover:bg-zinc-50 dark:hover:bg-zinc-800/60", isOverdue && "bg-red-50/40 dark:bg-red-950/20")}>
                        <td className="px-4 py-2.5 font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">{inv.invoiceNo}</td>
                        <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{inv.direction === "IN" ? "Đầu vào" : "Đầu ra"}</td>
                        <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{inv.supplierId ? (supplierMap.get(inv.supplierId)?.name ?? "—") : "—"}</td>
                        <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{fmtDate(inv.issueDate)}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn(isOverdue && "font-semibold text-red-600 dark:text-red-400")}>
                            {fmtDate(inv.dueDate)}{isOverdue && " ⚠"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-50">{fmtVND(inv.totalAmount)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-emerald-700 dark:text-emerald-400">{fmtVND(inv.paidAmount)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CHIP[inv.status])}>
                            {STATUS_LABEL[inv.status]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {canCancel && inv.status !== "CANCELLED" && Number(inv.paidAmount) === 0 && (
                            <Button size="icon-sm" variant="ghost" onClick={() => void cancelMut.mutateAsync(inv.id)} aria-label="Huỷ hoá đơn" title="Huỷ hoá đơn">
                              <Ban className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="flex flex-col gap-2 md:hidden">
              {rows.map((inv) => {
                const isOverdue = inv.status === "OVERDUE";
                return (
                  <div key={inv.id} className={cn("rounded-xl border bg-white p-3 shadow-sm dark:bg-zinc-900", isOverdue ? "border-red-200 dark:border-red-800" : "border-zinc-200 dark:border-zinc-800")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">{inv.invoiceNo}</p>
                        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {inv.supplierId ? (supplierMap.get(inv.supplierId)?.name ?? "—") : "—"} · {inv.direction === "IN" ? "Đầu vào" : "Đầu ra"}
                        </p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_CHIP[inv.status])}>
                        {STATUS_LABEL[inv.status]}
                      </span>
                    </div>
                    <div className="mt-2 flex items-end justify-between">
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        <p>Hạn: {fmtDate(inv.dueDate)}{isOverdue && " ⚠"}</p>
                        <p>Đã trả: <span className="font-mono text-emerald-700 dark:text-emerald-400">{fmtVND(inv.paidAmount)}</span></p>
                      </div>
                      <p className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-50">{fmtVND(inv.totalAmount)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {!isEmpty && (
        <footer className="flex h-11 items-center justify-between border-t border-zinc-200 bg-white px-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 md:px-6">
          <div className="tabular-nums">Trang <span className="font-semibold text-zinc-900 dark:text-zinc-50">{urlState.page}</span> / {pageCount}</div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={urlState.page <= 1} onClick={() => void setUrlState({ page: 1 })}>‹‹</Button>
            <Button size="sm" variant="ghost" disabled={urlState.page <= 1} onClick={() => void setUrlState({ page: Math.max(1, urlState.page - 1) })}>‹</Button>
            <Button size="sm" variant="ghost" disabled={urlState.page >= pageCount} onClick={() => void setUrlState({ page: Math.min(pageCount, urlState.page + 1) })}>›</Button>
            <Button size="sm" variant="ghost" disabled={urlState.page >= pageCount} onClick={() => void setUrlState({ page: pageCount })}>››</Button>
          </div>
        </footer>
      )}

      <InvoiceFormDialog open={createOpen} onOpenChange={setCreateOpen} direction={createDirection} />
    </div>
  );
}

function InvoiceFormDialog({
  open,
  onOpenChange,
  direction,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  direction: FinDirection;
}) {
  const createMut = useCreateFinInvoice();
  const [supplier, setSupplier] = React.useState<SupplierPickerValue | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FinInvoiceCreate>({
    resolver: zodResolver(finInvoiceCreateSchema),
    defaultValues: {
      invoiceNo: "",
      direction,
      supplierId: null,
      issueDate: new Date(),
      dueDate: null,
      subtotalAmount: 0,
      vatRate: 8,
      vatAmount: 0,
      totalAmount: 0,
    },
  });

  React.useEffect(() => {
    if (open) {
      setSupplier(null);
      reset({
        invoiceNo: "",
        direction,
        supplierId: null,
        issueDate: new Date(),
        dueDate: null,
        subtotalAmount: 0,
        vatRate: 8,
        vatAmount: 0,
        totalAmount: 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, direction]);

  const subtotal = Number(watch("subtotalAmount")) || 0;
  const vatRate = Number(watch("vatRate")) || 0;

  React.useEffect(() => {
    const vat = Math.round((subtotal * vatRate) / 100);
    setValue("vatAmount", vat);
    setValue("totalAmount", subtotal + vat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, vatRate]);

  const onSubmit = async (data: FinInvoiceCreate) => {
    await createMut.mutateAsync({ ...data, supplierId: supplier?.id ?? null });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" aria-hidden="true" />
            {direction === "IN" ? "Tạo hoá đơn đầu vào" : "Tạo hoá đơn đầu ra"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3" noValidate>
          <input type="hidden" {...register("direction")} value={direction} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inv-no" required>Số hoá đơn</Label>
              <Input id="inv-no" {...register("invoiceNo")} error={!!errors.invoiceNo} placeholder="VD: HD-0001" className="mt-1 font-mono" />
              {errors.invoiceNo && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.invoiceNo.message}</p>}
            </div>
            <div>
              <Label htmlFor="inv-supplier">{direction === "IN" ? "Nhà cung cấp" : "Khách hàng"}</Label>
              <SupplierPicker value={supplier} onChange={setSupplier} id="inv-supplier" placeholder="Chọn đối tác..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inv-issue" required>Ngày phát hành</Label>
              <Input id="inv-issue" type="date" {...register("issueDate")} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="inv-due">Hạn thanh toán</Label>
              <Input id="inv-due" type="date" {...register("dueDate")} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="inv-subtotal" required>Tiền hàng</Label>
              <Input id="inv-subtotal" type="number" step="1000" {...register("subtotalAmount")} error={!!errors.subtotalAmount} className="mt-1 font-mono tabular-nums" />
            </div>
            <div>
              <Label htmlFor="inv-vat-rate">VAT (%)</Label>
              <Input id="inv-vat-rate" type="number" step="1" {...register("vatRate")} className="mt-1 font-mono tabular-nums" />
            </div>
            <div>
              <Label htmlFor="inv-vat-amt">Tiền VAT</Label>
              <Input id="inv-vat-amt" type="number" {...register("vatAmount")} readOnly className="mt-1 bg-zinc-50 font-mono tabular-nums dark:bg-zinc-800" />
            </div>
          </div>

          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 dark:border-indigo-800 dark:bg-indigo-950/40">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-indigo-900 dark:text-indigo-200">Tổng cộng</span>
              <span className="font-mono text-lg font-bold text-indigo-900 dark:text-indigo-200">
                {fmtVND(subtotal + Math.round((subtotal * vatRate) / 100))}
              </span>
            </div>
            <input type="hidden" {...register("totalAmount")} />
          </div>

          {errors.totalAmount && (
            <p className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {errors.totalAmount.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button>
            <Button type="submit" disabled={createMut.isPending}>{createMut.isPending ? "Đang lưu…" : "Tạo hoá đơn"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
