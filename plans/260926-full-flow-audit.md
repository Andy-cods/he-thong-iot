# Audit toàn luồng + kế hoạch sửa (2026-09-26)

Audit đọc code 5 mảng nghiệp vụ (Thiết kế/BOM, Thu mua/Tài chính, Kho, Sản xuất/QC,
Auth/RBAC/Dashboard) + 2 vòng UI/UX (bảng biểu, layout/form). Typecheck 4 package sạch,
72/72 unit test pass — lỗi dưới đây là lỗi **logic + giao diện**, không phải lỗi biên dịch.

Mã lỗi dùng để tham chiếu khi sửa. `✅` = đã sửa ở Đợt 1.

## Quyết định nghiệp vụ của user (2026-09-26)

1. **K12** — Hàng nhận về khi QC còn PENDING → **HOLD**, chỉ xuất khi QC đạt.
2. **W4** — Hoàn tất lệnh SX **cần nhập kho thành phẩm**, nhưng tính năng này **tạm ẩn**.
3. **K4** — Giao vật tư theo phiếu yêu cầu phải có **phiếu xuất kho riêng** (trừ kho, có số phiếu) để thống kê.
4. **Đơn hàng bán / ECO / Thiếu vật tư** — ẩn UI (giữ API + dữ liệu).
5. **S7** — Phiên đăng nhập **4 giờ** (1 ca).
6. Xoá trang/component cũ không dùng.

## Nhóm 0 — Bảo mật (P0)

- ✅ **S1** Reset mật khẩu user non-admin → vòng lặp redirect (trang đổi MK nằm dưới `/admin`). Đã chuyển sang `/change-password`.
- ✅ **S2** `/api/admin/{stats,users,audit,audit/export}` mở cho mọi role → giờ bắt buộc admin (`requireAdminCan`); `/api/admin/audit` cho non-admin chỉ khi lọc theo 1 đối tượng (`entity`+`objectId`).
- ✅ **S3** Open redirect `?next=` ở login.
- ✅ **S4** Middleware matcher thiếu `/production-board`, `/board`, `/me`, `/finance`… → guard role bị bỏ qua, client gửi được `x-pathname` giả. Matcher giờ phủ mọi trang UI.
- **S5** Guard role chỉ ở `(app)/layout` → chuyển trang client-side có thể không re-check (cần verify).
- **S6** Khoá user / đổi role không thu hồi phiên; `getSession` không check `isActive`.
- ✅ **S7** Phiên 4h, bỏ "Ghi nhớ 7 ngày" (không có tác dụng), 401 toàn cục → về `/login?reason=expired`.

## Nhóm 1 — Sai tiền / tồn kho (P0)

- ✅ **M1** Form thanh toán lọc hoá đơn ngược chiều; server không check chiều/NCC.
- **M2** Void 1 giao dịch sinh từ payment → hoá đơn vẫn PAID.
- ✅ **M3** Sửa PO: VAT 0% bị thành 8%.
- **K1** `ASSEMBLY_CONSUME` không có `fromBinId` → tồn theo bin không trừ, xuất lại được.
- **K2** Nhận hàng vào lot cũ CONSUMED → hàng không xuất được (cả adjust PLUS).
- **K3** Wizard nhận hàng retry sau lỗi 1 phần → nhận trùng.
- **K4** Material request DELIVERED không trừ kho; line update không scope theo phiếu.
- **K5** Huỷ/hoàn tất/xoá WO không nhả reservation.
- ✅ **K6** Nút xoá WO luôn `force=1` → giờ chỉ hiện cho DRAFT/CANCELLED, không force.

## Nhóm 2 — Luồng gãy (P1)

**Thu mua:** P1 convert PR→PO race tạo trùng · P2 wizard PO từ PR không đánh dấu CONVERTED, mất dòng free-text, giá 0 · P3 PO từ PR giá 0 · P4 sửa dòng PO mất spec/snapshotLineId/ETA · P5 không huỷ/đóng được PO · P6 nhận hàng không check trạng thái PO · P7 nhận đủ qua quét → PR không ghi goodsReceivedAt · P8 PO 2 dòng cùng mã không nhận được dòng 2 · P9 đơn hàng bán kẹt DRAFT · P10 mark-completed/issued không check điều kiện, sửa PR sau khi Kho duyệt.

**Kho:** K7 xuất nhanh Bán/Trả NCC bỏ qua duyệt · K8 "Rút hàng" trừ sai lot · K9 xuất không trừ reservation/không chặn HOLD · K10 transfer/adjust MINUS không lock → âm kho · K11 QC hold/release sai quyền · K12 hàng QC PENDING xuất được · K13 phiếu xuất ghi thiếu âm thầm, số phiếu COUNT+1 · K14 BBGH bị từ chối không làm lại được · K15 từ chối PO đã nhận 1 phần không hoàn tồn.

**Sản xuất:** W1 quét lắp ráp trừ kho với WO mọi trạng thái · W2 race số lượng khi quét · W3 pick thủ công trừ sai lot · W4 dialog hoàn tất bỏ SL/lot thành phẩm · ✅ W5 duyệt/từ chối không refresh (query key sai) · W6 báo cáo năng suất đọc bảng không ai ghi → 0 · W7 progress-log không check trạng thái/line thuộc WO khác · W8 DRAFT→IN_PROGRESS bỏ qua duyệt · W9 số WO COUNT+1 giờ UTC; ✅ đã xoá `/api/work-orders/quick` · W10 role QC không ghi được QC.

**BOM:** ✅ B1 đổi tên BOM inline luôn lỗi · B2 clone mất sheet Vật liệu/Quy trình · B3 thêm dòng rơi sang sheet PROJECT đầu · B4 mapping cột import vật tư vô tác dụng · B5 "chọn tất cả" xoá chỉ trang hiện tại · B6 xoá trắng uom/mô tả không có hiệu lực · B7 planner OBSOLETE BOM ACTIVE qua DELETE · B8 chống ghi đè item giả · B9 import dedup chặn retry · B10 Thu mua/PIC không sửa được ETA.

## Nhóm 3 — Hành vi sai / UX (P2)

Link dẫn vào trang bị chặn role / rơi filter · `/?denied=1` không báo gì · Command palette role cũ · KPI dashboard sai nhãn/công thức · thông báo lỗi hiện "không có", broadcast role không đánh dấu đọc được · breadcrumb link 404 · kho: tiến độ PARTIAL luôn 50%, báo cáo kho 100 item đầu · thu mua: KPI tính PO huỷ, "tỷ lệ đúng hẹn" sai công thức, hoá đơn không link PO · sản xuất: "Người lập" hiện tên người xem · BOM: filter chỉ trên trang, bulk-delete hiện cho role chỉ đọc · múi giờ UTC ở finance/receiving/assembly.

## Nhóm UI/UX

**Bảng biểu:** ✅ U1 tiền rút gọn "tr ₫" trong bảng tài chính · U2 7 hàm format tiền/10 hàm ngày · U3 số lượng thiếu đơn vị · ✅ U4 void thu/chi/thanh toán/hoá đơn không xác nhận · U5 lỗi API hiện thành "chưa có dữ liệu" · U6 cắt 100–200 dòng âm thầm · U7 thiếu dòng tổng · U8 thiếu xuất Excel · U9 badge trạng thái 3 hệ thống · U10 4 kiểu bảng, không sort · U11 click dòng không thống nhất · U12 tablet cắt cột · U13 trục biểu đồ dòng tiền.

**Layout/form:** U14 breadcrumb URL thô, lặp 2–3 lần · U15 nhiều h1 · U16 menu/tab bị cắt tablet · U17 6 kiểu tab, không lưu URL · U18 nút Quay lại sai · U19 ô tiền không phân cách nghìn · U20 lỗi form chỉ toast · U21 không cảnh báo rời trang · U22 Enter không submit · U23 dialog cao không cuộn · U24 `window.confirm/prompt` · U25 5 kiểu wizard, select gốc · U26 cỡ chữ 8–10px, hex cứng · U27 `spacing.0.5 = 4px` · U28 thuật ngữ Huỷ/Hủy, WO/LSX · U29 nút nhỏ ở xưởng · U30 không có `loading.tsx` · U31 a11y focus/aria · ✅ U32 link BBGH trong thông báo → 404.

## Kế hoạch

| Đợt | Nội dung | Trạng thái |
|---|---|---|
| 1 | S1–S4, S7, M1, M3, U1, U4, B1, W5, K6, U32, xoá trang cũ | ✅ DONE |
| 2 | Tồn kho: K1–K5, K8–K12, W1, W3, M2 + script đối soát tồn | TODO |
| 3 | Chứng từ: nhóm P, W, B còn lại | TODO |
| 4 | RBAC + điều hướng: S5, S6, nhóm 3 link/role, U14–U18 | TODO |
| 5 | Component chung: DataTable, QueryState, StatusBadge, PageHeader, UrlTabs, MoneyInput, useConfirm | TODO |
| 6 | Xưởng/tablet, design token, a11y, Việt hoá | TODO |

## Trang/component đã xoá (Đợt 1)

- Trang: `/bom/[id]/tree`, `/import`, 7 redirect `/bom/[id]/{assembly,eco,history,orders,procurement,shortage,work-orders}`, `/work-orders/quick-new`, `/procurement/purchase-requests/new`, `/orders/new`.
- API: `/api/work-orders/quick` (tạo lệnh bỏ qua duyệt), `/api/dashboard/overview` (mock, không dùng).
- Component: `components/eco/*`, `components/shortage/*`, `EcoPanel`, `ShortagePanel`, `BomSnapshotPanel`, `BottomPanel`, `useBottomPanelState`, `layout/Sidebar`, `warehouse/OverviewTab`, `warehouse/LotSerialTab`, `receiving/EtaProgressBar`, `procurement/ConvertPRDialog`, `operations/AssemblyTab`, `bom/BomFilterBar`, `MaterialRequirementsTable`, `RoutingPlanEditor`, `orders/OrderFilterBar`, `orders/OrderListTable`, `domain/OrdersReadinessTable`, hooks `useEco`, `useShortage`, `useDashboardOverview`, `lib/dashboard-mocks`.
- **Giữ lại** `/orders/[code]` + panel Đơn hàng trong BOM workspace: vẫn gắn với BOM snapshot/sản xuất — cần user quyết lại trước khi ẩn.
- **Giữ lại** component QC (`QcChecklist`, `QcChecklistEnriched`) chờ quyết định W10.
