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
import { PO_STATUSES, PO_STATUS_LABELS, type POStatus } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { POListTable } from "@/components/procurement/POListTable";
import { PoExportDialog } from "@/components/procurement/PoExportDialog";
import { usePurchaseOrdersList } from "@/hooks/usePurchaseOrders";
import type { POFilter } from "@/lib/query-keys";

function fmtVND(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("vi-VN");
}

export function POTab() {
  const [urlState, setUrlState] = useQueryStates(
    {
      status: parseAsStringEnum(["all", ...PO_STATUSES]).withDefault("all"),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
      q: parseAsString.withDefault(""),
      from: parseAsString.withDefault(""),
      to: parseAsString.withDefault(""),
    },
    { history: "replace", shallow: true },
  );

  const filter: POFilter = React.useMemo(
    () => ({
      status:
        urlState.status === "all"
          ? undefined
          : [urlState.status as (typeof PO_STATUSES)[number]],
      page: urlState.page,
      pageSize: urlState.pageSize,
      q: urlState.q || undefined,
      from: urlState.from || undefined,
      to: urlState.to || undefined,
    }),
    [urlState],
  );

  const query = usePurchaseOrdersList(filter);
  const total = query.data?.meta.total ?? 0;
  const rows = query.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));
  const isEmpty = !query.isLoading && rows.length === 0;
  const hasFilter =
    urlState.status !== "all" ||
    urlState.q !== "" ||
    urlState.from !== "" ||
    urlState.to !== "";

  // KPI row (compute from current page — cho UI nhanh; chính xác hơn nên có endpoint thống kê)
  const openCount = rows.filter(
    (r) => r.status === "DRAFT" || r.status === "SENT" || r.status === "PARTIAL",
  ).length;
  const pageSpend = rows.reduce(
    (s, r) => s + (Number(r.totalAmount) || 0),
    0,
  );
  const supplierCount = new Set(rows.map((r) => r.supplierId)).size;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
            <Link href="/" className="hover:text-zinc-900 hover:underline">
              Tổng quan
            </Link>
            {" / "}
            <span className="text-zinc-900">Đơn đặt hàng</span>
          </nav>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Đơn đặt hàng (PO)
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {total.toLocaleString("vi-VN")} PO
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PoExportDialog />
          <Button asChild size="sm">
            <Link href="/procurement/purchase-orders/new">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Tạo PO
            </Link>
          </Button>
        </div>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3 border-b border-zinc-200 bg-white px-6 py-3">
        <div className="rounded-md bg-zinc-50 px-3 py-2">
          <div className="text-xs uppercase text-zinc-500">PO đang mở</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900">
            {openCount}
            <span className="ml-1 text-xs font-normal text-zinc-500">
              / {rows.length} hiển thị
            </span>
          </div>
        </div>
        <div className="rounded-md bg-indigo-50 px-3 py-2">
          <div className="text-xs uppercase text-indigo-700">
            Tổng trang hiện tại
          </div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-indigo-900">
            {fmtVND(pageSpend)} VND
          </div>
        </div>
        <div className="rounded-md bg-emerald-50 px-3 py-2">
          <div className="text-xs uppercase text-emerald-700">Số NCC</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-900">
            {supplierCount}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-6 py-2">
        <div className="flex gap-1">
          {["all", ...PO_STATUSES].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                void setUrlState({ status: s as typeof urlState.status, page: 1 })
              }
              className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
                urlState.status === s
                  ? "bg-indigo-100 text-indigo-700"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {s === "all" ? "Tất cả" : PO_STATUS_LABELS[s as POStatus]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            size="sm"
            placeholder="Tìm theo mã PO / NCC..."
            value={urlState.q}
            onChange={(e) =>
              void setUrlState({ q: e.target.value, page: 1 })
            }
            className="h-7 w-48"
          />
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            Từ:
            <Input
              type="date"
              size="sm"
              value={urlState.from}
              onChange={(e) =>
                void setUrlState({ from: e.target.value, page: 1 })
              }
              className="h-7 w-36"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            Đến:
            <Input
              type="date"
              size="sm"
              value={urlState.to}
              onChange={(e) =>
                void setUrlState({ to: e.target.value, page: 1 })
              }
              className="h-7 w-36"
            />
          </label>
          {hasFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void setUrlState({
                  status: "all",
                  q: "",
                  from: "",
                  to: "",
                  page: 1,
                })
              }
            >
              Xoá lọc
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        {isEmpty ? (
          hasFilter ? (
            <EmptyState
              preset="no-filter-match"
              title="Không có PO khớp bộ lọc"
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void setUrlState({
                      status: "all",
                      q: "",
                      from: "",
                      to: "",
                      page: 1,
                    })
                  }
                >
                  Xoá bộ lọc
                </Button>
              }
            />
          ) : (
            <EmptyState
              preset="no-bom"
              title="Chưa có PO nào"
              description="Tạo PO thủ công hoặc convert từ PR APPROVED."
              actions={
                <Button asChild size="sm">
                  <Link href="/procurement/purchase-orders/new">Tạo PO</Link>
                </Button>
              }
            />
          )
        ) : (
          <POListTable rows={rows} loading={query.isLoading} />
        )}
      </div>

      <footer className="flex h-9 items-center justify-between border-t border-zinc-200 bg-white px-4 text-base">
        <div className="text-zinc-600 tabular-nums">
          Trang {urlState.page} / {pageCount}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={urlState.page <= 1}
            onClick={() =>
              void setUrlState({ page: Math.max(1, urlState.page - 1) })
            }
          >
            ‹
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={urlState.page >= pageCount}
            onClick={() =>
              void setUrlState({ page: Math.min(pageCount, urlState.page + 1) })
            }
          >
            ›
          </Button>
        </div>
      </footer>
    </div>
  );
}
