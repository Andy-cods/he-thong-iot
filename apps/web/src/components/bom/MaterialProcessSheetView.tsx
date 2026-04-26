"use client";

import * as React from "react";
import { Plus, Trash2, Loader2, Beaker, Layers } from "lucide-react";
import { toast } from "sonner";
import {
  MATERIAL_ROW_STATUSES,
  MATERIAL_ROW_STATUS_LABELS,
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
import { cn } from "@/lib/utils";
import {
  useCreateMaterialRow,
  useCreateProcessRow,
  useDeleteMaterialRow,
  useDeleteProcessRow,
  useMaterialRowsList,
  useProcessRowsList,
  useUpdateMaterialRow,
  useUpdateProcessRow,
  type MaterialRowRecord,
  type ProcessRowRecord,
} from "@/hooks/useBomSheetRows";

/**
 * V2.0 Sprint 6 — Combined Material & Process sheet view.
 *
 * User feedback (2026-04-26): "phần vật liệu và quy trình thì làm thành 1
 * sheet như excel thui, đặt tên là material và process như mẫu luôn, trình
 * bày y chang".
 *
 * Render 2 panels side-by-side trong cùng 1 sheet (kind=MATERIAL):
 *   - Trái: Bảng vật liệu (Loại / Tên EN / Tên VN / Giá/kg)
 *   - Phải: Bảng quy trình (Tên EN / Tên VN / Giá/giờ)
 *
 * Schema: cả 2 bảng `bom_sheet_material_row` + `bom_sheet_process_row` đều
 * có FK `sheet_id` → bom_sheet. Nên cùng 1 sheet.id chứa được cả 2 loại rows.
 */

interface MaterialProcessSheetViewProps {
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

const PRICING_UNIT_LABEL: Record<string, string> = {
  HOUR: "đ/giờ",
  CM2: "đ/cm²",
  OTHER: "khác",
};

export function MaterialProcessSheetView({
  sheetId,
  readOnly,
}: MaterialProcessSheetViewProps) {
  return (
    <div className="grid h-full grid-cols-1 gap-3 p-3 lg:grid-cols-2">
      <MaterialPanel sheetId={sheetId} readOnly={readOnly} />
      <ProcessPanel sheetId={sheetId} readOnly={readOnly} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Material Panel
// ---------------------------------------------------------------------------

function MaterialPanel({
  sheetId,
  readOnly,
}: MaterialProcessSheetViewProps) {
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
        `Xoá dòng vật liệu "${row.materialCode ?? row.nameOverride ?? "(chưa đặt)"}"?`,
      )
    )
      return;
    try {
      await remove.mutateAsync(row.id);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-2 overflow-hidden rounded-md border border-zinc-200 bg-white">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-emerald-50/40 px-3 py-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
          <Beaker className="h-4 w-4 text-emerald-600" aria-hidden />
          Vật liệu
          <span className="ml-1 inline-flex h-4 items-center rounded-sm bg-emerald-100 px-1.5 text-[10px] font-mono text-emerald-700">
            {rows.length}
          </span>
        </h3>
        {!readOnly ? (
          <Button
            onClick={handleAdd}
            disabled={create.isPending}
            size="sm"
            variant="outline"
            className="h-7 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
          >
            {create.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Plus className="mr-1 h-3 w-3" />
            )}
            Thêm
          </Button>
        ) : null}
      </header>

      <div className="flex-1 overflow-auto">
        {list.isLoading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-400">
            {readOnly
              ? "Chưa có vật liệu"
              : 'Click "+ Thêm" để thêm vật liệu cho BOM này'}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-1 text-left">Code</th>
                <th className="px-2 py-1 text-left">Tên VN</th>
                <th className="px-2 py-1 text-right">Giá/kg</th>
                <th className="px-2 py-1 text-left">Status</th>
                {!readOnly ? <th className="w-8 px-1 py-1" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100">
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
                      className="h-6 w-24 font-mono text-[11px]"
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
                      placeholder="Tên / mô tả"
                      disabled={readOnly}
                      className="h-6 min-w-[140px] text-[11px]"
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
                      className="h-6 w-20 text-right text-[11px] tabular-nums"
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
                          "h-6 w-28 text-[11px]",
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
                  {!readOnly ? (
                    <td className="px-1 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        disabled={remove.isPending}
                        aria-label="Xoá"
                        className="rounded p-0.5 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
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

// ---------------------------------------------------------------------------
// Process Panel
// ---------------------------------------------------------------------------

function ProcessPanel({
  sheetId,
  readOnly,
}: MaterialProcessSheetViewProps) {
  const list = useProcessRowsList(sheetId);
  const create = useCreateProcessRow(sheetId);
  const update = useUpdateProcessRow(sheetId);
  const remove = useDeleteProcessRow(sheetId);

  const rows = list.data?.data ?? [];

  const handleAdd = async () => {
    try {
      await create.mutateAsync({
        processCode: null,
        nameOverride: "Quy trình mới",
        pricingUnit: "HOUR",
        hoursEstimated: null,
        pricePerUnit: null,
        stationCode: null,
        notes: null,
      });
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

  const handleDelete = async (row: ProcessRowRecord) => {
    if (
      !confirm(
        `Xoá dòng quy trình "${row.processCode ?? row.nameOverride ?? "(chưa đặt)"}"?`,
      )
    )
      return;
    try {
      await remove.mutateAsync(row.id);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-2 overflow-hidden rounded-md border border-zinc-200 bg-white">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-amber-50/40 px-3 py-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
          <Layers className="h-4 w-4 text-amber-600" aria-hidden />
          Quy trình gia công
          <span className="ml-1 inline-flex h-4 items-center rounded-sm bg-amber-100 px-1.5 text-[10px] font-mono text-amber-700">
            {rows.length}
          </span>
        </h3>
        {!readOnly ? (
          <Button
            onClick={handleAdd}
            disabled={create.isPending}
            size="sm"
            variant="outline"
            className="h-7 border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
          >
            {create.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Plus className="mr-1 h-3 w-3" />
            )}
            Thêm
          </Button>
        ) : null}
      </header>

      <div className="flex-1 overflow-auto">
        {list.isLoading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-400">
            {readOnly
              ? "Chưa có quy trình"
              : 'Click "+ Thêm" để thêm quy trình gia công'}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-1 text-left">Code</th>
                <th className="px-2 py-1 text-left">Tên VN</th>
                <th className="px-2 py-1 text-right">Đơn giá</th>
                <th className="px-2 py-1 text-left">Đơn vị</th>
                {!readOnly ? <th className="w-8 px-1 py-1" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100">
                  <td className="px-2 py-1">
                    <Input
                      defaultValue={row.processCode ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim().toUpperCase();
                        if (v !== (row.processCode ?? ""))
                          handlePatch(row.id, { processCode: v || null });
                      }}
                      placeholder="MILLING"
                      disabled={readOnly}
                      className="h-6 w-24 font-mono text-[11px]"
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
                      placeholder="Tên / mô tả"
                      disabled={readOnly}
                      className="h-6 min-w-[140px] text-[11px]"
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <Input
                      type="number"
                      step="1000"
                      defaultValue={row.pricePerUnit ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== (row.pricePerUnit ?? ""))
                          handlePatch(row.id, {
                            pricePerUnit: v ? Number(v) : null,
                          });
                      }}
                      disabled={readOnly}
                      className="h-6 w-20 text-right text-[11px] tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Select
                      value={row.pricingUnit}
                      onValueChange={(v) =>
                        handlePatch(row.id, {
                          pricingUnit: v as "HOUR" | "CM2" | "OTHER",
                        })
                      }
                      disabled={readOnly}
                    >
                      <SelectTrigger className="h-6 w-20 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HOUR">{PRICING_UNIT_LABEL.HOUR}</SelectItem>
                        <SelectItem value="CM2">{PRICING_UNIT_LABEL.CM2}</SelectItem>
                        <SelectItem value="OTHER">{PRICING_UNIT_LABEL.OTHER}</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  {!readOnly ? (
                    <td className="px-1 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        disabled={remove.isPending}
                        aria-label="Xoá"
                        className="rounded p-0.5 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
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
