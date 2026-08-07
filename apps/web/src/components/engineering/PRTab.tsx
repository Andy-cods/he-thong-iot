"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import {
  PR_STATUSES,
  PR_STATUS_LABELS,
  can,
  type PRStatus,
} from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PRListTable } from "@/components/procurement/PRListTable";
import { ExportExcelDialog } from "@/components/archive/ExportExcelDialog";
import { usePurchaseRequestsList } from "@/hooks/usePurchaseRequests";
import { useSession } from "@/hooks/useSession";
import type { PRFilter } from "@/lib/query-keys";

/**
 * V3.16 — Đề xuất mua vật tư (YCVT/MRF) dạng BẢNG PHẲNG.
 *
 * Trước là "thư mục Tháng → Ngày → phiếu" (V3.13); user dùng thử rồi đổi ý,
 * quay về 1 danh sách dài + cột "Ngày tạo" bấm được để sort + bộ lọc khoảng
 * ngày (Từ/Đến) để tra cứu — copy-adapt từ POTab.tsx.
 * Click 1 phiếu → /procurement/purchase-requests/[id] (đã có sẵn).
 */

export function PRTab() {
  const [urlState, setUrlState] = useQueryStates(
    {
      status: parseAsStringEnum(["all", ...PR_STATUSES]).withDefault("all"),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
      q: parseAsString.withDefault(""),
      from: parseAsString.withDefault(""),
      to: parseAsString.withDefault(""),
      sortDir: parseAsStringEnum(["asc", "desc"]).withDefault("desc"),
    },
    { history: "replace", shallow: true },
  );

  // V3.16 — Khoảng ngày mặc định cho dialog xuất Excel: theo bộ lọc from/to
  // hiện tại của trang (nếu user đã chọn), else để rỗng (dialog tự tính
  // "hôm nay" lúc mở, client-only, tránh hydration mismatch).
  const exportRange = React.useMemo(
    () => ({ from: urlState.from, to: urlState.to }),
    [urlState.from, urlState.to],
  );

  const filter: PRFilter = React.useMemo(
    () => ({
      status:
        urlState.status === "all"
          ? undefined
          : [urlState.status as PRStatus],
      page: urlState.page,
      pageSize: urlState.pageSize,
      q: urlState.q || undefined,
      from: urlState.from || undefined,
      to: urlState.to || undefined,
      sortDir: urlState.sortDir as "asc" | "desc",
    }),
    [
      urlState.status,
      urlState.page,
      urlState.pageSize,
      urlState.q,
      urlState.from,
      urlState.to,
      urlState.sortDir,
    ],
  );
  const query = usePurchaseRequestsList(filter);
  const total = query.data?.meta.total ?? 0;
  const rows = query.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));
  const isEmpty = !query.isLoading && rows.length === 0;
  const hasFilter =
    urlState.status !== "all" ||
    urlState.q !== "" ||
    urlState.from !== "" ||
    urlState.to !== "";

  const resetFilters = () => {
    void setUrlState({ status: "all", q: "", from: "", to: "", page: 1 });
  };

  const session = useSession();
  const roles = session.data?.roles ?? [];
  const canCreateMRF = can(roles, "create", "pr");

  const createButtons = (
    <div className="flex items-center gap-2">
      {canCreateMRF && (
        <>
          <Button asChild size="sm" title="Phiếu đề xuất vật tư mẫu GTAM/PRD-MRF-02">
            <Link href="/procurement/purchase-requests/new-dnvt">
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Phiếu đề xuất vật tư (DNVT)</span>
              <span className="sm:hidden">DNVT</span>
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" title="Phiếu MRF có cột Đơn giá / Tổng tiền">
            <Link href="/procurement/purchase-requests/new-mrf">
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Phiếu MRF (có giá)</span>
              <span className="sm:hidden">MRF</span>
            </Link>
          </Button>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col bg-zinc-50/30 dark:bg-zinc-950/30 md:h-full md:overflow-hidden">
      <header className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 md:px-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="min-w-0">
          <Breadcrumb
            items={[
              { label: "Trang chủ", href: "/" },
              { label: "Đề xuất vật tư" },
            ]}
          />
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Đề xuất mua vật tư (YCVT/MRF)
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {total.toLocaleString("vi-VN")} phiếu
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportExcelDialog
            module="purchase-requests"
            defaultFrom={exportRange.from}
            defaultTo={exportRange.to}
          />
          {createButtons}
        </div>
      </header>

      {/* Thanh filter: trạng thái + khoảng ngày */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 md:px-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap gap-1">
          {["all", ...PR_STATUSES].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void setUrlState({ status: s as typeof urlState.status, page: 1 })}
              className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
                urlState.status === s
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {s === "all" ? "Tất cả" : PR_STATUS_LABELS[s as PRStatus]}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="text-zinc-500 dark:text-zinc-400">Từ</span>
            <input
              type="date"
              value={urlState.from}
              max={urlState.to || undefined}
              onChange={(e) => void setUrlState({ from: e.target.value, page: 1 })}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="text-zinc-500 dark:text-zinc-400">Đến</span>
            <input
              type="date"
              value={urlState.to}
              min={urlState.from || undefined}
              onChange={(e) => void setUrlState({ to: e.target.value, page: 1 })}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Xoá lọc
            </Button>
          )}
        </div>
      </div>

      {/* Nội dung */}
      <div className="flex-1 overflow-hidden p-4">
        {isEmpty ? (
          hasFilter ? (
            <EmptyState
              preset="no-filter-match"
              title="Không có phiếu khớp bộ lọc"
              actions={
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Xoá bộ lọc
                </Button>
              }
            />
          ) : (
            <EmptyState
              preset="no-bom"
              title="Chưa có phiếu đề xuất nào"
              description="Chọn mẫu phiếu ở góc trên để tạo đề xuất mua vật tư gửi Bộ phận Thu mua duyệt."
              actions={canCreateMRF ? createButtons : undefined}
            />
          )
        ) : (
          <PRListTable
            rows={rows}
            loading={query.isLoading}
            sortDir={urlState.sortDir as "asc" | "desc"}
            onSortDateClick={() =>
              void setUrlState({
                sortDir: urlState.sortDir === "asc" ? "desc" : "asc",
              })
            }
          />
        )}
      </div>

      {/* Phân trang */}
      {!isEmpty && (
        <footer className="flex h-9 items-center justify-between border-t border-zinc-200 bg-white px-4 text-base dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-zinc-600 tabular-nums dark:text-zinc-400">
            Trang {urlState.page} / {pageCount}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={urlState.page <= 1}
              onClick={() => void setUrlState({ page: Math.max(1, urlState.page - 1) })}
            >
              ‹
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={urlState.page >= pageCount}
              onClick={() => void setUrlState({ page: Math.min(pageCount, urlState.page + 1) })}
            >
              ›
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
