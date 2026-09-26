"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";
import { NO_LINE_LABEL } from "@/lib/pr-display-label";
import type { PRRow } from "@/hooks/usePurchaseRequests";

export interface PRListTableProps {
  rows: PRRow[];
  loading?: boolean;
  /** V3.16 — cột "Ngày tạo" sort được (bảng phẳng thay thư mục). */
  sortDir?: "asc" | "desc";
  /** Bấm header "Ngày tạo" để đổi chiều sort. Omit → header là text tĩnh. */
  onSortDateClick?: () => void;
}

/** V3.16 (mục 1) — ưu tiên nhãn vật tư tự sinh (mua CÁI GÌ), fallback tiêu đề. */
function prLabel(row: PRRow): string | null {
  return row.displayLabel && row.displayLabel !== NO_LINE_LABEL
    ? row.displayLabel
    : (row.title ?? null);
}

/**
 * V4.1 UI-11..14 (Đợt 6C): chuyển sang `ui/data-table` — header thẳng cột,
 * mã truncate + title, điện thoại dạng thẻ (mã + trạng thái, tiêu đề, nguồn, ngày).
 * Giữ sort "Ngày tạo" (V3.16) qua nút ở header. Danh sách phân trang 50 → bỏ virtual.
 */
export function PRListTable({ rows, loading, sortDir, onSortDateClick }: PRListTableProps) {
  const router = useRouter();

  const columns = React.useMemo<DataTableColumn<PRRow>[]>(
    () => [
      {
        id: "code",
        header: "Mã PR",
        kind: "code",
        mobile: "primary",
        width: 150,
        cell: (r) => (
          <Link
            href={`/procurement/purchase-requests/${r.id}`}
            className="inline-block max-w-[10rem] truncate align-bottom font-mono text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            title={r.code}
          >
            {r.code}
          </Link>
        ),
      },
      {
        id: "title",
        header: "Tiêu đề",
        mobileLabel: "Nội dung",
        cell: (r) => {
          const label = prLabel(r);
          return label ? (
            <span className="block max-w-[28rem] truncate" title={label}>
              {label}
            </span>
          ) : (
            <span className="text-zinc-400 dark:text-zinc-500">—</span>
          );
        },
      },
      {
        id: "source",
        header: "Nguồn",
        width: 110,
        // V4.1 UI-27: "Shortage" → tiếng Việt.
        cell: (r) => (
          <span className="text-zinc-600 dark:text-zinc-400">
            {r.source === "SHORTAGE" ? "Thiếu hàng" : "Thủ công"}
          </span>
        ),
      },
      {
        id: "status",
        header: "Trạng thái",
        kind: "status",
        width: 140,
        cell: (r) => <StatusPill domain="pr" code={r.status} />,
      },
      {
        id: "created",
        header: onSortDateClick ? (
          <button
            type="button"
            onClick={onSortDateClick}
            className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-zinc-800 dark:hover:text-zinc-200"
            aria-label={`Sắp xếp theo ngày tạo (${sortDir === "asc" ? "cũ → mới" : "mới → cũ"})`}
          >
            Ngày tạo
            {sortDir === "asc" ? (
              <ArrowUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-3 w-3" aria-hidden="true" />
            )}
          </button>
        ) : (
          "Ngày tạo"
        ),
        mobileLabel: "Ngày tạo",
        kind: "date",
        width: 120,
        cell: (r) => formatDate(r.createdAt, "dd/MM/yyyy"),
      },
    ],
    [onSortDateClick, sortDir],
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.id}
      loading={loading}
      skeletonRows={10}
      dense
      ariaLabel="Danh sách PR"
      minWidth={680}
      className="max-h-full"
      onRowClick={(r) => router.push(`/procurement/purchase-requests/${r.id}`)}
    />
  );
}
