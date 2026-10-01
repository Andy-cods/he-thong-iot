# QA-E — Nghiệm thu cuối: Thông báo realtime + Phân quyền + Chung (xuyên suốt)

- Ngày test: 2026-10-01
- Môi trường: STAGING `http://localhost:3100` (image prod, DB bản sao). `/api/health` = 200 trước khi bắt đầu — OK.
- Phát hiện: nhiều nhóm QA khác (A, B, C) đang chạy song song trên cùng staging/DB (thấy hoạt động `qab.*`, `qac.*`, `.tmp-qaA-*.mjs` trong `apps/web`) — đã tránh đụng dữ liệu/tài khoản của họ, chỉ thao tác tài khoản `qae.*` và dữ liệu gắn tiền tố `[QA-E]`.
- Công cụ: Playwright (Node, `chromium.launch`/`launchPersistentContext`) chạy trực tiếp qua script tạm `apps/web/.tmp-qaE-*.mjs` (đã xoá sau khi xong). Ảnh chụp tại `...\scratchpad\qa-final\E\`.
- Không sửa code, không commit.

## 1. Bảng kiểm theo vai trò (RBAC + giao diện)

Nguồn đối chiếu: `apps/web/src/lib/nav-items.ts` (`NAV_ITEMS`/`filterNavByRoles`) + `apps/web/src/lib/route-guard.ts` (`ROUTE_GUARDS`).

| Vai | Menu đúng kỳ vọng | Chặn URL ngoài quyền | Toast "không có quyền" | Độ trễ chặn | Giao diện sáng | Giao diện tối | Mobile 390px |
|---|---|---|---|---|---|---|---|
| admin | PASS (đủ 9 mục; "QC nhập kho" KHÔNG hiện — đúng thiết kế, mục này chỉ `roles:["qc"]`, admin vào qua tab Kho) | n/a (admin bỏ qua guard) | n/a | n/a | Đạt | Đạt | Đạt |
| planner | PASS (Tổng quan, Bộ phận Thiết kế, Đề xuất vật tư) | PASS (`/warehouse` → về `/`) | PASS | 879ms | Đạt | Đạt | Đạt |
| purchaser | PASS (+Bảng sản xuất (QC), Bộ phận Thu mua) | PASS (`/warehouse`) | PASS | 823ms | Đạt | Đạt | Đạt |
| warehouse | PASS (+Bộ phận Kho) | PASS (`/sales`) | PASS | 820ms | Đạt | Đạt | Đạt |
| operator | PASS (+Bộ phận Gia công) | PASS (`/sales`) | PASS | 813ms | Đạt | Đạt | Đạt |
| qc | PASS (+QC nhập kho, Bảng sản xuất (QC)) | PASS (`/sales`) | PASS | 801ms | Đạt | Đạt | Đạt |
| accountant | PASS (Tổng quan, Đề xuất vật tư, Tài chính-Kế toán) | PASS (`/warehouse`) | PASS | 772ms | Đạt | Đạt | Đạt |
| shareholder | PASS (Tổng quan, Bảng sản xuất (QC), Tài chính-Kế toán) | PASS (`/warehouse`) | PASS | 893ms | Đạt | Đạt | Đạt |

Toast chặn trang (xác nhận bằng ảnh `rbac-purchaser-denied.png`): "Bạn không có quyền truy cập trang đó — Đã tự động chuyển về Tổng quan." → redirect về `/` đúng 100%, 7/7 vai non-admin.

Dashboard "Cần xử lý": layout giống nhau mọi vai (đúng, vì cùng component `ActionItemsCard`), nội dung rỗng/"ỔN ĐỊNH" cho các tài khoản `qae.*` mới tạo chưa có việc chờ — hợp lý, không kiểm được "khớp chuông" sâu hơn vì tài khoản QA-E không có backlog nghiệp vụ thật; đã bù bằng test realtime ở mục 2 (tạo PR thật → xác nhận cả badge chuông lẫn nội dung khớp).

## 2. Thông báo realtime

| Kịch bản | Kết quả | Chi tiết |
|---|---|---|
| Tạo PR (planner) → badge Kho + Giám đốc tăng, KHÔNG reload | PASS | 112–215ms (2 lần đo), mục tiêu <1s |
| Toast "Cần bạn duyệt" hiện ngay khi đang ở trang khác | PASS | Nội dung đúng: "QA E — planner gửi đề xuất ... — cần kiểm tồn / Cần bạn duyệt" |
| Dropdown chuông nhóm theo Cần bạn duyệt/Cập nhật/Nhắc hạn | PASS | Heading hiển thị dạng `CẦN BẠN DUYỆT` (CSS uppercase) |
| Bấm thông báo mở đúng chứng từ (PR) | PASS | Click → `/procurement/purchase-requests/{prId}` đúng ID |
| Đánh dấu đã đọc TỪNG CÁI → đồng bộ tab khác | Không kết luận được (lỗi kịch bản test, xem ghi chú) | Baseline tab2 đã về 0 trước khi đo chênh lệch do thứ tự thao tác; không phải lỗi sản phẩm |
| Đánh dấu TẤT CẢ đã đọc → badge giảm ngay ở TAB KHÁC cùng người, không reload | **PASS — đo lại sạch** | 564ms (tạo 2 PR mới → 2 tab cùng `qae.warehouse` đều thấy "2 chưa đọc" → tab1 bấm "Đánh dấu tất cả" → tab2 tự về 0 trong 564ms) |
| Tự hết hiệu lực khi đã xử lý (stale-resolve, VD Kho duyệt bước 2 → PR_SUBMITTED cũ của Giám đốc tự hết) | PASS (gián tiếp, xem ghi chú) | Giám đốc có 12 chưa đọc sau khi PR mới nộp; sau khi Kho duyệt bước 2, số chưa đọc GIỮ NGUYÊN 12 (không tăng lên 13) dù có 1 thông báo MỚI (`PR_DEPT_APPROVED`) phát sinh — đúng cơ chế `RESOLVES_STALE` trong `notification-plans.ts` (đã đọc code xác nhận: `PR_DEPT_APPROVED: ["PR_SUBMITTED","PR_PENDING_REMINDER"]`). Toast mới "...chờ Giám đốc duyệt cuối" nhận đúng thời gian thực. |
| Tắt mạng rồi bật lại — tự nối lại, không mất | PASS (không crash) | `context.setOffline(true/false)`: sau khi online lại, chuông vẫn hoạt động bình thường (đọc được aria-label, không văng lỗi). Cơ chế backoff 1s→30s trong `useNotificationStream.ts` đã đọc code xác nhận đúng thiết kế; KHÔNG kiểm chứng sâu "nhận sự kiện mới trong vòng X giây sau khi online" do giới hạn thời gian. |
| Thông báo đẩy (Web Push) — bật "Thông báo trên thiết bị này" | **KHÔNG XÁC NHẬN ĐƯỢC ĐẦY ĐỦ** | Headless Chromium: `Notification.permission` vẫn `denied` dù đã `grantPermissions`/context option → nút đúng thiết kế bị disable (an toàn). Chuyển sang `headless:false` (Windows có GUI): permission `granted`, Service Worker `/sw.js` đăng ký thành công (`swRegistered:true`), nhưng nút kẹt ở trạng thái "đang xử lý" (spinner) >4s không resolve — nghi do môi trường sandbox không có Internet outbound tới dịch vụ push thật (FCM/Mozilla) nên `pushManager.subscribe()` treo. Không kết luận được đây là bug sản phẩm hay giới hạn môi trường — cần người có máy thật kiểm lại. |

## 3. LỖI theo mức độ ưu tiên

### P1 — Tràn ngang toàn trang ở màn hình 768px và 1280px (thanh tab bộ phận trên TopBar)
- **File:line**: `apps/web/src/components/layout/TopBar.tsx:211-213` (và các `<Link>` dòng 232-259, có `whitespace-nowrap`)
- **Hiện tượng**: Hàng tab bộ phận (`<nav className="hidden md:flex items-center justify-center gap-1 ...">`) KHÔNG có `overflow-x-auto`/`ScrollTabsList` như mọi nơi khác trong app (xem `apps/web/src/components/common/ScrollTabsList.tsx`, dùng cho Kho/Thu mua/BOM). Khi số mục nav đủ nhiều (vai `admin`: 9 mục) và viewport hẹp (768px tablet, 1280px laptop phổ biến), hàng tab bị `justify-center` đẩy tràn RA CẢ HAI PHÍA — vì `scrollLeft` mặc định = 0 không thể âm, phần đầu ("Tổng quan", một phần "Bộ phận Thiết kế") bị CẮT MẤT, không có cách cuộn về để thấy/bấm lại; `document.documentElement.scrollWidth > clientWidth` → toàn trang có thanh cuộn ngang.
- **Bằng chứng**: `misc-viewport-768.png`, `misc-viewport-1280.png` (`hscroll_768: true`, `hscroll_1280: true`; `hscroll_1920: false`).
- **Tái hiện**: đăng nhập `qae.admin` → resize cửa sổ về 768px hoặc 1280px → quan sát hàng tab dưới header, mục "Tổng quan" bị cắt mất chữ, phải cuộn ngang trang mới thấy hết "Quản trị" ở cuối.
- **Đề xuất**: bọc `<nav>` này bằng `ScrollTabsList` (component đã có sẵn, dùng chung) thay vì `hidden md:flex` trần.

### P2 — Double-submit không có khoá phía server
- **File:line**: `apps/web/src/app/api/purchase-requests/route.ts` (POST, không thấy idempotency-key/khoá unique theo nội dung)
- **Hiện tượng**: Gửi 2 request `POST /api/purchase-requests` giống hệt nhau gần như đồng thời (giả lập double-click nhanh/mạng chậm retry) → CẢ HAI đều tạo thành công (201 + 201), sinh 2 phiếu PR trùng nội dung.
- **Mức độ**: P2 vì phụ thuộc UI có disable nút ngay sau click đầu hay không (chưa kiểm được qua UI thật, chỉ test tầng API — xem ghi chú bên dưới).
- **Đề xuất**: FE disable nút Submit ngay khi `isPending`; cân nhắc idempotency-key phía API cho các thao tác tạo chứng từ.

### P3 — Splash "cinematic" sau đăng nhập: comment code lệch số liệu thực tế
- **File:line**: `apps/web/src/components/auth/LoginSuccessSplash.tsx:9-18` (comment mô tả timeline tổng ~7400ms) vs `DEFAULT_DURATION = 3400` (dòng 32) — thực tế đo được ~3.4s, không phải 7.4s như JSDoc.
- Không ảnh hưởng người dùng, chỉ gây hiểu nhầm khi đọc code. Đề xuất cập nhật comment cho khớp.

### P3 — Splash đăng nhập 3.4s không có nút bỏ qua
- Mỗi lần đăng nhập thành công (kể cả KHÔNG phải lần đầu) đều chờ 3.4s màn hình chào trước khi vào Tổng quan, không bấm tắt được. Với tài khoản dùng lại nhiều lần/ngày (kiosk, operator), có thể gây cảm giác chậm. Đề xuất: cho phép bấm bất kỳ đâu để bỏ qua splash.

## 4. LỆCH GIAO DIỆN theo chuẩn Apple

- Dashboard, dropdown chuông, trang Thông báo, màn đổi mật khẩu bắt buộc, form tạo user: bố cục sạch, bo góc nhất quán, dark mode áp dụng đúng và đẹp (contrast tốt, không "theme nửa vời") — đối chiếu ảnh `rbac-*-desktop-dark.png`, `pwchange-forced-screen.png`. **Đạt chuẩn Apple** ở các màn này.
- Lỗi tràn ngang 768/1280px ở mục P1 trên là lệch giao diện nghiêm trọng nhất tìm được (không responsive đúng ở breakpoint phổ biến).
- Theme toggle (`ThemeQuickToggle`, `apps/web/src/components/theme/ThemeToggle.tsx:63-85`): chu trình Sáng→Tối→Hệ thống→Sáng; khi đang ở "Hệ thống" (mặc định lúc mới đăng nhập) mà hệ thống đang resolve Sáng, bấm 1 lần đầu KHÔNG thấy đổi giao diện (vì nhảy sang "Sáng" — trùng hình ảnh với "Hệ thống(Sáng)") — dễ khiến người dùng tưởng nút bị đơ, phải bấm lần 2 mới thấy đổi. Nhỏ, P3.

## 5. Kịch bản tự nghĩ (≥8) + kết quả

1. **Đăng nhập sai mật khẩu** → thông báo "Tên đăng nhập hoặc mật khẩu không đúng." đúng, ở lại `/login`. PASS.
2. **2 thiết bị đăng nhập cùng lúc, cùng 1 tài khoản** (`qae.purchaser`, desktop 1440 + mobile 390 song song) → cả 2 phiên hoạt động độc lập bình thường, không bị văng nhau. PASS.
3. **Đổi mật khẩu lần đầu do admin reset** (dùng tài khoản tạo riêng `qae.tmp03` để không đụng tài khoản chia sẻ): admin "Đặt lại mật khẩu" → đăng nhập bằng mật khẩu tạm → bị ép sang `/me/change-password`, **giao diện tối giản đúng yêu cầu** (không sidebar, không topbar — chỉ 1 card giữa màn hình, banner lưu ý bảo mật rõ ràng) → đổi mật khẩu thành công → toast "Đã đổi mật khẩu thành công. Hãy đăng nhập lại." → tất cả phiên cũ bị thu hồi (đúng thiết kế bảo mật, không phải bug). PASS, ảnh `pwchange-forced-screen.png`, `pwchange-after-change.png`.
4. **Tài khoản bị Vô hiệu hoá không đăng nhập được** (kể cả đúng mật khẩu) → trả lỗi CHUNG "Tên đăng nhập hoặc mật khẩu không đúng." (không lộ thông tin tài khoản tồn tại nhưng bị khoá — đúng thông lệ bảo mật, đã đọc code `route.ts:144-159` xác nhận chủ đích). PASS.
5. **Tạo user với họ tên tiếng Việt dài + ký tự đặc biệt** ("Nguyễn Thị Thử Nghiệm QA-E — Đặc biệt ký tự: ăâêôơư/đ (dài)") → hiển thị đúng, không vỡ layout, không lỗi encode. PASS. Ảnh `common-user-detail.png`.
6. **Ctrl+K không khớp kết quả** (gõ chuỗi vô nghĩa) → không văng lỗi, danh sách gọn lại hợp lý. PASS.
7. **20 thông báo dồn** (tạo liên tiếp nhiều PR trong vài giây): dropdown vẫn render đúng, đếm đúng số chưa đọc, không bị treo/giật UI. PASS.
8. **Double-submit nhanh** (xem mục 3 — P2): tạo 2 phiếu trùng qua API. Ghi nhận là lỗi, không phải "PASS" nhưng là kịch bản biên hữu ích.
9. **Breakpoint 768/1920/1280** (xem mục P1): phát hiện lỗi tràn ngang 768 & 1280, riêng 1920 sạch. Đây là phát hiện quan trọng nhất của đợt test.
10. **Export Excel kiểm định dạng ngày/tiền**: tải `/api/purchase-orders/export` (xlsx hợp lệ, `PK\x03\x04` đúng magic bytes) và `/api/admin/audit/export` — mở bằng `exceljs` đọc trực tiếp cell: cột ngày dùng kiểu Date thật với `numFmt: dd/mm/yyyy`, cột tiền `numFmt: #,##0` (phân cách nghìn, đúng chuẩn VN). PASS rõ ràng, có bằng chứng số liệu.

## 6. Đề xuất cải tiến (tổng hợp)

1. **[P1]** Bọc `ScrollTabsList` cho hàng tab bộ phận ở `TopBar.tsx:211-213` — tránh tràn ngang 768/1280px, đặc biệt ảnh hưởng vai admin.
2. **[P2]** Disable nút submit ngay sau click đầu tiên (hoặc idempotency-key) cho các API tạo chứng từ (PR/PO/...) để tránh double-submit.
3. **[P3]** Thêm nút/cho phép bấm-để-bỏ-qua màn splash đăng nhập 3.4s.
4. **[P3]** Sửa comment lệch số liệu ở `LoginSuccessSplash.tsx:9-18`.
5. **[P3]** Cân nhắc đổi logic chu trình `ThemeQuickToggle` để bấm từ "Hệ thống" luôn thấy đổi hình ảnh ngay lần bấm đầu.
6. Push notification: cần kiểm lại trên máy thật có Internet thật (môi trường QA này sandbox hoá, nghi không có outbound tới FCM) trước khi kết luận PASS/FAIL cho tính năng đẩy.

## 7. Việc CHƯA kiểm được / giới hạn

- Đánh dấu đã đọc TỪNG CÁI kèm đo đồng bộ tab khác: có PASS gián tiếp (qua luồng "Đánh dấu tất cả") nhưng phép đo riêng cho "từng cái" bị lỗi kịch bản test (không phải lỗi sản phẩm) — nên để nhóm kiểm lại nếu cần số liệu riêng.
- Tắt/bật mạng: xác nhận không crash, chưa đo chính xác "bao lâu sau khi có mạng lại thì nhận được thông báo mới" bằng số liệu cụ thể.
- Web Push thực nhận trên thiết bị: không kết luận được do giới hạn môi trường sandbox (không có GUI/Internet outbound ổn định cho headless, hoặc treo ở bước subscribe khi headed).
- Phiên hết hạn giữa lúc điền form, đổi vai người đang đăng nhập giữa chừng: chưa kịp kiểm do giới hạn thời gian của đợt test này.
