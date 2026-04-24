"use client";

import * as React from "react";
import { toast } from "sonner";
import { ListOrdered, Plus, Save, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  type RoutingStep,
} from "@/hooks/useWorkOrders";

/**
 * V1.9-P4 — xem + sửa routing plan JSONB của WO.
 */

const STATUS_LABEL: Record<NonNullable<RoutingStep["status"]>, string> = {
  PENDING: "Chờ",
  IN_PROGRESS: "Đang chạy",
  DONE: "Xong",
  SKIPPED: "Bỏ qua",
};

const STATUS_VARIANT: Record<
  NonNullable<RoutingStep["status"]>,
  "neutral" | "info" | "success" | "outline"
> = {
  PENDING: "neutral",
  IN_PROGRESS: "info",
  DONE: "success",
  SKIPPED: "outline",
};

export function RoutingPlanEditor({
  woId,
  routingPlan,
  versionLock,
  canEdit,
}: {
  woId: string;
  routingPlan: RoutingStep[] | null;
  versionLock: number;
  canEdit: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const steps = routingPlan ?? [];

  return (
    <>
      <div className="rounded-md border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
            <ListOrdered className="h-4 w-4 text-zinc-500" />
            Quy trình sản xuất (Routing)
            <span className="text-xs font-normal text-zinc-500">
              · {steps.length} bước
            </span>
          </div>
          {canEdit && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOpen(true)}
            >
              Sửa quy trình
            </Button>
          )}
        </div>
        {steps.length === 0 ? (
          <div className="px-3 py-4 text-xs text-zinc-500">
            Chưa có bước nào. Planner có thể tạo routing từ đây hoặc tự động từ
            BOM nguồn.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Bước</th>
                <th className="px-3 py-2 text-left">Máy</th>
                <th className="px-3 py-2 text-right">Setup (p)</th>
                <th className="px-3 py-2 text-right">Cycle (p)</th>
                <th className="px-3 py-2 text-left">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {steps.map((s) => (
                <tr key={s.step_no}>
                  <td className="px-3 py-2 font-mono text-xs">
                    {s.step_no}
                  </td>
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-600">
                    {s.machine ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                    {s.setup_min ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                    {s.cycle_min ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={STATUS_VARIANT[s.status ?? "PENDING"]}
                      className="text-[10px]"
                    >
                      {STATUS_LABEL[s.status ?? "PENDING"]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canEdit && open && (
        <RoutingEditSheet
          woId={woId}
          initial={steps}
          versionLock={versionLock}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function RoutingEditSheet({
  woId,
  initial,
  versionLock,
  onClose,
}: {
  woId: string;
  initial: RoutingStep[];
  versionLock: number;
  onClose: () => void;
}) {
  const mut = useUpdateWorkOrder(woId);
  const [rows, setRows] = React.useState<RoutingStep[]>(() =>
    initial.length > 0 ? initial : [],
  );

  const addRow = () => {
    const next_no =
      rows.length > 0
        ? Math.max(...rows.map((r) => r.step_no)) + 10
        : 10;
    setRows([
      ...rows,
      {
        step_no: next_no,
        name: "",
        machine: null,
        setup_min: null,
        cycle_min: null,
        status: "PENDING",
      },
    ]);
  };

  const removeRow = (i: number) => {
    setRows(rows.filter((_, idx) => idx !== i));
  };

  const updateRow = (i: number, patch: Partial<RoutingStep>) => {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const onSave = async () => {
    const clean = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        ...r,
        name: r.name.trim(),
        machine: r.machine?.toString().trim() || null,
      }));
    if (clean.length !== rows.length) {
      toast.error("Có bước chưa nhập tên — kiểm tra lại.");
      return;
    }
    try {
      await mut.mutateAsync({
        versionLock,
        routingPlan: clean,
      });
      toast.success("Đã lưu quy trình.");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full max-w-3xl">
        <SheetHeader>
          <SheetTitle>Sửa quy trình sản xuất</SheetTitle>
          <SheetDescription>
            Thêm/xóa/sắp xếp các bước gia công. Dữ liệu lưu vào
            work_order.routing_plan (JSONB).
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
                  Bước #{i + 1}
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
                  <Label className="text-[10px]">Số thứ tự</Label>
                  <Input
                    type="number"
                    value={r.step_no}
                    onChange={(e) =>
                      updateRow(i, { step_no: Number(e.target.value) })
                    }
                    className="mt-1 h-8"
                  />
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <Label className="text-[10px]">Tên bước *</Label>
                  <Input
                    value={r.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    className="mt-1 h-8"
                    placeholder="VD: Tiện thô Ø120"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Máy</Label>
                  <Input
                    value={r.machine ?? ""}
                    onChange={(e) =>
                      updateRow(i, { machine: e.target.value })
                    }
                    className="mt-1 h-8 font-mono text-xs"
                    placeholder="CNC-01"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Setup (phút)</Label>
                  <Input
                    type="number"
                    value={r.setup_min ?? ""}
                    onChange={(e) =>
                      updateRow(i, {
                        setup_min: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    className="mt-1 h-8"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Cycle (phút)</Label>
                  <Input
                    type="number"
                    value={r.cycle_min ?? ""}
                    onChange={(e) =>
                      updateRow(i, {
                        cycle_min: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    className="mt-1 h-8"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Trạng thái</Label>
                  <select
                    value={r.status ?? "PENDING"}
                    onChange={(e) =>
                      updateRow(i, {
                        status: e.target.value as RoutingStep["status"],
                      })
                    }
                    className="mt-1 h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs"
                  >
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
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
            Thêm bước
          </Button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-zinc-200 pt-4">
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            disabled={mut.isPending}
          >
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
            Lưu quy trình
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
