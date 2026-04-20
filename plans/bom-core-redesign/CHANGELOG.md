# CHANGELOG — V1.5 BOM Core Redesign

> Thay đổi dự kiến khi V1.5 release. Cập nhật song song mỗi PR.

---

## [1.5.0] — 2026-05-XX (dự kiến)

### Added (tính năng mới)

- **Product Line (Dòng sản phẩm)** — bảng `product_line` + `product_line_member` cho phép nhóm nhiều mã Z theo dòng SP. Route mới `/product-lines` (list) + `/product-lines/[id]` (detail 6 tab: Mã Z, Đơn hàng, Mua sắm, Sản xuất, Giao hàng, Tài chính).
- **BOM Grid Univer** — thay thế table HTML ở route `/bom/[code]` bằng spreadsheet Univer (Apache 2.0) giống Excel: merge cell, conditional format, formula SUM/COUNT/IF/VLOOKUP, copy/paste Excel giữ format, export .xlsx.
- **Activity Log server-side** — bảng `activity_log` append-only, tab "Lịch sử" trong `/bom/[code]` hiển thị message tiếng Việt.
- **Undo/Redo client-side** — 30 bước gần nhất qua IndexedDB (`idb-keyval`), phím tắt Ctrl+Z/Ctrl+Shift+Z, reset khi logout.
- **Derived status tự sinh** — cột "Trạng thái" trong Grid không còn gõ tay; tự cập nhật khi có PR/PO/RCV/WO/Delivery event. State machine 8 bước. SSE real-time push update.
- **Alias table** — `alias_supplier` + `alias_item` ánh xạ tên viết tắt Excel ↔ master record.
- **Cross-module drawer** — click 1 linh kiện trong Grid hoặc Product Line tab → drawer phải hiện PR/PO/WO/Receiving liên quan.
- **Materialized view `mv_bom_template_progress`** — refresh 5 phút, tính % tiến độ theo derived_status.
- **Feature flags** — `NEXT_PUBLIC_FF_BOM_GRID_V2`, `NEXT_PUBLIC_FF_PRODUCT_LINES`, `NEXT_PUBLIC_FF_ACTIVITY_LOG`, `NEXT_PUBLIC_FF_STATUS_SYNC` + scope roles.

### Changed (thay đổi)

- **Nav-items** (`apps/web/src/lib/nav-items.ts`):
  - Thêm `/product-lines` "Dòng sản phẩm" (vị trí đầu, trên `/items`).
  - `/bom` vẫn giữ (nhưng icon phụ hơn); V1.6 sẽ cân nhắc ẩn.
- **`bom_template.metadata` jsonb** — thêm (không breaking) cột mới `univer_snapshot`, `univer_snapshot_updated_at`, `univer_snapshot_updated_by`.
- **`bom_line`** — thêm cột `derived_status`, `derived_status_updated_at`, `derived_status_source`. Cột `description` (Note) vẫn được ghi nhưng UX khuyến nghị không gõ tay cột Status.
- **Import Excel** — vẫn giữ nhưng đã demote "tính năng phụ". Upgrade multi-sheet detection + lưu template "Mẫu Song Châu" + alias popup NCC inline.

### Deprecated (còn nhưng sẽ loại bỏ V1.6+)

- Table HTML cũ ở `/bom/[code]` — giữ làm fallback khi `NEXT_PUBLIC_FF_BOM_GRID_V2=false`. Sau 1 tháng ổn định → gỡ hoàn toàn V1.6.

### Removed (loại bỏ)

- Chưa có gì bị xoá trong V1.5. Cột `description` (Note) vẫn tồn tại để tương thích.

### Fixed (sửa lỗi)

- *(cập nhật sau khi làm)*

### Security

- Formula whitelist 10 hàm an toàn; disable `INDIRECT`, `HYPERLINK`, `IMPORTXML`, `RTD`.
- SSE endpoint validate `templateId` ownership qua RLS (user chỉ subscribe BOM mình có quyền).
- ETag optimistic lock trên `POST /api/bom/[id]/grid` chống race condition.

---

## Breaking changes

**KHÔNG có breaking change cho URL hoặc API public.**

- URL `/bom` và `/bom/[code]` giữ nguyên.
- URL `/items`, `/orders`, `/procurement/*` giữ nguyên.
- API endpoints cũ giữ nguyên schema response.
- Feature mới đều đi sau feature flag → off = hoạt động y nguyên V1.4.

---

## Migration guide (cho dev)

1. Pull code v1.5 → `pnpm install` (thêm dependency `@univerjs/*`, `idb-keyval`).
2. Chạy migration:
   ```bash
   pnpm -F @iot/db drizzle:migrate
   ```
3. Seed data ban đầu:
   ```bash
   pnpm -F @iot/db run seed:product-line-backfill
   pnpm -F @iot/db run seed:alias-supplier
   ```
4. Set env vars `.env.local`:
   ```bash
   NEXT_PUBLIC_FF_BOM_GRID_V2=true
   NEXT_PUBLIC_FF_PRODUCT_LINES=true
   NEXT_PUBLIC_FF_ACTIVITY_LOG=true
   NEXT_PUBLIC_FF_STATUS_SYNC=true
   ```
5. Run `pnpm dev` và test:
   - Mở http://localhost:3000/product-lines
   - Tạo product line mới, thêm bom_template
   - Mở http://localhost:3000/bom/Z0000002 → thấy Grid Univer
   - Sửa 1 cell → Ctrl+Z revert
   - Tạo PR → Grid cell Status tự đổi

---

## Rollback guide

Xem `06-deployment.md` §4 (Rollback plan).

Tóm tắt:
- Rollback SOFT: `NEXT_PUBLIC_FF_BOM_GRID_V2=false` → restart container (~30s).
- Rollback HARD: revert Docker tag + `drizzle:migrate:down --steps=3` (⚠️ mất `univer_snapshot` data).

---

## Danh sách file plan

| File | Vai trò |
|---|---|
| [`README.md`](./README.md) | Executive summary cho anh Hoạt |
| [`01-schema.md`](./01-schema.md) | Trụ cột 1 — DDL + migration |
| [`02-bom-grid-univer.md`](./02-bom-grid-univer.md) | Trụ cột 2 — Univer spreadsheet |
| [`03-product-line-workspace.md`](./03-product-line-workspace.md) | Trụ cột 3 — Workspace + 6 tab |
| [`04-activity-log-undo.md`](./04-activity-log-undo.md) | Trụ cột 4 — Log + Undo IndexedDB |
| [`05-cross-module-glue.md`](./05-cross-module-glue.md) | Trụ cột 5 — Event-driven status |
| [`06-deployment.md`](./06-deployment.md) | Deploy + Feature flag + Rollback |
| [`CHANGELOG.md`](./CHANGELOG.md) | File này |

---

## Tác giả

- **Planner:** Claude Opus 4.7 (agent)
- **Reviewer:** Thắng (tienthangpt12@gmail.com)
- **Approver:** anh Hoạt (Song Châu)
- **Ngày plan:** 2026-04-20
- **Ngày dự kiến release:** 2026-05-10 (~3 tuần làm việc + test)
