-- ============================================================================
-- V2.0 Phase 2 Sprint 6 FIX — Migration 0028
--   Rename bom_sheet_kind: MATERIAL_REF → MATERIAL, PROCESS_REF → PROCESS
-- ----------------------------------------------------------------------------
-- Lý do: lật quyết định Q-B brainstorm trước. MATERIAL/PROCESS sheet không
-- còn chỉ là REF (filter master toàn cục) — sẽ chứa rows per-BOM với data
-- riêng (giá deal, phôi, status, qty). Rename cho semantic chuẩn.
--
-- PG ≥10 hỗ trợ ALTER TYPE RENAME VALUE. Idempotent guard qua DO block check
-- enum value tồn tại trước khi rename.
--
-- Production state: hiện chưa có sheet kind=MATERIAL_REF/PROCESS_REF (chỉ
-- 8 sheet PROJECT backfill). Migration không touch dữ liệu.
--
-- Refs: plans/redesign-v3/sprint-6-fix-material-per-bom.md §4 Q1, §5.1
-- ============================================================================

SET search_path TO app, public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum
             WHERE enumtypid = 'app.bom_sheet_kind'::regtype
             AND enumlabel = 'MATERIAL_REF') THEN
    ALTER TYPE app.bom_sheet_kind RENAME VALUE 'MATERIAL_REF' TO 'MATERIAL';
    RAISE NOTICE '[0028] Renamed MATERIAL_REF → MATERIAL';
  ELSE
    RAISE NOTICE '[0028] MATERIAL_REF not present, skipping (idempotent)';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_enum
             WHERE enumtypid = 'app.bom_sheet_kind'::regtype
             AND enumlabel = 'PROCESS_REF') THEN
    ALTER TYPE app.bom_sheet_kind RENAME VALUE 'PROCESS_REF' TO 'PROCESS';
    RAISE NOTICE '[0028] Renamed PROCESS_REF → PROCESS';
  ELSE
    RAISE NOTICE '[0028] PROCESS_REF not present, skipping (idempotent)';
  END IF;
END $$;

-- Verify final state
DO $$
DECLARE v_labels TEXT;
BEGIN
  SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) INTO v_labels
  FROM pg_enum WHERE enumtypid = 'app.bom_sheet_kind'::regtype;
  RAISE NOTICE '[0028] bom_sheet_kind values now: %', v_labels;
END $$;
