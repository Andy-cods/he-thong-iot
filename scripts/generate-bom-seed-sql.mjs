#!/usr/bin/env node
/**
 * Parse sample xlsx → generate SQL to insert 1 BOM template + 30 lines.
 * Usage: node scripts/generate-bom-seed-sql.mjs > /tmp/bom-seed.sql
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const webNodeModules = path.join(repoRoot, "apps", "web", "node_modules");
const require = createRequire(path.join(webNodeModules, "_placeholder"));
const ExcelJS = require("exceljs");

const FILE = path.join(repoRoot, "docs", "samples",
  "20260318_ BOM trien khai_ Z0000002-238846 846 847 848 851_ update 6.4.26_1.xlsx");
const BOM_CODE = "CNC-238846-DEMO";
const SHEET_IDX = 0;
const MAX_LINES = 30;

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(FILE);
const ws = wb.worksheets[SHEET_IDX];
const bomTitle = String(ws.getCell("B1").value ?? "Máy CNC Demo 238846").trim();

const cellVal = (v) => {
  if (v == null) return "";
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  return String(v);
};

const lines = [];
for (let r = 3; r <= Math.min(ws.rowCount, 3 + MAX_LINES - 1); r++) {
  const row = ws.getRow(r);
  const seq = cellVal(row.getCell(3).value).trim();
  const qty = Number(cellVal(row.getCell(4).value)) || 1;
  const skuRaw = cellVal(row.getCell(5).value).trim();
  const sku = skuRaw.length > 60 ? skuRaw.slice(0, 60) : skuRaw;
  const desc = cellVal(row.getCell(6).value).trim();
  const ncc = cellVal(row.getCell(7).value).trim();
  const size = cellVal(row.getCell(8).value).trim();
  if (!sku) continue;
  lines.push({ seq, qty, sku, desc, ncc, size });
}

const esc = (s) => String(s ?? "").replace(/'/g, "''");
const now = "NOW()";

let sql = `-- Seed BOM demo từ sample file: ${bomTitle}\n`;
sql += `-- BOM code: ${BOM_CODE}, ${lines.length} linh kiện\n\n`;
sql += `BEGIN;\n\n`;

// Upsert items first (stub item nếu chưa có)
sql += `-- 1) Upsert items stub cho SKU missing\n`;
const uniqSkus = [...new Set(lines.map((l) => l.sku))];
for (const sku of uniqSkus) {
  const line = lines.find((l) => l.sku === sku);
  sql += `INSERT INTO app.item (sku, name, item_type, uom, is_active, status)\n`;
  sql += `  VALUES ('${esc(sku)}', '${esc(line.desc || sku)}', 'PURCHASED', 'PCS', true, 'DRAFT')\n`;
  sql += `  ON CONFLICT (sku) DO NOTHING;\n`;
}

// Upsert BOM template
sql += `\n-- 2) Upsert bom_template\n`;
sql += `INSERT INTO app.bom_template (code, name, description, target_qty, status, metadata)\n`;
sql += `  VALUES ('${BOM_CODE}', '${esc(bomTitle)}', 'Seed demo từ sample Excel Z0000002-238846', 6, 'ACTIVE', '{"source":"seed-script","sheet":"238846"}'::jsonb)\n`;
sql += `  ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, status='ACTIVE', updated_at=NOW()\n`;
sql += `  RETURNING id \\gset\n`;

// Clear old lines + insert new
sql += `\n-- 3) Clear + reinsert lines\n`;
sql += `DELETE FROM app.bom_line WHERE template_id = (SELECT id FROM app.bom_template WHERE code='${BOM_CODE}');\n\n`;

sql += `WITH t AS (SELECT id FROM app.bom_template WHERE code='${BOM_CODE}')\n`;
sql += `INSERT INTO app.bom_line (template_id, component_item_id, level, position, qty_per_parent, description, supplier_item_code, metadata)\n`;
sql += `SELECT t.id, i.id, 1, v.position, v.qty, v.description, v.ncc, jsonb_build_object('size', v.size, 'seq', v.seq)\n`;
sql += `FROM t, (VALUES\n`;
const values = lines.map((l, idx) =>
  `  (${idx + 1}, ${l.qty}, '${esc(l.sku)}', '${esc(l.desc)}', '${esc(l.ncc)}', '${esc(l.size)}', '${esc(l.seq)}')`
);
sql += values.join(",\n");
sql += `\n) AS v(position, qty, sku, description, ncc, size, seq)\n`;
sql += `JOIN app.item i ON i.sku = v.sku;\n\n`;

sql += `COMMIT;\n\n`;
sql += `-- Verify\n`;
sql += `SELECT t.code, t.name, t.status, count(l.id) AS line_count FROM app.bom_template t LEFT JOIN app.bom_line l ON l.template_id=t.id WHERE t.code='${BOM_CODE}' GROUP BY t.code, t.name, t.status;\n`;

process.stdout.write(sql);
