"use client";

import { Breadcrumb } from "@/components/ui/breadcrumb";
import { BomImportWizard } from "@/components/bom-import/BomImportWizard";

/**
 * V2 `/bom/import` — BOM Excel import page.
 * Breadcrumb + title + BomImportWizard full container.
 */
export default function BomImportPage() {
  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <Breadcrumb
          items={[
            { label: "Tổng quan", href: "/" },
            { label: "BOM", href: "/bom" },
            { label: "Nhập Excel" },
          ]}
        />
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Nhập BOM từ Excel
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          3 bước: Tải file · Xem trước & khớp cột · Hoàn tất
        </p>
      </header>

      <div className="flex-1 p-6">
        <div className="mx-auto max-w-5xl">
          <BomImportWizard />
        </div>
      </div>
    </div>
  );
}
