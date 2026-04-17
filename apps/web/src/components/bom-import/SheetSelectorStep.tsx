"use client";

import * as React from "react";
import { FileSpreadsheet } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { BomImportSheet } from "@/hooks/useBomImport";
import { cn } from "@/lib/utils";

export interface SheetSelectorStepProps {
  sheets: BomImportSheet[];
  selectedSheets: string[];
  onChange: (selected: string[]) => void;
}

/**
 * Step 2: Multi-select sheet với preview top-3 rows.
 * Mỗi sheet: checkbox + name + row count + title (nếu detect được) + preview.
 */
export function SheetSelectorStep({
  sheets,
  selectedSheets,
  onChange,
}: SheetSelectorStepProps) {
  const toggle = (name: string) => {
    if (selectedSheets.includes(name)) {
      onChange(selectedSheets.filter((s) => s !== name));
    } else {
      onChange([...selectedSheets, name]);
    }
  };

  const toggleAll = () => {
    if (selectedSheets.length === sheets.length) onChange([]);
    else onChange(sheets.map((s) => s.sheetName));
  };

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-md font-semibold text-zinc-900">
            Chọn sheet để import
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Mỗi sheet tương ứng 1 BOM template. Chọn các sheet cần nạp.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleAll}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          {selectedSheets.length === sheets.length
            ? "Bỏ chọn tất cả"
            : "Chọn tất cả"}
        </button>
      </header>

      <ul className="space-y-2">
        {sheets.map((s) => {
          const selected = selectedSheets.includes(s.sheetName);
          const preview = (s.previewRows ?? []).slice(0, 3);
          return (
            <li
              key={s.sheetName}
              className={cn(
                "rounded-md border bg-white transition-colors",
                selected
                  ? "border-blue-400 bg-blue-50/30"
                  : "border-zinc-200 hover:border-zinc-300",
              )}
            >
              <label className="flex cursor-pointer items-start gap-3 p-3">
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => toggle(s.sheetName)}
                  className="mt-0.5"
                  aria-label={`Chọn sheet ${s.sheetName}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet
                      className="h-3.5 w-3.5 text-emerald-600"
                      aria-hidden="true"
                    />
                    <span className="font-medium text-zinc-900">
                      {s.sheetName}
                    </span>
                    <span className="text-xs text-zinc-500 tabular-nums">
                      {s.rowCount.toLocaleString("vi-VN")} dòng
                    </span>
                  </div>
                  {s.topTitle && (
                    <p className="mt-0.5 text-xs italic text-zinc-500">
                      Tiêu đề dòng 1:{" "}
                      <span className="font-medium text-zinc-700">
                        {s.topTitle}
                      </span>{" "}
                      → sẽ tạo BOM mới
                    </p>
                  )}
                  {preview.length > 0 && (
                    <div className="mt-2 overflow-hidden rounded-sm border border-zinc-200">
                      <table className="w-full text-xs">
                        <tbody>
                          {preview.map((row, i) => (
                            <tr
                              key={i}
                              className="border-b border-zinc-100 last:border-0"
                            >
                              {(row as unknown[]).slice(0, 6).map((cell, j) => (
                                <td
                                  key={j}
                                  className="truncate border-r border-zinc-100 px-2 py-1 text-zinc-600 last:border-0"
                                  style={{ maxWidth: 120 }}
                                >
                                  {cell == null ? "" : String(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
