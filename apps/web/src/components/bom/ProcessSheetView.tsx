"use client";

import * as React from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import {
  useCreateProcessRow,
  useDeleteProcessRow,
  useProcessRowsList,
  useUpdateProcessRow,
  type ProcessRowRecord,
} from "@/hooks/useBomSheetRows";

/**
 * V2.0 Sprint 6 FIX — render sheet kind=PROCESS.
 *
 * Bảng rows quy trình per-BOM với inline edit:
 *   Code | Tên | Trạm | Giờ ước tính | Đơn giá | Đơn vị | Note | Actions
 *
 * Đơn vị HOUR/CM2/OTHER — match process_master.pricing_unit.
 */

interface ProcessSheetViewProps {
  sheetId: string;
  readOnly?: boolean;
}

const PRICING_UNIT_LABEL: Record<string, string> = {
  HOUR: "đ/giờ",
  CM2: "đ/cm²",
  OTHER: "khác",
};

export function ProcessSheetView({ sheetId, readOnly }: ProcessSheetViewProps) {
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
      toast.success("Đã thêm dòng quy trình");
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
        `Xoá dòng quy trình "${row.processCode ?? row.nameOverride ?? "(chưa đặt tên)"}"?`,
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
            Quy trình gia công cho BOM này
          </h2>
          <p className="text-xs text-zinc-500">
            Giờ ước tính / đơn giá / trạm thực hiện đặc thù cho dự án (snapshot
            từ master). Anodizing đặc thù 115đ/cm² dùng đơn vị CM2.
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
            title="Chưa có dòng quy trình"
            description={
              readOnly
                ? "Sheet này chưa có quy trình nào."
                : 'Click "Thêm dòng" hoặc đợi importer V2 auto-populate.'
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="w-12 px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Code</th>
                <th className="px-2 py-2 text-left">Tên / Mô tả</th>
                <th className="px-2 py-2 text-left">Trạm</th>
                <th className="px-2 py-2 text-right">Giờ ước tính</th>
                <th className="px-2 py-2 text-right">Đơn giá</th>
                <th className="px-2 py-2 text-left">Đơn vị</th>
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
                      defaultValue={row.processCode ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim().toUpperCase();
                        if (v !== (row.processCode ?? ""))
                          handlePatch(row.id, { processCode: v || null });
                      }}
                      placeholder="MILLING"
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
                      placeholder="Tên / mô tả quy trình"
                      disabled={readOnly}
                      className="h-7 min-w-[180px] text-xs"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      defaultValue={row.stationCode ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim().toUpperCase();
                        if (v !== (row.stationCode ?? ""))
                          handlePatch(row.id, { stationCode: v || null });
                      }}
                      placeholder="T1 / EXTERNAL"
                      disabled={readOnly}
                      className="h-7 w-24 font-mono text-xs"
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <Input
                      type="number"
                      step="0.5"
                      defaultValue={row.hoursEstimated ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== (row.hoursEstimated ?? ""))
                          handlePatch(row.id, {
                            hoursEstimated: v ? Number(v) : null,
                          });
                      }}
                      disabled={readOnly}
                      className="h-7 w-20 text-right text-xs tabular-nums"
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
                      className="h-7 w-24 text-right text-xs tabular-nums"
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
                      <SelectTrigger className="h-7 w-20 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HOUR">{PRICING_UNIT_LABEL.HOUR}</SelectItem>
                        <SelectItem value="CM2">{PRICING_UNIT_LABEL.CM2}</SelectItem>
                        <SelectItem value="OTHER">{PRICING_UNIT_LABEL.OTHER}</SelectItem>
                      </SelectContent>
                    </Select>
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
