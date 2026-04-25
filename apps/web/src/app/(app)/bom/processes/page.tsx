"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PROCESS_PRICING_UNITS } from "@iot/shared";
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
  useCreateProcess,
  useDeactivateProcess,
  useProcessesList,
  useUpdateProcess,
  type ProcessRow,
} from "@/hooks/useMasterData";
import { cn } from "@/lib/utils";

/**
 * /admin/processes — V2.0 Sprint 5 admin CRUD master quy trình.
 */

const PRICING_UNIT_LABEL: Record<"HOUR" | "CM2" | "OTHER", string> = {
  HOUR: "đ/giờ",
  CM2: "đ/cm²",
  OTHER: "khác",
};

export default function AdminProcessesPage() {
  const [q, setQ] = React.useState("");
  const [showInactive, setShowInactive] = React.useState(false);
  const [editing, setEditing] = React.useState<ProcessRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  const list = useProcessesList({
    q: q || undefined,
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
        <span className="text-zinc-900">Quy trình</span>
      </nav>

      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Master quy trình
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Danh mục quy trình gia công (MCT/Milling/Anodizing/…) + giá/giờ
            hoặc đặc thù (vd Anodizing 115đ/cm²). Dùng cho routing WO + tính
            giá gia công.
          </p>
        </div>
        <Button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Thêm quy trình
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
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Hiện cả quy trình đã ẩn
        </label>
        <span className="ml-auto text-xs text-zinc-500">
          {total} quy trình
        </span>
      </section>

      <section
        aria-label="Danh sách quy trình"
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
            title="Chưa có quy trình"
            description="Tạo quy trình đầu tiên hoặc apply migration 0017 để seed 11 quy trình mặc định."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Tên VN</th>
                <th className="px-3 py-2 text-left">Tên EN</th>
                <th className="px-3 py-2 text-right">Giá / đơn vị</th>
                <th className="px-3 py-2 text-left">Đơn vị</th>
                <th className="px-3 py-2 text-left">Ghi chú giá</th>
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
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.pricePerUnit
                      ? Number(r.pricePerUnit).toLocaleString("vi-VN")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">
                    {PRICING_UNIT_LABEL[r.pricingUnit]}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">
                    {r.pricingNote ?? "—"}
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
        <ProcessFormDialog
          open={creating}
          onOpenChange={(v) => setCreating(v)}
          mode="create"
        />
      ) : null}
      {editing ? (
        <ProcessFormDialog
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          mode="edit"
          process={editing}
        />
      ) : null}
    </div>
  );
}

interface ProcessFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  process?: ProcessRow;
}

function ProcessFormDialog({
  open,
  onOpenChange,
  mode,
  process,
}: ProcessFormDialogProps) {
  const create = useCreateProcess();
  const update = useUpdateProcess();
  const deactivate = useDeactivateProcess();
  const isPending = create.isPending || update.isPending || deactivate.isPending;

  const [form, setForm] = React.useState({
    code: process?.code ?? "",
    nameEn: process?.nameEn ?? "",
    nameVn: process?.nameVn ?? "",
    pricePerUnit: process?.pricePerUnit ?? "",
    pricingUnit:
      (process?.pricingUnit as "HOUR" | "CM2" | "OTHER") ?? "HOUR",
    pricingNote: process?.pricingNote ?? "",
    isActive: process?.isActive ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "create") {
        await create.mutateAsync({
          code: form.code.toUpperCase().trim(),
          nameEn: form.nameEn.trim(),
          nameVn: form.nameVn.trim(),
          pricePerUnit: form.pricePerUnit ? Number(form.pricePerUnit) : null,
          pricingUnit: form.pricingUnit,
          pricingNote: form.pricingNote.trim() || null,
          isActive: form.isActive,
        });
        toast.success(`Đã tạo quy trình ${form.code.toUpperCase()}`);
      } else if (process) {
        await update.mutateAsync({
          id: process.id,
          patch: {
            nameEn: form.nameEn.trim(),
            nameVn: form.nameVn.trim(),
            pricePerUnit: form.pricePerUnit
              ? Number(form.pricePerUnit)
              : null,
            pricingUnit: form.pricingUnit,
            pricingNote: form.pricingNote.trim() || null,
            isActive: form.isActive,
          },
        });
        toast.success(`Đã cập nhật ${process.code}`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Lưu thất bại");
    }
  };

  const handleDelete = async () => {
    if (!process) return;
    if (!confirm(`Ẩn quy trình '${process.code}'?`)) return;
    try {
      await deactivate.mutateAsync(process.id);
      toast.success("Đã ẩn quy trình");
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
            {mode === "create" ? "Thêm quy trình" : `Sửa ${process?.code}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Mã sẽ uppercase tự động. Vd: MCT, MILLING, ANODIZING."
              : "Mã không thể đổi."}
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
                placeholder="MILLING"
                required
                disabled={mode === "edit"}
                pattern="[A-Z0-9_]+"
                className="font-mono"
              />
            </div>
            <div>
              <Label uppercase>Đơn vị giá</Label>
              <Select
                value={form.pricingUnit}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    pricingUnit: v as "HOUR" | "CM2" | "OTHER",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROCESS_PRICING_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {PRICING_UNIT_LABEL[u]} ({u})
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
              <Label uppercase>Giá / đơn vị</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={100}
                value={form.pricePerUnit}
                onChange={(e) =>
                  setForm({ ...form, pricePerUnit: e.target.value })
                }
                placeholder="200000"
              />
            </div>
            <div>
              <Label uppercase>Ghi chú giá</Label>
              <Input
                value={form.pricingNote}
                onChange={(e) =>
                  setForm({ ...form, pricingNote: e.target.value })
                }
                placeholder="Vd: 115đ/cm² cho Anodizing"
              />
            </div>
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
