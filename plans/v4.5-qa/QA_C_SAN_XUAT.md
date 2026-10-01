# QA-C (Nghiệm thu cuối) — Thiết kế/BOM + Sản xuất + Bảng sản xuất

- Môi trường: STAGING `http://localhost:3100` (health=200 trước khi chạy). Không đụng prod, không sửa code.
- Phương pháp: Playwright (8 context/role, cookie riêng) vừa gọi API thật (giống UI gọi) vừa chụp màn hình thật của trang. 90 assertion tự động + 24 ảnh (desktop 1440×900, mobile 390×844, 3 ảnh dark).
- Dữ liệu test gắn tag `[QA-C]` (BOM `QAC-BOM-*`, vật tư `QAC-MAT*`/`QAC-SP*`, mã hàng `QAC-BOARD-*`). Script tạm `apps/web/.tmp-qaC-flow.mjs` đã xoá sau khi chạy xong.
- Ảnh: `...scratchpad\qa-final\C\01..23-*.png`. Log đầy đủ: `_results.json` (cùng thư mục).

## 1. Bảng kết quả theo chức năng

| # | Chức năng | Vai | Kết quả | Giao diện | Ảnh |
|---|---|---|---|---|---|
| 1 | BOM list + lọc Đang hiệu lực/Ngừng dùng | admin/planner | PASS | Đạt — clean, badge trạng thái rõ | 01, 21(dark) |
| 2 | Tạo BOM mới (form) | admin | PASS | Đạt | 03 |
| 3 | Mở lưới BOM desktop/mobile, thêm/sửa/xoá dòng | admin | PASS (API) | **Lệch (mobile)** — bảng tràn ngang, mất cột TIẾN ĐỘ/SL CẤP/DỰ KIẾN NHẬN ngoài khung hình, không thấy chỉ báo cuộn ngang | 02, 17 |
| 4 | Trùng mã BOM → 409 | admin | PASS | — | — |
| 5 | Dòng BOM không gắn vật tư → chặn | admin | PASS (schema trả 422 "Required", không phải 400 — hành vi đúng, chỉ lệch mã HTTP so với kỳ vọng ban đầu của tester) | — | — |
| 6 | Import Excel BOM (màn hình bước 1) | admin | PASS (giao diện) | Đạt | 04 |
| 7 | Vật tư: tạo mới, trùng SKU → 409 | admin | PASS | Đạt | 05 |
| 8 | RBAC BOM: qc/accountant/shareholder → 403 đọc BOM; operator/warehouse/purchaser đọc được, không tạo được | — | PASS (9 ca) | — | — |
| 9 | RBAC Vật tư: chỉ admin/planner tạo được | — | PASS (4 ca) | — | — |
| 10 | Tạo Lệnh SX (YCSX) từ BOM line, chỉ admin/planner/operator | — | PASS (3 ca 403 + 1 ca 201) | — | — |
| 11 | Planner tự duyệt YCSX của mình → chặn (separation of duties) | planner | PASS | — | — |
| 12 | 2 YCSX cùng 1 BOM line khi cái đầu còn DRAFT → chặn trùng | planner | PASS | — | — |
| 13 | Duyệt (operator) → RELEASED; Từ chối lý do <5 ký tự → chặn; lý do hợp lệ → CANCELLED | operator | PASS | — | — |
| 14 | Bắt đầu lệnh (Start) | planner | PASS | — | — |
| 15 | Hoàn thành khi goodQty=0 → chặn | planner | PASS | — | — |
| 16 | Warehouse báo tiến độ → chặn (không đúng vai) | warehouse | PASS | — | — |
| 17 | Báo tiến độ nhiều lần, kể cả **vượt kế hoạch** (tổng 23 > KH 10) | operator | PASS (hệ thống **cho phép**, không cảnh báo/chặn) | — | — |
| 18 | Xin vật tư theo BOM: dòng đủ→ISR, dòng thiếu→PR; bấm 2 lần liên tiếp → báo "đã xin đủ, không còn phần cần xin" (không tạo trùng) | operator | PASS | Đạt | 06,07,18 |
| 19 | Kho duyệt ISR → xuất kho | warehouse | PASS | — | — |
| 20 | Hoàn thành thiếu SL: không lý do → 422; lý do <3 ký tự → 422; lý do hợp lệ → OK + nhập kho thành phẩm (vị trí gợi ý tự động, giữ Chờ QC = HOLD) | planner | PASS | Đạt | 06,07,18,23(dark) |
| 21 | Hoàn thành 1 lệnh đã COMPLETED lần 2 → chặn | planner | PASS | — | — |
| 22 | Huỷ lệnh: planner → 403 (không có `delete:wo`); admin → OK | planner/admin | PASS | — | — |
| 23 | **[P0/P1]** Hoàn thành lệnh SX dù **chưa hề "Xin vật tư theo BOM"** / vật tư thực tế chưa xuất kho | planner | **FAIL** (hệ thống KHÔNG chặn) | **Lệch** — card "II. NGUYÊN VẬT LIỆU" vẫn hiện badge **"Còn thiếu"** + bảng rỗng "Không có vật liệu" dù lệnh đã "Hoàn thành" | 06, 07, 18, 23 |
| 24 | Bảng sản xuất: thêm mã hàng — chỉ qc/admin/purchaser | — | PASS (3 ca 403) | — | 08,09,10 |
| 25 | accountant GET bảng sản xuất → 403 (đúng thiết kế, xem giá qua Tổng quan Tài chính) | accountant | PASS (ghi nhận) | — | — |
| 26 | Đơn giá: chỉ admin/purchaser thấy field `unitPrice` trong JSON; qc/operator/planner/warehouse/shareholder — field biến mất hoàn toàn (không phải null) | 7 vai | PASS (7/7) | Đạt — cột "GIÁ TRỊ" ẩn hẳn cho qc/operator/planner/warehouse/shareholder | 08,09,10,11,12,13,14 |
| 27 | Giá 0đ và giá rất lớn (999,999,999,999đ) | admin | PASS (tạo được, không chặn biên) | **Lệch** — giá quá lớn làm "Tổng giá trị" tổng toàn bảng nhảy lên ~99.999 nghìn tỷ tỷ đồng, vô nghĩa, không cảnh báo nhập liệu | 08,09,22(dark) |
| 28 | Mã hàng **trùng productCode** | qc | **Không bị chặn** — tạo được 2 dòng cùng mã | — | — |
| 29 | Ghim (pin), đổi trạng thái tuần tự, lịch sử thay đổi | admin/qc | PASS | Đạt | — |
| 30 | Lịch sử (history) không lộ `unitPrice` cho qc | qc | PASS | — | — |
| 31 | operator sửa/xoá mã hàng → 403; purchaser sửa → 403 (chỉ create+read) | operator/purchaser | PASS | — | — |
| 32 | Màn hình TV `/board` — không hiện giá | admin | PASS (không có code hiển thị giá ở trang này) | Đạt desktop (15); **Lệch mobile** — tiêu đề "BẢNG SẢN XUẤT" wrap 3 dòng đè lên cụm số Đang GC/QC/Sắp GC, số liệu bị cắt mép phải | 15, 20 |
| 33 | **[P1]** Trang `/production-board` — planner/operator/warehouse (có quyền `read` theo RBAC matrix) bị **chặn truy cập trang**, redirect về Tổng quan kèm toast "Bạn không có quyền truy cập trang đó" | planner/operator/warehouse | **FAIL** | **Lệch nặng** — 3 vai không mở được trang dù API trả 200 | 11,12,13 |
| 34 | API id sai định dạng UUID → 500 thay vì 400 sạch | admin | **FAIL** (robustness) | — | — |

**Tổng**: 90 assertion tự động — 86 PASS / 4 FAIL (2 là lỗi nghiệp vụ thật P1, 1 robustness P2, 1 chỉ lệch mã HTTP không phải lỗi thật).

## 2. Lỗi theo mức độ ưu tiên

**P1-1 — Hoàn thành Lệnh SX không kiểm tra vật tư đã xuất/nhận hay chưa.**
`checkWoCompletable` (`apps/web/src/lib/wo-guards.ts:122-129`) chặn hoàn thành nếu "còn dòng linh kiện chưa đủ số lượng", nhưng điều kiện này đọc từ bảng `work_order_line` (`apps/web/src/server/repos/workOrders.ts:837-843`) — **bảng này không bao giờ được ghi** (`grep insert(workOrderLine)` trong toàn bộ `apps/web/src/server` ra 0 kết quả). Cả 2 route tạo lệnh (`work-orders/from-bom-line`, `work-orders/lsx`) đều không tạo dòng `work_order_line`. Kết quả: guard luôn nhận mảng rỗng → luôn pass. Đã tái hiện sạch 2 lần (xem `_results.json` ca `[P1][Edge]`): tạo lệnh → duyệt → bắt đầu → báo tiến độ = kế hoạch → "Hoàn thành" **thành công** dù `material-plan` cho thấy vật tư **chưa hề được xuất kho** (`toIssueFromStock` > 0) và dù nút "Xin vật tư theo BOM" chưa từng được bấm. Giao diện (ảnh 06/07/18/23) xác nhận: lệnh hiện "Hoàn thành" nhưng card "II. NGUYÊN VẬT LIỆU" vẫn hiện badge cam "Còn thiếu" + bảng trống "Không có vật liệu" — hệ thống tự mâu thuẫn ngay trên 1 màn hình. Thành phẩm vẫn được nhập kho bình thường ở bước này. **Tác động**: xưởng có thể khai khống đã hoàn thành sản xuất mà chưa từng lấy nguyên liệu, số tồn kho vật tư/thành phẩm lệch so với thực tế, không truy vết được.

**P1-2 — `/production-board` chặn nhầm 3 vai có quyền đọc.**
`apps/web/src/lib/route-guard.ts:81-87`: rule cho `/production-board` chỉ cho `roles: ["admin", "qc", "shareholder", "purchaser"]`, trong khi RBAC matrix (`packages/shared/src/rbac/matrix.ts`) cấp `productionBoard: ["read"]` cho **cả planner, operator, warehouse** (kèm comment rõ ràng "V3.8 — operator/planner/warehouse xem bảng sản xuất (read-only)"). Hậu quả tái hiện trên cả 3 vai (ảnh 11,12,13): mở `/production-board` → bị redirect về Tổng quan kèm toast đỏ "Bạn không có quyền truy cập trang đó", dù gọi thẳng API `GET /api/production-board` vẫn trả 200 (đã kiểm). Route guard (trang) và RBAC matrix (API) đang lệch nhau — rõ ràng là quên cập nhật `route-guard.ts` khi thêm quyền đọc cho 3 vai này. **Tác động**: Tổ trưởng SX (planner), công nhân (operator), Kho không xem được toàn cảnh bảng sản xuất (chỉ thấy widget rút gọn 4 dòng ở Tổng quan), phải nhờ QC/admin tra cứu hộ.

**P2-1 — Giá bán không có giới hạn trên hợp lý.**
Nhập `999,999,999,999đ × 99,999` vẫn tạo được, không cảnh báo, và kéo "Tổng giá trị" toàn Bảng sản xuất lên mức phi thực tế (~99.999 nghìn tỷ tỷ đồng — ảnh 08/09). Một lỗi gõ nhầm số 0 của Thu mua/QC sẽ làm sai lệch nghiêm trọng số liệu tổng hợp mà Giám đốc/Kế toán nhìn vào. Đề xuất: soft-cap (confirm dialog) khi đơn giá × SL vượt ngưỡng bất thường (vd > 10 tỷ).

**P2-2 — Mã hàng (`productCode`) trên Bảng sản xuất không chặn trùng.**
Tạo lại đúng `productCode` đã tồn tại vẫn trả 201 (tạo thêm 1 dòng riêng biệt, 2 `id` khác nhau cùng mã). Dễ gây nhầm lẫn khi tra cứu theo mã hàng, 2 dòng tiến độ riêng cho cùng 1 mã.

**P2-3 — Lưới vật tư BOM không responsive trên mobile.**
Ảnh 17: ở 390px, bảng tràn ngang mất các cột TIẾN ĐỘ, SL CẤP, DỰ KIẾN NHẬN, THAO TÁC — không có chỉ báo/thanh cuộn ngang rõ ràng. Công nhân dùng điện thoại (theo đúng bối cảnh đề bài) sẽ không thao tác được "Xin vật tư"/sửa dòng trên mobile, phải xoay ngang hoặc dùng desktop.

**P2-4 — Badge "Lệnh SX N" trên trang chi tiết BOM không khớp số liệu thật.**
BOM test có 5 Lệnh SX thật (xác nhận qua `GET /api/bom/templates/{id}/production-summary` → `totalWorkOrders:5`), nhưng tab header ở `/bom/[id]` hiển thị "Lệnh SX 0" (ảnh 02). Nghi vấn badge đọc nhầm nguồn dữ liệu khác (snapshot?) thay vì production-summary.

**P2-5 — `/board` (màn hình TV) vỡ layout khi xem trên khổ hẹp (390px).**
Tiêu đề "BẢNG SẢN XUẤT" wrap 3 dòng, đè chồng lên cụm số Đang GC/QC/Sắp GC, số bị cắt mép phải (ảnh 20). Trang này thiết kế cho TV nên có thể chấp nhận được, nhưng nếu ai đó mở trên điện thoại để kiểm tra nhanh sẽ thấy giao diện vỡ.

**P2-6 — API trả 500 thô khi id không đúng định dạng UUID.**
`POST /api/work-orders/not-a-uuid/reject` → 500 (body rỗng) thay vì 400 sạch tiếng Việt. Route không validate format id trước khi query DB (xác nhận qua test trực tiếp, không lộ nội dung nhạy cảm nhưng trải nghiệm xấu/dễ bị quét lỗi).

**P2-7 (quan sát, không chặn) — Giá vẫn nằm trong JSON API khi gọi bởi phiên admin/purchaser trên `/board`.**
`/board` (trang) không render field `unitPrice` nên không lộ trên UI, nhưng nếu admin/purchaser tự mở `/board` trên máy mình (API trả đủ giá cho vai này), giá vẫn nằm trong network response — phòng thủ theo chiều sâu chưa trọn vẹn (role "display" kiosk thật thì bị lọc giá ở server nên không ảnh hưởng vận hành TV xưởng thật).

## 3. Lệch giao diện so với chuẩn Apple

- Nhìn chung desktop + dark mode rất sạch, nhất quán (card bo góc, khoảng trắng, badge trạng thái màu đúng ngữ nghĩa, typography rõ) — đạt chuẩn ở 2 form factor này.
- Mobile là điểm yếu nhất: BOM grid (P2-3) và `/board` (P2-5) đều vỡ/tràn ở 390px — vi phạm nguyên tắc "không scroll ngang, rõ ràng ở mọi kích thước" của chuẩn thiết kế.
- Phiếu "Lệnh sản xuất" (in phiếu) giữ nền tối đậm thay vì nền giấy trắng quen thuộc khi ở dark mode — chấp nhận được vì đây là định dạng in, nhưng nên cân nhắc ép nền trắng cho khu vực "phiếu" kể cả khi app ở dark mode (giống trình xem PDF) để không gây hiểu lầm khi in thử.

## 4. Kịch bản tự nghĩ thêm (8+) và kết quả

1. Báo tiến độ vượt kế hoạch (23/10) → **cho qua, không cảnh báo** (ghi nhận, không chặn — tuỳ ý xưởng có chấp nhận hay không).
2. Hoàn thành khi chưa xin vật tư → **FAIL, xem P1-1**.
3. Hoàn thành khi đã xin vật tư nhưng phần thiếu mới ở PR (chưa duyệt mua, chưa về kho) → **FAIL, cùng gốc P1-1**.
4. BOM có dòng không gắn vật tư → bị chặn ở tầng schema (lỗi 422 "Required"), không tạo được dòng mồ côi qua API thêm dòng thủ công — thiết kế hợp lý.
5. Sửa BOM (qty) khi đã có lệnh SX tham chiếu → **không bị chặn/cảnh báo gì** (không có guard `hasActiveWO` trong code) — sửa thành công, lệnh cũ giữ nguyên `requiredQty` đã chốt lúc tạo (không hồi tố) — nên cân nhắc cảnh báo mềm "BOM này đang có N lệnh SX" khi sửa.
6. Mã hàng trùng (Bảng sản xuất) → **không chặn** (P2-2).
7. Giá 0đ → tạo được bình thường, hiển thị "0 đ" rõ ràng, không lỗi.
8. Giá rất lớn → tạo được, làm vỡ số tổng (P2-1).
9. Tạo 2 Yêu cầu SX từ cùng 1 dòng BOM khi cái đầu còn DRAFT → bị chặn đúng (409, kèm số phiếu đang chờ).
10. Planner tự duyệt yêu cầu do chính mình tạo → bị chặn đúng (separation of duties).
11. Huỷ lệnh bởi vai không đủ quyền (planner) → bị chặn đúng (403).
12. Gọi API với id sai định dạng UUID → lỗi 500 thô (P2-6).

## 5. Đề xuất cải tiến

1. **Khẩn**: Vá P1-1 — hoặc (a) thực sự tạo/đồng bộ `work_order_line` từ BOM khi tạo lệnh và cập nhật `completedQty` mỗi lần Kho xuất vật tư cho lệnh đó, hoặc (b) nếu bỏ hẳn cơ chế theo dòng, thay guard hiện tại (đang là dead code) bằng kiểm tra trực tiếp trên `material-plan` (so `required` vs `alreadyIssued`, không tính PR SUBMITTED là "đã đủ") trước khi cho hoàn thành — có thể cho phép "hoàn thành ép buộc" kèm lý do bắt buộc giống cơ chế thiếu SL hiện có, để không chặn cứng các ca hợp lệ (vd xưởng tự có sẵn vật tư ngoài hệ thống).
2. **Khẩn**: Thêm `planner`, `operator`, `warehouse` vào `roles` của rule `/production-board` trong `route-guard.ts` cho khớp RBAC matrix.
3. Thêm soft-cap xác nhận khi đơn giá × SL kế hoạch vượt ngưỡng bất thường trên Bảng sản xuất.
4. Cân nhắc chặn hoặc cảnh báo khi tạo mã hàng trùng `productCode`.
5. Responsive lại lưới vật tư BOM và `/board` cho khổ ≤390px (card-based thay vì bảng ngang, hoặc Ẩn bớt cột + cho cuộn ngang có chỉ báo rõ).
6. Kiểm lại nguồn dữ liệu badge "Lệnh SX N" ở `/bom/[id]`.
7. Validate `id` dạng UUID ở tầng middleware/route chung trước khi query DB, trả 400 tiếng Việt thay vì 500.
8. Cảnh báo mềm khi sửa dòng BOM đang có lệnh SX tham chiếu (hiển thị số lệnh bị ảnh hưởng).
