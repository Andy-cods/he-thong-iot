"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Ban,
  FileSpreadsheet,
  FileText,
  Receipt,
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
  finTransferCreateSchema,
  type FinDirection,
  type FinTransactionCreate,
  type FinTransferCreate,
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
import {
  AccountSourceSelect,
  BalanceAfterHint,
  selectClassName,
} from "@/components/finance/AccountSourceSelect";
import { ConfirmActionDialog } from "@/components/finance/ConfirmActionDialog";
import { voidConfirmText } from "@/components/finance/_confirmText";
import { fmtDate, fmtVND, fmtVNDShort, todayInputValue } from "@/components/finance/_format";
import { ImportTransactionsWizard } from "@/components/finance/ImportTransactionsWizard";
import { TransactionDetailSheet } from "@/components/finance/TransactionDetailSheet";
import {
  useCreateFinTransaction,
  useCreateFinTransfer,
  useFinAccountsList,
  useFinCategoriesList,
  useFinTransactionsList,
  useFinTransactionStats,
  useVoidFinTransaction,
  type FinAccountRow,
  type FinTransactionRow,
} from "@/hooks/useFinance";
import { useSession } from "@/hooks/useSession";
import type { FinTransactionFilter } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/**
 * Tab "Thu chi" — bảng `fin_transaction` (nguồn sự thật duy nhất tổng đã
 * thu/chi, xem wave-2-finance.md §C.2).
 *
 * V4.1 Đợt 3: nhãn "Nguồn thu / Nguồn chi" (Q7), chuyển quỹ nội bộ, chặn chi
 * vượt số dư (server 409, admin được vượt), xác nhận trước khi huỷ (TC-08),
 * huỷ giao dịch của đợt thanh toán = huỷ cả đợt (TC-02), tiền đủ số + dòng tổng
 * + header dính (UI).
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
  const allAccountsQuery = useFinAccountsList({});
  const categoriesQuery = useFinCategoriesList({});
  const voidMut = useVoidFinTransaction();

  const total = query.data?.meta.total ?? 0;
  const rows = query.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));
  const isEmpty = !query.isLoading && !query.isError && rows.length === 0;
  const hasFilter =
    urlState.direction !== "all" || urlState.from !== "" || urlState.to !== "" ||
    urlState.accountId !== "" || urlState.categoryId !== "";

  // KPI: tổng thu/chi của TOÀN BỘ tập đang lọc, tính bằng SUM ở DB (không gồm
  // giao dịch đã huỷ và chuyển quỹ nội bộ).
  const { page: _p, pageSize: _ps, ...statsFilter } = filter;
  const kpiQuery = useFinTransactionStats(statsFilter);
  const totalIn = kpiQuery.data?.data.totalIn ?? 0;
  const totalOut = kpiQuery.data?.data.totalOut ?? 0;

  const accounts = accountsQuery.data?.data ?? [];
  // Nguồn đã ngưng vẫn phải hiện tên cho giao dịch cũ.
  const accountMap = new Map((allAccountsQuery.data?.data ?? accounts).map((a) => [a.id, a]));
  const categories = categoriesQuery.data?.data ?? [];
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // Dòng tổng của trang (chỉ giao dịch đã ghi sổ, không tính chuyển quỹ).
  const pageTotals = rows.reduce(
    (acc, r) => {
      if (r.status !== "POSTED" || r.transferGroupId) return acc;
      if (r.direction === "IN") acc.in += Number(r.amount);
      else acc.out += Number(r.amount);
      return acc;
    },
    { in: 0, out: 0 },
  );

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDirection, setCreateDirection] = React.useState<FinDirection>("OUT");
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [selectedRow, setSelectedRow] = React.useState<FinTransactionRow | null>(null);
  const [voidTarget, setVoidTarget] = React.useState<FinTransactionRow | null>(null);

  const resetFilters = () => {
    void setUrlState({ direction: "all", from: "", to: "", accountId: "", categoryId: "", page: 1 });
  };

  const confirmVoid = async () => {
    if (!voidTarget) return;
    try {
      await voidMut.mutateAsync(voidTarget.id);
      setVoidTarget(null);
    } catch {
      /* toast lỗi đã hiện ở hook */
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50/30 dark:bg-zinc-950/30">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
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
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setImportOpen((v) => !v)}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Nhập từ Excel
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
              Chuyển quỹ
            </Button>
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

      {canWrite && importOpen && (
        <div className="border-b border-zinc-200 bg-zinc-50/50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/30 md:px-6">
          <ImportTransactionsWizard onClose={() => setImportOpen(false)} />
        </div>
      )}

      {/* KPI strip — thẻ KPI được rút gọn, bảng bên dưới luôn số đủ */}
      <div className="grid grid-cols-2 gap-3 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-950/40" title={fmtVND(totalIn)}>
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <TrendingUp className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wider">Tổng đã thu</p>
          </div>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-emerald-900 dark:text-emerald-200">
            {fmtVNDShort(totalIn)}
          </p>
          <p className="text-xs tabular-nums text-emerald-800/80 dark:text-emerald-300/80">{fmtVND(totalIn)}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-800 dark:bg-rose-950/40" title={fmtVND(totalOut)}>
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
            <TrendingDown className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wider">Tổng đã chi</p>
          </div>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-rose-900 dark:text-rose-200">
            {fmtVNDShort(totalOut)}
          </p>
          <p className="text-xs tabular-nums text-rose-800/80 dark:text-rose-300/80">{fmtVND(totalOut)}</p>
        </div>
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

        <AccountSourceSelect
          accounts={accounts}
          placeholder="Tất cả nguồn"
          value={urlState.accountId}
          onChange={(e) => void setUrlState({ accountId: e.target.value, page: 1 })}
          aria-label="Lọc theo nguồn"
          className="mt-0 h-8 w-auto rounded-lg border-zinc-200 text-sm"
        />

        <select
          value={urlState.categoryId}
          onChange={(e) => void setUrlState({ categoryId: e.target.value, page: 1 })}
          aria-label="Lọc theo danh mục"
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
        ) : query.isError ? (
          <EmptyState
            preset="error"
            title="Không tải được sổ thu chi"
            description={query.error instanceof Error ? query.error.message : "Vui lòng thử lại."}
            actions={<Button size="sm" variant="outline" onClick={() => void query.refetch()}>Thử lại</Button>}
          />
        ) : isEmpty ? (
          hasFilter ? (
            <EmptyState preset="no-filter-match" title="Không có giao dịch khớp bộ lọc" description="Thử điều chỉnh bộ lọc." actions={<Button variant="ghost" size="sm" onClick={resetFilters}>Xoá bộ lọc</Button>} />
          ) : (
            <EmptyState preset="no-data" title="Chưa có giao dịch nào" description="Tạo phiếu thu/chi để bắt đầu ghi sổ." actions={canWrite ? <Button size="sm" onClick={() => setCreateOpen(true)}>Tạo giao dịch</Button> : undefined} />
          )
        ) : (
          <>
            {/* Desktop table — overflow-clip để header `sticky` bám theo vùng cuộn cha */}
            <div className="hidden overflow-clip rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-zinc-100 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Mã</th>
                    <th className="px-4 py-2.5 text-left">Ngày</th>
                    <th className="px-4 py-2.5 text-left">Diễn giải</th>
                    <th className="px-4 py-2.5 text-left">Nguồn</th>
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
                      onVoid={() => setVoidTarget(r)}
                      onClick={() => setSelectedRow(r)}
                    />
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-zinc-200 bg-zinc-50 text-sm dark:border-zinc-700 dark:bg-zinc-800/60">
                  <tr>
                    <td colSpan={6} className="px-4 py-2.5 font-semibold text-zinc-700 dark:text-zinc-300">
                      Cộng trang này ({rows.length} dòng, không tính phiếu huỷ và chuyển quỹ)
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      <div className="font-semibold text-emerald-700 dark:text-emerald-400">+{fmtVND(pageTotals.in)}</div>
                      <div className="font-semibold text-rose-600 dark:text-rose-400">−{fmtVND(pageTotals.out)}</div>
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="flex flex-col gap-2 md:hidden">
              {rows.map((r) => (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedRow(r)}
                  onKeyDown={(e) => { if (e.key === "Enter") setSelectedRow(r); }}
                  className="cursor-pointer rounded-xl border border-zinc-200 bg-white p-3 shadow-sm hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{r.code}</p>
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{r.description ?? "—"}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{fmtDate(r.transactionDate)} · {accountMap.get(r.accountId)?.name ?? "—"}</p>
                      {r.transferGroupId && <TransferBadge />}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("font-mono text-sm font-bold tabular-nums", r.direction === "IN" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                        {r.direction === "IN" ? "+" : "−"}{fmtVND(r.amount)}
                      </p>
                      <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CHIP[r.status])}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </div>
                  </div>
                  {canVoid && r.status === "POSTED" && (
                    <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); setVoidTarget(r); }}
                        className="text-rose-600 dark:text-rose-400"
                      >
                        <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Huỷ giao dịch
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/60">
                <p className="font-semibold text-zinc-700 dark:text-zinc-300">Cộng trang này</p>
                <p className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">Thu +{fmtVND(pageTotals.in)}</p>
                <p className="font-mono tabular-nums text-rose-600 dark:text-rose-400">Chi −{fmtVND(pageTotals.out)}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {!isEmpty && !query.isError && (
        <footer className="flex h-11 items-center justify-between border-t border-zinc-200 bg-white px-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 md:px-6">
          <div className="tabular-nums">
            Trang <span className="font-semibold text-zinc-900 dark:text-zinc-50">{urlState.page}</span> / {pageCount}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={urlState.page <= 1} onClick={() => void setUrlState({ page: 1 })} aria-label="Trang đầu">‹‹</Button>
            <Button size="sm" variant="ghost" disabled={urlState.page <= 1} onClick={() => void setUrlState({ page: Math.max(1, urlState.page - 1) })} aria-label="Trang trước">‹</Button>
            <Button size="sm" variant="ghost" disabled={urlState.page >= pageCount} onClick={() => void setUrlState({ page: Math.min(pageCount, urlState.page + 1) })} aria-label="Trang sau">›</Button>
            <Button size="sm" variant="ghost" disabled={urlState.page >= pageCount} onClick={() => void setUrlState({ page: pageCount })} aria-label="Trang cuối">››</Button>
          </div>
        </footer>
      )}

      <TransactionFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        direction={createDirection}
        accounts={accounts}
        isAdmin={roles.includes("admin")}
      />
      <TransferFormDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        accounts={accounts}
        isAdmin={roles.includes("admin")}
      />
      {selectedRow && (
        <TransactionDetailSheet
          row={selectedRow}
          onOpenChange={(open) => { if (!open) setSelectedRow(null); }}
        />
      )}
      <ConfirmActionDialog
        open={!!voidTarget}
        onOpenChange={(open) => { if (!open) setVoidTarget(null); }}
        title={voidTarget?.paymentId ? "Huỷ cả đợt thanh toán?" : voidTarget?.transferGroupId ? "Huỷ phiếu chuyển quỹ?" : "Huỷ giao dịch?"}
        description={voidTarget ? voidConfirmText(voidTarget) : ""}
        confirmLabel={voidTarget?.paymentId ? "Huỷ cả đợt thanh toán" : "Huỷ giao dịch"}
        loading={voidMut.isPending}
        onConfirm={confirmVoid}
      />
    </div>
  );
}

function TransferBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
      <ArrowLeftRight className="h-3 w-3" aria-hidden="true" /> Chuyển quỹ
    </span>
  );
}

function TransactionRow({
  row,
  accountName,
  categoryName,
  canVoid,
  onVoid,
  onClick,
}: {
  row: FinTransactionRow;
  accountName?: string;
  categoryName?: string;
  canVoid: boolean;
  onVoid: () => void;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn("cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/60", row.status === "VOID" && "opacity-60")}
    >
      <td className="px-4 py-2.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">{row.code}</td>
      <td className="px-4 py-2.5 whitespace-nowrap text-zinc-600 dark:text-zinc-400">{fmtDate(row.transactionDate)}</td>
      <td className="px-4 py-2.5 max-w-[280px] truncate text-zinc-800 dark:text-zinc-200">{row.description ?? "—"}</td>
      <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{accountName ?? "—"}</td>
      <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
        {row.transferGroupId ? <TransferBadge /> : (categoryName ?? "—")}
      </td>
      <td className="px-4 py-2.5 text-center">
        {row.invoiceId ? (
          <FileText className="mx-auto h-4 w-4 text-indigo-500 dark:text-indigo-400" aria-label="Có hoá đơn" />
        ) : (
          <span className="text-zinc-300 dark:text-zinc-600">—</span>
        )}
      </td>
      <td className={cn("whitespace-nowrap px-4 py-2.5 text-right font-mono font-semibold tabular-nums", row.direction === "IN" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400", row.status === "VOID" && "line-through")}>
        {row.direction === "IN" ? "+" : "−"}{fmtVND(row.amount)}
      </td>
      <td className="px-4 py-2.5 text-center">
        <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CHIP[row.status])}>
          {STATUS_LABEL[row.status]}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right">
        {canVoid && row.status === "POSTED" && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); onVoid(); }}
            aria-label={`Huỷ giao dịch ${row.code}`}
            title="Huỷ giao dịch"
          >
            <Ban className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
          </Button>
        )}
      </td>
    </tr>
  );
}

function OverdraftCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        Cho phép chi vượt số dư nguồn (chỉ Giám đốc). Số dư nguồn sẽ bị âm — hãy chắc chắn đây là
        dữ liệu đúng.
      </span>
    </label>
  );
}

function TransactionFormDialog({
  open,
  onOpenChange,
  direction,
  accounts,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  direction: FinDirection;
  accounts: FinAccountRow[];
  isAdmin: boolean;
}) {
  const createMut = useCreateFinTransaction();
  const categoriesQuery = useFinCategoriesList({ direction, isActive: true });
  const categories = categoriesQuery.data?.data ?? [];

  const emptyValues = React.useCallback(
    () => ({
      direction,
      accountId: "",
      categoryId: null,
      amount: 0,
      // V4.1 TC-13 — mặc định là CHUỖI ngày VN (không phải `new Date()` giờ UTC).
      transactionDate: todayInputValue() as unknown as Date,
      description: "",
      allowOverdraft: false,
    }),
    [direction],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FinTransactionCreate>({
    resolver: zodResolver(finTransactionCreateSchema),
    defaultValues: emptyValues(),
  });

  React.useEffect(() => {
    if (open) reset(emptyValues());
  }, [open, reset, emptyValues]);

  const accountId = watch("accountId");
  const amount = Number(watch("amount")) || 0;
  const allowOverdraft = !!watch("allowOverdraft");
  const account = accounts.find((a) => a.id === accountId);
  const wouldOverdraw =
    direction === "OUT" && !!account && Number(account.currentBalance) - amount < 0;

  const onSubmit = async (data: FinTransactionCreate) => {
    try {
      await createMut.mutateAsync({ ...data, allowOverdraft: isAdmin && allowOverdraft });
      onOpenChange(false);
    } catch {
      /* toast lỗi (VD "Nguồn chi X chỉ còn Y ₫") đã hiện ở hook — giữ form để sửa */
    }
  };

  const sourceLabel = direction === "IN" ? "Nguồn thu" : "Nguồn chi";

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
            <Label htmlFor="tx-account" required>{sourceLabel}</Label>
            <AccountSourceSelect
              id="tx-account"
              accounts={accounts}
              placeholder={`— Chọn ${sourceLabel.toLowerCase()} —`}
              {...register("accountId")}
            />
            <BalanceAfterHint account={account} direction={direction} amount={amount} />
            {errors.accountId && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Chọn {sourceLabel.toLowerCase()}.</p>}
          </div>

          <div>
            <Label htmlFor="tx-category">Danh mục</Label>
            <select id="tx-category" {...register("categoryId")} className={selectClassName}>
              <option value="">— Không chọn —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tx-amount" required>Số tiền</Label>
              <Input id="tx-amount" type="number" step="1000" min="0" {...register("amount")} error={!!errors.amount} className="mt-1 font-mono tabular-nums" placeholder="0" />
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

          {wouldOverdraw && isAdmin && (
            <OverdraftCheckbox
              checked={allowOverdraft}
              onChange={(v) => setValue("allowOverdraft", v)}
            />
          )}
          {wouldOverdraw && !isAdmin && (
            <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              Nguồn chi không đủ số dư — hãy chọn nguồn khác, chuyển quỹ vào nguồn này trước, hoặc
              nhờ Giám đốc duyệt chi vượt.
            </p>
          )}

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Giao dịch này KHÔNG gắn hoá đơn. Nếu cần ghi nhận thanh toán cho hoá đơn, dùng tab &quot;Thanh toán&quot;.
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button>
            <Button
              type="submit"
              disabled={createMut.isPending || (wouldOverdraw && !(isAdmin && allowOverdraft))}
            >
              {createMut.isPending ? "Đang lưu…" : "Tạo giao dịch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * V4.1 Đợt 3 (Q7) — Chuyển quỹ nội bộ: rút từ nguồn đi, nạp vào nguồn nhận.
 * Không tính vào tổng thu/chi.
 */
function TransferFormDialog({
  open,
  onOpenChange,
  accounts,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: FinAccountRow[];
  isAdmin: boolean;
}) {
  const transferMut = useCreateFinTransfer();
  const emptyValues = React.useCallback(
    () => ({
      fromAccountId: "",
      toAccountId: "",
      amount: 0,
      transactionDate: todayInputValue() as unknown as Date,
      description: "",
      allowOverdraft: false,
    }),
    [],
  );
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FinTransferCreate>({
    resolver: zodResolver(finTransferCreateSchema),
    defaultValues: emptyValues(),
  });

  React.useEffect(() => {
    if (open) reset(emptyValues());
  }, [open, reset, emptyValues]);

  const fromId = watch("fromAccountId");
  const toId = watch("toAccountId");
  const amount = Number(watch("amount")) || 0;
  const allowOverdraft = !!watch("allowOverdraft");
  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const wouldOverdraw = !!from && Number(from.currentBalance) - amount < 0;

  const onSubmit = async (data: FinTransferCreate) => {
    try {
      await transferMut.mutateAsync({ ...data, allowOverdraft: isAdmin && allowOverdraft });
      onOpenChange(false);
    } catch {
      /* toast lỗi đã hiện ở hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
            Chuyển quỹ nội bộ
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3" noValidate>
          <div>
            <Label htmlFor="tf-from" required>Từ nguồn (chi ra)</Label>
            <AccountSourceSelect id="tf-from" accounts={accounts} excludeId={toId} {...register("fromAccountId")} />
            <BalanceAfterHint account={from} direction="OUT" amount={amount} />
            {errors.fromAccountId && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Chọn nguồn chuyển đi.</p>}
          </div>
          <div>
            <Label htmlFor="tf-to" required>Sang nguồn (nhận vào)</Label>
            <AccountSourceSelect id="tf-to" accounts={accounts} excludeId={fromId} {...register("toAccountId")} />
            <BalanceAfterHint account={to} direction="IN" amount={amount} />
            {errors.toAccountId && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errors.toAccountId.message?.includes("khác") ? errors.toAccountId.message : "Chọn nguồn nhận."}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tf-amount" required>Số tiền</Label>
              <Input id="tf-amount" type="number" step="1000" min="0" {...register("amount")} error={!!errors.amount} className="mt-1 font-mono tabular-nums" />
              {errors.amount && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.amount.message}</p>}
            </div>
            <div>
              <Label htmlFor="tf-date" required>Ngày chuyển</Label>
              <Input id="tf-date" type="date" {...register("transactionDate")} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="tf-desc">Ghi chú</Label>
            <Input id="tf-desc" {...register("description")} placeholder="VD: Nạp quỹ chi tiêu tuần 40" className="mt-1" />
          </div>
          {wouldOverdraw && isAdmin && (
            <OverdraftCheckbox checked={allowOverdraft} onChange={(v) => setValue("allowOverdraft", v)} />
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Chuyển quỹ tạo phiếu <span className="font-mono">CQ-…</span> gồm 1 dòng chi ở nguồn đi và 1 dòng thu ở nguồn nhận;
            KHÔNG tính vào tổng thu/chi. Huỷ 1 dòng sẽ huỷ cả 2.
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button>
            <Button type="submit" disabled={transferMut.isPending || (wouldOverdraw && !(isAdmin && allowOverdraft))}>
              {transferMut.isPending ? "Đang lưu…" : "Chuyển quỹ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
