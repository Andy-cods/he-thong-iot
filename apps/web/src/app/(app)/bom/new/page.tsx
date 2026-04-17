"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { BomTemplateCreate } from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { BomForm } from "@/components/bom/BomForm";
import { useCreateBomTemplate } from "@/hooks/useBom";

/**
 * V2 `/bom/new` — tạo BOM mới.
 * Breadcrumb + h1 + BomForm full-width max-w-3xl.
 * On success → redirect `/bom/{id}` (vào tree editor).
 */
export default function BomNewPage() {
  const router = useRouter();
  const createBom = useCreateBomTemplate();

  const handleSubmit = async (data: BomTemplateCreate) => {
    try {
      const res = await createBom.mutateAsync(data);
      const newId = res.data.id;
      toast.success(`Đã tạo BOM "${data.code}".`);
      router.push(`/bom/${newId}`);
    } catch (err) {
      toast.error((err as Error).message ?? "Tạo BOM thất bại");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <Breadcrumb
          items={[
            { label: "Tổng quan", href: "/" },
            { label: "BOM", href: "/bom" },
            { label: "Tạo mới" },
          ]}
        />
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">
          Tạo BOM mới
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Tạo template công thức · Có thể thêm linh kiện ở bước tiếp theo
        </p>
      </header>

      <div className="flex-1">
        <BomForm
          mode="create"
          onSubmit={handleSubmit}
          onCancel={() => router.push("/bom")}
          submitting={createBom.isPending}
        />
      </div>
    </div>
  );
}
