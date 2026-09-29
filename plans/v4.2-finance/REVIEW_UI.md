# V4.2 — Audit UI/UX phân hệ Tài chính + Spec redesign "Apple style"

> Nguồn ảnh chụp thật trên prod `https://mes.songchau.vn` (tài khoản `admin`), desktop 1440×900
> + mobile 390×844, ngày 2026-09-30. Ảnh lưu tại scratchpad phiên làm việc (không commit vào repo):
> `C:\Users\ASUS\AppData\Local\Temp\claude\c--dev-he-thong-iot\7c0e0492-2281-453b-97aa-d20b0da7ef8e\scratchpad\ui-audit\shots\`
> (29 ảnh: `desktop-*.png`, `mobile-*.png`). Script chụp cũng ở scratchpad, KHÔNG ghi vào repo,
> chỉ điều hướng + mở/đóng dialog, không bấm nút ghi dữ liệu.
>
> Design system nền: `apps/web/tailwind.config.ts` (V2 Linear-inspired: zinc + indigo-600),
> `apps/web/src/app/globals.css` (token `--bg-page/--bg-card/--accent/...`, dark mode đã bật),
> `apps/web/src/components/ui/*` (Sheet, Dialog, Badge, DataTable, EmptyState, StatusBadge…),
> đã chuẩn hoá 1 vòng ở Đợt 6 (`plans/v4.1-audit-hoan-thien/DOT6_PLAN.md`): bảng, màu, tiêu đề
> trang, quy tắc mobile §12 trong `docs/design-guidelines.md`.
>
> Route: `/sales?tab=fin-overview|fin-cashbook|fin-settle&sub=...`. Component:
> `apps/web/src/components/finance/*.tsx`.

---

## 0. Tóm tắt điều hướng thật (để đối chiếu ảnh)

| Tab cấp 1 | Sub-tab | Component | Ảnh desktop | Ảnh mobile |
|---|---|---|---|---|
| TC: Tổng quan | — | `OverviewTab.tsx` | `desktop-01-overview.png` | `mobile-01-overview.png` |
| TC: Sổ quỹ | Thu chi | `CashbookTab.tsx` (trong `CashbookGroupTab.tsx`) | `desktop-02…05` | `mobile-02…05` |
| TC: Sổ quỹ | Hoá đơn | `InvoicesTab.tsx` + `InvoiceDetailSheet.tsx` | `desktop-06…08` | `mobile-06,07,07b` |
| TC: Sổ quỹ | Thanh toán | `PaymentsTab.tsx` | `desktop-09,10` | `mobile-09,10` |
| TC: Công nợ & Thiết lập | Công nợ | `ReceivablesTab.tsx` + `DebtAgingPanel.tsx` (trong `SettlementsGroupTab.tsx`) | `desktop-12,13` | `mobile-12,13` |
| TC: Công nợ & Thiết lập | Tài khoản | `AccountsTab.tsx` | `desktop-14` | `mobile-14` |
| TC: Công nợ & Thiết lập | Danh mục | `CategoriesTab.tsx` | `desktop-16` | `mobile-16` |
| Drawer chi tiết giao dịch | | `TransactionDetailSheet.tsx` | (chưa chụp được — xem §1.9) | |
| Drawer chi tiết hoá đơn | | `InvoiceDetailSheet.tsx` | `desktop-08-drawer-hoa-don.png` | |

---

## 1. Vấn đề hiện tại theo từng màn

### 1.1 Tổng quan (`OverviewTab.tsx`) — `desktop-01-overview.png`, `mobile-01-overview.png`

- **Phân cấp thông tin yếu**: 6 thẻ KPI cùng cỡ, cùng trọng lượng thị giác (viền zinc-200 đồng nhất,
  dòng 220-229 trong `OverviewTab.tsx` đã cố tình "khử màu" — chỉ còn 1 chấm tròn nhỏ). Kết quả: mắt
  không biết nhìn vào đâu trước. Số quan trọng nhất (chênh lệch thu-chi) không nổi bật hơn số phụ
  (số dư tài khoản).
- **Mobile: nhãn KPI bị cắt chữ** — `mobile-01-overview.png` hiện "Tổ...", "Công nợ phải ..." vì
  `<p className="truncate text-xs ...">{label}</p>` (dòng 237) trong ô `grid-cols-2` quá hẹp so với
  icon 16px + chấm màu + label dài ("Công nợ phải thu"/"Công nợ phải trả"). Đây là lỗi UX nghiêm
  trọng: 2 thẻ công nợ khác nhau hoàn toàn về ý nghĩa nhưng nhãn hiện giống hệt nhau trên điện thoại.
- **Mật độ/khoảng trắng**: card KPI `p-4` khá chật cho 3 dòng nội dung (label+badge / số lớn / số
  đủ). Card biểu đồ bên dưới `p-5` rời rạc, không cùng nhịp spacing với card KPI.
  Card KPI lẫn card biểu đồ đều dùng `rounded-lg`/`rounded-2xl` KHÔNG nhất quán trong cùng 1 file
  (dòng 117 skeleton dùng `rounded-2xl`, card thật dòng 233 dùng `rounded-lg`).
- **Trạng thái rỗng đã ổn** (`EmptyState preset="no-data"` dòng 191) nhưng icon hộp 3D không khớp
  phong cách phẳng Apple; nên đổi sang icon line 1 màu.
- **Bộ lọc ngày**: input `type=date` native trên desktop chiếm nhiều không gian ngang, hàng filter
  (7/30/90 ngày + Từ/Đến) bị đẩy xuống dòng riêng trên mobile (`mobile-01`) — chấp nhận được nhưng
  chưa có kiểu "segmented control" Apple thật (hiện là 3 `Button` rời rạc cạnh nhau viền riêng lẻ).
- **Khả năng quét nhanh số liệu**: số tiền KPI dùng `fmtVNDShort` (rút gọn "179,8 tr") + số đủ bên
  dưới `text-xs` màu nhạt — tốt, nhưng vì không phải `tabular-nums` căn phải mà căn trái theo card
  nên khi 6 số cạnh nhau độ dài khác nhau, mắt phải "nhảy" thay vì so sánh theo cột.
- **Không có sparkline mini** trong từng thẻ KPI dù đã có time-series data sẵn (`cashflow.series`) —
  cơ hội Apple-style rõ nhất (thẻ Stocks/Health app: số lớn + sparkline nhỏ cùng màu ngữ nghĩa).

### 1.2 Sổ quỹ — Thu chi (`CashbookTab.tsx`) — `desktop-02-cashbook-transactions.png`

- **Bảng giao dịch rất đặc (dense)**: 9 cột (Mã, Ngày, Diễn giải, Nguồn, Danh mục, Hoá đơn, Số tiền,
  Trạng thái, hành động ẩn) trong 1 bảng phẳng không zebra rõ, không nhóm theo ngày. Với người xem
  nhanh "hôm nay đã thu/chi bao nhiêu", phải tự cộng nhẩm theo mắt.
- **Dữ liệu demo toàn bộ "Đã huỷ" (strikethrough)** — vô tình lộ ra: hàng bị huỷ dùng
  `line-through` + chữ nhạt suốt cả dòng kể cả số tiền, khiến bảng nhìn "xám xịt" toàn bộ, không có
  hàng nào nổi bật là dữ liệu "sống". Đây là rủi ro thật (không phải chỉ do demo data) — cần kiểm tra
  hàng "Đã huỷ" có đang lấn át hàng active về thị giác không khi dữ liệu thật cũng có tủ lệ huỷ tương tự.
- **Cột "Số tiền" thiếu phân định thu/chi bằng vị trí** — số dương (xanh) và âm (đỏ, có dấu trừ) nằm
  chung 1 cột căn phải, phân biệt hoàn toàn bằng màu. Ổn về mặt số liệu (đã có dấu +/−) nhưng thiếu
  icon mũi tên nhỏ như KPI phía trên → không nhất quán trong cùng 1 trang.
- **Header hành động**: 4 nút cùng cấp (`Nhập từ Excel`, `Chuyển quỹ`, `Phiếu thu`, `Phiếu chi`) cùng
  variant `outline` trừ `Phiếu chi` là `default` (tím) — không rõ vì sao chỉ 1 nút trong 4 được nhấn
  mạnh, trong khi "Phiếu thu" cũng là hành động chính tương đương.
- **Bộ lọc**: segmented `Tất cả/Thu/Chi` (đã là pill tốt) + 2 `<select>` + 2 `<input type=date>` xếp
  hàng ngang tràn hết chiều rộng — không có "Bộ lọc đang áp dụng" dạng chip để xoá nhanh từng điều
  kiện (Apple Mail/Files search style).
- **Hàng tổng cuối bảng** ("Cộng trang này…") đặt lẫn với phân trang, dễ bị bỏ sót vì cùng cỡ chữ với
  ghi chú phụ.

### 1.3 Form "Tạo phiếu chi/thu" (Dialog) — `desktop-03-form-phieu-chi.png`, `mobile-03-form-phieu-chi.png`

- **Dùng `Dialog` (modal giữa màn hình) thay vì `Sheet` (drawer phải)** — trong khi
  `InvoiceDetailSheet`/`TransactionDetailSheet` đã dùng `Sheet`. Đây là **điểm không nhất quán lớn
  nhất của cả module**: 2 kiểu overlay khác nhau cho 2 nhóm thao tác (tạo mới = Dialog giữa màn hình,
  xem chi tiết = Sheet bên phải) khiến trải nghiệm rời rạc, không theo 1 ngôn ngữ tương tác.
- **Trên mobile, Dialog co lại `max-w-[calc(100vw-2rem)]`** nhưng vẫn giữ bố cục desktop y hệt
  (label + input full width xếp dọc — may mắn form này đơn giản nên không vỡ), tuy nhiên nút hành
  động ("Tạo giao dịch"/"Huỷ") xếp `flex-col-reverse` full-width đúng chuẩn — đây là phần ổn.
- **"Nguồn chi/thu"** dùng `<select>` native — không có avatar/icon ngân hàng như card ở tab
  "Tài khoản" (logo icon `Landmark`/`Wallet` màu). Cơ hội tái dùng `AccountSourceSelect.tsx` (đã có
  sẵn theo tên file) để hiện icon + tên đầy đủ, nhất quán với card nguồn tiền.
- Ghi chú hướng dẫn ("Giao dịch này KHÔNG gắn hoá đơn...") đặt ngay dưới ô Diễn giải bằng
  `text-zinc-400` — dễ bị đọc lướt qua dù là thông tin quan trọng để tránh nhầm luồng nghiệp vụ.

### 1.4 Hoá đơn (`InvoicesTab.tsx`) — `desktop-06-invoices-list.png`, `mobile-06-invoices-list.png`

- **Đây là màn tốt nhất hiện có** — bảng desktop rõ ràng, có badge trạng thái màu ngữ nghĩa tiết chế
  đúng tinh thần Apple (`Chưa trả` xanh dương nhạt, `Quá hạn` cam, `Đã trả` xanh lá, kèm icon cảnh
  báo ⚠ nhỏ màu đỏ cạnh ngày quá hạn) + mobile card-list đã đúng pattern §12.4 (card-list thay bảng).
  Giữ nguyên hướng này làm chuẩn cho các màn khác.
- **Nhưng**: cột "ĐỐI TÁC" bị cắt bằng `truncate` không có tooltip hiện đầy đủ khi hover (tên công ty
  VN thường rất dài, vd "CÔNG TY CỔ PHẦN CƠ KHÍ CHẾ TẠO VÀ TH…"), user không cách nào đọc hết tên
  trừ khi mở drawer.
  Card mobile thì hiện được cả dòng vì không giới hạn chiều rộng cột — nhưng dữ liệu quan trọng như
  "Hạn thanh toán" và "Còn nợ" xen kẽ label/value không căn cột dọc, khó quét nhanh khi list dài.
- **Icon cảnh báo hạn quá hạn (▲ nhỏ màu đỏ)** cạnh ngày trong bảng desktop là chi tiết tốt — nhưng
  không xuất hiện lại ở card mobile (`mobile-06`) dù text vẫn đỏ — mất một kênh nhận diện (icon+màu).
- **2 nút "+ HĐ đầu vào" / "+ HĐ đầu ra"** cùng lúc hiện trên header — ổn về chức năng nhưng theo
  Apple, đây là ứng viên tốt cho 1 nút "+" duy nhất mở menu chọn loại (giảm nhiễu thị giác khi phải
  đọc 2 nút dài).

### 1.5 Form "Tạo hoá đơn" (Dialog) — `desktop-07-form-hd-dau-vao.png`, `mobile-07-form-hd-dau-vao.png`

- **Cùng vấn đề Dialog giữa màn hình như 1.3.**
- **Layout 2 cột (Ngày phát hành/Hạn thanh toán, rồi Tiền hàng/VAT/Tiền VAT 3 cột)** trên mobile
  (`mobile-07`) bị bóp: input ngày `mm/dd/yyyy` cùng ô VAT(%) nhỏ xíu (3 cột chia đều 342px) —
  chữ số liệu chật, ô "VAT (%)" chỉ rộng ~90px thực tế đủ dùng nhưng cảm giác chen chúc so với các
  ô khác trong cùng form.
- **"Tổng cộng" hiện `0 đ` tĩnh** (không auto-tính preview real-time rõ ràng trong ảnh vì chưa nhập
  liệu) — cần xác nhận việc tính tổng có live-update mượt khi gõ, và show rõ công thức
  (Tiền hàng × (1 + VAT%) = Tổng) thay vì chỉ hiện con số cuối.
- Trường "Nhà cung cấp"/"Khách hàng" dùng combobox rỗng `Chọn đối tác...` — không có avatar/icon,
  không thấy gợi ý "gần đây" (recent) dù đây là hành động lặp lại thường xuyên với vài chục NCC quen.

### 1.6 Drawer chi tiết hoá đơn (`InvoiceDetailSheet.tsx`) — `desktop-08-drawer-hoa-don.png`

- **Đây là điểm sáng kiến trúc** (đã dùng `Sheet` bên phải, đúng hướng Apple) nhưng **thực thi lãng
  phí không gian**: Sheet rộng 420px (`size="md"`) nhưng nội dung dùng `grid-cols-2` cho 4 trường
  meta (Hạn thanh toán/Tổng tiền/Đã trả/Còn nợ) — với 420px, mỗi cột chỉ ~180px sau padding, đủ
  nhưng số tiền lớn (`31 đ`, `Chưa trả`) và mã hoá đơn font-mono lại chiếm 1 dòng riêng phía trên
  → tổng thể có nhiều đường viền `border-b` + label uppercase nhỏ, tạo cảm giác "form kế toán" hơn
  là "thẻ tổng kết" kiểu Apple Wallet/App Store receipt.
- **"Xem đơn mua liên quan"** là link text thường (không phải button/chip) đặt giữa 2 khối thông tin
  không liên quan trực tiếp (Nhà cung cấp / Ghi chú) — dễ bị bỏ sót, trong khi đây là điều hướng
  quan trọng (từ hoá đơn quay lại PO gốc).
- **Nút "Huỷ hoá đơn"** đặt ở góc dưới-phải cùng màu đỏ nhưng không có `SheetFooter` cố định (nút
  nằm trôi nổi trong nội dung cuộn) — nếu nội dung dài hơn (nhiều file đính kèm), nút huỷ có thể bị
  cuộn mất khỏi tầm nhìn, không giống pattern iOS (action nguy hiểm luôn cố định dưới cùng hoặc yêu
  cầu xác nhận modal riêng, ở đây có `ConfirmActionDialog` bảo vệ nên rủi ro thao tác nhầm thấp,
  nhưng vấn đề là *tìm* thấy nút để bấm).
- **Khoảng trắng bên trái dư thừa** khi Sheet chưa có đủ nội dung để lấp đầy 420px chiều cao —
  chưa quan sát được vì demo có đủ data, nhưng cấu trúc 1 cột `space-y-5` toàn Sheet dễ tạo cảm giác
  rỗng phía dưới với hoá đơn ít thông tin (không có hạn thanh toán, không note).

### 1.7 Thanh toán (`PaymentsTab.tsx`) — `desktop-09-payments-list.png`, `mobile-09-payments-list.png`

- **List dạng card hàng ngang** (không phải bảng) — đã đúng hướng "list Apple" hơn các tab khác,
  đáng làm chuẩn tham chiếu. Icon `>` (chevron) bên trái gợi ý expand nhưng không có hint thị giác gì
  khác (không đổi màu nền khi hover, không có avatar loại giao dịch Thu/Chi).
- **Badge "Đã huỷ" lặp lại trên MỌI dòng** (cùng vấn đề dữ liệu demo như 1.2) — làm mất tác dụng của
  badge trạng thái vì không có gì để phân biệt.
- **Tên đối tác dài bị cắt bằng `…` giữa dòng** (`CÔNG TY TNHH SẢN XUẤT THƯƠNG MẠI DỊCH VỤ MẠNH
  HƯNG` trên mobile co hết cỡ) — không tooltip, không expand để đọc đủ nếu không bấm vào dòng.
- **Không phân biệt Thu/Chi bằng icon hướng mũi tên** như Tổng quan — chỉ có dấu `−` trước số tiền,
  nhất quán 1 phần với Sổ quỹ (§1.2) nhưng thiếu icon để quét nhanh giữa các dòng.

### 1.8 Form "Ghi nhận thanh toán" (Dialog) — `desktop-10-form-ghi-nhan-tt.png`, `mobile-10-form-ghi-nhan-tt.png`

- **Form phức tạp nhất trong module** (segmented Chi/Thu + 4 field + khối "Phân bổ cho hoá đơn" +
  Ghi chú) nhưng vẫn nhồi vào Dialog trung tâm rộng cố định — trên mobile (`mobile-10`), label
  "Nhà cung cấp" gần như dính sát mép phải khung dropdown, chứng tỏ layout 2 cột thiết kế cho desktop
  chưa được test kỹ ở 390px dù đã responsive được (không vỡ, nhưng chật).
- **Khối "PHÂN BỔ CHO HOÁ ĐƠN (0)"** hiện placeholder "Chọn đối tác để xem hoá đơn còn nợ" nhưng
  UI trông giống 1 bảng trống hơn là trạng thái chờ nhập — nên có icon + hướng dẫn rõ hơn (empty
  state thu nhỏ, không chỉ 1 dòng chữ xám).
- **"Tổng phân bổ"** đặt cạnh "PHÂN BỔ CHO HOÁ ĐƠN" như tổng phụ nhưng dùng cùng style box với
  input phía trên — dễ nhầm là 1 field nhập liệu thay vì giá trị tính toán read-only.
- Đây là form nên **chuyển thành Sheet toàn màn hình cao (bottom sheet trên mobile, side sheet lớn
  `lg` 560px trên desktop)** vì nội dung có thể mở rộng động (nhiều dòng phân bổ hoá đơn).

### 1.9 Công nợ (`ReceivablesTab.tsx` + `DebtAgingPanel.tsx`) — `desktop-12/13`, `mobile-12/13`

- **Đây là màn hình mạnh nhất về trực quan hoá** (2 KPI card lớn + 5 bucket tuổi nợ màu + thanh
  tỷ trọng ngang) — cấu trúc gần với Apple Health/App Store Connect dashboard nhất trong cả module.
  Nên dùng làm **mẫu chuẩn cho Tổng quan** (KPI 2 tầng: card lớn nổi bật + card phụ nhỏ hơn).
- **LỖI MOBILE NGHIÊM TRỌNG (P0)**: bảng "Chi tiết theo nhà cung cấp/khách hàng"
  (`DebtAgingPanel.tsx` dòng 209 `<div className="overflow-x-auto"><table>...`) **KHÔNG có biến thể
  card-list cho mobile** — vi phạm trực tiếp quy tắc bắt buộc §12.4 của chính
  `docs/design-guidelines.md` ("Bảng ≥5 cột → card-list trên mobile"). Ảnh `mobile-12-cong-no-phai-
  tra.png` cho thấy hậu quả: cột "NHÀ CUNG CẤP" bị bóp còn ~70px, tên công ty dài tràn thành **6-8
  dòng** trong 1 ô, bảng cao gấp nhiều lần màn hình, phải cuộn ngang lẫn dọc để đọc — hoàn toàn không
  dùng được trên điện thoại thật.
- **Thanh sub-tab cấp 2** ("TC: Tổng quan | TC: Sổ quỹ | TC: Công nợ & Thiết lập") bị tràn ngang trên
  mobile, chữ đầu bị cắt "ng quan" (thấy ở toàn bộ ảnh `mobile-12/13/14/16`) — không có
  `overflow-x-auto` + `shrink-0` cho thanh tab cấp 1 module Bộ phận Thu mua khi kết hợp với thanh tab
  cấp 2 của Tài chính, 2 tầng tab dồn lên nhau chiếm quá nhiều chiều cao màn hình nhỏ (ảnh mobile
  header chiếm ~140px cho 3 tầng điều hướng trước khi tới nội dung).
- **Nút "Phải trả"/"Phải thu" ở góc phải** dùng style pill 2 nút cạnh nhau tương tự segmented control
  nhưng thực chất là 2 route khác nhau (không phải filter tại chỗ) — nên cân nhắc làm rõ bằng
  `Tabs` component có sẵn (`tabs.tsx`) thay vì 2 `Button` rời để nhất quán về mặt hành vi.

### 1.10 Tài khoản / Nguồn tiền (`AccountsTab.tsx`) — `desktop-14`, `mobile-14`

- **Card ngân hàng/tiền mặt đơn giản, sạch, đúng tinh thần Apple Wallet** (icon vuông bo góc màu +
  tên + số dư lớn + mô tả phụ) — đáng làm mẫu cho card nguồn tiền ở nơi khác (vd trong form chọn
  nguồn chi/thu).
- **Khoảng trắng bên phải lãng phí lớn trên desktop** (`desktop-14`): card chỉ chiếm ~1/3 chiều rộng
  (grid không set `grid-cols`, các card xếp cột đơn `space-y` thay vì lưới 2-3 cột dù màn hình
  1440px thừa chỗ) — với ≥4-5 nguồn tiền thực tế (nhiều hơn demo 2 nguồn), trang sẽ dài lê thê theo
  chiều dọc một cách không cần thiết.
- **Nút sửa (icon bút chì)** nằm góc trên-phải mỗi card, nhỏ, không có nền/hit-area rõ ràng — khó
  bấm chính xác trên tablet.
- **"Ẩn nguồn"** dùng link text màu đỏ ở cuối card — hành động ẩn (khác xoá) không nên dùng màu đỏ
  cảnh báo (dành cho destructive thật sự); nên dùng màu trung tính + icon mắt gạch chéo.

### 1.11 Danh mục thu chi (`CategoriesTab.tsx`) — `desktop-16`, `mobile-16`

- **Màn đơn giản nhất và ít lỗi nhất** — 2 cột Chi/Thu rõ ràng, mobile tự động xếp dọc gọn gàng,
  list item có padding đều, icon mũi tên lên/xuống phân biệt tốt bằng màu (đỏ cam cho Chi, xanh lá
  cho Thu) đúng tinh thần "màu ngữ nghĩa tiết chế". **Dùng làm chuẩn pattern "list grouped inset"**
  cho các màn danh sách thiết lập khác (Tài khoản nên theo hướng card nhỏ gọn tương tự khi số lượng
  nguồn tiền tăng).
- Mã kỹ thuật (`CHI_DIENNUOC`) hiện bằng `font-mono` màu tối cùng cỡ với tên hiển thị phía trên chỉ
  khác `text-xs` — ổn, nhưng có thể ẩn hẳn khỏi giao diện thường (chỉ hiện khi sửa) vì người dùng
  cuối không cần thấy mã kỹ thuật nội bộ.

### 1.12 Import Excel wizard — `desktop-05-import-excel-wizard.png`, `mobile-05-import-excel-wizard.png`

- **Stepper 3 bước (Tải file → Xem trước → Kết quả)** rõ ràng, dropzone lớn dễ thao tác — điểm cộng.
- Dùng `Dialog` giữa màn hình giống các form khác — nhất quán với vấn đề chung §1.3, nhưng vì đây là
  luồng nhiều bước (wizard), Dialog cố định kích thước hợp lý hơn Sheet (không cần thay đổi ở đây).
- Nút "Tải file Excel mẫu" đặt ngang hàng dropzone nhưng lệch trái, không cùng trục với nút hành động
  chính "Tiếp theo — Xem trước" bị disable (nhạt, đúng vì chưa chọn file) ở góc phải — bố cục ổn.

---

## 2. Nguyên tắc Apple áp dụng cụ thể cho app này

Không áp dụng chung chung "làm cho đẹp giống Apple" — dưới đây là quy tắc cụ thể, neo vào token đã
có trong `tailwind.config.ts`/`globals.css`, chỉ bổ sung tối thiểu.

### 2.1 Thang typography (dùng token có sẵn, không thêm size mới)

| Vai trò | Token hiện có | Áp dụng |
|---|---|---|
| Tiêu đề trang ("Tổng quan Tài chính") | `text-xl md:text-2xl font-semibold` (đã đúng — giữ nguyên) | Không đổi |
| Số KPI chính (1 số nổi bật nhất/trang, vd "Chênh lệch") | `text-3xl` (30px, đã có trong config dòng `fontSize["3xl"]`) thay vì `text-xl` hiện tại (283) dùng chung cho cả 6 thẻ | Chỉ thẻ **1 số quan trọng nhất** dùng `text-3xl font-bold`, 5 thẻ còn lại giữ `text-xl font-semibold` — tạo phân cấp rõ thay vì 6 thẻ bằng nhau |
| Số tiền trong bảng/list | `text-sm tabular-nums` + `font-variant-numeric` (class `.tabular-nums` đã có ở `globals.css`) | Bắt buộc mọi ô tiền dùng `.tabular-nums`, đã áp dụng đúng ở hầu hết nơi — chỉ thiếu ở `DebtAgingPanel` mobile (chưa có card variant nên chưa kiểm tra được) |
| Nhãn phụ / mã kỹ thuật | `text-xs text-zinc-500` uppercase tracking-wide (đã có ở `h6` base style) | Dùng cho label KPI, mã hoá đơn kỹ thuật — tiết chế, không lạm dụng in hoa cho câu dài |
| Mô tả phụ dưới tiêu đề | `text-sm text-zinc-500` | Giữ 1 dòng, `truncate` có `title=` tooltip đầy đủ (hiện thiếu ở InvoicesTab đối tác) |

### 2.2 Bo góc + viền mảnh + shadow (nhất quán hoá — hiện đang lẫn `rounded-lg`/`rounded-2xl`)

- **Quy tắc**: card cấp 1 (KPI, panel tổng) → `rounded-2xl` (đã có token `borderRadius.lg = 8px`... 
  *lưu ý*: token `2xl` chưa định nghĩa trong `tailwind.config.ts` — hiện `rounded-2xl` đang dùng giá
  trị mặc định Tailwind (16px) không phải token riêng của app. **Đề xuất bổ sung tối thiểu**: thêm
  `borderRadius.xl = "12px"` và giữ nguyên `2xl` mặc định 16px, rồi quy ước: input/button/badge nhỏ
  → `rounded-md` (6px, đã có); card/dialog/sheet → `rounded-xl` (12px, cần thêm) hoặc `rounded-2xl`
  (16px, Tailwind default) — **chọn 1 cấp duy nhất cho toàn bộ card Tài chính** để hết lẫn lộn giữa
  `OverviewTab` (`rounded-lg` cho KPI, `rounded-2xl` cho biểu đồ) và `DebtAgingPanel` (toàn bộ
  `rounded-2xl`). Khuyến nghị: **card Tài chính đồng loạt `rounded-xl`** (mới, 12px — giữa 2 giá trị
  đang dùng lẫn lộn, gần "Apple card" hơn `lg` 8px nhưng không quá tròn như `2xl` 16px).
- **Viền mảnh thay shadow nặng**: giữ nguyên `border border-zinc-200` + `shadow-sm`/`shadow-xs` (đã
  có token, dùng đúng ở phần lớn nơi) — KHÔNG thêm shadow đậm hơn. Đây là điểm app đã làm đúng theo
  Apple (macOS/iOS card dùng viền 1px mảnh + shadow rất nhẹ, không glassmorphism blur nặng).
- **Card có thể click (row/item)** → dùng lại class `.card-interactive` đã có sẵn trong
  `globals.css` (hover nâng nhẹ `translateY(-1px)` + đổi viền) — hiện `DebtAgingPanel` dòng 226 chỉ
  đổi `bg-zinc-50` khi hover, không dùng class chuẩn này. Thống nhất lại.

### 2.3 Segmented control thay tab/button rời

- Thay 3 `Button` rời (7/30/90 ngày ở Tổng quan, dòng 77-90 `OverviewTab.tsx`) bằng 1 khối segmented
  control nền `bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5` chứa 3 nút con `rounded-md`, nút active
  có nền trắng + shadow-xs (đúng pattern iOS Settings/macOS System Settings segmented control). Có
  thể dựng bằng `Tabs`/`TabsList` sẵn có (`components/ui/tabs.tsx`) nếu API cho phép style pill, nếu
  không đủ linh hoạt thì thêm 1 biến thể nhỏ, KHÔNG viết component mới từ đầu.
- Áp dụng tương tự cho "Tất cả/Thu/Chi" (đã gần đúng dạng pill ở `CashbookTab` — giữ nguyên, chỉ cần
  đảm bảo cùng 1 component tái dùng ở `PaymentsTab` "Tất cả/Thu (từ khách)/Chi (cho NCC)" thay vì
  style riêng lẻ nếu đang lệch.
- "Phải trả"/"Phải thu" ở Công nợ (§1.9) chuyển từ 2 Button độc lập sang segmented 2 ô trong cùng 1
  khối nền xám, giữ hành vi điều hướng route nhưng nhất quán hình ảnh với các segmented khác.

### 2.4 Số tiền: tabular-nums, căn phải, màu ngữ nghĩa CHỈ ở số

- Giữ nguyên nguyên tắc đã đúng ở phần lớn bảng: số căn phải, `.tabular-nums`, xanh cho thu
  (`text-emerald-600/700`), đỏ/hồng cho chi (`text-rose-600`) — **không tô màu cả nền ô hay cả
  dòng** (hiện đúng, không có vi phạm nghiêm trọng). Chỉ bổ sung: thêm icon mũi tên nhỏ
  (`ArrowUpRight`/`ArrowDownRight`, đã dùng ở `OverviewTab` cho growth pill) đặt NGAY TRƯỚC số tiền
  trong bảng Sổ quỹ và list Thanh toán — hiện 2 nơi này chỉ dựa vào dấu +/− và màu, thiếu icon nên
  kém hơn 1 bậc so với Tổng quan.
- Badge trạng thái (`StatusPill`) đã tiết chế đúng chuẩn (nền nhạt, chữ đậm màu, không chói) — giữ
  nguyên, đây là nơi làm tốt nhất của cả hệ thống, dùng làm mẫu nếu tạo thêm badge mới.

### 2.5 Sheet (drawer phải) thống nhất cho MỌI form nhập liệu Tài chính

Đây là thay đổi kiến trúc quan trọng nhất của spec này:

- **Quy tắc mới**: mọi form "Tạo/Sửa" trong Tài chính (Phiếu thu, Phiếu chi, Tạo hoá đơn, Ghi nhận
  thanh toán, Thêm nguồn tiền, Thêm danh mục) chuyển từ `Dialog` (modal giữa màn hình) sang `Sheet`
  (drawer trượt từ phải, component có sẵn `components/ui/sheet.tsx`, KHÔNG cần tạo mới).
  - Form đơn giản (Phiếu thu/chi, Thêm nguồn, Thêm danh mục) → `size="md"` (420px, đã có).
  - Form phức tạp có danh sách con động (Tạo hoá đơn nhiều dòng nếu tương lai mở rộng, Ghi nhận
    thanh toán với "Phân bổ cho hoá đơn (N)") → `size="lg"` (560px, đã có).
  - Trên mobile, `Sheet` đã tự `w-full` (side=right fallback full width dưới `md` theo
    `sizeClasses.right.md = "w-full md:w-[420px]"`) — tương đương bottom-sheet về mặt UX (chiếm toàn
    màn hình), NHƯNG cần đổi `side="bottom"` cho mobile thực sự đúng thumb-reach hơn side="right" khi
    full-width (tránh cảm giác "trang mới" thay vì "lớp phủ tạm"). Cân nhắc: `side` responsive
    (`bottom` dưới `md`, `right` từ `md`) — cần kiểm tra Radix Dialog Content có hỗ trợ đổi động
    `side` theo breakpoint hay phải làm 2 biến thể; nếu phức tạp, **giữ `side="right"` cho mọi kích
    thước làm V1 của thay đổi này (đơn giản hơn, vẫn nhất quán, đúng YAGNI)** — không bắt buộc phải
    làm bottom-sheet ngay.
- **Lợi ích đo được**: xoá bỏ hoàn toàn sự lẫn lộn "tạo mới = giữa màn hình, xem = bên phải" đang
  tồn tại ở TẤT CẢ 6 form đã chụp ảnh (`desktop-03, 03b, 07, 07b, 10, 15`).
- `Dialog` (modal giữa màn hình) chỉ còn dùng cho: xác nhận (Huỷ hoá đơn, Xoá danh mục — đã đúng qua
  `ConfirmActionDialog`/`DialogConfirm`) và wizard nhiều bước (Import Excel — giữ nguyên, đã hợp lý
  vì nội dung wizard không phải "form field theo đối tượng nghiệp vụ" mà là quy trình).

### 2.6 List grouped kiểu inset (thay bảng dày đặc ở nơi phù hợp)

- Màn Danh mục (`CategoriesTab`) đã là mẫu chuẩn — nhân rộng sang:
  - **Tài khoản/Nguồn tiền**: giữ card nhưng gom vào lưới `sm:grid-cols-2 lg:grid-cols-3` (xem §3.6)
    thay vì cột đơn lãng phí không gian ngang.
  - **Thanh toán**: đã là list card hàng ngang — chỉ cần thêm avatar tròn nhỏ chứa icon Thu/Chi bên
    trái mỗi dòng (pattern "list row có leading icon" chuẩn iOS Mail/Messages) thay vì chevron đơn
    độc.

### 2.7 Empty / loading / error state

- `EmptyState`, `QueryError`, `Skeleton` đã có component chuẩn dùng khá nhất quán (đúng nguyên tắc
  DRY) — chỉ cần đổi icon minh hoạ trong `EmptyState preset="no-data"` từ hộp 3D isometric (không
  hợp phong cách phẳng) sang icon line 1 màu 48px kiểu SF Symbols (vd `Inbox`, `TrendingUp` nhạt màu)
  — việc này chỉnh trong `components/ui/empty-state.tsx` (dùng chung toàn app, ảnh hưởng ngoài Tài
  chính nên cần review riêng, **không nằm trong scope sửa chỉ-Tài-chính**, ghi nhận ở đây để backlog).

### 2.8 Dark mode

- Toàn bộ token đã có biến thể `dark:` đầy đủ trong các file đã đọc (`OverviewTab`, `DebtAgingPanel`,
  `sheet.tsx`, `dialog.tsx`) — không phát hiện thiếu `dark:` nghiêm trọng qua đọc code (ảnh chụp đều
  ở light mode theo mặc định tài khoản admin, không chụp dark mode lần này). Khi thực thi redesign,
  bắt buộc giữ nguyên cặp `dark:` cho mọi class mới thêm, theo đúng checklist §12.6 mục 3 của
  `docs/design-guidelines.md`.

---

## 3. Spec redesign từng màn

### 3.1 Tổng quan (Dashboard KPI + biểu đồ dòng tiền)

```
┌─ Header ─────────────────────────────────────────────────────────┐
│ Tổng quan Tài chính            [7 ngày|30 ngày|90 ngày] Từ__ Đến__│  ← segmented control (§2.3)
└────────────────────────────────────────────────────────────────────┘
┌─ Hero KPI (1 số quan trọng nhất, rộng) ───────────────────────────┐
│  Chênh lệch thu–chi kỳ này          ↗ 12.4% so với kỳ trước       │
│  +106.740.000 ₫                     [sparkline mini 60px cao]     │
└────────────────────────────────────────────────────────────────────┘
┌─ 5 KPI phụ (đều nhau, nhỏ hơn hero) ───────────────────────────────┐
│ [Tổng thu ↗] [Tổng chi ↘] [Phải thu] [Phải trả] [Số dư TK]        │
└────────────────────────────────────────────────────────────────────┘
┌─ Dòng tiền theo ngày (chart, giữ CashflowChart hiện có) ──────────┐
│  [Thu +x% ] [Chi +x%]                          so với kỳ trước     │
│  [line/bar chart]                                                  │
└────────────────────────────────────────────────────────────────────┘
```

- Component dùng: `KpiCard` (sửa lại: thêm biến thể `variant="hero"` cho 1 thẻ đầu, `variant="compact"`
  cho 5 thẻ còn lại — cùng file `OverviewTab.tsx`, không tách file mới vì chỉ dùng nội bộ tab này).
- Class chính: hero card `rounded-xl border border-zinc-200 bg-white p-6 shadow-sm` + số
  `text-3xl font-bold tabular-nums`; compact card giữ `p-4` nhưng label full không `truncate` (đổi
  `grid-cols-2` → `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` để mỗi ô có đủ chiều rộng hiện hết chữ
  "Công nợ phải thu"/"Công nợ phải trả" mà không cắt — đây là fix bắt buộc cho lỗi mobile ở §1.1).
- Sparkline: dùng lại thư viện chart đã có trong `CashflowChart.tsx` (kiểm tra recharts hay tương tự
  đang dùng, tái sử dụng cùng lib, chỉ giảm kích thước + ẩn trục/tooltip cho bản mini).
- Date range: đổi 3 `Button` rời thành segmented (§2.3), input ngày tuỳ chỉnh giữ nguyên native
  `<input type=date>` (đã hợp lý, không cần custom date-picker — YAGNI).

### 3.2 Sổ quỹ (danh sách giao dịch + lọc)

```
┌─ Header ───────────────────────────────────────────────────────────┐
│ Sổ thu chi · 19 giao dịch      [Nhập Excel][Chuyển quỹ][+ Thu][+Chi]│
├──────────────────────────────────────────────────────────────────── ┤
│ [Tất cả|Thu|Chi]  [Nguồn ▾] [Danh mục ▾] [chip: 30 ngày gần đây ×]  │
├──────────────────────────────────────────────────────────────────── ┤
│ Hôm nay                                                             │
│  ↘ PC-2609-0004  mua dao phay          Tiền mặt        −200.000 ₫  │
│ 23/09/2026                                              Đã huỷ      │
│ ── nhóm theo ngày, header ngày sticky nhỏ, giống iMessage/Mail ──   │
└──────────────────────────────────────────────────────────────────── ┘
```

- Nhóm dòng theo ngày (header ngày dạng `text-xs uppercase text-zinc-400 sticky top-0 bg-zinc-50/80
  backdrop-blur px-4 py-1.5`) thay vì cột "NGÀY" lặp lại từng dòng — giảm mật độ chữ số, tăng khả năng
  quét nhanh "hôm nay có gì".
- Icon hướng (↗/↘, 14px) đặt ngay trước mã phiếu, cùng màu với số tiền — bổ sung cho §2.4.
- 2 nút chính "+ Thu"/"+ Chi" đồng cấp về màu (cả 2 `variant="default"` nhưng có thể phân biệt bằng
  icon +/− trong nút) thay vì hiện tại chỉ "Phiếu chi" nổi bật.
- Giữ bảng dạng hiện tại cho desktop rộng (đã đọc được, không sai layout cơ bản) — thay đổi chính là
  visual density + grouping, không đổi cấu trúc DOM lớn.
- Form "+ Thu"/"+ Chi" chuyển sang `Sheet size="md"` (§2.5).

### 3.3 Hoá đơn

- Giữ nguyên bảng desktop + card mobile (đã đúng, §1.4) — chỉ sửa:
  - Thêm `title={fullPartnerName}` cho ô đối tác bị `truncate`.
  - Thêm icon ▲ đỏ nhỏ cạnh text "Quá hạn" trên card mobile (đồng bộ desktop).
  - Gộp "+ HĐ đầu vào"/"+ HĐ đầu ra" thành 1 nút `+ Hoá đơn` mở `DropdownMenu` (component có sẵn
    `dropdown-menu.tsx`) 2 lựa chọn — giảm 1 nút trên header.
- Form tạo hoá đơn chuyển `Sheet size="md"`, giữ nguyên bố cục 2 cột bên trong nhưng field ngày +
  VAT dùng `grid-cols-1 sm:grid-cols-2` (thay vì cố định 2/3 cột) để mobile field không bị bóp
  (fix §1.5).

### 3.4 Thanh toán

```
┌─ Lịch sử thanh toán · 5 đợt ───────────────── [+ Ghi nhận thanh toán]┐
│ [Tất cả|Thu (từ khách)|Chi (cho NCC)]                                │
├───────────────────────────────────────────────────────────────────── ┤
│ (●↘) TT-2609-0001  Đã huỷ                          −15.360.000 ₫  › │
│      15/09/2026 · Vietcombank CN Bình Dương                         │
│      CÔNG TY TNHH SẢN XUẤT... (title đầy đủ khi hover/tap)          │
└───────────────────────────────────────────────────────────────────── ┘
```

- Thêm avatar tròn 32px chứa icon hướng (Thu=`ArrowDownLeft` xanh nền xanh nhạt, Chi=`ArrowUpRight`
  đỏ nền đỏ nhạt) bên trái mỗi row — dùng `cn()` + palette đã có (`emerald-50/600`, `rose-50/600`).
  Tham chiếu 1 cách dùng: `bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400`.
- Form "Ghi nhận thanh toán" chuyển `Sheet size="lg"` (560px, đủ chỗ cho khối "Phân bổ hoá đơn" dạng
  bảng con mà không bóp cột như Dialog hiện tại) — fix §1.8.
- Khối "Phân bổ cho hoá đơn (0)" khi rỗng: dùng mini `EmptyState` (icon + text 2 dòng) thay vì 1 dòng
  chữ xám đơn độc.

### 3.5 Công nợ

- Giữ nguyên cấu trúc hiện có (đã tốt nhất module, §1.9) — chỉ 2 thay đổi:
  1. **Bắt buộc (P0)**: thêm biến thể card-list cho bảng "Chi tiết theo đối tác" dưới `md`, theo
     đúng pattern §12.4 đã có trong `docs/design-guidelines.md` (toggle ở `<div>` wrapper, không đổi
     `<table>`):
     ```tsx
     <div className="hidden overflow-x-auto md:block">
       <table>...</table>{/* giữ nguyên nguyên bản */}
     </div>
     <div className="space-y-2 md:hidden">
       {partners.map((p) => (
         <div key={p.partnerId} className="card-interactive rounded-xl p-3" onClick={...}>
           <div className="flex items-start justify-between gap-2">
             <p className="min-w-0 flex-1 text-sm font-medium">{p.partnerName}</p>
             <p className="shrink-0 text-sm font-semibold tabular-nums">{fmtVND(p.outstandingAmount)}</p>
           </div>
           <div className="mt-1 flex justify-between text-xs text-zinc-500">
             <span>{p.invoiceCount} hoá đơn</span>
             {p.maxOverdueDays > 0 && <span className="text-red-600">{p.maxOverdueDays} ngày quá hạn</span>}
           </div>
         </div>
       ))}
     </div>
     ```
  2. "Phải trả"/"Phải thu" chuyển sang segmented 2 ô (§2.3) thay vì 2 Button rời.
- Sửa thanh tab tràn ngang trên mobile (§1.9, ảnh hưởng toàn trang Bộ phận Thu mua chứ không riêng
  Tài chính): thêm `overflow-x-auto` + item `shrink-0` cho thanh tab cấp 1 lẫn cấp 2 khi kết hợp,
  đây là sửa ở layout `sales/page.tsx` hoặc component tab dùng chung, cần xác nhận phạm vi ảnh hưởng
  trước khi sửa (có thể đã có class này nhưng bị token `sm=640px` ăn vào — ghi nhận cần điều tra
  thêm, không đoán chắc nguyên nhân qua ảnh).

### 3.6 Form tạo phiếu (mẫu chung cho Thu/Chi/Hoá đơn/Thanh toán)

- Chuyển toàn bộ sang `Sheet` (side="right", size theo độ phức tạp — §2.5).
- Cấu trúc chuẩn bên trong `SheetBody`:
  ```
  [Icon] Tạo phiếu chi                                    ← SheetHeader, giữ nguyên
  ──────────────────────────────────────────
  Nguồn chi *                     [icon ngân hàng + tên ▾]  ← dùng AccountSourceSelect có sẵn
  Danh mục                        [— Không chọn — ▾]
  Số tiền *          Ngày giao dịch *
  [0            ]    [09/30/2026    ]
  Diễn giải
  [......................................]
  ℹ️ Giao dịch này KHÔNG gắn hoá đơn...    ← đổi từ text nhạt sang khối info nhẹ (bg-blue-50/icon)
  ──────────────────────────────────────────
  [Huỷ]                          [Tạo giao dịch]           ← SheetFooter cố định đáy
  ```
- Class ghi chú: đổi `<p className="text-xs text-zinc-400">` thành khối
  `<div className="flex gap-2 rounded-lg bg-blue-50 p-2.5 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"><Info className="h-3.5 w-3.5 shrink-0 mt-0.5"/><p>...</p></div>`
  (dùng token `info` đã có, không tạo màu mới).

### 3.7 Drawer chi tiết (Hoá đơn / Giao dịch)

- Giữ `Sheet size="md"`, nhưng đổi khối 4 trường meta từ `grid-cols-2` với label uppercase nhỏ +
  `border-b` từng dòng, sang **2 card nhỏ cạnh nhau kiểu "receipt"**:
  ```
  ┌─────────────────┐  ┌─────────────────┐
  │ Tổng tiền        │  │ Còn nợ           │
  │ 31 ₫             │  │ 31 ₫ (đỏ nếu >0) │
  └─────────────────┘  └─────────────────┘
  Hạn thanh toán: —          Đã trả: 0 ₫
  ```
  Card `rounded-lg border border-zinc-200 bg-zinc-50 p-3` — tạo cảm giác "thẻ tổng kết" thay vì
  bảng liệt kê, đúng tinh thần Apple Wallet pass.
- Đưa "Xem đơn mua liên quan" thành 1 `Button variant="outline" size="sm"` full-width có icon
  `ExternalLink`, đặt ngay dưới khối card tổng kết — thay vì link text nằm giữa nội dung.
- `SheetFooter` cố định chứa nút "Huỷ hoá đơn" (destructive, luôn ở đáy, tách khỏi nội dung cuộn) —
  áp dụng cho cả `InvoiceDetailSheet` và `TransactionDetailSheet`.

---

## 4. Danh sách file cần sửa + mức độ thay đổi

| File | Mức độ | Nội dung chính |
|---|---|---|
| `apps/web/src/components/finance/OverviewTab.tsx` | **Vừa** | Hero KPI + 5 KPI phụ (grid responsive fix truncate), segmented date range, sparkline mini trong hero |
| `apps/web/src/components/finance/DebtAgingPanel.tsx` | **Vừa** | Thêm card-list mobile cho bảng đối tác (P0 — bug thật), segmented Phải trả/Phải thu nếu gom vào đây |
| `apps/web/src/components/finance/CashbookTab.tsx` | **Vừa** | Nhóm dòng theo ngày, icon hướng cạnh số tiền, cân bằng nút +Thu/+Chi |
| `apps/web/src/components/finance/InvoicesTab.tsx` | **Nhỏ** | Tooltip tên đối tác, icon quá hạn ở card mobile, gộp nút HĐ đầu vào/ra thành dropdown |
| `apps/web/src/components/finance/PaymentsTab.tsx` | **Nhỏ–Vừa** | Avatar icon hướng đầu dòng, tên đối tác có tooltip |
| `apps/web/src/components/finance/AccountsTab.tsx` | **Nhỏ** | Grid responsive nhiều cột thay cột đơn, nút sửa có hit-area rõ, "Ẩn nguồn" đổi màu trung tính |
| `apps/web/src/components/finance/InvoiceDetailSheet.tsx` | **Vừa** | Card tổng kết 2 cột thay `dl` liệt kê, footer cố định cho nút Huỷ, nâng cấp link "xem PO" thành button |
| `apps/web/src/components/finance/TransactionDetailSheet.tsx` | **Vừa** | Đồng bộ pattern với InvoiceDetailSheet (chưa audit ảnh trực tiếp — áp cùng nguyên tắc §3.7) |
| Form tạo Phiếu thu/chi (trong `CashbookTab.tsx` hoặc file dialog riêng — cần xác nhận vị trí) | **Vừa–Lớn** | Đổi Dialog → Sheet, dùng `AccountSourceSelect`, khối info thay text nhạt |
| Form tạo hoá đơn (trong `InvoicesTab.tsx`) | **Vừa–Lớn** | Đổi Dialog → Sheet, field grid responsive |
| Form ghi nhận thanh toán (trong `PaymentsTab.tsx`) | **Lớn** | Đổi Dialog → Sheet size=lg, empty state cho khối phân bổ |
| `apps/web/src/components/finance/CategoriesTab.tsx` | **Không đổi / rất nhỏ** | Đã là mẫu chuẩn — chỉ ẩn mã kỹ thuật khỏi view thường nếu muốn tinh gọn thêm |
| `apps/web/src/components/finance/CashflowChart.tsx` | **Nhỏ** | Thêm biến thể mini (không trục/tooltip) cho sparkline hero KPI |
| `apps/web/src/components/finance/_format.ts` | **Không đổi** | Giữ nguyên, đã đúng chuẩn |
| `apps/web/src/components/ui/sheet.tsx` | **Không đổi (khả năng)** | Có thể cần thêm `size="lg"` đã tồn tại — kiểm tra dùng đúng prop có sẵn, không sửa component nền trừ khi thiếu size |
| `apps/web/tailwind.config.ts` | **Rất nhỏ (tuỳ chọn)** | Cân nhắc thêm `borderRadius.xl = "12px"` nếu chốt dùng cấp bo góc mới cho card Tài chính — ảnh hưởng toàn app nên cần xác nhận trước khi thêm |
| `apps/web/src/app/(app)/sales/page.tsx` hoặc component tab dùng chung | **Điều tra thêm** | Lỗi tràn ngang thanh tab trên mobile (§1.9) — chưa xác định chắc chắn nguyên nhân qua ảnh, cần đọc thêm code trước khi sửa |

---

## Tổng kết ưu tiên đề xuất (không nằm trong yêu cầu bắt buộc nhưng nên theo khi triển khai)

1. **P0 — sửa ngay**: `DebtAgingPanel.tsx` bảng đối tác vỡ hoàn toàn trên mobile (vi phạm rule có sẵn).
2. **P0 — sửa ngay**: `OverviewTab.tsx` nhãn KPI bị cắt chữ trên mobile gây hiểu nhầm giữa 2 loại công nợ.
3. **P1**: Thống nhất Dialog → Sheet cho mọi form nhập liệu (thay đổi kiến trúc tương tác lớn nhất).
4. **P1**: Thanh tab tràn ngang mobile (cần điều tra thêm trước khi sửa).
5. **P2**: Hero KPI + sparkline, segmented control, icon hướng trong bảng/list — các nâng cấp thẩm mỹ.
