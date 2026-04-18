"use client";

import * as React from "react";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ItemPicker, type ItemPickerValue } from "@/components/bom/ItemPicker";

export interface PRLineDraft {
  localId: string;
  item: ItemPickerValue | null;
  qty: string;
  preferredSupplierId?: string | null;
  neededBy?: string;
  notes?: string;
}

export interface PRLineEditorProps {
  lines: PRLineDraft[];
  onChange: (lines: PRLineDraft[]) => void;
  disabled?: boolean;
}

/**
 * PRLineEditor — table grid input với nút thêm/xoá dòng.
 * Cho mỗi dòng: ItemPicker + qty + needed_by (date) + notes.
 * Supplier picker V1.2: optional field, để trống -> FE/BE dùng item_supplier preferred.
 */
export function PRLineEditor({ lines, onChange, disabled }: PRLineEditorProps) {
  const addLine = () => {
    const next: PRLineDraft[] = [
      ...lines,
      {
        localId: crypto.randomUUID(),
        item: null,
        qty: "1",
      },
    ];
    onChange(next);
  };

  const removeLine = (localId: string) => {
    onChange(lines.filter((l) => l.localId !== localId));
  };

  const patchLine = (localId: string, patch: Partial<PRLineDraft>) => {
    onChange(
      lines.map((l) => (l.localId === localId ? { ...l, ...patch } : l)),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label uppercase>Dòng hàng ({lines.length})</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addLine}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Thêm dòng
        </Button>
      </div>

      {lines.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
          Chưa có dòng nào. Bấm "Thêm dòng" để bắt đầu.
        </p>
      ) : (
        <div className="space-y-2">
          {lines.map((l, idx) => (
            <div
              key={l.localId}
              className="grid grid-cols-[1fr_120px_140px_minmax(0,1fr)_40px] items-end gap-2 rounded-md border border-zinc-200 bg-white p-3"
            >
              <div className="space-y-1">
                <Label
                  htmlFor={`pr-item-${idx}`}
                  uppercase
                  required
                >
                  Vật tư
                </Label>
                <ItemPicker
                  id={`pr-item-${idx}`}
                  value={l.item}
                  onChange={(v) => patchLine(l.localId, { item: v })}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor={`pr-qty-${idx}`}
                  uppercase
                  required
                >
                  Số lượng
                </Label>
                <Input
                  id={`pr-qty-${idx}`}
                  type="number"
                  min={0.0001}
                  step={0.0001}
                  value={l.qty}
                  onChange={(e) => patchLine(l.localId, { qty: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`pr-needed-${idx}`} uppercase>
                  Cần vào ngày
                </Label>
                <Input
                  id={`pr-needed-${idx}`}
                  type="date"
                  value={l.neededBy ?? ""}
                  onChange={(e) =>
                    patchLine(l.localId, { neededBy: e.target.value })
                  }
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`pr-notes-${idx}`} uppercase>
                  Ghi chú
                </Label>
                <Input
                  id={`pr-notes-${idx}`}
                  value={l.notes ?? ""}
                  onChange={(e) =>
                    patchLine(l.localId, { notes: e.target.value })
                  }
                  disabled={disabled}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeLine(l.localId)}
                aria-label="Xoá dòng"
                disabled={disabled}
                className="text-zinc-500 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
