# SECURITY.md — Audit bảo mật hệ thống MES (he-thong-iot)

- **Ngày:** 2026-09-30 (+07)
- **Phạm vi:** AuthN/phiên, AuthZ (226 route API), Injection/XSS/Upload, Secrets & cấu hình, Hạ tầng VPS (SSH read-only), Audit log.
- **Phương pháp:** đọc code + lệnh SSH read-only trên `45.124.94.13`. KHÔNG brute-force, KHÔNG đổi mật khẩu, KHÔNG ghi dữ liệu. Đối chiếu với `plans/v4.1-audit-hoan-thien/AUDIT.md` + `codexdo.md` để không báo lại việc đã sửa (phiên 4h, rate-limit 300/phút/user, attachment magic-bytes, AD-02/03/04/05...).
- **Mức độ:** Critical / High / Medium / Low.

---

## Bảng tóm tắt

| # | Phát hiện | Vị trí | Mức | Trạng thái |
|---|---|---|---|---|
| S1 | `packages/db/src/seed.ts` hardcode mật khẩu admin `ChangeMe!234`, không guard `NODE_ENV`, dùng `onConflictDoUpdate` — chạy nhầm `pnpm db:seed` nhắm prod sẽ **reset mật khẩu admin về giá trị công khai trong code** | `packages/db/src/seed.ts:57-76` | **High** | Đã biết trước (plan cũ), **chưa fix** |
| S2 | Redis không đặt mật khẩu (`requirepass` rỗng) trên container `iot_redis` | VPS: `docker exec iot_redis redis-cli config get requirepass` | Medium | Mới xác nhận |
| S3 | SSH cho phép `PermitRootLogin yes` + `PasswordAuthentication yes` đồng thời; fail2ban không chạy | VPS: `sshd -T`, `systemctl is-active fail2ban` | Medium–High | Mới xác nhận |
| S4 | File `/opt/hethong-iot/.env` quyền `644` (world-readable) trên VPS | VPS: `ls -la /opt/hethong-iot/.env` | Medium | Mới xác nhận |
| S5 | 4 container (`app`/`worker`/`postgres`/`redis`) đều chạy user `root` bên trong container | VPS: `docker exec <c> whoami` | Medium | Mới xác nhận |
| S6 | Backup DB chỉ lưu trên chính VPS (2 thư mục `/var/backups/iot`, `/opt/hethong-iot/backups` — cùng ổ đĩa), không có bản sao ngoài VPS | VPS: cron `backup-pg.sh` | High | Mới xác nhận |
| S7 | Unattended-upgrades tắt hoàn toàn; 4 gói chờ cập nhật bảo mật | VPS: `/etc/apt/apt.conf.d/20auto-upgrades` | Low–Medium | Mới xác nhận |
| S8 | Caddyfile thực tế trên VPS **không có Content-Security-Policy / Permissions-Policy**; `deploy/Caddyfile` trong repo là bản lỗi thời (kiến trúc Cloudflare Tunnel cũ) — không phản ánh prod thật | VPS: `/opt/hethong-iot/Caddyfile` vs repo `deploy/Caddyfile` | Medium | Mới xác nhận |
| S9 | `.claude/settings.local.json` bị git-track (không nằm trong `.gitignore`), lộ IP VPS thật + username root + path SSH key + GHCR image | `.gitignore:116` (chỉ có `.claude/settings.json`, thiếu `.local.json`) | Low–Medium | Mới xác nhận |
| S10 | Không có cơ chế CSRF token / kiểm tra Origin-Referer cho route ghi; chỉ dựa vào `SameSite=Lax` | `apps/web/src/lib/auth.ts:80` | Low | Ghi nhận (rủi ro thấp vì không có GET-mutation, cookie luôn Lax) |
| S11 | 6 script `tests/e2e/*.mjs` mặc định `BASE=https://mes.songchau.vn` — dễ thao tác nhầm lên prod bằng tài khoản test | `tests/e2e/*.mjs` | Medium (vận hành) | Mới xác nhận |
| S12 | 39 file (tăng từ ~20) còn chứa `ChangeMe!234`/`Test@1234`, đa số test/seed/doc chấp nhận được | rải rác | Low | Đã biết trước, số lượng tăng |
| S13 | `finance/attachments` POST (upload) và `admin/report-targets` POST/PATCH/DELETE thiếu `writeAudit` | `apps/web/src/app/api/finance/attachments/route.ts`; `apps/web/src/app/api/admin/report-targets/**` | Low | Mới xác nhận |
| S14 | Excel export (PR/PO/YCVT/DNVT) ghi thẳng free-text người dùng vào cell mà không tiền tố chống formula-injection (OWASP CSV injection) | `server/services/{dnvtExportExcel,ycvtExportExcel,batchPrTemplateExcel,batchSlipsExcel}.ts` | Low | Mới xác nhận (không tự thực thi khi mở file) |
| S15 | Import Excel (bom/finance/items) không giới hạn số dòng/sheet trước khi `ExcelJS.load()` — rủi ro DoS tài nguyên | `apps/web/src/app/api/{bom/imports/upload,finance/imports/transactions,imports/items}/route.ts` | Low–Medium | Mới xác nhận |
| — | AuthZ 226 route API | *(đang chờ kết quả agent con — xem mục 2)* | — | — |

**Đã xác minh AN TOÀN (không lặp lại phát hiện cũ)**: JWT HS256 + issuer/audience cố định, argon2id hash, cookie `httpOnly/secure(prod)/sameSite=lax`, session-revoke ≤30s (getSession check `sid`), lockout 10 lần/15 phút, rate-limit login theo IP+username, audit log đăng nhập thành công/thất bại, `must_change_password` không lách được thực tế (reset-password revoke toàn bộ session cũ), attachment upload (magic-bytes, path traversal chặn kép, giới hạn 10MB), PDF generation dùng `@react-pdf/renderer` (không phải HTML-to-PDF nên không XSS-vào-PDF), `sql.raw` trong `_docNumber.ts` chỉ nhận literal string cố định, 0 kết quả `eval`/`exec` nguy hiểm, Postgres/Redis không publish port ra ngoài host, UFW chỉ mở 22/80/443, security headers cơ bản (HSTS/X-Frame-Options/nosniff) có trên response thật, TLS hợp lệ (Let's Encrypt, còn hạn).

---

## 1. AuthN / Phiên đăng nhập

### 1.1 JWT
- Thuật toán cố định `HS256`, ký + verify đều enforce qua `algorithms: ["HS256"]`, có `issuer`/`audience` — chặn algorithm confusion. (`apps/web/src/lib/auth.ts:44-74`)
- Secret đọc qua `readSecret("JWT_SECRET")` — ưu tiên Docker secret file `_FILE`, fallback env. Trên VPS hiện dùng biến môi trường thường từ `.env` (không dùng file mount thật) — xem S4.
- TTL: 4 giờ tuyệt đối (`JWT_ACCESS_TTL=14400`, đã chốt D1), kiosk 24h. Đã xác nhận đúng theo quyết định V4.1.

### 1.2 Session revoke
- `getSession()` (`server/session.ts:24-44`) đối chiếu `sid` trong JWT với bảng `session` qua `isSessionValid()` (cache 30s) — phiên bị khoá/đổi role/reset password có hiệu lực thu hồi trong ≤30s, không cần đợi hết TTL. Đã áp dụng nhất quán ở cả API (`getSession`) lẫn UI layout (`(app)/layout.tsx:55`).
- `reset-password` (admin) gọi `revokeAllUserSessions()` ngay sau khi set `mustChangePassword=true` — JWT cũ của nạn nhân mất hiệu lực ngay, nên **không có đường lách "phải đổi mật khẩu" qua gọi thẳng API bằng token cũ** (cờ `mustChangePassword` bản thân không được check ở tầng API, nhưng không khai thác được vì phiên đã bị thu hồi cùng lúc).

### 1.3 Lockout & rate limit
- Sai mật khẩu 10 lần liên tiếp → khoá 15 phút, cập nhật ATOMIC bằng SQL expression (tránh lost-update khi nhiều request đồng thời). Dummy argon2 verify khi user không tồn tại/bị khoá — chống timing attack phân biệt "user tồn tại hay không". (`apps/web/src/app/api/auth/login/route.ts:143-221`)
- Rate limit: theo IP (60/60s, nới cho NAT văn phòng) + theo username (5/60s) cho login; API chung 300/phút/user (đã sửa từ lỗi theo-IP trước đó).

### 1.4 Cookie & CSRF
- Cookie `AUTH_COOKIE_NAME`: `httpOnly=true`, `secure=(NODE_ENV===production)`, `sameSite=lax`, `path=/`. Chỉ 1 nơi set cookie trong toàn bộ codebase — nhất quán.
- **Không có CSRF token/kiểm tra Origin-Referer riêng** cho các route ghi (S10). Rủi ro được giảm nhẹ vì: (a) `SameSite=Lax` chặn cookie gửi kèm cross-site POST/fetch (chỉ gửi kèm top-level GET navigation); (b) rà soát không thấy route GET nào có side-effect ghi DB. Vẫn khuyến nghị thêm `Sec-Fetch-Site` check hoặc CSRF token cho phòng thủ theo chiều sâu, đặc biệt nếu sau này thêm SameSite=None cho tích hợp bên thứ 3.

### 1.5 Middleware
- `middleware.ts` chỉ bảo vệ **trang UI** (redirect `/login`), verify JWT bằng `jose` (Edge-safe), fail-closed khi thiếu `JWT_SECRET`. **API routes không được middleware bảo vệ** — mỗi route tự gọi `requireCan`/`requireSession` (xem mục 2).

---

## 2. AuthZ — 226 route API

*(Phần này tổng hợp từ agent con audit AuthZ toàn bộ `apps/web/src/app/api/**/route.ts`, đối chiếu `packages/shared/src/rbac/matrix.ts`. Tự kiểm tra độc lập của phiên audit này — không trùng lặp — xác nhận: AD-02 (`admin/audit/export` dùng `requireCan(read,audit)`), AD-03 (`admin/stats` dùng `requireCan(read,session)`) đã sửa đúng, chỉ admin theo matrix hiện tại — không phải finding còn tồn tại. `notifications/[id]/read` lọc đúng `recipientUser=session.userId` — không IDOR. `bom-lines/[id]/pic-update` dùng `requireSession` nhưng tự thêm ownership check (`isPic`/`isPurchaser`/`isAdmin`) — không phải guard hở. 3 route duyệt PR (`dept-approve`/`director-approve`/`quick-approve`) tuy cùng RBAC action `approve:pr` nhưng mỗi route tự thu hẹp role bằng code (vd director-approve chỉ admin/purchaser) + kiểm `approvalStep` state-machine + `isSelfApprovalBlocked` (D8) — không nhảy cóc bước được.)*

**[CẦN BỔ SUNG]** — kết quả chi tiết từ 3 sub-agent (admin+finance; procurement+warehouse; bom/wo/assembly/eco/reports/notifications) đang được tổng hợp. Xem phần cập nhật tiếp theo của file này.

---

## 3. Injection / XSS / Upload

### 3.1 SQL Injection — không có lỗ hổng thật
- Toàn bộ `sql\`...\`` trong `server/repos/**` và `packages/db/src` dùng tagged template parameterize chuẩn Drizzle.
- `sql.raw(opts.table)`/`sql.raw(opts.column)` trong `server/repos/_docNumber.ts:52-88` — đã verify **mọi call site** (`deliveryNotes.ts`, `finPayments.ts`, `finTransactions.ts`, `goodsIssues.ts`, `materialRequests.ts`, `purchaseOrders.ts`, `purchaseRequests.ts`, `receivingEvents.ts`, `workOrders.ts`) chỉ truyền literal string hardcode, không có input từ request → an toàn.
- `sql.unsafe()` duy nhất ở `rlsContext.ts:103,133` chỉ nhận `pgRole` từ whitelist cố định 5 giá trị enum — an toàn.

### 3.2 XSS — không có lỗ hổng thật
- `dangerouslySetInnerHTML` chỉ 2 chỗ (`app/layout.tsx`, `ThemeProvider.tsx`), cả 2 render hằng số `THEME_INIT_SCRIPT` tĩnh, không chứa biến người dùng.
- `href`/`src` từ dữ liệu người dùng (attachment URL) đã gate qua `FIN_ATTACHMENT_URL_RE.test()` trước khi render — chặn `javascript:` URI.

### 3.3 Upload — an toàn (đã audit trước, xác nhận lại)
- `apps/web/src/server/services/attachments.ts`: magic-bytes sniffing thật (không tin `file.type` client), tên file lưu = UUID random + ext theo MIME thật, `resolveAttachmentPath` chặn path traversal 2 lớp (regex UUID tuyệt đối + `startsWith(dir + sep)`), giới hạn 10MB, `Content-Disposition` + `x-content-type-options: nosniff`. Không có vấn đề mới.

### 3.4 Path traversal đọc file
- Chỉ 1 route đọc file theo filename từ request (`finance/attachments/[filename]`) — đã an toàn như trên. Không route nào khác dùng `readFile`/`createReadStream` với path từ request.

### 3.5 eval/exec
- 0 kết quả thật (`grep eval\(|exec\(` chỉ match `RegExp.prototype.exec()` dùng parse ngày/mã — không liên quan `child_process`).

### 3.6 Phát hiện Low/Medium mới

| # | File:dòng | Mô tả | Kịch bản khai thác | Mức |
|---|---|---|---|---|
| S14 | `server/services/{dnvtExportExcel.ts:158-181, ycvtExportExcel.ts:207-252, batchPrTemplateExcel.ts, batchSlipsExcel.ts:120-135}` | Export Excel ghi free-text (ghi chú, tên NCC, lý do đề xuất...) trực tiếp vào cell mà không tiền tố chống công thức (`'`) | Đã verify qua source `exceljs@4.4.0`: gán string luôn lưu literal (`t="s"`/`t="str"`), KHÔNG tự sinh `<f>` — mở file **không tự thực thi** công thức. Rủi ro chỉ còn nếu người dùng thủ công copy-paste-as-formula trong Excel. | Low |
| S15 | `apps/web/src/app/api/{bom/imports/upload, finance/imports/transactions, imports/items}/route.ts` | Chỉ kiểm kích thước file (20MB) trước khi `ExcelJS.Workbook().xlsx.load()`, không giới hạn số dòng/sheet, không kiểm magic-bytes trước parse | File .xlsx nén tốt có thể giải nén thành workbook lớn, tốn CPU/RAM cho 1 request (Node đơn luồng cho CPU-bound). Không phải zip-bomb kinh điển nhưng thiếu resource guard. | Low–Medium |
| — | `warehouse/delivery-notes/[id]/pdf/route.ts:78`, `purchase-requests/[id]/export-pdf/route.ts:168` | `Content-Disposition` filename chỉ strip `/`,`\`, không strip `"` | Giá trị (`noteNo`/`paperFormNo`) do `genDocNo()` sinh nội bộ theo format cố định, không phải input tự do — không khai thác được với luồng hiện tại | Low (lý thuyết) |

---

## 4. Bí mật & cấu hình

### 4.1 Secrets trong repo — S1, S12
- **S1 (High, chưa fix):** `packages/db/src/seed.ts:57-76` — `SEED_ADMIN_PASSWORD ?? "ChangeMe!234"`, không guard `NODE_ENV !== "production"`, dùng `onConflictDoUpdate` cho user `admin`. Nếu ai chạy `pnpm db:seed` với `DATABASE_URL` vô tình trỏ vào prod → **ghi đè mật khẩu admin về giá trị công khai trong source code**. Đã ghi nhận từ `plans/20260716-system-polish-audit.md` (mục S.2, P0) nhưng code hiện tại **chưa có guard**.
  - **Cách sửa:** thêm `if (process.env.NODE_ENV === "production" && !process.env.SEED_ALLOW_PROD) throw new Error(...)`, đổi `onConflictDoUpdate` cho password thành `onConflictDoNothing()`.
- **S12 (Low, số lượng tăng):** 39 file hiện chứa `ChangeMe!234`/`Test@1234` (tăng từ ~20 file trước đó) — 24 file test/seed/migration, 14 file doc/plan, chỉ 1 file code thật (seed.ts, đã tính ở S1). Không cần dọn hết nhưng nên theo dõi không để lọt vào code path chạy trên prod.

### 4.2 Lịch sử git — sạch
- Không có `.env` thật nào từng bị commit (chỉ `.env.example` với placeholder `replace-with-openssl-rand-hex-32`).
- Không có `JWT_SECRET=`/`DB_PASSWORD=` giá trị thật nào từng lọt vào lịch sử git.
- `git ls-files | grep .env` chỉ trả `.env.example` + `deploy/.env.example` — không có `.env` thật bị track.

### 4.3 Docker secrets — đúng chuẩn
- `deploy/docker-compose.yml`: secrets (`db_password`, `jwt_secret`, `session_secret`, `r2_*`, `smtp_password`, `resend_api_key`) khai báo qua Docker secrets block, mount file `/run/secrets/*`, container nhận qua `{VAR}_FILE`. Compose file trong repo không chứa giá trị thật.
- **Lưu ý:** compose **đang chạy trên VPS** (`/opt/hethong-iot/docker-compose.yml`) lại truyền `JWT_SECRET`/`DATABASE_URL` qua biến môi trường literal `${VAR}` (đọc từ `.env` trên VPS) chứ không qua `_FILE` — khác với thiết kế Docker-secrets trong repo. Không phải lỗ hổng tự nó (file `.env` không bị commit), nhưng kết hợp với S4 (`.env` quyền 644) làm tăng rủi ro.

### 4.4 Tài khoản test/e2e
- 4 tài khoản `e2e.*` + seed `ketoan`/`codong` (`Test@1234`) nằm trong các file `.sql` **độc lập**, không chạy tự động qua `drizzle-kit push` — chỉ áp dụng khi người vận hành chủ động chạy tay. Không có cơ chế tự sinh tài khoản test trên prod.
- **S11 (Medium, vận hành):** 6 script `tests/e2e/*.mjs` mặc định `BASE = process.env.BASE || "https://mes.songchau.vn"` — dễ vô tình chạy thẳng vào production nếu quên set biến môi trường. Khuyến nghị đổi default về `localhost`, bắt buộc set tường minh khi nhắm prod.

### 4.5 File cấu hình khác
- **S9 (Low–Medium):** `.claude/settings.local.json` đang bị git-track (`.gitignore:116` chỉ có `.claude/settings.json`, thiếu biến thể `.local.json`) — chứa IP VPS thật (`45.124.94.13`), username `root`, đường dẫn SSH key (`~/.ssh/iot_vps`), image GHCR. Không chứa secret/token dạng plaintext, nhưng là thông tin trinh sát hạ tầng. Repo private nên rủi ro thấp — vẫn nên thêm vào `.gitignore` + `git rm --cached`.
- `.gitignore` thiếu pattern `*.pem`, `*.key` (phòng ngừa, hiện chưa có file nào loại này bị track).
- `.env.example` (root) có 5 dòng cấu hình Claude Code lạc vào cuối file (`export CLAUDE_CODE_EFFORT_LEVEL=...`) — rác, không phải secret.

---

## 5. Hạ tầng VPS (`45.124.94.13`, đọc qua SSH)

### 5.1 Mạng & firewall
- `ss -tlnp`: chỉ 22/80/443 listen ra `0.0.0.0`/`[::]`. Postgres/Redis **không** publish port ra host (`docker port iot_postgres`/`iot_redis` rỗng) — chỉ trong network nội bộ `iot_net` (172.18.0.0/16).
- UFW: `active`, default deny incoming, chỉ allow 22/80/443 (IPv4+IPv6). Đúng chuẩn.

### 5.2 SSH — S3
- `sshd -T`: `permitrootlogin yes`, `passwordauthentication yes`, `maxauthtries 6`. **Kết hợp 2 flag này nghĩa là root có thể đăng nhập bằng mật khẩu qua SSH** (không chỉ bằng key) — nếu root có mật khẩu yếu/bị đoán, đây là đường tấn công trực tiếp. `passwd -S root` cho thấy tài khoản root **đang đặt mật khẩu** (`P`, không phải `L` khoá hay `NP` rỗng).
- fail2ban: `inactive` — không có chống brute-force SSH tự động (dù `authorized_keys` chỉ 1 dòng, việc dò mật khẩu root qua Internet trên cổng 22 công khai vẫn là bề mặt tấn công không cần thiết).
- **Cách sửa:** đổi `PermitRootLogin prohibit-password` (chỉ cho SSH key, tắt password cho root) hoặc `no` hẳn (dùng user thường + `sudo`); bật `PasswordAuthentication no` toàn hệ (khoá đã setup, không cần password nữa); cài + bật fail2ban cho sshd.

### 5.3 Container hardening — S5
- `docker exec <container> whoami` → cả 4 container (`iot_app`, `iot_worker`, `iot_postgres`, `iot_redis`) đều trả `root`. Không có `USER` non-root nào trong Dockerfile/image runtime.
- **Rủi ro:** nếu app bị RCE (chưa phát hiện lỗ hổng RCE cụ thể trong audit này), attacker có ngay quyền root TRONG container, dễ leo thang hơn nếu kernel/container runtime có lỗ hổng escape.
- **Cách sửa:** thêm `USER node`/non-root trong Dockerfile cho `app`/`worker` (Postgres/Redis image chính thức có thể chạy non-root qua config riêng, cần kiểm tương thích volume permissions trước khi đổi).

### 5.4 Redis — S2
- `redis-cli ping` → `PONG` không cần auth; `config get requirepass` → rỗng. Không lộ ra internet (không publish port), nhưng trong cùng `iot_net`, bất kỳ container nào khác (hoặc process nào có network namespace đó) đọc/ghi toàn quyền Redis — chứa cache session-validity + BullMQ job queue. Một container bị chiếm (kể cả không phải root) có thể đầu độc cache phiên hoặc job queue.
- **Cách sửa:** đặt `requirepass` qua Docker secret, cấu hình `REDIS_URL` kèm password.

### 5.5 File permissions — S4
- `/opt/hethong-iot/.env` quyền `644 root:root` — world-readable trên VPS (bất kỳ user/process cục bộ nào, kể cả không phải root, đọc được `JWT_SECRET`, `DATABASE_URL`). Trên VPS single-purpose (chỉ chạy Docker), rủi ro thực tế phụ thuộc có process/user nào khác ngoài root hay không — nhưng vẫn nên siết theo nguyên tắc least-privilege.
- **Cách sửa:** `chmod 600 /opt/hethong-iot/.env`.

### 5.6 Backup — S6
- Cron `0 3 * * * /opt/iot-backup/backup-pg.sh` (thực tế log cho thấy chạy ~20:00 UTC = 03:00 VN) — pg_dump qua `docker exec`, gzip, retention 7 ngày, log xác nhận chạy đều đặn tới 2026-09-28 (không có ngày nào bị miss trong 20 ngày gần nhất kiểm tra).
- `/opt/hethong-iot/backups` có thêm các bản dump thủ công trước mỗi migration lớn (pre-v41-dot*.dump) — thói quen tốt.
- **Vấn đề:** cả `/var/backups/iot` (cron tự động) và `/opt/hethong-iot/backups` (thủ công trước migration) đều nằm **trên cùng ổ đĩa VPS**. Không thấy cấu hình sync ra ngoài (S3/rsync/rclone tới nơi khác). Nếu VPS mất dữ liệu (hỏng đĩa, xoá nhầm, ransomware, nhà cung cấp VPS gặp sự cố), **mất cả app lẫn toàn bộ backup cùng lúc**.
- **Cách sửa:** thêm bước cuối trong `backup-pg.sh` đẩy bản dump mới nhất ra nơi lưu trữ ngoài VPS (S3/R2 đã có sẵn credential trong hệ thống, hoặc đơn giản là rsync sang VPS/máy khác).

### 5.7 OS updates — S7
- Ubuntu 24.04.4 LTS, kernel `6.8.0-31-generic`. `unattended-upgrades` bị tắt hoàn toàn (`APT::Periodic::Unattended-Upgrade "0"`). 4 gói đang chờ cập nhật bảo mật tại thời điểm kiểm tra.
- **Cách sửa:** bật `unattended-upgrades` cho security updates tối thiểu (`Unattended-Upgrade::Allowed-Origins` mặc định đã gồm `${distro_id}:${distro_codename}-security`), hoặc lên lịch `apt update && apt upgrade` thủ công định kỳ.

### 5.8 Security headers & TLS
- `curl -sI https://mes.songchau.vn`: có `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`. TLS cert Let's Encrypt hợp lệ (`notAfter=Nov 15 2026`, còn hạn > 30 ngày).
- **S8 (Medium):** Caddyfile thực tế trên VPS (`/opt/hethong-iot/Caddyfile`) **không có `Content-Security-Policy` / `Permissions-Policy`**. File `deploy/Caddyfile` trong repo có 2 header này nhưng là **cấu hình lỗi thời** (viết cho kiến trúc Cloudflare Tunnel `iot.<domain>.vn` cũ, khác domain/kiến trúc `mes.songchau.vn` hiện tại) — không phản ánh đúng prod, dễ gây hiểu nhầm khi audit/onboarding sau này.
  - **Cách sửa:** thêm CSP hợp lý (`default-src 'self'; ...`) + `Permissions-Policy` vào Caddyfile **thật trên VPS**, đồng thời cập nhật `deploy/Caddyfile` trong repo khớp với cấu hình đang chạy (biến nó thành nguồn sự thật thay vì bị bỏ quên).

---

## 6. Audit log

- Coverage tốt: 130/226 route gọi `writeAudit` trực tiếp; các route không gọi phần lớn là GET thuần (dashboard, aging, stats, list) không cần audit.
- Hành động nhạy cảm chính đã có audit đầy đủ: login/logout (thành công + thất bại, có lý do), đổi/reset mật khẩu, khoá/mở user, duyệt/từ chối PR-PO-WO-ECO-deliveryNote, void giao dịch tài chính, HOLD/release lô, hoàn tất/huỷ lệnh SX.
- **S13 (Low):** 2 route ghi thiếu audit:
  - `POST /api/finance/attachments` (upload chứng từ tài chính) — không ghi ai đã upload file nào, khi nào. Nên thêm `writeAudit(action=CREATE, objectType=finance_attachment)`.
  - `POST/PATCH/DELETE /api/admin/report-targets[/[id]]` (cấu hình KPI target theo vai trò) — không ghi log thay đổi ngưỡng KPI. Mức độ thấp (không phải dữ liệu tiền/quyền truy cập) nhưng nên bổ sung cho đầy đủ audit trail.

---

## 7. Việc cần làm tiếp

1. **[P0/High]** Thêm guard `NODE_ENV` cho `packages/db/src/seed.ts` — chặn reset mật khẩu admin khi lỡ chạy seed nhắm prod (S1).
2. **[High]** Đẩy backup DB ra ngoài VPS (S3/R2/rsync tới máy khác) — hiện là single point of failure (S6).
3. **[Medium]** SSH: tắt `PasswordAuthentication` (đã có key sẵn), đổi `PermitRootLogin prohibit-password`, cài fail2ban (S3).
4. **[Medium]** Đặt mật khẩu Redis qua Docker secret (S2); `chmod 600` file `.env` trên VPS (S4); thêm CSP/Permissions-Policy vào Caddyfile thật + đồng bộ lại `deploy/Caddyfile` trong repo (S8).
5. **[Medium]** Container non-root cho `app`/`worker` nếu khả thi (S5); bật unattended-upgrades security (S7).
6. **[Low]** `git rm --cached .claude/settings.local.json` + thêm vào `.gitignore` (S9); đổi default `BASE` trong script e2e về localhost (S11); bổ sung `writeAudit` cho `finance/attachments` POST + `admin/report-targets` (S13); thêm tiền tố chống formula-injection cho Excel export (S14); giới hạn rowCount/sheet trước khi parse Excel import (S15).
7. Chờ tổng hợp phần AuthZ chi tiết (mục 2) từ agent con — cập nhật bảng tóm tắt khi có.
