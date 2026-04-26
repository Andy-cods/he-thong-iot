/**
 * V2.0 Sprint 6 — Seed BOM List multi-sheet từ file Excel "Bản chính thức"
 *
 * Đọc 1 file Excel với 3 sheets:
 *   - Sheet 1, 2: BOM project (R01, S01...) — cấu trúc sản phẩm
 *   - Sheet 3 "Material&Process": master vật liệu + quy trình
 *
 * Tạo:
 *   - 1 bom_template (BOM List parent) với code = title file
 *   - N bom_sheet kind=PROJECT cho mỗi sheet BOM project + bom_lines (auto-create
 *     items mới qua SKU lookup, link sheet_id)
 *   - 1 bom_sheet kind=MATERIAL với rows auto-populated từ distinct material codes
 *     dùng trong sheet PROJECT (price snapshot từ master)
 *   - 1 bom_sheet kind=PROCESS với rows auto-populated từ distinct process codes
 *
 * Cách chạy:
 *   pnpm --filter @iot/db seed:bom-excel "/path/to/Bản chính thức.xlsx"
 *
 * Hoặc:
 *   DATABASE_URL=... tsx packages/db/src/seed-bom-multi-sheet.ts /path/to/file.xlsx
 *
 * Idempotent: nếu BOM code đã tồn tại → skip + log warning, không xóa data cũ.
 *
 * Refs: plans/redesign-v3/sprint-6-fix-material-per-bom.md §6 Importer V2 flow
 */

import "dotenv/config";
import path from "node:path";
import ExcelJS from "exceljs";
import { eq, sql } from "drizzle-orm";
import { createDbClient } from "./client";
import {
  bomLine,
  bomSheet,
  bomSheetMaterialRow,
  bomSheetProcessRow,
  bomTemplate,
  item,
  materialMaster,
  processMaster,
} from "./schema";

// ---------------------------------------------------------------------------
// Excel parsing helpers (subset of bomImportParser logic)
// ---------------------------------------------------------------------------

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("text" in o) return String(o.text ?? "");
    if ("result" in o) return String(o.result ?? "");
    if ("richText" in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text: string }>).map((r) => r.text).join("");
    }
  }
  return String(v);
}

function normHeader(s: string): string {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HEADER_KEYWORDS_NORM = [
  "idnumber",
  "standardnumber",
  "quantity",
  "subcategory",
  "ncc",
  "visiblepartsize",
  "note",
];

const OFFICIAL_PROJECT_TITLE_RE = /^Z\d{6,10}-\d{4,8}_/i;
const MASTER_NAME_RE = /material\s*[&+]?\s*process|materialprocess/i;

interface ParsedSheet {
  name: string;
  topTitle: string | null;
  headerRow: number;
  headers: string[];
  rows: Array<{ rowNumber: number; data: Record<string, string> }>;
}

function detectHeaderRow(ws: ExcelJS.Worksheet): {
  row: number;
  cells: string[];
  topTitle: string | null;
} {
  let bestRow = 1;
  let bestScore = -1;
  let bestCells: string[] = [];
  let topTitle: string | null = null;

  for (let rn = 1; rn <= Math.min(5, ws.rowCount); rn++) {
    const row = ws.getRow(rn);
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (c) => cells.push(cellToString(c.value)));
    const nonEmpty = cells.filter((c) => c.trim().length > 0).length;
    let matches = 0;
    for (const c of cells) {
      const n = normHeader(c);
      if (HEADER_KEYWORDS_NORM.some((k) => n.includes(k) || k.includes(n))) {
        matches++;
      }
    }
    if (rn === 1 && nonEmpty > 0) {
      const firstNonEmpty = cells.find((c) => c.trim().length > 0);
      if (firstNonEmpty) topTitle = firstNonEmpty.trim();
    }
    const score = matches * 10 + nonEmpty;
    if (matches >= 2 && score > bestScore && nonEmpty >= 3) {
      bestScore = score;
      bestRow = rn;
      bestCells = cells;
    }
  }

  if (bestScore < 0) {
    // Fallback row 1
    const row = ws.getRow(1);
    bestCells = [];
    row.eachCell({ includeEmpty: true }, (c) =>
      bestCells.push(cellToString(c.value)),
    );
  }
  return { row: bestRow, cells: bestCells, topTitle };
}

function parseSheet(ws: ExcelJS.Worksheet): ParsedSheet {
  const detect = detectHeaderRow(ws);
  const headers = detect.cells.filter((c) => c.trim().length > 0);
  const rows: Array<{ rowNumber: number; data: Record<string, string> }> = [];

  for (let rn = detect.row + 1; rn <= ws.rowCount; rn++) {
    const row = ws.getRow(rn);
    if (!row.hasValues) continue;
    const data: Record<string, string> = {};
    let hasAny = false;
    detect.cells.forEach((h, idx) => {
      if (!h || !h.trim()) return;
      const val = cellToString(row.getCell(idx + 1).value);
      if (val.length > 0) hasAny = true;
      data[h.trim()] = val;
    });
    if (hasAny) {
      // Skip footer summary rows: ID empty + SKU empty + có NCC/Note
      const idVal = data["ID Number"] ?? data["STT"] ?? "";
      const skuVal = data["Standard Number"] ?? data["SKU"] ?? "";
      const hasNccOrNote = Object.entries(data).some(([k, v]) => {
        const n = normHeader(k);
        return (
          v.trim() &&
          (n.includes("ncc") || n.includes("note") || n.includes("ghichu"))
        );
      });
      if (!idVal.trim() && !skuVal.trim() && hasNccOrNote) continue;
      rows.push({ rowNumber: rn, data });
    }
  }

  return {
    name: ws.name,
    topTitle: detect.topTitle,
    headerRow: detect.row,
    headers,
    rows,
  };
}

// ---------------------------------------------------------------------------
// Domain mapping helpers
// ---------------------------------------------------------------------------

/**
 * Tìm material_code phù hợp dựa trên giá trị cột Sub Category.
 * Sub Category vd: "SUS304", "AL6061 màu xám bạc", "Acetal black".
 * Match: substring lowercase với material_master.code hoặc name_en.
 */
function findMaterialCode(
  subCategory: string,
  materials: Array<{ code: string; nameEn: string; nameVn: string }>,
): string | null {
  if (!subCategory.trim()) return null;
  const norm = subCategory.toLowerCase().trim();

  // Exact match
  for (const m of materials) {
    if (m.code.toLowerCase() === norm) return m.code;
  }
  // Substring match prefix (vd "AL6061 màu xám bạc" → "al6061" → match AL6061)
  for (const m of materials) {
    const codeLower = m.code.toLowerCase();
    if (norm.includes(codeLower) || codeLower.includes(norm.split(/\s+/)[0]!)) {
      return m.code;
    }
  }
  // nameEn contains
  for (const m of materials) {
    if (m.nameEn && norm.includes(m.nameEn.toLowerCase())) return m.code;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx seed-bom-multi-sheet.ts <file.xlsx>");
    process.exit(1);
  }
  const absPath = path.resolve(filePath);
  console.log(`[seed-bom] Reading ${absPath}`);

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[seed-bom] DATABASE_URL required");
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(absPath);

  const sheets: ParsedSheet[] = [];
  wb.eachSheet((ws) => {
    sheets.push(parseSheet(ws));
  });
  console.log(`[seed-bom] Parsed ${sheets.length} sheets:`);
  sheets.forEach((s) =>
    console.log(`  - ${s.name}: title="${s.topTitle ?? "—"}", ${s.rows.length} rows`),
  );

  // Classify
  const projectSheets = sheets.filter(
    (s) =>
      s.topTitle && OFFICIAL_PROJECT_TITLE_RE.test(s.topTitle),
  );
  const masterSheet = sheets.find((s) => MASTER_NAME_RE.test(s.name));

  if (projectSheets.length === 0) {
    console.error("[seed-bom] Không tìm thấy sheet PROJECT (title Z<...>_).");
    process.exit(1);
  }
  console.log(
    `[seed-bom] ${projectSheets.length} project sheet(s), master sheet: ${masterSheet?.name ?? "—"}`,
  );

  // BOM List title from filename (or first project title)
  const fileBaseName = path.basename(absPath, path.extname(absPath));
  const bomCode = fileBaseName
    .toUpperCase()
    .replace(/[^A-Z0-9_\-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const bomName = projectSheets
    .map((s) => s.topTitle ?? s.name)
    .join(" + ")
    .slice(0, 250);

  const { db, sql: rawSql } = createDbClient({ url, max: 5 });

  try {
    // ---------------------------------------------------------------------
    // 1. Upsert master vật liệu + quy trình từ sheet 3 (idempotent)
    // ---------------------------------------------------------------------
    if (masterSheet) {
      console.log(`[seed-bom] Upserting master from sheet "${masterSheet.name}"…`);
      // Sheet 3 có format đặc biệt: 2 bảng song song (vật liệu cột 2-5, quy trình cột 8-10)
      // Đọc thẳng từ workbook ws để giữ structure cột
      const ws = wb.getWorksheet(masterSheet.name);
      if (ws) {
        let matCount = 0;
        let procCount = 0;
        for (let rn = 3; rn <= ws.rowCount; rn++) {
          const row = ws.getRow(rn);
          // Vật liệu cột 2-5 (B-E): typeCode | nameEn | nameVn | pricePerKg
          const matNameEn = cellToString(row.getCell(3).value).trim();
          const matNameVn = cellToString(row.getCell(4).value).trim();
          const matPriceRaw = cellToString(row.getCell(5).value).trim();
          if (matNameEn) {
            const code = matNameEn
              .toUpperCase()
              .replace(/\s*\(.*\)/g, "")
              .replace(/[^A-Z0-9_]/g, "_")
              .replace(/_+/g, "_")
              .replace(/^_+|_+$/g, "")
              .slice(0, 64);
            if (code) {
              const price = matPriceRaw.replace(/[^0-9.]/g, "");
              await db
                .insert(materialMaster)
                .values({
                  code,
                  nameEn: matNameEn.slice(0, 255),
                  nameVn: (matNameVn || matNameEn).slice(0, 255),
                  pricePerKg: price && Number(price) > 0 ? price : null,
                })
                .onConflictDoNothing({ target: materialMaster.code });
              matCount++;
            }
          }
          // Quy trình cột 8-10 (H-J): nameEn | nameVn | pricePerHour
          const procNameEn = cellToString(row.getCell(8).value).trim();
          const procNameVn = cellToString(row.getCell(9).value).trim();
          const procPriceRaw = cellToString(row.getCell(10).value).trim();
          if (procNameEn) {
            const code = procNameEn
              .toUpperCase()
              .replace(/[^A-Z0-9_]/g, "_")
              .replace(/_+/g, "_")
              .replace(/^_+|_+$/g, "")
              .slice(0, 64);
            if (code) {
              // Detect đơn vị từ pricing note ("115đ/cm2" → CM2, "200000" → HOUR)
              let pricingUnit: "HOUR" | "CM2" | "OTHER" = "HOUR";
              let priceVal: string | null = null;
              const priceClean = procPriceRaw.replace(/[^0-9.]/g, "");
              if (procPriceRaw.toLowerCase().includes("cm2") || procPriceRaw.toLowerCase().includes("cm²")) {
                pricingUnit = "CM2";
                priceVal = priceClean || null;
              } else if (priceClean && Number(priceClean) > 0) {
                priceVal = priceClean;
              }
              await db
                .insert(processMaster)
                .values({
                  code,
                  nameEn: procNameEn.slice(0, 255),
                  nameVn: (procNameVn || procNameEn).slice(0, 255),
                  pricePerUnit: priceVal,
                  pricingUnit,
                  pricingNote: procPriceRaw && !priceClean ? procPriceRaw.slice(0, 500) : null,
                })
                .onConflictDoNothing({ target: processMaster.code });
              procCount++;
            }
          }
        }
        console.log(
          `[seed-bom] Master upserted: ${matCount} material rows scanned, ${procCount} process rows scanned`,
        );
      }
    }

    // Load existing material_master codes (subset of 23 seeded + new from sheet 3)
    const allMaterials = await db
      .select({
        code: materialMaster.code,
        nameEn: materialMaster.nameEn,
        nameVn: materialMaster.nameVn,
        pricePerKg: materialMaster.pricePerKg,
      })
      .from(materialMaster);

    // ---------------------------------------------------------------------
    // 2. Tạo / find BOM template (1 BOM List)
    // ---------------------------------------------------------------------
    const [existingTemplate] = await db
      .select()
      .from(bomTemplate)
      .where(eq(bomTemplate.code, bomCode))
      .limit(1);

    let templateId: string;
    if (existingTemplate) {
      console.log(
        `[seed-bom] BOM "${bomCode}" đã tồn tại (id=${existingTemplate.id}). SKIP để tránh duplicate.`,
      );
      templateId = existingTemplate.id;
    } else {
      const [created] = await db
        .insert(bomTemplate)
        .values({
          code: bomCode,
          name: bomName,
          status: "DRAFT",
          targetQty: "1",
          description: `Imported từ file Excel "Bản chính thức": ${path.basename(absPath)}`,
        })
        .returning();
      templateId = created!.id;
      console.log(
        `[seed-bom] Created BOM template: code="${bomCode}", id=${templateId}`,
      );
    }

    // ---------------------------------------------------------------------
    // 3. Tạo bom_sheet PROJECT cho mỗi sheet project + bom_lines
    // ---------------------------------------------------------------------
    const usedMaterialCodes = new Set<string>();
    const usedProcessCodes = new Set<string>();
    let totalLinesCreated = 0;

    for (let i = 0; i < projectSheets.length; i++) {
      const ps = projectSheets[i]!;
      const sheetName = ps.topTitle ?? ps.name;

      // Check if sheet already exists (idempotent)
      const [existingSheet] = await db
        .select()
        .from(bomSheet)
        .where(
          sql`${bomSheet.templateId} = ${templateId} AND ${bomSheet.name} = ${sheetName}`,
        )
        .limit(1);

      let sheetId: string;
      if (existingSheet) {
        console.log(`[seed-bom]   Sheet "${sheetName}" đã có (skip lines).`);
        sheetId = existingSheet.id;
        continue; // Skip lines if sheet exists
      } else {
        const [created] = await db
          .insert(bomSheet)
          .values({
            templateId,
            name: sheetName.slice(0, 255),
            kind: "PROJECT",
            position: i + 1,
            metadata: {
              sourceSheetName: ps.name,
              titleRow: ps.topTitle ?? null,
              headerRow: ps.headerRow,
            },
          })
          .returning();
        sheetId = created!.id;
        console.log(`[seed-bom]   Created sheet PROJECT "${sheetName}" (${ps.rows.length} rows)`);
      }

      // Map headers → field names (heuristic match)
      const findHeader = (...keywords: string[]): string | undefined =>
        ps.headers.find((h) => {
          const n = normHeader(h);
          return keywords.some((k) => n.includes(k) || k.includes(n));
        });

      const skuHeader = findHeader("standardnumber");
      const qtyHeader = findHeader("quantity");
      const idHeader = findHeader("idnumber");
      const subCatHeader = findHeader("subcategory");
      const sizeHeader = findHeader("visiblepartsize");
      const nccHeader = findHeader("ncc", "nhacungcap");
      const noteHeaders = ps.headers.filter((h) =>
        normHeader(h).includes("note"),
      );

      if (!skuHeader || !qtyHeader) {
        console.warn(
          `[seed-bom]     Skip "${sheetName}": thiếu cột SKU hoặc Qty (skuHeader=${skuHeader}, qtyHeader=${qtyHeader})`,
        );
        continue;
      }

      // Insert bom_lines per row
      let position = 1;
      for (const r of ps.rows) {
        const sku = r.data[skuHeader]?.trim();
        const qtyRaw = r.data[qtyHeader]?.trim();
        if (!sku || !qtyRaw) continue;
        const qty = Number(qtyRaw);
        if (!Number.isFinite(qty) || qty <= 0) continue;

        const skuNorm = sku.toUpperCase().slice(0, 64);
        const subCategory = subCatHeader ? r.data[subCatHeader]?.trim() ?? "" : "";
        const dimensions = sizeHeader ? r.data[sizeHeader]?.trim() ?? "" : "";
        const supplier = nccHeader ? r.data[nccHeader]?.trim() ?? "" : "";
        const positionCode = idHeader ? r.data[idHeader]?.trim() ?? null : null;
        const notes = noteHeaders
          .map((h) => r.data[h]?.trim())
          .filter((n) => n && n.length > 0)
          .join(" · ");

        // Material code resolve
        const materialCode = subCategory
          ? findMaterialCode(subCategory, allMaterials)
          : null;
        if (materialCode) usedMaterialCodes.add(materialCode);

        // Auto-create item if missing
        const [existingItem] = await db
          .select({ id: item.id })
          .from(item)
          .where(eq(item.sku, skuNorm))
          .limit(1);

        let componentItemId: string;
        if (existingItem) {
          componentItemId = existingItem.id;
        } else {
          const [createdItem] = await db
            .insert(item)
            .values({
              sku: skuNorm,
              name: subCategory ? subCategory.slice(0, 255) : skuNorm,
              itemType: "PURCHASED",
              uom: "PCS",
              status: "ACTIVE",
              category: supplier ? supplier.slice(0, 64) : null,
              materialCode,
              specJson: dimensions ? JSON.stringify({ dimensionText: dimensions }) : null,
            })
            .returning();
          componentItemId = createdItem!.id;
        }

        await db.insert(bomLine).values({
          templateId,
          sheetId,
          parentLineId: null,
          componentItemId,
          level: 1,
          position,
          positionCode,
          qtyPerParent: String(qty),
          uom: "PCS",
          description: subCategory || null,
          supplierItemCode: supplier || null,
          notes: notes || null,
        });
        totalLinesCreated++;
        position++;
      }
    }

    console.log(`[seed-bom] Total bom_lines created: ${totalLinesCreated}`);

    // ---------------------------------------------------------------------
    // 4. Tạo bom_sheet MATERIAL + auto-populate rows từ usedMaterialCodes
    // ---------------------------------------------------------------------
    const materialSheetName = "Vật liệu sử dụng";
    const [existingMatSheet] = await db
      .select()
      .from(bomSheet)
      .where(
        sql`${bomSheet.templateId} = ${templateId} AND ${bomSheet.kind} = 'MATERIAL'`,
      )
      .limit(1);

    if (!existingMatSheet) {
      const [createdMatSheet] = await db
        .insert(bomSheet)
        .values({
          templateId,
          name: materialSheetName,
          kind: "MATERIAL",
          position: projectSheets.length + 1,
          metadata: { autoPopulatedFrom: "Sub Category column" },
        })
        .returning();
      const matSheetId = createdMatSheet!.id;
      console.log(`[seed-bom]   Created sheet MATERIAL "${materialSheetName}"`);

      // Populate rows from used material codes
      let pos = 1;
      const matMap = new Map(allMaterials.map((m) => [m.code, m]));
      for (const code of usedMaterialCodes) {
        const m = matMap.get(code);
        if (!m) continue;
        await db.insert(bomSheetMaterialRow).values({
          sheetId: matSheetId,
          materialCode: code,
          nameOverride: m.nameVn,
          pricePerKg: m.pricePerKg, // Snapshot từ master
          status: "PLANNED",
          position: pos++,
        });
      }
      console.log(`[seed-bom]     ${pos - 1} material rows auto-populated`);
    } else {
      console.log(`[seed-bom]   Sheet MATERIAL đã có (skip).`);
    }

    // ---------------------------------------------------------------------
    // 5. Tạo bom_sheet PROCESS (rỗng — user fill sau, hoặc parse từ specJson)
    // ---------------------------------------------------------------------
    const processSheetName = "Quy trình gia công";
    const [existingProcSheet] = await db
      .select()
      .from(bomSheet)
      .where(
        sql`${bomSheet.templateId} = ${templateId} AND ${bomSheet.kind} = 'PROCESS'`,
      )
      .limit(1);

    if (!existingProcSheet) {
      const [createdProcSheet] = await db
        .insert(bomSheet)
        .values({
          templateId,
          name: processSheetName,
          kind: "PROCESS",
          position: projectSheets.length + 2,
          metadata: { autoPopulatedFrom: "process_master common" },
        })
        .returning();
      const procSheetId = createdProcSheet!.id;
      console.log(`[seed-bom]   Created sheet PROCESS "${processSheetName}"`);

      // Populate vài process phổ biến (MCT, MILLING) — user thêm/edit sau
      const commonProcesses = await db
        .select()
        .from(processMaster)
        .where(eq(processMaster.isActive, true));
      let pos = 1;
      for (const p of commonProcesses.slice(0, 5)) {
        await db.insert(bomSheetProcessRow).values({
          sheetId: procSheetId,
          processCode: p.code,
          nameOverride: p.nameVn,
          pricePerUnit: p.pricePerUnit,
          pricingUnit: p.pricingUnit,
          position: pos++,
        });
      }
      console.log(`[seed-bom]     ${pos - 1} process rows auto-populated`);
    } else {
      console.log(`[seed-bom]   Sheet PROCESS đã có (skip).`);
    }

    // ---------------------------------------------------------------------
    // Summary
    // ---------------------------------------------------------------------
    const finalSheets = await db
      .select({ kind: bomSheet.kind, name: bomSheet.name })
      .from(bomSheet)
      .where(eq(bomSheet.templateId, templateId));
    console.log(`\n[seed-bom] ✅ Done. BOM "${bomCode}" (id=${templateId}) has:`);
    finalSheets.forEach((s) => console.log(`   - ${s.kind}: ${s.name}`));
  } finally {
    await rawSql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[seed-bom] FAIL:", err);
  process.exit(1);
});
