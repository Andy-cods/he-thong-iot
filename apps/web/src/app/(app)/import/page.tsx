"use client";

import Link from "next/link";
import { FileSpreadsheet, Network, Package } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";

/**
 * /import — Trang chọn loại nhập liệu Excel.
 * Thay thế 2 nav item riêng (/items/import và /bom/import) bằng 1 entry point.
 */
export default function ImportSelectorPage() {
  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <Breadcrumb
        items={[
          { label: "Tổng quan", href: "/" },
          { label: "Nhập Excel" },
        ]}
        className="mb-2"
      />
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Nhập dữ liệu từ Excel
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Chọn loại dữ liệu cần nhập vào hệ thống.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/items/import"
          className="group flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-600 group-hover:bg-blue-100">
            <Package className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-semibold text-zinc-900 group-hover:text-blue-700">
              Nhập vật tư
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Upload danh sách SKU, tên, đơn vị, giá từ file .xlsx.
            </p>
          </div>
          <span className="mt-auto text-xs font-medium text-blue-600 group-hover:underline">
            Bắt đầu nhập →
          </span>
        </Link>

        <Link
          href="/bom/import"
          className="group flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:border-purple-300 hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-purple-50 text-purple-600 group-hover:bg-purple-100">
            <Network className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-semibold text-zinc-900 group-hover:text-purple-700">
              Nhập BOM
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Upload cấu trúc Bill of Materials từ file .xlsx nhiều sheet.
            </p>
          </div>
          <span className="mt-auto text-xs font-medium text-purple-600 group-hover:underline">
            Bắt đầu nhập →
          </span>
        </Link>
      </div>

      <div className="mt-6 flex items-start gap-2 rounded-md border border-zinc-100 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
        <FileSpreadsheet className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Hỗ trợ định dạng <strong>.xlsx</strong>. Tải template mẫu tại trang nhập tương ứng.
          Mỗi import tạo job nền — dữ liệu được commit sau khi preview xác nhận.
        </span>
      </div>
    </div>
  );
}
