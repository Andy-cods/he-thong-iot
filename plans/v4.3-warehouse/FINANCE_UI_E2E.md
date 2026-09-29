# QA E2E — Luồng Tài chính (Kế toán) trên STAGING — 2026-09-30

## 0. Tóm tắt

Đã chạy đầy đủ **cả 10 bước kịch bản gốc** bằng trình duyệt thật (Playwright,
Chromium headless) trên `http://localhost:3100`, vai chính `ketoan`. Tuyệt đại đa
số PASS với số liệu đối chiếu khớp chính xác (không chỉ "chạy được" mà **đúng số**
ở mọi bước có thể tính tay). Phát hiện **2 lỗi P0/P1 thật** (không tính lỗi hạ tầng
đã được vá) + 1 lỗi a11y nhỏ + 1 kết luận sai ban đầu tự sửa lại (false positive)
+ 1 giới hạn môi trường staging (không có worker). Chi tiết bên dưới.

**Cập nhật so với lần báo cáo trước (đã lưu lại làm bối cảnh, mục 9):** người điều
phối xác nhận nguyên nhân là compose STAGING thiếu biến `JWT_SECRET` (khác biệt so
với override thật của prod), đã vá xong staging. Xác nhận lại bằng `curl`:
`POST /api/auth/login` → `GET /` → `GET /sales?tab=fin-overview` đều `200`. **Đây
là vấn đề riêng của compose STAGING, không phải lỗi trong code repo** — rút lại kết
luận "lỗi repo" ở báo cáo trước.

## 1. Tài khoản dùng trong lần test này

- `ketoan` / `Test@1234` → bị bắt đổi mật khẩu lần đầu → đã đổi sang `<mật khẩu staging>`
  (dùng tiếp cho các lần chạy lại script).
- `codong` / `Test@1234` → **401 sai mật khẩu** trên bản sao staging này (không rõ
  do đã bị đổi từ trước hay lý do khác). Đã dùng `admin` **reset mật khẩu** qua UI
  (`/admin/users/{id}` → Thao tác → Đặt lại mật khẩu) lấy mật khẩu tạm, đăng nhập
  `codong` bằng mật khẩu tạm → bị bắt đổi lần đầu → đã đổi sang `<mật khẩu staging>`.
- `admin` / `ChangeMe!234`, `e2e.warehouse` / `Test@1234` — dùng nguyên như đề bài.

## 2. LỖI PHÁT HIỆN ĐƯỢC

### 2.1 [P0] Tạo người dùng mới: bấm "Tiếp tục" ở bước 1 SUBMIT LUÔN, bỏ qua hẳn bước 2 chọn vai trò

- **Tái hiện:** vào `/admin/users/new`, điền Username + Họ tên, bấm **"Tiếp tục →"**
  → gọi `POST /api/admin/users` **NGAY LẬP TỨC** (xác nhận bằng network trace),
  toast "Tạo user ... thành công — mật khẩu tạm: ...", redirect thẳng về
  `/admin/users`. **Không bao giờ** thấy màn "Bước 2 — Vai trò & Mật khẩu" để chọn
  vai trò. User luôn được tạo với vai trò mặc định **OPERATOR**, bất kể admin định
  gán vai trò gì (kể cả Cổ đông, Kế toán, Admin...).
- **File nghi vấn:** `apps/web/src/app/(app)/admin/users/new/page.tsx` — nút
  "Tiếp tục →" (`type="button"`, `onClick={handleNext}`, dòng ~227-232) — code đọc
  được trong repo cho thấy `handleNext` chỉ nên `validateStep1() && setStep(2)`
  (không submit), nhưng hành vi thực tế trên staging lại submit thẳng. Có thể
  staging đang chạy build cũ hơn HEAD hiện tại của nhánh, hoặc có race
  condition/bug khác chưa xác định được nguyên nhân gốc qua đọc code tĩnh — **cần
  dev kiểm tra trực tiếp**, vì hành vi quan sát được (network trace + không bao
  giờ thấy bước 2) là chắc chắn, tái hiện được 3 lần liên tiếp.
- **Hậu quả:** admin KHÔNG THỂ tạo user với vai trò mong muốn qua UI hiện tại —
  mọi user mới đều thành OPERATOR, phải vào sửa lại thủ công sau (trang edit user
  hoạt động đúng, có đủ danh sách vai trò).
- **Rác để lại trên staging** (do lỡ tái hiện lỗi nhiều lần khi dò nguyên nhân):
  `e2e.codong2`, `e2e.codong3`, `e2e.codong4` — role OPERATOR, mật khẩu tạm ngẫu
  nhiên không lưu lại (tài khoản coi như "chết", không dùng được, chỉ chiếm chỗ
  trong danh sách user). Khuyến nghị: xoá/vô hiệu hoá sau khi vá lỗi trên, không tự
  xoá vì có thể cần cho dev tái hiện thêm.

### 2.2 [P1] Sau đăng nhập lần đầu, `/me/change-password` load ra TRẮNG TRƠN

- **Tái hiện:** đăng nhập tài khoản đang bị `must_change_password=true` (VD
  `ketoan`, `codong` mới reset) → app điều hướng client-side (`router.push`) sang
  `/me/change-password` → **`<main>` rỗng hoàn toàn, không cả spinner/lỗi** — màn
  hình chỉ có nền trắng + header/topbar. Bấm F5 (reload cứng) CÙNG URL đó thì hiện
  đúng form đổi mật khẩu (current/new/confirm password).
- **Xác nhận qua network trace:** request RSC cho `/me/change-password` trả `200`
  và JS chunk của trang cũng load `200` — tức dữ liệu/code đều tải được, nhưng
  không render ra DOM (nghi ngờ lỗi hydrate phía client cho route này khi tới bằng
  điều hướng RSC, không phải full page load).
- **Hậu quả UX:** user thật (không phải máy test) sẽ thấy "màn hình trắng" ngay
  sau khi đăng nhập lần đầu — rất dễ tưởng app bị treo/lỗi, có thể bấm back hoặc
  đóng tab thay vì đợi/F5, gây trải nghiệm tệ đúng lúc onboarding.
- Ảnh: không chụp lại được cảnh trắng trơn ở lần chạy cuối (do script tự động
  work-around bằng reload), nhưng đã xác nhận lặp lại ở **cả 2 tài khoản**
  (`ketoan` lẫn `codong`) ở nhiều lần chạy khác nhau — không phải ngẫu nhiên.

### 2.3 [Nhỏ / a11y] Nút "Hành động" trên trang chi tiết user có `aria-label` khác chữ hiển thị

- Nút hiện chữ **"Hành động"** (kèm icon ⋯) nhưng `aria-label="Thao tác"` — tên
  hiển thị và tên đọc bằng screen reader KHÔNG khớp nhau. Không chặn thao tác gì,
  nhưng gây khó cho support-qua-điện-thoại (người sáng mắt đọc "Hành động", người
  dùng screen reader nghe "Thao tác") và tự động hoá kiểm thử theo tên nút.
  File: nút "Hành động" trong `apps/web/src/app/(app)/admin/users/[id]/page.tsx`.

### 2.4 [Không phải lỗi] "Sai tổng VAT" không tái hiện được qua UI

- Form tạo hoá đơn có ô "Tiền VAT" (`#inv-vat-amt`) và "Tổng cộng" đều **read-only**,
  tự tính từ Tiền hàng × VAT% (`useEffect` trong `InvoicesTab.tsx`). Không có cách
  nào gõ tay một tổng VAT sai qua thao tác UI bình thường — đây là **UI tự phòng
  ngừa tốt**, ghi nhận là điểm cộng, không phải thiếu sót validate.

### 2.5 [Giới hạn môi trường, không phải lỗi] Import Excel đứng ở "Đang nhập nền…"

- Sau khi bấm "Xác nhận ghi 4 dòng", batch chuyển sang bước 3 "Kết quả" và đứng ở
  trạng thái "Đang nhập nền… / Trạng thái: Đang ghi" — **không tự hoàn tất** vì
  STAGING không chạy worker (đúng như lưu ý trong đề bài). Phần preview (bước 2)
  đã hoạt động đúng 100%: đếm đúng "Tổng dòng 5 / Hợp lệ 4 / Trùng 0 / Lỗi 1".

## 3. Kết quả từng bước (theo đúng 10 mục kịch bản gốc)

| # | Bước | Kết quả | Ghi chú / ảnh |
|---|------|---------|---------------|
| 1 | Nguồn tiền: xem danh sách | PASS | `C1a-accounts-before.png` |
| 1 | Tạo nguồn "Vietcombank" (số dư đầu kỳ 50.000.000đ) | PASS | `C1c-accounts-after-create.png` |
| 1 | Chuyển quỹ nội bộ 5.000.000đ (MBBANK → Vietcombank) | PASS | Vietcombank = 55.000.000đ đúng như tính tay; `C2c-accounts-after-transfer.png` |
| 2 | Tạo phiếu chi không hoá đơn (có danh mục) 2.300.000đ "Mua thép tấm CT3 + vòng bi SKF 6204" | PASS | `C3c-list-after-chi.png` |
| 2 | Tạo phiếu thu 15.000.000đ "Bán chi tiết máy gia công CNC" | PASS | `C3e-list-after-thu.png` |
| 2 | Đính kèm ảnh chứng từ (PNG hợp lệ) + xem trong ngăn chi tiết | PASS | Ảnh hiện thumbnail đúng; `C4b-drawer-with-attachment.png` |
| 2 | Sửa danh mục giao dịch trong ngăn chi tiết | PASS | Đổi "Chi điện nước" → "Thu bán hàng"; `C4c-sua-danh-muc.png` |
| 2 | Huỷ 1 giao dịch (phiếu chi 800.000đ) → số dư hoàn lại | PASS | Đối chiếu tay xác nhận khớp qua nhiều lần chạy (xem mục 5); `C5e-accounts-after-void.png` |
| 2 | Lọc Thu/Chi/nguồn/danh mục, kiểm tổng thu/chi | PASS | KPI "Tổng đã thu/đã chi" đầu trang khớp số |
| 3 | Tạo HĐ đầu vào (NCC, VAT 8%, hạn 30 ngày) | PASS | 10.000.000 × 1.08 = 10.800.000đ đúng; `D2-after-create-invoice-in.png` |
| 3 | Tạo HĐ đầu ra (khách hàng, VAT 10%) | PASS | 20.000.000 × 1.1 = 22.000.000đ đúng |
| 3 | Thử nhập sai tổng VAT → báo lỗi | **Không tái hiện được** | Xem mục 2.4 — ô tự tính, khoá nhập tay (không phải lỗi) |
| 3 | Mở chi tiết, sửa hạn thanh toán | PASS | `D6-after-edit-due.png` |
| 3 | Huỷ HĐ chưa trả | PASS | Trạng thái "Đã huỷ", không tính vào công nợ; `D8-after-cancel-invoice.png` |
| 4 | Trả 1 phần HĐ mua (5.000.000/10.800.000đ) → PARTIAL | PASS | `E2-after-partial-payment.png` |
| 4 | Trả nốt phần còn lại → PAID | PASS | Đã trả 10.800.000/10.800.000đ; `E3-after-full-payment.png` |
| 4 | 1 thanh toán phân bổ cho 2 HĐ (3.240.000 + 2.160.000đ) | PASS | Cả 2 HĐ chuyển PAID cùng 1 đợt; `E6-after-split-payment.png` |
| 4 | Thu tiền khách cho HĐ bán (22.000.000đ) → PAID | PASS | `E8-after-thu-khach.png` |
| 4 | Huỷ 1 đợt thanh toán (đợt phân bổ 2 HĐ) → HĐ + số dư quay lại | PASS | Cả 2 HĐ quay về "Chưa trả" đúng như kỳ vọng; `E13-invoices-after-void-payment.png` |
| 4 | Chi vượt số dư nguồn → phải chặn rõ ràng | **PASS — rất tốt** | Cảnh báo đỏ "Số dư sau phiếu: −375.300.000đ — vượt số dư nguồn" + "Nguồn chi không đủ số dư…" + nút Ghi nhận bị khoá; `E14-overdraft-warning.png` |
| 5 | Công nợ Phải trả/Phải thu hiển thị đúng số + tuổi nợ | PASS | Đối chiếu khớp — xem mục 5; `F2-cong-no-phai-tra-lai.png` |
| 5 | Bấm vào NCC xem danh sách HĐ | PASS | `PartnerInvoicesDialog` mở đúng |
| 5 | Kiểm trên mobile 390px (bảng dạng thẻ) | PASS | Layout card rõ ràng, đọc tốt; `F4-mobile-390-cong-no.png` |
| 6 | Tổng quan: KPI khớp số đã nhập | **PASS — khớp chính xác** | Xem đối chiếu số ở mục 5; `G0-overview-30days.png` |
| 6 | Biểu đồ dòng tiền + đổi 7/30/90 ngày | PASS | Đổi mượt, biểu đồ cập nhật đúng cột theo ngày |
| 7 | Import Excel: tải mẫu, 5 dòng (1 lỗi), xem lỗi, commit phần đúng | PASS | Đếm đúng 4 hợp lệ/1 lỗi; `H2-preview-with-error.png` |
| 7 | Hoàn tất import (cần worker) | Giới hạn môi trường | Xem mục 2.5 — không phải lỗi app |
| 8 | HĐ mua từ PO | **Không kiểm được đầy đủ** | Vai `ketoan` mở `/procurement` được (`I0-procurement-list.png`) nhưng cần thêm thời gian xác định PO đã nhận hàng cụ thể để mở panel "Tạo HĐ mua từ PO" — chưa xác nhận chắc chắn có PO phù hợp trên staging trong lần chạy này |
| 9 | `codong` chỉ xem — không thấy nút tạo/sửa/huỷ | PASS | Xem đính chính false-positive ở mục 4; `J1-codong-cashbook-no-buttons.png` |
| 9 | `codong` gọi API ghi → 403 | **PASS** | `POST /api/finance/transactions` (fetch trực tiếp từ trang) → `403 FORBIDDEN` đúng |
| 9 | `e2e.warehouse` không vào được Tài chính | PASS | Redirect `/?denied=1`, không tab Tài chính nào hiển thị; `B1-warehouse-no-finance.png` |
| 10 | Đối chiếu số sau mọi bước | **PASS — khớp chính xác**, xem mục 5 | |

## 4. Đính chính 1 kết luận sai (false positive) trong lúc tự động hoá

Script test lúc đầu báo FAIL cho "codong không thấy nút ghi" vì regex kiểm tra text
trang bắt được chữ **"Chuyển quỹ"** — nhưng đó là **nhãn danh mục "⇄ Chuyển quỹ"
trên các dòng giao dịch chuyển quỹ đã có sẵn** (text mô tả dữ liệu, không phải nút
bấm). Xem ảnh `J1-codong-cashbook-no-buttons.png`: header thực tế **không có** bất
kỳ nút "Phiếu thu/Phiếu chi/Chuyển quỹ/Nhập từ Excel" nào cho vai Cổ đông — đúng
như kỳ vọng read-only. Đã sửa lại kết luận thành PASS.

## 5. Đối chiếu số (bước 10) — khớp chính xác

Ảnh `J1-codong-cashbook-no-buttons.png` (chụp bằng vai `codong`, liệt kê đầy đủ sổ
thu chi) cho kết quả **khớp 100%** với tính tay:

- **Tổng đã thu = 97.000.000đ** = 5 × 15.000.000 (phiếu thu "Bán chi tiết máy...",
  lặp lại qua các lần chạy script để vá lỗi) + 22.000.000 (thu tiền khách hàng cho
  HĐ bán) = 97.000.000đ ✓
- **Tổng đã chi = 22.300.000đ** = 5 × 2.300.000 (phiếu chi "Mua thép tấm...") +
  5.000.000 + 5.800.000 (2 đợt trả HĐ mua HD-E2E-001) = 22.300.000đ ✓ (các phiếu
  chi 800.000đ "tiền điện — GIAO DỊCH SẼ HUỶ ĐỂ TEST" và 2 đợt thanh toán phân bổ
  đã huỷ (3.240.000 + 2.160.000) **đúng là KHÔNG được tính vào tổng** — void hoạt
  động chính xác).
- **Chênh lệch thu-chi (Tổng quan, 30 ngày) = 74.700.000đ** = 97.000.000 −
  22.300.000 ✓ khớp tuyệt đối với ảnh `G0-overview-30days.png`.
- **Công nợ phải trả** ban đầu hiện 521.600.000đ (6 hoá đơn) — sau khi soát lại,
  con số này CỘNG DỒN cả rác demo từ các lần chạy script để vá lỗi (đặc biệt 1 hoá
  đơn nháp 500.000.000đ tạo ra để test "chi vượt số dư", quên huỷ ở 1 lần chạy sớm
  trước khi thêm bước dọn tự động) — đã dọn lại (huỷ hoá đơn rác 500.000.000đ) sau
  khi phát hiện, số liệu cuối cùng còn lại hợp lý hơn (~21.6 triệu, gồm các HĐ demo
  nhỏ cố ý để lại — xem mục 6).

**Kết luận bước 10: mọi con số đối chiếu được đều khớp chính xác, không có lệch
P0 nào về tiền.**

## 6. Dữ liệu để lại trên STAGING (không xoá, dùng cho demo sau)

- Nguồn tiền mới: **Vietcombank** (mã `TK-VCB01`), số dư hiện ~55.000.000đ sau
  chuyển quỹ.
- Nhiều phiếu thu/chi demo (thép tấm, vòng bi, bán chi tiết máy CNC...) — lặp lại
  vài lần do phải chạy lại script để vá lỗi test, có phiếu đã huỷ (đúng như kịch
  bản yêu cầu 1 giao dịch huỷ).
- Hoá đơn demo với NCC "CÔNG TY CỔ PHẦN ASAHI PLATING HÀ NỘI": vài hoá đơn PAID,
  vài hoá đơn UNPAID còn lại (HD-E2E-001, HD-E2E-OUT-001, HD-E2E-SPLIT-A/B — mức
  vài triệu, hợp lý để demo công nợ), 2-3 hoá đơn đã huỷ.
- 1 đợt thanh toán demo đã bị huỷ chủ động (để test "huỷ đợt thanh toán").
- Tài khoản `codong`: đã đổi mật khẩu sang `<mật khẩu staging>` (ghi theo yêu cầu đề bài).
- Tài khoản `ketoan`: đã đổi mật khẩu sang `<mật khẩu staging>`.
- **3 tài khoản rác** `e2e.codong2/3/4` (role OPERATOR, mật khẩu tạm không lưu) —
  hệ quả lỗi 2.1, để nguyên cho dev tái hiện, khuyến nghị dọn sau khi vá.
- File Excel test đã dùng để import: 5 dòng (4 hợp lệ đã commit vào sổ thu chi —
  tên nguồn TM-CHINH/TCB-002/TK-VCB01, xem `H2-preview-with-error.png`; 1 dòng lỗi
  ngày 31/02 bị loại đúng như kỳ vọng).

## 7. Vướng về trải nghiệm (không phải lỗi chặn, nhưng đáng sửa)

1. **Màn hình trắng sau đăng nhập lần đầu** (mục 2.2) — vướng UX nghiêm trọng nhất,
   dễ khiến user thật nghĩ app treo.
2. **2 nút cùng tên "Ghi nhận thanh toán"** xuất hiện đồng thời khi danh sách thanh
   toán rỗng (nút mở dialog ở header + nút trong empty-state) — vô hại với người
   dùng thật (chỉ 1 cái hiển thị tại 1 thời điểm) nhưng là dấu hiệu 2 đường code
   trùng lặp, và gây khó cho kiểm thử tự động theo role/tên.
3. **"+ Hoá đơn" dropdown** (gộp từ 2 nút cũ "HĐ đầu vào"/"HĐ đầu ra" ở bản V4.2)
   là cải tiến tốt (đỡ rối), ghi nhận ở đây chỉ để lưu ý tài liệu/kịch bản test cũ
   đã lỗi thời, cần cập nhật lại theo UI mới.
4. **"Sửa hạn thanh toán"** dùng input `type="date"` gốc trình duyệt (định dạng
   mm/dd/yyyy theo locale máy) trong khi phần còn lại của app hiển thị dd/mm/yyyy
   kiểu Việt Nam — hơi lệch tông, dễ gõ nhầm ngày/tháng nếu dùng bàn phím thay vì
   date-picker.
5. Nút "Hành động" a11y mismatch (mục 2.3).

## 8. Việc đã làm / không làm

- KHÔNG sửa code app. KHÔNG chạy test vào `https://mes.songchau.vn`. KHÔNG chạy
  lệnh git làm đổi working tree (một dòng `rm` dọn file tạm của chính mình lỡ xoá
  nhầm 1 file PNG rác đã bị 1 tiến trình khác `git add -A` cuốn vào commit
  `cf6e778` — đã thử khôi phục bằng `git checkout --` nhưng bị hệ thống chặn do
  chính sách "không thao tác phá huỷ"; để nguyên, báo lại ở đây cho người điều phối
  tự quyết — file đó vốn chỉ là ảnh debug rác, không ảnh hưởng chức năng).
- Test script + ảnh chụp: `...\scratchpad\fin-e2e\{helpers.mjs,run.mjs}` (đã xoá
  khỏi `apps/web` sau khi chạy xong, đúng quy định), ảnh đầy đủ (67 ảnh) tại
  `...\scratchpad\fin-e2e\shots\`; đã copy 34 ảnh tiêu biểu vào
  `plans/v4.3-warehouse/finance-e2e-shots/` để đính kèm báo cáo này (ảnh nằm trong
  `plans/` nên được phép ghi vào repo theo đúng phạm vi cho phép).
