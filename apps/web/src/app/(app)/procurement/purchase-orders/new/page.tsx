"use client";

import * as React from "react";
import Link from "next/link";
import { PoCreateWizard } from "@/components/procurement/PoCreateWizard";

export default function NewPurchaseOrderPage() {
  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
            <Link
              href="/procurement/purchase-orders"
              className="hover:text-zinc-900 hover:underline"
            >
              Đơn đặt hàng
            </Link>
            {" / "}
            <span className="text-zinc-900">Tạo mới</span>
          </nav>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Tạo đơn đặt hàng
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Wizard 3 bước: chọn nguồn → NCC & dòng hàng → điều khoản & duyệt.
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl p-6">
        <PoCreateWizard />
      </div>
    </div>
  );
}
