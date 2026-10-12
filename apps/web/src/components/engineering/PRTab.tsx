"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import {
  PR_STATUSES,
  can,
  type PRStatus,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryError } from "@/components/ui/query-error";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PRListTable } from "@/components/procurement/PRListTable";
import { ExportExcelDialog } from "@/components/archive/ExportExcelDialog";
import { usePurchaseRequestsList } from "@/hooks/usePurchaseRequests";
import { useSession } from "@/hooks/useSession";
import { canExportPrExcel } from "@/server/services/prAccess";
import type { PRFilter } from "@/lib/query-keys";
import { statusLabel } from "@/lib/status";
import { formatNumber } from "@/lib/format";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";

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
      status: parseAsStringEnum(["all", ...PR_STATUSES, "COMPLETED"]).withDefault("all"),
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
  // L13: ô tìm kiếm — debounce 300ms rồi mới ghi vào ?q= (lọc server-side).
  const [qInput, setQInput] = React.useState(urlState.q);
  React.useEffect(() => {
    setQInput(urlState.q);
  }, [urlState.q]);
  React.useEffect(() => {
    const t = setTimeout(() => {
      const next = qInput.trim();
      if (next !== urlState.q) void setUrlState({ q: next, page: 1 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);
  // L13: khoảng ngày ngược (từ > đến) → báo nhẹ thay vì ra 0 phiếu im lặng.
  const dateRangeInvalid =
    !!urlState.from && !!urlState.to && urlState.from > urlState.to;

  const exportRange = React.useMemo(
    () => ({ from: urlState.from, to: urlState.to }),
    [urlState.from, urlState.to],
  );

  const filter: PRFilter = React.useMemo(
    () => ({
      completed: urlState.status === "COMPLETED" ? true : undefined,
      status:
        urlState.status === "all" || urlState.status === "COMPLETED"
          ? undefined
          : [urlState.status as PRStatus],
      page: urlState.page,
      pageSize: urlState.pageSize,
      q: urlState.q || undefined,
      // from > to: không gửi lên API (sẽ 422) — chỉ báo lỗi nhẹ ở UI.
      from: dateRangeInvalid ? undefined : urlState.from || undefined,
      to: dateRangeInvalid ? undefined : urlState.to || undefined,
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
      dateRangeInvalid,
    ],
  );
  const query = usePurchaseRequestsList(filter);
  const total = query.data?.meta.total ?? 0;
  const rows = query.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));
  // V4.1 UI-05: tách lỗi khỏi rỗng — lỗi API không hiện "Chưa có phiếu".
  const showError = query.isError && rows.length === 0 && !dateRangeInvalid;
  const isEmpty =
    !query.isLoading && !query.isError && rows.length === 0 && !dateRangeInvalid;
  const counts = query.data?.meta.counts;
  const tabCount = (s: string): number | undefined => {
    if (!counts) return undefined;
    if (s === "all") return counts.all;
    if (s === "COMPLETED") return counts.completed;
    return counts.byStatus[s as PRStatus] ?? 0;
  };
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
  // TASK-6VIEC Việc 1 — chỉ admin/purchaser/accountant được xuất Excel.
  const canExportExcel = canExportPrExcel(roles);

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
    <div className="flex flex-col md:h-full md:overflow-hidden">
      {/* V4.3 Đợt 2 mục 1 — tiêu đề Large Title BARE trên nền trang xám (không
          còn panel trắng viền dính sát filter/bảng bên dưới — bảng tự nổi
          thành thẻ riêng, xem `DataTable`). */}
      {/* V4.1 UI-06: header flex-wrap — điện thoại nút xuống dòng thay vì tràn phải
          (trang từng rộng 501px, tiêu đề gãy từng chữ). */}
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-5 md:px-6 md:pt-6">
        <div className="min-w-0 flex-1 basis-56">
          {/* V4.1 UI-09 (X6): bỏ breadcrumb thân trang — topbar đã hiện cùng đường dẫn (+ nhãn tab). */}
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {/* V4.1 UI-28: thống nhất 1 tên "Đề xuất vật tư" (menu, tab, tiêu đề). */}
            Đề xuất vật tư
          </h1>
          <p className="mt-0.5 text-base text-zinc-500 dark:text-zinc-400">
            {query.isError ? "—" : formatNumber(total)} phiếu
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExportExcel && (
            <ExportExcelDialog
              module="purchase-requests"
              defaultFrom={exportRange.from}
              defaultTo={exportRange.to}
            />
          )}
          {createButtons}
        </div>
      </header>

      {/* Thanh filter: trạng thái (segmented) + khoảng ngày */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 md:px-6">
        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Tìm mã phiếu, vật tư, người lập…"
            aria-label="Tìm phiếu đề xuất"
            className="h-8 pl-8 text-sm"
          />
        </div>
        {/* L17: dải tab cuộn ngang trong chính nó, không đẩy tràn cả trang. */}
        <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-0.5">
        <Tabs
          value={urlState.status}
          onValueChange={(v) => void setUrlState({ status: v as typeof urlState.status, page: 1 })}
        >
          <TabsList variant="segmented">
            {["all", ...PR_STATUSES, ...(counts?.completed !== undefined ? ["COMPLETED"] : [])].map((s) => (
              <TabsTrigger key={s} value={s}>
                {/* V4.1 UI-07: nhãn chip lọc từ lib/status.ts (khớp badge danh sách). */}
                {s === "all" ? "Tất cả" : s === "COMPLETED" ? "Hoàn tất" : statusLabel("pr", s)}
                {tabCount(s) !== undefined ? (
                  <span className="ml-1.5 tabular-nums text-zinc-400 dark:text-zinc-500">
                    {formatNumber(tabCount(s))}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="text-zinc-500 dark:text-zinc-400">Từ</span>
            <DateField
              value={urlState.from}
              max={urlState.to || undefined}
              onChange={(v) => void setUrlState({ from: v, page: 1 })}
              className="h-8 text-sm"
              aria-label="Lọc từ ngày"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="text-zinc-500 dark:text-zinc-400">Đến</span>
            <DateField
              value={urlState.to}
              min={urlState.from || undefined}
              onChange={(v) => void setUrlState({ to: v, page: 1 })}
              className="h-8 text-sm"
              aria-label="Lọc đến ngày"
            />
          </label>
          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Xoá lọc
            </Button>
          )}
        </div>
      </div>

      {counts && urlState.status === "SUBMITTED" && (
        <p className="px-4 pb-2 text-sm text-zinc-500 md:px-6">
          Chờ Kho kiểm tồn: <b className="tabular-nums">{counts.bySubmittedStep.SUBMITTED}</b>
          {" · "}Chờ duyệt cuối:{" "}
          <b className="tabular-nums">{counts.bySubmittedStep.DEPT_APPROVED}</b>
        </p>
      )}
      {dateRangeInvalid && (
        <p role="alert" className="px-4 pb-2 text-sm text-red-600 md:px-6">
          Khoảng ngày không hợp lệ: "Từ ngày" đang sau "Đến ngày".
        </p>
      )}

      {/* Nội dung */}
      <div className="flex-1 p-4 md:overflow-hidden">
        {dateRangeInvalid ? null : showError ? (
          <QueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Không tải được danh sách phiếu đề xuất"
          />
        ) : isEmpty ? (
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
      {!isEmpty && !showError && (
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
