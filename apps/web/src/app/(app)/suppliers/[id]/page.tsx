"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { SupplierUpdate } from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DialogConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { SupplierForm } from "@/components/suppliers/SupplierForm";
import {
  useDeleteSupplier,
  useSupplier,
  useUpdateSupplier,
} from "@/hooks/useSuppliers";

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();

  const query = useSupplier(id || null);
  const update = useUpdateSupplier(id);
  const del = useDeleteSupplier();

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"info" | "items">("info");

  if (query.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const supplier = query.data?.data;
  if (!supplier) {
    return (
      <div className="p-4">
        <EmptyState
          preset="error"
          title="Không tìm thấy nhà cung cấp"
          description="Liên kết có thể đã bị xoá hoặc không đúng."
          actions={
            <Button variant="outline" onClick={() => router.push("/suppliers")}>
              Về danh sách
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <Breadcrumb
        items={[
          { label: "Trang chủ", href: "/" },
          { label: "Nhà cung cấp", href: "/suppliers" },
          { label: supplier.code },
        ]}
        className="mb-3"
      />

      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-xl font-semibold text-slate-900">
              {supplier.name}
            </h1>
            <StatusBadge
              status={supplier.isActive ? "active" : "inactive"}
              size="sm"
            />
          </div>
          <p className="mt-1 font-mono text-sm text-slate-500">
            {supplier.code}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setDeleteOpen(true)}
          disabled={!supplier.isActive}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {supplier.isActive ? "Ngưng hoạt động" : "Đã ngưng"}
        </Button>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="items">Vật tư cung cấp</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <SupplierForm
            defaultValues={{
              code: supplier.code,
              name: supplier.name,
              contactName: supplier.contactName,
              phone: supplier.phone,
              email: supplier.email,
              address: supplier.address,
              taxCode: supplier.taxCode,
            }}
            submitting={update.isPending}
            onSubmit={async (data) => {
              try {
                // Code immutable sau create — không gửi lên.
                const patch: SupplierUpdate = {
                  name: data.name,
                  contactName: data.contactName,
                  phone: data.phone,
                  email: data.email,
                  address: data.address,
                  taxCode: data.taxCode,
                };
                await update.mutateAsync(patch);
                toast.success("Đã cập nhật NCC.");
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          />
        </TabsContent>

        <TabsContent value="items">
          <EmptyState
            preset="no-data"
            title="Chưa có vật tư nào gắn với NCC này"
            description="Gắn vật tư từ trang chi tiết vật tư → tab 'Nhà cung cấp'. Màn hình tổng hợp 'Item của NCC' sẽ có ở V1.1."
          />
        </TabsContent>
      </Tabs>

      <DialogConfirm
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Ngưng hoạt động NCC "${supplier.code}"?`}
        description="NCC sẽ bị ẩn khỏi danh sách mặc định. Có thể khôi phục bằng cách bật lại isActive qua API hoặc admin UI (V1.1)."
        actionLabel="Ngưng hoạt động"
        loading={del.isPending}
        onConfirm={async () => {
          try {
            await del.mutateAsync(supplier.id);
            toast.success(`Đã ngưng NCC ${supplier.code}.`);
            setDeleteOpen(false);
            router.push("/suppliers");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </div>
  );
}
