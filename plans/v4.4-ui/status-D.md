# Trạng thái NHÓM D — BOM + Vật tư + Lô/Serial (V4.4 UI)

Commit: `94f4e9b fix(v4.4-ui): NHÓM D - BOM/Vật tư/Lô-Serial đồng bộ giao diện`
Branch worktree: `worktree-agent-a84b765de00d33bac` (base: `v43/warehouse` @ `a6581b9`)

## Đã sửa

| # | Mức | Điểm lệch | File |
|---|---|---|---|
| D1#1 | P0 | BOM Grid vỡ mobile 390px — cột "Thao tác" sticky đè "BOM gốc" | `components/bom-grid-pro/BomGridPro.tsx` |
| D2#1 | P0 | Deep-link "Xem Lot/Serial" mất `itemId`, đá ra toàn bộ 865 vật tư | `app/(app)/lot-serial/page.tsx`, `app/(app)/warehouse/page.tsx`, `components/warehouse/ItemsTab.tsx`, `components/inventory/ItemInventoryPanel.tsx` |
| D1#3 | P1 | `ActionsCell` nút 24px không aria-label, không vùng chạm | `components/bom-grid-pro/ActionsCell.tsx` |
| D.A | P1 | `WOQuickDialog`/`SubcontractPOQuickDialog` 5-6 trường → Dialog thay Sheet | `components/bom-grid-pro/WOQuickDialog.tsx`, `components/bom-grid-pro/SubcontractPOQuickDialog.tsx` |
| D2#2 | P1 | `ItemInventoryPanel`/`InventoryKpiCards` 0 class dark: | `components/inventory/ItemInventoryPanel.tsx`, `components/inventory/InventoryKpiCards.tsx` |
| D2#3 | P1 | Bảng "Dùng trong BOM" + "Lot gần nhất" không card-list mobile | `components/items/ItemBomUsagesPanel.tsx`, `components/inventory/ItemInventoryPanel.tsx` |
| D2#5 | P1 | Stepper Import Excel cắt chữ bước 4 mobile | `components/items/ImportWizard.tsx` |
| D2#4 | P1 (một phần) | Breadcrumb lot-serial detail lệch nhãn desktop/mobile | `lib/breadcrumb-items.ts` (đổi nhãn "Lô / Serial" → "Vật tư"; còn thiếu cấp "Kho" + mã lô thay UUID — xem mục "Chưa sửa") |
| tự phát hiện | P1/P2 | `BomFilterChip`, `ReleaseRevisionDialog` thiếu dark mode | `components/bom/BomFilterChip.tsx`, `components/bom-revision/ReleaseRevisionDialog.tsx` |
| D.B | P2 | Cột "Thành phẩm" BOM List 100% rỗng vẫn chiếm cột | `components/bom/BomListTable.tsx` |
| D.E | P2 | `StockCell` nối `row.uom` thay vì `formatUom()` | `components/items/ItemListTable.tsx` |
| D.F | P2 | Segmented control Items FilterBar tự dựng tay thay `<Tabs variant="segmented">` | `components/items/FilterBar.tsx` |
| A3 | P2 | `BomTab` dùng `.toLocaleString()` cục bộ thay `formatNumber()` | `components/engineering/BomTab.tsx` |
| A11 | P1 | `items/import` breadcrumb "Trang chủ" chuỗi cứng thay `ROOT_LABEL` | `app/(app)/items/import/page.tsx` |

## Chưa sửa (lý do ngoài phạm vi UI thuần nhóm D)

- **D1#4** — Filter "Tất cả" BOM List vẫn ẩn ngầm BOM OBSOLETE (server mặc định
  lọc status khi không truyền cụ thể) → cần sửa `server/repos/bomTemplates.ts`
  (logic server, không phải UI).
- **D1#5** — Tab "Yêu cầu sản xuất" (N1 4 KPI cùng cỡ chữ, N7 segmented lệch
  2 tab cùng hub) → thuộc `components/engineering/WorkOrdersTab.tsx`, nằm
  trong phạm vi loại trừ "tab Lệnh SX — nhóm khác" theo đúng chỉ dẫn phạm vi.
- **D2#4 (phần còn lại)** — Breadcrumb desktop `/lot-serial/[id]` qua topbar
  (`components/layout/TopBar.tsx` + `buildBreadcrumbItems`) chỉ relabel được
  1 segment theo cấu trúc URL thật (`/lot-serial/{uuid}` = 2 segment), không
  thể tự thêm cấp "Kho" hay thay UUID bằng mã lô như mobile — cần làm special
  case trong `TopBar.tsx` giống cách đã làm cho `bomCode` (dòng ~108-117).
  File này thuộc `components/layout/*`, nhóm A đã khoá — không tự sửa.

## Kiểm chứng

- `pnpm install --frozen-lockfile`: OK.
- `pnpm -r typecheck`: OK (4/4 package).
- `pnpm --filter @iot/web test`: OK — 46 file / 732 test pass.
- `pnpm --filter @iot/web build` (1 lần, máy ít RAM) + `next start -p 4100`
  với `staging-local.env` (APP_URL/PORT=4100 ghi đè): build thành công, server
  start OK.
- Login flow end-to-end: `POST /api/auth/login` → 200 + cookie `iot_session`
  → `GET /api/items` kèm cookie → 200.
- Playwright (admin/ChangeMe!234), desktop 1440×900 + mobile 390×844,
  light+dark, so với ảnh cũ `scratchpad/ui-inventory/D/`:
  - `bom-grid` mobile: xác nhận hết đè — "BOM gốc" hiện đầy đủ (trước: 1 ký
    tự), desktop pixel-giống ảnh cũ.
  - Deep-link `/lot-serial?itemId=...`: mở đúng sheet "Chỉnh sửa · <SKU>"
    của vật tư đang xem (trước: rơi ra danh sách 868 vật tư, filter rỗng).
  - `items-detail` tab Kho: dark mode đúng, card-list "Lot gần nhất" mobile
    hiện đủ Trạng thái/Tồn/HSD/Nhập kho.
  - `items-detail` tab "Dùng trong BOM": card-list mobile đúng.
  - `bom-list`: cột "Thành phẩm" đã ẩn (19 BOM đều rỗng parentItemSku).
  - `items-list`: segmented control "Tất cả/Đang dùng/Ngừng dùng" giữ nguyên
    hiển thị pill đen sau khi đổi sang `<Tabs>`.
  - `items-import` mobile: breadcrumb "Tổng quan" (trước "Trang chủ");
    stepper bước 1 không cắt chữ (chưa chụp được đúng lúc bước 4 "Kết quả"
    active — xác minh qua code: `min-h-12` tự giãn khi wrap, không còn clip).
  - `lot-serial-detail`: breadcrumb desktop nay "Tổng quan / Vật tư / Chi
    tiết" (trước "Tổng quan / Lô / Serial / Chi tiết", link cũ trỏ vỡ).
  - `wo-quick-sheet` (desktop + mobile, click trực tiếp nút GTAM trên BOM
    Grid): xác nhận Sheet trượt phải đúng chuẩn SheetHeaderNav + DateField
    dd/mm/yyyy + nút chính màu indigo mặc định.
  - `SubcontractPOQuickDialog` — KHÔNG click-test trực tiếp được: dữ liệu
    BOM test có category "Gia công đặt ngoài" nhưng chuỗi không khớp điều
    kiện `classifyAction()` trong `ActionsCell.tsx` (lệch dấu cách, bug có
    sẵn không thuộc phạm vi sửa) nên dòng đó rơi về nhánh "thuong-mai" —
    không có nút Send cam để bấm. Đã xác minh qua code review + build/
    typecheck pass (code mirror 100% cấu trúc `WOQuickDialog` đã test
    live) + review JSX thủ công, không phát hiện vấn đề.
