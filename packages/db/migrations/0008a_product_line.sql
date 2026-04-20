-- ============================================================
-- Migration 0008a: Product Line + Activity Log + Alias tables
-- V1.5 BOM Core Redesign — Trụ cột 1
--
-- User chạy: hethong_app (owner DB, quyền ALTER/CREATE trong schema app)
-- ============================================================

SET search_path TO app, public;

-- ---------- 1. product_line ----------
CREATE TABLE IF NOT EXISTS app.product_line (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(64)  NOT NULL,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  image_url     TEXT,
  owner_user_id UUID REFERENCES app.user_account(id) ON DELETE SET NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES app.user_account(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_line_code_uk
  ON app.product_line (code);

CREATE INDEX IF NOT EXISTS product_line_status_idx
  ON app.product_line (status);

-- ---------- 2. product_line_member (M2M: product_line ↔ bom_template) ----------
CREATE TABLE IF NOT EXISTS app.product_line_member (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_line_id  UUID NOT NULL REFERENCES app.product_line(id)   ON DELETE CASCADE,
  bom_template_id  UUID NOT NULL REFERENCES app.bom_template(id)   ON DELETE CASCADE,
  position         INT NOT NULL DEFAULT 1,
  role             VARCHAR(32) DEFAULT 'MAIN',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_line_member_uk
  ON app.product_line_member (product_line_id, bom_template_id);

CREATE INDEX IF NOT EXISTS product_line_member_bom_idx
  ON app.product_line_member (bom_template_id);

-- ---------- 3. activity_log (append-only audit trail cho BOM core) ----------
CREATE TABLE IF NOT EXISTS app.activity_log (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID REFERENCES app.user_account(id) ON DELETE SET NULL,
  entity_type    VARCHAR(32) NOT NULL,
  entity_id      UUID NOT NULL,
  action         VARCHAR(32) NOT NULL,
  diff_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address     INET,
  user_agent     TEXT,
  at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_entity_idx
  ON app.activity_log (entity_type, entity_id, at DESC);

CREATE INDEX IF NOT EXISTS activity_log_user_idx
  ON app.activity_log (user_id, at DESC);

-- Không cho phép UPDATE hoặc DELETE (append-only)
CREATE OR REPLACE FUNCTION app.fn_activity_log_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only (no UPDATE/DELETE)';
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_log_no_update ON app.activity_log;
CREATE TRIGGER trg_activity_log_no_update
  BEFORE UPDATE OR DELETE ON app.activity_log
  FOR EACH ROW EXECUTE FUNCTION app.fn_activity_log_append_only();

-- ---------- 4. alias_supplier (map viết tắt NCC Excel → supplier.id) ----------
CREATE TABLE IF NOT EXISTS app.alias_supplier (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias        VARCHAR(128) NOT NULL,
  supplier_id  UUID NOT NULL REFERENCES app.supplier(id) ON DELETE CASCADE,
  confidence   NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES app.user_account(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS alias_supplier_alias_uk
  ON app.alias_supplier (lower(alias));

CREATE INDEX IF NOT EXISTS alias_supplier_supplier_idx
  ON app.alias_supplier (supplier_id);

-- ---------- 5. alias_item (map tên linh kiện viết tắt Excel → item.id) ----------
CREATE TABLE IF NOT EXISTS app.alias_item (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias       VARCHAR(255) NOT NULL,
  item_id     UUID NOT NULL REFERENCES app.item(id) ON DELETE CASCADE,
  confidence  NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES app.user_account(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS alias_item_alias_uk
  ON app.alias_item (lower(alias));

CREATE INDEX IF NOT EXISTS alias_item_item_idx
  ON app.alias_item (item_id);

-- ---------- Comments (self-documenting) ----------
COMMENT ON TABLE app.product_line IS
  'V1.5: dòng sản phẩm — nhóm nhiều bom_template (mã Z) để quản lý theo project.';

COMMENT ON TABLE app.product_line_member IS
  'V1.5: M2M product_line ↔ bom_template. 1 mã Z có thể thuộc nhiều dòng SP.';

COMMENT ON TABLE app.activity_log IS
  'V1.5: append-only audit trail cho BOM core (sửa cell, thêm dòng, apply format, import, status sync). Trigger chặn UPDATE/DELETE.';

COMMENT ON TABLE app.alias_supplier IS
  'V1.5: ánh xạ tên viết tắt NCC trong Excel (GTAM, VB, MI…) → supplier.id. Dùng cho BOM import wizard.';

COMMENT ON TABLE app.alias_item IS
  'V1.5: ánh xạ tên linh kiện không chuẩn trong Excel → item.id.';
