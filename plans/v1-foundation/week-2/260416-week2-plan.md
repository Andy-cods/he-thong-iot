# Tuần 2 Implementation Plan — Item Master + Barcode + Supplier + Excel Import

*Phiên bản:* 1.0 · *Ngày:* 2026-04-16 · *Persona:* Technical Planner · *YAGNI/KISS/DRY*
*Scope chọn:* Balanced 5 ngày (theo brainstorm §9) · 2 dev full-stack
*Cross-link:* `plans/v1-foundation/week-2/brainstorm.md` · `plans/v1-foundation/260416-v1-implementation-plan.md` §7 M2 · §8 Tuần 2 · `packages/db/src/schema/master.ts` · `plans/design/260416-v1-wireframes.md` §3 · `docs/design-guidelines.md`

---

## 1. Scope & Deliverables

### 1.1 User-facing outcome cuối tuần 2
Sau 5 ngày, user (planner/admin) mở `https://iot.<domain>.vn/items` sẽ có được:

1. **Danh sách 10.247 SKU** (10k Phase 0 + vài trăm nội bộ) load P95 < 200ms, search "thep" ra "thép", filter Loại/UoM/Status combo, pagination jump tới trang 157.
2. **Nút "+ Thêm"** → Sheet phải form tạo item (SKU manual, validate regex realtime, debounce check unique 300ms).
3. **Row click** → Sheet edit đầy đủ: info chung + tab Barcode (add/remove, set primary) + tab Supplier (add/remove, MOQ, lead time, preferred).
4. **Nút "⤓ Import Excel"** → Wizard 3 step: Upload (hash SHA-256 client → reject nếu đã import < 1h) → Preview (async job trả 20 rows mẫu + errorCount + duplicateMode radio) → Commit (progress bar poll 2s, chunked 500 rows/job BullMQ Flow, download file lỗi khi fail).
5. **Audit trail** mọi write (create/update/delete/import) vào `audit_event`.

### 1.2 Acceptance criteria (đúng §8 Tuần 2 master plan)
- [ ] Import thật 3.000 SKU từ `items_cleaned.xlsx` (Phase 0) → **thành công**, thời gian < 90s.
- [ ] `GET /api/items?q=thep&page=1` P95 < 200ms khi có 10k rows (test với Apache Bench hoặc k6).
- [ ] Unique constraint SKU, unique barcode value, 1 primary barcode/item hoạt động (test SQL-level).
- [ ] Re-upload cùng file trong 1h → backend trả existing batch, confirm dialog client.
- [ ] Coverage unit test nghiệp vụ (parser, validator, preview aggregator) ≥ 55%.

### 1.3 Out-of-scope Tuần 2 (defer)
- Print barcode (generate ảnh PNG/PDF) → V1.1
- Supplier bulk CSV import → V1.5
- Item inline edit errors in wizard → V1.1
- Cancel running import job → V1.1
- SSE/WebSocket progress → V2
- `onHand` column trong list → để trống đến Tuần 5 khi có `inventory_txn`
- Substitute item, phantom BOM, multi-warehouse → V2

---

## 2. Schema Changes

### 2.1 Enum mở rộng `itemTypeEnum`
File migration mới: `packages/db/migrations/0002_week2_item_master.sql`

```sql
-- 1. Thêm 2 value enum item_type (brainstorm §1, quyết định 1 đã chốt)
ALTER TYPE app.item_type ADD VALUE IF NOT EXISTS 'TOOL';
ALTER TYPE app.item_type ADD VALUE IF NOT EXISTS 'PACKAGING';
-- LƯU Ý Postgres: ALTER TYPE ADD VALUE không chạy trong transaction.
-- drizzle-kit auto split → migrate 2 statement riêng.
```

### 2.2 Thêm field vào bảng có sẵn
Sửa `packages/db/src/schema/master.ts`:

```ts
// item: thêm category + isActive (soft delete flag)
category: varchar("category", { length: 64 }),          // free text, index trgm
isActive: boolean("is_active").notNull().default(true), // soft delete

// item_barcode: thêm source + barcodeType enum
barcodeTypeEnum = pgEnum("barcode_type", [
  "EAN13", "EAN8", "CODE128", "CODE39", "QR", "DATAMATRIX"
]),
source: varchar("source", { length: 16 }).notNull().default("internal"),
// values: "vendor" | "internal"

// item_supplier: thêm moq + packSize + vendorItemCode (alias supplierSku)
moq: numeric("moq", { precision: 18, scale: 4 }).notNull().default("1"),
packSize: numeric("pack_size", { precision: 18, scale: 4 }).notNull().default("1"),
// supplierSku đã có, giữ nguyên (đóng vai trò vendor_item_code).
```

SQL migration tương ứng:
```sql
ALTER TABLE app.item ADD COLUMN category varchar(64);
ALTER TABLE app.item ADD COLUMN is_active boolean NOT NULL DEFAULT true;

CREATE TYPE app.barcode_type AS ENUM ('EAN13','EAN8','CODE128','CODE39','QR','DATAMATRIX');
ALTER TABLE app.item_barcode
  ADD COLUMN source varchar(16) NOT NULL DEFAULT 'internal';
-- Convert varchar → enum (2 step để an toàn data hiện có):
ALTER TABLE app.item_barcode
  ALTER COLUMN barcode_type TYPE app.barcode_type
  USING (CASE UPPER(barcode_type)
    WHEN 'CODE128' THEN 'CODE128'::app.barcode_type
    WHEN 'EAN13'   THEN 'EAN13'::app.barcode_type
    ELSE 'CODE128'::app.barcode_type
  END);

ALTER TABLE app.item_supplier
  ADD COLUMN moq numeric(18,4) NOT NULL DEFAULT 1,
  ADD COLUMN pack_size numeric(18,4) NOT NULL DEFAULT 1;
```

### 2.3 Bảng mới `import_batch`
File: `packages/db/src/schema/import.ts` (tạo mới, export từ `_schema.ts` index)

```ts
import { sql } from "drizzle-orm";
import {
  index, integer, pgEnum, text, timestamp, uuid, varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema.js";
import { userAccount } from "./auth.js";

export const importKindEnum = pgEnum("import_kind", ["item", "bom"]);
export const importStatusEnum = pgEnum("import_status", [
  "queued", "parsing", "preview_ready", "committing", "done", "failed",
]);

export const importBatch = appSchema.table("import_batch", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: importKindEnum("kind").notNull(),
  fileHash: varchar("file_hash", { length: 64 }).notNull(),   // SHA-256 hex
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  status: importStatusEnum("status").notNull().default("queued"),
  duplicateMode: varchar("duplicate_mode", { length: 16 }).notNull().default("skip"),
  // values: "skip" | "upsert" | "error"
  totalRows: integer("total_rows"),
  validRows: integer("valid_rows"),
  errorRows: integer("error_rows"),
  successRows: integer("success_rows"),  // số thực ghi DB
  previewJson: text("preview_json"),     // top 20 rows để render preview, jsonb
  errorFileUrl: text("error_file_url"),  // R2 link file lỗi
  errorMessage: text("error_message"),   // tóm tắt lỗi fatal
  createdBy: uuid("created_by").references(() => userAccount.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull().default(sql`now()`),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  hashIdx: index("import_batch_hash_idx").on(t.fileHash, t.kind),
  statusIdx: index("import_batch_status_idx").on(t.status),
  createdByIdx: index("import_batch_created_by_idx").on(t.createdBy),
}));

export type ImportBatch = typeof importBatch.$inferSelect;
```

### 2.4 Indexes mới + extensions

```sql
-- Extensions (cần Song Châu OK hoặc chạy 1 lần admin)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Trgm search cho SKU (brainstorm §6)
CREATE INDEX item_sku_trgm_idx ON app.item USING GIN (sku gin_trgm_ops);

-- Trgm + unaccent cho name (search "thep" ra "thép")
CREATE INDEX item_name_unaccent_trgm_idx
  ON app.item USING GIN (unaccent(name) gin_trgm_ops);

-- Trgm cho category
CREATE INDEX item_category_trgm_idx
  ON app.item USING GIN (category gin_trgm_ops)
  WHERE category IS NOT NULL;

-- Partial unique: chỉ 1 barcode primary per item
CREATE UNIQUE INDEX item_barcode_primary_per_item_uk
  ON app.item_barcode (item_id)
  WHERE is_primary = true;

-- Composite filter phổ biến
CREATE INDEX item_active_type_idx
  ON app.item (is_active, item_type)
  WHERE is_active = true;
```

### 2.5 Cập nhật `_schema.ts` index
Thêm export `import_batch`, `barcodeTypeEnum`, `importKindEnum`, `importStatusEnum`.

---

## 3. API Endpoints (full spec)

Convention chung:
- Base: `/api/v1/*` (prefix versioned)
- Auth: `Authorization: Bearer <JWT>` (từ Tuần 1 auth module)
- Error format: `{ error: { code: string, message: string, fields?: Record<string, string> } }`
- Success: `{ data: T, meta?: { page, pageSize, total } }`
- Role: `admin`, `planner` (default require), `warehouse` (read-only list)

### 3.1 Items

#### `GET /api/v1/items`
- **Role:** admin/planner/warehouse
- **Query:** `q?: string` (normalize unaccent), `type?: ItemType[]`, `uom?: Uom[]`, `status?: ItemStatus[]`, `isActive?: boolean` (default true), `page?: number=1`, `pageSize?: number=20 (max 100)`, `sort?: "sku"|"-sku"|"name"|"-name"|"updatedAt"`
- **Response 200:**
```json
{
  "data": [{
    "id": "uuid", "sku": "RM-0001", "name": "Thép tấm S45C 10mm",
    "itemType": "RAW", "uom": "KG", "category": "Thép tấm",
    "status": "ACTIVE", "isActive": true,
    "primaryBarcode": "8934567890123",
    "supplierCount": 2, "updatedAt": "2026-04-14T..."
  }],
  "meta": { "page": 1, "pageSize": 20, "total": 3124 }
}
```
- **Error:** `400 INVALID_QUERY`, `401 UNAUTHORIZED`

#### `GET /api/v1/items/:id`
- **Response:** full item + barcodes[] + suppliers[] (join trong 1 query với `relations`)

#### `GET /api/v1/items/check-sku?sku=xxx`
- **Role:** admin/planner
- **Response:** `{ data: { exists: boolean } }`
- Debounced realtime check từ form create.

#### `POST /api/v1/items`
- **Role:** admin/planner
- **Body:** (zod schema §5.3)
```json
{
  "sku": "RM-0001", "name": "Thép tấm",
  "itemType": "RAW", "uom": "KG",
  "category": "Thép tấm", "description": "",
  "minStockQty": "0", "reorderQty": "0", "leadTimeDays": 0,
  "isLotTracked": false, "isSerialTracked": false
}
```
- **Response 201:** `{ data: Item }`
- **Error:** `409 SKU_DUPLICATE`, `422 VALIDATION_ERROR`

#### `PATCH /api/v1/items/:id`
- **Body:** partial Item (không cho đổi `sku` V1 — bảo vệ ref integrity tới bom_line/po_line khi có).
- **Response 200:** `{ data: Item }`

#### `DELETE /api/v1/items/:id` (soft delete)
- **Action:** set `is_active=false` + audit log. Không xoá row.
- **Response 200:** `{ data: { id, isActive: false } }`

#### `POST /api/v1/items/:id/restore`
- **Action:** set `is_active=true`.

Curl example:
```bash
curl -X POST https://iot.example.vn/api/v1/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sku":"RM-0099","name":"Thép thử","itemType":"RAW","uom":"KG"}'
```

### 3.2 Barcodes

#### `GET /api/v1/items/:itemId/barcodes`
- **Response:** `{ data: ItemBarcode[] }` sort `is_primary DESC, created_at ASC`.

#### `POST /api/v1/items/:itemId/barcodes`
- **Body:** `{ barcode: string, barcodeType: BarcodeType, source: "vendor"|"internal", isPrimary?: boolean }`
- **Validation:** barcode unique toàn hệ (409 nếu dup); nếu `isPrimary=true` thì set các barcode khác cùng item về false trong transaction.
- **Response 201.**

#### `PATCH /api/v1/items/:itemId/barcodes/:id`
- **Body:** `{ barcodeType?, source?, isPrimary? }`. KHÔNG cho đổi `barcode` value (tạo mới nếu cần đổi).

#### `DELETE /api/v1/items/:itemId/barcodes/:id`
- **Response 200.** Reject nếu là barcode cuối cùng + item đang ACTIVE? → V1 cho phép xoá hết, document hint UI.

#### `POST /api/v1/items/:itemId/barcodes/:id/set-primary`
- Shortcut: set row này `is_primary=true`, các row khác cùng item=false, trong 1 transaction.

### 3.3 Suppliers

#### `GET /api/v1/suppliers`
- **Query:** `q?`, `isActive?`, `page?`, `pageSize?`
- **Response:** `{ data: Supplier[], meta }`

#### `POST /api/v1/suppliers`
- **Body:** `{ code, name, contactName?, phone?, email?, address?, taxCode? }`
- **Error:** 409 `SUPPLIER_CODE_DUPLICATE`

#### `PATCH /api/v1/suppliers/:id`
- **Body:** partial.

#### `DELETE /api/v1/suppliers/:id` (soft)
- Set `is_active=false`.

### 3.4 Item-Suppliers

#### `GET /api/v1/items/:itemId/suppliers`
- **Response:** `{ data: (ItemSupplier & { supplier: Supplier })[] }` sort `isPreferred DESC, created_at ASC`.

#### `POST /api/v1/items/:itemId/suppliers`
- **Body:** `{ supplierId, supplierSku?, priceRef?, currency?, leadTimeDays, moq, packSize, isPreferred }`
- **Uniqueness:** (itemId, supplierId) → 409 nếu dup.
- **Nếu `isPreferred=true`:** set các item_supplier khác cùng itemId về false (transaction).

#### `PATCH /api/v1/items/:itemId/suppliers/:id`

#### `DELETE /api/v1/items/:itemId/suppliers/:id`

#### `POST /api/v1/items/:itemId/suppliers/:id/set-preferred`

### 3.5 Import

#### `POST /api/v1/imports/items/check`
- **Body:** `{ fileHash: string, fileName: string, fileSizeBytes: number }`
- **Response:**
  - 200 `{ data: { existing: null } }` → OK, tiếp tục upload.
  - 200 `{ data: { existing: { batchId, status, createdAt, successRows, errorRows } } }` → client hiện confirm dialog.
- Lookup: `importBatch WHERE fileHash=? AND kind='item' AND createdAt > now() - interval '1 hour' AND status IN ('done','preview_ready')`.

#### `POST /api/v1/imports/items` (multipart)
- **Role:** admin/planner
- **Body:** multipart: `file` (xlsx ≤ 20MB, MIME whitelist) + form fields `{ fileHash, duplicateMode: "skip"|"upsert"|"error" }`.
- **Action:**
  1. Verify hash: compute server-side, so sánh client `fileHash` → mismatch 400.
  2. Upload file stream tới R2 key `imports/items/{batchId}/original.xlsx`.
  3. Insert `import_batch` row status=queued.
  4. Enqueue BullMQ job `item-import-preview` với `jobId=batchId` (idempotency).
- **Response 202:** `{ data: { batchId: "uuid", status: "queued" } }`

#### `GET /api/v1/imports/items/:batchId/status`
- **Response:**
```json
{
  "data": {
    "batchId": "uuid", "status": "committing",
    "totalRows": 3000, "validRows": 2995, "errorRows": 5,
    "successRows": 1500, "progressPct": 50,
    "preview": [ {row...}, ... 20 ],
    "errorFileUrl": null
  }
}
```
- Client dùng TanStack Query `refetchInterval: 2000` khi `status ∈ {queued, parsing, committing}`.

#### `POST /api/v1/imports/items/:batchId/commit`
- **Role:** admin/planner (phải là người tạo batch hoặc admin).
- **Precondition:** `status=preview_ready`.
- **Action:** Enqueue `item-import-commit` Flow (parent + N children chunks 500 rows).
- **Response 202:** `{ data: { status: "committing" } }`

#### `GET /api/v1/imports/items/:batchId/errors.xlsx`
- **Response:** stream file từ R2 (hoặc redirect signed URL).
- **Error:** 404 nếu `errorFileUrl IS NULL`.

#### `GET /api/v1/imports/items/template.xlsx`
- Tải file template chuẩn (phase 0 BA prepare, lưu R2 hoặc embed static).

---

## 4. BullMQ Jobs

Queue name: `import`. Redis DB=2 (tuân thủ master plan §9.4).

### 4.1 Job `item-import-preview`
**Input:** `{ batchId: string }`
**Idempotency key:** `batchId` (BullMQ `jobId`).
**Timeout:** 120s (10k rows parse ~30-60s).
**Retry:** `attempts: 2`, `backoff: { type: "exponential", delay: 5000 }`.

**Logic:**
1. `UPDATE import_batch SET status='parsing', started_at=now() WHERE id=$batchId`.
2. Stream R2 object → `exceljs` `WorkbookReader` (`.xlsx`, streaming mode, `workbook.xlsx.createInputStream()`).
3. Validate header row (fail fast nếu sai template).
4. Loop `worksheet.eachRow({ includeEmpty: false }, async (row, idx) => {...})`:
   - Parse → `ItemImportRow` zod schema (§5.3).
   - Collect `{ validRows[], errorRows[{ rowNumber, errors: [...] }] }`.
   - Check duplicate SKU trong batch (in-memory `Set`) → error "Duplicate SKU trong file".
   - Nếu `duplicateMode='error'` → check DB `item.sku` → error nếu exists.
5. Write 20 valid rows đầu vào `preview_json`.
6. Nếu có error → stream ghi file `errors.xlsx` (exceljs write) lên R2 `imports/items/{batchId}/errors.xlsx`, update `errorFileUrl`.
7. `UPDATE status='preview_ready', total_rows, valid_rows, error_rows`.

**Output:** Không return (state qua DB). Worker emit event `progress` mỗi 500 rows parse cho optional BullMQ listener.

### 4.2 Job `item-import-commit` (BullMQ Flow parent)
**Input:** `{ batchId: string }`
**Idempotency key:** `commit-{batchId}`.

**Logic:**
1. Parent job:
   - `UPDATE status='committing'`.
   - Read preview JSON + error rows từ DB (để biết validRows còn lại).
   - Re-stream file R2 → chia validRows thành chunks 500 → tạo N children job `item-import-commit-chunk` qua `FlowProducer`.
   - Wait children.
2. Child job `item-import-commit-chunk`:
   - **Input:** `{ batchId, chunkIndex, rows: ItemImportRow[], duplicateMode }`
   - **Transaction:**
     ```ts
     await db.transaction(async (tx) => {
       for (const row of rows) {
         // upsert logic theo duplicateMode
         const existing = await tx.select().from(item).where(eq(item.sku, row.sku));
         if (existing.length) {
           if (duplicateMode === 'skip') continue;
           if (duplicateMode === 'upsert') {
             await tx.update(item).set({...}).where(eq(item.id, existing[0].id));
           }
           if (duplicateMode === 'error') throw new Error('Duplicate...');
         } else {
           const [created] = await tx.insert(item).values({...}).returning();
           if (row.barcode) {
             await tx.insert(itemBarcode).values({
               itemId: created.id, barcode: row.barcode,
               barcodeType: 'CODE128', source: 'vendor', isPrimary: true,
             });
           }
           if (row.supplierCode) { /* lookup + insert item_supplier */ }
         }
         await writeAudit(tx, { actor, action: 'import', ... });
       }
     });
     ```
   - On error: log chunk fail, không fail toàn batch (chỉ những row trong chunk).
   - Update `import_batch.success_rows += chunk.successCount` (atomic UPDATE với `+=`).
3. Parent `onChildrenCompleted`:
   - `UPDATE status='done', completed_at=now()`.
   - Nếu có chunk fail → status='done' với `error_rows` tăng; nếu >50% fail → status='failed'.

**Retry policy:** child `attempts: 3`, parent `attempts: 1` (không retry parent; chỉ retry từng chunk).

**Chunk size:** 500 rows. 10k rows → 20 chunks → 20 × 5% progress tick → UI mượt.

**Removal:** `removeOnComplete: { age: 3600*24, count: 100 }`, `removeOnFail: { age: 3600*24*7 }`.

### 4.3 Progress calculation
`progressPct = floor((successRows + errorRows) / totalRows * 100)` — query đơn giản trong `/status` endpoint.

---

## 5. UI Screens

### 5.1 Màn 1: `/items` (List)
Wireframe §3 đã chốt.

**Components shadcn:**
- `DataTable` (wrapper custom trên `@tanstack/react-table` v8 + `@tanstack/react-virtual`).
- `Input` (search), `Select` (filter Loại/UoM/Status), `Checkbox`, `Badge`, `Button`, `Sheet` (edit drawer), `Dialog` (confirm delete), `Sonner` (toast).

**State:**
- TanStack Query key: `['items', { q, type, uom, status, page, pageSize, sort }]`, `staleTime: 60_000`.
- Zustand global `itemListFilterStore` lưu filter state persist sessionStorage (tránh mất khi navigate).
- Debounced search: `useDebouncedValue(q, 250)`.

**Interaction:**
- Row click → open `Sheet` phải (480px) fetch `GET /items/:id`.
- Button `[+ Thêm]` → open `Sheet` empty form.
- Button `[⤓ Import Excel]` → open `Sheet` wizard (§5.3).
- Bulk select: 3+ rows → sticky bottom action bar với `[Đổi trạng thái]`, `[Xuất Excel]`, `[Xoá]`.
- Pagination: `<<` `<` `Trang 1 / 157` `>` `>>` + jump input `(___)`.

**States:**
- Loading: `Skeleton` 20 rows.
- Empty initial: illustration + CTA `[Import từ Excel]` + link download template.
- Empty filter: "Không tìm thấy SKU nào khớp. [Xoá bộ lọc]".
- Error: banner `danger` + retry.

**Perf budget:** P95 < 200ms server, client virtualize overscan 5.

### 5.2 Màn 2: Item Edit Form (Sheet 480px, desktop)
3 tab trong sheet: `[Thông tin]`, `[Barcodes (N)]`, `[Suppliers (N)]`.

**Tab Thông tin:**
- Form fields (react-hook-form + zodResolver):
  - `sku` (required, regex validation, realtime check-unique debounce 300ms — show 🟢 "Mã khả dụng" hoặc 🔴 "Đã tồn tại").
  - `name` (required, max 255).
  - `itemType` (Select, 8 values).
  - `uom` (Select).
  - `category` (Input freetext).
  - `description` (Textarea).
  - `minStockQty`, `reorderQty`, `leadTimeDays` (Input number).
  - `isLotTracked`, `isSerialTracked` (Switch).
- Button `[Huỷ]` `[Lưu]` (sticky bottom).

**Tab Barcodes:**
- List: table 3 cột `Barcode | Type | Source | Primary`, icon `⭐` set primary, icon `✕` remove.
- Button `[+ Thêm barcode]` → inline row form (barcode input + type select + source radio + primary checkbox).

**Tab Suppliers:**
- List: `NCC | Vendor SKU | Giá | LT | MOQ | Pack | Preferred`.
- Button `[+ Thêm NCC]` → dialog chọn supplier (Combobox search) + các field.

**Validation realtime:** Zod schema shared client-server.

### 5.3 Màn 3: Import Wizard (Sheet right, 640px, 3-step stepper)

**Step 1 — Upload:**
- `Dropzone` (react-dropzone) accept `.xlsx` only.
- Client-side SHA-256 (Web Crypto `crypto.subtle.digest`).
- Call `POST /imports/items/check` → nếu existing, `Dialog` "Bạn đã import file này lúc 14:22 — thành công 3.000 dòng. Import lại? [Có] [Không]".
- Radio `duplicateMode`: `● Bỏ qua dòng trùng SKU` / `○ Ghi đè (upsert)` / `○ Dừng nếu có trùng`.
- Button `[Tải lên & Preview]` → `POST /imports/items` multipart.

**Step 2 — Preview (polling 2s):**
- Loading state: spinner + "Đang phân tích file..." + count động `1.234 / 3.000 dòng`.
- Khi `status=preview_ready`:
  - KPI row: `Tổng: 3000` `Hợp lệ: 2995 ✓` `Lỗi: 5 ⚠`.
  - `[Tải file lỗi]` button nếu `errorRows > 0` → download `errors.xlsx` từ R2.
  - Table 20 rows đầu: `SKU | Name | Type | UoM | Barcode | Supplier | Action (sẽ làm gì: Tạo mới / Cập nhật / Bỏ qua)`.
  - Button `[Huỷ]` `[Xác nhận import 2995 dòng]`.

**Step 3 — Committing (polling 2s):**
- Progress bar `progressPct`.
- Text: `Đang import 1.500 / 2.995 dòng...`.
- Khi `status=done`: checkmark lớn xanh + "Hoàn tất! Đã tạo 2.950 SKU mới, cập nhật 45, lỗi 5." + `[Đóng]` + `[Tải báo cáo lỗi]`.
- Khi `status=failed`: `danger` banner + `errorMessage` + `[Đóng]`.

**Zod schema shared (`packages/shared/schemas/item.ts`):**

```ts
import { z } from "zod";

export const SKU_REGEX = /^[A-Z0-9][A-Z0-9_\-]{1,63}$/;

export const itemTypeSchema = z.enum([
  "RAW", "PURCHASED", "FABRICATED", "SUB_ASSEMBLY",
  "FG", "CONSUMABLE", "TOOL", "PACKAGING",
]);
export const uomSchema = z.enum([
  "PCS","SET","KG","G","M","MM","CM","L","ML","HOUR","PAIR","BOX","ROLL","SHEET",
]);
export const itemStatusSchema = z.enum(["ACTIVE","OBSOLETE","DRAFT"]);

export const itemCreateSchema = z.object({
  sku: z.string().regex(SKU_REGEX, "Mã không hợp lệ (A-Z, 0-9, _ - ; 2-64 ký tự)")
    .transform((v) => v.toUpperCase()),
  name: z.string().min(1).max(255),
  itemType: itemTypeSchema,
  uom: uomSchema,
  category: z.string().max(64).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  minStockQty: z.coerce.number().nonnegative().default(0),
  reorderQty: z.coerce.number().nonnegative().default(0),
  leadTimeDays: z.coerce.number().int().nonnegative().default(0),
  isLotTracked: z.boolean().default(false),
  isSerialTracked: z.boolean().default(false),
});

export const itemImportRowSchema = itemCreateSchema.extend({
  barcode: z.string().max(128).optional().nullable(),
  barcodeType: z.enum(["EAN13","EAN8","CODE128","CODE39","QR","DATAMATRIX"]).default("CODE128"),
  supplierCode: z.string().max(64).optional().nullable(),
  supplierSku: z.string().max(128).optional().nullable(),
  priceRef: z.coerce.number().nonnegative().optional().nullable(),
  moq: z.coerce.number().positive().default(1),
  packSize: z.coerce.number().positive().default(1),
  leadTimeDaysSupplier: z.coerce.number().int().nonnegative().optional(),
});

export type ItemCreate = z.infer<typeof itemCreateSchema>;
export type ItemImportRow = z.infer<typeof itemImportRowSchema>;
```

---

## 6. File Structure

### 6.1 Tạo mới

```
packages/db/src/schema/
  import.ts                            # importBatch + enums

packages/db/migrations/
  0002_week2_item_master.sql           # enum add + columns + indexes
  0003_week2_import_batch.sql          # table import_batch + enums

packages/shared/src/schemas/
  item.ts                              # zod schemas shared
  barcode.ts
  supplier.ts
  import.ts

apps/web/src/app/(app)/items/
  page.tsx                             # List
  _components/
    item-list-table.tsx
    item-filter-bar.tsx
    item-edit-sheet.tsx
    item-create-form.tsx
    barcode-tab.tsx
    supplier-tab.tsx
    import-wizard-sheet.tsx
    import-step-upload.tsx
    import-step-preview.tsx
    import-step-committing.tsx

apps/web/src/lib/
  queries/
    items.ts                           # TanStack Query hooks
    barcodes.ts
    suppliers.ts
    imports.ts
  stores/
    item-list-filter-store.ts          # Zustand
    import-wizard-store.ts
  utils/
    sha256.ts                          # Web Crypto hash
    excel-template.ts

apps/api/src/modules/items/
  items.routes.ts                      # Fastify plugin
  items.service.ts
  items.repo.ts
  items.audit.ts

apps/api/src/modules/barcodes/
  barcodes.routes.ts
  barcodes.service.ts

apps/api/src/modules/suppliers/
  suppliers.routes.ts
  suppliers.service.ts
  item-suppliers.routes.ts

apps/api/src/modules/imports/
  imports.routes.ts
  imports.service.ts
  imports.r2.ts                        # R2 upload/stream
  imports.hash.ts                      # server-side verify hash

apps/worker/src/jobs/
  item-import-preview.ts
  item-import-commit.ts
  item-import-commit-chunk.ts
  flow-producer.ts                     # BullMQ FlowProducer config
  queue.ts                             # queue instances

apps/api/src/lib/
  audit.ts                             # writeAudit helper

apps/api/tests/
  items.test.ts
  imports.test.ts
  barcode-primary.test.ts

apps/worker/tests/
  item-import-preview.test.ts
  item-import-commit.test.ts
```

### 6.2 Sửa

```
packages/db/src/schema/
  _schema.ts                           # export thêm
  master.ts                            # thêm category, isActive, source, moq, packSize, barcodeTypeEnum

apps/web/src/app/(app)/
  layout.tsx                           # thêm nav "Items"

apps/web/tailwind.config.ts            # (đã có từ tuần 1)

PROGRESS.md                            # check tuần 2 items
```

---

## 7. Daily Breakdown (5 ngày, 2 dev)

### Day 1 (Thứ 2) — Schema + Zod + Item CRUD API
**Dev A (backend-heavy):**
- [ ] Viết migration `0002` + `0003`, test `drizzle-kit push` local, verify indexes bằng `\di app.*`.
- [ ] Enable extension `pg_trgm` + `unaccent` (document cần Song Châu OK).
- [ ] Sửa `master.ts` schema (thêm field) + `import.ts` mới.
- [ ] Viết `packages/shared/src/schemas/item.ts` (zod schemas).
- [ ] Implement `items.routes.ts` + `items.service.ts`:
  - `GET /items` (filter + pagination + search với `unaccent(name) % $q OR sku ILIKE $q`).
  - `GET /items/:id` + `GET /items/check-sku`.
  - `POST /items` + `PATCH /items/:id` + `DELETE /items/:id` + restore.
- [ ] Audit middleware hook (write `audit_event` với `before/after` jsonb).

**Dev B (backend + worker setup):**
- [ ] Setup BullMQ connection (`apps/worker/src/lib/queue.ts`, Redis DB=2).
- [ ] FlowProducer init (`flow-producer.ts`).
- [ ] Setup R2 SDK client (`imports.r2.ts`) — `@aws-sdk/client-s3` với R2 endpoint.
- [ ] Implement `imports.routes.ts`:
  - `POST /imports/items/check` (lookup by fileHash).
  - `POST /imports/items` (multipart, `@fastify/multipart`, stream to R2, insert import_batch, enqueue preview job).
  - `GET /imports/items/:batchId/status`.
  - `GET /imports/items/:batchId/errors.xlsx` (redirect signed URL hoặc stream).

**Acceptance D1:**
- [ ] Migration chạy clean trên DB staging.
- [ ] `curl POST /items` tạo 1 item OK; `curl GET /items?q=thep` trả về đúng.
- [ ] Swagger/OpenAPI spec generate được cho items module.
- [ ] `curl POST /imports/items` upload file test 100 rows → record import_batch row.

### Day 2 (Thứ 3) — Barcode + Supplier + item_supplier API
**Dev A:**
- [ ] `barcodes.routes.ts`: CRUD + set-primary (transaction logic, partial unique test).
- [ ] `suppliers.routes.ts`: CRUD supplier.
- [ ] `item-suppliers.routes.ts`: CRUD item_supplier + set-preferred.
- [ ] Unit test: test partial unique primary barcode (2 primary cùng item → 2nd must fail).
- [ ] Unit test: test item_supplier unique (itemId, supplierId).

**Dev B:**
- [ ] Worker `item-import-preview.ts`:
  - Stream R2 → exceljs `WorkbookReader`.
  - Header validation.
  - Row-by-row validate với `itemImportRowSchema.safeParse`.
  - Aggregate preview 20 rows + errorRows.
  - Write errors.xlsx lên R2.
  - Update import_batch status.
- [ ] Test local với sample file 500 rows (10 có lỗi cố ý).

**Acceptance D2:**
- [ ] API barcode/supplier đầy đủ, Postman collection chạy pass.
- [ ] Upload file 500 rows test → preview_ready trong < 5s, 10 rows lỗi đúng.
- [ ] File errors.xlsx tải về đúng format (cột "Row", "Field", "Reason").

### Day 3 (Thứ 4) — Item List UI + Item Edit Form
**Dev A (frontend-heavy):**
- [ ] Setup shadcn `DataTable` wrapper + `@tanstack/react-virtual`.
- [ ] `/items/page.tsx`: list + filter bar + pagination.
- [ ] `item-list-table.tsx`: virtualized, sticky columns, zebra, row click.
- [ ] `item-filter-bar.tsx`: search debounce 250ms, multi-select filters, Zustand persist.
- [ ] `item-edit-sheet.tsx` + tabs (Thông tin / Barcodes / Suppliers).
- [ ] `item-create-form.tsx`: react-hook-form + zodResolver + realtime check-sku.
- [ ] TanStack Query hooks `queries/items.ts`.

**Dev B:**
- [ ] Worker `item-import-commit.ts` parent + child chunk logic.
- [ ] FlowProducer dispatch N chunks.
- [ ] Chunk transaction upsert logic (3 modes).
- [ ] Atomic update `success_rows += ?` bằng raw SQL trong chunk complete.
- [ ] Test end-to-end local: upload 500 rows → preview → commit → DB có 500 rows.

**Acceptance D3:**
- [ ] `/items` list 10k mock rows load < 200ms (test với k6).
- [ ] Create form validate realtime, duplicate SKU block submit.
- [ ] Edit sheet 3 tab navigate mượt.
- [ ] E2E test: upload → preview → commit 500 rows qua API + worker chạy được.

### Day 4 (Thứ 5) — Import Wizard UI (Upload + Preview)
**Dev A:**
- [ ] `barcode-tab.tsx` + `supplier-tab.tsx` (CRUD inline trong sheet).
- [ ] Keyboard nav cơ bản: j/k next/prev row, Enter mở edit.
- [ ] Copy-to-clipboard button cho SKU và barcode (icon 📋).

**Dev B:**
- [ ] `import-wizard-sheet.tsx` + 3 step components.
- [ ] `sha256.ts` client Web Crypto hash.
- [ ] `import-step-upload.tsx`: dropzone + hash + check endpoint + confirm dialog + duplicateMode radio.
- [ ] `import-step-preview.tsx`: polling 2s + KPI cards + preview table + download errors button.
- [ ] `queries/imports.ts` TanStack hooks.
- [ ] `import-wizard-store.ts` Zustand (currentStep, batchId, duplicateMode).

**Acceptance D4:**
- [ ] Upload 3.000 rows .xlsx thật → preview hiển thị trong < 10s.
- [ ] Duplicate file detection: upload lần 2 trong 1h → confirm dialog hiện.
- [ ] Download errors.xlsx mở được trong Excel, cột rõ ràng.

### Day 5 (Thứ 6) — Commit UI + Audit + Polish + QA
**Dev A:**
- [ ] Audit event viewer basic (`/audit?objectType=item&objectId=xxx` list trong edit sheet).
- [ ] Empty states + error states polish (illustration slate-300 simple).
- [ ] `prefers-reduced-motion` respect.
- [ ] Accessibility sweep: aria-label icon buttons, focus ring, keyboard trap check.

**Dev B:**
- [ ] `import-step-committing.tsx`: progress bar + animated count.
- [ ] Integration test: 3000 rows import full pipeline.
- [ ] Benchmark: commit 3k rows — đo thời gian, tối ưu nếu > 90s (batch insert SQL thay vì row-by-row nếu cần).
- [ ] Remove jobs config (removeOnComplete, removeOnFail).

**Cả team (chiều):**
- [ ] QA chéo: Dev A test import, Dev B test CRUD.
- [ ] Unit test coverage check ≥ 55%.
- [ ] Manual smoke với `items_cleaned.xlsx` thật Phase 0 (3k rows).
- [ ] Document `README.md` module (setup local, run migration, seed).
- [ ] Update `PROGRESS.md` tick tuần 2 items.
- [ ] Tag release `v0.2.0-week2`.

**Acceptance D5:**
- [ ] Import 3.000 rows thật < 90s, P95 list < 200ms, tất cả checkbox §1.2 pass.
- [ ] PR merge vào `main` với approval code-reviewer agent.

---

## 8. Testing Plan

### 8.1 Unit (Vitest)
- `itemImportRowSchema` parse hợp lệ + 20 edge cases (empty, special chars, max length, regex sku).
- `checkSkuAvailable(sku)` — mock DB, test hit/miss.
- `setPrimaryBarcode(itemId, barcodeId)` — mock tx, đảm bảo 1 primary.
- `computeProgressPct(batch)` — edge: totalRows=0 → 0%.
- Audit diff generator — `{ before, after }` chỉ chứa field đã thay đổi.

### 8.2 Integration API (Supertest + test DB)
- `POST /items` + duplicate → 409.
- `POST /items` invalid sku → 422 với field map.
- `GET /items?q=thép` matches both accent/non-accent.
- `POST /items/:id/barcodes` với isPrimary=true → row cũ chuyển false.
- `POST /imports/items/check` cùng hash < 1h → return existing.
- `POST /imports/items` file > 20MB → 413.
- `POST /imports/items` file non-xlsx → 415.

### 8.3 Worker tests
- Parse file 100 rows với 10 rows lỗi cố ý → errorRows=10, validRows=90.
- Commit chunk: tx rollback khi 1 row lỗi SQL-level → chỉ chunk đó fail, chunk khác pass.
- Idempotency: enqueue preview 2 lần cùng batchId → job 2 skip.

### 8.4 E2E (Playwright, 1 test chính)
- Login → /items → Import wizard → Upload 100 rows sample → Preview → Commit → verify list count tăng 100.

### 8.5 Load test (k6, Day 5)
- 20 concurrent GET /items?q=thep → P95 < 200ms.
- 1 user upload 3k rows song song 5 user CRUD → không deadlock.

---

## 9. Risks & Mitigations (top 5 Tuần 2)

| # | Risk | Prob | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **pg_trgm + unaccent chưa enable trên Postgres share Song Châu** | Thấp-Trung | Cao (search fail) | Check extension Day 1 sáng; nếu chưa có → request Song Châu admin (2 extension stock, risk=0). Fallback: `ILIKE '%...%'` không trgm (chậm nhưng chạy). |
| 2 | **Import 3k rows > 90s** | Trung | Trung | Benchmark Day 3 với 500 rows → extrapolate. Nếu chậm: chuyển row-by-row `INSERT` sang `INSERT ... SELECT FROM UNNEST($1::item[])` batch 500/query (5-10x nhanh hơn). |
| 3 | **Excel file user có merged cells / header loạn** | Cao | Trung | Template `.xlsx` chuẩn BA chuẩn bị Phase 0; UI có nút `[Tải template]` prominent trên Upload step; header validation fail fast + error rõ "Hàng 1 phải là: sku, name, ...". |
| 4 | **Duplicate barcode giữa items khi import** | Trung | Cao (scan ambiguous) | Unique constraint DB sẵn. Import preview check duplicate trong file (`Set<barcode>`); commit tx fail chỉ row đó; error report có cột "Lý do: Barcode đã tồn tại trên SKU khác". |
| 5 | **R2 upload fail giữa chừng (mạng xưởng lỏng)** | Trung | Trung | Client hash trước upload; backend verify lại; nếu R2 upload timeout → rollback insert import_batch, client có thể retry. `@aws-sdk/client-s3` multipart upload với `partSize: 5MB`, retry mặc định. |

---

## 10. Definition of Done (checklist merge PR)

### 10.1 Code quality
- [ ] Lint pass (ESLint + Prettier, 0 warning).
- [ ] TypeScript strict mode, 0 `any` trong business code.
- [ ] All new API endpoints có OpenAPI spec (auto via Fastify swagger).
- [ ] Migration reversible (có `down.sql` hoặc document rollback).
- [ ] Không hardcode secret, URL, magic number.

### 10.2 Test
- [ ] Unit test coverage ≥ 55% (vitest --coverage).
- [ ] Integration API test pass 100%.
- [ ] 1 E2E Playwright test pass (import 100 rows flow).
- [ ] Load test k6 P95 < 200ms confirmed.

### 10.3 Functional
- [ ] Import `items_cleaned.xlsx` thật (3k rows) thành công < 90s.
- [ ] CRUD item + barcode + supplier UI mượt, validate đúng.
- [ ] Duplicate upload detection hoạt động.
- [ ] Error file Excel download đúng format.

### 10.4 Audit & Security
- [ ] Mọi write API ghi `audit_event` với actor + before + after.
- [ ] Upload file whitelist MIME (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) + magic number check + size ≤ 20MB.
- [ ] File lưu R2 với key random UUID (không dùng tên file user).
- [ ] Rate limit import endpoint: 5 upload/giờ/user.
- [ ] Role check đầy đủ mọi endpoint (admin/planner).

### 10.5 UX (design guidelines)
- [ ] Tiếng Việt 100%, không "Invalid input" máy dịch.
- [ ] Contrast AA passed axe DevTools.
- [ ] Focus ring visible mọi interactive.
- [ ] Empty state có CTA, error state có retry.
- [ ] Keyboard nav: Tab/Shift+Tab/Esc/Enter hoạt động trong sheet + form.

### 10.6 DevOps
- [ ] Migration đã chạy trên staging DB.
- [ ] R2 bucket `hethong-iot-files/imports/items/` có CORS cho domain.
- [ ] BullMQ queue health check endpoint thêm vào `/api/ready`.
- [ ] `mem_limit` worker test OK với import 3k rows (không OOM).

### 10.7 Documentation
- [ ] `README.md` module items + imports cập nhật.
- [ ] `PROGRESS.md` tick checkbox tuần 2.
- [ ] CHANGELOG.md entry `v0.2.0`.
- [ ] Template `item_import_template.xlsx` upload R2 + link trong UI.

---

## 11. Notes cho dev cook

1. **Thứ tự code**: schema → zod shared → repo → service → routes → worker → UI queries → UI components. Không đảo để tránh re-type interface.
2. **Dùng lại Drizzle `pgTable.$inferSelect`/`$inferInsert`** cho type, không tự define interface duplicate (DRY).
3. **Audit helper `writeAudit(tx, {...})`** gọi trong service layer (không middleware auto — cần before/after chính xác từ logic business).
4. **FlowProducer** nhớ dùng cùng Redis connection với Queue (share prefix để parent-child nhận diện nhau).
5. **ExcelJS streaming** bắt buộc dùng `WorkbookReader`, không `Workbook.xlsx.readFile()` (load full vào RAM → OOM worker 256MB khi file 5MB+).
6. **SQL batch insert** khi commit: nếu Day 3 benchmark 500 rows/chunk quá chậm, chuyển sang `db.execute(sql\`INSERT INTO item (sku,name,...) SELECT * FROM UNNEST(${sql.array(rows, 'item_row_type')})\`)` — tăng tốc 5-10x.
7. **Test DB**: dùng `pg-mem` hoặc testcontainers. Nếu pg-mem thiếu pg_trgm → fallback testcontainers docker Postgres thật.
8. **R2 SDK**: `@aws-sdk/client-s3` với config `{ endpoint: process.env.R2_ENDPOINT, region: 'auto', forcePathStyle: true }`.

---

*End of plan. Owner dev cook: follow daily breakdown, block merge nếu DoD §10 chưa pass. Escalate risk §9 tới tech-lead ngay Day 1 sáng.*
