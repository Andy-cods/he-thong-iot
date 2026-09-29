# V4.3 — Hệ thiết kế "Apple-inspired" cho toàn bộ MES (songchau.vn)

> Vai trò tài liệu: chuẩn tham chiếu KHI SỬA UI từ nay — thay thế dần các quy tắc rải rác trong
> `docs/design-guidelines.md` (giữ nguyên §12 Responsive Mobile, không đổi) và cụ thể hoá phần
> "Apple style" đã áp cho Tài chính (`plans/v4.2-finance/REVIEW_UI.md`) thành chuẩn TOÀN HỆ THỐNG.
>
> Nguồn bằng chứng: ảnh chụp THẬT `https://mes.songchau.vn` (tài khoản `admin`), desktop 1440×900 +
> mobile 390×844, ngày 2026-09-30, lưu tại scratchpad phiên làm việc (không commit repo):
> `…/scratchpad/design-audit/shots/` (44 ảnh: dashboard, Ctrl+K, chuông thông báo, BOM List, phiếu
> ĐNVT, Bảng sản xuất, PO detail, Sơ đồ kho, admin users…) + `…/scratchpad/ui-audit/shots*/` (29 ảnh
> Tài chính, đã phân tích chi tiết trong `REVIEW_UI.md`) + `plans/v4.1-audit-hoan-thien/DOT6_PLAN.md`
> (audit toàn hệ thống 2026-09-27, file:line cụ thể cho từng lỗi, phần lớn đã sửa ở Đợt 6A/6B).
> Script chụp chỉ điều hướng + mở/đóng overlay, không bấm Lưu/Xoá/Tạo; không commit vào repo.
>
> Nền tảng đã có (giữ nguyên, không viết lại từ đầu): `apps/web/tailwind.config.ts` (zinc + indigo-600,
> V2 Linear-inspired), `apps/web/src/app/globals.css` (token `--bg-page/--text-primary/--accent/...`,
> dark mode đầy đủ), `apps/web/src/lib/status.ts` (6 tone chuẩn: neutral/info/progress/success/
> warning/danger — ĐÃ đúng tinh thần "màu ngữ nghĩa tiết chế" của Apple, không cần đổi), `components/
> ui/*` (Sheet, Dialog, DropdownMenu, Popover, Tooltip, Tabs, Breadcrumb, ConfirmDialog+useConfirm,
> EmptyState, StatusPill, DataTable — đã qua 1 vòng chuẩn hoá Đợt 6, xem `DOT6_PLAN.md`).
>
> **Đã xác nhận qua ảnh 2026-09-30**: Dashboard KHÔNG còn "cầu vồng" (X8 đã áp — thẻ trắng viền zinc,
> số đen), Bảng sản xuất mobile đã có dạng thẻ đủ cột (không còn chỉ 2 cột), BOM List/PO list/PO detail
> đã sạch, nhất quán. Tài liệu này KHÔNG lặp lại việc đã xong — chỉ nêu việc còn thiếu để đạt chuẩn
> Apple thật sự (không chỉ "sạch, phẳng" mà còn "phân cấp rõ, có chiều sâu, mọi chi tiết phụ đều chỉn chu").

---

## 0. Cách đọc tài liệu này

- §1 = nguyên tắc (why). §2 = token (nguyên liệu). §3 = chuẩn từng loại "chức năng phụ" theo đúng
  yêu cầu chủ xưởng (popover, dropdown, menu ⋯, dialog xác nhận, toast, badge, bộ lọc, tìm kiếm,
  phân trang, tooltip, form phụ, empty/loading/error, bảng, số liệu, ngày tháng, tab, breadcrumb,
  chuông thông báo). §4 = wireframe mẫu. §5 = danh sách việc theo độ ưu tiên P0→P2.
- Ký hiệu ✅ Đúng / ❌ Sai kèm nguồn ảnh + file:line khi xác định được.

---

## 1. Nguyên tắc (10, cụ thể cho app này — không chép HIG máy móc)

### N1. Một số quan trọng nhất mỗi màn hình phải NẶNG HƠN hẳn số phụ

Apple Health/Stocks: 1 con số lớn nhất thu hút mắt trước, phần còn lại phụ trợ. App hiện có xu hướng
"6 thẻ KPI bằng nhau" ở nhiều dashboard.

- ❌ Sai: `plans/v4.2-finance/REVIEW_UI.md` §1.1 — `OverviewTab.tsx` 6 thẻ KPI cùng `text-xl`, cùng viền
  zinc-200, mắt không biết nhìn đâu trước (`desktop-01-overview.png` trong audit Tài chính).
- ✅ Đúng (đã có sẵn, dùng làm mẫu): Dashboard tổng (`desktop-01-dashboard.png` 2026-09-30) — khối
  "Tổng quan gia công" ở trên cùng có icon+tiêu đề lớn riêng biệt, tách khỏi 3 số phụ bên phải (Lệnh
  đang chạy/Linh kiện/PR chờ) — đây CHÍNH LÀ cấu trúc hero-vs-phụ, chỉ cần nhân rộng sang Tài chính,
  Kho, PO (mỗi trang tổng quan chọn đúng 1 chỉ số quan trọng nhất làm hero).
- Áp dụng: `StatTile` (`components/ui/data-table.tsx:410-469`) hiện tất cả thẻ cùng cỡ `text-xl` — cần
  thêm biến thể `size="hero"` (`text-3xl font-bold`, chiếm rộng hơn) dùng 1 lần/trang.

### N2. Phân cấp = kích thước + trọng lượng chữ, KHÔNG phải thêm màu

Giữ nguyên nguyên tắc "tiết chế màu" đã có (X8, `lib/status.ts`) — không dùng thêm màu để nhấn mạnh,
dùng `text-3xl font-bold` cho số chính, `text-sm text-zinc-500` cho phụ. Toàn hệ thống đã tốt về
KPI-không-cầu-vồng (ảnh `desktop-01-dashboard.png`, `desktop-12-production-board.png`: nền trắng viền
zinc, pill trạng thái theo `StatusPill` 6 tông) — nguyên tắc này giờ là bảo trì, không phải sửa lớn.

### N3. Trạng thái phải đi kèm 2 kênh trở lên (màu + icon/chữ), KHÔNG BAO GIỜ chỉ màu

Đã đúng ở `StatusPill` (label + màu, `dot` tuỳ chọn). Rủi ro còn lại là nơi TỰ vẽ màu ngoài
`StatusPill`:

- ❌ Còn nghi vấn (cần xác minh code, chưa chụp lại được sau Đợt 6): `production-board/page.tsx:374`
  `deadlineTone()` — DOT6_PLAN #7 ghi nhận hạn đỏ cho CẢ dòng "Đã giao/Hoàn thành". Ảnh
  `desktop-12-production-board.png` (2026-09-30) cho thấy cột HẠN vẫn hiển thị màu đỏ/cam đồng loạt ở
  nhiều dòng "Hoàn thành"/"Đã giao" lẫn "Đang GC" — cần xác nhận lại `deadlineTone(deadline, status)`
  đã nhận tham số `status` chưa; nếu chưa, đây là P0 kế thừa từ DOT6 vẫn còn tồn tại.
- ✅ Đúng: `StatusPill` mọi nơi khác (BOM List, PO list, admin users) — 1 màu + 1 nhãn chữ đầy đủ,
  không rút gọn bằng chấm màu đơn thuần.

### N4. Progressive disclosure: ẩn số ít dùng, hiện đúng lúc cần

Apple: không nhồi hết thông tin vào 1 màn; ẩn sau tap/hover có chủ đích.

- ❌ Sai: `plans/v4.2-finance/REVIEW_UI.md` §1.11 — mã kỹ thuật (`CHI_DIENNUOC`) hiện thường trực
  ngang hàng tên hiển thị, trong khi user cuối không cần thấy.
- ❌ Sai: `desktop-05-eng-bom-list.png` — cột "THÀNH PHẨM" toàn bộ 19 dòng đều hiện `—` (không có dữ
  liệu) nhưng vẫn chiếm 1 cột đầy đủ độ rộng — nên ẩn cột khi 100% rỗng (đã ghi nhận ở DOT6 §2.2).
- ✅ Đúng: `RowActionsMenu` (`data-table.tsx:356-402`) đã gom hành động phụ vào "⋯", chỉ lộ hành động
  chính (icon mắt xem, bút sửa) — đúng tinh thần "1 hành động chính lộ ra, còn lại ẩn sau menu".

### N5. Vùng chạm ≥44px trên thiết bị chạm; icon-only luôn có `aria-label`

- ✅ Phần lớn đã đạt (`RowActionsMenu` có `[@media(pointer:coarse)]:h-10 w-10`, override 40px cho
  màn cảm ứng — đúng chuẩn Apple 44pt quy đổi ~40-44px CSS tuỳ mật độ điểm ảnh).
- ❌ Còn sót: `plans/v4.2-finance/REVIEW_UI.md` §1.10 — nút sửa (bút chì) trên card Tài khoản không
  có nền/hit-area rõ; §1.4 hoá đơn nút "+HĐ đầu vào/+HĐ đầu ra" là 2 nút text dài hàng ngang trên
  mobile hẹp thay vì gộp.

### N6. Overlay đúng ngữ cảnh: Sheet (bên phải) cho form nhập liệu có cấu trúc, Dialog (giữa) CHỈ cho
xác nhận/cảnh báo ngắn hoặc wizard

Đây là nguyên tắc kiến trúc quan trọng nhất còn thiếu nhất quán trong TOÀN hệ thống, không riêng Tài
chính:

- ❌ Sai (đã phát hiện ở Tài chính, NHƯNG cùng pattern lặp lại ở nơi khác chưa audit hết): form
  "Tạo/Sửa" dùng `Dialog` giữa màn hình trong khi xem chi tiết dùng `Sheet` bên phải — 2 ngôn ngữ
  tương tác cho 2 nhóm thao tác liên quan. Xem `REVIEW_UI.md §1.3, §1.5, §1.8, §2.5` (đã có spec sửa
  chi tiết, medium/large Sheet theo độ phức tạp form).
- ✅ Đúng (giữ nguyên, KHÔNG đổi): `DialogConfirm`/`ConfirmDialog` cho xác nhận phá huỷ (`type-to-
  confirm`), Import Excel wizard 3 bước dùng `Dialog` (nội dung không phải "form field theo đối
  tượng", đúng để giữ Dialog theo `REVIEW_UI.md §2.5`).
- **Quy tắc chốt cho TOÀN hệ thống** (không chỉ Tài chính): mọi form "Tạo mới / Sửa 1 đối tượng
  nghiệp vụ" (PR, PO, User, Item, Supplier, Category, Account, BOM meta…) nên dùng `Sheet`. `Dialog`
  chỉ còn 3 việc: (1) xác nhận ngắn (Có/Không, type-to-confirm), (2) wizard nhiều bước, (3) form
  1-2 trường cực ngắn không cần cuộn (VD "Đổi tên nhanh").

### N7. Segmented control cho bộ lọc loại trừ lẫn nhau; KHÔNG dùng nhiều Button rời

- ❌ Sai: `REVIEW_UI.md §1.1, §1.9` — 3 nút "7/30/90 ngày" và 2 nút "Phải trả/Phải thu" là các
  `<Button>` rời viền riêng lẻ, trong khi về hành vi chúng loại trừ lẫn nhau (chỉ chọn 1) — đúng
  định nghĩa segmented control.
- ✅ Đúng (mẫu chuẩn có sẵn, nhân rộng): pill "Tất cả/Thu/Chi" ở Sổ quỹ, segmented "Tất cả/Nháp/Đang
  dùng/Ngừng dùng" dạng pill đen ở BOM List (`desktop-05-eng-bom-list.png` — nút "Tất cả" nền đen
  chữ trắng, các nút khác viền nhạt) — đây CHÍNH LÀ segmented control kiểu Apple đã tồn tại, chỉ cần
  định nghĩa thành 1 component `SegmentedControl` dùng `Tabs`/`TabsList` có biến thể pill (hiện
  `tabs.tsx` chỉ có style underline, chưa có style pill nền xám) và áp lại cho 3 chỗ đang dùng Button
  rời.

### N8. Số liệu: tabular-nums, căn phải trong bảng, đơn vị nhất quán

Đã có `.tabular-nums` (`globals.css:474-478`) và `formatMoney/formatQty` (`lib/format.ts`, xem
DOT6 X3) — nguyên tắc đã đúng phần lớn. Còn thiếu: icon hướng (↗/↘) đặt trước số tiền ở bảng Sổ quỹ +
list Thanh toán (`REVIEW_UI.md §2.4`), và đơn vị đo (PCS/SET/Pcs) vẫn lẫn lộn ở vài nơi theo DOT6 X3
(`formatQty` đã định nghĩa nhưng chưa áp hết — cần audit lại các trang chưa chuyển).

### N9. Card-list thay bảng dày đặc trên mobile — áp dụng ĐỦ, không được sót

Quy tắc §12.4 đã có trong `docs/design-guidelines.md` VÀ đã implement chuẩn trong `DataTable`
(`components/ui/data-table.tsx:218-317`, tự chuyển thẻ khi <md) — nhưng bảng nào KHÔNG dùng
`DataTable` (tự viết `<table>` riêng) vẫn có nguy cơ vỡ mobile:

- ❌ Sai xác nhận lại 2026-09-30: `mobile-21-wh-layout.png` — lưới sơ đồ kệ kho vẫn render dạng lưới
  ngang nhiều cột, cột bên phải bị cắt nửa chữ ("Tr…", tầng 3) không có chỉ báo cuộn ngang rõ ràng —
  đúng loại lỗi DOT6 #13 đã nêu (`WarehouseLayoutTab.tsx`), CHƯA được vá triệt để cho mobile dù màu
  đã tiết chế đúng (đã chuyển 1 thang indigo, xem N3-kế-bên).
- ❌ Sai xác nhận lại: `mobile-18-wh-items.png` — card Vật tư có mã + tên + badge "Đang dùng" nhưng
  KHÔNG thấy số tồn kho trên card (đúng lỗi DOT6 #9 "phone ẩn cột Tồn kho" — vẫn còn nguyên).
- ✅ Đúng (mẫu chuẩn): `mobile-14-sales-po-list.png` — card PO đầy đủ NCC/Tổng/Duyệt/Ngày giao + hàng
  "Cộng trang này" cuối danh sách, đúng pattern `DataTable` mobile.

### N10. Vibrancy/material có chừng mực: nền mờ (backdrop-blur) CHỈ cho overlay nổi trên nội dung
đang cuộn, KHÔNG dùng cho card tĩnh

- ✅ Đúng, giữ nguyên: `DialogOverlay` dùng `backdrop-blur-[2px]` nhẹ (`dialog.tsx:30`) — đúng liều
  lượng Apple (không blur nặng gây giật trên tablet công nghiệp, đúng với ràng buộc hiệu năng đã ghi
  trong `docs/design-guidelines.md` §2.5 cũ).
- Chưa có, nên thêm 1 chỗ: header ngày nhóm giao dịch sticky trong Sổ quỹ nên dùng
  `bg-zinc-50/80 backdrop-blur-sm sticky top-0` khi cuộn qua nhiều nhóm ngày (`REVIEW_UI.md §3.2`) —
  đây là use-case ĐÚNG cho vibrancy (label nổi trên nội dung cuộn bên dưới), không lạm dụng thêm nơi
  khác.

---

## 2. Design tokens — so với hiện có, chỉ bổ sung tối thiểu (không phá trang cũ)

Nguồn hiện tại: `apps/web/tailwind.config.ts` (V2 Linear-inspired, zinc + indigo-600) +
`apps/web/src/app/globals.css` (CSS var `--bg-page/--text-primary/...`, dark mode đầy đủ qua
`[data-theme="dark"]`). Không đổi hệ màu nền (zinc) hay accent (indigo) — đã phù hợp: trung tính,
1 màu thương hiệu, không "cầu vồng". Chỉ 4 thay đổi tối thiểu:

### 2.1 Typography — GIỮ NGUYÊN scale, chỉ thêm quy ước SỬ DỤNG

Không thêm size mới. `fontSize` hiện có (`tailwind.config.ts:176-188`) đã đủ:
`xs 11 · sm 12 · base 13 · md 14 · lg 15 · xl 17 · 2xl 20 · 3xl 24 · 4xl 28 · 5xl 40`.

| Vai trò (Apple: Large Title→Footnote) | Token hiện có | Quy ước MỚI (bắt buộc từ nay) |
|---|---|---|
| Large Title (tiêu đề trang) | `text-xl md:text-2xl font-semibold` | Không đổi — đã đúng khắp nơi |
| Headline (hero KPI, số quan trọng nhất/trang) | `text-3xl font-bold` | **Chỉ 1 lần/trang** — xem N1 |
| Body (form, bảng) | `text-sm`/`text-base` | Không đổi |
| Footnote (mã kỹ thuật, meta, timestamp) | `text-xs text-zinc-500` | Ẩn khỏi view thường khi không
cần thiết (N4), không hiện cùng cỡ với label chính |
| Số trong bảng/KPI | + `.tabular-nums` (đã có) | **Bắt buộc 100%** — audit lại toàn bộ ô tiền/SL
chưa có class này (còn sót ở vài nơi theo `REVIEW_UI.md §2.1`) |

Font Vietnamese: `Inter` (đã cấu hình `font-feature-settings: "cv11" 1, "ss01" 1, "cv02" 1"`,
`globals.css:183-184`) — đã hỗ trợ đầy đủ dấu tiếng Việt, giữ nguyên, KHÔNG đổi font.

### 2.2 Bo góc — bổ sung 1 bậc `xl` (12px), chốt quy ước theo cấp UI

**Vấn đề hiện có**: `borderRadius` config (`tailwind.config.ts:217-224`) chỉ có
`sm(4) / DEFAULT+md(6) / lg(8) / full`. Code thực tế đang dùng CẢ `rounded-2xl` (16px, giá trị mặc
định Tailwind, KHÔNG có trong token riêng của app) lẫn `rounded-lg` (8px) cho cùng vai trò "card" ở
các file khác nhau (`REVIEW_UI.md §2.2`: `OverviewTab` lẫn `rounded-lg`/`rounded-2xl` NGAY TRONG 1
file; `DebtAgingPanel` dùng toàn `rounded-2xl`).

**Đề xuất tối thiểu** (thêm 1 dòng vào `tailwind.config.ts`, KHÔNG xoá giá trị cũ → không vỡ trang
đang dùng `rounded-lg`/`rounded-2xl`):

```ts
borderRadius: {
  none: "0",
  sm: "4px",      // badge, chip — không đổi
  DEFAULT: "6px", // input, button — không đổi
  md: "6px",      // không đổi
  lg: "8px",      // không đổi (dùng cho control nhỏ)
  xl: "12px",     // MỚI — card cấp 1 (KPI, panel, sheet nội dung)
  full: "9999px",
},
```

Quy ước dùng từ nay (áp dần khi sửa từng trang, KHÔNG cần sửa hàng loạt ngay): input/button/badge/
chip nhỏ → `rounded-md` (6px); card/panel/KPI → `rounded-xl` (12px, MỚI); Dialog/Sheet container →
giữ `rounded-lg` (8px, đã đúng theo Apple — sheet/modal không nên bo tròn nhiều như card nội dung).
`rounded-2xl` (16px mặc định Tailwind) chỉ còn cho khối hero đặc biệt (banner lớn), không dùng cho
card thường.

### 2.3 Shadow/elevation — giữ nguyên, không thêm

`boxShadow` hiện có (`xs/sm/md/lg/card/card-hover/focus/dialog/toast`) đã đúng tinh thần Apple
(viền 1px mảnh + shadow rất nhẹ, không glassmorphism nặng — `REVIEW_UI.md §2.2` xác nhận đây là điểm
ĐÃ làm đúng). Không cần bổ sung. `.card-interactive` (`globals.css:507-515`, hover nâng nhẹ
`translateY(-1px)` + đổi viền) là class chuẩn — quy tắc mới: MỌI card có thể click phải dùng lại class
này thay vì tự viết hover riêng (hiện `DebtAgingPanel` tự đổi `bg-zinc-50` khi hover, không dùng class
chuẩn — sửa khi chạm tới file).

### 2.4 Màu — không đổi hex, chỉ chốt 2 "track" sử dụng màu

Không thêm màu mới vào `tailwind.config.ts`. Chốt quy ước (đã tồn tại ngầm qua thực tế code, nay ghi
rõ để nhất quán):

- **Track semantic (trạng thái)**: CHỈ 6 tông của `lib/status.ts` (neutral/info/progress/success/
  warning/danger) — dùng cho mọi pill trạng thái nghiệp vụ. Không tự chế màu mới cho trạng thái.
- **Track categorical (phân loại, không mang nghĩa tốt/xấu)**: badge vai trò user (`desktop-24-
  admin-users.png` — WAREHOUSE/PURCHASER/OPERATOR/PLANNER/SHAREHOLDER/ACCOUNTANT/DISPLAY/ADMIN mỗi
  vai trò 1 màu riêng) là ĐÚNG cách dùng màu categorical (phân biệt nhãn, không đánh giá tốt/xấu) —
  giữ nguyên, không gộp về 1 màu, nhưng KHÔNG mở rộng pattern này sang trạng thái nghiệp vụ (PO/BOM/
  WO vẫn phải qua `lib/status.ts`).
- Sơ đồ kho (`desktop-21-wh-layout.png`): đã chuyển 1 thang indigo theo % lấp đầy (đúng X8) — giữ
  nguyên; màu amber cho "Sắp hết" là ngoại lệ semantic hợp lý (cảnh báo sắp hết ≠ mức lấp đầy), không
  coi là vi phạm "1 thang màu".

### 2.5 Motion — giữ nguyên duration/easing, chốt quy tắc reduced-motion đã có

`transitionDuration`/`animation` hiện có (150-300ms, `cubic-bezier(0.16,1,0.3,1)` kiểu Apple
ease-out) đã chuẩn, `prefers-reduced-motion` đã tắt toàn bộ animation về 1ms
(`globals.css:243-251`) — ĐÚNG, không đổi. Chỉ thêm 1 quy tắc mới: mọi Sheet/Dialog MỚI thêm khi
sửa (N6) phải dùng animation có sẵn (`animate-in slide-in-from-right`/`dialog-in`), không tự viết
transition riêng.

---

## 3. Chuẩn "chức năng phụ" — hành vi, trạng thái, mobile, a11y, vấn đề hiện tại

### 3.1 Popover / Dropdown lọc

- Component nền: `components/ui/popover.tsx`, `components/ui/select.tsx`. Đã đúng: `z-popover`,
  `shadow-sm`, không arrow (Linear/Apple style phẳng).
- Vấn đề xác nhận qua ảnh (`desktop-21-wh-layout.png`): bin cell trong sơ đồ kho là `<div>` tự vẽ,
  KHÔNG dùng `Popover` khi click — script audit không bắt được popover bin (không tồn tại hoặc
  không trigger qua click thường) → **cần xác minh trực tiếp trong code** liệu ô bin có popover chi
  tiết khi click/tap hay chỉ đổi trạng thái panel bên trái; nếu chưa có, đây là cơ hội Apple rõ nhất
  (giống iOS Calendar tap ô ngày → popover chi tiết nổi, không điều hướng full page).
- A11y: `Select`/`DropdownMenu` (Radix) đã có `focus-visible`, `aria-*` mặc định — giữ nguyên.
- Mobile: `Popover`/`DropdownMenuContent` cần `max-w-[calc(100vw-1rem)]` khi neo gần mép — đã note
  nợ trong `docs/design-guidelines.md` §12.3 (`SupplierPicker`, `ItemPicker` còn nợ).

### 3.2 Menu "⋯" (row actions)

- Chuẩn: `RowActionsMenu` (`data-table.tsx:356-402`) — ĐÃ ĐÚNG mẫu Apple: tối đa gộp hành động phụ,
  hành động phá huỷ tách bằng `DropdownMenuSeparator` + màu đỏ, nút trigger 32px desktop / 40px
  cảm ứng. **Dùng làm chuẩn bắt buộc** cho MỌI bảng còn tự vẽ icon hành động rời rạc (DOT6 #14: "5
  icon hành động/dòng, nút xoá đỏ luôn hiện" ở `BomListTable`, `POListTable` — kiểm tra lại xem đã
  chuyển sang `RowActionsMenu` chưa, ảnh `desktop-05-eng-bom-list.png` cho thấy cột "THAO TÁC" vẫn
  còn 3 icon rời + "⋯" riêng — TỐT hơn DOT6 mô tả nhưng có thể gộp thêm: mắt xem + "⋯" là đủ, bỏ icon
  lưới/sao chép rời nếu ít dùng).

### 3.3 Dialog xác nhận

- Chuẩn: `ConfirmDialog` + `useConfirm()/usePrompt()` (`components/ui/confirm-dialog.tsx`) — ĐÃ
  đúng chuẩn Apple alert: tiêu đề ngắn + mô tả 1 câu, nút chính bên phải, `tone="danger"` đổi màu
  icon cảnh báo + nút đỏ, `typeToConfirm` cho hành động không thể hoàn tác. Đây là điểm hệ thống đã
  làm tốt nhất — **không đổi**, chỉ cần hoàn tất việc thay 22 call site `window.confirm/prompt` còn
  lại theo danh sách trong `DOT6_PLAN.md` X5 (chưa xác minh lại tiến độ đợt này).
- Quy tắc: mô tả luôn nêu HẬU QUẢ cụ thể ("Xoá vĩnh viễn, không thể khôi phục"), không dùng câu
  chung chung "Bạn có chắc chắn?".

### 3.4 Toast

- Chưa đọc riêng file toast trong phiên này (dùng `sonner` theo `globals.css:254-262` — đã có fix
  responsive width <400px). Quy tắc Apple cần chốt: toast auto-dismiss ngắn (3-4s) cho thành công,
  KHÔNG auto-dismiss cho lỗi (giữ đến khi user đóng) — cần xác minh hành vi hiện tại có phân biệt
  theo mức độ (info/success/error) hay dùng chung 1 duration; nếu chung, đây là việc nhỏ nên sửa (P2).

### 3.5 Badge trạng thái

- Chuẩn: `StatusPill` (`status-badge.tsx`) — đã đúng: `whitespace-nowrap` (hết gãy dòng), tông màu
  từ `lib/status.ts`, `void` (huỷ/ngừng) → xám + gạch ngang thay vì đỏ. Đây là mẫu tốt nhất hệ thống,
  **nhân rộng bắt buộc**, không tạo badge trạng thái mới ngoài hệ thống này.
- `Badge` thường (`badge.tsx`) dùng cho nhãn KHÔNG phải trạng thái workflow (VD vai trò, đếm số) —
  giữ phân biệt rõ 2 component (`Badge` categorical vs `StatusPill` semantic), tránh nhầm lẫn dùng
  sai chỗ.

### 3.6 Bộ lọc (filter bar)

- Vấn đề chung nhiều trang (`REVIEW_UI.md §1.2`, DOT6 nhiều nơi): filter bar là dãy `<select>` +
  `<input type=date>` xếp ngang, KHÔNG có "chip bộ lọc đang áp dụng" để xoá nhanh từng điều kiện
  (kiểu Apple Mail/Files search: mỗi điều kiện lọc hiện thành 1 chip có nút × ). Đây là khoảng trống
  UX rõ nhất còn lại — chưa có component `FilterChip`/`ActiveFiltersBar` dùng chung.
- Đề xuất: 1 component nhỏ `components/ui/filter-chips.tsx` — nhận `{label, onRemove}[]`, render
  hàng chip `rounded-full bg-zinc-100 px-2.5 py-1 text-xs` + nút × 14px, cộng "Xoá tất cả" khi ≥2
  chip. Dùng chung cho Sổ quỹ, PR list, PO list, Item list — KHÔNG viết riêng từng trang (DRY).

### 3.7 Ô tìm kiếm

- Đã có input tìm kiếm với icon kính lúp ở hầu hết list (`desktop-05-eng-bom-list.png`,
  `mobile-14-sales-po-list.png`) — chuẩn đã ổn, giữ nguyên. Ctrl+K global search (`desktop-02-
  cmdk.png`) — hiện CHỈ liệt kê điều hướng (8 mục nav), CHƯA search theo nội dung (mã BOM/PO/PR) dù
  input đã sẵn sàng nhận text. Đây là cơ hội lớn nhất chưa khai thác: Apple Spotlight tìm xuyên nội
  dung, không chỉ điều hướng — nên ghi nhận backlog (không phải P0/P1, nhưng đáng làm ở V4.4: gõ mã
  PO/BOM trong Ctrl+K nhảy thẳng tới trang chi tiết).

### 3.8 Phân trang

- Đã thấy 2 kiểu nhất quán trong ảnh mới (`«‹›»` ở BOM List/PO list, "Trang 1/1" mobile) — tốt hơn
  DOT6 ghi nhận "3 kiểu phân trang". Giữ nguyên định dạng "Hiển thị 1–19/19" + nút mũi tên, không đổi.

### 3.9 Tooltip

- `SimpleTooltip` (`tooltip.tsx`) đã chuẩn (delay 300ms mở, đóng ngay, nền tối ngược sáng dark mode).
  Vấn đề: CHƯA áp đủ cho các ô `truncate` (tên đối tác dài, tên NCC — `REVIEW_UI.md §1.4, §1.7`) —
  đây là việc nhỏ, rải rác nhiều file, nên làm theo dạng "mỗi khi chạm file có `truncate` không title,
  thêm `SimpleTooltip` hoặc `title=`" thay vì 1 đợt sửa toàn bộ.

### 3.10 Form phụ (Sheet nhập liệu)

Xem N6. Chuẩn cấu trúc bên trong `SheetBody` (đã đặc tả chi tiết ở `REVIEW_UI.md §3.6`, áp dụng
chung cho MỌI form, không chỉ Tài chính):

```
SheetHeader (h-12, tiêu đề + nút đóng)
──────────────
SheetBody (scroll, p-5, space-y-4)
  - Trường bắt buộc trước, field liên quan nhóm cùng hàng (grid-cols-1 sm:grid-cols-2)
  - Ghi chú/cảnh báo nghiệp vụ → khối bg-blue-50 (info) hoặc bg-amber-50 (warning), KHÔNG
    text-zinc-400 nhạt (dễ bị lướt qua)
──────────────
SheetFooter (h-14, cố định đáy — [Huỷ] [Hành động chính])
```

### 3.11 Empty / Loading / Error

- Chuẩn đã có, dùng đúng: `EmptyState` (icon Lucide, không illustration 3D), `Skeleton` (shimmer
  1200ms, tắt theo reduced-motion), `QueryError` (phân biệt 429/403/5xx, nút "Thử lại" — xác nhận
  hoạt động đúng ở `NotificationBell.tsx:177-186`). Đây là 3 component NỀN TẢNG đã chuẩn hoá tốt.
- Còn thiếu tinh chỉnh: `EmptyState preset="no-data"` dùng icon `Package` — ổn (đã là icon line,
  KHÔNG phải hộp 3D isometric như DOT6/REVIEW_UI từng lo ngại — xác nhận qua đọc code
  `empty-state.tsx:61-70`, việc này ĐÃ XONG, không cần sửa nữa).
- Trạng thái lỗi API hiện thành "trống mời tạo mới" (DOT6 #1, lỗi nguy hiểm nhất — admin/users 429 →
  "Chưa có người dùng nào") — **cần xác minh lại** đã sửa triệt để chưa; ảnh `desktop-24-admin-
  users.png` lần này tải thành công (15 tài khoản hiện đúng), không kết luận được đã hết lỗi hay chỉ
  do lần chụp này không bị rate-limit — giữ nguyên cảnh báo P1 "kiểm tra lại nhánh isError" cho các
  hook chưa qua `DataTable`/`QueryError` chuẩn.

### 3.12 Bảng dữ liệu

Xem N9 + `components/ui/data-table.tsx` (đã đọc toàn bộ, 469 dòng) — đây là component TỐT NHẤT của
hệ thống về tuân thủ Apple: `<table>` thật, header sticky, canh phải số, card-list mobile tự động,
hàng tổng, RowActionsMenu. **Việc còn lại KHÔNG phải sửa component này** mà là CHUYỂN các bảng tự vẽ
`<table>` riêng (chưa dùng `DataTable`) sang dùng nó — ưu tiên theo mức rủi ro mobile (N9): sơ đồ kho
(bin grid), `DebtAgingPanel` (đã có spec card-list ở `REVIEW_UI.md §3.5`), và các bảng khác theo danh
sách còn lại trong `DOT6_PLAN.md` X4.

### 3.13 Số liệu / ngày tháng

Xem N8. `lib/format.ts` (250 dòng, đã mở rộng theo X3) là nguồn duy nhất — không viết `fmt*` cục bộ
mới trong component trang.

### 3.14 Thanh tab (Tabs / HubTabsNav)

- `components/ui/tabs.tsx` — ĐÃ có auto-scroll tab active vào tầm nhìn (dòng 25-64, comment ghi rõ
  thêm ở V4.2 UI cho Tài chính) + `overflow-x-auto` ẩn scrollbar. Đây là điểm cộng lớn, đúng mẫu
  iOS Settings/App Store category tab tự cuộn.
- TopBar row 2 (nav chính, `TopBar.tsx:192-245`) dùng underline indigo khi active — nhất quán với
  `TabsTrigger` (cũng underline `zinc-900`/`indigo`) — tốt, 1 ngôn ngữ thị giác cho "tab" xuyên suốt
  desktop nav chính lẫn tab con trong trang.
- Cần kiểm tra thêm (chưa xác minh qua ảnh do màn hình desktop rộng không lộ vỡ): trang có 2 tầng tab
  (hub cấp 1 trong TopBar + sub-tab cấp 2 trong trang, VD Tài chính `?tab=fin-cashbook&sub=...`) trên
  mobile hẹp — DOT6 §1.9 từng ghi nhận vỡ; ảnh mobile lần này (`mobile-14-sales-po-list.png`) cho
  thấy PO tab (`Đặt hàng/NCC/Tổng quan`) cuộn ngang tốt, nhưng CHƯA chụp lại đúng trang Tài chính
  2 tầng tab trên mobile ở đợt audit này — giữ nguyên cảnh báo P1 cần re-test riêng.

### 3.15 Breadcrumb

- `components/ui/breadcrumb.tsx` — auto-collapse giữa khi >4 items, link màu `text-blue-600` (khác
  accent `indigo` — có chủ đích để phân biệt "link điều hướng phụ" khỏi "accent hành động chính",
  hợp lý, giữ nguyên). Ảnh mới xác nhận: breadcrumb TopBar giờ chỉ 1 tầng, tiếng Việt đầy đủ
  ("Tổng quan / Bộ phận Thiết kế / BOM List", `desktop-05-eng-bom-list.png`) — ĐÃ khớp X6, không còn
  "Trang chủ / engineering" tiếng Anh như DOT6 ghi nhận. **Đã xong, không cần sửa.**

### 3.16 Chuông thông báo

- `NotificationBell.tsx` — cấu trúc đã rất chuẩn Apple (panel nổi bo góc lớn `rounded-2xl`,
  shadow rõ, avatar icon tròn theo `severity`, unread = chấm indigo + nền `indigo-50/40`, footer
  "Xem tất cả" — đúng mẫu iOS Notification Center thu nhỏ).
- ❌ Vấn đề THẬT xác nhận qua ảnh `desktop-03-notification-bell.png` (2026-09-30, KHÔNG phải dữ liệu
  demo cũ): 4 thông báo đầu tiên **giống hệt nhau từng chữ** — "Nhắc duyệt: 3/PRD-MRF/0926 chờ quá
  24h" — chỉ khác mốc thời gian (3/4/5/6 ngày trước). Đây CHÍNH LÀ lỗi DOT6 #10 phần "Thông báo" ghi
  nhận ("nhắc duyệt trùng 4 lần cùng phiếu") — **VẪN CÒN NGUYÊN, chưa sửa**. Theo Apple, các thông
  báo lặp lại cùng 1 sự kiện nên GỘP ("Đã nhắc 4 lần — xem chi tiết") thay vì liệt kê từng cái, đúng
  cách iOS gộp thông báo cùng app/thread.
- Đề xuất sửa (BE + FE): BE gộp theo `(entityId, eventType)` trong khoảng thời gian, giữ thông báo
  mới nhất + đếm `repeatCount`; FE `NotificationItemRow` thêm dòng phụ "Đã nhắc {n} lần" khi
  `repeatCount > 1`. Đây là việc backend/business logic nằm NGOÀI phạm vi thuần UI của tài liệu này
  nhưng ảnh hưởng trực tiếp UX — ghi nhận rõ vì chủ xưởng đặc biệt yêu cầu xem xét "chuông thông báo".

---

## 4. Mẫu màn hình (ASCII wireframe)

### 4.1 Trang danh sách (chuẩn áp cho BOM/PR/PO/Item/User)

```
┌ Breadcrumb (1 tầng) ───────────────────────────────────────────────────┐
│ Tổng quan › Bộ phận X › Tên trang                                       │
├──────────────────────────────────────────────────────────────────────── ┤
│ Tên trang                                          [Nhập Excel] [+ Tạo] │  ← PageHeader, 1 CTA nổi bật
│ Mô tả phụ 1 dòng · N mục                                                │
├──────────────────────────────────────────────────────────────────────── ┤
│ [Tìm kiếm...                    ]  (Tất cả|Nháp|Đang dùng|Ngừng)  [Lọc▾]│  ← segmented + filter chip
│ [chip: 30 ngày ×] [chip: Kho A ×]                            [Xoá lọc]  │
├──────────────────────────────────────────────────────────────────────── ┤
│ MÃ ↕   TÊN ↕              SL    TRẠNG THÁI      CẬP NHẬT ↓      ⋯      │  ← DataTable, header sticky
│ ...(rows, zebra qua hover, không zebra tĩnh)...                         │
├──────────────────────────────────────────────────────────────────────── ┤
│ Hiển thị 1–20/86                                        « ‹ 1 2 3 › »  │
└──────────────────────────────────────────────────────────────────────── ┘
Mobile (<md): card-list (mã+tên bold / status góc phải / 2 cột nhãn:giá trị phụ / ⋯ góc)
```

### 4.2 Trang chi tiết (chuẩn: mẫu PO detail đã đạt — nhân rộng)

```
┌ Back  MÃ-CHÍNH  [StatusPill]  [Badge phụ] · Tên đối tác  [CTA phải][⋯] ┐
│ Tổng cộng: X đ   3 dòng   Đã nhận 100%   Dự kiến —                     │
├──────────────────────────────── 2 cột (desktop) ──────────────────────┤
│ (trái, rộng hơn — nội dung chính)      │ (phải, hẹp — thông tin+tiến trình)│
│ Bảng dòng hàng / chi tiết               │ Card "Thông tin" (đối tác, ngày)│
│ Tabs phụ (Nhận nhanh/Lịch sử/Nhật ký)  │ Timeline tiến trình (✓ từng bước)│
│                                          │ Card tổng kết kiểu receipt      │
└──────────────────────────────────────────────────────────────────────── ┘
Mobile: 1 cột, timeline tiến trình rút gọn ngang (chấm + nhãn hiện tại), card tổng kết trước bảng dòng.
```

### 4.3 Form tạo/sửa (Sheet — chuẩn N6/3.10)

```
                                          ┌─ Sheet size=md (420px) ──────┐
                                          │ Tạo [đối tượng]          [×] │
                                          ├──────────────────────────────┤
                                          │ Trường bắt buộc *            │
                                          │ [........................]  │
                                          │ Trường A          Trường B   │
                                          │ [............]  [..........] │
                                          │ ℹ️ Ghi chú nghiệp vụ quan trọng│
                                          ├──────────────────────────────┤
                                          │              [Huỷ] [Tạo mới] │
                                          └──────────────────────────────┘
```

### 4.4 Dashboard (chuẩn — đã đạt phần lớn, chỉ thêm hero rõ hơn ở các dashboard con)

```
┌ Hero card (icon+tiêu đề lớn)                    [3 số phụ liên quan] ──┐
├ Số lượng dữ liệu hệ thống (6 ô, chữ đủ, không cắt) ─────────────────── ┤
├ 4 thẻ % tiến độ (trung tính, progress bar indigo) ───────────────────  ┤
├ Hoạt động gần đây (trái, rộng)     │ Cần xử lý (phải, hẹp, empty ổn)   │
├ Top cảnh báo (SKU thiếu/PR trễ…) — empty state khi ổn                 │
└ Bảng điều hành sản xuất (preview) — link "Xem & quản lý" ─────────────┘
```

### 4.5 Inbox việc cần làm (mẫu — dùng lại khối "Cần xử lý" đã có ở Dashboard)

```
┌ Cần xử lý                                                    [ỔN ĐỊNH]│
├─────────────────────────────────────────────────────────────────────┤
│ (●) PR chờ duyệt quá 24h · 3/PRD-MRF/0926        [Xem →]             │
│ (●) PO sắp đến hạn nhận · PO-2609-0083-02        [Xem →]             │
│  … tối đa 5 dòng, "Xem tất cả N việc →" cuối danh sách               │
│ — khi rỗng: icon khiên ✓ + "Tất cả đang ổn" (ĐÃ ĐÚNG, giữ nguyên) —  │
└─────────────────────────────────────────────────────────────────────┘
```
Ghi chú: khối này ĐÃ TỒN TẠI ở Dashboard (`desktop-01-dashboard.png`, "Cần xử lý") nhưng đang trống
("Tất cả đang ổn") dù có PR chờ duyệt quá 24h thật (thấy trong chuông thông báo cùng lúc, §3.16) —
**nghi vấn logic**: điều kiện "cần xử lý" trên Dashboard có thể không tính đúng PR quá hạn duyệt mà
NotificationBell đang nhắc — cần đối chiếu code (`RecentActivityCard`/khối "Cần xử lý" vs điều kiện
tạo `PR_PENDING_REMINDER`) để 2 nơi nhất quán, tránh user thấy "ổn" trên dashboard nhưng chuông báo
động.

---

## 5. Danh sách thay đổi ưu tiên

### P0 — Nền tảng + lỗi hiển thị sai lệch thông tin (sửa trước, rủi ro thấp vì phạm vi hẹp)

| # | Việc | File | Rủi ro vỡ trang khác |
|---|---|---|---|
| P0-1 | Xác minh `deadlineTone()` đã nhận `status` chưa; nếu chưa, hạn "Đã giao/Hoàn thành" đang đỏ sai (N3) | `apps/web/src/app/(app)/production-board/page.tsx` (hàm `deadlineTone`, ~dòng 374 theo DOT6) | Thấp — hàm cục bộ 1 trang |
| P0-2 | Card-list mobile cho bin grid sơ đồ kho (đang cắt chữ, không rõ cuộn ngang) | `components/warehouse/WarehouseLayoutTab.tsx` | Trung bình — layout phức tạp (2D/3D toggle), cần giữ nguyên chế độ desktop |
| P0-3 | Card mobile Vật tư thiếu số Tồn kho (N9, DOT6 #9 vẫn còn) | `components/items/ItemListTable.tsx` | Thấp — thêm 1 dòng `mobileLabel` nếu đã dùng `DataTable`, hoặc thêm field nếu tự vẽ card |
| P0-4 | Gộp thông báo lặp "Nhắc duyệt" cùng phiếu (N/A UI thuần — cần đổi BE) | API `/api/notifications` (worker tạo `PR_PENDING_REMINDER`) + `NotificationBell.tsx` (hiện `repeatCount`) | Trung bình — đổi contract API, cần kiểm tra nơi khác đọc danh sách thông báo thô |
| P0-5 | Đối chiếu điều kiện khối "Cần xử lý" Dashboard với điều kiện nhắc duyệt PR (đang lệch — xem §4.5) | `components/dashboard/*` (khối "Cần xử lý") | Thấp — chỉ đổi query điều kiện, không đổi UI |

### P1 — Thành phần dùng chung (sửa 1 chỗ ăn cả app) + chức năng phụ

| # | Việc | File | Rủi ro |
|---|---|---|---|
| P1-1 | Thêm `borderRadius.xl = "12px"` vào token, KHÔNG xoá giá trị cũ | `apps/web/tailwind.config.ts` | Thấp — chỉ thêm, không đổi/xoá key cũ nên trang dùng `rounded-lg/2xl` không vỡ |
| P1-2 | Component `SegmentedControl` (biến thể pill của `Tabs`/`TabsList`, hoặc component nhỏ riêng) — thay 3 nút rời "7/30 ngày", "Phải trả/thu" | `components/ui/tabs.tsx` (thêm biến thể) hoặc `components/ui/segmented-control.tsx` mới | Thấp nếu thêm biến thể mới, không đổi API `Tabs` cũ |
| P1-3 | Component `FilterChip`/`ActiveFiltersBar` dùng chung cho mọi filter bar (N/§3.6) | `components/ui/filter-chips.tsx` (mới) | Thấp — component mới, áp dần từng trang |
| P1-4 | Đổi toàn bộ form Tạo/Sửa còn dùng `Dialog` sang `Sheet` (N6) — bắt đầu từ Tài chính theo spec đã có, sau đó rà PR/PO/Item/User/Supplier/Category tạo mới | `components/finance/*` (đã có spec `REVIEW_UI.md`), sau đó các form khác chưa audit | Trung bình — đổi UX quen thuộc, cần thông báo nội bộ trước khi merge |
| P1-5 | `StatTile`/`KpiCard` thêm biến thể `size="hero"` cho 1 số quan trọng nhất/trang (N1) | `components/ui/data-table.tsx` (`StatTile`, thêm prop không đổi API cũ) | Thấp |
| P1-6 | Áp `SimpleTooltip`/`title=` cho mọi ô `truncate` tên đối tác/NCC dài | `components/finance/InvoicesTab.tsx`, `PaymentsTab.tsx`, `components/suppliers/*` | Thấp, rải rác nhiều file nhỏ |
| P1-7 | Re-test 2 tầng tab (hub + sub-tab) trên mobile 390px cho MỌI hub có sub-tab (không chỉ Tài chính) | `HubTabsNav`/trang `sales`, `engineering`, `warehouse` | Thấp — chỉ xác minh, có thể không cần sửa nếu đã ổn |
| P1-8 | Popover chi tiết khi tap ô bin kho (thay vì chỉ đổi panel trái) — nâng cấp trải nghiệm, không bắt buộc | `components/warehouse/WarehouseLayoutTab.tsx` | Trung bình — cần xác nhận hành vi hiện tại trước khi đổi |

### P2 — Từng trang (thẩm mỹ, không cấp thiết)

| # | Việc | File |
|---|---|---|
| P2-1 | Icon hướng (↗/↘) trước số tiền ở Sổ quỹ + list Thanh toán | `components/finance/CashbookTab.tsx`, `PaymentsTab.tsx` |
| P2-2 | Ẩn cột "THÀNH PHẨM" khi 100% dòng rỗng trong BOM List | `components/bom/BomListTable.tsx` |
| P2-3 | Toast phân biệt duration theo severity (info/success ngắn, error giữ tới khi đóng) | nơi cấu hình `sonner` (Toaster provider) |
| P2-4 | Ctrl+K mở rộng tìm theo nội dung (mã BOM/PO/PR), không chỉ điều hướng | `components/command/CommandPalette.tsx` |
| P2-5 | Gộp "+HĐ đầu vào/+HĐ đầu ra" thành 1 nút mở `DropdownMenu` | `components/finance/InvoicesTab.tsx` |
| P2-6 | Card Tài khoản/Nguồn tiền: grid nhiều cột thay cột đơn trên desktop rộng | `components/finance/AccountsTab.tsx` |
| P2-7 | Ẩn mã kỹ thuật danh mục khỏi view thường (chỉ hiện khi sửa) | `components/finance/CategoriesTab.tsx` |

---

## Tổng kết (≤30 dòng)

**Vấn đề lớn nhất còn lại** (không phải "chưa giống Apple" mà là "chưa NHẤT QUÁN đủ để giống Apple"):

1. **Overlay lẫn lộn** (N6): form tạo mới dùng Dialog giữa màn hình, xem chi tiết dùng Sheet bên
   phải — 2 ngôn ngữ tương tác cho việc liên quan. Đã có spec đầy đủ cho Tài chính
   (`plans/v4.2-finance/REVIEW_UI.md §2.5, §3.6`), cần nhân rộng sang PR/PO/Item/User/Supplier.
2. **Chuông thông báo lặp lại** (§3.16): 4 thông báo "Nhắc duyệt" giống hệt nhau xác nhận LẠI qua ảnh
   thật hôm nay 2026-09-30 — lỗi DOT6 đã ghi nhận từ 27/09 vẫn chưa sửa, cần gộp theo entity ở BE.
3. **Mobile bin-grid kho + card Vật tư thiếu tồn kho** (N9) — 2 lỗi DOT6 cũ vẫn còn nguyên, có thể vì
   chưa tới lượt trong lịch Đợt 6C (chuyển bảng sang `DataTable`).
4. **Phân cấp 1-số-quan-trọng-nhất** (N1): mẫu đã có sẵn ở Dashboard chính (hero "Tổng quan gia
   công" + 3 số phụ) nhưng CHƯA nhân rộng sang dashboard con (Tài chính, PO, Kho) — đều đang "N thẻ
   bằng nhau".
5. Điểm mạnh cần GIỮ làm chuẩn: `DataTable`, `StatusPill`, `ConfirmDialog`/`useConfirm`, `EmptyState`,
   `Tabs` auto-scroll, Breadcrumb 1 tầng, PO detail (receipt + timeline) — đây là 7 thành phần/mẫu đã
   đạt chuẩn Apple thực sự, dùng làm khuôn khi sửa các trang còn lại.

File chính: `apps/web/src/components/ui/{data-table,status-badge,confirm-dialog,empty-state,tabs,
sheet,dialog,badge}.tsx`, `apps/web/src/lib/{status,format}.ts`, `apps/web/tailwind.config.ts`,
`apps/web/src/app/globals.css`, `apps/web/src/components/layout/NotificationBell.tsx`,
`apps/web/src/components/finance/*` (spec chi tiết đã có ở `plans/v4.2-finance/REVIEW_UI.md`).
