# Redesign V3 — Addendum theo 5 câu trả lời user (2026-04-25)

> File này ghi DELTA cần áp dụng so với 3 file baseline (`brainstorm.md`, `ui-redesign.md`, `implementation-plan.md`) sau khi user trả lời 5 câu BLOCKER §8 brainstorm. KHÔNG sửa baseline — đọc baseline trước, áp delta sau.

**Quyết định user (2026-04-25):**
1. Multi-level approval cho PR/PO/WO (≥2 cấp).
2. Bộ phận Kế toán chỉ payment_log (giống default — không adjust).
3. Importer V2 chỉ accept file Excel "Bản chính thức" — KHÔNG migrate file cũ.
4. Mọi role ghi note + có @mention user (role phân quyền sẽ chốt sau).
5. Web only — KHÔNG PWA mobile, NHƯNG có kết nối barcode scanner USB HID.

---

## 1. Schema delta — thêm 2 migration mới (Phase 2)

### 1.1. `0023_approval_chain.sql` (MỚI — Sprint 7 thay/bổ sung `0021`)

```sql
-- Approval chain definition (config: ai duyệt cấp nào, threshold tiền nào)
CREATE TABLE app.approval_chain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(16) NOT NULL,   -- 'PR' | 'PO' | 'WO'
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  threshold_amount NUMERIC(18,2),     -- chỉ áp dụng khi total >= threshold (NULL = mọi mức)
  steps JSONB NOT NULL,               -- array: [{order:1, role:'planner', label:'Trưởng kỹ thuật'}, ...]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES app.user_account(id)
);
CREATE INDEX approval_chain_entity_active_idx ON app.approval_chain(entity_type, is_active);

-- Approval request runtime (mỗi PR/PO/WO submit → tạo 1 request)
CREATE TABLE app.approval_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id UUID NOT NULL REFERENCES app.approval_chain(id),
  entity_type VARCHAR(16) NOT NULL,
  entity_id UUID NOT NULL,            -- pr.id | po.id | wo.id (polymorphic)
  current_step INT NOT NULL DEFAULT 1,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | REJECTED | CANCELLED
  submitted_by UUID NOT NULL REFERENCES app.user_account(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX approval_request_entity_idx ON app.approval_request(entity_type, entity_id);
CREATE INDEX approval_request_status_idx ON app.approval_request(status);

-- Audit từng cấp duyệt
CREATE TABLE app.approval_step (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES app.approval_request(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  expected_role VARCHAR(32) NOT NULL,        -- role kỳ vọng (theo chain.steps)
  decision VARCHAR(16),                       -- APPROVED | REJECTED | NULL=chưa quyết
  decided_by UUID REFERENCES app.user_account(id),
  decided_at TIMESTAMPTZ,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX approval_step_request_order_uk ON app.approval_step(request_id, step_order);
```

**Rollback:** `DROP TABLE approval_step, approval_request, approval_chain;`
**Seed default chain:** 2 chain mặc định (PR/PO 2 cấp: planner→admin; WO 2 cấp: planner→admin). User CRUD qua admin UI sau.

**Loại bỏ ý định ở `0021`:** trước đây `0021_wo_approval_delay.sql` định lưu approval qua `metadata.approvalStatus` (1 cấp). Nay multi-level → `0021` chỉ còn `delayed_until` + `delay_reason`. Approval cho WO chuyển sang `0023`.

### 1.2. `0024_mention_notification.sql` (MỚI — Sprint 7)

```sql
-- Cột mới trong bom_line_note (đã định nghĩa ở 0020)
ALTER TABLE app.bom_line_note
  ADD COLUMN mentioned_user_ids UUID[] NOT NULL DEFAULT '{}';
CREATE INDEX bom_line_note_mention_gin ON app.bom_line_note USING GIN(mentioned_user_ids);

-- Bảng notification trung tâm (bell trên TopBar)
CREATE TABLE app.mention_notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.user_account(id) ON DELETE CASCADE,
  source_type VARCHAR(32) NOT NULL,     -- 'BOM_LINE_NOTE' | 'WO_PROGRESS_LOG' | 'PO_COMMENT' | ...
  source_id UUID NOT NULL,
  triggered_by UUID NOT NULL REFERENCES app.user_account(id),
  message TEXT NOT NULL,                 -- "Andy mentioned bạn trong note BOM 502653 R03"
  link_url VARCHAR(500),                 -- "/bom/<id>/grid?line=R03&note=<note-id>"
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mention_notif_user_unread_idx ON app.mention_notification(user_id, is_read, created_at DESC);
```

**Rollback:** `DROP TABLE mention_notification; ALTER TABLE bom_line_note DROP COLUMN mentioned_user_ids;`

### 1.3. `0020_bom_line_note.sql` — adjust (gộp với `0024`)

Khi viết `0020`, đã có `mentioned_user_ids` trong cùng migration để giảm số file. Nhưng khái niệm tách `0024_mention_notification.sql` đứng riêng để: (a) bảng `mention_notification` còn dùng cho source khác (WO log, PO comment); (b) revert độc lập.

**Khuyến nghị:** giữ 2 migration riêng — `0020` chỉ có `bom_line_note`, `0024` thêm cột mentioned + bảng notification.

---

## 2. UI delta — thêm 4 component mới

### 2.1. `<BarcodeScanInput>` (Phase 1 — quan trọng nhất)

**Path:** `apps/web/src/components/ui/BarcodeScanInput.tsx`

**Pattern:**
- `<input type="text">` auto-focus, placeholder "Quét mã hoặc nhập SKU…".
- Listen `onKeyDown` event → key `Enter` (USB HID scanner emit Enter cuối) → trigger `onScan(value)` callback + clear input + re-focus.
- Visual feedback: viền xanh emerald-500 + biểu tượng `<ScanLine>` từ Lucide khi vừa scan thành công 1.5s.
- Debounce input thường (gõ tay) — chỉ trigger scan khi: input length ≥3 + enter trong <100ms cuối (scanner USB ngắt char rất nhanh).
- Disable autofill browser (`autoComplete="off"`).
- Phím tắt `Ctrl+Shift+B` re-focus.
- Props: `onScan(code: string) → void`, `placeholder?`, `autoFocus?` (default true), `className?`.

**Dùng ở 4 nơi:**
| Trang | Hành vi khi scan |
|---|---|
| `/receiving` (mới — sprint 8 nice-to-have) hoặc PO detail tickbox | Scan SKU → tự auto-tick line tương ứng + +1 qty |
| `/items` | Scan barcode → focus item trong list / mở detail |
| `/lot-serial` | Scan serial → mở detail lot |
| Trong `<BomImportWizard>` step 2/3 | Scan để xác nhận hàng hiện có trước khi import |

**Test:** mock `KeyboardEvent` (key="Enter") trong unit test. UAT thật với scanner Honeywell hoặc Datalogic phổ biến tại VN.

### 2.2. `<ApprovalTimeline>` (Phase 2)

**Path:** `apps/web/src/components/approval/ApprovalTimeline.tsx`

**Pattern vertical step:**
```
┌─ Cấp 1: Trưởng kỹ thuật ─────────────────┐
│  ✓ Andy (planner) — duyệt 2026-04-25 14:32  │
│  💬 "OK, NCC đáng tin"                       │
└─────────────────────────────────────────────┘
              │
              ▼
┌─ Cấp 2: Quản lý xưởng ───────────────────┐
│  ⏳ Đang chờ duyệt (sau 2h)                │
│  [Duyệt] [Từ chối] [Yêu cầu chỉnh sửa]    │
└─────────────────────────────────────────────┘
              │
              ▼
┌─ Cấp 3: Giám đốc ────────────────────────┐
│  ⌛ Sẽ chuyển khi cấp 2 duyệt              │
└─────────────────────────────────────────────┘
```

**State per step:** `done` (✓ xanh) / `current` (⏳ vàng + 3 nút hành động) / `pending` (⌛ xám) / `rejected` (✗ đỏ).

**Dùng ở:** PR detail, PO detail, WO detail (3 page có approval).

**Action button:**
- "Duyệt" — gọi API `POST /api/approval/<requestId>/approve` body `{ comment?: string }`.
- "Từ chối" — modal nhập `comment` bắt buộc, gọi `POST /api/approval/<requestId>/reject`.
- "Yêu cầu chỉnh sửa" — phase 2 nice, có thể defer sang phase 3.

**Quyền:** chỉ user có `expected_role` của step `current` mới thấy nút.

### 2.3. `<MentionPicker>` (Phase 2)

**Path:** `apps/web/src/components/note/MentionPicker.tsx`

**Pattern Slack/Linear:**
- Trong `<textarea>` ghi note, gõ `@` → mở popover phía trên với danh sách user (filter theo từ user gõ tiếp).
- Click user → insert `@username` vào textarea + push `userId` vào state `mentionedUserIds: string[]`.
- Submit note → POST kèm `mentionedUserIds`.
- Server-side: với mỗi userId trong array, INSERT 1 row `mention_notification` (source_type='BOM_LINE_NOTE', message="<author> nhắc bạn trong note BOM <code> dòng <position_code>").

**API helper:** `GET /api/users/search?q=<prefix>&limit=10` — fuzzy match `username` + `displayName`. Cache client-side `users` list 60s.

**Dùng ở:** mọi nơi có `<NoteEditor>` (BOM line note, WO progress log, PO comment phase 3).

### 2.4. `<NotificationBell>` (Phase 2)

**Path:** `apps/web/src/components/layout/NotificationBell.tsx`

**Pattern TopBar bell với badge:**
- Icon `<Bell>` Lucide, badge số chưa đọc (max 99+, dùng `app.mention_notification.is_read=false count`).
- Click → mở popover dropdown 360px, list 10 notification mới nhất.
- Mỗi item: avatar trigger user + message + thời gian (hôm nay/hôm qua/dd-mm) + chấm xanh chưa đọc.
- Click item → đánh dấu `is_read=true` qua `POST /api/notifications/<id>/read` + navigate tới `link_url`.
- Polling endpoint `/api/notifications/unread-count` mỗi 30s (Tanstack Query refetch). Nếu sau này muốn realtime → SSE/WS phase 3+.

---

## 3. Phase 1 task delta

### 3.1. P1-S2-T1 — Tickbox receiving (đã có) — THÊM barcode scan

Trong PO detail, thêm `<BarcodeScanInput>` ở đầu table (sticky):
- Scan SKU → tìm line tương ứng → auto-tick checkbox + +1 qty (không phải set qty=ordered).
- Nếu SKU không tồn tại trong PO → toast warning "SKU `XYZ` không có trong PO này".
- Nếu đã đạt qty=ordered → toast info "Line đã đủ, không tăng nữa".

**Estimate update:** task này từ 18h → 22h (+4h cho barcode integration + test scanner).

### 3.2. P1-S2-T2 — Excel BOM importer V1 (đã có) — STRICT FORMAT

Vì user chốt "chỉ áp dụng file chính thức":
- Step 1 wizard ngoài upload, thêm validate: detect title row 1 phải match regex `^Z\d{7}-\d{6}_.+` (mã project format `Z0000002-502653_BANG TAI...`).
- Detect header row 2 phải có ít nhất 5 cột chuẩn: `Image`, `ID Number`, `Quantity`, `Standard Number`, `NCC`.
- Nếu không match → reject với toast error "File không đúng template chính thức. Yêu cầu format theo `Bản chính thức 20260324_*.xlsx`."
- BỎ flow generic mapper (đã có ở importer Item) — không cần synonym fuzzy phức tạp, chỉ map cố định cột Excel → DB field.

**Estimate update:** task này từ 32h → 24h (-8h vì bỏ flow mapper generic).

### 3.3. P1-S3-T1 — Polish dashboard mobile + tickbox PWA → adjust title

Đổi tên: "Polish dashboard tablet + tickbox kiosk-mode + barcode scan UAT".
- Bỏ test PWA mobile phone.
- Test tablet 768-1024 (vẫn có giá trị — để ipad ở kho).
- UAT scanner USB Honeywell + barcode test đa dạng (CODE128, EAN13, QR).

---

## 4. Phase 2 task delta

### 4.1. Sprint 7 — Adjust thứ tự task

Thay vì 3 task `P2-S7-T1` (`0020 bom_line_note + UI`), `T2` (`0021 wo_delay + approval 1 cấp`), `T3` (PR-from-BOM), giờ thành **5 task**:

- **P2-S7-T1:** Migration `0020_bom_line_note.sql` (tách khỏi mention) — bảng note thuần.
- **P2-S7-T2:** Migration `0021_wo_delay.sql` — chỉ `delayed_until` + `delay_reason` (BỎ approval khỏi đây).
- **P2-S7-T3:** Migration `0023_approval_chain.sql` + seed 2 chain mặc định + admin UI `/admin/approval-chains` CRUD.
- **P2-S7-T4:** Component `<ApprovalTimeline>` + tích hợp PR/PO/WO detail. Submit → tạo `approval_request` + `approval_step` rows tự động theo chain.
- **P2-S7-T5:** PR-from-BOM bulk-create (giữ nguyên scope cũ).

**Estimate Sprint 7:** từ 50h → 72h (+22h cho approval multi-level UI + admin chain CRUD).

### 4.2. Sprint 7-8 — Thêm task @mention

- **P2-S7-T6 (mới, có thể slip sang Sprint 8):** Migration `0024_mention_notification.sql` + cột `mentioned_user_ids` trong `bom_line_note`.
- **P2-S8-T0 (mới, đầu sprint 8):** Component `<MentionPicker>` + `<NotificationBell>` + endpoint `/api/users/search` + `/api/notifications/*`. Tích hợp vào `<NoteEditor>` (đã có ở P2-S7-T1).

**Estimate Sprint 8:** từ 40h → 56h (+16h cho mention + notification).

### 4.3. Tổng estimate Phase 2 update

Brainstorm cũ ~120h. Sau adjust:
- Sprint 4-5: 38h (giữ nguyên — schema material/process/dimensions).
- Sprint 6: 18h (giữ nguyên — importer V2 strict).
- Sprint 7: 72h (+22h approval chain).
- Sprint 8: 56h (+16h mention/notification).
- **Tổng: ~184h** (vẫn dưới budget 200h ban đầu).

### 4.4. Tổng estimate Phase 1 update

Phase 1 cũ ~62h. Sau adjust:
- Sprint 1: 24h (giữ nguyên).
- Sprint 2: 26h (-4h importer simpler + +4h barcode = giữ nguyên ~26h, từ 50h cũ → 46h).
- Wait, recalc: T1 từ 18h → 22h (+4h barcode), T2 từ 32h → 24h (-8h strict format). Net -4h.
- Sprint 3: 16h (+2h test barcode UAT).
- **Tổng Phase 1: ~62h → ~60h** (gần như không đổi).

**Tổng tổng V2.0 sau adjust: ~244h** (vẫn ≤320h budget).

---

## 5. Out-of-scope confirm cuối cùng

Khẳng định KHÔNG làm trong V2.0 sau khi user trả lời:
- ❌ Camera scan barcode (web getUserMedia) — chỉ scanner USB HID.
- ❌ PWA mobile phone — chỉ desktop + tablet 768+.
- ❌ Offline mode — yêu cầu wifi luôn.
- ❌ Xuất hoá đơn VAT / e-invoice.
- ❌ Tích hợp MISA / FAST.
- ❌ Sổ kế toán chi phí gia công nội bộ.
- ❌ Migration data file Excel cũ.
- ❌ Realtime websocket cho mention (dùng polling 30s).
- ❌ Multi-tenancy / nhiều xưởng (chỉ 1 xưởng Song Châu).

Defer phase 3+ nếu user cần sau:
- Mobile PWA (sau khi user xác nhận operator dùng phone thật).
- Camera scan + offline cache.
- VAT/MISA integration.
- Realtime collaboration (websocket).
- Multi-level approval phức tạp hơn (parallel approval, conditional skip).

---

## 6. Checklist bắt đầu Phase 1 Sprint 1

User OK → Claude Code bắt đầu code:

**Tuần 1 — Sprint 1 (24h):**
- [ ] **P1-S1-T1 (4h):** Refactor `apps/web/src/lib/nav-items.ts` thành 5 section: Tổng quan / Kho / Mua bán / Kỹ thuật / Kế toán (disabled "Sắp ra mắt") / Quản trị. Update `NAV_SECTION_LABEL` + `NAV_SECTION_ORDER`. Map từng item sang section đúng (xem brainstorm §9.2).
- [ ] **P1-S1-T2 (16h):** Trang Tổng quan `/` mới — file `apps/web/src/app/(app)/page.tsx` thay redirect bằng dashboard. Component mới `apps/web/src/components/dashboard/{ProgressBarStack,ProgressBarCard}.tsx`. API mới `apps/web/src/app/api/dashboard/overview-v2/route.ts` aggregate query `bom_snapshot_line` + cache Redis 30s. 6 progress bar drilldown.
- [ ] **P1-S1-T3 (4h):** Smoke test — login với 4 role thử (admin/planner/operator/warehouse), verify sidebar đúng, dashboard 6 thanh hiển thị đúng %, drilldown click không 404. Commit + tag `v2.0-p1-w1`.

Tôi sẽ chờ bạn duyệt rồi bắt đầu code Sprint 1. Hoặc bạn muốn tôi triển khai luôn Sprint 1 ngay (auto mode đang bật)?
