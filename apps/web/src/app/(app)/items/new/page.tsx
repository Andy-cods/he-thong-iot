"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ItemCreate } from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ItemForm } from "@/components/items/ItemForm";
import { useCreateItem } from "@/hooks/useItems";

/**
 * V2 /items/new — Linear-inspired (design-spec §2.5 + impl-plan §8.T8).
 *
 * Layout:
 * - Breadcrumb: "Dashboard / Vật tư / Tạo mới"
 * - H1 text-xl font-semibold + subtitle text-sm zinc-500
 * - ItemForm spacious (max-w 720 p-6 internal)
 */
export default function NewItemPage() {
  const router = useRouter();
  const create = useCreateItem();

  const breadcrumbItems = [
    { label: "Dashboard", href: "/" },
    { label: "Vật tư", href: "/items" },
    { label: "Tạo mới" },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <Breadcrumb items={breadcrumbItems} className="mb-3" />
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Tạo vật tư mới
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Nhập thông tin cơ bản. Barcode và NCC có thể thêm sau khi tạo.
        </p>
      </header>

      <div className="rounded-md border border-zinc-200 bg-white">
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
    </div>
  );
}
