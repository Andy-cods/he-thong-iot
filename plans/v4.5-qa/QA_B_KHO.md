# QA-B — Nghiệm thu cuối: Bộ phận KHO

- Môi trường: STAGING `http://localhost:3100` (health 200 trước khi chạy). KHÔNG đụng prod, không sửa code/commit.
- Phương pháp: kết hợp UI thật (Playwright, 8 role riêng `qab.*`, cookie theo-role) + đối chiếu API (`/api/warehouse/bins/:id`, `/api/warehouse/layout`) để xác nhận TỒN trước/sau từng thao tác — không chỉ tin UI. Mọi dữ liệu tạo mới gắn `[QA-B]`.
- Môi trường DÙNG CHUNG: `git status` cho thấy QA-A và QA-D đang chạy song song trên cùng staging (`.tmp-qaA-*`, `.tmp-qaD-*`); 2 toast "gửi đề xuất" từ `QA A — planner`/`qac.operator` xuất hiện live trong lúc test xác nhận thực tế. Số liệu bin/báo cáo có thể trôi nhẹ giữa các bước do nhóm khác ghi đồng thời — không phải bug.
- Bin/lot chính dùng để test: `A-01-1-01` (id `16ecf3ca-…`), item `ROBAC30-12-L25-H0_5-Z0_0_B`, lô `1` — baseline 4 PCS, đã khôi phục đúng 4 PCS sau toàn bộ test (xác nhận qua API).

## 1. Bảng thao tác

| # | Thao tác | Vai | Chức năng | Tồn kỳ vọng/thực tế | Giao diện | Thông báo |
|---|---|---|---|---|---|---|
| 1 | Mở ô kệ A-01-1-01 (click thẻ) → sheet chi tiết | warehouse | PASS | — | Đạt (Apple-style, bo góc, rõ ràng) | — |
| 2 | THÊM tồn qua UI (dialog "Thêm hàng vào ô/kệ", chọn SKU, SL=1) | warehouse | PASS | 4→5, UI cập nhật realtime không reload | Đạt | Dialog đóng tự động sau submit |
| 3 | RÚT tồn API hợp lệ (-2) | warehouse | PASS | 9→7 (đúng) | — | — |
| 4 | RÚT quá tồn (9999) | warehouse | PASS (chặn đúng) | 409 `INSUFFICIENT_BIN`, tồn không đổi | — | "Lô 1 … chỉ còn X, không đủ xuất …" (VN, rõ số) |
| 5 | RÚT qty=0 / âm | warehouse | PASS (chặn đúng) | 422 VALIDATION_ERROR | — | rõ ràng |
| 6 | CHUYỂN sang chính ô đang đứng | warehouse | PASS (chặn đúng) | 400 `SAME_BIN` | — | "Bin nguồn và đích không được trùng" |
| 7 | CHUYỂN một phần (3 PCS) sang ô trống A-01-3-01 | warehouse | PASS | nguồn 7→4, đích 0→3 | — | — |
| 8 | CHUYỂN vượt tồn nguồn | warehouse | PASS (chặn đúng) | 409 `INSUFFICIENT_BIN` | — | "Tồn tại vị trí nguồn 4 < yêu cầu chuyển 999" |
| 9 | qc/operator thao tác PLUS/transfer trực tiếp bin | qc, operator | PASS (chặn đúng) | 403 FORBIDDEN | nút không hiện trong UI tương ứng | — |
| 10 | shareholder gọi layout kho | shareholder | PASS (chặn đúng) | 403 FORBIDDEN | menu "Bộ phận Kho" không hiện | — |
| 11 | Mã lô HOLD (qc Hold) → warehouse rút | qc hold, warehouse rút | PASS (chặn đúng) | 409 `LOT_NOT_AVAILABLE` — "đang bị giữ (HOLD) — không được xuất" | — | rõ |
| 12 | Mã lô HOLD → **admin** (Giám đốc) rút | admin | PASS | Admin rút được lô HOLD (hủy hàng lỗi) — đúng thiết kế | — | — |
| 13 | 2 request xuất cùng lô, cùng lúc (3+3+2, tồn=4) | warehouse+admin song song | PASS | Chỉ 1 request khớp tồn thành công (qty=2), 2 request kia 409 đúng số dư tại thời điểm chạy, tồn cuối = 2, không âm | — | — |
| 14 | Yêu cầu xuất kho từ "bộ phận khác" (Đề xuất vật tư/YCVT): operator tạo → admin quick-approve → **Kho đánh dấu "Đã xuất kho"** (mark-issued) trừ tồn thật | operator tạo, admin duyệt, warehouse xuất | PASS | tồn trừ đúng 2 PCS | BBGH/PR list đồng bộ | — |
| 15 | mark-issued vượt SL đề xuất (9999) | warehouse | PASS (chặn đúng) | 422 `OVER_ISSUE` | — | "chỉ được xuất tối đa 2 (SL đề xuất)…" |
| 16 | Bấm "Đã xuất kho" 2 lần (double-click) | warehouse | PASS (chặn đúng) | 409 `ALREADY_ISSUED`, không trừ tồn lần 2 | — | "Phiếu đã ghi nhận xuất kho trước đó" |
| 17 | purchaser gọi mark-issued | purchaser | PASS (chặn đúng) | 403 "Chỉ Admin hoặc Bộ phận Kho…" | — | — |
| 18 | Kiểm kê: tạo phiên (66 dòng, ô A-01-1-01), lưu nháp đếm có **số thập phân** (4.5) | warehouse | PASS | — | Section "Kiểm kê kho" nằm trong tab Báo cáo kho, hiện đúng tiến độ đếm | — |
| 19 | Gửi duyệt khi CHƯA đếm hết | warehouse | PASS (chặn đúng) | 409 "Còn 66 dòng chưa đếm" | — | — |
| 20 | Giám đốc TRẢ LẠI (reject, lý do ≥3 ký tự) → Kho reopen → đếm lại → gửi duyệt lại → Giám đốc DUYỆT | admin, warehouse | PASS | Lần 1 không lệch → diffLineCount=0; lần 2 (đặt 4.5 cho đúng 1 dòng, còn lại khớp sổ sách) → diffLineCount=1, **tồn điều chỉnh đúng 4→4.5** | — | — |
| 21 | qc tạo/đọc phiên kiểm kê | qc | PASS (chặn đúng) | 403 | — | — |
| 22 | warehouse duyệt phiên kiểm kê (phải là Giám đốc) | warehouse | PASS (chặn đúng) | 403 | — | "Chỉ Giám đốc được duyệt chốt…" |
| 23 | Duyệt 2 lần phiên đã APPROVED | admin | PASS (chặn đúng) | 409 INVALID_STATE | — | — |
| 24 | Xuất phiếu kiểm kê (export) | warehouse | PASS | 200, `application/vnd…spreadsheetml.sheet` | — | — |
| 25 | BBGH: warehouse tạo ISR reason=sales (fifo-pick) → **tự duyệt** | warehouse | PASS (chặn đúng) | 403 "Xuất bán/trả hàng NCC chỉ Giám đốc…" | — | — |
| 26 | Admin duyệt ISR sales → tự sinh phiếu xuất PX | admin | PASS | COMPLETED, sinh `goodsIssueId`/`issueNo` cùng transaction | — | — |
| 27 | Tạo BBGH từ ISR COMPLETED → gửi duyệt → warehouse tự duyệt | warehouse | PASS (chặn đúng) | 403 | — | — |
| 28 | Admin (Giám đốc) duyệt BBGH → CONFIRMED, tải PDF | admin | PASS | PDF 200, `application/pdf` | BBGH-2610-0001 hiện đúng trong danh sách UI, badge "Đã duyệt" | — |
| 29 | Duyệt BBGH 2 lần | admin | PASS (chặn đúng) | 409 INVALID_STATE | — | — |
| 30 | RBAC hiển thị menu/tab theo vai (UI thật) | qc, purchaser, operator, accountant, shareholder, planner | PASS | — | qc vào `/warehouse` chỉ thấy 2 tab "Vật tư" + "Nhập/Xuất kho" (đúng comment code); 5 vai còn lại bị điều hướng khỏi `/warehouse` về `/` (menu "Bộ phận Kho" không hiện) | — |
| 31 | qc vào deep-link "QC nhập kho" (`?tab=movement&mode=qc`) | qc | PASS | Vào thẳng danh sách "Chờ QC nhập kho", đúng 8 dòng Chờ kiểm, nút Đạt/Không đạt theo quyền | Đạt | — |
| 32 | Responsive mobile 390×844 (today, sơ đồ kho, nhập/xuất) | warehouse | PASS | — | Đạt — layout co giãn tốt, không vỡ, card đọc được | — |
| 33 | Dark mode (today, sơ đồ kho) | warehouse | PASS | — | Đạt — tương phản tốt, đồng bộ theme | — |

## 2. LỖI chức năng

Không phát hiện lỗi chức năng P0/P1 trong phạm vi test được (tồn không âm, lô HOLD được chặn đúng, race-condition được khoá đúng bằng `reservation_lock`, idempotency chặn bấm 2 lần ở cả `mark-issued` và `delivery-notes/approve`, mọi state machine (PR/ISR/Stocktake/BBGH) đều có hard-check role + validate trạng thái).

- **P2 — Console warning (a11y):** Dialog "Thêm hàng vào ô/kệ" (`AddStockDialog`, `src/components/warehouse/BinActions.tsx`) thiếu `DialogTitle` cho Radix Dialog → console error "`DialogContent` requires a `DialogTitle`…". Không chặn chức năng nhưng ảnh hưởng screen reader. Nên bọc title ẩn bằng `VisuallyHidden`.
- **P2 — Capacity hiển thị cap cứng ở 100%:** Thẻ bin `A-01-1-01` hiển thị "5.204 / 1.000" nhưng thanh tiến độ vẫn hiện "100%" dù tồn thực vượt ~5 lần sức chứa khai báo — không có cảnh báo "quá tải" riêng biệt (chỉ trùng màu với bin đầy bình thường). Thủ kho khó nhận ra ô đang vượt capacity khai báo. File nghi ngờ: phần render progress bar trong `WarehouseLayoutTab.tsx` / bin card component (chưa trace được dòng chính xác, cần `grep "capacity" WarehouseLayoutTab.tsx`).
- **P3 — Nghi vấn chưa xác nhận được do rủi ro đụng dữ liệu nhóm khác:** Luồng "Kho duyệt + xuất, từ chối, chọn lại lô khi hụt, xuất một phần" trong đề bài khớp **2 cơ chế khác nhau** trong code: (a) `warehouseIssueRequest` (ISR, bảng riêng, chỉ admin/warehouse tạo được vì `fifo-pick` yêu cầu `read:inventory` — 403 với planner/purchaser/operator/qc), và (b) Đề xuất vật tư (PR/YCVT) + `mark-issued` — luồng này MỌI vai đều tạo được và khớp đúng nghĩa "bộ phận khác tạo, Kho xuất" + badge "Đã xuất kho". Đã test đầy đủ (b); KHÔNG phải bug nhưng dễ gây nhầm lẫn đặt tên "yêu cầu xuất kho" — nên thống nhất tài liệu nghiệp vụ trỏ đúng 1 luồng.

## 3. LỆCH GIAO DIỆN theo chuẩn Apple

Nhìn chung giao diện Kho đạt chuẩn tốt: bo góc, spacing nhất quán, màu trạng thái rõ ràng (xanh dương=có hàng, cam=sắp hết, xám=trống), dark mode đồng bộ, segmented control (Nhập/Xuất, 2D/3D) gọn gàng. Ảnh chụp tại `…/scratchpad/qa-final/B/` (`wh-desktop-*.png`, `wh-mobile-*.png`, `wh-dark-*.png`, `ui-flow-*.png`, `rbac-*.png`).

- Không phát hiện lệch rõ rệt so với `APPLE_DESIGN_SYSTEM.md` trong các màn đã chụp.
- Góp ý nhỏ: mục "Kiểm kê" (Stocktake) không có tab riêng trên thanh nav Kho (chỉ có 7 tab: Hôm nay/Sơ đồ/Vật tư/Nhập-Xuất/Phiếu xuất/Phiếu giao hàng/Báo cáo) — toàn bộ chức năng Kiểm kê (tạo phiên, đếm, duyệt) nằm **lồng bên trong tab "Báo cáo kho"** (`ReportTab.tsx` → `StocktakeSection.tsx`). Về luồng thao tác không sai (đã test PASS đầy đủ), nhưng xét trải nghiệm thủ kho, "Kiểm kê" là tác vụ định kỳ lớn, gộp chung với "Báo cáo" (vốn mang tính xem/đọc) có thể khiến thủ kho không tìm thấy — xem mục Đề xuất bên dưới.

## 4. Kịch bản biên tự nghĩ (≥8)

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | Chuyển hàng sang chính ô đang đứng | PASS — chặn `SAME_BIN` 400 |
| 2 | Rút nhiều hơn tồn thực tế | PASS — chặn `INSUFFICIENT_BIN` 409, kèm số liệu thực |
| 3 | 2 người/role cùng rút 1 lô cùng lúc (race) | PASS — khoá đúng bằng `reservation_lock`, không âm, không double-spend |
| 4 | Số lượng 0 hoặc âm khi rút | PASS — 422 validation chặn trước khi chạm DB |
| 5 | Lô đang HOLD — Kho rút vs Giám đốc rút | PASS — Kho bị chặn, Giám đốc được phép (đúng nghiệp vụ hủy hàng lỗi) |
| 6 | Bấm "Đã xuất kho" / "Duyệt BBGH" / "Duyệt kiểm kê" 2 lần liên tiếp (double-click) | PASS cả 3 nơi — đều trả lỗi rõ (`ALREADY_ISSUED`/`INVALID_STATE`) thay vì xử lý ngầm lần 2 |
| 7 | Gửi duyệt phiếu kiểm kê khi chưa đếm hết tất cả các dòng | PASS — chặn với thông báo đếm thiếu bao nhiêu dòng |
| 8 | Đếm kiểm kê có số thập phân (4.5 PCS) | PASS — server chấp nhận, ghi điều chỉnh đúng phân số; lưu ý: schema không ràng buộc theo UOM (PCS vẫn cho thập phân) — chấp nhận được vì spec yêu cầu hỗ trợ thập phân chung |
| 9 | Giám đốc trả lại phiếu kiểm kê → Kho đếm lại → gửi lại → duyệt | PASS — state machine DRAFT→PENDING_APPROVAL→REJECTED→DRAFT (reopen)→PENDING_APPROVAL→APPROVED chạy đúng vòng |
| 10 | Vai không đúng chức năng cố gọi thẳng API (không qua UI) | PASS — mọi endpoint test đều có hard-check role phía server (không chỉ ẩn nút UI), kể cả các case "chỉ Giám đốc" cho sales/return/BBGH/kiểm kê |

## 5. Đề xuất cải tiến cho thủ kho

1. Tách "Kiểm kê" thành tab riêng trên thanh nav Kho (ngang hàng "Báo cáo kho") thay vì lồng bên trong — giảm thao tác tìm kiếm cho thủ kho khi cần tạo phiên kiểm kê định kỳ.
2. Thêm cảnh báo trực quan riêng (ví dụ badge đỏ "Vượt sức chứa") khi `totalQty > capacity`, thay vì chỉ cap progress bar ở 100% giống ô đầy bình thường.
3. Bổ sung `DialogTitle` (ẩn bằng `VisuallyHidden`) cho các dialog Thêm/Rút/Chuyển tồn để hết cảnh báo a11y và dùng tốt với trình đọc màn hình (một số thủ kho lớn tuổi dùng tính năng phóng to/đọc màn hình trên điện thoại).
4. Thống nhất tài liệu nghiệp vụ: làm rõ "yêu cầu xuất kho" trong các hướng dẫn nội bộ trỏ đúng luồng Đề xuất vật tư (PR) + "Đã xuất kho", tránh nhầm với bảng `warehouseIssueRequest` (ISR) vốn chỉ dùng nội bộ Kho cho xuất bán/BBGH.
5. Môi trường QA dùng chung giữa nhiều nhóm (A/B/D chạy song song trên cùng staging) khiến số liệu báo cáo trôi giữa lúc test — nên cân nhắc mỗi nhóm QA có schema/DB riêng hoàn toàn cho vòng nghiệm thu cuối tiếp theo, tránh nhiễu khi đối chiếu số liệu.

## Phạm vi chưa test đầy đủ (do giới hạn thời gian/rủi ro đụng dữ liệu nhóm khác)

- Chưa thao tác trực tiếp nút "Đạt/Không đạt" trên các dòng "Chờ QC nhập kho" có sẵn trong DB (dữ liệu có thể do nhóm QA khác hoặc fixture chung tạo) — tránh làm sai lệch kết quả QC của luồng khác đang chạy song song. Đã xác nhận UI hiển thị đúng danh sách + nút theo quyền qua ảnh chụp; logic HOLD→release đã test riêng qua `/api/lot-serial/:id/hold|release` với lô tự tạo.
- Chưa test "thêm kệ/ô mới", "đề xuất hàng loạt vị trí mặc định", "import/export Excel vị trí mặc định có dòng lỗi" — ngoài thời lượng phiên này.
- 3D view của Sơ đồ kho chưa chụp (chỉ xác nhận toggle 2D/3D hiển thị trên UI).
