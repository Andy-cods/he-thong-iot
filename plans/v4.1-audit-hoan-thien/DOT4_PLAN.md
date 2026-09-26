# Đợt 4 — Sản xuất + ẩn tính năng (DOT4_PLAN)

> Lập 2026-09-27, đối chiếu code thật. Path tương đối `apps/web/src/` trừ khi ghi khác.
> Quyết định: Q2 (ẩn nhập kho thành phẩm, KHÔNG làm PROD_IN) · Q4 (ẩn Đơn hàng bán / ECO / Thiếu vật tư) ·
> D10 (ẩn Lắp ráp kiểu cũ, không xoá code). Migration: `0066_dot4_wo_bom_link.sql` (0065 để dành Đợt 5).

## Thứ tự

1. **SX-16/17 trước** — thêm `work_order.bom_template_id` + `bom_line_id` (FK SET NULL, backfill từ
   `bom_line.metadata.routing.linkedWorkOrderId`, audit `CREATE.after_json.bomLineId`, `sales_order.bom_template_id`).
   Mọi truy vấn "WO theo BOM" (list `?bomTemplateId`, summary, production-summary, fab-progress, source-bom)
   dùng `wo.bom_template_id OR so.bom_template_id` → WO tạo từ chính BOM hiện ra mà KHÔNG cần đơn hàng bán.
   Ghi link khi: tạo từ dòng BOM (GTAM), LSX mở từ BOM (`?bomTemplateId` / `?bomLineId`).
2. Sửa SX-02..34 (bảng dưới).
3. Q2, Q4, D10 — một nguồn `lib/hidden-features.ts` (hằng số, bật lại = đổi `true`→`false`).

## Kế hoạch theo mục

| ID | Việc |
|---|---|
| SX-02 | `from-bom-line` dùng `genDocNo` (advisory lock, giờ VN) trong transaction |
| SX-03 | Bỏ nút cờ-lê `/assembly/[id]` ở danh sách WO (lắp ráp kiểu cũ ẩn — D10) |
| SX-04/05 | `completeWO` chạy trong 1 transaction thật (khoá `FOR UPDATE`), guard thuần `checkWoCompletable`: phải IN_PROGRESS, SL đạt > 0, mọi dòng linh kiện đủ |
| SX-06 | Bỏ DRAFT→IN_PROGRESS (phải duyệt trước); `startWO` giữ `released_at` cũ |
| SX-07/08 | UI xoá không gửi `force`; server chỉ xoá DRAFT/CANCELLED; huỷ WO nhả mọi giữ chỗ ACTIVE của WO (cùng logic nhả lô) |
| SX-09 | Sửa query key duyệt/từ chối (`qk.workOrders`) |
| SX-10 | Duyệt/từ chối `UPDATE … WHERE status='DRAFT'` (race → 409) |
| SX-11 | "Người lập" = người tạo thật (JOIN user_account) |
| SX-12/13 | Xoá entry tiến độ trừ lại SL/giờ; chặn báo tiến độ WO đã xong/huỷ/chưa chạy + dòng của WO khác |
| SX-14 | SL đạt/phế của WO chỉ cộng khi báo cho THÀNH PHẨM (không chọn dòng linh kiện) |
| SX-15 | Form tiến độ: bỏ "Tạm dừng/Tiếp tục (ghi nhận)" (dùng nút thật), QC chỉ ghi chú (không ô SL vô tác dụng) |
| SX-18 | Chặn tạo 2 YCSX đang chờ duyệt cho cùng dòng BOM (advisory lock + kiểm DRAFT) + chặn double-click client |
| SX-19 | Tạo LSX (DRAFT) báo Bộ phận Gia công như GTAM |
| SX-20 | LSX lưu ĐVT (`productSpecification.uom`), kiểm ngày kết thúc ≥ bắt đầu (client + server) |
| SX-21 | `/work-orders/new` giữ query khi chuyển sang `new-lsx`; `new-lsx` điền sẵn SP/ghi chú/quy trình/BOM |
| SX-22/23 | Quét lắp ráp: WO phải RELEASED/QUEUED/IN_PROGRESS, không vượt SL cần, khoá dòng WO `FOR UPDATE` |
| SX-24 | `/api/assembly/wo/[id]/complete` dùng chung handler `/api/work-orders/[id]/complete` |
| SX-26..28 | Phiếu yêu cầu vật tư: menu đã bỏ theo quyết định 27/09; operator tạo được + RBAC đọc đã sửa Đợt 1c → stale |
| SX-29 | KPI danh sách WO từ `meta.statusCounts` (server GROUP BY) thay vì 200 dòng đầu |
| SX-30 | Lọc BOM theo ngày cập nhật / số linh kiện phía server |
| SX-31 | Danh sách WO / tab BOM hiện lỗi thay vì "rỗng" |
| SX-32 | Phát hành revision mới → revision RELEASED cũ thành SUPERSEDED (khoá template) |
| SX-33/34 | Danh sách WO: cột "Sản phẩm" thay cột "Đơn hàng" |
| SX-25 | Đã làm Đợt 1 (goods_issue) — chỉ kiểm |

## Ẩn tính năng (Q2/Q4/D10)

- `lib/hidden-features.ts`: `HIDDEN_FEATURES`, `hiddenRouteRedirect(path)`, `isHiddenHref(href)`; `filterNavByRoles` lọc thêm href bị ẩn.
- Route: `/orders*` → `/bom`; `/assembly` → `/operations`; `/assembly/[woId]` → `/work-orders/[woId]?tab=progress` (layout server `redirect`).
- BOM workspace: bỏ tab "Đơn hàng", "Lắp ráp" + chip KPI "Đơn hàng"; cột "Đơn hàng" ở tab Sản xuất; nút "Tạo lệnh SX" mở LSX gắn BOM.
- `/operations`: bỏ tab "Quy trình lắp ráp". Dashboard: bỏ cột "Đơn hàng" biểu đồ + 2 thẻ tính từ snapshot đơn hàng (Linh kiện sẵn sàng, Lắp ráp).
- Link ECO sót trong `QcChecklistEnriched`; gợi ý tab "Thiếu vật tư" ở tab Mua sắm.
- Q2: khối "SL thành phẩm / Lot FG / Ghi chú" trong dialog hoàn tất lắp ráp ẩn + TODO `V4.1 Q2`; sửa câu mô tả sai.
- KHÔNG xoá bảng/API (Đợt 7).

## Kiểm thử

- vitest: `lib/wo-guards.test.ts`, `lib/hidden-features.test.ts`, `lib/nav-items` lọc ẩn.
- `plans/v4.1-audit-hoan-thien/sql/dot4_smoke.sql` (ROLLBACK): cột/FK/index, backfill, SET NULL khi xoá dòng BOM.
- `pnpm -r typecheck`, vitest web + shared, `pnpm build`.
