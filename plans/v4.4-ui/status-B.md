# V4.4 UI — Trạng thái NHÓM B (Kho + nhận hàng)

> Worktree: `agent-a7b1498e0d6fcf195`. Commit: `4e413ad`, `6ea6e0d`, `d04371b` (3 commit, chưa merge).

## Đã sửa xong

### P0 (§7 top-5 #1, #2)
- **QC nhập kho — nút Đạt/Không đạt ẩn mobile**: `QcPendingView.tsx` — bảng desktop giữ nguyên (`hidden md:block`), thêm card-list mobile với nút Đạt/Không đạt full-width h-11 (≥44px), luôn trong tầm tay.
- **Sơ đồ kho — lưới ô kệ vỡ mobile**: `WarehouseLayout3D.tsx` (`Rack2DView`/`Bin2DPro`) — ô kệ co nhỏ responsive (116×104 mobile → giữ nguyên 160×120 từ `md:`), snap-x cuộn ngang + dòng gợi ý "← Vuốt ngang... →", giữ nguyên desktop/3D.

### P1 nặng + P1 (§7 top-5 #3–#5, B.A–B.H)
- Báo cáo kho màu ngoài hệ (violet/indigo/blue/teal) → 1 thang indigo đậm→nhạt khớp Sơ đồ kho (`ReportTab.tsx`).
- `GoodsIssuesTab.tsx`: enum "PURCHASE_REQUEST" rò rỉ thô → nhãn "Đề xuất vật tư" + màu riêng + fallback `prettifyUnknownCode` (A14) cho nguồn lạ tương lai; thêm card-list mobile (bảng 820px trước không có).
- N1/N2 (TodayInboxTab 4 hero cùng cỡ → đúng 1 hero; ReceivingMovementView không hero nào → thêm hero "Quá hạn giao"; ReportTab KpiCard tự chế → `StatTile` dùng chung, hero "Đang dùng").
- B.A: Bin detail drawer (`WarehouseLayoutTab.tsx`) tự vẽ `<div fixed>` → `Sheet` dùng chung.
- B.B: `BinListView` (Danh sách hàng) tự vẽ `<table>` → `DataTable` dùng chung (card-list mobile tự động).
- B.C: 3 Dialog `BinActions.tsx` (Thêm/Rút/Chuyển) → `Sheet` (N6), nút xác nhận ghi rõ việc làm.
- B.F: `ReceivingMovementView` filter PO (3 button rời) → segmented control dùng chung.
- A7: "Bin đích"/"Thêm hàng vào bin"/"AVAILABLE" thô → "Vị trí đích"/"Thêm hàng vào ô/kệ"/`StatusPill domain="lot"` (`BinActions.tsx`, `WarehouseLayoutTab.tsx`, `warehouse/page.tsx`).
- A8: "Quản lí kho" → "Quản lý kho" (`warehouse/page.tsx`).
- Segmented control (N7/A12) đồng bộ `Tabs variant="segmented"` ở: `MovementTab`, `QcPendingView`, `ReceivingMovementView`, `WarehouseLayout3D` (3D/2D), `BinActions` (Nhập/Xuất).

### Theo yêu cầu bổ sung "chuẩn phiếu điền" (Sheet + SheetHeaderNav + * + lỗi dưới trường + chống bấm 2 lần)
- `CreateDeliveryNoteDialog` (BBGH) — tự vẽ `<div fixed>` tay (không Dialog/Sheet thật) → `Sheet`; thêm dấu * + lỗi tiếng Việt dưới trường + cuộn tới lỗi.
- `ReLotIssueRequestDialog` (Chọn lại lô) — Dialog giữa màn → `Sheet`; ô số lượng 32px → 44px; nút chính violet-600 → indigo-600 mặc định.
- `StocktakeCreateSheet` — nút "Tạo phiên" hết bị khoá câm, bấm hiện lỗi dưới tiêu đề + cuộn tới đó.
- `GoodsIssuesTab.tsx` filter ngày → `DateField` dd/mm/yyyy.
- Nút chính emerald/rose thiếu cặp `dark:` (lộ qua ảnh dark mode — đổi sai sang indigo) → vá ở `BinActions`, `QcPendingView`, `IssueMovementView`, `ReceivingMovementView`.

### Màn mới (chưa được audit trước đó) — đã rà
- **Kiểm kê** (`StocktakeSection.tsx`, `StocktakeCreateSheet.tsx`, `StocktakeSessionSheet.tsx`): card container → token V4.3, card-list mobile, `StatusPill domain="stocktake"` (MỚI trong `lib/status.ts`, gộp 2 bản nhãn lệch nhau), `formatDateTime`/`formatMoney` thay `toLocaleString`/hậu tố "đ" tự ghép, `invTxTypeLabel()` (MỚI) cho cảnh báo giao dịch mới.
- **Vị trí mặc định** (`DefaultBinSuggestionSheet.tsx`): dark mode còn thiếu vài chỗ, `formatPercent` thay `Math.round(...*100)`.
- **Chọn lại lô** (`ReLotIssueRequestDialog.tsx`): xem trên.

### `components/inventory/*` (tab Kho trang Vật tư, trong phạm vi file được giao)
- `InventoryKpiCards.tsx`, `ItemInventoryPanel.tsx`: thêm `dark:` đầy đủ (0 class trước đó), card-list mobile cho bảng "Lot gần nhất".

## Chưa xử lý / ghi nhận cho nhóm khác
- `receiving/[poId]/wizard` — **KHÔNG đụng** theo đúng phân công (Nhóm C).
- B.H (trạng thái PO tiếng Anh thô trong `receiving/[poId]/wizard`) — thuộc file Nhóm C, chỉ ghi nhận lại, không sửa.
- `lot-serial/[id]/page.tsx` có hàm `eventLabel()` cục bộ trùng nội dung với `invTxTypeLabel()` mới thêm ở `lib/status.ts` — gợi ý Nhóm D gộp lại khi tiện (không tự sửa vì thuộc route Lô/Serial của Nhóm D).
- Bảng "Dùng trong BOM" (`components/items/ItemBomUsagesPanel.tsx`) thiếu card-list mobile — thuộc `components/items/**`, ngoài phạm vi file nhóm B.
- GoodsIssuePanel.tsx / CreateIssueRequestPanel / "Xuất nhanh" (IssueMovementView.tsx) là panel luôn-hiện-trong-trang (không phải Dialog/Sheet) — đã vá format số + flex-wrap, KHÔNG đổi kiến trúc sang Sheet (khác bản chất với Dialog/modal cần sửa).

## Kiểm chứng
- `pnpm install --frozen-lockfile` OK.
- `pnpm -r typecheck` xanh (web/worker/shared/db).
- `pnpm --filter @iot/web test` — 46 file / 733 test pass (gồm `status.test.ts` 36 test, tự validate domain `stocktake` mới).
- `pnpm --filter @iot/web build` OK (cần env staging qua tunnel 15432/16379 lúc build để collect page data).
- `next start -p 4500` + login thật (`admin`/`ChangeMe!234`) → `GET /api/items`, `/api/warehouse/layout`, `/api/warehouse/today` trả 200 với dữ liệu thật.
- Playwright chụp desktop 1440×900 + mobile 390×844 × light/dark cho 10 trang/tab + 7 tương tác (Sheet thêm/rút/chuyển, bin detail, vị trí mặc định, tạo phiên kiểm kê, tạo BBGH, tạo yêu cầu xuất kho) — đối chiếu bằng mắt, lặp lại khi phát hiện màu dark mode sai (vá ở commit `d04371b`). Ảnh tại
  `...\scratchpad\ui-fix-B\` (không commit).
