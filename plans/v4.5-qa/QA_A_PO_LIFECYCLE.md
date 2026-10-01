# QA-A — Nghiệm thu cuối: Vòng đời PO + Mua hàng + Tài chính mua

- Môi trường: `http://localhost:3100` (staging, `/api/health` = 200 trước khi chạy).
- Tài khoản: `qaa.admin` (đóng vai Giám đốc — hệ thống không có role "director" riêng, `admin` = Giám đốc theo thiết kế V4.0), `qaa.planner`, `qaa.purchaser`, `qaa.warehouse`, `qaa.qc`, `qaa.accountant`, `qaa.operator`, `qaa.shareholder`.
- Công cụ: Playwright (Chromium) điều khiển UI thật từng bước, đối chiếu số liệu qua API khi cần. Ảnh chụp: `...scratchpad/qa-final/A/` (121 ảnh desktop 1440×900 + mobile 390×844 + dark mode).
- Chứng từ dùng xuyên suốt: PR chính `PR-2610-0187` → PO `PO-2610-0187-01` (NCC "Mạnh Hưng") → HĐ mua `HD-QAA-594652`. Toàn bộ dữ liệu gắn tiền tố `[QA-A]`.

## ⚠️ SỰ CỐ CẦN NGƯỜI XỬ LÝ (đọc trước)

Khi test thanh toán, do chọn nhầm NCC trùng tên trong ô tìm kiếm (xem Lỗi #1), 2 thanh toán của tôi (`TT-2610-0016` = 436.448đ, `TT-2610-0015` = 663.552đ, tài khoản `qaa.accountant`) đã bị ghi **nhầm vào hoá đơn `QAD-FUTURE-2026-10-01T12-53-27` của nhóm QA-D**, khiến hoá đơn đó thành "Đã trả đủ" (PAID) thay vì "Chưa trả" (UNPAID) ban đầu. Tôi đã tạo script tự động để huỷ 2 thanh toán này và khôi phục dữ liệu nhưng **bị chính hệ thống Claude Code chặn (auto-mode classifier: "Modify Shared Resources")** vì đây là dữ liệu của nhóm khác — đúng theo tinh thần "không dùng tài khoản/đụng dữ liệu nhóm khác". **Cần người (hoặc agent có quyền) vào `/finance?tab=cashbook&sub=payments`, huỷ thủ công 2 đợt `TT-2610-0016` và `TT-2610-0015`** để trả hoá đơn QA-D về đúng trạng thái ban đầu. Việc thanh toán đúng cho PO của nhóm A đã được làm lại thành công trên hoá đơn thật `HD-QAA-594652`.

## 1. Bảng bước | vai | chức năng | giao diện | thông báo

| # | Bước | Vai | Chức năng | Giao diện | Thông báo |
|---|------|-----|-----------|-----------|-----------|
| 1 | Tạo phiếu MRF, thêm/bớt dòng, chọn vật tư có sẵn | Planner | PASS | Đạt — form Sheet rõ ràng, số phiếu dự kiến | — |
| 2 | Tạo vật tư mới tại chỗ (ItemPickerField) | Planner | PASS | Đạt — Sheet "Tạo vật tư mới" gọn | — |
| 3 | Validate thiếu "Lý do đề xuất" | Planner | PASS | Đạt — toast đỏ tiếng Việt rõ | — |
| 4 | Nút Xoá dòng disable khi còn 1 dòng | Planner | PASS | Đạt | — |
| 5 | Gửi phiếu MRF (auto DRAFT→SUBMITTED) | Planner | PASS (xem Lỗi ít nghiêm trọng #5) | Đạt | Badge Kho tăng **realtime trong 600ms, không reload** — PASS |
| 6 | Bấm thông báo mở đúng PR | Kho | PASS | Đạt | Đúng chứng từ |
| 7 | Kho duyệt bước 2 (dept-approve) + ghi chú | Kho | PASS | Đạt — timeline hiển thị đủ chữ ký | Badge Admin tăng realtime ngay sau đó — PASS |
| 8 | Giám đốc (admin) duyệt bước 3 (director-approve) | Admin | PASS | Đạt | Thông báo cũ tự hết sau xử lý — PASS |
| 9 | Kho từ chối PR có lý do, validate <3 ký tự bị chặn | Kho | PASS | Đạt | — |
| 10 | Planner huỷ PR, validate lý do huỷ bắt buộc | Planner | PASS | Đạt — dialog "Huỷ phiếu MRF" rõ | — |
| 11 | Tạo PO từ PR, chọn NCC cho từng dòng | Purchaser | PASS (có lỗi dữ liệu, xem #1) | Lệch nhẹ — xem Lỗi #1 | — |
| 12 | Sửa ETA/ghi chú/điều khoản TT khi PO DRAFT | Purchaser | PASS | Đạt | — |
| 13 | Nhập giá 1 dòng, để trống dòng còn lại | Purchaser | PASS | Đạt — banner cảnh báo rõ | — |
| 14 | Gửi duyệt PO dù còn dòng chưa giá (V4.4.3) | Purchaser | PASS | Đạt | — |
| 15 | Double-click "Gửi duyệt" | Purchaser | PASS (be chặn ở server) | Xem Lỗi #2 | Toast lỗi tiếng Việt rõ |
| 16 | Giám đốc từ chối PO có lý do | Admin | PASS | Đạt | — |
| 17 | Sửa PO sau khi bị từ chối, điền nốt giá, gửi lại | Purchaser | PASS | Đạt | — |
| 18 | Giám đốc duyệt lại (duyệt lần 2) | Admin | PASS | Đạt | — |
| 19 | Gửi NCC | Purchaser | PASS | Đạt — dialog xác nhận rõ | — |
| 20 | Xuất PDF PO | Purchaser | PASS | Đạt | — |
| 21 | Nhận hàng một phần (wizard 3 bước) | Kho | PASS | Đạt | — |
| 22 | Nhận vượt SL đặt — validate tick + lý do bắt buộc | Kho | PASS | Đạt | — |
| 23 | QC kết luận Đạt | QC | PASS | Đạt — toast báo Kho+Thu mua | — |
| 24 | QC kết luận Không đạt, validate lý do <3 ký tự | QC | PASS | Đạt | Toast báo đúng 2 bộ phận |
| 25 | Điều chỉnh giá SAU khi đã duyệt + đã nhận hàng | Purchaser | PASS | Đạt | — |
| 26 | Nhận nốt phần còn lại | Kho | PASS | Đạt | — |
| 27 | Đóng PO (dòng lỗi NCC không giao bù) | Purchaser | PASS | Đạt | — |
| 28 | Tạo HĐ mua từ PO (tự tính theo SL nhận đạt) | Purchaser | PASS | Đạt | — |
| 29 | Kế toán xác nhận ghi công nợ | Accountant | PASS | Đạt | — |
| 30 | Thanh toán một phần, validate số dư nguồn chi | Accountant | PASS | Đạt — chặn đúng khi vượt số dư | — |
| 31 | Thanh toán đủ phần còn lại | Accountant | PASS | Đạt | — |
| 32 | Huỷ một thanh toán (trên dữ liệu của chính nhóm A) | Accountant | PASS | Đạt — công nợ hồi phục đúng số tiền | — |
| 33 | Công nợ phải trả phản ánh đúng NCC + số tiền | Accountant | PASS | Khớp 829.440đ xuyên suốt PO/HĐ/Thanh toán/Công nợ | — |
| 34 | RBAC: Shareholder bị chặn PO/PR kể cả gõ thẳng URL | Shareholder | PASS | Đạt | — |
| 35 | RBAC: Operator xem PO read-only, không thấy nút hành động | Operator | PASS | Đạt | — |
| 36 | RBAC: QC không vào được PO detail (route-guard) | QC | PASS | Đạt | — |
| 37 | Dark mode desktop + mobile (dashboard, PO, PR, thanh toán) | Admin | PASS | Đạt — tương phản tốt, đồng bộ theme | — |

## 2. Danh sách LỖI chức năng

**P1 — Tạo trùng Nhà cung cấp khi lập PO, gãy tổng hợp công nợ**
Trong `ConvertPRToPODialog` (tạo PO từ PR), ô chọn NCC chỉ coi là "đã có" khi tên/mã khớp **CHÍNH XÁC 100%** (`apps/web/src/components/procurement/ConvertPRToPODialog.tsx:297-303`, biến `hasExact`). Gõ tên rút gọn/gần đúng (vd "Mạnh Hưng" thay vì tên đầy đủ "CÔNG TY TNHH SẢN XUẤT THƯƠNG MẠI DỊCH VỤ MẠNH HƯNG") → hệ thống coi là NCC mới và mục "Dùng NCC mới…" còn hiển thị **phía TRÊN** danh sách NCC có sẵn khớp (`:359-375` render trước `suppliers.map`) → rất dễ bấm nhầm tạo trùng. Tái hiện: trong dialog Tạo PO, gõ một phần tên của NCC đã tồn tại và bấm kết quả đầu tiên. Hậu quả đã kiểm chứng bằng số liệu thật: "Công nợ phải trả" tách thành 2 dòng riêng cho cùng một NCC thật (`Mạnh Hưng`: 1 HĐ 829.440đ và `CÔNG TY TNHH...MẠNH HƯNG`: 8 HĐ 52.328.000đ) — làm sai lệch báo cáo công nợ theo NCC. Đề xuất: áp dụng cơ chế cảnh báo trùng tên gần giống như `ItemPickerField`/`/api/items/quick-create` (gợi ý NCC gần giống + hỏi "Dùng NCC này?" trước khi cho tạo mới), và đưa mục "Dùng NCC mới" xuống CUỐI danh sách.

**P2 — Double-click "Gửi duyệt" PO gửi 2 request, chỉ chặn ở server**
`PoDetailHeader.tsx:241-246` disable nút theo `busy` (state async) — bấm rất nhanh 2 lần trước khi React cập nhật `isPending` vẫn gửi 2 request. Server chặn đúng (lỗi rõ ràng: "Gửi duyệt thất bại: PO phải ở trạng thái Nháp và chưa chờ duyệt/đã bị từ chối"), không hỏng dữ liệu — nhưng nên debounce phía client để tránh gọi API thừa. File: `apps/web/src/components/procurement/po-detail/PoDetailHeader.tsx:123-128` (handleSubmit).

**P2 — Nhãn QC "FAIL" áp cho cả phiếu nhập dù chỉ 1/2 dòng không đạt**
`computeReceiptQcFlag` (`apps/web/src/server/repos/inboundQc.ts:48-54`): bất kỳ dòng nào FAIL → cả phiếu gắn nhãn FAIL. Đúng về mặt giữ hàng (HOLD) nhưng hiển thị ở "Lịch sử nhận" (`PoReceivingHistory.tsx:55`) dễ khiến người xem tưởng nhầm cả phiếu hỏng trong khi thực tế có dòng đã Đạt. Đề xuất: hiển thị "Hỗn hợp" (1 đạt/1 không đạt) thay vì FAIL tuyệt đối khi phiếu có nhiều dòng khác kết luận.

**P2 (không phải bug, nhưng lệch kỳ vọng nghiệm thu) — Không có "Lưu nháp" cho Đề xuất vật tư**
`apps/web/src/app/api/purchase-requests/route.ts:120-129`: mọi phiếu tạo qua UI (MRF/DNVT) đều tự động submit ngay sau khi tạo (chủ ý từ V3.7.17, lý do: "PR DRAFT không bắn notification"). Phù hợp với tinh thần nhanh gọn nhưng khác với kỳ vọng "lưu nháp" trong đề bài nghiệm thu — cần chủ xưởng xác nhận đây có phải hành vi mong muốn.

## 3. LỆCH GIAO DIỆN theo chuẩn Apple

- **Input ngày kiểu `mm/dd/yyyy`**: các ô `<input type="date">` (vd `new-mrf/page.tsx:530`, `PoInfoCard.tsx:58`) hiển thị định dạng tiếng Anh mm/dd/yyyy theo locale trình duyệt khi CHƯA chọn ngày (placeholder), trong khi text hiển thị sau khi lưu đã đúng dd/MM/yyyy. Ảnh: `009-pr-validation-missing-reason.png` (field "Ngày cần" hiện "mm/dd/yyyy"). Đề xuất: đặt `lang="vi"` trên các input date hoặc dùng component DateField tự vẽ (đã có sẵn ở màn Hoá đơn) thay cho input gốc trình duyệt.
- Phần còn lại (thẻ trắng/nền #F5F5F7, tiêu đề lớn, segmented tab, số căn phải, trạng thái icon+chữ, vùng chạm mobile, toast đúng vị trí) đều ĐẠT chuẩn Apple ở toàn bộ 121 ảnh đã xem — không phát hiện tràn/cắt chữ ở mobile 390px, dark mode tương phản tốt.

## 4. Kịch bản tự nghĩ (≥8) + kết quả

1. Sửa PO sau khi gửi duyệt (bị từ chối rồi sửa gửi lại) — **PASS**, số liệu giữ nguyên đúng.
2. Double-click nút Gửi duyệt — **PASS** (server chặn sạch, xem Lỗi P2 #2 về UX).
3. Giá rất lớn + số lẻ (987.654,5đ) trên 1 dòng PO — **PASS**, lưu và tính VAT chính xác tới hàng đơn vị.
4. Nhận vượt số lượng đặt (8/5) — **PASS**, chặn submit cho tới khi tick xác nhận + ghi lý do ≥3 ký tự.
5. QC kết luận khác nhau cho 2 dòng cùng phiếu (1 Đạt, 1 Không đạt) — **PASS** chức năng, **lệch nhãn** hiển thị tổng (xem Lỗi P2 #3).
6. Xoá dòng cuối cùng của phiếu MRF — **PASS**, nút Xoá tự disable khi còn 1 dòng (không cho xoá hết).
7. NCC mới gõ tay trong lúc lập PO — xảy ra NGOÀI Ý MUỐN do lỗi #1, nhưng nhờ vậy xác nhận: PO/HĐ/Công nợ vẫn hoạt động đúng với NCC mới tạo, chỉ có vấn đề là tạo trùng không cảnh báo.
8. Thanh toán vượt số dư nguồn chi — **PASS**, hệ thống chặn rõ ràng ("Nguồn chi không đủ số dư") kèm số âm dự kiến.
9. Huỷ một thanh toán đã ghi sổ — **PASS**, hoá đơn hồi phục đúng trạng thái + số tiền còn nợ.
10. RBAC gõ thẳng URL PO/PR cho Shareholder — **PASS**, bị redirect về Tổng quan, không rò rỉ dữ liệu.
11. Đóng PO khi 1 dòng không thể đạt ngưỡng nhận đủ (do QC fail) — **PASS**, đóng được kèm lý do, không bị kẹt trạng thái PARTIAL vĩnh viễn.

## 5. Đề xuất cải tiến cho chủ xưởng

1. Thêm cảnh báo trùng NCC (giống cơ chế trùng vật tư) ngay trong màn Tạo PO — tránh phân mảnh công nợ theo NCC về lâu dài (rất quan trọng vì ảnh hưởng trực tiếp số liệu phải trả thực tế).
2. Cân nhắc cho phép "Lưu nháp" thật sự cho Đề xuất vật tư (hiện luôn auto-gửi) nếu nhân viên cần soạn trước rồi gửi sau.
3. Hiển thị "Hỗn hợp Đạt/Không đạt" thay vì nhãn FAIL tuyệt đối trên phiếu nhận hàng có nhiều dòng QC khác kết luận.
4. Có cơ chế gộp/hợp nhất NCC trùng (merge 2 hồ sơ NCC về 1) để dọn dữ liệu khi lỡ tạo trùng — hữu ích cả cho vận hành thật lẫn dọn dữ liệu QA.
5. Debounce nút submit phía client (Gửi duyệt/Gửi NCC/Duyệt) để tránh gọi API thừa khi bấm nhanh, dù server đã chặn an toàn.
