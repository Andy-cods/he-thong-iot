-- =============================================================
-- Migration 0005b · app.bom_revision (V1.2)
-- =============================================================
-- bom_revision = bản đóng băng (immutable) của bom_template tại thời điểm
-- RELEASE. Frozen snapshot lưu full tree JSON để audit trail + explode
-- về snapshot sau này không phụ thuộc template đang edit.
-- =============================================================

CREATE TABLE IF NOT EXISTS app.bom_revision (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid         NOT NULL REFERENCES app.bom_template(id) ON DELETE CASCADE,
  revision_no       varchar(16)  NOT NULL,
  status            app.bom_revision_status NOT NULL DEFAULT 'DRAFT',
  frozen_snapshot   jsonb        NOT NULL DEFAULT '{}'::jsonb,
  released_at       timestamptz,
  released_by       uuid         REFERENCES app.user_account(id),
  notes             text,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT bom_revision_template_rev_uk UNIQUE (template_id, revision_no)
);

CREATE INDEX IF NOT EXISTS bom_revision_template_status_idx
  ON app.bom_revision (template_id, status);

CREATE INDEX IF NOT EXISTS bom_revision_released_idx
  ON app.bom_revision (template_id, released_at DESC NULLS LAST);

-- Verify
DO $$
DECLARE col_count integer;
BEGIN
  SELECT count(*) INTO col_count FROM information_schema.columns
    WHERE table_schema='app' AND table_name='bom_revision';
  IF col_count < 9 THEN
    RAISE EXCEPTION 'bom_revision missing columns (%/9)', col_count;
  END IF;
  RAISE NOTICE 'migration 0005b: bom_revision created (% cols)', col_count;
END $$;
