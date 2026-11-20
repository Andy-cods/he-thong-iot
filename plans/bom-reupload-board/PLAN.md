# PLAN — Nhập lại BOM (ghi đè) · Xoá vĩnh viễn BOM · BOM kích hoạt → Bảng sản xuất

Nhánh `feat/bom-reupload-board` (từ origin/main 39102d3). Migration **0088_board_bom_link.sql**.

## 0. Điều tra FK (kết quả)

Bảng tham chiếu `bom_line(id)`:

| Bảng.cột | ON DELETE | Hệ quả khi xoá dòng BOM |
|---|---|---|
| bom_asset? (không — asset dedup, không FK line) | — | — |
| bom_line_change.line_id | CASCADE | mất lịch sử sửa dòng (chấp nhận, đã có bản lưu revision) |
| bom_sheet_material_row / process_row.component_line_id | SET NULL | ok |
| work_order.bom_line_id | SET NULL | **WO mất liên kết dòng → coi là CHẶN** |
| bom_stage_move.line_id | NO ACTION (append-only) | **CHẶN** (23503) |
| delivery_slip_line.line_id | NO ACTION | **CHẶN** |
| eco_line.target_line_id | NO ACTION | **CHẶN** |
| order_bom_snapshot.source_bom_line_id (bảng cũ) | NO ACTION | **CHẶN** (kiểm `to_regclass` vì có thể không tồn tại) |

Đơn hàng (bom_snapshot_line) explode từ `bom_revision.frozen_snapshot` (JSON), **không FK tới bom_line** → thay dòng không ảnh hưởng đơn đã snapshot.

Bảng tham chiếu `bom_template(id)`: bom_line/bom_sheet/bom_revision/product_line_member CASCADE; material_request, work_order SET NULL; **sales_order, eco_change, delivery_slip NO ACTION**; bom_snapshot_line → bom_revision NO ACTION (đơn đã explode từ revision của BOM).

## 1. Issue 1 — Nhập lại BOM bị bỏ qua âm thầm

### Quyết định
- `duplicateMode` mở rộng: `skip | upsert | error | replace | new_code` (+ `newCode` tuỳ chọn). Giữ tương thích API; **`upsert` = alias của `replace`** (hành vi cũ "nối thêm" sinh BOM đôi → bỏ).
- **Ghi đè (`replace`)**, trong 1 transaction ở worker:
  1. Khoá template `FOR UPDATE`; đếm tham chiếu dòng (bảng chặn ở §0). Có tham chiếu → batch `failed` + thông báo tiếng Việt "BOM X đã có tiến độ/phiếu giao/lệnh SX… — không ghi đè được, hãy chọn Tạo BOM mới với mã khác".
  2. Nếu BOM cũ có dòng → lưu **bản sao lưu** = 1 `bom_revision` status `SUPERSEDED` (frozen_snapshot cùng format releaseRevision, số R kế tiếp, notes "Bản lưu tự động trước khi ghi đè từ file …"). Không phát hành bản mới (đơn hàng chọn revision tường minh; BOM ACTIVE vẫn sửa dòng được như hiện nay).
  3. Xoá toàn bộ `bom_line` của template, ghi dòng mới (vị trí từ 1), cập nhật name / target_qty / metadata (`importedFromBatch`, `lastReplacedAt`, `replacedFromFile`).
  4. Trạng thái: DRAFT→DRAFT, ACTIVE→ACTIVE, **OBSOLETE→DRAFT** (khớp quy tắc PATCH: ngừng dùng chỉ khôi phục về Nháp; muốn dùng phải Kích hoạt lại → tự lên Bảng SX).
  5. BOM có dòng Bảng SX liên kết (`bom_template_id`) đang QUEUED → cập nhật tên + SL kế hoạch (+history).
- **Tạo mã mới (`new_code`)**: mã do người dùng chọn (gợi ý `<code>-V2`, `-V3`… mã trống đầu tiên); nếu lúc commit đã bị chiếm → worker tự lấy hậu tố trống kế tiếp. BOM cũ không đụng.
- **Huỷ**: quay lại bước tải file (không commit).
- Kết quả rõ ràng: worker ghi `preview_json.outcomes[]` `{action, templateId, templateCode, linesWritten, linesRemoved, backupRevisionNo, previousStatus, newStatus, message}`; `/status` trả `outcomes`; màn Kết quả in câu "Đã thay 63 dòng của BOM … (bản cũ 58 dòng lưu ở R02)" hoặc "Bỏ qua vì …" (tông vàng, KHÔNG hiện "thành công").
- Áp dụng cho cả đường cổ điển (mã = tên sheet) — mỗi sheet 1 outcome.

### API
- `POST /api/bom/imports/upload` → thêm `conflicts[]`: `{code, sheetName?, templateId, name, status, lineCount, blockers:[{kind,count,label}], suggestedNewCode}`; trường hợp dùng lại phiên (reused) cũng tính lại.
- `POST /api/bom/imports/[id]/commit` → nhận `duplicateMode` mới + `newCode`.
- `GET /api/bom/imports/[id]/status` → thêm `outcomes`.

### UI (BomImportWizard)
- Bỏ ô "Xử lý BOM code trùng" ở bước Tải file.
- Bước xem trước: khối `BomDuplicatePanel` khi có trùng: "Mã BOM X đã tồn tại — n dòng · trạng thái …" + 3 lựa chọn (Thay bằng bản mới — mặc định, bị khoá kèm lý do nếu có tham chiếu; Tạo BOM mới với mã khác [ô mã]; Huỷ). Không trùng → gửi `error` (đua tranh hiếm → báo lỗi rõ, không âm thầm).

## 2. Issue 2 — Xoá hàng loạt BOM ngừng dùng "0 thành công, 11 lỗi"
- `DELETE ?hard=true`: kiểm trước tham chiếu (đơn hàng, đơn đã explode từ revision, ECO, phiếu giao, sổ bước, lệnh SX còn mở…) → 409 `HAS_REFERENCES` với câu liệt kê cụ thể; vẫn bắt 23503 dự phòng. Cascade lo sheet/line/revision/member; board/material_request/work_order SET NULL.
- `BomTab`: hàng loạt → ACTIVE/DRAFT = ngừng dùng (soft), OBSOLETE = xoá vĩnh viễn (admin; không phải admin → lỗi "chỉ admin"). Toast liệt kê từng BOM lỗi `mã: lý do`. Hộp xác nhận nói rõ số BOM sẽ bị xoá vĩnh viễn.
- Menu ⋯ (bảng) / thẻ: BOM OBSOLETE hiện "Xoá vĩnh viễn" (chỉ admin), hộp xác nhận "không hoàn tác được".

## 3. Issue 3 — Kích hoạt BOM → dòng Bảng sản xuất (QC)
- Migration: `production_board_item.bom_template_id uuid NULL FK → bom_template ON DELETE SET NULL` + index; `import_duplicate_mode` thêm `replace`,`new_code`; backfill 3 BOM 618823/618824/618841 (idempotent: link dòng chưa giao cùng mã nếu có, không thì tạo QUEUED + history `create`).
- Chuẩn hoá mã (shared, có test): `Z0000002-622582-BOM-TRI-N-KHAI` → `Z0000002-622582` (regex `[A-Z]\d{6,8}-\d{4,}`), không khớp → mã gốc.
- `syncBoardFromBom()` (repo): khi BOM **chuyển sang ACTIVE** (POST revisions DRAFT→ACTIVE và PATCH status→ACTIVE):
  - Có dòng chưa DELIVERED cùng mã chuẩn hoá / cùng `bom_template_id` → chỉ link (set `bom_template_id` nếu null); nếu QUEUED → cập nhật tên/SL; trường tuỳ chọn nhập lúc kích hoạt (hạn/RFQ/khách) ghi đè nếu người dùng có nhập.
  - Không có → tạo QUEUED: mã chuẩn hoá, tên bỏ tiền tố "BOM TRIỂN KHAI —"/mã, SL = target_qty, ĐVT "Bộ" (mẫu triển khai) / "Pcs", hạn trống. History `create` + audit + thông báo vai QC "BOM X vừa kích hoạt — cần điền ngày giao" (event mới `BOARD_BOM_ACTIVATED`).
  - Lỗi đồng bộ không làm hỏng việc kích hoạt (log + trả `board: null`).
  - BOM → OBSOLETE: không đụng board.
- Hộp "Kích hoạt BOM" (ReleaseRevisionDialog, khi BOM đang Nháp): thêm khối tuỳ chọn Ngày cần giao / Số QT-RFQ / Khách hàng.
- Đếm ngược (lib `board-deadline.ts`, giờ Asia/Ho_Chi_Minh, có test): "Còn N ngày" / "Hôm nay" / "Quá N ngày"; đỏ quá hạn, vàng ≤3 ngày; chưa giao mà không có hạn → pill vàng "Chưa có ngày giao". Hiện ở trang quản lý + TV.
- Sắp xếp dòng mở (server): ghim → hạn gần nhất (quá hạn lên đầu) → **không có hạn xếp sau** (đã gắn cờ vàng) → trạng thái → seq.
- Trang quản lý: bấm mã hàng → `/bom/<id>` khi có liên kết và vai được vào /bom.

## Test
- shared: chuẩn hoá mã board, tên SP, ĐVT, mã sheet/triển khai, mã trống kế tiếp, mô tả outcome, schema commit mới.
- web: đếm ngược + giờ VN, so sánh sắp xếp board, plan thông báo mới (bảng link × vai), quyết định xoá hàng loạt (soft/hard/không được) + gộp lý do lỗi, kế hoạch sync board (tạo/link/cập nhật).
- worker: kế hoạch ghi đè (trạng thái mới, chặn theo tham chiếu, snapshot).
- typecheck web/worker/shared/db; build web.

## Rủi ro deploy
- Chạy migration 0088 TRƯỚC khi lên code (cột `bom_template_id` được select ở list board).
- Worker + web cùng lúc (job data mới `newCode`, outcome).
