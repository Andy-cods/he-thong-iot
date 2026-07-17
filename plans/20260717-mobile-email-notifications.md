# Plan: Truy cập Mobile + Email thông báo cần duyệt

> Ngày lập: 2026-07-17 · Planner: Claude · Trạng thái: ĐANG TRIỂN KHAI (Sprint E + M1)
> Yêu cầu user: "tôi muốn phát triển để truy cập hệ thống ở mobile cũng được, nếu có thông báo cần duyệt thì gửi thông báo vào mail cho tôi"

## ✅ Quyết định user đã chốt (2026-07-17)
1. **Cách gửi (CẬP NHẬT):** user KHÔNG muốn đưa mật khẩu mailbox `info@gtam.vn` (chỉ muốn NHẬN thông báo, không muốn hệ thống đăng nhập hộp thư). → Chuyển sang **dịch vụ gửi email chuyên dụng Resend** (HTTP API, chỉ cần 1 API key, tách hoàn toàn khỏi mailbox). Worker chọn transport theo thứ tự **Resend → SMTP relay → skip**, nên vẫn giữ được đường SMTP (M365/Brevo/SendGrid) làm dự phòng.
   - Resend free 3000 mail/tháng, 100/ngày. Chưa verify domain → sender `onboarding@resend.dev`, **chỉ gửi được tới email đã đăng ký tài khoản Resend** (đủ để nhận thông báo cá nhân). Verify `songchau.vn` (thêm DNS record — user kiểm soát domain này vì `mes.songchau.vn` đã trỏ VPS) → gửi tới mọi địa chỉ + sender chuyên nghiệp `mes@songchau.vn`.
   - Ghi chú M365 (nếu sau này chọn SMTP relay qua chính gtam.vn): basic-auth SMTP hoạt động tới hết 12/2026, [timeline Microsoft 27/01/2026](https://techcommunity.microsoft.com/blog/exchange/updated-exchange-online-smtp-auth-basic-authentication-deprecation-timeline/4489835), sau chuyển OAuth2/Graph.
2. **Người nhận:** mọi user có quyền duyệt ĐÃ điền email thật trong trang Quản trị (admin kiểm soát bằng cách điền/xoá email). Email seed hiện là `@songchau.local` giả → cần điền lại email thật.
3. **Scope:** Sprint E + M1 (+ M2 form A4) cùng đợt.

## 🔑 Việc còn lại cần user (để email gửi thật)
1. Đăng ký tài khoản **Resend** (free, https://resend.com) **bằng chính email muốn nhận thông báo** (VD `info@gtam.vn` hoặc Gmail) → vào **API Keys** → tạo key → gửi tôi. Tôi ghi vào `/opt/hethong-iot/secrets/resend_api_key.txt` + restart worker (~2 phút).
2. (Tùy chọn, để gửi tới NHIỀU địa chỉ) verify domain `songchau.vn` trên Resend: thêm 3 DNS record Resend cung cấp vào DNS songchau.vn → set `MAIL_FROM=mes@songchau.vn`.
3. Điền email thật cho các account cần nhận trong **Quản trị → Người dùng** (tối thiểu account `admin`).

---

## 1. Kết quả khảo sát hiện trạng (2 agent, 2026-07-17)

### 1.1 Mobile — tin tốt: nền tảng ĐÃ CÓ SẴN ~60%

**Đã xong, KHÔNG cần làm lại:**
- ✅ Viewport meta chuẩn Next 14 (`apps/web/src/app/layout.tsx:73-78`).
- ✅ PWA hoàn chỉnh: `next-pwa` đã cài + config (`next.config.js:35-62`), `public/manifest.webmanifest` (display standalone, đủ icons 192→512 + maskable), service worker đã generate (`public/sw.js`). Route mobile-first `/pwa/*` đã tồn tại.
- ✅ Mobile navigation: hamburger (`TopBar.tsx:78-87`, `md:hidden`) + drawer trái 280px qua `Sheet` (`AppShell.tsx:87-125`), auto-close khi đổi route.
- ✅ Dashboard, login, `/pwa/*`, `ItemListTable` (mẫu collapse cột chuẩn: base 4 cột mobile → 10 cột từ `md:`, `ItemListTable.tsx:118-119`), form LSX — đều responsive tốt.
- ✅ `ui/sheet.tsx` hỗ trợ 4 hướng + bottom-sheet (`h-[45/65/85vh]`) — đủ đồ nghề, không cần thêm thư viện.

**Blocker còn lại (xếp theo tần suất dùng trên điện thoại):**
| # | Vấn đề | File | Hiện trạng |
|---|--------|------|-----------|
| B1 | Bảng list Đề xuất vật tư grid cố định | `components/procurement/PRListTable.tsx:48` | scroll ngang, không collapse |
| B2 | Bảng list PO grid cố định 8 cột | `components/procurement/POListTable.tsx:50` | scroll ngang, vỡ mạnh |
| B3 | Form giấy A4 DNVT/MRF | `new-dnvt/page.tsx:253`, `new-mrf/page.tsx:290` | grid `[1fr_2fr_1fr]` cố định, tràn ngang <768px |
| B4 | BOM workspace multi-panel | `bom/[id]/*` | desktop-first, full-screen |
| B5 | Bảng admin/users, orders, reports | nhiều file | scroll ngang |

→ ~27 file đã có `overflow-auto` nên **không vỡ trang**, chỉ UX kém (phải scroll ngang).

### 1.2 Email — CHƯA có gì, nhưng mọi móc nối đã sẵn

- ✅ Notification in-app tập trung **1 service duy nhất**: `apps/web/src/server/services/notifications.ts` — 22 event_type, mọi insert đi qua `emitNotification()` (dòng 70) / `emitToUsersWithRole()` (dòng 119). → Chỉ cần hook 1 chỗ.
- ✅ `user_account.email` đã có (`packages/db/src/schema/auth.ts:39`, unique partial index) + admin UI đã cho nhập/sửa email (`UserForm.tsx`, API update). **Không cần migration, không cần sửa form.**
- ✅ Worker BullMQ có pattern thêm queue rõ ràng (4 bước: `QUEUE_NAMES` → `jobs/xxx.ts` → đăng ký `index.ts` → enqueue service phía web).
- ❌ Chưa có bất kỳ dependency/code gửi mail nào trong repo.
- ℹ️ Đã có hạ tầng Telegram bot (`TELEGRAM_BOT_TOKEN` trong `.env` VPS, dùng cho health-check/backup) — có thể làm kênh thông báo phụ sau này, nhưng scope này làm EMAIL theo yêu cầu user.

### 1.3 Các luồng "cần duyệt" trong hệ thống (nguồn sự kiện email)

| Event | Ai cần hành động | Notification hiện tại |
|-------|------------------|----------------------|
| `PR_SUBMITTED` — DNVT/YCVT mới chờ duyệt | purchaser + admin | role purchaser + fan-out admin |
| `PR_DEPT_APPROVED` — chờ giám đốc duyệt | purchaser/director | role purchaser |
| `WO_REQUEST_SUBMITTED` — YCSX chờ duyệt | operator | role operator |
| `ISSUE_REQUEST_NEW` — phiếu xuất kho chờ duyệt | warehouse | role warehouse |
| `PO_SUBCONTRACT_DRAFT` — PO gia công chờ chốt giá | purchaser | role purchaser |

→ Đây là **whitelist EMAIL_EVENTS** — chỉ gửi mail cho sự kiện cần hành động, KHÔNG gửi cho event thông báo kết quả (APPROVED/REJECTED/DELIVERED...) để tránh spam. Có thể mở rộng sau bằng 1 dòng config.

---

## 2. Phương án triển khai

### Sprint E — Email thông báo cần duyệt (làm TRƯỚC — giá trị cao nhất, ~1 ngày)

**Kiến trúc:** route handler → `emitNotification()` insert DB như cũ → nếu `event_type ∈ EMAIL_EVENTS` → enqueue job BullMQ `EMAIL_SEND` (fire-and-forget, không chặn request) → worker gửi qua `nodemailer` + SMTP (retry 3 lần, backoff). SMTP chết ≠ hệ thống chết.

**Chọn SMTP (khuyến nghị theo thứ tự):**
1. **Gmail + App Password** (khuyến nghị V1): free 500 mail/ngày, setup 10 phút, không cần DNS. Nên tạo Gmail riêng cho hệ thống (vd `songchau.mes@gmail.com`) thay vì Gmail cá nhân.
2. Resend/Brevo + domain `songchau.vn` (nâng cấp sau khi cần sender chuyên nghiệp `mes@songchau.vn` — cần thêm SPF/DKIM DNS records).

**Task chi tiết:**

| # | Việc | File |
|---|------|------|
| E1 | Thêm `EMAIL_SEND` vào `QUEUE_NAMES` | `packages/shared/src/constants.ts:105` |
| E2 | Job processor gửi mail: nodemailer transport (đọc `process.env.SMTP_*` theo pattern worker), template HTML tiếng Việt (tiêu đề + nội dung + nút "Mở phiếu" link `APP_URL + link`), log sent/fail | `apps/worker/src/jobs/emailSend.ts` (MỚI), dep `nodemailer` chỉ trong `apps/worker` |
| E3 | Đăng ký worker mới: handler + metricQueues + graceful shutdown | `apps/worker/src/index.ts:52,135,181,210` |
| E4 | Enqueue service phía web: `enqueueEmailSend(payload)`, **jobId = `email:{eventType}:{entityId}:{recipientUserId}`** → idempotent, chống gửi trùng | `apps/web/src/server/services/emailQueue.ts` (MỚI) |
| E5 | Hook vào notification service: sau insert thành công, nếu event ∈ `EMAIL_EVENTS` và recipient có email → enqueue. Với `emitToUsersWithRole` đã có sẵn danh sách user → join lấy email luôn. Try/catch riêng — lỗi queue không throw | `apps/web/src/server/services/notifications.ts:70-138` |
| E6 | Env: `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASSWORD` (hỗ trợ `_FILE` secret), `MAIL_FROM`, `MAIL_ENABLED` (default false — bật bằng env, dev không gửi thật) | `apps/web/src/lib/env.ts`, `apps/worker` đọc process.env, `.env.example`, compose VPS thêm env cho `worker` |
| E7 | Điền email cho các account cần nhận (admin + purchaser...) qua trang admin/users có sẵn | prod, thao tác UI |
| E8 | E2E prod: submit 1 PR test → email tới hộp thư trong <1 phút, link mở đúng phiếu trên điện thoại → xoá data test | prod |

**DoD Sprint E:** tạo DNVT thật trên prod → người duyệt nhận email tiếng Việt có nút mở đúng phiếu; SMTP sai/chết chỉ log warn, flow nghiệp vụ không ảnh hưởng; không gửi trùng khi retry; `MAIL_ENABLED=false` thì im lặng hoàn toàn.

### Sprint M1 — Mobile cho luồng DUYỆT (~1-2 ngày)

Mục tiêu: **từ email trên điện thoại → bấm link → xem + DUYỆT được phiếu**. Không tham vọng responsive 100% hệ thống.

| # | Việc | File |
|---|------|------|
| M1.1 | PRListTable collapse cột theo mẫu ItemListTable (mobile giữ: Số phiếu / Tên / Trạng thái; ẩn `hidden md:block` phần còn lại) | `components/procurement/PRListTable.tsx` |
| M1.2 | Trang chi tiết PR + nút Duyệt/Từ chối: audit trên viewport 390px, sửa các grid cố định nếu tràn | `procurement/purchase-requests/[id]/*` |
| M1.3 | Tương tự cho màn duyệt ISR (xuất kho) + YCSX (work-orders) — 2 màn approve còn lại | `warehouse/*`, `work-orders/[id]` |
| M1.4 | POListTable collapse cột (purchaser duyệt PO trên điện thoại) | `components/procurement/POListTable.tsx` |
| M1.5 | Trang `/notifications` responsive check | `(app)/notifications/page.tsx` |
| M1.6 | PWA verify trên điện thoại thật: cài "Add to Home Screen", cân nhắc đổi `start_url: "/pwa"` → `"/"` (manifest hiện trỏ vào trang nhận hàng kho, không hợp với user duyệt phiếu) | `public/manifest.webmanifest` |
| M1.7 | Session TTL: duyệt qua điện thoại cần đăng nhập sẵn — kiểm tra `JWT_ACCESS_TTL` hiện tại có đủ dài cho thói quen mobile không (nếu quá ngắn, mỗi lần bấm link email lại phải login → cân nhắc TTL riêng/remember-me, quyết định khi test thực tế) | `lib/env.ts`, bàn sau khi test |

**DoD M1:** trên điện thoại thật (Chrome/Safari): nhận email → bấm link → thấy phiếu đầy đủ không scroll ngang → duyệt thành công → danh sách PR/PO đọc được thoải mái.

### Sprint M2 — Mobile mở rộng (OPTIONAL, ~2-3 ngày, làm sau khi M1 chạy ổn)

- Form giấy A4 `new-dnvt`/`new-mrf`: thêm mobile input mode (stack 1 cột, giữ layout A4 cho ≥md + in ấn). Người tạo phiếu chủ yếu ngồi máy tính nên ưu tiên thấp.
- Bảng admin/users, orders, reports collapse cột.
- **KHÔNG làm:** BOM workspace responsive — thiết kế BOM là việc desktop, mobile chỉ cần xem/duyệt. Chấp nhận desktop-only, ghi rõ trong docs.

---

## 3. Rủi ro & lưu ý

1. **Gmail App Password** yêu cầu bật 2FA trên account Gmail. Limit 500 mail/ngày — quá đủ (hệ thống hiện <50 notification/ngày).
2. **Outbound SMTP từ VPS:** cổng 587 (submission) thường mở; cần verify từ VPS `nc -zv smtp.gmail.com 587` trước khi code (một số nhà mạng VN chặn 25, hiếm khi chặn 587).
3. **Email vào Spam:** gửi qua smtp.gmail.com bằng chính account Gmail thì SPF/DKIM tự pass. Nếu sau này chuyển sender `@songchau.vn` mới cần DNS.
4. **Secret:** App Password đưa qua env/secret file trên VPS, TUYỆT ĐỐI không commit (bài học audit S.1).
5. **Chống spam email:** whitelist event + jobId idempotent + chỉ gửi cho user có email ≠ null. Nếu sau này ồn quá → thêm cột `email_notifications_enabled` per-user (để sau, YAGNI).

## 4. Ước lượng & thứ tự

| Sprint | Nội dung | Effort | Phụ thuộc |
|--------|----------|--------|-----------|
| E | Email thông báo cần duyệt | ~1 ngày | User cung cấp Gmail + App Password |
| M1 | Mobile luồng duyệt | ~1-2 ngày | Không (song song E được) |
| M2 | Mobile mở rộng | ~2-3 ngày | Sau M1, optional |

## 5. ❓ 3 câu hỏi cần user chốt trước khi code

1. **Gmail gửi mail:** tạo Gmail mới riêng cho hệ thống (khuyến nghị, vd `songchau.mes@gmail.com`) hay dùng Gmail có sẵn? → Cần bật 2FA + tạo App Password (Google Account → Security → App passwords) rồi đưa tôi qua VPS env.
2. **Ai nhận email:** chỉ mình bạn (admin), hay tất cả người có quyền duyệt mà đã điền email trong trang Quản trị? (Khuyến nghị: tất cả — admin điền email cho acc nào thì acc đó nhận; không điền = không nhận.)
3. **Scope:** làm Sprint E + M1 luôn, hay E trước rồi báo cáo?
