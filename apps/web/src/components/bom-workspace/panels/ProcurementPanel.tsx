"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { StatusPill } from "@/components/ui/status-badge";
import { usePurchaseRequestsList } from "@/hooks/usePurchaseRequests";
import { usePurchaseOrdersList } from "@/hooks/usePurchaseOrders";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

// V4.1 UI-07: bỏ prStatusToBadge/poStatusToBadge cục bộ ("Đã duyệt" vàng, "Đã huỷ"
// đỏ) — nhãn + tông lấy từ lib/status.ts (domain "pr" / "po").
// V4.1 UI-27: nguồn PR hiển thị tiếng Việt (giá trị API giữ nguyên).
const PR_SOURCE_LABEL: Record<string, string> = {
  MANUAL: "Thủ công",
  SHORTAGE: "Thiếu vật tư",
};

type SubTab = "pr" | "po";

export function ProcurementPanel({
  bomId,
}: {
  bomId: string;
  /** Reserved for future use (vd suggest title); chưa dùng. */
  bomCode?: string;
}) {
  const [subTab, setSubTab] = React.useState<SubTab>("pr");

  const prQuery = usePurchaseRequestsList({
    bomTemplateId: bomId,
    page: 1,
    pageSize: 30,
  });
  const poQuery = usePurchaseOrdersList({
    bomTemplateId: bomId,
    page: 1,
    pageSize: 30,
  });

  const prRows = prQuery.data?.data ?? [];
  const poRows = poQuery.data?.data ?? [];
  // V4.1 UI-05: lỗi API không được hiện "Chưa có PR/PO".
  const prFailed = prQuery.isError && prRows.length === 0;
  const poFailed = poQuery.isError && poRows.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Inline toolbar — sub-tabs + create */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/60">
        <div
          role="tablist"
          aria-label="Chọn PR / PO"
          className="inline-flex items-center rounded-md border border-zinc-200 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {(["pr", "po"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={subTab === k}
              onClick={() => setSubTab(k)}
              className={cn(
                "inline-flex h-6 items-center rounded-sm px-2.5 text-xs font-medium transition-colors",
                subTab === k
                  ? "bg-indigo-50 text-indigo-700 shadow-sm dark:bg-indigo-950/40 dark:text-indigo-400"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50",
              )}
            >
              {k === "pr"
                ? `PR · ${prQuery.isLoading ? "…" : prFailed ? "—" : prRows.length}`
                : `PO · ${poQuery.isLoading ? "…" : poFailed ? "—" : poRows.length}`}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          {subTab === "pr" ? (
            <span>
              {/* V4.1 Q4 — bỏ gợi ý tab "Thiếu vật tư" (đang ẩn). */}
              Tạo PR mới: dùng nút <em className="font-normal">Đặt mua nhanh</em>{" "}
              trên dòng grid hoặc menu <em className="font-normal">Đề xuất vật tư</em>.
            </span>
          ) : (
            <Link
              href={`/procurement/purchase-orders?bomTemplateId=${bomId}`}
              className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Xem toàn cục <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {subTab === "pr" ? (
          prFailed && !prQuery.isLoading ? (
            <QueryError
              compact
              className="m-3"
              error={prQuery.error}
              onRetry={() => void prQuery.refetch()}
              retrying={prQuery.isFetching}
              title="Không tải được danh sách PR"
            />
          ) : (
            <PRTable rows={prRows} loading={prQuery.isLoading} />
          )
        ) : poFailed && !poQuery.isLoading ? (
          <QueryError
            compact
            className="m-3"
            error={poQuery.error}
            onRetry={() => void poQuery.refetch()}
            retrying={poQuery.isFetching}
            title="Không tải được danh sách PO"
          />
        ) : (
          <POTable rows={poRows} loading={poQuery.isLoading} />
        )}
      </div>
    </div>
  );

  function PRTable({
    rows,
    loading,
  }: {
    rows: typeof prRows;
    loading: boolean;
  }) {
    if (loading) {
      return (
        <div className="space-y-1 p-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-xs text-zinc-500 dark:text-zinc-400">
          <Package className="h-5 w-5 text-zinc-300 dark:text-zinc-600" aria-hidden />
          <span>Chưa có đề xuất vật tư (PR) gắn với BOM này.</span>
        </div>
      );
    }
    return (
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm dark:bg-zinc-800/60">
          <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="px-3 py-1.5 text-left font-medium">Mã PR</th>
            <th className="px-3 py-1.5 text-left font-medium">Tiêu đề</th>
            <th className="px-3 py-1.5 text-left font-medium">Nguồn</th>
            <th className="px-3 py-1.5 text-left font-medium">Trạng thái</th>
            <th className="px-3 py-1.5 text-left font-medium">Tạo</th>
            <th className="px-3 py-1.5 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row) => (
            <tr key={row.id} className="h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
              <td className="px-3 font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                {row.code}
              </td>
              <td className="px-3 text-zinc-700 dark:text-zinc-300">
                {row.title ?? <span className="text-zinc-400 dark:text-zinc-500">—</span>}
              </td>
              <td className="px-3 text-xs text-zinc-500 dark:text-zinc-400">
                {PR_SOURCE_LABEL[row.source] ?? row.source}
              </td>
              <td className="px-3">
                <StatusPill domain="pr" code={row.status} dot />
              </td>
              <td className="px-3 text-zinc-500 dark:text-zinc-400">
                {formatDate(row.createdAt, "dd/MM/yyyy")}
              </td>
              <td className="px-1">
                <Link
                  href={`/procurement/purchase-requests/${row.id}`}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-indigo-400"
                  title="Mở chi tiết PR"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function POTable({
    rows,
    loading,
  }: {
    rows: typeof poRows;
    loading: boolean;
  }) {
    if (loading) {
      return (
        <div className="space-y-1 p-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-xs text-zinc-500 dark:text-zinc-400">
          <Package className="h-5 w-5 text-zinc-300 dark:text-zinc-600" aria-hidden />
          <span>Chưa có đơn đặt hàng (PO) gắn với BOM này.</span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            PO thường được sinh từ PR đã APPROVED → CONVERT.
          </span>
        </div>
      );
    }
    return (
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm dark:bg-zinc-800/60">
          <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="px-3 py-1.5 text-left font-medium">Mã PO</th>
            <th className="px-3 py-1.5 text-left font-medium">NCC</th>
            <th className="px-3 py-1.5 text-left font-medium">Trạng thái</th>
            <th className="px-3 py-1.5 text-left font-medium">Ngày dự kiến</th>
            <th className="px-3 py-1.5 text-right font-medium">Giá trị</th>
            <th className="px-3 py-1.5 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row) => (
            <tr key={row.id} className="h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
              <td className="px-3 font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                {row.poNo}
              </td>
              <td className="px-3 text-zinc-700 dark:text-zinc-300">
                {row.supplierName ?? (
                  <span className="text-zinc-400 dark:text-zinc-500">—</span>
                )}
              </td>
              <td className="px-3">
                <StatusPill domain="po" code={row.status} dot />
              </td>
              <td className="px-3 text-zinc-500 dark:text-zinc-400">
                {row.expectedEta
                  ? formatDate(row.expectedEta, "dd/MM/yyyy")
                  : "—"}
              </td>
              {/* V4.1 UI-15: số tiền font thường + tabular-nums (bỏ font-mono). */}
              <td className="px-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                {formatMoney(row.totalAmount, { unit: "none" })}{" "}
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {row.currency}
                </span>
              </td>
              <td className="px-1">
                <Link
                  href={`/procurement/purchase-orders/${row.id}`}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-indigo-400"
                  title="Mở chi tiết PO"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
}

