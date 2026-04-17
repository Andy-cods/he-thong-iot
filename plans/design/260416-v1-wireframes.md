# V1 Wireframes — Top 8 màn hình ưu tiên

*Phiên bản:* 1.0 · *Ngày:* 2026-04-16 · *Persona:* UI/UX Designer
*Cross-link:* `docs/design-guidelines.md` · `plans/v1-foundation/260416-v1-implementation-plan.md`

Quy ước ASCII:
- `═` `║` `╔╗╚╝╠╣╦╩╬` khung cố định
- `─` `│` khung nội dung, `[Text]` nút, `( )` input, `< >` trigger, `▼` dropdown, `☐` checkbox, `▸` expandable, `●` radio
- `{{placeholder}}` content động

Component references: shadcn/ui (`Button`, `DataTable`, `Tree`, `Sheet`, `Sonner`, `Combobox`, `Badge`, `Dialog`, `Command`, `Form`, `Input`, `Tabs`, `Tooltip`, `Skeleton`).

---

## 1. Login — Auth

**Route:** `/login`  ·  **Role:** tất cả  ·  **Priority:** P0

```
Desktop (1280×800)                                   Mobile (375×812)
╔═════════════════════════════════════════════╗      ╔══════════════════╗
║                                             ║      ║                  ║
║    ┌──── Left 50% ────┐ ┌── Right 50% ──┐  ║      ║  ┌──────────┐   ║
║    │                  │ │                │  ║      ║  │ [LOGO]   │   ║
║    │    [LOGO]        │ │ Đăng nhập      │  ║      ║  │ Xưởng IoT│   ║
║    │    Xưởng Cơ khí  │ │                │  ║      ║  └──────────┘   ║
║    │    BOM-centric   │ │ Tài khoản      │  ║      ║                  ║
║    │                  │ │ ( admin_______)│  ║      ║  Đăng nhập       ║
║    │  (illustration   │ │                │  ║      ║                  ║
║    │   SVG máy CNC    │ │ Mật khẩu       │  ║      ║  Tài khoản       ║
║    │   line art       │ │ ( •••••••• )   │  ║      ║  (_____________)║
║    │   slate-300)     │ │                │  ║      ║                  ║
║    │                  │ │ ☐ Ghi nhớ 7d   │  ║      ║  Mật khẩu        ║
║    │                  │ │                │  ║      ║  (_____________)║
║    │                  │ │ [ Đăng nhập ]  │  ║      ║                  ║
║    │                  │ │                │  ║      ║  [ Đăng nhập  ] ║
║    │                  │ │ Quên mật khẩu? │  ║      ║                  ║
║    │                  │ │ Liên hệ IT     │  ║      ║  Quên? · IT      ║
║    └──────────────────┘ └────────────────┘  ║      ║                  ║
║                                             ║      ║  v1.0.0 · offline║
║   Build v1.0.0 · Ping OK · TZ Asia/HCM      ║      ╚══════════════════╝
╚═════════════════════════════════════════════╝
```

**Layout logic:**
- Desktop: 2 cột, split 50/50; left hero cố định (SVG CNC line-art màu `slate-300`, không photo tránh license).
- Mobile: single column, logo top, form giữa, footer link dưới.
- Grid 12-col; card center `max-w-[420px]`.

**Interaction states:**
- Loading: button `[Đang xác thực…]` + spinner 16px, form disabled.
- Empty: n/a.
- Error: inline error dưới mỗi field (`border-danger` + icon ✕ + "Sai tài khoản hoặc mật khẩu"); sau 5 lần sai hiện CAPTCHA modal.
- Success: redirect `/` (Dashboard), toast "Xin chào, {{fullName}}".
- MFA (admin): sau login thành công → Dialog nhập TOTP 6 số, autofocus, auto-submit khi đủ 6 ký tự.

**Breakpoints:**
- < 768px: mobile single column.
- ≥ 1280px: split 50/50.
- Hero ẩn < 1024px.

**Annotations:**
- `Form` từ `react-hook-form` + `zod` schema.
- `Input type="password"` có toggle mắt (aria-label "Hiện mật khẩu").
- Tap target 48px (height h-12) cho mobile.
- Test đa ngôn ngữ: label "Tài khoản" thay vì "Email" (nhiều user không có email công ty).

---

## 2. Dashboard tổng Readiness — TV + Desktop

**Route:** `/` (desktop) · `/tv` (kiosk mode)  ·  **Role:** admin, planner, TV view-only  ·  **Priority:** P0

```
Desktop 1280 ─ Dashboard tổng Readiness
╔════════════════════════════════════════════════════════════════════════╗
║ [≡] Xưởng IoT · BOM-centric          Tìm (Ctrl+K)      [🔔]  TN ▼     ║  ← Top bar 56px
╠════════╤═══════════════════════════════════════════════════════════════╣
║        │ Dashboard tổng                       Cập nhật 14:23 · Auto 30s║
║ Sidebar├───────────────────────────────────────────────────────────────║
║ 240px  │ ┌─ KPI Row (4 card) ─────────────────────────────────────────┐║
║        │ │Đơn đang   │ Shortage  │ PO trễ    │ WO in-progress        ││
║ 📊 Dash│ │ 12        │   8 SKU   │   3       │    7                  ││
║ 📦 Item│ │ ↑2 tuần   │ ⚠ cam     │ ⚡ đỏ     │ ✓ xanh                ││
║ 🔀 BOM │ └───────────────────────────────────────────────────────────┘║
║ 📋 Order│                                                              ║
║ 🛒 PO   │ ┌─ Orders Readiness Table ──────────────────────┐ ┌─ Alert ┐║
║ 📦 Recv │ │Mã đơn │ SP  │ Sớm nhất │ Ready% │ Shortage │  │ │3 đơn  │║
║ 🏭 WO   │ │SO-101 │ CNC │ 20/04    │ 78% ◐  │   4 SKU  │  │ │shortage│║
║ 📱 PWA  │ │SO-102 │ Jig │ 22/04    │ 95% ●  │   1 SKU  │  │ │> 20%  │║
║ 📜 Audit│ │SO-103 │ Fix │ 25/04    │ 40% ○  │   9 SKU  │  │ │        │║
║        │ │…10 rows paginated                            │  │ │5 PO   │║
║ ── ── ─│ └────────────────────────────────────────────────┘  │ │ETA > │║
║ ⚙️ Admin│                                                      │ │3 days│║
║        │ ┌─ Bar chart WO progress ───────┐ ┌─ Sparklines ─┐   │ │        │║
║ [Logout]│ │ WO-001 ████████░░ 82%        │ │ Txn 7d: ▂▅█▇▆│   │ │ …      │║
║        │ │ WO-002 ██████░░░░ 60%        │ │ Receipt: ▁▂▅█ │   │ └────────┘║
║        │ │ WO-003 ██░░░░░░░░ 18%        │ │ WO cmpl: ▃▅▇▆ │            ║
║        │ └───────────────────────────────┘ └───────────────┘            ║
╚════════╧════════════════════════════════════════════════════════════════╝

TV 1920×1080 (kiosk, không sidebar, không topbar user)
╔══════════════════════════════════════════════════════════════════════════════╗
║ XƯỞNG CƠ KHÍ — TRẠNG THÁI SẢN XUẤT                          14:23:45 · ●live ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ ┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬────┐║
║ │ ĐƠN         │ READY 100%  │ SHORTAGE    │ PO TRỄ      │ WO CHẠY     │... │║
║ │    12       │     5       │   ⚠ 8       │   ⚡ 3      │     7       │    │║
║ │   72pt      │   72pt xanh │ 72pt cam    │ 72pt đỏ     │  72pt       │    │║
║ └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴────┘║
║                                                                               ║
║  ORDERS CRITICAL (< 3 ngày giao)                                             ║
║  ┌────────────────────────────────────────────────────────────────────────┐ ║
║  │ SO-101  CNC-Base-A   20/04 (còn 2d)   78% ████████░░  4 SKU thiếu     │ ║
║  │ SO-103  Fixture-X    25/04 (còn 7d)   40% ████░░░░░░  9 SKU thiếu ⚠   │ ║
║  │ SO-098  Jig-Series   18/04 (HÔM NAY!) 95% ███████████▌ 1 SKU thiếu    │ ║
║  └────────────────────────────────────────────────────────────────────────┘ ║
║                                                                               ║
║  WO HÔM NAY  WO-001 82%  WO-002 60%  WO-003 18%   Productivity: ████░ 82%   ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

**Layout logic:**
- Desktop: sidebar 240px + content 12-col grid, gap 16px, padding 24px.
- TV: full-width, 6 giant KPI cards (`grid-cols-tv-6`), font KPI `text-7xl` (72px), auto-refresh mỗi 30s qua SWR.

**Interaction states:**
- Loading: skeleton cards + table rows shimmer.
- Empty ("Chưa có đơn nào"): illustration + CTA "Tạo đơn hàng đầu tiên".
- Error: inline banner `danger` "Không tải được dashboard — [Thử lại]".
- Success: auto-refresh silent, toast chỉ khi có alert mới.

**Breakpoints:**
- 1280px desktop (chính).
- 1920px TV kiosk (full-screen, không tương tác, không sidebar).
- Không responsive xuống mobile (mobile dùng Order Detail thay thế).

**Annotations:**
- Table: `shadcn/ui DataTable` + `@tanstack/react-table` v8 + `@tanstack/react-virtual` khi > 50 rows.
- Chart: `Recharts` `BarChart` + `LineChart`, animation off để tiết kiệm GPU TV.
- KPI card: props `value`, `delta`, `status` (green/amber/red map icon).
- TV mode: `?mode=tv` bỏ auth prompt, whitelist IP LAN.
- Navigation: keyboard shortcut `Ctrl+K` mở `Command` palette.

---

## 3. Item Master List + Filter — 10k rows với virtualization

**Route:** `/items`  ·  **Role:** admin, planner  ·  **Priority:** P0

```
╔════════════════════════════════════════════════════════════════════════╗
║ ← Item Master · 10.247 SKU (3.124 active)    [+ Thêm] [⤓ Import Excel]║
╠════════════════════════════════════════════════════════════════════════╣
║ ┌─ Filter bar (sticky) ────────────────────────────────────────────┐  ║
║ │ Tìm (🔍 mã/tên/barcode, không dấu OK) Loại ▼ UoM ▼ Active ▼ [x]│  ║
║ └──────────────────────────────────────────────────────────────────┘  ║
║                                                                        ║
║ ┌──────────────────────────────────────────────────────────────────┐  ║
║ │ ☐ │Mã SKU ↓ │Tên │Loại│UoM│On-hand│ĐVCC│Status   │Actions       │  ║
║ ├───┼─────────┼────┼────┼───┼───────┼────┼─────────┼──────────────┤  ║
║ │ ☐ │RM-0001  │Thép│RAW │ kg│  1.240│NCC1│● Active │[👁][✏][📋]  │  ║
║ │ ☐ │RM-0002  │Nhôm│RAW │ kg│    320│NCC2│● Active │[👁][✏][📋]  │  ║
║ │ ☐ │FB-0045  │Bệ │FAB │pcs│     12│—   │○ Draft  │[👁][✏][📋]  │  ║
║ │ ☐ │SA-0102  │Cụm │SUB │pcs│      8│—   │● Active │[👁][✏][📋]  │  ║
║ │   │ … (virtualized, chỉ render 20 rows visible)                  │  ║
║ │   │                                                               │  ║
║ │ ☐ │FG-0998  │Máy│FG  │pcs│      2│—   │● Active │[👁][✏][📋]  │  ║
║ └──────────────────────────────────────────────────────────────────┘  ║
║                                                                        ║
║ Hiển thị 1–20 / 3.124   [« Trước]  Trang 1 / 157  [Sau »]             ║
║ Đã chọn: 3 mục  [Đổi trạng thái ▼] [Xuất Excel] [Xoá]                 ║
╚════════════════════════════════════════════════════════════════════════╝
```

**Layout logic:**
- Sticky filter bar top (z-30), table fills rest.
- Column pinning: checkbox + Mã SKU (trái), Actions (phải).
- Row height 40px desktop, 56px tablet (tap-friendly).
- Zebra stripes bằng `odd:bg-zebra`.
- Virtualization: `@tanstack/react-virtual` overscan=5.

**Interaction states:**
- Loading: skeleton 20 rows với shimmer.
- Empty (sau filter): "Không tìm thấy SKU nào khớp. [Xoá bộ lọc]".
- Empty (chưa có item): CTA lớn "Import từ Excel" + sample template download.
- Error import: banner `danger` với link download file lỗi (`items_errors.xlsx` có cột "Lý do").

**Breakpoints:**
- Desktop: 8 cột.
- Tablet 768px: ẩn cột UoM, ĐVCC; hiển thị trong accordion mở row.
- Mobile: card stack (ít dùng — không phải hot path).

**Annotations:**
- Search: input có debounce 250ms; normalize NFD + strip diacritics để match "bánh răng" ↔ "banh rang".
- Import wizard: Sheet trượt phải 3 bước (Upload → Preview 100 rows đầu → Confirm async job) + progress bar real-time qua SSE hoặc polling `GET /api/jobs/:id`.
- Barcode column sortable; click icon 📋 copy barcode value.
- Bulk action bar xuất hiện khi `selectedRows > 0`, dùng `Sheet` bottom variant.

---

## 4. BOM Revision Editor — cây multi-level + release

**Route:** `/bom/:templateId/revisions/:revId`  ·  **Role:** planner  ·  **Priority:** P0

```
╔════════════════════════════════════════════════════════════════════════════════════╗
║ ← BOM: Máy tiện CNC-200 / Rev v3 [DRAFT]         [💾 Lưu] [✓ Release] [⋮]        ║
╠═════════════════════════════════╤════════════════════════════════════╤════════════╣
║ TREE (w:320)                    │ EDITOR TABLE (flex-1)              │ INSPECTOR  ║
║ + Add root   [🔍 Tìm]           │ Component lines · 24 rows          │ (w:320)    ║
║                                 │                                    │            ║
║ ▾ CNC-200 (FG)  × qty 1         │ Level │Mã     │Tên │Qty│UoM│Note │ Nút chọn:  ║
║  ├─ ▾ Cụm đầu (SUB) × 1  L2     │   1   │SA-010 │Đầu │1  │pcs│    │ RM-0001    ║
║  │   ├─ RM-0001 Thép × 2kg L3   │   2   │RM-0001│Thép│ 2 │ kg │   │            ║
║  │   ├─ RM-0002 Nhôm × 1kg L3   │   2   │RM-0002│Nhôm│ 1 │ kg │   │ Mã: RM-0001║
║  │   └─ BO-0012 Bulon × 4 L3    │   2   │BO-0012│Bulon│4 │pcs │   │ Tên: Thép  ║
║  ├─ ▸ Cụm thân × 1  L2          │   1   │SA-020 │Thân│1  │pcs│    │ Loại: RAW  ║
║  └─ ▾ Bộ đế × 1  L2             │   1   │SA-030 │Đế  │1  │pcs│    │ On-hand:   ║
║      ├─ SA-040 Chân × 4  L3     │   2   │SA-040 │Chân│4  │pcs│    │  1.240 kg  ║
║      └─ FB-0045 Bệ × 1   L3     │   2   │FB-0045│Bệ  │1  │pcs│    │            ║
║                                 │                                    │ Supplier:  ║
║                                 │ [+ Thêm component]                 │ NCC1 LT7d  ║
║                                 │                                    │            ║
║                                 │ Drag row giữa cây để re-parent     │ [Xoá]      ║
║ Version history:                │                                    │ [Replace…] ║
║ v1 Released 01/03               │                                    │            ║
║ v2 Released 15/03 (active)      │                                    │ Diff vs v2:║
║ v3 DRAFT (current) — Bạn        │                                    │ +2 rows    ║
║                                 │                                    │ ~1 qty ↓   ║
╚═════════════════════════════════╧════════════════════════════════════╧════════════╝
```

**Layout logic:**
- 3-column layout: Tree (320px) | Editor (flex, min 640px) | Inspector (320px).
- Grid template: `grid-cols-bom` từ token `minmax(320px, 1fr) minmax(0, 2fr) minmax(280px, 1fr)`.
- Tree dùng `shadcn Tree` (hoặc `react-arborist` nếu > 200 nodes — virtualize).
- Header 56px sticky, action button primary `Release` chỉ enabled khi `status=DRAFT` và không có validation error.

**Interaction states:**
- Loading: skeleton tree + table rows.
- Empty (BOM mới): placeholder "Bắt đầu thêm component. Drag SKU từ Item Master hoặc click + Thêm".
- Drag/drop: ghost row; khi drop invalid (cycle, level > 5), hiện tooltip đỏ "Không thể đặt tại đây: gây vòng lặp".
- Release confirm: `Dialog` "Revision này sẽ bị **khoá vĩnh viễn**. Mọi đơn hàng tham chiếu revision mới sẽ dùng bản này. Tiếp tục?" + type-to-confirm "RELEASE".
- Save: auto-save draft mỗi 30s (silent), hiện "Đã lưu · 14:23".
- Released state: editor chuyển read-only, background `slate-100`, banner top `info` "Revision đã release 15/03 — chỉ xem. Tạo revision mới để sửa".

**Breakpoints:**
- Chỉ desktop (≥ 1280px). Tablet: redirect "BOM editor chỉ khả dụng trên desktop".

**Annotations:**
- `DndContext` từ `@dnd-kit/core`; draggable row có handle 24×24.
- Validation rule: unique `parent_item_id + component_item_id` per revision; `qty > 0`; không cycle.
- Diff viewer: side-by-side 2 column compare v2 vs v3, highlight add/remove/modify.
- Keyboard: arrow up/down di chuyển selection, Enter vào inspector, Delete xoá (với confirm).

---

## 5. Order Detail + Snapshot Board — % ready từng component

**Route:** `/orders/:id`  ·  **Role:** admin, planner  ·  **Priority:** P0

```
╔════════════════════════════════════════════════════════════════════════════════╗
║ ← Đơn SO-101 · CNC-200 × 2 · Khách ABC Corp · Deadline 20/04/2026  [⋮ Actions]║
╠════════════════════════════════════════════════════════════════════════════════╣
║ ┌─ Summary card row ─────────────────────────────────────────────────────────┐║
║ │ Trạng thái  │ Ready         │ Shortage    │ WO         │ PO                 │║
║ │ In-progress │ 78% ◐ 15/19   │ 4 SKU ⚠     │ 3 (1 done) │ 2 đang đợi nhận   │║
║ └────────────────────────────────────────────────────────────────────────────┘║
║                                                                                 ║
║ Tabs:  [ Snapshot BOM ]  [ Shortage ]  [ PO ]  [ WO ]  [ Audit trail ]        ║
║ ──────────────────────────────────────────────────────────────────────────────║
║                                                                                 ║
║ Snapshot board (bất biến từ Rev v2 tại 03/04 14:22)                           ║
║ ┌────────────────────────────────────────────────────────────────────────────┐║
║ │ Lv│Path          │SKU   │Req │Reserv│On-hand│Short│% Ready    │Status     │║
║ ├───┼──────────────┼──────┼────┼──────┼───────┼─────┼───────────┼───────────┤║
║ │ 1 │/CNC-200/Đầu  │SA-010│ 2  │  2   │   2   │  0  │███████100%│● OK       │║
║ │ 2 │…/Đầu/Thép   │RM-001│ 4kg│  4kg │ 4.2kg │  0  │███████100%│● OK       │║
║ │ 2 │…/Đầu/Nhôm   │RM-002│ 2kg│  2kg │ 0.8kg │1.2kg│████░░░ 40%│⚠ Shortage │║
║ │ 2 │…/Đầu/Bulon  │BO-012│ 8  │  4   │   4   │  0  │███████100%│● OK       │║
║ │ 1 │/CNC-200/Thân│SA-020│ 2  │  0   │   0   │  2  │░░░░░░░  0%│⚡ Missing │║
║ │ 1 │/CNC-200/Đế  │SA-030│ 2  │  2   │   2   │  0  │███████100%│● OK       │║
║ │   │                                                                         │║
║ │   │ Collapsible row — click ▸ để xem sub-level                             │║
║ └────────────────────────────────────────────────────────────────────────────┘║
║                                                                                 ║
║ [⚡ Tạo PO cho shortage]  [🏭 Release WO cho SA-020]  [📥 In picklist]        ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

**Layout logic:**
- Page header 72px (title + action menu), tabs bar 48px sticky, content scroll.
- Summary row: 5 KPI cards, `grid-cols-5`, mỗi card min-w 180px.
- Snapshot table: full-width, hierarchical indent trong cột Path; progress bar inline column "% Ready".
- Banner `info` nếu snapshot đã taken từ revision cũ hơn active: "Snapshot tại Rev v2. Rev v3 đã released 15/04 — cần snapshot lại? [Action]".

**Interaction states:**
- Loading: skeleton cards + 10 rows table.
- Empty (chưa snapshot): banner warning "Đơn chưa có snapshot. [Tạo snapshot từ Rev v3]".
- Error: inline error + retry.
- Success action (PO tạo xong): toast + tab PO badge số tăng.

**Breakpoints:**
- Desktop chính. Tablet: ẩn cột Path, hiện trong tooltip. Mobile: card list thay table.

**Annotations:**
- Progress bar: component `Progress` shadcn, width tính từ `(on_hand + reserved) / required * 100`, cap 100.
- Status badge color: OK `success`, Partial `warning`, Missing `danger`.
- "Tạo PO" mở Sheet với shortage lines pre-filled; user xác nhận supplier per line.
- Snapshot bất biến: nếu user cố sửa → nút disable + tooltip "Snapshot đã khoá — tạo đơn mới nếu cần cập nhật".

---

## 6. Shortage Report — filter theo order/item, drill-down

**Route:** `/shortages`  ·  **Role:** planner  ·  **Priority:** P1

```
╔════════════════════════════════════════════════════════════════════════╗
║ ← Shortage Report · 42 SKU thiếu hụt         [⤓ Excel] [⚡ Tạo PO gộp] ║
╠════════════════════════════════════════════════════════════════════════╣
║ Filter: Theo đơn ▼ [Tất cả]  Theo SKU ▼  Deadline ≤ [ 30/04 ]  [Reset] ║
║                                                                        ║
║ ┌─ Breadcrumb drill ─────────────────────────────────────────────────┐║
║ │ Tất cả đơn › SO-101 › SA-010 (Đầu) › RM-002 (Nhôm)                │║
║ └────────────────────────────────────────────────────────────────────┘║
║                                                                        ║
║ Group by: ● Đơn   ○ SKU   ○ Supplier                                  ║
║                                                                        ║
║ ┌─────────────────────────────────────────────────────────────────┐   ║
║ │▸ SO-101 CNC-200        Deadline 20/04   Short 4 SKU   [Xem]    │   ║
║ │▾ SO-103 Fixture-X      Deadline 25/04   Short 9 SKU            │   ║
║ │    SKU        │Name  │Need │Short │Supplier  │LT  │Action       │   ║
║ │    RM-0045    │Thép S│ 50kg│ 20kg │NCC1      │ 7d │[Tạo PO]    │   ║
║ │    BO-0012    │Bulon │ 120 │ 40   │NCC2      │ 3d │[Tạo PO]    │   ║
║ │    … 7 more                                                     │   ║
║ │▸ SO-098 Jig-Series     Deadline 18/04   Short 1 SKU            │   ║
║ └─────────────────────────────────────────────────────────────────┘   ║
║                                                                        ║
║ Tóm tắt: 42 SKU · 12 đơn · Giá ước tính 125.420.000 ₫                 ║
╚════════════════════════════════════════════════════════════════════════╝
```

**Layout logic:**
- Filter sticky top; breadcrumb drill-down làm context bar.
- Group by radio → re-render grouped list (collapse/expand).
- Footer tóm tắt sticky bottom với số liệu tổng.

**Interaction states:**
- Loading: skeleton 5 groups × 3 rows.
- Empty: "Không có shortage nào — sẵn sàng sản xuất! 🎉" (illustration xanh).
- Filter no match: "Không shortage nào khớp bộ lọc. [Xoá bộ lọc]".

**Breakpoints:**
- Desktop + tablet landscape. Mobile: collapse inner table thành card.

**Annotations:**
- Query backend: `GET /api/orders/:id/shortage` hoặc `GET /api/dashboard/shortages` (gộp).
- "Tạo PO gộp" = gộp tất cả shortage theo supplier → tạo N PO song song.
- Breadcrumb click: nhảy thẳng Item Master hoặc Order Detail.

---

## 7. Receiving Console — tablet-friendly, scan + QC flag

**Route:** `/receiving`  ·  **Role:** warehouse  ·  **Priority:** P0

```
Tablet landscape 1024×768
╔══════════════════════════════════════════════════════════════════════╗
║ ← Nhận hàng · PO-045 · NCC1 · 14:23               [× Thoát]          ║
╠══════════════════════════════════════════════════════════════════════╣
║ ┌─ PO Lines (left 60%) ─────────────┐ ┌─ Scan/Input (right 40%) ─┐  ║
║ │                                   │ │                          │  ║
║ │ ☐ RM-0001 Thép     Order 500kg   │ │  ┌────────────────────┐  │  ║
║ │   Nhận: [___400____] kg           │ │  │                    │  │  ║
║ │   Lô số: (LOT-2604) Exp: (04/27) │ │  │   📷 CAMERA SCAN   │  │  ║
║ │   QC:  ● PASS  ○ FAIL             │ │  │   (full square)    │  │  ║
║ │                                   │ │  │                    │  │  ║
║ │ ☐ RM-0002 Nhôm     Order 200kg   │ │  └────────────────────┘  │  ║
║ │   Nhận: [____________] kg         │ │                          │  ║
║ │   Lô:   (__________)              │ │  Hoặc nhập thủ công:     │  ║
║ │   QC:  ○ PASS  ○ FAIL             │ │  (____________________)  │  ║
║ │                                   │ │  [ Áp dụng ]             │  ║
║ │ ☐ BO-0012 Bulon    Order 1000    │ │                          │  ║
║ │   Nhận: [___________] pcs         │ │  Status: Scanned 1/3     │  ║
║ │   QC:  ○ PASS  ○ FAIL             │ │  Last: RM-0001 ✓         │  ║
║ │                                   │ │                          │  ║
║ └───────────────────────────────────┘ └──────────────────────────┘  ║
║                                                                      ║
║            [Huỷ]                                [✓ Xác nhận nhận]   ║  ← action bar 72px
╚══════════════════════════════════════════════════════════════════════╝
```

**Layout logic:**
- Split 60/40: PO lines list (scrollable) | Scan/input panel (sticky).
- Camera preview `aspect-square` 400×400, hiển thị reticle đỏ khung quét.
- Mỗi line card: SKU info + qty input + lot + QC radio. Card focus khi vừa scan trúng SKU.
- Bottom action bar 72px sticky `border-t slate-200`, primary button full-width right `w-[280px]`.

**Interaction states:**
- Loading: skeleton 3 cards + camera placeholder.
- Scan success: beep 880Hz + flash border `success` + auto-scroll tới line + focus qty input.
- Scan fail (SKU không thuộc PO): beep 220Hz + shake + toast "SKU này không có trong PO-045".
- Scan duplicate: toast warning "Đã scan SKU này rồi — cập nhật qty thêm?".
- Error (network): input vẫn nhận, queue offline; header hiện "⚠ Offline · 2 scan chờ".

**Breakpoints:**
- 1024×768 chính (tablet landscape).
- Desktop: cùng layout, camera có thể thay bằng USB scanner (keyboard wedge input).

**Annotations:**
- Touch target 48px cho radio QC, input number, checkbox line.
- Barcode scanner: abstraction `BarcodeScanner` (wrap html5-qrcode), manual input dự phòng.
- QC radio: nếu FAIL bắt buộc nhập `reason` (textarea) trước khi confirm.
- Confirm: Dialog "Xác nhận nhận: 3 SKU, tổng 400 + 0 + 0 = ... . Tạo 1 inbound_receipt + 3 inventory_txn IN. Tiếp tục?"

---

## 8. PWA Picklist + Scan Station — tablet Android offline-first

**Route:** `/pwa/pick/:assemblyId`  ·  **Role:** operator  ·  **Priority:** P0 (hot path)

```
Tablet portrait 768×1024 (PWA fullscreen)
╔══════════════════════════════════════════╗
║ ← WO-012 · SA-010 Đầu × 2        [≡]    ║  ← Top 56px · brand bg
╠══════════════════════════════════════════╣
║  📶 Offline · 3 scan chờ sync ●3        ║  ← Status strip 40px (warning bg nếu offline)
╠══════════════════════════════════════════╣
║                                          ║
║  Picklist · 4/8 hoàn thành               ║
║  ┌─────────────────────────────────────┐║
║  │ ✓ RM-0001 Thép       2kg  Bin A-01 │║
║  │ ✓ RM-0002 Nhôm       1kg  Bin A-02 │║
║  │ ✓ BO-0012 Bulon      4pcs Bin C-08 │║
║  │ ✓ BO-0015 Ốc vít     8pcs Bin C-09 │║
║  │ ● BO-0020 Vòng đệm   4pcs Bin C-10 │║  ← current, highlight cta soft
║  │ ○ SA-010A Lõi        1pcs Bin B-05 │║
║  │ ○ FB-0031 Vỏ trên    1pcs Bin B-06 │║
║  │ ○ FB-0032 Vỏ dưới    1pcs Bin B-07 │║
║  └─────────────────────────────────────┘║
║                                          ║
║  ┌─ Scan pad (sticky bottom 60%) ─────┐ ║
║  │                                    │ ║
║  │   ┌──────────────────────────┐    │ ║
║  │   │                          │    │ ║
║  │   │   📷 CAMERA SCAN         │    │ ║
║  │   │   reticle 320×320        │    │ ║
║  │   │                          │    │ ║
║  │   └──────────────────────────┘    │ ║
║  │                                    │ ║
║  │   Hướng mã vạch vào khung          │ ║
║  │                                    │ ║
║  │   Hoặc nhập: (______________) [↵] │ ║
║  │                                    │ ║
║  └────────────────────────────────────┘ ║
║                                          ║
║  [ Hoàn thành assembly → ] (disabled    ║  ← enable khi 8/8
║   tới khi 100%)                         ║
╚══════════════════════════════════════════╝
```

**Layout logic:**
- Full-screen PWA (no browser chrome), fixed viewport.
- 3 vùng: header 56px · status strip 40px (visible khi offline hoặc có queue) · content scroll · scan pad sticky bottom (60% height).
- Picklist: row 56px tap-friendly, check icon trái, text scale-sm để fit nhiều row.
- Current item highlight `bg-cta/10 border-l-4 border-cta`.
- Scan pad: camera chiếm 70% pad, input fallback 30%.

**Interaction states:**
- Loading: skeleton 8 rows + camera placeholder.
- Empty (assembly chưa có pick task): "Không có picklist — WO chưa release?".
- Scan success: haptic vibrate 50ms + beep 880Hz + flash green overlay camera 200ms + row tick + auto-scroll next row.
- Scan wrong SKU: haptic pattern (50-100-50) + beep 220Hz + toast sticky "Không phải SKU cần pick! Cần: {{expected}}. Bạn scan: {{scanned}}".
- Offline: badge "●3" đếm queue; tap badge mở Sheet "3 scan chờ sync" liệt kê với timestamp; có nút "Retry sync ngay".
- Sync complete: toast `success` "Đã đồng bộ 3 scan".
- Duplicate: toast "Đã scan SKU này (offline_queue_id: xxx) — bỏ qua".
- Complete: nút "Hoàn thành" enable; tap → full-screen confetti nhẹ (200ms) + sinh FG serial → redirect `/pwa/done/:id`.

**Breakpoints:**
- 768px portrait (chính tablet Android).
- 1024px landscape: scan pad bên phải 50%, picklist bên trái 50%.
- Mobile 375px: fallback (không khuyến nghị dùng).

**Annotations:**
- `next-pwa` + service worker; `Workbox` strategy: NetworkFirst cho picklist JSON, CacheFirst cho static.
- Dexie.js table `scan_queue` với columns: `offline_queue_id (uuid)`, `assembly_id`, `sku`, `scanned_at`, `status (pending|synced|error)`.
- Background Sync: `registerSync('scan-flush')`; worker gọi `POST /api/assembly/scans/batch` với array queued; idempotency key = `offline_queue_id`.
- Barcode scanner lib: `html5-qrcode` wrap trong `BarcodeScanner` component với interface `onDetect(value: string)`.
- Haptic: `navigator.vibrate()`; beep: Web Audio API `OscillatorNode`.
- Persist camera permission; lazy load camera chỉ khi route active (tiết kiệm pin).
- Install prompt A2HS hiển thị lần đầu login.
- Tap target mọi nút 48×48 min; input height 56 px.

---

## Phụ lục: Navigation Map (V1)

```
Root
├─ /login
├─ / (Dashboard)
├─ /items
│   └─ /items/:id  (edit sheet)
├─ /bom
│   └─ /bom/:templateId/revisions/:revId
├─ /orders
│   ├─ /orders/new
│   └─ /orders/:id
├─ /shortages
├─ /purchase-orders
│   ├─ /purchase-orders/new
│   └─ /purchase-orders/:id
├─ /receiving
│   └─ /receiving/:poId
├─ /work-orders
│   └─ /work-orders/:id
├─ /pwa
│   ├─ /pwa/pick/:assemblyId
│   ├─ /pwa/scan
│   └─ /pwa/done/:id
├─ /audit
├─ /tv (kiosk dashboard)
└─ /admin
    ├─ /admin/users
    └─ /admin/roles
```

---

## Handoff to Developer

1. Đọc `docs/design-guidelines.md` trước khi code UI.
2. Copy `tailwind.config.ts` snippet vào repo.
3. Cài shadcn/ui: `npx shadcn-ui@latest init` → theme custom theo palette trên.
4. Cài font: `next/font/google` import `Inter`, `Be_Vietnam_Pro`, `JetBrains_Mono` với `subsets: ['vietnamese']`.
5. Mỗi màn dùng wireframe này làm blueprint, sinh page skeleton trước, logic sau.
6. Accessibility audit bằng axe DevTools + Lighthouse ≥ 95 trước khi merge.

---

*End of wireframes. Version control via git — update khi V1.1 thêm màn.*
