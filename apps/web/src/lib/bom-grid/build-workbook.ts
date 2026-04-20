import {
  BOM_COLUMN_HEADERS,
  Z502653_PARENT_NAME,
  Z502653_PARENT_QTY,
  Z502653_ROWS,
} from "./sample-z502653";
import type { UniverWorkbookSnapshot } from "@/components/bom-grid/UniverSpreadsheet";

/**
 * V1.5 Trụ cột 2 POC — build IWorkbookData cho Univer từ mock BOM.
 *
 * Layout giống Excel thực tế:
 *   R0: tiêu đề BOM + cột "Số lượng" + qty parent (merge A..G)
 *   R1: header cột (Ảnh | Mã | SL/bộ | Mã TC | Nhóm | NCC | KT | Tổng | Ghi chú)
 *   R2+: component rows
 *
 * Freeze 2 hàng đầu. Header bold, bg zinc-100.
 */

const HEADER_STYLE_ID = "s-header";
const TITLE_STYLE_ID = "s-title";
const NOTE_STYLE_ID = "s-note";

function cell(value: string | number | null, styleId?: string) {
  const c: Record<string, unknown> = { v: value ?? "" };
  if (styleId) c.s = styleId;
  return c;
}

export function buildZ502653Workbook(): UniverWorkbookSnapshot {
  const cellData: Record<number, Record<number, unknown>> = {};

  // R0 — tiêu đề BOM (A0..G0 merge, H0 "Số lượng", I0 = qty parent)
  cellData[0] = {
    0: cell(Z502653_PARENT_NAME, TITLE_STYLE_ID),
    7: cell("Số lượng parent:", TITLE_STYLE_ID),
    8: cell(Z502653_PARENT_QTY, TITLE_STYLE_ID),
  };

  // R1 — headers
  cellData[1] = {};
  BOM_COLUMN_HEADERS.forEach((h, idx) => {
    cellData[1]![idx] = cell(h, HEADER_STYLE_ID);
  });

  // R2+ — component rows
  Z502653_ROWS.forEach((row, i) => {
    const r = i + 2;
    cellData[r] = {
      0: cell(""), // ảnh — phase sau
      1: cell(row.id),
      2: cell(row.quantity),
      3: cell(row.standardNumber),
      4: cell(row.subCategory),
      5: cell(row.supplier),
      6: cell(row.visiblePartSize),
      // Tổng SL = SL/bộ × qty parent (formula tự tính trong Univer)
      7: { f: `=C${r + 1}*$I$1` },
      8: cell(row.note, NOTE_STYLE_ID),
    };
  });

  const totalRows = Z502653_ROWS.length + 2;

  return {
    id: "bom-z502653",
    name: Z502653_PARENT_NAME,
    appVersion: "0.21.0",
    locale: "viVN",
    sheetOrder: ["sheet-main"],
    sheets: {
      "sheet-main": {
        id: "sheet-main",
        name: "Z0000002-502653 BOM",
        tabColor: "",
        hidden: 0,
        freeze: { xSplit: 0, ySplit: 2, startRow: 2, startColumn: 0 },
        rowCount: Math.max(totalRows + 20, 50),
        columnCount: 12,
        zoomRatio: 1,
        scrollTop: 0,
        scrollLeft: 0,
        defaultColumnWidth: 100,
        defaultRowHeight: 24,
        mergeData: [
          // Merge title row A0..G0
          { startRow: 0, startColumn: 0, endRow: 0, endColumn: 6 },
        ],
        cellData,
        rowData: {
          0: { h: 32 },
          1: { h: 28 },
        },
        columnData: {
          0: { w: 60 }, // Ảnh
          1: { w: 70 }, // Mã
          2: { w: 70 }, // SL/bộ
          3: { w: 200 }, // Mã tiêu chuẩn
          4: { w: 200 }, // Nhóm / Vật liệu
          5: { w: 110 }, // NCC
          6: { w: 160 }, // Kích thước
          7: { w: 90 }, // Tổng SL
          8: { w: 260 }, // Ghi chú
        },
        showGridlines: 1,
        rowHeader: { visible: true, width: 46 },
        columnHeader: { visible: true, height: 20 },
        selections: ["A1"],
        rightToLeft: 0,
      },
    },
    styles: {
      [HEADER_STYLE_ID]: {
        bg: { rgb: "#F4F4F5" },
        bl: 1,
        vt: 2,
        ht: 2,
        bd: {
          b: { s: 1, cl: { rgb: "#E4E4E7" } },
        },
      },
      [TITLE_STYLE_ID]: {
        bl: 1,
        fs: 13,
        vt: 2,
      },
      [NOTE_STYLE_ID]: {
        cl: { rgb: "#52525B" },
        it: 1,
      },
    },
    resources: [],
  };
}
