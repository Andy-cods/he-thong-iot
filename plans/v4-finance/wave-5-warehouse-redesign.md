# Wave 5 — Redesign phân hệ Kho (Nhập/Xuất gộp + Sơ đồ kho có thao tác)

*Ngày viết:* 2026-09-22 · *Tác giả:* Planner (Claude) · *Phạm vi:* CHỈ Kho (`/warehouse`, `/receiving/*`). KHÔNG đụng Lắp ráp/Assembly (chỉ liệt kê điểm giao nhau).

**Trạng thái:** DRAFT — chờ user chốt 6 câu hỏi ở mục 0 trước khi `/cook`.

---

## 0. Quyết định cần user chốt (đọc trước khi implement)

1. **Bỏ hẳn máy quét HID (USB, giả lập bàn phím) hay giữ?** Khuyến nghị: **GIỮ** — HID không phải "camera scan cũ" mà user muốn bỏ, nó là thiết bị vật lý xưởng đang dùng hàng ngày. Bỏ USB HID sẽ làm chậm thao tác đội kho vì phải gõ tay/chọn item bằng chuột. Xem phân tích Phase D.
2. **Hợp nhất 3 lối vào PO (wizard / form đơn giản / PWA) còn 1 route desktop — giữ Wizard hay Form đơn giản?** Khuyến nghị: **giữ Wizard** (`/receiving/[poId]/wizard`), xoá Form đơn giản (`/receiving/[poId]/page.tsx`) — wizard đã có breadcrumb đầy đủ, 3 bước rõ ràng (check→capture→qc), PWA tablet (`/pwa/receive/[poId]`) giữ nguyên vì khác thiết bị/offline.
3. **Chi tiết PO: trang riêng (route `/receiving/[poId]/...`) hay drawer/dialog ngay trong tab Nhập/Xuất?** Khuyến nghị: **giữ trang riêng** (không đổi thành drawer) — vì wizard 3 bước + bảng nhiều cột (11 cột ở step capture) không hợp drawer hẹp; thay vào đó fix breadcrumb để hết lạc, không cần đổi kiến trúc điều hướng (giảm rủi ro, đúng KISS).
4. **Card "Thông tin kệ" hard-code kích thước/tải trọng — bỏ hiển thị hay thêm cột DB mới?** Khuyến nghị V1: **bỏ hiển thị** (không thêm migration DB trong wave này — YAGNI, chưa ai nhập dữ liệu kích thước kệ thật). Nêu ở Phase E như optional-later.
5. **`ScanQueueBadge` + hàng đợi Dexie offline — giữ hay bỏ?** Khuyến nghị: **giữ nguyên** trong V1 vì nó phục vụ PWA tablet (`ReceivingConsole`) vốn phải hoạt động offline; chỉ bỏ phần **camera trigger** (`BarcodeScanner`) trong Console, hàng đợi Dexie vẫn cần cho HID/nhập tay lỗi mạng.
6. **`WarehouseLayout3D` 1379 dòng — viết lại hay chỉ đổi default view?** Khuyến nghị V1: **KHÔNG viết lại 3D**, chỉ đổi default sang `Bin2DPro` (đã có sẵn, compact, không tràn ngang) và để 3D là toggle tuỳ chọn — tiết kiệm effort, đúng YAGNI.

Nếu user không phản hồi trong vòng review đầu tiên, plan này triển khai theo các khuyến nghị trên.

---

## 1. Bối cảnh & hiện trạng (đã verify số dòng thực tế 2026-09-22)

| File | Dòng thực tế | Vai trò |
|---|---|---|
| `apps/web/src/app/(app)/warehouse/page.tsx` | 93 | Server wrapper, `resolveTab()` dòng 37-46, breadcrumb dòng 55-66 |
| `apps/web/src/components/warehouse/WarehouseTabsNav.tsx` | 83 | `WAREHOUSE_TABS` khai báo dòng 12-38 (5 tab) |
| `apps/web/src/components/warehouse/ReceivingTab.tsx` | 535 | Grid POCard, KPI 4 card (351-356), filter (359-395), card grid (414-427) |
| `apps/web/src/app/(app)/receiving/page.tsx` | 9 | Redirect → `/warehouse?tab=receiving` |
| `apps/web/src/app/(app)/receiving/[poId]/page.tsx` | 507 | "Form đơn giản" — **breadcrumb chỉ có link text-xs dòng 239-245, KHÔNG có breadcrumb chuẩn** |
| `apps/web/src/app/(app)/receiving/[poId]/wizard/page.tsx` | 1050 | Wizard 3 bước, breadcrumb đầy đủ dòng 353-363 |
| `apps/web/src/components/receiving/ReceivingConsole.tsx` | 657 | PWA tablet, `BarcodeScanner` camera dòng 19+403, sidebar tĩnh 380px dòng 480-494 |
| `apps/web/src/components/warehouse/IssueTab.tsx` | 838 | Header gradient rose/pink dòng 172-205 (lệch hệ màu), `PendingRequestsPanel` dòng 623-838 |
| `apps/web/src/components/warehouse/WarehouseLayoutTab.tsx` | 863 | Rack tabs, sidebar 300px, card "Thông tin kệ" hard-code dòng 302-305, drawer 400px cố định dòng 594-701 |
| `apps/web/src/components/warehouse/WarehouseLayout3D.tsx` | 1378 | SVG isometric, `BIN_W=230,GAP_X=36` tràn ngang; `Bin2DPro` compact dòng 1284 |
| `apps/web/src/components/warehouse/BinActions.tsx` | 698 | `BinActionsBar` đã có 3 nút Thêm/Rút/Chuyển (dòng 69-93) — nền cho Phase E |
| `apps/web/src/components/ui/BarcodeScanInput.tsx` | 163 | HID/nhập tay, KHÔNG camera. Dùng ở `receiving/[poId]/page.tsx:19,319-325` + `PoQuickReceiveTable.tsx:9,278` |
| `apps/web/src/components/scan/BarcodeScanInput.tsx` | 185 | TRÙNG TÊN, cũng chỉ HID/nhập tay (dùng `useBarcodeScan` hook). **Chỉ dùng ở `app/(app)/assembly/[woId]/page.tsx:37`** — KHÔNG dùng ở Kho |
| `apps/web/src/components/scan/BarcodeScanner.tsx` | 384 | Camera thật (`html5-qrcode` lazy). Dùng ở `ReceivingConsole.tsx:19,403` (Kho), `AssemblyConsole.tsx:26,464` (Assembly), `BomBarcodeSearchDialog.tsx` |
| `apps/web/src/components/scan/ScanQueueBadge.tsx` | 256 | Badge hàng đợi Dexie offline, dùng ở `ReceivingConsole.tsx:346` |

**Xác nhận thêm qua đọc code (không chỉ tin brief):**
- `packages/db/src/schema/master.ts` dòng 214-244: bảng `location_bin` có `capacity`, `lowThreshold`, `coordX/Y/Z` nhưng **KHÔNG có cột kích thước vật lý (width/height/depth mm) hay tải trọng/tầng** → xác nhận card "Thông tin kệ" ở `WarehouseLayoutTab.tsx:302-305` hard-code 100% (`"6000 × 1200 × 2000 mm"`, `"1500 kg / tầng"`), không lấy từ DB thật vì DB không có field này.
- `scan/BarcodeScanInput.tsx` **không** được import ở bất kỳ file nào trong phạm vi Kho — chỉ dùng trong Assembly. Việc dọn file trùng tên chỉ cần xoá 1 trong 2 và sửa import ở `assembly/[woId]/page.tsx` sang dùng `ui/BarcodeScanInput` (hợp nhất), KHÔNG phải sửa code Assembly nghiệp vụ — chỉ đổi import path, coi như dọn dẹp kỹ thuật chung, cần báo trước cho phần Assembly biết.
- `useBreadcrumb()` + `<Breadcrumb>` (`apps/web/src/components/ui/breadcrumb.tsx`) đã có sẵn, dùng chuẩn ở `POTab.tsx:151-157`. Nên tái dùng thay vì tự viết breadcrumb tay như `warehouse/page.tsx` đang làm.
- `EmptyState` component (`apps/web/src/components/ui/empty-state.tsx`) có `preset` (vd `"no-filter-match"`, `"no-bom"`) — dùng chuẩn ở `POTab.tsx:291-309`.
- `BinActionsBar` (`BinActions.tsx:48-93`) đã có đủ 3 hành động Thêm/Rút/Chuyển hàng theo bin — đúng là "mầm mống" cho yêu cầu #5 của user, chỉ cần lộ nó ra ngoài UI tốt hơn (không phải build mới).

---

## 2. Kiến trúc mới — tổng quan

### 2.1 Cấu trúc tab (5 → 4)

```
WAREHOUSE_TABS = [
  { key: "layout",   label: "Sơ đồ kho" },   // Phase E: thêm thao tác nhập/xuất tại bin
  { key: "items",    label: "Vật tư" },
  { key: "movement", label: "Nhập / Xuất kho" }, // MỚI — gộp receiving + issue
  { key: "report",   label: "Báo cáo kho" },
]
```

### 2.2 URL scheme

- `/warehouse?tab=movement&mode=in` — chế độ Nhập (mặc định)
- `/warehouse?tab=movement&mode=out` — chế độ Xuất
- Backward-compat trong `resolveTab()` (`warehouse/page.tsx`):
  - `tab=receiving` → `tab=movement&mode=in`
  - `tab=picking` → `tab=movement&mode=out` (đã có map cũ `picking→issue`, nối tiếp thành `movement&mode=out`)
  - `tab=issue` → `tab=movement&mode=out`
  - Giữ nguyên các map cũ khác (`overview→layout`, `lot-serial→items`)
- `mode` đọc qua `searchParams.mode`, validate enum `"in" | "out"`, default `"in"` nếu thiếu/sai.
- Link nội bộ trỏ tới trang cũ (`/receiving`, `IssueTab` cũ) cũng phải redirect kèm `mode` tương ứng.

---

## 3. Phase A — Gộp Nhận hàng + Xuất hàng thành tab "Nhập / Xuất kho"

### 3.1 Thiết kế màn hình gộp

**Nguyên tắc chung dùng — riêng theo mode:**

| Phần | Dùng chung | Khác nhau theo mode |
|---|---|---|
| Header + breadcrumb | Chung khung `PageHeader` | Tiêu đề phụ đổi: "Nhận hàng từ NCC" / "Xuất hàng cho SX/bán hàng" |
| Segmented control Nhập⇄Xuất | Chung — luôn hiển thị đầu trang | — |
| KPI row (4 card) | Chung layout, đổi nội dung theo mode | Nhập: Chờ xử lý/Đang nhận/Quá hạn ETA/Giao hôm nay. Xuất: Chờ duyệt/Đã xuất hôm nay/Thiếu tồn/Tổng SKU |
| Filter bar (search + status pill) | Chung component | Nhập lọc theo PO status (SENT/PARTIAL); Xuất lọc theo request status (PENDING/APPROVED) |
| Bảng/danh sách chính | Chung `<table>` component khung, cột khác | Nhập: cột PO/NCC/ETA/tiến độ (xem Phase B); Xuất: cột mã yêu cầu/người tạo/SKU/tổng SL |
| Khu thao tác | Chung 1 khu "action panel" bên phải hoặc dưới bảng | Nhập: nút mở Wizard nhận hàng theo PO chọn. Xuất: form "Xuất nhanh" (ItemPicker + FIFO) HOẶC panel duyệt yêu cầu |
| `PendingRequestsPanel` (duyệt xuất từ Gia công) | — | Chỉ hiện ở mode Xuất, đặt NGAY DƯỚI segmented control, phía trên bảng chính (giữ vị trí nổi bật như hiện tại, không thu nhỏ) |

**Vì sao không dùng chung bảng 100%:** Nhập gắn với PO có sẵn (nguồn: `usePurchaseOrdersList`), Xuất có 2 nguồn số liệu khác nhau (yêu cầu chờ duyệt + form xuất nhanh tự do không cần PO). Cố ép chung 1 data model sẽ vi phạm KISS — chỉ nên dùng chung **khung UI** (header, segmented control, KPI-row layout, filter-bar layout), còn nội dung bảng/form là 2 component con riêng (`ReceivingMovementView`, `IssueMovementView`) render theo `mode`.

### 3.2 ASCII mockup — tab "Nhập / Xuất kho"

```
┌─────────────────────────────────────────────────────────────────────┐
│ Trang chủ / Kho / Nhập · Xuất kho                        [Breadcrumb]│
│ Nhập · Xuất kho                                                       │
│ Quản lý PO chờ nhận và yêu cầu xuất kho.                              │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┬──────────────┐                                    │
│  │  ● Nhập kho  │   Xuất kho   │  ← segmented control (pill, sticky) │
│  └──────────────┴──────────────┘                                    │
├─────────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                     │
│ │Chờ xử lý│ │Đang nhận│ │Quá hạn  │ │Hôm nay  │   ← KPI row (4 card) │
│ │   12    │ │    3    │ │   1     │ │   2     │                     │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘                     │
├─────────────────────────────────────────────────────────────────────┤
│ [🔍 Tìm PO/NCC...] [Tất cả|Chờ xử lý|Đang nhận]      [↻ Làm mới]     │
├─────────────────────────────────────────────────────────────────────┤
│ Mã PO      NCC             ETA        Tiến độ      Trạng thái  [•••]│
│ PO-2024-01 Cty Thép ABC    18/09 (quá) ▓▓▓░░ 60%    Đang nhận   [Mở] │
│ PO-2024-02 Cty Nhôm XYZ    25/09       ░░░░░ 0%     Chờ xử lý   [Mở] │
│ ...                                                    (bảng compact)│
└─────────────────────────────────────────────────────────────────────┘

--- khi bấm segmented "Xuất kho" ---

┌─────────────────────────────────────────────────────────────────────┐
│  ┌──────────────┬──────────────┐                                    │
│  │   Nhập kho   │  ● Xuất kho  │                                    │
│  └──────────────┴──────────────┘                                    │
├─────────────────────────────────────────────────────────────────────┤
│ ⚠ Yêu cầu chờ duyệt từ Gia công (3)                    [▼][↻ Làm mới]│
│  REQ-0012 · sản xuất · Nguyễn A · 5 SKU/12 pick/tổng 340   [Duyệt][X]│
├─────────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐                                 │
│ │Chờ duyệt│ │Xuất h.nay││Thiếu tồn│           ← KPI row (3-4 card)   │
│ └─────────┘ └─────────┘ └─────────┘                                 │
├─────────────────────────────────────────────────────────────────────┤
│ Xuất nhanh (auto FIFO)                                               │
│ [# ][ ItemPicker...........][ SL ][tồn][Xoá]                         │
│ [+ Thêm dòng]              Lý do ▾  Chứng từ...  Ghi chú...          │
│                                          [Xuất hàng ngay →]          │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 File thay đổi Phase A

| Hành động | File |
|---|---|
| SỬA | `apps/web/src/components/warehouse/WarehouseTabsNav.tsx` — đổi `WAREHOUSE_TABS`: xoá `receiving`/`issue`, thêm `movement` (icon `ArrowLeftRight` từ lucide) |
| SỬA | `apps/web/src/app/(app)/warehouse/page.tsx` — `resolveTab()` thêm map cũ→`movement`; đọc `searchParams.mode`; truyền `mode` xuống component mới; đổi breadcrumb dùng `<Breadcrumb>` component thay vì tự viết tay |
| MỚI | `apps/web/src/components/warehouse/MovementTab.tsx` — component khung: header + segmented control + switch render `ReceivingMovementView` / `IssueMovementView` theo `mode` |
| ĐỔI TÊN + SỬA | `ReceivingTab.tsx` → nội dung chuyển thành `ReceivingMovementView.tsx` (bớt phần header/wrapper trùng vì `MovementTab` đã có) |
| ĐỔI TÊN + SỬA | `IssueTab.tsx` → `IssueMovementView.tsx`, xoá header gradient riêng, đổi màu rose/pink → indigo (xem Phase B) |
| SỬA | `apps/web/src/app/(app)/receiving/page.tsx` — redirect `/warehouse?tab=movement&mode=in` |
| KIỂM TRA | Mọi nơi có `href="/warehouse?tab=receiving"` hoặc `?tab=issue"` (grep thấy ở `ReceivingTab.tsx`, `WarehouseLayoutTab.tsx:581`, `receiving/[poId]/page.tsx:240`, `wizard/page.tsx:356`) — sửa thành `?tab=movement&mode=in|out` |

### 3.4 DoD Phase A
- [ ] `/warehouse?tab=movement&mode=in` hiển thị đúng danh sách PO chờ nhận (dữ liệu giống `ReceivingTab` cũ).
- [ ] `/warehouse?tab=movement&mode=out` hiển thị đúng `PendingRequestsPanel` + form xuất nhanh (dữ liệu giống `IssueTab` cũ).
- [ ] `/warehouse?tab=receiving` (link cũ, bookmark cũ) tự redirect đúng sang `movement&mode=in`, không lỗi 404/blank.
- [ ] `/warehouse?tab=issue` tự redirect đúng sang `movement&mode=out`.
- [ ] Segmented control chuyển mode không reload full page (dùng `<Link>`/router client), giữ scroll position hợp lý.
- [ ] `WAREHOUSE_TABS` chỉ còn 4 phần tử, tab nav hiển thị đúng active state.
- [ ] Không còn import chết `ReceivingTab`/`IssueTab` cũ (hoặc đã archive rõ ràng nếu giữ lại làm reference).

### 3.5 Cách kiểm chứng
- `pnpm build` pass (bắt lỗi TypeScript import path).
- Thủ công: mở `/warehouse?tab=movement`, `&mode=out`, click các link cũ từ `wizard/page.tsx` breadcrumb quay lại danh sách → phải về đúng mode nhập.
- Test tồn tại (nếu có) cho `resolveTab` — grep `__tests__` liên quan warehouse trước khi sửa.

---

## 4. Phase B — Redesign màn Nhận hàng cho gọn

### 4.1 POCard cao 6 khối → bảng compact

**So sánh 2 phương án:**

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Bảng dữ liệu (table, 1 hàng/PO) | Mật độ cao, quét mắt nhanh, nhất quán với `POListTable`/`PRListTable` đã có, dễ sort/pagination | Cần thiết kế cột responsive cho mobile (theo `docs/design-guidelines.md` §12.4: bảng ≥5 cột → card-list dưới `md`) |
| B. Card thấp 2-3 dòng (giữ dạng card nhưng nén) | Giữ visual giống hiện tại, ít thay đổi hành vi | Vẫn tốn nhiều không gian dọc hơn bảng khi danh sách dài (chục PO/ngày mùa cao điểm) |

**Chọn phương án A (bảng compact)** — nhất quán với pattern đã chuẩn hoá ở `POListTable.tsx`/`PRListTable.tsx` (đúng gợi ý trong yêu cầu), giải quyết triệt để vấn đề "chiếm space không hợp lý" mà user nêu. Trên mobile (`<md`) fallback card 2-3 dòng theo đúng rule `docs/design-guidelines.md` §12.4 (table `hidden md:block`, card `md:hidden`).

**Cột đề xuất cho bảng Nhận hàng:**

```
┌────────────┬──────────────┬───────────┬─────────────┬────────────┬─────────┬────────┐
│ Mã PO      │ Nhà cung cấp │ ETA       │ Tiến độ nhận│ Giá trị    │ Trạng   │  •••   │
│ (mono, bold│ (truncate)   │ (badge    │ (progress   │ (₫, mono)  │ thái    │ (menu) │
│  + icon)   │              │  quá/hôm  │  bar mini)  │            │ (pill)  │        │
│            │              │  nay/còn) │             │            │         │        │
└────────────┴──────────────┴───────────┴─────────────┴────────────┴─────────┴────────┘
```
- 7 cột nhưng cột cuối chỉ là menu icon → coi như 6 cột dữ liệu, trong hạn mức khuyến nghị design-guidelines.
- Click vào hàng (trừ cột `•••`) → điều hướng thẳng vào Wizard (`/receiving/{id}/wizard`) — đây là "1 hành động chính".
- Cột `•••` mở dropdown menu phụ: "Lịch sử nhận hàng" (mở `ReceivingHistoryDrawer` hiện có), "Duyệt nhận đủ", "Từ chối".

### 4.2 Gom 5 nút → 1 hành động chính + menu phụ

Hiện tại `POCard` (dòng 194-246) có 5 nút: Mở wizard / Form đơn giản / PWA tablet / Duyệt nhận đủ / Từ chối.

**Thiết kế mới:**
- **Hành động chính** (click cả hàng, hoặc nút "Nhận hàng →" cuối hàng): mở `/receiving/{id}/wizard`.
- **Menu phụ** (icon `MoreVertical`, dùng `DropdownMenu` component có sẵn trong `components/ui/`):
  - "Mở PWA tablet" → `/pwa/receive/{id}` (target `_blank`) — giữ vì khác thiết bị.
  - "Lịch sử nhận hàng" → mở `ReceivingHistoryDrawer` (giữ nguyên).
  - "Duyệt nhận đủ" → mở dialog approve hiện có.
  - "Từ chối" → mở dialog reject hiện có.
  - **KHÔNG còn "Form đơn giản"** — xem quyết định #2 ở mục 0.

### 4.3 Hợp nhất 3 lối vào PO còn 1

Theo khuyến nghị mục 0.2: **giữ Wizard, xoá Form đơn giản, giữ PWA tablet riêng.**

| Route | Hành động |
|---|---|
| `/receiving/[poId]/wizard/page.tsx` | GIỮ NGUYÊN — là route chính cho desktop |
| `/receiving/[poId]/page.tsx` (Form đơn giản, 507 dòng) | **XOÁ file**, thay bằng `redirect(\`/receiving/${params.poId}/wizard\`)` (giữ route tồn tại cho link cũ/bookmark, tránh 404) |
| `/pwa/receive/[poId]` | GIỮ NGUYÊN — thiết bị tablet, cần offline-first, không hợp nhất |

**Lý do chọn Wizard thay vì Form đơn giản:** Wizard đã có breadcrumb chuẩn (dòng 353-363), chia 3 bước rõ ràng (check→capture→qc) giúp giảm sai sót nhập liệu, đã là điểm vào "chính" theo UI hiện tại (nút đầu tiên, nổi bật nhất trong `POCard`). Form đơn giản là bản rút gọn trùng lặp chức năng, giữ cả 2 chỉ gây rối "không biết dùng cái nào" — đúng vấn đề #3 user nêu.

### 4.4 Bỏ sidebar "Hướng dẫn nhanh" tĩnh 380px trong ReceivingConsole

- File: `apps/web/src/components/receiving/ReceivingConsole.tsx` dòng 480-494 (`<aside className="hidden lg:block">...</aside>`) và grid cha dòng 401 (`lg:grid-cols-[1fr,minmax(320px,380px)]`).
- **Thay bằng:** đổi grid về single-column full-width (`grid-cols-1`), nội dung "Hướng dẫn nhanh" chuyển thành:
  - Tooltip/popover nhỏ cạnh icon trợ giúp (`?`) ở header, HOẶC
  - Ẩn hẳn sau khi user đã dùng Console ≥ 1 lần (không cần build cơ chế "đã xem" phức tạp trong V1 — YAGNI; đơn giản nhất là xoá hẳn, vì nội dung hướng dẫn ("Bấm Bật camera hoặc dùng máy quét USB...") sẽ không còn đúng nếu Phase D bỏ camera).
- Vì Phase D bỏ `BarcodeScanner` (camera) khỏi Console, nội dung hướng dẫn 4 bước (dòng 486-491) PHẢI viết lại theo flow mới (không còn "Bật camera").

### 4.5 Chuẩn hoá màu IssueTab rose/pink → indigo

- File: `IssueTab.tsx` (sau đổi tên `IssueMovementView.tsx`) dòng 172 (`bg-gradient-to-br from-zinc-50 to-rose-50/30`), dòng 176 (`bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg shadow-rose-200`), dòng 213 (`text-rose-600`), dòng 240-241 (hover rose), dòng 309 (`from-rose-500 to-pink-600`), `ItemPicker` selected state dòng 523-528 (`border-rose-200 bg-rose-50`), `PendingRequestsPanel` giữ **amber** cho khối cảnh báo chờ duyệt (đúng ý nghĩa "cần chú ý" — KHÔNG đổi amber, chỉ đổi rose/pink).
- Đổi toàn bộ token `rose`/`pink` (trừ amber cảnh báo) → `indigo`/`violet` để khớp hệ màu `WarehouseLayoutTab.tsx` (`from-indigo-600 to-violet-600`) và `ReceivingTab.tsx` (`indigo-600`).
- Vì phần header/gradient sẽ bị `MovementTab` khung chung thay thế (Phase A), phần lớn việc đổi màu này thực chất nằm ở: nút "Xuất hàng ngay" (dòng 306-322), `ItemPicker` state (dòng 521-528, 556, 566), badge trong `SimpleLineRow`.

### 4.6 DoD Phase B
- [ ] Bảng Nhận hàng hiển thị đúng 6 cột dữ liệu + cột menu, responsive card `<md`.
- [ ] Click hàng (trừ menu) → vào thẳng wizard.
- [ ] Route `/receiving/[poId]` cũ (không có `/wizard`) redirect vào wizard, không còn UI "Form đơn giản".
- [ ] `ReceivingConsole` không còn sidebar 380px cố định, layout full-width.
- [ ] Không còn class `rose-`/`pink-` trong `IssueMovementView.tsx` (trừ nơi cố ý amber cảnh báo).
- [ ] Dark mode đủ `dark:` cho mọi phần tử mới/sửa (theo checklist `docs/design-guidelines.md` §12.6).

### 4.7 Kiểm chứng
- DevTools 360×640: bảng ẩn, card hiện, không cuộn ngang body.
- `pnpm build` pass.
- Mở `/receiving/{poId}` cũ (nếu còn ai bookmark) → xác nhận redirect đúng vào wizard, không lỗi.

---

## 5. Phase C — Sửa mất định vị (breadcrumb)

### 5.1 Vấn đề

`receiving/[poId]/page.tsx` (Form đơn giản) chỉ có link `"← Về danh sách PO chờ nhận"` (dòng 239-245), không có breadcrumb chuẩn — đây chính là nguyên nhân vấn đề #3 user nêu ("không biết nó sẽ ở mục nào"). Sau Phase B, file này bị xoá/redirect nên vấn đề tự triệt tiêu ở đây, nhưng **phải rà toàn bộ trang con còn lại của Kho** để đảm bảo không còn trang nào thiếu breadcrumb.

### 5.2 Chuẩn hoá: dùng `<Breadcrumb>` + `useBreadcrumb` có sẵn

- Component `apps/web/src/components/ui/breadcrumb.tsx` đã tồn tại và đang dùng chuẩn ở `POTab.tsx:151-157`. **Không tự viết breadcrumb tay bằng `<nav><Link>...<span>›</span>` như `warehouse/page.tsx:56-66` và `wizard/page.tsx:353-363` đang làm** — nên thay bằng component chung để nhất quán + dễ bảo trì.
- Mẫu breadcrumb cho từng cấp Kho:

| Trang | Breadcrumb items |
|---|---|
| `/warehouse?tab=movement&mode=in` | Trang chủ / Kho / Nhập · Xuất kho |
| `/warehouse?tab=movement&mode=out` | Trang chủ / Kho / Nhập · Xuất kho *(giữ nguyên, vì đổi mode không đổi "nơi chốn")* |
| `/warehouse?tab=layout` | Trang chủ / Kho / Sơ đồ kho |
| `/receiving/[poId]/wizard` | Trang chủ / Kho / Nhập · Xuất kho / Wizard {poCode} |
| `/pwa/receive/[poId]` | (PWA — có thể giữ tối giản, không cần breadcrumb đầy đủ vì full-screen single-task theo design-guidelines §2.1) |

### 5.3 File cần sửa

| File | Việc cần làm |
|---|---|
| `apps/web/src/app/(app)/warehouse/page.tsx` (dòng 55-66) | Thay breadcrumb tay bằng `<Breadcrumb items={[...]} />`, `tabLabel` tính theo `mode` khi `active === "movement"` |
| `apps/web/src/app/(app)/receiving/[poId]/wizard/page.tsx` (dòng 353-363) | Thay bằng `<Breadcrumb>`, giữ nguyên nội dung items (đã đúng) |
| `apps/web/src/app/(app)/receiving/[poId]/page.tsx` | Xoá theo Phase B — không cần sửa breadcrumb vì sẽ bị xoá |

### 5.4 Về câu hỏi "trang riêng hay drawer" (đã trả lời ở mục 0.3)

Phân tích ưu/nhược đầy đủ:

| Phương án | Ưu | Nhược |
|---|---|---|
| Giữ trang riêng (route) | Wizard 3 bước cần nhiều không gian dọc; URL có thể share/bookmark/back-forward; đơn giản hơn về state management | Cần breadcrumb tốt để không lạc (đã fix ở Phase C) |
| Đổi thành drawer trong tab | Giữ nguyên ngữ cảnh danh sách phía sau, cảm giác "không rời trang" | Wizard 3 bước + bảng 11 cột (step capture, `wizard/page.tsx:585-718`) rất khó nhét vào drawer hẹp; mất khả năng bookmark/share link PO cụ thể; effort đổi kiến trúc lớn, rủi ro cao |

**Kết luận: giữ trang riêng**, chỉ cần breadcrumb tốt là đủ giải quyết vấn đề #3 — đúng nguyên tắc KISS (sửa đúng chỗ hỏng, không đổi kiến trúc không cần thiết).

### 5.5 DoD Phase C
- [ ] Mọi trang con của Kho (`/warehouse?tab=*`, `/receiving/[poId]/wizard`, `/pwa/receive/[poId]`) có breadcrumb dùng chung component `<Breadcrumb>`.
- [ ] Từ wizard, breadcrumb click "Nhập · Xuất kho" quay đúng về `/warehouse?tab=movement&mode=in`.
- [ ] Không còn breadcrumb tự viết tay bằng `<span>›</span>` lặp lại ở nhiều nơi (DRY).

### 5.6 Kiểm chứng
- Thủ công: vào wizard 1 PO bất kỳ → xác nhận nhìn breadcrumb biết ngay đang ở đâu, click từng cấp breadcrumb đều điều hướng đúng.

---

## 6. Phase D — Bỏ quét camera (phạm vi Kho)

### 6.1 Trả lời câu hỏi then chốt: bỏ camera thì nhập mã bằng gì?

**Quyết định (mục 0.1): GIỮ ô nhập tay + máy quét HID (`ui/BarcodeScanInput`), chỉ bỏ CAMERA (`scan/BarcodeScanner`, dùng `html5-qrcode`).**

Lý do kỹ thuật quan trọng — phân biệt 2 khái niệm khác nhau mà user gộp chung là "quét barcode cũ":
1. **Máy quét HID cầm tay (USB, giả lập bàn phím)** — xưởng cắm dây, quét phát ra chuỗi ký tự + Enter, y hệt gõ bàn phím rất nhanh. `ui/BarcodeScanInput.tsx` (163 dòng) là input xử lý đúng luồng này — **đây KHÔNG PHẢI thứ "xấu và chiếm space"** mà user phàn nàn (user phàn nàn về UI Nhận hàng nói chung, không nhắc riêng máy quét).
2. **Camera scan qua webcam/tablet** (`scan/BarcodeScanner.tsx`, lazy-load `html5-qrcode`) — đây là "thiết kế quét barcode cũ" nặng nề: cần xin quyền camera, UI phức tạp (canvas video preview), hiệu năng kém trên tablet rẻ, và đang là 1 trong 3 lớp UI cố định đầu trang `ReceivingConsole` (cùng 2 banner sticky).

**⚠ CẢNH BÁO PHẢI GHI RÕ CHO USER:** Nếu xưởng đang dùng máy quét HID cầm tay hàng ngày để nhận hàng, **gỡ bỏ luôn cả `ui/BarcodeScanInput` sẽ làm CHẬM thao tác nhận hàng đáng kể** — nhân viên phải gõ tay hoặc dùng `ItemPicker` (search + click), chậm hơn nhiều so với "quét phát 1 cái". Plan này **KHÔNG đề xuất bỏ HID**, chỉ bỏ camera. Nếu user vẫn muốn bỏ luôn HID, cần xác nhận lại rõ ràng bằng văn bản trước khi thực thi vì ảnh hưởng trực tiếp năng suất vận hành thực tế — đây là quyết định rủi ro cao nhất trong toàn bộ plan.

### 6.2 File cụ thể cần gỡ (camera only)

| File | Hành động | Thay bằng |
|---|---|---|
| `apps/web/src/components/receiving/ReceivingConsole.tsx` dòng 19 (`import { BarcodeScanner }`) + dòng 403 (`<BarcodeScanner onDetect={handleScan} />`) | XOÁ import + usage | Thay bằng `<BarcodeScanInput onScan={handleScan} />` (từ `ui/BarcodeScanInput`, đã có sẵn, chỉ cần render trong khu vực trước đây chứa camera) |
| `apps/web/src/components/scan/BarcodeScanner.tsx` (384 dòng) | **KHÔNG xoá file** — vẫn được dùng ở `AssemblyConsole.tsx` và `BomBarcodeSearchDialog.tsx` (ngoài phạm vi Kho). Chỉ ngừng import trong Kho. | — |

### 6.3 Dọn 2 file trùng tên `BarcodeScanInput`

| File | Hiện trạng dùng | Hành động |
|---|---|---|
| `apps/web/src/components/ui/BarcodeScanInput.tsx` (163 dòng) | Dùng ở `receiving/[poId]/page.tsx` (bị xoá Phase B) + `PoQuickReceiveTable.tsx:9,278` (ngoài phạm vi trang này nhưng vẫn Procurement — không đụng) | **GIỮ làm bản chính thức** — sẽ dùng thêm trong `ReceivingConsole.tsx` (6.2) |
| `apps/web/src/components/scan/BarcodeScanInput.tsx` (185 dòng) | Chỉ dùng ở `apps/web/src/app/(app)/assembly/[woId]/page.tsx:37` | **Không xoá trong plan Kho này** — thuộc phạm vi Assembly, cần phối hợp với plan Assembly riêng. Chỉ **ghi chú bàn giao**: tên trùng gây nhầm lẫn, đề xuất plan Assembly đổi tên file thành `AssemblyBarcodeInput.tsx` hoặc hợp nhất dùng chung `ui/BarcodeScanInput` (có tính năng tương đương: HID + nhập tay + beep). KHÔNG code phần này ở đây. |

### 6.4 `ScanQueueBadge` + hàng đợi Dexie offline

- Theo quyết định mục 0.5: **GIỮ NGUYÊN** `ScanQueueBadge.tsx` (256 dòng) và toàn bộ cơ chế Dexie `scanQueue` trong `ReceivingConsole.tsx` (dòng 103-281).
- Lý do: hàng đợi offline phục vụ **mọi nguồn nhập mã** (HID, nhập tay), không riêng camera. Bỏ camera không có nghĩa bỏ nhu cầu hoạt động offline trên tablet PWA (mất mạng vẫn phải nhận hàng được — đây là yêu cầu nghiệp vụ độc lập, không liên quan tới loại input).
- Việc cần làm: đổi nguồn gọi `handleScan(code)` (dòng 283-296) từ `BarcodeScanner.onDetect` sang `BarcodeScanInput.onScan` — logic xử lý sau khi có `code` giữ nguyên 100%.

### 6.5 File cần cập nhật nội dung hướng dẫn

- `ReceivingConsole.tsx` dòng 486-491 (trong sidebar "Hướng dẫn nhanh" — đã bị xoá theo Phase B §4.4): nếu quyết định giữ 1 dòng hint ngắn thay vì xoá hẳn, sửa text từ "Bấm Bật camera hoặc dùng máy quét USB" → "Dùng máy quét USB hoặc nhập tay mã SKU rồi Enter."

### 6.6 DoD Phase D
- [ ] `ReceivingConsole.tsx` không còn import/dùng `BarcodeScanner` (camera).
- [ ] `ReceivingConsole.tsx` dùng `ui/BarcodeScanInput` cho nhập mã (HID + tay), hành vi `handleScan` giữ nguyên.
- [ ] `ScanQueueBadge` + Dexie queue hoạt động y hệt cũ (test offline: tắt mạng, nhập mã, xem badge tăng, bật mạng lại thấy tự sync).
- [ ] KHÔNG động vào `scan/BarcodeScanner.tsx`, `AssemblyConsole.tsx`, `BomBarcodeSearchDialog.tsx`, `assembly/[woId]/page.tsx` (ngoài phạm vi).
- [ ] Có ghi chú bàn giao rõ ràng cho plan Assembly về file trùng tên `BarcodeScanInput`.

### 6.7 Kiểm chứng
- Mở `ReceivingConsole` trên trình duyệt không cấp quyền camera → không còn bị hỏi quyền camera, vẫn nhận hàng được qua nhập tay/HID giả lập (gõ chuỗi + Enter).
- Test offline: DevTools Network → Offline, nhập mã, xác nhận vào hàng đợi Dexie, bật lại mạng, xác nhận tự đồng bộ (giữ nguyên hành vi cũ).

---

## 7. Phase E — Đưa nhập/xuất vào Sơ đồ kho

### 7.1 Thiết kế thao tác tại bin

`BinActionsBar` (`BinActions.tsx:48-93`) **đã tồn tại** với 3 nút Thêm hàng (nhập)/Rút hàng (xuất)/Chuyển, được render trong drawer chi tiết bin ở `WarehouseLayoutTab.tsx:626-652`. Đây chính xác là nền tảng yêu cầu #5 của user ("đem tính năng đó vào sơ đồ kho luôn") — **việc chính không phải "build mới" mà là "làm nó dễ thấy/dễ dùng hơn"**, vì hiện tại nó bị chôn trong drawer 400px cố định, phải: search → chọn bin → mở drawer → cuộn xuống mới thấy 3 nút.

**Cải tiến đề xuất:**
1. Đưa `BinActionsBar` lên NGAY ĐẦU drawer (dưới header mã bin), không phải sau `DetailStat` + cảnh báo — giảm số thao tác để tới hành động chính.
2. Thêm entry point nhanh: click-phải (hoặc long-press trên tablet) trực tiếp lên 1 ô bin trong sơ đồ 2D/3D → mở popover mini với 3 nút Thêm/Rút/Chuyển ngay tại chỗ, không cần mở drawer đầy đủ trước — cho thao tác nhanh (đúng tinh thần "đem thao tác vào sơ đồ kho luôn").
3. Vẫn giữ drawer chi tiết đầy đủ cho khi cần xem nội dung bin (danh sách lot/SKU).

### 7.2 ASCII mockup — sơ đồ kho có thao tác

```
┌─────────────────────────────────────────────────────────────────────┐
│ Chọn kệ: [Kệ 01 18/18] [Kệ 02 12/18] [+ Thêm kệ]     ● Có hàng ● Sắp │
├───────────────┬───────────────────────────────────────────────────┬─┤
│ Thông tin kệ  │ [Sơ đồ kệ] [Danh sách hàng]  🔍...  [Lọc ▾] [2D|3D]│ │
│ Kệ 01 ● HĐ    ├───────────────────────────────────────────────────┤ │
│ Mã: A-01      │  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐             │ │
│ Đã dùng 60%   │  │A011││A012││A013││A014││A015││A016│  ← Bin2DPro  │ │
│ ▓▓▓▓▓▓░░░░    │  └────┘└────┘└────┘└────┘└────┘└────┘   (mặc định)│ │
│               │  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐             │ │
│ Thống kê kệ   │  │A021││A022││░░░░││A024││A025││A026│             │ │
│ ● Có hàng 12  │  └────┘└────┘└────┘└────┘└────┘└────┘             │ │
│ ● Sắp hết 2   │       ↑ click phải / long-press                   │ │
│ ● Trống 4     │       ┌──────────────────────┐                    │ │
│               │       │ Ô A-01-2-03           │                    │ │
│               │       │ [+ Thêm][- Rút][⇄ Chuyển]│ ← popover nhanh │ │
│               │       │ Xem chi tiết →         │                    │ │
│               │       └──────────────────────┘                    │ │
├───────────────┴───────────────────────────────────────────────────┴─┤
│ Tổng ô 18 · Đã dùng 12 (67%) · Tổng SL 4.500 · Sắp hết 2 · Trống 4   │
└───────────────────────────────────────────────────────────────────────┘

--- khi mở drawer chi tiết đầy đủ (click "Xem chi tiết") ---
                                              ┌─────────────────────────┐
                                              │ Vị trí          [X]     │
                                              │ A-01-2-03               │
                                              ├─────────────────────────┤
                                              │ [+ Thêm hàng][- Rút][⇄] │ ← lên đầu
                                              ├─────────────────────────┤
                                              │ Tổng SL │ Số SKU        │
                                              │ Số lot  │ Sức chứa      │
                                              ├─────────────────────────┤
                                              │ Nội dung                │
                                              │ SKU-001  Lot A   120 cái│
                                              │ SKU-002  Lot B    45 cái│
                                              └─────────────────────────┘
```

### 7.3 Sơ đồ tràn ngang → Bin2DPro mặc định

- File: `WarehouseLayoutTab.tsx` dòng 91 (`const [viewMode, setViewMode] = React.useState<"3d" | "2d">("3d")`) → đổi default thành `"2d"`.
- `Bin2DPro` (đã có sẵn tại `WarehouseLayout3D.tsx:1284`) là component compact 160×120px/bin, không tràn ngang như bản isometric SVG (`BIN_W=230, GAP_X=36` → 6 cột ~1600px+). Xác nhận `Bin2DPro` được export/dùng trong cùng file qua `viewMode` prop truyền vào `WarehouseLayout3D` (dòng 527-537 ở `WarehouseLayoutTab.tsx`).
- 3D (isometric) giữ làm tuỳ chọn qua toggle 2D/3D đã có sẵn (dòng 455-476), không cần viết lại (theo quyết định mục 0.6).

### 7.4 Drawer 400px cố định → responsive

- File: `WarehouseLayoutTab.tsx` dòng 594 (`className="fixed inset-y-0 right-0 z-30 w-[400px] ..."`).
- Theo `docs/design-guidelines.md` §12.3 (Overlay/portal — KHÔNG width px cứng): đổi thành `w-[calc(100vw-2rem)] sm:w-full max-w-[400px]` để có lề mobile, khớp pattern đã áp dụng cho `NotificationBell`, `ui/dialog`.
- Đây đúng là 1 trong các "nợ" mobile mà design-guidelines đã liệt kê sẵn ("Còn nợ... `WarehouseLayoutTab`" — dòng 365-366 file guidelines) — Phase E giải quyết luôn nợ này.

### 7.5 Card "Thông tin kệ" hard-code

- File: `WarehouseLayoutTab.tsx` dòng 302-305 (`<Row label="Kích thước" value="6000 × 1200 × 2000 mm" />`, `<Row label="Tải trọng tối đa" value="1500 kg / tầng" />`).
- Đã xác nhận qua đọc `packages/db/src/schema/master.ts` dòng 214-244: bảng `location_bin` **không có cột** cho kích thước vật lý/tải trọng.
- Theo quyết định mục 0.4: **V1 chỉ bỏ 2 dòng hard-code này khỏi UI** (không thêm migration DB) — vì (a) chưa ai nhập dữ liệu thật, (b) hiển thị số giả là tệ hơn không hiển thị (gây hiểu lầm số liệu thật), (c) đúng YAGNI — chỉ thêm cột DB khi có nhu cầu thực + người chịu trách nhiệm nhập liệu.
- Ghi chú optional-later trong code (comment) để dev sau biết: "Kích thước/tải trọng kệ cần cột mới trong `location_bin` nếu muốn hiển thị — xem `warehouse-location.ts`/`master.ts`."
- Giữ lại `Số tầng`, `Số ô/tầng` (dòng 304-305 kế tiếp) NẾU chúng tính được từ data thật (`levelNo`, group theo `rack`) — cần kiểm tra lúc code liệu 2 dòng này đang hard-code `"3"`/`"6"` hay tính động; nếu hard-code luôn thì cũng bỏ hoặc tính từ `currentRack.items`.

### 7.6 File thay đổi Phase E

| File | Thay đổi |
|---|---|
| `apps/web/src/components/warehouse/WarehouseLayoutTab.tsx` | Default `viewMode="2d"` (dòng 91); di chuyển `<BinActionsBar>` lên đầu drawer (trước dòng 608 `<DetailStat>`); đổi `w-[400px]` → responsive (dòng 594); bỏ/tính động 2 dòng hard-code (302-305) |
| `apps/web/src/components/warehouse/WarehouseLayout3D.tsx` hoặc `Bin2DPro` con | Thêm context-menu/long-press handler mở popover mini Thêm/Rút/Chuyển ngay tại ô bin (MỚI — cần thiết kế thêm state `contextMenuBinId`) |
| `apps/web/src/components/warehouse/BinActions.tsx` | Có thể cần tách `BinActionsBar` thành bản "compact" cho popover mini (chỉ 3 icon-button không label dài) — xem xét lúc code, ưu tiên tái dùng thay vì viết mới |

### 7.7 DoD Phase E
- [ ] Mặc định mở tab Sơ đồ kho hiển thị Bin2DPro (2D), không tràn ngang ở màn 1280px.
- [ ] Click 1 bin → drawer full nội dung, `BinActionsBar` hiện ngay đầu (trước khi cuộn).
- [ ] Click-phải/long-press 1 bin → popover mini có 3 nút Thêm/Rút/Chuyển, thao tác xong tự đóng + refresh.
- [ ] Drawer responsive đúng, không cứng 400px, test ở 360px width không vỡ layout.
- [ ] Card "Thông tin kệ" không còn hiển thị số liệu giả (kích thước/tải trọng hard-code).
- [ ] 3D vẫn hoạt động khi user chủ động toggle sang 3D (không breaking).

### 7.8 Kiểm chứng
- DevTools 360×640 mở sơ đồ kho: không cuộn ngang.
- Thao tác Thêm/Rút/Chuyển qua popover mini → verify tồn kho cập nhật đúng qua API (POST `/adjust`, `/transfer` đã có, không đổi backend).
- Toggle 2D/3D qua lại không lỗi.

---

## 8. Bảng rủi ro & ước lượng effort

| Phase | Rủi ro | Mức độ | Giảm thiểu | Effort ước lượng |
|---|---|---|---|---|
| A — Gộp tab | Nhầm lẫn URL cũ chưa redirect hết (nhiều nơi hardcode `?tab=receiving`/`?tab=issue`) | Trung bình | Grep toàn repo `warehouse?tab=` trước khi merge PR, checklist rà từng kết quả | 1.5 ngày |
| B — Bảng compact + hợp nhất route | Xoá "Form đơn giản" có thể có logic riêng chưa map hết sang Wizard (vd xử lý lỗi khác nhau) | Trung bình | Diff kỹ 2 file trước khi xoá, giữ redirect (không xoá route) để không 404 link cũ | 2 ngày |
| C — Breadcrumb | Thấp — chỉ thay component hiển thị | Thấp | Test click từng cấp | 0.5 ngày |
| D — Bỏ camera | **Cao nếu hiểu nhầm phạm vi** (bỏ nhầm cả HID) → ảnh hưởng năng suất thực tế xưởng | Cao (nghiệp vụ) | Chốt rõ mục 0.1 với user TRƯỚC khi code; code review kỹ diff `ReceivingConsole.tsx` | 1 ngày (chỉ bỏ camera) |
| E — Sơ đồ kho có thao tác | Context-menu/long-press trên SVG isometric phức tạp hơn dự kiến nếu cần hỗ trợ cả touch + mouse | Trung bình | Ưu tiên làm trên `Bin2DPro` (DOM thường, dễ gắn event) trước, hoãn context-menu cho 3D SVG nếu phát sinh vấn đề (giữ 3D chỉ click thường mở drawer, không bắt buộc long-press) | 2 ngày |
| Chung | Đổi tên file (`ReceivingTab`→`ReceivingMovementView`) có thể phá import ở nơi chưa rà hết | Trung bình | Dùng "Tìm & Thay" toàn repo (`grep -rn "ReceivingTab\|IssueTab"`) trước khi đổi tên, `pnpm build` xác nhận sau mỗi bước | — |
| Chung | Trùng lặp công việc với plan Assembly (barcode dùng chung `BarcodeScanner`) | Thấp nếu phối hợp tốt | Ghi chú bàn giao rõ trong Phase D §6.3, KHÔNG tự ý sửa file Assembly | — |

**Tổng effort ước lượng: ~7 ngày làm việc** (1 dev, không tính review/QA), chia theo tuần:
- Tuần 1: Phase A + B (gộp tab, bảng compact, hợp nhất route) — phần thay đổi cấu trúc lớn nhất.
- Tuần 2: Phase C + D + E (breadcrumb, bỏ camera, sơ đồ kho) — phần độc lập, có thể làm song song nếu 2 dev.

---

## 9. Thứ tự triển khai đề xuất (khi `/cook`)

1. **Phase C trước** (breadcrumb) — độc lập, rủi ro thấp nhất, có thể merge riêng ngay, cải thiện UX tức thì.
2. **Phase D** (bỏ camera trong Console) — độc lập với Phase A/B, chỉ đổi 1 file `ReceivingConsole.tsx`, rủi ro nghiệp vụ cần chốt sớm với user.
3. **Phase A** (gộp tab movement) — nền tảng cho Phase B, phải làm trước.
4. **Phase B** (bảng compact + hợp nhất route) — phụ thuộc Phase A đã xong khung `MovementTab`.
5. **Phase E** (sơ đồ kho có thao tác) — độc lập nhất, có thể làm bất kỳ lúc nào, không phụ thuộc A/B/C/D.

**Phụ thuộc:** B phụ thuộc A. C, D, E độc lập, có thể chạy song song với A/B nếu có nhiều dev.

---

## 10. Tổng hợp file bị ảnh hưởng (tham chiếu nhanh)

**SỬA:**
- `apps/web/src/app/(app)/warehouse/page.tsx`
- `apps/web/src/components/warehouse/WarehouseTabsNav.tsx`
- `apps/web/src/components/warehouse/ReceivingTab.tsx` (đổi tên → `ReceivingMovementView.tsx`)
- `apps/web/src/components/warehouse/IssueTab.tsx` (đổi tên → `IssueMovementView.tsx`)
- `apps/web/src/app/(app)/receiving/page.tsx`
- `apps/web/src/app/(app)/receiving/[poId]/wizard/page.tsx` (breadcrumb component)
- `apps/web/src/components/receiving/ReceivingConsole.tsx` (bỏ camera, bỏ sidebar 380px)
- `apps/web/src/components/warehouse/WarehouseLayoutTab.tsx` (default 2D, drawer responsive, bỏ hard-code, BinActionsBar lên đầu)
- `apps/web/src/components/warehouse/WarehouseLayout3D.tsx` (thêm context-menu/long-press cho Bin2DPro)
- `apps/web/src/components/warehouse/BinActions.tsx` (có thể thêm bản compact cho popover)

**XOÁ (thay bằng redirect):**
- `apps/web/src/app/(app)/receiving/[poId]/page.tsx` (Form đơn giản → redirect vào wizard)

**MỚI:**
- `apps/web/src/components/warehouse/MovementTab.tsx`

**KHÔNG ĐỤNG (ngoài phạm vi, chỉ ghi chú bàn giao):**
- `apps/web/src/components/scan/BarcodeScanner.tsx`
- `apps/web/src/components/scan/BarcodeScanInput.tsx`
- `apps/web/src/components/assembly/AssemblyConsole.tsx`
- `apps/web/src/app/(app)/assembly/[woId]/page.tsx`
- `apps/web/src/components/bom-workspace/BomBarcodeSearchDialog.tsx`

---

*Hết plan. Chờ user chốt mục 0 trước khi chuyển sang `/cook`.*
