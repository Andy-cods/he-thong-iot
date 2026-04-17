"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SupplierCreate } from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { SupplierForm } from "@/components/suppliers/SupplierForm";
import { useCreateSupplier } from "@/hooks/useSuppliers";

export default function NewSupplierPage() {
  const router = useRouter();
  const create = useCreateSupplier();

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <Breadcrumb
        items={[
          { label: "Trang chủ", href: "/" },
          { label: "Nhà cung cấp", href: "/suppliers" },
          { label: "Tạo mới" },
        ]}
        className="mb-3"
      />
      <header className="mb-4">
        <h1 className="font-heading text-xl font-semibold text-slate-900">
          Thêm nhà cung cấp
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Nhập thông tin cơ bản. Danh sách vật tư cung cấp gắn sau trong trang
          chi tiết.
        </p>
      </header>

      <SupplierForm
        submitting={create.isPending}
        onCancel={() => router.push("/suppliers")}
        onSubmit={async (data: SupplierCreate) => {
          try {
            const res = await create.mutateAsync(data);
            toast.success(`Đã tạo NCC ${data.code}.`);
            const newId = res.data?.id;
            router.push(newId ? `/suppliers/${newId}` : "/suppliers");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </div>
  );
}
