"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemPicker, type ItemPickerValue } from "@/components/bom/ItemPicker";
import { formatMoney } from "@/lib/format";

export interface PoLineDraft {
  localId: string;
  item: ItemPickerValue | null;
  qty: string;
  unitPrice: string;
  taxRate: string;
  neededBy?: string | null;
  notes?: string | null;
  /** V4.1 TM-10 — mang từ dòng PR (liên kết snapshot + quy cách DNVT). */
  snapshotLineId?: string | null;
  spec?: string | null;
}

export interface PoLineEditorProps {
  lines: PoLineDraft[];
  onChange: (next: PoLineDraft[]) => void;
  disabled?: boolean;
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
      {/* Desktop/tablet — bảng đầy đủ. */}
      <div className="hidden overflow-x-auto rounded-md border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
            <tr>
              <th className="w-8 px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Vật tư</th>
              <th className="min-w-[96px] px-2 py-2 text-right">SL</th>
              <th className="min-w-[72px] px-2 py-2 text-left">ĐVT</th>
              <th className="min-w-[128px] px-2 py-2 text-right">Đơn giá</th>
              <th className="min-w-[80px] px-2 py-2 text-right">VAT%</th>
              <th className="min-w-[144px] px-2 py-2 text-right">Thành tiền</th>
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={l.localId} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-2 py-2 text-zinc-500 dark:text-zinc-400">{idx + 1}</td>
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
                <td className="px-2 py-2 text-xs text-zinc-500 dark:text-zinc-400">
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
                <td className="px-2 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-50">
                  {formatMoney(computeLineTotal(l))}
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    disabled={disabled || lines.length === 1}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    aria-label="Xoá dòng"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-zinc-200 bg-zinc-50 text-sm dark:border-zinc-700 dark:bg-zinc-800">
            <tr>
              <td colSpan={6} className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">
                Tạm tính (chưa VAT):
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatMoney(subtotal)}
              </td>
              <td />
            </tr>
            <tr>
              <td colSpan={6} className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">
                Tổng VAT:
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatMoney(totalTax)}
              </td>
              <td />
            </tr>
            <tr className="border-t border-zinc-200 dark:border-zinc-700">
              <td
                colSpan={6}
                className="px-3 py-2 text-right text-sm font-semibold text-zinc-900 dark:text-zinc-50"
              >
                Tổng cộng:
              </td>
              <td className="px-2 py-2 text-right text-base font-semibold tabular-nums text-indigo-700 dark:text-indigo-400">
                {formatMoney(grandTotal)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile — dòng hàng thành card (chuẩn N9), thay bảng cuộn ngang. */}
      <div className="space-y-3 md:hidden">
        {lines.map((l, idx) => (
          <div
            key={l.localId}
            className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="mt-2 shrink-0 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                #{idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <ItemPicker
                  value={l.item}
                  onChange={(v) => updateLine(idx, { item: v })}
                  disabled={disabled}
                />
              </div>
              <button
                type="button"
                onClick={() => removeLine(idx)}
                disabled={disabled || lines.length === 1}
                className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                aria-label={`Xoá dòng ${idx + 1}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  SL {l.item?.uom ? `(${l.item.uom})` : ""}
                </span>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={l.qty}
                  onChange={(e) => updateLine(idx, { qty: e.target.value })}
                  className="h-9 text-right tabular-nums"
                  disabled={disabled}
                  aria-label={`Số lượng dòng ${idx + 1}`}
                />
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Đơn giá
                </span>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={l.unitPrice}
                  onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                  className="h-9 text-right tabular-nums"
                  disabled={disabled}
                  aria-label={`Đơn giá dòng ${idx + 1}`}
                />
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  VAT%
                </span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={l.taxRate}
                  onChange={(e) => updateLine(idx, { taxRate: e.target.value })}
                  className="h-9 text-right tabular-nums"
                  disabled={disabled}
                  aria-label={`VAT phần trăm dòng ${idx + 1}`}
                />
              </label>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-100 pt-2 text-sm dark:border-zinc-800">
              <span className="text-zinc-500 dark:text-zinc-400">Thành tiền</span>
              <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatMoney(computeLineTotal(l))}
              </span>
            </div>
          </div>
        ))}

        {/* Tổng — gọn trên mobile, cùng số liệu với tfoot bảng desktop. */}
        <div className="space-y-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-800/60">
          <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
            <span>Tạm tính (chưa VAT)</span>
            <span className="tabular-nums text-zinc-900 dark:text-zinc-50">{formatMoney(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
            <span>Tổng VAT</span>
            <span className="tabular-nums text-zinc-900 dark:text-zinc-50">{formatMoney(totalTax)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200 pt-1.5 font-semibold dark:border-zinc-700">
            <span className="text-zinc-900 dark:text-zinc-50">Tổng cộng</span>
            <span className="tabular-nums text-indigo-700 dark:text-indigo-400">{formatMoney(grandTotal)}</span>
          </div>
        </div>
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
