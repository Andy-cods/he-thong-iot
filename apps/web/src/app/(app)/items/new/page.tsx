"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ItemCreate } from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ItemForm } from "@/components/items/ItemForm";
import { useCreateItem } from "@/hooks/useItems";

export default function NewItemPage() {
  const router = useRouter();
  const create = useCreateItem();

  const breadcrumbItems = [
    { label: "Trang chủ", href: "/" },
    { label: "Vật tư", href: "/items" },
    { label: "Tạo mới" },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <Breadcrumb items={breadcrumbItems} className="mb-3" />
      <header className="mb-4">
        <h1 className="font-heading text-xl font-semibold text-slate-900">
          Thêm vật tư mới
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Nhập thông tin cơ bản. Barcode và NCC có thể thêm sau khi tạo.
        </p>
      </header>

      <ItemForm
        mode="create"
        submitting={create.isPending}
        onCancel={() => router.push("/items")}
        onSubmit={async (data: ItemCreate) => {
          try {
            const res = await create.mutateAsync(data);
            toast.success(`Đã tạo vật tư ${data.sku}.`);
            const newId = res.data?.id;
            router.push(newId ? `/items/${newId}` : "/items");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </div>
  );
}
