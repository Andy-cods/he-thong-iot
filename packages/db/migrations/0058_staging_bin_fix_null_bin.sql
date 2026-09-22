-- V4.1 — HOTFIX: vá lỗ hổng MẤT TỒN KHO do nhận hàng không chọn vị trí (bin).
--
-- Bug đã xác minh trên prod: inventory_txn.to_bin_id = NULL khi nhận hàng mà
-- không chọn bin → view app.bin_inventory (migration 0034, dòng 53-87) có
-- `WHERE bm.bin_id IS NOT NULL` nên LOẠI HOÀN TOÀN giao dịch đó khỏi mọi
-- màn hình Kho (sơ đồ kho, FIFO pick, lookup SKU, KPI). Hàng đã nhận nhưng
-- biến mất — không xuất được, không nhìn thấy được.
--
-- Quyết định user (2026-09-22): tạo 1 bin hệ thống "Chờ xếp kệ" làm nơi chứa
-- mặc định khi không chọn bin, thay vì bắt buộc chọn bin hoặc gán default_bin
-- cho toàn bộ 863 item. Backfill 2 giao dịch đã bị mất về bin này.
--
-- 3 tầng chống tái diễn:
--   1) DB: bin "Chờ xếp kệ" luôn tồn tại + service layer luôn resolve về bin
--      này khi không có bin khác (xem apps/web/src/server/repos/receivingEvents.ts).
--   2) Service: postReceivingAtomic không bao giờ insert to_bin_id = NULL nữa.
--   3) DB constraint NOT VALID (chỉ áp cho dòng mới) chặn các đường ghi khác
--      lỡ quên set bin.

-- ════════════════════════════════════════════════════════════════════
-- 1. Tạo bin hệ thống "Chờ xếp kệ" (idempotent)
-- ════════════════════════════════════════════════════════════════════
-- Area riêng 'STAGING' (không đụng 90 bin area='A' hiện có) để không lẫn vào
-- đánh số kệ thật, nhưng vẫn pass check is_active=true nên hiển thị bình
-- thường trên mọi API/màn hình đang lọc theo is_active.
INSERT INTO app.location_bin (
  warehouse_code, zone, bin_code,
  area, rack, level_no, position, full_code,
  capacity, low_threshold,
  description,
  is_active
)
VALUES (
  'WH-01', 'STAGING', 'CHO-XEP-KE',
  'STAGING', '00', 0, '00', 'STAGING-CHO-XEP-KE',
  NULL,  -- capacity unlimited — đây là bin tạm, không giới hạn sức chứa
  NULL,
  'Chờ xếp kệ — hàng nhận vào chưa chọn vị trí lưu, cần xếp lại vào kệ thật. KHÔNG xoá bin này.',
  true
)
ON CONFLICT (warehouse_code, zone, bin_code) DO NOTHING;

COMMENT ON COLUMN app.location_bin.full_code IS
  'Mã đầy đủ Khu-Kệ-Ngăn-Ô, VD A-01-2-03. Bin đặc biệt STAGING-CHO-XEP-KE = "Chờ xếp kệ" (V4.1 hotfix mất tồn kho).';

-- ════════════════════════════════════════════════════════════════════
-- 2. Backfill 2 giao dịch IN_RECEIPT bị to_bin_id NULL (đã xác minh trên prod)
--    Idempotent: chỉ update khi to_bin_id vẫn còn NULL.
-- ════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_staging_bin_id UUID;
  v_updated_count  INT;
BEGIN
  SELECT id INTO v_staging_bin_id
  FROM app.location_bin
  WHERE warehouse_code = 'WH-01' AND zone = 'STAGING' AND bin_code = 'CHO-XEP-KE';

  IF v_staging_bin_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy bin Chờ xếp kệ sau khi insert — dừng backfill để tránh ghi sai';
  END IF;

  -- 2 giao dịch mất tích đã xác minh (SKU VT-2607-JXKE7 "tesst" qty 10,
  -- SKU VT-2607-LI9O1 "AL 6061" qty 1) — gán vào bin Chờ xếp kệ để hiện lại
  -- trên bin_inventory, KHÔNG xoá / KHÔNG đổi qty.
  UPDATE app.inventory_txn
  SET to_bin_id = v_staging_bin_id,
      notes = COALESCE(notes || ' | ', '') ||
              '[HOTFIX 2026-09-22] Backfill to_bin_id → Chờ xếp kệ (giao dịch nhận hàng không chọn bin, bị bin_inventory loại trừ do to_bin_id NULL — xem migration 0058)'
  WHERE id IN (
    'eaabceb6-766e-473b-80e6-e4075549c9d9', -- SKU VT-2607-JXKE7 "tesst" qty 10, 2026-07-16
    'bf8473fa-973c-44d9-b155-5082f4ad3567'  -- SKU VT-2607-LI9O1 "AL 6061" qty 1, 2026-09-15
  )
  AND tx_type = 'IN_RECEIPT'
  AND to_bin_id IS NULL
  AND from_bin_id IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Backfill to_bin_id → Chờ xếp kệ: % dòng cập nhật (0 = đã chạy trước đó, idempotent)', v_updated_count;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- 3. Phòng thủ tầng DB — CHECK constraint chặn giao dịch nhập/chuyển thiếu bin
--
-- Phạm vi: CHỈ áp dụng cho IN_RECEIPT (to_bin_id bắt buộc) — đúng bug đang vá.
--
-- KHÔNG mở rộng sang OUT_ISSUE / ADJUST_PLUS / ADJUST_MINUS / TRANSFER dù
-- code hiện tại (apps/web/src/app/api/warehouse/bins/[id]/adjust/route.ts,
-- .../transfer/route.ts, .../issue/route.ts) luôn set bin cho các tx_type
-- này — vì KHÔNG có quyền chạy SELECT kiểm tra dữ liệu thực tế trên prod để
-- xác nhận 100% dòng cũ thoả mãn (yêu cầu đề bài: "CẨN THẬN phải kiểm tra dữ
-- liệu hiện có trước khi thêm constraint... nếu không an toàn thì BỎ, đừng
-- làm liều"). Đặc biệt ASSEMBLY_CONSUME (apps/web/src/server/repos/assemblies.ts)
-- KHÔNG BAO GIỜ set from_bin_id theo thiết kế hiện tại (tiêu thụ logic, không
-- theo vị trí vật lý) nên tuyệt đối không được đưa vào scope constraint này,
-- nếu không sẽ chặn nhầm luồng lắp ráp đang chạy tốt.
--
-- NOT VALID: chỉ áp dụng cho INSERT/UPDATE mới từ nay, KHÔNG validate (quét)
-- dữ liệu cũ đang có trong bảng → an toàn 100%, không thể fail khi apply dù
-- lịch sử có bao nhiêu dòng NULL (kể cả 2 dòng vừa backfill ở bước 2, đằng
-- nào cũng đã được set to_bin_id nên không ảnh hưởng).
-- Idempotent: Postgres KHÔNG hỗ trợ `ADD CONSTRAINT IF NOT EXISTS`, nên bọc
-- DO block bắt duplicate_object. (Phát hiện khi dry-run: chạy file lần 2 lỗi
-- "constraint ... already exists" → migration không thể chạy lại an toàn.)
DO $$
BEGIN
  ALTER TABLE app.inventory_txn
    ADD CONSTRAINT inventory_txn_receipt_requires_bin
    CHECK (tx_type <> 'IN_RECEIPT' OR to_bin_id IS NOT NULL)
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Constraint inventory_txn_receipt_requires_bin đã tồn tại — bỏ qua.';
END $$;

COMMENT ON CONSTRAINT inventory_txn_receipt_requires_bin ON app.inventory_txn IS
  'V4.1 hotfix — chặn insert IN_RECEIPT thiếu to_bin_id (nguyên nhân gây mất tồn kho âm thầm qua view bin_inventory). NOT VALID: chỉ áp cho dòng mới, không quét dữ liệu lịch sử.';
