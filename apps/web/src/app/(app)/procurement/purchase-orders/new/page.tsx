"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { POForm } from "@/components/procurement/POForm";
import { useCreatePurchaseOrder } from "@/hooks/usePurchaseOrders";

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const create = useCreatePurchaseOrder();

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
            Tạo PO thủ công
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            V1.2: 1 PO = 1 NCC. Nếu cần N NCC hãy dùng PR + Convert.
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl p-6">
        <POForm
          onSubmit={async (data) => {
            try {
              const res = await create.mutateAsync(data);
              toast.success(`Đã tạo PO ${res.data.poNo}`);
              router.push(`/procurement/purchase-orders/${res.data.id}`);
            } catch (err) {
              toast.error(`Tạo PO thất bại: ${(err as Error).message}`);
            }
          }}
          loading={create.isPending}
        />
      </div>
    </div>
  );
}
