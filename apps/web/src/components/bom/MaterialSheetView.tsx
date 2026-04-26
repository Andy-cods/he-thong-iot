"use client";

import * as React from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  MATERIAL_ROW_STATUSES,
  MATERIAL_ROW_STATUS_LABELS,
  MATERIAL_ROW_STATUS_COLORS,
  type MaterialRowStatus,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  useCreateMaterialRow,
  useDeleteMaterialRow,
  useMaterialRowsList,
  useUpdateMaterialRow,
  type MaterialRowRecord,
} from "@/hooks/useBomSheetRows";

/**
 * V2.0 Sprint 6 FIX — render sheet kind=MATERIAL.
 *
 * Bảng rows vật liệu per-BOM với inline edit:
 *   Code | Tên | Phôi | Qty(kg) | Giá/kg | NCC | Status | PO | Note | Actions
 *
 * Add row → row mới với defaults (PLANNED status), user fill inline.
 * Edit cell → blur trigger PATCH (debounce qua React.useTransition không
 * dùng — KISS: blur immediate save, có feedback toast).
 *
 * Status badge màu theo MATERIAL_ROW_STATUS_COLORS.
 */

interface MaterialSheetViewProps {
  sheetId: string;
  readOnly?: boolean;
}

const STATUS_BADGE_CLASS: Record<MaterialRowStatus, string> = {
  PLANNED: "bg-zinc-100 text-zinc-700",
  ORDERED: "bg-amber-100 text-amber-800",
  DELIVERED: "bg-blue-100 text-blue-800",
  QC_PASS: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-red-100 text-red-700",
};

function formatVND(n: string | null | undefined): string {
  if (!n) return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return Math.round(num).toLocaleString("vi-VN");
}

function blankSizeText(blank: Record<string, unknown>): string {
  if (!blank || Object.keys(blank).length === 0) return "—";
  if (typeof blank.freeText === "string" && blank.freeText) return blank.freeText;
  const l = blank.l_mm;
  const w = blank.w_mm;
  const t = blank.t_mm;
  if (l || w || t) return `${l ?? "?"} × ${w ?? "?"} × ${t ?? "?"} mm`;
  return JSON.stringify(blank);
}

export function MaterialSheetView({ sheetId, readOnly }: MaterialSheetViewProps) {
  const list = useMaterialRowsList(sheetId);
  const create = useCreateMaterialRow(sheetId);
  const update = useUpdateMaterialRow(sheetId);
  const remove = useDeleteMaterialRow(sheetId);

  const rows = list.data?.data ?? [];

  const handleAdd = async () => {
    try {
      await create.mutateAsync({
        materialCode: null,
        nameOverride: "Vật liệu mới",
        status: "PLANNED",
        pricePerKg: null,
        qtyKg: null,
        supplierCode: null,
        purchaseOrderCode: null,
        notes: null,
      });
      toast.success("Đã thêm dòng vật liệu");
    } catch (err) {
      toast.error((err as Error).message ?? "Thêm thất bại");
    }
  };

  const handlePatch = async (
    rowId: string,
    patch: Parameters<typeof update.mutateAsync>[0]["patch"],
  ) => {
    try {
      await update.mutateAsync({ rowId, patch });
    } catch (err) {
      toast.error((err as Error).message ?? "Cập nhật thất bại");
    }
  };

  const handleDelete = async (row: MaterialRowRecord) => {
    if (
      !confirm(
        `Xoá dòng vật liệu "${row.materialCode ?? row.nameOverride ?? "(chưa đặt tên)"}"?`,
      )
    )
      return;
    try {
      await remove.mutateAsync(row.id);
      toast.success("Đã xoá");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">
            Vật liệu sử dụng cho BOM này
          </h2>
          <p className="text-xs text-zinc-500">
            Giá / phôi / status đặc thù cho dự án (snapshot từ master tại thời
            điểm import). Sửa giá/qty không ảnh hưởng master toàn cục.
          </p>
        </div>
        {!readOnly ? (
          <Button
            onClick={handleAdd}
            disabled={create.isPending}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {create.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-3.5 w-3.5" />
            )}
            Thêm dòng
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto rounded-md border border-zinc-200 bg-white">
        {list.isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Chưa có dòng vật liệu"
            description={
              readOnly
                ? "Sheet này chưa có vật liệu nào."
                : 'Click "Thêm dòng" hoặc đợi importer V2 auto-populate khi import file Excel.'
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="w-12 px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Code</th>
                <th className="px-2 py-2 text-left">Tên / Mô tả</th>
                <th className="px-2 py-2 text-left">Phôi</th>
                <th className="px-2 py-2 text-right">SL (kg)</th>
                <th className="px-2 py-2 text-right">Giá / kg</th>
                <th className="px-2 py-2 text-left">NCC</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-left">PO</th>
                <th className="px-2 py-2 text-left">Ghi chú</th>
                {!readOnly ? (
                  <th className="px-2 py-2 text-right">Hành động</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100">
                  <td className="px-2 py-1 text-zinc-500">{row.position}</td>
                  <td className="px-2 py-1">
                    <Input
                      defaultValue={row.materialCode ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim().toUpperCase();
                        if (v !== (row.materialCode ?? ""))
                          handlePatch(row.id, { materialCode: v || null });
                      }}
                      placeholder="AL6061"
                      disabled={readOnly}
                      className="h-7 w-24 font-mono text-xs"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      defaultValue={row.nameOverride ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (row.nameOverride ?? ""))
                          handlePatch(row.id, { nameOverride: v || null });
                      }}
                      placeholder="Tên / mô tả vật liệu"
                      disabled={readOnly}
                      className="h-7 min-w-[180px] text-xs"
                    />
                  </td>
                  <td className="px-2 py-1 text-xs text-zinc-700">
                    {blankSizeText(row.blankSize)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <Input
                      type="number"
                      step="0.0001"
                      defaultValue={row.qtyKg ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== (row.qtyKg ?? ""))
                          handlePatch(row.id, { qtyKg: v ? Number(v) : null });
                      }}
                      disabled={readOnly}
                      className="h-7 w-20 text-right text-xs tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <Input
                      type="number"
                      step="100"
                      defaultValue={row.pricePerKg ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== (row.pricePerKg ?? ""))
                          handlePatch(row.id, {
                            pricePerKg: v ? Number(v) : null,
                          });
                      }}
                      disabled={readOnly}
                      className="h-7 w-24 text-right text-xs tabular-nums"
                      title={`Master: ${formatVND(row.pricePerKg)}`}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      defaultValue={row.supplierCode ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (row.supplierCode ?? ""))
                          handlePatch(row.id, { supplierCode: v || null });
                      }}
                      placeholder="GTAM"
                      disabled={readOnly}
                      className="h-7 w-20 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Select
                      value={row.status}
                      onValueChange={(v) =>
                        handlePatch(row.id, {
                          status: v as MaterialRowStatus,
                        })
                      }
                      disabled={readOnly}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-7 w-32 text-xs",
                          STATUS_BADGE_CLASS[row.status],
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MATERIAL_ROW_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {MATERIAL_ROW_STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      defaultValue={row.purchaseOrderCode ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (row.purchaseOrderCode ?? ""))
                          handlePatch(row.id, { purchaseOrderCode: v || null });
                      }}
                      placeholder="PO-001"
                      disabled={readOnly}
                      className="h-7 w-24 text-xs font-mono"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      defaultValue={row.notes ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (row.notes ?? ""))
                          handlePatch(row.id, { notes: v || null });
                      }}
                      placeholder="Ghi chú"
                      disabled={readOnly}
                      className="h-7 min-w-[150px] text-xs"
                    />
                  </td>
                  {!readOnly ? (
                    <td className="px-2 py-1 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(row)}
                        disabled={remove.isPending}
                        aria-label="Xoá dòng"
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
