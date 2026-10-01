# [TEST-PO] E2E luồng PO từ đầu đến cuối — QA report

- Ngày chạy: 2026-10-01
- Môi trường: STAGING `http://localhost:3100` (health check 200 OK trước khi chạy). KHÔNG có worker — job định kỳ không chạy, không tính là lỗi.
- Công cụ: Playwright (`playwright@1.63.0`, driver tại root `node_modules`), script tạm `apps/web/.tmp-po-*.js` (đã xoá sau khi chạy xong), ảnh chụp tại `scratchpad/po-e2e/*.png`.
- Chứng từ dùng xuyên suốt: PR **52/PRD-MRF/1026** (mã `PR-2610-0144`) → PO **PO-2610-0144-01** → HĐ mua **NCC-INV-E2E-001** → Thanh toán **TT-2610-0011**.
- Ghi chú dữ liệu: do race condition debounce 200ms của `ItemPicker` khi script gõ nhanh 2 dòng liên tiếp, cả 2 dòng PR đều chốt vào cùng 1 vật tư "Vòng bi 6000ZZ" (SL 10 và SL 6) thay vì 2 SKU khác nhau như dự định ban đầu. Không ảnh hưởng tính hợp lệ của test (vẫn là 2 dòng, SL khác nhau, đủ để test nhận đủ/nhận một phần) — ghi nhận làm bằng chứng một lỗi UI tiềm ẩn (xem mục Lỗi #3).

## Tài khoản dùng

| Vai trò | Tài khoản | Ghi chú |
|---|---|---|
| Kế hoạch (lập phiếu) | `e2e.planner` | |
| Kho (duyệt bước 2, nhận hàng, xếp kệ, push) | `e2e.warehouse` | Context riêng (persistent) cho test Web Push |
| Thu mua (tạo PO, gửi NCC) | `e2e.purchaser` | |
| QC | `e2e.qc` | |
| Gia công (đối chứng — không liên quan) | `e2e.operator` | |
| Giám đốc (duyệt cuối, duyệt PO) | `admin` | |
| Kế toán | `ketoan` | Mật khẩu ban đầu không khớp `Test@1234` → admin **Đặt lại mật khẩu** qua UI (`/admin/users/[id]` → Hành động → Đặt lại mật khẩu) → đăng nhập mật khẩu tạm → bị bắt đổi → đổi thành `Test@1234` → đăng nhập lại. Toàn bộ qua UI, không gọi API trực tiếp. |

Mỗi vai giữ đúng 1 browser context/cookie suốt bài (storageState lưu lại, các lần chạy script sau chỉ resume — không đăng nhập lặp). Tổng số lần POST `/api/auth/login` thật cho mỗi tài khoản: 1 (trừ `ketoan`: 3 — tạm/đổi MK/lại, và `e2e.warehouse`: 2 — context thường + context persistent cho push).

## Bảng bước

| # | Bước | Ai thao tác | KQ | Thông báo kỳ vọng vs thực tế | Link mở đúng | Stale hết hiệu lực | Dashboard khớp chuông |
|---|---|---|---|---|---|---|---|
| 1 | Tạo phiếu đề xuất vật tư (MRF, 2 dòng) → tự gửi duyệt | planner | **PASS** | Kỳ vọng: warehouse + admin nhận `PR_SUBMITTED` (action); planner/purchaser/qc/operator không nhận. Thực tế: khớp 100% — warehouse nhận "...gửi đề xuất 52/PRD-MRF/1026 — cần kiểm tồn", admin nhận "...chờ duyệt". | N/A (chưa test click ở bước này) | N/A | N/A |
| 2 | Kho duyệt bước 2 (bấm thẳng từ chuông) | warehouse (`e2e.warehouse`) | **PASS** | Kỳ vọng: planner (update "qua bước 2/3"), purchaser (action), admin (action); warehouse (actor) không tự nhận. Thực tế khớp 100%. | **Đúng** — bấm item trong chuông → landedUrl chứa đúng `prId` | **Đúng** — `PR_SUBMITTED` cũ của warehouse hết unread ngay sau khi bấm (tự đọc); `PR_SUBMITTED` cũ của admin (chưa từng mở) cũng tự hết unread dù admin không thao tác gì (RESOLVES_STALE hoạt động đúng cho người KHÔNG phải actor) | Không đo riêng bước này (xem bước 7) |
| 3 | Giám đốc duyệt cuối (bấm thẳng từ chuông) | admin | **PASS** | Kỳ vọng: purchaser (action "Cần tạo PO"), planner (update), ketoan/accountant (action "tải PDF/Excel"); warehouse không nhận. Thực tế khớp 100%. | **Đúng** — landedUrl chứa đúng `prId` | **Đúng** — `PR_DEPT_APPROVED` cũ của admin và purchaser tự hết unread sau khi admin duyệt | — |
| 4 | Thu mua "Tạo PO" từ PR (chọn NCC "001" cho 2 dòng, gộp 1 PO) → nhập đơn giá → Gửi duyệt PO | purchaser | **PASS** | `PO_CREATED_FROM_PR` → planner (update); `PO_APPROVAL_REQUESTED` → admin (action, đúng số tiền 2.052.000đ). purchaser (actor) không tự nhận ở cả 2 sự kiện. | Chưa test ở bước tạo PO (dùng điều hướng tay); **có test** ở bước 5 | **Đúng** — `PR_APPROVED`/`PR_APPROVED_NO_PO_REMINDER` của PR nguồn hết unread sau khi PO được tạo | — |
| 5 | Giám đốc duyệt PO (bấm thẳng từ chuông) → Thu mua "Gửi NCC" | admin, purchaser | **PASS** | `PO_APPROVED` → planner + purchaser + warehouse (đều "update", đúng nội dung "chuẩn bị nhận hàng"/"có thể gửi NCC"); admin (actor) không tự nhận. Sau đó `PO_SENT` → **chỉ** warehouse. | **Đúng** — admin bấm từ chuông, landedUrl chứa đúng `poId` | **Đúng** — `PO_APPROVAL_REQUESTED` của admin hết unread sau khi tự duyệt | — |
| 6 | Kho nhận hàng qua wizard: dòng 1 nhận đủ (10/10, QC "Chờ" vì Kho không có quyền chọn "Đạt"), dòng 2 nhận một phần (4/6); **thử nhận vượt** dòng 1 = 15 (vượt 5) trước khi sửa lại | warehouse | **PASS** | Nút "Gửi nhận hàng" bị khoá (`disabled=true`) khi còn dòng vượt chưa tick "Xác nhận nhận vượt" + lý do ≥3 ký tự; sau khi sửa lại đúng SL, nút mở khoá (`disabled=false`) và gửi thành công. `QC_RECEIPT_PENDING` → **chỉ** qc (action, đúng số dòng=2, đúng PO). `PO_RECEIVED_PARTIAL` → **chỉ** purchaser (update). | N/A | N/A | — |
| 6b | Việc cần làm hôm nay → "Xếp kệ" lô vừa nhận | warehouse | **PASS** | Không có sự kiện thông báo gắn với xếp kệ (đúng thiết kế — chỉ là giao dịch chuyển kho nội bộ). "Chờ xếp kệ" giảm 7→6, đúng lô `LOT-E2E-FULL` biến mất khỏi danh sách. | N/A | N/A | — |
| 7 | QC kết luận "Đạt" cho dòng đã nhận đủ (lô `LOT-E2E-FULL`) | qc | **PASS** | `QC_RECEIPT_PASSED` → warehouse (update, "đã nhả HOLD") **và** purchaser (= người lập PO, update). qc (actor) không tự nhận. | N/A (xác nhận qua API trực tiếp) | N/A | — |
| 8 | Thu mua tạo HĐ mua nháp từ PO → Kế toán nhập số HĐ NCC + xác nhận ghi công nợ | purchaser, ketoan | **PASS** | `PO_INVOICE_DRAFT` → **chỉ** ketoan (action); purchaser (actor) không tự nhận. `PO_INVOICE_CONFIRMED` → purchaser + admin (update); ketoan (actor) không tự nhận. | N/A | **Đúng** — `PO_RECEIVED_FULL`/review cũ của PO nguồn hết unread khi HĐ nháp tạo (resolveExtraEntityIds) | — |
| 9 | Kế toán ghi nhận thanh toán một phần (800.000/1.728.000đ, Chi cho NCC) | ketoan | **PASS**\* | `FIN_PAYMENT_RECORDED` → role `accountant`; vì ketoan là actor bị loại, hệ thống đúng lý thuyết chuyển cho accountant KHÁC còn lại (`muahang`, dual-role purchaser+accountant) — **không** rơi về admin (admin chỉ nhận fallback khi KHÔNG còn accountant nào khác). Đã xác nhận bằng cách đọc code `assignRecipients()` + danh sách user thật (có 2 accountant: `ketoan`, `muahang`) — hành vi đúng thiết kế, không phải lỗi. (*) Không login được `muahang` để xem trực tiếp hộp thư (ngoài phạm vi tài khoản được giao) — xác nhận gián tiếp qua code + danh sách user. | N/A | N/A | — |
| 10 | Kho nhận nốt phần còn lại (2/2) → PO chuyển "Đã nhận" (RECEIVED) | warehouse | **PASS** | `PO_RECEIVED_FULL` → planner (action, "Linh kiện đã về"), purchaser (action, "đã nhận đủ"), ketoan (action, "có thể tạo HĐ mua"). Xem **Lỗi #1** — nội dung gửi ketoan gây hiểu nhầm vì HĐ đã tồn tại + đã xác nhận trước đó. | N/A | — | — |
| 11 | Web Push: Kho bật "Thông báo đẩy trên thiết bị này" (`chromium.launchPersistentContext`, `headless:false`, `grantPermissions(['notifications'])`) rồi planner tạo 1 phiếu MRF mới để kích hoạt push | warehouse (push), planner (trigger) | **PASS** | Service worker `sw.js` nhận push thật từ server và `postMessage({type:'push-received', payload})` về tab — bắt được **1 message** đúng nội dung phiếu vừa tạo (`"...gửi đề xuất 53/PRD-MRF/1026 — cần kiểm tồn"`, link đúng `prId`). Xác nhận server **đã gửi Web Push thật** tới thiết bị Kho, không chỉ ghi DB. Xem **Lỗi #2** (độ trễ UI "Bật thông báo"). | — | — | — |

## Kiểm tra bổ sung: Dashboard "Cần xử lý" vs chuông "Cần bạn duyệt"

Cả hai cùng nguồn `getActionItemsForUser()` (xem `apps/web/src/server/services/notifications.ts` + `apps/web/src/app/api/dashboard/action-items/route.ts`) nên về bản chất luôn khớp — nhưng dashboard có **cache Redis 30 giây theo user** (`CACHE_TTL_SECONDS = 30`, `dashboard-action-items.ts`). Bằng chứng thực đo: snapshot "baseline" và snapshot "sau khi PR_SUBMITTED phát sinh" (cách nhau ~5 giây) trả về **cùng `cachedAt`** cho cả warehouse/admin/purchaser — tức con số trên dashboard **chưa** phản ánh notification vừa phát sinh trong cửa sổ 30s đó. Khi mở lại trang Kho trực tiếp ~1 phút sau (ảnh `10-wh-bell-open.png`), "PR chờ xử lý" đã lên đúng 18 (tăng 1 so với baseline 17), khớp chuông. **Kết luận: khớp nhau về số liệu nguồn, nhưng dashboard có thể trễ tới 30 giây so với chuông — không phải lỗi, là thiết kế cache, nhưng đáng lưu ý nếu user bấm F5 ngay sau khi vừa có việc mới và thắc mắc sao số chưa đổi.**

## Danh sách LỖI / GHI CHÚ

### P2 — HĐ mua nháp vẫn báo "có thể tạo HĐ mua" dù đã có HĐ xác nhận
- **Tái hiện**: PO đã có HĐ mua `DRAFT` → `UNPAID` (xác nhận ghi công nợ) ở bước 8. Khi PO sau đó chuyển `RECEIVED` (bước 10, nhận nốt phần còn lại), `PO_RECEIVED_FULL` vẫn gửi cho `accountant`: *"PO ... đã nhận đủ — có thể tạo HĐ mua"* kèm hướng dẫn "tạo HĐ nháp, nhập số HĐ NCC rồi xác nhận" — dễ khiến Kế toán tưởng nhầm chưa có HĐ, dù bấm vào `PO_INVOICE_CONFIRMED` trước đó đã xử lý xong.
- **Nghi ngờ**: `apps/web/src/server/services/notification-plans.ts:897-928` (`planPOReceivedFull`) — không kiểm tra `invoice` hiện có trước khi soạn nội dung cho accountant; nơi gọi hàm này (receiving service, khi PO chuyển RECEIVED) cũng không truyền cờ "đã có HĐ" để đổi câu chữ.
- **Đề xuất**: nếu PO đã có invoice active, đổi nội dung thành "đã nhận đủ — kiểm tra lại HĐ mua hiện có" + link thẳng tới invoice thay vì gợi ý tạo mới.

### P3 — Kịch bản thanh toán không có accountant phụ sẽ rơi vào admin, chưa kiểm chứng trực tiếp
- **Ghi chú** (không phải lỗi được xác nhận): `FIN_PAYMENT_RECORDED` do `ketoan` (accountant) tự ghi → do còn 1 accountant khác (`muahang`, dual-role purchaser+accountant) trên hệ thống nên không rơi về admin-fallback. Đã xác nhận logic qua đọc mã nguồn (`assignRecipients()`, `apps/web/src/server/services/notification-plans.ts:334-361`) + danh sách user thật, nhưng **không** verify trực tiếp hộp thư của `muahang` (không có trong danh sách tài khoản test được giao, tránh phát sinh thao tác ngoài phạm vi). Khuyến nghị: nếu cần xác nhận 100%, bổ sung tài khoản test cho `muahang` hoặc tạm thời vô hiệu hoá role accountant của nó trong lần test sau để buộc rơi vào admin-fallback.

### P3 — Race condition ItemPicker khi gõ nhanh nhiều dòng liên tiếp
- **Tái hiện**: Trong form MRF 2 dòng, script gõ "C010424-P-10006" cho dòng 1 rồi ngay "C010424-P-10002" cho dòng 2 (cách nhau <1s, debounce 200ms). Kết quả: **cả 2 dòng cùng chốt vào 1 item** (`0.6000ZZ_NSK_230824` — "Vòng bi 6000ZZ") thay vì 2 SKU request khác nhau — nghi do state `ItemPicker` (query/debounce) bị dùng chung/race giữa 2 instance mở tuần tự quá nhanh, hoặc do component thứ 2 tái sử dụng cache query cũ trước khi debounce kịp cập nhật.
- **Nghi ngờ**: `apps/web/src/components/bom/ItemPicker.tsx` (debounce 200ms dòng ~77-80) kết hợp `apps/web/src/components/procurement/ItemPickerField.tsx`.
- **Mức độ**: P3 vì chỉ tái hiện khi thao tác rất nhanh (có thể là hạn chế của test script hơn là hành vi người dùng thật gõ tay), nhưng nên re-test thủ công bằng tay thật (không phải script) để loại trừ khả năng là bug thật — nếu người dùng dùng bàn phím/chuột nhanh (ví dụ dán nhiều dòng từ Excel) có thể gặp lại.

### Ghi chú — không phải lỗi
- Nút "Đánh dấu đã gửi" (xác nhận gửi PO cho NCC) không khớp regex ban đầu `/Xác nhận|Gửi NCC/` của script QA — đã sửa script, không phải lỗi sản phẩm.
- Kho (warehouse) **không** thấy nút QC "Đạt" trong wizard nhận hàng (chỉ thấy "NG"/"Chờ") — **đúng thiết kế** V4.1 KHO-01 (chỉ role có `approve:qcInspection` — qc/admin — được kết luận Đạt trực tiếp lúc nhận hàng).

## Kết luận

- **Số bước PASS/FAIL**: 11/11 bước chính PASS (bao gồm cả nhánh "nhận vượt bị chặn" và test Web Push), 0 FAIL chặn luồng.
- **Lỗi tìm thấy**: 1 lỗi P2 (nội dung thông báo kế toán gây hiểu nhầm khi PO nhận đủ dù đã có HĐ), 1 ghi chú P3 chưa xác nhận trực tiếp được (routing accountant phụ), 1 ghi chú P3 nghi vấn UI race condition cần test tay lại.
- **Kết luận chung**: **Mọi vai thao tác được đúng quyền** (Kế hoạch lập phiếu, Kho duyệt bước 2 + nhận hàng + xếp kệ, Giám đốc duyệt PR/PO, Thu mua tạo/gửi PO + tạo HĐ, QC kết luận, Kế toán xác nhận HĐ + ghi thanh toán) và **hệ thống thông báo hoạt động đúng thiết kế**: đúng người nhận (kể cả loại trừ actor), đúng link mở thẳng chứng từ, tự hết hiệu lực ("stale") đúng lúc kể cả với người chưa từng mở thông báo, dashboard "Cần xử lý" khớp số liệu chuông (trừ độ trễ cache 30s đã biết), và **Web Push hoạt động thật** (xác nhận bằng service worker nhận push + hiển thị, không chỉ ghi DB). Chỉ có 1 vấn đề nội dung thông báo (P2) đáng sửa, không có lỗi chặn nghiệp vụ.
