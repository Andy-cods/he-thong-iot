"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowDownCircle, ArrowUpCircle, FolderTree, Pencil, Plus } from "lucide-react";
import {
  can,
  finCategoryCreateSchema,
  type FinCategoryCreate,
  type FinDirection,
} from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateFinCategory,
  useFinCategoriesList,
  useUpdateFinCategory,
  type FinCategoryRow,
} from "@/hooks/useFinance";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

/**
 * Tab "Danh mục" — CRUD danh mục thu/chi (`fin_category`). Bám khuôn mẫu
 * `POTab.tsx` (header + breadcrumb) nhưng nội dung là 2 cột Thu/Chi vì danh
 * mục ít record, không cần bảng phân trang (YAGNI — theo plan §E.2).
 */

export function CategoriesTab() {
  const { data: session } = useSession();
  const roles = session?.roles ?? [];
  const canWrite = can(roles, "create", "finance");

  const inQuery = useFinCategoriesList({ direction: "IN" });
  const outQuery = useFinCategoriesList({ direction: "OUT" });

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FinCategoryRow | null>(null);
  const [defaultDirection, setDefaultDirection] = React.useState<FinDirection>("OUT");

  const openCreate = (direction: FinDirection) => {
    setEditing(null);
    setDefaultDirection(direction);
    setDialogOpen(true);
  };
  const openEdit = (row: FinCategoryRow) => {
    setEditing(row);
    setDefaultDirection(row.direction);
    setDialogOpen(true);
  };

  const isLoading = inQuery.isLoading || outQuery.isLoading;

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50/30 dark:bg-zinc-950/30">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Trang chủ", href: "/" },
              { label: "Tài chính" },
              { label: "Danh mục" },
            ]}
          />
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Danh mục thu chi
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Phân loại các khoản thu/chi để lọc và báo cáo dòng tiền
          </p>
        </div>
      </header>

      <div className="flex-1 p-4 md:p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CategoryColumn
              direction="OUT"
              title="Danh mục Chi"
              icon={ArrowUpCircle}
              accent="rose"
              rows={outQuery.data?.data ?? []}
              canWrite={canWrite}
              onCreate={() => openCreate("OUT")}
              onEdit={openEdit}
            />
            <CategoryColumn
              direction="IN"
              title="Danh mục Thu"
              icon={ArrowDownCircle}
              accent="emerald"
              rows={inQuery.data?.data ?? []}
              canWrite={canWrite}
              onCreate={() => openCreate("IN")}
              onEdit={openEdit}
            />
          </div>
        )}
      </div>

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        defaultDirection={defaultDirection}
      />
    </div>
  );
}

function CategoryColumn({
  title,
  icon: Icon,
  accent,
  rows,
  canWrite,
  onCreate,
  onEdit,
}: {
  direction: FinDirection;
  title: string;
  icon: React.ElementType;
  accent: "emerald" | "rose";
  rows: FinCategoryRow[];
  canWrite: boolean;
  onCreate: () => void;
  onEdit: (row: FinCategoryRow) => void;
}) {
  const accentCls =
    accent === "emerald"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
      : "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/60">
        <div className="flex items-center gap-2">
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", accentCls)}>
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {title} <span className="font-normal text-zinc-400 dark:text-zinc-500">({rows.length})</span>
          </p>
        </div>
        {canWrite && (
          <Button size="sm" variant="ghost" onClick={onCreate}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Thêm
          </Button>
        )}
      </header>
      {rows.length === 0 ? (
        <EmptyState
          preset="no-data"
          title="Chưa có danh mục nào"
          description={canWrite ? "Bấm Thêm để tạo danh mục đầu tiên." : undefined}
        />
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {r.name}
                  {!r.isActive && (
                    <span className="ml-2 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      Đã ẩn
                    </span>
                  )}
                </p>
                <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">{r.code}</p>
              </div>
              {canWrite && (
                <Button size="icon-sm" variant="ghost" onClick={() => onEdit(r)} aria-label={`Sửa ${r.name}`}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryFormDialog({
  open,
  onOpenChange,
  editing,
  defaultDirection,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: FinCategoryRow | null;
  defaultDirection: FinDirection;
}) {
  const isEdit = !!editing;
  const createMut = useCreateFinCategory();
  const updateMut = useUpdateFinCategory(editing?.id ?? "__none__");
  const submitting = createMut.isPending || updateMut.isPending;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FinCategoryCreate>({
    resolver: zodResolver(finCategoryCreateSchema),
    defaultValues: {
      code: editing?.code ?? "",
      name: editing?.name ?? "",
      direction: editing?.direction ?? defaultDirection,
      parentId: null,
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        code: editing?.code ?? "",
        name: editing?.name ?? "",
        direction: editing?.direction ?? defaultDirection,
        parentId: null,
      });
    }
  }, [open, editing, defaultDirection, reset]);

  const onSubmit = async (data: FinCategoryCreate) => {
    if (isEdit && editing) {
      await updateMut.mutateAsync({ name: data.name });
    } else {
      await createMut.mutateAsync(data);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-4 w-4" aria-hidden="true" />
            {isEdit ? "Sửa danh mục" : "Thêm danh mục"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3" noValidate>
          {!isEdit && (
            <div>
              <Label htmlFor="cat-code" required>Mã danh mục</Label>
              <Input id="cat-code" {...register("code")} error={!!errors.code} placeholder="VD: CHI_KHAC" className="mt-1 font-mono" />
              {errors.code && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.code.message}</p>}
            </div>
          )}
          <div>
            <Label htmlFor="cat-name" required>Tên danh mục</Label>
            <Input id="cat-name" {...register("name")} error={!!errors.name} placeholder="VD: Chi phí vận chuyển" className="mt-1" />
            {errors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name.message}</p>}
          </div>
          <input type="hidden" {...register("direction")} />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Chiều: <span className="font-semibold">{defaultDirection === "IN" ? "Thu" : "Chi"}</span>
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Đang lưu…" : "Lưu"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
