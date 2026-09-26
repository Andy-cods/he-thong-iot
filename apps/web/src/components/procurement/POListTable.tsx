"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-badge";
import { formatDate, formatMoney } from "@/lib/format";
import type { PORow } from "@/hooks/usePurchaseOrders";

export interface POListTableProps {
  rows: PORow[];
  loading?: boolean;
}

/**
 * V4.1 UI-11..14 (Đợt 6C): chuyển sang `ui/data-table` — `<table>` thật nên
 * header thẳng cột ("TỔNG (VND)|DUYỆT", "NHÀ CUNG CẤP|TRẠNG THÁI" hết dính),
 * tiền canh phải tabular-nums, hàng "Cộng trang này", điện thoại dạng thẻ.
 * Danh sách đã phân trang 50 dòng/trang → bỏ virtual scroll.
 */
export function POListTable({ rows, loading }: POListTableProps) {
  const router = useRouter();
  const pageTotal = React.useMemo(
    () => rows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0),
    [rows],
  );

  const columns = React.useMemo<DataTableColumn<PORow>[]>(
    () => [
      {
        id: "poNo",
        header: "Số PO",
        kind: "code",
        mobile: "primary",
        width: 160,
        cell: (r) => (
          <Link
            href={`/procurement/purchase-orders/${r.id}`}
            className="inline-block max-w-[10rem] truncate align-bottom font-mono text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            title={r.poNo}
          >
            {r.poNo}
          </Link>
        ),
        footer: "Cộng trang này",
      },
      {
        id: "supplier",
        header: "Nhà cung cấp",
        mobileLabel: "NCC",
        cell: (r) => {
          const name = r.supplierName ?? r.supplierCode ?? `${r.supplierId.slice(0, 8)}…`;
          return (
            <span className="block max-w-[18rem] truncate" title={name}>
              {name}
            </span>
          );
        },
      },
      {
        id: "total",
        header: "Tổng (VND)",
        kind: "money",
        width: 140,
        cell: (r) => (
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">
            {formatMoney(r.totalAmount, { unit: "none" })}
          </span>
        ),
        footer: formatMoney(pageTotal, { unit: "none" }),
      },
      {
        id: "approval",
        header: "Duyệt",
        kind: "status",
        mobile: "secondary",
        width: 130,
        cell: (r) =>
          r.metadata?.approvalStatus ? (
            <StatusPill domain="poApproval" code={r.metadata.approvalStatus} />
          ) : (
            <span className="text-zinc-400 dark:text-zinc-500">—</span>
          ),
      },
      {
        id: "eta",
        header: "Ngày giao",
        kind: "date",
        width: 110,
        cell: (r) => (r.expectedEta ? formatDate(r.expectedEta, "dd/MM/yyyy") : "—"),
      },
      {
        id: "status",
        header: "Trạng thái",
        kind: "status",
        width: 140,
        cell: (r) => (
          <StatusPill domain="po" code={r.status} dot pulse={r.status === "PARTIAL"} />
        ),
      },
      {
        id: "created",
        header: "Ngày tạo",
        kind: "date",
        width: 110,
        hideBelowLg: true,
        mobile: "hide",
        cell: (r) => formatDate(r.createdAt, "dd/MM/yyyy"),
      },
    ],
    [pageTotal],
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.id}
      loading={loading}
      skeletonRows={8}
      ariaLabel="Danh sách PO"
      minWidth={820}
      className="max-h-full"
      footerLabel="Cộng trang này"
      onRowClick={(r) => router.push(`/procurement/purchase-orders/${r.id}`)}
    />
  );
}
