-- ============================================================================
-- SEED DỮ LIỆU DEMO — Phân hệ Tài chính (V4.0 đợt 2)
-- ============================================================================
-- MỤC ĐÍCH: user yêu cầu (2026-09-22) "fill vào đó data demo cho tôi xem" +
-- "tôi muốn có hoá đơn mua nguyên liệu, mua linh kiện hoặc chi những khoản
-- khác nhau thì cái này đều ghi nhận được chứ" — script này chứng minh hệ
-- thống ghi nhận đủ: hoá đơn mua NGUYÊN LIỆU, mua LINH KIỆN, GIA CÔNG NGOÀI,
-- DỤNG CỤ tiêu hao, hoá đơn BÁN (công nợ phải thu), thanh toán 1 đợt + nhiều
-- đợt (partial), và các khoản thu/chi KHÔNG có hoá đơn (lương, điện nước, vận
-- chuyển, chi khác, thu bán hàng/gia công).
--
-- MỌI bản ghi demo đều có chuỗi '[DEMO]' trong description/notes/name để dễ
-- lọc và xoá (xem khối DELETE cuối file).
--
-- CÁCH CHẠY:
--   psql "$DATABASE_URL" -f packages/db/migrations/seed-finance-demo.sql
-- Yêu cầu: migration 0055_finance_core.sql đã chạy trước (bảng fin_* tồn tại
-- + 10 danh mục gốc đã seed). Idempotent — chạy lại nhiều lần KHÔNG nhân đôi
-- dữ liệu (dùng ON CONFLICT DO NOTHING / kiểm tra tồn tại theo code/invoiceNo
-- trước khi insert).
--
-- CÁCH DỌN DẸP: xem khối "DỌN DẸP DEMO" ở cuối file — hiện đang comment, bỏ
-- comment (xoá dấu -- đầu dòng trong khối đó) rồi chạy lại để xoá sạch, đúng
-- thứ tự FK: allocation → transaction → payment → invoice → account.
--
-- GIẢ ĐỊNH (đọc kỹ khi kiểm chứng):
--   - Nếu `app.supplier` rỗng hoặc không có NCC tên khớp gợi ý bên dưới, các
--     hoá đơn IN sẽ có supplier_id = NULL (script tự dò bằng ILIKE + fallback
--     "NCC bất kỳ theo offset" — xem CTE `demo_supplier` bên dưới). Tên NCC
--     thật (nếu có) sẽ được dùng, không thì ghi rõ "NCC demo" trong notes.
--   - Hoá đơn OUT (bán hàng) KHÔNG có bảng `customer` trong schema hiện tại
--     (`fin_invoice.supplier_id` chỉ dành cho NCC) — tên khách hàng được ghi
--     trong `notes` thay vì FK, đúng với giới hạn schema thực tế.
--   - Ngày "hôm nay" tham chiếu để tính quá hạn là 2026-09-22 (theo yêu cầu
--     gốc) — dùng CURRENT_DATE khi so sánh nên nếu chạy sau ngày đó, một số
--     hoá đơn "còn hạn" có thể tự chuyển quá hạn theo logic ứng dụng (đúng
--     hành vi thật, không phải lỗi).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Danh mục bổ sung — CHI_LINHKIEN (mua linh kiện), seed gốc 0055 chưa có.
-- ----------------------------------------------------------------------------
-- Enum fin_* nằm trong schema `app` (xem DRIFT-NOTES mục 1) — phải set
-- search_path, nếu không mọi cast `::app.fin_direction` vẫn cần qualify tay.
SET search_path TO app, public;

INSERT INTO app.fin_category (code, name, direction) VALUES
  ('CHI_LINHKIEN', 'Chi mua linh kiện', 'OUT')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 1. Tài khoản giao dịch demo (3 cái) — idempotent theo `code`.
--
--    PHẢI set current_balance = opening_balance ngay khi INSERT.
--    Lý do: trigger `fin_account_recalc_balance` chỉ chạy khi fin_transaction
--    thay đổi. Tài khoản CHƯA có giao dịch nào sẽ giữ nguyên DEFAULT 0 của cột
--    → hiển thị số dư 0 dù đã nạp vốn đầu kỳ (phát hiện khi dry-run: TCB-002
--    nạp 200tr nhưng hiện 0đ). Repo `finAccounts.createAccount()` cũng làm
--    đúng như vậy (gán currentBalance = openingBalance lúc tạo) — seed SQL
--    ghi thẳng vào bảng nên phải tự lo bước này.
--    Khi có giao dịch đầu tiên, trigger sẽ recalc lại từ opening_balance.
-- ----------------------------------------------------------------------------
INSERT INTO app.fin_account (code, name, type, bank_name, account_number, opening_balance, opening_balance_date, current_balance)
VALUES
  ('TM-CHINH', '[DEMO] Tiền mặt tại quỹ', 'CASH', NULL, NULL, 50000000, '2026-07-01', 50000000),
  ('VCB-001',  '[DEMO] Vietcombank CN Bình Dương', 'BANK', 'Vietcombank', '0071000123456', 500000000, '2026-07-01', 500000000),
  ('TCB-002',  '[DEMO] Techcombank', 'BANK', 'Techcombank', '19035551234011', 200000000, '2026-07-01', 200000000)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Hoá đơn ĐẦU VÀO (direction=IN — mình mua, nợ NCC) — 6 cái đa dạng.
--    Dò supplier có thật theo tên gợi ý; nếu không có, lấy NCC bất kỳ theo
--    offset (để mỗi hoá đơn khác NCC nếu có đủ dữ liệu), cuối cùng mới NULL.
-- ----------------------------------------------------------------------------
WITH demo_supplier AS (
  SELECT
    (SELECT id FROM app.supplier WHERE name ILIKE '%thép%' OR name ILIKE '%kim khí%' OR code ILIKE '%THEP%' ORDER BY created_at LIMIT 1) AS steel,
    (SELECT id FROM app.supplier WHERE name ILIKE '%vòng bi%' OR name ILIKE '%cơ khí%' OR name ILIKE '%thiết bị%' ORDER BY created_at LIMIT 1) AS mech,
    (SELECT id FROM app.supplier WHERE name ILIKE '%CNC%' OR name ILIKE '%gia công%' OR name ILIKE '%nhiệt luyện%' ORDER BY created_at LIMIT 1) AS outsourced,
    (SELECT id FROM app.supplier WHERE name ILIKE '%dụng cụ%' OR name ILIKE '%dao%' OR name ILIKE '%công cụ%' ORDER BY created_at LIMIT 1) AS tooling,
    (SELECT id FROM app.supplier ORDER BY created_at OFFSET 0 LIMIT 1) AS any0,
    (SELECT id FROM app.supplier ORDER BY created_at OFFSET 1 LIMIT 1) AS any1,
    (SELECT id FROM app.supplier ORDER BY created_at OFFSET 2 LIMIT 1) AS any2,
    (SELECT id FROM app.supplier ORDER BY created_at OFFSET 3 LIMIT 1) AS any3
)
INSERT INTO app.fin_invoice
  (invoice_no, direction, supplier_id, issue_date, due_date, subtotal_amount, vat_rate, vat_amount, total_amount, paid_amount, status, notes)
SELECT * FROM (
  VALUES
  -- 1) Nguyên liệu — thép tấm SS400 (lớn, PAID 1 đợt)
  ('0001234', 'IN'::app.fin_direction, (SELECT COALESCE(steel, any0) FROM demo_supplier), DATE '2026-07-05', DATE '2026-08-04',
    95000000::numeric, 10::numeric, 9500000::numeric, 104500000::numeric, 104500000::numeric, 'PAID'::app.fin_invoice_status,
    '[DEMO] Mua thép tấm SS400 dày 10ly, khổ 1500x3000 — phục vụ SX khung máy. Đã thanh toán đủ 1 đợt.'),
  -- 2) Nguyên liệu — thép hộp 50x50 (PARTIAL, trả 2 đợt)
  ('0001589', 'IN'::app.fin_direction, (SELECT COALESCE(steel, any0) FROM demo_supplier), DATE '2026-08-10', DATE '2026-09-09',
    42000000::numeric, 8::numeric, 3360000::numeric, 45360000::numeric, 40360000::numeric, 'PARTIAL'::app.fin_invoice_status,
    '[DEMO] Mua thép hộp 50x50x2ly + thép hộp 40x40x2ly — SX khung đỡ. Đã trả 2 đợt, còn nợ 5.000.000đ.'),
  -- 3) Linh kiện — vòng bi SKF + bulong (PAID)
  ('AA/26E-0000567', 'IN'::app.fin_direction, (SELECT COALESCE(mech, any1) FROM demo_supplier), DATE '2026-07-18', DATE '2026-08-17',
    18500000::numeric, 10::numeric, 1850000::numeric, 20350000::numeric, 20350000::numeric, 'PAID'::app.fin_invoice_status,
    '[DEMO] Mua vòng bi SKF 6204 (40 cái) + bulong M12, M16 mạ kẽm — thay thế định kỳ. Đã thanh toán đủ.'),
  -- 4) Linh kiện — động cơ 3 pha 5.5kW (UNPAID, chưa tới hạn)
  ('AA/26E-0000812', 'IN'::app.fin_direction, (SELECT COALESCE(mech, any1) FROM demo_supplier), DATE '2026-09-02', DATE '2026-10-02',
    32000000::numeric, 8::numeric, 2560000::numeric, 34560000::numeric, 0::numeric, 'UNPAID'::app.fin_invoice_status,
    '[DEMO] Mua động cơ điện 3 pha 5.5kW 1450rpm (2 cái) — thay động cơ máy tiện T2. Chưa tới hạn thanh toán.'),
  -- 5) Gia công ngoài — phay CNC + nhiệt luyện (OVERDUE, chưa trả đồng nào)
  ('0002045', 'IN'::app.fin_direction, (SELECT COALESCE(outsourced, any2) FROM demo_supplier), DATE '2026-08-01', DATE '2026-08-31',
    26000000::numeric, 10::numeric, 2600000::numeric, 28600000::numeric, 0::numeric, 'OVERDUE'::app.fin_invoice_status,
    '[DEMO] Thuê gia công phay CNC 120 chi tiết trục + nhiệt luyện tôi cứng — đơn hàng khách ABC. QUÁ HẠN, chưa thanh toán.'),
  -- 6) Dụng cụ/tiêu hao — dao phay, mũi khoan (OVERDUE + PARTIAL)
  ('0002198', 'IN'::app.fin_direction, (SELECT COALESCE(tooling, any3) FROM demo_supplier), DATE '2026-07-22', DATE '2026-08-21',
    9200000::numeric, 8::numeric, 736000::numeric, 9936000::numeric, 5000000::numeric, 'OVERDUE'::app.fin_invoice_status,
    '[DEMO] Mua dao phay ngón phi 10-20, mũi khoan HSS bộ 1-13ly, dao tiện hợp kim — vật tư tiêu hao xưởng. QUÁ HẠN, đã trả 1 phần.')
) AS v(invoice_no, direction, supplier_id, issue_date, due_date, subtotal_amount, vat_rate, vat_amount, total_amount, paid_amount, status, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM app.fin_invoice fi
  WHERE fi.direction = 'IN' AND fi.invoice_no = v.invoice_no
);

-- ----------------------------------------------------------------------------
-- 3. Hoá đơn ĐẦU RA (direction=OUT — khách nợ mình) — 4 cái, rải aging bucket.
--    KHÔNG có bảng customer trong schema → supplier_id để NULL, tên khách ghi
--    trong notes. paid_amount = 0 cho cả 4 (không tạo payment cho OUT ở demo
--    này — mục đích thuần là minh hoạ công nợ phải thu + aging).
-- ----------------------------------------------------------------------------
INSERT INTO app.fin_invoice
  (invoice_no, direction, supplier_id, issue_date, due_date, subtotal_amount, vat_rate, vat_amount, total_amount, paid_amount, status, notes)
SELECT * FROM (
  VALUES
  -- Còn hạn (CURRENT) — due 2026-10-15
  ('0000891', 'OUT'::app.fin_direction, NULL::uuid, DATE '2026-09-15', DATE '2026-10-15',
    60000000::numeric, 10::numeric, 6000000::numeric, 66000000::numeric, 0::numeric, 'UNPAID'::app.fin_invoice_status,
    '[DEMO] Bán bộ chi tiết cơ khí gia công theo đơn hàng — Khách: Công ty TNHH Cơ khí Bình Minh. Còn hạn thanh toán.'),
  -- Quá hạn 1-30 ngày — due 2026-09-10 (quá hạn 12 ngày tính tới 2026-09-22)
  ('0000855', 'OUT'::app.fin_direction, NULL::uuid, DATE '2026-08-11', DATE '2026-09-10',
    35000000::numeric, 8::numeric, 2800000::numeric, 37800000::numeric, 0::numeric, 'OVERDUE'::app.fin_invoice_status,
    '[DEMO] Bán hàng khung đỡ + trục — Khách: Xưởng Cơ khí Thành Đạt. Quá hạn ~12 ngày.'),
  -- Quá hạn 31-60 ngày — due 2026-08-10 (quá hạn 43 ngày)
  ('0000762', 'OUT'::app.fin_direction, NULL::uuid, DATE '2026-07-11', DATE '2026-08-10',
    22000000::numeric, 10::numeric, 2200000::numeric, 24200000::numeric, 0::numeric, 'OVERDUE'::app.fin_invoice_status,
    '[DEMO] Thu phí gia công CNC thuê ngoài cho khách — Khách: Công ty CP Cơ điện Phương Nam. Quá hạn ~43 ngày.'),
  -- Quá hạn >90 ngày — due 2026-05-01 (quá hạn 144 ngày)
  ('0000601', 'OUT'::app.fin_direction, NULL::uuid, DATE '2026-04-01', DATE '2026-05-01',
    48000000::numeric, 8::numeric, 3840000::numeric, 51840000::numeric, 0::numeric, 'OVERDUE'::app.fin_invoice_status,
    '[DEMO] Bán hàng lô chi tiết máy đợt đầu năm — Khách: Công ty TNHH SX Đại Phát. Quá hạn >90 ngày, cần nhắc thu hồi công nợ.')
) AS v(invoice_no, direction, supplier_id, issue_date, due_date, subtotal_amount, vat_rate, vat_amount, total_amount, paid_amount, status, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM app.fin_invoice fi
  WHERE fi.direction = 'OUT' AND fi.invoice_no = v.invoice_no
);

-- ----------------------------------------------------------------------------
-- 4. Thanh toán + phân bổ + giao dịch cho các hoá đơn IN đã PAID/PARTIAL/OVERDUE-partial.
--    BẤT BIẾN (xem finPayments.ts): mỗi allocation PHẢI có ĐÚNG 1 fin_transaction
--    tương ứng (payment_id trỏ về payment). Mã chứng từ sinh tay theo đúng
--    format hệ thống PT-{yymm}-{seq4}/PC-{yymm}-{seq4}/TT-{yymm}-{seq4}, đã
--    tính trước để KHÔNG trùng trong cùng prefix+tháng (xem bảng seq ở đầu
--    file kế hoạch — liệt kê tường minh dưới đây, không dùng genDocNo vì đây
--    là script SQL thuần chạy 1 lần, không qua app layer).
--
--    5 payment demo:
--      TT-2607-0001  2026-07-25  IN-03 (AA/26E-0000567) trả đủ 20.350.000 — TM-CHINH   → PC-2607-0004
--      TT-2608-0001  2026-08-01  IN-01 (0001234)        trả đủ 104.500.000 — VCB-001   → PC-2608-0001
--      TT-2608-0002  2026-08-20  IN-02 (0001589) đợt 1  25.000.000 — VCB-001           → PC-2608-0004
--      TT-2608-0003  2026-08-25  IN-06 (0002198) đợt 1  5.000.000 — TM-CHINH           → PC-2608-0005
--      TT-2609-0001  2026-09-15  IN-02 (0001589) đợt 2  15.360.000 — VCB-001           → PC-2609-0002
--    (IN-02 minh hoạ partial payment 2 đợt: 25tr + 15,36tr = 40,36tr, còn nợ 5tr đúng
--     bằng paid_amount đã set ở bước 2.)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_acc_tm UUID;
  v_acc_vcb UUID;
  v_inv_01 UUID; -- 0001234 thép tấm
  v_inv_02 UUID; -- 0001589 thép hộp
  v_inv_03 UUID; -- AA/26E-0000567 vòng bi
  v_inv_06 UUID; -- 0002198 dụng cụ
  v_pay UUID;
BEGIN
  SELECT id INTO v_acc_tm FROM app.fin_account WHERE code = 'TM-CHINH';
  SELECT id INTO v_acc_vcb FROM app.fin_account WHERE code = 'VCB-001';
  SELECT id INTO v_inv_01 FROM app.fin_invoice WHERE direction = 'IN' AND invoice_no = '0001234';
  SELECT id INTO v_inv_02 FROM app.fin_invoice WHERE direction = 'IN' AND invoice_no = '0001589';
  SELECT id INTO v_inv_03 FROM app.fin_invoice WHERE direction = 'IN' AND invoice_no = 'AA/26E-0000567';
  SELECT id INTO v_inv_06 FROM app.fin_invoice WHERE direction = 'IN' AND invoice_no = '0002198';

  -- ---- Payment 1: TT-2607-0001 — IN-03 trả đủ 20.350.000 (TM-CHINH) ----
  IF NOT EXISTS (SELECT 1 FROM app.fin_payment WHERE code = 'TT-2607-0001') THEN
    INSERT INTO app.fin_payment (code, direction, account_id, supplier_id, payment_date, total_amount, method, reference_no, notes)
    VALUES ('TT-2607-0001', 'OUT', v_acc_tm, (SELECT supplier_id FROM app.fin_invoice WHERE id = v_inv_03),
            '2026-07-25', 20350000, 'CASH', NULL, '[DEMO] Thanh toán đủ hoá đơn linh kiện vòng bi AA/26E-0000567')
    RETURNING id INTO v_pay;

    INSERT INTO app.fin_payment_allocation (payment_id, invoice_id, amount)
    VALUES (v_pay, v_inv_03, 20350000)
    ON CONFLICT DO NOTHING;

    INSERT INTO app.fin_transaction
      (code, direction, account_id, category_id, amount, transaction_date, description, counterparty_type, supplier_id, invoice_id, payment_id, status)
    VALUES ('PC-2607-0004', 'OUT', v_acc_tm,
            (SELECT id FROM app.fin_category WHERE code = 'CHI_LINHKIEN'),
            20350000, '2026-07-25', '[DEMO] Trả tiền hoá đơn linh kiện vòng bi AA/26E-0000567 (trả đủ)',
            'SUPPLIER', (SELECT supplier_id FROM app.fin_invoice WHERE id = v_inv_03), v_inv_03, v_pay, 'POSTED')
    ON CONFLICT (code) DO NOTHING;
  END IF;

  -- ---- Payment 2: TT-2608-0001 — IN-01 trả đủ 104.500.000 (VCB-001) ----
  IF NOT EXISTS (SELECT 1 FROM app.fin_payment WHERE code = 'TT-2608-0001') THEN
    INSERT INTO app.fin_payment (code, direction, account_id, supplier_id, payment_date, total_amount, method, reference_no, notes)
    VALUES ('TT-2608-0001', 'OUT', v_acc_vcb, (SELECT supplier_id FROM app.fin_invoice WHERE id = v_inv_01),
            '2026-08-01', 104500000, 'BANK_TRANSFER', 'UNC0801VCB', '[DEMO] Thanh toán đủ hoá đơn thép tấm SS400 0001234')
    RETURNING id INTO v_pay;

    INSERT INTO app.fin_payment_allocation (payment_id, invoice_id, amount)
    VALUES (v_pay, v_inv_01, 104500000)
    ON CONFLICT DO NOTHING;

    INSERT INTO app.fin_transaction
      (code, direction, account_id, category_id, amount, transaction_date, description, counterparty_type, supplier_id, invoice_id, payment_id, status)
    VALUES ('PC-2608-0001', 'OUT', v_acc_vcb,
            (SELECT id FROM app.fin_category WHERE code = 'CHI_NGUYENLIEU'),
            104500000, '2026-08-01', '[DEMO] Trả tiền hoá đơn thép tấm SS400 0001234 (trả đủ)',
            'SUPPLIER', (SELECT supplier_id FROM app.fin_invoice WHERE id = v_inv_01), v_inv_01, v_pay, 'POSTED')
    ON CONFLICT (code) DO NOTHING;
  END IF;

  -- ---- Payment 3: TT-2608-0002 — IN-02 đợt 1: 25.000.000 (VCB-001) ----
  IF NOT EXISTS (SELECT 1 FROM app.fin_payment WHERE code = 'TT-2608-0002') THEN
    INSERT INTO app.fin_payment (code, direction, account_id, supplier_id, payment_date, total_amount, method, reference_no, notes)
    VALUES ('TT-2608-0002', 'OUT', v_acc_vcb, (SELECT supplier_id FROM app.fin_invoice WHERE id = v_inv_02),
            '2026-08-20', 25000000, 'BANK_TRANSFER', 'UNC0820VCB', '[DEMO] Thanh toán đợt 1/2 hoá đơn thép hộp 0001589')
    RETURNING id INTO v_pay;

    INSERT INTO app.fin_payment_allocation (payment_id, invoice_id, amount)
    VALUES (v_pay, v_inv_02, 25000000)
    ON CONFLICT DO NOTHING;

    INSERT INTO app.fin_transaction
      (code, direction, account_id, category_id, amount, transaction_date, description, counterparty_type, supplier_id, invoice_id, payment_id, status)
    VALUES ('PC-2608-0004', 'OUT', v_acc_vcb,
            (SELECT id FROM app.fin_category WHERE code = 'CHI_NGUYENLIEU'),
            25000000, '2026-08-20', '[DEMO] Trả tiền hoá đơn thép hộp 0001589 (đợt 1/2)',
            'SUPPLIER', (SELECT supplier_id FROM app.fin_invoice WHERE id = v_inv_02), v_inv_02, v_pay, 'POSTED')
    ON CONFLICT (code) DO NOTHING;
  END IF;

  -- ---- Payment 4: TT-2608-0003 — IN-06 đợt 1: 5.000.000 (TM-CHINH) ----
  IF NOT EXISTS (SELECT 1 FROM app.fin_payment WHERE code = 'TT-2608-0003') THEN
    INSERT INTO app.fin_payment (code, direction, account_id, supplier_id, payment_date, total_amount, method, reference_no, notes)
    VALUES ('TT-2608-0003', 'OUT', v_acc_tm, (SELECT supplier_id FROM app.fin_invoice WHERE id = v_inv_06),
            '2026-08-25', 5000000, 'CASH', NULL, '[DEMO] Thanh toán 1 phần hoá đơn dụng cụ 0002198')
    RETURNING id INTO v_pay;

    INSERT INTO app.fin_payment_allocation (payment_id, invoice_id, amount)
    VALUES (v_pay, v_inv_06, 5000000)
    ON CONFLICT DO NOTHING;

    INSERT INTO app.fin_transaction
      (code, direction, account_id, category_id, amount, transaction_date, description, counterparty_type, supplier_id, invoice_id, payment_id, status)
    VALUES ('PC-2608-0005', 'OUT', v_acc_tm,
            (SELECT id FROM app.fin_category WHERE code = 'CHI_DUNGCU'),
            5000000, '2026-08-25', '[DEMO] Trả 1 phần hoá đơn dụng cụ 0002198 (còn nợ 4.936.000)',
            'SUPPLIER', (SELECT supplier_id FROM app.fin_invoice WHERE id = v_inv_06), v_inv_06, v_pay, 'POSTED')
    ON CONFLICT (code) DO NOTHING;
  END IF;

  -- ---- Payment 5: TT-2609-0001 — IN-02 đợt 2: 15.360.000 (VCB-001) ----
  IF NOT EXISTS (SELECT 1 FROM app.fin_payment WHERE code = 'TT-2609-0001') THEN
    INSERT INTO app.fin_payment (code, direction, account_id, supplier_id, payment_date, total_amount, method, reference_no, notes)
    VALUES ('TT-2609-0001', 'OUT', v_acc_vcb, (SELECT supplier_id FROM app.fin_invoice WHERE id = v_inv_02),
            '2026-09-15', 15360000, 'BANK_TRANSFER', 'UNC0915VCB', '[DEMO] Thanh toán đợt 2/2 hoá đơn thép hộp 0001589 (còn lại 5.000.000 chưa trả)')
    RETURNING id INTO v_pay;

    INSERT INTO app.fin_payment_allocation (payment_id, invoice_id, amount)
    VALUES (v_pay, v_inv_02, 15360000)
    ON CONFLICT DO NOTHING;

    INSERT INTO app.fin_transaction
      (code, direction, account_id, category_id, amount, transaction_date, description, counterparty_type, supplier_id, invoice_id, payment_id, status)
    VALUES ('PC-2609-0002', 'OUT', v_acc_vcb,
            (SELECT id FROM app.fin_category WHERE code = 'CHI_NGUYENLIEU'),
            15360000, '2026-09-15', '[DEMO] Trả tiền hoá đơn thép hộp 0001589 (đợt 2/2, trả xong 40.360.000/45.360.000)',
            'SUPPLIER', (SELECT supplier_id FROM app.fin_invoice WHERE id = v_inv_02), v_inv_02, v_pay, 'POSTED')
    ON CONFLICT (code) DO NOTHING;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Giao dịch KHÔNG hoá đơn (invoice_id/payment_id đều NULL) — 12 cái, rải
--    tháng 7/8/9/2026: lương (2), điện nước (3), vận chuyển (2), chi khác (2),
--    thu bán hàng/gia công (3). Mã PC/PT tính sẵn theo đúng thứ tự thời gian
--    trong từng prefix+tháng (đan xen với 5 giao dịch có payment ở bước 4 —
--    xem bảng seq đầy đủ trong comment bước 4).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_acc_tm UUID;
  v_acc_vcb UUID;
BEGIN
  SELECT id INTO v_acc_tm FROM app.fin_account WHERE code = 'TM-CHINH';
  SELECT id INTO v_acc_vcb FROM app.fin_account WHERE code = 'VCB-001';

  -- Chi lương công nhân (2 lần, VCB-001, không hoá đơn)
  INSERT INTO app.fin_transaction (code, direction, account_id, category_id, amount, transaction_date, description, counterparty_type, status)
  VALUES
    ('PC-2607-0001', 'OUT', v_acc_vcb, (SELECT id FROM app.fin_category WHERE code = 'CHI_LUONG'),
     92000000, '2026-07-10', '[DEMO] Chi lương công nhân xưởng kỳ 1 tháng 7/2026 (28 công nhân)', 'EMPLOYEE', 'POSTED'),
    ('PC-2607-0005', 'OUT', v_acc_vcb, (SELECT id FROM app.fin_category WHERE code = 'CHI_LUONG'),
     85000000, '2026-07-25', '[DEMO] Chi lương công nhân xưởng kỳ 2 tháng 7/2026 (28 công nhân)', 'EMPLOYEE', 'POSTED')
  ON CONFLICT (code) DO NOTHING;

  -- Chi điện nước (3 lần, TM-CHINH T7/T8, VCB-001 T9)
  INSERT INTO app.fin_transaction (code, direction, account_id, category_id, amount, transaction_date, description, counterparty_type, status)
  VALUES
    ('PC-2607-0002', 'OUT', v_acc_tm, (SELECT id FROM app.fin_category WHERE code = 'CHI_DIENNUOC'),
     3500000, '2026-07-15', '[DEMO] Tiền điện + nước xưởng tháng 7/2026', 'OTHER', 'POSTED'),
    ('PC-2608-0003', 'OUT', v_acc_tm, (SELECT id FROM app.fin_category WHERE code = 'CHI_DIENNUOC'),
     3800000, '2026-08-15', '[DEMO] Tiền điện + nước xưởng tháng 8/2026', 'OTHER', 'POSTED'),
    ('PC-2609-0003', 'OUT', v_acc_vcb, (SELECT id FROM app.fin_category WHERE code = 'CHI_DIENNUOC'),
     4100000, '2026-09-15', '[DEMO] Tiền điện + nước xưởng tháng 9/2026', 'OTHER', 'POSTED')
  ON CONFLICT (code) DO NOTHING;

  -- Chi vận chuyển (2 lần)
  INSERT INTO app.fin_transaction (code, direction, account_id, category_id, amount, transaction_date, description, counterparty_type, status)
  VALUES
    ('PC-2607-0003', 'OUT', v_acc_tm, (SELECT id FROM app.fin_category WHERE code = 'CHI_VANCHUYEN'),
     4200000, '2026-07-20', '[DEMO] Cước vận chuyển thép từ kho NCC về xưởng', 'OTHER', 'POSTED'),
    ('PC-2608-0006', 'OUT', v_acc_vcb, (SELECT id FROM app.fin_category WHERE code = 'CHI_VANCHUYEN'),
     5100000, '2026-08-28', '[DEMO] Cước vận chuyển giao hàng thành phẩm cho khách', 'OTHER', 'POSTED')
  ON CONFLICT (code) DO NOTHING;

  -- Chi khác (tiếp khách, văn phòng phẩm)
  INSERT INTO app.fin_transaction (code, direction, account_id, category_id, amount, transaction_date, description, counterparty_type, status)
  VALUES
    ('PC-2608-0002', 'OUT', v_acc_tm, (SELECT id FROM app.fin_category WHERE code = 'CHI_KHAC'),
     6500000, '2026-08-05', '[DEMO] Chi tiếp khách đối tác + ăn trưa đoàn khảo sát nhà máy', 'OTHER', 'POSTED'),
    ('PC-2609-0001', 'OUT', v_acc_vcb, (SELECT id FROM app.fin_category WHERE code = 'CHI_KHAC'),
     2400000, '2026-09-10', '[DEMO] Chi mua văn phòng phẩm + vật tư văn phòng quý 3', 'OTHER', 'POSTED')
  ON CONFLICT (code) DO NOTHING;

  -- Thu bán hàng / thu gia công (không hoá đơn — khách trả tiền mặt/chuyển khoản nhanh)
  INSERT INTO app.fin_transaction (code, direction, account_id, category_id, amount, transaction_date, description, counterparty_type, status)
  VALUES
    ('PT-2607-0001', 'IN', v_acc_vcb, (SELECT id FROM app.fin_category WHERE code = 'THU_BANHANG'),
     55000000, '2026-07-30', '[DEMO] Thu tiền bán phụ tùng lẻ cho khách vãng lai tháng 7/2026', 'CUSTOMER', 'POSTED'),
    ('PT-2608-0001', 'IN', v_acc_vcb, (SELECT id FROM app.fin_category WHERE code = 'THU_GIACONG'),
     18000000, '2026-08-30', '[DEMO] Thu phí nhận gia công tiện/phay cho xưởng bạn tháng 8/2026', 'CUSTOMER', 'POSTED'),
    ('PT-2609-0001', 'IN', v_acc_vcb, (SELECT id FROM app.fin_category WHERE code = 'THU_BANHANG'),
     42000000, '2026-09-18', '[DEMO] Thu tiền bán phụ tùng lẻ cho khách vãng lai tháng 9/2026', 'CUSTOMER', 'POSTED')
  ON CONFLICT (code) DO NOTHING;
END $$;

-- ============================================================================
-- VERIFY — đếm số bản ghi demo mỗi bảng + tổng thu/chi + số dư từng tài khoản.
-- ============================================================================
SELECT '=== Tài khoản demo ===' AS section;
SELECT code, name, type, opening_balance, current_balance
FROM app.fin_account
WHERE code IN ('TM-CHINH', 'VCB-001', 'TCB-002')
ORDER BY code;

SELECT '=== Hoá đơn demo theo direction + status ===' AS section;
SELECT direction, status, COUNT(*) AS so_luong, SUM(total_amount) AS tong_gia_tri
FROM app.fin_invoice
WHERE notes ILIKE '%[DEMO]%'
GROUP BY direction, status
ORDER BY direction, status;

SELECT '=== Payment demo ===' AS section;
SELECT COUNT(*) AS so_payment, SUM(total_amount) AS tong_thanh_toan
FROM app.fin_payment
WHERE notes ILIKE '%[DEMO]%';

SELECT '=== Payment allocation demo ===' AS section;
SELECT COUNT(*) AS so_allocation, SUM(pa.amount) AS tong_phan_bo
FROM app.fin_payment_allocation pa
JOIN app.fin_payment p ON p.id = pa.payment_id
WHERE p.notes ILIKE '%[DEMO]%';

SELECT '=== Transaction demo theo direction ===' AS section;
SELECT direction, COUNT(*) AS so_giao_dich, SUM(amount) AS tong_tien
FROM app.fin_transaction
WHERE description ILIKE '%[DEMO]%'
GROUP BY direction
ORDER BY direction;

SELECT '=== Đối chiếu: mỗi allocation phải có đúng 1 transaction (payment_id) ===' AS section;
SELECT
  (SELECT COUNT(*) FROM app.fin_payment_allocation pa JOIN app.fin_payment p ON p.id = pa.payment_id WHERE p.notes ILIKE '%[DEMO]%') AS so_allocation,
  (SELECT COUNT(*) FROM app.fin_transaction t JOIN app.fin_payment p ON p.id = t.payment_id WHERE p.notes ILIKE '%[DEMO]%') AS so_transaction_co_payment;

SELECT '=== Công nợ phải thu (aging, direction=OUT, demo) ===' AS section;
SELECT
  CASE
    WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN 'CURRENT'
    WHEN CURRENT_DATE - due_date BETWEEN 1 AND 30 THEN '1-30'
    WHEN CURRENT_DATE - due_date BETWEEN 31 AND 60 THEN '31-60'
    WHEN CURRENT_DATE - due_date BETWEEN 61 AND 90 THEN '61-90'
    ELSE '90+'
  END AS bucket,
  COUNT(*) AS so_hoa_don,
  SUM(total_amount - paid_amount) AS con_no
FROM app.fin_invoice
WHERE direction = 'OUT' AND status IN ('UNPAID', 'PARTIAL', 'OVERDUE') AND notes ILIKE '%[DEMO]%'
GROUP BY bucket
ORDER BY bucket;

-- ============================================================================
-- DỌN DẸP DEMO — MẶC ĐỊNH ĐANG COMMENT. Bỏ comment (xoá "-- " đầu mỗi dòng
-- SQL trong khối này) rồi chạy lại file/khối này để xoá sạch dữ liệu demo.
-- Thứ tự XOÁ đúng theo FK: allocation → transaction → payment → invoice → account.
-- ============================================================================
-- BEGIN;
--
-- DELETE FROM app.fin_payment_allocation pa
-- USING app.fin_payment p
-- WHERE pa.payment_id = p.id AND p.notes ILIKE '%[DEMO]%';
--
-- DELETE FROM app.fin_transaction
-- WHERE description ILIKE '%[DEMO]%'
--    OR payment_id IN (SELECT id FROM app.fin_payment WHERE notes ILIKE '%[DEMO]%');
--
-- DELETE FROM app.fin_payment
-- WHERE notes ILIKE '%[DEMO]%';
--
-- DELETE FROM app.fin_invoice
-- WHERE notes ILIKE '%[DEMO]%';
--
-- DELETE FROM app.fin_account
-- WHERE code IN ('TM-CHINH', 'VCB-001', 'TCB-002') AND name ILIKE '%[DEMO]%';
--
-- -- Tuỳ chọn: xoá luôn danh mục CHI_LINHKIEN nếu không muốn giữ (thường NÊN
-- -- giữ lại danh mục này vì nó là bổ sung nghiệp vụ hợp lệ, không chỉ là demo).
-- -- DELETE FROM app.fin_category WHERE code = 'CHI_LINHKIEN';
--
-- COMMIT;
-- ============================================================================
