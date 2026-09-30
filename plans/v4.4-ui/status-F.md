# V4.4 UI — Trạng thái NHÓM F (Tài chính)

> Ghi lại theo yêu cầu "KHÔNG sửa UI_INVENTORY.md" — trạng thái xử lý các điểm lệch của
> `plans/v4.4-ui/UI_INVENTORY.md` (§6 phần F, §2.5 mục 5/11), `plans/v4.2-finance/REVIEW_UI.md`,
> `plans/v4.3-warehouse/FINANCE_UI_E2E.md §7` liên quan Tài chính.
> Ngày: 2026-10-01. Phạm vi: `components/finance/**`, `components/sales/OverviewTabLazy.tsx`.

## Đã sửa trong đợt này

1. **A12 (P1, SHARED)** — Segmented control 3 màu khác nhau trong hub Tài chính: migrate
   `OverviewTab.tsx` (7/30/90 ngày), `CashbookTab.tsx` (Tất cả/Thu/Chi), `InvoicesTab.tsx`
   (Tất cả/Đầu vào/Đầu ra), `PaymentsTab.tsx` (Tất cả/Thu/Chi + Chi cho NCC/Thu từ khách trong
   form), `ReceivablesTab.tsx` (Phải trả/Phải thu) sang `<Tabs><TabsList variant="segmented">`
   dùng chung — tất cả về đúng 1 màu active (nền đen/zinc-900, đảo ngược ở dark mode).
2. **A4 (P2)** — Thay toàn bộ `<input type="date">` còn sót trong Tài chính bằng `DateField`
   (dd/mm/yyyy nhất quán): `OverviewTab.tsx` (Từ/Đến), `CashbookTab.tsx` (Từ/Đến filter + ngày
   giao dịch + ngày chuyển quỹ), `InvoicesTab.tsx` (ngày phát hành + hạn thanh toán),
   `PaymentsTab.tsx` (ngày thanh toán), `InvoiceDetailSheet.tsx` (gia hạn thanh toán — đúng mục
   FINANCE_UI_E2E §7.4).
3. **A3 (P2)** — Format qua helper chung thay vì tự viết: `CashflowChart.tsx` (`fmtAxisDate` dùng
   `formatDate(d, "dd/MM")` từ `lib/format.ts` thay `toLocaleDateString` cục bộ — đúng file:line
   nêu trong UI_INVENTORY §A3); các đếm số nguyên (`total.toLocaleString("vi-VN")`) ở
   `CashbookTab.tsx`, `InvoicesTab.tsx`, `PaymentsTab.tsx`, `ImportTransactionsWizard.tsx` đổi
   sang `formatNumber()`.
4. **§6 (P2)** — `CategoriesTab.tsx`: ẩn mã kỹ thuật (`CHI_DIENNUOC`...) khỏi giao diện thường,
   chỉ còn lộ qua `title` khi rê chuột (đúng đề xuất "ẩn hẳn khỏi giao diện thường" của
   REVIEW_UI §1.11) — form Sửa/Thêm vẫn còn ô "Mã danh mục" khi tạo mới.
5. **§6 "Vấn đề MỚI"** — `DebtAgingPanel.tsx`: gỡ đoạn hover trùng lặp viết tay (comment cũ nói
   `.card-interactive` "vỡ build" — đã xác nhận class dùng chung ĐÃ vá cú pháp ambiguous từ
   trước), dùng lại `.card-interactive` cho card mobile clickable, tránh trôi giữa 2 nơi định
   nghĩa hover.
6. **Tự phát hiện thêm (không có trong 3 tài liệu đầu vào)**:
   - `InvoicesTab.tsx`: thêm `title=` cho tên đối tác bị `truncate` trên card mobile (desktop đã
     có, mobile thiếu — bất nhất).
   - `PaymentsTab.tsx`: bỏ nút CTA "Ghi nhận thanh toán" trùng tên trong `EmptyState` khi header
     đã luôn hiện nút cùng tên — đúng vướng mắc FINANCE_UI_E2E §7 mục 2 ("2 nút cùng tên").
   - `OverviewTabLazy.tsx`: khớp CHÍNH XÁC hình dạng skeleton loading (hero + 5 KPI + chart) với
     skeleton nội bộ thật của `OverviewTab` — trước đây lệch (4 KPI đơn giản) gây "nhảy" bố cục
     khi chunk tải xong.
   - `ReceivablesTab.tsx`: cập nhật lại JSDoc giải thích lý do dùng `Tabs variant="segmented"`
     thay vì `Button` pill-toggle cũ (đã lỗi thời từ trước khi A12 chốt chuẩn).

## Đã rà, KHÔNG cần sửa (xác nhận qua đọc code — đã đúng chuẩn từ trước)

- `AccountsTab.tsx`: grid responsive `sm:grid-cols-2 lg:grid-cols-3`, hit-area nút sửa 36px,
  "Ẩn nguồn" màu trung tính (không đỏ) — đã đúng REVIEW_UI §1.10 từ trước đợt này.
- `InvoiceDetailSheet.tsx`: card "receipt" 2 cột (Tổng tiền/Còn nợ), "Xem đơn mua liên quan" dạng
  Button outline full-width, `SheetFooter` cố định cho nút Huỷ — đã đúng §3.7 từ trước.
- `TransactionDetailSheet.tsx`: cùng pattern — đã đúng, không cần sửa.
- `PaymentsTab.tsx` (phần còn lại): avatar icon hướng Thu/Chi đầu dòng, empty-state mini cho khối
  phân bổ hoá đơn, "Tổng phân bổ" tách style khỏi input — đã đúng §2.6/§3.4/§1.8 từ trước.
- `AccountSourceSelect.tsx`: đã có icon/optgroup theo loại nguồn, dùng chung ở mọi form — đúng
  đề xuất §1.3 từ trước.
- `PartnerInvoicesDialog.tsx`: Dialog cho xem drill-down (không phải form nhập) — chấp nhận được
  theo §2.5, không đổi sang Sheet.

## KHÔNG xử lý ở đợt này (ngoài phạm vi cho phép của agent Tài chính)

- Thanh tab tràn ngang mobile khi 2 tầng tab (hub + sub-tab) chồng nhau (REVIEW_UI §1.9) — gốc ở
  `components/common/HubTabsNav.tsx`, ảnh hưởng TOÀN BỘ hub Thu mua (PO/NCC lẫn Tài chính), không
  phải file riêng của Tài chính — ngoài phạm vi file cho phép (`components/finance/**`,
  `OverviewTabLazy.tsx`, phần Tài chính `app/(app)/sales/**`). Không phát hiện tràn ngang thật
  trong ảnh chụp lại lần này ở cả 2 viewport/theme đã test.
- `globals.css` `.card-interactive` — đã XÁC NHẬN class dùng chung hoạt động đúng (không cần sửa
  file này), chỉ cần đổi phía component gọi (đã làm ở mục 5).
- Dữ liệu demo "Đã huỷ" chiếm tỷ lệ cao làm bảng Sổ quỹ trông xám (REVIEW_UI §1.2) — vấn đề dữ
  liệu, không phải UI; không tự xoá/sửa dữ liệu staging.

## Kiểm chứng

- `pnpm install --frozen-lockfile`: OK.
- `pnpm -r typecheck`: OK, 0 lỗi (4/4 package).
- `pnpm --filter @iot/web test`: OK, 46 test file / 732 test PASS.
- `pnpm --filter @iot/web build`: OK (cần export `DATABASE_URL`/`REDIS_URL`/`JWT_SECRET`/
  `SESSION_SECRET` qua tunnel 15432/16379 lúc build, không commit).
- `next start -p 4300` + login thật (`admin`/`ChangeMe!234`) qua `POST /api/auth/login` → cookie
  → `GET /sales?tab=fin-overview` = 200, `GET /items` = 200.
- Playwright: chụp 52 ảnh tại `...\scratchpad\ui-fix-F\` — 7 màn chính × desktop/mobile ×
  light/dark (Tổng quan, Sổ quỹ·Thu chi, Sổ quỹ·Hoá đơn, Sổ quỹ·Thanh toán, Công nợ (2 chiều),
  Tài khoản, Danh mục) + form/ngăn chi tiết (Phiếu chi, Chuyển quỹ, Tạo hoá đơn, Ghi nhận thanh
  toán, Thêm nguồn, Thêm danh mục, Chi tiết giao dịch, Chi tiết hoá đơn, Hộp thoại hoá đơn theo
  đối tác) ở desktop + mobile (light, +dark cho 1 vài màn). Đã xem từng ảnh, không phát hiện lệch
  mới sau khi sửa (1 lần bấm nhầm `<li>` điều hướng do selector script quá rộng — đã sửa lại
  script và xác nhận `PartnerInvoicesDialog` hoạt động đúng, không phải bug ứng dụng).
