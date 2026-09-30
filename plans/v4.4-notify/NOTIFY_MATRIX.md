# NOTIFY_MATRIX.md — Ma trận thông báo V4.4

TASK-notify V4.4 — kiểm/vá toàn bộ hệ thống thông báo. Nguồn sự thật:
`apps/web/src/server/services/notification-plans.ts` (thuần, có test) +
`notifications.ts` (dispatch/DB) + 3 job worker (`apps/worker/src/jobs/*ReminderScan.ts`).

## Nguyên tắc

- **Fan-out (direct)**: mọi `notify*()` hiện nay đều insert 1 dòng
  `recipient_user` / người nhận (KHÔNG dùng `recipient_role` broadcast nữa —
  cột này giữ lại trong schema cho tương thích ngược nhưng không còn code nào
  ghi vào). Lý do: broadcast không đếm badge, dễ bị bỏ sót — xem comment
  V3.16 trong `notifications.ts`.
- **category** (V4.4 mới): `"action"` (Cần bạn duyệt) | `"reminder"` (Nhắc hạn,
  worker) | `"update"` (Cập nhật, mặc định). Tính THEO EVENT_TYPE lúc đọc
  (`categoryForEventType()`), KHÔNG lưu cột riêng trong DB — xem
  `packages/db/migrations/0070_notify_category_and_push.sql` phần "LƯU Ý VẬN
  HÀNH" (staging/prod role vận hành không có quyền ALTER TABLE bảng
  `notification` do `hethong_app` sở hữu).
- **push** (V4.4 mới): `true` trên target nào cần Web Push thật — luôn đi kèm
  `category:"action"` hoặc nằm trong `EMAIL_EVENTS` (có test đối chiếu 2
  nguồn trong `notification-plans.test.ts`).
- **Link**: mỗi target có DANH SÁCH link ứng viên theo thứ tự ưu tiên;
  `resolveLink()` chọn link đầu tiên mà `isRouteAllowed(link, roles)` = true
  cho ĐÚNG vai trò người nhận (test bảng đầy đủ trong
  `notification-plans.test.ts`, > 250 case).
- **Chống trùng**: `emitNotification()` (notifications.ts) UPSERT — cùng
  `recipient_user` + `event_type` + `entity_id` đang CHƯA ĐỌC → cập nhật nội
  dung + đẩy `created_at` lên đầu thay vì chèn dòng mới. 3 job worker cũng đã
  đổi từ bulk-insert sang upsert-per-recipient tương tự.
- **Tự hết hiệu lực (RESOLVES_STALE)**: khi 1 eventType đại diện "đã xử lý
  xong bước trước" phát ra, các thông báo "chờ xử lý" CŨ hơn của CÙNG chứng từ
  (mọi người nhận) tự động `read_at = now()`. Bảng tra cứu đầy đủ ở cuối file
  này (mục "RESOLVES_STALE").
- **Tên hiển thị**: `actor_username` (cột DB, tên cũ nhưng nay lưu TÊN HIỂN
  THỊ) lấy từ `Session.fullName` (JWT claim `fn`, set lúc login từ
  `user_account.full_name`) — KHÔNG còn username đăng nhập. Tiêu đề nhiều
  event mới ghép thẳng tên người + mã chứng từ (VD "Nguyễn Văn A gửi đề xuất
  PR-2610-0012"), không dùng đại từ giới tính.

## Ma trận đầy đủ

Cột **Trước** = hành vi TRƯỚC đợt V4.4 (nếu khác). Cột **Trạng thái**: ✅ đã
đúng/giữ nguyên · 🔧 đã sửa đợt này · ⚠️ hạn chế đã biết (ghi rõ lý do).

### Đề xuất vật tư (PR / YCVT)

| Sự kiện | Người nhận (nay) | category | push | Link | Trạng thái |
|---|---|---|---|---|---|
| Gửi phiếu (`PR_SUBMITTED`) | warehouse (kiểm tồn), admin (duyệt nhanh) | action | ✓ | `/procurement/purchase-requests/:id` | 🔧 tiêu đề thêm tên người gửi |
| Kho duyệt bước 2 (`PR_DEPT_APPROVED`) | admin, purchaser (chờ duyệt cuối) + **người lập** (update, không email) | action (admin/purchaser) update (người lập) | ✓ (admin/purchaser) | như trên | ✅ |
| Duyệt cuối (`PR_APPROVED`) | purchaser (cần tạo PO), người lập (update), accountant (tải PDF) | action (purchaser) / update | — | PR | ✅ |
| Từ chối (`PR_REJECTED`) | người lập | update | — | PR | ✅ |
| Đã xuất kho (`PR_GOODS_ISSUED`) | người lập | update | — | PR | ✅ |
| Hoàn tất (`PR_COMPLETED`) | người lập | update | — | PR | ✅ |
| Nhắc chờ duyệt > 24h (`PR_PENDING_REMINDER`, worker) | vai trò tương ứng bước hiện tại + admin | reminder | — | PR | 🔧 đổi insert→upsert (chống dồn) |
| PR đã duyệt > 3 ngày chưa lên PO (`PR_APPROVED_NO_PO_REMINDER`, worker) | purchaser, admin | reminder | — | PR | 🔧 THÊM vào `NOTIFICATION_EVENT_TYPES`/nhãn/icon (worker đã phát nhưng web chưa nhận diện — bug thật, sẽ hiện "Thông báo" + chuông mặc định trước khi vá) + đổi insert→upsert |

### Đơn mua hàng (PO)

| Sự kiện | Người nhận | category | push | Trạng thái |
|---|---|---|---|---|
| PR duyệt → sinh N PO nháp (`PO_CREATED_FROM_PR`) | purchaser (chốt giá), người lập PR (update) | action (purchaser) | — | ✅ |
| PO gia công ngoài mới (`PO_SUBCONTRACT_DRAFT`) | purchaser (+ admin fallback nếu không có purchaser) | action | ✓ | ✅ |
| Gửi duyệt (`PO_APPROVAL_REQUESTED`) | admin (người duyệt PO duy nhất) | action | ✓ | ✅ |
| Giám đốc duyệt (`PO_APPROVED`) | người lập/gửi duyệt, purchaser (gửi NCC), người đề xuất PR gốc, warehouse (chuẩn bị nhận) | update | — | ✅ |
| Từ chối duyệt (`PO_APPROVAL_REJECTED`) | như trên | update | — | ✅ |
| Gửi NCC (`PO_SENT`) | warehouse | update | — | ✅ |
| Đổi giá (`PO_PRICE_UPDATED`) | warehouse (luôn); nếu đã duyệt/gửi NCC → thêm admin + accountant | update/warning | — | ✅ |
| Nhận 1 phần (`PO_RECEIVED_PARTIAL`) | purchaser | update | — | ✅ |
| Nhận đủ (`PO_RECEIVED_FULL`, `runOnce`) | purchaser, người đề xuất PR, **accountant (cần tạo HĐ mua)** | action (accountant) | — | ✅ (`runOnce` chặn báo lại khi QC đổi PARTIAL→RECEIVED→PARTIAL→RECEIVED) |
| Huỷ (`PO_CANCELLED`) | warehouse+admin (nếu đã duyệt/gửi), người lập, người đề xuất PR | update/warning | — | ✅ |
| Đóng (`PO_CLOSED`) | warehouse, accountant, người đề xuất PR | update | — | ✅ |
| HĐ mua nháp (`PO_INVOICE_DRAFT`) | accountant (+ admin fallback) | action | — | ✅ |
| HĐ mua đã ghi công nợ (`PO_INVOICE_CONFIRMED`) | purchaser, admin | update | — | ✅ |

### QC nhập kho

| Sự kiện | Người nhận | category | push | Trạng thái |
|---|---|---|---|---|
| Hàng chờ QC (`QC_RECEIPT_PENDING`) | qc | action | ✓ | ✅ |
| QC đạt (`QC_RECEIPT_PASSED`) | warehouse (nhả HOLD), người lập PO | update | — | ✅ |
| QC không đạt (`QC_RECEIPT_FAILED`) | warehouse, purchaser, người lập PO | error/update | — | ✅ |

⚠️ **Hạn chế đã biết**: `QC_RECEIPT_PENDING` KHÔNG nằm trong `RESOLVES_STALE`
— nếu 1 phiếu nhập có nhiều dòng chờ QC, QC xử lý xong 1 dòng chưa chắc đã
hết TOÀN BỘ phiếu chờ QC, nên không tự đánh dấu đã đọc để tránh ẩn nhầm việc
còn dở. Đánh đổi: nếu QC xử lý dòng CUỐI CÙNG, thông báo "chờ QC" cũ vẫn hiện
(đã đọc thủ công qua nút "Đánh dấu đã đọc"). Không sửa trong đợt này (thấp
rủi ro hơn ẩn nhầm việc thật).

### Lệnh sản xuất (WO)

| Sự kiện | Người nhận | category | push | Trạng thái |
|---|---|---|---|---|
| Yêu cầu SX mới (`WO_REQUEST_SUBMITTED`) | operator (+ admin fallback) | action | ✓ | 🔧 tiêu đề thêm tên người gửi |
| Gia công duyệt (`WO_APPROVED`) | người lập (creator) | update | — | ✅ |
| Phát hành đồng thời (`WO_RELEASED`) | operator khác (loại người vừa duyệt + người lập) | update | — | ✅ |
| Từ chối (`WO_REJECTED`) | người lập | update | — | ✅ |
| Bắt đầu SX (`WO_STARTED`) | người lập | update | — | ✅ |
| Huỷ (`WO_CANCELLED`) | người lập | update | — | ✅ |
| Hoàn thành (`WO_COMPLETED`) | người lập, warehouse (nhập thành phẩm) | update | — | ✅ |

### Phiếu yêu cầu vật tư (Material Request)

| Sự kiện | Người nhận | category | Trạng thái |
|---|---|---|---|
| Yêu cầu mới (`MATERIAL_REQUEST_NEW`) | warehouse | action | 🔧 tiêu đề thêm tên người gửi |
| Đang chuẩn bị (`MATERIAL_REQUEST_PICKING`) | người yêu cầu | update | ✅ |
| Đã chuẩn bị xong (`MATERIAL_REQUEST_READY`) | người yêu cầu | update | ✅ |
| Giao 1 phần/đủ (`MATERIAL_REQUEST_ISSUED`/`_DELIVERED`) | người yêu cầu | update | ✅ |
| Huỷ (`MATERIAL_REQUEST_CANCELLED`) | phía còn lại (Kho ↔ người yêu cầu, tuỳ ai huỷ) | update | ✅ |

### Yêu cầu xuất kho (ISR)

| Sự kiện | Người nhận | category | push | Trạng thái |
|---|---|---|---|---|
| Yêu cầu mới, lý do thường (`ISSUE_REQUEST_NEW`) | warehouse | action | ✓ | 🔧 tiêu đề thêm tên người gửi |
| Yêu cầu mới, xuất bán/trả NCC (`reason=sales\|return`) | admin (CHỈ Giám đốc duyệt) + warehouse (update, chờ) | action (admin) / update (warehouse) | ✓ (admin) | ✅ |
| Duyệt + đã xuất (`ISSUE_REQUEST_APPROVED`) | người yêu cầu | update | — | ✅ |
| Từ chối (`ISSUE_REQUEST_REJECTED`) | người yêu cầu | update | — | ✅ |

### Phiếu giao hàng / BBGH

| Sự kiện | Người nhận | category | push | Trạng thái |
|---|---|---|---|---|
| Tạo phiếu, chờ duyệt (`DELIVERY_NOTE_CREATED`) | admin (chỉ Giám đốc duyệt) | action | ✓ | 🔧 tiêu đề thêm tên người lập |
| Giám đốc duyệt → BBGH (`DELIVERY_NOTE_CONFIRMED`) | warehouse (in 3 liên), purchaser (lưu hồ sơ/đối chiếu) | update | — | ✅ |
| Từ chối (`DELIVERY_NOTE_REJECTED`) | người lập phiếu | update | — | ✅ |

### Tài chính

| Sự kiện | Người nhận | category | Nguồn | Trạng thái |
|---|---|---|---|---|
| Ghi nhận thanh toán (`FIN_PAYMENT_RECORDED`) | kế toán KHÁC (không phải người ghi); fallback admin nếu chỉ có 1 kế toán | update | app (route) | ✅ |
| Sắp đến hạn HĐ mua (`FIN_INVOICE_DUE_SOON`) | accountant + admin | reminder | worker (1 lần/ngày) | ✅ |
| Quá hạn HĐ mua (`FIN_INVOICE_OVERDUE`) | accountant + admin | reminder | worker (nhắc lại mỗi 7 ngày) | 🔧 đổi insert→upsert |
| Quá hạn công nợ phải thu (`FIN_RECEIVABLE_OVERDUE`) | accountant + admin + **shareholder** | reminder | worker (nhắc lại mỗi 7 ngày) | 🔧 đổi insert→upsert |

### Quản trị (reset mật khẩu / khoá tài khoản)

⚠️ **Chưa có thông báo notification-table cho các hành động admin này** —
hiện chỉ ghi `audit_event` (nhật ký), KHÔNG bắn `notification` cho người bị
tác động (VD nhân viên bị khoá tài khoản không nhận được thông báo trong
app — hợp lý một phần vì họ KHÔNG login được để xem chuông nữa, nhưng "đổi
mật khẩu hộ" thì nên báo). **Ngoài phạm vi sửa của đợt này** (rủi ro đụng
luồng bảo mật/audit trong thời gian ngắn) — khuyến nghị TASK riêng nếu chủ
xưởng cần.

### Kiểm kê

Không tìm thấy tính năng "kiểm kê" (stocktake) trong codebase hiện tại (grep
`stocktake|inventory.count|kiem-ke` không ra kết quả nghiệp vụ tương ứng) —
**không áp dụng** cho đợt này.

## RESOLVES_STALE (tự hết hiệu lực)

| Khi phát ra | Các eventType CŨ tự đánh dấu đã đọc (cùng entity_id, mọi người nhận) |
|---|---|
| `PR_DEPT_APPROVED` | `PR_SUBMITTED`, `PR_PENDING_REMINDER` |
| `PR_APPROVED` | `PR_SUBMITTED`, `PR_DEPT_APPROVED`, `PR_PENDING_REMINDER` |
| `PR_REJECTED` | `PR_SUBMITTED`, `PR_DEPT_APPROVED`, `PR_PENDING_REMINDER` |
| `PO_CREATED_FROM_PR` | `PR_APPROVED_NO_PO_REMINDER` |
| `PO_APPROVED` | `PO_APPROVAL_REQUESTED`, `PO_SUBCONTRACT_DRAFT` |
| `PO_APPROVAL_REJECTED` | `PO_APPROVAL_REQUESTED`, `PO_SUBCONTRACT_DRAFT` |
| `PO_CANCELLED` | `PO_APPROVAL_REQUESTED`, `PO_SUBCONTRACT_DRAFT` |
| `PO_CLOSED` | `PO_APPROVAL_REQUESTED` |
| `PO_INVOICE_CONFIRMED` | `PO_INVOICE_DRAFT` |
| `WO_APPROVED` | `WO_REQUEST_SUBMITTED` |
| `WO_REJECTED` | `WO_REQUEST_SUBMITTED` |
| `ISSUE_REQUEST_APPROVED` | `ISSUE_REQUEST_NEW` |
| `ISSUE_REQUEST_REJECTED` | `ISSUE_REQUEST_NEW` |
| `DELIVERY_NOTE_CONFIRMED` | `DELIVERY_NOTE_CREATED` |
| `DELIVERY_NOTE_REJECTED` | `DELIVERY_NOTE_CREATED` |
| `MATERIAL_REQUEST_PICKING` | `MATERIAL_REQUEST_NEW` |
| `MATERIAL_REQUEST_CANCELLED` | `MATERIAL_REQUEST_NEW`, `MATERIAL_REQUEST_PICKING`, `MATERIAL_REQUEST_READY` |

Xác nhận thật trên dữ liệu prod (staging clone) qua migration
`0071_notify_cleanup_stale.sql`: unread giảm từ **245 → 165** dòng (-33%)
ngay từ lần chạy đầu — ví dụ `PR_PENDING_REMINDER` 12 → 0, `PR_SUBMITTED`
42 → 22, `PR_DEPT_APPROVED` 30 → 10, `WO_REQUEST_SUBMITTED` 15 → 0.

## Dashboard "Cần xử lý" ⟷ Chuông "Cần bạn duyệt" (P0, bổ sung giữa chừng)

`GET /api/dashboard/action-items` TRƯỚC ĐÂY tự đếm lại bằng SQL riêng trên
`purchase_request`/`purchase_order`/`work_order` — **GLOBAL** (không theo
người xem), thiếu PR ở bước `DEPT_APPROVED` và không đếm ISR/BBGH/PO chờ
duyệt → báo "Ổn định" dù có việc thật đang chờ. Sửa: dùng ĐÚNG cùng nguồn với
nhóm "Cần bạn duyệt" (`getActionItemsForUser()` — unread + `category=action`
theo `recipient_user` = người xem), gộp theo `entity_type` bằng hàm thuần
`bucketActionItemsByEntityType()` (có vitest) thành 3 hàng hiện có của
`ActionItemsCard`. Cache Redis scope theo user (trước đây 1 key chung cho mọi
người — bug thứ 2). Xác nhận qua E2E (`tests/e2e/notify-matrix.mjs` nhóm C):
`purchaser` dashboard=5 khớp bell(action)=5 trên dữ liệu thật.

## Kênh gửi — deliver() + Web Push

- `apps/web/src/server/services/push.ts` — `deliverPush(userId, payload)`,
  gọi từ `notifications.ts#emitNotification` khi target có `push:true`.
  Thiếu khoá VAPID → bỏ qua êm (`isPushConfigured()`), không throw.
- Bảng `app.push_subscription` (migration 0070) — user_id, endpoint,
  p256dh, auth, unique theo endpoint (subscribe lại từ máy cũ update thay vì
  trùng dòng).
- API: `GET /api/push/public-key`, `POST /api/push/subscribe`,
  `POST /api/push/unsubscribe` (đều yêu cầu đăng nhập, chỉ thao tác
  subscription của chính mình).
- Service worker `apps/web/public/sw.js` — file TĨNH tự viết (đã BỎ
  `next-pwa`/Workbox generate — route `/pwa/receive` không còn tồn tại, chỉ
  còn cấu hình dư thừa từ trước), CHỈ xử lý `push` + `notificationclick`,
  KHÔNG cache offline. Đăng ký thủ công lúc người dùng bấm nút (không
  auto-register).
- UI: `PushNotificationToggle` trong trang `/notifications` — hiện trạng
  thái (chưa hỗ trợ/đã chặn/đã bật), hướng dẫn iPhone (Thêm vào MH chính,
  iOS 16.4+), xin quyền CHỈ khi bấm nút.
- Đã kiểm THẬT: Chromium (persistent profile — Push API bị Chrome CHẶN trong
  incognito/ephemeral context, `browser.newContext()` mặc định = ephemeral)
  subscribe thành công tới FCM thật, server `web-push.sendNotification()`
  gửi thành công, service worker nhận push thật và postMessage xác nhận về
  tab đang mở — xem `tests/e2e/push-register.mjs`.

## Hạn chế đã biết (tổng hợp)

1. `categoryForEventType()` suy theo eventType, không phân biệt được 2 người
   nhận khác vai trò của CÙNG 1 sự kiện (VD `PR_APPROVED` → purchaser "cần
   tạo PO" action thật, nhưng người lập chỉ "để biết" — cả 2 đều hiện
   category của EVENT, không theo TARGET). Đánh đổi lấy việc không cần cột
   DB mới / không cần quyền DDL trên bảng `notification` (owner `hethong_app`
   — xem migration 0070).
2. `QC_RECEIPT_PENDING` không nằm trong `RESOLVES_STALE` (rủi ro ẩn nhầm việc
   còn dở khi phiếu nhập nhiều dòng) — xem mục QC ở trên.
3. Quản trị (reset mật khẩu/khoá tài khoản) chưa phát `notification` —
   ngoài phạm vi đợt này.
4. "Kiểm kê" không tồn tại trong codebase — không áp dụng.
5. E2E tự động (`tests/e2e/notify-matrix.mjs`) chỉ dựng được luồng PR + WO
   (tạo item qua API thật). ISR/Material Request cần dữ liệu tồn kho thật
   (lot/bin) — không dựng nhanh trên DB rỗng; verify các luồng này qua
   `notification-plans.test.ts` (thuần, > 260 case) thay vì E2E sống.
6. Playwright push thật (`push-register.mjs`) cần Chromium HEADED
   (`headless:false`) — bug đã biết của headless Chromium: `Notification.
   permission` báo "denied" dù `grantPermissions`/`requestPermission()` đã
   "granted" (chỉ property đọc sai, không phải lỗi code). Máy dev Windows có
   desktop nên chạy được; CI headless-only cần xvfb hoặc chấp nhận SKIP.
