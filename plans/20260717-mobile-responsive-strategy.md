# Plan: Chiến lược Responsive Mobile (sửa "to quá / khuất / chữ ép")

> Ngày: 2026-07-17 · Từ brainstorm agent + đối chiếu code · User báo: vào từng function/thông báo thì "size to quá, bị ẩn/khuất, chữ ép tràn lan".

## Chẩn đoán gốc rễ (KHÔNG phải do bảng list — M1 đã ổn)
1. **Xung đột mô hình cuộn + double-padding**: 26 file dùng `flex h-full flex-col overflow-hidden` giả định `<main>` cho đúng chiều cao viewport, NHƯNG `<main>` (AppShell) đã đệm `px-4` rồi trang lại `px-6` → double-padding ép cột nội dung; `h-full` trên mobile (100vh thanh địa chỉ co giãn) không đáng tin → nested-scroll kẹt → "ẩn/khuất/cắt".
2. **Overlay/portal width px cứng vượt viewport**: NotificationBell panel `w-[400px]` > màn 360px → tràn mép = "thông báo to quá, khuất". Dialog `w-full` không lề → dán sát cạnh.
3. **Typography/spacing/component khoá cứng desktop**, không scale mobile → "to quá". Ngược lại bảng detail `text-[11px]` quá nhỏ → "chữ ép".
4. **Bảng nhiều cột trang detail + form A4 `min-w-[760px]`** → cuộn ngang toàn phiếu = "khuất".

## Hướng đã chọn: KẾT HỢP C (nền) → B (bảng) → A (chỉ khi cần), tránh E (tách layout mobile = bẫy bảo trì).

## Đã làm — P0 + phần rẻ P1 (commit đợt này, V3.12.2)
- ✅ **NotificationBell** `w-[400px]` → `w-[calc(100vw-1rem)] max-w-[400px]`; list `max-h-[70vh] sm:max-h-[480px]`.
- ✅ **Dialog** (`ui/dialog.tsx`) `w-full` → `w-[calc(100vw-2rem)] sm:w-full` (có lề trên mobile).
- ✅ **Shell contract md-gated** cho các trang full-height: `flex h-full flex-col overflow-hidden` → `flex flex-col md:h-full md:overflow-hidden`; content `flex-1 min-h-0 overflow-auto/hidden` → `md:*`. Áp: notifications, engineering, warehouse, operations, sales, PR detail. Header `px-6` → `px-4 md:px-6` (bỏ double-padding).
- ✅ **Notification card thu nhỏ mobile**: p-4→p-3 md:p-4, icon 11→9 md:11, title text-base→text-sm md:text-base; filter pills `overflow-x-auto` + `shrink-0`.
- ✅ **Responsive heading nền** (globals.css): H1 `text-xl md:text-2xl`, H2 `text-lg md:text-xl`.

## Còn lại — P1 sâu + P2 nền (chưa làm, cần đợt sau, có QA in ấn)
- **P1-7 (card-list PR detail mục II)**: bảng 15 cột `[id]/page.tsx:585` → <md render card mỗi dòng vật tư (label-value); giữ `print:table` cho bản in A4 landscape (`@media print` :1040). Đây là màn duyệt nhiều nhất trên phone — ưu tiên cao đợt sau.
- **P1-8**: rà `min-w-[760px]` form A4 để header/thông tin chung không ép cuộn.
- **P2-9**: `<PageShell>` + `<PageHeader>` — nguồn padding + mô hình cuộn DUY NHẤT, thay ~26 file lặp.
- **P2-10**: `<DataList>` (table md+ / card-list mobile) tái dùng; sau đó cân nhắc container queries.
- **P2-11**: gộp 2 `<main id="main">` trùng (`app/layout.tsx:99` vs `AppShell.tsx:128`).
- **P2-12**: viết `docs/design-guidelines.md`: cấm width px cứng cho overlay; cấm `min-w-[>360px]` ngoài vùng overflow chủ đích; trang mới phải dùng `<PageShell>`; test ở 360×640.

## Nguyên tắc chống tái diễn
1. Một nguồn padding (main HOẶC trang, không cả hai).
2. Mobile = cuộn theo document; `h-full`/`overflow-hidden` chỉ bật từ `md`.
3. Overlay/portal: không width px cứng — dùng `w-[calc(100vw-δ)] max-w-[N]`.
4. Bảng ≥5 cột: mặc định card-list <md; `overflow-x-auto` chỉ cho ma trận thật sự cần (BOM grid, form in A4).
5. Typography theo thang responsive; tránh `text-[Npx]` rải rác.
6. Test ở 360×640 (Android phổ thông): không cuộn ngang body, không double-padding, overlay nằm trọn viewport.
