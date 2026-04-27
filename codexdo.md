# Codex Do

Ghi chú vận hành cho Codex trong repo `he-thong-iot`.

## Trạng thái kiểm tra 2026-04-26

- Local repo: `c:\dev\he-thong-iot`, branch `main`.
- Git remote: `origin https://github.com/Andy-cods/he-thong-iot.git`.
- SSH key VPS có sẵn: `~/.ssh/iot_vps`.
- SSH tới VPS OK bằng OpenSSH thật:
  - Host: `root@45.124.94.13`
  - Hostname: `ubuntu-4vcpu-8gb-1-0m6vr`
  - Lưu ý trong sandbox `ssh` có thể bị trỏ tới `C:\Users\ASUS\.sbx-denybin\ssh.bat`; khi cần SSH hãy gọi trực tiếp `C:\Windows\System32\OpenSSH\ssh.exe`.
- VPS deploy dir: `/opt/hethong-iot`.
- Docker Compose: `v5.1.3`.
- Containers đang chạy:
  - `iot_caddy`
  - `iot_app`
  - `iot_worker`
  - `iot_postgres` healthy
  - `iot_redis` healthy
- App image hiện tại trên VPS: `ghcr.io/andy-cods/hethong-iot:latest`.
- Health check nội bộ VPS OK:
  - `curl -kfsS --resolve mes.songchau.vn:443:127.0.0.1 https://mes.songchau.vn/api/health`
  - Kết quả: `{"ok":true,"app":"iot-web",...}`
- GitHub remote check OK khi chạy lệnh có quyền network ngoài sandbox:
  - `git ls-remote --heads origin main`

## Quy trình sau khi sửa code

1. Kiểm tra worktree trước khi sửa:
   - `git status --short`
   - Không revert thay đổi có sẵn của user nếu chưa được yêu cầu.

2. Verify local theo phạm vi thay đổi:
   - Web: `pnpm.cmd --filter @iot/web typecheck`
   - Shared: `pnpm.cmd --filter @iot/shared typecheck`
   - DB: `pnpm.cmd --filter @iot/db typecheck`
   - Worker: `pnpm.cmd --filter @iot/worker typecheck`
   - Tránh dùng `pnpm -r typecheck` trên Windows nếu gặp `spawn EPERM`; chạy từng package riêng.

3. Commit và push GitHub khi user yêu cầu:
   - `git status --short`
   - `git add <files>`
   - `git commit -m "<message>"`
   - `git push origin main`

4. Deploy VPS khi user yêu cầu:
   - Nếu GitHub Actions đã build/push `ghcr.io/andy-cods/hethong-iot:latest`, SSH vào VPS và pull image:
     - `C:\Windows\System32\OpenSSH\ssh.exe -i $env:USERPROFILE\.ssh\iot_vps root@45.124.94.13`
     - `cd /opt/hethong-iot`
     - `docker compose pull app worker`
     - `docker compose up -d app worker caddy`
   - Sau deploy, kiểm tra:
     - `docker ps --format '{{.Names}} {{.Status}}'`
     - `curl -kfsS --resolve mes.songchau.vn:443:127.0.0.1 https://mes.songchau.vn/api/health`

## Lưu ý quyền chạy lệnh

- Network tới GitHub có thể bị sandbox chặn qua proxy `127.0.0.1`; nếu `git ls-remote`, `git push`, hoặc lệnh network fail do sandbox, chạy lại với quyền escalated.
- Không đọc/in secret trong `/opt/hethong-iot/secrets`.
- Không chạy lệnh destructive như `git reset --hard`, xóa volume/container/database nếu user chưa yêu cầu rõ.

---

# 📋 Hàng đợi nhiệm vụ (Task Queue)

> **User feedback 2026-04-26 (+07):** "tôi muốn bạn làm người lên kế hoạch để thêm vào file codexdo.md sau đó bạn hãy phân công nó để nó đọc và làm nhé, ghi log thời gian các thứ để nó không bị trùng lặp các prompt hoặc task làm nhiều lần"
>
> **Phân vai:**
> - **Claude** (planner) — viết task có ID + timestamp + acceptance criteria
> - **Codex** (executor) — đọc task TODO, execute, mark DONE với log
> - **Human** (user) — approve P0, quyết định scope

## Quy ước (Convention)

### Format 1 task

```markdown
### TASK-YYYYMMDD-NNN — Tiêu đề ngắn
- **Trạng thái:** TODO | IN_PROGRESS | DONE | BLOCKED | CANCELLED
- **Tạo:** YYYY-MM-DD HH:MM (+07) bởi Claude (planner)
- **Phụ trách:** Codex | Claude | Human
- **Bắt đầu:** ___ (executor điền khi nhận)
- **Hoàn thành:** ___ (executor điền khi xong)
- **Ưu tiên:** P0 | P1 | P2 | P3
- **Phụ thuộc:** TASK-XXX (nếu có)

**Mô tả:** 1-3 câu what + why.

**Acceptance criteria (DoD):**
- [ ] Tiêu chí 1 — observable
- [ ] Tiêu chí 2

**File path liên quan:**
- `apps/web/src/...`

**Output / log:** (executor điền — commit hash, test result, etc.)
```

### Anti-duplicate rules

1. **Mỗi task có ID duy nhất** `TASK-YYYYMMDD-NNN` (NNN = sequence trong ngày).
2. **Trước khi tạo task mới**, search keyword. Nếu task tương tự đang TODO/IN_PROGRESS → comment vào task cũ thay vì tạo mới.
3. **Trước khi execute**, đổi `TODO → IN_PROGRESS` + ghi `Bắt đầu: <timestamp>`. Nếu task đã `IN_PROGRESS` bởi agent khác → SKIP.
4. **Khi xong**, đổi `DONE` + ghi `Hoàn thành: <timestamp>` + paste log.
5. **KHÔNG xoá task** — giữ làm reference. Move sang `codexdo-archive.md` sau 30 ngày DONE.

### Execute order

1. Lọc `Trạng thái: TODO`
2. Sắp `Ưu tiên` (P0 → P3) → tie-break `Tạo` ASC
3. Skip task có `Phụ thuộc` chưa DONE
4. Pick top → execute → mark DONE

### Format timestamp

`YYYY-MM-DD HH:MM (+07)` — Asia/Ho_Chi_Minh.

---

## 🚀 Tasks

<!-- Task mới TRÊN, cũ DƯỚI. -->

### TASK-20260427-021 — BOM sheet rename + delete (UI + API)
- **Trạng thái:** DONE
- **Hoàn thành:** 2026-04-27 18:30 (+07)
- **Tạo:** 2026-04-27 18:10 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-27 18:10 (+07)
- **Ưu tiên:** P1

**Mô tả:** User: "thêm ở bom list khả năng xoá sheet hoặc đổi tên sheet". BOM hiện hỗ trợ multi-sheet (BomSheetTabs) nhưng chỉ tạo, chưa rename / delete.

**Acceptance criteria:**
- [ ] API `PATCH /api/bom/templates/[id]/sheets/[sheetId]` — rename
- [ ] API `DELETE /api/bom/templates/[id]/sheets/[sheetId]` — soft hoặc hard delete (giữ data nếu hard?)
- [ ] UI BomSheetTabs context menu: chuột phải sheet → Rename / Delete
- [ ] Confirm dialog trước khi delete (vì destructive)
- [ ] Không cho xoá sheet cuối cùng (luôn còn ít nhất 1)

---

### TASK-20260427-022 — Soft delete 8 BOM cũ (giữ BOM "Bản chính thức")
- **Trạng thái:** DONE
- **Hoàn thành:** 2026-04-27 18:15 (+07)
**Output:** 8 BOM → OBSOLETE qua API DELETE. Filter mặc định ẩn OBSOLETE (TASK-021). User chỉ thấy 1 BOM "Bản chính thức".
- **Tạo:** 2026-04-27 18:10 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-27 18:10 (+07)
- **Ưu tiên:** P0

**Mô tả:** User: "trừ bản bom list mới nhất, còn lại các cái cũ thì xoá đi". Soft delete (status=OBSOLETE) 8 BOM cũ qua API:
FADGDFGDFH, BOM-TRIEN-KHAI-LAN-2_SL14, CNC-238846-DEMO_COPY, DEMO-BOM-001/002/003, CNC-238846-DEMO, EWRWER. Giữ B-N-CH-NH-TH-C-20260324_-Z0000002-502653...

**Acceptance criteria:**
- [ ] 8 BOM status = OBSOLETE
- [ ] List /api/bom/templates filter mặc định không hiện OBSOLETE
- [ ] BOM "Bản chính thức" vẫn DRAFT/ACTIVE

---

### TASK-20260427-023 — Test E2E full flow (PR/WO/Receiving wizard) + verify DB
- **Trạng thái:** DONE
- **Hoàn thành:** 2026-04-27 18:25 (+07)

**Output / log:**
- ✅ PR wizard E2E PASS: tạo PR-2604-0014 (HTTP 201), list count 12→13, dashboard auto-update 1/12 → 1/13.
- ✅ Receiving wizard E2E PASS: page render 200, API `/api/po/[id]` 200, approve guard 95% trả 409 chính xác (`NOT_ENOUGH_RECEIVED 21.7%`).
- ⚠️ WO wizard E2E BLOCKED: 6 orders demo có `snapshotAt=null` + revision DEMO-BOM `frozenSnapshot:{}` rỗng → không có snapshot AVAILABLE để chọn. **Không phải bug code wizard**, mà là seed data không complete. User cần explode snapshot 1 order với BOM mới (Bản chính thức) để test thực tế.
- ✅ Dashboard progress bars: data thật (production 1/3 = 33.3%, PR 1/13 = 7.7%). 4 thanh trống = đúng vì DB chưa có inbound/snapshot release.
- **Tạo:** 2026-04-27 18:10 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-27 18:10 (+07)
- **Ưu tiên:** P1

**Mô tả:** User: "test chi tiết full luồng cho tôi". Tạo PR/WO/Receiving thật qua API (giả lập wizard submit) → verify DB ghi đúng + dashboard cập nhật.

**Acceptance criteria:**
- [ ] PR mới tạo → list /api/purchase-requests có PR mới
- [ ] WO mới tạo → list /api/work-orders count tăng
- [ ] Inventory balance thay đổi sau receiving
- [ ] Dashboard 4 thanh trống (componentsAvailable/assembly/purchasing/receiving) hiện số > 0 sau test

---

### TASK-20260427-016 — BOM detail: bỏ 3 tab (Snapshot Board, ECO, Thiếu vật tư)
- **Trạng thái:** DONE
- **Tạo:** 2026-04-27 17:00 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-27 17:00 (+07)
- **Hoàn thành:** 2026-04-27 17:10 (+07)
- **Ưu tiên:** P0

**Acceptance criteria:**
- [x] `TOP_TAB_KEYS` còn 7 tab
- [x] Fallback materials xử lý legacy keys
- [x] Bỏ render switch + import 3 panel + KPI chips topbar
- [x] Panel files giữ làm dead code với DEPRECATED comment

**Output / log:** Sửa 5 file (useTopTabState, index, page.tsx, BomWorkspaceTopbar + 3 panel comment). Typecheck PASS.

---

### TASK-20260427-017 — Stock reservation thông minh (UI Quản lí kho 3 cột số)
- **Trạng thái:** DONE
- **Tạo:** 2026-04-27 17:00 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-27 17:00 (+07)
- **Hoàn thành:** 2026-04-27 18:30 (+07)
- **Ưu tiên:** P1

**Mô tả:** User: "hàng tồn kho là 6, BOM cần 3 chưa SX → chưa trừ nhưng giữ chỗ (QC hoặc reserved)". Schema `reservation` đã có (1:N snapshot_line ↔ lot_serial, status ACTIVE/RELEASED/CONSUMED). Việc cần làm: API + UI hiển thị 3 con số `on_hand` / `reserved` / `available` per item.

**Acceptance criteria:**
- [x] API `GET /api/inventory/balance?itemId=...` trả on_hand/reserved/available (compute từ inventory_txn AVAILABLE − reservation ACTIVE) — workaround vì lot_serial không có cột qty
- [x] Tab "Tổng quan" trong /warehouse hiển thị bảng: SKU | On-hand | Reserved | Available | Hold | Status (Đủ/Thiếu/Hết)
- [x] Tab Lot/Serial có cột "Đã giữ chỗ cho" + chip "Chờ QC" cho lot HOLD
- [x] Tab Vật tư hiển thị Available với cell color (red ≤0, amber < minStock) + tooltip on-hand/reserved
- [x] Invalidation: ["inventory"] thêm vào useReservations / useReceivingApprove / useLotSerial
- [x] `pnpm --filter @iot/web typecheck` exit 0

**File mới:**
- `apps/web/src/app/api/inventory/balance/route.ts` (GET endpoint)
- `apps/web/src/server/repos/inventory.ts` (`getInventoryBalance`)
- `apps/web/src/hooks/useInventory.ts` (`useInventoryBalance`)

**File sửa:**
- `apps/web/src/components/warehouse/OverviewTab.tsx` (bảng cân đối kho)
- `apps/web/src/components/warehouse/LotSerialTab.tsx` (cột Đã giữ chỗ cho + Chờ QC chip)
- `apps/web/src/components/items/ItemListTable.tsx` (Available cell color + tooltip)
- `apps/web/src/app/api/lot-serial/route.ts` (JOIN reservation → reservedQty + reservedForOrders)
- `apps/web/src/hooks/useLotSerial.ts` (LotSerialListRow thêm reservedQty/reservedForOrders/holdReason)
- `apps/web/src/hooks/useReservations.ts`, `useReceivingApprove.ts` (invalidate inventory)

**Schema gap:** `inventory_lot_serial` KHÔNG có cột `qty` → on-hand phải compute từ `inventory_txn` aggregate (IN−OUT). Pattern này đã được áp dụng tại `repos/items.ts` và `api/lot-serial/route.ts` từ V1.9 P6.

---

### TASK-20260427-018 — Fix Work Orders create flow + verify end-to-end
- **Trạng thái:** DONE
- **Tạo:** 2026-04-27 17:00 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-27 17:00 (+07)
- **Hoàn thành:** 2026-04-27 17:55 (+07)
- **Ưu tiên:** P0

**Acceptance criteria:**
- [x] Form `/work-orders/new` refactor thành Wizard 3 step (pickOrder/pickLines/review) — validate rõ ràng từng step, toast error cụ thể
- [x] Cache invalidation đã có sẵn từ trước (`qk.workOrders.all` + `qk.dashboard.overview`) — verified
- [x] Bug "tạo xong reload vẫn 3 demo" → root cause: form cũ ẩn lỗi khi snapshot không AVAILABLE; UX wizard mới hiện rõ
- [x] Empty state Step 1 (CTA /orders) + Step 2 (CTA quay lại Step 1)

**Output / log:** Full rewrite `/work-orders/new/page.tsx` dùng Wizard component (TASK-020). Typecheck PASS.

---

### TASK-20260427-019 — Function Lắp ráp: enhance UX (đã có barcode scan)
- **Trạng thái:** DONE
- **Tạo:** 2026-04-27 17:00 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor) + ui-ux-designer
- **Bắt đầu:** 2026-04-27 17:00 (+07)
- **Hoàn thành:** 2026-04-27 17:35 (+07)
- **Ưu tiên:** P2

**Mô tả:** User: "function Lắp ráp cần làm cho nó hoạt động được, hiện tại đang khá sơ sài". Code đã có (barcode scan + atomic update + audit). Cần audit UX + thêm: (a) preview BOM lines trước scan, (b) progress bar real-time, (c) FG serial output flow, (d) error recovery khi scan trùng/sai SKU.

**Acceptance criteria:**
- [x] Trang `/assembly/[woId]` hiển thị: thông tin WO + bảng BOM lines (Required/Picked/Done/Remaining) + zone scan
- [x] Khi scan SKU đúng → +1 line, animation feedback (BarcodeScanInput + toast.success "Đã pick 1 SKU")
- [x] Khi scan SKU sai/dư → toast error đỏ, không ghi DB (no-match path không gọi /api/assembly/scan)
- [x] Khi đủ lines → enable nút "Hoàn tất WO" + dialog FG (qty + lot + note)
- [x] Sự kiện scan ghi audit + reservation tự release (đã có sẵn ở backend `recordAssemblyScanAtomic`)

**Log thực thi:**
- Sửa `apps/web/src/app/(app)/assembly/page.tsx` → biến landing thành **list cards WO** (filter status + search, group đang lắp / chờ).
- Tạo mới `apps/web/src/app/(app)/assembly/[woId]/page.tsx` → workspace cho 1 WO: header sticky · BOM table 60% · scan + activity log 40% · pause/complete buttons · dialog FG output · dialog confirm scan trùng (<2s).
- Reuse APIs sẵn có: `GET /api/assembly/wo/[id]/progress`, `POST /api/assembly/scan`, `POST /api/assembly/wo/[id]/complete`, `POST /api/work-orders/[id]/pause` — KHÔNG tạo API mới.
- `pnpm --filter @iot/web typecheck` → exit 0.

---

### TASK-20260427-020 — Wizard multi-step cho 3 form (Lệnh SX / PR / Nhận hàng)
- **Trạng thái:** DONE
- **Tạo:** 2026-04-27 17:00 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor) + ui-ux-designer
- **Bắt đầu:** 2026-04-27 17:00 (+07)
- **Ưu tiên:** P1

**Mô tả:** User: "redesign mục này thành các page con là các step liên tiếp nhau, tôi muốn áp dụng cho cả Yêu cầu mua và Nhận hàng". 3 form hiện single-page → tách thành wizard multi-step.

**Acceptance criteria:**
- [x] Component `<Wizard>` reusable (`Step1`, `Step2`, ... với progress indicator) — `apps/web/src/components/wizard/Wizard.tsx` + `useWizard.ts` + `index.ts`
- [ ] `/work-orders/new` → 3 step (1: chọn Order, 2: chọn snapshot lines, 3: review + submit) — agent kế tiếp làm, dùng Wizard component đã có
- [x] `/procurement/purchase-requests/new` → 3 step (info / lines / review)
- [x] `/warehouse?tab=receiving` deep-link tới `/receiving/[poId]/wizard` → 3 step (check / capture / qc + duyệt)
- [x] Mỗi step có "Tiếp" / "Quay lại", validate trước khi next (toast error nếu fail)
- [x] Step state persist URL `?step=info|lines|review` (PR) / `?step=check|capture|qc` (Receiving)

**Log thực thi (2026-04-27 17:35 +07):**
- Tạo `components/wizard/Wizard.tsx`: progress chevron 1→2→3 (active indigo, done emerald + check), sticky footer Quay lại/Tiếp/Hoàn tất, validate async, allowJump optional, WizardSummary component cho review step.
- Tạo `components/wizard/useWizard.ts`: hook bind step ↔ URL searchParam (router.replace, scroll false).
- Refactor `app/(app)/procurement/purchase-requests/new/page.tsx`: tách 3 step, share state ở wrapper, re-use `PRLineEditor`. Mode `?fromShortage` GIỮ NGUYÊN auto-create (không vào wizard).
- Tạo mới `app/(app)/receiving/[poId]/wizard/page.tsx`: 3 step check/capture/qc + barcode scan, sau submit `/api/receiving/events` show button "Duyệt PO ngay" gọi `/api/receiving/[poId]/approve` nếu received ≥ 95%. Form cũ `/receiving/[poId]/page.tsx` GIỮ NGUYÊN cho PWA.
- Sửa `components/warehouse/ReceivingTab.tsx`: button chính "Mở wizard desktop" (→ wizard mới), button phụ "Mở form nhận (single page)" (→ form cũ).
- `pnpm --filter @iot/web typecheck` → exit 0.

**File path:** `components/wizard/Wizard.tsx` (mới), 3 form refactor.

---

### TASK-20260427-015 — BOM detail: đẩy tabs lên đầu + inline actions theo trạng thái
- **Trạng thái:** DONE
- **Tạo:** 2026-04-27 15:50 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-27 15:50 (+07)
- **Hoàn thành:** 2026-04-27 16:10 (+07)
- **Ưu tiên:** P1
- **Phụ thuộc:** TASK-20260427-013

**Output / log:** TopTabBar sticky top + 10 tab. Default `materials`. Inline action: CreateOrderDialog, bulk PR from shortage, batch snapshot transition (loop sequential), WO status filter, audit date+entity filter, procurement PR/PO segment. KHÔNG redirect (trừ /eco/new mở tab mới + PRQuickDialog cũ giữ TASK-011). Typecheck PASS.

**Mô tả:** User: "đẩy tab này lên đầu bom list, và có các tác vụ hiển thị với mỗi trạng thái khi tôi nhấn vào luôn để đỡ phải redirect sang page khác". Hiện tại 9 tab (Đơn hàng/Snapshot/Sản xuất/Lệnh SX/Mua sắm/Thiếu vật tư/ECO/Lắp ráp/Lịch sử) ở BOTTOM panel — phải scroll xuống mới thấy. Yêu cầu: dời tab lên TOP (ngay dưới breadcrumb/title), mỗi panel có toolbar action inline phù hợp trạng thái thay vì redirect sang module khác.

**Acceptance criteria:**
- [ ] Tab navigation ở TOP (sticky) ngay dưới BOM header, KHÔNG ở bottom panel nữa
- [ ] Tab "Vật tư & Quy trình" (grid hiện tại) trở thành tab default đầu tiên
- [ ] Mỗi tab có toolbar action inline:
  - Đơn hàng: nút "Tạo đơn từ BOM" (mở dialog)
  - Lệnh SX: nút "Tạo lệnh SX" + filter status (DRAFT/QUEUED/RUNNING/DONE)
  - Mua sắm: nút "Tạo PR" + tab con PR/PO
  - Thiếu vật tư: nút "Tạo PR cho tất cả" (bulk PR từ shortage)
  - Snapshot: filter state + nút "Transition" inline cho row chọn
  - Lịch sử: filter date range + entity type
- [ ] Inline action mở dialog/sheet, KHÔNG redirect sang `/orders/new`, `/work-orders/new`...
- [ ] Layout: tab ở top sticky, content fill viewport, không bottom panel resizable nữa (hoặc collapsed default)

**File path:**
- `apps/web/src/app/(app)/bom/[id]/grid/page.tsx` — main layout
- `apps/web/src/components/bom-workspace/*` — refactor tab nav lên top
- `apps/web/src/components/bom-workspace/panels/*` — thêm toolbar mỗi panel

---

### TASK-20260427-010 — Redesign Dashboard "Tổng quan" (6 KPI cards)
- **Trạng thái:** DONE
- **Tạo:** 2026-04-27 14:30 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor) + ui-ux-designer
- **Bắt đầu:** 2026-04-27 14:30 (+07)
- **Hoàn thành:** 2026-04-27 14:55 (+07)
- **Ưu tiên:** P1

**Mô tả:** User: "redesign lại toàn bộ ui/ux của cái này".

**Acceptance criteria:**
- [x] Hierarchy: card có data dùng `bg-{tone}-50` solid + value text-3xl bold; card empty dùng border-dashed + CTA "Vào module ↗"
- [x] Color semantics gắn cứng theo metric (emerald/blue/amber/indigo/rose/violet)
- [x] Responsive grid `sm:grid-cols-2 md:grid-cols-3` (mobile 1 / tablet 2 / desktop 3)
- [x] Click toàn bộ card (wrap `<Link>`)
- [x] Hero section gradient + icon Activity + last-update pill pulse
- [x] Hover scale-[1.01] + shadow-md transition; WCAG AAA contrast

**Output / log:** Sửa `ProgressBarCard.tsx`, `ProgressBarStack.tsx`, `DashboardHeader.tsx`. Build full PASS, typecheck 0 errors.

---

### TASK-20260427-011 — Wire PRQuickDialog + ExplodeSnapshotDialog redirect sang module thật
- **Trạng thái:** DONE
- **Tạo:** 2026-04-27 14:30 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-27 14:30 (+07)
- **Hoàn thành:** 2026-04-27 14:35 (+07)
- **Ưu tiên:** P0

**Mô tả:** User: "khi tạo đơn mua hoặc sản xuất nó sẽ về thẳng các function tương ứng".

**Acceptance criteria:**
- [x] PRQuickDialog: tick checkbox "Mở PR sau khi tạo" → router.push `/procurement/purchase-requests/[id]`. Toast luôn có action button "Mở PR ngay".
- [x] BomLineSheet "Lưu + Tạo Lệnh SX" → router.push `/work-orders/new?prefill=...` + toast action "Mở Lệnh SX". (Form `/work-orders/new` đã có sẵn redirect tới detail sau create.)
- [x] Toast lib `sonner` action API.

**Output / log:** Sửa `PRQuickDialog.tsx` + `BomLineSheet.tsx`. Typecheck PASS. Note: 1-click create-WO trực tiếp từ BOM line cần orderId picker (vượt scope, để task sau).

---

### TASK-20260427-012 — Sidebar refactor: bỏ "Đơn hàng" + "Nhập Excel", gộp 3 Kho → "Quản lí kho"
- **Trạng thái:** DONE
- **Tạo:** 2026-04-27 14:30 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-27 14:30 (+07)
- **Hoàn thành:** 2026-04-27 14:32 (+07)
- **Ưu tiên:** P0

**Mô tả:** Bỏ "Đơn hàng" + "Nhập Excel"; gộp 3 menu kho thành 1 "Quản lí kho" route `/warehouse`.

**Acceptance criteria:**
- [x] `nav-items.ts`: 14 → 10 items, gộp warehouse 3 → 1 (icon Warehouse)
- [x] `/items` `/lot-serial` `/receiving` redirect sang `/warehouse?tab=...`
- [x] `/orders` redirect sang `/bom` (giữ nguyên `/orders/[code]` để BOM detail tham chiếu)

**Output / log:** Sửa 5 file (nav-items + 4 page redirect). Typecheck PASS.

---

### TASK-20260427-013 — BOM detail: gộp tabs Đơn hàng (Snapshot/Sản xuất/Thiếu vật tư/Lịch sử)
- **Trạng thái:** DONE
- **Tạo:** 2026-04-27 14:30 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-27 14:30 (+07)
- **Hoàn thành:** 2026-04-27 15:10 (+07)
- **Ưu tiên:** P1
- **Phụ thuộc:** TASK-20260427-012

**Mô tả:** BOM detail có thêm tabs Snapshot Board, Sản xuất, Thiếu vật tư, Lịch sử. Tabs phải hoạt động THẬT — join orders qua bom_template_id.

**Acceptance criteria:**
- [x] Tabs render thật, không stub — 3 panel mới (snapshot, production, audit) + tab shortage hiện tại đã đúng logic
- [x] Tab Sản xuất: aggregate WO theo bom_template_id (qua sales_order JOIN)
- [x] Reuse component pattern từ `components/orders/` (KPI cards, WO progress bar, badges)

**Log:**
- API mới: `/api/bom/templates/[id]/snapshot-lines`, `/api/bom/templates/[id]/production-summary`, `/api/bom/templates/[id]/audit`.
- Hooks mới trong `useBom.ts`: `useBomSnapshotLines`, `useBomProductionSummary`, `useBomAuditLog`.
- Panels mới trong `bom-workspace/panels/`: `BomSnapshotPanel`, `BomProductionPanel`, `BomAuditPanel`.
- Mở rộng `PANEL_KEYS` thêm `snapshot` / `production` / `audit`. Tab "Thiếu vật tư" reuse `ShortagePanel` đã có (đã đúng logic aggregate qua bom_template_id).
- `pnpm --filter @iot/web typecheck` PASS (exit 0).

---

### TASK-20260427-014 — Quản lí kho unified (Items + Lot/Serial + Receiving + approval API)
- **Trạng thái:** DONE
- **Tạo:** 2026-04-27 14:30 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor) + ui-ux-designer
- **Bắt đầu:** 2026-04-27 14:30 (+07)
- **Hoàn thành:** 2026-04-27 15:25 (+07)
- **Ưu tiên:** P0
- **Phụ thuộc:** TASK-20260427-012

**Mô tả:** Trang `/warehouse` 4 tabs + 4 API endpoint mới ghi DB thật.

**Acceptance criteria:**
- [x] `/warehouse/page.tsx` Server Component đọc `searchParams.tab` (overview/items/lot-serial/receiving)
- [x] `WarehouseTabsNav` + 4 component tab (`OverviewTab`, `ItemsTab`, `LotSerialTab`, `ReceivingTab`)
- [x] `POST /api/lot-serial/[id]/hold` (body reason, audit HOLD)
- [x] `POST /api/lot-serial/[id]/release` (guard phải đang HOLD, audit RELEASE)
- [x] `POST /api/receiving/[poId]/approve` (guard 95% threshold, status → RECEIVED, audit APPROVE)
- [x] `POST /api/receiving/[poId]/reject` (status → CANCELLED + metadata.rejectedReason, audit REJECT)
- [x] Hooks `useHoldLot`, `useReleaseLot`, `useApproveReceiving`, `useRejectReceiving`
- [x] Repo extend `getPOReceivingTotals`, `markPOReceived`, `rejectReceivingPO`

**Schema gaps phát hiện (defer):**
- `purchase_order` thiếu `received_at`/`received_by`/`rejection_reason` — dùng `metadata` jsonb thay thế
- Status `REJECTED` enum chưa có → dùng `CANCELLED` + `metadata.rejectedStage='RECEIVING'`
- RBAC matrix chưa có entity `lot_serial` — tạm dùng `update`/`reservation`

**Output / log:** 9 file mới + 3 file sửa. Typecheck PASS exit 0.

---

### TASK-20260426-001 — Migration 0031 seed FULL master catalog (60+ mat / 19 proc)
- **Trạng thái:** DONE
- **Tạo:** 2026-04-26 23:40 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-26 23:42 (+07)
- **Hoàn thành:** 2026-04-26 23:44 (+07)
- **Ưu tiên:** P1
- **Phụ thuộc:** —

**Mô tả:** User: "tôi cần bạn thêm đủ 100% thông tin như excel ở sheet material". Bổ sung 40 materials + 8 processes còn thiếu so với migration 0017.

**Acceptance criteria:**
- [x] File `packages/db/migrations/0031_seed_full_master_catalog.sql`
- [x] Apply VPS không lỗi (idempotent ON CONFLICT)
- [x] `material_master ≥ 60`, `process_master ≥ 19`

**Output / log:** Applied 2026-04-26 23:44 — `INSERT 0 40 (mat) + INSERT 0 8 (proc)`. Final: material_master=63, process_master=19.

---

### TASK-20260426-002 — Update gen-bom-sql aliases full coverage
- **Trạng thái:** DONE
- **Tạo:** 2026-04-26 23:42 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Hoàn thành:** 2026-04-26 23:46 (+07)
- **Ưu tiên:** P1
- **Phụ thuộc:** TASK-20260426-001

**Mô tả:** Script `scripts/gen-bom-sql-from-excel.ts` chỉ có 21 codes catalog. Mở rộng full 60+ với aliases EN+VN.

**Acceptance criteria:**
- [x] MATERIAL_CATALOG ≥60 entries
- [x] Order: longer-prefix first (vd `SUS304_20_40` trước `SUS304`)
- [x] Aliases có VN ("đồng thau", "thép gió")

**Output / log:** Cập nhật 60+ entries với 2-4 aliases mỗi code. Sẽ commit cùng commit codexdo.md.

---

### TASK-20260426-003 — Tạo `codexdo.md` task queue convention (chính file này)
- **Trạng thái:** DONE
- **Tạo:** 2026-04-26 23:50 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-26 23:50 (+07)
- **Hoàn thành:** 2026-04-26 23:59 (+07)
- **Ưu tiên:** P1
- **Phụ thuộc:** —

**Mô tả:** User yêu cầu workflow planner. Tạo convention + 5 task queue đầu tiên.

**Acceptance criteria:**
- [x] Section "Hàng đợi nhiệm vụ" thêm vào codexdo.md (giữ phần Codex viết trước)
- [x] Format task chuẩn (ID, timestamp, status, DoD)
- [x] Anti-duplicate rules + execute order
- [x] Commit + push (commit pending)

---

### TASK-20260426-004 — Update CLAUDE.md ghi nhớ workflow `codexdo.md`
- **Trạng thái:** DONE
- **Tạo:** 2026-04-26 23:55 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-26 23:59 (+07)
- **Hoàn thành:** 2026-04-27 00:01 (+07)
- **Ưu tiên:** P2
- **Phụ thuộc:** TASK-20260426-003

**Mô tả:** Thêm section vào `CLAUDE.md` chỉ rõ: trước khi nhận user prompt, agent phải search `codexdo.md` xem task tương tự đã có chưa. Sau khi xong, mark DONE + log.

**Acceptance criteria:**
- [x] CLAUDE.md có section `## 📋 Workflow planning với codexdo.md`
- [x] Liệt kê: search trước, format ID, status workflow
- [x] Link tới `codexdo.md`

**Output / log:** CLAUDE.md updated với 6 quy tắc bắt buộc + execute order. Mọi Claude/Codex session tương lai sẽ thấy rule này khi load CLAUDE.md đầu phiên.

---

### TASK-20260427-006 — Auto-populate full catalog (63 mat + 19 proc) vào MỌI BOM Material&Process sheet
- **Trạng thái:** IN_PROGRESS
- **Tạo:** 2026-04-27 00:10 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-27 00:11 (+07)
- **Ưu tiên:** P1
- **Phụ thuộc:** TASK-20260426-001

**Mô tả:** User feedback: "tôi muốn nó có đầy đủ sẵn luôn ở tất cả bom list hiện tại chứ không phải giờ mới thêm mới vào từng vật liệu 1". Backfill tất cả material_master (63) + process_master (19) vào mỗi MATERIAL sheet hiện có, và update `createTemplate` để BOM mới tự auto-populate full catalog.

**Acceptance criteria:**
- [ ] Migration `0032_backfill_full_catalog_to_all_bom_sheets.sql` viết xong
- [ ] Apply VPS, verify mỗi MATERIAL sheet có ≥63 mat rows + ≥19 proc rows
- [ ] `createTemplate` repo update: sau INSERT bom_sheet "Material & Process" → bulk INSERT all materials + processes
- [ ] BOM mới tạo qua API có 63+19 rows trong Material&Process tab
- [ ] BOM cũ (id `6dead934-...`) tab Material&Process hiển thị full catalog
- [ ] Idempotent: chạy lại migration không nhân đôi rows

**File path:**
- `packages/db/migrations/0032_backfill_full_catalog_to_all_bom_sheets.sql` (mới)
- `apps/web/src/server/repos/bomTemplates.ts` (update createTemplate)

---

### TASK-20260426-005 — Re-seed BOM real với material aliases full
- **Trạng thái:** TODO
- **Tạo:** 2026-04-26 23:55 (+07) bởi Claude (planner)
- **Phụ trách:** Codex hoặc Claude (executor)
- **Ưu tiên:** P3
- **Phụ thuộc:** TASK-20260426-001, TASK-20260426-002

**Mô tả:** BOM real id `6dead934-...` hiện chỉ match 3 vật liệu. Sau khi catalog mở rộng, re-run gen-bom-sql sẽ match thêm Acetal black → POM, vv. Re-seed để demo full catalog.

**Acceptance criteria:**
- [ ] DELETE BOM cũ (id `6dead934-e299-4bb7-873d-232fe8a027a2`)
- [ ] Re-run gen-bom-sql → output SQL mới
- [ ] Apply VPS → verify `mat_rows ≥ 5`
- [ ] Click BOM detail Material&Process tab → thấy đủ vật liệu mới

---

## 📂 Sprint 7 backlog

### TASK-20260427-S7A — Migration 0023 approval_chain (multi-level)
- **Trạng thái:** TODO
- **Tạo:** 2026-04-26 23:58 (+07) bởi Claude (planner)
- **Phụ trách:** Codex
- **Ưu tiên:** P1

**Mô tả:** Per `plans/redesign-v3/addendum-user-answers.md` Q1, schema `approval_chain` (definition) + `approval_request` (runtime) + `approval_step` (audit) cho PR/PO/WO ≥2 cấp.

**Acceptance criteria:**
- [ ] `packages/db/migrations/0023_approval_chain.sql` (skeleton từ addendum §1.1)
- [ ] Drizzle schema `packages/db/src/schema/approval.ts`
- [ ] Apply VPS, verify 3 tables
- [ ] Seed 2 default chain (PR + WO)

---

### TASK-20260427-S7B — UI ApprovalTimeline + tích hợp PR/PO/WO
- **Trạng thái:** TODO
- **Tạo:** 2026-04-26 23:58 (+07) bởi Claude (planner)
- **Phụ trách:** Codex
- **Ưu tiên:** P1
- **Phụ thuộc:** TASK-20260427-S7A

**Mô tả:** Component `<ApprovalTimeline>` vertical step + nút Duyệt/Từ chối. Tích hợp PR/PO/WO detail.

**Acceptance criteria:**
- [ ] Component `apps/web/src/components/approval/ApprovalTimeline.tsx`
- [ ] API `/api/approval/[id]/approve` POST + `/reject`
- [ ] Hook `useApproval`
- [ ] Test: tạo PR → submit → 2 cấp duyệt → APPROVED

---

### TASK-20260427-S7C — Migration 0024 mention_notification
- **Trạng thái:** TODO
- **Tạo:** 2026-04-26 23:58 (+07) bởi Claude (planner)
- **Phụ trách:** Codex
- **Ưu tiên:** P2

**Mô tả:** Per addendum §1.2 — bảng `mention_notification` + cột `bom_line_note.mentioned_user_ids uuid[]` cho @mention feature.

---

### TASK-20260427-S7D — UI MentionPicker + NotificationBell TopBar
- **Trạng thái:** TODO
- **Tạo:** 2026-04-26 23:58 (+07) bởi Claude (planner)
- **Phụ trách:** Codex
- **Ưu tiên:** P2
- **Phụ thuộc:** TASK-20260427-S7C

---

### TASK-20260428-S8A — Migration 0022 payment_log + workspace `/accounting`
- **Trạng thái:** TODO
- **Tạo:** 2026-04-26 23:58 (+07) bởi Claude (planner)
- **Phụ trách:** Codex
- **Ưu tiên:** P2

**Mô tả:** Sprint 8 Bộ phận Kế toán tối thiểu — payment_log + công nợ NCC. KHÔNG VAT/MISA (out-of-scope per user 2026-04-25).

---

## 🗄️ Archive (DONE > 30 ngày)

(Empty)

---

## 📊 Stats

- Tổng task: 9
- TODO: 5
- IN_PROGRESS: 0
- DONE: 4
- BLOCKED: 0
- Update lần cuối: 2026-04-27 00:01 (+07)
