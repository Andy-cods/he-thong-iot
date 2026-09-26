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
import { AccountSourceSelect, BalanceAfterHint, selectClassName } from "@/components/finance/AccountSourceSelect";
import { ConfirmActionDialog } from "@/components/finance/ConfirmActionDialog";
import { fmtDate, fmtVND, todayInputValue } from "@/components/finance/_format";
import {
  useCreateFinPayment,
  useFinAccountsList,
  useFinInvoicesList,
  useFinPaymentsList,
  useFinPaymentDetail,
  useVoidFinPayment,
  type FinPaymentRow,
} from "@/hooks/useFinance";
import { useSession } from "@/hooks/useSession";
import type { FinPaymentFilter } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: "Chuyển khoản",
  CASH: "Tiền mặt",
  CHECK: "Séc",
  OTHER: "Khác",
};

/**
 * Tab "Thanh toán" — lịch sử `fin_payment` + xem phân bổ + tạo mới (multi-invoice).
 * V4.1 Đợt 3: trạng thái "Đã huỷ" (TC-06), tên đối tác từ API (TC-03), xác nhận
 * trước khi huỷ (TC-08), không chọn trùng HĐ (TC-09), "Nguồn chi/thu" có số dư
 * + chặn chi vượt số dư (Q7), tiền đủ số + dòng tổng (UI).
 */

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
  // Tất cả nguồn (kể cả đã ngưng) để hiện tên cho thanh toán cũ.
  const accountsQuery = useFinAccountsList({});
  const accountMap = new Map((accountsQuery.data?.data ?? []).map((a) => [a.id, a]));
  const voidMut = useVoidFinPayment();

  const total = query.data?.meta.total ?? 0;
  const rows = query.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));
  const isEmpty = !query.isLoading && !query.isError && rows.length === 0;
  const pageTotals = rows.reduce(
    (acc, p) => {
      if (p.status === "VOID") return acc;
      if (p.direction === "IN") acc.in += Number(p.totalAmount);
      else acc.out += Number(p.totalAmount);
      return acc;
    },
    { in: 0, out: 0 },
  );

  const [createOpen, setCreateOpen] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [voidTarget, setVoidTarget] = React.useState<FinPaymentRow | null>(null);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50/30 dark:bg-zinc-950/30">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Trang chủ", href: "/" },
              { label: "Bộ phận Thu mua", href: "/sales" },
              { label: "Tài chính: Thanh toán" },
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
        ) : query.isError ? (
          <EmptyState
            preset="error"
            title="Không tải được lịch sử thanh toán"
            description={query.error instanceof Error ? query.error.message : "Vui lòng thử lại."}
            actions={<Button size="sm" variant="outline" onClick={() => void query.refetch()}>Thử lại</Button>}
          />
        ) : isEmpty ? (
          <EmptyState preset="no-data" title="Chưa có thanh toán nào" description="Ghi nhận thanh toán cho hoá đơn để theo dõi công nợ." actions={canWrite ? <Button size="sm" onClick={() => setCreateOpen(true)}>Ghi nhận thanh toán</Button> : undefined} />
        ) : (
          <div className="space-y-2">
            {rows.map((p) => (
              <PaymentCard
                key={p.id}
                row={p}
                supplierName={p.supplierName ?? undefined}
                accountName={accountMap.get(p.accountId)?.name}
                expanded={expandedId === p.id}
                onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                canVoid={canVoid && p.status !== "VOID"}
                onVoid={() => setVoidTarget(p)}
              />
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800/60">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                Cộng trang này (không tính đợt đã huỷ)
              </span>
              <span className="font-mono tabular-nums">
                <span className="font-semibold text-rose-600 dark:text-rose-400">Chi −{fmtVND(pageTotals.out)}</span>
                <span className="mx-2 text-zinc-400">·</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">Thu +{fmtVND(pageTotals.in)}</span>
              </span>
            </div>
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

      <PaymentFormDialog open={createOpen} onOpenChange={setCreateOpen} isAdmin={roles.includes("admin")} />
      <ConfirmActionDialog
        open={!!voidTarget}
        onOpenChange={(open) => { if (!open) setVoidTarget(null); }}
        title="Huỷ đợt thanh toán?"
        description={
          voidTarget
            ? `Huỷ đợt ${voidTarget.code} (${fmtVND(voidTarget.totalAmount)}): mọi giao dịch của đợt bị huỷ, số dư nguồn được hoàn lại và các hoá đơn được phân bổ quay về trạng thái chưa trả. Đợt vẫn được giữ với trạng thái "Đã huỷ".`
            : ""
        }
        confirmLabel="Huỷ đợt thanh toán"
        loading={voidMut.isPending}
        onConfirm={async () => {
          if (!voidTarget) return;
          try {
            await voidMut.mutateAsync(voidTarget.id);
            setVoidTarget(null);
          } catch {
            /* toast lỗi đã hiện ở hook */
          }
        }}
      />
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
  const isVoid = row.status === "VOID";

  return (
    <div className={cn("overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900", isVoid && "opacity-70")}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
      >
        <div className="flex min-w-0 items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />}
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {row.code}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold",
                  isVoid
                    ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
                )}
              >
                {isVoid ? "Đã huỷ" : "Đã ghi sổ"}
              </span>
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {fmtDate(row.paymentDate)} · {accountName ?? "—"}{supplierName ? ` · ${supplierName}` : ""} · {METHOD_LABEL[row.method]}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <p className={cn("whitespace-nowrap font-mono text-sm font-bold tabular-nums", row.direction === "IN" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400", isVoid && "line-through")}>
            {row.direction === "IN" ? "+" : "−"}{fmtVND(row.totalAmount)}
          </p>
          {canVoid && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); void onVoid(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void onVoid(); } }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              aria-label={`Huỷ đợt thanh toán ${row.code}`}
              title="Huỷ đợt thanh toán"
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
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isAdmin: boolean;
}) {
  const createMut = useCreateFinPayment();
  const [allowOverdraft, setAllowOverdraft] = React.useState(false);
  const [direction, setDirection] = React.useState<FinDirection>("OUT");
  const [supplier, setSupplier] = React.useState<SupplierPickerValue | null>(null);
  const accountsQuery = useFinAccountsList({ isActive: true });
  const accounts = accountsQuery.data?.data ?? [];

  // V4.1 TC-01: hoá đơn NGƯỢC chiều với thanh toán — Chi (OUT) trả cho hoá đơn
  // mua vào (IN, nợ NCC); Thu (IN) thu cho hoá đơn bán ra (OUT, khách nợ).
  // Trước đây lọc CÙNG chiều → "Chi cho NCC" chỉ thấy hoá đơn bán, muốn trả NCC
  // phải bấm "Thu" → sinh phiếu thu làm số dư TĂNG khi thực ra đang trả tiền.
  const invoiceDirection: FinDirection = direction === "OUT" ? "IN" : "OUT";
  const invoicesQuery = useFinInvoicesList({
    direction: invoiceDirection,
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
      // V4.1 TC-13 — chuỗi ngày VN, không phải `new Date()` (UTC).
      paymentDate: todayInputValue() as unknown as Date,
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
      setAllowOverdraft(false);
      reset({
        direction: "OUT",
        accountId: "",
        supplierId: null,
        paymentDate: todayInputValue() as unknown as Date,
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

  const accountId = watch("accountId");
  const account = accounts.find((a) => a.id === accountId);
  const wouldOverdraw =
    direction === "OUT" && !!account && Number(account.currentBalance) - allocationSum < 0;
  const sourceLabel = direction === "OUT" ? "Nguồn chi" : "Nguồn thu";

  const onSubmit = async (data: FinPaymentCreate) => {
    try {
      await createMut.mutateAsync({
        ...data,
        direction,
        supplierId: supplier?.id ?? null,
        allowOverdraft: isAdmin && allowOverdraft,
      });
      onOpenChange(false);
    } catch {
      /* toast lỗi (vượt nợ HĐ, vượt số dư nguồn…) đã hiện ở hook — giữ form */
    }
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
              <Label htmlFor="pay-account" required>{sourceLabel}</Label>
              <AccountSourceSelect
                id="pay-account"
                accounts={accounts}
                placeholder={`— Chọn ${sourceLabel.toLowerCase()} —`}
                {...register("accountId")}
              />
              <BalanceAfterHint account={account} direction={direction} amount={allocationSum} />
              {errors.accountId && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Chọn {sourceLabel.toLowerCase()}.</p>}
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
              <select id="pay-method" {...register("method")} className={selectClassName}>
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
                  // V4.1 TC-09 — HĐ đã chọn ở dòng khác không hiện lại.
                  const takenElsewhere = new Set(
                    (allocations ?? [])
                      .filter((_, j) => j !== idx)
                      .map((a) => a.invoiceId)
                      .filter(Boolean),
                  );
                  const remaining = inv ? Number(inv.totalAmount) - Number(inv.paidAmount) : undefined;
                  return (
                    <div key={f.id} className="grid grid-cols-[1fr_140px_auto] items-start gap-2">
                      <div>
                        <select
                          {...register(`allocations.${idx}.invoiceId` as const)}
                          aria-label={`Hoá đơn dòng ${idx + 1}`}
                          className={cn(selectClassName, "mt-0")}
                        >
                          <option value="">— Chọn hoá đơn —</option>
                          {openInvoices.filter((i) => !takenElsewhere.has(i.id)).map((i) => (
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

          {wouldOverdraw && isAdmin && (
            <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={allowOverdraft}
                onChange={(e) => setAllowOverdraft(e.target.checked)}
              />
              <span>Cho phép chi vượt số dư nguồn (chỉ Giám đốc). Số dư nguồn sẽ bị âm.</span>
            </label>
          )}
          {wouldOverdraw && !isAdmin && (
            <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              Nguồn chi không đủ số dư — chọn nguồn khác hoặc chuyển quỹ vào nguồn này trước.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button>
            <Button
              type="submit"
              disabled={
                createMut.isPending ||
                fields.length === 0 ||
                mismatch ||
                (wouldOverdraw && !(isAdmin && allowOverdraft))
              }
            >
              {createMut.isPending ? "Đang lưu…" : "Ghi nhận thanh toán"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
