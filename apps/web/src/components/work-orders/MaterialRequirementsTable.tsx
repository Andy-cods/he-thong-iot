"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Package, Plus, Save, ShoppingCart, Trash2, X } from "lucide-react";
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
import { useCreatePurchaseRequest } from "@/hooks/usePurchaseRequests";

/**
 * V1.9-P4 — hiển thị + sửa material_requirements (JSONB) của WO.
 *
 * V3.7.50 — thêm action "Yêu cầu mua phôi" cho từng dòng vật liệu thiếu hụt.
 * Khi click → tạo Purchase Request gửi sang bộ phận Thu mua, gắn link WO trong
 * notes để Procurement biết phôi cho lệnh sản xuất nào.
 */
export function MaterialRequirementsTable({
  woId,
  woNo,
  requirements,
  versionLock,
  canEdit,
  canRequestPR,
}: {
  woId: string;
  woNo?: string;
  requirements: MaterialRequirement[] | null;
  versionLock: number;
  canEdit: boolean;
  /** V3.7.50 — quyền gửi Yêu cầu mua phôi (operator/planner/admin). */
  canRequestPR?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [requestingIdx, setRequestingIdx] = React.useState<number | null>(null);
  const rows = requirements ?? [];
  const createPR = useCreatePurchaseRequest();

  const handleRequestPR = async (row: MaterialRequirement, idx: number) => {
    if (!row.item_id) {
      toast.error("Cần SKU/item_id để gửi yêu cầu", {
        description: "Sửa vật liệu và gắn item từ danh mục trước.",
      });
      return;
    }
    const qty = Math.max(0, Number(row.qty || 0) - Number(row.allocated_qty ?? 0));
    if (qty <= 0) {
      toast.info("Không thiếu hụt — không cần mua thêm.");
      return;
    }
    if (
      !window.confirm(
        `Gửi yêu cầu mua ${qty.toLocaleString("vi-VN")} ${row.uom ?? ""} ${row.name} đến bộ phận Thu mua?`,
      )
    ) {
      return;
    }
    setRequestingIdx(idx);
    try {
      const woRef = woNo ? `WO ${woNo}` : `WO ${woId.slice(0, 8)}`;
      const res = await createPR.mutateAsync({
        title: `Yêu cầu mua phôi — ${woRef} · ${row.sku ?? row.name}`,
        source: "MANUAL",
        linkedOrderId: null,
        notes: `Phôi cho ${woRef} · vật liệu "${row.name}"${row.sku ? ` (SKU ${row.sku})` : ""}`,
        lines: [
          {
            itemId: row.item_id,
            qty,
            preferredSupplierId: null,
            notes: `Phôi cho ${woRef}`,
          },
        ],
      });
      const created = res.data;
      const prHref = created.id
        ? `/procurement/purchase-requests/${created.id}`
        : null;
      toast.success(`Đã gửi PR ${created.code ?? ""} đến Thu mua`.trim(), {
        description: "Bộ phận Thu mua sẽ duyệt và chuyển thành PO.",
        action: prHref
          ? {
              label: "Mở PR",
              onClick: () => {
                window.location.href = prHref;
              },
            }
          : undefined,
      });
    } catch (e) {
      toast.error((e as Error).message ?? "Không gửi được yêu cầu mua phôi");
    } finally {
      setRequestingIdx(null);
    }
  };

  return (
    <>
      <div className="rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/60">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            <Package className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            Vật liệu phôi (Materials)
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
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
          <div className="px-3 py-4 text-xs text-zinc-500 dark:text-zinc-400">
            Chưa khai báo vật liệu. Planner có thể thêm từ đây.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-left">Tên</th>
                <th className="px-3 py-2 text-right">Yêu cầu</th>
                <th className="px-3 py-2 text-right">Đã cấp</th>
                <th className="px-3 py-2 text-right">Thiếu</th>
                <th className="px-3 py-2 text-left">UoM</th>
                <th className="px-3 py-2 text-left">Lot codes</th>
                {canRequestPR && (
                  <th className="px-3 py-2 text-right">Hành động</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((r, i) => {
                const qty = Number(r.qty);
                const allocated = Number(r.allocated_qty ?? 0);
                const shortage = qty - allocated;
                const canBuy = !!r.item_id && shortage > 0;
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
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {allocated.toLocaleString("vi-VN")}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums text-xs ${
                        shortage > 0 ? "font-semibold text-amber-700 dark:text-amber-400" : "text-zinc-400 dark:text-zinc-500"
                      }`}
                    >
                      {shortage > 0 ? shortage.toLocaleString("vi-VN") : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {r.uom ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      {(r.lot_codes ?? []).join(", ") || "—"}
                    </td>
                    {canRequestPR && (
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant={canBuy ? "secondary" : "ghost"}
                          disabled={!canBuy || requestingIdx === i}
                          onClick={() => handleRequestPR(r, i)}
                          title={
                            !r.item_id
                              ? "Chưa có item_id — cần sửa vật liệu để gắn SKU"
                              : shortage <= 0
                                ? "Đủ vật liệu — không cần mua thêm"
                                : "Gửi yêu cầu mua phôi đến Thu mua"
                          }
                          className="h-7 gap-1 text-[11px]"
                        >
                          {requestingIdx === i ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ShoppingCart className="h-3 w-3" />
                          )}
                          Yêu cầu mua
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {canRequestPR && rows.length > 0 && (
          <div className="border-t border-zinc-100 bg-zinc-50/50 px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400">
            Yêu cầu mua phôi sẽ tạo Purchase Request gửi đến{" "}
            <Link
              href="/procurement/purchase-requests"
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              bộ phận Thu mua
            </Link>{" "}
            để duyệt và đặt PO.
          </div>
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
              className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-800/60"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Vật liệu #{i + 1}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeRow(i)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
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

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
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
