"use client";

import * as React from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ITEM_TYPE_LABELS, type ItemType } from "@iot/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ItemRow {
  id: string;
  sku: string;
  name: string;
  itemType: ItemType;
  uom: string;
  status: string;
  category: string | null;
  isActive: boolean;
  primaryBarcode: string | null;
  supplierCount: number;
  updatedAt: string | Date;
}

export function ItemListTable({
  rows,
  loading,
}: {
  rows: ItemRow[];
  loading?: boolean;
}) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  });

  return (
    <div
      ref={parentRef}
      className="relative h-[calc(100vh-240px)] w-full overflow-auto rounded border border-slate-200 bg-white"
    >
      <div className="sticky top-0 z-10 grid grid-cols-[140px_minmax(0,1fr)_120px_80px_120px_180px_90px_100px] border-b border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold uppercase text-slate-700">
        <div>SKU</div>
        <div>Tên</div>
        <div>Loại</div>
        <div>UoM</div>
        <div>Nhóm</div>
        <div>Barcode chính</div>
        <div className="text-right">NCC</div>
        <div className="text-right">Trạng thái</div>
      </div>

      {loading && rows.length === 0 && (
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">
          Đang tải…
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">
          Không có dữ liệu.
        </div>
      )}

      <div
        style={{ height: `${virt.getTotalSize()}px` }}
        className="relative w-full"
      >
        {virt.getVirtualItems().map((v) => {
          const row = rows[v.index];
          return (
            <Link
              key={row.id}
              href={`/items/${row.id}`}
              style={{
                transform: `translateY(${v.start}px)`,
                height: `${v.size}px`,
              }}
              className={cn(
                "absolute left-0 top-0 grid w-full grid-cols-[140px_minmax(0,1fr)_120px_80px_120px_180px_90px_100px] items-center border-b border-slate-100 px-3 text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/35",
                v.index % 2 === 1 && "bg-zebra",
              )}
            >
              <div className="font-mono text-xs text-slate-900">{row.sku}</div>
              <div className="truncate text-slate-900">{row.name}</div>
              <div>
                <Badge variant="outline">{ITEM_TYPE_LABELS[row.itemType]}</Badge>
              </div>
              <div className="text-slate-600">{row.uom}</div>
              <div className="truncate text-slate-600">
                {row.category ?? "—"}
              </div>
              <div className="truncate font-mono text-xs text-slate-600">
                {row.primaryBarcode ?? "—"}
              </div>
              <div className="text-right tabular-nums text-slate-600">
                {row.supplierCount}
              </div>
              <div className="text-right">
                {row.isActive ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="danger">Đã xoá</Badge>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
