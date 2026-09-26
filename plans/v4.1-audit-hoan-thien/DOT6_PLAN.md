# V4.1 — Đợt 6 "Chuẩn giao diện" — Kế hoạch chi tiết

> Nguồn: AUDIT.md §7 (UI-01..33) + UX-01..08 + ảnh chụp THẬT mes.songchau.vn ngày 27/09/2026
> (admin, desktop 1536×864 @1.25 và điện thoại 390×844 @2). Ảnh ở `dot6/shots/`
> (`desktop-<trang>.png`, `phone-<trang>-<1..3>.png`, mỗi phần = 1000px CSS).
> Script chụp: `dot6/shoot.cjs` (chỉ điều hướng, không bấm nút ghi dữ liệu).
> Nguyên tắc thiết kế: 1 màu thương hiệu indigo + zinc + màu trạng thái chức năng; KHÔNG cầu vồng/gradient.
>
> Lưu ý đo đạc: trình duyệt test dùng locale en-US nên ô ngày hiện `mm/dd/yyyy` (Chrome theo locale máy,
> máy người dùng tiếng Việt sẽ thấy `dd/mm/yyyy`) → không coi là lỗi P1.
> Vài trang lần chụp đầu dính **429 "Quá nhiều yêu cầu"** do bot chuyển trang nhanh — chính điều này làm
> lộ lỗi UI-05 (xem D-03).
> Không lập kế hoạch cho code mồ côi đang bị xoá song song (bom/[id]/tree, QcChecklist*, MaterialRequirementsTable,
> eco/*, shortage/*, OverviewTab/LotSerialTab kho, Sidebar cũ…).

---

## 0. Top 15 lỗi (xếp theo tác động)

| # | Lỗi | Ảnh | Gốc rễ |
|---|---|---|---|
| 1 | **Lỗi API/429 hiện thành "trống" + nút mời tạo mới**: /admin/users "Chưa có người dùng nào — Tạo user đầu tiên" (thật ra có 15), Nhà cung cấp "0 NCC — Tạo NCC đầu tiên" (thật có 50), Sổ quỹ | `desktop-admin-users.png` (lần 1), `desktop-sales-sup.png` | các hook `useQuery` chỉ render `data ?? []`, không nhánh `isError` (UI-05) |
| 2 | Header BOM workspace điện thoại: mã BOM gãy 3 dòng, nút "Kích hoạt BOM" bị cắt chữ | `phone-bom-grid-1.png` | `BomWorkspaceTopbar.tsx:179` header `h-12` cố định, không wrap; mã `font-mono` không `truncate/min-w-0`; nhãn nút `hidden sm:inline` với sm=375 → vẫn hiện ở 390px trong nút cao 28px |
| 3 | Thanh công cụ lưới BOM (điện thoại) chip "Số lượng parent"/"Tự ẩn cột rỗng" bị bóp 3 dòng; bảng `table-fixed w-full` bóp cột → cột "BOM gốc" còn 1 ký tự "B" | `phone-bom-grid-1.png` | `BomGridPro.tsx:~919` thanh `h-10` không wrap; `<table className="w-full table-fixed">` (dòng ~1034) không có `min-width` = tổng `<col>` |
| 4 | Pill PIC bị cắt "Cường — Bộ phận Gi…" (desktop) | `desktop-bom-grid.png` | `BomGridPro.tsx:733-760` cột PIC 110px, pill in cả `assignedToFullName` (tên + bộ phận), không `max-w-full truncate` + title |
| 5 | Thanh tab hub **không cuộn ngang** → trang /sales tràn 461px, /engineering?tab=pr 501px, tab gãy 3–4 dòng "TC: Công nợ & Thiết lập" | `phone-sales-po-1.png`, `phone-fin-cashbook-1.png`, `phone-eng-pr-1.png` | `components/common/HubTabsNav.tsx:33` `<ul className="flex … px-4">` thiếu `overflow-x-auto` + `whitespace-nowrap shrink-0` (WarehouseTabsNav đã có) |
| 6 | Header danh sách PR điện thoại: 3 nút hành động tràn phải, tiêu đề "Đề xuất vật tư" gãy mỗi chữ 1 dòng | `phone-eng-pr-1.png` | `components/engineering/PRTab.tsx:~100-125` header `flex justify-between` không `flex-wrap`, không `min-w-0` |
| 7 | Hạn trên Bảng sản xuất **đỏ đậm cho cả dòng "Đã giao"/"Hoàn thành"** → cả bảng đỏ, mất tín hiệu | `desktop-production-board.png` | `production-board/page.tsx:374 deadlineTone()` chỉ xét ngày, bỏ qua trạng thái |
| 8 | Bảng sản xuất trên điện thoại chỉ còn 2 cột Mã/Sản phẩm — mất Trạng thái, Hạn, Đạt/KH (thứ tổ xưởng cần nhất) | `phone-production-board-1.png` | cột ẩn bằng `hidden md:table-cell`, không có dạng thẻ |
| 9 | Danh sách Vật tư điện thoại ẩn cột **Tồn kho**, giữ "Active"; nhãn "Active" tiếng Anh cả desktop; trang chi tiết lại ghi "Đang dùng" | `phone-wh-items-1.png`, `desktop-wh-items.png`, `phone-item-detail-1.png` | `components/items/ItemListTable.tsx:353` label cứng "Active"; không dùng status map chung |
| 10 | Badge trạng thái gãy 2 dòng chồng lên dòng dưới ("Hoạt động", "Đã chuyển PO") | `phone-eng-bom-1.png`, `phone-eng-pr-1.png` | `Badge` thiếu `whitespace-nowrap`; cột trạng thái quá hẹp |
| 11 | Chữ Anh/mã thô lọt giao diện: "PO status SENT", "SENT hoặc PARTIAL", "PO đã RECEIVED — không còn action approval", tab "Audit", "Tracking", "UOM/SKU/TARGET QTY/PARENT ITEM", "Utilization/bins/fill ratio/low_threshold/default_bin_id/putaway", "AUDIT EVENTS/RATE-LIMIT HITS/CANCEL/CREATE", thông báo hiện `PR_PENDING_REMINDER`, `FIN_INVOICE_OVERDUE`, breadcrumb topbar "engineering / warehouse / sales / procurement / purchase-requests / users / audit", "Dashboard" | nhiều (mục 2) | `lib/breadcrumb-items.ts SEGMENT_LABELS` thiếu khoá; `ReceivingMovementView.tsx`, `PoApprovalWorkflow.tsx`, `notifications/page.tsx:266`, `BomListTable.tsx:346/359`, `items/[id]/page.tsx:111/248`, `admin/users/page.tsx:320` |
| 12 | Dashboard "cầu vồng": KPI đỏ/tím/cam, 4 thẻ % vàng/xanh/hồng/tím nền gradient, hero lưới + gradient, dải tím đặc "Bảng điều hành sản xuất"; ô "Số lượng dữ liệu" trên điện thoại cắt chữ "LINH KIỆN 86" | `desktop-home.png`, `phone-home-1.png` | `components/dashboard/{BigStatCard(12 gradient),HeroOverviewCard(8),MetricCard(5),ProgressBarCard(5),DashboardHeader(3)}.tsx` |
| 13 | Sơ đồ kho: ô bin gradient tím/xanh/ngọc; chú giải ("Có hàng" xanh dương) không khớp màu ô ("Đầy" tím, "Còn ít" ngọc); nhãn tầng bị cắt "NG 3" | `desktop-wh-layout.png` | `components/warehouse/WarehouseLayoutTab.tsx` (+ component ô bin) — cần 1 thang màu fill đơn sắc indigo |
| 14 | Bảng danh sách thiếu chuẩn: tiêu đề cột dính nhau "TARGET QTYTRẠNG THÁI", "TỔNG (VND)DUYỆT"; số "1" dán sát pill; 5 icon hành động/dòng có **nút xoá đỏ luôn hiện**; mã bị cắt "Z0000002-565488…" không tooltip | `desktop-eng-bom.png`, `desktop-sales-po.png`, `desktop-production-board.png` | `BomListTable.tsx`, `POListTable.tsx:70-71` grid-cols thủ công, không có padding cột số |
| 15 | Trang in phiếu PR trên điện thoại: logo "XƯỞNG SXKD" **đè lên** tên công ty; nhãn "Số phiếu" tràn | `phone-pr-detail-1.png` | `components/procurement/DnvtDetailBody.tsx` header 3 cột cố định, không stack < md |

---

## 1. Việc xuyên suốt (làm trước, các trang hưởng lợi)

### X1. Sửa chiến lược breakpoint `sm` (UI gốc)
- **Hiện trạng:** `tailwind.config.ts:364` `sm: "375px"`. 116 lớp `sm:*` trong 59 file đều viết theo ý nghĩa mặc định 640px
  (`sm:grid-cols-2` 28 chỗ, `sm:inline` 11, `sm:flex-row` 7, `sm:grid-cols-4` 5, `sm:max-w-*`…). Kết quả: ở 390px điện thoại
  đã nhảy sang bố cục "tablet" (VD `hidden sm:inline` → chữ nút vẫn hiện, gây lỗi #2).
- **Làm:** đổi `sm: "640px"` (mặc định Tailwind), thêm `xs: "375px"` nếu cần (hiện 0 chỗ dùng `xs:`; `size="xs"` của Button không liên quan).
  Không có JS/CSS nào phụ thuộc 375 (đã grep `matchMedia`, `@screen`, `useMediaQuery` = 767/1023).
- **Kiểm:** chụp lại 390/640/768 cho 59 file có `sm:` (danh sách: `grep -rl "sm:" apps/web/src --include=*.tsx`). Rủi ro chỉ
  ở khoảng 375–639px: bố cục chuyển về 1 cột — đúng ý đồ mobile-first. Đặc biệt soát `sm:max-w-*` của dialog (UI-01, đã vá đợt 0).

### X2. `lib/status.ts` — nguồn nhãn/màu trạng thái duy nhất (UI-07/08)
- 45 file có map trạng thái cục bộ (`STATUS_LABEL/STATUS_META/…`). Lệch thấy trên ảnh: BOM "Hoạt động" (badge) vs "Đang dùng"
  (chip lọc); Vật tư "Active" (list) vs "Đang dùng" (chi tiết); user "Active/Disabled"; "Đã huỷ" màu đỏ (nên xám); PO "Đã duyệt" xanh lá
  cạnh "Nháp" xám cùng 1 dòng (2 trục trạng thái không phân biệt).
- **API:** `getStatus(domain, code) → { label, tone }` với `domain ∈ bom|item|pr|po|wo|board|receiving|goodsIssue|deliveryNote|finTxn|invoice|user|session`,
  `tone ∈ neutral|info|progress|success|warning|danger` (6 tone → map 1 lần sang lớp Tailwind trong `components/ui/status-badge.tsx`).
  Quy ước: Nháp=neutral, Chờ duyệt/Đã gửi=info, Đang xử lý=progress(indigo), Hoàn tất=success, Quá hạn/Thiếu=warning, Từ chối/Lỗi=danger,
  **Đã huỷ/Ngừng = neutral + gạch ngang** (không đỏ).
- `StatusBadge` luôn `whitespace-nowrap` (sửa #10).
- Cũng export `ACTION_LABELS` cho audit/hoạt động (LOGIN→"Đăng nhập", WO_COMPLETE→"Hoàn tất lệnh"...) và `NOTIF_TYPE_LABELS`
  (PR_PENDING_REMINDER→"Nhắc duyệt"...) — dùng ở `admin/audit`, `admin` tổng quan, `RecentActivityCard.tsx`, `notifications/page.tsx:266`.
- Chuyển dần: đợt này chỉ đổi các chỗ hiện trên màn chính (danh sách ở mục 2); map cục bộ còn lại ghi TODO.

### X3. Mở rộng `lib/format.ts` (UI-13..16)
Hiện có `formatNumber`, `formatCurrencyVN`, `formatDate`, `formatSku`, `formatDaysLeft`. Thêm:
- `formatMoney(n, {sign?, unit?: "₫"|"none"})` đầy đủ số, dấu chấm nghìn vi-VN; `formatMoneyShort(n)` → "1,5 tr" / "2,3 tỷ" (dấu **phẩy** thập phân).
- `formatQty(n, uom?)` → "1.000 PCS" (ĐVT viết hoa thống nhất; "Set/SET/Pcs" lẫn lộn ở Bảng sản xuất).
- `formatDateTimeVN(iso)` luôn `timeZone: "Asia/Ho_Chi_Minh"` → "27/09/2026 10:52" (audit log đang hiện `03:52:19 27/09/26` = giờ UTC, định dạng lệch).
- `toLocalDateInput(date)` cho `<input type=date>` theo giờ VN.
- Tiền hiển thị bằng font thường + `tabular-nums` (KHÔNG `font-mono`: mono làm "0 ₫" rộng, dấu ₫ lệch baseline — thấy ở KPI tài chính & PO).
- Thay các `fmtDeadline` tự viết (`production-board/page.tsx:368`) bằng `formatDate`.

### X4. `components/ui/data-table` — chuẩn bảng (UI-11..14 + yêu cầu "trình bày bảng biểu")
Dựng trên `@tanstack/react-table` (đã cài ^8.21, chưa dùng) + `@tanstack/react-virtual` (đã cài). Cột khai báo:
```ts
{ id, header, kind: "code"|"text"|"qty"|"money"|"date"|"status"|"actions", accessor, width?, mobile?: "primary"|"secondary"|"hide", sum?: boolean }
```
- `qty|money` → canh phải + `tabular-nums` + format tự động; `code` → mono + `truncate` + `title` + nút copy khi hover/tap.
- Header dính (`sticky top-0 z-10 bg-zinc-50`), padding cột tối thiểu `px-3` (chữa "TARGET QTYTRẠNG THÁI").
- Hàng tổng (`sum: true`) cố định dưới (mẫu tốt đã có: Sổ quỹ "Cộng trang này").
- **3 trạng thái bắt buộc:** loading (skeleton 5 dòng), empty (phân biệt "chưa có dữ liệu" vs "không khớp bộ lọc — [Xoá lọc]"),
  **error (thông điệp + nút "Thử lại"; 429 → "Hệ thống đang bận, thử lại sau Ns")** — sửa #1.
- Điện thoại (< md): tự chuyển **dạng thẻ** khi ≥ 5 cột: dòng 1 = cột `primary` + StatusBadge, dòng 2 = các cột `secondary` dạng nhãn:giá trị.
  Nếu bảng buộc giữ dạng lưới (BOM grid) → wrapper `overflow-x-auto` + `min-width` = tổng cột.
- Cột hành động: tối đa 2 icon hiện sẵn, còn lại vào menu "⋯"; **xoá luôn nằm trong menu** + ConfirmDialog.
- Phân trang 1 kiểu (hiện có 3 kiểu): "Hiển thị 1–50 / 863" + « ‹ › ».
- Áp dụng đợt này cho: BomListTable, PR list (PRTab), POListTable, ItemListTable, production-board, admin users, audit, goods-issues,
  delivery-notes. Các bảng khác chuyển dần.

### X5. `components/ui/confirm-dialog.tsx` + hook `useConfirm()` / `usePrompt()` (UX-01, UI-26)
- Tổng quát hoá `components/finance/ConfirmActionDialog.tsx` (Đợt 3) → `ui/confirm-dialog.tsx` với `tone: "danger"|"primary"`,
  `requireReason?: {label, minLength}` (thay `prompt()`), `typeToConfirm?` (gộp `DialogConfirm` trong `ui/dialog.tsx:149`).
- Provider 1 lần ở layout, hook trả Promise → thay tối thiểu: `if (!confirm(x)) return;` → `if (!(await confirm({title:x}))) return;`.
  `ConfirmActionDialog` cũ giữ làm wrapper mỏng để không đụng code tài chính.
- **Call site cần thay (22, đã loại file mồ côi):**
  `components/work-orders/WorkOrderActions.tsx:118,128,151,170,180` (duyệt/từ chối/tạm dừng/hoàn thành/huỷ WO — 4 prompt!) ·
  `components/warehouse/IssueMovementView.tsx:117,1015,1041` · `components/warehouse/DeliveryNotesTab.tsx:182,204` ·
  `components/bom-workspace/BomWorkspaceTopbar.tsx:122,139,167` (đổi tên/nhân bản/khôi phục BOM) ·
  `components/bom/MaterialProcessSheetView.tsx:129,418` · `components/items/ItemQuickEditSheet.tsx:460` ·
  `components/items/BarcodeList.tsx:199` · `components/items/SupplierList.tsx:248` ·
  `app/(app)/procurement/purchase-requests/[id]/page.tsx:504,527` · `app/(app)/material-requests/[id]/page.tsx:444` ·
  `app/(app)/me/settings/page.tsx:264` · `app/(app)/admin/reports/targets/page.tsx:372` ·
  (`assembly/[woId]/page.tsx:235` — module ẩn theo D10, để cuối).

### X6. `components/layout/PageHeader` + `HubTabsNav` chuẩn (UI-09, UI-25)
- **Trùng breadcrumb 2–3 tầng**: topbar ("Trang chủ / engineering") + hub ("Tổng quan › Bộ phận Thiết kế › Yêu cầu mua") + tab con
  ("Trang chủ / Đề xuất vật tư") — `desktop-eng-pr.png`, `desktop-fin-settle.png`. Chốt: **topbar giữ breadcrumb duy nhất**
  (bổ sung `SEGMENT_LABELS`: engineering→"Bộ phận Thiết kế", operations→"Bộ phận Gia công", warehouse→"Bộ phận Kho", sales→"Bộ phận Thu mua",
  procurement→"Thu mua", purchase-requests→"Đề xuất vật tư", purchase-orders→"Đơn đặt hàng", users→"Người dùng", audit→"Nhật ký",
  settings→"Cài đặt", sessions→"Phiên đăng nhập", reports→"Báo cáo", "production-board"→"Bảng sản xuất", notifications, me, profile…
  + đọc `?tab=` để thêm nhãn tab), bỏ breadcrumb trong thân trang.
- `PageHeader({title, subtitle, actions})`: `flex flex-wrap gap-3`, tiêu đề `min-w-0`, cụm nút `flex-wrap`, trên điện thoại nút phụ
  thu vào menu "⋯", chỉ giữ 1 nút chính (sửa #6, "Tạo mới"/"Nhập Excel" gãy dòng ở `phone-wh-items-1.png`, `phone-sales-po-1.png`).
- `HubTabsNav`: `overflow-x-auto scrollbar-none`, item `shrink-0 whitespace-nowrap`, tự `scrollIntoView` tab active, gradient mờ mép phải
  báo còn tab (sửa #5). Dùng chung cho engineering/operations/sales/warehouse/admin/item detail tabs.
- Sales hub thiếu tiêu đề hub (khác 3 hub còn lại) → thêm "Bộ phận Thu mua".
- Admin dùng container khác (`max-w` hẹp + nền gradient `desktop-admin-users.png`) → thống nhất khung trang.

### X7. Kích thước chữ & vùng chạm (UI-20..22, UX-08)
- 268 × `text-[10px]`, 368 × `text-[11px]`, 12 × `text-[9px]`, 2 × `text-[8px]`. Quy tắc: **tối thiểu 12px** cho mọi chữ đọc được,
  11px chỉ cho nhãn phụ in hoa; bỏ hẳn 8–9px. Ưu tiên màn xưởng: production-board, BOM grid (header 10px, PIC 11px, ✎ 9px), warehouse layout, dashboard.
- Nút/icon hành động ≥ 36px vùng chạm trên `pointer: coarse` (`h-7 w-7` hiện tại = 28px). Input ≥ 16px trên iOS (tránh auto-zoom).
- Hover-only còn 2 chỗ: `components/bom/BomSheetTabs.tsx:217` (menu ⋮ sheet), `bom-grid-pro/ActionsCell.tsx` (đã bỏ, còn comment) → thêm
  `[@media(hover:none)]:opacity-100`.
- Native `<select className="h-8 … text-sm">` cắt chân chữ "Mọi nguồn", "Tất cả danh mục" (`desktop-wh-gi.png`, `desktop-fin-cashbook.png`)
  → `components/warehouse/GoodsIssuesTab.tsx:225` và bộ lọc tài chính: dùng `ui/select` hoặc `h-9 py-0 leading-normal`.

### X8. Tiết chế màu (UI-24) — theo nguyên tắc Thang
- Dashboard: bỏ gradient ở `BigStatCard`, `HeroOverviewCard`, `MetricCard`, `ProgressBarCard`, `DashboardHeader`; KPI = thẻ trắng viền zinc,
  số đen, icon zinc; màu chỉ dùng cho **trạng thái** (thanh tiến độ indigo; <50% amber nếu trễ). Dải "Bảng điều hành sản xuất" nền indigo đặc → header trắng.
- KPI 4 thẻ màu ở PO, Nhập kho, Tài chính tổng quan (6 màu), Sổ quỹ (xanh/hồng), WO list — cùng 1 component `StatCard` trung tính.
- Sơ đồ kho: ô bin một thang indigo theo % lấp đầy (0% zinc-50 → 100% indigo-600, chữ tự đổi trắng khi nền đậm), chú giải khớp thang.
- Không thêm màu mới; trang in phiếu PR (xanh #005ba8 mô phỏng mẫu giấy) giữ nguyên vì là bản sao biểu mẫu.

### X9. Tiếng Việt hoá (UI-27/28)
- Bảng thuật ngữ `docs/GLOSSARY.md`… (không tạo file doc mới nếu Thang không muốn → đặt trong `lib/labels.ts`): SKU→"Mã vật tư",
  UOM→"ĐVT", Target Qty→"SL mục tiêu", Parent item→"Thành phẩm", Tracking→"Truy vết", Audit→"Nhật ký", ETA→"Ngày dự kiến",
  Utilization→"Tỷ lệ sử dụng", bins→"ô", fill ratio→"mức lấp đầy", putaway→"xếp kệ", WO→"Lệnh SX", "Tổng WO"→"Tổng lệnh".
- **Thống nhất tên** (Thang đã chốt "Đề xuất vật tư" = "Yêu cầu vật tư"): menu "Đề xuất vật tư", tab engineering "Yêu cầu mua", back-link
  "Yêu cầu mua hàng", tiêu đề "Đề xuất mua vật tư (YCVT/MRF)" → 1 tên "Đề xuất vật tư". "Bảng sản xuất (QC)" (menu) vs "Bảng điều hành sản xuất" (trang).
- zod errorMap tiếng Việt (193 thông báo "String must contain…") — 1 file `lib/zod-vi.ts` gắn global.

---

## 2. Lỗi theo trang

Cột "Ảnh" dùng tiền tố `desktop-`/`phone-` trong `dot6/shots/`.

### 2.1 Tổng quan `/`
| Lỗi | Ảnh | File | Sửa |
|---|---|---|---|
| Cầu vồng + gradient (xem X8) | desktop-home, phone-home-1 | components/dashboard/* | X8 |
| Ô "Số lượng dữ liệu hệ thống" ở 390px: 4 ô/hàng, chữ cắt "BOM", "LINH KIỆN 86", "LỆNH SX 2 / 1" rơi dọc | phone-home-1 | DashboardClient / thẻ đếm | `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`, nhãn trên – số dưới |
| KPI hero ở phone: nhãn gãy 4 dòng "LINH KIỆN THEO DÕI" | phone-home-1 | HeroOverviewCard.tsx | 1 cột ngang (icon-số-nhãn) hoặc grid-cols-1 |
| Hoạt động gần đây: "đăng nhập session", "hoàn tất lệnh **lệnh** sản xuất", "bắt đầu lệnh lệnh sản xuất", "created (orderType=NEW)", "Progress log: PROGRESS_REPORT" | desktop-home | RecentActivityCard.tsx:99-135 | nhãn động từ không lặp danh từ ("hoàn tất" + "lệnh sản xuất"); thêm entity `session`→"phiên"; ẩn notes kỹ thuật |
| Đăng nhập/đăng xuất chiếm hết 10 dòng hoạt động | desktop-home | API activity | lọc bỏ LOGIN/LOGOUT khỏi feed dashboard |

### 2.2 Bộ phận Thiết kế `/engineering` (BOM List / Yêu cầu SX / Yêu cầu mua)
| Lỗi | Ảnh | File | Sửa |
|---|---|---|---|
| Topbar "Trang chủ / engineering" | desktop-eng-* | lib/breadcrumb-items.ts | X6 |
| 3 tầng tiêu đề (hub "Thiết kế & Sản xuất" + "BOM List" + breadcrumb) | desktop-eng-bom | engineering/page.tsx:106-130 | X6 |
| BOM list: "TARGET QTYTRẠNG THÁI" dính; "1" sát pill; mã cắt không tooltip; 5 icon/dòng với nút xoá đỏ | desktop-eng-bom | components/bom/BomListTable.tsx:88,346,359 | X4; bỏ cột "Parent item" khi toàn "—" |
| Chip lọc "Đang dùng/Ngừng dùng" ≠ badge "Hoạt động" | desktop-eng-bom | BomListTable.tsx:88, BomCardGrid.tsx:300 | X2 |
| Phone: tên BOM cắt "Z000000…", badge gãy chồng dòng, chip lọc gãy 2 dòng | phone-eng-bom-1 | BomListTable | X4 dạng thẻ: mã + tên 2 dòng, badge nowrap; chip lọc cuộn ngang |
| Yêu cầu SX: KPI "Tổng WO 2" nhưng danh sách "Chưa có lệnh sản xuất nào" (bộ lọc mặc định "Đang hoạt động") | desktop-eng-wo | components/work-orders list (WO tab) | empty-state "Không có lệnh khớp bộ lọc — Xem tất cả" |
| PR: header nút tràn (trang 501px), tiêu đề gãy từng chữ, badge "Đã chuyển PO" gãy | phone-eng-pr-1 | components/engineering/PRTab.tsx:111-125 | X6 PageHeader; X2 badge nowrap |
| Operations = bản sao y hệt tab Yêu cầu SX, tiêu đề "chờ duyệt" nhưng hiện mọi trạng thái | desktop-operations | app/(app)/operations/page.tsx | lọc mặc định "Chờ duyệt"; tiêu đề đúng |

### 2.3 BOM workspace `/bom/[id]/grid`
| Lỗi | Ảnh | File | Sửa |
|---|---|---|---|
| Header phone chật (#2) | phone-bom-grid-1 | bom-workspace/BomWorkspaceTopbar.tsx:179-262 | `h-auto min-h-12 flex-wrap`; khối trái `min-w-0 flex-1`, mã `truncate`; bỏ tên trùng mã (hiện "Z0000002-565488-SL1 · Z0000002-565488 SL1") khi name≈code; < md: chỉ giữ Back + mã + badge + nút chính icon-only (`aria-label`) + "⋯" (Quét/Lịch sử/Đổi tên/Nhân bản/Xoá). Sau X1 `hidden sm:inline` tự đúng |
| Tab "Vật tư & Quy trình / Sản xuất / Lệnh SX / Mua sắm / Lịch sử" tràn phải không cuộn | phone-bom-grid-1 | component tab workspace | X6 HubTabs cuộn ngang |
| Sheet tab "Material & Process" tiếng Anh; menu ⋮ chỉ hiện khi hover | desktop-bom-grid | bom/BomSheetTabs.tsx:217 | "Vật tư & Quy trình"; X7 hover:none |
| Toolbar chips bóp (#3) | phone-bom-grid-1 | bom-grid-pro/BomGridPro.tsx:~919-975 | `h-auto flex-wrap gap-2 py-2`; ẩn "Tổng SL = SL/bộ × parent" < md (đưa vào tooltip của chip); "Số lượng parent" → "SL thành phẩm" |
| Bảng bị bóp cột trên phone (#3) | phone-bom-grid-1 | BomGridPro.tsx:~1034 `table-fixed w-full` | `style={{minWidth: sumColWidths}}`, cột # + mã sticky trái; hoặc dạng thẻ riêng < md (BomLineSheet đã có để sửa dòng) |
| PIC cắt (#4) | desktop-bom-grid | BomGridPro.tsx:733-760, col 1045 | pill `max-w-full`, span tên `truncate`, hiển thị **tên ngắn** (phần trước " — "), bộ phận vào `title`; cột 110→140px |
| Header cột tiếng Anh IMAGE/ID NUMBER/QUANTITY/CATEGORY (cố ý khớp Excel?) + 10px | desktop-bom-grid | BomGridPro.tsx:1052+ | hỏi Thang: giữ song ngữ "SL/bộ (Quantity)"; tăng 11→12px |
| Cột Tiến độ: thanh vàng nhạt cho "Chưa mua" 0% (màu cảnh báo cho trạng thái trung tính) | desktop-bom-grid | bom-grid-pro/ProgressCell.tsx | 0% = thanh zinc; amber chỉ khi trễ |
| Header "Kích hoạt BOM" emerald đặc — màu thành công dùng làm nút | desktop-bom-grid | Topbar:251 | nút chính indigo (brand) |

### 2.4 Đề xuất vật tư chi tiết `/procurement/purchase-requests/[id]`
| Lỗi | Ảnh | File | Sửa |
|---|---|---|---|
| Topbar "procurement / purchase-requests / Chi tiết" | desktop-pr-detail | breadcrumb-items.ts | X6 (+ nhãn = số phiếu) |
| Phone: logo/tên xưởng đè tên công ty; "Số phiếu" badge tràn (#15) | phone-pr-detail-1 | components/procurement/DnvtDetailBody.tsx | header `grid-cols-1 md:grid-cols-[auto_1fr_auto]` |
| "Duyệt" cạnh "Xoá phiếu" đỏ cùng hàng; phone 5 nút 2 hàng | desktop/phone-pr-detail | purchase-requests/[id]/page.tsx | Xoá vào menu "⋯"; In/Excel/PDF gộp "Xuất ▾" |
| `window.confirm` xuất kho / đóng phiếu | — | page.tsx:504,527 | X5 |
| Back-link "Yêu cầu mua hàng" ≠ menu "Đề xuất vật tư" | desktop-pr-detail | page.tsx | X9 |

### 2.5 Đơn đặt hàng `/sales?tab=po`, chi tiết PO
| Lỗi | Ảnh | File | Sửa |
|---|---|---|---|
| Header cột "TỔNG (VND)DUYỆT" dính; badge duyệt dính số "0Đã duyệt" | desktop-sales-po | components/procurement/POListTable.tsx:50-71 | X4 (gộp 2 trạng thái thành 1 cột có 2 dòng hoặc cột riêng có padding) |
| Tổng 0 ₫ mọi PO (dữ liệu test?) — kiểm tra lại | desktop-sales-po | — | xác minh dữ liệu, không sửa UI |
| Phone: trang tràn 461px do HubTabs (#5); "Xuất Excel"/"Tạo PO" gãy | phone-sales-po-1 | HubTabsNav, header POTab | X6 |
| 8 chip lọc trạng thái gãy 4 dòng trên phone | phone-sales-po-1 | POTab filter | chip cuộn ngang 1 dòng |
| Chi tiết PO: "PO đã RECEIVED — không còn action approval", tab "Audit", người duyệt hiện UUID "af584041…" | desktop-po-detail | components/procurement/PoApprovalWorkflow.tsx | X2 nhãn; join tên người dùng |
| Chi tiết PO: KPI "ETA —" | desktop-po-detail | PO detail header | "Ngày dự kiến" |

### 2.6 Tài chính (tab TC trong /sales)
| Lỗi | Ảnh | File | Sửa |
|---|---|---|---|
| 6 thẻ KPI 6 màu, số lặp 2 lần ("0 ₫" + "0 ₫") | desktop-fin-overview | components/finance Overview | X8 StatCard trung tính; dòng phụ = so sánh kỳ trước hoặc bỏ |
| Sổ quỹ: số tiền `font-mono` 11px nhạt; tổng "+0 ₫ / −0 ₫" | desktop-fin-cashbook | finance Cashbook | X3 tiền font thường tabular-nums 13–14px; giữ mẫu tốt: canh phải + gạch phiếu huỷ + hàng tổng |
| "Đã huỷ" màu đỏ (nên xám) | desktop/phone-fin-cashbook | — | X2 |
| Tab con (Thu chi/Hoá đơn/Thanh toán) + breadcrumb "Trang chủ / Bộ phận Thu mua / Tài chính: Thu chi" — kế toán phải đi qua "Bộ phận Thu mua" | desktop-fin-* | sales/page.tsx | (đã ghi UI-25) đề xuất Thang: tách menu "Tài chính" hoặc đổi tên hub "Thu mua & Tài chính" — **cần chốt** |
| Select "Tất cả danh mục/nguồn" cắt chân chữ | desktop-fin-cashbook | finance filter bar | X7 |

### 2.7 Kho `/warehouse`
| Lỗi | Ảnh | File | Sửa |
|---|---|---|---|
| Sơ đồ kho gradient + chú giải lệch màu + nhãn tầng cắt "NG 3" (#13) | desktop-wh-layout | components/warehouse/WarehouseLayoutTab.tsx | X8; cột nhãn tầng `sticky left-0` rộng đủ |
| Vật tư: "Active", "UOM", "SKU"; ô tồn "0 PCS / Tổng: 0" 10px; phone ẩn tồn kho (#9) | desktop/phone-wh-items | components/items/ItemListTable.tsx:353 | X2, X4 (tồn = cột `primary` trên phone) |
| Nhập kho: "PO status SENT", "Chỉ PO trạng thái SENT hoặc PARTIAL…" | desktop-wh-mv-in | components/warehouse/ReceivingMovementView.tsx | X2 |
| Phone: segmented "Nhập kho/Xuất kho/Chờ QC" gãy 2 dòng; KPI 4 thẻ màu gãy chữ | phone-wh-mv-in-1 | ReceivingMovementView / MovementTab | `whitespace-nowrap`, KPI 2×2 dạng gọn hoặc 1 hàng cuộn |
| Phiếu xuất kho: empty-state kiểu khung đứt (khác các trang) | desktop-wh-gi | GoodsIssuesTab.tsx | `ui/empty-state` chuẩn |
| Báo cáo kho: "Utilization theo kệ", "bins", "fill ratio", "low_threshold", "default_bin_id", "putaway"; chữ trong thanh bar gần như vô hình; "STAGING-00" gãy; "11 / 0" | desktop-wh-report | components/warehouse Report tab | X9; nhãn % ra ngoài thanh; "1 bins"→"1 ô" |
| Tab kho trên phone bị che (không dấu hiệu cuộn) | phone-wh-* | WarehouseTabsNav.tsx (đã overflow-x-auto) | thêm mép mờ + scrollIntoView |

### 2.8 Bảng sản xuất `/production-board`
| Lỗi | Ảnh | File | Sửa |
|---|---|---|---|
| Hạn đỏ cả dòng đã giao/hoàn thành (#7) | desktop-production-board | production-board/page.tsx:374 | `deadlineTone(deadline, status)` → trung tính khi status ∈ {Hoàn thành, Đã giao} |
| Phone chỉ 2 cột (#8) | phone-production-board-1 | page.tsx | X4 dạng thẻ: mã+SP / StatusBadge / Hạn / Đạt/KH thanh tiến độ |
| Chữ 10–11px, mã mono nặng; nút xoá đỏ mỗi dòng | desktop-production-board | page.tsx:297 | X7; xoá vào menu + X5 |
| ĐVT "Pcs/SET/Set" lẫn lộn | desktop-production-board | — | X3 `formatQty` |
| Dropdown trạng thái màu cam/xanh/lục khác StatusBadge | desktop-production-board | page.tsx | X2 domain `board` |

### 2.9 Quản trị `/admin/*`
| Lỗi | Ảnh | File | Sửa |
|---|---|---|---|
| Lỗi API → "Chưa có người dùng nào — Tạo user đầu tiên" (#1) | desktop-admin-users (lần 1) | app/(app)/admin/users/page.tsx + hooks/useAdmin.ts | X4 error state; KHÔNG hiện CTA "tạo đầu tiên" khi lỗi |
| "Active/Disabled" | desktop-admin-users | admin/users/page.tsx:320, users/[id]/page.tsx:230 | X2 |
| Tổng quan phone: "AUDIT EVENTS 24H", "RATE-LIMIT HITS 24H", "CANCEL/CREATE/LOGIN", "14 loại action"; ô sức khoẻ cắt "Cơ sở…", "Re…", "BullM…", "Backu…" | phone-admin-1 | app/(app)/admin/page.tsx | X9; lưới 1 cột < md; tên dịch vụ đầy đủ |
| Nhật ký: giờ UTC `03:52:19 27/09/26`; cột USER/ACTION/ENTITY/ENTITY ID; mã hành động thô | desktop-admin-audit | app/(app)/admin/audit/page.tsx | X3 `formatDateTimeVN`; X2 `ACTION_LABELS` |
| Khung trang admin khác các trang (container hẹp, nền gradient) | desktop-admin-* | admin layout | X6 |

### 2.10 Khác
| Lỗi | Ảnh | File | Sửa |
|---|---|---|---|
| Thông báo: chip mã thô `PR_PENDING_REMINDER`, `ISSUE_REQUEST_APPROVED`; "Đã xuất 3 qty"; nhắc duyệt trùng 4 lần cùng phiếu; nút "Đánh dấu tất cả đã đọc" gãy 2 dòng | phone-notifications-1 | app/(app)/notifications/page.tsx:266 | X2 `NOTIF_TYPE_LABELS`; gộp nhắc cùng đối tượng ("4 lần nhắc"); nút icon + nhãn ngắn trên phone |
| Chi tiết vật tư: breadcrumb "Dashboard"; tab "Tracking" tràn (trang 432px); badge "Đang dùng" gãy | phone-item-detail-1 | app/(app)/items/[id]/page.tsx:111,248 | X6/X9; TabsList `overflow-x-auto` |
| Chi tiết NCC: trang tràn 418px | phone-supplier-detail-1 | app/(app)/suppliers/[id]/page.tsx | tab/tiêu đề cuộn/wrap (cùng mẫu) |
| Ô ngày native (locale máy) | nhiều | — | P3: chỉ đặt `lang="vi"` (đã có) — không làm DatePicker riêng (YAGNI) |

---

## 3. Thứ tự làm — 3 đợt commit

### Đợt 6A — Nền tảng + chữa cháy mobile (1 commit lớn hoặc 3 nhỏ; rủi ro thấp)
1. X1 đổi `sm` → 640 (+ soát 59 file, chụp lại bằng `shoot.cjs`).
2. X6 phần nhỏ: `HubTabsNav` cuộn ngang; TabsList chi tiết vật tư/NCC; `SEGMENT_LABELS` đầy đủ; `PageHeader` flex-wrap áp cho PRTab, POTab, items, sổ quỹ.
3. BOM workspace: Topbar (#2), toolbar + min-width bảng (#3), PIC (#4), tab workspace cuộn.
4. `StatusBadge` nowrap (#10), `deadlineTone` theo trạng thái (#7), header phiếu PR in (#15), select cắt chữ.
5. **Nghiệm thu:** chạy `shoot.cjs` lại, `scrollWidth ≤ 390` cho mọi trang (hiện fail: eng-pr 501, sales-* 461, item-detail 432, supplier-detail 418).

### Đợt 6B — Chuẩn dữ liệu hiển thị (trung bình)
1. X2 `lib/status.ts` + `ui/status-badge.tsx`; chuyển BOM, Vật tư, PR, PO, WO, Bảng SX, Kho nhập, user, audit, thông báo, dashboard activity.
2. X3 `lib/format.ts` mở rộng; thay tiền mono, giờ UTC ở audit, ĐVT.
3. X5 `ui/confirm-dialog` + `useConfirm/usePrompt`; thay 22 call site (ưu tiên WorkOrderActions, IssueMovementView, DeliveryNotesTab, BomWorkspaceTopbar).
4. X9 tiếng Việt hoá chuỗi hiện trên màn chính + zod errorMap vi.

### Đợt 6C — DataTable + tiết chế màu (lớn nhất, chia theo trang)
1. X4 `ui/data-table` (loading/empty/error+Thử lại, sticky header, canh số, hàng tổng, dạng thẻ mobile, menu hành động).
2. Chuyển lần lượt: admin/users (lỗi #1 nguy hiểm nhất) → ItemListTable → production-board → BomListTable → POListTable → PRTab → goods-issues/delivery-notes → audit.
3. Rà các tab còn `data ?? []` không nhánh lỗi (UI-05 ~15 tab) — kể cả tab chưa chuyển DataTable: thêm `<QueryError onRetry>`.
4. X8 dashboard + KPI StatCard trung tính + sơ đồ kho đơn sắc.
5. X7 chữ ≥12px & vùng chạm ≥36px cho màn xưởng (production-board, BOM grid, sơ đồ kho, nhập/xuất kho).

---

## 4. Rủi ro & lưu ý
- **Đổi `sm`**: mọi `sm:` trong khoảng 375–639px sẽ về bố cục mobile → vài form 2 cột thành 1 cột (đúng ý), nhưng dialog có
  `sm:max-w-*` sẽ full-width trên phone — kiểm lại dialog đợt 0 (UI-01). Cần chụp lại toàn bộ trước merge.
- **DataTable dùng tanstack**: chuyển bảng có virtual scroll (ItemListTable 863 dòng, BOM grid) dễ vỡ chọn nhiều/bulk action → chuyển từng bảng, giữ API props cũ; **không** chuyển BomGridPro sang DataTable trong đợt này (1.401 dòng, logic riêng) — chỉ vá layout.
- **status.ts**: đổi nhãn có thể làm hỏng test E2E dựa trên text ("Active", "Đang dùng") → grep `tests/` và cập nhật selector.
- **Tên menu/thuật ngữ** (Tài chính tách khỏi Thu mua; header cột BOM tiếng Anh khớp Excel) → **cần Thang chốt** trước 6B.
- **confirm → dialog async**: handler đổi sang async; chú ý các chỗ gọi trong `onClick` đồng bộ trả về giá trị, và double-submit (dùng `loading`).
- Cleanup agent đang xoá code mồ côi song song → rebase trước khi làm; không sửa file trong danh sách mồ côi AUDIT §9.
- Rate-limit burst (429) có thể gặp khi người dùng mở nhiều tab nhanh; UI phải hiển thị lỗi rõ thay vì "trống" — không nới rate-limit trong đợt UI.
- Dark mode (26 component thiếu màu tối, UI-30) ngoài phạm vi; mọi component mới vẫn khai báo `dark:`.
