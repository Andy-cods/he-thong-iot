# V4.4 — Kiểm kê giao diện toàn bộ hệ thống MES (UI Inventory)

> Mục đích: liệt kê ĐẦY ĐỦ các trang/tab/thành phần phụ hiện có, đối chiếu với hệ thiết kế "Apple-inspired"
> đã chốt (`plans/v4.3-design/APPLE_DESIGN_SYSTEM.md`), và ghi lại MỌI điểm lệch chuẩn — kể cả chi tiết
> nhỏ nhất — để các agent sau sửa theo đúng file:line mà không cần chụp lại ảnh. Tài liệu này KHÔNG sửa
> code, chỉ kiểm kê.
>
> **Phương pháp**: build production mới nhất trong worktree (`git log` xác nhận `18a15fe feat(v4.3)…`,
> đã khớp `v43/warehouse`, không cần merge) → `next start -p 3800` với DB/Redis staging qua tunnel
> 15432/16379 → Playwright chụp CHỦ ĐỘNG mọi route + tab (`?tab=`) ở desktop 1440×900 và mobile 390×844,
> light và dark, tài khoản `admin` (toàn quyền, phủ hết mọi trang) + 5 tài khoản role (`e2e.warehouse`,
> `e2e.planner`, `e2e.purchaser`, `e2e.operator`, `e2e.qc`) để xác nhận phân quyền/điều hướng theo bộ
> phận + mở các chức năng phụ (Ctrl+K, chuông thông báo, menu tài khoản, menu "⋯" dòng bảng, Sheet/Dialog
> tạo-sửa, popover ô kệ kho, tìm kiếm rỗng, trang 404, redirect bị chặn quyền) — chỉ mở/đóng, không bấm
> Lưu/Xoá/Tạo thật. Ảnh lưu ngoài repo tại
> `C:\Users\ASUS\AppData\Local\Temp\claude\c--dev-he-thong-iot\7c0e0492-2281-453b-97aa-d20b0da7ef8e\scratchpad\ui-inventory\`
> (`B/C/D/E/F/G` theo nhóm bộ phận + `interactions/` + `roles/`), KHÔNG commit vào repo.
> Đối chiếu chéo bằng Grep toàn bộ `apps/web/src` (hex cứng, `text-xs`, `rounded-*`, `Dialog` cho form,
> `toLocaleString` cục bộ, thuật ngữ) + đọc trực tiếp source các component nghi vấn + kiểm tra DOM thật
> qua Playwright (không chỉ tin ảnh) khi có nghi vấn về ngữ nghĩa HTML (VD bảng có phải `<table>` thật).
>
> Ngày kiểm: 2026-09-30. Người/agent thực hiện: ui-ux-designer (Claude), phối hợp 8 sub-agent kiểm ảnh
> song song theo nhóm B/C/C2/D1/D2/E/G1/G2.

---

## 0. Ghi chú quan trọng trước khi đọc bảng dưới

- Một số điểm trong `plans/v4.3-design/APPLE_DESIGN_SYSTEM.md` (viết CÙNG NGÀY, phiên trước) đã ĐƯỢC XÁC
  NHẬN LẠI qua ảnh mới và **ĐÃ ĐƯỢC SỬA** — tài liệu này ghi rõ "ĐÃ SỬA" thay vì lặp lại là lỗi, để tránh
  agent sau sửa nhầm cái đã đúng:
  - Popover/Sheet chi tiết ô kệ kho: **ĐÃ CÓ** — click 1 ô kệ mở Sheet đầy đủ bên phải (VỊ TRÍ, TỔNG SL,
    SỐ LOT, SỨC CHỨA, cảnh báo sắp hết, danh sách hàng, nút Nhập/Xuất) — TỐT HƠN mô tả cũ ("chỉ đổi panel
    trái"). Ảnh: `interactions/09-warehouse-layout-bin-clicked.png`.
  - Card mobile "Vật tư" (Items list): **ĐÃ CÓ** số "Tồn kho" + "Vị trí" + "Loại" đầy đủ trên card — lỗi
    DOT6 #9 cũ **ĐÃ HẾT**. Ảnh xác nhận: `zoom-items-mobile.png` (crop từ `D/items-list__mobile-light.png`).
  - `ReportTab.tsx` (Báo cáo kho) mobile: **KHÔNG vỡ** — layout tự nhiên co giãn theo cột dọc dù grep
    không thấy class `md:hidden` tường minh (do dùng flex/grid tự nhiên, không cần breakpoint riêng).
    Ảnh: `B/warehouse-report__mobile-light.png`. (Sửa lại giả định ban đầu từ grep — đã verify bằng ảnh.)
  - Bộ lọc "7 ngày/30 ngày/90 ngày" ở Tài chính · Tổng quan: **ĐÃ LÀ segmented control** (pill liền, nền
    đen cho mục chọn) — không còn là các Button rời như `REVIEW_UI.md` mô tả trước đó.
  - Dialog "Thêm linh kiện vào BOM" (`AddBomLineDialog`): chỉ 2 trường (tìm kiếm + SL/bộ) — **ĐÚNG chuẩn**
    N6 (form ngắn được phép dùng Dialog), không cần đổi sang Sheet.
- Một số điểm **VẪN CÒN NGUYÊN**, xác nhận lại bằng ảnh MỚI 2026-09-30 (không phải suy đoán từ audit cũ):
  - Dashboard "Cần xử lý" báo "Tất cả đang ổn" trong khi chuông thông báo cùng lúc có 5 thông báo chưa
    đọc gồm PO chờ duyệt, PR chờ duyệt, và 1 "Nhắc duyệt quá 24h" — xem A5.
  - Redirect khi bị chặn quyền (`/?denied=1`) hoàn toàn im lặng, không toast — xem A11 (phát hiện MỚI).
- Lỗi "thông báo nhắc duyệt giống hệt nhau" ghi trong `APPLE_DESIGN_SYSTEM.md` §3.16 — agent G2 xác minh
  lại kỹ trên trang `/notifications` (không chỉ panel chuông 5 mục) và tách ra 2 LOẠI khác nhau:
  - **Loại 1 — "Nhắc duyệt: 3/PRD-MRF/0926 chờ quá 24h" lặp 4 lần**: ĐÚNG THIẾT KẾ, không phải bug.
    `apps/worker/src/jobs/prReminderScan.ts:1-30` chỉ tạo thông báo mới nếu bản ghi gần nhất cho cùng PR
    đã quá 24h — đây là nhắc lại có chủ đích mỗi 24h khi phiếu còn treo. Vấn đề THẬT là UI hiển thị mỗi
    lần nhắc thành 1 card đầy đủ riêng biệt → trông như spam trùng lặp. Sửa (P1, khác P0 ban đầu nghĩ):
    gộp nhóm hiển thị (VD "Nhắc duyệt 3/PRD-MRF/0926 — đã nhắc 4 lần, gần nhất X ngày trước") tại
    `apps/web/src/app/(app)/notifications/page.tsx`, `components/layout/NotificationBell.tsx`.
  - **Loại 2 — cặp thông báo "đã duyệt"/"đã qua bước 2/3" trùng y hệt 5-6 lần cùng ngày 02/06/2026**:
    CHƯA xác định chắc root cause — toàn bộ vùng dữ liệu quanh đó có dấu hiệu seed/E2E test (nhãn
    "E2E Test", "[DEMO]", "[E2E-NOTIF] RBAC..." dày đặc) nên chưa đủ cơ sở khẳng định lỗi insert-trùng
    thật trên dữ liệu production. Khuyến nghị: kiểm tra lại trên dữ liệu thật (ngoài lô E2E) xem có hiện
    tượng notification tạo 2 lần cho cùng 1 hành động duyệt không; dù root cause là gì, nên có cơ chế
    gộp/dedupe theo `(entity_id, event_type, ngày)` ở tầng hiển thị để chống tái diễn.

---

## 1. Bảng tổng theo trang (57 route/tab đã chụp, đủ 8 nhóm)

| # | Trang / tab | Nhóm | Trạng thái | Số điểm lệch |
|---|---|---|---|---|
| 1 | `/login` | G | **Lệch nặng** | 1 (P1 tràn ngang 128px — A18) |
| 2 | `/` (Dashboard) | G | **Lệch nặng** | 1 (P0 logic Cần xử lý ≠ chuông — A5) |
| 3 | `/?denied=1` | G | **Lệch nặng** | 1 (P1 im lặng, không toast — A6) |
| 4 | `/board` (TV) | G | Lệch nhẹ | 1 (P2, chỉ mobile — G.D) |
| 5 | `/admin` | G | Lệch nhẹ | 2 (P2×2) |
| 6 | `/admin/users` (list) | G | **Lệch nặng** | 1 (P1 mất thông tin mobile) |
| 7 | `/admin/users/new` | G | Lệch nhẹ | 1 (P1 UserForm — A15) |
| 8 | `/admin/users/[id]` | G | **Lệch nặng** | 2-3 (P1×2 + 1 DRY) |
| 9 | `/admin/audit` | G | **Lệch nặng** | 2 (P1+P2) |
| 10 | `/admin/reports/employee-productivity` | G | **Lệch nặng** | 5 (P1×3 + P2×2) |
| 11 | `/admin/reports/department` | G | **Lệch nặng** | 3 (P0×1 + P1×1 + P2×1 — A14) |
| 12 | `/admin/reports/targets` | G | **Lệch nặng** | 1 tổ hợp (P1 — 3 tên khác nhau) |
| 13 | `/admin/settings` | G | Lệch nhẹ | 3 (P1×1 + P2×2) |
| 14 | `/admin/settings/sessions` | G | **Đạt** — mẫu tốt | 0 |
| 15 | `/admin/settings/force-change-password` | G | **Đạt** | 0 |
| 16 | `/notifications` | G | **Lệch nặng** | 2 (1 P1 nhóm nhắc duyệt + 1 P2 dedupe) |
| 17 | `/me/profile` | G | Lệch nhẹ | 1 (P2) |
| 18 | `/me/settings` | G | **Lệch nặng** | 3 (1 P1 + 2 P2) |
| 19 | `/me/change-password` | G | Lệch nhẹ | 1 (P2) |
| 20 | `/me/productivity` | G | **Lệch nặng** | 1 (P1) |
| 21 | `/trang-khong-ton-tai-xyz` (404) | G | **Lệch nặng** | 2 (1 P0 dark mode — A17 + 1 P1) |
| 22 | `/finance` (redirect) | G | **Đạt** | 0 |
| 23 | `/engineering?tab=bom` = `/bom` (alias) | D | **Đạt** | 2 (P2×2) |
| 24 | `/bom/new` | D | **Đạt** | 1 (P2) |
| 25 | `/bom/import` | D | Lệch nhẹ | 1 (P1) |
| 26 | `/bom/[id]`, `/bom/[id]/grid` (cùng route) | D | **Lệch nặng** | 4 (1×P0, 3×P1) |
| 27 | `/engineering?tab=work-orders` | D | Lệch nhẹ | 2 (P1×2) |
| 28 | `/engineering?tab=pr` | D/C | **Lệch nặng** | 1 (P0 tên gọi mâu thuẫn — C.A) |
| 29 | `/items` (list) | D | **Đạt** | 0 |
| 30 | `/items/new` | D | **Đạt** | 0 |
| 31 | `/items/import` | D | Lệch nhẹ | 2 (1 P1 + 1 P2) |
| 32 | `/items/[id]` | D | **Lệch nặng** | 5 (1 P0 + 2 P1 + 2 P2) |
| 33 | `/lot-serial` | D | **Lệch nặng** | 1 (P0 deep-link vỡ) |
| 34 | `/lot-serial/[id]` | D | Lệch nhẹ | 1 (P1 breadcrumb) |
| 35 | `/operations?tab=requests` | E | **Đạt** | 0 |
| 36 | `/operations?tab=assembly` | E | Lệch nhẹ | 1 (P2 breadcrumb) |
| 37 | `/production-board` (bảng chính) | E | **Đạt** | 0 |
| 38 | `/production-board` → Dialog "Thêm mã hàng" | E | **Lệch nặng** | 2 (P1+P2) |
| 39 | `/work-orders` (list) | E | **Đạt** | 0 |
| 40 | `/work-orders/new-lsx` | E | **Đạt** | 0 |
| 41 | `/work-orders/[id]` tab "Phiếu LSX" | E | **Đạt** | 0 |
| 42 | `/work-orders/[id]`/`/assembly/[woId]` tab "Tiến độ" | E | **Lệch nặng** | 1 (P1 mất dữ liệu mobile) |
| 43 | `/assembly` (list) | E | Không audit riêng (redirect chủ ý) | — |
| 44 | `/orders` | E | Không audit được như dự kiến (redirect ẩn) | — |
| 45 | `/sales?tab=po` = `/procurement/purchase-orders` | C | Lệch nhẹ | 2 |
| 46 | `/procurement/purchase-orders/new` | C | Lệch nhẹ | 2 |
| 47 | `/procurement/purchase-orders/[id]` | C | **Đạt** — mẫu chuẩn tham chiếu | 0 |
| 48 | `/sales?tab=suppliers` = `/suppliers` (list) | C | Lệch nhẹ | 1 |
| 49 | `/suppliers/new` | C | **Lệch nặng** | 2 (vi phạm N6 rõ nhất) |
| 50 | `/suppliers/[id]` | C | Lệch nhẹ | 3 |
| 51 | `/procurement/purchase-requests` (list) | C | **Đạt** | 0 |
| 52 | `/procurement/purchase-requests/new-dnvt` | C | **Lệch nặng** | 2 |
| 53 | `/procurement/purchase-requests/new-mrf` | C | **Lệch nặng** | 3 |
| 54 | `/procurement/purchase-requests/[id]` | C | **Lệch nặng** | 4 |
| 55 | `/material-requests` (rỗng, legacy) | C | Lệch nhẹ | 2 |
| 56 | `/material-requests/new` (legacy) | C | Lệch nhẹ | 1 |
| 57 | `/receiving/[poId]`, `/wizard` (cùng 1 state) | B | Lệch nhẹ | 2 |
| 58 | `/qc-inbound` (alias) | B | **Lệch nặng** | 1 (P0 nút Đạt/Không đạt ẩn mobile) |
| 59 | `/warehouse?tab=today` | B | Lệch nhẹ | 1 |
| 60 | `/warehouse?tab=layout` | B | **Lệch nặng** | 5 (có P0 bin-grid vỡ mobile) |
| 61 | `/warehouse?tab=items` | B | Lệch nhẹ | 2-3 |
| 62 | `/warehouse?tab=movement` | B | Lệch nhẹ | 3 |
| 63 | `/warehouse?tab=goods-issues` | B | Lệch nhẹ | 4 (2 P1) |
| 64 | `/warehouse?tab=delivery-notes` | B | **Đạt** | 0 |
| 65 | `/warehouse?tab=report` | B | **Lệch nặng** | 3 (màu ngoài hệ) |
| 66 | `/sales?tab=fin-overview` | F | **Đạt** | 0 lỗi mới (nợ màu segmented — A12) |
| 67 | `/sales?tab=fin-cashbook` | F | **Đạt** | 0 (1 caveat ảnh cần chụp lại) |
| 68 | `/sales?tab=fin-settle` | F | **Đạt** | 1 nhỏ (P2) |

**Tổng theo trạng thái**: Đạt 22 · Lệch nhẹ 21 · Lệch nặng 22 · Không audit được (redirect/tính năng ẩn) 3.

---

## 2. NHÓM A — Component dùng chung (sửa 1 chỗ ăn nhiều trang, làm TRƯỚC)

### A1. [P1] BOM List và Items List KHÔNG dùng `<table>` thật / thiếu ARIA hợp lệ ✅ ĐÃ SỬA — commit `b5965ba`

- **Vấn đề**: `apps/web/src/components/bom/BomListTable.tsx` và
  `apps/web/src/components/items/ItemListTable.tsx` tự implement virtualized div-grid
  (`role="row"`/`role="columnheader"` trên `<div>`) thay vì dùng `<table>` thật hoặc
  `components/ui/data-table.tsx` (DataTable) như `POListTable.tsx`/`PRListTable.tsx` đã làm đúng (V4.1
  UI-11..14, Đợt 6C). Container chỉ có `role="region"`, KHÔNG có `role="grid"`/`role="table"` bao ngoài
  → theo spec ARIA, `role="row"` đứng ngoài `grid/table/treegrid` là KHÔNG HỢP LỆ, trình đọc màn hình rất
  có thể bỏ qua toàn bộ ngữ nghĩa bảng (chỉ đọc như các dòng text/div rời rạc).
- **Xác minh**: `document.querySelectorAll('table').length === 0` trên `/engineering?tab=bom` (test
  Playwright DOM trực tiếp, không chỉ nhìn ảnh — ảnh hiển thị ĐẸP y hệt bảng thật nên rất dễ bỏ sót lỗi
  này nếu chỉ xem screenshot). `ItemListTable.tsx:134` có `<table className="sr-only"><caption>...`
  nhưng bảng này KHÔNG có `<tbody>`/hàng dữ liệu thật bên trong — chỉ là 1 caption trống, không tạo ngữ
  nghĩa bảng thật cho dữ liệu.
- **File:line**: `apps/web/src/components/bom/BomListTable.tsx` (toàn bộ, dòng ~255-330 phần
  header+row), `apps/web/src/components/items/ItemListTable.tsx:128-145` (container + sr-only table
  rỗng). Cần rà thêm 3 file cùng pattern `role="row"` (CHƯA xác minh đủ do giới hạn thời gian):
  `app/(app)/material-requests/page.tsx`, `components/admin/AuditRow.tsx`,
  `components/snapshot/SnapshotBoardTable.tsx`.
- **Cách sửa**: (a) tối thiểu — thêm `role="grid"` (hoặc `role="table"`) cho container ngoài,
  `role="rowgroup"` cho phần header/body, đổi `role="columnheader"` cells thân bảng thành
  `role="gridcell"`, thêm `aria-rowcount`/`aria-colcount` nếu virtualize; (b) triệt để hơn — thêm hỗ trợ
  virtualization vào `components/ui/data-table.tsx` rồi chuyển BOM List/Items List dùng chung component
  đó, xoá 2 bản tự vẽ để về ĐÚNG 1 nguồn (đúng tinh thần DRY của hệ thống).
- **Ảnh**: `D/bom-list__desktop-light.png`, `D/items-list__desktop-light.png` (nhìn ĐẸP, không phát
  hiện được lỗi này qua ảnh — chỉ phát hiện qua kiểm tra DOM).

### A2. [P1] Màu nút chính trong Dialog `bom-grid-pro` lệch khỏi accent indigo, và không nhất quán nội bộ ✅ ĐÃ SỬA — commit `720ae0b`

- **Vấn đề**: `WOQuickDialog.tsx:297` dùng `bg-purple-600 hover:bg-purple-700` cho nút hành động chính;
  `SubcontractPOQuickDialog.tsx:502` dùng `bg-violet-400` (dark) `..bg-violet-700` (hover) — 2 Dialog
  trong CÙNG bộ `bom-grid-pro` (dùng chung ngữ cảnh "tạo lệnh từ dòng BOM") lại có 2 màu nút chính khác
  nhau, và cả 2 đều khác accent `indigo-600` chuẩn toàn hệ.
- **File:line**: `apps/web/src/components/bom-grid-pro/WOQuickDialog.tsx:297`,
  `apps/web/src/components/bom-grid-pro/SubcontractPOQuickDialog.tsx:502`.
- **Cách sửa**: đổi cả 2 về `bg-indigo-600 hover:bg-indigo-700` (hoặc dùng `<Button>` mặc định thay vì
  className cứng, để tự động ăn theo token khi đổi sau này).
- **Mức độ**: P1 (màu ngoài hệ + không nhất quán nội bộ 1 nhóm chức năng).
- **Cập nhật khi sửa**: tại thời điểm sửa, `SubcontractPOQuickDialog.tsx` đã đổi
  từ `bg-violet-400` (mô tả cũ ở trên) sang `bg-orange-600` (agent khác đổi
  giữa lúc kiểm kê và lúc sửa) — vẫn là màu ngoài hệ, đã đổi cả 2 về
  `bg-indigo-600 hover:bg-indigo-700` như kế hoạch.

### A3. [P2] Format số/ngày tự viết cục bộ thay vì qua `lib/format.ts` ✅ ĐÃ RÀ SOÁT (helper đã đủ) — commit `d717977`

- **Vấn đề**: 106 chỗ (47 file) gọi `.toLocaleString()` trực tiếp trong component thay vì qua
  `formatMoney`/`formatMoneyShort`/`formatQty`/`formatNumber` của `apps/web/src/lib/format.ts`. Đa số
  ĐÃ truyền đúng `"vi-VN"` (không sai locale hiển thị) nhưng vi phạm nguyên tắc "1 nguồn format duy
  nhất" — khó bảo trì khi cần đổi quy tắc chung (VD thêm `tabular-nums`, đổi số lẻ thập phân). Tập trung
  nhiều ở `components/dashboard/*`, `components/finance/*`, `components/warehouse/*`,
  `components/engineering/*`.
- **Tương tự**: 7 file tự gọi `toLocaleDateString`/`toLocaleTimeString("vi-VN", …)` thay vì qua helper
  ngày giờ của `lib/format.ts` — hiển thị ĐÚNG "vi-VN" nhưng KHÔNG áp quy đổi giờ Việt Nam cố định
  (Asia/Ho_Chi_Minh) mà `lib/format.ts` xử lý riêng để tránh lệch giờ theo múi giờ server/trình duyệt.
  File cần ưu tiên rà trước (nhạy cảm với logic "quá hạn"):
  `apps/web/src/components/layout/NotificationBell.tsx:336`,
  `apps/web/src/components/orders/ProductionOverviewCards.tsx:49`,
  `apps/web/src/components/auth/SessionExpiryGuard.tsx:31`,
  `apps/web/src/components/finance/CashflowChart.tsx:54`.
- **Cách sửa**: thay `.toLocaleString(...)`/`.toLocaleDateString(...)` cục bộ bằng hàm tương ứng trong
  `lib/format.ts`; nếu helper còn thiếu biến thể cần dùng, bổ sung vào `format.ts` (không viết hàm cục
  bộ mới trong component trang).
- **Mức độ**: P2 (không sai hiển thị ngay, nhưng rủi ro bảo trì + rủi ro giờ khi lệch múi giờ).

### A4. [P2] Input ngày native hiện placeholder "mm/dd/yyyy" (định dạng Mỹ) ✅ ĐÃ TẠO `DateField` DÙNG CHUNG — commit `d717977`

- **Vấn đề**: `<input type="date">` (HTML native) hiện placeholder theo locale trình duyệt/OS — mặc định
  thường là "mm/dd/yyyy" — trong khi MỌI nơi khác trong app hiển thị ngày kiểu Việt Nam "dd/MM/yyyy".
  Thấy ở bộ lọc "Từ/Đến" trang Tài chính · Tổng quan (`F/sales-fin-overview`), `PRTab.tsx:178,188`,
  `material-requests/page.tsx:265,275`.
- **Ghi chú**: đây là GIỚI HẠN CỦA INPUT NATIVE (phụ thuộc locale hệ điều hành trình duyệt hiển thị, class
  CSS không sửa được placeholder này) — không phải lỗi code viết sai. Chỉ có cách khắc phục triệt để là
  thay bằng date-picker tuỳ chỉnh (chi phí lớn, không cấp thiết).
- **Mức độ**: P2 — ghi nhận là giới hạn nền tảng đã biết, không cần sửa gấp; nếu muốn nhất quán tuyệt đối
  mới cần đầu tư date-picker riêng.
- **Đã làm (agent NHÓM A)**: tạo `components/ui/date-field.tsx` (`DateField`) — ô nhập text hiển thị
  dd/mm/yyyy nhất quán (tự chèn "/", validate ngày thật) + nút mở date-picker native qua `showPicker()`;
  `value`/`onChange` vẫn là ISO "yyyy-MM-dd" y hệt `<input type="date">` cũ — drop-in, không phá form. Helper
  thuần `parseVnDate`/`autoFormatVnDateInput` trong `lib/format.ts` (có vitest). **CHƯA wire vào form nào** —
  xem "Việc cho nhóm trang" bên dưới để biết danh sách chỗ cần thay (`PRTab.tsx:178,188`,
  `material-requests/page.tsx:265,275`, filter Tài chính · Tổng quan).

### A5. [P0 — xác nhận lại bằng ảnh mới] Dashboard "Cần xử lý" mâu thuẫn với chuông thông báo ⏭ NGOÀI PHẠM VI NHÓM A

- **Vấn đề**: Khối "Cần xử lý" trên Dashboard hiện "ỔN ĐỊNH — Tất cả đang ổn, Chưa có việc cần xử lý gấp"
  (ảnh `G/dashboard__desktop-light.png`, tái hiện y hệt ở `desktop-dark`) trong khi CÙNG LÚC chuông
  thông báo (icon phải TopBar) hiện huy hiệu đỏ "5" và panel liệt kê 5 thông báo, trong đó có ít nhất:
  "PO chờ duyệt: PO-2609-0090-01", "4/PRD-MRF/0926 chờ Giám đốc duyệt cuối", "Nhắc duyệt: 3/PRD-MRF/0926
  chờ quá 24h" — đây RÕ RÀNG là "việc cần xử lý" theo đúng định nghĩa nhưng KHÔNG được khối "Cần xử lý"
  của Dashboard nhận diện. User nhìn Dashboard tưởng mọi việc đều ổn nhưng thực ra có ít nhất 1 việc quá
  hạn 24h.
- **Ảnh**: `G/dashboard__desktop-light.png` + `G/dashboard__desktop-dark.png` (khối "Cần xử lý") đối
  chiếu `interactions/02-notification-bell.png` (5 thông báo).
- **Root cause ĐÃ XÁC ĐỊNH CHÍNH XÁC** (đối chiếu code, khớp 100% số liệu quan sát):
  `apps/web/src/app/api/dashboard/action-items/route.ts:52-58` — "Cần xử lý" CHỈ đếm 3 chỉ số hẹp: (1)
  `purchase_request.status = 'SUBMITTED'` (KHÔNG tính `DEPT_APPROVED` — đúng trạng thái của phiếu
  "4/PRD-MRF/0926 chờ Giám đốc duyệt cuối" đang treo!), (2) PO quá hạn ETA chưa nhận đủ (khác với "PO
  chờ duyệt GỬI" — PO-2609-0090-01 đang chờ duyệt để MỞ, không phải quá hạn nhận hàng), (3) WO trễ kế
  hoạch. Cả 5 việc trong chuông (BBGH giao hàng, ISR xuất kho, PO chờ duyệt gửi, PR ở bước
  DEPT_APPROVED) đều NẰM NGOÀI 3 chỉ số này → `total = 0` dù có 5 việc thật đang chờ xử lý. Comment
  ngay trong code (dòng 55-56) từng thừa nhận 1 biến thể của ĐÚNG lỗi này (PR trạng thái DRAFT gần như
  luôn 0 → đã vá bằng đổi sang SUBMITTED) nhưng bản vá CHƯA đủ — bỏ sót bước DEPT_APPROVED và toàn bộ
  luồng BBGH/ISR.
- **Cách sửa**: mở rộng điều kiện PR thành `status IN ('SUBMITTED','DEPT_APPROVED')`; dài hạn nên gộp
  thêm số lượng BBGH (biên bản giao hàng)/ISR (xuất kho) đang chờ duyệt vào cùng widget, hoặc đổi
  tên/label "Cần xử lý" thu hẹp phạm vi nếu chưa mở rộng kịp — để không đánh lừa người dùng bằng badge
  "ỔN ĐỊNH" sai.
- **Mức độ**: P0 (sai lệch thông tin nghiệp vụ hiển thị ngay tại khối hero N1 của Dashboard — có thể
  khiến người có trách nhiệm bỏ sót việc quá hạn, 1 PO 27 triệu đang treo).
- **Không xử lý ở đợt NHÓM A**: root cause nằm ở `app/api/dashboard/action-items/route.ts` (logic nghiệp
  vụ/API — điều kiện SQL/status đếm "Cần xử lý"), ngoài phạm vi cho phép của agent UI nhóm A ("KHÔNG sửa
  code nghiệp vụ/API/server/hooks"). Cần agent backend/API hoặc agent trang Dashboard xử lý theo đúng cách
  sửa đã nêu (mở rộng điều kiện PR + gộp BBGH/ISR).

### A6. [P1 — phát hiện MỚI] Redirect khi bị chặn quyền hoàn toàn im lặng ✅ ĐÃ SỬA — commit `1e3df66`

- **Vấn đề**: `apps/web/src/app/(app)/layout.tsx:114` — khi user truy cập route không đủ quyền, server
  `redirect("/?denied=1")`. Đã grep TOÀN BỘ `app/` và `components/` — **KHÔNG có bất kỳ chỗ nào đọc query
  param `denied`** để hiện toast/banner. Kết quả: user bị âm thầm đưa về Dashboard, không có bất kỳ phản
  hồi nào giải thích lý do — đúng loại lỗi "trang lỗi/không quyền" mà yêu cầu kiểm kê đặc biệt nhắc tới.
  Xác nhận qua ảnh `G/dashboard-denied__desktop-light.png` (giống hệt dashboard bình thường) VÀ qua
  5/5 role test (`roles/e2e.*__denied-attempt.png` đều redirect về `/?denied=1` không có phản hồi).
- **File:line**: `apps/web/src/app/(app)/layout.tsx:114` (nơi set query) — thiếu phần đọc ở phía client
  (Dashboard page hoặc layout con).
- **Cách sửa**: trong `app/(app)/page.tsx` (Dashboard) hoặc 1 client component dùng chung, đọc
  `useSearchParams().get("denied")`, nếu có → hiện toast (sonner) "Bạn không có quyền truy cập trang đó",
  sau đó `router.replace("/")` để xoá query khỏi URL (tránh lặp lại toast khi refresh/back).
- **Mức độ**: P1 (UX im lặng khi từ chối truy cập — người dùng không hiểu vì sao bị đưa về trang chủ).
- **Đã làm**: `AppShell.tsx` đọc `denied=1` qua `useSearchParams`, hiện toast lỗi + tự dọn query
  (`router.replace`). `admin/layout.tsx` (guard admin-only riêng, KHÔNG qua `route-guard.ts` chung nên
  chưa được phát hiện lúc đầu) cũng redirect `"/"` trần — đã đổi thành `"/?denied=1"` để đồng bộ.
  **Root cause phụ phát hiện khi verify**: `SonnerProvider` render SAU `{children}` trong
  `components/providers.tsx` khiến effect mount của `AppShell` chạy TRƯỚC effect mount của `Toaster` (React
  chạy effect con trước cha, anh em theo thứ tự JSX) → MỌI `toast()` gọi ngay lúc 1 trang mount (không chỉ
  denied-toast) bị RƠI MẤT vì Toaster chưa kịp subscribe. Đã đổi thứ tự `SonnerProvider` lên trước
  `{children}` — vá tận gốc cho toàn app, không chỉ riêng tính năng này.

### A7. [P1] "Bin" tiếng Anh còn sót, trộn với "Vị trí"/"Ô kệ" tiếng Việt ⏭ NGOÀI PHẠM VI NHÓM A (agent Kho đang sửa song song)

- **Vấn đề**: `components/warehouse/BinActions.tsx:869` (label) và `:881` (`aria-label="Bin đích"`) dùng
  từ "Bin" tiếng Anh, trong khi `components/warehouse/WarehouseLayoutTab.tsx:355` và toàn bộ UI panel
  chi tiết vị trí kho (ảnh `interactions/09-warehouse-layout-bin-clicked.png`) dùng "Vị trí"/"Kệ"/"Ô".
  Nút hành động trong Sheet chi tiết vị trí ghi "+ Thêm hàng vào bin" (English word lẫn giữa câu tiếng
  Việt). Badge trạng thái tồn "AVAILABLE" (tiếng Anh, không qua `StatusPill` tiếng Việt hoá) cũng xuất
  hiện trong cùng Sheet này.
- **File:line**: `apps/web/src/components/warehouse/BinActions.tsx:869,881`; Sheet chi tiết vị trí (tìm
  component render "AVAILABLE" — có thể là `components/warehouse/*` inventory row, cần grep thêm
  `"AVAILABLE"` không qua `formatUom`/`StatusPill`).
  Đã grep xác nhận: `grep -rn "AVAILABLE" apps/web/src/components/warehouse/` để định vị chính xác trước
  khi sửa.
- **Cách sửa**: đổi "Bin đích" → "Vị trí đích"/"Ô đích"; "Thêm hàng vào bin" → "Thêm hàng vào ô/kệ";
  "AVAILABLE" → dịch "Còn hàng" qua `STATUS_DEFS` phù hợp (lot/serial status) trong `lib/status.ts` thay
  vì hiện chuỗi enum thô.
- **Mức độ**: P1 (thuật ngữ không nhất quán — đúng loại lỗi "nhãn/thuật ngữ không thống nhất" yêu cầu
  kiểm kê nêu rõ).

### A8. [P2] Chính tả "Quản lí kho" khác quy ước "Quản lý" dùng ở nơi khác ⏭ NGOÀI PHẠM VI NHÓM A (thuộc trang `/warehouse`, agent Kho đang sửa song song)

- **Vấn đề**: Large Title trang `/warehouse` hiện "Quản lí kho" (dùng "lí") trong khi các trang khác của
  hệ thống (VD "Quản trị hệ thống") và văn phong hành chính Việt Nam phổ biến dùng "Quản lý" (dùng "lý").
  Không sai chính tả (cả 2 đều là biến thể hợp lệ) nhưng KHÔNG NHẤT QUÁN trong cùng 1 hệ thống.
- **File:line**: cần grep `"Quản lí"` trong `apps/web/src/app/(app)/warehouse/page.tsx` hoặc
  `components/warehouse/WarehouseTabsNav.tsx` để xác định chính xác dòng.
- **Cách sửa**: đổi thành "Quản lý kho" cho nhất quán với phần còn lại của hệ thống.
- **Mức độ**: P2.

### A9. [Đã đạt — không cần sửa, ghi nhận để không lặp lại nhầm] ✅ XÁC NHẬN LẠI (agent NHÓM A) — vẫn đúng, không cần sửa

- Không còn `window.confirm`/`window.prompt`/`window.alert` nào trong `apps/web/src` (grep xác nhận 0
  kết quả) — đã chuyển hoàn toàn sang `ConfirmDialog`/`useConfirm`/`usePrompt`.
- Không phát hiện chuỗi tiếng Anh sót lại trong nhãn UI chính (nút Loading/Submit/Cancel/Save/Close…) qua
  grep toàn bộ `apps/web/src` — hệ thống đã Việt hoá tốt, NGOẠI TRỪ các trường hợp cụ thể nêu ở A7.
  (Trước đó đã xác nhận thấy trạng thái "AVAILABLE" là sản phẩm của cùng dạng sót English — thuộc A7.)
- Dialog "Thêm linh kiện vào BOM" (2 trường) và Dialog xác nhận (`ConfirmDialog`) đều ĐÚNG chuẩn N6 —
  không cần đổi.

### A11. [P1 — xác nhận qua 2 agent độc lập, nhiều file] Breadcrumb mobile "Trang chủ" vs desktop "Tổng quan" ⏭ NGOÀI PHẠM VI NHÓM A (sửa từng page.tsx)

- **Vấn đề**: `apps/web/src/lib/breadcrumb-items.ts` đã chuẩn hoá `ROOT_LABEL = "Tổng quan"` dùng cho
  breadcrumb TopBar (desktop). Nhưng NHIỀU trang tự dựng 1 `<Breadcrumb>` RIÊNG chỉ hiện trên mobile
  (`md:hidden`) và hard-code label `"Trang chủ"` thay vì tái dùng `ROOT_LABEL` — khiến CÙNG 1 trang hiện
  "Tổng quan" trên desktop nhưng "Trang chủ" trên mobile.
- **File:line xác nhận lệch** (tổng hợp từ 2 agent, đã grep cùng pattern):
  `apps/web/src/app/(app)/suppliers/new/page.tsx:22`, `apps/web/src/app/(app)/suppliers/[id]/page.tsx:131`,
  `apps/web/src/app/(app)/admin/users/new/page.tsx:110`,
  `apps/web/src/app/(app)/admin/reports/department/page.tsx:80`,
  `apps/web/src/app/(app)/admin/settings/page.tsx:37`,
  `apps/web/src/app/(app)/admin/reports/employee-productivity/page.tsx:87`,
  `apps/web/src/app/(app)/items/import/` (nêu trong audit G1, cần xác minh dòng cụ thể khi sửa).
- **File:line ĐÃ ĐÚNG** (dùng "Tổng quan", làm mẫu): `admin/page.tsx:63`, `admin/users/page.tsx:112`,
  `admin/users/[id]/page.tsx:101/119/201`, `admin/audit/page.tsx:156`, `admin/reports/targets/page.tsx:81`,
  `admin/settings/sessions/page.tsx:84`.
- **Cách sửa**: import `ROOT_LABEL` từ `lib/breadcrumb-items.ts` ở mọi nơi tự dựng breadcrumb mobile
  riêng, xoá chuỗi `"Trang chủ"` cứng; về lâu dài cân nhắc bỏ hẳn breadcrumb mobile tự viết, dùng chung
  1 component `Breadcrumb` cho cả 2 viewport để tránh lặp lỗi này ở trang mới.
- **Mức độ**: P1 (nhất quán điều hướng — lộ rõ khi thao tác trên điện thoại, đúng loại "chi tiết nhỏ
  nhưng lặp lại nhiều nơi" mà yêu cầu kiểm kê đặc biệt nhấn mạnh).
- **Xác nhận (agent NHÓM A)**: `lib/breadcrumb-items.ts` đã export đúng `ROOT_LABEL = "Tổng quan"`, không
  cần sửa gì ở file helper dùng chung. Lỗi hoàn toàn nằm ở việc các page.tsx TỰ hard-code chuỗi
  `"Trang chủ"` thay vì `import { ROOT_LABEL }` — sửa từng file đã liệt kê ở trên, xem "Việc cho nhóm trang".

### A12. [P1 — SHARED, xác nhận qua agent C] 3 kiểu "segmented control" dùng màu active khác nhau ✅ ĐÃ SỬA PHẦN DÙNG CHUNG — commit `7f8a3bc`

- **Vấn đề**: Cùng là segmented control (N7) nhưng 3 cách tô màu mục đang chọn khác nhau tồn tại song
  song, thậm chí trong CÙNG 1 hub Thu mua→Tài chính: (a) nền đen/zinc-900
  (`components/sales/POTab.tsx:210`, `components/sales/SuppliersTab.tsx:243`); (b) trắng-trên-nền-xám
  kiểu iOS (`components/finance/OverviewTab.tsx:76-96`); (c) đặc indigo-600
  (`components/finance/CashbookTab.tsx:270`, `components/finance/ReceivablesTab.tsx:72-92`).
- **Cách sửa**: rút thành 1 component `SegmentedControl` dùng chung (đúng khuyến nghị P1-2 của
  `APPLE_DESIGN_SYSTEM.md`), chốt 1 màu active DUY NHẤT (đề xuất: nền đen/zinc-900 — đã là mẫu phổ biến
  nhất ở BOM List/PO/Suppliers) rồi thay dần các nơi còn lại.
- **Mức độ**: P1.
- **Đã làm (agent NHÓM A)**: `components/ui/tabs.tsx` (`TabsList`/`TabsTrigger` `variant="segmented"`) —
  ĐÂY LÀ component dùng chung DUY NHẤT hiện có cho pattern này; đã chốt màu active = nền đen/zinc-900 +
  chữ trắng (dark: đảo ngược zinc-100/zinc-900), khớp mẫu phổ biến nhất. `PRTab.tsx` (Đề xuất vật tư) là
  consumer duy nhất hiện tại — tự động ăn theo màu mới, đã verify computed style đúng ở cả 2 theme. 5 file
  còn lại (`POTab.tsx`, `SuppliersTab.tsx`, `OverviewTab.tsx`, `CashbookTab.tsx`, `ReceivablesTab.tsx`) TỰ
  VẼ nút riêng, KHÔNG dùng `Tabs`/`TabsList` — ngoài phạm vi sửa trực tiếp ở đây (page-specific), xem
  "Việc cho nhóm trang" để migrate sang dùng chung.

### A13. [P1 — SHARED, xác nhận qua agent G1] ConfirmDialog gõ "XOA" cho hành động CÓ THỂ hồi phục ✅ ĐÃ CẢNH BÁO JSDoc — commit `18f3581`

- **Vấn đề**: `components/ui/dialog.tsx:154` đặt mặc định `confirmText = "XOA"` cho typed-confirm. Hành
  động "Vô hiệu hoá user" (`app/(app)/admin/users/[id]/page.tsx:433-438`) — một hành động REVERSIBLE (mô
  tả trong dialog còn ghi rõ "Bạn có thể kích hoạt lại sau") — vẫn bắt gõ "XOA", tạo cảm giác sai mức độ
  nghiêm trọng (như thể xoá vĩnh viễn). Vi phạm đúng tinh thần "ConfirmDialog phải nêu đúng hậu quả,
  không chung chung" mà chuẩn thiết kế yêu cầu.
- **Cách sửa**: chỉ dùng typed-confirm "XOA" cho hành động xoá vĩnh viễn thật sự; hành động reversible
  (vô hiệu hoá, khoá tạm) nên dùng nút xác nhận thường hoặc từ khoá khác phù hợp hơn (VD gõ tên user).
- **Mức độ**: P1.
- **Đã làm (agent NHÓM A)**: thêm JSDoc cảnh báo ngay tại `DialogConfirmProps.confirmText`
  (`components/ui/dialog.tsx`) và `ConfirmDialogProps.typeToConfirm` (`components/ui/confirm-dialog.tsx`) —
  chỉ dùng "XOA" cho hành động xoá vĩnh viễn. Việc sửa chỗ gọi cụ thể
  (`admin/users/[id]/page.tsx:433-438` — đổi confirmText hoặc bỏ typeToConfirm cho hành động "Vô hiệu hoá
  user") thuộc trang cụ thể, ngoài phạm vi — xem "Việc cho nhóm trang".

### A14. [P1 — SHARED, xác nhận qua agent G1] Rò rỉ enum/tên trường kỹ thuật thô ra UI ✅ ĐÃ SỬA FALLBACK DÙNG CHUNG — commit `deccf77`

- **Vấn đề**: Khi danh sách nhãn dịch (`SORT_OPTIONS_BY_ROLE`, hoặc tương tự) THIẾU 1 entry, code fallback
  về hiện thẳng key kỹ thuật thô (VD "PRODUCTION_QTY_SCRAP" thay vì "Phế phẩm") — đây là lớp lỗi
  CÓ THỂ TÁI DIỄN bất cứ khi nào thêm metric/trường mới mà quên cập nhật bảng nhãn. Cụ thể thấy ở
  `apps/web/src/app/(app)/admin/reports/department/page.tsx:269-289` (metric "production_qty_scrap"
  thiếu nhãn cho role operator), và tương tự action code thô "LOGIN"/object type thô "session" tại
  `apps/web/src/app/(app)/admin/reports/employee-productivity/page.tsx:478,481` (đã có sẵn helper
  `actionLabel()`/`auditObjectLabel()` nhưng không được gọi ở đây).
- **Cách sửa**: (a) sửa ngay các chỗ cụ thể đã nêu; (b) về lâu dài, đổi fallback mặc định thành 1 nhãn
  trung tính an toàn (VD "(chưa đặt tên)") thay vì render trực tiếp key kỹ thuật, để lỗi tương lai không
  lộ ra là dòng CHỮ HOA khó hiểu.
- **Mức độ**: P0 tại nơi đã xác nhận qua ảnh (department report), P1 nếu là rủi ro tiềm ẩn/pattern.
- **Đã làm (agent NHÓM A)**: `actionLabel()` (`lib/status.ts`) và `auditObjectLabel()`
  (`lib/audit-scope.ts`) — thiếu entry trong bảng nhãn giờ dùng `prettifyUnknownCode()` (viết hoa chữ đầu
  câu, bỏ gạch dưới) thay vì render thẳng key thô. Có vitest (`status.test.ts`). Trường hợp CỤ THỂ đã xác
  nhận (`department/page.tsx:269-289` thiếu nhãn "production_qty_scrap"; `employee-productivity/page.tsx:
  478,481` CÓ helper nhưng quên gọi) vẫn cần sửa tại trang — xem "Việc cho nhóm trang".

### A15. [P2 — SHARED] "Export Excel"/English leftover rải rác dù tổng thể đã Việt hoá tốt ⏭ NGOÀI PHẠM VI NHÓM A (rải rác trang + 1 chỗ API)

- Đã xác nhận thêm vài chỗ tiếng Anh sót cụ thể (ngoài phạm vi "sạch hoàn toàn" ghi ở A9): nút
  "Export Excel" ở `admin/reports/employee-productivity/page.tsx:102` (nơi khác cùng module dùng
  "Xuất Excel" — `admin/audit/page.tsx:179`); mô tả "audit log" tại `admin/page.tsx:67`; log message thô
  tiếng Anh "Admin reset password (force change on next login, revoked 0 session)" tại
  `app/api/admin/users/[id]/reset-password/route.ts:87` (hiện trực tiếp trong cột "Thay đổi" của Nhật
  ký); nhãn vai trò tiếng Anh/Việt lẫn lộn trong `components/admin/UserForm.tsx:24-58` ("Admin, Planner,
  Warehouse, Operator, Purchaser" tiếng Anh cạnh "QC/KCS, Kế toán, Cổ đông" tiếng Việt, trong khi
  `admin/users/page.tsx:28-39` đã có nhãn Việt hoá đầy đủ nhưng không tái sử dụng).
- **Mức độ**: P2 (rải rác, sửa từng chỗ khi chạm file, không cấp thiết).

### A16. [P1 — SHARED] Bảng ≥5 cột ẩn hẳn dữ liệu quan trọng trên mobile thay vì chuyển card-list ⏭ NGOÀI PHẠM VI NHÓM A (rework từng trang admin)

- **Vấn đề mở rộng của N9**: một số bảng không tràn/cắt chữ (đã dùng `hidden md:block`/`md:flex` để ẩn
  cột thay vì để vỡ layout) NHƯNG hệ quả là MẤT HẲN thông tin quan trọng trên mobile thay vì hiện dưới
  dạng card đầy đủ — đây là cách né N9 SAI tinh thần (N9 yêu cầu "chuyển card-list", không phải "ẩn bớt
  cột"). Ví dụ xác nhận: `admin/audit/page.tsx:29` + `components/admin/AuditRow.tsx:106-130` (mobile ẩn
  hẳn cột "Mã đối tượng" + "Thay đổi" — mất chức năng xem chi tiết thay đổi trên điện thoại);
  `admin/users/page.tsx:224-232,292-319` (mobile ẩn hẳn Vai trò/Đăng nhập cuối/Hành động — Vai trò là
  thông tin trọng yếu với admin); `admin/reports/department/page.tsx:269-289` (mobile leaderboard ẩn hết
  chỉ số, chỉ còn hạng + tên). Đối lập, mẫu ĐÚNG: `admin/settings/sessions` dựng card-list thật ngay từ
  đầu (không ẩn trường nào, chỉ đổi bố cục) — dùng làm khuôn mẫu.
- **Cách sửa**: chuyển các bảng trên sang card-list thật (mọi trường xuất hiện, chỉ đổi cách trình bày)
  thay vì `hidden md:block` cắt bớt cột.
- **Mức độ**: P1 (mất chức năng, không chỉ mất thẩm mỹ).

### A17. [P0 — bẫy toàn hệ thống, xác nhận qua agent G2] Global CSS `h1..h6 dark:text-zinc-50` ghi đè text màu cứng không có biến thể `dark:` ✅ ĐÃ SỬA — commit `a823db7`

- **Vấn đề**: `apps/web/src/app/globals.css:197-205` có rule toàn cục `h1,h2,…,h6 { @apply text-zinc-900
  … dark:text-zinc-50 }`, compile ra selector `.dark h1` (specificity 0,1,1). BẤT KỲ trang nào tự đặt
  `className="text-xl font-semibold text-zinc-900"` cho thẻ `<h1>` mà KHÔNG kèm `dark:text-zinc-50`
  riêng (specificity 0,1,0, THUA rule toàn cục) sẽ được global CSS ép về `dark:text-zinc-50` ĐÚNG —
  NHƯNG nếu trang đó style thêm những phần tử khác/nền ngoài `<h1>` không đồng bộ dark, kết quả là chữ
  trắng trên nền vẫn sáng → MẤT TƯƠNG PHẢN HOÀN TOÀN. Xác nhận cụ thể: `apps/web/src/app/not-found.tsx`
  và `apps/web/src/app/(app)/not-found.tsx` — cả 2 file KHÔNG có `dark:bg-*` cho div bọc ngoài
  (`bg-zinc-50`/mặc định trắng) trong khi `<h1>` bị global CSS ép trắng ở dark mode → heading "Trang
  không tìm thấy" BIẾN MẤT HOÀN TOÀN trên trang 404 khi bật dark mode (xác nhận bằng crop-so-sánh ảnh
  `G/not-found-404__desktop-dark.png` vs `__desktop-light.png` — dòng chữ hoàn toàn không thấy ở bản
  dark). File thứ 2 (`app/(app)/not-found.tsx`) còn có thêm icon-box `bg-zinc-100`, nút "Quay lại"
  `border-zinc-300 bg-white text-zinc-700` đều thiếu cặp `dark:` (chưa có ảnh riêng do route-guard luôn
  đưa user tới file gốc, nhưng đọc code xác nhận cùng lỗi).
- **File:line**: `apps/web/src/app/not-found.tsx` (toàn bộ, ~9 dòng đầu + h1), `apps/web/src/app/(app)/not-found.tsx:13,22,42`, `apps/web/src/app/globals.css:197-205` (rule gốc — KHÔNG sửa rule này, chỉ dùng để hiểu cơ chế).
- **Cách sửa**: thêm `dark:bg-zinc-950` cho div bọc ngoài + `dark:text-zinc-50` cho `<h1>` (dù global CSS
  đã set, nên khai báo tường minh để không phụ thuộc ngầm vào thứ tự CSS) ở cả 2 file; rà lại toàn bộ
  `bg-zinc-100`/`border-zinc-300`/`bg-white` không có cặp `dark:` trong `app/(app)/not-found.tsx`.
- **Cảnh báo mở rộng [SHARED — rủi ro toàn codebase]**: đây là BẪY CHUNG — bất kỳ trang mới nào quên
  thêm `dark:text-*`/`dark:bg-*` cho khối chứa `<h1>` sẽ có nguy cơ dính lỗi tương tự vì rule global ghi
  đè theo specificity CSS, không theo ý định trang. Khuyến nghị bổ sung 1 dòng vào checklist trước-khi-
  merge: "mọi `<h1>` custom màu phải tự khai `dark:` tường minh, không dựa vào global override".
- **Mức độ**: P0 (mất thông tin hoàn toàn ở dark mode, xảy ra ngay tại trang lỗi mà user dễ gặp).

### A18. [P1 — phát hiện MỚI] Trang `/login` tràn ngang ~128px do khối trang trí thiếu `overflow-hidden` ✅ ĐÃ SỬA — commit `a2d90bf`

- **Vấn đề**: Ảnh `G/login__desktop-light.png`/`__desktop-dark.png` có kích thước THẬT 1568×900 thay vì
  1440×900 như mọi trang khác trong bộ ảnh (Playwright `fullPage` chụp theo `scrollWidth` thật của
  trang) — trang bị tràn ngang ~128px. Ở light mode, mép phải lộ dải nền sai tông (xanh nhạt/trắng chói
  cạnh panel gradient navy); ở dark mode dải này gần đen nên khó nhận ra bằng mắt thường (lý do lỗi này
  có thể đã tồn tại lâu mà chưa ai phát hiện qua theme mặc định).
- **Root cause (khớp chính xác 128px = 8rem = `-right-32`)**: `apps/web/src/app/login/page.tsx:52` —
  khối glow trang trí `absolute -right-32 top-1/4 h-96 w-96 blur-3xl` nằm trong div cột form (dòng 45,
  chỉ có `relative`, KHÔNG có `overflow-hidden`) → tràn ra ngoài mép phải trang, kéo giãn `scrollWidth`
  toàn trang, lộ nền `<body>` thật phía sau.
- **File:line**: `apps/web/src/app/login/page.tsx:42` (div gốc cần thêm `overflow-hidden`/`overflow-x-clip`), `:52` (khối glow gây tràn).
- **Cách sửa**: thêm `overflow-hidden` (hoặc `overflow-x-clip`) vào div gốc dòng 42, hoặc giảm giá trị
  `-right-32` để không vượt khỏi container; kiểm tra lại `document.documentElement.scrollWidth ===
  window.innerWidth` trên trang thật sau khi sửa.
- **Mức độ**: P1 (trang ĐẦU TIÊN mọi user nhìn thấy, lỗi tràn ngang dễ bị đánh giá là "web vỡ" ngay từ
  ấn tượng đầu, dù không chặn chức năng).

### A10. [P2] Ctrl+K mới search điều hướng, chưa search nội dung nghiệp vụ ⏭ BACKLOG — không xử lý đợt NHÓM A (không phải lỗi hồi quy)

- **Xác nhận qua ảnh** `interactions/01-cmdk-palette.png`: input để trống hiện đúng 7 mục điều hướng
  (Tổng quan, Bộ phận Thiết kế, Đề xuất vật tư, Bộ phận Gia công, Bảng sản xuất (QC), Bộ phận Thu mua,
  Bộ phận Kho, Quản trị) — CHƯA thử gõ mã PO/BOM để xác nhận có search nội dung hay không (đã nêu trong
  design system là backlog V4.4, không phải lỗi mới).
- **Mức độ**: P2 (backlog, không phải lỗi hồi quy).

---

## 2.5. Việc cho nhóm trang (agent NHÓM B–G) — phát sinh từ đợt sửa NHÓM A

> Agent NHÓM A (component dùng chung) đã sửa xong phần helper/component dùng chung ở §2 (xem "✅ ĐÃ SỬA"
> ở từng mục). Các việc dưới đây CẦN SỬA TỪNG TRANG — ngoài phạm vi agent NHÓM A ("KHÔNG sửa từng trang" —
> xem đầu prompt) — liệt kê lại đây để nhóm trang không phải đọc lại toàn bộ §2.

1. **[A5, P0 — CẦN AGENT BACKEND/API]** `app/api/dashboard/action-items/route.ts:52-58` — mở rộng điều
   kiện PR thành `status IN ('SUBMITTED','DEPT_APPROVED')`; dài hạn gộp thêm BBGH/ISR chờ duyệt vào cùng
   widget "Cần xử lý". Đây là sửa logic nghiệp vụ/API, KHÔNG phải UI thuần — không thuộc agent UI nào,
   cần agent backend hoặc chủ trì tính năng Dashboard.
2. **[A7, P1 — Kho]** `components/warehouse/BinActions.tsx:869,881` — "Bin đích" → "Vị trí đích"/"Ô đích";
   "Thêm hàng vào bin" → "Thêm hàng vào ô/kệ". Grep thêm `"AVAILABLE"` trong
   `apps/web/src/components/warehouse/` để định vị badge trạng thái tồn tiếng Anh, đổi qua `STATUS_DEFS`
   phù hợp trong `lib/status.ts` (đã có sẵn, không cần thêm domain mới).
3. **[A8, P2 — Kho]** Grep `"Quản lí"` trong `app/(app)/warehouse/page.tsx` hoặc
   `components/warehouse/WarehouseTabsNav.tsx` → đổi thành "Quản lý kho".
4. **[A11, P1 — nhiều nhóm]** Import `ROOT_LABEL` từ `lib/breadcrumb-items.ts` thay chuỗi cứng
   `"Trang chủ"` ở: `app/(app)/suppliers/new/page.tsx:22`, `app/(app)/suppliers/[id]/page.tsx:131`,
   `app/(app)/admin/users/new/page.tsx:110`, `app/(app)/admin/reports/department/page.tsx:80`,
   `app/(app)/admin/settings/page.tsx:37`, `app/(app)/admin/reports/employee-productivity/page.tsx:87`,
   `app/(app)/items/import/` (xác minh dòng cụ thể khi sửa).
5. **[A12, P1 — Thu mua/Tài chính]** Migrate `POTab.tsx:210`, `SuppliersTab.tsx:243` (tự vẽ nền đen —
   gần đúng chuẩn, có thể giữ tạm hoặc đổi sang component chung), `OverviewTab.tsx:76-96` (trắng-trên-xám,
   LỆCH chuẩn), `CashbookTab.tsx:270`, `ReceivablesTab.tsx:72-92` (indigo đặc, LỆCH chuẩn) sang dùng
   `<Tabs><TabsList variant="segmented"><TabsTrigger>` (`components/ui/tabs.tsx`) — tự động ăn theo màu
   active chuẩn (đen/zinc-900) đã chốt, không cần tự set màu.
6. **[A13, P1 — Quản trị]** `app/(app)/admin/users/[id]/page.tsx:433-438` — hành động "Vô hiệu hoá user"
   (reversible) đang dùng `typeToConfirm`/`confirmText` mặc định "XOA" — đổi sang không dùng typed-confirm
   (chỉ `tone="danger"` + nút xác nhận thường) hoặc đổi confirmText phù hợp hơn (VD tên user).
7. **[A14, P1 — Quản trị]** `app/(app)/admin/reports/department/page.tsx:269-289` — bổ sung nhãn Việt cho
   metric `production_qty_scrap` ("Phế phẩm") vào bảng nhãn role operator. `app/(app)/admin/reports/
   employee-productivity/page.tsx:478,481` — gọi `actionLabel()`/`auditObjectLabel()` (đã có sẵn trong
   `lib/status.ts`/`lib/audit-scope.ts`) thay vì hiện thẳng "LOGIN"/"session" thô.
8. **[A15, P2 — Quản trị]** `admin/reports/employee-productivity/page.tsx:102` — "Export Excel" →
   "Xuất Excel" (khớp `admin/audit/page.tsx:179`); `admin/page.tsx:67` — "audit log" → tiếng Việt;
   `app/api/admin/users/[id]/reset-password/route.ts:87` — log message tiếng Anh hiện trong Nhật ký (cần
   sửa ở API, không phải UI thuần); `components/admin/UserForm.tsx:24-58` — dùng lại nhãn vai trò tiếng
   Việt đã có ở `admin/users/page.tsx:28-39` thay vì tên tiếng Anh.
9. **[A16, P1 — Quản trị]** Chuyển bảng ẩn cột mobile sang card-list thật (mọi trường xuất hiện, chỉ đổi bố
   cục — mẫu chuẩn: `admin/settings/sessions`): `admin/audit/page.tsx:29` + `components/admin/
   AuditRow.tsx:106-130`; `admin/users/page.tsx:224-232,292-319`; `admin/reports/department/
   page.tsx:269-289`.
10. **[A3, P2 — mọi nhóm]** Thay `.toLocaleString()`/`.toLocaleDateString()`/`.toLocaleTimeString()` cục bộ
    bằng `formatMoney`/`formatMoneyShort`/`formatQty`/`formatNumber`/`formatPercent`/`formatDate*` của
    `lib/format.ts` — tập trung ở `components/dashboard/*`, `components/finance/*`, `components/
    warehouse/*`, `components/engineering/*` (106 chỗ, 47 file). Ưu tiên trước (nhạy cảm logic "quá hạn"):
    `components/layout/NotificationBell.tsx:336`, `components/orders/ProductionOverviewCards.tsx:49`,
    `components/auth/SessionExpiryGuard.tsx:31`, `components/finance/CashflowChart.tsx:54`.
11. **[A4, P2 — mọi nhóm có input ngày]** Cân nhắc thay `<input type="date">` bằng `DateField`
    (`components/ui/date-field.tsx`, MỚI) ở các nơi cần hiển thị dd/mm/yyyy nhất quán: bộ lọc "Từ/Đến"
    Tài chính · Tổng quan (`OverviewTab.tsx`), `PRTab.tsx:178,188`, `material-requests/page.tsx:265,275`.
    Không bắt buộc — input date cũ vẫn hoạt động bình thường, đây là nâng cấp UX tuỳ chọn.

---

## 3. Danh sách helper/pattern chuẩn nên dùng thống nhất

| Nhu cầu | Helper/Component chuẩn | Đường dẫn |
|---|---|---|
| Tiền VND đầy đủ ("1.234.567 ₫") | `formatMoney(value, opts)` | `apps/web/src/lib/format.ts` |
| Tiền rút gọn cho KPI/trục biểu đồ ("1,5 tr ₫") | `formatMoneyShort(value)` | `apps/web/src/lib/format.ts` |
| Số lượng + ĐVT viết hoa ("1.000 PCS") | `formatQty(value, uom, maxDecimals)` | `apps/web/src/lib/format.ts` |
| Số có phân cách hàng nghìn (không phải tiền) | `formatNumber(value, locale, options)` | `apps/web/src/lib/format.ts` |
| Phần trăm | `formatPercent(value, opts)` | `apps/web/src/lib/format.ts` |
| Ngày/giờ theo giờ Việt Nam cố định (UTC+7) | hàm `vnParts()` + wrapper ngày/giờ (xem cùng file) | `apps/web/src/lib/format.ts` |
| ĐVT viết hoa thống nhất | `formatUom(uom)` | `apps/web/src/lib/format.ts` |
| Nhãn + màu trạng thái nghiệp vụ (6 tông) | `STATUS_DEFS`, `StatusTone` | `apps/web/src/lib/status.ts` |
| Hiển thị badge trạng thái | `StatusPill` | `apps/web/src/components/ui/status-badge.tsx` |
| Bảng dữ liệu chuẩn (card-list mobile tự động, StatTile, RowActionsMenu) | `DataTable`, `StatTile`, `RowActionsMenu` | `apps/web/src/components/ui/data-table.tsx` |
| Form tạo/sửa 1 đối tượng nghiệp vụ (nhiều trường) | `Sheet` + `SheetHeaderNav` | `apps/web/src/components/ui/sheet.tsx` |
| Xác nhận ngắn/phá huỷ | `ConfirmDialog`, `useConfirm()`, `usePrompt()` | `apps/web/src/components/ui/confirm-dialog.tsx` |
| Trạng thái rỗng | `EmptyState` (preset icon Lucide, không illustration 3D) | `apps/web/src/components/ui/empty-state.tsx` |
| Lỗi API (phân biệt 429/403/5xx) | `QueryError` | `apps/web/src/components/ui/query-error.tsx` |
| Tab cấp trang (auto-scroll khi active ngoài tầm nhìn) | `Tabs` (`variant="segmented"` cho filter loại trừ) | `apps/web/src/components/ui/tabs.tsx` |
| Breadcrumb 1 tầng, auto-collapse | `Breadcrumb`, `buildBreadcrumbItems` | `apps/web/src/components/ui/breadcrumb.tsx`, `apps/web/src/lib/breadcrumb-items.ts` |
| Tooltip cho ô `truncate` | `SimpleTooltip` | `apps/web/src/components/ui/tooltip.tsx` |
| Thuật ngữ nghiệp vụ | "Đề xuất vật tư" (KHÔNG dùng "Yêu cầu vật tư"/"YCVT" ngoài tên phiếu in chính thức); "Vị trí"/"Ô"/"Kệ" (KHÔNG dùng "Bin") | — |

---

## 4. Phân công nhóm agent kiểm ảnh (song song) — đã hoàn tất cả 8/8

| Nhóm | Phạm vi | Agent | Kết quả |
|---|---|---|---|
| B | Kho + nhận hàng (10 trang/tab) | audit-B | Xong — §7 |
| C | PO + NCC + Tài chính (11 trang/tab) | audit-C | Xong — §6 |
| C2 | Đề xuất vật tư (PR) + material-requests cũ (6 trang) | audit-C2 | Xong — §5 |
| D1 | BOM + hub Thiết kế (8 trang/tab) | audit-D1 | Xong — §8 |
| D2 | Vật tư (Items) + Lô/Serial (6 trang) | audit-D2 | Xong — §8 |
| E | Sản xuất/Lệnh SX/Bảng SX/Gia công (9 trang/tab) | audit-E | Xong — §9 |
| G1 | Quản trị (Admin, 11 trang) | audit-G1 | Xong — §10 |
| G2 | Dashboard/đăng nhập/tài khoản/thông báo (11 trang) | audit-G2 | Xong — §10 |

Tổng: 68 route/tab đã chụp đủ desktop 1440×900 + mobile 390×844 × light/dark (272 ảnh sweep chính) +
1 ảnh login trước đăng nhập × 4 combo + 15 ảnh vai trò (5 role × 3 ảnh) + 12 ảnh tương tác (mở/đóng
Ctrl+K, chuông, menu tài khoản, bin popover, filter, empty search, BOM add-line dialog, mobile drawer) =
**~300 ảnh** tại
`C:\Users\ASUS\AppData\Local\Temp\claude\c--dev-he-thong-iot\7c0e0492-2281-453b-97aa-d20b0da7ef8e\scratchpad\ui-inventory\`.

---

## 5. NHÓM C — chi tiết "Đề xuất vật tư" (PR) + material-requests cũ (từ audit-C2)

### 5 vấn đề nghiêm trọng nhất

1. **[P0] Tự mâu thuẫn tên gọi ngay trên cùng 1 màn hình** — tại `/engineering?tab=pr`: breadcrumb + tab
   đang active ghi "Yêu cầu mua", nhưng H1 nội dung ngay bên dưới ghi "Đề xuất vật tư". Vi phạm quyết
   định V4.1 UI-28 (thống nhất 1 tên "Đề xuất vật tư"). Gốc: `apps/web/src/app/(app)/engineering/page.tsx:26`
   (`{ key: "pr", label: "Yêu cầu mua", icon: ShoppingCart }`) và `apps/web/src/lib/breadcrumb-items.ts:84`
   (`pr: "Yêu cầu mua"`). Lặp lại ở: `components/admin/UserPermissionMatrix.tsx:34`,
   `components/dashboard/ProgressBarStack.tsx:162,165`, `components/procurement/PoCreateWizard.tsx:232`,
   `app/(app)/procurement/purchase-orders/new/page.tsx:62`, `app/(app)/engineering/page.tsx:94,96`.
2. **[P0] Form MRF vẫn mang tên cũ "YCVT" trong khi DNVT song song đã đổi tên** —
   `pr-new-mrf`: breadcrumb "Tổng quan › Yêu cầu mua hàng › Tạo phiếu YCVT mới", H1 "Phiếu Yêu cầu Vật tư
   (YCVT)". File: `apps/web/src/app/(app)/procurement/purchase-requests/new-mrf/page.tsx:253,257,262`.
3. **[P1] Hex `#005D9F` rò ra ngoài khung "phiếu giấy", lẫn vào toolbar app** — trang chi tiết PR: badge
   số phiếu trong vùng header app (KHÔNG nằm trong khung viền mô phỏng phiếu in) dùng
   `bg-[#005D9F]` cứng, đứng cạnh `StatusPill` chuẩn. File:
   `apps/web/src/app/(app)/procurement/purchase-requests/[id]/page.tsx:365-369`.
4. **[P1] Bảng 15-16 cột trong form tạo phiếu bị cắt cụt trên mobile, không có chỉ báo cuộn ngang** —
   `pr-new-dnvt`/`pr-new-mrf` mobile 390px: cột "ĐVT" cắt nửa ở mép phải, không có fade/shadow/scrollbar
   gợi ý còn nội dung. File: `new-dnvt/page.tsx` (bảng dòng 362-583), `new-mrf/page.tsx` (dòng 406-664) —
   cả 2 tự vẽ `<table>` trong `overflow-x-auto`, không qua `DataTable`.
5. **[P1] `DnvtDetailBody` (chi tiết phiếu DNVT) thiếu hẳn card-list mobile** — trong khi nhánh MRF cùng
   trang cha đã có `LineItemCard` (`[id]/page.tsx:806-820,1209-1282`) làm mẫu,
   `apps/web/src/components/procurement/DnvtDetailBody.tsx` chỉ có `<table>` + `overflow-x-auto`
   (dòng 143-234), không có nhánh `md:hidden` card.

### Bảng tổng theo trang (nhóm C — phần PR)

| Trang | Đánh giá | Số điểm lệch |
|---|---|---|
| pr-list | Đạt | 1 (P2 — placeholder ngày mm/dd/yyyy, xem A4) |
| pr-new-dnvt | Lệch nặng | 2 (1×P1 mobile overflow, 1×P2 header chật mobile) |
| pr-new-mrf | Lệch nặng | 3 (1×P0 tên gọi, 1×P1 mobile overflow, 1×P2 placeholder ngày) |
| pr-detail | Lệch nặng | 4 (1×P1 hex badge lẫn chrome, 1×P1 DNVT thiếu mobile card-list, 2×P2 nhỏ) |
| material-requests-list-empty | Lệch nhẹ | 2 |
| material-requests-new | Lệch nhẹ | 1 |
| engineering-pr-tab (tham chiếu) | Lệch nặng | 1 (P0 — cùng gốc mục 1) |

### Chi tiết đầy đủ

**C.A — Tên gọi "Đề xuất vật tư" vs "Yêu cầu mua"/"YCVT" [SHARED — xem A6 nếu trùng]**
PRTab.tsx tự thân + trang `/procurement/purchase-requests` đã đúng chuẩn "Đề xuất vật tư", nhưng MỌI nơi
khác tham chiếu PR vẫn dùng tên cũ. File:line: xem mục 1 ở trên. Cách sửa: đổi toàn bộ chuỗi liệt kê
thành "Đề xuất vật tư" (giữ "(PR)" nếu cần rõ viết tắt), đồng bộ với `PRTab.tsx`/`breadcrumb-items.ts`
route `/procurement/purchase-requests`. Mức: P0 (2 chỗ hiển thị cạnh nhau) / P1 (còn lại).

**C.B — Form MRF giữ tên "YCVT" khác biệt hoàn toàn form DNVT song song**
Ngoài breadcrumb/H1 (mục 2), `[id]/page.tsx` dùng "phiếu YCVT" trong dialog/thông báo DÙNG CHUNG cho CẢ
2 loại phiếu kể cả khi record là DNVT: "Không tìm thấy phiếu YCVT" (dòng 224), "Từ chối phiếu YCVT"
(dòng 975), "Đóng phiếu YCVT này?" (dòng 539-541), "Xoá phiếu YCVT — không thể hoàn tác" (dòng 1080) —
SAI LOẠI PHIẾU khi record thực tế là DNVT (xác nhận qua đọc code, dialog chưa mở trong ảnh chụp nên chưa
thấy trực quan). Mức: P1 (breadcrumb/H1, rõ qua ảnh) + P2 (wording dialog, chưa xác nhận ảnh).

**C.C — Hex #005D9F/#F5F5F5 trong phiếu DNVT/MRF — KẾT LUẬN DỨT KHOÁT**
Đã kiểm kỹ `new-dnvt`, `new-mrf`, `[id]/page.tsx`, `DnvtDetailBody.tsx`:
- **Bên TRONG khung `<article className="border-2 border-zinc-900 …">`** (mô phỏng phiếu giấy
  GTAM/PRD-MRF-02, viền 2px rõ, nổi trên nền `bg-zinc-100 dark:bg-zinc-950`) → **HỢP LỆ, cố ý** — mô
  phỏng đúng file Excel thật ("YCVT Z0000002-262422.xlsx"). Ranh giới rõ ràng ở cả light/dark.
- **Bên NGOÀI khung (app chrome)** → **LỖI THẬT**: duy nhất 1 chỗ, xem mục 3 top-5. Sửa: đổi badge đó
  thành `<Badge>`/`StatusPill` tone phù hợp thay vì `bg-[#005D9F]` cứng.

**C.D — Mobile: bảng nhiều cột không có DataTable/card-list [SHARED pattern với A1]**
`pr-new-dnvt`/`pr-new-mrf` (tạo phiếu): bảng tự vẽ cắt cụt mobile, không gợi ý cuộn. `pr-detail`
(formType=DNVT qua `DnvtDetailBody.tsx`): thiếu card-list hẳn so với nhánh MRF. Sửa: thêm
`LineItemCard`-tương-tự cho `DnvtDetailBody` (copy pattern từ `[id]/page.tsx:1209-1282`); với 2 form tạo
phiếu, tối thiểu thêm chỉ báo cuộn ngang (shadow mờ 2 bên/text "← Vuốt để xem thêm →"), lý tưởng chuyển
sang nhập liệu dạng card từng dòng trên mobile. Mức: P1.

**C.E — `/material-requests` (route mồ côi) vẫn mời tạo bản ghi mới**
Xác nhận: top-nav không có tab nào active khi ở `/material-requests` — đúng comment code
`apps/web/src/lib/nav-items.ts:142-144` ("đã bỏ menu, giữ route để không 404 link cũ"). Nhưng trang vẫn
hiển thị đầy đủ nút "Tạo yêu cầu mới" (header + EmptyState) và `/material-requests/new` vẫn hoạt động
đầy đủ dù không còn được link từ bất kỳ đâu trong app (chỉ reachable qua URL trực tiếp/bookmark cũ) —
vẫn chủ động mời tạo MỚI cho 1 tính năng coi là trùng lặp với "Đề xuất vật tư". EmptyState KHÔNG trắng
trơn (có icon/tiêu đề/mô tả/CTA tử tế) nhưng dùng component tự chế `EmptyRequestsCard`
(`app/(app)/material-requests/page.tsx:355-394`, `rounded-2xl border-dashed`) thay vì `EmptyState` chuẩn.
Sửa: (1) quyết định rõ — nếu chỉ để không 404, ẩn nút "Tạo yêu cầu mới" khỏi list/empty-state (giữ xem
chi tiết record cũ); (2) nếu vẫn cần giữ tạo mới cho workflow khác, làm rõ trong UI đây KHÔNG phải bản
dịch cũ của "Đề xuất vật tư"; (3) đổi `EmptyRequestsCard` sang `EmptyState` chuẩn. Mức: P1 (quyết định
điều hướng) + P2 (component không dùng chung).

**C.F — Chi tiết nhỏ (P2)**
- Input ngày `type="date"` hiện "mm/dd/yyyy" — xem A4 (giới hạn native, không phải lỗi code).
- `DnvtDetailBody.tsx` dòng "Kiểm tra tồn kho"/"Kiểm tra kỹ thuật" trong bảng III hiện Ô TRỐNG HOÀN TOÀN
  (`ApprovalRow` dùng `{name || " "}` thay vì `"—"`) — có thể cố ý (dòng ký tay để trống trên phiếu giấy)
  nhưng không nhất quán với "—" placeholder dùng mọi nơi khác trong cùng bảng.

**Ghi chú tích cực (không cần sửa)**: `pr-list` (mọi viewport/theme) đã dùng đúng `DataTable` +
`StatusPill` + segmented `Tabs` (N7) + card-list mobile tự động — dùng làm khuôn mẫu. `PRTab.tsx` là ví
dụ tốt cho EmptyState/QueryError tách biệt lỗi khỏi rỗng. Dark mode toàn bộ nhóm PR/DNVT/MRF không phát
hiện lỗi tương phản.

---

## 6. NHÓM C/F — phần PO + NCC + Tài chính (từ audit-C)

### Top 5 nghiêm trọng nhất — Nhóm C (Thu mua/PO/NCC)

1. **[P1] `suppliers-new` dùng FULL-PAGE điều hướng thay vì Sheet** cho form "Tạo NCC" (15+ trường) —
   Supplier được nêu ĐÍCH DANH trong quy tắc N6 ("PR, PO, User, Item, Supplier, Category, Account… nên
   dùng Sheet"). File: `apps/web/src/app/(app)/suppliers/new/page.tsx` (toàn bộ), form 423 dòng tại
   `apps/web/src/components/suppliers/SupplierForm.tsx:83`.
2. **[P1] `POTab`/`SuppliersTab` thiếu hero KPI (N1)** — 4 StatTile cùng cỡ `text-xl`. `StatTile` ĐÃ có
   sẵn `size="hero"` (đang dùng ở Kho `TodayInboxTab.tsx`) nhưng CHƯA áp dụng ở Thu mua/PO. File:
   `apps/web/src/components/sales/POTab.tsx:144-170`; định nghĩa hero:
   `apps/web/src/components/ui/data-table.tsx:412-437`.
3. **[P1] Cột "Điện thoại"/"Email" 100% rỗng vẫn hiện đầy đủ** trên cả bảng desktop VÀ card mobile của
   Nhà cung cấp (đúng ví dụ N4 nêu trong đề bài). File: `apps/web/src/components/sales/SuppliersTab.tsx:132-147`.
4. **[P1][SHARED] 3 kiểu "segmented control" khác màu active dùng lẫn trong CÙNG 1 hub** — xem A12.
5. **[P1] Header mobile `po-new` bị vỡ dòng chữ trong nút** "Quay lại danh sách" — thiếu `flex-wrap`
   như các trang khác đã áp dụng (X6). File: `apps/web/src/app/(app)/procurement/purchase-orders/new/page.tsx:36-56`.

### Top 5 nghiêm trọng nhất — Nhóm F (Tài chính)

**Tin quan trọng**: build hôm nay đã SỬA gần hết lỗi Tài chính ghi trong `REVIEW_UI.md` cũ. Xác minh lại
từng điểm: (a) 6 KPI cùng cỡ → **ĐÃ HẾT** (nay có 1 `HeroKpi` text-3xl + 5 `KpiCard` phụ, đúng N1); (b)
Button rời cho filter ngày/Phải trả-thu → **ĐÃ HẾT** (cả 2 đã thành segmented/pill thật — nhưng màu active
2 nơi này vẫn khác nhau, xem A12); (c) Dialog thay Sheet cho form → **ĐÃ HẾT** (5/5 file Tài chính đã
dùng Sheet, chỉ `PartnerInvoicesDialog.tsx` còn Dialog nhưng dùng để XEM drill-down, không phải form nhập
— chấp nhận được); (d) rounded-lg lẫn rounded-2xl trong `OverviewTab` → **ĐÃ HẾT** (toàn bộ đã về
`rounded-xl`, token mới 14px đã thêm vào `tailwind.config.ts:267-275`); (e) mã kỹ thuật danh mục
(`CHI_DIENNUOC`) hiện thường trực → **CÒN NGUYÊN**, `apps/web/src/components/finance/CategoriesTab.tsx:215`
vẫn render `<p className="font-mono text-xs">{r.code}</p>` vô điều kiện; (f) icon hướng ↗/↘ trước số tiền
Sổ quỹ → **ĐÃ HẾT** (`CashbookTab.tsx:418,527` đã có `ArrowUpRight`/`ArrowDownRight`).

Vấn đề MỚI: `.card-interactive` dùng chung (`globals.css:543-551`) — comment cũ trong `DebtAgingPanel.tsx:286-293`
nói class "vỡ build" nên viết riêng, nhưng code hiện tại đã vá cú pháp — nên gỡ đoạn duplicate để tránh
trôi giữa 2 nơi định nghĩa hover (P2). Ảnh `sales-fin-cashbook__mobile-dark.png` có dấu hiệu race-condition
chụp (0 giao dịch/skeleton trong khi desktop-dark cùng lúc load đủ 23 giao dịch) — khuyến nghị chụp lại
xác minh trước khi xếp P0 chính thức, KHÔNG kết luận là bug thật. Điểm cộng lớn: bảng "Chi tiết theo đối
tác" (P0 kinh điển REVIEW_UI §1.9, vỡ hoàn toàn trên mobile) — **ĐÃ FIX TRIỆT ĐỂ**,
`DebtAgingPanel.tsx:233` (desktop `hidden md:block`) + `:272-310` (card-list mobile `md:hidden`).

### Bảng tổng theo trang

| Trang | Đánh giá | Số điểm lệch |
|---|---|---|
| sales-po-tab / po-list | Lệch nhẹ | 2 |
| sales-suppliers-tab / suppliers-list | Lệch nhẹ | 1 |
| po-new | Lệch nhẹ | 2 (wizard 3 bước full-page thay Dialog CHẤP NHẬN ĐƯỢC theo N6 — ngoại lệ wizard) |
| po-detail | **Đạt** | 0 (mẫu chuẩn tham chiếu cả hệ thống — hero số, StatusPill, timeline, receipt card đều đúng) |
| suppliers-new | **Lệch nặng** | 2 (full-page thay Sheet — vi phạm N6 rõ nhất toàn bộ 2 nhóm; breadcrumb "Trang chủ" — xem A11) |
| suppliers-detail | Lệch nhẹ | 3 |
| sales-fin-overview | **Đạt** | 0 lỗi mới (chỉ còn nợ màu segmented — đã tính ở A12) |
| sales-fin-cashbook | **Đạt** | 0 (1 caveat ảnh cần chụp lại, không tính là lỗi) |
| sales-fin-settle (Công nợ) | **Đạt** | 1 nhỏ (P2 mã kỹ thuật CategoriesTab, thuộc sub-tab Danh mục cùng trang) |

### Chi tiết bổ sung

**C.G — Breadcrumb "Trang chủ" lệch chuẩn "Tổng quan" [SHARED — xem A11]**: `suppliers/new/page.tsx:22`,
`suppliers/[id]/page.tsx:131` hard-code "Trang chủ" thay vì `ROOT_LABEL`.

**C.H — rounded-2xl lẫn rounded-xl trong `PoCreateWizard`**: `components/procurement/PoCreateWizard.tsx:239,279`
(`rounded-2xl`) vs `:215,256,296` (`rounded-xl`) — cùng 1 wizard, 2 cấp bo góc cho vai trò tương đương.
Sửa: đồng nhất về `rounded-xl`. Mức: P2.

**C.I — `suppliers-detail`: inline-edit là "ngôn ngữ overlay thứ 3"**: nút "Chỉnh sửa" KHÔNG mở Sheet/
Dialog mà expand `SupplierForm` ngay trong tab (`suppliers/[id]/page.tsx:200`, `rounded-2xl border-indigo-200`)
— khác `Card` cùng trang dùng `rounded-md` (dòng 871). CÙNG 1 `SupplierForm` nhưng 2 UI-shell khác nhau
tuỳ Tạo (full-page) hay Sửa (inline-expand). Sửa: chuyển cả 2 sang `Sheet size="lg"` dùng chung 1 shell.
Mức: P2.

**C.J — `suppliers-detail`: tiêu đề công ty dài chèn cạnh nút hành động trên mobile**: header
`flex flex-wrap items-start justify-between gap-3` (dòng 141) nhưng khối nút không có `shrink` → tên NCC
dài bị ép còn ~180px, wrap 6 dòng đứng cạnh nút. Sửa: `flex-col sm:flex-row`. Mức: P2.

**C.K — PO list không có "⋯" RowActionsMenu**: `POListTable.tsx:29-113` không có cột actions/menu — chỉ
`onRowClick` điều hướng thẳng (dòng 126). Khác `SuppliersTab.tsx:158-172` CÓ `RowActionsMenu`. Không nhất
thiết là bug (click cả dòng đủ dùng) — ghi nhận để không tìm nhầm ảnh tương tác thiếu.

**C.L — Quan sát nghiệp vụ (không tính điểm UI)**: PO nhận vượt "120/100 (120%)" vẫn tô xanh lá thành công
như nhận đủ bình thường, không có tông cảnh báo riêng cho "nhận vượt" — nêu để nhóm nghiệp vụ cân nhắc.

---

## 7. NHÓM B — Kho + nhận hàng (từ audit-B)

### Top 5 nghiêm trọng nhất

1. **[P0] QC nhập kho — nút hành động chính bị giấu hoàn toàn trên mobile.** Bảng 7 cột
   (`components/warehouse/QcPendingView.tsx:176-177`, `<table className="w-full min-w-[56rem]">` trong
   `overflow-x-auto`, KHÔNG card-list) khiến 390px chỉ thấy 2/7 cột; cột "KẾT LUẬN" chứa 2 nút "Đạt"/
   "Không đạt" — chức năng CỐT LÕI DUY NHẤT của trang — nằm ngoài màn hình, không gợi ý cuộn. Nhân viên
   QC dùng điện thoại thực tế KHÔNG THỂ duyệt lô hàng. Ảnh: `B/qc-inbound__mobile-light/dark.png`.
2. **[P0] Sơ đồ kho — lưới ô kệ vỡ nặng trên mobile (DOT6 #13 vẫn CHƯA sửa).**
   `components/warehouse/WarehouseLayout3D.tsx` hàm `Rack2DView` (dòng 1296, `overflow-auto` không
   snap/indicator), mỗi ô `Bin2DPro` rộng cố định `width: 160` (dòng 1388) — trên 390px chỉ lọt ~1.5/6
   cột, không chỉ báo cuộn. Ảnh `B/warehouse-layout__mobile-*.png` + `interactions/09-warehouse-layout-*.png`.
3. **[P1 nặng][SHARED] Báo cáo kho tự chế màu ngoài hệ** — `components/warehouse/ReportTab.tsx:248`
   (`bg-violet-500` "Đầy"), `:254` (`bg-indigo-500` "Cao"), `:260` (`bg-blue-500` "Trung"), `:266`
   (`bg-teal-500` "Thấp"), lặp lại ở `:304-311`. Cùng khái niệm "% lấp đầy" nhưng Sơ đồ kho dùng đúng 1
   thang indigo còn Báo cáo kho dùng 4 màu khác họ — vừa sai quy tắc màu, vừa không nhất quán giữa 2 tab
   cùng module.
4. **[P1] Phiếu xuất kho rò rỉ mã enum kỹ thuật "PURCHASE_REQUEST" ra UI** — `components/warehouse/GoodsIssuesTab.tsx`
   union `SourceType` (dòng 32-37) thiếu case này, dữ liệu thật trả về "PURCHASE_REQUEST" →
   dòng 404/449 fallback in thẳng chuỗi thô, không màu không dịch, cạnh dòng khác có pill cam đẹp.
5. **[P1, lặp lại nhiều trang] N1 vi phạm ở hầu hết dashboard con của Kho** — `TodayInboxTab.tsx:334-358`
   4 `StatTile` đều `size="hero"` nhưng dùng MÀU (`tone="progress"`) để phân biệt 1 ô thay vì CỠ CHỮ —
   đúng phản-pattern N1/N2 cảnh báo. Ngược lại `ReceivingMovementView.tsx:410-413`/`ReportTab.tsx:209-234`
   không ô nào hero — không số nào nổi bật hơn số nào.

### Bảng tổng theo trang

| Trang | Trạng thái | Số điểm lệch |
|---|---|---|
| warehouse-today | Lệch nhẹ | 1 |
| warehouse-layout | **Lệch nặng** (có P0) | 5 |
| warehouse-items | Lệch nhẹ | 2-3 |
| warehouse-movement | Lệch nhẹ | 3 |
| warehouse-goods-issues | Lệch nhẹ (2 P1) | 4 |
| warehouse-delivery-notes | **Đạt** | 0 |
| warehouse-report | **Lệch nặng** (3 P1 cộng dồn) | 3 |
| receiving-detail / receiving-wizard (cùng 1 màn hình/state) | Lệch nhẹ | 2 |
| qc-inbound (alias → Kho·Nhập-Xuất·Chờ QC) | **Lệch nặng** (có P0) | 1 |

### Chi tiết bổ sung quan trọng

**B.A — Bin detail panel không dùng `Sheet` chuẩn**: click 1 ô kệ mở panel phải
(`WarehouseLayoutTab.tsx:712-720`, `<div className="fixed inset-y-0 right-0…">` tự viết tay) thay vì
`components/ui/sheet.tsx` — thiếu backdrop mờ, thiếu animation chuẩn, thiếu focus-trap. Xác nhận qua
`interactions/09-warehouse-layout-bin-clicked.png` (không thấy lớp phủ mờ nền). Cũng xác nhận CƠ CHẾ:
click trái → panel/drawer phải (không phải Popover iOS); click phải/long-press → Popover thao tác nhanh
(`WarehouseLayoutTab.tsx:658-709`) — long-press không có gợi ý UI trên mobile. Mức: P1.

**B.B — Tab "DANH SÁCH HÀNG" (9 cột) không card-list mobile** — `BinListView` (`WarehouseLayoutTab.tsx:935-984`),
`<table>` tự vẽ. Chưa xác nhận qua ảnh (bộ ảnh chỉ chụp sub-tab "SƠ ĐỒ KỆ" mặc định), chỉ qua code. P1.

**B.C — 3 Dialog thao tác nhanh trong `BinActions.tsx` nên là Sheet (N6)**: "Thêm hàng vào bin"
(dòng 454-590), "Rút hàng khỏi bin" (659-748), "Chuyển hàng từ bin" (757-931) — 3-4 trường nhưng dùng
`Dialog size="md"` giữa màn hình. Đáng chú ý: comment code dòng 871-872 tự ghi ý định "khớp mẫu... trong
**sheet** Xếp kệ" — code thực tế lại là Dialog, tự mâu thuẫn ý định thiết kế. Mức: P1.

**B.D — "Bin đích" trộn tiếng Anh** — xem A7 (đã gộp vào Nhóm A).

**B.E — [Đã kiểm tra, KHÔNG còn là lỗi]** Nghi "P0-3" card mobile Items thiếu Tồn kho (DOT6 #9) — code
`ItemListTable.tsx:466-480` xác nhận ĐÃ CÓ đủ "Tồn kho/Vị trí/Loại" — khớp với kết luận Nhóm D (agent D2)
đã xác nhận bằng ảnh crop. Tài liệu chuẩn cũ đang ghi nhận NHẦM là "vẫn còn".

**B.F — Filter "Tất cả/Đã gửi NCC/Nhận một phần" là 3 Button rời, không phải segmented (N7)** —
`ReceivingMovementView.tsx:428-450`, mỗi option 1 `<button>` riêng dùng MÀU phân biệt thay vì 1 khối nền
xám. Đối lập ngay trong CÙNG file `MovementTab.tsx:51-56` (nhóm "Nhập kho/Xuất kho/Chờ QC") làm ĐÚNG
(`bg-zinc-100 p-1 rounded-xl`). Sửa: áp lại cấu trúc đúng cho filter con này. Mức: P1.

**B.G — Vai trò `e2e.warehouse`**: `denied-attempt.png` GIỐNG HỆT PIXEL `dashboard.png` — xác nhận redirect
im lặng khi bị chặn quyền (khớp phát hiện A6, xảy ra qua `admin/layout.tsx:35` — không riêng route-guard
chính). Ảnh hưởng TOÀN HỆ THỐNG, được phát hiện qua nhiều nhóm độc lập (B, D1, G2).

**B.H — Trạng thái PO tiếng Anh thô, không màu trong trang Nhận hàng** — `receiving/[poId]/wizard/page.tsx`:
badge góc phải tự vẽ tay (dòng 492-507, không dùng `getStatus()`/`StatusBadge` chung) in thẳng "RECEIVED";
dòng 594 card "Thông tin PO" hiện plain text "RECEIVED" HOÀN TOÀN không màu — vi phạm N3 ngay trong trang
mà tài liệu chuẩn dùng làm MẪU THAM CHIẾU "PO detail đã đạt". Mức: P1.

**Điểm tốt cần giữ**: `warehouse-delivery-notes` đạt tuyệt đối. Segmented control ở `ItemsTab`,
`MovementTab` (khối trên), `QcPendingView` filter đều đúng chuẩn N7. EmptyState "Không có PO đang chờ
nhận" đúng chuẩn.

---

## 8. NHÓM D — BOM + Vật tư + Lô/Serial (từ audit-D1, audit-D2)

### Top 5 nghiêm trọng nhất — D1 (BOM)

1. **[P0] BOM Grid (`/bom/[id]/grid`) VỠ trên mobile** — bảng 13 cột `table-fixed` + cột "Thao tác"
   `sticky right-0`, KHÔNG card-list. Ở scroll-left=0/390px, cột "BOM gốc" (tên/SKU linh kiện — thông
   tin quan trọng NHẤT mỗi dòng) bị cột sticky đè gần hết, chỉ còn 1 ký tự hiển thị (verify bằng so khớp
   ký tự đầu từng dòng — khớp 100%). File: `components/bom-grid-pro/BomGridPro.tsx` (colgroup dòng
   1068-1087, sticky "Thao tác" dòng 917, ô "BOM gốc" dòng 657-673). Đây là trang TRUNG TÂM của cả module
   BOM, dùng hàng ngày.
2. **[P1] 3 màu nút chính KHÁC NHAU trong bộ dialog "Quick action" cùng `bom-grid-pro`** (đính chính gợi
   ý ban đầu): `PRQuickDialog.tsx:369` indigo (đúng); `WOQuickDialog.tsx:297` `bg-purple-600`;
   `SubcontractPOQuickDialog.tsx:315` `bg-orange-600` (KHÔNG phải violet như nghi vấn ban đầu — violet
   thật ra ở `ProgressCell.tsx:102-105`, 1 tông trạng thái Tiến độ, không liên quan). Vi phạm "1 màu
   thương hiệu duy nhất cho hành động chính".
3. **[P1][SHARED-risk] `ActionsCell.tsx` (cột Thao tác BOM Grid Pro, hàng trăm dòng/BOM)** — mọi nút icon
   đều `h-6 w-6` (24px), KHÔNG `aria-label` (chỉ `title`), KHÔNG override touch 44px. Vi phạm N5 trực
   tiếp. Đối chiếu: `RowActionsMenu` dùng chung ĐÃ có `[@media(pointer:coarse)]:h-10 w-10` nhưng
   `ActionsCell.tsx` (dòng 107-291) tự viết `DropdownMenu` riêng, kém hơn. File: dòng 108-230 (nhiều vị trí).
4. **[P1] Nút lọc "Tất cả" trên BOM List KHÔNG thật sự là "tất cả"** — server mặc định ẩn BOM
   OBSOLETE/"Ngừng dùng" khi không filter status cụ thể (`server/repos/bomTemplates.ts:66-77`). Hệ quả:
   Dashboard Planner báo "BOM 27" (tổng) trong khi BOM List "Tất cả" chỉ hiện "19 BOM" — lệch 8 BOM
   "Ngừng dùng" bị ẩn ngầm, user thấy 2 con số khác nhau không hiểu vì sao.
5. **[P1] Tab "Yêu cầu sản xuất" (engineering-wo-tab) có 2 lỗi**: (a) N1 — 4 KPI cùng cỡ chữ (lặp lại
   anti-pattern đã ghi ở Tài chính); (b) N7 — segmented-control filter style KHÁC "BOM List"/"Yêu cầu
   mua" cùng hub (2 tab kia pill fill-đen chuẩn, tab này outline nền indigo nhạt khi active) — 3 tab
   cùng 1 hub, 2 kiểu segmented-control khác nhau.

### Top 5 nghiêm trọng nhất — D2 (Vật tư/Lô-Serial)

1. **[P0] Màn "Lô/Serial" độc lập không còn hoạt động đúng — deep-link vỡ, mất ngữ cảnh.**
   `app/(app)/lot-serial/page.tsx:1-9` redirect cứng → `/warehouse?tab=lot-serial`;
   `app/(app)/warehouse/page.tsx:71-72` map cứng `"lot-serial"→"items"` → render `ItemsTab` KHÔNG lọc
   gì. Hệ quả: nút "Xem đầy đủ tại Lot/Serial →" trong tab Kho của trang chi tiết Vật tư
   (`components/inventory/ItemInventoryPanel.tsx:136-141`, trỏ `/lot-serial?itemId=...`) MẤT tham số
   `itemId` hoàn toàn — user bấm xem lô của ĐÚNG vật tư đang xem, bị đá ra toàn bộ 865 vật tư không liên
   quan. Đây là lý do cả 4 ảnh `lot-serial-list__*` thực chất là ảnh trang Items (đã xác minh bằng code).
2. **[P1] Tab "Kho" trong trang chi tiết Vật tư KHÔNG có dark mode** — `ItemInventoryPanel.tsx` và
   `InventoryKpiCards.tsx`: **0 class `dark:`** trong toàn bộ 2 file (grep xác nhận). Toàn bộ KPI +
   bảng "Lot gần nhất" luôn hiện theme sáng bất kể app đang dark. [SHARED] — `InventoryKpiCards` còn
   dùng ở `bom-grid-pro/InventoryPopover.tsx`.
3. **[P1] Bảng "Dùng trong BOM" không có card-list mobile** — `components/items/ItemBomUsagesPanel.tsx`
   (~180-250), bảng 5 cột, grep xác nhận KHÔNG có bất kỳ class responsive nào. Tương tự bảng "Lot gần
   nhất" trong `ItemInventoryPanel.tsx` (5 cột) cũng thiếu.
4. **[P1] Breadcrumb trang Lô/Serial chi tiết KHÁC NHAU giữa desktop và mobile, CÙNG 1 URL** — desktop
   hiện "Tổng quan / Lô / Serial / Chi tiết" (nhãn tĩnh cũ `breadcrumb-items.ts:54`, còn là LINK trỏ
   `/lot-serial` — bấm vào rơi đúng bug #1); mobile hiện "Tổng quan / Kho / Vật tư / 22194de1" (đã sửa
   tay đúng IA mới tại `lot-serial/[id]/page.tsx:89-97`).
5. **[P1] Stepper wizard Nhập Excel bị cắt chữ trên mobile 390px** — `components/items/ImportWizard.tsx:504`
   (`StepIndicator`, `h-12` cố định) trong khi label `text-base` bước 4 "Kết quả" word-wrap 2 dòng → dòng
   dưới bị cắt cứng, không đọc được.

### Bảng tổng theo trang

| Trang | Đánh giá | Số điểm lệch |
|---|---|---|
| bom-list / engineering-bom-tab | **Đạt** (đã xác minh lại segmented control pill đen đúng chuẩn) | 2 (P2) |
| bom-new | **Đạt** | 1 (P2 — breadcrumb mất ngữ cảnh hub) |
| bom-import | Lệch nhẹ | 1 (P1 — stepper mobile) |
| bom-detail / bom-grid (cùng 1 route) | **Lệch nặng** | 4 (1×P0, 3×P1) |
| engineering-wo-tab | Lệch nhẹ | 2 (P1×2) |
| engineering-pr-tab | **Đạt** — mẫu tốt nhất nhóm D (card-list N9 chuẩn, segmented đúng, CTA phân cấp rõ) | 0 |
| items-list | **Đạt** | 0 P0/P1, 3 P2 |
| items-new | **Đạt** | 0 |
| items-import | Lệch nhẹ | 1 P1, 1 P2 |
| items-detail | **Lệch nặng** | 1 P0, 2 P1, 2 P2 |
| lot-serial-list | **Lệch nặng** | vỡ deep-link (P0, = mục #1) |
| lot-serial-detail | Lệch nhẹ | 1 P1 (breadcrumb) |

### Chi tiết bổ sung quan trọng

**D.A — Dialog `WOQuickDialog`(5 field)/`SubcontractPOQuickDialog`(6 field) vượt ngưỡng N6, nên là Sheet**
— nhất quán với `BomLineSheet.tsx` (đã đúng Sheet cho sửa dòng). `AddBomLineDialog` (3 field: tìm linh
kiện + SL/bộ + Hao hụt%, KHÔNG phải 0-2 field như nghi vấn ban đầu) — borderline chấp nhận được (không
cuộn). `PicEditDialog` (3 field, gọn) — chấp nhận được cho thao tác lặp lại nhanh trên sàn xưởng. Mức: P1
cho 2 dialog đầu.

**D.B — Cột "THÀNH PHẨM" BOM List 100% rỗng vẫn chiếm cột** (N4, đã ghi từ trước, XÁC NHẬN LẠI vẫn còn
nguyên qua ảnh mới) — `components/bom/BomListTable.tsx`. P2.

**D.C — `lot-serial` deep-link: 3 file cần sửa cùng lúc** — `app/(app)/lot-serial/page.tsx:1-9` (redirect
không giữ query), `app/(app)/warehouse/page.tsx:71-72` (`resolveTab` không xử lý `itemId`),
`components/inventory/ItemInventoryPanel.tsx:136-141` (link nguồn). Mức: P0.

**D.D — Nhãn "Truy vết" dùng lặp cho 2 khối khác nhau** trên trang chi tiết Vật tư (accordion trong tab
"Thông tin" = checkbox Quản lý theo lô/serial; TAB "Truy vết" riêng = `BarcodeList` mã vạch) — dễ nhầm vị
trí cấu hình. File: `app/(app)/items/[id]/page.tsx:267,326-330`. Mức: P2.

**D.E — `StockCell` tự nối `row.uom` thay vì `formatUom()`** — `ItemListTable.tsx:388` — không lộ lỗi
hiện tại (enum UOM luôn hoa sẵn) nhưng vi phạm nguyên tắc 1 nguồn helper, rủi ro nếu có dữ liệu
import/legacy chữ thường. Mức: P2.

**D.F — Segmented control "Tất cả/Đang dùng/Ngừng dùng" (Items FilterBar) tự dựng tay** thay vì tái dùng
`<Tabs variant="segmented">` có sẵn — đúng hiển thị (N7) nhưng trùng lặp code, rủi ro trôi giao diện.
File: `components/items/FilterBar.tsx:173-207`. Mức: P2 (DRY).

**Điểm tốt cần giữ**: `engineering-pr-tab` là mẫu N9/N7 tốt nhất nhóm D. `BomLineSheet` dùng Sheet đúng
chuẩn N6. `items-new` (form full-page cho ~12 trường, hợp lý theo N6) không lỗi. `lot-serial-detail` rất
tốt (StatusPill, KPI, ngày giờ, dark mode) trừ 1 điểm breadcrumb.

---

## 9. NHÓM E — Sản xuất/Lệnh SX/Bảng SX/Gia công (từ audit-E)

### Top 5 nghiêm trọng nhất

1. **[P1][SHARED] Bảng "Lô thành phẩm đã nhập kho" (5 cột) mất cột trên mobile** — tab "Tiến độ" của
   trang chi tiết Lệnh SX, wrapper dùng `overflow-hidden` (KHÔNG PHẢI `overflow-x-auto`) → cột
   "Nhập lúc" bị CẮT MẤT hoàn toàn trên 390px, không cách nào xem. File:
   `app/(app)/work-orders/[id]/page.tsx:763-802` (wrapper dòng 765). Route dùng chung cho cả
   `/work-orders/[id]?tab=progress` lẫn `/assembly/[woId]`.
2. **[P1][SHARED] `BoardItemDialog` dùng Dialog thay vì Sheet cho 12 trường** — nút "+ Thêm mã hàng"
   trên Bảng sản xuất mở Dialog giữa màn `size="lg"` chứa 12 trường (mã hàng, RFQ, tên SP, khách hàng,
   công đoạn, SL kế hoạch/đạt, ĐVT, hạn giao, trạng thái, ghim, ghi chú) — vi phạm N6 rõ ràng. File:
   `components/production-board/BoardItemDialog.tsx:148-277` (xác nhận qua đọc code, không có ảnh dialog
   mở).
3. **[P2] Breadcrumb top bar sai nhãn khi vào `/operations?tab=assembly`** — breadcrumb ngoài hiện
   "Quy trình lắp ráp" nhưng nội dung + breadcrumb trong trang là "Yêu cầu sản xuất" (do
   `HIDDEN_FEATURES.legacyAssembly=true` lọc tab khỏi `OPERATIONS_TABS` khiến `resolveTab()` fallback về
   "requests", nhưng `HUB_TAB_LABELS` không biết tab đã ẩn nên vẫn gắn nhãn cũ). File:
   `app/(app)/operations/page.tsx:33-46` vs `lib/breadcrumb-items.ts:86-89`. Chỉ ảnh hưởng link/bookmark
   cũ vì nút tab đã gỡ khỏi UI.
4. **[P2, ghi chú phương pháp]** Ảnh "orders-list-empty" KHÔNG PHẢI EmptyState "Đơn hàng" — `/orders` bị
   `HIDDEN_FEATURES.salesOrder=true` redirect sang `/bom`; ảnh thực chất là BOM List đầy dữ liệu. Không
   có cơ hội xem EmptyState "Đơn hàng" thật trong bản hiện tại.
5. **[P2] "Pcs" viết thường 4 chỗ trong `BoardItemDialog.tsx`** (dòng 61,80,95,126, + placeholder 215)
   khác quy ước ĐVT viết HOA — đối chiếu `work-orders-new-lsx`/`work-orders-detail` dùng đúng "PCS" hoa.

### Kết luận dứt khoát về `deadlineTone()`

**LỖI ĐÃ ĐƯỢC SỬA — KHÔNG CÒN TỒN TẠI.** `app/(app)/production-board/page.tsx:380` — hàm nhận tham số
`status`, dòng 382-384 xử lý: nếu `status IN (COMPLETED, DELIVERED)` → trả màu xám trung tính, KHÔNG đỏ/
cam dù hạn đã quá ngày. Comment dòng 378-379 xác nhận bản vá có chủ đích (V4.1 UI-07). Xác nhận bằng ĐO
MÀU PIXEL THỰC TẾ (không chỉ nhìn mắt) trên ảnh desktop/mobile/dark: dòng "Đang GC" quá hạn → chữ ĐỎ
RGB≈(230,46,36); dòng "Hoàn thành"/"Đã giao" dù quá hạn rất lâu (so với hôm nay 30/09/2026) → chữ XÁM
ĐEN, không có pixel đỏ nào. Nhất quán trên cả mobile card-list và dark mode.

### Bảng tổng theo trang

| Trang | Đánh giá | Số điểm lệch |
|---|---|---|
| operations-requests-tab | **Đạt** | 0 |
| operations-assembly-tab | Lệch nhẹ | 1 (breadcrumb sai nhãn, chỉ ảnh hưởng link cũ) |
| production-board (bảng chính) | **Đạt** | 0 |
| production-board → Dialog "Thêm mã hàng" | **Lệch nặng** | 2 (P1 Dialog thay Sheet, P2 "Pcs") |
| work-orders-list | **Đạt** | 0 |
| work-orders-new-lsx | **Đạt** | 0 (bảng cramped mobile nhưng có `overflow-x-auto`+`min-w` đúng cách — chấp nhận được cho lưới nhập liệu) |
| work-orders-detail (tab "Phiếu LSX") | **Đạt** | 0 |
| work-orders-detail/assembly-detail (tab "Tiến độ") | **Lệch nặng** | 1 (P1, mất dữ liệu mobile) |
| assembly-list | Không audit riêng được — redirect chủ ý về operations-requests (V4.1 D10) | — |
| orders-list-empty | Không audit được như dự kiến — thực chất là BOM List do `HIDDEN_FEATURES` | — |

_Ghi chú ngoài phạm vi nhóm E (phát hiện phụ)_: BOM List (`components/bom/BomListTable.tsx`) trên mobile
chỉ hiện 3/8 cột bị cắt chữ, không chuyển card-list — cùng loại vi phạm N9, đã ghi nhận ở Nhóm D (§8).

---

## 10. NHÓM G — Quản trị + Dashboard/đăng nhập/tài khoản (từ audit-G1, audit-G2)

### Top 5 nghiêm trọng nhất — G1 (Admin)

1. **[P0] Rò rỉ tên trường backend thô "PRODUCTION_QTY_SCRAP" làm tiêu đề cột** trong "Báo cáo bộ phận ·
   Leaderboard" — `app/(app)/admin/reports/department/page.tsx:269-289` (fallback `?? k` dòng 277) +
   `SORT_OPTIONS_BY_ROLE` (dòng 21-47) thiếu entry cho role operator. Xem A14 (đã gộp Nhóm A).
2. **[P1] Mobile "Nhật ký hệ thống" ẩn hoàn toàn cột "Mã đối tượng" + "Thay đổi"** — admin dùng điện
   thoại KHÔNG THỂ xem nội dung đã thay đổi của bất kỳ sự kiện nào. File: `admin/audit/page.tsx:29`,
   `components/admin/AuditRow.tsx:106-130`. Xem A16.
3. **[P1] Trang "Mục tiêu KPI" có 3 TÊN KHÁC NHAU cho cùng 1 trang** + mô tả pha trộn tiếng Anh nặng:
   breadcrumb desktop "Chỉ tiêu" (`breadcrumb-items.ts:67`), breadcrumb mobile "Mục tiêu KPI"
   (`admin/reports/targets/page.tsx:84`), H1 "KPI Baselines / Mục tiêu năng suất" (dòng 86), mô tả
   "Set baseline cho mỗi (bộ phận × metric × period)..." (dòng 90-91).
4. **[P1][SHARED] Nhãn vai trò tiếng Anh/Việt lẫn lộn trong `UserForm`** — "Admin, Planner, Warehouse,
   Operator, Purchaser" tiếng Anh cạnh "QC/KCS, Màn hình TV, Kế toán, Cổ đông" tiếng Việt, dù
   `admin/users/page.tsx:28-39` đã có nhãn Việt hoá đầy đủ không được tái dùng. File:
   `components/admin/UserForm.tsx:24-58`.
5. **[P1] Mobile "Danh sách người dùng" ẩn hoàn toàn cột Vai trò, Đăng nhập cuối, Hành động** — chỉ còn
   Tên đăng nhập/Họ tên/Trạng thái. Vai trò là thông tin trọng yếu với admin. File:
   `admin/users/page.tsx:224-232,292-319`. Xem A16.

### Top 5 nghiêm trọng nhất — G2 (Dashboard/đăng nhập/tài khoản)

1. **[P0] Dashboard "Cần xử lý" báo ỔN ĐỊNH trong khi có 5 việc chờ duyệt thật** — xem A5 (root cause
   chính xác đã xác định, gộp vào Nhóm A).
2. **[P0] Trang 404 — tiêu đề biến mất hoàn toàn ở dark mode** — xem A17 (gộp vào Nhóm A, bẫy toàn hệ
   thống).
3. **[P1] `/login` desktop tràn ngang ~128px** — xem A18 (gộp vào Nhóm A).
4. **[P1] `/me/productivity` mobile — biểu đồ "Hoạt động theo ngày" trông trống rỗng** vì cột có dữ liệu
   (ngày 15-30, cao nhất) bị cuộn ngang ẩn ngoài màn hình, không gợi ý cuộn. File:
   `app/(app)/me/productivity/page.tsx:337-359` (`DailyChart`, `overflow-x-auto` + 30 item
   `min-w-[18px]` × 30 ≈ 540px > 358px khả dụng).
5. **[P1] `/me/settings` mobile — nhãn "Sáng / Tối / Theo hệ thống" vỡ chữ từng từ một** — row
   `flex items-center justify-between` không cho label wrap trước segmented control 3 nút. File:
   `app/(app)/me/settings/page.tsx:93-103`.

### Bảng tổng theo trang — G1 (Admin)

| Trang | Đánh giá | Số điểm lệch |
|---|---|---|
| admin-overview | Lệch nhẹ | 2 (P2×2) |
| admin-users (list) | **Lệch nặng** | 1 (P1, mất thông tin mobile) |
| admin-users-new | Lệch nhẹ | 1 (P1, gián tiếp qua UserForm) |
| admin-users-detail | **Lệch nặng** | 2-3 (P1×2 + 1 DRY) |
| admin-audit | **Lệch nặng** | 2 (P1+P2) |
| admin-reports-employee | **Lệch nặng** | 5 (P1×3 + P2×2) |
| admin-reports-department | **Lệch nặng** | 3 (P0×1 + P1×1 + P2×1) |
| admin-reports-targets | **Lệch nặng** | 1 tổ hợp lớn (P1, ảnh hưởng H1+breadcrumb+mô tả) |
| admin-settings | Lệch nhẹ | 3 (P1×1 + P2×2) |
| admin-settings-sessions | **Đạt** — mẫu TỐT cho card-list mobile, dùng làm khuôn | 0 |
| admin-settings-force-pw | **Đạt** | 0 |

### Bảng tổng theo trang — G2 (Dashboard/tài khoản)

| Trang | Đánh giá | Số điểm lệch |
|---|---|---|
| dashboard | **Lệch nặng** | 1 (P0, = A5) |
| dashboard-denied | **Lệch nặng** | 1 (P1, = A6) |
| board-tv | Lệch nhẹ | 1 (P2, chỉ mobile — tiêu đề đè số liệu, thiết kế riêng kiosk chấp nhận được ở desktop) |
| notifications | **Lệch nặng** | 2 (1 P1 gộp nhóm nhắc duyệt + 1 P2 dedupe dữ liệu test) |
| me-profile | Lệch nhẹ | 1 (P2 — tên bị cắt dù đủ chỗ) |
| me-settings | **Lệch nặng** | 3 (1 P1 vỡ chữ + 2 P2) |
| me-change-password | Lệch nhẹ | 1 (P2 — nav đầy đủ vẫn hiện trên trang "bắt buộc", không phải lỗ hổng bảo mật) |
| me-productivity | **Lệch nặng** | 1 (P1) |
| not-found-404 | **Lệch nặng** | 2 (1 P0 = A17 + 1 P1 file thứ 2 cùng lỗi) |
| finance-redirect | **Đạt** | 0 |
| login | **Lệch nặng** | 1 (P1, = A18) |
| interactions (cmdk/user-menu/hamburger) | **Đạt** | 0 |

### Chi tiết bổ sung quan trọng

**G.A — `me-productivity` mobile chart**: xem top-5 G2 #4. Sửa: auto-scroll container tới ngày gần nhất
khi mount trên mobile, hoặc thêm fade/chevron báo hiệu cuộn được, hoặc giảm `min-w` theo breakpoint.

**G.B — `me-settings` mobile label wrap**: xem top-5 G2 #5. Sửa: `flex-col gap-2 sm:flex-row
sm:items-center sm:justify-between`.

**G.C — `me-settings` lộ chuỗi kỹ thuật cho user cuối**: danh sách "Phiên đăng nhập" hiện nguyên văn user-
agent thô ("Mozilla/5.0...", "curl/8.18.0") — vi phạm N4. File: `me/settings/page.tsx:255-258`. Sửa: parse
UA thành tên trình duyệt/OS ngắn gọn. Mức: P2.

**G.D — `board-tv` mobile**: tiêu đề "BẢNG SẢN XUẤT" đè lên số liệu "12 ĐANG GC", bảng chỉ còn 2 cột
không gợi ý cuộn. Chấp nhận desktop/TV riêng biệt (kiosk, không qua AppShell, ngôn ngữ thiết kế navy
riêng hợp lý), nhưng mobile vẫn nên fix vì nhân viên có thể xem tạm trên điện thoại. Mức: P2.

**G.E — `me-change-password`**: nav đầy đủ 8 tab vẫn hiện trên trang "bắt buộc đổi mật khẩu" dù
server-side redirect đã chặn đúng mọi route khác quay về trang này (KHÔNG phải lỗ hổng bảo mật, chỉ là
UX mời bấm nhầm rồi bị bật lại). Đề xuất ẩn/disable top nav khi `mustChangePassword=true`. Mức: P2.

**G.F — `admin-reports-employee`**: 5 điểm lệch — "Export Excel" tiếng Anh (xem A15); action code thô
"LOGIN"/object type thô "session" không qua `actionLabel()`/`auditObjectLabel()` dù helper đã có sẵn
(`page.tsx:478,481`); "actions" tiếng Anh trong tooltip/nhãn (`page.tsx:421`,
`server/repos/employeeProductivity.ts:379`); biểu đồ "Hoạt động theo ngày" mobile không chỉ báo cuộn,
dữ liệu ở ngày 30 bị khuất ngoài màn hình đầu tiên.

**Điểm tốt cần giữ**: `admin/users/page.tsx` đã sửa ĐÚNG lỗi cũ "429 hiện thành EmptyState" (phân biệt
`isError` vs rỗng thật). `ResetPasswordDialog.tsx` là mẫu TỐT cho ConfirmDialog (nêu rõ hậu quả, phân cấp
màu amber→red hợp lý). `admin/settings/sessions` là mẫu TỐT cho mobile card-list thật từ đầu. Interactions
cmdk/user-menu/hamburger đều đạt chuẩn (overlay dim, phím tắt rõ, vùng chạm đủ lớn).

---

## 11. Tổng kết toàn hệ thống

### Số liệu

- **68 route/tab** đã chụp đủ 4 tổ hợp (desktop/mobile × light/dark) = ~300 ảnh, phủ 100% `page.tsx`
  trong `apps/web/src/app/(app)/**` + `login` + `me/**` + mọi tab `?tab=` của 4 hub (Thiết kế/Gia
  công/Thu mua/Kho) + Tài chính (tab con của Thu mua) + Admin (5 trang con) — đúng yêu cầu ban đầu
  "57+ trang". 3 route không audit được đúng như kỳ vọng vì bị `HIDDEN_FEATURES`/redirect chủ ý ẩn
  (`/orders`, `/assembly` list) — đây là hành vi có chủ đích của sản phẩm (V4.1 D10), không phải lỗi.
- **Kết quả**: Đạt 22 trang · Lệch nhẹ 21 trang · Lệch nặng 22 trang.
- **Số điểm lệch đếm được** (không tính trùng lặp giữa các nhóm khi cùng 1 vấn đề xuất hiện nhiều trang):
  - Nhóm A (component dùng chung — sửa 1 chỗ ăn nhiều trang): **18 mục** (A1-A18), trong đó **4 mục P0**
    (A5 Dashboard/chuông, A14 rò rỉ enum thô, A17 dark-mode h1 toàn hệ thống, cộng phần BOM Grid/QC mobile
    dẫn chiếu từ nhóm B/D), **9 mục P1**, **5 mục P2**.
  - Nhóm B (Kho): ~26 điểm (2 P0, phần lớn P1).
  - Nhóm C (Thu mua/PO/NCC): ~12 điểm (toàn P1/P2, không P0).
  - Nhóm C/PR (Đề xuất vật tư): ~12 điểm (2 P0, 6 P1, 4 P2).
  - Nhóm D (BOM/Vật tư/Lô-Serial): ~20 điểm (2 P0, phần lớn P1).
  - Nhóm E (Sản xuất/Gia công): ~7 điểm (0 P0 mới — 1 nghi vấn P0 cũ ĐÃ XÁC NHẬN HẾT, 2 P1, phần còn P2).
  - Nhóm F (Tài chính): đã "Apple hoá" tốt nhất hệ thống, chỉ còn 1-2 nợ nhỏ P2.
  - Nhóm G (Quản trị + Dashboard/tài khoản): ~28 điểm (2 P0 mới + 1 P0 đã gộp A-series, phần lớn P1/P2).

### 10 vấn đề lớn nhất toàn hệ thống (ưu tiên sửa trước, không theo thứ tự nhóm)

1. **[P0][A5]** Dashboard "Cần xử lý" báo ỔN ĐỊNH trong khi có ≥5 việc chờ duyệt thật (PO 27 triệu, PR
   chờ Giám đốc duyệt cuối) — root cause chính xác tại `app/api/dashboard/action-items/route.ts:52-58`.
2. **[P0][A17]** Trang 404 — tiêu đề biến mất hoàn toàn ở dark mode do global CSS `h1` ghi đè, không có
   `dark:` tường minh — bẫy có thể tái diễn ở bất kỳ `<h1>` mới nào trong toàn codebase.
3. **[P0][Nhóm D]** BOM Grid (`/bom/[id]/grid`, trang trung tâm dùng hàng ngày) vỡ hoàn toàn trên mobile
   — cột "BOM gốc" (thông tin quan trọng nhất) bị cột sticky "Thao tác" đè chỉ còn 1 ký tự.
4. **[P0][Nhóm B]** QC nhập kho — 2 nút "Đạt/Không đạt" (chức năng CỐT LÕI DUY NHẤT của trang) nằm ngoài
   màn hình mobile, không gợi ý cuộn — nhân viên QC dùng điện thoại không thể duyệt lô hàng.
5. **[P0][Nhóm B]** Sơ đồ kho — lưới ô kệ vỡ nặng trên mobile (DOT6 #13 kế thừa từ trước, vẫn chưa sửa).
6. **[P0][Nhóm D]** Deep-link "Xem đầy đủ tại Lot/Serial" từ trang chi tiết Vật tư hoàn toàn hỏng (mất
   `itemId`), đá user ra danh sách 865 vật tư không liên quan thay vì đúng lô đang xem.
7. **[P0][C.PR]** Tự mâu thuẫn tên gọi "Yêu cầu mua" (breadcrumb/tab) vs "Đề xuất vật tư" (H1) ngay trên
   cùng 1 màn hình `/engineering?tab=pr` — vi phạm trực tiếp quyết định V4.1 UI-28.
8. **[P0][G1]** Rò rỉ tên trường backend thô "PRODUCTION_QTY_SCRAP" làm tiêu đề cột trong Báo cáo bộ phận
   — cùng lớp lỗi với A14 (rủi ro tái diễn bất cứ khi nào thêm metric mới mà quên cập nhật nhãn).
9. **[P1][A18]** Trang `/login` (trang ĐẦU TIÊN mọi user thấy) tràn ngang 128px do khối trang trí thiếu
   `overflow-hidden`.
10. **[P1][A6+B.G+D1]** Redirect khi bị chặn quyền (`/?denied=1`) hoàn toàn im lặng, không toast — xác
    nhận qua 3 nhóm độc lập (G2, B, D1) trên 5/5 role test, không phải lỗi cục bộ 1 trang.

### Đường dẫn

- File chính: `plans/v4.4-ui/UI_INVENTORY.md` (tài liệu này).
- Thư mục ảnh (ngoài repo, không commit): `C:\Users\ASUS\AppData\Local\Temp\claude\c--dev-he-thong-iot\7c0e0492-2281-453b-97aa-d20b0da7ef8e\scratchpad\ui-inventory\`
  — thư mục con `B/`, `C/`, `D/`, `E/`, `F/`, `G/` (route sweep chính), `interactions/` (12 ảnh
  chức năng phụ), `roles/` (15 ảnh 5 role), `_state/` (storageState đăng nhập, không phải ảnh).
- Tham chiếu chuẩn: `plans/v4.3-design/APPLE_DESIGN_SYSTEM.md`, `plans/v4.2-finance/REVIEW_UI.md`,
  `docs/design-guidelines.md`.
