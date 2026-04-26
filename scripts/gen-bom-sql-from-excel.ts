/**
 * V2.0 Sprint 6 — Generate SQL from Excel "Bản chính thức"
 *
 * Đọc file Excel local + output 1 file SQL với:
 *   - INSERT bom_template (1 BOM List)
 *   - INSERT bom_sheet PROJECT × N (mỗi sheet project trong file)
 *   - INSERT item (auto-create items mới qua SKU lookup)
 *   - INSERT bom_line (link sheet_id)
 *   - INSERT bom_sheet MATERIAL + bom_sheet_material_row (auto-populate từ
 *     distinct material codes resolved qua Sub Category)
 *   - INSERT bom_sheet PROCESS + bom_sheet_process_row (auto-populate từ
 *     5 process master phổ biến)
 *
 * Idempotent qua ON CONFLICT DO NOTHING — chạy lại không nhân đôi BOM.
 *
 * Cách chạy:
 *   tsx scripts/gen-bom-sql-from-excel.ts <path-to-excel> [output.sql]
 *
 * Apply lên VPS:
 *   cat output.sql | ssh -i ~/.ssh/iot_vps root@45.124.94.13 \
 *     'DB_PASS=$(cat /opt/hethong-iot/secrets/db_password.txt) && \
 *      docker exec -i -e PGPASSWORD=$DB_PASS iot_postgres \
 *      psql -U hethong_app -d hethong_iot -v ON_ERROR_STOP=1'
 */

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// Helpers
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

const HEADER_KEYWORDS = [
  "idnumber",
  "standardnumber",
  "quantity",
  "subcategory",
  "ncc",
  "visiblepartsize",
  "note",
];

const OFFICIAL_TITLE_RE = /^Z\d{6,10}-\d{4,8}_/i;
const MASTER_NAME_RE = /material\s*[&+]?\s*process|materialprocess/i;

function sqlEscape(s: string | null | undefined): string {
  if (s === null || s === undefined) return "NULL";
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function sqlNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "NULL";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "NULL";
  return String(v);
}

interface ParsedSheet {
  name: string;
  topTitle: string | null;
  headers: string[];
  rows: Array<{ rowNumber: number; data: Record<string, string> }>;
}

function detectHeaderRow(ws: ExcelJS.Worksheet) {
  let bestRow = 1;
  let bestScore = -1;
  let bestCells: string[] = [];
  let topTitle: string | null = null;

  for (let rn = 1; rn <= Math.min(5, ws.rowCount); rn++) {
    const cells: string[] = [];
    ws.getRow(rn).eachCell({ includeEmpty: true }, (c) =>
      cells.push(cellToString(c.value)),
    );
    const nonEmpty = cells.filter((c) => c.trim()).length;
    let matches = 0;
    for (const c of cells) {
      const n = normHeader(c);
      if (HEADER_KEYWORDS.some((k) => n.includes(k) || k.includes(n))) matches++;
    }
    if (rn === 1 && nonEmpty > 0) {
      const f = cells.find((c) => c.trim());
      if (f) topTitle = f.trim();
    }
    const score = matches * 10 + nonEmpty;
    if (matches >= 2 && score > bestScore && nonEmpty >= 3) {
      bestScore = score;
      bestRow = rn;
      bestCells = cells;
    }
  }
  if (bestScore < 0) {
    bestCells = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c) =>
      bestCells.push(cellToString(c.value)),
    );
  }
  return { row: bestRow, cells: bestCells, topTitle };
}

function parseSheet(ws: ExcelJS.Worksheet): ParsedSheet {
  const detect = detectHeaderRow(ws);
  const headers = detect.cells.filter((c) => c.trim());
  const rows: ParsedSheet["rows"] = [];

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
    if (!hasAny) continue;

    // Skip footer summary (ID empty + SKU empty + có NCC/Note)
    const idVal = data["ID Number"] ?? data["STT"] ?? "";
    const skuVal = data["Standard Number"] ?? data["SKU"] ?? "";
    const hasNccOrNote = Object.entries(data).some(([k, v]) => {
      const n = normHeader(k);
      return v.trim() && (n.includes("ncc") || n.includes("note"));
    });
    if (!idVal.trim() && !skuVal.trim() && hasNccOrNote) continue;

    rows.push({ rowNumber: rn, data });
  }

  return { name: ws.name, topTitle: detect.topTitle, headers, rows };
}

/**
 * Material codes catalog — 63 codes sau migration 0031 (full Excel sheet 3).
 * Match Sub Category → code via aliases substring (lowercased).
 *
 * Refs: packages/db/migrations/0017_material_process_master.sql + 0031_seed_full_master_catalog.sql
 */
const MATERIAL_CATALOG: Array<{ code: string; aliases: string[] }> = [
  // POM family
  { code: "POM_ESD_BLK", aliases: ["pom esd black", "pom esd blk"] },
  { code: "POM_ESD_WHT", aliases: ["pom esd white", "pom esd wht"] },
  { code: "POM", aliases: ["pom", "acetal"] },
  // PB108 family
  { code: "PB108_ESD_BLK", aliases: ["pb108 esd black", "pb108 esd blk"] },
  { code: "PB108_ESD_WHT", aliases: ["pb108 esd white", "pb108 esd wht"] },
  { code: "PB108", aliases: ["pb108"] },
  // PM107, MC501
  { code: "PM107", aliases: ["pm107"] },
  { code: "MC501", aliases: ["mc501"] },
  // PVC family
  { code: "PVC_ESD", aliases: ["pvc esd"] },
  { code: "PVC", aliases: ["pvc"] },
  // URETHANE family
  { code: "URETHANE_ESD", aliases: ["urethane esd"] },
  { code: "URETHANE_50", aliases: ["urethane 50"] },
  { code: "URETHANE_70", aliases: ["urethane 70"] },
  { code: "URETHANE_90", aliases: ["urethane 90"] },
  { code: "URETHANE", aliases: ["urethane"] },
  // TEFLON family
  { code: "TEFLON_ESD", aliases: ["teflon esd"] },
  { code: "TEFLON", aliases: ["teflon", "ptfe"] },
  // BAKELITE family
  { code: "BAKELITE_ESD", aliases: ["bakelite esd"] },
  { code: "BAKELITE", aliases: ["bakelite"] },
  // MIKA family
  { code: "MIKA_ESD", aliases: ["mika esd", "mica esd"] },
  { code: "MIKA", aliases: ["mika", "mica trong"] },
  // PC family
  { code: "PC_GF20", aliases: ["pc gf20", "pc-gf20"] },
  { code: "PC_ESD", aliases: ["pc esd"] },
  { code: "PC", aliases: ["polycarbonate", "pc thường", "pc thuong"] },
  // PEEK
  { code: "PEEK", aliases: ["peek"] },
  // ULTEM family
  { code: "ULTEM_1000", aliases: ["ultem 1000", "ul tem 1000"] },
  { code: "ULTEM", aliases: ["ultem", "ul tem"] },
  // ALUMINIUM family
  { code: "AL6061", aliases: ["al6061", "nhôm 6061", "aluminum 6061", "aluminium 6061"] },
  { code: "AL7075", aliases: ["al7075", "aluminium 7075"] },
  { code: "AL5052", aliases: ["al5052", "aluminium 5052"] },
  // COPPER family
  { code: "CU_BRASS", aliases: ["brass", "cu brass", "đồng thau", "dong thau"] },
  { code: "CU_COPPER", aliases: ["cu copper", "đồng đỏ", "dong do"] },
  { code: "CU_BRONZE", aliases: ["cu bronze", "bronze", "đồng xám"] },
  // STEEL family
  { code: "S45C", aliases: ["s45c"] },
  { code: "SK4", aliases: ["sk4"] },
  { code: "SK5", aliases: ["sk5"] },
  { code: "SKH51", aliases: ["skh51"] },
  { code: "SM20C", aliases: ["sm20c"] },
  { code: "SM45C", aliases: ["sm45c"] },
  { code: "SM55C", aliases: ["sm55c"] },
  { code: "SS400", aliases: ["ss400"] },
  { code: "STAVAX", aliases: ["stavax"] },
  { code: "SKD11", aliases: ["skd11"] },
  { code: "SKD61", aliases: ["skd61"] },
  { code: "STD11", aliases: ["std11"] },
  { code: "STD61", aliases: ["std61"] },
  { code: "MC901", aliases: ["mc901"] },
  { code: "KP4M", aliases: ["kp4m"] },
  { code: "HSS", aliases: ["hss", "thép gió"] },
  { code: "SUJ_2", aliases: ["suj-2", "suj2"] },
  // STAINLESS STEEL — order longer-prefix first cho thickness match
  { code: "SUS304_20_40", aliases: ["sus304 20-40", "sus304 (20-40", "sus304 dày 20-40"] },
  { code: "SUS304_10_20", aliases: ["sus304 10-20", "sus304 (10-20", "sus304 dày 10-20"] },
  { code: "SUS304_4_10", aliases: ["sus304 4-10", "sus304 (4-10", "sus304 dày 4-10"] },
  { code: "SUS316", aliases: ["sus316"] },
  { code: "SUS201", aliases: ["sus201"] },
  { code: "SUS303", aliases: ["sus303"] },
  // Đặc biệt
  { code: "DUROSTONE", aliases: ["durostone", "đá cách nhiệt"] },
  { code: "PI108", aliases: ["pi108"] },
  { code: "PE_FOAM", aliases: ["pe foam"] },
  // SILICON family
  { code: "SILICON_45", aliases: ["silicon 45", "silicon độ cứng 45"] },
  { code: "SILICON_40", aliases: ["silicon 40", "silicon độ cứng 40"] },
  { code: "SILICON", aliases: ["silicon"] },
  // TITAN
  { code: "TITAN", aliases: ["titan", "titanium"] },
];

// Generic SUS304 fallback nếu không match thickness
const SUS304_DEFAULT = "SUS304_4_10";

function findMaterialCode(subCategory: string): string | null {
  if (!subCategory.trim()) return null;
  const norm = subCategory.toLowerCase().trim();
  // Match aliases first (more specific)
  for (const m of MATERIAL_CATALOG) {
    for (const a of m.aliases) {
      if (norm.includes(a)) return m.code;
    }
  }
  // Generic SUS304 (no thickness specified) → default
  if (norm.includes("sus304")) return SUS304_DEFAULT;
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const filePath = process.argv[2];
  const outPath = process.argv[3] ?? "seed-bom-real.sql";
  if (!filePath) {
    console.error("Usage: tsx gen-bom-sql-from-excel.ts <file.xlsx> [out.sql]");
    process.exit(1);
  }

  console.log(`[gen] Reading ${filePath}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const sheets: ParsedSheet[] = [];
  wb.eachSheet((ws) => sheets.push(parseSheet(ws)));
  console.log(`[gen] ${sheets.length} sheets:`);
  sheets.forEach((s) =>
    console.log(`  - ${s.name}: title="${s.topTitle ?? "—"}", ${s.rows.length} rows`),
  );

  const projectSheets = sheets.filter(
    (s) => s.topTitle && OFFICIAL_TITLE_RE.test(s.topTitle),
  );
  if (projectSheets.length === 0) {
    console.error("[gen] Không có sheet PROJECT (title Z<...>_).");
    process.exit(1);
  }

  // BOM code/name từ filename
  const baseName = path.basename(filePath, path.extname(filePath));
  const bomCode = baseName
    .toUpperCase()
    .replace(/[^A-Z0-9_\-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const bomName = projectSheets.map((s) => s.topTitle ?? s.name).join(" + ").slice(0, 250);

  // Collect distinct material codes used
  const usedMaterials = new Set<string>();
  const distinctSkus = new Map<string, { sku: string; subCategory: string; supplier: string; size: string }>();

  for (const ps of projectSheets) {
    const findHdr = (...kw: string[]) =>
      ps.headers.find((h) => kw.some((k) => normHeader(h).includes(k)));
    const skuH = findHdr("standardnumber");
    const subH = findHdr("subcategory");
    const sizeH = findHdr("visiblepartsize");
    const nccH = findHdr("ncc", "nhacungcap");
    if (!skuH) continue;
    for (const r of ps.rows) {
      const sku = r.data[skuH]?.trim();
      if (!sku) continue;
      const sub = subH ? r.data[subH]?.trim() ?? "" : "";
      const supplier = nccH ? r.data[nccH]?.trim() ?? "" : "";
      const size = sizeH ? r.data[sizeH]?.trim() ?? "" : "";
      const skuNorm = sku.toUpperCase();
      if (!distinctSkus.has(skuNorm)) {
        distinctSkus.set(skuNorm, { sku: skuNorm, subCategory: sub, supplier, size });
      }
      const mat = findMaterialCode(sub);
      if (mat) usedMaterials.add(mat);
    }
  }
  console.log(`[gen] ${distinctSkus.size} distinct SKUs, ${usedMaterials.size} materials used`);

  // ---------------------------------------------------------------------
  // Generate SQL
  // ---------------------------------------------------------------------
  const sql: string[] = [];
  sql.push("-- ============================================================================");
  sql.push("-- V2.0 Sprint 6 — Seed BOM real từ file Excel \"Bản chính thức\"");
  sql.push(`-- Generated: ${new Date().toISOString()}`);
  sql.push(`-- File: ${path.basename(filePath)}`);
  sql.push(`-- BOM code: ${bomCode}`);
  sql.push(`-- Idempotent: ON CONFLICT DO NOTHING — chạy lại không nhân đôi.`);
  sql.push("-- ============================================================================");
  sql.push("");
  sql.push("SET search_path TO app, public;");
  sql.push("");
  sql.push("BEGIN;");
  sql.push("");

  // 1. Items (auto-create with ON CONFLICT DO NOTHING)
  // V2.0 Sprint 6 fix: item.category KHÔNG = supplier code (gây UI duplicate
  // cột "Loại" + "Vật liệu"). Set category = null (item chưa phân loại) hoặc
  // nhóm vật liệu chính (vd "STAINLESS_STEEL" cho SUS304_*). NCC ở
  // bom_line.supplier_item_code.
  sql.push("-- 1) Auto-create items mới (ON CONFLICT DO NOTHING)");
  for (const [, sk] of distinctSkus) {
    const matCode = findMaterialCode(sk.subCategory);
    const specJson = sk.size ? JSON.stringify({ dimensionText: sk.size }) : null;
    // Category = nhóm vật liệu chính (extracted từ matCode prefix nếu có).
    // Vd matCode "SUS304_4_10" → category "STAINLESS_STEEL".
    const categoryFromMaterial = matCode
      ? matCode.startsWith("SUS")
        ? "STAINLESS_STEEL"
        : matCode.startsWith("AL")
          ? "ALUMINIUM"
          : matCode.startsWith("S45C") || matCode.startsWith("SK")
            ? "STEEL"
            : matCode.startsWith("CU")
              ? "COPPER"
              : matCode.startsWith("POM")
                ? "POM"
                : null
      : null;
    sql.push(
      `INSERT INTO app.item (sku, name, item_type, uom, status, category, material_code, spec_json) VALUES (${sqlEscape(sk.sku)}, ${sqlEscape(sk.subCategory.slice(0, 255) || sk.sku)}, 'PURCHASED', 'PCS', 'ACTIVE', ${sqlEscape(categoryFromMaterial)}, ${sqlEscape(matCode)}, ${sqlEscape(specJson)}) ON CONFLICT (sku) DO NOTHING;`,
    );
  }
  sql.push("");

  // 2. BOM template
  sql.push("-- 2) BOM template (1 BOM List parent)");
  sql.push(`INSERT INTO app.bom_template (code, name, status, target_qty, description) VALUES (${sqlEscape(bomCode)}, ${sqlEscape(bomName)}, 'DRAFT', 1, ${sqlEscape("Imported từ Excel Bản chính thức: " + path.basename(filePath))}) ON CONFLICT (code) DO NOTHING;`);
  sql.push("");
  sql.push(`-- Use DO block để có template_id reference cho các phần sau`);
  sql.push("DO $$");
  sql.push("DECLARE");
  sql.push("  v_template_id UUID;");
  sql.push("  v_sheet_id UUID;");
  sql.push("  v_item_id UUID;");
  sql.push("  v_position INT;");
  sql.push("BEGIN");
  sql.push(`  SELECT id INTO v_template_id FROM app.bom_template WHERE code = ${sqlEscape(bomCode)};`);
  sql.push(`  IF v_template_id IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;`);
  sql.push("");

  // 3. Sheet PROJECT per project sheet + bom_lines
  for (let i = 0; i < projectSheets.length; i++) {
    const ps = projectSheets[i]!;
    const sheetName = (ps.topTitle ?? ps.name).slice(0, 255);
    sql.push(`  -- Sheet PROJECT ${i + 1}: ${sheetName}`);
    sql.push(`  INSERT INTO app.bom_sheet (template_id, name, kind, position, metadata) VALUES (v_template_id, ${sqlEscape(sheetName)}, 'PROJECT', ${i + 1}, ${sqlEscape(JSON.stringify({ sourceSheetName: ps.name, titleRow: ps.topTitle }))}::jsonb) ON CONFLICT (template_id, name) DO NOTHING;`);
    sql.push(`  SELECT id INTO v_sheet_id FROM app.bom_sheet WHERE template_id = v_template_id AND name = ${sqlEscape(sheetName)};`);

    const findHdr = (...kw: string[]) =>
      ps.headers.find((h) => kw.some((k) => normHeader(h).includes(k)));
    const skuH = findHdr("standardnumber");
    const qtyH = findHdr("quantity");
    const idH = findHdr("idnumber");
    const subH = findHdr("subcategory");
    const sizeH = findHdr("visiblepartsize");
    const nccH = findHdr("ncc", "nhacungcap");
    const noteHdrs = ps.headers.filter((h) => normHeader(h).includes("note"));

    if (skuH && qtyH) {
      let pos = 1;
      for (const r of ps.rows) {
        const sku = r.data[skuH]?.trim().toUpperCase();
        const qtyRaw = r.data[qtyH]?.trim();
        if (!sku || !qtyRaw) continue;
        const qty = Number(qtyRaw);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        const sub = subH ? r.data[subH]?.trim() ?? "" : "";
        const supplier = nccH ? r.data[nccH]?.trim() ?? "" : "";
        const positionCode = idH ? r.data[idH]?.trim() ?? null : null;
        const notes = noteHdrs
          .map((h) => r.data[h]?.trim())
          .filter((n) => n)
          .join(" · ");

        sql.push(`  SELECT id INTO v_item_id FROM app.item WHERE sku = ${sqlEscape(sku)};`);
        sql.push(
          `  IF v_item_id IS NOT NULL THEN INSERT INTO app.bom_line (template_id, sheet_id, parent_line_id, component_item_id, level, position, position_code, qty_per_parent, uom, description, supplier_item_code, notes) VALUES (v_template_id, v_sheet_id, NULL, v_item_id, 1, ${pos}, ${sqlEscape(positionCode)}, ${sqlNum(qty)}, 'PCS', ${sqlEscape(sub.slice(0, 1000) || null)}, ${sqlEscape(supplier.slice(0, 128) || null)}, ${sqlEscape(notes.slice(0, 1000) || null)}); END IF;`,
        );
        pos++;
      }
    }
    sql.push("");
  }

  // 4. Sheet COMBINED MATERIAL + PROCESS — gộp giống Excel sheet 3
  // (user feedback 2026-04-26): material rows + process rows attach cùng
  // sheet_id (kind=MATERIAL). UI render side-by-side panels.
  sql.push("  -- Sheet \"Material & Process\" (gộp - giống Excel sheet 3)");
  const matSheetName = "Material & Process";
  sql.push(`  INSERT INTO app.bom_sheet (template_id, name, kind, position, metadata) VALUES (v_template_id, ${sqlEscape(matSheetName)}, 'MATERIAL', ${projectSheets.length + 1}, ${sqlEscape(JSON.stringify({ autoPopulatedFrom: "Sub Category + process_master common", combined: true }))}::jsonb) ON CONFLICT (template_id, name) DO NOTHING;`);
  sql.push(`  SELECT id INTO v_sheet_id FROM app.bom_sheet WHERE template_id = v_template_id AND name = ${sqlEscape(matSheetName)};`);

  // Material rows
  let matPos = 1;
  for (const code of usedMaterials) {
    sql.push(
      `  INSERT INTO app.bom_sheet_material_row (sheet_id, material_code, name_override, price_per_kg, status, position) SELECT v_sheet_id, ${sqlEscape(code)}, mm.name_vn, mm.price_per_kg, 'PLANNED', ${matPos} FROM app.material_master mm WHERE mm.code = ${sqlEscape(code)} AND NOT EXISTS (SELECT 1 FROM app.bom_sheet_material_row WHERE sheet_id = v_sheet_id AND material_code = ${sqlEscape(code)});`,
    );
    matPos++;
  }

  // Process rows (5 process phổ biến) — attach cùng sheet_id
  const commonProcCodes = ["MCT", "MILLING", "DRILLING", "LATHE", "ANODIZING"];
  let procPos = 1;
  for (const code of commonProcCodes) {
    sql.push(
      `  INSERT INTO app.bom_sheet_process_row (sheet_id, process_code, name_override, price_per_unit, pricing_unit, position) SELECT v_sheet_id, ${sqlEscape(code)}, pm.name_vn, pm.price_per_unit, pm.pricing_unit::text, ${procPos} FROM app.process_master pm WHERE pm.code = ${sqlEscape(code)} AND pm.is_active = TRUE AND NOT EXISTS (SELECT 1 FROM app.bom_sheet_process_row WHERE sheet_id = v_sheet_id AND process_code = ${sqlEscape(code)});`,
    );
    procPos++;
  }
  sql.push("");

  // Final report
  sql.push("  RAISE NOTICE 'BOM List \"%\" seeded. Template id=%', '" + bomCode + "', v_template_id;");
  sql.push("END $$;");
  sql.push("");
  sql.push("-- Verify");
  sql.push(`SELECT bt.code, bt.name, COUNT(DISTINCT bs.id) FILTER (WHERE bs.kind = 'PROJECT') AS project_sheets, COUNT(DISTINCT bs.id) FILTER (WHERE bs.kind = 'MATERIAL') AS material_sheets, COUNT(DISTINCT bl.id) AS lines, COUNT(DISTINCT bsmr.id) AS mat_rows, COUNT(DISTINCT bspr.id) AS proc_rows FROM app.bom_template bt LEFT JOIN app.bom_sheet bs ON bs.template_id = bt.id LEFT JOIN app.bom_line bl ON bl.template_id = bt.id LEFT JOIN app.bom_sheet_material_row bsmr ON bsmr.sheet_id = bs.id LEFT JOIN app.bom_sheet_process_row bspr ON bspr.sheet_id = bs.id WHERE bt.code = ${sqlEscape(bomCode)} GROUP BY bt.code, bt.name;`);
  sql.push("");
  sql.push("COMMIT;");
  sql.push("");

  fs.writeFileSync(outPath, sql.join("\n"));
  console.log(`[gen] ✅ Generated ${outPath} (${sql.length} lines, ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
  console.log(`\n[gen] Apply to VPS production:`);
  console.log(`  cat ${outPath} | ssh -i ~/.ssh/iot_vps root@45.124.94.13 \\`);
  console.log(`    'DB_PASS=$(cat /opt/hethong-iot/secrets/db_password.txt) && \\`);
  console.log(`     docker exec -i -e PGPASSWORD=$DB_PASS iot_postgres \\`);
  console.log(`     psql -U hethong_app -d hethong_iot -v ON_ERROR_STOP=1'`);
}

main().catch((err) => {
  console.error("[gen] FAIL:", err);
  process.exit(1);
});
