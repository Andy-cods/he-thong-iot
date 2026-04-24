"use client";

import * as React from "react";
import { toast } from "sonner";
import { Package, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useUpdateWorkOrder,
  type MaterialRequirement,
} from "@/hooks/useWorkOrders";

/**
 * V1.9-P4 — hiển thị + sửa material_requirements (JSONB) của WO.
 */
export function MaterialRequirementsTable({
  woId,
  requirements,
  versionLock,
  canEdit,
}: {
  woId: string;
  requirements: MaterialRequirement[] | null;
  versionLock: number;
  canEdit: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const rows = requirements ?? [];

  return (
    <>
      <div className="rounded-md border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
            <Package className="h-4 w-4 text-zinc-500" />
            Vật liệu phôi (Materials)
            <span className="text-xs font-normal text-zinc-500">
              · {rows.length} loại
            </span>
          </div>
          {canEdit && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOpen(true)}
            >
              Sửa vật liệu
            </Button>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="px-3 py-4 text-xs text-zinc-500">
            Chưa khai báo vật liệu. Planner có thể thêm từ đây.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-left">Tên</th>
                <th className="px-3 py-2 text-right">Yêu cầu</th>
                <th className="px-3 py-2 text-right">Đã cấp</th>
                <th className="px-3 py-2 text-left">UoM</th>
                <th className="px-3 py-2 text-left">Lot codes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r, i) => {
                const qty = Number(r.qty);
                const allocated = Number(r.allocated_qty ?? 0);
                const shortage = qty - allocated;
                return (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.sku ?? "—"}
                    </td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {qty.toLocaleString("vi-VN")}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        shortage > 0
                          ? "text-amber-700"
                          : "text-emerald-700"
                      }`}
                    >
                      {allocated.toLocaleString("vi-VN")}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {r.uom ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-zinc-500">
                      {(r.lot_codes ?? []).join(", ") || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {canEdit && open && (
        <MaterialEditSheet
          woId={woId}
          initial={rows}
          versionLock={versionLock}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function MaterialEditSheet({
  woId,
  initial,
  versionLock,
  onClose,
}: {
  woId: string;
  initial: MaterialRequirement[];
  versionLock: number;
  onClose: () => void;
}) {
  const mut = useUpdateWorkOrder(woId);
  const [rows, setRows] = React.useState<MaterialRequirement[]>(initial);

  const addRow = () => {
    setRows([
      ...rows,
      {
        name: "",
        qty: 0,
        uom: "",
        allocated_qty: 0,
        lot_codes: [],
      },
    ]);
  };

  const removeRow = (i: number) => {
    setRows(rows.filter((_, idx) => idx !== i));
  };

  const updateRow = (i: number, patch: Partial<MaterialRequirement>) => {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const onSave = async () => {
    const clean = rows
      .filter((r) => r.name.trim() && r.qty >= 0)
      .map((r) => ({
        ...r,
        name: r.name.trim(),
        sku: r.sku?.toString().trim() || null,
        uom: r.uom?.toString().trim() || null,
      }));
    if (clean.length !== rows.length) {
      toast.error("Có dòng chưa nhập tên hoặc số lượng < 0.");
      return;
    }
    try {
      await mut.mutateAsync({
        versionLock,
        materialRequirements: clean,
      });
      toast.success("Đã lưu vật liệu.");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full max-w-2xl">
        <SheetHeader>
          <SheetTitle>Sửa vật liệu phôi</SheetTitle>
          <SheetDescription>
            Dữ liệu lưu vào work_order.material_requirements (JSONB).
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {rows.map((r, i) => (
            <div
              key={i}
              className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-600">
                  Vật liệu #{i + 1}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeRow(i)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <Label className="text-[10px]">SKU</Label>
                  <Input
                    value={r.sku ?? ""}
                    onChange={(e) => updateRow(i, { sku: e.target.value })}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
                <div className="col-span-3">
                  <Label className="text-[10px]">Tên *</Label>
                  <Input
                    value={r.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    className="mt-1 h-8"
                    placeholder="VD: Thép C45 Ø100"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Yêu cầu *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.qty}
                    onChange={(e) =>
                      updateRow(i, { qty: Number(e.target.value) })
                    }
                    className="mt-1 h-8"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Đã cấp</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.allocated_qty ?? 0}
                    onChange={(e) =>
                      updateRow(i, {
                        allocated_qty: Number(e.target.value),
                      })
                    }
                    className="mt-1 h-8"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">UoM</Label>
                  <Input
                    value={r.uom ?? ""}
                    onChange={(e) => updateRow(i, { uom: e.target.value })}
                    className="mt-1 h-8"
                    placeholder="kg / m / cái"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Lot codes (csv)</Label>
                  <Input
                    value={(r.lot_codes ?? []).join(", ")}
                    onChange={(e) =>
                      updateRow(i, {
                        lot_codes: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="mt-1 h-8 font-mono text-[11px]"
                    placeholder="LOT-001, LOT-002"
                  />
                </div>
              </div>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={addRow}
            className="w-full"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm vật liệu
          </Button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-zinc-200 pt-4">
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
            Hủy
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={mut.isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Save className="h-3.5 w-3.5" />
            Lưu
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
