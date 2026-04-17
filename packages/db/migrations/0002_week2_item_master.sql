-- Week 2 · Item Master + Barcode + Supplier + Import Batch
-- NOTE 1: ALTER TYPE ... ADD VALUE KHÔNG chạy được trong transaction block.
--         Khi áp migration, phải chạy từng statement riêng (drizzle-kit default OK),
--         hoặc split tay như dưới.
-- NOTE 2: pg_trgm/unaccent extension cần quyền superuser. Trên VPS chia sẻ Song Châu
--         nhờ admin chạy trước. Fallback ILIKE nếu extension unavailable.

-- 1) Extensions (no-op nếu đã có) ------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2) Enum items mở rộng ----------------------------------------------------
ALTER TYPE app.item_type ADD VALUE IF NOT EXISTS 'TOOL';
ALTER TYPE app.item_type ADD VALUE IF NOT EXISTS 'PACKAGING';

-- 3) Enum barcode + source -------------------------------------------------
DO $$ BEGIN
  CREATE TYPE app.barcode_type AS ENUM ('EAN13','EAN8','CODE128','CODE39','QR','DATAMATRIX');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE app.barcode_source AS ENUM ('vendor','internal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4) ALTER item thêm category + is_active ---------------------------------
ALTER TABLE app.item
  ADD COLUMN IF NOT EXISTS category varchar(64),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 5) ALTER item_barcode --------------------------------------------------
ALTER TABLE app.item_barcode
  ADD COLUMN IF NOT EXISTS source app.barcode_source NOT NULL DEFAULT 'internal';

-- Convert barcode_type varchar -> enum (safe cho data cũ).
ALTER TABLE app.item_barcode
  ALTER COLUMN barcode_type DROP DEFAULT;

ALTER TABLE app.item_barcode
  ALTER COLUMN barcode_type TYPE app.barcode_type USING (
    CASE UPPER(barcode_type)
      WHEN 'EAN13'     THEN 'EAN13'::app.barcode_type
      WHEN 'EAN8'      THEN 'EAN8'::app.barcode_type
      WHEN 'CODE128'   THEN 'CODE128'::app.barcode_type
      WHEN 'CODE39'    THEN 'CODE39'::app.barcode_type
      WHEN 'QR'        THEN 'QR'::app.barcode_type
      WHEN 'DATAMATRIX' THEN 'DATAMATRIX'::app.barcode_type
      ELSE 'CODE128'::app.barcode_type
    END
  );

ALTER TABLE app.item_barcode
  ALTER COLUMN barcode_type SET DEFAULT 'CODE128'::app.barcode_type;

-- 6) ALTER item_supplier --------------------------------------------------
ALTER TABLE app.item_supplier
  ADD COLUMN IF NOT EXISTS vendor_item_code varchar(128),
  ADD COLUMN IF NOT EXISTS moq       numeric(18,4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pack_size numeric(18,4) NOT NULL DEFAULT 1;

-- 7) Indexes pg_trgm + unaccent ------------------------------------------
DROP INDEX IF EXISTS app.item_name_trgm_idx;

CREATE INDEX IF NOT EXISTS item_sku_trgm_idx
  ON app.item USING GIN (sku gin_trgm_ops);

CREATE INDEX IF NOT EXISTS item_name_unaccent_trgm_idx
  ON app.item USING GIN (unaccent(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS item_category_trgm_idx
  ON app.item USING GIN (category gin_trgm_ops)
  WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS item_active_type_idx
  ON app.item (is_active, item_type)
  WHERE is_active = true;

-- 8) Partial unique: 1 primary barcode per item ---------------------------
CREATE UNIQUE INDEX IF NOT EXISTS item_barcode_primary_per_item_uk
  ON app.item_barcode (item_id)
  WHERE is_primary = true;

-- 9) Import batch table + enums ------------------------------------------
DO $$ BEGIN
  CREATE TYPE app.import_kind AS ENUM ('item','bom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE app.import_status AS ENUM
    ('queued','parsing','preview_ready','committing','done','failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE app.import_duplicate_mode AS ENUM ('skip','upsert','error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS app.import_batch (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             app.import_kind NOT NULL,
  status           app.import_status NOT NULL DEFAULT 'queued',
  duplicate_mode   app.import_duplicate_mode NOT NULL DEFAULT 'skip',
  file_hash        varchar(64) NOT NULL,
  file_name        varchar(255) NOT NULL,
  file_size_bytes  integer NOT NULL DEFAULT 0,
  file_key         text,
  row_total        integer NOT NULL DEFAULT 0,
  row_success      integer NOT NULL DEFAULT 0,
  row_fail         integer NOT NULL DEFAULT 0,
  preview_json     jsonb,
  error_json       jsonb,
  error_file_url   text,
  error_message    text,
  uploaded_by      uuid REFERENCES app.user_account(id),
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_batch_hash_idx
  ON app.import_batch (file_hash, kind);
CREATE INDEX IF NOT EXISTS import_batch_status_idx
  ON app.import_batch (status);
CREATE INDEX IF NOT EXISTS import_batch_uploaded_by_idx
  ON app.import_batch (uploaded_by);
CREATE INDEX IF NOT EXISTS import_batch_created_idx
  ON app.import_batch (created_at);
