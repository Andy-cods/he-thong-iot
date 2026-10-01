-- V4.5 QA-D P1-2 — chuyển các app.notification.link cũ trỏ `/sales?tab=fin-*`
-- (phát sinh trước khi Tài chính tách hub riêng `/finance` ở TASK-20261001)
-- sang `/finance` tương ứng. Khớp CHÍNH XÁC mapping
-- `LEGACY_FIN_TAB_REDIRECT` (apps/web/src/lib/legacy-redirects.ts).
--
-- Bối cảnh: route-guard `/sales` (lib/route-guard.ts) nay chỉ còn
-- admin/purchaser (bỏ accountant/shareholder) nên 2 vai chủ Tài chính bị
-- chặn trang TRƯỚC khi kịp redirect nếu còn thông báo cũ trỏ `/sales?tab=
-- fin-*` (xem QA-D P1-2). Route-guard/layout đã fix riêng (chuyển hướng
-- TRƯỚC khi kiểm quyền) nên bug KHÔNG còn phụ thuộc vào migration này — đây
-- chỉ là dọn dữ liệu để link lưu sẵn trong thông báo cũ trỏ thẳng `/finance`
-- (gọn hơn, không phải đi qua redirect mỗi lần bấm).
--
-- Idempotent: điều kiện WHERE chỉ khớp link còn ở dạng `/sales?tab=fin-*`;
-- sau khi chạy 1 lần, link đổi thành `/finance?...` nên chạy lại không đổi
-- gì thêm. Giữ nguyên mọi query khác sau tiền tố đã khớp (vd `invoiceId=…`
-- từ `financeInvoiceLink()`), KHÔNG động tới `sub=` nếu link cũ đã tự ghi.
--
-- LƯU Ý QUAN TRỌNG: migration này CHƯA được áp vào bất kỳ môi trường nào
-- (staging/prod) — xem báo cáo cuối task QA/fix. Cần review rồi áp thủ công
-- bằng `deploy/scripts/apply-sql-migrations.sh 0075_notification_link_finance.sql`.

-- 3 alias chính (TASK-20261001).
UPDATE app.notification
SET link = regexp_replace(link, '^/sales\?tab=fin-overview', '/finance?tab=overview')
WHERE link LIKE '/sales?tab=fin-overview%';

UPDATE app.notification
SET link = regexp_replace(link, '^/sales\?tab=fin-cashbook', '/finance?tab=cashbook')
WHERE link LIKE '/sales?tab=fin-cashbook%';

UPDATE app.notification
SET link = regexp_replace(link, '^/sales\?tab=fin-settle', '/finance?tab=settle')
WHERE link LIKE '/sales?tab=fin-settle%';

-- 5 alias cũ hơn (trước TASK-20260922 gộp sub-tab) — thêm sub= tương ứng.
UPDATE app.notification
SET link = regexp_replace(link, '^/sales\?tab=fin-invoices', '/finance?tab=cashbook&sub=invoices')
WHERE link LIKE '/sales?tab=fin-invoices%';

UPDATE app.notification
SET link = regexp_replace(link, '^/sales\?tab=fin-payments', '/finance?tab=cashbook&sub=payments')
WHERE link LIKE '/sales?tab=fin-payments%';

UPDATE app.notification
SET link = regexp_replace(link, '^/sales\?tab=fin-receivables', '/finance?tab=settle&sub=receivables')
WHERE link LIKE '/sales?tab=fin-receivables%';

UPDATE app.notification
SET link = regexp_replace(link, '^/sales\?tab=fin-accounts', '/finance?tab=settle&sub=accounts')
WHERE link LIKE '/sales?tab=fin-accounts%';

UPDATE app.notification
SET link = regexp_replace(link, '^/sales\?tab=fin-categories', '/finance?tab=settle&sub=categories')
WHERE link LIKE '/sales?tab=fin-categories%';
