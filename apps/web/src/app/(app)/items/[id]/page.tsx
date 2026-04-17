"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ItemCreate } from "@iot/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarcodeList } from "@/components/items/BarcodeList";
import { ItemForm } from "@/components/items/ItemForm";
import { SupplierList } from "@/components/items/SupplierList";
import {
  useDeleteItem,
  useItem,
  useRestoreItem,
  useUpdateItem,
} from "@/hooks/useItems";

type ItemDetail = {
  id: string;
  sku: string;
  name: string;
  itemType: ItemCreate["itemType"];
  uom: ItemCreate["uom"];
  status: ItemCreate["status"];
  category: string | null;
  description: string | null;
  minStockQty: string;
  reorderQty: string;
  leadTimeDays: number;
  isLotTracked: boolean;
  isSerialTracked: boolean;
  isActive: boolean;
};

export default function ItemDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const { data, isLoading } = useItem(id);
  const update = useUpdateItem(id);
  const del = useDeleteItem();
  const restore = useRestoreItem();

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-slate-500">Đang tải thông tin…</div>
    );
  }
  const itemData = (data?.data as ItemDetail | undefined) ?? null;
  if (!itemData) {
    return (
      <div className="p-6 text-sm text-danger">Không tìm thấy vật tư.</div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <header className="mb-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/items")}
          aria-label="Quay lại"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-heading text-xl font-semibold text-slate-900">
            {itemData.name}
          </h1>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="font-mono">{itemData.sku}</span>
            {itemData.isActive ? (
              <Badge variant="success">Đang dùng</Badge>
            ) : (
              <Badge variant="danger">Đã xoá</Badge>
            )}
          </div>
        </div>
        {itemData.isActive ? (
          <Button
            variant="outline"
            onClick={() => {
              if (!confirm(`Xoá (soft) ${itemData.sku}?`)) return;
              del.mutate(id, {
                onSuccess: () => {
                  toast.success("Đã xoá.");
                  router.push("/items");
                },
                onError: (e) => toast.error((e as Error).message),
              });
            }}
          >
            <Trash2 className="h-4 w-4" />
            Xoá
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              restore.mutate(id, {
                onSuccess: () => toast.success("Đã khôi phục."),
                onError: (e) => toast.error((e as Error).message),
              });
            }}
          >
            Khôi phục
          </Button>
        )}
      </header>

      <Tabs defaultValue="info" className="space-y-3">
        <TabsList>
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="barcodes">Barcode</TabsTrigger>
          <TabsTrigger value="suppliers">Nhà cung cấp</TabsTrigger>
        </TabsList>
        <TabsContent value="info">
          <div className="rounded border border-slate-200 bg-white p-4">
            <ItemForm
              mode="edit"
              submitting={update.isPending}
              defaultValues={{
                sku: itemData.sku,
                name: itemData.name,
                itemType: itemData.itemType,
                uom: itemData.uom,
                status: itemData.status,
                category: itemData.category ?? "",
                description: itemData.description ?? "",
                minStockQty: Number(itemData.minStockQty ?? 0),
                reorderQty: Number(itemData.reorderQty ?? 0),
                leadTimeDays: itemData.leadTimeDays,
                isLotTracked: itemData.isLotTracked,
                isSerialTracked: itemData.isSerialTracked,
              }}
              onCancel={() => router.push("/items")}
              onSubmit={async (data) => {
                try {
                  await update.mutateAsync(data);
                  toast.success("Đã cập nhật.");
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            />
          </div>
        </TabsContent>
        <TabsContent value="barcodes">
          <div className="rounded border border-slate-200 bg-white p-4">
            <BarcodeList itemId={id} />
          </div>
        </TabsContent>
        <TabsContent value="suppliers">
          <div className="rounded border border-slate-200 bg-white p-4">
            <SupplierList itemId={id} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
