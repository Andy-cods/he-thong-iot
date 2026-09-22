# Thiết kế mẫu Biên bản Giao hàng (BBGH) — V4 Finance

> Trạng thái: DRAFT — chỉ để THIẾT KẾ, chưa code. User tự sửa lại theo ý.
> Ngày viết: 2026-09-22. Tác giả: Claude (planner).

---

## 0. Tóm tắt nhanh (đọc trước khi đọc chi tiết)

- BBGH là **biên bản 2 bên ký xác nhận đã giao — nhận hàng đủ/thiếu/hỏng**, khác với Phiếu xuất kho (chứng từ nội bộ, không cần bên nhận ký).
- Sinh **tự động** khi Kho hoàn tất giao hàng (bước cuối luồng xuất hàng), số phiếu theo `genDocNo()` dạng `BBGH-{YYMM}-{seq4}`.
- Layout đề xuất: **A4 dọc**, in **3 liên** (bên giao / bên nhận / kế toán), bám 100% phong cách khung viền đen + section I/II/III... đã dùng ở `ycvtPdf.tsx`/`dnvtPdf.tsx`, nhưng bố cục dọc giống `poPdf.tsx` (đơn giản hơn, ít cột).
- Điểm quan trọng nhất: file PDF được thiết kế theo nguyên tắc **"sửa nhãn/cột/chữ ký ở 1 chỗ duy nhất"** — xem mục 4.
- Cuối tài liệu có 8 câu hỏi cần user xác nhận (mục 6) — tất cả chỗ suy đoán đều đánh dấu **[SUY ĐOÁN]** trong bài.

---

## 1. Bối cảnh nghiệp vụ

### 1.1 Vị trí BBGH trong luồng nghiệp vụ

```
Đề xuất xuất hàng (Kinh doanh/Kế hoạch tạo)
        │
        ▼
Giám đốc duyệt  ── chỉ bắt buộc khi lý do xuất = "Xuất bán / Giao khách hàng"
        │            (xuất nội bộ SX/chuyển kho khác không cần bước này)
        ▼
Kho xử lý giao hàng (pick, xuất kho vật lý — inventory_txn OUT_ISSUE)
        │
        ▼
Kho xác nhận "Hoàn tất giao hàng"
        │
        ▼
   ══════════════════════════
   HỆ THỐNG TỰ SINH BBGH      ← tài liệu này thiết kế phần này
   ══════════════════════════
        │
        ▼
Thông báo (notification) → Thu mua + Kho: "BBGH-2609-0001 đã tạo, chờ in/ký"
        │
        ▼
In BBGH (3 liên) → giao cho tài xế/khách ký nhận tại chỗ → 1 liên có chữ ký
   quét/scan lại lưu vào hệ thống (đính kèm file, không bắt buộc OCR)
```

**Đây là điểm khác với luồng YCVT/DNVT** (đề xuất vật tư đi VÀO xưởng): BBGH nằm ở đầu ra — xuất hàng ĐI. Vì vậy không có "trưởng bộ phận duyệt" nhiều bước như YCVT, mà chỉ có 1 điểm duyệt (Giám đốc, có điều kiện) rồi tới xác nhận giao nhận vật lý.

### 1.2 BBGH khác Phiếu xuất kho như thế nào

| | **Phiếu xuất kho** (warehouse_issue_request / inventory_txn) | **Biên bản Giao hàng (BBGH)** |
|---|---|---|
| Bản chất | Chứng từ **nội bộ** — kho tự lập để trừ tồn kho, hạch toán | Biên bản **2 bên** (bên giao — bên nhận) xác nhận thực tế đã giao/nhận |
| Ai ký | Thủ kho + người nhận nội bộ (nếu xuất cho bộ phận SX) | Đại diện công ty (Kho/Giao hàng) **VÀ** đại diện bên nhận (khách hàng/NCC) — có thể là người ngoài công ty |
| Khi nào cần | Mọi lần xuất kho (SX, bán, trả NCC, điều chuyển...) | Chỉ khi hàng ra khỏi công ty tới **bên thứ ba** (khách hàng mua, trả hàng NCC) — không cần cho xuất nội bộ giữa các bộ phận |
| Giá trị pháp lý | Nội bộ, không có giá trị đối chiếu công nợ với bên ngoài | Có thể dùng làm căn cứ đối chiếu công nợ, giải quyết tranh chấp giao thiếu/hỏng |
| Quan hệ dữ liệu | BBGH **tham chiếu tới** phiếu xuất kho (1 BBGH có thể gộp nhiều dòng từ 1 hoặc nhiều phiếu xuất) | Sinh SAU khi phiếu xuất kho đã hoàn tất |

**[SUY ĐOÁN]** Giả định 1 BBGH chỉ gắn với **1** `warehouse_issue_request` (quan hệ 1–1). Nếu thực tế nghiệp vụ cần gộp nhiều phiếu xuất kho khác nhau (nhiều đợt) vào 1 BBGH duy nhất, cần đổi FK `delivery_note.issue_request_id` thành bảng nối N–N — xem câu hỏi Q1.

---

## 2. Danh sách trường đề xuất

Ký hiệu: 🤖 = tự động lấy từ hệ thống (join bảng), ✍️ = người dùng nhập tay, ⚠️ = SUY ĐOÁN cần xác nhận.

### (a) Header công ty + số BBGH + ngày

| Nhãn hiển thị | Field kỹ thuật | Kiểu | Bắt buộc | Nguồn |
|---|---|---|---|---|
| Logo GTAM | `logo` | asset | — | 🤖 file tĩnh `img/logo-gtam.png` (như 3 mẫu cũ) |
| Tên công ty | `companyName` | string | ✓ | 🤖 hardcode giống `poPdf.tsx` `BUYER.name` |
| Số BBGH | `deliveryNoteNo` | string | ✓ | 🤖 `genDocNo()`, format `BBGH-{YYMM}-{seq4}` |
| Ngày lập biên bản | `createdAt` | date | ✓ | 🤖 `now()` lúc Kho bấm "Hoàn tất giao hàng" |
| Địa điểm lập | `placeOfIssue` | string | ⚠️ | ✍️ mặc định địa chỉ xưởng, cho sửa tay — **[SUY ĐOÁN]** có cần trường này không, hay ẩn luôn (Q2) |

### (b) Bên giao (công ty mình)

| Nhãn hiển thị | Field kỹ thuật | Kiểu | Bắt buộc | Nguồn |
|---|---|---|---|---|
| Tên đơn vị giao | `sellerName` | string | ✓ | 🤖 hardcode (giống `BUYER` const trong `poPdf.tsx`) |
| Địa chỉ | `sellerAddress` | string | ✓ | 🤖 hardcode |
| MST | `sellerTaxCode` | string | — | 🤖 hardcode |
| Người đại diện giao hàng | `deliveredByName` | string | ✓ | 🤖 user đang thao tác "Hoàn tất giao hàng" (`user_account.full_name`) |
| Chức vụ người giao | `deliveredByTitle` | string | ⚠️ | ✍️ nhập tay hoặc để trống — **[SUY ĐOÁN]** hệ thống hiện có field "chức danh" trên `user_account` không? Nếu không thì bỏ trường này (Q3) |

### (c) Bên nhận (khách hàng/NCC)

| Nhãn hiển thị | Field kỹ thuật | Kiểu | Bắt buộc | Nguồn |
|---|---|---|---|---|
| Tên khách hàng/đơn vị nhận | `buyerName` | string | ✓ | ⚠️ 🤖 nếu có bảng `customer`/join từ `sales_order`; nếu xuất trả NCC thì join `supplier.name` — **[SUY ĐOÁN]** hệ thống có bảng `customer` riêng không, hay `sales_order` lưu tên khách dạng text tự do? (Q4 — quan trọng nhất, ảnh hưởng trực tiếp FK) |
| Địa chỉ nhận hàng | `buyerAddress` | string | — | 🤖 join hoặc ✍️ nhập tay nếu là địa chỉ giao khác địa chỉ đăng ký |
| Người đại diện nhận hàng | `buyerContactName` | string | ✓ (điền tay lúc ký) | ✍️ để trống trên bản in, ký tay tại chỗ |
| SĐT liên hệ | `buyerPhone` | string | — | 🤖 join `sales_order.contact_phone` hoặc ✍️ |
| Mã số thuế bên nhận | `buyerTaxCode` | string | — | 🤖/✍️ tuỳ có lưu hay không |

### (d) Thông tin tham chiếu

| Nhãn hiển thị | Field kỹ thuật | Kiểu | Bắt buộc | Nguồn |
|---|---|---|---|---|
| Số phiếu xuất kho | `issueRequestNo` | string | ✓ | 🤖 `warehouse_issue_request.request_no` |
| Số đơn hàng (SO) | `salesOrderNo` | string | — | 🤖 `sales_order.order_no` (nếu xuất bán) |
| Số PO liên quan | `poCode` | string | — | 🤖 `purchase_order.po_code` (nếu là trả hàng NCC) |
| Số hợp đồng | `contractNo` | string | ⚠️ | ✍️ nhập tay — **[SUY ĐOÁN]** hệ thống hiện chưa có bảng hợp đồng, để field tự do (Q5) |

### (e) Bảng hàng hoá

| Nhãn hiển thị | Field kỹ thuật | Kiểu | Bắt buộc | Nguồn |
|---|---|---|---|---|
| STT | `lineNo` | int | ✓ | 🤖 index+1 |
| Mã hàng | `sku` | string | ✓ | 🤖 `item.sku` |
| Tên hàng | `itemName` | string | ✓ | 🤖 `item.name` |
| Quy cách | `specification` | string | — | 🤖 `item` metadata/dimensions |
| ĐVT | `uom` | string | ✓ | 🤖 `item.uom` |
| SL theo chứng từ | `docQty` | numeric(18,4) | ✓ | 🤖 `warehouse_issue_request` picks / line qty |
| SL thực giao | `actualQty` | numeric(18,4) | ✓ | 🤖 mặc định = `docQty`, cho sửa tay nếu giao thiếu — ✍️ override |
| Tình trạng | `condition` | enum | ✓ | ✍️ chọn: Đủ/Thiếu/Hư hỏng (mặc định "Đủ") |
| Ghi chú dòng | `lineNotes` | string | — | ✍️ |

**[SUY ĐOÁN]** Không đưa "Đơn giá/Thành tiền" vào bảng hàng hoá BBGH — vì BBGH là biên bản giao NHẬN VẬT LÝ, không phải chứng từ tài chính (đơn giá đã có trên PO/hoá đơn). Nếu user cần cột tiền để đối chiếu nhanh, thêm được dễ dàng nhờ thiết kế cột khai báo mảng (mục 4.2) — xem Q6.

### (f) Phương tiện vận chuyển

| Nhãn hiển thị | Field kỹ thuật | Kiểu | Bắt buộc | Nguồn |
|---|---|---|---|---|
| Phương tiện | `vehicleType` | string | — | ✍️ (VD "Xe tải", "Xe máy") |
| Biển số xe | `vehiclePlate` | string | — | ✍️ |
| Người vận chuyển | `carrierName` | string | — | ✍️ (tài xế hoặc đơn vị vận chuyển thuê ngoài) |
| SĐT người vận chuyển | `carrierPhone` | string | — | ✍️ |

### (g) Kết luận giao nhận

| Nhãn hiển thị | Field kỹ thuật | Kiểu | Bắt buộc | Nguồn |
|---|---|---|---|---|
| Kết quả giao nhận | `deliveryResult` | enum | ✓ | ✍️ chọn: "Đã giao đủ, đúng quy cách" / "Giao thiếu" / "Có hư hỏng" — tính tự động 🤖 nếu mọi dòng `condition = Đủ` thì default "Đã giao đủ...", override được |
| Ghi chú kết luận | `conclusionNotes` | text | — | ✍️ |

### (h) Khối chữ ký

| Ô ký | Field kỹ thuật | Bắt buộc | Nguồn |
|---|---|---|---|
| Đại diện bên giao (Kho) | `signatures[0]` name=`deliveredByName`, role="Người giao hàng" | ✓ | 🤖 tên người thao tác, ✍️ ký tay khi in |
| Thủ kho | `signatures[1]` role="Thủ kho" | ⚠️ | ✍️ — **[SUY ĐOÁN]** có tách riêng "người giao hàng" và "thủ kho" hay là 1 người? (Q7) |
| Đại diện bên nhận | `signatures[2]` role="Bên nhận hàng" | ✓ | ✍️ để trống, ký tay tại chỗ |
| Kế toán/Xác nhận nội bộ | `signatures[3]` role="Kế toán" | — | ✍️ tuỳ chọn (dùng nếu liên 3 giữ lại cho kế toán cần xác nhận đối chiếu công nợ) |

---

## 3. Bố cục in

### 3.1 A4 dọc hay ngang?

**Đề xuất: A4 DỌC (portrait)**, khác với YCVT/DNVT/PO đang dùng ngang. Lý do:
- Bảng hàng hoá BBGH chỉ có **9 cột** (so với 14–15 cột của YCVT/DNVT) → đủ chỗ ở khổ dọc.
- BBGH thường đi kèm nhiều chữ ký + phần "kết luận giao nhận" dạng văn bản dài → dọc hiển thị tự nhiên hơn, giống các mẫu biên bản giao nhận phổ biến ở VN (biên bản bàn giao tài sản, biên bản nghiệm thu...).
- Dễ gấp/lưu hồ sơ theo file A4 dọc tiêu chuẩn văn phòng VN.

**[SUY ĐOÁN]** Nếu bảng hàng hoá thường có > 15 dòng/nhiều SKU dài tên, cân nhắc đổi sang landscape để bảng thoáng hơn — xem Q8.

### 3.2 Số liên in

**Đề xuất 3 liên**, in cùng 1 file PDF (không tạo 3 trang riêng — chỉ ghi rõ trên mỗi liên bằng badge góc trên):
1. **Liên 1 — Bên giao lưu** (Kho giữ, để đối chiếu tồn kho)
2. **Liên 2 — Bên nhận lưu** (khách hàng/NCC giữ)
3. **Liên 3 — Kế toán lưu** (dùng đối chiếu công nợ/doanh thu)

Cách thể hiện: mỗi liên là **1 trang PDF riêng** (không phải cùng 1 trang photocopy 3 bản — nội dung giống hệt nhau, chỉ khác nhãn "LIÊN 1/2/3" ở góc phải header) → dùng `<Page>` lặp 3 lần trong cùng `<Document>`, tái dùng 1 component `DeliveryNotePage` với prop `copyLabel`.

**[SUY ĐOÁN]** Có thể user chỉ cần in 2 liên (giao/nhận) và bỏ liên kế toán vì đã có báo cáo điện tử — xem Q1 kết hợp với câu hỏi số liên.

### 3.3 Sơ đồ bố cục ASCII (1 liên, A4 dọc)

```
┌──────────────────────────────────────────────────────────┐
│ [LOGO]   CÔNG TY CP SX TỰ ĐỘNG HÓA CN TOÀN CẦU (GTAM)     │  <- header, giống pattern cũ
│          Địa chỉ · MST                     LIÊN 1: BÊN GIAO│
│ ──────────────────────────────────────────────────────── │
│              BIÊN BẢN GIAO HÀNG                            │  <- titleBar, font 14-16
│           Số: BBGH-2609-0001   Ngày: 22/09/2026            │
│ ──────────────────────────────────────────────────────── │
│ I. THÔNG TIN THAM CHIẾU                                    │  <- sectionTitle (nền xanh #005D9F)
│  Số phiếu xuất kho: ISS-xxxx   Số đơn hàng: SO-2609-0012   │
│  Số PO liên quan: —            Số hợp đồng: —              │
│ ──────────────────────────────────────────────────────── │
│ II. BÊN GIAO                 │ III. BÊN NHẬN                │  <- 2 cột song song (giống poPdf partiesRow)
│  Tên: GTAM                   │  Tên: Công ty ABC             │
│  Địa chỉ: ...                │  Địa chỉ: ...                 │
│  Người giao: Nguyễn Văn A     │  Người nhận: ____ (ký tay)   │
│                               │  SĐT: ...                     │
│ ──────────────────────────────────────────────────────── │
│ IV. DANH MỤC HÀNG HOÁ                                       │  <- sectionTitle
│ ┌────┬────────┬──────────┬──────┬─────┬──────┬──────┬────┬─────┐
│ │STT │Mã hàng │Tên hàng  │Quy   │ĐVT  │SL CT │SL TG │Tình│Ghi  │
│ │    │        │          │cách  │     │      │      │trạng│chú │
│ ├────┼────────┼──────────┼──────┼─────┼──────┼──────┼────┼─────┤
│ │ 1  │SKU001  │Ống thép..│Ø60mm │Cây  │ 20   │ 20   │Đủ  │—    │
│ │ 2  │SKU002  │Bulong M8 │      │Bộ   │ 500  │ 480  │Thiếu│20 lỗi│
│ └────┴────────┴──────────┴──────┴─────┴──────┴──────┴────┴─────┘
│ ──────────────────────────────────────────────────────── │
│ V. PHƯƠNG TIỆN VẬN CHUYỂN                                   │
│  Loại xe: Xe tải     Biển số: 29C-123.45   Lái xe: ...     │
│ ──────────────────────────────────────────────────────── │
│ VI. KẾT LUẬN GIAO NHẬN                                      │
│  ☑ Đã giao đủ, đúng quy cách   ☐ Giao thiếu   ☐ Có hư hỏng │
│  Ghi chú: ________________________________________________ │
│ ──────────────────────────────────────────────────────── │
│  ĐẠI DIỆN BÊN GIAO    THỦ KHO       ĐẠI DIỆN BÊN NHẬN      │  <- signRow (giống poPdf)
│  (Ký, ghi rõ họ tên)  (Ký, ghi tên) (Ký, ghi rõ họ tên)    │
│                                                              │
│  [khoảng trống ký]    [khoảng trống] [khoảng trống ký]      │
│  Nguyễn Văn A         ...            ...                    │
└──────────────────────────────────────────────────────────┘
```

### 3.4 Cỡ chữ đề xuất

Theo pattern cũ (Roboto, đơn vị pt của react-pdf):
- Page base: `fontSize: 9` (giống `poPdf.tsx`, đọc dễ hơn 8.5 của bản landscape nhiều cột)
- Title "BIÊN BẢN GIAO HÀNG": `fontSize: 16, fontWeight: 700`
- Section title (I/II/III...): `fontSize: 9, fontWeight: 700` nền xanh `#005D9F` chữ trắng (bám đúng `COLOR_PRIMARY` đã dùng)
- Bảng hàng hoá: header `fontSize: 8`, dòng dữ liệu `fontSize: 8.5`
- Khối chữ ký: `fontSize: 9`, hint "(Ký, ghi rõ họ tên)" `fontSize: 8, color: #555`

---

## 4. Thiết kế "DỄ SỬA" (phần quan trọng nhất)

Mục tiêu: user không rành code vẫn tự đổi được nhãn, thêm/bớt cột, thêm/bớt ô ký — **chỉ sửa 1 nơi**, không phải dò trong JSX lồng nhau.

File dự kiến: `apps/web/src/server/services/bbghPdf.tsx` (đặt cạnh `ycvtPdf.tsx`, `dnvtPdf.tsx`, `poPdf.tsx`).

### 4.1 Nhãn tiếng Việt tách hết ra 1 object hằng ở đầu file

Thay vì viết `<Text>Kính gửi:</Text>` rải rác trong JSX (như 3 file cũ đang làm — đây là điểm YẾU của pattern cũ, không nên lặp lại), BBGH sẽ tập trung toàn bộ chuỗi hiển thị vào 1 object `LABELS`:

```tsx
// =====================================================================
// LABELS — MUỐN ĐỔI CHỮ HIỂN THỊ TRÊN BBGH? SỬA Ở ĐÂY. Không cần đụng
// tới phần JSX bên dưới. Đổi giá trị (string) bên phải dấu ':', giữ
// nguyên key (chữ bên trái) vì key được JSX gọi tới bằng tên.
// =====================================================================
const LABELS = {
  docTitle: "BIÊN BẢN GIAO HÀNG",
  copyLabel: (n: number) =>
    n === 1 ? "LIÊN 1: BÊN GIAO LƯU"
    : n === 2 ? "LIÊN 2: BÊN NHẬN LƯU"
    : "LIÊN 3: KẾ TOÁN LƯU",

  sectionRef: "I. THÔNG TIN THAM CHIẾU",
  refIssueNo: "Số phiếu xuất kho",
  refSalesOrderNo: "Số đơn hàng",
  refPoCode: "Số PO liên quan",
  refContractNo: "Số hợp đồng",

  sectionSeller: "II. BÊN GIAO",
  sectionBuyer: "III. BÊN NHẬN",
  fieldName: "Tên đơn vị",
  fieldAddress: "Địa chỉ",
  fieldTaxCode: "Mã số thuế",
  fieldContact: "Người đại diện",
  fieldPhone: "Điện thoại",

  sectionGoods: "IV. DANH MỤC HÀNG HOÁ",
  sectionVehicle: "V. PHƯƠNG TIỆN VẬN CHUYỂN",
  fieldVehicleType: "Loại xe",
  fieldVehiclePlate: "Biển số",
  fieldCarrierName: "Người vận chuyển",

  sectionConclusion: "VI. KẾT LUẬN GIAO NHẬN",
  conclusionFull: "Đã giao đủ, đúng quy cách",
  conclusionShort: "Giao thiếu",
  conclusionDamaged: "Có hư hỏng",
  conclusionNotesLabel: "Ghi chú",

  signHint: "(Ký, ghi rõ họ tên)",
  footerNote: "Mẫu BBGH — GTAM MES V4",
} as const;
```

Mọi chỗ trong JSX gọi `LABELS.sectionRef` thay vì gõ thẳng chuỗi `"I. THÔNG TIN THAM CHIẾU"`. Muốn đổi tiêu đề mục I → chỉ sửa 1 dòng trong `LABELS`.

### 4.2 Cấu hình cột bảng hàng hoá tách thành 1 mảng khai báo

Đây là điểm cải tiến lớn nhất so với `ycvtPdf.tsx`/`dnvtPdf.tsx` (2 file đó hardcode từng `<Text>` cho mỗi cột — muốn thêm/bớt cột phải sửa 3 chỗ: style width, header `<Text>`, và data-row `<Text>`, dễ lệch nhau). BBGH sẽ dùng **1 mảng cấu hình duy nhất**, style + header + cách lấy dữ liệu đi cùng nhau:

```tsx
// =====================================================================
// GOODS_COLUMNS — MUỐN THÊM/BỚT/ĐỔI THỨ TỰ CỘT BẢNG HÀNG HOÁ? SỬA MẢNG
// NÀY. Thêm 1 object vào mảng = thêm 1 cột (tự động render ở cả header
// và data row). Xoá 1 object = bớt 1 cột. Đổi thứ tự trong mảng = đổi
// thứ tự cột trên bản in.
//   key    : định danh nội bộ (không hiển thị)
//   label  : chữ hiển thị ở dòng header bảng
//   width  : độ rộng cột (pt) — tổng các width nên ≈ khổ A4 dọc dùng được
//            (595 - 2*24 lề trái phải ≈ 547pt)
//   align  : "left" | "center" | "right"
//   render : hàm lấy giá trị hiển thị từ 1 dòng hàng hoá (item)
// =====================================================================
interface GoodsColumn {
  key: string;
  label: string;
  width: number;
  align?: "left" | "center" | "right";
  render: (line: DeliveryNoteLine, idx: number) => string;
}

const GOODS_COLUMNS: GoodsColumn[] = [
  { key: "stt", label: "STT", width: 26, align: "center",
    render: (_l, idx) => String(idx + 1) },
  { key: "sku", label: "Mã hàng", width: 70,
    render: (l) => l.sku ?? "—" },
  { key: "name", label: "Tên hàng", width: 140,
    render: (l) => l.itemName ?? "—" },
  { key: "spec", label: "Quy cách", width: 70,
    render: (l) => l.specification ?? "—" },
  { key: "uom", label: "ĐVT", width: 34, align: "center",
    render: (l) => l.uom ?? "—" },
  { key: "docQty", label: "SL chứng từ", width: 55, align: "right",
    render: (l) => fmtNum(l.docQty) },
  { key: "actualQty", label: "SL thực giao", width: 55, align: "right",
    render: (l) => fmtNum(l.actualQty) },
  { key: "condition", label: "Tình trạng", width: 50, align: "center",
    render: (l) => CONDITION_VI[l.condition] ?? "—" },
  { key: "notes", label: "Ghi chú", width: 60,
    render: (l) => l.lineNotes ?? "—" },
];
```

JSX chỉ cần `.map()` qua `GOODS_COLUMNS` 2 lần (1 lần cho header, 1 lần trong mỗi data row) — không viết tay từng `<Text>`:

```tsx
{/* Header */}
<View style={styles.tHead}>
  {GOODS_COLUMNS.map((col) => (
    <Text key={col.key} style={[styles.tCell, { width: col.width, textAlign: col.align ?? "left" }]}>
      {col.label}
    </Text>
  ))}
</View>

{/* Data rows */}
{lines.map((line, idx) => (
  <View key={idx} style={styles.tRow}>
    {GOODS_COLUMNS.map((col) => (
      <Text key={col.key} style={[styles.tCell, { width: col.width, textAlign: col.align ?? "left" }]}>
        {col.render(line, idx)}
      </Text>
    ))}
  </View>
))}
```

Ví dụ: muốn thêm cột "Đơn giá" (xem Q6) → chỉ thêm 1 object vào `GOODS_COLUMNS`, không sửa gì trong JSX.

### 4.3 Danh sách ô chữ ký tách thành 1 mảng

```tsx
// =====================================================================
// SIGNATURE_BOXES — MUỐN THÊM/BỚT Ô CHỮ KÝ? SỬA MẢNG NÀY.
//   role     : chức danh hiển thị trên ô ký
//   getName  : hàm lấy tên (nếu có sẵn, VD người giao hàng đã biết trước);
//              trả về "" nếu để trống cho ký tay
// =====================================================================
interface SignatureBox {
  role: string;
  getName: (input: DeliveryNotePdfInput) => string;
}

const SIGNATURE_BOXES: SignatureBox[] = [
  { role: "Đại diện bên giao", getName: (i) => i.deliveredByName ?? "" },
  { role: "Thủ kho", getName: () => "" },
  { role: "Đại diện bên nhận", getName: () => "" },
  // Bỏ comment dòng dưới nếu cần thêm ô Kế toán (xem Q1/liên số 3):
  // { role: "Kế toán", getName: () => "" },
];
```

```tsx
<View style={styles.signRow}>
  {SIGNATURE_BOXES.map((box) => (
    <View key={box.role} style={styles.signBox}>
      <Text style={styles.signTitle}>{box.role}</Text>
      <Text style={styles.signHint}>{LABELS.signHint}</Text>
      <View style={styles.signSpace} />
      <Text style={styles.signName}>{box.getName(input)}</Text>
    </View>
  ))}
</View>
```

### 4.4 Ghi chú đầu file bắt buộc phải có

```tsx
/**
 * BBGH — Biên bản Giao hàng PDF generator (@react-pdf/renderer).
 * Bám phong cách ycvtPdf.tsx / dnvtPdf.tsx / poPdf.tsx: font Roboto vendored,
 * khung viền đen kiểu phiếu giấy VN, logo GTAM.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ MUỐN SỬA NHANH?                                                   │
 * │  - Đổi chữ hiển thị (tiêu đề, nhãn field)  → sửa object LABELS    │
 * │  - Thêm/bớt/đổi thứ tự CỘT bảng hàng hoá   → sửa mảng GOODS_COLUMNS│
 * │  - Thêm/bớt Ô CHỮ KÝ                       → sửa mảng SIGNATURE_BOXES│
 * │  - Đổi màu/khung/cỡ chữ                    → sửa object `styles`  │
 * │  - Đổi thông tin công ty (bên giao)        → sửa object SELLER    │
 * │  - Đổi số liên in (2 hay 3 liên)           → sửa COPY_LABELS      │
 * └─────────────────────────────────────────────────────────────────┘
 */
```

---

## 5. Schema DB đề xuất

Theo đúng convention hiện có trong `packages/db/migrations/` (uuid PK `gen_random_uuid()`, schema `app.`, FK trỏ `app.user_account(id)`, numeric cho số lượng, migration `IF NOT EXISTS` idempotent — xem `0036_warehouse_issue_request.sql` và `0005d_procurement.sql` làm mẫu).

### 5.1 Bảng `delivery_note` (header)

```sql
-- Migration 00XX_delivery_note.sql
-- BBGH — Biên bản Giao hàng. Sinh tự động khi warehouse_issue_request
-- chuyển COMPLETED (chỉ khi reason liên quan xuất bán/giao khách).

DO $$ BEGIN
  CREATE TYPE app.delivery_note_result AS ENUM ('FULL', 'SHORT', 'DAMAGED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS app.delivery_note (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_no      VARCHAR(32)  NOT NULL,          -- BBGH-{YYMM}-{seq4}
  issue_request_id      UUID         NOT NULL REFERENCES app.warehouse_issue_request(id),
  sales_order_id        UUID         REFERENCES app.sales_order(id),      -- nullable: có thể là trả NCC
  po_id                 UUID         REFERENCES app.purchase_order(id),   -- nullable: trường hợp trả hàng NCC
  supplier_id           UUID         REFERENCES app.supplier(id),        -- nullable: dùng khi buyer = NCC (trả hàng)

  -- Bên nhận — ⚠️ SUY ĐOÁN: lưu dạng snapshot text (không FK cứng tới bảng
  -- customer vì hệ thống hiện chưa rõ có bảng customer riêng hay không — xem Q4).
  -- Nếu có bảng customer, đổi buyer_name/buyer_address thành buyer_customer_id FK.
  buyer_name            VARCHAR(256) NOT NULL,
  buyer_address         TEXT,
  buyer_tax_code        VARCHAR(32),
  buyer_contact_name    VARCHAR(128),
  buyer_phone           VARCHAR(32),

  contract_no           VARCHAR(64),                    -- ⚠️ text tự do, xem Q5

  -- Vận chuyển
  vehicle_type          VARCHAR(64),
  vehicle_plate         VARCHAR(32),
  carrier_name          VARCHAR(128),
  carrier_phone         VARCHAR(32),

  -- Kết luận
  delivery_result       app.delivery_note_result NOT NULL DEFAULT 'FULL',
  conclusion_notes      TEXT,

  -- Người lập / ký
  delivered_by          UUID NOT NULL REFERENCES app.user_account(id),
  place_of_issue        VARCHAR(256),

  -- File scan chữ ký (nếu về sau upload bản đã ký tay) — optional V1
  signed_file_url       TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_note_no_uk
  ON app.delivery_note (delivery_note_no);
CREATE INDEX IF NOT EXISTS delivery_note_issue_request_idx
  ON app.delivery_note (issue_request_id);
CREATE INDEX IF NOT EXISTS delivery_note_sales_order_idx
  ON app.delivery_note (sales_order_id) WHERE sales_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS delivery_note_created_idx
  ON app.delivery_note (created_at DESC);

COMMENT ON TABLE app.delivery_note IS
  'BBGH — Biên bản Giao hàng, sinh tự động khi warehouse_issue_request hoàn tất (xuất bán/giao khách).';
```

### 5.2 Bảng `delivery_note_line`

```sql
CREATE TABLE IF NOT EXISTS app.delivery_note_line (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id    UUID NOT NULL REFERENCES app.delivery_note(id) ON DELETE CASCADE,
  line_no             INTEGER NOT NULL,
  item_id             UUID NOT NULL REFERENCES app.item(id),
  specification       VARCHAR(256),
  uom                 VARCHAR(32),
  doc_qty             NUMERIC(18,4) NOT NULL CHECK (doc_qty >= 0),
  actual_qty          NUMERIC(18,4) NOT NULL CHECK (actual_qty >= 0),
  condition           VARCHAR(16) NOT NULL DEFAULT 'FULL'
                        CHECK (condition IN ('FULL','SHORT','DAMAGED')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT delivery_note_line_uk UNIQUE (delivery_note_id, line_no)
);

CREATE INDEX IF NOT EXISTS delivery_note_line_item_idx
  ON app.delivery_note_line (item_id);
```

**Ghi chú thiết kế:**
- Không có cột tiền tệ trong `delivery_note_line` theo mặc định (xem mục 2e) — nếu Q6 xác nhận cần, thêm `unit_price NUMERIC(18,2)` và `line_total NUMERIC(18,2)` giống pattern `poPdf.tsx`.
- `item_id` bắt buộc NOT NULL — giả định mọi dòng BBGH đều truy được về `item` (không có dòng free-text). Nếu Kho cần thêm dòng tự do (không có trong danh mục item), cần thêm cột `free_text_name VARCHAR(256)` nullable và nới `item_id` thành nullable — tương tự cách `purchase_request_line` đang xử lý free-text (xem file `0047_pr_line_freetext.sql`, chưa đọc chi tiết nhưng tên file gợi ý đã có tiền lệ trong hệ thống).

### 5.3 Sinh số BBGH bằng `genDocNo()`

Dùng lại tiện ích có sẵn ở `apps/web/src/server/repos/_docNumber.ts` (đã đọc — dùng `pg_advisory_xact_lock` để tránh trùng số khi 2 giao dịch chạy song song):

```ts
import { genDocNo, currentYymm } from "@/server/repos/_docNumber";

// Trong transaction tạo delivery_note:
const deliveryNoteNo = await genDocNo(tx, {
  table: "app.delivery_note",
  column: "delivery_note_no",
  prefix: `BBGH-${currentYymm()}`,   // VD "BBGH-2609"
  seqPart: 3,                        // "BBGH-2609-0001" → part 3 = "0001"
  pad: 4,
});
```

Kết quả: `BBGH-2609-0001`, `BBGH-2609-0002`, ... reset lại từ 0001 mỗi tháng mới (giống `WO-{yymm}-{seq}` đang dùng).

---

## 6. Câu hỏi cho user (tối đa 8 câu — trả lời nhanh dạng checklist)

- [ ] **Q1 — Quan hệ BBGH ↔ phiếu xuất kho:** 1 BBGH chỉ gắn với ĐÚNG 1 phiếu xuất kho (`warehouse_issue_request`), hay cần gộp nhiều phiếu xuất (nhiều đợt giao) vào 1 BBGH? (Mặc định thiết kế: 1–1)
- [ ] **Q2 — Trường "Địa điểm lập biên bản":** Có cần hiển thị trên form không, hay bỏ vì mặc định luôn là tại xưởng? (Mặc định: bỏ, không hiển thị)
- [ ] **Q3 — Chức danh người giao hàng:** Có cần trường "chức vụ" cho người đại diện bên giao không, hay chỉ cần tên (lấy từ tài khoản đăng nhập)? (Mặc định: chỉ cần tên)
- [ ] **Q4 — Bảng khách hàng:** Hệ thống hiện có bảng `customer` riêng (mã KH, tên, địa chỉ cố định) hay tên khách hàng chỉ là text tự do lưu trong `sales_order`? → Quyết định BBGH join FK hay lưu snapshot text. (Mặc định thiết kế: lưu snapshot text trong `delivery_note`, không FK cứng)
- [ ] **Q5 — Số hợp đồng:** Hệ thống có bảng hợp đồng (contract) không, hay chỉ cần 1 ô text tự do để nhập tay số hợp đồng liên quan? (Mặc định: text tự do)
- [ ] **Q6 — Cột tiền trên bảng hàng hoá:** BBGH có cần hiển thị Đơn giá/Thành tiền không, hay để thuần số lượng (giống bản thiết kế mặc định, vì tiền đã có trên PO/hoá đơn riêng)? (Mặc định: KHÔNG có cột tiền)
- [ ] **Q7 — Người giao hàng và Thủ kho:** Có phải luôn là 1 người (thao tác "Hoàn tất giao hàng" trên hệ thống) hay có 2 vai trò khác nhau cần 2 chữ ký riêng? (Mặc định: 2 ô ký riêng nhưng có thể cùng 1 tên)
- [ ] **Q8 — Khổ giấy in:** Đồng ý A4 DỌC + bảng 9 cột như thiết kế, hay muốn giữ A4 NGANG giống YCVT/DNVT/PO cho đồng bộ về sau (kể cả khi cột ít hơn)? (Mặc định: A4 dọc)

---

## 7. File liên quan (tham khảo khi triển khai — KHÔNG code trong bước này)

- `apps/web/src/server/services/ycvtPdf.tsx` — pattern section I/II/III/IV/V, font Roboto, khung viền.
- `apps/web/src/server/services/dnvtPdf.tsx` — pattern bảng 14 cột, 5 dòng ký.
- `apps/web/src/server/services/poPdf.tsx` — pattern A4 dọc, 2 khối bên giao/bên nhận song song, khối ký 3 ô (`signRow`/`signBox`/`signSpace`) — **BBGH nên bám layout dọc của file này nhất**.
- `apps/web/src/server/repos/_docNumber.ts` — `genDocNo()` + `currentYymm()`, dùng để sinh `delivery_note_no`.
- `packages/db/migrations/0036_warehouse_issue_request.sql` — mẫu bảng nguồn BBGH tham chiếu tới (status `COMPLETED` là điểm kích hoạt sinh BBGH).
- `packages/db/migrations/0005d_procurement.sql` — mẫu style migration (sequence + function gen code, giống cách `genDocNo` áp dụng).
- `packages/db/migrations/0047_pr_line_freetext.sql` — tiền lệ xử lý dòng free-text trong bảng line (tham khảo nếu Q trên xác nhận cần free-text item cho BBGH).
