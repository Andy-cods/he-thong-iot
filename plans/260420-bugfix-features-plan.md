# Plan: Bug Fixes + Features — 260420

**Ngày:** 2026-04-20  
**Branch:** feat/v1.4-security-ops (hoặc tạo branch mới `fix/uuid-display`)  
**Scope:** 7 bug fixes (P0) + 4 features (P1) — KHÔNG bao gồm backend mới, migration DB, hay thay đổi auth.

---

## Overview

Các lỗi hiển thị UUID thô (B1–B5) do thiếu JOIN trong repo layer và API route. Các label tiếng Anh (B3, B6, B7) là lỗi UI nhỏ. Feature F1–F4 là cải tiến UX nhỏ không cần schema DB mới.

---

## Phân tích thực trạng (sau khi đọc code)

### Về B1 (UUID NCC trong PO list)
- `listPOs()` trong `purchaseOrders.ts` dòng 58–64 dùng `db.select().from(purchaseOrder)` — không JOIN supplier.
- `PORow` interface trong `usePurchaseOrders.ts` có `supplierId: string` nhưng thiếu `supplierName`.
- `POListTable.tsx` dòng 115: `{row.supplierId.slice(0, 8)}…` — hardcode UUID slice.

### Về B2 (UUID item trong PO detail lines)
- `getPOLines()` trong `purchaseOrders.ts` dòng 79–85: `db.select().from(purchaseOrderLine)` — không JOIN item.
- `POLineRow` interface thiếu `itemName: string | null` và `sku: string | null`.
- `[id]/page.tsx` dòng 169: `{l.itemId.slice(0, 8)}…`

### Về B3 (PO status tabs tiếng Anh)
- `purchase-orders/page.tsx` dòng 91: `{s === "all" ? "Tất cả" : s}` — render raw enum key.
- `PO_STATUS_LABELS` đã tồn tại trong `@iot/shared` với đầy đủ nhãn tiếng Việt. Chỉ cần dùng nó.

### Về B4 (Dashboard SKU UUID)
- `getRecentOrdersReal()` trong `overview/route.ts` dòng 141: `productName: \`SKU: ${o.productItemId.slice(0, 8)}…\`` — comment trong code thừa nhận chưa JOIN.
- Cần JOIN `item` table trong query.

### Về B5 (Dashboard READY % = 0%)
- Dòng 131–133: `readinessPct` tính từ `bom_snapshot_line` nhưng logic đúng — vấn đề là `shortage` tính `remainingShortQty > 0` (thiếu hàng), không phải "available".
- `readinessPct = (total - shortage) / total * 100` — logic này ổn về mặt khái niệm, nhưng nếu không có snapshot lines thì `total = 0` → `readinessPct = 0`. Trường hợp này là đúng (chưa snapshot).
- Nếu muốn fix thực sự: cần kiểm tra trên DB thực. Tuy nhiên theo comment trong code, snapshot lines có thể chưa có data → cần fallback từ work_order nếu có.
- **Giải pháp đơn giản hơn:** thêm fallback từ `work_order.good_qty / work_order.planned_qty` khi không có snapshot.

### Về B6 (WO list headers)
- `work-orders/page.tsx` dòng 167–173: headers mix Anh/Việt rõ ràng.

### Về B7 (Badge "Đang hoạt động" overflow)
- `StatusBadge.tsx` dòng 96: `defaultLabel: "Đang hoạt động"` — dài 14 ký tự.
- Đổi thành `"Hoạt động"` (9 ký tự) và `inactive` từ `"Ngưng hoạt động"` → `"Ngưng"`.

### Về F1 (Merge Import Excel nav)
- `nav-items.ts` có 2 items riêng: `/items/import` (label "Nhập Excel") và `/bom/import` (label "Nhập BOM Excel").
- Cần tạo `/import` landing page mới, xóa nav item `/bom/import` riêng, đổi `/items/import` → `/import`.

### Về F2 (PO lines progress indicator)
- Tab "Dòng hàng" trong `[id]/page.tsx` — cột table hiện tại: `#, Item ID, Đặt, Đã nhận, Còn, ETA`.
- Cần thêm cột progress bar + button "Nhận hàng".

### Về F3 (WO list % hoàn thành)
- `WorkOrderRow` trong `useWorkOrders.ts` có `plannedQty`, `goodQty`, `scrapQty` — đủ data tính progress.
- Chỉ cần thêm cột UI, không cần thêm API field.

### Về F4 (Dashboard DEADLINE format)
- `OrdersReadinessTable.tsx` dòng 186–193: `formatDate(order.deadline, "dd/MM")` — chỉ hiện ngày/tháng.
- `formatDaysLeft` trả `còn ${diff}d` — cần đổi thành `còn ${diff} ngày`.
- Cần: hiện `dd/MM/yyyy` thay `dd/MM`, đổi label từ "còn Xd" sang "còn X ngày".

---

## Thứ tự thực hiện (dependency order)

```
Nhóm 1 — Backend repo/API (không có dep vào nhau, làm song song):
  B1-backend: purchaseOrders.ts → listPOs() JOIN supplier
  B2-backend: purchaseOrders.ts → getPOLines() JOIN item
  B4-backend: overview/route.ts → getRecentOrdersReal() JOIN item
  B5-backend: overview/route.ts → readiness fallback từ WO

Nhóm 2 — Type updates (sau nhóm 1):
  B1-type: PORow thêm supplierName
  B2-type: POLineRow thêm itemName + sku

Nhóm 3 — UI fixes (sau nhóm 2, hoặc song song với nhóm 1 cho các fix không cần type mới):
  B3: purchase-orders/page.tsx → dùng PO_STATUS_LABELS
  B6: work-orders/page.tsx → đổi headers
  B7: StatusBadge.tsx → đổi defaultLabel
  B1-ui: POListTable.tsx → dùng supplierName
  B2-ui: [id]/page.tsx → dùng itemName/sku
  F3: work-orders/page.tsx → thêm cột progress
  F4: OrdersReadinessTable.tsx + format.ts → sửa format deadline

Nhóm 4 — Feature pages (độc lập):
  F1: Tạo /import/page.tsx + sửa nav-items.ts
  F2: [id]/page.tsx → thêm progress bar + button nhận hàng trong tab Dòng hàng
```

---

## Chi tiết từng task

### B1 — UUID NCC trong PO list

**Effort:** ~45 phút

#### File 1: `apps/web/src/server/repos/purchaseOrders.ts`

Thay đổi hàm `listPOs()`:
- Import `supplier` từ `@iot/db/schema`.
- Đổi `db.select().from(purchaseOrder)` → `db.select({ ...fields, supplierName: supplier.name }).from(purchaseOrder).leftJoin(supplier, eq(purchaseOrder.supplierId, supplier.id))`.
- SELECT explicit thay vì `select()` wildcard để control output type.
- Trả `supplierName: string | null` trong mỗi row.

Định nghĩa type `POListRow` mới (hoặc extend) có thêm `supplierName: string | null`.

**Cụ thể:** Hàm `listPOs()` hiện trả `PurchaseOrder[]` (Drizzle infer). Sau fix cần trả custom type với `supplierName`. Tạo export type `POListRow` trong file này.

#### File 2: `apps/web/src/hooks/usePurchaseOrders.ts`

- Thêm `supplierName: string | null` vào `PORow` interface.

#### File 3: `apps/web/src/components/procurement/POListTable.tsx`

- Thay `{row.supplierId.slice(0, 8)}…` → `{row.supplierName ?? row.supplierId.slice(0, 8) + "…"}`.

#### File 4: `apps/web/src/app/api/purchase-orders/route.ts`

- Hàm `GET`: gọi `listPOs()` vẫn như cũ nhưng response bây giờ có `supplierName` trong mỗi row — không cần sửa vì ta trả `result.rows` trực tiếp.

**Lưu ý:** API route `/api/purchase-orders` trả `result.rows` nên type mới tự được forward. Không cần sửa route.

---

### B2 — UUID item trong PO detail lines

**Effort:** ~45 phút

#### File 1: `apps/web/src/server/repos/purchaseOrders.ts`

Thay đổi hàm `getPOLines()`:
- Import `item` từ `@iot/db/schema`.
- Đổi `db.select().from(purchaseOrderLine)` → JOIN item, SELECT explicit gồm `itemName: item.name, sku: item.sku`.
- Tạo export type `POLineListRow` có thêm 2 field mới.

Thêm hàm `getPOWithLines(poId: string)` hoặc sửa endpoint GET `/api/purchase-orders/[id]` để dùng `getPOLines()` mới.

#### File 2: `apps/web/src/hooks/usePurchaseOrders.ts`

- Thêm `itemName: string | null` và `sku: string | null` vào `POLineRow` interface.

#### File 3: `apps/web/src/app/(app)/procurement/purchase-orders/[id]/page.tsx`

- Đổi column header "Item ID" → "Vật tư".
- Thay `{l.itemId.slice(0, 8)}…` → hiển thị `{l.sku ?? l.itemId.slice(0, 8)+"…"} — {l.itemName ?? ""}`.
- Tab "Dòng hàng" trong info section cũng cần fix: dòng `<dt>NCC ID</dt><dd>{po.supplierId}</dd>` → đổi thành `<dt>Nhà cung cấp</dt><dd>{po.supplierName ?? po.supplierId}</dd>`.

**Lưu ý:** `getPO()` trả PO header không có `supplierName`. Có 2 cách:
1. Cách đơn giản: thêm JOIN vào `getPO()` luôn → trả `supplierName`.
2. Cách lazy: UI detail page vẫn hiển thị `supplierId` đầy đủ (không phải UUID slice) trong tab Info — ít urgent hơn.

Chọn cách 1 cho nhất quán: sửa `getPO()` JOIN supplier, trả `supplierName: string | null` kèm theo.

---

### B3 — PO status tabs tiếng Anh

**Effort:** ~15 phút

#### File: `apps/web/src/app/(app)/procurement/purchase-orders/page.tsx`

- `PO_STATUS_LABELS` đã import sẵn từ `@iot/shared` ở `POListTable.tsx`.
- Trong `page.tsx`, thêm import `PO_STATUS_LABELS` từ `@iot/shared`.
- Dòng 91: đổi `{s === "all" ? "Tất cả" : s}` → `{s === "all" ? "Tất cả" : PO_STATUS_LABELS[s as POStatus]}`.
- Import thêm `type POStatus` từ `@iot/shared`.

---

### B4 — Dashboard SKU/SẢN PHẨM hiện UUID

**Effort:** ~30 phút

#### File: `apps/web/src/app/api/dashboard/overview/route.ts`

Trong `getRecentOrdersReal()`:
- Thêm `item` vào imports từ `@iot/db/schema`.
- Sửa query lấy orders: JOIN `item` on `salesOrder.productItemId = item.id`.
- SELECT thêm `productName: item.name, sku: item.sku`.
- Dòng 141: đổi `productName: \`SKU: ${o.productItemId.slice(0, 8)}…\`` → `productName: o.productName ?? o.sku ?? \`ID: ${o.productItemId.slice(0, 8)}…\``.

**Lưu ý quan trọng:** `salesOrder.productItemId` có thể nullable hoặc không có FK constraint cứng. Nếu LEFT JOIN thì `item.name` có thể null → dùng fallback. Cần LEFT JOIN (không phải INNER JOIN) để tránh mất orders nếu item bị xóa.

---

### B5 — Dashboard READY % = 0%

**Effort:** ~30 phút

#### File: `apps/web/src/app/api/dashboard/overview/route.ts`

Phân tích: Logic hiện tại ở dòng 131–133 tính `readinessPct = (total - shortage) / total * 100` trong đó `shortage = count lines có remainingShortQty > 0`. Nếu `total = 0` (không có snapshot) → `readinessPct = 0`. Đây là behavior đúng.

**Vấn đề thực sự:** Các orders đang ở trạng thái IN_PROGRESS nhưng chưa có bom_snapshot_line nào → readiness = 0%. Cần thêm fallback từ work_order.

**Fix:**
- Sau khi lấy `snapAgg`, với các order không có snapshot, query `work_order` xem có WO nào `linkedOrderId = orderId` không. Nếu có, tính `goodQty / plannedQty * 100` làm fallback readiness.
- Hoặc đơn giản hơn: nếu order ở trạng thái IN_PROGRESS và không có snapshot, không hiển thị 0% mà hiển thị "—" hay null để UI biết là "chưa xác định".

**Giải pháp V1 (đơn giản, YAGNI):**
- Thêm query WO per order (batch, không N+1): `db.select({ linkedOrderId, goodQty, plannedQty }).from(workOrder).where(inArray(workOrder.linkedOrderId, orderIds))`.
- Map vào `Map<orderId, woProgress>`.
- Khi `snap.total = 0` và có WO → dùng WO progress làm readiness.

---

### B6 — WO list headers mix Anh/Việt

**Effort:** ~10 phút

#### File: `apps/web/src/app/(app)/work-orders/page.tsx`

Đổi headers trong `<thead>`:
- `WO No` → `Số WO`
- `Order` → `Đơn hàng`
- `Priority` → `Ưu tiên`
- `Planned Qty` → `SL kế hoạch`
- `Good / Scrap` → `Đạt / Phế`

WO detail page cũng có một số label tiếng Anh (dòng 259 "Planned Qty", 272 "Planned start", 273 "Planned end") — nằm ngoài scope ticket B6 nhưng nên làm luôn khi đang sửa file:
- `Planned Qty` → `SL kế hoạch`
- `Planned start` → `Bắt đầu kế hoạch`
- `Planned end` → `Kết thúc kế hoạch`

---

### B7 — Badge "Đang hoạt động" overflow

**Effort:** ~10 phút

#### File: `apps/web/src/components/domain/StatusBadge.tsx`

- `active.defaultLabel`: `"Đang hoạt động"` → `"Hoạt động"`
- `inactive.defaultLabel`: `"Ngưng hoạt động"` → `"Ngưng"`

Không cần sửa gì khác — các nơi dùng badge với custom `label` prop sẽ không bị ảnh hưởng.

---

### F1 — Merge Import Excel nav

**Effort:** ~30 phút

#### File 1 (TẠO MỚI): `apps/web/src/app/(app)/import/page.tsx`

Landing page với 2 card:
- Card "Nhập vật tư" → link `/items/import`
- Card "Nhập BOM" → link `/bom/import`

Layout: 2 card ngang, mỗi card có icon + title + description + CTA button. Dùng component có sẵn (không tạo component mới).

Metadata: `title: "Nhập Excel"`.

#### File 2: `apps/web/src/lib/nav-items.ts`

- Xóa item `{ href: "/items/import", label: "Nhập Excel", ... }`.
- Xóa item `{ href: "/bom/import", label: "Nhập BOM Excel", ... }`.
- Thêm item mới: `{ href: "/import", label: "Nhập Excel", icon: FileSpreadsheet, roles: ["admin", "planner"] }`.

**Lưu ý:** Các link `/items/import` và `/bom/import` vẫn hoạt động (không xóa page) — chỉ xóa khỏi nav sidebar.

---

### F2 — PO lines progress indicator

**Effort:** ~45 phút

#### File: `apps/web/src/app/(app)/procurement/purchase-orders/[id]/page.tsx`

Trong tab `lines`:
- Thêm cột `Progress` vào table header.
- Mỗi row: tính `pct = Math.round((received / ordered) * 100)`.
- Render progress bar mini:
  - Màu: `pct === 0` → `bg-red-400`, `pct < 100` → `bg-amber-400`, `pct === 100` → `bg-emerald-500`.
  - Width: `w-16 h-1.5` container + fill theo pct.
  - Text bên cạnh: `{pct}%`.
- Thêm button "Nhận hàng" ở cuối tab (sau table), chỉ hiển thị khi PO không phải RECEIVED/CANCELLED/CLOSED và có ít nhất 1 line chưa đủ:
  - `<Link href={'/pwa/receive/${po.id}'}><Button size="sm">Nhận hàng</Button></Link>`.

---

### F3 — WO list thêm % hoàn thành

**Effort:** ~20 phút

#### File: `apps/web/src/app/(app)/work-orders/page.tsx`

- Thêm cột `% hoàn thành` vào `<thead>` (sau cột "Đạt/Phế", trước "Trạng thái").
- Trong mỗi `<tr>`: tính `pct = r.plannedQty > 0 ? Math.round((r.goodQty / r.plannedQty) * 100) : 0`.
  - `r.goodQty` và `r.plannedQty` là string trong `WorkOrderRow` → convert `Number()`.
- Render mini progress bar (dùng cùng pattern như F2): `w-16 h-1.5`.

**Lưu ý:** `WorkOrderRow` đã có `goodQty` và `plannedQty` → không cần thêm API field.

---

### F4 — Dashboard DEADLINE format

**Effort:** ~20 phút

#### File 1: `apps/web/src/lib/format.ts`

Sửa hàm `formatDaysLeft()`:
- Dòng 89: `{ label: \`còn ${diff}d\`` → `{ label: \`còn ${diff} ngày\``.
- Dòng 91: `{ label: \`quá ${Math.abs(diff)}d\`` → `{ label: \`quá ${Math.abs(diff)} ngày\``.

#### File 2: `apps/web/src/components/domain/OrdersReadinessTable.tsx`

- Dòng 186: `formatDate(order.deadline, "dd/MM")` → `formatDate(order.deadline, "dd/MM/yyyy")`.

---

## Danh sách đầy đủ files cần sửa/tạo

| # | File | Action | Liên quan task |
|---|------|---------|----------------|
| 1 | `apps/web/src/server/repos/purchaseOrders.ts` | Sửa | B1, B2 |
| 2 | `apps/web/src/hooks/usePurchaseOrders.ts` | Sửa | B1, B2 |
| 3 | `apps/web/src/components/procurement/POListTable.tsx` | Sửa | B1 |
| 4 | `apps/web/src/app/(app)/procurement/purchase-orders/page.tsx` | Sửa | B3 |
| 5 | `apps/web/src/app/(app)/procurement/purchase-orders/[id]/page.tsx` | Sửa | B2, F2 |
| 6 | `apps/web/src/app/api/dashboard/overview/route.ts` | Sửa | B4, B5 |
| 7 | `apps/web/src/app/(app)/work-orders/page.tsx` | Sửa | B6, F3 |
| 8 | `apps/web/src/app/(app)/work-orders/[id]/page.tsx` | Sửa (optional) | B6 related |
| 9 | `apps/web/src/components/domain/StatusBadge.tsx` | Sửa | B7 |
| 10 | `apps/web/src/lib/nav-items.ts` | Sửa | F1 |
| 11 | `apps/web/src/app/(app)/import/page.tsx` | Tạo mới | F1 |
| 12 | `apps/web/src/lib/format.ts` | Sửa | F4 |
| 13 | `apps/web/src/components/domain/OrdersReadinessTable.tsx` | Sửa | F4 |

**Files KHÔNG cần sửa:**
- `apps/web/src/app/api/purchase-orders/route.ts` — tự forward type mới từ repo layer.
- `apps/web/src/app/api/purchase-orders/[id]/route.ts` — tương tự.
- Bất kỳ DB migration nào — không thay đổi schema.
- `packages/shared/src/schemas/procurement.ts` — `PO_STATUS_LABELS` đã đúng.

---

## Implementation Steps (theo thứ tự)

### Step 1: Repo layer — JOIN supplier + item (B1 + B2)

**File:** `apps/web/src/server/repos/purchaseOrders.ts`

1a. Thêm import `supplier, item` vào import từ `@iot/db/schema`.

1b. Sửa `listPOs()`:
```
// Thay db.select().from(purchaseOrder) bằng:
db.select({
  id: purchaseOrder.id,
  poNo: purchaseOrder.poNo,
  supplierId: purchaseOrder.supplierId,
  supplierName: supplier.name,  // NEW
  status: purchaseOrder.status,
  linkedOrderId: purchaseOrder.linkedOrderId,
  prId: purchaseOrder.prId,
  orderDate: purchaseOrder.orderDate,
  expectedEta: purchaseOrder.expectedEta,
  currency: purchaseOrder.currency,
  totalAmount: purchaseOrder.totalAmount,
  notes: purchaseOrder.notes,
  sentAt: purchaseOrder.sentAt,
  cancelledAt: purchaseOrder.cancelledAt,
  createdAt: purchaseOrder.createdAt,
  createdBy: purchaseOrder.createdBy,
})
.from(purchaseOrder)
.leftJoin(supplier, eq(purchaseOrder.supplierId, supplier.id))
```

1c. Tạo `export type POListRow = { supplierName: string | null } & Omit<PurchaseOrder, never>`.
   (Thực tế: dùng ReturnType inference hoặc khai báo explicit interface.)

1d. Sửa `getPOLines()`:
```
db.select({
  id: purchaseOrderLine.id,
  poId: purchaseOrderLine.poId,
  lineNo: purchaseOrderLine.lineNo,
  itemId: purchaseOrderLine.itemId,
  itemName: item.name,      // NEW
  sku: item.sku,            // NEW
  orderedQty: purchaseOrderLine.orderedQty,
  receivedQty: purchaseOrderLine.receivedQty,
  unitPrice: purchaseOrderLine.unitPrice,
  expectedEta: purchaseOrderLine.expectedEta,
  snapshotLineId: purchaseOrderLine.snapshotLineId,
  notes: purchaseOrderLine.notes,
})
.from(purchaseOrderLine)
.leftJoin(item, eq(purchaseOrderLine.itemId, item.id))
.where(eq(purchaseOrderLine.poId, poId))
.orderBy(purchaseOrderLine.lineNo)
```

1e. Tương tự, sửa `getPO()` để thêm `supplierName`:
```
db.select({
  ...purchaseOrder fields...,
  supplierName: supplier.name,
})
.from(purchaseOrder)
.leftJoin(supplier, eq(purchaseOrder.supplierId, supplier.id))
.where(eq(purchaseOrder.id, id))
.limit(1)
```

### Step 2: Update type interfaces (B1 + B2)

**File:** `apps/web/src/hooks/usePurchaseOrders.ts`

```typescript
export interface PORow {
  // ...existing fields...
  supplierName: string | null;  // NEW
}

export interface POLineRow {
  // ...existing fields...
  itemName: string | null;  // NEW
  sku: string | null;       // NEW
}
```

### Step 3: Fix POListTable (B1)

**File:** `apps/web/src/components/procurement/POListTable.tsx`

Dòng 115: `{row.supplierId.slice(0, 8)}…` → `{row.supplierName ?? (row.supplierId.slice(0, 8) + "…")}`.

### Step 4: Fix PO detail — NCC + lines (B2)

**File:** `apps/web/src/app/(app)/procurement/purchase-orders/[id]/page.tsx`

- Tab Info, dòng `NCC ID`: đổi `<dt>NCC ID</dt>` → `<dt>Nhà cung cấp</dt>`, `<dd>{po.supplierId}</dd>` → `<dd>{po.supplierName ?? po.supplierId}</dd>`.
- Tab Lines, header "Item ID" → "Vật tư".
- Trong tbody: `{l.itemId.slice(0, 8)}…` → `<span class="font-mono text-xs">{l.sku ?? ""}</span> {l.itemName ?? l.itemId.slice(0, 8) + "…"}`.

### Step 5: Fix PO status tabs (B3)

**File:** `apps/web/src/app/(app)/procurement/purchase-orders/page.tsx`

- Import thêm: `import { PO_STATUS_LABELS, PO_STATUSES, type POStatus } from "@iot/shared"`.
  (`PO_STATUSES` đã import, thêm `PO_STATUS_LABELS` và `POStatus` type).
- Dòng 91: `{s === "all" ? "Tất cả" : s}` → `{s === "all" ? "Tất cả" : PO_STATUS_LABELS[s as POStatus]}`.

### Step 6: Fix Dashboard (B4 + B5)

**File:** `apps/web/src/app/api/dashboard/overview/route.ts`

6a. Thêm `item, workOrder` vào imports (workOrder đã có).

6b. Sửa query trong `getRecentOrdersReal()`: thêm LEFT JOIN item, SELECT `productName: item.name, sku: item.sku`.

6c. Dòng 141: `productName: \`SKU: ${o.productItemId.slice(0, 8)}…\`` → `productName: o.productName ?? (o.sku ? o.sku : \`#${o.productItemId.slice(0, 8)}\`)`.

6d. B5 — thêm fallback WO readiness:
- Sau khi build `snapMap`, query WO: `db.select({ linkedOrderId: workOrder.linkedOrderId, goodQty: workOrder.goodQty, plannedQty: workOrder.plannedQty }).from(workOrder).where(inArray(workOrder.linkedOrderId, orderIds))`.
- Build `woMap: Map<string, { goodQty: string, plannedQty: string }>`.
- Trong map cuối: khi `total === 0` và `woMap.has(o.id)` → tính readiness từ WO.

**Lưu ý:** Xóa Redis cache key `dashboard:overview:v2` sau khi deploy (hoặc đổi thành `:v3`) để cache cũ không serve UUID cũ. Đổi `CACHE_KEY = "dashboard:overview:v3"`.

### Step 7: Fix WO headers (B6)

**File:** `apps/web/src/app/(app)/work-orders/page.tsx`

Đổi 5 headers trong `<thead>`.

### Step 8: Fix StatusBadge labels (B7)

**File:** `apps/web/src/components/domain/StatusBadge.tsx`

Đổi 2 `defaultLabel`.

### Step 9: Fix format deadline (F4)

**File 1:** `apps/web/src/lib/format.ts` — đổi "còn Xd"/"quá Xd" → "còn X ngày"/"quá X ngày".

**File 2:** `apps/web/src/components/domain/OrdersReadinessTable.tsx` — đổi format date "dd/MM" → "dd/MM/yyyy".

### Step 10: WO list progress bar (F3)

**File:** `apps/web/src/app/(app)/work-orders/page.tsx`

- Thêm cột header `% hoàn thành`.
- Thêm `<td>` với mini progress bar.
- Logic: `const pct = Number(r.plannedQty) > 0 ? Math.round((Number(r.goodQty) / Number(r.plannedQty)) * 100) : 0`.

### Step 11: PO lines progress + button nhận hàng (F2)

**File:** `apps/web/src/app/(app)/procurement/purchase-orders/[id]/page.tsx`

- Thêm cột "Tiến độ" vào thead.
- Trong tbody: render mini progress bar dựa trên `received/ordered * 100`.
- Sau `</table>`: thêm button nhận hàng conditional.

### Step 12: Import landing page + nav (F1)

**File 1 (TẠO MỚI):** `apps/web/src/app/(app)/import/page.tsx`

Nội dung:
```typescript
// Server Component (không cần "use client")
import Link from "next/link";
import { FileSpreadsheet, Network, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Nhập Excel" };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Nhập dữ liệu từ Excel
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Chọn loại dữ liệu cần nhập hàng loạt.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <ImportCard
          href="/items/import"
          icon={<Package className="h-6 w-6" />}
          title="Nhập vật tư"
          description="Upload danh sách SKU từ file .xlsx theo template chuẩn."
        />
        <ImportCard
          href="/bom/import"
          icon={<Network className="h-6 w-6" />}
          title="Nhập BOM"
          description="Upload Bill of Materials multi-sheet từ file .xlsx."
        />
      </div>
    </div>
  );
}

function ImportCard({ href, icon, title, description }) { ... }
```

**File 2:** `apps/web/src/lib/nav-items.ts`

- Xóa item `{ href: "/items/import", ... }`.
- Xóa item `{ href: "/bom/import", ... }`.
- Thêm item mới giữa BOM và Orders: `{ href: "/import", label: "Nhập Excel", icon: FileSpreadsheet, roles: ["admin", "planner"] }`.

---

## Những gì KHÔNG làm (scope boundary)

- Không tạo migration DB mới.
- Không thêm endpoint API mới (chỉ sửa query trong repo layer).
- Không sửa PWA receive page `/pwa/receive/[poId]` — chỉ thêm link tới đó.
- Không sửa logic RBAC hay auth.
- Không redesign UI major — chỉ sửa text/data hiển thị.
- Không sửa worker container hay migration 0002 (bugs pending từ CLAUDE.md).
- Không fix PWA icons 404.
- B5: Không xây dựng full readiness tracking từ bom_snapshot — chỉ thêm WO fallback đơn giản.
- WO detail page label tiếng Anh: nằm ngoài scope B6 chính thức nhưng nên làm luôn khi đang sửa file (low risk, 5 phút).

---

## Ước tính tổng effort

| Task | Effort |
|------|--------|
| B1 (NCC UUID) | 45 phút |
| B2 (Item UUID PO lines) | 45 phút |
| B3 (PO status tabs) | 15 phút |
| B4 (Dashboard SKU) | 30 phút |
| B5 (Dashboard READY %) | 30 phút |
| B6 (WO headers) | 10 phút |
| B7 (Badge labels) | 10 phút |
| F1 (Import nav merge) | 30 phút |
| F2 (PO lines progress) | 45 phút |
| F3 (WO progress bar) | 20 phút |
| F4 (Deadline format) | 20 phút |
| **Tổng** | **~5.5 giờ** |

---

## Testing Strategy

### Manual smoke test sau mỗi nhóm:
1. **Nhóm 1+2 (B1+B2):** Mở `/procurement/purchase-orders` → cột NCC hiển thị tên thay vì UUID. Mở detail PO → tab Dòng hàng hiện SKU + tên vật tư.
2. **B3:** Tab filter PO list → hiện "Nháp / Đã gửi / Nhận 1 phần / Đã nhận đủ / Đã huỷ / Đã đóng".
3. **B4+B5:** Dashboard → bảng "Đơn hàng sắp giao" → cột Sản phẩm hiện tên thực, cột Ready % có giá trị > 0 nếu có WO.
4. **B6:** `/work-orders` → headers tiếng Việt.
5. **B7:** Trang Items hoặc Suppliers → badge "Hoạt động" / "Ngưng" không overflow.
6. **F1:** Nav sidebar → chỉ còn 1 item "Nhập Excel" → click → trang landing 2 card.
7. **F2:** PO detail → tab Dòng hàng → progress bar màu đỏ/vàng/xanh. Button "Nhận hàng" xuất hiện khi PO chưa complete.
8. **F3:** `/work-orders` → cột % hoàn thành.
9. **F4:** Dashboard → deadline "15/05/2026 (còn 25 ngày)" thay vì "15/05 (còn 25d)".

### TypeScript check:
```bash
cd apps/web && pnpm tsc --noEmit
```
Phải pass 0 error trước khi đẩy.

---

## Rủi ro & Giảm thiểu

| Rủi ro | Mức độ | Giảm thiểu |
|--------|--------|------------|
| `listPOs()` explicit SELECT bỏ sót field → runtime error | Thấp | TypeScript sẽ bắt nếu `PORow` interface không khớp |
| `getPO()` JOIN supplier làm chậm query | Thấp | 1 PO = 1 join, index trên `supplier.id` PK |
| Dashboard cache cũ (Redis) serve UUID sau fix | Trung bình | Đổi `CACHE_KEY` → `:v3` |
| `formatDaysLeft` thay đổi làm vỡ test khác | Thấp | Grep usage trước khi sửa |
| F1 xóa nav item → user bookmark `/items/import` vẫn hoạt động | Không có | Pages vẫn tồn tại, chỉ xóa khỏi nav |

---

## TODO Checklist

### P0 Bug Fixes
- [ ] B1: JOIN supplier trong `listPOs()` + `getPO()`
- [ ] B1: Thêm `supplierName` vào `PORow` interface
- [ ] B1: Sửa `POListTable.tsx` hiển thị tên NCC
- [ ] B2: JOIN item trong `getPOLines()`
- [ ] B2: Thêm `itemName` + `sku` vào `POLineRow` interface
- [ ] B2: Sửa PO detail tab Lines hiển thị SKU + tên
- [ ] B2: Sửa PO detail tab Info — "NCC ID" → "Nhà cung cấp" + tên
- [ ] B3: Import `PO_STATUS_LABELS` trong PO list page + dùng cho tabs
- [ ] B4: JOIN item trong `getRecentOrdersReal()`
- [ ] B4: Đổi `CACHE_KEY` → `dashboard:overview:v3`
- [ ] B5: Thêm fallback readiness từ work_order
- [ ] B6: Đổi headers WO list sang tiếng Việt
- [ ] B7: Đổi badge labels `active`/`inactive`

### P1 Features
- [ ] F1: Tạo `/import/page.tsx` landing page
- [ ] F1: Sửa `nav-items.ts` — gộp 2 nav item thành 1
- [ ] F2: Thêm progress bar per-line trong PO detail tab Lines
- [ ] F2: Thêm button "Nhận hàng" khi PO có line chưa đủ
- [ ] F3: Thêm cột `% hoàn thành` trong WO list
- [ ] F4: Đổi format `formatDaysLeft` sang "X ngày"
- [ ] F4: Đổi format date deadline "dd/MM/yyyy"

### Validation
- [ ] `pnpm tsc --noEmit` pass
- [ ] Manual smoke test tất cả 9 điểm trên
- [ ] Commit + push → CI pass
