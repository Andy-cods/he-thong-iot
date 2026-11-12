# BOM V5 — Thiết kế (kiến trúc)

Ngày: 2026-11-11. Chỉ thiết kế, chưa sửa code. Mục "chưa xác minh" = agent làm gói phải đọc lại trước khi code.

## 1. Hiện trạng (file chính)

- **A. Lưới BOM**: `apps/web/src/components/bom-grid-pro/BomGridPro.tsx` (1503 dòng, 13 cột: #, Ảnh, Mã, Tên, Loại, Vật liệu, NCC, SL/bộ, Kích thước…; cột Ảnh ~:667 là placeholder). Đã có `useVirtualizer` nhưng chỉ bật khi >80 dòng (:466). Chi tiết dòng: `BomLineSheet.tsx` (1418 dòng). Trang: `app/(app)/bom/[id]/grid/page.tsx`. Category hiện nằm ở `bom_line.metadata.category` (jsonb), kích thước ở `metadata.size`, PIC ở `assigned_to_user_id` + `assigned_to_name`.
- **B. Import**: web `server/services/bomImportParser.ts` (header mapping `autoMapHeaders`, :488 category alias) → `api/bom/imports/upload/route.ts` (parse, lưu `import_batch.previewJson`, dedup theo fileHash 60 phút) → `commit/route.ts` đẩy BullMQ → worker `apps/worker/src/jobs/bomImport.ts` (689 dòng, mỗi dòng 1 savepoint, khớp/tạo item, `lookupOrCreateSupplier`, ghi `bom_line`). Chưa đọc ảnh nhúng. `item.image_url` có cột (`master.ts:81`) nhưng 0/1324 có ảnh. `item.dimensions` jsonb và `item.material_code` đều NULL toàn bộ.
- **C. NCC**: worker ghi `metadata.supplierId` (top-level, ~:639) và `bom_line.supplier_item_code` = TÊN NCC. `BomLineSheet.tsx:172-218` đọc `metadata.sourcing.supplierId` và dùng `supplier_item_code` làm cả `supplierCode` lẫn `supplierPartNumber` → lệch. `PATCH api/bom/templates/[id]/lines/[lid]/route.ts` chỉ nhận `supplierItemCode` + `metadata`, không có khoá phiên bản. `app.supplier` (`master.ts:148`) có code uk, name.
- **D. Tiến độ**: không có khái niệm "bước". `bom_line.received_qty/expected_eta/status_note` nhập tay (V3.7.19). Có `server/services/derivedStatus.ts` (`computeTemplateDerivedStatus`, tổng hợp tồn kho + bom_snapshot_line + reservation theo item; KHÔNG theo từng bom_line). Sổ mẫu: `lib/pr-ledger.ts` (858 dòng, hàm thuần `buildPrLedger`, test được). `work_order.bom_line_id` (`production.ts:92`) tồn tại.
- **E. Phiếu giao**: `delivery-note.ts` (BBGH) gắn 1-1 `warehouse_issue_request`, `recipient_name` text, số `delivery_note_no_uk`. Giữ nguyên.
- **F. Realtime**: `useBom.ts:439,514,563,617` poll 60s. SSE có sẵn: `api/notifications/stream/route.ts` + `server/services/notify-stream.ts` (1 Redis subscriber/process, registry controller, tối đa 5 stream/người) + `notify-pubsub.ts` (`NOTIFY_CHANNEL = ${BULLMQ_PREFIX}notify:events`, payload chỉ `{kind,userIds,...}` — gửi theo userIds, KHÔNG phù hợp phát cho "mọi người đang xem BOM X").
- **G. UI cũ**: tab legacyAssembly, ECO/shortage trong `BomGridPro/BomLineSheet/ProgressCell/CategoryBadge/*QuickDialog`; ActionsCell 6 nút/dòng.
- **Lưu file**: `server/services/attachments.ts` — `saveFinanceAttachment`, thư mục `env.UPLOAD_DIR/finance`, tên `uuid.ext`, MIME+size 10MB, `resolveAttachmentPath` chặn path traversal, phục vụ qua `api/finance/attachments/[filename]/route.ts` (có requireCan). Không có bảng attachment tổng quát. Cần xác minh `UPLOAD_DIR` có mount volume bền trên prod và qua deploy (bẫy compose override VPS — xem memory).

## 2. Thiết kế

### 2.1 Schema (migration tay, idempotent; đánh số tiếp từ 0083)

**0083_bom_v5_core.sql**
```sql
-- C: NCC thống nhất + khoá phiên bản + cột chuẩn hoá
ALTER TABLE app.bom_line
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES app.supplier(id),
  ADD COLUMN IF NOT EXISTS supplier_pending text,          -- "Tân Tiến/Phạm Gia" -> cần chốt 1 NCC
  ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS category text,                  -- GTAM|OUTSOURCED|COMMERCIAL (mã), thay metadata.category
  ADD COLUMN IF NOT EXISTS process_method text,            -- PHAY/TIỆN/CHẤN GẤP
  ADD COLUMN IF NOT EXISTS surface_treatment text,
  ADD COLUMN IF NOT EXISTS blank_spec text,                -- Quy cách phôi / Mã đặt hàng
  ADD COLUMN IF NOT EXISTS material_code text,
  ADD COLUMN IF NOT EXISTS file3d_name text,               -- tên file 3D gốc
  ADD COLUMN IF NOT EXISTS image_asset_id uuid,            -- FK mềm tới bom_asset
  ADD COLUMN IF NOT EXISTS coef numeric(10,4),             -- cột "Hệ số"
  ADD COLUMN IF NOT EXISTS pic_names text[];               -- "Hòa/Đức" -> {Hòa,Đức}; assigned_to_user_id giữ cho 1 người
CREATE INDEX IF NOT EXISTS bom_line_supplier_idx ON app.bom_line(supplier_id);

-- C: lịch sử đổi NCC (và trường khác sau này)
CREATE TABLE IF NOT EXISTS app.bom_line_change (
  id bigserial PRIMARY KEY,
  line_id uuid NOT NULL REFERENCES app.bom_line(id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  field text NOT NULL,                 -- 'supplier' | 'qty' | ...
  old_value jsonb, new_value jsonb,
  actor_id uuid, at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bom_line_change_line_idx ON app.bom_line_change(line_id, at DESC);

-- B: kho ảnh
CREATE TABLE IF NOT EXISTS app.bom_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256 char(64) NOT NULL UNIQUE,     -- dedup: cùng ảnh -> 1 file
  mime text NOT NULL, width int, height int,
  path_full text NOT NULL, path_thumb text NOT NULL,   -- tương đối dưới UPLOAD_DIR/bom
  created_at timestamptz NOT NULL DEFAULT now()
);
```
Data migration (trong cùng file hoặc `0084_bom_supplier_backfill.sql` tách riêng để chạy/rollback riêng): với mỗi bom_line có `metadata->>'supplierId'` hoặc `metadata#>>'{sourcing,supplierId}'` → set `supplier_id`; nếu chỉ có `supplier_item_code` → match `lower(trim(supplier.name))` hoặc `code`, không match → để NULL và giữ text vào `supplier_pending`. `metadata.category` → `category` (map "GTAM gia công"/"Gia công đặt ngoài"/"Thương mại"; mặc định giữ NULL, UI fallback "Thương mại" như hiện tại). KHÔNG xoá cột `supplier_item_code` (dùng lại đúng nghĩa = part number NCC, để code cũ không vỡ); KHÔNG xoá metadata cũ — chỉ ngừng ĐỌC ở code mới (đọc cũ làm fallback 1 phiên bản).

**0085_bom_stage_ledger.sql**
```sql
CREATE TABLE IF NOT EXISTS app.bom_stage_move (       -- append-only
  id bigserial PRIMARY KEY,
  line_id uuid NOT NULL REFERENCES app.bom_line(id),
  from_stage text,                  -- NULL = nạp vào bước đầu (nguồn bên ngoài)
  to_stage text NOT NULL,
  qty numeric(18,4) NOT NULL CHECK (qty > 0),
  doc_type text NOT NULL,           -- MANUAL|PR|PO|RECEIVING|WO|ISSUE|DELIVERY_SLIP
  doc_id text,                      -- text: uuid hoặc số chứng từ
  note text,
  actor_id uuid, at timestamptz NOT NULL DEFAULT now(),
  reverses_id bigint REFERENCES app.bom_stage_move(id),  -- sửa sai = bút toán đảo, không UPDATE/DELETE
  UNIQUE (doc_type, doc_id, line_id, from_stage, to_stage)  -- idempotent cho auto-post
);
CREATE INDEX IF NOT EXISTS bom_stage_move_line_idx ON app.bom_stage_move(line_id);
```
Trigger `BEFORE UPDATE OR DELETE` raise exception (append-only thật).

**0086_delivery_slip.sql** (bảng MỚI, không đụng `delivery_note`)
```sql
CREATE TABLE IF NOT EXISTS app.delivery_slip (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_no varchar(32) NOT NULL UNIQUE,         -- GT-PG260311-001
  kind text NOT NULL CHECK (kind IN ('SURFACE','ASSEMBLY')),
  template_id uuid NOT NULL REFERENCES app.bom_template(id),
  project_code text,                           -- "Mã quản lý"
  supplier_id uuid REFERENCES app.supplier(id),-- bắt buộc khi SURFACE (CHECK)
  recipient_text text,                         -- ASSEMBLY: tên bộ phận
  status text NOT NULL DEFAULT 'SENT',         -- SENT|PARTIAL_RECEIVED|RECEIVED|CANCELLED
  batch_no int NOT NULL DEFAULT 1,
  notes text, created_by uuid, created_at timestamptz DEFAULT now(),
  CHECK (kind <> 'SURFACE' OR supplier_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS app.delivery_slip_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_id uuid NOT NULL REFERENCES app.delivery_slip(id) ON DELETE CASCADE,
  line_id uuid NOT NULL REFERENCES app.bom_line(id),
  stt int NOT NULL, from_stage text NOT NULL, to_stage text NOT NULL,
  qty_doc numeric(18,4) NOT NULL CHECK (qty_doc > 0),
  qty_received numeric(18,4) NOT NULL DEFAULT 0,
  unit_price numeric(18,2),                    -- chỉ SURFACE
  note text,                                   -- snapshot "Đợt n · còn x"
  snap jsonb NOT NULL                          -- snapshot tên/quy cách/xử lý bề mặt/mã BLx tại lúc lập
);
CREATE TABLE IF NOT EXISTS app.delivery_slip_seq (day date PRIMARY KEY, last int NOT NULL);
```
Số phiếu: `INSERT ... ON CONFLICT (day) DO UPDATE SET last = last+1 RETURNING last` trong transaction tạo phiếu → `GT-PG${yymmdd}-${pad3(last)}` (user ghi "0{seq}" — chốt định dạng pad ở mục 4). Múi giờ Asia/Ho_Chi_Minh.

### 2.2 Lưu ảnh
Dùng lại pattern `attachments.ts`: thêm `saveBomAsset(buffer)` trong `server/services/bomAssets.ts` (dùng chung cho web; worker import code từ `packages/shared` hoặc copy hàm nhỏ — kiểm tra worker có `sharp` chưa, nếu chưa thêm `sharp` vào worker, build CI ok). Quy trình: sha256 → nếu đã có `bom_asset` thì tái dùng; không thì ghi `UPLOAD_DIR/bom/full/{sha}.png` và thumbnail 96px webp `UPLOAD_DIR/bom/thumb/{sha}.webp` (sharp, ~3-6KB). Phục vụ: `GET /api/bom/assets/[id]?size=thumb|full` (requireCan read bomTemplate, `Cache-Control: private, max-age=31536000, immutable` vì địa chỉ theo nội dung). `item.image_url` ghi `/api/bom/assets/{id}?size=full` (chuỗi tương đối — chính là chỗ các màn khác đã đọc). Lưới dùng `<img loading="lazy" decoding="async" width=40 height=40>` thumb.
Dung lượng: 32 ảnh/BOM × ~100KB gốc là nhỏ; dedup theo sha.

### 2.3 Đọc Excel mẫu mới + thuật toán khớp
- **Nhận dạng mẫu**: trong parser, nếu sheet có header dòng 4 chứa "ID" + "Ảnh 3D" + "Tên chi tiết" → `template="TRIEN_KHAI"`; ngược lại đi nhánh cũ NGUYÊN VẸN (không sửa `autoMapHeaders` đường cũ; thêm nhánh mới trước đó). Test vitest chạy lại fixture "Bản chính thức" để chứng minh không đổi.
- **Parse**: header ở dòng 4, bỏ dòng có STT rỗng hoặc ô A/B = "TỔNG". Tiêu đề dòng 1 → trích mã dự án (`Z0000002590422`) và tên sản phẩm; dòng 2 → "Số bộ" (số).
- **Ảnh** (exceljs `ws.getImages()` + `workbook.model.media`): với mỗi ảnh lấy `range.tl/br` (hoặc `ext` nếu OneCellAnchor). Tính hàng gán = `floor(trung điểm)` theo toạ độ `(tl.row + br.row)/2` có tính nativeRowOff — cụ thể `rowCenter = (tl.nativeRow + tl.nativeRowOff/rowHeightEmu + br.nativeRow + br.nativeRowOff/rowHeightEmu)/2`; gán vào dòng dữ liệu có `rowNumber-1 <= rowCenter < rowNumber` (0-based) tức hàng chứa phần lớn diện tích. Không dùng `from.row`. Nếu 2 ảnh vào 1 dòng → lấy ảnh có diện tích giao lớn hơn, ảnh còn lại ghi cảnh báo. Dòng nào không có ảnh → cảnh báo nhẹ, không lỗi. Kiểm thử bằng chính file mẫu (32 ảnh ↔ 32 dòng, assert từng cặp ảnh–tên một lần bằng mắt rồi chốt snapshot sha256).
- **Chuẩn hoá** `normName(s) = s.trim().replace(/^\(bổ sung\)\s*/i,'').replace(/_\d+$/,'').trim().toLowerCase()` (đặt ở `packages/shared/src/bom/normName.ts`, dùng chung web/worker). Chú ý: bỏ `_\d+$` có thể cắt mất hậu tố mã thật (vd `AB_2024`) → chốt trong cảnh báo preview: hiển thị cả tên gốc.
- **Khớp** (hàm thuần `matchBomRows(rows, itemIndex): MatchResult[]` trong `apps/web/src/server/services/bomMatch.ts`, test thuần): nạp 1 lần tất cả item (1324 dòng, nhỏ) vào Map `lower(sku)->item[]`, không truy vấn từng dòng.
  - Thương mại: ứng viên = item có `lower(sku) == normName(name3D)` ∪ `lower(sku) == lower(blank_spec)`. 0 → NEW; 1 → MATCH; ≥2 item khác nhau → CONFIRM(reason=AMBIGUOUS).
  - Gia công (GTAM/đặt ngoài): ứng viên theo sku = normName. 0 → NEW. Với mỗi ứng viên so material: `item.material_code` nếu có, else `name+description` chứa `mã vật liệu` (so không dấu, bỏ khoảng trắng); và quy cách: `item.dimensions` nếu có, else bỏ qua so sánh quy cách (ghi "không đủ dữ liệu so quy cách"). Cả hai khớp → MATCH; lệch bất kỳ → CONFIRM(reason=MATERIAL_MISMATCH|DIM_MISMATCH). Khi item cũ không có dimension, MATCH chỉ dựa material trong tên: dễ khớp nhầm → đánh dấu `confidence=LOW` và ưu tiên CONFIRM nếu không tìm thấy mã vật liệu trong text (YAGNI: không fuzzy).
  - Cảnh báo "đổi sang": regex `/đổi sang|thay bằng|đổi thành/i` trên `item.name+description` → `warnings:['ITEM_REPLACED_NOTE']`, hiển thị icon trên dòng preview, không chặn.
  - NEW: sẽ tạo item `sku=normName` (nhưng giữ CHỮ HOA/THƯỜNG gốc của tên đã chuẩn hoá, chỉ so sánh mới lower), `name` = tên gốc, `material_code`, `dimensions {l,w,h}` parse từ "D×R×C", `image_url`. Va chạm sku `item_sku_uk` (so lower): kiểm tra trước, nếu trùng khác case thì coi là ứng viên (không tạo mới).
- **Luồng 2 bước** (đã có sẵn khung preview→commit): `upload` trả `previewJson` có thêm `matches[]` + `images[]` (id tạm — lưu ảnh vào `bom_asset` ngay lúc upload để preview hiển thị thumb; asset mồ côi vô hại, dọn bằng job sau 7 ngày nếu không được tham chiếu). Màn preview mới `BomImportMatchStep.tsx` gắn vào `BomImportWizard.tsx` chỉ khi `template==TRIEN_KHAI`: 3 tab Khớp / Cần xác nhận / Tạo mới; mỗi dòng "cần xác nhận" có radio chọn item ứng viên hoặc "Tạo mới"; nút Commit bị khoá đến khi hết dòng chưa chọn. Lựa chọn gửi trong body commit (`decisions: {rowKey: {action:'USE'|'CREATE', itemId?}}`; mở rộng `bomImportCommitSchema` ở `packages/shared`, trường optional để luồng cũ không đổi).
- **Worker**: thêm nhánh `commitTrienKhai` trong `bomImport.ts` (file đã 689 dòng → tách thành `bomImportTrienKhai.ts`, chỉ gọi từ nhánh mới). Ghi: `bom_line` các cột mới, `supplier_id` (khớp tên NCC với `app.supplier` không phân biệt hoa/thường; "A/B" hoặc "A, B" → `supplier_pending`, `supplier_id` NULL, dòng hiện chip "Cần chốt 1 NCC"); không còn tạo NCC tự động từ text khi nhiều nhà; với 1 nhà không có trong danh mục → tạo mới (giữ hành vi `lookupOrCreateSupplier`) nhưng ghi vào danh sách "NCC mới tạo" trong kết quả để người dùng thấy. PIC "Hòa/Đức" → `pic_names`. `item.image_url` chỉ ghi khi đang NULL (không đè ảnh người dùng đặt tay). Giữ cơ chế xoá theo `importedFromBatch` khi retry.

### 2.4 NCC sửa trực tiếp (C)
- Component `SupplierCell.tsx` (combobox: gõ tìm trong danh mục, mục cuối "+ Tạo NCC mới '…'" mở form tối thiểu code(auto)/name/phone). Dùng `GET /api/suppliers?q=` đã có (xác minh); tạo mới qua `POST /api/suppliers` — vấn đề RBAC: role chỉ-xem-BOM có thể thiếu `create supplier` (matrix.ts:116 chỉ vài role). Đề xuất route mới `POST /api/bom/templates/[id]/lines/[lid]/supplier` nhận `{supplierId} | {newSupplier:{name,phone?}}`, guard `requireCan(read,'bomTemplate')` (đúng yêu cầu "ai xem được thì sửa được"), tạo NCC trong cùng transaction, ghi `bom_line_change` + `writeAudit`, dùng `expectedVersion`. Cho phép role xem tạo NCC thô (code auto `NCC-xxxxx`, flag `needs_review`) — ghi vào quyết định mở #3.
- Đọc NCC ở mọi nơi qua 1 helper `resolveLineSupplier(line)` = `supplier_id` ?? fallback metadata cũ; sửa `BomLineSheet.tsx:172-218` dùng helper và tách `supplierPartNumber` khỏi `supplierCode`.
- Lịch sử: `GET .../lines/[lid]/history` đọc `bom_line_change`; hiển thị trong tab "Lịch sử" của BomLineSheet.

### 2.5 Sổ bước (D)
- **Bước theo category** (hằng số trong `packages/shared/src/bom/stages.ts`): GTAM `[BLANK, MACHINING, SURFACE, QC, ASSEMBLY]`; OUTSOURCED `[ORDER, VENDOR, RECEIVED, QC, ASSEMBLY]`; COMMERCIAL `[PROPOSE, PO, STOCK, QC, ASSEMBLY]`. Hàm thuần `lib/bom-stage-ledger.ts` (kiểu `pr-ledger.ts`, không IO): `buildStageBuckets(line, moves[]) → {stage: qty}`: bucket(s) = Σ vào s − Σ ra s. `canMove(buckets, from, qty)`: `qty ≤ bucket(from)+EPS`; bước đầu được nạp tự do tới `qty_per_parent × số bộ` (không vượt tổng cần, trừ khi cờ cho phép — mục 4#4). Dùng `r4/QTY_EPS` từ pr-ledger (import, không copy).
- **Chuyển bước**: `POST /api/bom/templates/[id]/lines/[lid]/stage-moves` `{from,to,qty,note}` (to phải là bước KẾ TIẾP hoặc bước sau trong danh sách; cấm lùi — lùi = bút toán đảo `reverses_id`). Transaction + `SELECT ... FOR UPDATE` trên bom_line để tuần tự hoá, kiểm tra `canMove` trong tx → chống vượt do 2 người cùng bấm. Có bản bulk `POST .../stage-moves/bulk` cho các dòng tick.
- **Tích hợp nguồn dữ liệu có sẵn thay vì nhập tay** (làm theo cấp độ, KHÔNG làm hết một lượt):
  1. Cấp 1 (WP6): chỉ sổ + nhập tay + phiếu giao tự ghi move. Hiện bucket.
  2. Cấp 2 (WP7): auto-post idempotent bằng `UNIQUE(doc_type,doc_id,...)`: PR duyệt cho dòng → COMMERCIAL `PROPOSE`; PO tạo từ dòng (`purchase-orders/from-bom-line/[lineId]`) → `PO`; nhận hàng (receiving event, `useReceivingEvents`) → `STOCK` (cần xác minh bảng PO line ↔ bom_line: `po_line.bom_line_id`?); WO hoàn tất (`work_order.bom_line_id`) → GTAM `MACHINING`; xuất kho → `ASSEMBLY`. Mỗi nguồn là 1 hàm `postFromX(tx, ...)` gọi trong chính transaction nghiệp vụ đó (sau commit không được, mất tính nguyên tử) — mỗi hook thêm ≤10 dòng vào route hiện có, mỗi cái 1 commit, có feature flag `BOM_STAGE_AUTOPOST`.
  3. `derived-status` hiện theo item, không theo bom_line → KHÔNG dùng làm nguồn bucket (gộp nhiều dòng cùng item sẽ chia sai). Giữ nguyên cho progress bar cũ.
  4. `received_qty` tay cũ: giữ hiển thị song song; không migrate (chỉ ghi khi chưa có move).
- Hiển thị: cột "Tiến độ bước" trong lưới = thanh 5 đoạn (mini stacked) + tooltip số; BomLineSheet có tab "Bước" liệt kê bucket + nút chuyển + lịch sử move.

### 2.6 Phiếu giao hàng (E)
- API: `POST /api/delivery-slips` `{templateId, kind, supplierId?, recipientText?, lines:[{lineId, qty}]}`. Server suy bước theo `slipTransition(category, kind)` trong `stages.ts`: SURFACE (chỉ GTAM) = from `MACHINING` -> to `SURFACE` (bước "Bề mặt·NTP" = hàng đang/đã ở NTP); ASSEMBLY = from `QC` -> to `ASSEMBLY`. Dòng sai category -> 422. Trong tx kiểm `qty <= bucket(from)`, ghi `bom_stage_move` (doc_type=DELIVERY_SLIP, doc_id=slip.id) ngay lúc tạo phiếu. Không thêm bước "đang vận chuyển".
- `POST /api/delivery-slips/[id]/receive` `{lines:[{id,qtyReceived}]}` (cộng dồn, ≤ qty_doc − đã nhận), cập nhật `status`, post move SURFACE->QC cho SURFACE (ASSEMBLY: chỉ ghi số thực nhận, chênh lệch ghi chú, không move lại). Không cần duyệt.
- Ghi chú tự sinh: `Đợt {batch_no} · còn {tổng_cần − luỹ_kế_đã_giao}`; `batch_no` = số phiếu cùng (template, kind) + 1.
- Xuất Excel/PDF theo `FORM GTAM Phieu giao hang.xlsx`: `GET /api/delivery-slips/[id]/export` dùng exceljs nạp file mẫu (copy vào `apps/web/src/templates/` — tránh phụ thuộc file ở thư mục gốc repo) rồi điền ô; xác định toạ độ ô khi làm WP9 (chưa đọc cấu trúc ô của file mẫu). Đơn giá chỉ ghi cột khi `kind=SURFACE`.
- UI: toolbar lưới khi có dòng tick → nút "Tạo phiếu giao" (dialog: loại, NCC/bộ phận, bảng SL, mặc định = bucket hiện có, validate ≤). Trang `/delivery-slips` (list+detail+nhập thực nhận). Entity RBAC mới `deliverySlip` trong `matrix.ts` (create/read/update cho các role xưởng/kho/planner; admin all).
- BBGH cũ: không sửa một dòng nào; menu có hai mục riêng.

### 2.7 Realtime + khoá phiên bản (F)
- **Kênh mới** (không dùng chung payload theo userIds): `bom-events.ts` với channel `${BULLMQ_PREFIX}bom:events`, payload `{templateId, lineIds?:string[], kind:'line'|'stage'|'import'|'slip', v?: number, by: userId}`. Tái dùng subscriber singleton: sửa `notify-stream.ts` để `ensureNotifySubscriber` cũng `subscribe` kênh thứ 2 (đọc file trước; test `notify-stream-registry.test.ts` phải xanh). Registry hiện keyed theo user → thêm "rooms": `GET /api/bom/templates/[id]/events` (SSE riêng, requireCan read bomTemplate) đăng ký controller vào room `templateId`; dùng lại heartbeat/evict logic. Thêm broadcast theo room (map `templateId → Set<controller>`), giới hạn mỗi người 5 stream tổng.
- **Phát sự kiện** sau commit ở mọi route ghi line (PATCH line, supplier, stage-moves, slip create/receive, import done). Hàm `publishBomEvent()` fire-and-forget như `publishNotifyEvent`.
- **Client**: hook `useBomLive(templateId)` mở EventSource, khi nhận event: `queryClient.invalidateQueries` theo key đúng dòng (cần endpoint `GET .../lines?ids=a,b,c` trả các dòng đổi; patch cache bằng `setQueryData`) — không refetch toàn BOM. Giữ poll nhưng nâng lên 5 phút làm lưới an toàn khi SSE rớt (`refetchInterval: 300_000`, bỏ poll khi tab ẩn — mặc định react-query). Debounce gom event 300ms.
- **Khoá phiên bản**: mọi PATCH line nhận `expectedVersion`; SQL `UPDATE bom_line SET ..., row_version=row_version+1 WHERE id=$1 AND row_version=$2 RETURNING *` — 0 dòng → 409 `VERSION_CONFLICT` kèm bản hiện tại. UI: toast "X vừa sửa ô này" + hiện giá trị mới, nút "Ghi đè bằng giá trị của tôi" (gửi lại với version mới). `row_version` tăng cả khi stage-move? KHÔNG (ledger tách bạch); chỉ tăng khi sửa trường dòng. Back-compat: nếu client cũ không gửi `expectedVersion` → vẫn cho ghi (chỉ log) trong 1 phiên bản triển khai rồi mới bắt buộc.
- **Hiệu năng lưới**: bật virtualizer cho MỌI số dòng > 40 (bỏ nhánh `visibleRows.length > 80`), row height cố định (ảnh 40px), `React.memo` hàng theo `row_version`; thumbnail lazy như 2.2.

### 2.8 Dọn UI (G)
Gói riêng, làm SAU khi các gói chức năng ổn (đụng cùng file lưới). Xoá: tab legacyAssembly, ECO/shortage, phím Ctrl+Shift+A, cột Ảnh giả (thay bằng cột ảnh thật thumb), ActionsCell → 1 nút chính (theo category: GTAM "Chuyển bước", Gia công "Đặt hàng", TM "Đề xuất/PO") + menu `⋯`. Grep toàn repo tham chiếu trước khi xoá; không xoá API/route (chỉ UI) để link cũ không 404.

## 3. Gói việc

Ký hiệu: Song song = có thể chạy cùng lúc với gói nêu, không chung file.

**WP0 — Hạ tầng nền (S)**: `packages/shared/src/bom/{normName,stages}.ts` + test; `lib/bom-stage-ledger.ts` hàm thuần + test. Không đụng DB/UI. Xong khi: vitest phủ normName (hậu tố `_\d+`, "(bổ sung) ", hoa/thường), buckets/canMove (vượt, đủ, đảo). Deploy: không ảnh hưởng. Song song với WP1.

**WP1 — Migration 0083+0084+0085+0086 + drizzle schema (M)**: DDL mục 2.1, `packages/db/src/schema/*` cập nhật (bom.ts, bom-sheet.ts mới `bom-asset.ts`, `bom-stage.ts`, `delivery-slip.ts`). Xong khi: chạy 2 lần trên staging không lỗi; `pnpm typecheck` OK; backfill supplier_id đếm trước/sau (số dòng có NCC text vs supplier_id) báo cáo. Rủi ro: ALTER TABLE bom_line khoá ngắn — chạy ngoài giờ. Thứ tự áp: staging → prod TRƯỚC khi deploy code đọc cột mới (code mới phải chịu được cột chưa có? KHÔNG — áp migration trước, deploy sau). Phụ thuộc: không. Làm một mình (đụng schema index).

**WP2 — NCC thống nhất (C) (M)**: helper `resolveLineSupplier`, route supplier + history, `SupplierCell`, sửa `BomLineSheet.tsx:172-218`, PATCH line nhận `expectedVersion` (kể cả 409). Phụ thuộc WP1. Xong khi: vitest route (409 khi version lệch, ghi `bom_line_change`, tạo NCC mới trong tx, role chỉ-xem sửa được); staging: 2 trình duyệt sửa cùng ô → 409. Rủi ro: BomLineSheet 1418 dòng, đụng nhiều → WP2 sở hữu file này cho đến khi xong. Không song song với WP5/WP8/WP10 (cùng BomLineSheet/BomGridPro).

**WP3 — Kho ảnh + parser mẫu mới (A+B phần 1) (M)**: `bomAssets.ts` (+ sharp), route assets, `bomImportParser` nhánh TRIEN_KHAI (header, TỔNG, ảnh theo to.row/tâm), test với file mẫu thật (copy vào `apps/web/src/server/services/__fixtures__/`: assert 32 ảnh gán đúng, dòng TỔNG bị bỏ, "Tân Tiến/Phạm Gia" → pending). Phụ thuộc WP0, WP1. Song song với WP2 (chỉ parser/service). Xong khi: vitest xanh + fixture "Bản chính thức" không đổi; staging upload trả preview có thumb.

**WP4 — Khớp + preview + commit (B) (L → tách 4a/4b)**: 4a `bomMatch.ts` (hàm thuần + test: thương mại theo sku/blank_spec, gia công lệch material/dim, 2 item → CONFIRM, NEW, cảnh báo "đổi sang"). 4b `BomImportMatchStep` + schema commit + `bomImportTrienKhai.ts` worker + ghi `item.image_url`. Phụ thuộc WP3. Xong khi: staging import file mẫu → preview 3 trạng thái, commit tạo 32 dòng + ảnh + item mới, retry job không nhân đôi; import file "Bản chính thức" y như cũ. Feature flag `BOM_IMPORT_V5` (env) để ẩn nhánh mới trên prod đến khi user nghiệm thu. 4a song song với WP2.

**WP5 — Lưới chuẩn 15 cột (A) (M)**: cột mới theo mẫu, ảnh thumb thật, chip "Cần chốt 1 NCC", PIC nhiều người, virtualizer luôn bật >40. Phụ thuộc WP1, WP2 (cùng file), WP3 (ảnh). Xong khi: BOM cũ (cột mới NULL) vẫn hiển thị đúng (fallback), snapshot test component nếu có, đo cuộn 300 dòng trên staging mượt.

**WP6 — Sổ bước cấp 1 (D) (M)**: route stage-moves (+bulk), cột/tab "Bước", nhập tay. Phụ thuộc WP0, WP1, WP5 (cột). Xong khi: vitest route (vượt → 422, đồng thời 2 request → chỉ 1 thành công, đảo), staging thử chuyển bước.

**WP7 — Auto-post từ PR/PO/nhận/WO/xuất (D) (L → mỗi nguồn 1 lượt)**: sau khi user chốt mục 4#2. Phụ thuộc WP6. Mỗi hook có test idempotent (gọi 2 lần → 1 move) + flag `BOM_STAGE_AUTOPOST`. Có thể bỏ nếu thiếu dữ liệu liên kết bom_line ↔ PO line.

**WP8 — Phiếu giao (E) (L → 8a API+ledger, 8b UI, 8c export Excel)**: Phụ thuộc WP6. 8a vitest: SL > bucket → 422, số phiếu tuần tự trong ngày + đồng thời, receive cộng dồn không vượt; 8c so sánh ô với file mẫu. 8b và 8c song song nhau (khác file). Không động `delivery-note.ts`; test hồi quy BBGH cũ chạy xanh.

**WP9 — Realtime (F) (M)**: `bom-events.ts`, room SSE, `useBomLive`, `GET lines?ids=`, tăng poll 5 phút. Phụ thuộc WP2 (version). Song song với WP6/WP8 về mặt file nếu chỉ thêm `publishBomEvent` một dòng vào route — nhưng WP9 đụng `useBom.ts` và `notify-stream.ts`: không giao cho agent khác cùng lúc. Xong khi: staging 2 trình duyệt, A sửa → B thấy ≤1s không refetch toàn BOM (xem Network); tắt SSE (chặn) → fallback poll vẫn cập nhật; test `notify-stream-registry` xanh.

**WP10 — Dọn UI (G) (M)**: sau WP5/6/8. Xong khi: typecheck, grep không còn symbol legacyAssembly/shortage trong bom-grid-pro, e2e mở BOM + mở sheet không lỗi console.

Thứ tự: WP0‖WP1 → WP2‖WP3‖WP4a → WP4b → WP5 → WP6 → WP8‖WP9 → WP7 → WP10. Mỗi gói: commit WIP trước khi fan-out, cấm git ghi trong prompt agent con (bẫy stash). Deploy prod từng đợt sau verify staging bằng curl thật (đăng nhập, PATCH, GET) theo quy ước repo.

## 4. Quyết định còn mở (user chốt)
1. Định dạng số phiếu: `GT-PG260311-001` hay `GT-PG260311-0001` (mẫu "0{seq}" mơ hồ)? Reset seq theo ngày hay theo tháng?
2. Auto-post bước từ PR/PO/nhận hàng (WP7): làm ngay hay để sau 1–2 tuần dùng tay trước? (Dữ liệu hiện chưa chắc có liên kết PO line ↔ bom_line.)
3. Role chỉ-xem BOM có được TẠO NCC mới vào danh mục chung (kèm cờ "chờ rà soát")? Hay chỉ chọn có sẵn?
4. Cho nhập vượt tổng cần ở bước đầu (làm dư dự phòng/hao hụt) hay chặn cứng bằng SL×số bộ?
5. Bước "Thực nhận" NTP: hàng về từ NTP chuyển thẳng sang QC (đề xuất) hay cần bước riêng "Đã về"? Và hàng hỏng/thiếu khi nhận xử lý thế nào (ghi chú, không sổ)?

## 5. Bẫy / rủi ro ẩn
- **Prod**: migration áp tay TRƯỚC deploy; code mới phải đọc fallback khi cột mới NULL (BOM đang chạy). Không xoá `supplier_item_code`, `metadata.*`. Kiểm tra compose override VPS có mount `UPLOAD_DIR` bền (bẫy memory) trước khi ghi ảnh — nếu không, ảnh mất khi recreate container. Thêm sao lưu thư mục `bom/` vào cron backup hiện có.
- **Ảnh**: anchor lệch → đã xử lý theo tâm; ảnh có thể là `OneCellAnchor`/ảnh nổi (không anchor `to`) — parser phải xử lý cả 2; ảnh quá lớn (>2MB) giới hạn + resize full về cạnh dài 1600px.
- **Khớp nhầm**: item cũ thiếu material_code/dimensions nên khớp gia công kém tin cậy → thà CONFIRM nhiều lần đầu. normName cắt `_\d+` có thể gộp 2 chi tiết khác nhau (`CT_1`, `CT_2` cùng sku) — là chủ ý của quy tắc đã chốt nhưng cần cảnh báo trong preview khi 2 dòng cùng file chuẩn hoá về cùng sku (quyết định: giữ 2 dòng BOM, chung 1 item).
- **Idempotent import**: worker xoá theo `importedFromBatch` khi retry — ảnh/NCC/item đã tạo ở lần trước không bị xoá; dùng upsert theo sku để retry không nhân đôi item.
- **Ledger**: không UPDATE/DELETE move (trigger chặn); sửa sai bằng bút toán đảo. Race 2 người chuyển bước → `FOR UPDATE` trên bom_line. Nhập tay và auto-post cùng nạp 1 bước có thể đếm đôi → auto-post chỉ bật sau khi user chốt không nhập tay các bước tương ứng (hoặc UI cảnh báo).
- **Realtime**: SSE qua Caddy cần `flush_interval -1`/không buffer (kiểm tra Caddyfile đã chạy cho notifications stream); số stream/người cap 5 — mở 5 tab BOM + chuông = evict stream chuông. Đề xuất: một EventSource duy nhất/tab dùng chung (BroadcastChannel không cần, YAGNI) và room BOM không tính vào cap chuông. Nhiều instance `iot_app`: hiện 1 container nên registry trong bộ nhớ ổn; nếu scale ngang, kênh Redis đã xử lý fan-out.
- **Hiệu năng**: BOM vài trăm dòng × cột mới × ảnh: bắt buộc thumbnail webp + lazy + memo hàng; endpoint `lines?ids` chỉ trả dòng đổi. `bom_line_change`/`bom_stage_move` tăng đều — chỉ mục theo line_id là đủ.
- **Phiếu mới vs BBGH**: hai số phiếu/hai menu dễ gây nhầm → tên menu rõ ("Phiếu giao nội bộ/NTP" vs "Biên bản giao hàng").
- **File lớn**: BomGridPro/BomLineSheet đã to; mỗi gói thêm component mới trong thư mục riêng thay vì phình file cũ, và chỉ 1 agent sở hữu mỗi file lớn tại một thời điểm.
- **Chưa xác minh** (agent gói liên quan phải kiểm): `UPLOAD_DIR` trên prod, `sharp` trong worker, endpoint `/api/suppliers`, liên kết `po_line.bom_line_id`, cấu trúc ô file phiếu mẫu, tên đúng bảng/route nhận hàng, `ActionsCell` hiện có những nút nào.

## 6. Đã xác minh trên VPS (2026-11-11, orchestrator)
- App prod: `UPLOAD_DIR=/app/uploads`, bind `/opt/hethong-iot/uploads` (bền qua recreate). Staging cũng mount `./uploads`.
- **Worker KHÔNG mount uploads và không có UPLOAD_DIR** → QUYẾT ĐỊNH: tách ảnh + lưu `bom_asset` (gốc + thumb webp) làm ở **app** ngay bước upload/preview (route `/api/bom/imports/upload`); worker commit chỉ gắn `image_asset_id` đã có, KHÔNG đọc/ghi file. Không cần sửa compose override.
- `sharp` có sẵn trong cả image app và worker.
