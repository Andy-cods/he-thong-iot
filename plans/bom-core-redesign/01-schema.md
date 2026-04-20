# Trụ cột 1 — Schema Product Line + Activity Log + Alias

> **Estimate:** 1 ngày (8h).
> **Owner:** Thắng.
> **Dependency:** chưa có — khởi động được ngay sau khi plan được duyệt.

---

## 1. Mục tiêu

Đặt nền tảng dữ liệu cho toàn bộ kế hoạch:

1. Tạo **`product_line`** — nhóm các `bom_template` (mã Z) theo dòng sản phẩm.
2. Tạo **`product_line_member`** — bảng nối nhiều-nhiều giữa `product_line` ↔ `bom_template` (1 mã Z có thể thuộc nhiều dòng SP, VD: khung phụ dùng chung 2 dòng băng tải).
3. Tạo **`activity_log`** — append-only, log mọi sự kiện chỉnh sửa BOM, cho tab "Lịch sử".
4. Tạo **`alias_supplier`** — ánh xạ tên viết tắt NCC trong Excel (GTAM, VB, MI, CG, SPG, TAT, Belt, Chốt cài…) → `supplier.id`.
5. Tạo **`alias_item`** — ánh xạ tên linh kiện viết tắt/không chuẩn trong Excel → `item.id`.
6. Thêm cột `univer_snapshot JSONB` và `derived_status VARCHAR(32)` vào các bảng liên quan.

---

## 2. Bối cảnh hiện tại

- Schema hiện có: xem `packages/db/src/schema/bom.ts`, `master.ts`.
- Các bảng đã tồn tại: `bom_template`, `bom_line`, `bom_revision`, `item`, `supplier`, `item_supplier`.
- `bom_template.metadata` là `jsonb` — có thể đặt cờ `productLineId` tạm, nhưng KHÔNG dùng vì cần query + index.
- Chưa có concept "nhóm BOM theo dòng sản phẩm" nào.
- Chưa có audit trail per-cell (bảng `audit_log` hiện tại chỉ log action thô API level).

---

## 3. DDL chi tiết

File migration: `packages/db/migrations/0008a_product_line.sql`.

```sql
-- ============================================================
-- Migration 0008a: Product Line + Activity Log + Alias tables
-- V1.5 BOM Core Redesign — Trụ cột 1
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

-- ---------- 2. product_line_member (M2M) ----------
CREATE TABLE IF NOT EXISTS app.product_line_member (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_line_id  UUID NOT NULL REFERENCES app.product_line(id)   ON DELETE CASCADE,
  bom_template_id  UUID NOT NULL REFERENCES app.bom_template(id)   ON DELETE CASCADE,
  position         INT NOT NULL DEFAULT 1,   -- thứ tự hiển thị trong tab "Mã Z"
  role             VARCHAR(32) DEFAULT 'MAIN',-- MAIN | SUB_ASSEMBLY | COMMON_PART
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_line_member_uk
  ON app.product_line_member (product_line_id, bom_template_id);

CREATE INDEX IF NOT EXISTS product_line_member_bom_idx
  ON app.product_line_member (bom_template_id);

-- ---------- 3. activity_log (append-only) ----------
CREATE TABLE IF NOT EXISTS app.activity_log (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID REFERENCES app.user_account(id) ON DELETE SET NULL,
  entity_type    VARCHAR(32) NOT NULL,  -- 'bom_template' | 'bom_line' | 'product_line' | ...
  entity_id      UUID NOT NULL,
  action         VARCHAR(32) NOT NULL,  -- 'CREATE'|'UPDATE_CELL'|'DELETE_ROW'|'ADD_ROW'|'FORMAT'|'IMPORT'|'STATUS_SYNC'
  diff_json      JSONB NOT NULL DEFAULT '{}'::jsonb, -- { field, before, after, cellRef, ... }
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
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only (no UPDATE/DELETE)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activity_log_no_update
  BEFORE UPDATE OR DELETE ON app.activity_log
  FOR EACH ROW EXECUTE FUNCTION app.fn_activity_log_append_only();

-- ---------- 4. alias_supplier ----------
CREATE TABLE IF NOT EXISTS app.alias_supplier (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias        VARCHAR(128) NOT NULL,        -- "GTAM", "VB", "CG", "Chốt cài"
  supplier_id  UUID NOT NULL REFERENCES app.supplier(id) ON DELETE CASCADE,
  confidence   NUMERIC(4,3) NOT NULL DEFAULT 1.0, -- manual=1.0, auto-match <1.0
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES app.user_account(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS alias_supplier_alias_uk
  ON app.alias_supplier (lower(alias));

CREATE INDEX IF NOT EXISTS alias_supplier_supplier_idx
  ON app.alias_supplier (supplier_id);

-- ---------- 5. alias_item ----------
CREATE TABLE IF NOT EXISTS app.alias_item (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias       VARCHAR(255) NOT NULL,         -- "Xy-lanh phi 50", "Bu lông M8x25"
  item_id     UUID NOT NULL REFERENCES app.item(id) ON DELETE CASCADE,
  confidence  NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES app.user_account(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS alias_item_alias_uk
  ON app.alias_item (lower(alias));

CREATE INDEX IF NOT EXISTS alias_item_item_idx
  ON app.alias_item (item_id);
```

File migration: `packages/db/migrations/0008b_bom_extensions.sql`.

```sql
-- ============================================================
-- Migration 0008b: Extend bom_template + bom_line for Univer + status sync
-- ============================================================

SET search_path TO app, public;

-- Grid snapshot Univer (JSON chứa toàn bộ style + formula + merge)
ALTER TABLE app.bom_template
  ADD COLUMN IF NOT EXISTS univer_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS univer_snapshot_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS univer_snapshot_updated_by UUID
    REFERENCES app.user_account(id);

-- derived_status cho bom_line (trụ cột 5 — tự sinh từ event)
ALTER TABLE app.bom_line
  ADD COLUMN IF NOT EXISTS derived_status VARCHAR(32),
  ADD COLUMN IF NOT EXISTS derived_status_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS derived_status_source JSONB DEFAULT '{}'::jsonb;
--    source JSONB: { "kind": "receiving_event" | "po" | "wo", "ref_id": "..." }

CREATE INDEX IF NOT EXISTS bom_line_derived_status_idx
  ON app.bom_line (template_id, derived_status);

COMMENT ON COLUMN app.bom_line.derived_status IS
  'Auto-computed status: planned|requested|ordered|in_transit|received|in_production|completed|delivered. Null = chưa có event nào → hiển thị "chưa bắt đầu"';
```

---

## 4. Drizzle schema — file mới + update

### File mới: `packages/db/src/schema/product-line.ts`

```ts
import { sql } from "drizzle-orm";
import {
  bigserial, index, inet, integer, jsonb, numeric, pgTable, primaryKey,
  text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";
import { bomTemplate } from "./bom";
import { item, supplier } from "./master";

export const productLine = appSchema.table("product_line", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  ownerUserId: uuid("owner_user_id").references(() => userAccount.id),
  status: varchar("status", { length: 16 }).notNull().default("ACTIVE"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull().default(sql`now()`),
  createdBy: uuid("created_by").references(() => userAccount.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull().default(sql`now()`),
}, (t) => ({
  codeUk: uniqueIndex("product_line_code_uk").on(t.code),
  statusIdx: index("product_line_status_idx").on(t.status),
}));

export const productLineMember = appSchema.table("product_line_member", {
  id: uuid("id").defaultRandom().primaryKey(),
  productLineId: uuid("product_line_id").notNull()
    .references(() => productLine.id, { onDelete: "cascade" }),
  bomTemplateId: uuid("bom_template_id").notNull()
    .references(() => bomTemplate.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(1),
  role: varchar("role", { length: 32 }).default("MAIN"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull().default(sql`now()`),
}, (t) => ({
  uk: uniqueIndex("product_line_member_uk").on(t.productLineId, t.bomTemplateId),
  bomIdx: index("product_line_member_bom_idx").on(t.bomTemplateId),
}));

export const activityLog = appSchema.table("activity_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").references(() => userAccount.id),
  entityType: varchar("entity_type", { length: 32 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  action: varchar("action", { length: 32 }).notNull(),
  diffJson: jsonb("diff_json").notNull().default(sql`'{}'::jsonb`),
  ipAddress: inet("ip_address"),
  userAgent: text("user_agent"),
  at: timestamp("at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  entityIdx: index("activity_log_entity_idx").on(t.entityType, t.entityId, t.at),
  userIdx: index("activity_log_user_idx").on(t.userId, t.at),
}));

export const aliasSupplier = appSchema.table("alias_supplier", {
  id: uuid("id").defaultRandom().primaryKey(),
  alias: varchar("alias", { length: 128 }).notNull(),
  supplierId: uuid("supplier_id").notNull()
    .references(() => supplier.id, { onDelete: "cascade" }),
  confidence: numeric("confidence", { precision: 4, scale: 3 })
    .notNull().default("1.0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull().default(sql`now()`),
  createdBy: uuid("created_by").references(() => userAccount.id),
}, (t) => ({
  aliasUk: uniqueIndex("alias_supplier_alias_uk").on(sql`lower(${t.alias})`),
  supplierIdx: index("alias_supplier_supplier_idx").on(t.supplierId),
}));

export const aliasItem = appSchema.table("alias_item", {
  id: uuid("id").defaultRandom().primaryKey(),
  alias: varchar("alias", { length: 255 }).notNull(),
  itemId: uuid("item_id").notNull()
    .references(() => item.id, { onDelete: "cascade" }),
  confidence: numeric("confidence", { precision: 4, scale: 3 })
    .notNull().default("1.0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull().default(sql`now()`),
  createdBy: uuid("created_by").references(() => userAccount.id),
}, (t) => ({
  aliasUk: uniqueIndex("alias_item_alias_uk").on(sql`lower(${t.alias})`),
  itemIdx: index("alias_item_item_idx").on(t.itemId),
}));

export type ProductLine = typeof productLine.$inferSelect;
export type NewProductLine = typeof productLine.$inferInsert;
export type ProductLineMember = typeof productLineMember.$inferSelect;
export type NewProductLineMember = typeof productLineMember.$inferInsert;
export type ActivityLog = typeof activityLog.$inferSelect;
export type NewActivityLog = typeof activityLog.$inferInsert;
export type AliasSupplier = typeof aliasSupplier.$inferSelect;
export type AliasItem = typeof aliasItem.$inferSelect;
```

### Update `packages/db/src/schema/bom.ts`

Thêm các cột sau vào `bomTemplate`:

```ts
univerSnapshot: jsonb("univer_snapshot"),
univerSnapshotUpdatedAt: timestamp("univer_snapshot_updated_at", { withTimezone: true }),
univerSnapshotUpdatedBy: uuid("univer_snapshot_updated_by").references(() => userAccount.id),
```

Thêm các cột sau vào `bomLine`:

```ts
derivedStatus: varchar("derived_status", { length: 32 }),
derivedStatusUpdatedAt: timestamp("derived_status_updated_at", { withTimezone: true }),
derivedStatusSource: jsonb("derived_status_source").default(sql`'{}'::jsonb`),
```

### Update `packages/db/src/schema/index.ts`

Thêm `export * from "./product-line";`.

---

## 5. Backfill strategy

### 5.1 Seed initial `product_line` từ data hiện có

Script: `packages/db/src/seeds/product-line-backfill.ts`.

```ts
// Logic:
// 1. Query tất cả bom_template hiện có.
// 2. Gom theo prefix code (VD: "Z0000002-502653_BANG_TAI_DIPPI" → product line code "DIPPI").
//    Regex: /^Z\d+-(\d+)_(.+)$/ → group 2 = tên dòng SP.
// 3. INSERT 1 record product_line per tên dòng SP.
// 4. INSERT product_line_member liên kết mỗi bom_template với product_line vừa tạo.
//
// Chạy 1 lần sau khi migration applied:
//   pnpm -F @iot/db seed:product-line-backfill
```

### 5.2 Seed alias_supplier từ Excel mẫu

Script: `packages/db/src/seeds/alias-supplier-seed.ts`.

```ts
// Input: mảng hardcoded từ 3 file Excel mẫu đã inspect
const SEED_ALIASES = [
  { alias: "GTAM",      supplierCode: "GTAM"       },
  { alias: "VB",        supplierCode: "VIET_BAO"   },
  { alias: "MI",        supplierCode: "MISUMI"     },
  { alias: "CG",        supplierCode: "CAO_GIA"    },
  { alias: "SPG",       supplierCode: "SONG_PHAT"  },
  { alias: "TAT",       supplierCode: "TAT"        },
  { alias: "Belt",      supplierCode: "BELT_VN"    },
  { alias: "Chốt cài",  supplierCode: "CHOT_CAI"   },
];
// Nếu supplier chưa tồn tại → tạo supplier draft (name=alias, status pending_review).
```

### 5.3 Backfill `derived_status` cho `bom_line` cũ

**KHÔNG backfill** — để `NULL`. Cột chỉ có giá trị khi Trụ cột 5 (status sync) chạy lần đầu trên BOM đang active. UI hiển thị "chưa bắt đầu" cho `NULL`.

---

## 6. Thứ tự apply migration

1. `0008a_product_line.sql` — tạo table mới (không động bảng cũ → zero-downtime).
2. `0008b_bom_extensions.sql` — `ALTER TABLE ADD COLUMN` → Postgres 16 lazy, không lock.
3. Chạy Drizzle regenerate: `pnpm -F @iot/db drizzle:generate`.
4. Chạy migration test: `pnpm -F @iot/db drizzle:migrate` trên DB local.
5. Chạy backfill script product_line.
6. Chạy seed alias_supplier.
7. Verify: `SELECT COUNT(*) FROM app.product_line;` ≥ 3.

---

## 7. Cách test

| # | Test case | Lệnh | Expected |
|---|---|---|---|
| 1 | Migration apply không lỗi | `pnpm -F @iot/db drizzle:migrate` | stdout "Migrations completed" |
| 2 | Tạo product_line | INSERT SQL | id trả về, code unique check PASS |
| 3 | Trigger append-only | `UPDATE activity_log SET action='X' WHERE id=1` | RAISE EXCEPTION |
| 4 | Alias supplier lowercase unique | INSERT 2 lần "GTAM" và "gtam" | fail lần 2 |
| 5 | Backfill product_line | run seed script | `SELECT COUNT(*)` ≥ số file Excel unique |
| 6 | Drizzle type-check | `pnpm -F @iot/db tsc --noEmit` | 0 errors |

---

## 8. Rủi ro

| Rủi ro | Giảm nhẹ |
|---|---|
| Regex tách tên dòng SP sai khi code bom_template không chuẩn | Backfill idempotent, có thể chạy lại; UI cho sửa `product_line.name` sau |
| Trigger append-only chặn luôn cả script migration sau này | Trigger scoped `BEFORE UPDATE OR DELETE` — không ảnh hưởng INSERT. Nếu cần xoá thực sự (GDPR) → `ALTER TABLE ... DISABLE TRIGGER` tạm thời |
| Table `activity_log` phình to sau 6 tháng | Partition by month sau V1.6 nếu >10M rows. V1.5 không cần vì expected <100k/tháng |
| Column `univer_snapshot` size lớn (100KB/BOM) | JSONB nén tự động. BOM 500 dòng ≈ 80-120KB. Postgres TOAST handle OK |

---

## 9. Files phải tạo/sửa

| Path | Action |
|---|---|
| `packages/db/migrations/0008a_product_line.sql` | CREATE |
| `packages/db/migrations/0008b_bom_extensions.sql` | CREATE |
| `packages/db/src/schema/product-line.ts` | CREATE |
| `packages/db/src/schema/bom.ts` | EDIT (thêm 3 cột univer_* + 3 cột derived_*) |
| `packages/db/src/schema/index.ts` | EDIT (export product-line) |
| `packages/db/src/seeds/product-line-backfill.ts` | CREATE |
| `packages/db/src/seeds/alias-supplier-seed.ts` | CREATE |
| `packages/db/src/seeds/alias-item-seed.ts` | CREATE (stub — populate dần) |

---

## 10. TODO checklist

- [ ] Tạo file migration 0008a + 0008b
- [ ] Test migration apply local (Docker Postgres)
- [ ] Thêm schema Drizzle `product-line.ts`
- [ ] Update `bom.ts` thêm cột univer_* + derived_*
- [ ] Update `index.ts` export
- [ ] Viết backfill script product_line
- [ ] Viết seed alias_supplier
- [ ] Run `pnpm build` (type-check toàn repo)
- [ ] Tag commit `v1.5.0-schema`
