"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, FileText, ShoppingCart } from "lucide-react";
import { PoCreateWizard } from "@/components/procurement/PoCreateWizard";

/**
 * V3.7.12 — Tạo đơn đặt hàng (PO) — header redesign hiện đại.
 */
export default function NewPurchaseOrderPage() {
  return (
    <div className="flex h-full flex-col overflow-auto bg-gradient-to-br from-zinc-50 to-blue-50/30">
      <header className="border-b border-zinc-200 bg-white px-6 py-5">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-900 hover:underline">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <Link
            href="/sales"
            className="hover:text-zinc-900 hover:underline"
          >
            Thu mua
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <Link
            href="/procurement/purchase-orders"
            className="hover:text-zinc-900 hover:underline"
          >
            Đơn đặt hàng
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="font-medium text-zinc-900">Tạo mới</span>
        </nav>
        <div className="mt-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-200">
              <ShoppingCart className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
                Tạo đơn đặt hàng
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500">
                Wizard 3 bước · chọn nguồn → nhà cung cấp & dòng hàng → điều khoản & duyệt
              </p>
            </div>
          </div>
          <Link
            href="/procurement/purchase-orders"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-600 shadow-sm hover:bg-zinc-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay lại danh sách
          </Link>
        </div>
        {/* Tip banner */}
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-xs text-blue-900">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p>
            <strong>Mẹo:</strong> chọn từ Yêu cầu mua (PR) đã duyệt để pre-fill
            tự động hoặc tạo mới từ đầu. Sau khi gửi PO (status SENT), đơn sẽ
            tự động xuất hiện ở Bộ phận Kho để nhận hàng.
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl p-6">
        <PoCreateWizard />
      </div>
    </div>
  );
}
