"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Layers,
  MapPin,
  PackageCheck,
  Tag,
  TriangleAlert,
} from "lucide-react";
import { useItemsList } from "@/hooks/useItems";
import { useLotSerialList } from "@/hooks/useLotSerial";
import { usePurchaseOrdersList } from "@/hooks/usePurchaseOrders";

/**
 * V3 (TASK-20260427-014) — Overview tab "Tổng quan kho".
 *
 * Card grid 4 KPI: SKU · Lot · PO chờ nhận · Lot HOLD. Mỗi card có deep-link
 * sang tab tương ứng. Placeholder banner cho "Vị trí kệ/bin" V2.
 *
 * Reuse existing list hooks với pageSize=1 để chỉ lấy meta.total — nhanh
 * và không phá cache.
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

export function OverviewTab() {
  // Items list: chỉ cần total
  const itemsQuery = useItemsList<{ id: string }>({ page: 1, pageSize: 1 });
  // Lot total (all status)
  const lotsAllQuery = useLotSerialList({ page: 1, pageSize: 1 });
  // Lot HOLD only — số cần kiểm tra
  const lotsHoldQuery = useLotSerialList({
    page: 1,
    pageSize: 1,
    status: "HOLD",
  });
  // PO đang chờ nhận: SENT + PARTIAL
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
        aria-label="Roadmap V2"
        className="rounded-lg border border-dashed border-indigo-200 bg-indigo-50/40 p-4"
      >
        <header className="flex items-center gap-2 text-sm font-medium text-indigo-900">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Vị trí kệ / bin (V2)
        </header>
        <p className="mt-1 text-xs text-indigo-800/80">
          Sắp tới sẽ hiển thị bản đồ kệ — vật tư đang ở kệ nào, số lượng bao
          nhiêu. V1 hiện đang focus lot/serial + PO; vị trí kệ là roadmap V2.
        </p>
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
