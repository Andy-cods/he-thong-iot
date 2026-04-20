/**
 * Demo seed — chạy 1 lần để có data mẫu xem layout
 * Idempotent: mọi record có code/sku/no prefix "DEMO-", xóa + recreate mỗi lần
 * Chạy: pnpm db:seed-demo (cần DATABASE_URL trong .env)
 * Xóa demo: DELETE FROM app.item WHERE sku LIKE 'DEMO-%'
 *
 * Không tạo: bom_snapshot_line, assembly_scan, lot_serial (cần explode op)
 * Không tạo: work_order_line (cần snapshot_line_id)
 */

import "dotenv/config";
import { createDbClient } from "./client";
import {
  supplier,
  item,
  itemSupplier,
} from "./schema/master";
import { bomTemplate, bomLine, bomRevision } from "./schema/bom";
import { salesOrder } from "./schema/order";
import { purchaseOrder, purchaseOrderLine } from "./schema/procurement";
import { workOrder } from "./schema/production";
import { sql as rawSql } from "drizzle-orm";

// ─── Fixed UUIDs ──────────────────────────────────────────────────────────────
// Format: 00000000-0000-4000-8XYZ-000000000NNN
// X=entity type, YZ=sub, NNN=sequence

const SUP = {
  sup001: "00000000-0000-4000-8100-000000000101",
  sup002: "00000000-0000-4000-8100-000000000102",
  sup003: "00000000-0000-4000-8100-000000000103",
  sup004: "00000000-0000-4000-8100-000000000104",
  sup005: "00000000-0000-4000-8100-000000000105",
} as const;

const ITM = {
  // FG / SUB_ASSEMBLY (for BOM parents + SO/WO product)
  fg001: "00000000-0000-4000-8200-000000000201", // DEMO-FG-CNC-001 Máy CNC Demo
  fg002: "00000000-0000-4000-8200-000000000202", // DEMO-FG-JIG-001 Jig gá hàn
  fg003: "00000000-0000-4000-8200-000000000203", // DEMO-FG-MOD-001 Module băng tải
  // Sub-assemblies / RAW components
  al6061_001: "00000000-0000-4000-8200-000000000211",
  al6061_002: "00000000-0000-4000-8200-000000000212",
  al6061_003: "00000000-0000-4000-8200-000000000213",
  sus304_001: "00000000-0000-4000-8200-000000000214",
  vb001: "00000000-0000-4000-8200-000000000215",
  vb002: "00000000-0000-4000-8200-000000000216",
  spg001: "00000000-0000-4000-8200-000000000217",
  spg002: "00000000-0000-4000-8200-000000000218",
  up001: "00000000-0000-4000-8200-000000000219",
  up002: "00000000-0000-4000-8200-000000000220",
  up003: "00000000-0000-4000-8200-000000000221",
  up004: "00000000-0000-4000-8200-000000000222",
  cg001: "00000000-0000-4000-8200-000000000223",
  cg002: "00000000-0000-4000-8200-000000000224",
  mi001: "00000000-0000-4000-8200-000000000225",
  htpa001: "00000000-0000-4000-8200-000000000226",
  htbn001: "00000000-0000-4000-8200-000000000227",
  kiu001: "00000000-0000-4000-8200-000000000228",
  flange001: "00000000-0000-4000-8200-000000000229",
  flange002: "00000000-0000-4000-8200-000000000230",
  // Extra items
  al6061_004: "00000000-0000-4000-8200-000000000231",
  sus316_001: "00000000-0000-4000-8200-000000000232",
  vb003: "00000000-0000-4000-8200-000000000233",
  motor002: "00000000-0000-4000-8200-000000000234",
  seal001: "00000000-0000-4000-8200-000000000235",
} as const;

const BOM = {
  bom001: "00000000-0000-4000-8300-000000000301",
  bom002: "00000000-0000-4000-8300-000000000302",
  bom003: "00000000-0000-4000-8300-000000000303",
} as const;

const REV = {
  rev001: "00000000-0000-4000-8310-000000000311",
  rev002: "00000000-0000-4000-8310-000000000312",
  rev003: "00000000-0000-4000-8310-000000000313",
} as const;

// BOM lines (level 1 = root group, level 2 = actual component)
// BOM-001 lines
const BL = {
  // BOM-001 level-1 groups (SUB_ASSEMBLY items acting as parent lines)
  b1_l1_than: "00000000-0000-4000-8400-000000000401",
  b1_l1_truyen_dong: "00000000-0000-4000-8400-000000000402",
  b1_l1_kep: "00000000-0000-4000-8400-000000000403",
  b1_l1_hop_dien: "00000000-0000-4000-8400-000000000404",
  b1_l1_khi_nen: "00000000-0000-4000-8400-000000000405",
  // BOM-001 level-2 children
  b1_l2_al6061_001: "00000000-0000-4000-8400-000000000411",
  b1_l2_sus304: "00000000-0000-4000-8400-000000000412",
  b1_l2_motor: "00000000-0000-4000-8400-000000000413",
  b1_l2_vb001: "00000000-0000-4000-8400-000000000414",
  b1_l2_vb002: "00000000-0000-4000-8400-000000000415",
  b1_l2_cg001: "00000000-0000-4000-8400-000000000416",
  b1_l2_cg002: "00000000-0000-4000-8400-000000000417",
  b1_l2_kiu: "00000000-0000-4000-8400-000000000418",
  b1_l2_mi001: "00000000-0000-4000-8400-000000000419",
  b1_l2_vit: "00000000-0000-4000-8400-000000000420",
  b1_l2_daioc: "00000000-0000-4000-8400-000000000421",
  b1_l2_htpa: "00000000-0000-4000-8400-000000000422",
  b1_l2_htbn: "00000000-0000-4000-8400-000000000423",
  b1_l2_al6061_002: "00000000-0000-4000-8400-000000000424",
  b1_l2_up003: "00000000-0000-4000-8400-000000000425",
  // BOM-002 lines
  b2_l1_khung: "00000000-0000-4000-8400-000000000431",
  b2_l1_co_cau: "00000000-0000-4000-8400-000000000432",
  b2_l2_al6061_003: "00000000-0000-4000-8400-000000000433",
  b2_l2_sus316: "00000000-0000-4000-8400-000000000434",
  b2_l2_vb003: "00000000-0000-4000-8400-000000000435",
  b2_l2_flange001: "00000000-0000-4000-8400-000000000436",
  b2_l2_up001: "00000000-0000-4000-8400-000000000437",
  b2_l2_seal: "00000000-0000-4000-8400-000000000438",
  // BOM-003 lines
  b3_l1_bang_tai: "00000000-0000-4000-8400-000000000441",
  b3_l1_dan_dong: "00000000-0000-4000-8400-000000000442",
  b3_l2_al6061_004: "00000000-0000-4000-8400-000000000443",
  b3_l2_motor002: "00000000-0000-4000-8400-000000000444",
  b3_l2_spg002: "00000000-0000-4000-8400-000000000445",
  b3_l2_flange002: "00000000-0000-4000-8400-000000000446",
  b3_l2_up002: "00000000-0000-4000-8400-000000000447",
  b3_l2_htpa: "00000000-0000-4000-8400-000000000448",
} as const;

const SO = {
  so001: "00000000-0000-4000-8500-000000000501",
  so002: "00000000-0000-4000-8500-000000000502",
  so003: "00000000-0000-4000-8500-000000000503",
  so004: "00000000-0000-4000-8500-000000000504",
  so005: "00000000-0000-4000-8500-000000000505",
} as const;

const PO = {
  po001: "00000000-0000-4000-8600-000000000601",
  po002: "00000000-0000-4000-8600-000000000602",
  po003: "00000000-0000-4000-8600-000000000603",
  po004: "00000000-0000-4000-8600-000000000604",
} as const;

const POL = {
  pol001: "00000000-0000-4000-8610-000000000611",
  pol002: "00000000-0000-4000-8610-000000000612",
  pol003: "00000000-0000-4000-8610-000000000613",
  pol004: "00000000-0000-4000-8610-000000000614",
  pol005: "00000000-0000-4000-8610-000000000615",
  pol006: "00000000-0000-4000-8610-000000000616",
  pol007: "00000000-0000-4000-8610-000000000617",
  pol008: "00000000-0000-4000-8610-000000000618",
  pol009: "00000000-0000-4000-8610-000000000619",
  pol010: "00000000-0000-4000-8610-000000000620",
  pol011: "00000000-0000-4000-8610-000000000621",
  pol012: "00000000-0000-4000-8610-000000000622",
} as const;

const WO = {
  wo001: "00000000-0000-4000-8700-000000000701",
  wo002: "00000000-0000-4000-8700-000000000702",
  wo003: "00000000-0000-4000-8700-000000000703",
} as const;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seedDemo() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required — thêm vào .env");

  const { db, sql: pgSql } = createDbClient({ url, max: 3 });

  console.log("🌱 [seed-demo] Bắt đầu seed demo data...");

  // ── Xóa dữ liệu DEMO cũ (theo thứ tự FK ngược) ──────────────────────────
  console.log("  🗑  Xóa demo data cũ...");

  // Work orders
  await db.execute(rawSql`DELETE FROM app.work_order WHERE wo_no LIKE 'DEMO-%'`);
  // PO lines → PO
  await db.execute(rawSql`
    DELETE FROM app.purchase_order_line WHERE po_id IN (
      SELECT id FROM app.purchase_order WHERE po_no LIKE 'DEMO-%'
    )
  `);
  await db.execute(rawSql`DELETE FROM app.purchase_order WHERE po_no LIKE 'DEMO-%'`);
  // Sales orders
  await db.execute(rawSql`DELETE FROM app.sales_order WHERE order_no LIKE 'DEMO-%'`);
  // BOM lines → revisions → templates
  await db.execute(rawSql`
    DELETE FROM app.bom_line WHERE template_id IN (
      SELECT id FROM app.bom_template WHERE code LIKE 'DEMO-%'
    )
  `);
  await db.execute(rawSql`
    DELETE FROM app.bom_revision WHERE template_id IN (
      SELECT id FROM app.bom_template WHERE code LIKE 'DEMO-%'
    )
  `);
  await db.execute(rawSql`DELETE FROM app.bom_template WHERE code LIKE 'DEMO-%'`);
  // Item supplier links → items
  await db.execute(rawSql`
    DELETE FROM app.item_supplier WHERE item_id IN (
      SELECT id FROM app.item WHERE sku LIKE 'DEMO-%'
    )
  `);
  await db.execute(rawSql`DELETE FROM app.item WHERE sku LIKE 'DEMO-%'`);
  // Suppliers
  await db.execute(rawSql`DELETE FROM app.supplier WHERE code LIKE 'DEMO-%'`);

  // ── 1. Suppliers ─────────────────────────────────────────────────────────
  console.log("  📦  Inserting suppliers...");
  await db.insert(supplier).values([
    {
      id: SUP.sup001,
      code: "DEMO-SUP-001",
      name: "Công ty TNHH Thép Song Châu",
      contactName: "Nguyễn Văn An",
      phone: "024-3825-1111",
      email: "sales@thepsongchau.vn",
      address: "KCN Bắc Thăng Long, Hà Nội",
      taxCode: "0100111111",
      isActive: true,
    },
    {
      id: SUP.sup002,
      code: "DEMO-SUP-002",
      name: "Nhà CC Vòng Bi Đại Việt",
      contactName: "Trần Thị Bích",
      phone: "024-3999-2222",
      email: "order@daivietbearing.vn",
      address: "Số 45, Phố Huế, Hà Nội",
      taxCode: "0100222222",
      isActive: true,
    },
    {
      id: SUP.sup003,
      code: "DEMO-SUP-003",
      name: "Công ty Motor Việt Nam",
      contactName: "Lê Minh Hoàng",
      phone: "028-3845-3333",
      email: "tech@motorvn.com",
      address: "KCN Tân Bình, Tp.HCM",
      taxCode: "0100333333",
      isActive: true,
    },
    {
      id: SUP.sup004,
      code: "DEMO-SUP-004",
      name: "Nhà CC Nhựa & Mica Phong Phú",
      contactName: "Phạm Thị Lan",
      phone: "028-3712-4444",
      email: "kd@phongphumica.vn",
      address: "Q.Bình Tân, Tp.HCM",
      taxCode: "0100444444",
      isActive: true,
    },
    {
      id: SUP.sup005,
      code: "DEMO-SUP-005",
      name: "Đại lý Phụ kiện CNC Hà Nội",
      contactName: "Vũ Quang Khải",
      phone: "024-3625-5555",
      email: "cnc@phukiencnc.vn",
      address: "Số 12, Đường Giải Phóng, Hà Nội",
      taxCode: "0100555555",
      isActive: true,
    },
  ]);

  // ── 2. Items ──────────────────────────────────────────────────────────────
  console.log("  🔩  Inserting items...");

  // FG items (thành phẩm — dùng làm productItemId cho SO/WO và parentItemId cho BOM)
  await db.insert(item).values([
    {
      id: ITM.fg001,
      sku: "DEMO-FG-CNC-001",
      name: "Máy CNC Demo 238846",
      itemType: "FG",
      uom: "PCS",
      status: "ACTIVE",
      category: "FINISHED_GOODS",
      description: "Máy CNC demo phục vụ layout hệ thống",
      leadTimeDays: 30,
    },
    {
      id: ITM.fg002,
      sku: "DEMO-FG-JIG-001",
      name: "Jig gá hàn tự động",
      itemType: "FG",
      uom: "PCS",
      status: "ACTIVE",
      category: "FINISHED_GOODS",
      description: "Jig gá hàn tự động demo",
      leadTimeDays: 20,
    },
    {
      id: ITM.fg003,
      sku: "DEMO-FG-MOD-001",
      name: "Module cấp phôi băng tải",
      itemType: "FG",
      uom: "PCS",
      status: "ACTIVE",
      category: "FINISHED_GOODS",
      description: "Module cấp phôi băng tải demo",
      leadTimeDays: 15,
    },
    // Nhôm AL6061
    {
      id: ITM.al6061_001,
      sku: "DEMO-AL6061-001",
      name: "Tấm nhôm AL6061 anode 200×300×10mm",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "RAW_MATERIAL",
      description: "Tấm nhôm AL6061 anodized, kích thước 200×300×10mm",
      minStockQty: "10",
      reorderQty: "20",
      leadTimeDays: 7,
    },
    {
      id: ITM.al6061_002,
      sku: "DEMO-AL6061-002",
      name: "Tấm nhôm AL6061 anode 300×400×5mm",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "RAW_MATERIAL",
      description: "Tấm nhôm AL6061 anodized, kích thước 300×400×5mm",
      minStockQty: "8",
      reorderQty: "16",
      leadTimeDays: 7,
    },
    {
      id: ITM.al6061_003,
      sku: "DEMO-AL6061-003",
      name: "Tấm nhôm AL6061 anode 100×100×3mm",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "RAW_MATERIAL",
      leadTimeDays: 5,
    },
    {
      id: ITM.al6061_004,
      sku: "DEMO-AL6061-004",
      name: "Tấm nhôm AL6061 anode 150×250×6mm",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "RAW_MATERIAL",
      leadTimeDays: 5,
    },
    // Thép SUS304 / SUS316
    {
      id: ITM.sus304_001,
      sku: "DEMO-SUS304-001",
      name: "Tấm thép SUS304 điện hóa 200×300mm",
      itemType: "PURCHASED",
      uom: "SHEET",
      status: "ACTIVE",
      category: "RAW_MATERIAL",
      description: "Tấm thép không gỉ SUS304, xử lý điện hóa",
      minStockQty: "5",
      reorderQty: "10",
      leadTimeDays: 10,
    },
    {
      id: ITM.sus316_001,
      sku: "DEMO-SUS316-001",
      name: "Tấm thép SUS316L điện hóa 150×200mm",
      itemType: "PURCHASED",
      uom: "SHEET",
      status: "ACTIVE",
      category: "RAW_MATERIAL",
      leadTimeDays: 12,
    },
    // Vòng bi
    {
      id: ITM.vb001,
      sku: "DEMO-VB-001",
      name: "Vòng bi 688AZZ (8×16×5mm)",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "BEARING",
      description: "Vòng bi nhỏ 688AZZ cho trục chính",
      minStockQty: "20",
      reorderQty: "50",
      leadTimeDays: 5,
    },
    {
      id: ITM.vb002,
      sku: "DEMO-VB-002",
      name: "Vòng bi 696ZZ (6×15×5mm)",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "BEARING",
      minStockQty: "20",
      reorderQty: "50",
      leadTimeDays: 5,
    },
    {
      id: ITM.vb003,
      sku: "DEMO-VB-003",
      name: "Vòng bi 6201ZZ (12×32×10mm)",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "BEARING",
      leadTimeDays: 5,
    },
    // Động cơ / Lò xo
    {
      id: ITM.spg001,
      sku: "DEMO-SPG-001",
      name: "Động cơ S6I06 50W 24VDC",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "MOTOR",
      description: "Động cơ DC mini S6I06, 50W, 24V, với encoder",
      minStockQty: "2",
      reorderQty: "5",
      leadTimeDays: 14,
    },
    {
      id: ITM.motor002,
      sku: "DEMO-SPG-002M",
      name: "Động cơ bước NEMA23 3A",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "MOTOR",
      leadTimeDays: 14,
    },
    {
      id: ITM.spg002,
      sku: "DEMO-SPG-002",
      name: "Lò xo nén phi 5×20mm SUS304",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "SPRING",
      leadTimeDays: 3,
    },
    // Vật tư phụ
    {
      id: ITM.up001,
      sku: "DEMO-UP-001",
      name: "Vít M3×10 inox (gói 100 cái)",
      itemType: "CONSUMABLE",
      uom: "M",
      status: "ACTIVE",
      category: "FASTENER",
      description: "Vít M3×10mm, vật liệu inox SUS304, gói 100 cái",
      minStockQty: "5",
      reorderQty: "10",
      leadTimeDays: 3,
    },
    {
      id: ITM.up002,
      sku: "DEMO-UP-002",
      name: "Đai ốc M3 inox (gói 100 cái)",
      itemType: "CONSUMABLE",
      uom: "M",
      status: "ACTIVE",
      category: "FASTENER",
      minStockQty: "5",
      reorderQty: "10",
      leadTimeDays: 3,
    },
    {
      id: ITM.up003,
      sku: "DEMO-UP-003",
      name: "Vít M4×15 inox (gói 100 cái)",
      itemType: "CONSUMABLE",
      uom: "M",
      status: "ACTIVE",
      category: "FASTENER",
      leadTimeDays: 3,
    },
    {
      id: ITM.up004,
      sku: "DEMO-UP-004",
      name: "Gasket silicon phi 50mm",
      itemType: "CONSUMABLE",
      uom: "PCS",
      status: "ACTIVE",
      category: "SEAL",
      leadTimeDays: 5,
    },
    // Chốt / Cài
    {
      id: ITM.cg001,
      sku: "DEMO-CG-001",
      name: "Chốt cài KES3 không gỉ",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "LATCH",
      leadTimeDays: 7,
    },
    {
      id: ITM.cg002,
      sku: "DEMO-CG-002",
      name: "Chốt trụ phi 4×20mm SUS304",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "PIN",
      leadTimeDays: 5,
    },
    // Mica
    {
      id: ITM.mi001,
      sku: "DEMO-MI-001",
      name: "Mica trong 3mm (m²)",
      itemType: "PURCHASED",
      uom: "SHEET",
      status: "ACTIVE",
      category: "PANEL",
      description: "Tấm mica trong suốt dày 3mm, tính theo sheet 1200×600mm",
      leadTimeDays: 5,
    },
    // Ống / Bộ nối khí nén
    {
      id: ITM.htpa001,
      sku: "DEMO-HTPA-001",
      name: "Ống nối HTPA25S3M150",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "PNEUMATIC",
      leadTimeDays: 5,
    },
    {
      id: ITM.htbn001,
      sku: "DEMO-HTBN-001",
      name: "Bộ nối HTBN225S3M",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "PNEUMATIC",
      leadTimeDays: 5,
    },
    // Kẹp
    {
      id: ITM.kiu001,
      sku: "DEMO-KIU-001",
      name: "Kẹp iu 38mm không gỉ",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "CLAMP",
      leadTimeDays: 5,
    },
    // Mặt bích
    {
      id: ITM.flange001,
      sku: "DEMO-FLANGE-001",
      name: "Mặt bích flange phi 50 inox",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "FLANGE",
      leadTimeDays: 7,
    },
    {
      id: ITM.flange002,
      sku: "DEMO-FLANGE-002",
      name: "Mặt bích flange phi 80 inox",
      itemType: "PURCHASED",
      uom: "PCS",
      status: "ACTIVE",
      category: "FLANGE",
      leadTimeDays: 7,
    },
    // Seal
    {
      id: ITM.seal001,
      sku: "DEMO-SEAL-001",
      name: "Vòng đệm O-ring NBR phi 30mm",
      itemType: "CONSUMABLE",
      uom: "PCS",
      status: "ACTIVE",
      category: "SEAL",
      leadTimeDays: 3,
    },
  ]);

  // ── 3. Item-Supplier links ────────────────────────────────────────────────
  console.log("  🔗  Inserting item-supplier links...");
  await db.insert(itemSupplier).values([
    // SUP-001 (Thép Song Châu) cung cấp nhôm + thép
    {
      itemId: ITM.al6061_001,
      supplierId: SUP.sup001,
      supplierSku: "AL6061-200300-10-ANO",
      priceRef: "850000",
      currency: "VND",
      leadTimeDays: 7,
      moq: "5",
      isPreferred: true,
    },
    {
      itemId: ITM.al6061_002,
      supplierId: SUP.sup001,
      supplierSku: "AL6061-300400-5-ANO",
      priceRef: "720000",
      currency: "VND",
      leadTimeDays: 7,
      moq: "5",
      isPreferred: true,
    },
    {
      itemId: ITM.sus304_001,
      supplierId: SUP.sup001,
      supplierSku: "SUS304-200300-EL",
      priceRef: "1200000",
      currency: "VND",
      leadTimeDays: 10,
      moq: "2",
      isPreferred: true,
    },
    // SUP-002 (Vòng Bi Đại Việt) cung cấp bearing
    {
      itemId: ITM.vb001,
      supplierId: SUP.sup002,
      supplierSku: "688AZZ-NSK",
      priceRef: "45000",
      currency: "VND",
      leadTimeDays: 5,
      moq: "10",
      isPreferred: true,
    },
    {
      itemId: ITM.vb002,
      supplierId: SUP.sup002,
      supplierSku: "696ZZ-NSK",
      priceRef: "38000",
      currency: "VND",
      leadTimeDays: 5,
      moq: "10",
      isPreferred: true,
    },
    // SUP-003 (Motor VN) cung cấp động cơ
    {
      itemId: ITM.spg001,
      supplierId: SUP.sup003,
      supplierSku: "S6I06-50W-24V",
      priceRef: "2850000",
      currency: "VND",
      leadTimeDays: 14,
      moq: "1",
      isPreferred: true,
    },
    // SUP-004 (Nhựa & Mica Phong Phú) cung cấp mica + seal
    {
      itemId: ITM.mi001,
      supplierId: SUP.sup004,
      supplierSku: "MICA-CLEAR-3MM",
      priceRef: "95000",
      currency: "VND",
      leadTimeDays: 5,
      moq: "1",
      isPreferred: true,
    },
    // SUP-005 (Phụ kiện CNC) cung cấp vít, ống khí nén
    {
      itemId: ITM.up001,
      supplierId: SUP.sup005,
      supplierSku: "M3-10-SUS-100",
      priceRef: "85000",
      currency: "VND",
      leadTimeDays: 3,
      moq: "1",
      isPreferred: true,
    },
    {
      itemId: ITM.htpa001,
      supplierId: SUP.sup005,
      supplierSku: "HTPA25S3M150",
      priceRef: "125000",
      currency: "VND",
      leadTimeDays: 5,
      moq: "5",
      isPreferred: true,
    },
    {
      itemId: ITM.htbn001,
      supplierId: SUP.sup005,
      supplierSku: "HTBN225S3M",
      priceRef: "98000",
      currency: "VND",
      leadTimeDays: 5,
      moq: "5",
      isPreferred: true,
    },
  ]);

  // ── 4. BOM Templates ─────────────────────────────────────────────────────
  console.log("  📋  Inserting BOM templates...");
  await db.insert(bomTemplate).values([
    {
      id: BOM.bom001,
      code: "DEMO-BOM-001",
      name: "Máy CNC Demo 238846",
      description: "BOM demo cho máy CNC mẫu — layout đầy đủ 2 cấp",
      parentItemId: ITM.fg001,
      targetQty: "1",
      status: "ACTIVE",
    },
    {
      id: BOM.bom002,
      code: "DEMO-BOM-002",
      name: "Jig gá hàn tự động",
      description: "BOM demo cho jig gá hàn",
      parentItemId: ITM.fg002,
      targetQty: "1",
      status: "ACTIVE",
    },
    {
      id: BOM.bom003,
      code: "DEMO-BOM-003",
      name: "Module cấp phôi băng tải",
      description: "BOM demo cho module băng tải",
      parentItemId: ITM.fg003,
      targetQty: "1",
      status: "DRAFT",
    },
  ]);

  // ── 5. BOM Revisions ─────────────────────────────────────────────────────
  console.log("  📝  Inserting BOM revisions...");
  await db.insert(bomRevision).values([
    {
      id: REV.rev001,
      templateId: BOM.bom001,
      revisionNo: "R01",
      status: "RELEASED",
      frozenSnapshot: {},
      releasedAt: new Date("2026-04-01T08:00:00Z"),
      notes: "Revision đầu tiên — RELEASED cho production",
    },
    {
      id: REV.rev002,
      templateId: BOM.bom002,
      revisionNo: "R01",
      status: "RELEASED",
      frozenSnapshot: {},
      releasedAt: new Date("2026-04-05T08:00:00Z"),
      notes: "Revision đầu tiên BOM jig",
    },
    {
      id: REV.rev003,
      templateId: BOM.bom003,
      revisionNo: "R01",
      status: "DRAFT",
      frozenSnapshot: {},
      notes: "Draft — chưa release",
    },
  ]);

  // ── 6. BOM Lines ─────────────────────────────────────────────────────────
  console.log("  🌲  Inserting BOM lines...");

  // ── BOM-001: Máy CNC Demo (2 cấp, 5 nhóm L1, 15 lines L2) ──
  // Level 1 — các nhóm/cụm (dùng chính item FG hoặc item sub-asm đại diện)
  // Lưu ý: componentItemId ở L1 là item đại diện cụm (ta dùng các "sub" item)
  // Drizzle schema không có "group item" riêng, ta dùng item thực tế làm "header"
  // Phương án: Level-1 lines trỏ component = item thực (nhóm đại diện)

  await db.insert(bomLine).values([
    // ── BOM-001 Level 1: Groups ──
    {
      id: BL.b1_l1_than,
      templateId: BOM.bom001,
      parentLineId: null,
      componentItemId: ITM.al6061_001,   // đại diện nhóm "Thân máy chính"
      level: 1,
      position: 1,
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "PCS",
      description: "Nhóm: Thân máy chính",
    },
    {
      id: BL.b1_l1_truyen_dong,
      templateId: BOM.bom001,
      parentLineId: null,
      componentItemId: ITM.spg001,      // đại diện nhóm "Hệ truyền động"
      level: 1,
      position: 2,
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "PCS",
      description: "Nhóm: Hệ truyền động",
    },
    {
      id: BL.b1_l1_kep,
      templateId: BOM.bom001,
      parentLineId: null,
      componentItemId: ITM.cg001,       // đại diện nhóm "Hệ kẹp"
      level: 1,
      position: 3,
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "PCS",
      description: "Nhóm: Hệ kẹp",
    },
    {
      id: BL.b1_l1_hop_dien,
      templateId: BOM.bom001,
      parentLineId: null,
      componentItemId: ITM.mi001,       // đại diện nhóm "Hộp điều khiển"
      level: 1,
      position: 4,
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "PCS",
      description: "Nhóm: Hộp điều khiển",
    },
    {
      id: BL.b1_l1_khi_nen,
      templateId: BOM.bom001,
      parentLineId: null,
      componentItemId: ITM.htpa001,     // đại diện nhóm "Kết nối khí nén"
      level: 1,
      position: 5,
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "PCS",
      description: "Nhóm: Kết nối khí nén",
    },

    // ── BOM-001 Level 2: Actual components ──
    // Thân máy chính → các tấm nhôm + thép
    {
      id: BL.b1_l2_al6061_001,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_than,
      componentItemId: ITM.al6061_001,
      level: 2,
      position: 1,
      qtyPerParent: "4",
      scrapPercent: "3",
      uom: "PCS",
      description: "Tấm nhôm mặt ngoài thân máy",
    },
    {
      id: BL.b1_l2_sus304,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_than,
      componentItemId: ITM.sus304_001,
      level: 2,
      position: 2,
      qtyPerParent: "2",
      scrapPercent: "2",
      uom: "SHEET",
      description: "Tấm thép đế + mặt sau thân máy",
    },
    {
      id: BL.b1_l2_al6061_002,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_than,
      componentItemId: ITM.al6061_002,
      level: 2,
      position: 3,
      qtyPerParent: "2",
      scrapPercent: "3",
      uom: "PCS",
      description: "Tấm nhôm mặt bên thân máy",
    },
    {
      id: BL.b1_l2_up003,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_than,
      componentItemId: ITM.up003,
      level: 2,
      position: 4,
      qtyPerParent: "3",
      scrapPercent: "5",
      uom: "M",
      description: "Vít M4×15 gắn tấm nhôm",
    },
    // Hệ truyền động → động cơ + vòng bi
    {
      id: BL.b1_l2_motor,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_truyen_dong,
      componentItemId: ITM.spg001,
      level: 2,
      position: 1,
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "PCS",
      description: "Động cơ chính S6I06 50W",
    },
    {
      id: BL.b1_l2_vb001,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_truyen_dong,
      componentItemId: ITM.vb001,
      level: 2,
      position: 2,
      qtyPerParent: "2",
      scrapPercent: "2",
      uom: "PCS",
      description: "Vòng bi 688AZZ trục chính",
    },
    {
      id: BL.b1_l2_vb002,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_truyen_dong,
      componentItemId: ITM.vb002,
      level: 2,
      position: 3,
      qtyPerParent: "4",
      scrapPercent: "2",
      uom: "PCS",
      description: "Vòng bi 696ZZ trục phụ",
    },
    // Hệ kẹp → chốt + kẹp iu
    {
      id: BL.b1_l2_cg001,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_kep,
      componentItemId: ITM.cg001,
      level: 2,
      position: 1,
      qtyPerParent: "6",
      scrapPercent: "3",
      uom: "PCS",
      description: "Chốt cài KES3 cơ cấu kẹp",
    },
    {
      id: BL.b1_l2_cg002,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_kep,
      componentItemId: ITM.cg002,
      level: 2,
      position: 2,
      qtyPerParent: "4",
      scrapPercent: "3",
      uom: "PCS",
      description: "Chốt trụ phi 4 hệ kẹp",
    },
    {
      id: BL.b1_l2_kiu,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_kep,
      componentItemId: ITM.kiu001,
      level: 2,
      position: 3,
      qtyPerParent: "2",
      scrapPercent: "0",
      uom: "PCS",
      description: "Kẹp iu 38mm cố định phôi",
    },
    // Hộp điều khiển → mica + vít + đai ốc
    {
      id: BL.b1_l2_mi001,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_hop_dien,
      componentItemId: ITM.mi001,
      level: 2,
      position: 1,
      qtyPerParent: "1",
      scrapPercent: "5",
      uom: "SHEET",
      description: "Tấm mica 3mm cửa hộp điều khiển",
    },
    {
      id: BL.b1_l2_vit,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_hop_dien,
      componentItemId: ITM.up001,
      level: 2,
      position: 2,
      qtyPerParent: "2",
      scrapPercent: "8",
      uom: "M",
      description: "Vít M3×10 gắn hộp điều khiển",
    },
    {
      id: BL.b1_l2_daioc,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_hop_dien,
      componentItemId: ITM.up002,
      level: 2,
      position: 3,
      qtyPerParent: "2",
      scrapPercent: "8",
      uom: "M",
      description: "Đai ốc M3 hộp điều khiển",
    },
    // Kết nối khí nén → ống + bộ nối
    {
      id: BL.b1_l2_htpa,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_khi_nen,
      componentItemId: ITM.htpa001,
      level: 2,
      position: 1,
      qtyPerParent: "3",
      scrapPercent: "2",
      uom: "PCS",
      description: "Ống nối HTPA25 mạch khí chính",
    },
    {
      id: BL.b1_l2_htbn,
      templateId: BOM.bom001,
      parentLineId: BL.b1_l1_khi_nen,
      componentItemId: ITM.htbn001,
      level: 2,
      position: 2,
      qtyPerParent: "2",
      scrapPercent: "2",
      uom: "PCS",
      description: "Bộ nối HTBN225 phân nhánh khí",
    },

    // ── BOM-002: Jig gá hàn (2 nhóm, 6 lines) ──
    {
      id: BL.b2_l1_khung,
      templateId: BOM.bom002,
      parentLineId: null,
      componentItemId: ITM.al6061_003,
      level: 1,
      position: 1,
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "PCS",
      description: "Nhóm: Khung jig",
    },
    {
      id: BL.b2_l1_co_cau,
      templateId: BOM.bom002,
      parentLineId: null,
      componentItemId: ITM.vb003,
      level: 1,
      position: 2,
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "PCS",
      description: "Nhóm: Cơ cấu xoay",
    },
    {
      id: BL.b2_l2_al6061_003,
      templateId: BOM.bom002,
      parentLineId: BL.b2_l1_khung,
      componentItemId: ITM.al6061_003,
      level: 2,
      position: 1,
      qtyPerParent: "8",
      scrapPercent: "4",
      uom: "PCS",
      description: "Tấm nhôm 100×100 thanh ngang khung",
    },
    {
      id: BL.b2_l2_sus316,
      templateId: BOM.bom002,
      parentLineId: BL.b2_l1_khung,
      componentItemId: ITM.sus316_001,
      level: 2,
      position: 2,
      qtyPerParent: "2",
      scrapPercent: "3",
      uom: "SHEET",
      description: "Tấm thép SUS316 đế khung jig",
    },
    {
      id: BL.b2_l2_vb003,
      templateId: BOM.bom002,
      parentLineId: BL.b2_l1_co_cau,
      componentItemId: ITM.vb003,
      level: 2,
      position: 1,
      qtyPerParent: "2",
      scrapPercent: "2",
      uom: "PCS",
      description: "Vòng bi 6201ZZ cơ cấu xoay",
    },
    {
      id: BL.b2_l2_flange001,
      templateId: BOM.bom002,
      parentLineId: BL.b2_l1_co_cau,
      componentItemId: ITM.flange001,
      level: 2,
      position: 2,
      qtyPerParent: "2",
      scrapPercent: "0",
      uom: "PCS",
      description: "Mặt bích phi 50 gắn cơ cấu xoay",
    },
    {
      id: BL.b2_l2_up001,
      templateId: BOM.bom002,
      parentLineId: BL.b2_l1_co_cau,
      componentItemId: ITM.up001,
      level: 2,
      position: 3,
      qtyPerParent: "1",
      scrapPercent: "8",
      uom: "M",
      description: "Vít M3×10 cơ cấu xoay",
    },
    {
      id: BL.b2_l2_seal,
      templateId: BOM.bom002,
      parentLineId: BL.b2_l1_co_cau,
      componentItemId: ITM.seal001,
      level: 2,
      position: 4,
      qtyPerParent: "4",
      scrapPercent: "5",
      uom: "PCS",
      description: "O-ring NBR làm kín trục xoay",
    },

    // ── BOM-003: Module băng tải (2 nhóm, 6 lines) ──
    {
      id: BL.b3_l1_bang_tai,
      templateId: BOM.bom003,
      parentLineId: null,
      componentItemId: ITM.al6061_004,
      level: 1,
      position: 1,
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "PCS",
      description: "Nhóm: Khung băng tải",
    },
    {
      id: BL.b3_l1_dan_dong,
      templateId: BOM.bom003,
      parentLineId: null,
      componentItemId: ITM.motor002,
      level: 1,
      position: 2,
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "PCS",
      description: "Nhóm: Dẫn động băng tải",
    },
    {
      id: BL.b3_l2_al6061_004,
      templateId: BOM.bom003,
      parentLineId: BL.b3_l1_bang_tai,
      componentItemId: ITM.al6061_004,
      level: 2,
      position: 1,
      qtyPerParent: "6",
      scrapPercent: "3",
      uom: "PCS",
      description: "Tấm nhôm 150×250 thanh đỡ băng",
    },
    {
      id: BL.b3_l2_flange002,
      templateId: BOM.bom003,
      parentLineId: BL.b3_l1_bang_tai,
      componentItemId: ITM.flange002,
      level: 2,
      position: 2,
      qtyPerParent: "2",
      scrapPercent: "0",
      uom: "PCS",
      description: "Mặt bích phi 80 gắn trục cuốn",
    },
    {
      id: BL.b3_l2_motor002,
      templateId: BOM.bom003,
      parentLineId: BL.b3_l1_dan_dong,
      componentItemId: ITM.motor002,
      level: 2,
      position: 1,
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "PCS",
      description: "Động cơ bước NEMA23 dẫn động",
    },
    {
      id: BL.b3_l2_spg002,
      templateId: BOM.bom003,
      parentLineId: BL.b3_l1_dan_dong,
      componentItemId: ITM.spg002,
      level: 2,
      position: 2,
      qtyPerParent: "4",
      scrapPercent: "3",
      uom: "PCS",
      description: "Lò xo nén phi 5 cơ cấu căng băng",
    },
    {
      id: BL.b3_l2_up002,
      templateId: BOM.bom003,
      parentLineId: BL.b3_l1_dan_dong,
      componentItemId: ITM.up002,
      level: 2,
      position: 3,
      qtyPerParent: "2",
      scrapPercent: "8",
      uom: "M",
      description: "Đai ốc M3 cố định motor",
    },
    {
      id: BL.b3_l2_htpa,
      templateId: BOM.bom003,
      parentLineId: BL.b3_l1_bang_tai,
      componentItemId: ITM.htpa001,
      level: 2,
      position: 3,
      qtyPerParent: "2",
      scrapPercent: "2",
      uom: "PCS",
      description: "Ống khí nén thổi phôi",
    },
  ]);

  // ── 7. Sales Orders ───────────────────────────────────────────────────────
  console.log("  🛒  Inserting sales orders...");
  await db.insert(salesOrder).values([
    {
      id: SO.so001,
      orderNo: "DEMO-SO-001",
      customerName: "Khách hàng A — Công ty ABC",
      customerRef: "PO-ABC-2026-0401",
      status: "CONFIRMED",
      productItemId: ITM.fg001,
      bomTemplateId: BOM.bom001,
      orderQty: "1",
      dueDate: "2026-05-15",
      notes: "Giao hàng tại KCN Bắc Thăng Long. Kiểm tra trước khi giao.",
    },
    {
      id: SO.so002,
      orderNo: "DEMO-SO-002",
      customerName: "Khách hàng B — Xưởng Cơ Khí XYZ",
      customerRef: "XYZ-RFQ-2026-025",
      status: "CONFIRMED",
      productItemId: ITM.fg002,
      bomTemplateId: BOM.bom002,
      orderQty: "2",
      dueDate: "2026-05-20",
      notes: "Cần 2 bộ jig, giao đợt 1 (1 bộ) trước 2026-05-10.",
    },
    {
      id: SO.so003,
      orderNo: "DEMO-SO-003",
      customerName: "Khách hàng C — Tập đoàn DEF",
      customerRef: "DEF-PO-2604-011",
      status: "IN_PROGRESS",
      productItemId: ITM.fg001,
      bomTemplateId: BOM.bom001,
      orderQty: "1",
      dueDate: "2026-04-30",
      notes: "Đơn khẩn — đang gia công. Ưu tiên cao.",
    },
    {
      id: SO.so004,
      orderNo: "DEMO-SO-004",
      customerName: "Khách hàng D — Công ty GHI",
      customerRef: "GHI-2026-BK03",
      status: "CONFIRMED",
      productItemId: ITM.fg003,
      bomTemplateId: BOM.bom003,
      orderQty: "1",
      dueDate: "2026-06-01",
      notes: "Băng tải custom theo bản vẽ đính kèm email.",
    },
    {
      id: SO.so005,
      orderNo: "DEMO-SO-005",
      customerName: "Khách hàng E — Nhà máy JKL",
      customerRef: null,
      status: "DRAFT",
      productItemId: ITM.fg002,
      bomTemplateId: BOM.bom002,
      orderQty: "3",
      dueDate: "2026-06-15",
      notes: "Đơn nháp — chờ xác nhận giá từ KH.",
    },
  ]);

  // ── 8. Purchase Orders + Lines ────────────────────────────────────────────
  console.log("  📦  Inserting purchase orders...");
  await db.insert(purchaseOrder).values([
    {
      id: PO.po001,
      poNo: "DEMO-PO-001",
      supplierId: SUP.sup001,
      status: "SENT",
      linkedOrderId: SO.so003,
      orderDate: "2026-04-10",
      expectedEta: "2026-04-18",
      currency: "VND",
      totalAmount: "12500000",
      notes: "QUÁ HẠN — cần liên hệ SUP-001 ngay. Tấm nhôm chưa nhận.",
      sentAt: new Date("2026-04-10T09:00:00Z"),
    },
    {
      id: PO.po002,
      poNo: "DEMO-PO-002",
      supplierId: SUP.sup002,
      status: "PARTIAL",
      linkedOrderId: SO.so001,
      orderDate: "2026-04-12",
      expectedEta: "2026-04-21",
      currency: "VND",
      totalAmount: "3150000",
      notes: "CRITICAL — vòng bi 696ZZ chưa nhận. ETA còn 1 ngày.",
      sentAt: new Date("2026-04-12T10:00:00Z"),
    },
    {
      id: PO.po003,
      poNo: "DEMO-PO-003",
      supplierId: SUP.sup003,
      status: "SENT",
      linkedOrderId: SO.so002,
      orderDate: "2026-04-14",
      expectedEta: "2026-04-25",
      currency: "VND",
      totalAmount: "17100000",
      notes: "WARNING — còn 5 ngày đến ETA. Cần xác nhận tiến độ.",
      sentAt: new Date("2026-04-14T14:00:00Z"),
    },
    {
      id: PO.po004,
      poNo: "DEMO-PO-004",
      supplierId: SUP.sup004,
      status: "SENT",
      linkedOrderId: SO.so004,
      orderDate: "2026-04-18",
      expectedEta: "2026-05-05",
      currency: "VND",
      totalAmount: "2280000",
      notes: "OK — ETA còn 15 ngày. Theo dõi bình thường.",
    },
  ]);

  console.log("  📄  Inserting PO lines...");
  await db.insert(purchaseOrderLine).values([
    // ── PO-001 (Thép Song Châu — QUÁ HẠN) ──
    {
      id: POL.pol001,
      poId: PO.po001,
      lineNo: 1,
      itemId: ITM.al6061_001,
      orderedQty: "10",
      receivedQty: "0",
      unitPrice: "850000",
      expectedEta: "2026-04-18",
      notes: "QUÁ HẠN — chưa nhận 10 pcs tấm nhôm AL6061-001",
    },
    {
      id: POL.pol002,
      poId: PO.po001,
      lineNo: 2,
      itemId: ITM.sus304_001,
      orderedQty: "5",
      receivedQty: "5",
      unitPrice: "1200000",
      expectedEta: "2026-04-18",
      notes: "Đã nhận đủ — 5 tấm SUS304",
    },
    {
      id: POL.pol003,
      poId: PO.po001,
      lineNo: 3,
      itemId: ITM.al6061_002,
      orderedQty: "8",
      receivedQty: "0",
      unitPrice: "720000",
      expectedEta: "2026-04-20",
      notes: "Chờ batch 2 từ supplier",
    },

    // ── PO-002 (Vòng Bi Đại Việt — CRITICAL PARTIAL) ──
    {
      id: POL.pol004,
      poId: PO.po002,
      lineNo: 1,
      itemId: ITM.vb001,
      orderedQty: "20",
      receivedQty: "12",
      unitPrice: "45000",
      expectedEta: "2026-04-21",
      notes: "Đã nhận 12/20 pcs 688AZZ",
    },
    {
      id: POL.pol005,
      poId: PO.po002,
      lineNo: 2,
      itemId: ITM.vb002,
      orderedQty: "15",
      receivedQty: "0",
      unitPrice: "38000",
      expectedEta: "2026-04-22",
      notes: "CRITICAL — 0/15 pcs 696ZZ, ETA 2026-04-22",
    },
    {
      id: POL.pol006,
      poId: PO.po002,
      lineNo: 3,
      itemId: ITM.vb003,
      orderedQty: "10",
      receivedQty: "10",
      unitPrice: "95000",
      expectedEta: "2026-04-19",
      notes: "Đã nhận đủ 10/10 pcs 6201ZZ",
    },

    // ── PO-003 (Motor VN — WARNING) ──
    {
      id: POL.pol007,
      poId: PO.po003,
      lineNo: 1,
      itemId: ITM.spg001,
      orderedQty: "6",
      receivedQty: "0",
      unitPrice: "2850000",
      expectedEta: "2026-04-25",
      notes: "6 động cơ S6I06, ETA 2026-04-25",
    },
    {
      id: POL.pol008,
      poId: PO.po003,
      lineNo: 2,
      itemId: ITM.motor002,
      orderedQty: "3",
      receivedQty: "0",
      unitPrice: "1850000",
      expectedEta: "2026-04-25",
      notes: "3 động cơ bước NEMA23",
    },

    // ── PO-004 (Mica Phong Phú — OK) ──
    {
      id: POL.pol009,
      poId: PO.po004,
      lineNo: 1,
      itemId: ITM.mi001,
      orderedQty: "10",
      receivedQty: "0",
      unitPrice: "95000",
      expectedEta: "2026-05-03",
      notes: "10 tấm mica 3mm",
    },
    {
      id: POL.pol010,
      poId: PO.po004,
      lineNo: 2,
      itemId: ITM.up004,
      orderedQty: "50",
      receivedQty: "0",
      unitPrice: "15000",
      expectedEta: "2026-05-05",
      notes: "50 pcs gasket silicon phi 50",
    },
    {
      id: POL.pol011,
      poId: PO.po004,
      lineNo: 3,
      itemId: ITM.seal001,
      orderedQty: "100",
      receivedQty: "0",
      unitPrice: "8000",
      expectedEta: "2026-05-05",
      notes: "100 pcs O-ring NBR",
    },
    {
      id: POL.pol012,
      poId: PO.po004,
      lineNo: 4,
      itemId: ITM.kiu001,
      orderedQty: "20",
      receivedQty: "0",
      unitPrice: "55000",
      expectedEta: "2026-05-05",
      notes: "20 pcs kẹp iu 38mm",
    },
  ]);

  // ── 9. Work Orders ────────────────────────────────────────────────────────
  console.log("  🏭  Inserting work orders...");
  await db.insert(workOrder).values([
    {
      id: WO.wo001,
      woNo: "DEMO-WO-001",
      productItemId: ITM.fg001,
      linkedOrderId: SO.so003,
      plannedQty: "1",
      goodQty: "0",
      scrapQty: "0",
      status: "IN_PROGRESS",
      priority: "HIGH",
      plannedStart: "2026-04-15",
      plannedEnd: "2026-04-30",
      startedAt: new Date("2026-04-15T07:30:00Z"),
      notes: "WO khẩn cho đơn SO-003. Ưu tiên cao nhất.",
    },
    {
      id: WO.wo002,
      woNo: "DEMO-WO-002",
      productItemId: ITM.fg002,
      linkedOrderId: SO.so002,
      plannedQty: "2",
      goodQty: "0",
      scrapQty: "0",
      status: "RELEASED",
      priority: "NORMAL",
      plannedStart: "2026-04-22",
      plannedEnd: "2026-05-10",
      notes: "Chờ nhận đủ vật tư từ PO-002 mới bắt đầu.",
    },
    {
      id: WO.wo003,
      woNo: "DEMO-WO-003",
      productItemId: ITM.fg001,
      linkedOrderId: SO.so001,
      plannedQty: "1",
      goodQty: "1",
      scrapQty: "0",
      status: "COMPLETED",
      priority: "NORMAL",
      plannedStart: "2026-04-01",
      plannedEnd: "2026-04-14",
      startedAt: new Date("2026-04-01T08:00:00Z"),
      completedAt: new Date("2026-04-14T17:00:00Z"),
      notes: "Hoàn thành đúng tiến độ. QC đã pass.",
    },
  ]);

  console.log("");
  console.log("✅ [seed-demo] Seed hoàn tất!");
  console.log("");
  console.log("   Dữ liệu đã tạo:");
  console.log("   • 5  Suppliers     (DEMO-SUP-001 → DEMO-SUP-005)");
  console.log("   • 28 Items         (DEMO-FG-*, DEMO-AL6061-*, DEMO-VB-*, ...)");
  console.log("   • 11 Item-Supplier links");
  console.log("   • 3  BOM templates (DEMO-BOM-001 → DEMO-BOM-003)");
  console.log("   • 3  BOM revisions (R01 cho mỗi BOM)");
  console.log("   • 32 BOM lines     (BOM-001: 20 lines, BOM-002: 8, BOM-003: 8)");
  console.log("   • 5  Sales orders  (DEMO-SO-001 → DEMO-SO-005)");
  console.log("   • 4  Purchase orders (1 QUÁ HẠN, 1 CRITICAL, 1 WARNING, 1 OK)");
  console.log("   • 12 PO lines");
  console.log("   • 3  Work orders   (IN_PROGRESS, QUEUED, COMPLETED)");
  console.log("");
  console.log("   Xóa demo: psql -c \"DELETE FROM app.item WHERE sku LIKE 'DEMO-%'\"");

  await pgSql.end({ timeout: 5 });
}

seedDemo().catch((err) => {
  console.error("[seed-demo] FAIL:", err);
  process.exit(1);
});
