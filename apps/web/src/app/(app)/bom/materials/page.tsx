"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MATERIAL_CATEGORIES } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateMaterial,
  useDeactivateMaterial,
  useMaterialsList,
  useUpdateMaterial,
  type MaterialRow,
} from "@/hooks/useMasterData";
import { cn } from "@/lib/utils";

/**
 * /admin/materials — V2.0 Sprint 5 admin CRUD master vật liệu.
 *
 * Sections:
 *   1. Breadcrumb + header + nút "Thêm vật liệu"
 *   2. Filter bar: search + category dropdown + active toggle
 *   3. Table list (code · name · category · giá/kg · density · trạng thái · actions)
 *   4. Modal create/edit (Dialog) với form Zod-validated
 *
 * Quyền: chỉ admin (API guard requireSession(req, "admin")).
 */

export default function AdminMaterialsPage() {
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");
  const [showInactive, setShowInactive] = React.useState(false);
  const [editing, setEditing] = React.useState<MaterialRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  const list = useMaterialsList({
    q: q || undefined,
    category: category !== "all" ? category : undefined,
    isActive: showInactive ? undefined : true,
    sort: "code",
    order: "asc",
    page: 1,
    pageSize: 100,
  });

  const rows = list.data?.data ?? [];
  const total = list.data?.pagination.total ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs text-zinc-500"
      >
        <Link href="/" className="hover:text-zinc-900">
          Tổng quan
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <Link href="/bom" className="hover:text-zinc-900">
          BOM Templates
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="text-zinc-900">Vật liệu</span>
      </nav>

      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Master vật liệu
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Danh mục vật liệu (POM/PB108/AL6061/SUS304/…) + giá/kg + density.
            Dùng làm dropdown khi tạo BOM line + tính giá thành sản phẩm.
          </p>
        </div>
        <Button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Thêm vật liệu
        </Button>
      </header>

      <section
        aria-label="Bộ lọc"
        className="flex flex-wrap items-end gap-3 rounded-md border border-zinc-200 bg-white p-3"
      >
        <div className="flex-1 min-w-[240px]">
          <Label className="text-xs uppercase">Tìm kiếm</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Code / tên EN / tên VN…"
              className="pl-8"
            />
          </div>
        </div>
        <div className="min-w-[200px]">
          <Label className="text-xs uppercase">Nhóm vật liệu</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {MATERIAL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Hiện cả vật liệu đã ẩn
        </label>
        <span className="ml-auto text-xs text-zinc-500">
          {total} vật liệu
        </span>
      </section>

      <section
        aria-label="Danh sách vật liệu"
        className="overflow-hidden rounded-md border border-zinc-200 bg-white"
      >
        {list.isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Chưa có vật liệu"
            description="Tạo vật liệu đầu tiên hoặc apply migration 0017 để seed 23 vật liệu mặc định."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Tên VN</th>
                <th className="px-3 py-2 text-left">Tên EN</th>
                <th className="px-3 py-2 text-left">Nhóm</th>
                <th className="px-3 py-2 text-right">Giá/kg (VND)</th>
                <th className="px-3 py-2 text-right">Density</th>
                <th className="px-3 py-2 text-left">Trạng thái</th>
                <th className="px-3 py-2 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    "border-t border-zinc-100",
                    !r.isActive && "opacity-50",
                  )}
                >
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs">{r.code}</span>
                  </td>
                  <td className="px-3 py-2">{r.nameVn}</td>
                  <td className="px-3 py-2 text-zinc-600">{r.nameEn}</td>
                  <td className="px-3 py-2">
                    {r.category ? (
                      <span className="inline-flex items-center rounded-sm bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">
                        {r.category}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.pricePerKg
                      ? Number(r.pricePerKg).toLocaleString("vi-VN")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                    {r.densityKgM3 ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.isActive ? (
                      <span className="text-emerald-700">Đang dùng</span>
                    ) : (
                      <span className="text-zinc-500">Đã ẩn</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(r)}
                      aria-label={`Sửa ${r.code}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {creating ? (
        <MaterialFormDialog
          open={creating}
          onOpenChange={(v) => setCreating(v)}
          mode="create"
        />
      ) : null}
      {editing ? (
        <MaterialFormDialog
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          mode="edit"
          material={editing}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form Dialog
// ---------------------------------------------------------------------------

interface MaterialFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  material?: MaterialRow;
}

function MaterialFormDialog({
  open,
  onOpenChange,
  mode,
  material,
}: MaterialFormDialogProps) {
  const create = useCreateMaterial();
  const update = useUpdateMaterial();
  const deactivate = useDeactivateMaterial();
  const isPending = create.isPending || update.isPending || deactivate.isPending;

  const [form, setForm] = React.useState({
    code: material?.code ?? "",
    nameEn: material?.nameEn ?? "",
    nameVn: material?.nameVn ?? "",
    category: material?.category ?? "",
    pricePerKg: material?.pricePerKg ?? "",
    densityKgM3: material?.densityKgM3 ?? "",
    notes: material?.notes ?? "",
    isActive: material?.isActive ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "create") {
        await create.mutateAsync({
          code: form.code.toUpperCase().trim(),
          nameEn: form.nameEn.trim(),
          nameVn: form.nameVn.trim(),
          category: form.category
            ? (form.category as (typeof MATERIAL_CATEGORIES)[number])
            : null,
          pricePerKg: form.pricePerKg ? Number(form.pricePerKg) : null,
          densityKgM3: form.densityKgM3 ? Number(form.densityKgM3) : null,
          isActive: form.isActive,
          notes: form.notes.trim() || null,
        });
        toast.success(`Đã tạo vật liệu ${form.code.toUpperCase()}`);
      } else if (material) {
        await update.mutateAsync({
          id: material.id,
          patch: {
            nameEn: form.nameEn.trim(),
            nameVn: form.nameVn.trim(),
            category: form.category
              ? (form.category as (typeof MATERIAL_CATEGORIES)[number])
              : null,
            pricePerKg: form.pricePerKg ? Number(form.pricePerKg) : null,
            densityKgM3: form.densityKgM3 ? Number(form.densityKgM3) : null,
            isActive: form.isActive,
            notes: form.notes.trim() || null,
          },
        });
        toast.success(`Đã cập nhật ${material.code}`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Lưu thất bại");
    }
  };

  const handleDelete = async () => {
    if (!material) return;
    if (
      !confirm(
        `Ẩn vật liệu '${material.code}'?\n\n(Soft delete — chỉ ẩn khỏi UI; item.material_code đang ref sẽ giữ nguyên.)`,
      )
    )
      return;
    try {
      const res = await deactivate.mutateAsync(material.id);
      toast.success("Đã ẩn vật liệu", {
        description: res.warning ?? undefined,
      });
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Thêm vật liệu" : `Sửa ${material?.code}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Mã sẽ uppercase tự động. Đặt theo format A-Z 0-9 _ (vd AL6061, POM_ESD_BLK)."
              : "Mã không thể đổi. Tạo mới nếu cần đổi mã."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label uppercase>Mã *</Label>
              <Input
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
                placeholder="AL6061"
                required
                disabled={mode === "edit"}
                pattern="[A-Z0-9_]+"
                className="font-mono"
              />
            </div>
            <div>
              <Label uppercase>Nhóm</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="(không nhóm)" />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label uppercase>Tên EN *</Label>
            <Input
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
              required
            />
          </div>
          <div>
            <Label uppercase>Tên VN *</Label>
            <Input
              value={form.nameVn}
              onChange={(e) => setForm({ ...form, nameVn: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label uppercase>Giá / kg (VND)</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                value={form.pricePerKg}
                onChange={(e) =>
                  setForm({ ...form, pricePerKg: e.target.value })
                }
                placeholder="140000"
              />
            </div>
            <div>
              <Label uppercase>Density kg/m³</Label>
              <Input
                type="number"
                inputMode="decimal"
                step={0.01}
                min={0}
                value={form.densityKgM3}
                onChange={(e) =>
                  setForm({ ...form, densityKgM3: e.target.value })
                }
                placeholder="2.70"
              />
            </div>
          </div>
          <div>
            <Label uppercase>Ghi chú</Label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) =>
                setForm({ ...form, isActive: e.target.checked })
              }
              className="h-3.5 w-3.5"
            />
            Đang dùng
          </label>
          <DialogFooter className="mt-2 flex flex-row items-center justify-between gap-2">
            {mode === "edit" ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleDelete}
                disabled={isPending}
                className="text-red-600 hover:bg-red-50"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Ẩn
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {mode === "create" ? "Tạo" : "Lưu"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
