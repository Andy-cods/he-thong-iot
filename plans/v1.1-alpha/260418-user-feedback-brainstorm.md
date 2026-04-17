# V1.1-alpha — Brainstorm user feedback sau V2 LIVE (brutal honesty)

> **Phiên bản:** 1.0 · **Ngày:** 2026-04-18 · **Persona:** solution-brainstormer brutal honesty
> **Context:** V2 redesign đã LIVE https://mes.songchau.vn, user click thử → phát hiện "UI đẹp nhưng nhiều chức năng placeholder chưa hoạt động".
> **Mục tiêu:** Không cook full V1.1 (15 ngày, cần 10 PO sign-off blocking). Thay vào đó tách scope **V1.1-alpha** (5-8 ngày) lấp 5 user feedback thực tế, defer 90% complexity V1.1 (snapshot/explode/state machine 10 state/reservation/ECO apply) sang V1.2+.
> **Quy ước:** Mỗi mục có Root cause · Scope file/API · Effort giờ · Priority · Dependency. Không waffle. File path absolute từ repo root.

---

# §1 Audit 5 user feedback — Root cause + effort

Mỗi item dưới đây là "tại sao click xong không làm được gì?" — **brutal honesty** về gap thực sự giữa UI đã render và backend/data layer.

## 1.1 Feedback #1 — `/pwa/receive/[poId]` UI OK nhưng không làm được gì

### Root cause
Ba gap song song, không phải 1 bug đơn lẻ:

1. **Không có PO data thật.** `apps/web/src/app/pwa/receive/[poId]/page.tsx` hardcode 3 line stub (thép C45, bu lông M8, dầu ISO 46) trong RSC body. Không fetch DB, không có bảng `purchase_order` / `purchase_order_line` trong migration đã apply (0002a/b/c chỉ có item master). Drizzle schema `packages/db/src/schema/procurement.ts` có thể đã khai báo (cần verify) nhưng **chưa có migration tương ứng** và **chưa có seed data**.
2. **Không có endpoint `/api/receiving/events`.** `apps/web/src/app/api/` chỉ có: `auth/`, `health/`, `imports/`, `items/`, `me/`, `ready/`, `suppliers/`. KHÔNG có `receiving/` hay `po/`. ReceivingConsole.tsx dòng 130-146 chỉ `setTimeout(600ms)` + mark `status='synced'` **giả lập** — không gọi fetch thật. Dexie queue ghi local OK, replay cũng OK (về mặt DB local), nhưng server-side **không nhận** gì cả.
3. **Barcode scanning FE đã work** (`BarcodeScanner.tsx` + USB wedge input + camera ZXing theo design-spec §2.8). Gap duy nhất là: scan match `l.sku` hardcode → open dialog → ghi Dexie. Chừng nào PO data còn stub, scan "thành công" không có ý nghĩa business.

### Scope cần cook
- **Backend stub receipt:** tạo table `app.receipt_event` tối giản 7 cột (`id uuid`, `po_code text`, `sku text`, `qty numeric`, `lot_no text?`, `qc_status text`, `created_at`, `user_id`). KHÔNG cook `purchase_order` full vì blocking P10 (Excel source Song Châu).
- **Endpoint:** `POST /api/receiving/events` nhận batch `{ events: ScanEvent[] }` → insert `receipt_event` + `audit_log` entry per event, trả `{ acked: [id, id, ...] }`. Idempotent theo `event.id` (UUIDv7 client-gen, có sẵn `lib/uuid-v7.ts`).
- **Endpoint PO stub:** `GET /api/po/[id]` trả fake lines — **2 options** (chọn 1 ở §3.6):
  - Option A: hardcode 3 scenario (small/medium/large) theo `poId`, giữ stub nhưng đẩy ra API thay vì RSC — dễ swap real data sau.
  - Option B: "BOM-as-PO-stub" — reuse `bom_template` (khi schema có) làm nguồn line list cho Receive, user chọn 1 BOM để "nhận hàng" giả lập. **Tái dụng** 100% UI đã build.
- **Hook front-end:** `ReceivingConsole.tsx` dòng 123-146 thay block `setTimeout` bằng `fetch('/api/receiving/events', { method: 'POST', body: JSON.stringify({ events: pending }) })`. Online banner + retry 3 lần như design-spec §2.8.
- **Files cần đụng:**
  - `packages/db/src/schema/receiving.ts` (mới, ~30 dòng)
  - `packages/db/migrations/0003a_receipt_event.sql` (mới)
  - `apps/web/src/app/api/receiving/events/route.ts` (mới)
  - `apps/web/src/app/api/po/[id]/route.ts` (mới)
  - `apps/web/src/app/pwa/receive/[poId]/page.tsx` (sửa: fetch thay stub)
  - `apps/web/src/components/receiving/ReceivingConsole.tsx` (sửa block replay ~15 dòng)
  - `apps/web/src/server/repos/receipts.ts` (mới)

### Effort · Priority · Dependency
- **Effort:** 10-14h (1.5 ngày, 1 dev). Cook schema 1h + migration 1h + repo 2h + 2 endpoints 3h + FE hook 2h + test 2h.
- **Priority:** **P0** (user explicit "muốn chạy được end-to-end"). Cook Option B nếu BOM schema xong trước (tận dụng), ngược lại Option A.
- **Dependency:** None hard. Option B phụ thuộc 1.4 (BOM schema). Nếu cook song song 2 dev → Option A trước để không block.

---

## 1.2 Feedback #2 — "Quản trị" chưa tồn tại (admin panel)

### Root cause
- `apps/web/src/lib/nav-items.ts` dòng 67-70 **ĐÃ** khai báo `{ href: "/admin", label: "Quản trị", roles: ["admin"] }`. Click vào → **404** vì route `/admin/*` chưa có folder trong `apps/web/src/app/(app)/`.
- Audit log table đã có (`packages/db/src/schema/audit.ts` — `audit_log` + `state_transition_log` theo spec V1.0 foundation, đã migration). Service ghi audit log đã reuse ở `apps/web/src/server/services/*` (auth, items, imports) — nhưng **không có UI đọc**.
- User management: bảng `user_account` + `role` + `user_role` đã có. Chỉ có 1 seed user `admin / ChangeMe!234` + 1 register API `/api/auth/*`. **Không có CRUD user/role qua UI** — phải chạy SQL trực tiếp VPS.
- Password change: không có endpoint `POST /api/auth/change-password` (kiểm tra `apps/web/src/app/api/auth/` chỉ có login/logout/register).

### Scope cần cook
- **Layout `(admin)`** hoặc route group `/admin/*` trong `(app)` với role-guard `admin` duy nhất (reuse pattern layout (app)/layout.tsx dòng 44-51). Nếu `roleCodes` không chứa `"admin"` → redirect `/`.
- **Screens:**
  - `/admin` index — dashboard đơn giản: 3 tile (user count, role count, audit 24h count).
  - `/admin/users` — list user (username, fullName, role list, active, lastLoginAt). DataTable V2 pattern reuse `components/domain/DataTable`.
  - `/admin/users/new` — form create (username, fullName, password, role picker multi-select).
  - `/admin/users/[id]` — edit fullName + isActive + role assign/remove. Reset password button.
  - `/admin/audit` — list 100 dòng audit gần nhất, filter by entity/action/user, pagination. Reuse `audit_log` service.
  - `/admin/settings` — đổi password admin hiện tại (old + new + confirm) + build info (commit SHA, node version, DB version from `/api/health`).
- **API endpoints:**
  - `GET /api/admin/users` + `POST` create + `GET /[id]` + `PATCH /[id]` + `POST /[id]/reset-password`
  - `GET /api/admin/roles` list
  - `POST /api/admin/users/[id]/roles` assign + `DELETE /api/admin/users/[id]/roles/[roleId]`
  - `GET /api/admin/audit` paginated
  - `POST /api/auth/change-password` (bất kỳ user đã login)
- **Middleware:** tạo helper `requireAdmin(req)` trong `apps/web/src/lib/auth-guard.ts`, return 403 nếu không phải admin.
- **Files cần đụng:** ~15 file mới trong `apps/web/src/app/(app)/admin/**` + `apps/web/src/app/api/admin/**` + 1 repo `apps/web/src/server/repos/users.ts`.

### Effort · Priority · Dependency
- **Effort:** 16-20h (2-2.5 ngày, 1 dev). Nặng vì 5 screens + 7 endpoints, nhưng CRUD đơn giản (reuse `ItemsTable` + `SupplierForm` pattern V2).
- **Priority:** **P0** — user explicit, VPS đang dùng `admin/ChangeMe!234` default, đổi password qua UI là security must-have.
- **Dependency:** Không. Cook độc lập song song với BOM module.

---

## 1.3 Feedback #3 — Dashboard không interactive (mock thuần)

### Root cause
- `apps/web/src/app/(app)/page.tsx` dòng 37-38 gọi `generateMockOrders()` + `generateMockAlerts()` từ `lib/dashboard-mocks.ts`. KPI card có `href` (vd `"/items"`) cho SKU — click được. Nhưng:
  - KPI "PO chờ nhận" (value=8) — KHÔNG có `href` → không click được.
  - `OrdersReadinessTable` dòng render từ mock, row không có link `/orders/[id]` vì `/orders` chưa tồn tại.
  - `AlertsList` — mock thuần, không link tới item detail / shortage board.
  - Quick links cards 48px height — href `/bom/new`, `/orders/new`, `/shortage-board` đều 404.
- Không có cột "BOM template" count — user muốn nhưng chưa có KPI tile.
- Không có tương tác CRUD trên Dashboard — đúng spec (dashboard = glanceable), nhưng user expect ít nhất click-through mượt.

### Scope cần cook
- **KPI card interactive:**
  - "SKU hoạt động" — đã có `href="/items"` OK.
  - "PO chờ nhận" — bỏ (V1.1-alpha chưa có PO module) HOẶC thay bằng "Phiên nhận hàng 24h" đếm `receipt_event` count, href `/admin/audit?filter=receive` (reuse audit log).
  - "WO đang chạy" — bỏ (chưa có production module), thay bằng "BOM template" count thật — href `/bom`.
  - "Cảnh báo hết hàng" — thay bằng "User active" count — href `/admin/users`.
- **OrdersReadinessTable** — giữ mock, đổi caption "Mock data — Order module V1.2". Row click mở dialog "Chức năng Order đang phát triển" (không 404).
- **AlertsList** — giữ mock nhưng 2 alert có link thật (vd "BOM mới tạo" → `/bom/<id>`).
- **Quick links:**
  - "Tạo BOM mới" → `/bom/new` (khi 1.4 xong)
  - "Nhập Excel" → giữ `/items/import` (đã có V1) + thêm `/bom/import` (khi 1.5 xong)
  - "Nhận hàng" → `/pwa/receive/demo` (đã có, làm chạy ở 1.1)
- **API mới `GET /api/dashboard/overview`** trả 4 KPI count thật (items active, bom template, user active, receipt 24h). Cook đơn giản 4 query parallel `Promise.all`.
- **Files:**
  - `apps/web/src/app/api/dashboard/overview/route.ts` (mới)
  - `apps/web/src/app/(app)/page.tsx` (sửa: fetch real KPI, swap 2 KPI card)
  - `apps/web/src/lib/dashboard-mocks.ts` (giữ Orders + Alerts mock, thêm comment V1.2 defer)

### Effort · Priority · Dependency
- **Effort:** 4-6h (0.5-0.75 ngày). Nhẹ vì chủ yếu swap href + thêm 1 endpoint 4 query.
- **Priority:** **P1** (nice UX, không block function). User feedback #3 về "click được" chủ yếu là hệ quả của #2 + #4 + #5 xong thì tự work.
- **Dependency:** BOM module (1.4) + Admin module (1.2) phải có route tồn tại (không 404), KPI count đến sau.

---

## 1.4 Feedback #4 — Thiếu BOM list + BOM detail (tree editor)

### Root cause
- **Drizzle schema ĐÃ CÓ** (`packages/db/src/schema/bom.ts` — `bom_template`, `bom_revision`, `bom_line` với 3 cột `parent_item_id`, `child_item_id`, `qty_per`, `scrap_pct`, `ref_designator`). Kiểm tra xong — schema định nghĩa từ V1.0 foundation nhưng **chưa apply migration**.
- **Migration chưa có** — thư mục `packages/db/migrations/` chỉ có `0002a/b/c` (item + GIN unaccent). Cần `0003_bom_template.sql` generate từ Drizzle hoặc viết tay theo pattern `0002b` (DDL raw SQL split superuser / app user nếu có extension).
- **Route `/bom/**` chưa có** trong `apps/web/src/app/(app)/`. Chỉ có `items/` + `suppliers/`.
- **API `/api/bom/**` chưa có**. Cũng không có `server/repos/bom.ts`.
- **"Tree linh kiện multi-level"** là theo mẫu Excel user nói đã gửi — **tôi KHÔNG tìm thấy file `.xlsx/.xls/.csv`** trong repo (Glob toàn repo đã check `**/*.xlsx`, `**/*.xls`, `**/*.csv` — không có file nào). User có thể: (a) nhầm chat khác, (b) quên attach, (c) file còn ở máy user. Xem §2 để quyết định hướng.
- **Component library** `@dnd-kit/core` + `@dnd-kit/sortable` **đã install** từ V2 (kiểm tra package.json) — reuse được cho tree drag-drop.

### Scope cần cook (V1.1-alpha trim aggressive)
- **Schema:** Dùng nguyên schema V1.0 foundation đã định nghĩa `bom.ts`, CHỈ cook migration 0003 và **KHÔNG** thêm constraint phức tạp (cycle trigger defer V1.1 full, CHECK release immutable defer).
- **Simplification V1.1-alpha:**
  - Template có 1 revision "R01 DRAFT" mặc định tạo khi POST template. User edit trực tiếp trên revision đó, KHÔNG release (release flow defer V1.1 full).
  - Tree 3 level max (enforce UI-side, không DB constraint) — đủ cho BOM "Máy CNC ABC" 25 component Song Châu. Deep 10 defer V1.2.
  - Không có phantom, không có substitute, không có ECO. Chỉ parent_item_id / child_item_id / qty_per / scrap_pct / position_no / notes.
- **API endpoints:**
  - `GET /api/bom/templates` — list paginated + filter `q` search + `isActive`
  - `POST /api/bom/templates` — create {code, productItemId, name, description} + auto-tạo revision R01 DRAFT
  - `GET /api/bom/templates/[id]` — detail metadata + latest revision id
  - `GET /api/bom/revisions/[id]/tree` — recursive CTE trả flat tree (~100 row typical), FE tự build hierarchy
  - `POST /api/bom/revisions/[id]/components` — add 1 component (parent_item_id, child_item_id, qty_per, scrap_pct, position_no auto-increment)
  - `PATCH /api/bom/revisions/[id]/components/[cid]` — edit qty/scrap/notes
  - `DELETE /api/bom/revisions/[id]/components/[cid]` — remove
  - **DEFER V1.1 full:** release endpoint, obsolete, where-used, reorder batch, clone revision.
- **UI screens:**
  - `/bom` — list V2 compact (reuse `components/domain/DataTable` từ Items). Columns: code, name, revision code, component count (subquery), createdAt, actions.
  - `/bom/new` — form đơn giản (code input, product item picker dùng `ItemPicker` V1 đã có, name, description).
  - `/bom/[id]` — detail metadata + tree editor. Tree editor dùng `@dnd-kit/sortable` wrap custom tree state Zustand. **KHÔNG undo/redo** (defer V1.1 full).
  - Inline edit qty_per / scrap_pct / position_no per row (click → input, blur → PATCH). Optimistic UI.
  - Add-component modal: pick item, nhập qty_per + scrap_pct, chọn parent (root hoặc component hiện có).
  - Delete confirm inline (`Dialog` V2 pattern, type "XOA" confirm).
  - Empty state có 2 CTA: "Tạo BOM native" (link `/bom/new`) + "Import Excel BOM" (link `/bom/import`).
- **Nav item:** thêm `{ href: "/bom", label: "BOM", icon: GitBranch, roles: ["admin", "planner"] }` vào `lib/nav-items.ts` giữa "Nhà cung cấp" và "Nhận hàng".
- **Files cần đụng:**
  - `packages/db/migrations/0003a_bom_template.sql` (mới, DDL + grant)
  - `packages/db/migrations/0003b_bom_revision.sql` (mới)
  - `packages/db/migrations/0003c_bom_line.sql` (mới)
  - `apps/web/src/server/repos/bomTemplates.ts` (mới, ~150 dòng CRUD)
  - `apps/web/src/server/repos/bomRevisions.ts` (mới, ~120 dòng + recursive CTE)
  - `apps/web/src/app/api/bom/templates/route.ts` + `[id]/route.ts`
  - `apps/web/src/app/api/bom/revisions/[id]/tree/route.ts`
  - `apps/web/src/app/api/bom/revisions/[id]/components/route.ts` + `[cid]/route.ts`
  - `apps/web/src/app/(app)/bom/page.tsx` list
  - `apps/web/src/app/(app)/bom/new/page.tsx` form
  - `apps/web/src/app/(app)/bom/[id]/page.tsx` detail
  - `apps/web/src/components/bom/BomTreeEditor.tsx` (~400 dòng)
  - `apps/web/src/components/bom/BomLineRow.tsx`
  - `apps/web/src/components/bom/AddComponentDialog.tsx`
  - `apps/web/src/lib/nav-items.ts` (sửa: thêm item BOM)
  - `apps/web/src/stores/bomTreeStore.ts` (Zustand)

### Effort · Priority · Dependency
- **Effort:** 24-32h (3-4 ngày, 1 dev). Nặng nhất trong 5 items vì tree editor UI. Tối ưu nếu có 2 dev song song (BE 12h + FE 20h).
- **Priority:** **P0** — user explicit "muốn function này chạy được", và là backbone cho 1.3 + 1.5.
- **Dependency:** Item master phải có seed data đủ (≥ 30 items) để drag-drop BOM có gì chọn. Hiện V1 đã có Excel import item → có thể seed 30-50 item mock.

---

## 1.5 Feedback #5 — Nhập Excel 2 hướng (bridging + native)

### Root cause
- **Native-create** đã nằm trong 1.4 (tree editor UI).
- **Excel import** hiện V1 chỉ có `/items/import` cho Item master (`apps/web/src/app/(app)/items/import/` + API `/api/imports/items/*` + repo `importBatch.ts`). Pattern 4-step wizard: upload → mapping → preview → commit. Tốt — **reuse pattern**.
- Gap cho BOM Excel:
  - **Chưa có template column mapping BOM** (BOM phức tạp hơn Item vì có parent-child relation + qty + scrap).
  - **Chưa có validator cycle/duplicate cho BOM import.**
  - **Chưa có file mẫu Excel** — xem §2 Pre-requisite.
- User feedback ngầm ẩn: "2 mode phải co-exist". Điều này tự nhiên nếu cả hai đều insert vào cùng `bom_template` + `bom_revision` + `bom_line` — không conflict. List `/bom` show cả hai không cần flag source.

### Scope cần cook
- **Template Excel giả định** (xem §2 để chốt): 3 sheet hoặc 1 sheet 10 cột:
  - `template_code`, `product_sku`, `name`, `description` (metadata per BOM, 1 row lặp lại trong sheet flat)
  - `parent_sku` (empty = root), `child_sku`, `qty_per`, `scrap_pct`, `position_no`, `notes`
- **Endpoint pattern reuse** `/api/imports/items`:
  - `POST /api/imports/bom` — upload xlsx → parse → return `{ batchId, preview: [...], errors: [...] }`. Lưu vào `import_batch` table V1 (reuse).
  - `POST /api/imports/bom/[batchId]/commit` — validate cycle (DFS) + resolve SKU → itemId + insert bulk.
- **Screen `/bom/import`** — 4-step wizard clone `/items/import`:
  - Step 1: Upload file + chọn sheet
  - Step 2: Column mapping (dropdown match header → field). Reuse `ColumnMapper` component V2.
  - Step 3: Preview 20 rows đầu + lỗi validation (SKU không tồn tại, cycle detect, qty_per ≤ 0).
  - Step 4: Commit + báo cáo `{ created: N templates, M lines }` + link tới `/bom/[id]` vừa tạo.
- **Cycle detection** DFS visited set theo `bom_line` mới insert cho CÙNG template. Block commit nếu có cycle.
- **Files cần đụng:**
  - `apps/web/src/app/(app)/bom/import/page.tsx` (mới, reuse ImportWizard V2)
  - `apps/web/src/app/api/imports/bom/route.ts` (mới)
  - `apps/web/src/app/api/imports/bom/[batchId]/commit/route.ts` (mới)
  - `apps/web/src/lib/bom-import-mapping.ts` (mới, clone import-mapping.ts + BOM-specific)
  - `apps/web/src/lib/bom-cycle-check.ts` (mới, ~50 dòng DFS)
  - `apps/web/src/components/bom/BomImportWizard.tsx` (mới, compose `ImportWizard` V2)
  - `docs/bom-import-template.xlsx` (mới, template user download) — **hoặc** `apps/web/public/bom-import-template.csv` fallback.

### Effort · Priority · Dependency
- **Effort:** 12-16h (1.5-2 ngày). Nhẹ hơn 1.4 vì 80% reuse pattern Items import.
- **Priority:** **P1** — user muốn nhưng **ngắn hạn bridging**. Nếu user confirm PO Song Châu chưa có Excel legacy → defer V1.2. Nếu có → cook trong V1.1-alpha.
- **Dependency:** 1.4 phải xong (schema + repo + list/detail).

---

## 1.6 Tổng hợp priority matrix

| # | Feedback | Effort | Priority | Blocking | Depend |
|---|---|---|---|---|---|
| 1.1 | Receiving functional | 10-14h | P0 | User explicit | (option B) 1.4 |
| 1.2 | Admin panel | 16-20h | P0 | Security (đổi pw default) | None |
| 1.3 | Dashboard interactive | 4-6h | P1 | Hệ quả 1.2+1.4 | 1.2, 1.4 |
| 1.4 | BOM list + detail tree | 24-32h | P0 | User explicit + backbone | Item seed |
| 1.5 | Excel import BOM | 12-16h | P1 | Bridging, chờ file mẫu | 1.4, §2 |

**Tổng effort 1 dev:** 66-88h = 8-11 ngày. Với 2 dev song song + parallelizable cao (1.1/1.2 độc lập; 1.4 BE+FE tách) → **5-7 ngày**.

---

# §2 Pre-requisite sign-off — brutal honesty

Full V1.1 plan yêu cầu **10 PO sign-off** blocking trước khi code. V1.1-alpha trim còn **5 câu thực sự blocking**. Còn lại default + flag sửa sau.

## 2.1 Review 10 PO questions gốc (từ `v1.1-bom-order-plan.md §14.1` + `brainstorm-deep §8`)

| PO# | Câu hỏi gốc | V1.1-alpha cần? | Lý do | Default nếu defer |
|---|---|---|---|---|
| P1 | Glossary VN-EN 30 terms | Không | Glossary = compliance/docs, không blocking code | `docs/glossary-v1.md` stub, fill V1.2 |
| P2 | Item taxonomy 5 category + SKU regex | Không | V1 đã có `SKU_REGEX` hoạt động, chưa cần thêm category | Giữ regex V1 hiện tại |
| P3 | BOM model rules (depth, substitute, phantom) | **Có** (partial) | Quyết định depth = 3 cho V1.1-alpha hay 10 | Default depth 3 hardcode UI, schema không limit |
| P4 | UoM list chuẩn | Không | Item đã có cột uom text, không enum | Giữ text, chuẩn hóa V1.2 |
| P5 | Reservation FIFO/FEFO | Không | Defer hoàn toàn V1.2+ | N/A |
| P6 | QC plans | Không | Receiving chỉ có qcStatus pass/fail (đủ) | pass/fail binary |
| P7 | Valuation method | Không | Chưa có inventory valuation | N/A |
| P8 | Barcode standards Code128/QR/LOT regex | Không | V1 đã có barcode trên item + regex | Giữ V1 |
| P9 | Role → người cụ thể Song Châu | Không | Seed 4 test user đủ UAT | admin + planner + warehouse + design_engineer test accounts |
| P10 | Data migration Excel source (BOM template sample) | **Có** blocking | Không có file user → không biết column nào thật | Xem §2.3 |

## 2.2 5 câu thực sự blocking V1.1-alpha

| Q# | Câu hỏi | Tác động nếu không chốt | Default đề xuất (nếu user muốn cook ngay) |
|---|---|---|---|
| **B1** | BOM "Máy CNC ABC" thực tế có bao nhiêu cấp (2 / 3 / 5)? | Tree editor UI max depth + render performance | **3 cấp max** (top → sub-assembly → raw material). Hardcode UI nhắc "chạm limit 3" nếu user cố add depth 4. Defer depth 10 V1.2. |
| **B2** | BOM max component count trung bình (25 / 100 / 500)? | Render virtualize hay không | **≤ 100 nodes**, render flat no virtualize. Nếu Song Châu có > 200 → flag V1.2 virtualize (risk R1.2 trong plan gốc). |
| **B3** | Scrap % default khi tạo component mới (0 / 2 / 5%)? | Form prefill + invariant check | **Default 0%**, user điền thủ công. Không compound cumulative V1.1-alpha (defer formula V1.2 §6.5 plan gốc). |
| **B4** | Tạo BOM "phẳng" hay bắt buộc có product_item_id (SKU sản phẩm đầu ra)? | Schema requires `productItemId NOT NULL` | **Bắt buộc product SKU** (theo schema hiện tại). Form `/bom/new` buộc pick item từ master trước. Nếu user chưa có item → tạo item trước ở `/items/new`. |
| **B5** | Admin có 1 user (admin) hay cần seed sẵn 4 role (admin/planner/warehouse/design_engineer)? | `/admin/users/new` form có cần role picker nhiều option | **Seed 4 role** trong migration 0003d. User tạo qua UI gán role. |

## 2.3 File Excel BOM user nói đã gửi — **KHÔNG TÌM THẤY**

Đã Glob toàn repo `**/*.xlsx`, `**/*.xls`, `**/*.csv` → 0 match. User có thể:
- (a) gửi file ở chat/email khác (Claude chỉ thấy được file trong cwd `c:\dev\he-thong-iot\`).
- (b) quên attach.
- (c) mô tả bằng lời, chưa export Excel thực tế.

### 2 hướng đi cho 1.5 (Excel import BOM)

**Option X — PAUSE cook 1.5, chờ file user:**
- Cho user upload file sample vào `docs/bom-import-template-sample.xlsx` hoặc chia sẻ qua Notion/email.
- Cook 1.1 + 1.2 + 1.3 + 1.4 trước (5-7 ngày). Quay lại 1.5 khi có file.
- **Pros:** Template đúng mẫu Song Châu 100%, không phải redo sau.
- **Cons:** Chậm 1 tuần nếu user bận. User không dùng Excel import trong giai đoạn alpha → bridging không cần gấp.
- **Risk:** User có thể không gửi file trong 1 tuần → delay vô hạn.

**Option Y — COOK template giả định dựa deep research + Song Châu convention:**
- Dựa theo `docs/context-part-1.md` DDL BOM §240-426 + industrial machining convention VN.
- Template đề xuất 10 cột (xem §1.5 scope). Đặt tên file `bom-import-template-v1alpha.xlsx` với 3 row ví dụ "Máy CNC ABC" phăng 3 cấp.
- User sau khi có file thật → so sánh → nếu khác → 30 phút chỉnh column mapping config, không cần redo schema.
- **Pros:** Không block timeline, user có thể test với template giả định, feedback sửa.
- **Cons:** Có thể phải cook thêm migration column thứ 2 (vd "supplier_sku" cho legacy) sau khi nhận file.
- **Risk:** Nếu Excel Song Châu có cấu trúc rất khác (vd merged cell, multi-header, tiếng Anh + tiếng Việt trộn) → cần rework parser 1-2 ngày.

### ĐỀ XUẤT: **Option Y** với 2 gate

1. Cook 1.5 cuối cùng (sau 1.4).
2. Gate-1 (trước 1.5 start): Hỏi user 1 lần nữa "có gửi được file mẫu không?". Nếu CÓ → pause 1.5 đến lúc file về (Option X). Nếu KHÔNG (user confirm tạo giả định OK) → Option Y.
3. Gate-2 (sau UAT): User import file thật lần đầu → ghi lại diff → cook PR "bom-import v2 column mapping".

---

# §3 Scope V1.1-alpha (CHỐT — khác V1.1 full)

## 3.1 Philosophy

**Full V1.1 plan** = 15 ngày + 2 tuần pre-requisite + 10 PO sign-off + 4 state machine + snapshot immutable + recursive CTE BOM explode + shortage board + ECO stub + 10-state snapshot line.

**V1.1-alpha** = 5-8 ngày, lấp gap user feedback, KHÔNG touch snapshot/order/explode/ECO. User thấy "chạy được" → tiếp tục cook V1.1 full có sign-off ổn thỏa.

Guiding principles:
- **Mỗi feedback có 1 screen + 1-3 endpoint + test pass.**
- **Không optimize premature** — BOM 100 node flat render là đủ.
- **Tái dụng V1 pattern 100%** — ItemsTable, ImportWizard, ColumnMapper, DataTable.
- **Defer aggressive** — snapshot, release, obsolete, shortage board KHÔNG touch V1.1-alpha.

## 3.2 Backbone schema (migration `0003_bom_receive_admin.sql`)

Split 4 file theo pattern `0002a/b/c`:

| File | Scope | User | Chi tiết |
|---|---|---|---|
| `0003a_schema_grants.sql` | superuser | postgres | Grant `engineering` schema nếu chưa (V1 chưa có, cook trong `app` schema cho đơn giản V1.1-alpha) |
| `0003b_bom_tables.sql` | app_user | iot_app | `bom_template` + `bom_revision` + `bom_line` theo schema Drizzle `bom.ts` |
| `0003c_receipt_event.sql` | app_user | iot_app | `receipt_event` table (7 cột tối giản) |
| `0003d_seed_roles.sql` | app_user | iot_app | Seed 4 role (`admin`, `planner`, `warehouse`, `design_engineer`) nếu chưa |

**CHÚ Ý:** schema Drizzle `bom.ts` hiện declaim table trong `appSchema` (`apps`). OK cho V1.1-alpha. Không đụng `engineering` schema riêng như plan gốc (defer V1.1 full).

## 3.3 API endpoints (10 endpoint)

**BOM:**
- `GET /api/bom/templates` list paginated
- `POST /api/bom/templates` create (+ auto R01 DRAFT)
- `GET /api/bom/templates/[id]` detail
- `GET /api/bom/revisions/[id]/tree` flat tree (recursive CTE)
- `POST /api/bom/revisions/[id]/components` add
- `PATCH /api/bom/revisions/[id]/components/[cid]` edit
- `DELETE /api/bom/revisions/[id]/components/[cid]` remove
- `POST /api/imports/bom` upload (nếu §2.3 Option Y)
- `POST /api/imports/bom/[batchId]/commit` commit

**Receiving:**
- `GET /api/po/[id]` PO stub (Option A hardcode 3 scenario)
- `POST /api/receiving/events` batch accept Dexie events

**Admin:**
- `GET /api/admin/users`
- `POST /api/admin/users`
- `GET /api/admin/users/[id]`
- `PATCH /api/admin/users/[id]`
- `POST /api/admin/users/[id]/reset-password`
- `GET /api/admin/roles`
- `POST /api/admin/users/[id]/roles`
- `DELETE /api/admin/users/[id]/roles/[roleId]`
- `GET /api/admin/audit` paginated
- `POST /api/auth/change-password`

**Dashboard:**
- `GET /api/dashboard/overview` (4 KPI count thật)

**Tổng: ~21 endpoints** (vs 35+ trong V1.1 full plan § 3).

## 3.4 UI screens (10 screen + 1 nav update)

- `/bom` list · `/bom/new` form · `/bom/[id]` detail tree
- `/bom/import` wizard (nếu Option Y)
- `/admin` index · `/admin/users` list · `/admin/users/new` · `/admin/users/[id]`
- `/admin/audit` · `/admin/settings`
- Update `/` dashboard (không screen mới, chỉ swap data source)
- Update `/pwa/receive/[poId]` (không screen mới, chỉ fetch real)

Không có: `/orders/*`, `/shortage-board`, `/eco/*`, `/bom/revisions/[id]` (standalone — gộp vào `/bom/[id]`).

## 3.5 Dashboard interactive rules (1.3 cụ thể)

Dashboard sau V1.1-alpha:
- **4 KPI card** đều navigable:
  - "SKU hoạt động" → `/items` (đã có V1)
  - "BOM template" → `/bom` (NEW)
  - "User active" → `/admin/users` (NEW, admin-only)
  - "Nhận hàng 24h" → `/admin/audit?filter=receive` (NEW) OR `/pwa/receive/demo`
- **OrdersReadinessTable** — giữ mock, hiển thị banner "Dữ liệu mẫu — Sprint V1.2 sẽ có thật". Row click → dialog info, không 404.
- **AlertsList** — mock 3-5 alert với link thật (vd "BOM mới tạo R01" → `/bom/<id>`).
- **Quick links** 4 card (48px height):
  - "Tạo BOM" → `/bom/new`
  - "Nhập Excel BOM" → `/bom/import` (disabled visual nếu Option X, tooltip "Chờ file mẫu")
  - "Nhập Excel Item" → `/items/import` (V1 có)
  - "Nhận hàng" → `/pwa/receive/demo`

## 3.6 Receiving PWA functional (1.1 cụ thể)

**Option chọn A hay B:**

| | Option A (PO hardcode API) | Option B (BOM-as-PO) |
|---|---|---|
| Data nguồn | 3 scenario hardcode trong API route | Pick `bom_template` active, map `bom_line` → PO line |
| Độ phức tạp | Thấp (API đơn giản) | Trung (cần UI "chọn BOM" trước khi scan) |
| Tái dụng | Thấp, stub throwaway | Cao — tận dụng BOM schema + seed 1 BOM demo |
| User UX | Không giải thích được "tại sao 3 line này lại là PO" | Hợp lý hơn — BOM Máy CNC ABC có 3 component chính, "nhận" như PO |
| Effort | 1h | 3-4h |

**ĐỀ XUẤT: Option B** nếu 1.4 xong trước 1.1 (ngày 3-4 cook). Option A nếu cook 1.1 tách dev song song ngày 1-2. Không cần chốt sớm.

**Bất kỳ option nào:**
- FE `ReceivingConsole.tsx` dòng 123-146: replay pending events → `POST /api/receiving/events` → mark synced theo response.
- `audit_log` table record từng event (entity=`receipt`, action=`create`, detail={sku, qty, lot, qcStatus}).
- QC status fail → vẫn lưu nhưng badge đỏ trong `/admin/audit`.

## 3.7 Admin panel functional (1.2 cụ thể)

- **User list columns:** username, fullName, roles (comma), active, lastLoginAt, actions (edit, reset pw).
- **Role picker:** multi-select checkbox 4 role (admin, planner, warehouse, design_engineer).
- **Audit filter:** entity (items/bom/receipt/user), action (create/update/delete/login), user (autocomplete), date range (default 7 days).
- **Settings:** build info read từ `/api/ready` V1 + form đổi password.

## 3.8 Matrix reuse vs new code

| Component | Reuse V2? | Ghi chú |
|---|---|---|
| `DataTable` | 100% | Dùng cho list BOM + users + audit |
| `ItemPicker` | 100% | Dùng cho form BOM new (chọn product item + child item) |
| `ImportWizard` | 100% | Dùng cho `/bom/import` 4-step |
| `ColumnMapper` | 100% | Dùng trong ImportWizard |
| `StatusBadge` | 100% | DRAFT/RELEASED badge BOM revision |
| `Dialog` + `AlertDialog` | 100% | Confirm delete, reset password |
| `BarcodeScanner` | 100% | `/pwa/receive` |
| `BomTreeEditor` | NEW | ~400 dòng, @dnd-kit-based |
| `BomLineRow` | NEW | ~100 dòng |
| `UserForm` | NEW | ~150 dòng |
| `AuditLogTable` | NEW (clone DataTable) | ~80 dòng |

Reuse rate: ~70% component. New code: ~1800 dòng TypeScript + ~400 dòng SQL + ~300 dòng test.

---

# §4 Cái NÊN defer V1.2+ (out of scope V1.1-alpha)

Rõ ràng để tránh scope creep (brutal honesty — đã thấy user có tendency mở rộng):

| Feature | Defer to | Lý do defer V1.1-alpha |
|---|---|---|
| BOM Revision RELEASE / OBSOLETE state machine | V1.1-full | Cần PO sign-off P2+P7 (ai release, manager override). V1.1-alpha user sửa trực tiếp DRAFT OK. |
| BOM Snapshot per-order immutable | V1.1-full | Cần Order module — chưa có. |
| Order (Sales Order) module | V1.1-full | Không trong 5 feedback user. Defer nguyên. |
| Recursive CTE BOM Explode worker | V1.1-full | Phụ thuộc Snapshot. Defer. |
| Shortage Board aggregate | V1.1-full | Phụ thuộc Snapshot + Explode. Defer. |
| 10-state machine snapshot line | V1.1-full | Phụ thuộc Snapshot. Defer. |
| Reservation FIFO/FEFO | V1.2 | Cần PO sign-off P5. YAGNI V1.1-alpha. |
| Work Order + Assembly | V1.3 | Chưa production module. |
| ECO Lite (request/approve) | V1.1-full | Phụ thuộc BOM release. Defer. |
| ECO recall/apply | V1.3 | Phức tạp, ISO 9001 compliance. |
| Procurement (PR/PO/ETA) real | V1.2 | Chỉ stub UI link `/orders` V1.1-alpha. |
| Where-used query | V1.1-full | Nhu cầu thấp V1.1-alpha. |
| Substitute groups | V1.2 | Song Châu có substitute thực tế? Unknown — flag PO. |
| Phantom component | V1.2 | Unknown use case Song Châu. |
| BOM virtualize (> 500 node) | V1.2 | Hiện BOM Song Châu < 200. Monitor. |
| BOM cycle DB trigger | V1.2 | V1.1-alpha validate UI + service. DB trigger là belt-and-suspenders. |
| BOM undo/redo | V1.1-full | Nice UX, không blocking. |
| BOM concurrent edit optimistic lock | V1.2 | V1.1-alpha 1 DE duy nhất, collision hiếm. |
| RBAC ma trận 12×12 full | V1.4 | Hiện 4 role × 6 module đủ. |
| RLS Postgres | V1.4 | Single-tenant Song Châu, chưa cần. |

---

# §5 Timeline V1.1-alpha

## 5.1 Option 1 dev (8 ngày)

| Ngày | Phase | Deliverable | Test gate |
|---|---|---|---|
| D1 | Schema + migration 0003a/b/c/d + Drizzle TypeScript regenerate | Migration chạy clean VPS staging | `psql -f 0003*.sql` pass + rollback test |
| D2 | BOM list + new (repos + API templates + screen `/bom` + `/bom/new`) | Tạo 1 template qua UI | E2E: submit form → row xuất hiện list |
| D3 | BOM detail tree editor phần 1 (tree render + add component) | Add 3 component vào BOM | UI: click add → POST → refresh tree |
| D4 | BOM tree editor phần 2 (edit inline + delete + drag reorder) | Edit qty, delete, move component | Autosave 2s debounce work |
| D5 | Admin panel phần 1 (layout + users list + users new/edit) | Tạo user mới, assign 2 role | Login user mới → role đúng |
| D6 | Admin panel phần 2 (audit + settings đổi pw) + Dashboard KPI real | 4 KPI có số thật, click navigate OK | Login admin → đổi pw mới OK |
| D7 | Receiving functional (schema receipt_event + `POST /api/receiving/events` + Option B BOM-as-PO) | Scan 3 mã → Dexie replay → DB insert | Audit log có 3 row "receipt create" |
| D8 | BOM Excel import (nếu Option Y) + UAT end-to-end + deploy VPS | Import file mẫu 3 BOM, commit OK | Full scenario §7 pass |

**Buffer:** +1 ngày bug fix post-UAT.

## 5.2 Option 2 dev song song (5 ngày)

Split:
- **Dev A (backend-heavy):** D1 schema + D2 API BOM + D3 API admin + D4 API receiving/dashboard + D5 UAT backend
- **Dev B (frontend-heavy):** D1 fetch Drizzle types + D2 screens `/bom` + `/bom/new` + D3 tree editor + D4 admin screens + D5 dashboard + receiving FE + UAT FE

**Sync point:** cuối D2 (API BOM done, FE bắt đầu detail tree), cuối D4 (UAT prep).

## 5.3 Infra & deploy

- **VPS giữ nguyên** 123.30.48.215 (Ubuntu 24.04, 2 vCPU/2GB/40GB). Không cần provision mới.
- **Build local** (CLAUDE.md nguyên tắc 3): pnpm install + pnpm build pass Windows trước khi push VPS.
- **Deploy:** git pull VPS + pnpm install + pnpm build + pm2 restart (~15 phút một vòng). Migration chạy trước qua `psql -U iot_app`.
- **Zero downtime** không cần V1.1-alpha (< 10 user online). Đưa flag maintenance mode trong Caddy 5 phút OK.

## 5.4 Pre-check trước cook (Day 0)

- [ ] User sign-off 5 câu hỏi §2.2 (B1-B5). Nếu chỉ 1 câu chưa chốt → dùng default.
- [ ] User chọn Option X hay Y cho Excel import BOM (§2.3).
- [ ] User chọn Option A hay B cho PO stub (§3.6).
- [ ] User chọn 1 dev (8 ngày) hay 2 dev (5 ngày).
- [ ] Git branch `v1.1-alpha/feedback-fix` từ `redesign/direction-b-v2`.
- [ ] Smoke test V2 production vẫn OK sau khi merge branch (regression check).

---

# §6 10 PO quick-decision questions (reduced → 5)

Đơn giản hóa từ 10 PO sign-off gốc (blocking full V1.1) → 5 câu blocking V1.1-alpha. 5 câu còn lại **defer** cho V1.1-full + dùng default.

### Q1 — Cấp BOM tối đa user cần V1.1-alpha?
- **Options:** (a) 2 cấp · (b) 3 cấp · (c) 5 cấp · (d) không limit
- **Default nếu bỏ qua:** **3 cấp** (top → sub → raw).
- **Impact:** Tree editor UI nhắc limit. Schema không enforce (để tương lai expand).

### Q2 — Excel import BOM: gửi file mẫu hay dùng template giả định?
- **Options:** (X) gửi file trong 2 ngày, pause 1.5 · (Y) dùng template giả định 10 cột, sửa sau
- **Default nếu bỏ qua:** **Y** — không delay timeline.
- **Impact:** Xem §2.3.

### Q3 — Admin password đổi ngay lập tức hay cho phép continue `admin/ChangeMe!234`?
- **Options:** (a) buộc đổi lần login đầu (force flow) · (b) cho phép tiếp tục, đổi khi muốn
- **Default:** **(b)** — user đang quen `admin/ChangeMe!234`. Flow force-change defer V1.2 (cần thêm cột `must_change_password` và middleware).
- **Impact:** 1.2 scope simpler.

### Q4 — Receiving PO data source: hardcode 3 scenario (A) hay reuse BOM (B)?
- **Options:** A / B
- **Default:** **B nếu 1.4 xong trước, A nếu cook song song**.
- **Impact:** 1.1 Option A hay B (§3.6).

### Q5 — Default scrap % khi add component mới?
- **Options:** (a) 0% · (b) 2% · (c) 5%
- **Default:** **0%** — user tự điền.
- **Impact:** Form `/bom/[id]` prefill.

**Defer cho V1.1-full (đã có default an toàn):** scrap formula compound (sum), release permission (design_engineer + admin + manager), order code format (SO-YYMM-####), over-delivery handling, ECO recall logging, dashboard scope, UAT fixture BOM.

---

# §7 Checklist acceptance V1.1-alpha merge

Merge vào `main` chỉ khi 13 checkbox sau PASS:

- [ ] **AC-1** User click KPI "BOM template" trong Dashboard → mở `/bom` list (không 404).
- [ ] **AC-2** User click "+ Tạo BOM" → mở form `/bom/new` → fill code `BOM-CNC-001` + pick product item + name → submit → redirect `/bom/<newId>` có R01 DRAFT auto-tạo.
- [ ] **AC-3** User vào `/bom/<id>` → tree editor render empty state → click "Thêm linh kiện" → dialog mở pick item + qty → save → row xuất hiện tree (level 0).
- [ ] **AC-4** User add 10 component với 3 cấp (top → 3 sub → 6 raw) → inline edit qty_per của 1 row → blur → PATCH API trả 200 → value persisted sau reload.
- [ ] **AC-5** User delete 1 component → confirm dialog → DELETE API → row biến mất.
- [ ] **AC-6** (Option Y) User click "Nhập Excel BOM" → upload file mẫu 3 BOM → 4-step wizard → preview 20 rows → commit → báo cáo `{ templates: 3, lines: 75 }` → link tới 1 template vừa tạo.
- [ ] **AC-7** User login admin → click "Quản trị" sidebar → mở `/admin` index thấy 3 tile (user/role/audit 24h count).
- [ ] **AC-8** Tạo user mới `planner1` / password / role `planner` → logout admin → login `planner1` → sidebar không thấy "Quản trị" (role-guard work).
- [ ] **AC-9** Admin vào `/admin/audit` → thấy ≥ 20 dòng (login + create BOM + add component + import Excel).
- [ ] **AC-10** Admin vào `/admin/settings` → đổi password `ChangeMe!234` → `NewStrongPw#456` → logout → login lại với password mới OK.
- [ ] **AC-11** Scan `/pwa/receive/demo` → scanner camera hoặc USB wedge quét 3 mã → dialog mở → confirm qty + lot + QC pass → toast "Đã đồng bộ" (online) → refresh page → `/admin/audit` thấy 3 row `receipt create`.
- [ ] **AC-12** Offline mode: tắt wifi → scan 2 mã → toast "Đã ghi hàng đợi" → bật lại wifi → auto replay → DB insert success (kiểm qua `SELECT * FROM receipt_event ORDER BY created_at DESC LIMIT 5`).
- [ ] **AC-13** Dashboard `/` empty-state BOM list có 2 CTA rõ: "Tạo BOM native" + "Import Excel". Click mỗi CTA → đúng route.

**Smoke test regression V1 + V2:**
- [ ] Login admin vẫn OK trên `https://mes.songchau.vn`
- [ ] `/items` list render + tạo item + import Excel item vẫn OK
- [ ] `/suppliers` list + detail vẫn OK
- [ ] Build local `pnpm build` pass Windows
- [ ] Build VPS deploy thành công, uptime > 10 phút

---

# §8 Risk register V1.1-alpha

| # | Risk | Xác suất | Tác động | Mitigation |
|---|---|---|---|---|
| **R1** | User không gửi file Excel BOM mẫu → Option Y template giả định không match Song Châu thực tế | Trung bình | Trung bình | Cook parser generic, config column mapping qua JSON config. Sau UAT có file thật → sửa config 30 phút, không redo parser. |
| **R2** | Tree editor `@dnd-kit` có edge case drop root-level khó handle | Trung bình | Thấp | Cook flat list đơn giản trước (no drag), chỉ add/edit/delete. Drag defer V1.1-full. Nếu user OK không cần drag V1.1-alpha → skip, tiết kiệm 4-6h. |
| **R3** | Migration 0003 collision với schema V1 đã apply VPS | Thấp | Cao | Pre-check VPS `\dt app.*` xem có table bom_* chưa. Migration có `IF NOT EXISTS`. Test rollback trên staging (VPS vẫn production OK). |
| **R4** | Admin panel UI CRUD bug → tạo user lỗi → lock out | Thấp | Cao | Giữ seed `admin/ChangeMe!234` trong migration 0003d **KHÔNG xóa/đổi**. Password change là opt-in, không force. Có fallback SSH + psql reset. |
| **R5** | Dashboard KPI real data query slow (nếu item > 10k) | Thấp | Thấp | V1 hiện ~50 item test. Query count 4 table indexed, < 50ms. Monitor sau UAT. |
| **R6** | Receiving event batch POST body quá lớn (offline 24h tích tụ 500 events) | Thấp | Thấp | Batch size limit 50 events/request, chunk client-side. Reuse pattern import batch V1. |
| **R7** | User feedback mở rộng sau V1.1-alpha UAT ("muốn thêm Order module") → scope creep kéo dài | Cao | Trung bình | **Brutal honesty ngay khi UAT:** "V1.1-alpha không có Order, đó là V1.1-full 15 ngày riêng". Freeze scope V1.1-alpha khi merge. |
| **R8** | BOM cycle detection miss edge case (self-loop indirect qua 3 cấp) | Thấp | Trung bình | DFS visited set trong service layer trước POST component. Test case unit: A→B→C→A block. Integration test: import Excel có cycle → preview báo lỗi. |
| **R9** | V2 design drift: cook screens mới không match V2 visual (typography/spacing) | Trung bình | Thấp | Reuse 100% primitives V2 (`Button`, `Input`, `Dialog`). Review mỗi screen mới vs design-spec `260417-design-spec.md` trước commit. |

---

# §9 Next action

## 9.1 Cho user (blocking, trước cook)

1. **Confirm 5 câu §6 Q1-Q5** (hoặc reply "dùng default hết" OK).
2. **Chốt Option X/Y Excel sample** (§2.3) — nếu Y, gửi file khi có (không block cook).
3. **Confirm scope §3** — cắt gì thêm, thêm gì? (Ví dụ: bỏ Excel import BOM hoàn toàn, defer V1.2 → tiết kiệm 12-16h.)
4. **Chọn 1 dev hay 2 dev** (§5.1 vs §5.2).
5. **Git branch strategy:** confirm `v1.1-alpha/feedback-fix` branch từ `redesign/direction-b-v2` OK.

## 9.2 Cho planner agent (sau sign-off §9.1)

Spawn `/plan` với:
- Input: file này (`260418-user-feedback-brainstorm.md`) + `v1.1-bom-order-plan.md` §2.1 + §3 (trim xuống alpha scope).
- Output: `plans/v1.1-alpha/260418-v1.1-alpha-implementation-plan.md` (~300-500 dòng, gọn).
- Chi tiết: day-by-day tasks, file-by-file checklist, migration SQL template, API Zod schemas, test cases Playwright.

## 9.3 Cho cook agent (sau planner xong)

Tuần tự theo timeline §5.1 (1 dev) hoặc §5.2 (2 dev):

**Ngày 1:** Migration 0003 + Drizzle types sync + seed roles
**Ngày 2-4:** BOM module (list → tree → import)
**Ngày 5-6:** Admin panel + Dashboard real KPI
**Ngày 7:** Receiving functional
**Ngày 8:** UAT + deploy + smoke

**Quy ước mỗi task cook:**
- Build local `pnpm build` pass → commit → push branch
- Playwright smoke test 1 flow per task
- PR review checkpoint sau mỗi 2 ngày (prevent debt tích lũy)

## 9.4 Cho UI/UX designer (optional)

Nếu user muốn screen spec chi tiết cho `BomTreeEditor` + `/admin/users/*` trước cook:
- Spawn `ui-ux-designer` → output `plans/v1.1-alpha/260418-v1.1-alpha-design-spec.md` (~800-1200 dòng).
- Estimate: 1 ngày designer + review.

## 9.5 Out-of-scope reminder

**KHÔNG cook trong V1.1-alpha:**
- Order module
- Snapshot immutable
- Shortage board
- BOM release/obsolete state machine
- ECO
- Reservation
- WO/Assembly
- Production planning
- Procurement (PR/PO real)
- RLS Postgres

Những cái trên thuộc V1.1-full / V1.2 / V1.3 / V1.4 theo `plans/redesign/260417-v1-expansion-plan.md`. Brainstorm này KHÔNG mở lại.

---

# §10 Tham chiếu chéo

- [`CLAUDE.md`](../../CLAUDE.md) — Nguyên tắc + trạng thái VPS
- [`PROGRESS.md`](../../PROGRESS.md) — Milestone V1 + V2
- [`plans/v1-expansion/260417-v1.1-bom-order-plan.md`](../v1-expansion/260417-v1.1-bom-order-plan.md) — Full V1.1 plan 15 ngày (V1.1-alpha là trim subset)
- [`plans/v1-expansion/260417-v1.1-brainstorm-deep.md`](../v1-expansion/260417-v1.1-brainstorm-deep.md) — 50 execution decision V1.1 (áp dụng khi cook V1.1-full)
- [`plans/v1-expansion/260417-v1.1-design-spec.md`](../v1-expansion/260417-v1.1-design-spec.md) — 10 screen spec V1.1 (V1.1-alpha dùng subset 4-5 screen)
- [`plans/redesign/260417-v1-expansion-plan.md`](../redesign/260417-v1-expansion-plan.md) §3 — V1.1 scope nguồn
- [`plans/redesign/260417-gap-analysis-vs-research.md`](../redesign/260417-gap-analysis-vs-research.md) — Gap vs research reports
- [`packages/db/src/schema/bom.ts`](../../packages/db/src/schema/bom.ts) — Schema Drizzle BOM đã declaim (chưa migration)
- [`apps/web/src/lib/nav-items.ts`](../../apps/web/src/lib/nav-items.ts) — Nav đã khai báo `/admin` (chưa có route)
- [`apps/web/src/components/receiving/ReceivingConsole.tsx`](../../apps/web/src/components/receiving/ReceivingConsole.tsx) — Block dòng 123-146 cần thay fetch thật

---

# §11 Kết

V1.1-alpha **KHÔNG phải** mini V1.1. Đó là **bridge** giữa "V2 visual OK nhưng chức năng rỗng" và "V1.1 full 15 ngày cần 10 PO sign-off".

**5 user feedback → 5-8 ngày cook** nếu chọn default §6 + Option Y + Option B. Lợi ích: user thấy chức năng chạy → confident đầu tư tiếp V1.1-full → sign-off 10 PO đàng hoàng.

**Brutal honesty final:** nếu user muốn "cả 5 + cả Order + cả Snapshot" ngay trong 1 sprint thì **refuse**. Đó là V1.1-full 15 ngày, không phải alpha. Stay disciplined hoặc V1.1-alpha sẽ nở thành 3 tuần rồi fail như V1.1 gốc đang kẹt sign-off.

**File này = checklist.** User ký §9.1 → planner spawn → cook. Không ký → không cook. Brainstorm xong.
