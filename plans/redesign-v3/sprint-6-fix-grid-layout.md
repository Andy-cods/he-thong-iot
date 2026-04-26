# Sprint 6 — Fix BOM Grid Layout (Multi-Sheet UX)

> Brainstorm + plan fix cho trang `/bom/[id]/grid` sau khi user upload BOM thực
> tế (Z0000002-502653 / Z0000002-502654 _BANG TAI DIPPING_) lên production
> mes.songchau.vn. User feedback: **"mọi thứ cực kì xấu và loạn lên luôn rồi"**.
>
> Ngày: 2026-04-26 · Owner: Solution Brainstormer · Status: DRAFT (chờ user
> chốt Q1-Q5).

---

## 1. Tóm tắt 5 dòng

1. **Vấn đề:** trang BOM grid render 82 lines từ 2 sheet PROJECT chồng nhau,
   header mất sticky, cột tràn nội dung, bottom panel chồng vào sidebar trái
   khiến user thấy "loạn".
2. **Root cause chính:** `loadTree(templateId)` ở
   `apps/web/src/server/repos/bomTemplates.ts:256` KHÔNG nhận `sheetId` →
   page `bom/[id]/grid/page.tsx:54` gọi `useBomTree(id)` standalone, lấy hết
   bom_lines của template (bỏ qua `activeSheetId` đã có ở UI).
3. **Fix approach:** đường ngắn nhất — backend `loadTree(templateId, sheetId?)`,
   API route accept `?sheetId=`, hook `useBomTree(id, sheetId)`, page truyền
   `activeSheetId`. Kèm 4 fix CSS nhỏ (sticky header, truncate cột, z-index
   bottom panel, layout) tổng ≤6h.
4. **Risk:** breaking change `useBomTree` signature → grep call sites; cache
   key TanStack Query phải include `sheetId` để switch tab không stale; BOM
   cũ (sheet_id từ backfill 0028) vẫn render được vì sheet_id NOT NULL đã
   backfill 1 PROJECT default.
5. **Next step:** user trả Q1-Q5 (cache strategy, 14-cột, import mapping,
   bottom z-index, header sticky), sau đó cook 5 subtask theo bảng §7.

---

## 2. Phân tích 7 issues từ screenshots

### Issue 1 — Headers misplaced (xuất hiện giữa bảng)

- **Mô tả:** Hàng header `# ẢNH MÃ LINH KIỆN ...` không sticky top mà nằm
  giữa rows (rơi vào row 6-7 trong screenshot 1).
- **Root cause:** `BomGridPro.tsx:536` `<thead className="sticky top-0 z-20">`
  với `border-separate border-spacing-0` — sticky thead **không hoạt động**
  với `border-separate` trong nhiều browser (đặc biệt khi parent dùng
  `overflow-auto` lồng trong flex container). Đây là Chromium quirk đã biết.
- **Severity:** P1 (visual blocker — user không biết cột nào là cột nào).
- **Fix approach:** đổi sang `border-collapse` HOẶC dùng kỹ thuật sticky trên
  `<th>` (mỗi `<th>` set `position: sticky; top: 0; z-index: 20`) thay vì trên
  `<thead>`. KISS: chọn cách 2, ít rủi ro hơn. Cũng cần đảm bảo
  `parentRef` `overflow-auto` là scroll container duy nhất (page wrapper
  không được scroll).

### Issue 2 — Duplicate rows (cùng SKU xuất hiện nhiều lần)

- **Mô tả:** SKU "SUS304 → đổi sang AL6061" và nhiều dòng khác xuất hiện 2
  lần. Lý do: backend trả 82 lines (41 từ Sheet 1 + 41 từ Sheet 2) gộp lại.
- **Root cause:** `apps/web/src/server/repos/bomTemplates.ts:256` —
  `loadTree(templateId)` query `WHERE l.template_id = ${templateId} AND
  l.parent_line_id IS NULL` KHÔNG có filter `sheet_id`. Tất cả call sites
  (`tree/route.ts:19`, `useBomTree:154`, `grid/page.tsx:54`) cũng không truyền
  sheet.
- **Severity:** P0 (blocking — user không thể tin grid).
- **Fix approach:** thêm param `sheetId` xuyên suốt (xem §3 Phương án Y1).

### Issue 3 — Columns overflow (text tràn cột)

- **Mô tả:** Text "Vòng bi B6203ZZ → đổi sang C-E6203ZZ" trong cột TÊN/MÔ TẢ
  width `w-[200px]` tràn sang cột kế bên.
- **Root cause:** `BomGridPro.tsx:422` cell có class `truncate` nhưng `<td>`
  cần `max-w-[200px]` + `overflow-hidden` + `text-overflow: ellipsis` mới
  truncate đúng trong table layout. Hiện chỉ có `w-[200px]` (set width prefer
  nhưng không enforce); thêm vào đó `<table className="w-full">` không có
  `table-fixed` → browser tự auto-layout, columns co dãn theo content.
- **Severity:** P1 (visual blocker).
- **Fix approach:** đổi `<table>` sang `table-fixed`, set `<colgroup>` width
  cụ thể, `<td>` thêm `max-w-0` + `truncate` để CSS hợp tác. KHÔNG mở rộng
  columns.

### Issue 4 — Cột "LOẠI" và "VẬT LIỆU" duplicated values

- **Mô tả:** cả 2 cột đều show "TT", "GTAM", "Vitech" — tức cùng dữ liệu.
- **Root cause giả thuyết:** cột "LOẠI" render `KindDropdown` đọc
  `metadata.kind` (com/fab) — nếu importer set `metadata.kind` = NCC code
  hoặc `category` thay vì "com"/"fab" thì dropdown show NCC. Cột "VẬT LIỆU"
  render `row.node.componentCategory` (`item.category`). Khả năng 2: importer
  set cả `item.category` = supplier code (do mapping sai header
  "Nhà cung cấp" → category) khiến cả Loại và Vật liệu cùng giá trị.
- **Severity:** P1 (data integrity).
- **Fix approach:** kiểm tra log import thực tế của BOM
  `7a7b0ba0-...` qua psql → SELECT category, supplier_item_code, metadata FROM
  bom_line + item. Sau đó: (a) nếu mapping sai trong importer → fix
  `bomImportParser.ts` synonym dict; (b) nếu data đã sai trong DB → migration
  cleanup hoặc re-import. Ưu tiên (a) trước, (b) chỉ làm khi user xác nhận
  cần dùng tiếp BOM cụ thể này (KISS).

### Issue 5 — Status column "Chưa mua" + thanh ngang vàng lệch

- **Mô tả:** badge "Chưa mua" kèm progress bar màu vàng nhưng layout chưa
  căn lề (text + bar không cùng baseline).
- **Root cause:** `ProgressCell` render badge + bar 2 dòng, cell width
  `w-[150px]` chật. Khi virtualize row height fixed 36px, bar overflow
  vertical bị cắt.
- **Severity:** P2 (polish).
- **Fix approach:** giảm bar height từ ~6px xuống 4px, badge cùng dòng với
  pct text, padding cell `px-2` thay vì `px-0`. Defer nếu hết giờ.

### Issue 6 — Sidebar chồng lên grid (z-index conflict)

- **Mô tả:** Section "Yêu cầu mua | Nhập Excel | Bộ phận Kế toán | Kế toán
  | Quản trị" (Sidebar trái) overlap với "Đơn hàng | Lệnh SX | Mua sắm |
  Thiếu hàng | ECO | Lắp ráp" (BottomPanel tab bar).
- **Root cause:**
  `apps/web/src/components/layout/AppShell.tsx:87` — `<div className="flex
  min-h-screen">` với `<Sidebar>` `relative z-sidebar` và main column
  `flex-1`. Khi BomGridPage render `<div className="flex h-full min-h-0
  flex-1 flex-col overflow-hidden">` rồi cuối cùng `<BottomPanel>` `shrink-0`
  → bottom panel theo flex column nằm dưới grid.
  Vấn đề thực sự: `min-h-screen` trên AppShell + `overflow-hidden` không
  propagate đúng → khi viewport thấp (laptop 13"), grid scroll vô tận, bottom
  panel bị render TRÊN sidebar (do z-sidebar < z-bottom-panel hoặc do absolute
  positioning ngầm). Cũng có khả năng `BomSheetTabs` + `BomWorkspaceTopbar`
  tổng chiều cao vượt viewport, đẩy bottom panel "đè" vào vùng sidebar.
- **Severity:** P0 (blocking — user không click được tab nào).
- **Fix approach:** AppShell main column phải `min-h-0` để flex con tôn
  trọng; BottomPanel set `relative z-30 shrink-0` rõ ràng; verify
  Sidebar không có position absolute leak. Kiểm tra trên viewport
  900px height (laptop tiêu chuẩn).

### Issue 7 — Bottom panel collapsed/expanded confusing

- **Mô tả:** State expand/collapse không rõ — user không biết click tab có
  mở panel hay không.
- **Root cause:** `BottomPanel.tsx:88` — `panelHeight = collapsed ? 36 :
  Math.max(120, height)`. Khi collapsed thấy 36px chỉ tab bar; khi expanded
  120px+. Visual cue (chevron up/down) nhỏ, user dễ miss. Với screen height
  thấp + grid overflow + sidebar overlap → state confusing.
- **Severity:** P2 (polish, nhưng liên quan Issue 6).
- **Fix approach:** sau khi fix Issue 6, BottomPanel default collapsed (36px)
  + thêm divider rõ; click tab → auto-expand. Đã có logic, chỉ cần test.

---

## 3. 3 phương án fix multi-sheet rendering (Issues 1+2)

### Phương án Y1 — Filter tree theo `activeSheetId` (backend + frontend)

**Mô tả:**

- Backend `loadTree(templateId, sheetId?: string)` thêm điều kiện `AND
  l.sheet_id = ${sheetId}` vào CTE root khi `sheetId` truyền vào.
- API `GET /api/bom/templates/[id]/tree?sheetId=<uuid>` accept query param.
- Hook `useBomTree(id, sheetId?)` đưa `sheetId` vào query key và URL.
- Page `grid/page.tsx` truyền `activeSheetId` xuống hook; component
  `BomGridPro` chỉ render lines của 1 sheet đang active.
- Khi user switch tab Sheet 1 → Sheet 2 → TanStack Query re-fetch (hoặc
  serve từ cache nếu đã prefetch).

**Pros:**

- Phù hợp với UX hiện tại (user đã có tab bar — Sheet 1 active thì grid chỉ
  show Sheet 1).
- Tải nhẹ: chỉ fetch 41 lines / sheet thay vì 82+.
- Tận dụng cache TanStack: switch tab → cache hit, không re-fetch.
- Phù hợp tương lai (BOM 5 sheet × 200 lines — không nên render 1000 cùng
  lúc).
- Thay đổi ít file, KISS.

**Cons:**

- Cache key đổi → toàn bộ `qk.bom.tree(id)` invalidation hiện tại phải
  update để invalidate per-sheet (hoặc invalidate tất cả tree của template
  bằng prefix match — TanStack hỗ trợ).
- Mutation `useAddBomLine` / `useUpdateBomLine` / `useMoveBomLine` invalidate
  theo `qk.bom.tree(templateId)` — phải đổi sang prefix `["bom", "tree", id]`
  để invalid mọi sheet.

**Effort:** ~2h.

---

### Phương án Y2 — Render 2 grid riêng biệt cho 2 sheet PROJECT

**Mô tả:**

- Backend giữ nguyên `loadTree(templateId)` trả 82 lines.
- Frontend group lines client-side theo `sheetId`.
- Render N `<BomGridPro>` instances, mỗi sheet 1 instance (vertical stack
  hoặc accordion).

**Pros:**

- Backend không đổi.
- User thấy đồng thời 2 sheet, tiện so sánh.

**Cons:**

- KHÔNG dùng tab bar UI hiện tại → vô dụng `activeSheetId`.
- 2 grid mỗi grid có sticky header riêng → 2 sticky overlap khi scroll.
- Performance kém với BOM lớn (5 sheet × 200 lines = render 1000 row trong
  5 instances → flicker).
- Mỗi BomGridPro có virtualizer riêng → bug scroll position.
- Không phù hợp với UX user đã expect (tab bar).

**Effort:** ~3h. **Loại.**

---

### Phương án Y3 — Single grid + cột Sheet badge

**Mô tả:**

- Render full 82 lines, thêm cột mới "Sheet" với badge màu (Sheet 1 indigo,
  Sheet 2 emerald).
- Tab bar trở thành filter UI (click Sheet 1 → frontend filter visibleRows).

**Pros:**

- Fix duplicate rows visual (user phân biệt được sheet).
- Có thể search/filter cross-sheet (vd "tìm SUS304 trong cả 2 sheet").

**Cons:**

- 14 cột → 15 cột càng chật.
- Không scale với BOM 5+ sheet.
- Vẫn fetch 82 lines mỗi load.
- Sticky header lỗi vẫn còn (issue 1).
- Tab bar hiện tại đã là switcher per-sheet → đổi thành filter là UX
  regression.

**Effort:** ~2.5h. **Loại.**

---

### KHUYẾN NGHỊ: **Phương án Y1** — Filter tree theo `activeSheetId`

**Lý do:**

1. Đồng nhất với mental model: 1 tab = 1 sheet = 1 grid view.
2. Performance scale tốt với BOM lớn (chỉ fetch lines của sheet đang xem).
3. Code change tập trung 4 file (loadTree, route, hook, page) + invalidation
   cache mutation hooks (3 hook).
4. Backward compat: BOM cũ đã có sheet_id NOT NULL từ migration 0028 →
   backfill 1 PROJECT default. Page render PROJECT đầu tiên = behavior cũ.
5. KISS / YAGNI: không cần multi-grid stack hay filter UI mới.

---

## 4. Quyết định cần chốt (Q1-Q5)

### Q1 — Cache strategy khi switch tab

> Khi user switch tab Sheet 1 → Sheet 2, có nên cache tree query per-sheet
> (mỗi sheetId 1 cache entry) hay re-fetch mỗi lần?

**Đề xuất default:** Cache per-sheet bằng query key
`qk.bom.tree(templateId, sheetId)` với `staleTime: 5_000`. Switch tab lần đầu
fetch, lần 2 trở đi (trong 5s) cache hit. Mutation invalidate prefix
`["bom", "tree", templateId]` để cover all sheets.

**Tradeoff:** memory tăng (N sheet × tree size) — chấp nhận, 1 BOM hiếm khi
> 10 sheet.

---

### Q2 — BomGridPro 14 columns vẫn dùng được hay refactor

> 14 cột (#, ẢNH, MÃ, TÊN, LOẠI, VẬT LIỆU, NCC, SL/BỘ, KÍCH THƯỚC, TỔNG SL,
> HAO HỤT, TIẾN ĐỘ, GHI CHÚ, THAO TÁC) có chật cho viewport 1280px không?

**Đề xuất default:** Giữ 14 cột (V1 contract đã chốt với user). Fix
overflow bằng `table-fixed` + `truncate` đúng (Issue 3). KHÔNG thêm dropdown
columns visibility (over-engineer cho V2 — defer Sprint 7).

**Cảnh báo:** nếu user tự confirm 14 cột là tối thiểu → ok. Nếu user OK gộp
"VẬT LIỆU" + "NCC" thành 1 cột "Nguồn cung" → bớt 1 cột → mỗi cột rộng hơn
~100px. Hỏi user.

---

### Q3 — Cột "LOẠI" / "VẬT LIỆU" duplicated

> Có phải import script mapping sai (NCC → category)? Cần migration cleanup
> hay update import script?

**Đề xuất default:** **Update import script** — kiểm tra
`bomImportParser.ts` synonym dict, đảm bảo "Nhà cung cấp" / "Supplier" map
sang `supplierItemCode` (đã đúng từ line 423-432) — chứ không leak sang
`category`. Nếu DB đã có data sai → bỏ và re-import từ file Excel "Bản chính
thức" (user vừa upload). KHÔNG migration cleanup phức tạp.

**Risk:** nếu BOM `7a7b0ba0-...` đã có Order/WO link vào lines → re-import
phải clone → migration tedious. Chấp nhận xoá BOM nếu user OK (môi trường
test).

---

### Q4 — Bottom panel z-index conflict

> Fix CSS hay restructure layout?

**Đề xuất default:** Fix CSS — thêm `min-h-0` cho main column trong AppShell,
`relative z-30` cho BottomPanel, verify trên viewport 900px height. KHÔNG
restructure (over-engineer). Nếu fix CSS không giải quyết được, restructure
sang grid CSS thay flex (Sprint 7).

---

### Q5 — Header sticky lỗi

> Virtualization issue hay CSS issue?

**Đề xuất default:** CSS issue — `border-separate` quirk với sticky thead.
Fix bằng cách chuyển sticky lên `<th>` từng cell (đã tested ở các lib khác,
vd TanStack Table examples). Không liên quan tới virtualizer (virtualizer
chỉ render `<tbody>`, thead nằm ngoài).

---

## 5. Schema / code change cần thiết (concrete diff)

### 5.1 Backend — `loadTree` accept sheetId

**File:** `apps/web/src/server/repos/bomTemplates.ts:256`

```ts
// BEFORE
export async function loadTree(templateId: string): Promise<BomTreeNode[]> {
  const rows = await db.execute(sql`
    WITH RECURSIVE tree AS (
      SELECT l.*, 1::int AS depth
      FROM app.bom_line l
      WHERE l.template_id = ${templateId} AND l.parent_line_id IS NULL
      ...
```

```ts
// AFTER
export async function loadTree(
  templateId: string,
  sheetId?: string,
): Promise<BomTreeNode[]> {
  const rows = await db.execute(sql`
    WITH RECURSIVE tree AS (
      SELECT l.*, 1::int AS depth
      FROM app.bom_line l
      WHERE l.template_id = ${templateId}
        AND l.parent_line_id IS NULL
        ${sheetId ? sql`AND l.sheet_id = ${sheetId}` : sql``}
      UNION ALL
      SELECT l.*, t.depth + 1
      FROM app.bom_line l
      INNER JOIN tree t ON l.parent_line_id = t.id
      WHERE t.depth < 5
        ${sheetId ? sql`AND l.sheet_id = ${sheetId}` : sql``}
      ...
```

**Lý do `sheetId` cũng filter ở recursive part:** an toàn khi children có
sheet_id khác parent (thực tế không xảy ra do invariant — nhưng phòng case
import sai). Có thể bỏ nếu user xác nhận invariant chặt.

---

### 5.2 API route — accept `?sheetId=`

**File:** `apps/web/src/app/api/bom/templates/[id]/tree/route.ts`

```ts
// BEFORE
export async function GET(req, { params }) {
  ...
  const tree = await loadTree(params.id);
  return NextResponse.json({ data: { tree } });
}

// AFTER
export async function GET(req, { params }) {
  ...
  const sheetId = req.nextUrl.searchParams.get("sheetId") ?? undefined;
  const tree = await loadTree(params.id, sheetId);
  return NextResponse.json({ data: { tree } });
}
```

---

### 5.3 Frontend hook — `useBomTree(id, sheetId?)`

**File:** `apps/web/src/hooks/useBom.ts:154`

```ts
// BEFORE
export function useBomTree(id: string | null) {
  return useQuery({
    queryKey: id ? qk.bom.tree(id) : ["bom", "tree", "__none__"],
    queryFn: () => request(`/api/bom/templates/${id}/tree`),
    enabled: !!id,
    staleTime: 5_000,
  });
}

// AFTER
export function useBomTree(
  id: string | null,
  sheetId?: string | null,
) {
  return useQuery({
    queryKey: id
      ? sheetId
        ? [...qk.bom.tree(id), sheetId]
        : qk.bom.tree(id)
      : ["bom", "tree", "__none__"],
    queryFn: () => {
      const qs = sheetId ? `?sheetId=${encodeURIComponent(sheetId)}` : "";
      return request(`/api/bom/templates/${id}/tree${qs}`);
    },
    enabled: !!id,
    staleTime: 5_000,
  });
}
```

**Side-effect:** `useAddBomLine`, `useUpdateBomLine`, `useDeleteBomLine`,
`useMoveBomLine` invalidate `qk.bom.tree(templateId)` — TanStack mặc định
prefix match (key `["bom", "tree", id]` invalidate cả `["bom", "tree", id,
sheetId]`). Đã OK, không cần đổi.

---

### 5.4 Page — pass `activeSheetId`

**File:** `apps/web/src/app/(app)/bom/[id]/grid/page.tsx:54`

```ts
// BEFORE
const treeQuery = useBomTree(id);

// AFTER (sau khi sheets load + activeSheetId set)
const treeQuery = useBomTree(id, activeSheetId);
```

**Note:** thứ tự khởi tạo:

1. Line 69-70: `sheets` load.
2. Line 71: `activeSheetId` ban đầu null → `treeQuery` enabled = true nhưng
   key dùng `qk.bom.tree(id)` (không sheetId) → vẫn fetch all (legacy).
3. Line 75-82: useEffect set `activeSheetId` = first PROJECT.
4. Re-render: `treeQuery` key = `["bom", "tree", id, sheetId]` → fetch
   filtered.

**Improvement:** thêm guard `enabled: !!id && !!activeSheetId` — KHÔNG fetch
khi chưa có sheet active để tránh request thừa. Cần update hook signature
(optional flag).

---

### 5.5 BomGridPro — text truncate columns

**File:** `apps/web/src/components/bom-grid-pro/BomGridPro.tsx:535`

```tsx
// BEFORE
<table className="w-full border-separate border-spacing-0 text-sm">
  <thead className="sticky top-0 z-20 bg-zinc-50/95 backdrop-blur-sm">
    ...

// AFTER
<table className="w-full table-fixed border-collapse text-sm">
  <colgroup>
    <col style={{ width: "40px" }} />   {/* # */}
    <col style={{ width: "52px" }} />   {/* Ảnh */}
    <col style={{ width: "170px" }} />  {/* Mã SKU */}
    <col style={{ width: "200px" }} />  {/* Tên */}
    <col style={{ width: "150px" }} />  {/* Loại */}
    <col style={{ width: "140px" }} />  {/* Vật liệu */}
    <col style={{ width: "110px" }} />  {/* NCC */}
    <col style={{ width: "72px" }} />   {/* SL/bộ */}
    <col style={{ width: "110px" }} />  {/* Kích thước */}
    <col style={{ width: "70px" }} />   {/* Tổng SL */}
    <col style={{ width: "80px" }} />   {/* Hao hụt */}
    <col style={{ width: "150px" }} />  {/* Tiến độ */}
    <col style={{ width: "180px" }} />  {/* Ghi chú */}
    <col style={{ width: "100px" }} />  {/* Actions */}
  </colgroup>
  <thead>
    <tr className="...">
      <th className="sticky top-0 z-20 bg-zinc-50 ...">#</th>
      ... (mỗi th có sticky top-0 z-20 riêng)
```

**Ngoài ra:** mỗi `<td>` text-content thêm `max-w-0 truncate` để CSS
ellipsis hoạt động trong table-fixed. `<td>` Mã SKU đã có `truncate` —
ok khi đổi sang `table-fixed`.

---

### 5.6 Bottom panel z-index + AppShell layout

**File:** `apps/web/src/components/bom-workspace/BottomPanel.tsx:91`

```tsx
// BEFORE
<div className="flex shrink-0 flex-col border-t border-zinc-200 bg-white"
     style={{ height: `${panelHeight}px` }}>

// AFTER
<div className="relative z-30 flex shrink-0 flex-col border-t border-zinc-200 bg-white"
     style={{ height: `${panelHeight}px` }}>
```

**File:** `apps/web/src/components/layout/AppShell.tsx:127`

```tsx
// BEFORE (workspace mode)
<main id="main" className={
  isWorkspace ? "flex-1 overflow-hidden" : ...
}>

// AFTER
<main id="main" className={
  isWorkspace ? "flex min-h-0 flex-1 flex-col overflow-hidden" : ...
}>
```

`min-h-0` rất quan trọng — flex children mặc định `min-height: auto`, làm
inner flex column không tôn trọng parent height → bottom panel "đè" lên.

---

### 5.7 Cleanup import column mapping (Issue 4)

**Step 1 — Verify on production DB:**

```sql
SELECT i.sku, i.name, i.category, l.supplier_item_code, l.metadata->>'kind'
FROM app.bom_line l
JOIN app.item i ON i.id = l.component_item_id
WHERE l.template_id = '7a7b0ba0-8ed6-4a6f-94bc-78d735f54d8c'
LIMIT 20;
```

**Step 2 — Tuỳ kết quả:**

- Nếu `i.category = supplier_item_code` (cùng giá trị) → import script đã
  set `item.category` sai → fix `excelImport.ts:12` mapping.
- Nếu `metadata.kind` chứa NCC code thay vì "com"/"fab" →
  `KindDropdown` đọc sai → fix logic `metadata.kind` set ở importer.

**Action:** delegate cho `debugger` agent verify trên prod psql, sau đó
hardcode fix trong `bomImportParser.ts`.

---

## 6. UI mock fixed (ASCII desktop, viewport 1440×900)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Sidebar 220px   │ TopBar 44px (search · user · ...)                                       │
│ ─────────────── │─────────────────────────────────────────────────────────────────────────│
│ Sản xuất        │ BomWorkspaceTopbar h-12 (BOM-2026-04 / BANG TAI DIPPING · status pill)  │
│   • Đơn hàng    │ ───────────────────────────────────────────────────────────────────────│
│   • Lệnh SX     │ Sheet tabs h-9                                                          │
│   • Lắp ráp     │ ┌───────────────┬───────────────┬─────────┬─────────┬──┐                │
│ Kho & Mua sắm   │ │•FT Sheet 1·41│ FT Sheet 2·41 │ Beaker M·3 │ Layers P·4│+ Thêm sheet │ │
│   • Vật tư      │ └───────────────┴───────────────┴─────────┴─────────┴──┘                │
│   • BOM         │ ───────────────────────────────────────────────────────────────────────│
│   • Yêu cầu mua │ BomGridPro (Sheet 1 41 lines, sticky header)                            │
│   • PO          │ ┌─#─┬Ảnh┬Mã SKU──────┬Tên / Mô tả────────┬Loại────┬Vật liệu┬NCC─────┬...│
│   • Nhập Excel  │ │ 1 │   │SKU-001…    │Vòng bi B6203ZZ →… │ com    │ SUS304 │ TT     │...│
│ Khác            │ │ 2 │   │SKU-002…    │Bạc đạn 8x16…      │ fab    │ POM    │ Vitech │...│
│   • Kế toán     │ │ 3 │   │…           │…                  │ com    │ AL6061 │ GTAM   │...│
│   • Quản trị    │ │…  │   │            │                   │        │        │        │   │
│                 │ └───┴───┴────────────┴───────────────────┴────────┴────────┴────────┴...│
│                 │ ───────────────────────────────────────────────────────────────────────│
│                 │ BottomPanel h-9 collapsed (z-30, không overlap sidebar)                 │
│                 │ Đơn hàng·5 │ Lệnh SX·3 │ Mua sắm·— │ Thiếu·2 │ ECO·— │ Lắp ráp·1     ▲ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Mobile (≤768px):**

- Sidebar slide-in drawer (touch hamburger).
- BomGridPro horizontal scroll (table-fixed giữ width tổng ~1400px).
- Cột priority hide: KÍCH THƯỚC, HAO HỤT, GHI CHÚ → hide. Chỉ show #, Mã,
  Tên, Tiến độ, Actions (5 cột).

---

## 7. Roadmap fix (≤6h)

| # | Subtask                                              | Estimate | DoD                                                                              |
|---|------------------------------------------------------|----------|----------------------------------------------------------------------------------|
| 1 | Backend filter tree by sheetId                        | 1h       | API `GET /api/bom/templates/[id]/tree?sheetId=X` trả lines đúng sheet (curl test) |
| 2 | Frontend pass activeSheetId qua hook + page          | 1h       | Switch tab → tree update; cache key có sheetId; mutation invalidate hoạt động    |
| 3 | BomGridPro `table-fixed` + colgroup + sticky `<th>`  | 1.5h     | Visual không overflow, header sticky giữ top khi scroll, trên viewport 1280×900   |
| 4 | Bottom panel z-30 + AppShell `min-h-0`               | 0.5h     | Sidebar không overlap với tab bar bottom; verify viewport 900px height            |
| 5 | Cleanup column mapping (LOẠI / VẬT LIỆU)             | 1h       | Re-import BOM mới qua import script → 2 cột không duplicate value                |
| 6 | Test e2e + screenshot regression                     | 1h       | User load `/bom/<id>/grid` → 4 issue P0/P1 ổn; chụp screenshot so sánh           |
|   | **Tổng**                                             | **6h**   |                                                                                  |

**Order suggest:** 1 → 2 → 4 → 3 → 5 → 6. (Backend trước để FE không block;
Issue 6 z-index dễ → quick win; Issue 3 table-fixed phức tạp nhất nên làm
sau khi data đã đúng.)

---

## 8. Câu hỏi user trả lời (1-2 câu mỗi câu)

> **Q1 — Cache:** Switch tab Sheet 1 ↔ Sheet 2 cần real-time fresh data
> hay 5s cache OK?
> **Default:** 5s cache, không re-fetch nếu user clicker tab nhanh.

> **Q2 — Columns:** Giữ 14 cột hay gộp "VẬT LIỆU" + "NCC" thành 1 cột
> "Nguồn cung" để có chỗ rộng hơn?
> **Default:** Giữ 14 cột, fix bằng `table-fixed` + truncate.

> **Q3 — Re-import BOM:** BOM `7a7b0ba0-...` đã có Orders/WO link chưa?
> Nếu chưa → xoá + re-import sạch sẽ. Nếu rồi → cần migration cleanup.
> **Default:** Xoá BOM + re-import (tin user vừa upload Excel mới, chưa có
> dependency).

> **Q4 — Mobile priority:** Trên màn hình ≤768px ẩn cột nào?
> **Default:** ẩn KÍCH THƯỚC + HAO HỤT + GHI CHÚ; show #, Mã, Tên, Loại,
> Tiến độ, Actions.

> **Q5 — Issue 5 polish:** Status badge "Chưa mua" + bar lệch — fix ngay
> Sprint 6 hay defer Sprint 7?
> **Default:** Defer Sprint 7 (P2, không blocker).

---

## 9. Out-of-scope + Risk + Rollback

**Out-of-scope (KHÔNG làm Sprint 6):** refactor multi-grid, column
visibility dropdown, migration cleanup data, restructure flex → grid CSS,
mobile redesign full, fix Issue 5 polish.

**Risk:**
1. Breaking `useBomTree` signature → param `sheetId` optional default
   `undefined`, call sites legacy không truyền vẫn fetch all (rollback dễ).
2. Sticky `<th>` Safari quirk → test 3 browser; fallback
   `border-collapse` + sticky `<thead>`.
3. `min-h-0` AppShell ảnh hưởng page khác → chỉ apply trong `isWorkspace`
   branch (đã có guard `isBomWorkspacePath`).
4. Re-import BOM có Order/WO link → pre-flight query
   `SELECT count(*) FROM app.order WHERE bom_template_id = '<id>'`. Nếu > 0
   → fallback UPDATE thủ công.

---

## 10. Định nghĩa hoàn thành (Definition of Done)

Sprint 6 này coi là DONE khi:

- [ ] User load `https://mes.songchau.vn/bom/7a7b0ba0-8ed6-4a6f-94bc-78d735f54d8c/grid`
      → tab Sheet 1 active → grid show **đúng 41 lines** (không 82).
- [ ] Click tab Sheet 2 → grid swap sang **41 lines của sheet 2** (≤500ms
      perceived).
- [ ] Header `# ẢNH MÃ ...` sticky top khi scroll vertical 100+ rows.
- [ ] Cột "TÊN / MÔ TẢ" text dài → ellipsis "…", không tràn cột bên cạnh.
- [ ] Cột "LOẠI" và "VẬT LIỆU" hiển thị giá trị **khác nhau** (Loại = com/fab,
      Vật liệu = SUS304/POM/AL6061…).
- [ ] BottomPanel tab bar nằm dưới grid, **không overlap sidebar** trái trên
      viewport 1440×900.
- [ ] Click tab BottomPanel "Đơn hàng" → expand panel mượt, không jitter.
- [ ] Mobile (375×812) hiển thị 5-6 cột priority, scroll horizontal
      grid lines trong khi sticky vertical header vẫn giữ.
- [ ] Pre-existing E2E test `/bom/[id]/grid` pass (login admin → load tree
      → click row → BomLineSheet open).

---

## 11. Next steps + dependencies

1. User trả Q1-Q5 hoặc xác nhận default → unblock cook.
2. `/cook` 5 subtask theo §7 order; `/test` e2e + screenshot regression;
   `/review`; push main → CI build → SSH VPS deploy; verify prod URL;
   update `PROGRESS.md`.

**Dependencies:** plan trước
`plans/redesign-v3/sprint-6-multi-sheet-brainstorm.md` (BomSheetTabs UI),
`sprint-6-fix-material-per-bom.md` (pattern filter per sheet —
`MaterialSheetView` / `ProcessSheetView` đã làm sẵn). Migration 0027
(sheet_id NOT NULL) + 0028 (backfill PROJECT default).

---

## 12. Tham chiếu code path (tóm tắt)

| File                                                           | Line | Vai trò                                          |
|----------------------------------------------------------------|------|--------------------------------------------------|
| `apps/web/src/server/repos/bomTemplates.ts`                    | 256  | `loadTree` cần thêm `sheetId?` param              |
| `apps/web/src/app/api/bom/templates/[id]/tree/route.ts`        | 19   | API route cần đọc `?sheetId=`                     |
| `apps/web/src/hooks/useBom.ts`                                 | 154  | `useBomTree(id, sheetId?)` cần cập nhật queryKey |
| `apps/web/src/app/(app)/bom/[id]/grid/page.tsx`                | 54   | Truyền `activeSheetId` vào hook                   |
| `apps/web/src/components/bom-grid-pro/BomGridPro.tsx`          | 535  | `<table>` → `table-fixed` + `<colgroup>`          |
| `apps/web/src/components/bom-grid-pro/BomGridPro.tsx`          | 536  | `<thead>` sticky → từng `<th>` sticky             |
| `apps/web/src/components/bom-workspace/BottomPanel.tsx`        | 91   | Thêm `relative z-30`                              |
| `apps/web/src/components/layout/AppShell.tsx`                  | 127  | `<main>` workspace mode thêm `min-h-0 flex flex-col` |
| `apps/web/src/server/services/bomImportParser.ts`              | 411-432 | Synonym dict cleanup (Issue 4)                |
| `apps/web/src/server/services/excelImport.ts`                  | 12   | Verify category mapping                          |

---

**END OF PLAN — chờ user chốt Q1-Q5 trước khi cook.**
