import {
  BOM_COLUMN_HEADERS,
  KIND_LABEL,
  Z502653_PARENT_NAME,
  Z502653_PARENT_QTY,
  Z502653_ROWS,
} from "./sample-z502653";
import type { BomTemplateDetail, BomTreeNodeRaw } from "@/hooks/useBom";
import type { UniverWorkbookSnapshot } from "@/components/bom-grid/UniverSpreadsheet";

/**
 * V1.5 Trụ cột 2 — build IWorkbookData Univer cho BOM Grid.
 *
 * Layout 11 cột (update 2026-04-20 theo feedback anh Hoạt):
 *   R0: tiêu đề BOM (merge A..F) + "Số lượng parent" + qty
 *   R1: header cột
 *   R2+: dữ liệu — depth=1 là cụm (group header merge, bold, nền xám),
 *        depth=2 là linh kiện (row banding theo cặp).
 *
 * Freeze: 2 hàng trên (header) + 2 cột trái (ảnh + mã).
 * Formula cột "Tổng SL" = SL/bộ × qty parent (ô $I$1).
 *
 * Styles ID:
 *   s-title      : tiêu đề BOM
 *   s-header     : header cột
 *   s-group      : dòng cụm lắp (depth=1)
 *   s-band       : dòng lẻ row banding
 *   s-fab        : nền xanh lá nhạt (Gia công)
 *   s-com        : nền xanh dương nhạt (Thương mại)
 *   s-note       : ghi chú (italic gray)
 *   s-percent    : cột hao hụt (format %)
 *   s-formula    : cột tổng SL (bold, tabular)
 */

const STYLE = {
  title: "s-title",
  header: "s-header",
  group: "s-group",
  band: "s-band",
  fab: "s-fab",
  com: "s-com",
  note: "s-note",
  percent: "s-percent",
  formula: "s-formula",
  sku: "s-sku", // SKU mono column (V1.7)
  skuBand: "s-sku-band", // SKU + row banding combined (V1.7)
  qty: "s-qty", // Số lượng tabular mono (V1.7)
  qtyBand: "s-qty-band",
} as const;

function cell(value: string | number | null, styleId?: string) {
  const c: Record<string, unknown> = { v: value ?? "" };
  if (styleId) c.s = styleId;
  return c;
}

function formula(expr: string, styleId?: string) {
  const c: Record<string, unknown> = { f: expr };
  if (styleId) c.s = styleId;
  return c;
}

export function buildZ502653Workbook(): UniverWorkbookSnapshot {
  const cellData: Record<number, Record<number, unknown>> = {};
  const mergeData: Array<{
    startRow: number;
    startColumn: number;
    endRow: number;
    endColumn: number;
  }> = [];

  // ─────────────────────────────────────────────────────────
  // R0 — Tiêu đề BOM
  // ─────────────────────────────────────────────────────────
  cellData[0] = {
    0: cell(Z502653_PARENT_NAME, STYLE.title),
    8: cell("Số lượng parent:", STYLE.title),
    10: cell(Z502653_PARENT_QTY, STYLE.title),
  };
  mergeData.push({ startRow: 0, startColumn: 0, endRow: 0, endColumn: 7 });

  // ─────────────────────────────────────────────────────────
  // R1 — Header cột
  // ─────────────────────────────────────────────────────────
  cellData[1] = {};
  BOM_COLUMN_HEADERS.forEach((h, idx) => {
    cellData[1]![idx] = cell(h, STYLE.header);
  });

  // ─────────────────────────────────────────────────────────
  // R2+ — Dữ liệu
  // ─────────────────────────────────────────────────────────
  let dataRowIdx = 0; // đếm dòng linh kiện (không tính group) để banding
  Z502653_ROWS.forEach((row, i) => {
    const r = i + 2;

    if (row.kind === "group") {
      // Group header: merge cột 1..10 hiển thị "📁 Tên cụm (n linh kiện)"
      cellData[r] = {
        0: cell(""),
        1: cell(
          `${KIND_LABEL.group.icon}  ${row.name}${row.note ? ` — ${row.note}` : ""}`,
          STYLE.group,
        ),
      };
      mergeData.push({ startRow: r, startColumn: 1, endRow: r, endColumn: 10 });
      return;
    }

    // Data row (depth=2) — row banding
    const bandStyle = dataRowIdx % 2 === 1 ? STYLE.band : undefined;
    const kindIcon = KIND_LABEL[row.kind].icon;
    const kindText = KIND_LABEL[row.kind].text;
    const kindStyle = row.kind === "fab" ? STYLE.fab : STYLE.com;

    cellData[r] = {
      0: cell("", bandStyle), // ảnh phase sau
      1: cell(`   ${row.id}`, bandStyle), // indent 3 spaces để thể hiện nested
      2: cell(row.name, bandStyle),
      3: cell(`${kindIcon} ${kindText}`, kindStyle),
      4: cell(row.category, bandStyle),
      5: cell(row.supplier, bandStyle),
      6: cell(row.quantity, bandStyle),
      7: cell(row.visiblePartSize, bandStyle),
      // Tổng SL = SL/bộ × parent qty. Cell $K$1 chứa qty parent (row 0, col 10).
      8: formula(`=G${r + 1}*$K$1`, STYLE.formula),
      // Hao hụt: lưu dạng decimal (0.03) để format "%" hiển thị đúng 3.0%.
      9: cell(row.scrapPercent / 100, STYLE.percent),
      10: cell(row.note, STYLE.note),
    };
    dataRowIdx++;
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
        name: "Z0000002-502653",
        tabColor: "",
        hidden: 0,
        freeze: { xSplit: 2, ySplit: 2, startRow: 2, startColumn: 2 },
        rowCount: Math.max(totalRows + 30, 60),
        columnCount: 14,
        zoomRatio: 1,
        scrollTop: 0,
        scrollLeft: 0,
        defaultColumnWidth: 100,
        defaultRowHeight: 26,
        mergeData,
        cellData,
        rowData: {
          0: { h: 36 },
          1: { h: 30 },
        },
        columnData: {
          0: { w: 50 }, // Ảnh
          1: { w: 90 }, // Mã linh kiện
          2: { w: 240 }, // Tên
          3: { w: 130 }, // Loại
          4: { w: 180 }, // Vật liệu
          5: { w: 100 }, // NCC
          6: { w: 70 }, // SL/bộ
          7: { w: 160 }, // Kích thước
          8: { w: 85 }, // Tổng SL
          9: { w: 90 }, // Hao hụt %
          10: { w: 240 }, // Ghi chú
        },
        showGridlines: 1,
        rowHeader: { visible: true, width: 46 },
        columnHeader: { visible: true, height: 22 },
        selections: ["B3"],
        rightToLeft: 0,
      },
    },
    styles: {
      [STYLE.title]: {
        bl: 1,
        fs: 13,
        vt: 2,
      },
      [STYLE.header]: {
        bg: { rgb: "#18181B" },
        cl: { rgb: "#FAFAFA" },
        bl: 1,
        fs: 12,
        vt: 2,
        ht: 2,
        bd: {
          b: { s: 1, cl: { rgb: "#27272A" } },
        },
      },
      [STYLE.group]: {
        bg: { rgb: "#E4E4E7" },
        bl: 1,
        fs: 12,
        cl: { rgb: "#18181B" },
        vt: 2,
      },
      [STYLE.band]: {
        bg: { rgb: "#F9FAFB" },
      },
      [STYLE.fab]: {
        bg: { rgb: "#DCFCE7" }, // xanh lá nhạt — Gia công
        cl: { rgb: "#166534" },
        bl: 1,
      },
      [STYLE.com]: {
        bg: { rgb: "#DBEAFE" }, // xanh dương nhạt — Thương mại
        cl: { rgb: "#1E40AF" },
        bl: 1,
      },
      [STYLE.note]: {
        cl: { rgb: "#71717A" },
        it: 1,
      },
      [STYLE.percent]: {
        n: { pattern: "0.0%" },
        ht: 3, // right-align
      },
      [STYLE.formula]: {
        bl: 1,
        ht: 3,
        cl: { rgb: "#0F172A" },
      },
    },
    resources: [],
  };
}

/**
 * Builder generic — tạo IWorkbookData từ DB template + bomLines tree.
 * Dùng cho production /bom/[id]/grid page khi chưa có Univer snapshot.
 *
 * Mapping:
 *   level=1 + childCount>0  → group header row (xám, merge cột 1-10)
 *   mọi node còn lại        → component row (row banding, icon loại)
 */
export function buildWorkbookFromTemplate(
  template: Pick<BomTemplateDetail, "id" | "code" | "name" | "targetQty">,
  tree: BomTreeNodeRaw[],
): UniverWorkbookSnapshot {
  const parentQty = Number(template.targetQty) || 1;
  const parentLabel = `${template.code} — ${template.name}`;

  const cellData: Record<number, Record<number, unknown>> = {};
  const mergeData: Array<{
    startRow: number; startColumn: number; endRow: number; endColumn: number;
  }> = [];

  // R0 — Tiêu đề
  cellData[0] = {
    0: cell(parentLabel, STYLE.title),
    8: cell("Số lượng parent:", STYLE.title),
    10: cell(parentQty, STYLE.title),
  };
  mergeData.push({ startRow: 0, startColumn: 0, endRow: 0, endColumn: 7 });

  // R1 — Header cột
  cellData[1] = {};
  BOM_COLUMN_HEADERS.forEach((h, idx) => {
    cellData[1]![idx] = cell(h, STYLE.header);
  });

  // V1.7 — Recursive flatten đầy đủ mọi depth (P0 fix: BOM sâu > 2 level
  // trước đây bị cắt — chỉ render root + direct children).
  // Quy tắc: node có con → render là "group header", node lá → render data row.
  // Indent SKU theo depth để mắt người dùng thấy hierarchy trong grid phẳng.
  const childrenMap = new Map<string | null, BomTreeNodeRaw[]>();
  for (const n of tree) {
    const key = n.parentLineId;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(n);
  }
  // ORDER BY level,position đã có từ server nhưng vẫn sort phòng hờ.
  childrenMap.forEach((arr) => arr.sort((a, b) => a.position - b.position));

  interface Flat {
    node: BomTreeNodeRaw;
    isGroup: boolean;
    depth: number;
  }
  const ordered: Flat[] = [];
  const dfs = (parentId: string | null, depth: number) => {
    const children = childrenMap.get(parentId) ?? [];
    for (const n of children) {
      const isGroup = n.childCount > 0;
      ordered.push({ node: n, isGroup, depth });
      if (isGroup) dfs(n.id, depth + 1);
    }
  };
  dfs(null, 0);

  let dataRowIdx = 0;
  ordered.forEach(({ node, isGroup, depth }, i) => {
    const r = i + 2;
    if (isGroup) {
      const childCount = childrenMap.get(node.id)?.length ?? 0;
      // Indent theo depth: L1=0 space, L2=2 space, ... (dễ nhận ra cấp trong grid).
      const indent = "  ".repeat(depth);
      cellData[r] = {
        0: cell(""),
        1: cell(
          `${indent}${KIND_LABEL.group.icon}  ${node.componentName ?? node.componentSku ?? node.id}  (${childCount} linh kiện)`,
          STYLE.group,
        ),
      };
      mergeData.push({ startRow: r, startColumn: 1, endRow: r, endColumn: 10 });
      return;
    }

    const bandStyle = dataRowIdx % 2 === 1 ? STYLE.band : undefined;
    const itype = (node.componentItemType ?? "").toUpperCase();
    const isFab = itype === "FABRICATED" || itype === "SUB_ASSEMBLY";
    const kindIcon = isFab ? KIND_LABEL.fab.icon : KIND_LABEL.com.icon;
    const kindText = isFab ? KIND_LABEL.fab.text : KIND_LABEL.com.text;
    const kindStyle = isFab ? STYLE.fab : STYLE.com;
    // Indent SKU theo depth × 3 spaces để leaf sâu vẫn có hệ phân cấp rõ.
    const skuIndent = "   ".repeat(Math.max(depth, 1));

    // V1.7 — SKU và SL/bộ dùng font mono để ngay hàng các ký tự; các cột khác Inter.
    const isBand = dataRowIdx % 2 === 1;
    const skuStyle = isBand ? STYLE.skuBand : STYLE.sku;
    const qtyStyle = isBand ? STYLE.qtyBand : STYLE.qty;
    cellData[r] = {
      0: cell("", bandStyle),
      1: cell(`${skuIndent}${node.componentSku ?? ""}`, skuStyle),
      2: cell(node.componentName ?? "", bandStyle),
      3: cell(`${kindIcon} ${kindText}`, kindStyle),
      4: cell(node.componentCategory ?? "", bandStyle),
      5: cell(node.supplierItemCode ?? "", bandStyle),
      6: cell(Number(node.qtyPerParent) || 1, qtyStyle),
      7: cell("", bandStyle),
      8: formula(`=G${r + 1}*$K$1`, STYLE.formula),
      9: cell(Number(node.scrapPercent) / 100, STYLE.percent),
      10: cell(node.description ?? "", STYLE.note),
    };
    dataRowIdx++;
  });

  const totalRows = ordered.length + 2;

  return {
    id: `bom-${template.id}`,
    name: template.code,
    appVersion: "0.21.0",
    locale: "viVN",
    sheetOrder: ["sheet-main"],
    sheets: {
      "sheet-main": {
        id: "sheet-main",
        name: template.code,
        tabColor: "",
        hidden: 0,
        freeze: { xSplit: 2, ySplit: 2, startRow: 2, startColumn: 2 },
        rowCount: Math.max(totalRows + 30, 60),
        columnCount: 14,
        zoomRatio: 1,
        scrollTop: 0,
        scrollLeft: 0,
        defaultColumnWidth: 108,
        defaultRowHeight: 28,
        mergeData,
        cellData,
        rowData: { 0: { h: 40 }, 1: { h: 32 } },
        // V1.7-beta column width tuning (brainstorm kind-routing §1).
        // Tổng 1682→1584px. Tăng SKU (140) chứa C1609-24-P-00154 đủ; Loại
        // (150) chừa caret dropdown V1.7-beta; Ghi chú (290) wrap 2 dòng.
        // Giảm Kích thước (140), Vật liệu (180), Tổng/Hao hụt (80).
        columnData: {
          0: { w: 52 }, // Ảnh
          1: { w: 140 }, // Mã linh kiện (mono, chứa 16 chars)
          2: { w: 260 }, // Tên / Mô tả
          3: { w: 150 }, // Loại (+caret dropdown)
          4: { w: 180 }, // Vật liệu / Nhóm
          5: { w: 120 }, // NCC
          6: { w: 72 }, // SL/bộ
          7: { w: 140 }, // Kích thước
          8: { w: 80 }, // Tổng SL
          9: { w: 80 }, // Hao hụt %
          10: { w: 290 }, // Ghi chú (wrap 2 dòng)
        },
        showGridlines: 1,
        rowHeader: { visible: true, width: 48 },
        columnHeader: { visible: true, height: 24 },
        selections: ["B3"],
        rightToLeft: 0,
      },
    },
    // V1.7 redesign — font stack Inter (UI) + JetBrains Mono (mã + số).
    // Header zinc-900 trắng đậm → nền zinc-50 border-b rất chuyên nghiệp kiểu Linear/Vercel.
    styles: {
      [STYLE.title]: {
        ff: "Inter, ui-sans-serif, system-ui, sans-serif",
        bl: 1,
        fs: 14,
        cl: { rgb: "#0F172A" },
        vt: 2,
      },
      [STYLE.header]: {
        ff: "Inter, ui-sans-serif, system-ui, sans-serif",
        bg: { rgb: "#F4F4F5" },
        cl: { rgb: "#27272A" },
        bl: 1,
        fs: 10, // V1.7-beta: 11→10 để không đè bóng border header
        vt: 2,
        ht: 2,
        bd: {
          b: { s: 2, cl: { rgb: "#27272A" } },
          t: { s: 1, cl: { rgb: "#D4D4D8" } },
        },
      },
      [STYLE.group]: {
        ff: "Inter, ui-sans-serif, system-ui, sans-serif",
        bg: { rgb: "#EEF2FF" },
        bl: 1,
        fs: 13,
        cl: { rgb: "#3730A3" },
        vt: 2,
        bd: {
          t: { s: 1, cl: { rgb: "#C7D2FE" } },
          b: { s: 1, cl: { rgb: "#C7D2FE" } },
        },
      },
      [STYLE.band]: {
        ff: "Inter, ui-sans-serif, system-ui, sans-serif",
        bg: { rgb: "#FAFAFA" },
      },
      [STYLE.fab]: {
        ff: "Inter, ui-sans-serif, system-ui, sans-serif",
        bg: { rgb: "#DCFCE7" },
        cl: { rgb: "#14532D" },
        bl: 1,
        fs: 12,
        ht: 2,
      },
      [STYLE.com]: {
        ff: "Inter, ui-sans-serif, system-ui, sans-serif",
        bg: { rgb: "#DBEAFE" },
        cl: { rgb: "#1E3A8A" },
        bl: 1,
        fs: 12,
        ht: 2,
      },
      [STYLE.note]: {
        ff: "Inter, ui-sans-serif, system-ui, sans-serif",
        cl: { rgb: "#71717A" },
        it: 1,
        fs: 12,
      },
      [STYLE.percent]: {
        ff: "JetBrains Mono, ui-monospace, monospace",
        n: { pattern: "0.0%" },
        ht: 3,
        cl: { rgb: "#ea580c" },
      },
      [STYLE.formula]: {
        ff: "JetBrains Mono, ui-monospace, monospace",
        bl: 1,
        ht: 3,
        cl: { rgb: "#0F172A" },
      },
      [STYLE.sku]: {
        ff: "JetBrains Mono, ui-monospace, monospace",
        fs: 12,
        cl: { rgb: "#18181B" },
      },
      [STYLE.skuBand]: {
        ff: "JetBrains Mono, ui-monospace, monospace",
        fs: 12,
        cl: { rgb: "#18181B" },
        bg: { rgb: "#FAFAFA" },
      },
      [STYLE.qty]: {
        ff: "JetBrains Mono, ui-monospace, monospace",
        fs: 12,
        ht: 3,
        cl: { rgb: "#27272A" },
      },
      [STYLE.qtyBand]: {
        ff: "JetBrains Mono, ui-monospace, monospace",
        fs: 12,
        ht: 3,
        cl: { rgb: "#27272A" },
        bg: { rgb: "#FAFAFA" },
      },
    },
    resources: [],
  };
}
