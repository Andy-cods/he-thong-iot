"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { AlertTriangle, Ban, ChevronDown, ChevronRight, CreditCard, Plus, Trash2 } from "lucide-react";
import {
  parseAsInteger,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import {
  can,
  finPaymentCreateSchema,
  type FinDirection,
  type FinPaymentCreate,
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
  useCreateFinPayment,
  useFinAccountsList,
  useFinInvoicesList,
  useFinPaymentsList,
  useFinPaymentDetail,
  useVoidFinPayment,
  type FinPaymentRow,
} from "@/hooks/useFinance";
import { useSuppliersList } from "@/hooks/useSuppliers";
import { useSession } from "@/hooks/useSession";
import type { FinPaymentFilter } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: "Chuyển khoản",
  CASH: "Tiền mặt",
  CHECK: "Séc",
  OTHER: "Khác",
};

/** Tab "Thanh toán" — lịch sử `fin_payment` + xem phân bổ + tạo mới (multi-invoice). */

export function PaymentsTab() {
  const { data: session } = useSession();
  const roles = session?.roles ?? [];
  const canWrite = can(roles, "create", "finance");
  const canVoid = can(roles, "update", "finance");

  const [urlState, setUrlState] = useQueryStates(
    {
      direction: parseAsStringEnum(["all", "IN", "OUT"]).withDefault("all"),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
    },
    { history: "replace", shallow: true },
  );

  const filter: FinPaymentFilter = React.useMemo(
    () => ({
      direction: urlState.direction === "all" ? undefined : urlState.direction,
      page: urlState.page,
      pageSize: urlState.pageSize,
    }),
    [urlState],
  );

  const query = useFinPaymentsList(filter);
  const suppliersQuery = useSuppliersList({ pageSize: 200, isActive: true });
  const accountsQuery = useFinAccountsList({ isActive: true });
  const supplierMap = new Map((suppliersQuery.data?.data ?? []).map((s) => [s.id, s]));
  const accountMap = new Map((accountsQuery.data?.data ?? []).map((a) => [a.id, a]));
  const voidMut = useVoidFinPayment();

  const total = query.data?.meta.total ?? 0;
  const rows = query.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));
  const isEmpty = !query.isLoading && rows.length === 0;

  const [createOpen, setCreateOpen] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50/30 dark:bg-zinc-950/30">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Trang chủ", href: "/" },
              { label: "Tài chính" },
              { label: "Thanh toán" },
            ]}
          />
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Lịch sử thanh toán
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{total.toLocaleString("vi-VN")}</span> đợt thanh toán
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Ghi nhận thanh toán
          </Button>
        )}
      </header>

      <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
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
            {d === "all" ? "Tất cả" : d === "IN" ? "Thu (từ khách)" : "Chi (cho NCC)"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {query.isLoading ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        ) : isEmpty ? (
          <EmptyState preset="no-data" title="Chưa có thanh toán nào" description="Ghi nhận thanh toán cho hoá đơn để theo dõi công nợ." actions={canWrite ? <Button size="sm" onClick={() => setCreateOpen(true)}>Ghi nhận thanh toán</Button> : undefined} />
        ) : (
          <div className="space-y-2">
            {rows.map((p) => (
              <PaymentCard
                key={p.id}
                row={p}
                supplierName={p.supplierId ? supplierMap.get(p.supplierId)?.name : undefined}
                accountName={accountMap.get(p.accountId)?.name}
                expanded={expandedId === p.id}
                onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                canVoid={canVoid}
                onVoid={() => void voidMut.mutateAsync(p.id)}
              />
            ))}
          </div>
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

      <PaymentFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function PaymentCard({
  row,
  supplierName,
  accountName,
  expanded,
  onToggle,
  canVoid,
  onVoid,
}: {
  row: FinPaymentRow;
  supplierName?: string;
  accountName?: string;
  expanded: boolean;
  onToggle: () => void;
  canVoid: boolean;
  onVoid: () => void;
}) {
  const detailQuery = useFinPaymentDetail(expanded ? row.id : null);
  const allocations = detailQuery.data?.data.allocations ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
      >
        <div className="flex min-w-0 items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />}
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">{row.code}</p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {fmtDate(row.paymentDate)} · {accountName ?? "—"}{supplierName ? ` · ${supplierName}` : ""} · {METHOD_LABEL[row.method]}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <p className={cn("font-mono text-sm font-bold tabular-nums", row.direction === "IN" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
            {row.direction === "IN" ? "+" : "-"}{fmtVND(row.totalAmount)}
          </p>
          {canVoid && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); void onVoid(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void onVoid(); } }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              aria-label="Huỷ thanh toán"
            >
              <Ban className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/30">
          {detailQuery.isLoading ? (
            <Skeleton className="h-16 rounded-lg" />
          ) : allocations.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Không có phân bổ.</p>
          ) : (
            <ul className="space-y-1.5">
              {allocations.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">Phân bổ cho hoá đơn</span>
                  <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">{fmtVND(a.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {row.notes && <p className="mt-2 text-xs italic text-zinc-500 dark:text-zinc-400">"{row.notes}"</p>}
        </div>
      )}
    </div>
  );
}

interface AllocationField {
  invoiceId: string;
  amount: number;
}

function PaymentFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const createMut = useCreateFinPayment();
  const [direction, setDirection] = React.useState<FinDirection>("OUT");
  const [supplier, setSupplier] = React.useState<SupplierPickerValue | null>(null);
  const accountsQuery = useFinAccountsList({ isActive: true });
  const accounts = accountsQuery.data?.data ?? [];

  // Hoá đơn còn nợ của đối tác đã chọn, cùng chiều thanh toán.
  const invoicesQuery = useFinInvoicesList({
    direction,
    supplierId: supplier?.id,
    status: ["UNPAID", "PARTIAL", "OVERDUE"],
    pageSize: 100,
  });
  const openInvoices = invoicesQuery.data?.data ?? [];
  const invoiceMap = new Map(openInvoices.map((i) => [i.id, i]));

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FinPaymentCreate>({
    resolver: zodResolver(finPaymentCreateSchema),
    defaultValues: {
      direction,
      accountId: "",
      supplierId: null,
      paymentDate: new Date(),
      totalAmount: 0,
      method: "BANK_TRANSFER",
      allocations: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "allocations" });

  React.useEffect(() => {
    if (open) {
      setSupplier(null);
      setDirection("OUT");
      reset({
        direction: "OUT",
        accountId: accounts[0]?.id ?? "",
        supplierId: null,
        paymentDate: new Date(),
        totalAmount: 0,
        method: "BANK_TRANSFER",
        allocations: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const allocations = watch("allocations") as AllocationField[];
  const allocationSum = (allocations ?? []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const totalAmount = Number(watch("totalAmount")) || 0;
  const mismatch = Math.abs(allocationSum - totalAmount) > 1;

  React.useEffect(() => {
    setValue("totalAmount", allocationSum);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocationSum]);

  const onSubmit = async (data: FinPaymentCreate) => {
    await createMut.mutateAsync({ ...data, direction, supplierId: supplier?.id ?? null });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            Ghi nhận thanh toán
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3" noValidate>
          <div className="flex items-center gap-1.5">
            {(["OUT", "IN"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { setDirection(d); setValue("allocations", []); }}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium",
                  direction === d
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
                )}
              >
                {d === "OUT" ? "Chi cho NCC" : "Thu từ khách"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pay-account" required>Tài khoản</Label>
              <select
                id="pay-account"
                {...register("accountId")}
                className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="">— Chọn tài khoản —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {errors.accountId && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.accountId.message}</p>}
            </div>
            <div>
              <Label htmlFor="pay-supplier" required>{direction === "OUT" ? "Nhà cung cấp" : "Khách hàng"}</Label>
              <SupplierPicker value={supplier} onChange={(v) => { setSupplier(v); setValue("allocations", []); }} id="pay-supplier" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pay-date" required>Ngày thanh toán</Label>
              <Input id="pay-date" type="date" {...register("paymentDate")} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pay-method">Phương thức</Label>
              <select
                id="pay-method"
                {...register("method")}
                className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {Object.entries(METHOD_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Phân bổ hoá đơn */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/60">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Phân bổ cho hoá đơn ({fields.length})
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!supplier || openInvoices.length === 0}
                onClick={() => append({ invoiceId: "", amount: 0 })}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Thêm dòng
              </Button>
            </div>
            <div className="space-y-2 p-3">
              {!supplier ? (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Chọn đối tác để xem hoá đơn còn nợ.</p>
              ) : fields.length === 0 ? (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  {openInvoices.length === 0 ? "Đối tác này không có hoá đơn còn nợ." : "Bấm \"Thêm dòng\" để chọn hoá đơn phân bổ."}
                </p>
              ) : (
                fields.map((f, idx) => {
                  const selectedInvoiceId = allocations?.[idx]?.invoiceId;
                  const inv = selectedInvoiceId ? invoiceMap.get(selectedInvoiceId) : undefined;
                  const remaining = inv ? Number(inv.totalAmount) - Number(inv.paidAmount) : undefined;
                  return (
                    <div key={f.id} className="grid grid-cols-[1fr_140px_auto] items-start gap-2">
                      <div>
                        <select
                          {...register(`allocations.${idx}.invoiceId` as const)}
                          className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                        >
                          <option value="">— Chọn hoá đơn —</option>
                          {openInvoices.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.invoiceNo} — còn nợ {fmtVND(Number(i.totalAmount) - Number(i.paidAmount))}
                            </option>
                          ))}
                        </select>
                        {remaining !== undefined && (
                          <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">Còn nợ: {fmtVND(remaining)}</p>
                        )}
                      </div>
                      <Input
                        type="number"
                        step="1000"
                        {...register(`allocations.${idx}.amount` as const)}
                        placeholder="Số tiền"
                        className="font-mono tabular-nums"
                      />
                      <Button type="button" size="icon-sm" variant="ghost" onClick={() => remove(idx)} aria-label="Xoá dòng">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className={cn(
            "flex items-center justify-between rounded-lg border px-3 py-2",
            mismatch
              ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
              : "border-indigo-200 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/40",
          )}>
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Tổng phân bổ</span>
            <span className="font-mono text-lg font-bold text-zinc-900 dark:text-zinc-50">{fmtVND(allocationSum)}</span>
          </div>
          {errors.allocations && (
            <p className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {(errors.allocations as { message?: string }).message ?? "Cần ít nhất 1 phân bổ hợp lệ"}
            </p>
          )}

          <div>
            <Label htmlFor="pay-notes">Ghi chú</Label>
            <Input id="pay-notes" {...register("notes")} className="mt-1" placeholder="Tuỳ chọn" />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button>
            <Button type="submit" disabled={createMut.isPending || fields.length === 0 || mismatch}>
              {createMut.isPending ? "Đang lưu…" : "Ghi nhận thanh toán"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
