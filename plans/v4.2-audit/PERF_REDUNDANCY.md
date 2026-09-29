# V4.2 — Audit hiệu năng & thừa thãi (đợt sau Đợt 7 dọn dẹp)

- **Ngày:** 2026-09-30 (+07)
- **Phương pháp:** chỉ đọc code + SELECT trên prod (mes.songchau.vn, VPS `45.124.94.13`). Không sửa code, không ghi dữ liệu. Đã đọc trước `plans/v4.1-audit-hoan-thien/AUDIT.md` + `codexdo.md` (Đợt 7 đã xoá 14 trang, ~50 component/hook mồ côi, API product-lines/dashboard-overview/purchase-requests-approve/work-orders-quick, dep `@dnd-kit/*`) để không báo trùng.
- **Bối cảnh dữ liệu:** hệ thống còn RẤT MỚI/ít dữ liệu — bảng lớn nhất (`bom_line`) mới 2.176 dòng, phần lớn nghiệp vụ (PO/PR/WO/Tài chính) dưới 50 dòng. Nhiều kết luận "P0/P1 tiềm năng" ở AUDIT.md cũ được hạ mức ở đây vì **quy mô dữ liệu chưa đủ lớn để gây chậm thực sự** — nhưng vẫn đáng sửa sớm vì rẻ và sẽ nặng dần.
- **Mức:** P0 = phải xử lý ngay (bảo mật/mất dữ liệu) · P1 = nên làm sớm (rẻ, lợi ích rõ) · P2 = cải thiện khi rảnh tay · P3 = ghi nhận, không cấp thiết.

## Tóm tắt

| # | Phát hiện | Vị trí | Số liệu đo được | Mức | Đề xuất |
|---|---|---|---|---|---|
| 1 | 4 tài khoản `e2e.*` **active + có session thật** trên prod | `user_account` (username `e2e.planner/warehouse/purchaser/operator`) | Tạo 22/9, login thật 27/9 (4-6 session/tài khoản) | **P0** | Vô hiệu hoá hoặc đổi mật khẩu mạnh + audit hành động đã làm; chuyển test sang môi trường riêng |
| 2 | API `eco/**`, `shortage`, `dashboard/wo-trend` mồ côi hoàn toàn (0 caller kể cả code ẩn) | `src/app/api/eco/**` (7 file), `api/shortage/route.ts`, `api/dashboard/wo-trend/route.ts` | Grep 0 kết quả trong toàn bộ `src/` | P2 | BỎ (AUDIT.md ghi "giữ API+DB" cho ECO nhưng nay xác nhận không còn nơi nào gọi kể cả UI ẩn) |
| 3 | 5 dependency không dùng | `package.json`: `rxjs`, `zustand`, `@tanstack/react-table`, `@radix-ui/react-progress`, `@radix-ui/react-separator` | 0 import trong `src/` | P2 | Gỡ khỏi `package.json`, giảm `pnpm install` + attack surface |
| 4 | N+1 trong convert PR→PO (nhập tay) | `server/repos/purchaseOrders.ts:577-665` | Tối đa ~4-6 round-trip DB/dòng PR nhập tay, giữ lock `FOR UPDATE` cả PR | P1 | Batch UPDATE/INSERT thay vòng lặp; tránh giữ khoá lâu khi PR nhiều dòng |
| 5 | N+1 khi clone BOM template | `server/repos/bomTemplates.ts:576-604` | N INSERT tuần tự cho N dòng BOM (BOM thực tế project có thể vài trăm dòng) | P1 | Batch insert theo level cha-con |
| 6 | `recharts` (CashflowChart) load tĩnh vào mọi tab `/sales` | `app/(app)/sales/page.tsx:15` import top-level `OverviewTab` | Chunk recharts tải cả khi xem tab PO/NCC, không riêng tab Tài chính | P2 | `next/dynamic(..., {ssr:false})` cho `CashflowChart`/`OverviewTab` |
| 7 | `NotificationBell` poll 30s toàn cục, không có cách giãn/tắt theo ngữ cảnh | `components/layout/NotificationBell.tsx:68` | Ước tính ~15.000 query/ngày với 8 user hoạt động 8h — chiếm ~40% tổng polling | P2 | Tăng lên 60s hoặc chuyển SSE/push khi cần thiết hơn |
| 8 | `production_board_item` seq_scan rất dày do 3 nơi cùng poll board | `board/page.tsx` (15s), `ProductionBoardWidget.tsx` (30s), `useProductionBoard.ts` | `pg_stat_user_tables`: 170.309 seq_scan / 32,4 triệu tuple đọc cho bảng chỉ 250 dòng | P2 | Giữ nguyên (bảng nhỏ, seq scan rẻ) nhưng cân nhắc giãn interval nếu mở nhiều màn TV cùng lúc |
| 9 | 89 cột FK thiếu index (chủ yếu cột `*_by` audit trail) | Toàn schema `app`, liệt kê ở mục B4 | Bảng lớn nhất liên quan mới 2.176 dòng | P3 | Chưa cấp thiết; thêm index khi bảng lớn dần (ưu tiên `inventory_txn.from_bin_id/to_bin_id`, `bom_line.parent_line_id`) |
| 10 | 40 index có `idx_scan=0` (chưa từng dùng) | `pg_stat_user_indexes`, ví dụ `bom_line_desc_trgm_idx`, `item_sku_trgm_idx` | Xem bảng chi tiết mục B3 | P3 | Bình thường với dữ liệu còn ít (trgm/search index chưa có truy vấn thật); giữ nguyên, không xoá |
| 11 | Thư mục backup thủ công cũ `/opt/hethong-iot/backups/` không rotate | VPS, 19 file `.dump`/`.sql.gz` kiểu "pre-<migration>" | 7,7 MB, không có script dọn | P3 | Dọn thủ công định kỳ hoặc thêm rotate; backup tự động thật (`/var/backups/iot`, cron 3h sáng, retention 7 ngày) hoạt động đúng, không phải lo |
| 12 | Comment lỗi thời nhắc "demo stub" đã không còn tồn tại | `api/po/[id]/route.ts` | Code đã bỏ fallback demo, chỉ còn comment cũ | P3 | Sửa comment khi tiện tay |

**Điểm tốt đáng ghi nhận (không cần sửa):** response time thực đo <100ms cho hầu hết trang (health/login/redirect trang chính); pagination kỷ luật tốt trên toàn bộ list API kiểm tra (`notifications`, `activity-log`, `inventory/balance`); upload validate chặt (magic-byte sniffing, giới hạn 20MB Excel / 10MB đính kèm, tên file UUID); `exceljs`/`@react-pdf/renderer` chỉ dùng server-side, không lọt bundle client; `react-diff-viewer-continued` đã lazy-load đúng qua `next/dynamic`; BullMQ chỉ 2 job định kỳ (1h + 1 ngày/lần), không có job lặp dày; tài nguyên VPS rất dư (RAM dùng 1,4/8GB, disk 12/58GB, CPU idle); backup tự động DB đúng lịch + retention.

---

## A. Thừa thãi / không phù hợp

### A1. Dữ liệu thực tế theo bảng (SELECT trực tiếp trên prod, 2026-09-30)

Bảng có dữ liệu thật, đang dùng (khớp audit_event 30 ngày):
`bom_line` 2.176 · `item` 864 · `audit_event` 734 · `inventory_txn` 508 · `inventory_lot_serial` 490 · `production_board_item` 250 · `item_supplier` 273 · `bom_template` 27 · `supplier` 50 · `purchase_request`/`purchase_order` 10/6 · `fin_invoice`/`fin_transaction`/`fin_payment` 11/19/5 · `work_order` 2.

Bảng **0 dòng tuyệt đối** (không phải chỉ thiếu audit — bảng thật sự rỗng), khớp các tính năng đã chủ động ẩn theo Q4/D10 trong AUDIT.md V4.1:
`sales_order`, `eco_change`, `warehouse_issue_request` (có audit event nhưng 0 dòng hiện tại — đã xử lý hết), `material_request`/`material_request_line`, `bom_snapshot_line`, `goods_issue`/`goods_issue_line` (mới, có 3 sự kiện audit 26/9 rồi dừng), `delivery_note`/`delivery_note_line`. Kiểm thêm bằng SELECT COUNT trực tiếp: `reservation`=0, `qc_check`=0, `assembly_order`=0, `fg_serial`=0.

→ **Kết luận: quyết định ẩn Đơn hàng bán / ECO / Lắp ráp kiểu cũ / Thiếu vật tư (Q4/D10, đã làm ở Đợt 4-7) là đúng — dữ liệu xác nhận các module này chưa từng được dùng thật.** Không cần làm gì thêm ở phần này, chỉ nên dọn nốt API mồ côi liên quan (xem A2).

### A2. API mồ côi phát sinh sau Đợt 7 (0 caller trong toàn bộ `src/`, đã grep xác nhận)

- `src/app/api/eco/**` — 7 file (`route.ts`, `[code]/route.ts`, `/submit`, `/approve`, `/reject`, `/apply`, `/affected-orders`). AUDIT.md V4.1 ghi "giữ API + DB" cho ECO khi ẩn UI, nhưng xác nhận lại lần này: **0 nơi trong code (kể cả UI đã ẩn) còn gọi các route này.**
- `src/app/api/shortage/route.ts` — GET aggregate + POST refresh materialized view, 0 caller (khác với `purchase-requests/from-shortage` vẫn dùng — cái đó giữ nguyên).
- `src/app/api/dashboard/wo-trend/route.ts` — route trend 7 ngày có cache Redis riêng, Dashboard V2 hiện tại không gọi.

Đề xuất: BỎ (xoá file) cả 3 nhóm trên — rủi ro thấp vì đã xác nhận 0 caller và bảng liên quan (eco_change, work_order trend) không có traffic thật. Nếu muốn thận trọng hơn có thể để lại 1-2 sprint nữa rồi xoá cùng đợt dọn dẹp kế tiếp.

### A3. Dependency không dùng trong `package.json`

Grep 0 kết quả trong toàn bộ `src/` cho: `rxjs`, `zustand`, `@tanstack/react-table` (đã ghi chú trong AUDIT.md cũ "đã cài, chưa dùng" — xác nhận vẫn chưa dùng, bảng chuẩn tự viết `<table>` thuần), `@radix-ui/react-progress`, `@radix-ui/react-separator` (đã có `Separator` riêng viết tay trong `breadcrumb.tsx`, và `dropdown-menu.tsx` dùng `Separator` từ package `@radix-ui/react-dropdown-menu` khác). Đề xuất gỡ cả 5 khỏi `dependencies`.

### A4. Tài khoản test trên production (P0 — mục quan trọng nhất)

```
username        full_name              is_active  created_at            sessions  last_login
e2e.planner     E2E Test — Thiết kế    true       2026-09-22 03:19      6         2026-09-27 08:39
e2e.warehouse   E2E Test — Kho         true       2026-09-22 03:19      5         2026-09-27 08:39
e2e.purchaser   E2E Test — Thu mua     true       2026-09-22 03:19      5         2026-09-27 08:39
e2e.operator    E2E Test — Gia công    true       2026-09-22 03:19      4         2026-09-27 08:39
```

4 tài khoản có tên rõ ràng là tài khoản kiểm thử tự động, **đang active** trên hệ thống production thật (không phải môi trường staging), và có **session đăng nhập thật** (không chỉ tạo ra rồi bỏ quên) gần nhất 27/9. Rủi ro: nếu mật khẩu các tài khoản này yếu/mặc định (thường gặp ở tài khoản E2E), đây là 4 cửa vào hệ thống với đủ 4 vai trò nghiệp vụ chính (planner/warehouse/purchaser/operator) mà không ai để ý theo dõi thường xuyên như tài khoản người thật. Không tìm thấy dữ liệu demo/test nào khác sót trong `bom_line`, `item`, `supplier` (grep `[DEMO]`/`test`/`e2e.` đều 0 dòng) — vấn đề chỉ nằm ở 4 user account này.

**Đề xuất:** vô hiệu hoá (`is_active=false`) hoặc xoá 4 tài khoản này nếu không còn phục vụ E2E test thật; nếu vẫn cần cho CI/E2E thì đặt mật khẩu ngẫu nhiên mạnh + luân phiên, và tách khỏi database production (best practice: E2E chạy trên DB riêng/staging). Nên rà `audit_event` theo `actor_user_id` của 4 account này để chắc chắn không có hành động ảnh hưởng dữ liệu thật ngoài ý muốn (test chạy nhắm nhầm vào prod).

### A5. Việc khác đã kiểm tra — KHÔNG có vấn đề mới

- Trang/menu, component trong `components/{dashboard,orders,finance,procurement,warehouse,work-orders,bom-workspace}`: không còn file 0-import nào (Đợt 7 đã dọn sạch).
- Toàn bộ route "nghi ngờ mồ côi" ngoài nav-items (`/orders`, `/items*`, `/lot-serial`, `/bom/new`, `/bom/import`, `/suppliers*`, `/me/*`, `/admin/reports/*`, `/work-orders/new-lsx`, `/procurement/purchase-requests/new-dnvt|new-mrf`, `/finance`) đều có ít nhất 1 link nội bộ hợp lệ — không mồ côi.
- Không có thư mục `api/dev/**` hay endpoint debug/seed nào tồn tại trong code hiện tại.
- File `api/po/[id]/route.ts` còn 1 dòng comment lỗi thời nhắc "demo stub" đã bị bỏ khỏi code thật (P3, chỉ là comment).

---

## B. Hiệu năng

### B1. N+1 query trong repos (đọc code trực tiếp, xác nhận bằng số dòng)

**P1 — `server/repos/purchaseOrders.ts:577-665`** (hàm tạo PO từ PR, nhánh dòng nhập tay/không có `itemId`):
```
for (const line of freetext) {
  const resolvedItemId = await findOrCreateItemForLine(tx, line, userId); // 2-6 SELECT + có thể 1 INSERT
  await tx.update(purchaseRequestLine).set({ itemId: resolvedItemId })...  // 1 UPDATE riêng/dòng
}
```
`findOrCreateItemForLine` có sub-loop tối đa 6 lần dò trùng SKU tự sinh. PR 20-30 dòng nhập tay → hàng trăm round-trip trong 1 transaction đang giữ khoá `FOR UPDATE` trên PR (dòng 561) → nghẽn nếu 2 người convert PR đồng thời. Tương tự các vòng lặp update từng dòng ở 614-625 (supplier override) và 640-660 (fallback auto-pick NCC) — nên gộp thành 1 câu UPDATE...FROM (VALUES) hoặc 1 JOIN LATERAL.

**P1 — `server/repos/bomTemplates.ts:576-604`** (clone BOM template): N dòng BOM → N INSERT tuần tự (cần map parentLineId cũ→mới nên không dùng batch insert đơn giản được). BOM project thực tế có thể vài trăm dòng → vài trăm round-trip giữ transaction lâu khi clone. Đề xuất: batch insert theo từng "level" (dòng không phụ thuộc nhau trong cùng cấp cha-con insert 1 lượt).

**P3 — `purchaseOrders.ts:470-478, 523-531`**: retry loop sinh mã SKU/NCC tự động, tối đa 6 và 60 lần SELECT tuần tự trong trường hợp xấu (nhiều trùng liên tiếp) — hiếm khi chạm giới hạn, ưu tiên thấp.

Đã rà kỹ và **không phát hiện N+1 đáng kể** trong `workOrders.ts`, `receivingEvents.ts`, `items.ts`, `inventory.ts`, `assemblies.ts`, `finInvoices.ts` — các file này dùng JOIN/CTE hoặc `Promise.all` cho query độc lập đúng cách.

### B2. List API phân trang — kỷ luật tốt, không có vấn đề lớn

Đã kiểm `notifications` (limit 30/max 100 + cursor), `activity-log` (limit 1-50), `inventory/balance` (page/pageSize max 500 qua zod) — đều có giới hạn rõ ràng. Chỉ 2 điểm nhỏ P3: `items/[id]/bom-usages` không có `.limit()` nhưng tự nhiên bị chặn theo `component_item_id` (ít dòng); `lotSerialHistory.ts` UNION ALL 4 nguồn theo 1 lot không có LIMIT trên timeline — nên thêm LIMIT + "xem thêm" cho lot tồn tại lâu.

### B3. Bundle & lazy-load

Không có bundle analyzer trong `next.config.js`. `exceljs` (chunk 934KB uncompressed) đã tách đúng qua `next/dynamic` trong `ImportWizard.tsx` (xác nhận qua `react-loadable-manifest.json`) — không nằm trong bundle chính. Mọi import `exceljs`/`@react-pdf/renderer` khác đều ở `src/app/api/**` hoặc `src/server/services/**` (server-only, không lọt client). `react-diff-viewer-continued` cũng đã lazy qua `next/dynamic` (`AuditRow.tsx`). Tổng chunk JS local build (27/9): 3,29MB uncompressed (nhiều chunk lazy, không tải cùng lúc).

**Phát hiện P2 xác nhận:** `app/(app)/sales/page.tsx:15` import tĩnh `OverviewTab` (chứa `CashflowChart` dùng `recharts`) ở top-level — mọi lượt vào `/sales` (kể cả đang xem tab PO/NCC) đều tải chunk `recharts` dù chỉ tab "Tài chính › Tổng quan" mới dùng đến. Đề xuất bọc `next/dynamic(() => import(".../OverviewTab"), { ssr: false })` như đã làm với `AuditDiffViewer`.

### B4. Database — kích thước, index, seq scan

**Kích thước bảng (top, `pg_total_relation_size`):** `bom_line` 1,84MB · `item` 784kB · `audit_event` 760kB · `session` 680kB · `import_batch` 512kB · `inventory_txn` 496kB · `inventory_lot_serial` 360kB — toàn bộ DB còn rất nhỏ (không có bảng nào >2MB).

**Seq scan đáng chú ý (không phải vấn đề nghiêm trọng, ghi nhận xu hướng):**
```
production_board_item   170.309 seq_scan · 32.395.577 tuple đọc · 250 dòng
user_account             132.655 seq_scan ·  1.077.566 tuple đọc ·  15 dòng
inventory_txn            100.800 seq_scan · 18.653.698 tuple đọc · 508 dòng
bom_line                  28.019 seq_scan ·  7.865.463 tuple đọc · 2.176 dòng
```
Nguyên nhân xác định: `listBoardItems()`/`countBoardByStatus()` (`server/repos/productionBoard.ts:52-72,104+`) không filter hiệu quả (SELECT gần như toàn bảng) VÀ được poll từ 3 nơi cùng lúc (`board/page.tsx` 15s, `ProductionBoardWidget.tsx` 30s, `useProductionBoard.ts` mặc định 15s). Với bảng 250 dòng, seq scan vẫn rẻ (không đáng lo về CPU/latency thực đo), nhưng là dấu hiệu **tần suất polling cao hơn cần thiết** — nên cân nhắc giãn interval nếu số màn hình TV/dashboard mở đồng thời tăng lên.

**Index chưa từng dùng (`idx_scan=0`, 40 index, top theo dung lượng):** `bom_line_desc_trgm_idx` (224kB), `item_sku_trgm_idx` (192kB), `session_token_uk` (144kB), `item_name_unaccent_trgm_idx` (136kB), và ~36 index nhỏ khác (16-40kB, chủ yếu unique constraint + index lọc theo trạng thái). Đây là **hệ quả bình thường của dữ liệu còn ít** (index trgm/search phục vụ tính năng tìm kiếm mà người dùng thực tế chưa gõ đủ truy vấn để trigger planner chọn index) — KHÔNG đề xuất xoá, các index này đúng vai trò và sẽ được dùng khi dữ liệu/lượt tìm kiếm tăng.

**FK thiếu index:** 89 cột (liệt kê đầy đủ trong log audit), phần lớn là cột `*_by`/`*_id` phục vụ audit trail trên bảng rất nhỏ (0-50 dòng) → tác động hiện tại gần như bằng 0. Đáng chú ý nhất nếu cần ưu tiên khi dữ liệu lớn dần: `inventory_txn.from_bin_id`/`to_bin_id`, `bom_line.parent_line_id`, `item.created_by/updated_by`. Mức P3 — không cần làm ngay.

**`pg_stat_statements` chưa bật** (chỉ có extension `plpgsql, ltree, pg_trgm, unaccent`) → không đo được query chậm nhất theo thời gian thực thi tích luỹ. Đề xuất bật nếu muốn theo dõi định kỳ khi hệ thống có nhiều dữ liệu hơn (chi phí thấp, RAM còn dư nhiều).

### B5. Tài nguyên VPS

```
docker stats: iot_app 296MB · iot_worker 82MB · iot_postgres 115MB · iot_redis 9,5MB · iot_caddy 13MB
              (tổng ~516MB / 7,76GB RAM container limit)
free -m:      used 1.400MB / 7.941MB — dư 6.541MB available
df -h /:      12GB / 58GB dùng (21%)
```
Tài nguyên rất dư, không phải điểm nghẽn. `docker inspect` log size: `iot_app` 151KB, `iot_worker` 58KB, `iot_postgres` 1,3MB — không phình, không cần rotate thêm. `uploads/` trên VPS chỉ 8KB, chưa có dữ liệu thật đáng kể.

**Backup:** phát hiện 2 cơ chế song song — `/opt/hethong-iot/backup-db.sh` (retention 14 ngày, ghi vào `/opt/hethong-iot/backups/`) **không còn được cron gọi**; cron thật (`crontab -l`) chạy `/opt/iot-backup/backup-pg.sh` mỗi 3h sáng, ghi `/var/backups/iot/`, retention 7 ngày — **hoạt động đúng, verify log `iot-backup.log` chạy đều 20-28/9, dung lượng 5,9MB, dọn rác đúng lịch**. Thư mục `/opt/hethong-iot/backups/` còn 19 file dump thủ công kiểu "pre-<migration-name>" (trước mỗi đợt sửa DB rủi ro) không có script dọn — hiện chỉ 7,7MB nên chưa đáng ngại, nhưng nên dọn định kỳ thủ công vì sẽ tích tụ nếu tiếp tục làm backup thủ công trước mỗi migration.

### B6. Worker (BullMQ)

Chỉ 2 job định kỳ: `pr-reminder-scan-hourly` (mỗi 1h, `upsertJobScheduler` idempotent) và `fin-invoice-reminder-scan-daily` (cron `0 0 * * *` UTC = 7h sáng VN, 1 lần/ngày). Tần suất hợp lý, không có job lặp quá dày.

### B7. React Query refetch — không có lỗi guard, chỉ có 1 điểm nên tối ưu

`QueryProvider.tsx` set `refetchOnWindowFocus:false` toàn cục và mặc định TanStack Query tự dừng poll khi tab ở background — guard nền tốt, áp dụng cho mọi hook. Tất cả hook polling đều có `enabled` gắn với id/trạng thái đăng nhập hợp lý, không có hook nào gọi API khi chưa cần.

Điểm đáng chú ý: `NotificationBell.tsx:68` poll 30s **chạy toàn cục** (mount trong TopBar, hiện diện ở mọi trang sau khi đăng nhập) — ước tính với 8 user hoạt động 8h/ngày, riêng bell tạo ~7.680 request và ~15.360 query DB/ngày, chiếm phần lớn nhất trong tổng ước tính ~18.000-20.000 request/ngày từ mọi hook polling cộng lại. Ở quy mô VPS hiện tại (query/giây trung bình rất thấp) đây chưa phải vấn đề đo được, nhưng là mục rẻ để tối ưu (tăng lên 45-60s) khi cần giảm tải trước khi số user tăng lên nhiều lần.

### B8. Response time thực đo (curl, prod)

```
/                → 307 (redirect login) ~55-70ms (đo lại 3 lần sau khi loại trừ cold-start)
/api/health      → 200 ~55-80ms
/login           → 200 ~65ms
/warehouse, /production-board, /bom, /sales → 307 (chưa đăng nhập) ~55-80ms
```
Không có vấn đề độ trễ ở tầng network/app hiện tại — toàn bộ dưới 100ms cho response redirect/health.

### B9. Upload — đã đạt chuẩn, không cần sửa

`LIMITS.FILE_UPLOAD_MAX_BYTES = 20MB` áp dụng nhất quán cho mọi import Excel (BOM/items/finance). Đính kèm tài chính giới hạn 10MB, whitelist MIME, và **kiểm tra magic bytes thực tế** (không tin `file.type` từ trình duyệt) + tên file lưu dạng UUID (chống path traversal). Không phát hiện endpoint upload nào thiếu giới hạn.

---

## Đề xuất thứ tự xử lý

1. **Ngay (P0):** vô hiệu hoá/đổi mật khẩu 4 tài khoản `e2e.*`; rà audit_event của 4 actor này để loại trừ ảnh hưởng dữ liệu thật.
2. **Sớm, rẻ (P1):** batch hoá vòng lặp trong `purchaseOrders.ts` (convert PR→PO nhập tay) và `bomTemplates.ts` (clone BOM) — cả 2 đều là sửa cục bộ trong 1 hàm, không đổi API/schema.
3. **Khi rảnh tay (P2):** xoá API mồ côi `eco/**` + `shortage` + `dashboard/wo-trend`; gỡ 5 dependency không dùng; dynamic-import `OverviewTab`/`CashflowChart`; giãn interval `NotificationBell` lên 45-60s.
4. **Ghi nhận, chưa cấp thiết (P3):** FK thiếu index (ưu tiên `inventory_txn`, `bom_line.parent_line_id` khi bảng lớn dần); dọn thư mục backup thủ công cũ trên VPS; sửa comment lỗi thời trong `api/po/[id]/route.ts`; thêm LIMIT cho lot-serial history timeline; cân nhắc bật `pg_stat_statements` để theo dõi dài hạn.
