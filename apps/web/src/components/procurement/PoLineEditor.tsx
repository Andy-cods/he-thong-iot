"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemPicker, type ItemPickerValue } from "@/components/bom/ItemPicker";

export interface PoLineDraft {
  localId: string;
  item: ItemPickerValue | null;
  qty: string;
  unitPrice: string;
  taxRate: string;
  neededBy?: string | null;
  notes?: string | null;
}

export interface PoLineEditorProps {
  lines: PoLineDraft[];
  onChange: (next: PoLineDraft[]) => void;
  disabled?: boolean;
}

function fmtVND(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("vi-VN");
}

function computeLineTotal(line: PoLineDraft): number {
  const qty = Number(line.qty) || 0;
  const price = Number(line.unitPrice) || 0;
  const tax = Number(line.taxRate) || 0;
  return qty * price * (1 + tax / 100);
}

/**
 * V1.9-P9 — PoLineEditor editable table.
 *
 * Cột: Vật tư (ItemPicker) / SL / ĐVT / Đơn giá / VAT% / Thành tiền / Action.
 * Footer: Subtotal + Tax + Grand total format VND.
 */
export function PoLineEditor({
  lines,
  onChange,
  disabled,
}: PoLineEditorProps) {
  const updateLine = (idx: number, patch: Partial<PoLineDraft>) => {
    const next = [...lines];
    next[idx] = { ...next[idx]!, ...patch };
    onChange(next);
  };

  const addLine = () => {
    onChange([
      ...lines,
      {
        localId: crypto.randomUUID(),
        item: null,
        qty: "1",
        unitPrice: "0",
        taxRate: "8",
      },
    ]);
  };

  const removeLine = (idx: number) => {
    const next = lines.filter((_, i) => i !== idx);
    onChange(next.length === 0 ? [emptyLine()] : next);
  };

  let subtotal = 0;
  let totalTax = 0;
  let grandTotal = 0;
  for (const l of lines) {
    const qty = Number(l.qty) || 0;
    const price = Number(l.unitPrice) || 0;
    const tax = Number(l.taxRate) || 0;
    const pre = qty * price;
    subtotal += pre;
    totalTax += pre * (tax / 100);
    grandTotal += pre * (1 + tax / 100);
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="w-8 px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Vật tư</th>
              <th className="w-24 px-2 py-2 text-right">SL</th>
              <th className="w-16 px-2 py-2 text-left">ĐVT</th>
              <th className="w-32 px-2 py-2 text-right">Đơn giá</th>
              <th className="w-20 px-2 py-2 text-right">VAT%</th>
              <th className="w-36 px-2 py-2 text-right">Thành tiền</th>
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={l.localId} className="border-t border-zinc-100">
                <td className="px-2 py-2 text-zinc-500">{idx + 1}</td>
                <td className="px-2 py-2">
                  <ItemPicker
                    value={l.item}
                    onChange={(v) => updateLine(idx, { item: v })}
                    disabled={disabled}
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={l.qty}
                    onChange={(e) => updateLine(idx, { qty: e.target.value })}
                    className="h-8 text-right tabular-nums"
                    disabled={disabled}
                  />
                </td>
                <td className="px-2 py-2 text-xs text-zinc-500">
                  {l.item?.uom ?? "—"}
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={l.unitPrice}
                    onChange={(e) =>
                      updateLine(idx, { unitPrice: e.target.value })
                    }
                    className="h-8 text-right tabular-nums"
                    disabled={disabled}
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={l.taxRate}
                    onChange={(e) =>
                      updateLine(idx, { taxRate: e.target.value })
                    }
                    className="h-8 text-right tabular-nums"
                    disabled={disabled}
                  />
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-zinc-900">
                  {fmtVND(computeLineTotal(l))}
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    disabled={disabled || lines.length === 1}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Xoá dòng"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-zinc-200 bg-zinc-50 text-sm">
            <tr>
              <td colSpan={6} className="px-3 py-2 text-right text-zinc-600">
                Tạm tính (chưa VAT):
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-zinc-900">
                {fmtVND(subtotal)}
              </td>
              <td />
            </tr>
            <tr>
              <td colSpan={6} className="px-3 py-2 text-right text-zinc-600">
                Tổng VAT:
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-zinc-900">
                {fmtVND(totalTax)}
              </td>
              <td />
            </tr>
            <tr className="border-t border-zinc-200">
              <td
                colSpan={6}
                className="px-3 py-2 text-right text-sm font-semibold text-zinc-900"
              >
                Tổng cộng:
              </td>
              <td className="px-2 py-2 text-right text-base font-semibold tabular-nums text-indigo-700">
                {fmtVND(grandTotal)} VND
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex justify-start">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addLine}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Thêm dòng
        </Button>
      </div>
    </div>
  );
}

export function emptyLine(): PoLineDraft {
  return {
    localId: crypto.randomUUID(),
    item: null,
    qty: "1",
    unitPrice: "0",
    taxRate: "8",
  };
}
