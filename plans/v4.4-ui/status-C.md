# V4.4 UI — NHÓM C (Thu mua: PO + Nhà cung cấp + nhận hàng từ PO) — trạng thái

> Agent UI thực hiện trong worktree riêng (`agent-ae151cf1bfff98415`), KHÔNG push/merge sang nhánh khác.
> Phạm vi: `app/(app)/procurement/purchase-orders/**`, `app/(app)/suppliers/**`,
> `app/(app)/sales/**` (chỉ tab PO + Nhà cung cấp), `components/sales/POTab*`,
> `SuppliersTab*`, `components/suppliers/**`, `components/procurement/**` (phần PO,
> KHÔNG đụng PR), `app/(app)/receiving/[poId]/wizard/**`.

## Đã xử lý (từ `plans/v4.4-ui/UI_INVENTORY.md` §6 + §2.5 phần C)

- [x] `suppliers-new` full-page → `SupplierFormSheet` (Sheet chuẩn `size="lg"`, header nav
      "Huỷ · Thêm nhà cung cấp · Tạo nhà cung cấp"). Route `/suppliers/new` giữ lại redirect
      sang `/sales?tab=suppliers&new=true` (tương thích bookmark cũ). `/suppliers?...` redirect
      sang `/sales` nay CHUYỂN TIẾP nguyên vẹn mọi query param (trước làm mất hết).
- [x] `suppliers-detail` inline-edit (rounded-2xl giữa trang) → cùng `SupplierFormSheet` (mode="edit").
- [x] POTab 4 StatTile cùng cỡ → tile "Tổng giá trị" lên `size="hero"` (N1).
- [x] SuppliersTab cột Điện thoại/Email 100% rỗng trên trang hiện tại → ẩn hẳn cột (N4).
- [x] SuppliersTab segmented 3-mode (Tất cả/Đang dùng/Ngừng dùng) tự vẽ → migrate sang
      `<Tabs><TabsList variant="segmented">` dùng chung (A12).
- [x] Header mobile `po-new` vỡ dòng "Quay lại danh sách" → thêm `flex-wrap` + `min-w-0` (X6).
- [x] `PoCreateWizard.tsx` rounded-2xl lẫn rounded-xl → đồng nhất `rounded-xl` (C.H).
- [x] Breadcrumb "Trang chủ" → `ROOT_LABEL` ("Tổng quan") ở `suppliers/[id]/page.tsx` (A11/C.G).
- [x] `suppliers-detail` header: tên NCC dài + nút cùng hàng ép chữ → `flex-col sm:flex-row` (C.J).
- [x] Tên gọi "Yêu cầu mua" → "Đề xuất vật tư (PR)" tại `PoCreateWizard.tsx`,
      `purchase-orders/new/page.tsx` (C.A, phần nằm trong file PO thuộc nhóm C).
- [x] Receiving wizard: badge trạng thái PO tự vẽ in thẳng "RECEIVED"/"PARTIAL" (header +
      card "Thông tin PO" + thông báo "PO đã RECEIVED") → `StatusPill domain="po"` (B.H).
- [x] A3 (format dùng chung): thay `.toLocaleString("vi-VN")`/`.toFixed()` cục bộ bằng
      `formatNumber`/`formatQty`/`formatMoney`/`formatPercent` tại POTab, SuppliersTab,
      suppliers/[id] (thống kê PO), `PoLineEditor`, `PoDraftLinesEditor`, `PoLinesTable`,
      `PoQuickReceiveTable`, receiving wizard. Bỏ hậu tố "VND" ghép tay trong `PoLineEditor`.
- [x] Bổ sung theo yêu cầu chủ xưởng (rà toàn bộ phiếu điền trong phạm vi):
  - `PoLineEditor` (dòng hàng PO wizard bước 2): thêm card-list mobile (trước chỉ có bảng
    cuộn ngang), giữ bảng cho desktop/tablet.
  - `PoInvoicePanel` ("Tạo HĐ mua từ PO"): `<input type="date">` → `DateField`; thêm dấu `*`
    bắt buộc (Số hoá đơn NCC, Tạm tính); căn phải tabular-nums cho ô Tạm tính/VAT%.
  - `PoCreateWizard` bước 3 "Ngày dự kiến nhận": `<input type="date">` → `DateField`; thêm
    cảnh báo `beforeunload` khi đã có tiến triển (qua bước 1/chọn NCC/thêm dòng) nhưng
    chưa tạo PO.
  - `PoLinesTable` (Điều chỉnh giá trong PO detail): thêm `ConfirmDialog` "Huỷ thay đổi giá?"
    khi bấm Huỷ/Esc lúc đã sửa giá nhưng chưa lưu (trước đóng êm, mất dữ liệu không cảnh báo).
  - `SupplierForm`/`SupplierFormSheet`: thêm cảnh báo đóng khi form đang dirty (Huỷ/Esc/click
    nền) qua `onDirtyChange` + `useConfirm`.
  - Receiving wizard: thêm cảnh báo `beforeunload` khi đã nhập SL/lô nhưng chưa gửi.
  - `PoDetailHeader` (duyệt/từ chối/gửi NCC/huỷ/đóng PO): đã dùng `useConfirm`/`usePrompt`
    dùng chung sẵn + disable nút khi đang xử lý — rà xong, KHÔNG cần sửa thêm.

## Đã rà, quyết định KHÔNG sửa (lý do)

- POTab status filter chips (nền đen cho "Tất cả", màu theo `tone` cho từng trạng thái) —
  KHÔNG migrate sang `Tabs variant="segmented"` dùng chung vì đây là bộ lọc đa trạng thái có
  tô màu riêng theo nghiệp vụ (khác segmented control đổi-view đơn thuần); migrate sẽ MẤT khả
  năng tô màu theo trạng thái. UI_INVENTORY.md tự ghi "có thể giữ tạm" cho trường hợp này.
- `ConvertPRToPODialog.tsx`, `MarkPrIssuedDialog.tsx` (có `toLocaleString`/`toFixed` cục bộ) —
  chỉ được dùng từ `purchase-requests/[id]/page.tsx` (trang PR, nhóm khác phụ trách) — không sửa
  để tránh đụng phạm vi/xung đột với agent PR.
- `components/bom/ItemPicker.tsx` Popover rộng cố định 360px có thể hơi tràn trên card mobile
  390px (padding 12px×2) — component dùng chung ngoài phạm vi (`components/bom/*`), Radix tự
  xử lý va chạm biên nên không chặn thao tác; không sửa.
- "Nhóm trường inset grouped" (chuẩn mới chủ xưởng bổ sung): giữ nguyên kiểu "section header +
  divider" hiện có của `SupplierForm` (không có mẫu "inset grouped" iOS-card nào khác trong app
  để theo cho nhất quán — tạo mới sẽ gây lệch chuẩn ngược).
- `beforeunload` chỉ chặn đóng tab/refresh, KHÔNG chặn điều hướng nội bộ Next.js (Link/router.push)
  vì đó là giới hạn kỹ thuật (Next.js router không có hook "trước khi rời trang" built-in đơn giản
  mà không đụng code dùng chung) — ghi nhận là giới hạn đã biết, không chặn release.

## Build/test

- `pnpm install --frozen-lockfile`, `pnpm -r typecheck`, `pnpm --filter @iot/web test`
  (732 tests) đều xanh sau khi hoàn tất.
- `next build` + `next start -p 4200` với staging DB/Redis qua tunnel 15432/16379: build thành
  công, login `admin`/`ChangeMe!234` qua `/api/auth/login` → cookie hợp lệ → GET `/items`,
  `/procurement/purchase-orders`, `/suppliers` đều 200.
- Playwright chụp lại desktop 1440×900 + mobile 390×844 × light/dark cho toàn bộ trang trong
  phạm vi (PO list/new/detail, Suppliers list/new/detail/edit, receiving wizard) + bước 2/3 của
  PO wizard + trạng thái "Điều chỉnh giá" + dialog "Huỷ thay đổi giá?" — so khớp ảnh cũ, không
  phát hiện lệch mới ngoài các điểm đã liệt kê ở trên.
