"use client";

import * as React from "react";
import { Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  BARCODE_SOURCES,
  BARCODE_TYPES,
  type BarcodeCreate,
} from "@iot/shared";
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
  useBarcodes,
  useCreateBarcode,
  useDeleteBarcode,
  useSetPrimaryBarcode,
} from "@/hooks/useBarcodes";

interface BarcodeRow {
  id: string;
  barcode: string;
  barcodeType: string;
  source: string;
  isPrimary: boolean;
}

export function BarcodeList({ itemId }: { itemId: string }) {
  const { data, isLoading } = useBarcodes(itemId);
  const create = useCreateBarcode(itemId);
  const remove = useDeleteBarcode(itemId);
  const setPrimary = useSetPrimaryBarcode(itemId);

  const [form, setForm] = React.useState<BarcodeCreate>({
    barcode: "",
    barcodeType: "CODE128",
    source: "internal",
    isPrimary: false,
  });

  const rows = (data?.data ?? []) as BarcodeRow[];

  return (
    <div className="space-y-3">
      <form
        className="rounded border border-slate-200 bg-slate-50 p-2.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.barcode.trim()) return;
          try {
            await create.mutateAsync(form);
            setForm({
              barcode: "",
              barcodeType: "CODE128",
              source: "internal",
              isPrimary: false,
            });
            toast.success("Đã thêm barcode.");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      >
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-5">
            <Label>Mã vạch</Label>
            <Input
              value={form.barcode}
              onChange={(e) =>
                setForm((f) => ({ ...f, barcode: e.target.value }))
              }
              placeholder="8934567890123"
              required
            />
          </div>
          <div className="col-span-3">
            <Label>Loại</Label>
            <Select
              value={form.barcodeType}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, barcodeType: v as (typeof BARCODE_TYPES)[number] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BARCODE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-3">
            <Label>Nguồn</Label>
            <Select
              value={form.source}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, source: v as (typeof BARCODE_SOURCES)[number] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Nội bộ</SelectItem>
                <SelectItem value="vendor">Vendor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1 flex items-end">
            <Button
              type="submit"
              size="sm"
              disabled={create.isPending}
              className="w-full"
            >
              +
            </Button>
          </div>
        </div>
        <label className="mt-2 flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.isPrimary}
            onChange={(e) =>
              setForm((f) => ({ ...f, isPrimary: e.target.checked }))
            }
          />
          Đánh dấu là barcode chính
        </label>
      </form>

      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2 pr-2">Barcode</th>
            <th className="py-2 pr-2">Loại</th>
            <th className="py-2 pr-2">Nguồn</th>
            <th className="py-2 pr-2">Chính</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={5} className="py-3 text-center text-slate-500">
                Đang tải…
              </td>
            </tr>
          )}
          {!isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-3 text-center text-slate-500">
                Chưa có barcode nào.
              </td>
            </tr>
          )}
          {rows.map((b) => (
            <tr key={b.id} className="border-b border-slate-100">
              <td className="py-2 pr-2 font-mono text-slate-900">{b.barcode}</td>
              <td className="py-2 pr-2">
                <Badge variant="outline">{b.barcodeType}</Badge>
              </td>
              <td className="py-2 pr-2 text-slate-600">
                {b.source === "vendor" ? "Vendor" : "Nội bộ"}
              </td>
              <td className="py-2 pr-2">
                {b.isPrimary ? (
                  <Badge variant="success">Chính</Badge>
                ) : (
                  <button
                    type="button"
                    aria-label="Đặt làm barcode chính"
                    className="text-slate-400 hover:text-cta"
                    onClick={() => setPrimary.mutate(b.id)}
                  >
                    <Star className="h-4 w-4" />
                  </button>
                )}
              </td>
              <td className="py-2 text-right">
                <button
                  type="button"
                  aria-label="Xoá barcode"
                  className="text-slate-400 hover:text-danger"
                  onClick={() => {
                    if (confirm(`Xoá barcode "${b.barcode}"?`)) {
                      remove.mutate(b.id);
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
