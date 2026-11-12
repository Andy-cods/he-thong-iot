-- =============================================================
-- 0085_bom_stage_ledger.sql   (BOM V5 / WP1 — sổ bước, append-only)
-- IDEMPOTENT. Phụ thuộc 0083 (bom_line). Sửa sai = bút toán đảo (reverses_id).
-- =============================================================
BEGIN;
SET LOCAL search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.bom_stage_move (
  id          bigserial PRIMARY KEY,
  line_id     uuid NOT NULL REFERENCES app.bom_line(id),
  from_stage  text,
  to_stage    text NOT NULL,
  qty         numeric(18,4) NOT NULL,
  doc_type    text NOT NULL,
  doc_id      text,
  note        text,
  actor_id    uuid,
  at          timestamptz NOT NULL DEFAULT now(),
  reverses_id bigint REFERENCES app.bom_stage_move(id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bom_stage_move_qty_pos_chk'
                 AND conrelid = 'app.bom_stage_move'::regclass) THEN
    ALTER TABLE app.bom_stage_move
      ADD CONSTRAINT bom_stage_move_qty_pos_chk CHECK (qty > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bom_stage_move_line_idx ON app.bom_stage_move (line_id);

-- Idempotent cho auto-post/phiếu giao. from_stage NULL được coalesce; MANUAL / không doc_id thì không ràng buộc.
CREATE UNIQUE INDEX IF NOT EXISTS bom_stage_move_doc_uk
  ON app.bom_stage_move (doc_type, doc_id, line_id, (coalesce(from_stage, '')), to_stage, (coalesce(reverses_id, 0)))
  WHERE doc_id IS NOT NULL AND doc_type <> 'MANUAL';

-- Append-only thật
CREATE OR REPLACE FUNCTION app.bom_stage_move_immutable() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'bom_stage_move là append-only (% bị chặn) — dùng bút toán đảo (reverses_id)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bom_stage_move_no_mutate'
                 AND tgrelid = 'app.bom_stage_move'::regclass) THEN
    CREATE TRIGGER bom_stage_move_no_mutate
      BEFORE UPDATE OR DELETE ON app.bom_stage_move
      FOR EACH ROW EXECUTE FUNCTION app.bom_stage_move_immutable();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hethong_app_rw') THEN
    -- Cố ý chỉ SELECT, INSERT (append-only); trigger vẫn là chốt chặn cuối.
    GRANT SELECT, INSERT ON app.bom_stage_move TO hethong_app_rw;
    GRANT USAGE, SELECT ON SEQUENCE app.bom_stage_move_id_seq TO hethong_app_rw;
  END IF;
END $$;

COMMIT;
