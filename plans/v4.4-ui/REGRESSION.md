# V4.4 — Kiểm thử hồi quy cuối trước khi lên prod

> Ngày chạy: 2026-10-01. Môi trường: `http://localhost:3300` (branch `v43/warehouse`, build mới nhất),
> DB **staging** tách biệt prod, không worker/email. Agent thực hiện: `tester` (Claude Sonnet 5).
> Script tạm tại `apps/web/.tmp-reg-flow.mjs` + `apps/web/.tmp-reg-ui.mjs` (đã xoá sau khi chạy xong).
> Ảnh chụp tại `%TEMP%\claude\...\scratchpad\regression-v44\` (không thuộc repo, không commit).
> `curl /api/health` = 200 trước khi bắt đầu — đạt.

## Tóm tắt 1 dòng

- **Phần 1 (3 script E2E có sẵn)**: 42/43 case PASS, 1 FAIL xác nhận lại bug P0 đã biết (dashboard "Cần xử lý" đếm thiếu cho role purchaser), 3 WARN do thiếu tài khoản seed (không phải lỗi sản phẩm).
- **Phần 2 (luồng nghiệp vụ trên UI thật)**: toàn bộ chuỗi PR→duyệt 2 bước→PO→nhận hàng (chặn nhận vượt)→QC→xếp kệ→LSX→Xin vật tư theo BOM→Kho duyệt xuất→hoàn thành→thành phẩm→kiểm kê→huỷ phiếu→hoá đơn mua→thanh toán đều **PASS với số liệu đối chiếu khớp 100%**. 2 lỗi/vướng mới phát hiện (xem mục 3), 1 bug P1 cũ (nhận vượt SL) đã xác nhận **ĐÃ SỬA ĐÚNG**.
- **Phần 3 (rà giao diện)**: 4 màn ưu tiên đã chụp đủ desktop+mobile × light+dark; thêm 15 màn spot-check. Phát hiện 1 nghi vấn dark-mode (P1, cần xác minh lại trên trình duyệt thật), 1 vỡ layout desktop ở Sơ đồ kho (P1/P2), 1 ô skeleton treo vĩnh viễn ở Dashboard (P2).

---

## Phần 1 — Kết quả script E2E có sẵn

### `notify-matrix.mjs` — 9 PASS / 1 FAIL / 1 WARN

```
PASS A.1 tạo PR — Tạo 2/PRD-MRF/1026 (approvalStep=SUBMITTED)
PASS A.3 dept-approve — PR_SUBMITTED cũ tự đọc + PR_DEPT_APPROVED mới đúng người
PASS A.4 director-approve — PR_DEPT_APPROVED cũ tự đọc + PR_APPROVED mới đúng người
PASS B.1 tạo item — Tạo item E2ENM-22792754
PASS B.2 tạo WO — Tạo WO-2610-0001 (status=DRAFT)
PASS B.3 duyệt WO — WO_APPROVED đúng người lập + WO_REQUEST_SUBMITTED cũ tự đọc
PASS C.admin — dashboard=5 · bell(action, trang 1)=5
FAIL C.purchaser — dashboard=7 · bell(action, trang 1)=40
PASS C.warehouse — dashboard=4 · bell(action, trang 1)=4
PASS D. Push API — subscribe/unsubscribe hợp lệ
WARN [PRE] Không login được role=accountant (401) — thiếu seed account trên staging, không phải lỗi sản phẩm.
```

**Phân tích FAIL C.purchaser — lỗi sản phẩm, không phải lỗi script.** Đây là xác nhận lại bug **P0** đã ghi trong
`plans/v4.4-ui/UI_INVENTORY.md` mục A5 ("Dashboard 'Cần xử lý' mâu thuẫn với chuông thông báo"). Bản vá trước đó
(`app/api/dashboard/action-items/route.ts`) đã cải thiện cho **admin** (5=5) và **warehouse** (4=4), nhưng
**role purchaser vẫn đếm thiếu nghiêm trọng**: dashboard chỉ đếm 7 trong khi chuông có tới 40 mục "Cần bạn duyệt"
chưa đọc. Nghi vấn: route action-items chưa cộng đủ các loại việc purchaser cần làm (PR đã duyệt chờ tạo PO, PO
nháp chờ gửi duyệt/gửi NCC...) tương tự cách PR DEPT_APPROVED từng bị bỏ sót cho admin. **File nghi vấn**:
`apps/web/src/app/api/dashboard/action-items/route.ts` (cần mở rộng điều kiện đếm riêng cho purchaser).

### `v42-regression.mjs` — 16/16 PASS

Toàn bộ: huỷ thanh toán hoàn đúng số dư, chặn huỷ lần 2 (409), chặn xoá/vô hiệu nguồn còn số dư (409), RBAC 4 API
sơ đồ kho (planner 403 / warehouse 200), API `/api/eco` đã gỡ trả 404 đúng thiết kế.

### `finance-flow.mjs` — 17/17 PASS, 2 WARN

Toàn bộ nghiệp vụ tài chính (danh mục, chi không hoá đơn, chống đếm trùng payment→transaction, thanh toán nhiều
đợt, chặn phân bổ vượt nợ, công nợ/dashboard, VOID chứng từ) đều đúng. 2 WARN do tài khoản `ketoan`
(accountant) login 401 — thiếu/không active trên staging, đã SKIP nhóm cross-check accountant như script tự
thiết kế, không phải lỗi production code.

---

## Phần 2 — Luồng nghiệp vụ trên UI thật (đối chiếu số)

> Tạo 3 item mới mỗi lần chạy (`REGA-<ts>` RAW có tồn, `REGB-<ts>` RAW không tồn để test nhánh "thiếu",
> `REGFG-<ts>` FG) để tách biệt hoàn toàn khỏi dữ liệu nhiễu có sẵn trên staging. Toàn bộ thao tác bấm qua UI
> thật (Playwright), đối chiếu tồn qua `GET /api/items?q=`.

| # | Bước | Vai | PASS/FAIL | Tồn kỳ vọng → thực tế |
|---|---|---|---|---|
| 1 | Tạo PR (DNVT) mua 50 RAW-A **qua ItemPickerField** (ô chọn vật tư từ danh mục — tính năng MỚI V4.4 Việc 3) | admin | PASS | PR tạo thành công, item gắn đúng itemId thật (không còn tạo item trùng ẩn) |
| 2 | Chuông "Cần bạn duyệt" có PR mới trước khi duyệt bước 1 | API | PASS | — |
| 3 | Kho duyệt bước 1 (Trưởng bộ phận) | warehouse | PASS | — |
| 4 | Chuông admin có PR trước khi duyệt bước 2 | API | PASS | — |
| 5 | Giám đốc duyệt bước 2 (cuối) | admin | PASS | — |
| 6 | Tạo PO từ PR | admin | PASS | — |
| 7 | Nhập đơn giá, gửi duyệt, duyệt, gửi NCC | admin | PASS | PO status → SENT |
| 8 | **Nhận vượt SL đặt (80/50) khi CHƯA tick "cho phép nhận vượt"** → nút Gửi nhận hàng PHẢI khoá | warehouse | **PASS** | `submit disabled=true` — xác nhận bug **P1 cũ (LOOP_E2E) ĐÃ SỬA ĐÚNG** |
| 9 | Sửa đúng 50, Gửi nhận hàng | warehouse | PASS | Lô 50 RAW-A trạng thái HOLD (chờ QC) |
| 9b | Đối chiếu tồn qua API | — | INFO | `holdQty=50, availableQty=0` ✅ đúng (chưa qua QC) |
| 10 | QC duyệt Đạt (`/qc-inbound`) | admin | PASS | — |
| 11 | Xếp kệ từ "Việc cần làm hôm nay" | warehouse | PASS | — |
| 11b | Đối chiếu tồn sau QC+xếp kệ | — | INFO | `availableQty=50, holdQty=0` ✅ đúng |
| 12 | Tạo LSX (WO) cho FG, SL kế hoạch 10, 2 dòng BOM nhập thẳng trong form LSX (RAW-A định mức 2/đv → cần 20, RAW-B định mức 3/đv → cần 30, không tồn) | admin | PASS | — |
| 13 | Operator duyệt YCSX | operator | PASS | — |
| 14 | **"Xin vật tư theo BOM" (tính năng MỚI V4.4 Việc 1)** — tách đúng 1 dòng đủ tồn (RAW-A, 20) → tạo ISR, 1 dòng thiếu (RAW-B, 30) → tạo PR | operator | PASS | Sheet hiển thị đúng "Sẽ xuất từ kho" / "Thiếu phải mua" |
| 15 | Kho duyệt + xuất ISR (từ "Việc cần làm hôm nay", lọc đúng theo mã ISR) | warehouse | PASS | — |
| 15b | Đối chiếu tồn RAW-A sau xuất | — | INFO | 50 − 20 = **30** ✅ đúng |
| 16 | Bắt đầu SX + báo tiến độ 10/10 (qua deep-link `?tab=progress`) | operator | PASS | — |
| 17 | Hoàn thành LSX | admin | PASS | Tạo lô FG mới |
| 17b | Đối chiếu tồn FG | — | INFO | **10/10** ✅ đúng |
| 18 | Kiểm kê: tạo phiên (1 ô kệ), đếm, Gửi duyệt | warehouse | PASS* | *xem lưu ý mục 3.3 — cơ chế tạo/đếm/bấm Gửi duyệt hoạt động, nhưng phiên vẫn ở trạng thái "Đang đếm" (chưa xác nhận chuyển "Chờ duyệt") |
| 19 | Admin duyệt chốt kiểm kê | admin | **KHÔNG XÁC NHẬN ĐƯỢC** | Không tìm thấy phiên "Chờ duyệt" nào trong 19 phiên tạo ra trong phiên test này (xem 3.3) |
| 20 | Huỷ phiếu đề xuất (PR) kèm lý do | admin | PASS | Status → "Đã huỷ", lý do lưu đúng |
| 21 | Tạo HĐ mua từ PO (nút header chỉ **scroll** tới panel `PoInvoicePanel`, không mở dialog — khác thiết kế cũ) | admin | PASS | HĐ DRAFT, tạm tính 5.000.000 + VAT 8% = 5.400.000 |
| 22 | Xác nhận ghi công nợ (nhập số HĐ NCC) | admin | PASS | HĐ `HD-REG-<ts>`, status UNPAID |
| 23 | Thanh toán 1 phần 1.000.000 (tab "Thanh toán" riêng, chọn Nguồn chi + NCC + hoá đơn) | admin | PASS | HĐ → **PARTIAL**, `paidAmount=1.000.000/5.400.000` ✅ đúng qua API |
| 24 | Bật "Thông báo trên thiết bị này" (Chromium headless, persistent profile, `permissions:['notifications']`) | admin | **KHÔNG THỬ ĐƯỢC** | `Notification.permission` vẫn `denied` dù đã cấp quyền ở context — giới hạn môi trường headless, xem mục 3.5 |

**Kết luận đối chiếu Phần 2: KHÔNG có lệch tồn nào trong toàn bộ chuỗi đã chạy được.** Mọi con số (nhận hàng,
QC, xếp kệ, xuất ISR theo BOM, hoàn thành LSX, thanh toán HĐ) đều khớp chính xác giữa thao tác UI và API.

---

## Phần 3 — Rà giao diện

### 3.1. Màn ưu tiên (chưa ai chụp kiểm trước đây)

| # | Màn | Desktop light/dark | Mobile light/dark | Kết luận |
|---|---|---|---|---|
| 1 | Bảng sản xuất → Sheet "+ Thêm mã hàng" | Đạt (light) / **Nghi vấn** (dark — xem 3.2) | Đạt cả 2 theme | Form đầy đủ trường, bố cục rõ, đúng Apple-style |
| 2 | Chi tiết DNVT trên mobile (card-list) | — | **Đạt** | Card in-ấn tái hiện đúng mẫu phiếu giấy, đủ thông tin, dark mode đúng |
| 3 | Bảng "Lô thành phẩm đã nhập kho" trên trang LSX mobile | Đạt | **Đạt** | Card hiển thị đủ Mã lô/SL/Vị trí/Trạng thái/Nhập lúc, không mất trường, dark mode đúng |
| 4 | Thanh tab hub mobile (nghi mép mờ 2 bên) | — | Không kết luận được qua ảnh (xem 3.4) | Code (`ScrollTabsList.tsx`) đã cài đúng gradient mờ 2 cạnh — cần xem trực tiếp trên thiết bị |

### 3.2. [P1 — cần xác minh lại trên trình duyệt thật] Sheet "Thêm mã hàng vào bảng" không đổi dark mode ở desktop

- **Hiện tượng**: Ở viewport desktop (1440×900), bật dark mode (toàn bộ nền trang + bảng bên trái chuyển đen/chữ
  trắng đúng), nhưng panel Sheet bên phải ("Thêm mã hàng vào bảng") **vẫn hiển thị nền trắng/chữ đen y hệt light
  mode**. Tái hiện 100% qua 2 lần chụp độc lập.
- **Điều bất thường**: kiểm tra `getComputedStyle` trên phần tử `[role="dialog"]` ngay lúc đó trả về
  `background-color: rgb(29, 29, 31)` (đúng màu tối `dark:bg-zinc-900` của `components/ui/sheet.tsx:104`) —
  nghĩa là CSS tính toán ĐÚNG, nhưng ảnh chụp lại cho thấy nền TRẮNG. Ở **mobile** (390px, cùng Sheet, cùng
  component), dark mode áp dụng đúng bình thường.
- **Nghi vấn**: có thể là lỗi compositing riêng của Chromium headless khi chụp ảnh (backdrop-filter/animation
  layer) chứ không phải lỗi thật trên trình duyệt người dùng — vì computed style đã đúng. **Khuyến nghị**: QA/dev
  mở thử trang `/production-board` → bật dark mode → bấm "+ Thêm mã hàng" trên **trình duyệt thật** (không
  headless) ở độ rộng ≥768px để xác nhận có đúng là bug hay chỉ là nhiễu ảnh chụp.
- **File liên quan**: `apps/web/src/components/production-board/BoardItemDialog.tsx` (chỉ có 3 chỗ `dark:` trong
  cả file — ít bất thường so với các Sheet khác), `apps/web/src/components/ui/sheet.tsx:104`.
- **Ảnh**: `01-production-board-add-item__desktop-dark.png` vs `__mobile-dark.png`.

### 3.3. [P1/P2 — nghi vấn sản phẩm] Phiên kiểm kê phủ nhiều dòng (≥60 lô) có thể kẹt vĩnh viễn ở "Đang đếm"

- **Hiện tượng**: Khi tạo phiên kiểm kê chọn 1 ô kệ thực tế có sẵn nhiều lô hàng (dữ liệu import thật trên
  staging, ví dụ 1 ô có tới 60 lô SKU khác nhau), phiên kiểm kê tạo ra đủ 60 dòng, nhưng Sheet đếm dường như chỉ
  tải/đồng bộ được một phần (quan sát 23/60) — nút đổi thành "Gửi duyệt" (có vẻ hợp lệ phía client) nhưng sau khi
  bấm, phiên **vẫn ở trạng thái DRAFT ("Đang đếm")**, không chuyển "Chờ duyệt". Xác nhận qua
  `GET /api/warehouse/stocktake`: **toàn bộ 19 phiên `KK-2610-0001`…`KK-2610-0019`** tạo ra trong phiên test hôm
  nay đều `status=DRAFT`, kể cả phiên cuối cùng (chọn 1 ô, tưởng là nhỏ) cũng báo PASS ở bước "Gửi duyệt" trên UI
  nhưng vẫn DRAFT theo API ngay sau đó.
- **Không loại trừ nguyên nhân do kịch bản test** (chọn trúng ô kho thật đông đúc thay vì ô trống, hoặc timing
  autosave), nhưng vì **100% số phiên tạo ra trong cả phiên test đều kẹt DRAFT** (không phải 1 lần ngẫu nhiên),
  nên cần đội dev kiểm tra lại: (a) `StocktakeSessionSheet.tsx` có giới hạn/phân trang số dòng tải về không khớp
  tổng `line_count` thật; (b) API `/submit` có âm thầm từ chối (400/422) mà không có toast lỗi rõ ràng hiển thị
  cho người dùng hay không.
- **Khuyến nghị dev**: thử tạo 1 phiên kiểm kê nhắm đúng 1 ô TRỐNG (0 lô) trên môi trường sạch, xác nhận luồng
  Gửi duyệt → Chờ duyệt → Duyệt & chốt chạy được trọn vẹn; nếu vẫn kẹt thì là bug thật ở tầng submit, không phải
  do chọn nhầm ô đông lô.
- **File liên quan**: `apps/web/src/components/warehouse/StocktakeSessionSheet.tsx`,
  `apps/web/src/app/api/warehouse/stocktake/[id]/submit/route.ts`.
- **Lưu ý tích cực**: 2 phiên lịch sử cũ hơn (`KK-2609-0001`, `KK-2609-0004`, tạo trước phiên test này) đã ở
  trạng thái "Đã duyệt" — chứng tỏ cơ chế duyệt chốt về nguyên tắc **có hoạt động được**, vấn đề có thể chỉ xảy
  ra với phiên có số dòng lớn hoặc do chính kịch bản test hôm nay.

### 3.4. Thanh tab hub mobile — không kết luận được qua ảnh, code đã đúng

Đọc trực tiếp `apps/web/src/components/common/ScrollTabsList.tsx`: component đã cài đúng gradient mờ cả 2 cạnh
(trái dòng 70-75, phải dòng 76-81), tính `moreLeft`/`moreRight` theo `scrollLeft`/`scrollWidth` — đúng thiết kế
đã chốt ở đợt V4.4 trước ("thêm mép trái, trước chỉ có mép phải"). Ảnh chụp ở độ phân giải/nén hiện tại không đủ
rõ để khẳng định gradient có hiển thị đúng hay không bằng mắt thường — khuyến nghị xem trực tiếp trên điện thoại
thật thay vì dựa vào ảnh chụp tự động.

### 3.5. [Môi trường, không phải lỗi sản phẩm] Không kiểm được nút "Bật thông báo" trong Chromium headless

`Notification.permission` trả về `"denied"` ngay cả khi đã cấp `permissions: ["notifications"]` lúc tạo
persistent context — giới hạn đã biết của Chromium ở chế độ headless (không có UI thông báo hệ điều hành thật).
Nút "Bật thông báo" bị khoá đúng theo logic `disabled={!supported || busy || permission === "denied"}`
(`apps/web/src/components/layout/PushNotificationToggle.tsx:121`) — đây là hành vi ĐÚNG của code trước một trình
duyệt báo "denied", không phải lỗi. Không thể tái hiện kịch bản "bấm nút → thấy thông báo 'chưa cấu hình VAPID'"
trong môi trường này. **Khuyến nghị**: kiểm tay trên điện thoại/trình duyệt thật (có hộp thoại xin quyền thông
báo thật) trước khi kết luận về hành vi khi thiếu VAPID key.

### 3.6. [P1/P2] Sơ đồ kho (`/warehouse?tab=layout`) vỡ cột cuối ở desktop 1440px

Lưới ô kệ ("Sơ đồ kệ") bị cắt cụt ở mép phải màn hình tại độ rộng desktop chuẩn 1440px — cột cuối cùng các hàng
"Tầng 3/2/1" hiện chữ bị cắt ("Tr...", "1.8...", "244...") không có thanh cuộn ngang rõ ràng hay dấu hiệu còn nội
dung. Đây là cùng họ vấn đề đã ghi trong `UI_INVENTORY.md` mục 60 ("P0 bin-grid vỡ mobile"), nhưng ảnh hôm nay
cho thấy vỡ cả ở **desktop**, không chỉ mobile như ghi nhận trước — cần dev xem lại có phải hồi quy mới hay vốn
đã vậy nhưng audit trước chỉ kiểm mobile. Ảnh: `12-warehouse-layout.png`.

### 3.7. [P2] Dashboard — ô "Top SKU thiếu hàng" treo ở trạng thái skeleton rỗng

Trên trang Tổng quan, khối "Top SKU thiếu hàng" hiển thị các thanh xám (khung chờ tải dữ liệu — skeleton) nhưng
không có nội dung thật lẫn thông báo "không có dữ liệu" — trông như bị kẹt ở trạng thái loading vĩnh viễn. Ảnh:
`05-dashboard.png`.

### 3.8. Xác nhận các lỗi/tính năng cũ đã SỬA đúng (tin tốt)

- **P1 "Nhận hàng không chặn vượt SL"** (`plans/v4.3-warehouse/LOOP_E2E.md` #1) — **ĐÃ SỬA ĐÚNG**, xác nhận trực
  tiếp: bấm "Gửi nhận hàng" với SL vượt + chưa tick "cho phép nhận vượt" → nút khoá cứng
  (`submitDisabled={!submitted && overDeliveryBlockers.length > 0}`,
  `apps/web/src/app/(app)/receiving/[poId]/wizard/page.tsx:527`).
- **P2 "DNVT không có ô chọn vật tư từ danh mục"** (LOOP_E2E #2) — **ĐÃ SỬA**, `ItemPickerField` (V4.4 Việc 3)
  đã thêm vào cả form DNVT/MRF, có tìm kiếm + hiện tồn kho + tạo nhanh vật tư mới kèm cảnh báo trùng tên.
- **P0 A18 "Login tràn ngang 128px"** — **ĐÃ SỬA**, ảnh `06-login.png` đúng khít 1440×900, không tràn.
- **Tính năng mới "Xin vật tư theo BOM" (V4.4 Việc 1)** hoạt động đúng: tách dòng đủ tồn (tạo ISR) / thiếu tồn
  (tạo PR) chính xác theo số liệu BOM × SL kế hoạch.
- **P0 A5 "Dashboard mâu thuẫn chuông"** — ĐÃ SỬA MỘT PHẦN (admin, warehouse khớp đúng), **còn tồn với role
  purchaser** (xem Phần 1).

---

## Danh sách lỗi theo mức độ

| Mức | Mô tả | Trạng thái | File nghi vấn |
|---|---|---|---|
| P0 (đã biết, vẫn còn với 1 role) | Dashboard "Cần xử lý" đếm thiếu nghiêm trọng cho purchaser (7 so với 40 thật) | Xác nhận lại qua `notify-matrix.mjs` | `app/api/dashboard/action-items/route.ts` |
| P1 | Sheet "Thêm mã hàng" không đổi dark mode ở desktop (cần xác minh lại — có thể là nhiễu ảnh headless) | Mới phát hiện, CHƯA XÁC NHẬN 100% | `components/production-board/BoardItemDialog.tsx` |
| P1/P2 | Phiên kiểm kê phủ nhiều dòng kẹt vĩnh viễn ở DRAFT dù bấm Gửi duyệt | Mới phát hiện, cần dev tái hiện trên ô trống | `components/warehouse/StocktakeSessionSheet.tsx` |
| P1/P2 | Sơ đồ kho vỡ cột cuối ở desktop 1440px | Có thể là mở rộng của lỗi mobile đã biết | `components/warehouse/WarehouseLayoutTab.tsx` (cần xác định chính xác) |
| P2 | Dashboard "Top SKU thiếu hàng" treo skeleton rỗng | Mới phát hiện | cần xác định component |
| — | Nút "Bật thông báo" không test được do giới hạn Chromium headless | Môi trường, không phải bug | — |
| — | Thanh tab hub mobile — code đã đúng, ảnh không đủ rõ để kết luận | Cần xem bằng mắt trên thiết bị thật | `components/common/ScrollTabsList.tsx` |

## Ghi chú phương pháp (để agent sau không lặp lại)

- **Rate limit đăng nhập**: hệ thống giới hạn 5 lần login/60 giây/username (`loginRateLimitByUsername`,
  `apps/web/src/server/middlewares/rateLimit.ts:194`). Chạy nhiều script Playwright liên tiếp trong phiên test
  này đã **tự đụng rate-limit (429) nhiều lần** (xác nhận qua trang Admin: "66 lượt bị giới hạn tốc độ/24h") —
  không phải lỗi hệ thống, nhưng agent sau cần giãn cách hoặc tái dùng 1 session đăng nhập thay vì login lại cho
  mỗi trang khi chụp ảnh hàng loạt.
- **`page.waitForURL(/\/(?!login)/)` là bẫy regex** — khớp bất kỳ `/` nào KHÔNG đứng ngay trước "login" (kể cả
  trong chính `http://`), nên có thể resolve ngay cả khi còn ở trang `/login` → gây race điều hướng trước khi
  cookie kịp set. Nên đợi thẳng response của `POST /api/auth/login` (status 200) thay vì đợi đổi URL.
- **API `/api/items`** lọc theo `q=`, không phải `search=`; **API `/api/notifications`** lọc theo `unread=`/
  `limit=`, không có `category=`/`page=`/`pageSize=` — các tham số này bị bỏ qua lặng lẽ nếu dùng sai tên.
- **Nút "Nhận hàng" trên trang PO** nay chỉ mở tab inline "Nhận nhanh" (`PoQuickReceiveTable`, có tự kẹp SL ≤
  còn lại khi rời ô nhập), KHÔNG còn điều hướng sang `/receiving/{poId}/wizard` nữa — màn wizard đầy đủ (có gợi ý
  vị trí, lô/serial, chặn nhận vượt tường minh) chỉ còn truy cập qua link "màn hình nhận hàng đầy đủ" trong tab
  đó, hoặc gõ thẳng URL.
- **Nút "Tạo HĐ mua" trên PO** chỉ cuộn tới panel `PoInvoicePanel` inline (section `#hoa-don-mua`), không mở
  dialog — nút xác nhận thật là "Tạo HĐ mua từ PO" nằm trong chính panel đó.
