"use client";

import * as React from "react";
import Link from "next/link";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Package,
  Plus,
  Truck,
  XCircle,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExportExcelDialog } from "@/components/archive/ExportExcelDialog";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * V3.16 — Yêu cầu vật tư dạng BẢNG PHẲNG.
 *
 * Trước là "thư mục Tháng → Ngày → phiếu" (V3.13); user dùng thử rồi đổi ý,
 * quay về 1 danh sách dài + cột "Ngày tạo" bấm được để sort + bộ lọc khoảng
 * ngày (Từ/Đến) để tra cứu — copy-adapt cấu trúc từ PRTab.tsx (module
 * "Đề xuất vật tư" đã đổi tương tự).
 * Click 1 phiếu → trang chi tiết /material-requests/[id] (đã có sẵn).
 *
 * Scope "mine"/"all" giữ nguyên, áp dụng cho toàn bảng.
 */

type Status = "PENDING" | "PICKING" | "READY" | "DELIVERED" | "CANCELLED";

interface MaterialRequestRow {
  id: string;
  requestNo: string;
  status: Status;
  requestedByName: string | null;
  requestedByUsername: string | null;
  notes: string | null;
  createdAt: string;
  lineCount: number;
}

const STATUS_PILL: Record<Status, { label: string; short: string; cls: string; dot: string; icon: React.ElementType }> = {
  PENDING:   { label: "Chờ chuẩn bị", short: "Chờ",      cls: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800",    dot: "bg-amber-500", icon: Clock        },
  PICKING:   { label: "Đang chuẩn bị", short: "Chuẩn bị", cls: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:ring-blue-800",       dot: "bg-blue-500",  icon: Package      },
  READY:     { label: "Đã sẵn sàng",   short: "Sẵn sàng", cls: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:ring-violet-800", dot: "bg-violet-500", icon: CheckCircle2 },
  DELIVERED: { label: "Đã giao",       short: "Đã giao",  cls: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800", dot: "bg-emerald-500", icon: Truck  },
  CANCELLED: { label: "Đã huỷ",        short: "Huỷ",      cls: "bg-zinc-100 text-zinc-500 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700",      dot: "bg-zinc-400",  icon: XCircle      },
};

interface ListResponse {
  data: MaterialRequestRow[];
  meta: { page: number; pageSize: number; total: number };
}

export default function MaterialRequestsArchivePage() {
  const [urlState, setUrlState] = useQueryStates(
    {
      scope: parseAsStringEnum(["mine", "all"]).withDefault("mine"),
      from: parseAsString.withDefault(""),
      to: parseAsString.withDefault(""),
      sortDir: parseAsStringEnum(["asc", "desc"]).withDefault("desc"),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
    },
    { history: "replace", shallow: true },
  );
  const { scope } = urlState;
  const qc = useQueryClient();

  // V3.16 — Khoảng ngày mặc định cho dialog xuất Excel: theo bộ lọc from/to
  // hiện tại của trang (nếu user đã chọn), else để rỗng (dialog tự tính
  // "hôm nay" lúc mở, client-only, tránh hydration mismatch).
  const exportRange = React.useMemo(
    () => ({ from: urlState.from, to: urlState.to }),
    [urlState.from, urlState.to],
  );

  const listQuery = useQuery<ListResponse>({
    queryKey: [
      "material-requests",
      "list",
      scope,
      urlState.from,
      urlState.to,
      urlState.sortDir,
      urlState.page,
      urlState.pageSize,
    ],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (scope === "mine") p.set("mine", "1");
      if (urlState.from) p.set("from", urlState.from);
      if (urlState.to) p.set("to", urlState.to);
      p.set("sortDir", urlState.sortDir);
      p.set("page", String(urlState.page));
      p.set("pageSize", String(urlState.pageSize));
      const res = await fetch(`/api/material-requests?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  const transition = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: Status }) => {
      const res = await fetch(`/api/material-requests/${id}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? "Transition failed");
      return body;
    },
    onSuccess: (_, { to }) => {
      toast.success(`Đã chuyển sang ${STATUS_PILL[to].label}`);
      qc.invalidateQueries({ queryKey: ["material-requests"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => {
      toast.error((err as Error).message ?? "Lỗi chuyển trạng thái");
    },
  });

  const total = listQuery.data?.meta.total ?? 0;
  const rows = listQuery.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));
  const isEmpty = !listQuery.isLoading && rows.length === 0;
  const hasFilter = urlState.from !== "" || urlState.to !== "";

  const resetFilters = () => {
    void setUrlState({ from: "", to: "", page: 1 });
  };

  return (
    <div className="flex flex-col bg-zinc-50/30 md:h-full md:overflow-hidden dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 md:px-6 md:py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 dark:text-zinc-400">
              <Link href="/" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-50">Tổng quan</Link>
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">›</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">Yêu cầu vật tư</span>
            </nav>
            <h1 className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900 md:text-2xl dark:text-zinc-50">
              <FileText className="h-5 w-5 shrink-0 text-indigo-600 md:h-6 md:w-6 dark:text-indigo-400" aria-hidden />
              <span className="truncate">Yêu cầu vật tư từ kho</span>
            </h1>
            <p className="mt-1 hidden text-sm text-zinc-500 sm:block dark:text-zinc-400">
              <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{total.toLocaleString("vi-VN")}</span>{" "}
              yêu cầu — Engineer tạo yêu cầu, kho chuẩn bị và bàn giao linh kiện.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ExportExcelDialog
              module="material-requests"
              scope={scope}
              defaultFrom={exportRange.from}
              defaultTo={exportRange.to}
            />
            <Button asChild size="sm">
              <Link href="/material-requests/new">
                <Plus className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Tạo yêu cầu mới</span>
                <span className="sm:hidden">Tạo</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Scope toggle + khoảng ngày — áp dụng toàn bảng */}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 md:px-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
          {(["mine", "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => void setUrlState({ scope: v, page: 1 })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                scope === v ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
              )}
            >
              {v === "mine" ? "Của tôi" : "Tất cả"}
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

      <div className="flex-1 overflow-hidden p-4 md:p-6">
        {listQuery.isLoading && rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Đang tải…
          </div>
        ) : isEmpty ? (
          <EmptyRequestsCard scope={scope} hasFilter={hasFilter} onResetFilters={resetFilters} />
        ) : (
          <SlipList
            rows={rows}
            sortDir={urlState.sortDir as "asc" | "desc"}
            onSortDateClick={() =>
              void setUrlState({ sortDir: urlState.sortDir === "asc" ? "desc" : "asc" })
            }
            onTransition={(id, to) => transition.mutate({ id, to })}
            transitioning={transition.isPending}
          />
        )}
      </div>

      {!isEmpty && (
        <footer className="flex h-9 items-center justify-between border-t border-zinc-200 bg-white px-4 text-base dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
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

function EmptyRequestsCard({
  scope,
  hasFilter,
  onResetFilters,
}: {
  scope: "mine" | "all";
  hasFilter: boolean;
  onResetFilters: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center md:p-12 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        <FileText className="h-7 w-7 text-zinc-400 dark:text-zinc-500" aria-hidden />
      </div>
      <h3 className="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        {hasFilter ? "Không có yêu cầu khớp bộ lọc" : "Chưa có yêu cầu nào"}
      </h3>
      <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
        {hasFilter
          ? "Thử điều chỉnh khoảng ngày hoặc xoá bộ lọc."
          : scope === "mine"
            ? "Bạn chưa tạo yêu cầu vật tư nào."
            : "Hệ thống chưa có yêu cầu nào."}
      </p>
      {hasFilter ? (
        <Button variant="ghost" size="sm" className="mt-4" onClick={onResetFilters}>
          Xoá bộ lọc
        </Button>
      ) : (
        <Button asChild size="sm" className="mt-4">
          <Link href="/material-requests/new">
            <Plus className="h-4 w-4" /> Tạo yêu cầu mới
          </Link>
        </Button>
      )}
    </div>
  );
}

interface SlipListProps {
  rows: MaterialRequestRow[];
  sortDir: "asc" | "desc";
  onSortDateClick: () => void;
  onTransition: (id: string, to: Status) => void;
  transitioning: boolean;
}

/**
 * V3.16 — Bảng phẳng (trước là card list trong "thư mục ngày").
 * Cols: Mã yêu cầu | Người yêu cầu | Số dòng | Trạng thái | Ngày tạo
 *       (sort được) | Hành động.
 * Không virtualize: dòng PENDING có 2 nút hành động, PICKING/READY có 1 nút,
 * DELIVERED/CANCELLED không có nút nào → chiều cao dòng co giãn theo nội
 * dung, không hợp với virtualizer (cần estimateSize cố định).
 * Mobile-safe: scroll ngang qua wrapper overflow-auto + min-width thay vì ẩn
 * cột — ẩn cột sẽ mất nút thao tác quan trọng trên màn hình nhỏ.
 */
function SlipList({
  rows,
  sortDir,
  onSortDateClick,
  onTransition,
  transitioning,
}: SlipListProps) {
  const gridCols =
    "grid-cols-[130px_minmax(180px,1fr)_90px_150px_140px_minmax(220px,auto)]";

  return (
    <div
      className="h-full w-full overflow-auto rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      role="region"
      aria-label="Danh sách yêu cầu vật tư"
    >
      <div className="min-w-[910px]">
        <div
          className={cn(
            "sticky top-0 z-sticky grid h-8 items-center border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400",
            gridCols,
          )}
        >
          <div>Mã yêu cầu</div>
          <div>Người yêu cầu</div>
          <div className="text-center">Số dòng</div>
          <div>Trạng thái</div>
          <div>
            <button
              type="button"
              onClick={onSortDateClick}
              className="inline-flex items-center gap-1 uppercase tracking-wide text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Ngày tạo
              {sortDir === "asc" ? (
                <ArrowUp className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ArrowDown className="h-3 w-3" aria-hidden="true" />
              )}
            </button>
          </div>
          <div>Hành động</div>
        </div>

        <div>
          {rows.map((r) => {
            const cfg = STATUS_PILL[r.status];
            const canAct =
              r.status === "PENDING" || r.status === "PICKING" || r.status === "READY";
            return (
              <div
                key={r.id}
                role="row"
                className={cn(
                  "grid items-center gap-y-1.5 border-b border-zinc-100 px-3 py-2.5 text-base text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-800/60",
                  gridCols,
                )}
              >
                <Link
                  href={`/material-requests/${r.id}`}
                  className="truncate font-mono text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                  title={r.requestNo}
                >
                  {r.requestNo}
                </Link>
                <div className="truncate pr-2 text-sm text-zinc-700 dark:text-zinc-300">
                  {r.requestedByName || r.requestedByUsername || "—"}
                </div>
                <div className="text-center font-mono text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {r.lineCount}
                </div>
                <div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                      cfg.cls,
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                    {cfg.label}
                  </span>
                </div>
                <div className="text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
                  {formatDate(r.createdAt, "dd/MM/yyyy HH:mm")}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {r.status === "PENDING" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40"
                      onClick={() => onTransition(r.id, "PICKING")}
                      disabled={transitioning}
                    >
                      <Package className="h-3.5 w-3.5" /> Bắt đầu chuẩn bị
                    </Button>
                  )}
                  {(r.status === "PENDING" || r.status === "PICKING") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950/40"
                      onClick={() => onTransition(r.id, "READY")}
                      disabled={transitioning}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Sẵn sàng
                    </Button>
                  )}
                  {r.status === "READY" && (
                    <Button
                      size="sm"
                      className="h-7 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                      onClick={() => onTransition(r.id, "DELIVERED")}
                      disabled={transitioning}
                    >
                      <Check className="h-3.5 w-3.5" /> Xác nhận đã nhận
                    </Button>
                  )}
                  {!canAct && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
