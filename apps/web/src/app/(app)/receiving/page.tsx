"use client";

import * as React from "react";
import Link from "next/link";
import {
  ExternalLink,
  Loader2,
  Package,
  Smartphone,
  Truck,
} from "lucide-react";
import { EtaProgressBar } from "@/components/receiving/EtaProgressBar";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { usePurchaseOrdersList, type PORow } from "@/hooks/usePurchaseOrders";

export const dynamic = "force-dynamic";

/**
 * V1.8 Batch 6 — Receiving hub wired vào backend thật.
 *
 * Fetch `/api/purchase-orders?status=SENT&status=PARTIAL` (PO đã gửi nhưng
 * chưa nhận đủ). Empty state hiển thị hướng dẫn, KHÔNG còn demo hardcode.
 *
 * Mỗi card:
 *   - PO code + supplier name
 *   - Progress bar (orderedQty vs receivedQty trên tất cả lines — lấy từ
 *     `totalAmount` không dùng được, cần sum lines nên tạm hiển thị theo
 *     `status` + ETA. Khi click → `/receiving/[poId]` detail form có qty
 *     chi tiết).
 *   - 2 button: "Bắt đầu nhận" (desktop form) + "Mở PWA" (tablet scan).
 */

// NOTE: API `/api/purchase-orders` chưa trả sum qty — tạm dùng status + ETA.
// Page detail `/receiving/[poId]` sẽ load `/api/po/[id]` có qty thật.

function supplierLabel(po: PORow): string {
  return po.supplierName ?? po.supplierCode ?? "Nhà cung cấp chưa gán";
}

export default function ReceivingHubPage() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    usePurchaseOrdersList({
      status: ["SENT", "PARTIAL"],
      page: 1,
      pageSize: 50,
    });

  const rows = data?.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
          <Truck className="h-5 w-5 text-zinc-500" aria-hidden="true" />
          Nhận hàng
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          Danh sách PO đang chờ nhận (SENT + PARTIAL). Click một PO để bắt đầu
          ghi nhận hoặc mở PWA trên tablet để quét barcode.
        </p>
      </section>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white py-12 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Đang tải danh sách PO…
        </div>
      ) : isError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Không tải được PO.</p>
          <p className="mt-1 text-xs">{(error as Error)?.message}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 inline-flex h-8 items-center gap-1 rounded-md border border-red-300 bg-white px-3 text-xs font-medium text-red-800 hover:bg-red-100"
          >
            Thử lại
          </button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <section
          aria-label="Danh sách PO đang chờ nhận"
          className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
        >
          {rows.map((po) => (
            <POCard key={po.id} po={po} />
          ))}
        </section>
      )}

      <section className="rounded-md border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
        <h2 className="font-semibold">Mẹo dùng trên tablet</h2>
        <p className="mt-1 text-xs text-indigo-800">
          Operator mở trực tiếp URL{" "}
          <code className="rounded bg-white/60 px-1 font-mono text-xs">
            /pwa/receive/&lt;poId&gt;
          </code>{" "}
          trên tablet để quét barcode lô hàng.
        </p>
        {isFetching ? (
          <p className="mt-2 text-xs text-indigo-700">Đang đồng bộ danh sách…</p>
        ) : null}
      </section>
    </div>
  );
}

function POCard({ po }: { po: PORow }) {
  // Ordered/received tổng chưa có trong list API — hiển thị theo status.
  // Detail page `/receiving/[poId]` sẽ load qty chính xác.
  return (
    <article
      className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300"
      data-status={po.status}
    >
      <header>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Package
              className="h-4 w-4 shrink-0 text-zinc-500"
              aria-hidden="true"
            />
            <span className="truncate font-mono text-sm font-semibold text-zinc-900">
              {po.poNo}
            </span>
          </div>
          <StatusBadge
            status={po.status === "SENT" ? "pending" : "partial"}
            size="sm"
          />
        </div>
        <p className="mt-1 truncate text-base font-medium text-zinc-900">
          {supplierLabel(po)}
        </p>
        <p className="text-xs text-zinc-500">
          Dự kiến giao: {po.expectedEta ?? "Chưa có"} · Ngày đặt:{" "}
          {po.orderDate}
        </p>
      </header>

      <EtaProgressBar
        etaDate={po.expectedEta ?? null}
        orderedQty={1}
        receivedQty={po.status === "PARTIAL" ? 0.5 : 0}
      />

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        <Link
          href={`/receiving/${po.id}`}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Truck className="h-3.5 w-3.5" aria-hidden="true" />
          Bắt đầu nhận
        </Link>
        <Link
          href={`/pwa/receive/${po.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          <Smartphone className="h-3 w-3" aria-hidden="true" />
          Mở PWA (tablet)
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-white p-8 text-center">
      <Truck
        className="mx-auto h-8 w-8 text-zinc-400"
        aria-hidden="true"
      />
      <h2 className="mt-3 text-sm font-semibold text-zinc-900">
        Không có PO đang chờ nhận
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        Chỉ PO status SENT hoặc PARTIAL mới xuất hiện ở đây. Tạo PO ở{" "}
        <Link href="/purchase-orders" className="text-indigo-600 hover:underline">
          Mua hàng
        </Link>{" "}
        hoặc mở PWA demo để test:
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <Link
          href="/pwa/receive/demo"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <Package className="h-3 w-3" aria-hidden="true" />
          PWA demo
        </Link>
      </div>
    </div>
  );
}
