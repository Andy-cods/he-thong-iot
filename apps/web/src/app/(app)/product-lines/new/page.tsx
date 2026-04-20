"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProductLine } from "@/hooks/useProductLines";

export default function ProductLineNewPage() {
  const router = useRouter();
  const createMutation = useCreateProductLine();

  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;

    try {
      const result = await createMutation.mutateAsync({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success(`Đã tạo dòng sản phẩm ${result.data.code}.`);
      router.push(`/product-lines/${result.data.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi không xác định";
      if (msg.includes("DUPLICATE_CODE")) {
        toast.error("Mã dòng sản phẩm đã tồn tại.");
      } else {
        toast.error(`Tạo thất bại: ${msg}`);
      }
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Breadcrumb
        items={[
          { label: "Dòng sản phẩm", href: "/product-lines" },
          { label: "Tạo mới" },
        ]}
      />

      <h1 className="mt-4 text-xl font-semibold text-zinc-900">
        Tạo dòng sản phẩm
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Nhóm nhiều mã Z (BOM template) lại thành 1 dòng sản phẩm để quản lý
        đơn hàng, mua sắm và sản xuất tập trung.
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="code">
            Mã dòng sản phẩm
          </Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="VD: BANG-TAI, CNC-238"
            className="font-mono"
            maxLength={64}
            required
          />
          <p className="text-xs text-zinc-400">
            Tự động viết hoa. Dùng để tìm kiếm nhanh.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">
            Tên dòng sản phẩm
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Băng tải DIPPI"
            maxLength={255}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">
            Mô tả
          </Label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả ngắn về dòng sản phẩm (không bắt buộc)"
            rows={3}
            maxLength={1000}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={createMutation.isPending}
          >
            Huỷ
          </Button>
          <Button
            type="submit"
            disabled={!code.trim() || !name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Đang tạo…" : "Tạo dòng sản phẩm"}
          </Button>
        </div>
      </form>
    </div>
  );
}
