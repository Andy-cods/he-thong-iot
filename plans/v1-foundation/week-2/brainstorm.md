# Brainstorm — Tuần 2: Item Master + Excel Import + Barcode

*Phiên bản:* 1.0 · *Ngày:* 2026-04-16 · *Persona:* Solution Brainstormer (YAGNI/KISS/DRY + brutal honesty)
*Cross-link:* `plans/v1-foundation/260416-v1-implementation-plan.md` §7 M2, §8 Tuần 2, §6 Master data · `packages/db/src/schema/master.ts` · `plans/design/260416-v1-wireframes.md` §3

---

## 0. TL;DR (đọc 30 giây)

Schema hiện tại **đủ 85%** cho V1 — thiếu 3 field nhỏ: `item_barcode.source` (vendor/internal), `item_supplier.moq` (MOQ), `item.category` (string free text, không enum). Ngoài ra, taxonomy 6 `item_type` hiện tại thiếu **TOOL** (dao/mũi khoan) và **PACKAGING** — khuyến nghị thêm. Import Excel chọn **2-pass server-side streaming với `exceljs`**, **chunk 500 dòng × N jobs BullMQ**, progress qua **polling 2s** (không SSE/WebSocket V1 — YAGNI). Khuyến nghị scope **Balanced 5 ngày**: drop supplier CRUD UI (để cuối tuần 2 nếu còn giờ), drop print-barcode generation (V1.1).

**3 quyết định user phải chốt:**
1. **Taxonomy thêm TOOL + PACKAGING?** (→ migration schema, ảnh hưởng data cleansing Phase 0)
2. **Item code tự sinh hay bắt buộc user nhập?** (→ quyết định UX form create + import rule)
3. **Hash file + batch_id để idempotent import hay skip?** (→ 0.5 ngày extra, nhưng đáng)

---

## 1. Item Taxonomy thực tế VN

### Phân tích brutal
Hiện tại 6 giá trị: `RAW / PURCHASED / FABRICATED / SUB_ASSEMBLY / FG / CONSUMABLE`.

Xưởng cơ khí VN thực tế (đã gặp ở Song Châu, Duy Khanh, VinaMitsui, v.v.) thường cần phân biệt **thêm 2 loại**:

| Loại | Ví dụ | Tần suất | Lý do cần tách |
|---|---|---|---|
| **TOOL** | Dao phay, mũi khoan, đá mài, insert CNC | Mỗi xưởng 200-500 SKU | Life-cycle ngắn (mòn → thay), không vào BOM thành phẩm nhưng cần tồn kho riêng, reorder theo usage chứ không theo đơn; báo cáo tiêu hao công cụ tách biệt |
| **PACKAGING** | Thùng carton, xốp, băng keo, pallet gỗ | 50-100 SKU | Tính vào giá bán nhưng không vào BOM kỹ thuật; shortage report tách riêng khỏi "thiếu vật tư sản xuất" |
| ~~DOCUMENT~~ | Bản vẽ, catalog | — | **Không cần** — đã có `R2 attachments` + `bom_revision.release_notes` là đủ; YAGNI |

`CONSUMABLE` trong schema hiện bị **mơ hồ** — user sẽ đổ TOOL và PACKAGING vào đây hết → báo cáo sai.

### Khuyến nghị
**Bổ sung 2 giá trị enum `TOOL` và `PACKAGING`** vào `itemTypeEnum`. Migration nhẹ (Postgres `ALTER TYPE ... ADD VALUE`). `CONSUMABLE` giữ lại cho vật tư tiêu hao chung (dầu, mỡ, keo, chất tẩy rửa).

**Risk nếu giữ nguyên 6 giá trị:** User tự workaround bằng cách thêm prefix vào `sku` ("TL-xxx", "PK-xxx") — phá chuẩn, query khó, taxonomy mất ý nghĩa. **Chi phí thêm 2 enum value < 30 phút dev, tránh pain 6 tháng sau.**

Thêm field `category: varchar(64) nullable` (free text, index trgm) để user phân nhóm **trong** `itemType` (ví dụ RAW → "Thép tấm", "Thép tròn", "Nhôm profile"). Không làm bảng `category` riêng — YAGNI. Khi nào cần drill-down theo category trong report (V1.5+) thì mới normalize.

---

## 2. Item Code Convention

### Phân tích brutal

Plan gốc nói "giữ mã chuẩn toàn công ty hiện có" → tức là **import-driven**. Nhưng form Create UI thì sao?

3 phương án:

| PA | Cách | Ưu | Nhược |
|---|---|---|---|
| A. User tự nhập bắt buộc | Field required, validate regex `^[A-Z0-9\-_]{3,32}$` | Giữ convention xưởng; khớp mã Excel cũ 100% | User lười → tạo "abc", "test", "1" → hỗn loạn |
| B. Auto-generate theo pattern | `{TYPE_PREFIX}-{CATEGORY}-{SEQ6}` ví dụ `RAW-STEEL-000123` | Không bao giờ trùng; tra cứu bằng mắt dễ | Không khớp Excel cũ; nhập thủ công khó đọc cho nhân viên già |
| C. Hybrid: nhập tay + preview auto nếu bỏ trống | Input có placeholder auto-generated; user Tab ra → apply auto; user gõ đè → dùng tay | Linh hoạt nhất | Phức tạp logic, test nhiều case |

### Khuyến nghị: **PA A (bắt buộc nhập tay) + validate nghiêm**

Lý do:
- Data nguồn là Excel 10k dòng → mã đã có sẵn, import là path chính (95% case). Form create chỉ cho case ngoại lệ (1 vài mã mới/tháng).
- Auto-generate làm mã không khớp với mã in trên tem NCC, trên bản vẽ, trên phiếu tay → **gây tranh cãi giữa kỹ thuật và kho**.
- Validate regex chặn "test", "abc": phải có **ít nhất 1 dấu gạch hoặc số**, min 4 ký tự, uppercase tự động.

Thêm **uniqueness check real-time** trên form (debounced 300ms `GET /api/items/check-sku?sku=xxx`) — UX quan trọng khi 10k SKU, user phải biết ngay trùng.

**Risk nếu chọn sai:**
- Chọn B (auto) → import Excel phải map lại mã cũ ↔ mã mới → 1 bảng cross-ref → KHÔNG ai maintain → chaos.
- Chọn C (hybrid) → tốn 1 ngày code logic, edge case nhiều, QA khổ. Chỉ làm nếu có user request cụ thể.

---

## 3. Barcode Strategy

### Phân tích brutal

Schema hiện tại có `item_barcode` với: `barcode` (unique toàn hệ), `barcode_type` (varchar default CODE128), `is_primary`. **Thiếu `source`.**

Scenario thực tế 1 item có thể có **3-5 barcode**:
- Tem NCC A in sẵn: `EAN-13` — khi mua từ NCC A
- Tem NCC B khác: `EAN-13` hoặc `Code128` — khi mua từ NCC B (cùng item nhưng nhiều nguồn)
- Tem kho nội bộ tự in: `Code128` — format `SKU-LOT-YYMMDD`
- Tem serial/lot tự in: `QR Code` — nội bộ (chứa JSON {sku, lot, exp})

### Câu hỏi unique constraint
Schema hiện tại **unique `barcode` toàn bảng** → 1 barcode value chỉ map 1 item. **Đúng về mặt logic** (nếu 2 item cùng có 1 barcode, scan sẽ ambiguous). Giữ nguyên.

NHƯNG: có thể xảy ra case NCC recycle mã EAN (hiếm). Khi đó cần dùng `barcode_type` làm 1 phần của unique (unique trên `(barcode, barcode_type)` thay vì chỉ `barcode`). **Không recommend V1** — chưa có evidence.

### Khuyến nghị

Thêm vào schema `item_barcode`:
```ts
source: varchar("source", { length: 16 }).notNull().default("internal"),
// values: "vendor" | "internal"
```

Không cần thêm `vendor_id` FK vào `item_barcode` — vì 1 EAN của NCC đặt cho item, ta không quan tâm NCC nào trong scope scan; khi cần truy ngược thì join `item_supplier`. **YAGNI.**

Thêm **constraint logic** (check constraint hoặc trigger):
- Mỗi `item_id` chỉ có **1 row `is_primary=true`** (partial unique index: `WHERE is_primary=true` trên `item_id`).

`barcode_type` enum đề xuất: `EAN13 | EAN8 | CODE128 | CODE39 | QR | DATAMATRIX` — convert từ `varchar` sang `pgEnum` để tránh typo ("code-128" vs "CODE128" vs "128").

**Risk nếu không thêm `source`:** Báo cáo "barcode nội bộ vs tem NCC" không tách được → khó track bao nhiêu item đã in tem nội bộ vs chưa. Low impact V1 nhưng sẽ hối tiếc ở tuần 6 (receiving console cần biết scan tem NCC hay nội bộ để xử lý khác).

### Generate barcode (print)?
**KHÔNG làm V1.** Generate ảnh CODE128/QR cần lib `bwip-js` (~200KB), route `/api/items/:id/barcode.png`. Low priority — user in tem qua máy Brother P-Touch desktop dùng Excel export. Defer V1.1.

---

## 4. Import Excel 10k Rows — Pipeline Design

### Quyết định 4.1: Parse client hay server?

| | Client (SheetJS xlsx) | Server (exceljs streaming) |
|---|---|---|
| Max file size | 5MB (browser RAM) | 50MB (streaming) |
| Validation UX | Ngay trên browser, tức thì | Async qua BullMQ |
| Network | Upload chỉ JSON đã parse | Upload raw .xlsx |
| 10k rows realistic | ~3MB .xlsx → OK | OK |
| Code phức tạp | Low — 1 lib | Medium — thêm worker logic |

**Khuyến nghị: Server-side streaming.** Lý do:
- 10k rows .xlsx có thể tới 4-5MB (nếu nhiều cột description dài) → client phrase dễ OOM trên tablet.
- Server-side cho phép dùng lại cùng pipeline cho import 50k rows năm sau (scale).
- Server có access DB để validate ngay (check sku đã tồn tại, supplier có trong DB không).

### Quyết định 4.2: 1-pass hay 2-pass?

**2-pass bắt buộc.** Flow:
1. **Pass 1 (Preview):** Upload → worker parse + validate → trả về `{validCount, errorRows[], preview: top 20 rows}` trong vòng 5-10s. User review.
2. **Pass 2 (Commit):** User click "Xác nhận import" → worker ghi DB transaction (chunked).

Nếu user thấy quá nhiều lỗi → tải file `items_errors.xlsx` về sửa, upload lại. **Không ai import blind 10k dòng.**

Code phức tạp hơn 1-pass nhưng **không import bậy là giá trị cốt lõi**.

**Risk nếu 1-pass:** Import 9.998 dòng thành công, 2 dòng lỗi → rollback cả 9998 → phí công 3 phút. Hoặc commit 9998 bỏ 2 → user không biết đã bỏ gì. Fail mode nào cũng tệ.

### Quyết định 4.3: Chunk size

| Chunk size | # jobs | Pros | Cons |
|---|---|---|---|
| 1 job 10k rows | 1 | Simple | Fail giữa chừng → retry cả job; UI progress nhảy cảm giác chậm |
| 500 × 20 jobs | 20 | Resume từ chunk lỗi; progress mượt | Orchestration thêm `parent_job_id`; cần tracking |
| 100 × 100 jobs | 100 | Very granular | Overhead BullMQ queue nặng; Redis memory |

**Khuyến nghị: Chunk 500 × 20 jobs, 1 "parent" job coordinate.** BullMQ có `Flow` API cho parent-child. Lý do:
- Progress UI update 20 lần (mỗi lần 5% → user cảm giác chạy).
- Chunk nhỏ dễ debug khi fail.
- Redis payload mỗi job nhỏ (500 rows × ~500 bytes = 250KB / job) — an toàn.

### Quyết định 4.4: Progress UI — polling vs SSE/WebSocket

| | Polling 2s | SSE | WebSocket |
|---|---|---|---|
| Độ phức tạp | Rất thấp | Thấp-trung | Trung-cao |
| Network overhead | 10k HTTP / 10 phút | 1 long connection | 1 long connection |
| Lib cần thêm | 0 (TanStack Query built-in) | 0 (native EventSource) | `ws` hoặc socket.io |
| Works qua Cloudflare Tunnel | ✓ | ✓ nhưng phức tạp cấu hình | ✓ nhưng cần tunnel permit |
| V1 YAGNI? | ✓✓✓ | ✓ | ✗ |

**Khuyến nghị: Polling 2s qua TanStack Query `refetchInterval: 2000` khi `status ∈ {queued, running}`.** 

Một import 10k chạy ~2 phút → user chỉ thấy progress ~60 lần poll. Không đáng gánh SSE. Khi scale lên V2 (real-time dashboard) thì mới cân nhắc SSE cho toàn hệ.

### Quyết định 4.5: Duplicate `sku` strategy

**Khuyến nghị: 3 mode cho user chọn trong Preview step:**
- **Skip** (default): dòng có sku đã tồn tại → báo trong error report, không ghi.
- **Upsert**: merge (update tên, uom, description nếu khác; không đổi `id`, `createdAt`). Hữu ích khi import "bổ sung".
- **Error-out**: dừng toàn bộ nếu có duplicate. Dùng khi tạo mới database.

Field trong UI: radio 3 option trên màn Preview. Default `Skip` vì an toàn.

**Risk nếu chỉ có 1 mode:** User bị trường hợp cuối sẽ phức tạp → hoặc complain, hoặc tự dump DB và import lại (nguy hiểm).

---

## 5. Supplier Model

### Phân tích brutal

Schema hiện tại có `supplier` + `item_supplier` với: `supplierSku`, `priceRef`, `currency`, `leadTimeDays`, `isPreferred`. **Thiếu `moq` (min order qty).**

Field `vendor_item_code` = đã có dưới tên `supplierSku`. ✓

**MOQ rất quan trọng** cho shortage → PO pipeline:
- Xưởng thiếu 3kg thép → NCC MOQ 50kg → PO phải 50kg (biết trước để tránh khiếu nại).
- Không có MOQ → PO tạo ra bị NCC từ chối → gián đoạn.

### Khuyến nghị
Thêm vào `item_supplier`:
```ts
moq: numeric("moq", { precision: 18, scale: 4 }).notNull().default("1"),
// minimum order quantity tại supplier này
packSize: numeric("pack_size", { precision: 18, scale: 4 }).default("1"),
// đóng gói (thép cuộn 50kg, bulon hộp 100 con) — PO phải bội số pack_size
```

Giữ `isPreferred` (đã có). Không thêm `backup_priority` số nguyên — `isPreferred boolean` đủ V1 (1 preferred + N backup đều = non-preferred).

**Risk nếu không MOQ:** Tuần 5 Shortage + Tuần 6 PO sẽ phải quay lại fix — chi phí 1-2 ngày rework.

### Supplier CRUD UI?
Plan M2 có list/create supplier. Brutal: **supplier thay đổi ít (1-2 NCC/tháng).** UI minimal — form 8 field, list đơn giản, không cần search advanced.

Khuyến nghị: **Giới hạn scope tuần 2 = list + create + edit basic.** Không làm bulk import supplier (chỉ ~50 NCC thực tế → nhập tay OK).

---

## 6. Performance 10k Rows — List Endpoint

### Query pattern thực tế

User hành vi (từ wireframe §3):
- Mở `/items` → load trang 1 (20 rows).
- Tìm kiếm "thép" → filter `name ILIKE`.
- Filter `type=RAW, status=ACTIVE`.
- Scroll/page.

### Khuyến nghị kỹ thuật

| Câu hỏi | Khuyến nghị | Lý do |
|---|---|---|
| Pagination | **Offset** `LIMIT 20 OFFSET N*20` | 10k rows × offset 5000 vẫn < 50ms có index. Cursor phức tạp hơn khi user nhảy trang tuỳ ý (wireframe có "Trang 1/157" → phải offset). Nếu sau này lên 100k SKU thì chuyển cursor. |
| Search text | **pg_trgm GIN index trên `name`** + **pg_trgm GIN trên `sku`** | Schema đã khai báo `item_name_trgm_idx` ✓. Cần thêm `CREATE INDEX item_sku_trgm_idx ON item USING GIN (sku gin_trgm_ops)` để tìm theo mã nhanh. |
| Tìm theo barcode | `JOIN item_barcode WHERE barcode ILIKE %x%` | index đã có. Brutal: **tách endpoint riêng `GET /api/items/by-barcode?code=xxx` trả 1 item** — scan case hot path. List filter thì full-text search trên name + sku là đủ. |
| Normalize dấu Việt | `unaccent` extension + column computed hoặc `WHERE unaccent(name) ILIKE unaccent('%thep%')` | PostgreSQL có `unaccent`. Tạo index expression: `CREATE INDEX ON item USING GIN (unaccent(name) gin_trgm_ops)`. |
| Response payload | **Minimal cho list** (`id, sku, name, itemType, uom, status, onHand, primaryBarcode`) — **không include suppliers, attachments** | Detail endpoint mới load full. Tiết kiệm payload 5-10KB / page. |
| Cache | **Chỉ TanStack Query client cache** (`staleTime: 60s`). KHÔNG Redis server cache. | YAGNI — 20 rows query có index chạy < 20ms. Redis cache làm tăng complexity invalidation (khi upsert cần bust key) — không đáng. |
| `onHand` trong list | Query view `stock_balance_view` (materialized) hoặc subquery lateral | V1 không có `stock_balance_view` tuần 2 (chưa có inventory_txn) → cột này **bỏ trống đến tuần 5**. Wireframe có hiển thị — document là "— chưa có dữ liệu" đến khi có txn. |

### Benchmark mục tiêu
- P95 `GET /api/items?q=xxx&page=N`: **< 200ms** (plan nói 400ms — over-generous).
- Search qua 10k rows với trgm: ~50-80ms một query → OK.

---

## 7. Import Idempotency

### Phân tích brutal

Scenario: User upload file 10k rows, mạng lỏng → client timeout 30s → user nhấn "Import" lại. Kết quả?

**Không có protection:**
- Backend đang process job 1; client tạo job 2 cùng file → 2 job song song ghi cùng data → duplicate hoặc conflict.

**Có `import_batch_id`:** mỗi upload có UUID riêng → Job có unique constraint → dup bị từ chối.

**Có hash file SHA-256:** Cùng 1 file re-upload trong 1h → trả lại `existing_job_id` thay vì tạo mới.

### Khuyến nghị: **Cả hai, nhưng đơn giản**

Bảng mới:
```ts
export const importBatch = appSchema.table("import_batch", {
  id: uuid().defaultRandom().primaryKey(),
  kind: varchar("kind", { length: 32 }).notNull(), // "item" V1, "bom" V2
  fileHash: varchar("file_hash", { length: 64 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(), // queued/running/done/failed
  totalRows: integer("total_rows"),
  successRows: integer("success_rows"),
  errorRows: integer("error_rows"),
  errorFileUrl: text("error_file_url"), // R2 link
  createdBy: uuid("created_by").references(() => userAccount.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  hashIdx: index("import_batch_hash_idx").on(t.fileHash),
}));
```

Upload flow:
1. Client hash file (SHA-256, 10k rows ~3MB = ~100ms qua Web Crypto).
2. Client `POST /api/imports/check { fileHash }` → nếu đã có batch < 1h và status=done → trả lại → confirm "Bạn đã import file này lúc 14:22 — muốn import lại?".
3. Nếu OK → `POST /api/imports/items (multipart)` tạo batch + chain BullMQ flow.

**Chi phí:** +0.5 ngày dev + 1 bảng đơn giản. **Đáng.** Vì user thực sự sẽ upload 2 lần do mạng xưởng.

---

## 8. UX Priority

### 3 màn của module này

| Màn | Tần suất user | Độ quan trọng polish |
|---|---|---|
| List 10k | Hàng ngày (mở nhiều lần/ngày để tra SKU) | **Cao nhất** |
| Edit form | Vài lần/tuần | Trung |
| Import wizard | 1 lần/tuần sau Phase 0 (bulk update), sau đó 1-2 lần/tháng | Thấp-trung |

### Khuyến nghị phân bổ effort
- **List (40%):** Virtualization mượt, search có dấu/không dấu, filter chips rõ, copy SKU/barcode 1-click, keyboard nav (j/k next/prev). **Ưu tiên tuyệt đối.**
- **Edit form (30%):** Form validate tốt, barcode multi-add, supplier multi-add với MOQ rõ. Không cần đẹp xuất sắc — chỉ cần không bug.
- **Import (30%):** Wizard 3 step đơn giản. Error file Excel tải về có cột "Lý do" rõ. Progress bar bớt "giả" (update thật mỗi chunk).

**Brutal:** Wireframe §3 đã design list rất tốt. Import wizard có thể làm khung wireframe đơn giản hơn (Sheet trượt phải 3 step là đủ, không cần stepper đẹp).

---

## 9. Ba phương án scope Tuần 2

| Scope item | Minimal (3 ngày) | Balanced (5 ngày) | Thorough (7 ngày) |
|---|---|---|---|
| Item CRUD (list + create + edit) | ✓ | ✓ | ✓ |
| Item list virtualization 10k | ~ basic table no-virt | ✓ @tanstack/react-virtual | ✓ + keyboard nav + bulk action |
| Item search text (trgm + unaccent) | ~ chỉ `ILIKE` | ✓ trgm + unaccent | ✓ + typeahead combobox cross-module |
| Enum mở rộng (TOOL + PACKAGING) | ✗ defer | ✓ | ✓ |
| `item.category` free text | ✗ | ✓ | ✓ |
| Barcode CRUD (multi per item) | ✓ 1 barcode primary | ✓ N barcode + source | ✓ + print preview |
| Supplier CRUD UI | ✗ stub only | ✓ basic list/form | ✓ + import CSV |
| item_supplier mapping UI | ✓ basic | ✓ + MOQ + pack_size | ✓ + price history stub |
| Import Excel 2-pass | ✗ 1-pass simple | ✓ 2-pass preview + commit | ✓ + dry-run mode |
| Import chunked BullMQ | ✗ 1 job | ✓ 500 × 20 jobs | ✓ + retry config + DLQ |
| Import idempotency (hash + batch) | ✗ | ✓ | ✓ + resume failed chunk |
| Progress UI polling | ✓ 5s interval | ✓ 2s | ✓ + cancel button |
| Error file Excel download | ✗ JSON only | ✓ | ✓ + inline edit errors |
| `import_batch` table | ✗ | ✓ | ✓ + history UI |
| Unit test coverage | ~30% | ~55% (plan target) | ~70% |
| **Rủi ro hoàn thành 1 tuần** | Thấp | Trung | **Cao** (deadline slip) |

### Khuyến nghị: **Balanced 5 ngày**

Lý do:
- **Minimal** bỏ 2-pass preview → user sẽ bốc phét "sao bị mất 2 dòng lỗi"; bỏ unaccent → search "thep" không ra "thép" → user complain ngày 1.
- **Thorough** gold-plating cho V1 — features như inline edit errors, DLQ, dry-run đều là V1.5+.
- **Balanced** cover đúng acceptance criteria (§8 Tuần 2): "Import 3.000 SKU thành công, query P95 < 400ms" + đủ safety (idempotency).

### Mapping sang người-ngày (2 dev)
- Dev A (fullstack, 5 ngày): Item CRUD + List + Search + Barcode + Supplier mapping + Form polish.
- Dev B (fullstack, 5 ngày): Import pipeline + BullMQ flow + Worker + Preview + Error file + Progress UI + `import_batch` table.
- Ngày 5 chiều: QA chéo + unit test + smoke test import 3k thật.

---

## 10. Risks cụ thể tuần 2

| # | Risk | Prob | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Import 10k chạy > 5 phút → user bỏ cuộc | Trung | Trung | Benchmark tuần 1 ngày cuối với sample 1k rows; tuning batch insert (`INSERT ... SELECT` 500 / query) |
| 2 | `pg_trgm` chưa được enable trên Postgres share Song Châu | Thấp-Trung | Cao | Check extension list tuần 1; request Song Châu enable `pg_trgm` + `unaccent` (2 extension phổ biến, risk=0) |
| 3 | Excel file user có merged cells / header format loạn | Cao | Trung | Provide template `.xlsx` chuẩn tải từ UI; validate header row đầu tiên, reject nếu format sai |
| 4 | BullMQ worker OOM khi 10k rows load full vào memory | Thấp | Cao | Streaming read (exceljs `worksheet.eachRow` async iterator); chunk 500 rows trước khi queue |
| 5 | Redis fill đầy do retain job history | Thấp | Trung | BullMQ config `removeOnComplete: { age: 3600*24, count: 100 }` |
| 6 | Duplicate barcode giữa items (user scan ra kết quả sai) | Trung | Cao | Unique constraint sẵn có; import report conflict rõ từng dòng |
| 7 | User import xong quên primary barcode → scan thất bại | Cao | Trung | Auto-set `is_primary=true` cho barcode đầu tiên của mỗi item khi import |

---

## 11. Kiểm tra chốt — 3 quyết định user phải xác nhận

Đây là 3 điểm **planner tuần sau không tự quyết được** mà cần user/tech-lead confirm:

### Q1. Taxonomy: Thêm `TOOL` và `PACKAGING` vào `itemTypeEnum`?
- **Khuyến nghị:** Thêm.
- **Impact nếu đồng ý:** 1 migration nhỏ; cập nhật seed data; BA Phase 0 phân loại lại một số SKU đang bị gộp nhầm vào CONSUMABLE.
- **Impact nếu không:** Nguy cơ báo cáo tiêu hao tool/packaging không tách được; user workaround prefix SKU.

### Q2. Item code convention: User bắt buộc nhập tay + validate regex, KHÔNG auto-generate?
- **Khuyến nghị:** Bắt buộc nhập tay.
- **Impact nếu đồng ý:** Form create đơn giản; khớp mã cũ 100%; dev giảm 0.5 ngày.
- **Impact nếu không (chọn hybrid C):** +1 ngày dev; UX phức tạp hơn, test nhiều case.

### Q3. Import idempotency (hash file + `import_batch` table)?
- **Khuyến nghị:** Có.
- **Impact nếu đồng ý:** +0.5 ngày dev; thêm 1 bảng; an toàn cho upload lặp.
- **Impact nếu không:** User có nguy cơ import đôi khi mạng timeout; khó debug lịch sử import.

---

## 12. Next steps cho Planner

1. Convert brainstorm này thành **plan chi tiết tuần 2** (`plans/v1-foundation/week-2/260423-week2-plan.md`) với tasks broken-down theo ngày + acceptance criteria chi tiết.
2. Viết migration file:
   - `ALTER TYPE item_type ADD VALUE 'TOOL'; ADD VALUE 'PACKAGING';` (pending Q1)
   - Thêm cột `item.category`, `item_barcode.source`, `item_supplier.moq`, `item_supplier.pack_size`.
   - Thêm bảng `import_batch` (pending Q3).
   - Thêm index: `item_sku_trgm_idx`, `item_name_unaccent_trgm_idx`.
   - Partial unique: `item_barcode_primary_per_item` WHERE `is_primary=true`.
3. Design document cho **import pipeline** (flow diagram BullMQ parent-child flow).
4. Template Excel `item_import_template.xlsx` (Phase 0 BA chuẩn bị luôn).

---

*Brainstorm by Solution Brainstormer — YAGNI/KISS/DRY. Brutal honesty applied. Next: planner consumes; user confirms Q1/Q2/Q3.*
