"use client";

import * as React from "react";
import { Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ItemSupplierCreate } from "@iot/shared";
import { Badge } from "@/components/ui/badge";
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
  useAddItemSupplier,
  useItemSuppliers,
  useRemoveItemSupplier,
  useSetPreferredItemSupplier,
  useSuppliersList,
} from "@/hooks/useSuppliers";

interface ItemSupplierRow {
  id: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  supplierSku: string | null;
  priceRef: string | null;
  currency: string;
  leadTimeDays: number;
  moq: string;
  packSize: string;
  isPreferred: boolean;
}

export function SupplierList({ itemId }: { itemId: string }) {
  const { data, isLoading } = useItemSuppliers(itemId);
  const { data: suppliersData } = useSuppliersList({ pageSize: 100 });
  const add = useAddItemSupplier(itemId);
  const remove = useRemoveItemSupplier(itemId);
  const setPreferred = useSetPreferredItemSupplier(itemId);

  const [form, setForm] = React.useState<ItemSupplierCreate>({
    supplierId: "",
    supplierSku: null,
    vendorItemCode: null,
    priceRef: null,
    currency: "VND",
    leadTimeDays: 7,
    moq: 1,
    packSize: 1,
    isPreferred: false,
  });

  const rows = (data?.data ?? []) as ItemSupplierRow[];
  const suppliers = (suppliersData?.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
  }>;

  return (
    <div className="space-y-3">
      <form
        className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.supplierId) {
            toast.error("Vui lòng chọn NCC.");
            return;
          }
          try {
            await add.mutateAsync(form);
            toast.success("Đã gắn NCC.");
            setForm((f) => ({ ...f, supplierId: "", supplierSku: null }));
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      >
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-4">
            <Label>Nhà cung cấp</Label>
            <Select
              value={form.supplierId}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, supplierId: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn NCC…" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>SKU NCC</Label>
            <Input
              value={form.supplierSku ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, supplierSku: e.target.value || null }))
              }
            />
          </div>
          <div className="col-span-2">
            <Label>Giá tham khảo</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.priceRef ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  priceRef: e.target.value ? Number(e.target.value) : null,
                }))
              }
            />
          </div>
          <div className="col-span-1">
            <Label>LT</Label>
            <Input
              type="number"
              min={0}
              value={form.leadTimeDays}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  leadTimeDays: Number(e.target.value) || 0,
                }))
              }
            />
          </div>
          <div className="col-span-1">
            <Label>MOQ</Label>
            <Input
              type="number"
              min={0.0001}
              step="0.0001"
              value={form.moq}
              onChange={(e) =>
                setForm((f) => ({ ...f, moq: Number(e.target.value) || 1 }))
              }
            />
          </div>
          <div className="col-span-1">
            <Label>Pack</Label>
            <Input
              type="number"
              min={0.0001}
              step="0.0001"
              value={form.packSize}
              onChange={(e) =>
                setForm((f) => ({ ...f, packSize: Number(e.target.value) || 1 }))
              }
            />
          </div>
          <div className="col-span-1 flex items-end">
            <Button size="sm" className="w-full" disabled={add.isPending}>
              +
            </Button>
          </div>
        </div>
        <label className="mt-2 flex items-center gap-1.5 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={form.isPreferred}
            onChange={(e) =>
              setForm((f) => ({ ...f, isPreferred: e.target.checked }))
            }
          />
          Đặt làm NCC ưu tiên
        </label>
      </form>

      <table className="w-full text-sm">
        <thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="py-2 pr-2">NCC</th>
            <th className="py-2 pr-2">SKU NCC</th>
            <th className="py-2 pr-2">Giá</th>
            <th className="py-2 pr-2">LT</th>
            <th className="py-2 pr-2">MOQ</th>
            <th className="py-2 pr-2">Ưu tiên</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={7} className="py-3 text-center text-zinc-500">
                Đang tải…
              </td>
            </tr>
          )}
          {!isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-3 text-center text-zinc-500">
                Chưa có NCC nào.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-zinc-100">
              <td className="py-2 pr-2 text-zinc-900">
                <div className="font-medium">{r.supplierCode}</div>
                <div className="text-xs text-zinc-500">{r.supplierName}</div>
              </td>
              <td className="py-2 pr-2">{r.supplierSku ?? "—"}</td>
              <td className="py-2 pr-2">
                {r.priceRef ? `${r.priceRef} ${r.currency}` : "—"}
              </td>
              <td className="py-2 pr-2">{r.leadTimeDays}d</td>
              <td className="py-2 pr-2">{r.moq}</td>
              <td className="py-2 pr-2">
                {r.isPreferred ? (
                  <Badge variant="success">Ưu tiên</Badge>
                ) : (
                  <button
                    type="button"
                    aria-label="Đặt làm NCC ưu tiên"
                    className="text-zinc-400 hover:text-blue-600"
                    onClick={() => setPreferred.mutate(r.id)}
                  >
                    <Star className="h-4 w-4" />
                  </button>
                )}
              </td>
              <td className="py-2 text-right">
                <button
                  type="button"
                  aria-label="Xoá NCC khỏi item"
                  className="text-zinc-400 hover:text-red-600"
                  onClick={() => {
                    if (confirm(`Xoá NCC "${r.supplierCode}"?`)) {
                      remove.mutate(r.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
