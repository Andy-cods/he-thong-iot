"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ItemCreate } from "@iot/shared";
import { ItemForm } from "@/components/items/ItemForm";
import { useCreateItem } from "@/hooks/useItems";

export default function NewItemPage() {
  const router = useRouter();
  const create = useCreateItem();

  return (
    <div className="mx-auto w-full max-w-2xl p-4">
      <header className="mb-4">
        <h1 className="font-heading text-xl font-semibold text-slate-900">
          Thêm vật tư mới
        </h1>
        <p className="text-sm text-slate-600">
          Nhập thông tin cơ bản; Barcode + NCC thêm sau khi tạo.
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
            const id = (res as { data?: { id?: string } }).data?.id;
            router.push(id ? `/items/${id}` : "/items");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </div>
  );
}
