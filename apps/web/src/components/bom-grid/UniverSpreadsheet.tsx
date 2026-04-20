"use client";

import * as React from "react";
import { createUniver, LocaleType, merge } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsCoreViVN from "@univerjs/preset-sheets-core/locales/vi-VN";
import "@univerjs/presets/lib/styles/preset-sheets-core.css";

/**
 * V1.5 BOM Core — Trụ cột 2 — Univer Spreadsheet wrapper.
 *
 * CHỈ dùng qua `next/dynamic({ ssr: false })` — Univer touch `window`
 * ở import time, không safe SSR. Xem plans/bom-core-redesign/02-bom-grid-univer.md.
 *
 * Pattern tránh double-mount dưới React Strict Mode (dev):
 *   - Dùng ref guard `initedRef` để chỉ init 1 lần.
 *   - Cleanup gọi `univer.dispose()` để tránh "Plugin already registered".
 */

export interface UniverSpreadsheetProps {
  /** Snapshot ban đầu (IWorkbookData). Nếu undefined → tạo workbook rỗng. */
  initialSnapshot?: UniverWorkbookSnapshot;
  /** Gọi khi user kết thúc edit 1 cell (Enter/Tab). Dùng để debounce save. */
  onEdit?: (snapshot: UniverWorkbookSnapshot) => void;
  /** ClassName cho host div (mặc định fullscreen). */
  className?: string;
}

// Simplified snapshot type — full type là IWorkbookData (xem @univerjs/core).
export type UniverWorkbookSnapshot = Record<string, unknown>;

export interface UniverSpreadsheetHandle {
  /** Lấy snapshot JSON hiện tại của workbook. */
  save: () => UniverWorkbookSnapshot | null;
  /**
   * Append 1 dòng linh kiện từ master (Ctrl+Shift+A hoặc toolbar "+ Thêm").
   * Tìm dòng trống đầu tiên sau header → set values.
   */
  insertItemRow: (row: InsertableItemRow) => void;
}

export interface InsertableItemRow {
  sku: string;
  name: string;
  itemType: string; // FABRICATED | PURCHASED | ...
  category: string | null;
  uom: string;
}

export const UniverSpreadsheet = React.forwardRef<
  UniverSpreadsheetHandle,
  UniverSpreadsheetProps
>(function UniverSpreadsheet({ initialSnapshot, onEdit, className }, ref) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const apiRef = React.useRef<ReturnType<typeof createUniver>["univerAPI"] | null>(null);
  const univerRef = React.useRef<ReturnType<typeof createUniver>["univer"] | null>(null);
  const initedRef = React.useRef(false);
  /** Row counter để append dòng mới — tránh dò Univer API getLastRow. */
  const nextInsertRowRef = React.useRef(21);

  React.useImperativeHandle(
    ref,
    () => ({
      save: () => {
        const api = apiRef.current;
        if (!api) return null;
        const wb = api.getActiveWorkbook();
        return wb ? (wb.save() as unknown as UniverWorkbookSnapshot) : null;
      },
      insertItemRow: (row: InsertableItemRow) => {
        const api = apiRef.current;
        if (!api) return;
        const wb = api.getActiveWorkbook();
        const sheet = wb?.getActiveSheet();
        if (!sheet) return;

        // Counter nội bộ — row tiếp theo để thêm (start 22 = end of init data).
        // User có thể scroll xuống để thấy. V2: smarter auto-detect last row.
        nextInsertRowRef.current = Math.max(22, nextInsertRowRef.current + 1);
        const targetRow = nextInsertRowRef.current;

        const kindIcon = row.itemType === "FABRICATED" ? "🔧" : "🛒";
        const kindText =
          row.itemType === "FABRICATED" ? "Gia công" : "Thương mại";

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const s = sheet as any;
          const range = s.getRange(targetRow, 0, 1, 11);
          range?.setValues?.([
            [
              "",
              `   ${row.sku}`,
              row.name,
              `${kindIcon} ${kindText}`,
              row.category ?? "",
              "",
              1,
              "",
              `=G${targetRow + 1}*$K$1`,
              0,
              "",
            ],
          ]);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[Univer] insertItemRow failed:", err);
        }
      },
    }),
    [],
  );

  React.useEffect(() => {
    if (initedRef.current) return;
    if (!hostRef.current) return;
    initedRef.current = true;

    const { univer, univerAPI } = createUniver({
      locale: LocaleType.VI_VN,
      locales: {
        [LocaleType.VI_VN]: merge({}, sheetsCoreViVN),
      },
      presets: [
        UniverSheetsCorePreset({
          container: hostRef.current,
        }),
      ],
    });

    apiRef.current = univerAPI;
    univerRef.current = univer;

    // Create workbook (with or without initial snapshot).
    const wbData = initialSnapshot ?? {
      id: "bom-workbook",
      name: "BOM",
    };
    univerAPI.createUniverSheet(wbData as never);

    // Listen edit end event → fire onEdit with fresh snapshot.
    const sub = univerAPI.addEvent(
      univerAPI.Event.SheetEditEnded,
      (params: { isConfirm?: boolean }) => {
        if (!onEdit) return;
        if (!params.isConfirm) return; // bỏ qua ESC
        const wb = univerAPI.getActiveWorkbook();
        if (!wb) return;
        onEdit(wb.save() as unknown as UniverWorkbookSnapshot);
      },
    );

    return () => {
      sub?.dispose?.();
      univer.dispose();
      apiRef.current = null;
      univerRef.current = null;
      initedRef.current = false;
    };
    // Effect chỉ chạy 1 lần; initialSnapshot/onEdit thay đổi sẽ không re-init.
    // Nếu cần reload snapshot, caller phải remount component (thay key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={hostRef}
      className={className ?? "h-full w-full"}
      style={{ minHeight: 400 }}
    />
  );
});
