"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Ban,
  FileText,
  Plus,
  Receipt,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import {
  can,
  finTransactionCreateSchema,
  type FinDirection,
  type FinTransactionCreate,
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
import { fmtDate, fmtVND } from "@/components/finance/_format";
import {
  useCreateFinTransaction,
  useFinAccountsList,
  useFinCategoriesList,
  useFinTransactionsList,
  useVoidFinTransaction,
  type FinTransactionRow,
} from "@/hooks/useFinance";
import { useSession } from "@/hooks/useSession";
import type { FinTransactionFilter } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/**
 * Tab "Thu chi" — bảng `fin_transaction` (nguồn sự thật duy nhất tổng đã
 * thu/chi, xem wave-2-finance.md §C.2). Filter theo ngày/tài khoản/danh
 * mục/chiều/trạng thái + phân trang, giống khuôn `POTab.tsx`.
 */

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  POSTED: "Đã ghi sổ",
  VOID: "Đã huỷ",
};

const STATUS_CHIP: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  POSTED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  VOID: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
};

export function CashbookTab() {
  const { data: session } = useSession();
  const roles = session?.roles ?? [];
  const canWrite = can(roles, "create", "finance");
  const canVoid = can(roles, "update", "finance");

  const [urlState, setUrlState] = useQueryStates(
    {
      direction: parseAsStringEnum(["all", "IN", "OUT"]).withDefault("all"),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
      from: parseAsString.withDefault(""),
      to: parseAsString.withDefault(""),
      accountId: parseAsString.withDefault(""),
      categoryId: parseAsString.withDefault(""),
    },
    { history: "replace", shallow: true },
  );

  const filter: FinTransactionFilter = React.useMemo(
    () => ({
      direction: urlState.direction === "all" ? undefined : urlState.direction,
      page: urlState.page,
      pageSize: urlState.pageSize,
      dateFrom: urlState.from || undefined,
      dateTo: urlState.to || undefined,
      accountId: urlState.accountId || undefined,
      categoryId: urlState.categoryId || undefined,
    }),
    [urlState],
  );

  const query = useFinTransactionsList(filter);
  const accountsQuery = useFinAccountsList({ isActive: true });
  const categoriesQuery = useFinCategoriesList({});
  const voidMut = useVoidFinTransaction();

  const total = query.data?.meta.total ?? 0;
  const rows = query.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));
  const isEmpty = !query.isLoading && rows.length === 0;
  const hasFilter =
    urlState.direction !== "all" || urlState.from !== "" || urlState.to !== "" ||
    urlState.accountId !== "" || urlState.categoryId !== "";

  // KPI: tổng thu/chi của TẬP ĐANG LỌC (không chỉ trang hiện tại) — dùng
  // pageSize lớn cho query riêng KPI để tránh chỉ tính trang hiện tại.
  const kpiQuery = useFinTransactionsList({ ...filter, page: 1, pageSize: 1000 });
  const kpiRows = kpiQuery.data?.data ?? [];
  const totalIn = kpiRows.filter((r) => r.direction === "IN" && r.status === "POSTED").reduce((s, r) => s + Number(r.amount), 0);
  const totalOut = kpiRows.filter((r) => r.direction === "OUT" && r.status === "POSTED").reduce((s, r) => s + Number(r.amount), 0);
  const kpiCapped = (kpiQuery.data?.meta.total ?? 0) > 1000;

  const accounts = accountsQuery.data?.data ?? [];
  const categories = categoriesQuery.data?.data ?? [];
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDirection, setCreateDirection] = React.useState<FinDirection>("OUT");

  const resetFilters = () => {
    void setUrlState({ direction: "all", from: "", to: "", accountId: "", categoryId: "", page: 1 });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50/30 dark:bg-zinc-950/30">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Trang chủ", href: "/" },
              { label: "Bộ phận Thu mua", href: "/sales" },
              { label: "Tài chính: Thu chi" },
            ]}
          />
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Sổ thu chi
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{total.toLocaleString("vi-VN")}</span> giao dịch
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCreateDirection("IN");
                setCreateOpen(true);
              }}
            >
              <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
              Phiếu thu
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setCreateDirection("OUT");
                setCreateOpen(true);
              }}
            >
              <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
              Phiếu chi
            </Button>
          </div>
        )}
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <TrendingUp className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wider">Tổng đã thu</p>
          </div>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-emerald-900 dark:text-emerald-200">
            {fmtVND(totalIn)}
            {kpiCapped && <span className="ml-1 text-xs font-normal">*</span>}
          </p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-800 dark:bg-rose-950/40">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
            <TrendingDown className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wider">Tổng đã chi</p>
          </div>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-rose-900 dark:text-rose-200">
            {fmtVND(totalOut)}
            {kpiCapped && <span className="ml-1 text-xs font-normal">*</span>}
          </p>
        </div>
        {kpiCapped && (
          <p className="col-span-2 text-[11px] text-zinc-400 dark:text-zinc-500">
            * Tính trên 1.000 giao dịch gần nhất khớp bộ lọc (tổng {kpiQuery.data?.meta.total} giao dịch)
          </p>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(["all", "IN", "OUT"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => void setUrlState({ direction: d, page: 1 })}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                urlState.direction === d
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
              )}
            >
              {d === "all" ? "Tất cả" : d === "IN" ? "Thu" : "Chi"}
            </button>
          ))}
        </div>

        <select
          value={urlState.accountId}
          onChange={(e) => void setUrlState({ accountId: e.target.value, page: 1 })}
          className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <option value="">Tất cả tài khoản</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        <select
          value={urlState.categoryId}
          onChange={(e) => void setUrlState({ categoryId: e.target.value, page: 1 })}
          className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span>Từ</span>
            <input
              type="date"
              value={urlState.from}
              onChange={(e) => void setUrlState({ from: e.target.value, page: 1 })}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span>Đến</span>
            <input
              type="date"
              value={urlState.to}
              onChange={(e) => void setUrlState({ to: e.target.value, page: 1 })}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>Xoá lọc</Button>
          )}
        </div>
      </div>

      {/* Table / cards */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {query.isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : isEmpty ? (
          hasFilter ? (
            <EmptyState preset="no-filter-match" title="Không có giao dịch khớp bộ lọc" description="Thử điều chỉnh bộ lọc." actions={<Button variant="ghost" size="sm" onClick={resetFilters}>Xoá bộ lọc</Button>} />
          ) : (
            <EmptyState preset="no-data" title="Chưa có giao dịch nào" description="Tạo phiếu thu/chi để bắt đầu ghi sổ." actions={canWrite ? <Button size="sm" onClick={() => setCreateOpen(true)}>Tạo giao dịch</Button> : undefined} />
          )
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Mã</th>
                    <th className="px-4 py-2.5 text-left">Ngày</th>
                    <th className="px-4 py-2.5 text-left">Diễn giải</th>
                    <th className="px-4 py-2.5 text-left">Tài khoản</th>
                    <th className="px-4 py-2.5 text-left">Danh mục</th>
                    <th className="px-4 py-2.5 text-center">Hoá đơn</th>
                    <th className="px-4 py-2.5 text-right">Số tiền</th>
                    <th className="px-4 py-2.5 text-center">Trạng thái</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {rows.map((r) => (
                    <TransactionRow
                      key={r.id}
                      row={r}
                      accountName={accountMap.get(r.accountId)?.name}
                      categoryName={r.categoryId ? categoryMap.get(r.categoryId)?.name : undefined}
                      canVoid={canVoid}
                      onVoid={() => void voidMut.mutateAsync(r.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="flex flex-col gap-2 md:hidden">
              {rows.map((r) => (
                <div key={r.id} className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">{r.code}</p>
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{r.description ?? "—"}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{fmtDate(r.transactionDate)} · {accountMap.get(r.accountId)?.name ?? "—"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("font-mono text-sm font-bold tabular-nums", r.direction === "IN" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                        {r.direction === "IN" ? "+" : "-"}{fmtVND(r.amount)}
                      </p>
                      <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_CHIP[r.status])}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </div>
                  </div>
                  {canVoid && r.status === "POSTED" && (
                    <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                      <Button size="sm" variant="ghost" onClick={() => void voidMut.mutateAsync(r.id)} className="text-rose-600 dark:text-rose-400">
                        <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Huỷ giao dịch
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {!isEmpty && (
        <footer className="flex h-11 items-center justify-between border-t border-zinc-200 bg-white px-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 md:px-6">
          <div className="tabular-nums">
            Trang <span className="font-semibold text-zinc-900 dark:text-zinc-50">{urlState.page}</span> / {pageCount}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={urlState.page <= 1} onClick={() => void setUrlState({ page: 1 })}>‹‹</Button>
            <Button size="sm" variant="ghost" disabled={urlState.page <= 1} onClick={() => void setUrlState({ page: Math.max(1, urlState.page - 1) })}>‹</Button>
            <Button size="sm" variant="ghost" disabled={urlState.page >= pageCount} onClick={() => void setUrlState({ page: Math.min(pageCount, urlState.page + 1) })}>›</Button>
            <Button size="sm" variant="ghost" disabled={urlState.page >= pageCount} onClick={() => void setUrlState({ page: pageCount })}>››</Button>
          </div>
        </footer>
      )}

      <TransactionFormDialog open={createOpen} onOpenChange={setCreateOpen} direction={createDirection} />
    </div>
  );
}

function TransactionRow({
  row,
  accountName,
  categoryName,
  canVoid,
  onVoid,
}: {
  row: FinTransactionRow;
  accountName?: string;
  categoryName?: string;
  canVoid: boolean;
  onVoid: () => void;
}) {
  return (
    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
      <td className="px-4 py-2.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">{row.code}</td>
      <td className="px-4 py-2.5 whitespace-nowrap text-zinc-600 dark:text-zinc-400">{fmtDate(row.transactionDate)}</td>
      <td className="px-4 py-2.5 max-w-[280px] truncate text-zinc-800 dark:text-zinc-200">{row.description ?? "—"}</td>
      <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{accountName ?? "—"}</td>
      <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{categoryName ?? "—"}</td>
      <td className="px-4 py-2.5 text-center">
        {row.invoiceId ? (
          <FileText className="mx-auto h-4 w-4 text-indigo-500 dark:text-indigo-400" aria-label="Có hoá đơn" />
        ) : (
          <span className="text-zinc-300 dark:text-zinc-600">—</span>
        )}
      </td>
      <td className={cn("px-4 py-2.5 text-right font-mono font-semibold tabular-nums", row.direction === "IN" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
        {row.direction === "IN" ? "+" : "-"}{fmtVND(row.amount)}
      </td>
      <td className="px-4 py-2.5 text-center">
        <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CHIP[row.status])}>
          {STATUS_LABEL[row.status]}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right">
        {canVoid && row.status === "POSTED" && (
          <Button size="icon-sm" variant="ghost" onClick={onVoid} aria-label="Huỷ giao dịch" title="Huỷ giao dịch">
            <Ban className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
          </Button>
        )}
      </td>
    </tr>
  );
}

function TransactionFormDialog({
  open,
  onOpenChange,
  direction,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  direction: FinDirection;
}) {
  const createMut = useCreateFinTransaction();
  const accountsQuery = useFinAccountsList({ isActive: true });
  const categoriesQuery = useFinCategoriesList({ direction, isActive: true });
  const accounts = accountsQuery.data?.data ?? [];
  const categories = categoriesQuery.data?.data ?? [];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FinTransactionCreate>({
    resolver: zodResolver(finTransactionCreateSchema),
    defaultValues: {
      direction,
      accountId: "",
      categoryId: null,
      amount: 0,
      transactionDate: new Date(),
      description: "",
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        direction,
        accountId: accounts[0]?.id ?? "",
        categoryId: null,
        amount: 0,
        transactionDate: new Date(),
        description: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, direction]);

  const onSubmit = async (data: FinTransactionCreate) => {
    await createMut.mutateAsync(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" aria-hidden="true" />
            {direction === "IN" ? "Tạo phiếu thu" : "Tạo phiếu chi"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3" noValidate>
          <input type="hidden" {...register("direction")} value={direction} />

          <div>
            <Label htmlFor="tx-account" required>Tài khoản</Label>
            <select
              id="tx-account"
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
            <Label htmlFor="tx-category">Danh mục</Label>
            <select
              id="tx-category"
              {...register("categoryId")}
              className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">— Không chọn —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tx-amount" required>Số tiền</Label>
              <Input id="tx-amount" type="number" step="1000" {...register("amount")} error={!!errors.amount} className="mt-1 font-mono tabular-nums" placeholder="0" />
              {errors.amount && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.amount.message}</p>}
            </div>
            <div>
              <Label htmlFor="tx-date" required>Ngày giao dịch</Label>
              <Input id="tx-date" type="date" {...register("transactionDate")} className="mt-1" />
            </div>
          </div>

          <div>
            <Label htmlFor="tx-desc">Diễn giải</Label>
            <Input id="tx-desc" {...register("description")} placeholder="VD: Mua văn phòng phẩm" className="mt-1" />
          </div>

          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Giao dịch này KHÔNG gắn hoá đơn. Nếu cần ghi nhận thanh toán cho hoá đơn, dùng tab "Thanh toán".
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button>
            <Button type="submit" disabled={createMut.isPending}>{createMut.isPending ? "Đang lưu…" : "Tạo giao dịch"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
