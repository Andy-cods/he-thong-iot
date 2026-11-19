-- =============================================================
-- 0087b_shift_output.sql — V4.10 (TASK-20261118-001) Sản lượng ca xưởng Đông Anh
--
-- 11 bảng (site, user_site, site_machine, site_shift, site_part, site_operator,
-- site_defect_reason, site_downtime_reason, shift_output_entry,
-- shift_output_defect, shift_output_downtime) + role 'workshop' + seed site DONGAN.
-- KHÔNG thêm tenant_id vào bảng cũ. KHÔNG seed mã hàng & người phụ trách.
--
-- Phụ thuộc: 0087a_shift_output_role.sql ĐÃ chạy (enum role_code có 'workshop').
-- IDEMPOTENT (IF NOT EXISTS + DO $$ kiểm pg_constraint + ON CONFLICT DO NOTHING).
--   docker exec -i iot_postgres psql -U hethong_app -d hethong_iot -v ON_ERROR_STOP=1 -f /tmp/0087b_shift_output.sql
-- Rollback: plans/shift-output-dongan/sql/0087_rollback.sql
-- =============================================================
BEGIN;
SET LOCAL search_path TO app, public;

-- ── 1. site ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.site (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             varchar(32)  NOT NULL,
  name             varchar(200) NOT NULL,
  timezone         varchar(64)  NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  lock_after_hours integer      NOT NULL DEFAULT 24,
  backdate_days    integer      NOT NULL DEFAULT 2,
  ng_warn_pct      numeric(5,2) NOT NULL DEFAULT 10,
  is_active        boolean      NOT NULL DEFAULT true,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES app.user_account(id) ON DELETE SET NULL,
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES app.user_account(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS site_code_uk ON app.site (code);

-- ── 2. user_site (1 user ≤ 1 site) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.user_site (
  user_id     uuid PRIMARY KEY REFERENCES app.user_account(id) ON DELETE CASCADE,
  site_id     uuid NOT NULL REFERENCES app.site(id),
  assigned_by uuid REFERENCES app.user_account(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_site_site_idx ON app.user_site (site_id);

-- ── 3. Danh mục theo site ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.site_machine (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    uuid NOT NULL REFERENCES app.site(id),
  code       varchar(48)  NOT NULL,
  name       varchar(200) NOT NULL,
  model      varchar(120),
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app.user_account(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES app.user_account(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS site_machine_code_uk ON app.site_machine (site_id, code);

CREATE TABLE IF NOT EXISTS app.site_shift (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          uuid NOT NULL REFERENCES app.site(id),
  code             varchar(48)  NOT NULL,
  name             varchar(200) NOT NULL,
  start_time       time NOT NULL,
  end_time         time NOT NULL,
  crosses_midnight boolean NOT NULL DEFAULT false,
  sort_order       integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES app.user_account(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES app.user_account(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS site_shift_code_uk ON app.site_shift (site_id, code);

CREATE TABLE IF NOT EXISTS app.site_part (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid NOT NULL REFERENCES app.site(id),
  code          varchar(48)  NOT NULL,
  name          varchar(200) NOT NULL,
  drawing_no    varchar(64),
  revision      varchar(16),
  customer_name varchar(120),
  std_cycle_sec integer,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES app.user_account(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES app.user_account(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS site_part_code_uk ON app.site_part (site_id, code);

CREATE TABLE IF NOT EXISTS app.site_operator (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    uuid NOT NULL REFERENCES app.site(id),
  full_name  varchar(120) NOT NULL,
  short_name varchar(32),
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app.user_account(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES app.user_account(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS site_operator_name_uk ON app.site_operator (site_id, lower(full_name));

CREATE TABLE IF NOT EXISTS app.site_defect_reason (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    uuid NOT NULL REFERENCES app.site(id),
  code       varchar(48)  NOT NULL,
  name       varchar(200) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app.user_account(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES app.user_account(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS site_defect_reason_code_uk ON app.site_defect_reason (site_id, code);

CREATE TABLE IF NOT EXISTS app.site_downtime_reason (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    uuid NOT NULL REFERENCES app.site(id),
  code       varchar(48)  NOT NULL,
  name       varchar(200) NOT NULL,
  is_planned boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app.user_account(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES app.user_account(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS site_downtime_reason_code_uk ON app.site_downtime_reason (site_id, code);

-- UNIQUE (site_id, id) để dòng sản lượng tham chiếu bằng FK ghép (chặn trộn site).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_machine','site_shift','site_part','site_operator',
                           'site_defect_reason','site_downtime_reason'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_site_id_uk'
                   AND conrelid = format('app.%I', t)::regclass) THEN
      EXECUTE format('ALTER TABLE app.%I ADD CONSTRAINT %I UNIQUE (site_id, id)', t, t || '_site_id_uk');
    END IF;
  END LOOP;
END $$;

-- ── 4. shift_output_entry ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.shift_output_entry (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid NOT NULL REFERENCES app.site(id),
  client_uuid   uuid NOT NULL,
  prod_date     date NOT NULL,
  shift_id      uuid NOT NULL,
  machine_id    uuid NOT NULL,
  part_id       uuid NOT NULL,
  operator_id   uuid,
  operator_name varchar(120),
  qty_planned   integer,
  qty_ok        integer NOT NULL DEFAULT 0,
  qty_ng        integer NOT NULL DEFAULT 0,
  qty_rework    integer,
  downtime_min  integer,
  shift_minutes integer NOT NULL,
  material_lot  varchar(64),
  notes         text,
  status        varchar(16) NOT NULL DEFAULT 'SUBMITTED',
  locked_at     timestamptz,
  locked_by     uuid REFERENCES app.user_account(id) ON DELETE SET NULL,
  source        varchar(16) NOT NULL DEFAULT 'APP',
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES app.user_account(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES app.user_account(id) ON DELETE SET NULL,
  deleted_at    timestamptz,
  deleted_by    uuid REFERENCES app.user_account(id) ON DELETE SET NULL,
  delete_reason text
);
CREATE UNIQUE INDEX IF NOT EXISTS shift_output_entry_client_uuid_uk ON app.shift_output_entry (client_uuid);
CREATE UNIQUE INDEX IF NOT EXISTS shift_output_entry_slot_uk
  ON app.shift_output_entry (site_id, prod_date, shift_id, machine_id, part_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS shift_output_entry_site_date_idx ON app.shift_output_entry (site_id, prod_date);
CREATE INDEX IF NOT EXISTS shift_output_entry_site_machine_idx ON app.shift_output_entry (site_id, machine_id, prod_date);
CREATE INDEX IF NOT EXISTS shift_output_entry_site_part_idx ON app.shift_output_entry (site_id, part_id, prod_date);

DO $$
BEGIN
  -- Ràng buộc site (FK ghép).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_entry_shift_fk') THEN
    ALTER TABLE app.shift_output_entry ADD CONSTRAINT shift_output_entry_shift_fk
      FOREIGN KEY (site_id, shift_id) REFERENCES app.site_shift (site_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_entry_machine_fk') THEN
    ALTER TABLE app.shift_output_entry ADD CONSTRAINT shift_output_entry_machine_fk
      FOREIGN KEY (site_id, machine_id) REFERENCES app.site_machine (site_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_entry_part_fk') THEN
    ALTER TABLE app.shift_output_entry ADD CONSTRAINT shift_output_entry_part_fk
      FOREIGN KEY (site_id, part_id) REFERENCES app.site_part (site_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_entry_operator_fk') THEN
    ALTER TABLE app.shift_output_entry ADD CONSTRAINT shift_output_entry_operator_fk
      FOREIGN KEY (site_id, operator_id) REFERENCES app.site_operator (site_id, id);
  END IF;
  -- Kiểm thật (V1/V2/V4).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_entry_qty_chk') THEN
    ALTER TABLE app.shift_output_entry ADD CONSTRAINT shift_output_entry_qty_chk CHECK (
      qty_ok BETWEEN 0 AND 100000
      AND qty_ng BETWEEN 0 AND 100000
      AND (qty_planned IS NULL OR qty_planned BETWEEN 0 AND 100000)
      AND (qty_rework  IS NULL OR qty_rework  BETWEEN 0 AND 100000)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_entry_rework_chk') THEN
    ALTER TABLE app.shift_output_entry ADD CONSTRAINT shift_output_entry_rework_chk
      CHECK (qty_rework IS NULL OR qty_rework <= qty_ng);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_entry_minutes_chk') THEN
    ALTER TABLE app.shift_output_entry ADD CONSTRAINT shift_output_entry_minutes_chk CHECK (
      shift_minutes BETWEEN 1 AND 1440
      AND (downtime_min IS NULL OR downtime_min BETWEEN 0 AND shift_minutes)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_entry_nonempty_chk') THEN
    ALTER TABLE app.shift_output_entry ADD CONSTRAINT shift_output_entry_nonempty_chk
      CHECK (qty_ok + qty_ng > 0 OR COALESCE(downtime_min, 0) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_entry_status_chk') THEN
    ALTER TABLE app.shift_output_entry ADD CONSTRAINT shift_output_entry_status_chk
      CHECK (status IN ('DRAFT','SUBMITTED','LOCKED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_entry_source_chk') THEN
    ALTER TABLE app.shift_output_entry ADD CONSTRAINT shift_output_entry_source_chk
      CHECK (source IN ('APP','IMPORT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_entry_version_chk') THEN
    ALTER TABLE app.shift_output_entry ADD CONSTRAINT shift_output_entry_version_chk CHECK (version >= 1);
  END IF;
  -- Thiết lập xưởng + giờ ca.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_chk') THEN
    ALTER TABLE app.site ADD CONSTRAINT site_settings_chk CHECK (
      lock_after_hours BETWEEN 0 AND 720
      AND backdate_days BETWEEN 0 AND 31
      AND ng_warn_pct BETWEEN 0 AND 100
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_shift_window_chk') THEN
    ALTER TABLE app.site_shift ADD CONSTRAINT site_shift_window_chk CHECK (
      (crosses_midnight AND end_time < start_time) OR (NOT crosses_midnight AND end_time > start_time)
    );
  END IF;
END $$;

-- ── 5. Chi tiết lỗi / dừng máy ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.shift_output_defect (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id  uuid NOT NULL REFERENCES app.shift_output_entry(id) ON DELETE CASCADE,
  reason_id uuid NOT NULL REFERENCES app.site_defect_reason(id),
  qty       integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS shift_output_defect_uk ON app.shift_output_defect (entry_id, reason_id);

CREATE TABLE IF NOT EXISTS app.shift_output_downtime (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id  uuid NOT NULL REFERENCES app.shift_output_entry(id) ON DELETE CASCADE,
  reason_id uuid NOT NULL REFERENCES app.site_downtime_reason(id),
  minutes   integer NOT NULL,
  note      varchar(200)
);
CREATE UNIQUE INDEX IF NOT EXISTS shift_output_downtime_uk ON app.shift_output_downtime (entry_id, reason_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_defect_qty_chk') THEN
    ALTER TABLE app.shift_output_defect ADD CONSTRAINT shift_output_defect_qty_chk CHECK (qty > 0 AND qty <= 100000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_output_downtime_min_chk') THEN
    ALTER TABLE app.shift_output_downtime ADD CONSTRAINT shift_output_downtime_min_chk CHECK (minutes > 0 AND minutes <= 1440);
  END IF;
END $$;

-- ── 6. Role workshop ───────────────────────────────────────────────────
INSERT INTO app.role (code, display_name, description)
VALUES ('workshop', 'Xưởng vệ tinh',
        'Tài khoản chung của xưởng gia công: chỉ module Sản lượng ca (/san-luong) của xưởng mình, phiên 24h')
ON CONFLICT (code) DO NOTHING;

-- ── 7. Seed xưởng Đông Anh (mã hàng + người phụ trách KHÔNG seed) ─────
INSERT INTO app.site (code, name, timezone, lock_after_hours, backdate_days, ng_warn_pct)
VALUES ('DONGAN', 'Xưởng tiện CNC Đông Anh', 'Asia/Ho_Chi_Minh', 24, 2, 10)
ON CONFLICT (code) DO NOTHING;

INSERT INTO app.site_machine (site_id, code, name, sort_order)
SELECT s.id, v.code, v.name, v.ord
FROM app.site s
CROSS JOIN (VALUES ('CNC-01', 'Máy tiện CNC 01', 1), ('CNC-02', 'Máy tiện CNC 02', 2)) AS v(code, name, ord)
WHERE s.code = 'DONGAN'
ON CONFLICT (site_id, code) DO NOTHING;

INSERT INTO app.site_shift (site_id, code, name, start_time, end_time, crosses_midnight, sort_order)
SELECT s.id, v.code, v.name, v.st::time, v.et::time, false, v.ord
FROM app.site s
CROSS JOIN (VALUES ('CA1', 'Ca 1', '08:00', '12:00', 1),
                   ('CA2', 'Ca 2', '13:00', '17:00', 2),
                   ('CA3', 'Ca 3', '18:00', '22:00', 3)) AS v(code, name, st, et, ord)
WHERE s.code = 'DONGAN'
ON CONFLICT (site_id, code) DO NOTHING;

INSERT INTO app.site_defect_reason (site_id, code, name, sort_order)
SELECT s.id, v.code, v.name, v.ord
FROM app.site s
CROSS JOIN (VALUES
  ('KT_SAI',      'Kích thước sai', 1),
  ('BAVIA',       'Ba-via', 2),
  ('XUOC',        'Xước / móp bề mặt', 3),
  ('REN',         'Ren hỏng / không qua dưỡng', 4),
  ('NHAM',        'Độ nhám không đạt', 5),
  ('DAO_DONGTAM', 'Đảo / đồng tâm không đạt', 6),
  ('VAT_MEP',     'Vát mép sai', 7),
  ('LOI_PHOI',    'Lỗi phôi (rỗ, nứt, cong)', 8),
  ('SETUP',       'Chạy thử / setup', 9),
  ('KHAC',        'Khác', 99)
) AS v(code, name, ord)
WHERE s.code = 'DONGAN'
ON CONFLICT (site_id, code) DO NOTHING;

INSERT INTO app.site_downtime_reason (site_id, code, name, is_planned, sort_order)
SELECT s.id, v.code, v.name, v.planned, v.ord
FROM app.site s
CROSS JOIN (VALUES
  ('SETUP',       'Setup / đổi mã', true, 1),
  ('THAY_DAO',    'Thay dao', false, 2),
  ('CHO_PHOI',    'Chờ phôi', false, 3),
  ('CHO_QC',      'Chờ QC / đo', false, 4),
  ('HONG_MAY',    'Hỏng máy', false, 5),
  ('MAT_DIEN',    'Mất điện', false, 6),
  ('BAO_DUONG',   'Bảo dưỡng', true, 7),
  ('KHONG_KH',    'Không có kế hoạch', true, 8),
  ('THIEU_NGUOI', 'Thiếu người', false, 9),
  ('KHAC',        'Khác', false, 99)
) AS v(code, name, planned, ord)
WHERE s.code = 'DONGAN'
ON CONFLICT (site_id, code) DO NOTHING;

-- ── 8. Quyền cho role ứng dụng (nếu có) ─────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hethong_app_rw') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      app.site, app.user_site, app.site_machine, app.site_shift, app.site_part, app.site_operator,
      app.site_defect_reason, app.site_downtime_reason,
      app.shift_output_entry, app.shift_output_defect, app.shift_output_downtime
    TO hethong_app_rw;
  END IF;
END $$;

COMMIT;

-- Verify (chỉ đọc)
SELECT s.code, s.name,
       (SELECT count(*) FROM app.site_machine m WHERE m.site_id = s.id) AS machines,
       (SELECT count(*) FROM app.site_shift sh WHERE sh.site_id = s.id) AS shifts,
       (SELECT count(*) FROM app.site_defect_reason d WHERE d.site_id = s.id) AS defect_reasons,
       (SELECT count(*) FROM app.site_downtime_reason r WHERE r.site_id = s.id) AS downtime_reasons
FROM app.site s WHERE s.code = 'DONGAN';
