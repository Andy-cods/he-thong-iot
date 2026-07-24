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
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PRListTable } from "@/components/procurement/PRListTable";
import {
  FolderBreadcrumb,
  FolderCard,
  FolderGrid,
  type FolderChip,
} from "@/components/archive/DateFolder";
import { ExportExcelDialog } from "@/components/archive/ExportExcelDialog";
import {
  formatDayFull,
  formatDayNum,
  formatMonthLabel,
  formatMonthShort,
  formatWeekday,
  groupDaysByMonth,
  type DayBucket,
} from "@/lib/date-folders";
import {
  usePurchaseRequestsCalendar,
  usePurchaseRequestsList,
} from "@/hooks/usePurchaseRequests";
import { useSession } from "@/hooks/useSession";
import type { PRFilter } from "@/lib/query-keys";

/**
 * V3.13 — Đề xuất mua vật tư (YCVT/MRF) dạng "thư mục theo ngày".
 *
 * 3 cấp (state trên URL):
 *   - (mặc định)       → lưới thư mục THÁNG
 *   - ?month=YYYY-MM   → lưới thư mục NGÀY
 *   - ?date=YYYY-MM-DD → danh sách phiếu trong ngày (+ filter trạng thái + phân trang)
 * Click 1 phiếu → /procurement/purchase-requests/[id] (đã có sẵn).
 */

const PR_DOT: Record<PRStatus, string> = {
  DRAFT: "bg-zinc-400",
  SUBMITTED: "bg-blue-500",
  APPROVED: "bg-emerald-500",
  CONVERTED: "bg-indigo-500",
  REJECTED: "bg-rose-500",
};

function prStatusChips(statuses: Record<string, number>): FolderChip[] {
  return PR_STATUSES.map((s) => ({
    label: PR_STATUS_LABELS[s],
    count: statuses[s] ?? 0,
    dot: PR_DOT[s],
  }));
}

export function PRTab() {
  const [urlState, setUrlState] = useQueryStates(
    {
      month: parseAsString.withDefault(""),
      date: parseAsString.withDefault(""),
      status: parseAsStringEnum(["all", ...PR_STATUSES]).withDefault("all"),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
      q: parseAsString.withDefault(""),
    },
    { history: "push", shallow: true },
  );
  const { month, date } = urlState;
  const level: "months" | "days" | "slips" = date ? "slips" : month ? "days" : "months";

  // V3.14 — Khoảng ngày mặc định cho dialog xuất Excel, theo cấp drill-down
  // hiện tại. Không dùng new Date() vô tham số (tránh hydration mismatch) —
  // ở cấp "months" để rỗng, dialog tự tính "hôm nay" lúc mở (client-only).
  const exportRange = React.useMemo(() => {
    if (date) return { from: date, to: date };
    if (month) {
      const [y, m] = month.split("-");
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
    }
    return { from: "", to: "" };
  }, [date, month]);

  // ── Cấp thư mục: calendar buckets ──
  const calendar = usePurchaseRequestsCalendar();
  const months = React.useMemo(
    () => groupDaysByMonth((calendar.data?.days ?? []) as DayBucket[]),
    [calendar.data],
  );
  const activeMonth = React.useMemo(
    () => months.find((m) => m.month === month),
    [months, month],
  );

  // ── Cấp phiếu: list theo ngày ──
  const filter: PRFilter = React.useMemo(
    () => ({
      date: date || undefined,
      status:
        urlState.status === "all"
          ? undefined
          : [urlState.status as PRStatus],
      page: urlState.page,
      pageSize: urlState.pageSize,
      q: urlState.q || undefined,
    }),
    [date, urlState.status, urlState.page, urlState.pageSize, urlState.q],
  );
  const query = usePurchaseRequestsList(filter);
  const total = query.data?.meta.total ?? 0;
  const rows = query.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));
  const isEmpty = level === "slips" && !query.isLoading && rows.length === 0;
  const hasFilter = urlState.status !== "all" || urlState.q !== "";

  const session = useSession();
  const roles = session.data?.roles ?? [];
  const canCreateMRF = can(roles, "create", "pr");

  const totalPhieu = calendar.data?.days.reduce((a, d) => a + d.count, 0) ?? 0;

  const crumbs = [
    { label: "Tất cả tháng", href: "/procurement/purchase-requests" },
    ...(month
      ? [{ label: formatMonthShort(month), href: `/procurement/purchase-requests?month=${month}` }]
      : []),
    ...(date ? [{ label: formatDayFull(date) }] : []),
  ];

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
      <header className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 md:px-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="min-w-0">
          {level === "months" ? (
            <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 dark:text-zinc-400">
              <Link href="/" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-50">Tổng quan</Link>
              {" / "}
              <span className="text-zinc-900 dark:text-zinc-50">Đề xuất vật tư</span>
            </nav>
          ) : (
            <FolderBreadcrumb items={crumbs} />
          )}
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {level === "slips"
              ? `Phiếu ngày ${formatDayFull(date)}`
              : level === "days"
                ? formatMonthLabel(month)
                : "Đề xuất mua vật tư (YCVT/MRF)"}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {level === "months"
              ? `${totalPhieu.toLocaleString("vi-VN")} phiếu — lưu trữ theo thư mục ngày`
              : level === "days"
                ? "Chọn một ngày để xem danh sách phiếu."
                : `${total.toLocaleString("vi-VN")} phiếu trong ngày`}
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

      {/* Thanh điều hướng / filter */}
      {level !== "months" && (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 md:px-6 dark:border-zinc-800 dark:bg-zinc-900">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void setUrlState({ month: date ? month : "", date: "", page: 1 })}
            className="text-zinc-600 dark:text-zinc-400"
          >
            ← Quay lại
          </Button>
          {level === "slips" && (
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
          )}
        </div>
      )}

      {/* Nội dung */}
      {level === "slips" ? (
        <div className="flex-1 overflow-hidden p-4">
          {isEmpty ? (
            hasFilter ? (
              <EmptyState
                preset="no-filter-match"
                title="Không có phiếu khớp bộ lọc"
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void setUrlState({ status: "all", q: "", page: 1 })}
                  >
                    Xoá bộ lọc
                  </Button>
                }
              />
            ) : (
              <EmptyState preset="no-bom" title="Không có phiếu nào trong ngày này" />
            )
          ) : (
            <PRListTable rows={rows} loading={query.isLoading} />
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {calendar.isLoading ? (
            <div className="py-20 text-center text-sm text-zinc-500 dark:text-zinc-400">Đang tải…</div>
          ) : level === "months" ? (
            months.length === 0 ? (
              <EmptyState
                preset="no-bom"
                title="Chưa có phiếu đề xuất nào"
                description="Chọn mẫu phiếu ở góc trên để tạo đề xuất mua vật tư gửi Bộ phận Thu mua duyệt."
                actions={canCreateMRF ? createButtons : undefined}
              />
            ) : (
              <FolderGrid>
                {months.map((m) => (
                  <FolderCard
                    key={m.month}
                    href={`/procurement/purchase-requests?month=${m.month}`}
                    title={formatMonthLabel(m.month)}
                    subtitle={`${m.days.length} ngày có phiếu`}
                    count={m.count}
                    chips={prStatusChips(m.statuses)}
                  />
                ))}
              </FolderGrid>
            )
          ) : !activeMonth || activeMonth.days.length === 0 ? (
            <EmptyState preset="no-bom" title="Tháng này không có phiếu" />
          ) : (
            <FolderGrid>
              {activeMonth.days.map((d) => (
                <FolderCard
                  key={d.day}
                  href={`/procurement/purchase-requests?date=${d.day}`}
                  title={formatDayNum(d.day)}
                  subtitle={formatWeekday(d.day)}
                  count={d.count}
                  chips={prStatusChips(d.statuses)}
                />
              ))}
            </FolderGrid>
          )}
        </div>
      )}

      {/* Phân trang chỉ ở cấp phiếu */}
      {level === "slips" && !isEmpty && (
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
