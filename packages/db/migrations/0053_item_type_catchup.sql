-- 0053_item_type_catchup.sql
-- V3.11.3 (audit W.4) — Catch-up: enum public.item_type trên VPS production
-- (45.124.94.13) NGHI THIẾU 'TOOL' + 'PACKAGING'.
--
-- Nguyên nhân (cùng pattern đã gây sự cố audit_action → migration 0052):
-- migration 0002b_item_master.sql chỉ `ALTER TYPE app.item_type ADD VALUE
-- 'TOOL'/'PACKAGING'`, trong khi Drizzle pgEnum khai báo trong schema `public`.
-- Nếu enum thực tế trên prod nằm ở `public` thì 2 giá trị này không được thêm
-- → tạo/import item loại TOOL/PACKAGING ném lỗi enum (22P02/invalid input value)
-- → poison cả chunk import (trước khi có savepoint per-row của W.1/W.2).
--
-- Idempotent: ADD VALUE IF NOT EXISTS → no-op với 6 giá trị đã có sẵn và với DB
-- fresh deploy (schema đã tạo đủ 8). ADD VALUE KHÔNG chạy trong transaction dùng
-- ngay giá trị mới → mỗi statement autocommit riêng, KHÔNG bọc BEGIN/COMMIT.
--
-- ⚠️ CHƯA APPLY LÊN PROD. Trước khi apply, VERIFY enum thực tế:
--    SELECT n.nspname AS schema, e.enumlabel
--    FROM pg_type t
--    JOIN pg_namespace n ON n.oid = t.typnamespace
--    JOIN pg_enum e ON e.enumtypid = t.oid
--    WHERE t.typname = 'item_type'
--    ORDER BY n.nspname, e.enumsortorder;
-- Nếu 'TOOL'/'PACKAGING' đã có đủ ở schema đang dùng → không cần chạy file này.

ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS 'RAW';
ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS 'PURCHASED';
ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS 'FABRICATED';
ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS 'SUB_ASSEMBLY';
ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS 'FG';
ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS 'CONSUMABLE';
ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS 'TOOL';
ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS 'PACKAGING';
