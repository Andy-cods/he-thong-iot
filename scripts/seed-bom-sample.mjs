#!/usr/bin/env node
/**
 * V1.1-alpha — seed 1 BOM mẫu từ file Excel thật.
 *
 * Usage:
 *   node scripts/seed-bom-sample.mjs [path/to/file.xlsx] [sheetIndex=0] [bomCode=CNC-238846]
 *
 * Behaviour (idempotent):
 *   - Tạo item stub cho mỗi SKU chưa tồn tại trong item table (status=DRAFT, uom=PCS, itemType=PURCHASED).
 *   - Tạo (hoặc update) 1 bom_template với code chỉ định.
 *   - Xoá sạch bom_line cũ của template rồi insert 30-50 line đầu từ sheet.
 *   - Chạy 2 lần không tạo duplicate.
 *
 * Env:
 *   DATABASE_URL  postgres://... (bắt buộc)
 *
 * Dependencies: exceljs + postgres (resolve từ apps/web/node_modules).
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

// Resolve ExcelJS + postgres từ apps/web để không phải thêm dep vào @iot/db.
const webNodeModules = path.join(repoRoot, "apps", "web", "node_modules");
const require = createRequire(path.join(webNodeModules, "_placeholder"));
const ExcelJS = require("exceljs");
const postgres = require("postgres");

const DEFAULT_FILE = path.join(
  repoRoot,
  "docs",
  "samples",
  "20260318_ BOM trien khai_ Z0000002-238846 846 847 848 851_ update 6.4.26_1.xlsx",
);

const args = process.argv.slice(2);
const filePath = args[0] ?? DEFAULT_FILE;
const sheetIndex = Number(args[1] ?? 0);
const bomCode = args[2] ?? "CNC-238846";
const MAX_LINES = 50;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[seed-bom] ERROR: DATABASE_URL env required.");
  process.exit(1);
}

function cellToString(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if ("text" in v) return String(v.text ?? "");
    if ("result" in v) return String(v.result ?? "");
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text).join("");
    }
  }
  return String(v);
}

function normHeader(s) {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HEADER_KEYWORDS = [
  "idnumber", "standardnumber", "quantity", "subcategory", "ncc",
  "visiblepartsize", "note", "ma", "soluong", "mota", "sku", "qty",
  "size", "stt", "image", "material",
];
function headerMatches(cells) {
  let count = 0;
  for (const c of cells) {
    const n = normHeader(c);
    if (!n) continue;
    if (HEADER_KEYWORDS.some((k) => n.includes(k) || k.includes(n))) count++;
  }
  return count;
}

async function main() {
  console.log(`[seed-bom] Loading ${filePath}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const sheets = wb.worksheets;
  if (!sheets.length) throw new Error("No sheets");
  const ws = sheets[sheetIndex];
  if (!ws) throw new Error(`Sheet index ${sheetIndex} out of range (${sheets.length} sheets)`);
  console.log(`[seed-bom] Sheet "${ws.name}" rowCount=${ws.rowCount}`);

  // Smart header detect (same logic as parser)
  const scanned = [];
  for (let rn = 1; rn <= Math.min(5, ws.rowCount); rn++) {
    const cells = [];
    ws.getRow(rn).eachCell({ includeEmpty: true }, (c) => cells.push(cellToString(c.value)));
    const nonEmpty = cells.filter((c) => c.trim().length > 0).length;
    const matches = headerMatches(cells);
    scanned.push({ rowNumber: rn, cells, nonEmpty, matches });
  }
  const cands = scanned.filter((r) => r.nonEmpty >= 3);
  cands.sort((a, b) => b.matches - a.matches || b.nonEmpty - a.nonEmpty || a.rowNumber - b.rowNumber);
  const picked = cands[0] ?? scanned[0];
  const headerRow = picked.rowNumber;
  const headerCells = picked.cells;
  console.log(`[seed-bom] Header row ${headerRow}: ${headerCells.filter(Boolean).join(" | ")}`);

  // Auto-detect các cột quan trọng bằng synonym.
  const colMap = {};
  headerCells.forEach((h, idx) => {
    const n = normHeader(h);
    if (!n) return;
    if (!colMap.sku && (n.includes("standardnumber") || n === "sku" || n.includes("ma") || n.includes("stdnumber"))) {
      colMap.sku = idx;
    }
    if (!colMap.qty && (n.includes("quantity") || n === "qty" || n === "sl" || n.includes("soluong"))) {
      colMap.qty = idx;
    }
    if (!colMap.desc && (n.includes("subcategory") || n.includes("mota") || n.includes("description"))) {
      colMap.desc = idx;
    }
    if (!colMap.ncc && n.includes("ncc")) colMap.ncc = idx;
    if (!colMap.size && (n.includes("size") || n.includes("visiblepartsize") || n.includes("kichthuoc"))) {
      colMap.size = idx;
    }
    if (!colMap.seq && (n.includes("idnumber") || n === "stt")) colMap.seq = idx;
  });
  console.log(`[seed-bom] Column map:`, colMap);
  if (colMap.sku == null || colMap.qty == null) {
    throw new Error("Không tìm thấy cột SKU hoặc quantity trong header row.");
  }

  // Đọc data rows (limit MAX_LINES).
  const rows = [];
  for (let rn = headerRow + 1; rn <= ws.rowCount && rows.length < MAX_LINES; rn++) {
    const r = ws.getRow(rn);
    if (!r || !r.hasValues) continue;
    const sku = cellToString(r.getCell(colMap.sku + 1).value).trim();
    const qtyRaw = cellToString(r.getCell(colMap.qty + 1).value).trim();
    if (!sku || !qtyRaw) continue;
    const qty = Number(qtyRaw.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    rows.push({
      sku: sku.slice(0, 64),
      qty,
      description: colMap.desc != null ? cellToString(r.getCell(colMap.desc + 1).value).trim().slice(0, 500) : "",
      supplierItemCode: colMap.ncc != null ? cellToString(r.getCell(colMap.ncc + 1).value).trim().slice(0, 128) : "",
      size: colMap.size != null ? cellToString(r.getCell(colMap.size + 1).value).trim().slice(0, 128) : "",
      seq: colMap.seq != null ? cellToString(r.getCell(colMap.seq + 1).value).trim() : "",
    });
  }
  console.log(`[seed-bom] Parsed ${rows.length} component lines.`);

  if (rows.length === 0) {
    throw new Error("0 rows parseable — kiểm tra lại header mapping.");
  }

  // Connect DB
  const sql = postgres(DATABASE_URL, { max: 3 });
  try {
    await sql.begin(async (tx) => {
      console.log(`[seed-bom] Upserting ${rows.length} items (stub DRAFT)...`);
      for (const row of rows) {
        await tx`
          INSERT INTO app.item (sku, name, item_type, uom, status, description)
          VALUES (${row.sku}, ${row.description || row.sku}, 'PURCHASED', 'PCS', 'DRAFT', ${row.description || null})
          ON CONFLICT (sku) DO NOTHING
        `;
      }

      // Upsert bom_template
      console.log(`[seed-bom] Upserting bom_template code="${bomCode}"...`);
      const tplName = `BOM mẫu ${bomCode} — seed từ sample`;
      const [tpl] = await tx`
        INSERT INTO app.bom_template (code, name, description, target_qty, status, metadata)
        VALUES (
          ${bomCode},
          ${tplName},
          ${`Seed từ sheet "${ws.name}" · ${rows.length} component lines · V1.1-alpha sample.`},
          1,
          'ACTIVE',
          ${sql.json({ source: "seed-bom-sample", sheet: ws.name, seededAt: new Date().toISOString() })}
        )
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          metadata = EXCLUDED.metadata,
          status = 'ACTIVE',
          updated_at = now()
        RETURNING id
      `;
      const templateId = tpl.id;

      // Xoá bom_line cũ của template này (idempotent reseed)
      console.log(`[seed-bom] Reset bom_line for template ${templateId}...`);
      await tx`DELETE FROM app.bom_line WHERE template_id = ${templateId}`;

      // Insert bom_line cho từng row
      console.log(`[seed-bom] Inserting ${rows.length} bom_line entries...`);
      let position = 1;
      for (const row of rows) {
        const [itemRow] = await tx`
          SELECT id FROM app.item WHERE sku = ${row.sku} LIMIT 1
        `;
        if (!itemRow) {
          console.warn(`[seed-bom] WARN: item ${row.sku} not found after insert, skip.`);
          continue;
        }
        const meta = {};
        if (row.size) meta.size = row.size;
        if (row.seq) meta.seq = row.seq;
        await tx`
          INSERT INTO app.bom_line (
            template_id, parent_line_id, component_item_id,
            level, position, qty_per_parent,
            description, supplier_item_code, metadata
          )
          VALUES (
            ${templateId}, NULL, ${itemRow.id},
            1, ${position}, ${row.qty},
            ${row.description || null},
            ${row.supplierItemCode || null},
            ${sql.json(meta)}
          )
        `;
        position++;
      }
      console.log(`[seed-bom] OK: template ${templateId} · ${position - 1} lines.`);
    });
  } finally {
    await sql.end();
  }
  console.log("[seed-bom] DONE.");
}

main().catch((err) => {
  console.error("[seed-bom] FATAL:", err.message);
  console.error(err.stack);
  process.exit(1);
});
