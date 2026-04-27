"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Layers,
  PackageCheck,
  Search,
  Tag,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useItemsList } from "@/hooks/useItems";
import {
  useInventoryBalance,
  type InventoryBalanceRow,
} from "@/hooks/useInventory";
import { useLotSerialList } from "@/hooks/useLotSerial";
import { usePurchaseOrdersList } from "@/hooks/usePurchaseOrders";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * V3 (TASK-20260427-014) — Overview tab "Tổng quan kho".
 * V3.1 (TASK-20260427-017) — Bổ sung bảng "Cân đối kho theo SKU"
 *   (on_hand / reserved / available / hold) trả lời câu hỏi "tồn 6, BOM cần 3
 *   chưa SX → hệ thống đã giữ chỗ".
 */

interface KpiRow {
  key: string;
  label: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  tone: "indigo" | "emerald" | "amber" | "rose";
}

const TONE_CLASS: Record<KpiRow["tone"], string> = {
  indigo: "border-indigo-200 bg-indigo-50/40 text-indigo-700",
  emerald: "border-emerald-200 bg-emerald-50/40 text-emerald-700",
  amber: "border-amber-200 bg-amber-50/40 text-amber-700",
  rose: "border-rose-200 bg-rose-50/40 text-rose-700",
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("vi-VN");
}

type StockStatus = "EMPTY" | "LOW" | "OK";

function deriveStatus(row: InventoryBalanceRow): StockStatus {
  if (row.available <= 0) return "EMPTY";
  if (row.minStockQty > 0 && row.available < row.minStockQty) return "LOW";
  return "OK";
}

function StockBadge({ status }: { status: StockStatus }) {
  if (status === "EMPTY")
    return (
      <Badge variant="danger" size="sm">
        Hết
      </Badge>
    );
  if (status === "LOW")
    return (
      <Badge variant="warning" size="sm">
        Thiếu
      </Badge>
    );
  return (
    <Badge variant="success" size="sm">
      Đủ
    </Badge>
  );
}

export function OverviewTab() {
  // KPI cards — chỉ cần meta total
  const itemsQuery = useItemsList<{ id: string }>({ page: 1, pageSize: 1 });
  const lotsAllQuery = useLotSerialList({ page: 1, pageSize: 1 });
  const lotsHoldQuery = useLotSerialList({
    page: 1,
    pageSize: 1,
    status: "HOLD",
  });
  const sentQuery = usePurchaseOrdersList({
    page: 1,
    pageSize: 1,
    status: ["SENT"],
  });
  const partialQuery = usePurchaseOrdersList({
    page: 1,
    pageSize: 1,
    status: ["PARTIAL"],
  });

  const skuTotal = itemsQuery.data?.meta?.total ?? null;
  const lotTotal = lotsAllQuery.data?.meta?.total ?? null;
  const lotHold = lotsHoldQuery.data?.meta?.total ?? null;
  const poPending =
    (sentQuery.data?.meta?.total ?? 0) +
    (partialQuery.data?.meta?.total ?? 0);

  const cards: KpiRow[] = [
    {
      key: "sku",
      label: "Tổng SKU",
      value: fmt(skuTotal),
      description: "Vật tư đang quản lý",
      icon: Tag,
      href: "/warehouse?tab=items",
      tone: "indigo",
    },
    {
      key: "lots",
      label: "Tổng lô",
      value: fmt(lotTotal),
      description: "Lot/Serial đã ghi nhận",
      icon: Layers,
      href: "/warehouse?tab=lot-serial",
      tone: "emerald",
    },
    {
      key: "po",
      label: "PO chờ nhận",
      value: fmt(poPending),
      description: "SENT + PARTIAL",
      icon: PackageCheck,
      href: "/warehouse?tab=receiving",
      tone: "amber",
    },
    {
      key: "hold",
      label: "Lot đang HOLD",
      value: fmt(lotHold),
      description: "Cần kiểm tra QC",
      icon: TriangleAlert,
      href: "/warehouse?tab=lot-serial&status=HOLD",
      tone: "rose",
    },
  ];

  // ----- Bảng cân đối kho -----
  const [search, setSearch] = React.useState("");
  const [onlyShortage, setOnlyShortage] = React.useState(false);

  const balanceQuery = useInventoryBalance({
    page: 1,
    pageSize: 200,
    hasLotOnly: false,
  });
  const allRows: InventoryBalanceRow[] = balanceQuery.data?.data ?? [];

  const filteredRows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (needle) {
        const hay = `${r.sku} ${r.name}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (onlyShortage) {
        const s = deriveStatus(r);
        if (s === "OK") return false;
      }
      return true;
    });
  }, [allRows, search, onlyShortage]);

  return (
    <div className="flex flex-col gap-5 p-6">
      <section
        aria-label="KPI tổng quan kho"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.key}
              href={c.href}
              className={`group relative flex flex-col gap-2 rounded-lg border bg-white p-4 transition-colors hover:border-zinc-300 hover:shadow-sm`}
            >
              <span
                className={`inline-flex h-9 w-9 items-center justify-center rounded-md border ${TONE_CLASS[c.tone]}`}
                aria-hidden="true"
              >
                <Icon className="h-4 w-4" />
              </span>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {c.label}
              </p>
              <p className="text-2xl font-semibold tabular-nums text-zinc-900">
                {c.value}
              </p>
              <p className="text-xs text-zinc-500">{c.description}</p>
              <ArrowRight
                className="absolute right-3 top-3 h-3.5 w-3.5 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-600"
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </section>

      <section
        aria-label="Cân đối kho theo SKU"
        className="rounded-lg border border-zinc-200 bg-white"
      >
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">
              Cân đối kho theo SKU
            </h2>
            <p className="text-[11px] text-zinc-500">
              <span className="font-medium text-zinc-700">Available</span> ={" "}
              <span className="font-medium">On-hand</span> −{" "}
              <span className="font-medium text-amber-700">Reserved</span>.
              Reserved = số đã giữ chỗ cho BOM/đơn chưa sản xuất.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-60">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                aria-hidden
              />
              <Input
                placeholder="Tìm SKU, tên…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-7 text-xs"
              />
            </div>
            <button
              type="button"
              onClick={() => setOnlyShortage((v) => !v)}
              className={cn(
                "h-7 rounded-md border px-2 text-[11px] font-medium transition-colors",
                onlyShortage
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
              )}
            >
              Chỉ thiếu / hết
            </button>
          </div>
        </header>

        <div className="max-h-[420px] overflow-auto">
          {balanceQuery.isLoading ? (
            <div className="py-10 text-center text-xs text-zinc-500">
              Đang tải số dư kho…
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500">
              {search || onlyShortage
                ? "Không có SKU khớp bộ lọc."
                : "Chưa có lot nào trong kho."}
            </div>
          ) : (
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-50 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                <tr className="h-8">
                  <th className="border-b border-zinc-200 px-3 text-left">
                    SKU
                  </th>
                  <th className="border-b border-zinc-200 px-3 text-left">
                    Tên
                  </th>
                  <th className="border-b border-zinc-200 px-3 text-center">
                    Đơn vị
                  </th>
                  <th className="border-b border-zinc-200 px-3 text-right">
                    On-hand
                  </th>
                  <th
                    className="border-b border-zinc-200 px-3 text-right"
                    title="Đã giữ chỗ cho BOM/đơn chưa sản xuất"
                  >
                    Reserved
                  </th>
                  <th className="border-b border-zinc-200 px-3 text-right">
                    Available
                  </th>
                  <th
                    className="border-b border-zinc-200 px-3 text-right"
                    title="Lot đang HOLD chờ QC"
                  >
                    Hold (QC)
                  </th>
                  <th className="border-b border-zinc-200 px-3 text-center">
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const status = deriveStatus(r);
                  return (
                    <tr
                      key={r.itemId}
                      className="border-b border-zinc-100 transition-colors hover:bg-zinc-50"
                      title={
                        r.reserved > 0
                          ? `Reserved = đã giữ chỗ cho BOM/đơn chưa sản xuất (${formatNumber(r.reserved)} ${r.uom})`
                          : undefined
                      }
                    >
                      <td className="px-3 py-2 font-mono text-[12px] font-medium text-zinc-900">
                        {r.sku}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-zinc-700">
                        {r.name}
                      </td>
                      <td className="px-3 py-2 text-center text-[11px] text-zinc-500">
                        {r.uom}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[12px] tabular-nums text-zinc-900">
                        {formatNumber(r.onHand)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono text-[12px] tabular-nums",
                          r.reserved > 0
                            ? "text-amber-700"
                            : "text-zinc-300",
                        )}
                      >
                        {r.reserved > 0 ? formatNumber(r.reserved) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono text-[12px] tabular-nums font-semibold",
                          status === "EMPTY"
                            ? "text-rose-700"
                            : status === "LOW"
                              ? "text-amber-700"
                              : "text-emerald-700",
                        )}
                      >
                        {formatNumber(r.available)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono text-[12px] tabular-nums",
                          r.holdQty > 0 ? "text-rose-700" : "text-zinc-300",
                        )}
                      >
                        {r.holdQty > 0 ? formatNumber(r.holdQty) : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StockBadge status={status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-zinc-100 px-4 py-2 text-[11px] text-zinc-500">
          <span>
            Hiển thị {filteredRows.length.toLocaleString("vi-VN")} /{" "}
            {allRows.length.toLocaleString("vi-VN")} SKU
          </span>
          {balanceQuery.data?.meta &&
          balanceQuery.data.meta.total > allRows.length ? (
            <span className="text-amber-700">
              Còn {balanceQuery.data.meta.total - allRows.length} SKU chưa
              hiển thị (giới hạn 200/trang)
            </span>
          ) : (
            <Link
              href="/warehouse?tab=items"
              className="text-indigo-600 hover:underline"
            >
              Xem tất cả vật tư →
            </Link>
          )}
        </footer>
      </section>

      <section
        aria-label="Hành động nhanh"
        className="rounded-lg border border-zinc-200 bg-white p-4"
      >
        <h2 className="text-sm font-semibold text-zinc-900">
          Hành động nhanh
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Link
            href="/warehouse?tab=items"
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <span className="block font-medium text-zinc-900">
              Quản lý vật tư
            </span>
            <span className="text-zinc-500">
              SKU, đơn vị, tracking, supplier
            </span>
          </Link>
          <Link
            href="/warehouse?tab=lot-serial"
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <span className="block font-medium text-zinc-900">
              Theo dõi lô / serial
            </span>
            <span className="text-zinc-500">Hold / release · NSX / HSD</span>
          </Link>
          <Link
            href="/warehouse?tab=receiving"
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <span className="block font-medium text-zinc-900">
              Duyệt nhận hàng
            </span>
            <span className="text-zinc-500">Approve PO khi đủ 95%+</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
