"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { OrderCreate } from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { OrderForm } from "@/components/orders/OrderForm";
import { useCreateOrder } from "@/hooks/useOrders";

/**
 * V1.2 `/orders/new` — tạo đơn hàng mới.
 * Breadcrumb + h1 + OrderForm full-width max-w-3xl.
 * On success → toast + redirect `/orders/{orderNo}`.
 */
export default function OrderNewPage() {
  const router = useRouter();
  const createOrder = useCreateOrder();

  const handleSubmit = async (data: OrderCreate) => {
    try {
      const res = await createOrder.mutateAsync(data);
      const orderNo = res.data.orderNo;
      toast.success(`Đã tạo đơn hàng ${orderNo}.`);
      router.push(`/orders/${orderNo}`);
    } catch (err) {
      toast.error((err as Error).message ?? "Tạo đơn hàng thất bại");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <Breadcrumb
          items={[
            { label: "Tổng quan", href: "/" },
            { label: "Đơn hàng", href: "/orders" },
            { label: "Tạo mới" },
          ]}
        />
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">
          Tạo đơn hàng mới
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Đơn hàng sẽ ở trạng thái <span className="font-medium">Nháp</span> —
          bạn có thể chỉnh sửa trước khi xác nhận.
        </p>
      </header>

      <div className="flex-1">
        <OrderForm
          mode="create"
          onSubmit={handleSubmit}
          onCancel={() => router.push("/orders")}
          submitting={createOrder.isPending}
        />
      </div>
    </div>
  );
}
