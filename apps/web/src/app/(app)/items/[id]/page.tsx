"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ItemCreate } from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DialogConfirm } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/StatusBadge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { BarcodeList } from "@/components/items/BarcodeList";
import { ItemForm } from "@/components/items/ItemForm";
import {
  useDeleteItem,
  useItem,
  useRestoreItem,
  useUpdateItem,
  type RequestError,
} from "@/hooks/useItems";
import { formatNumber } from "@/lib/format";

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
  updatedAt?: string;
};

/**
 * V2 /items/[id] — Linear-inspired (design-spec §2.5 + impl-plan §8.T8).
 *
 * - Breadcrumb: "Dashboard / Vật tư / {SKU}".
 * - Header: Name text-xl + SKU mono 13px + StatusBadge + DropdownMenu actions
 *   (Nhân bản / Khôi phục / Xoá red). DialogConfirm "XOA".
 * - Tabs V2 underline style (zinc-900 active, border-b-2), 4 sections:
 *   Thông tin / Kho / Tracking / Ảnh.
 * - Content max-w 5xl mx-auto p-6.
 */
export default function ItemDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const { data, isLoading } = useItem(id);
  const update = useUpdateItem(id);
  const del = useDeleteItem();
  const restore = useRestoreItem();

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [tab, setTab] = React.useState<
    "info" | "inventory" | "tracking" | "media"
  >("info");

  const itemData = (data?.data as ItemDetail | undefined) ?? null;

  const breadcrumbItems = [
    { label: "Dashboard", href: "/" },
    { label: "Vật tư", href: "/items" },
    { label: itemData?.sku ?? "Chi tiết" },
  ];

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <div className="mb-3">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="mb-4 flex items-center gap-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-5 w-20 rounded-sm" />
        </div>
        <Skeleton className="mb-3 h-9 w-96" />
        <div className="space-y-3 rounded-md border border-zinc-200 bg-white p-6">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (!itemData) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          preset="error"
          title="Không tìm thấy vật tư"
          description="ID không tồn tại hoặc bạn không có quyền truy cập."
          actions={
            <Button asChild size="sm">
              <Link href="/items">Về danh sách</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const handleCopySku = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(itemData.sku);
      toast.success(`Đã copy ${itemData.sku}`);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <Breadcrumb items={breadcrumbItems} className="mb-3" />

      {/* V2 Header — Name + SKU + Status + Actions */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              {itemData.name}
            </h1>
            <StatusBadge
              status={itemData.isActive ? "active" : "inactive"}
              size="sm"
              label={itemData.isActive ? "Đang dùng" : "Đã xoá"}
            />
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-base text-zinc-500">
            <span className="font-mono text-base tabular-nums text-zinc-700">
              {itemData.sku}
            </span>
            <button
              type="button"
              onClick={handleCopySku}
              aria-label="Copy SKU"
              className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-0"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/items">Về danh sách</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Thao tác khác"
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => toast.info("Nhân bản: sẽ có ở V1.1.")}
              >
                Nhân bản
              </DropdownMenuItem>
              {!itemData.isActive && (
                <DropdownMenuItem
                  onClick={() =>
                    restore.mutate(id, {
                      onSuccess: () => toast.success("Đã khôi phục."),
                      onError: (e) => toast.error((e as Error).message),
                    })
                  }
                >
                  Khôi phục
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="danger"
                onClick={() => setDeleteOpen(true)}
                disabled={!itemData.isActive}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Xoá
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* V2 Tabs — underline style zinc-900 active, 13px */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="inventory">Kho</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
          <TabsTrigger value="media">Ảnh</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="rounded-md border border-zinc-200 bg-white">
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
              onSubmit={async (values) => {
                try {
                  await update.mutateAsync({
                    data: values,
                    baseUpdatedAt: itemData.updatedAt ?? null,
                  });
                  toast.success("Đã cập nhật.");
                } catch (err) {
                  const e = err as RequestError;
                  if (e.status === 409) {
                    toast.error(
                      "Dữ liệu đã bị thay đổi. Tải lại và thử lại.",
                    );
                  } else {
                    toast.error(e.message);
                  }
                }
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="inventory">
          <div className="rounded-md border border-zinc-200 bg-white p-6">
            <h3 className="text-base font-semibold text-zinc-900">
              Tồn kho (V1.1 real)
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Dữ liệu mock — chờ module Inventory ở V1.1.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <MiniStat label="On-hand" value="—" hint="Tồn thực tế" />
              <MiniStat label="Reserved" value="—" hint="Đã giữ cho PO" />
              <MiniStat label="Available" value="—" hint="Khả dụng" />
              <MiniStat
                label="Min stock"
                value={formatNumber(Number(itemData.minStockQty) || 0)}
                hint="Ngưỡng cảnh báo"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tracking">
          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <BarcodeList itemId={id} />
          </div>
        </TabsContent>

        <TabsContent value="media">
          <div className="rounded-md border border-zinc-200 bg-white p-6">
            <EmptyState
              preset="no-data"
              title="Chưa có ảnh / tài liệu"
              description="Upload ảnh sản phẩm, datasheet, drawing sẽ có ở V1.1."
            />
          </div>
        </TabsContent>
      </Tabs>

      <DialogConfirm
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Xoá vật tư ${itemData.sku}?`}
        description="Hành động này sẽ soft-delete. Các BOM/PO đang tham chiếu có thể bị ảnh hưởng."
        confirmText="XOA"
        actionLabel="Xoá vĩnh viễn"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(id, {
            onSuccess: () => {
              toast.success("Đã xoá.");
              router.push("/items");
            },
            onError: (e) => toast.error((e as Error).message),
          })
        }
      />
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-sm text-zinc-500">{hint}</p>}
    </div>
  );
}
