# BOM Grid Pro Redesign — Brainstorm

**Ngày:** 2026-04-21
**Trạng thái:** Draft — chờ anh Hoạt confirm 5 câu hỏi cuối mục 9 trước khi mở plan triển khai.
**Vai:** Solution Brainstormer — không viết code, chỉ phân tích trade-off và chốt hướng.
**Liên quan:** [`plans/v1.7/ui-ux-audit.md`](./ui-ux-audit.md), [`apps/web/src/lib/bom-grid/build-workbook.ts`](../../apps/web/src/lib/bom-grid/build-workbook.ts), [`apps/web/src/app/(app)/bom/[id]/grid/page.tsx`](../../apps/web/src/app/(app)/bom/%5Bid%5D/grid/page.tsx), [`apps/web/src/server/services/derivedStatus.ts`](../../apps/web/src/server/services/derivedStatus.ts).

---

## 1. Vấn đề cốt lõi với Univer hiện tại

Univer là một **spreadsheet engine nhúng** — nó không biết gì về khái niệm `bom_line`, `item`, `bom_snapshot_line`, `purchase_order`. Nó chỉ hiểu ô, hàng, cột và công thức. Hệ quả trực tiếp từ kiến trúc này, đúng với feedback 3 screenshot anh vừa gửi:

- **Không có chỗ gắn progress / status badge / action button per-row.** Univer cell chỉ nhận `value + style` (xem `build-workbook.ts` dòng 51-61). Muốn nhét một progress bar horizontal kèm badge "🟢 Đủ hàng" hay icon "📥 Đặt mua" vào cell thì phải hack qua custom component — Univer Community Preset KHÔNG expose `cellRenderer` như AG-Grid hay Tanstack.
- **Event model quá thô.** Chỉ có `SheetEditEnded` → trả về toàn bộ snapshot JSON. Muốn biết "user vừa click nút nào ở row X" thì không có API. Anh Hoạt đã nói đúng: *"không có nút thao tác thực hiện được với linh kiện list"* — đây không phải vì team chưa làm, mà vì **Univer không có chỗ để làm**.
- **State đồng bộ khó.** Hiện tại flow là: `bom_line` (DB) → `buildWorkbookFromTemplate()` → `IWorkbookData` JSON → Univer render → user edit → `onEdit(snapshot)` → `POST /grid` lưu nguyên cục JSON vào `bom_grid_snapshot.data` (JSONB). Khi server-side đổi một `bom_line` (ví dụ từ PR/PO flow), snapshot Univer đang cache không tự reflect — phải reload cả tab mới thấy.
- **Bundle size nặng.** Univer Core + Sheets Core Preset ~800KB gzip. Với một app MES internal, overhead này không đáng khi ta chỉ cần 10% tính năng của spreadsheet (edit cell, freeze, merge).
- **Hierarchy depth >2 khó biểu diễn.** Hiện `buildWorkbookFromTemplate` phải indent bằng spaces trong cột SKU (dòng 306, 325) — nhìn thì có nested nhưng không expand/collapse được vì Univer không hỗ trợ row grouping thật.

Kết luận: Univer giải quyết đúng vấn đề "làm grid trông giống Excel", nhưng nó **không phải là UI layer phù hợp cho một MES app** có progress, action, real-time status và tree hierarchy.

---

## 2. Tech options thay Univer — ranking

### Option A — TanStack Table v8 + TanStack Virtual + shadcn/ui (RECOMMENDED)

**Cách tiếp cận:** Headless table library. Tự do 100% về UI. Mỗi cell là một React component. Virtualize qua `@tanstack/react-virtual`.

- **Pros:**
  - Hoàn toàn match feedback của anh Hoạt: progress bar, badge, action button per-row đều là component React bình thường.
  - Bundle nhẹ (~60KB gzip cho table + 20KB cho virtual, tổng ~80KB vs 800KB Univer).
  - Già nhất, ổn định nhất trong hệ sinh thái React. Có sẵn trong nhiều shadcn example.
  - Column resize, sort, filter, column pinning, row selection — tất cả có built-in (nhưng headless).
  - Inline edit pattern đơn giản: `useState` cho editing cell + `<Input>` overlay.
  - Ăn khớp với React Query pattern đang dùng — per-field mutation, optimistic update dễ.
  - Tree/group row: TanStack có `getExpandedRowModel` + `getGroupedRowModel` native.
- **Cons:**
  - Nhiều boilerplate hơn AG-Grid cho tính năng phức tạp (keyboard nav full, range select, copy/paste chéo cell).
  - Team phải tự code header resize handle, drag column, context menu — effort ~2-3 ngày setup.
- **Effort:** 7-10 ngày cho full replace (Phase A+B+C).
- **Match user feedback:** 10/10 — làm được đúng những gì anh cần.

### Option B — AG-Grid Community Edition

**Cách tiếp cận:** Enterprise-grade data grid. Community (MIT) có sẵn đủ sort/filter/pin/resize/inline-edit/virtualization/row grouping.

- **Pros:**
  - UX ra-of-the-box đã rất giống Excel (keyboard navigation, range select, fill handle).
  - Cell renderer API đơn giản: `cellRenderer: ProgressBarCell` → xong.
  - Row grouping với tree path built-in — không cần flatten tay.
  - Virtualization tốt hơn TanStack ở scale lớn (10K+ rows).
- **Cons:**
  - Bundle ~350KB gzip — không tệ nhưng gấp 4x TanStack.
  - Community bị khoá một số tính năng có thể cần sau này (master-detail, pivot, sparkline, advanced filter). Enterprise license ~$1000/dev/năm — không phù hợp xưởng cơ khí size nhỏ.
  - Styling tuỳ biến qua CSS theme — khó đồng bộ tuyệt đối với design system zinc/indigo hiện có. Phải override nhiều biến CSS.
  - License footer "AG-Grid Community" ở watermark (tuỳ phiên bản) — không sang.
- **Effort:** 5-7 ngày (nhanh hơn TanStack vì nhiều thứ built-in).
- **Match user feedback:** 8/10 — làm được hết nhưng style sẽ luôn "giống AG-Grid" trước khi "giống app của mình".

### Option C — shadcn/ui Table + TanStack Virtual + custom everything

**Cách tiếp cận:** HTML `<table>` thuần kết hợp với `useVirtualizer`. Tự code sort/filter/resize.

- **Pros:**
  - Bundle cực nhẹ (~20KB).
  - Visual đồng bộ 100% với phần còn lại của app.
  - Không phụ thuộc third-party table lib.
- **Cons:**
  - Tự viết tất cả: sort logic, filter, column resize handle, keyboard nav, column pinning cho sticky actions. Effort tăng 2x so với TanStack.
  - Khi grid to thêm (VD thêm Excel paste, range copy) sẽ phải tự re-implement — không scale.
- **Effort:** 12-15 ngày.
- **Match user feedback:** 9/10 về visual, 5/10 về effort.

### Option D — Handsontable Community

**Cách tiếp cận:** Library Excel-like nổi tiếng, có preset Vietnamese locale.

- **Pros:**
  - Cảm giác Excel đậm nhất, formula support tốt.
- **Cons:**
  - **Blocker nghiêm trọng:** Community tier license chỉ cho phép **non-commercial**. MES của anh Hoạt bán cho xưởng → vi phạm. Commercial license $590+/dev/năm.
  - Cell renderer phức tạp hơn TanStack.
  - Bundle ~400KB.
- **Loại khỏi shortlist** vì license.

### Bảng xếp hạng tổng hợp

| Tiêu chí | TanStack | AG-Grid Comm | shadcn + custom | Handsontable |
|---|---|---|---|---|
| Match feedback (progress + action) | 10 | 9 | 9 | 7 |
| Bundle size | 10 | 7 | 10 | 6 |
| Effort setup | 7 | 9 | 4 | 8 |
| Design system fit | 10 | 6 | 10 | 5 |
| Maintenance lâu dài | 9 | 7 | 6 | 5 |
| License clean | 10 | 10 | 10 | **0** |
| **Tổng (trọng số bằng)** | **9.3** | 8.0 | 8.2 | loại |

**Khuyến nghị: Option A — TanStack Table v8.**

---

## 3. Design grid mới — visual spec

### Header row (Excel-like, chuyên nghiệp)

- Background: `bg-zinc-50` (F4F4F5), border-b `border-zinc-900` dày 2px.
- Font: Inter 11px uppercase tracking-wide, `text-zinc-700`, `font-semibold`.
- Column resize handle: 4px vô hình ở mép phải header, hover shows `cursor-col-resize` + thanh indigo-400.
- Sort indicator: chevron ▲/▼ `text-zinc-400` bên phải text, active state `text-indigo-600`.
- Freeze: 2 hàng trên (title + header), 2 cột trái (Ảnh + Mã), 1 cột phải (Actions).

### Column layout mới — 13 cột (thêm 2)

```
| # | Ảnh | Mã | Tên | Loại | Vật liệu | NCC | SL/bộ | Kích thước | Tổng SL | Hao hụt | [TIẾN ĐỘ] | Ghi chú | [ACTIONS] |
  50   140  260  150    180    120   70      140      80       80        140       200       120
```

Tổng width ~1830px — scroll-x nhẹ ở laptop 1440, full fit trên 1920.

### Cột TIẾN ĐỘ (mới, col 12)

- Width 140px.
- 2 tầng visual per cell:
  - **Tầng trên (badge):** `StatusBadge` shadcn style — icon emoji + label 11px.
  - **Tầng dưới (progress bar):** horizontal bar 4px tall, rounded-full, hiện tỉ lệ `received/required`.
- 5 states (map 1-1 với enum `MaterialStatus` đã có sẵn trong `server/services/derivedStatus.ts`):
  - 🟡 **PLANNED** — amber-500 bar 0%, label "Chưa mua"
  - 🔵 **PURCHASING** — blue-500 bar 30%, label "Đang mua"
  - 🟠 **PARTIAL** — orange-500 bar 60%, label "Nhận một phần"
  - 🟢 **AVAILABLE** — emerald-500 bar 100%, label "Đủ hàng"
  - 🟣 **ISSUED** — violet-500 bar 100%, label "Đã xuất SX"
- Tooltip on hover: hiện chi tiết "Yêu cầu: 120 | Đã nhận: 72 | Thiếu: 48".
- **Data source:** mục 5 bên dưới.

### Cột ACTIONS (mới, col cuối, sticky right)

- Width 120px, `position: sticky; right: 0; background: white/zinc-50`.
- Default state: ẩn (chỉ show "..." icon).
- Row hover: hiện full 3-4 icon action, 28x28px, rounded-md, hover bg-zinc-100:
  - 📥 **Đặt mua** — visible khi status ∈ {PLANNED, PARTIAL}. Click → mở `PRQuickDialog` prefill item + qty thiếu.
  - 📦 **Xem tồn** — hover mở popover nhỏ hiển thị `inventory_txn` gần nhất + lot/serial.
  - ✏️ **Sửa** — mở `BomLineSheet` (side sheet 480px) edit full fields.
  - ⋯ **Thêm** — dropdown: Xoá / Nhân bản dòng / Xem lịch sử line này.

### Row states

- Default: `bg-white`, border-b `border-zinc-100`.
- Odd row banding: `bg-zinc-50/50` (giữ nhưng mờ hơn Univer hiện tại).
- Hover: `bg-zinc-50` + actions visible + ring inset.
- Selected (checkbox col #): `bg-indigo-50` + `border-l-2 border-indigo-500`.
- Group header (depth N với childCount>0): `bg-indigo-50/60` + text `text-indigo-900` + bold + chevron expand/collapse bên trái, indent `pl-[calc(depth*20px)]`.
- Edit mode cell: `ring-2 ring-indigo-500 ring-inset` + z-10.
- Read-only (khi template status=OBSOLETE): opacity 60% + cursor not-allowed.

### Typography

- SKU: JetBrains Mono 12px `text-zinc-800`, `tabular-nums`.
- Số liệu (SL/bộ, Tổng SL): Mono 12px `tabular-nums text-right`.
- Tên, Vật liệu, Ghi chú: Inter 13px `text-zinc-700`.
- Hao hụt %: Mono 12px `text-orange-600 text-right`.
- Loại: Inter 12px semibold, bg pill theo kind (xanh lá fab / xanh dương com).
- Ghi chú: Inter 12px italic `text-zinc-500`.

### Inline edit pattern

- Single click cell → cell focus (không edit yet, hiện ring mờ).
- Double click hoặc Enter → bật input mode:
  - Text cell: `<Input>` overlay cùng size.
  - Dropdown (Loại/NCC/Vật liệu): `<Select>` shadcn + trigger là chính cell.
  - Number (SL/bộ, Hao hụt): `<Input type="number">` với tabular-nums.
- Tab / Enter commit → `PATCH /api/bom/templates/[id]/lines/[lineId]` với field delta → optimistic update qua React Query.
- Escape cancel, revert value.
- Invalid value: red ring + tooltip error, không cho commit.

### BOM Title header (trên grid) — fix Screenshot 1

Thay "CNC-238846-DEMO_COPY" chói bằng:
- Line 1: Font Inter 14px `font-semibold text-zinc-900` — tên BOM.
- Line 2: Font Mono 11px `text-zinc-500` — code + version + parent qty.
- Không dùng text-indigo-600 cho title (không cần màu nhấn ở đây).

### Bottom panel tabs — fix Screenshot 1

- Tab container: `border-b border-zinc-200`, tabs bên trong `px-4 py-2 text-[13px]`.
- Active tab: border-b-2 `border-indigo-600`, `text-indigo-700 font-medium`.
- Inactive: `text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50`.
- Count badge: shadcn `<Badge variant="secondary">` 10px rounded-full ngay sau label, chỉ show khi count>0.
- Divider giữa tabs: 1px `bg-zinc-200` height 16px, `self-center`.

---

## 4. Data flow mới

### Hiện tại (Univer)

```
bom_line (DB) → buildWorkbookFromTemplate() → IWorkbookData JSON (~50KB cho BOM 100 dòng)
             → Univer render
             → user edit → onEdit(fullSnapshot)
             → POST /api/bom/templates/[id]/grid → bom_grid_snapshot.data JSONB (toàn bộ)
```

**Vấn đề:** mỗi edit lưu toàn bộ 50KB. Concurrent edit → last-write-wins, mất data của người kia. Không audit được "dòng nào đổi field gì".

### Mới (TanStack)

```
GET /api/bom/templates/[id]/lines-with-status
  → trả rows[] = bom_line JOIN item JOIN bom_snapshot_line aggregated
  → React Query cache

render: <DataTable columns={cols} data={rows} />
  → mỗi cell là component riêng, đọc đúng field mình cần

user edit cell X field Y:
  → optimistic update cache
  → PATCH /api/bom/templates/[id]/lines/[lineId] { field: Y, value: newVal }
  → success: invalidate query
  → fail: rollback + toast
```

**Lợi ích:**
- Per-field mutation — audit log chính xác, không conflict.
- Real-time: khi PR/PO tạo PO mới → backend fire event → client invalidate → progress cột tự refresh.
- State client nhẹ (chỉ rows array, không nguyên snapshot JSON).
- Retire `bom_grid_snapshot` table sau khi migrate (hoặc giữ làm backup).

---

## 5. Progress + Status data source

Schema đã có sẵn đủ primitives:
- `bom_line` (master) — `qtyPerParent`, `scrapPercent`, `componentItemId`.
- `bom_snapshot_line` (per-order) — `state ∈ {PLANNED, PURCHASING, INBOUND_QC, AVAILABLE, RESERVED, ISSUED, ASSEMBLED, CLOSED}`, `qtyRequired`, `qtyReceived`, `qtyAvailable`.
- Service `computeTemplateDerivedStatus()` trong `apps/web/src/server/services/derivedStatus.ts` — đã aggregate state per `bomLineId` cross-orders, map ra 5 trạng thái đúng như spec.

**Endpoint đề xuất:** `GET /api/bom/templates/[id]/lines-with-status`

Response shape:
```ts
{
  lines: Array<{
    // bom_line fields
    id, parentLineId, level, position, componentItemId,
    qtyPerParent, scrapPercent, description, childCount,
    // item fields (denormalize)
    componentSku, componentName, componentItemType, componentCategory,
    componentUom, supplierItemCode,
    // derived status (từ bom_snapshot_line aggregate)
    derivedStatus: 'PLANNED'|'PURCHASING'|'PARTIAL'|'AVAILABLE'|'ISSUED',
    totalRequired: number,
    totalReceived: number,
    totalShort: number,
    activeOrders: number,  // số MO đang active dùng dòng này
  }>
}
```

Reuse `computeTemplateDerivedStatus()` service V1.5 — chỉ cần wrap HTTP layer mới. Caching: React Query staleTime 30s, invalidate khi có event PR/PO/WO change.

---

## 6. Actions per row — endpoint / flow

| Action | Icon | Visible khi | Flow | Endpoint |
|---|---|---|---|---|
| Đặt mua | 📥 | status ∈ {PLANNED, PARTIAL} + itemType=PURCHASED | Open `PRQuickDialog` prefill `{ itemId, qty: totalShort, note }` → submit → tạo PR draft | `POST /api/purchase-requests/from-bom-line` (NEW) |
| Xem tồn | 📦 | always | Hover → popover fetch `/api/items/[id]/inventory` → list lot/serial + available/reserved | Existing `/api/items/[id]/inventory` |
| Sửa | ✏️ | not OBSOLETE | Open `BomLineSheet` (side sheet 480px) với form: qtyPerParent, scrapPercent, description, category, supplierItemCode, routeId (fab) | `PATCH /api/bom/templates/[id]/lines/[lineId]` |
| Xoá | ⋯ → menu | not OBSOLETE | Dialog confirm "Gõ XOA để xác nhận" | `DELETE /api/bom/templates/[id]/lines/[lineId]` |
| Nhân bản | ⋯ → menu | not OBSOLETE | Modal chọn parent line đích, clone subtree | `POST /api/bom/templates/[id]/lines/[lineId]/clone` (NEW) |
| Lịch sử | ⋯ → menu | always | Mở `HistoryDrawer` filter `lineId=X` | Existing `/api/bom/templates/[id]/history?lineId=X` |

---

## 7. Migration plan từ Univer

### Option M1 — Parallel (khuyến nghị, risk thấp)

- Giữ Univer tại `/bom/[id]/grid?mode=univer` làm legacy fallback 1 sprint.
- Route mặc định `/bom/[id]/grid` → TanStack pro grid mới.
- Nút "Chế độ cổ điển (beta)" ở Strip actions cho user so sánh.
- Sau 2 tuần không bug → remove Univer hoàn toàn → bundle -800KB.

**Migration dữ liệu:**
- Snapshot cũ trong `bom_grid_snapshot.data` JSONB đa phần là **derived view** của `bom_line` (builder tự sinh từ tree). Phần user edit tay chỉ gồm: `description` (ghi chú), `supplierItemCode` (NCC), `category` (vật liệu). 3 fields này **đã có sẵn** trong bảng `bom_line` / `item`.
- Viết script migrate 1 lần: đọc `bom_grid_snapshot.data`, parse cell (row, col) → map về `bom_line.id` qua thứ tự ordered tree, sync fields đã edit vào `bom_line` / `item`.
- Sau migrate, `bom_grid_snapshot` archive (rename table thay vì drop để backup 3 tháng).

### Option M2 — Hard cut

- Xoá Univer ngay, không fallback.
- Risk: nếu TanStack có bug ở production workload thật → không có plan B → phải hotfix gấp.
- **Không khuyến nghị** cho V1.7 vì mới up VPS, user vẫn làm quen flow.

---

## 8. Roadmap V1.7-beta.2

| Phase | Effort | Deliverable |
|---|---|---|
| **A — Core grid replace** | 2-3 ngày | TanStack Table v8 + virtualization; 13 cột render đầy đủ; header resize/sort; typography chuẩn Inter + Mono; reuse logic `flattenBomTreeToRows()` tách từ `buildWorkbookFromTemplate`; freeze 2-left + 1-right; group row expand/collapse |
| **B — Progress + status** | 2 ngày | Endpoint `GET /lines-with-status` (reuse `computeTemplateDerivedStatus`); `ProgressCell` component 5 states; filter chip bar trên grid (All / Planned / Short / Available...); real-time invalidation khi PR/PO thay đổi |
| **C — Actions per row** | 3-4 ngày | `BomLineSheet` (Sửa); `PRQuickDialog` (Đặt mua) + endpoint `from-bom-line`; inventory popover (Xem tồn); more dropdown (Xoá/Nhân bản/Lịch sử); inline edit pattern full flow |
| **D — Polish + retire Univer** | 1-2 ngày | BOM title refinement (bỏ indigo chói); bottom panel tabs active divider; Univer retire + bundle size audit; migration script `bom_grid_snapshot` → `bom_line` fields; acceptance test E2E |

**Tổng: 8-11 ngày dev.**

Gating: Phase A phải ship behind feature flag `NEXT_PUBLIC_BOM_GRID_PRO=1` để so sánh song song trước khi cut-over.

---

## 9. Risk + Open questions

### Risks

1. **Bundle size:** TanStack (~80KB) thay Univer (~800KB) — ròng -720KB. Không risk. Upside lớn cho first-paint của `/bom/[id]/grid`.
2. **Optimistic edit conflict:** Nếu 2 user cùng edit cùng dòng → last-write-wins. Cần thêm `updatedAt` optimistic lock trong PATCH? Mức độ ảnh hưởng thấp ở xưởng 5-10 user, nhưng nên audit.
3. **Virtualization vs sticky right column:** TanStack Virtual + `position: sticky` trong td có thể flicker. Cần PoC 30 phút để xác nhận.
4. **Group row hierarchy depth 5+:** TanStack `getExpandedRowModel` OK tới depth bất kỳ, nhưng indent visually phải tính (depth × 20px) không vượt cột 1. Test với BOM Z502653 (depth max 2) trước, sau đó Z0000002-684 (chưa biết depth).
5. **Keyboard nav:** Excel user quen Tab / Arrow / Enter pattern. TanStack không có built-in. Phải tự code `useKeyboardNav` hook. Effort ~4h.

### 5 câu hỏi cần anh Hoạt confirm

1. **Có chấp nhận dropped Univer hoàn toàn sau 2 tuần dual-mode không?** Hay giữ Univer dài hạn làm "power user mode"?
2. **Progress column phải reflect gì khi template chưa có MO nào?** → status mặc định `PLANNED` (chưa ai đặt hàng) hay ẩn cột? (khuyến nghị: show `PLANNED` tất cả, vì ngay cả master BOM cũng cần biết "đã có NCC chưa").
3. **Inline edit có cần lock khi 2 user cùng edit?** Hay chấp nhận last-write-wins + audit log để reconcile sau? (khuyến nghị: last-write-wins cho V1.7, add optimistic lock ở V1.8 nếu xảy ra).
4. **"Đặt mua" từ grid có tự tạo PR draft thẳng, hay chỉ prefill form và user confirm?** (khuyến nghị: prefill + user confirm để tránh spam PR).
5. **Có cần hỗ trợ import Excel kéo-thả vào grid mới không?** Univer có sẵn parse XLSX. TanStack không. Effort cho feature này ~2 ngày nếu cần → cân nhắc scope V1.7 hay V1.8.

Nếu không có hồi đáp trong 24h, sẽ auto-quyết định theo khuyến nghị trong ngoặc để không block Phase A.

---

## 10. Quyết định kiến nghị

- **Tech:** TanStack Table v8 + TanStack Virtual + shadcn/ui components. Loại Univer.
- **Migration:** Parallel 2 tuần, feature flag `NEXT_PUBLIC_BOM_GRID_PRO`, rồi hard cut.
- **Roadmap:** 4 phases, tổng 8-11 ngày dev, ship V1.7-beta.2.
- **Next step:** Anh Hoạt duyệt brainstorm này → mở file plan chi tiết `plans/v1.7/grid-pro-redesign-plan.md` với task breakdown API + component + test cases.

Brainstorm đến đây dừng — không viết code, không implement. Chờ confirm.
