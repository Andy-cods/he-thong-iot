# Trụ cột 3 — Product Line Workspace

> **Estimate:** 3 ngày (24h).
> **Owner:** Thắng.
> **Dependency:** Trụ cột 1 DONE (table `product_line` + `product_line_member`).

---

## 1. Mục tiêu

Cho anh Hoạt **1 trang duy nhất** để nhìn toàn cảnh 1 dòng sản phẩm (VD: "Băng tải DIPPI"):

- Tổng sản lượng, doanh thu dự kiến.
- Danh sách các mã Z (BOM template) thuộc dòng này.
- Drill-down xuống từng linh kiện, thấy PR/PO/WO/Giao hàng liên quan.
- Tiến độ % từng tầng: dòng SP → mã Z → dòng BOM → linh kiện.

---

## 2. Route + URL structure

| URL | Page |
|---|---|
| `/product-lines` | Danh sách tất cả dòng SP (card grid) |
| `/product-lines/new` | Tạo dòng SP mới |
| `/product-lines/[id]` | Trang chi tiết (6 tab) |
| `/product-lines/[id]/edit` | Sửa header thông tin dòng SP |

Files mới:

- `apps/web/src/app/(app)/product-lines/page.tsx`
- `apps/web/src/app/(app)/product-lines/new/page.tsx`
- `apps/web/src/app/(app)/product-lines/[id]/page.tsx`
- `apps/web/src/app/(app)/product-lines/[id]/edit/page.tsx`
- `apps/web/src/app/(app)/product-lines/[id]/layout.tsx` (share tab nav)

---

## 3. Layout trang chi tiết `/product-lines/[id]`

```
┌────────────────────────────────────────────────────────────────────┐
│  [Image dòng SP]   BĂNG TẢI DIPPI — PL-001                          │
│                    Sản lượng đời nay: 23 máy · Doanh thu: 1.4 tỷ ₫  │
│                    Trạng thái: ACTIVE · Owner: anh Hoạt             │
│                    [⚙ Sửa] [📊 Xuất báo cáo] [📤 Chia sẻ link]      │
├────────────────────────────────────────────────────────────────────┤
│ 📋 Mã Z (5)  │ 📦 Đơn hàng (3) │ 🛒 Mua sắm │ 🏭 Sản xuất │ 🚚 Giao │ 💰 Tài chính │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   (nội dung tab đang chọn render ở đây)                             │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

Header components:

- `<ProductLineHeader>` — image + name + KPI (sản lượng, doanh thu, tiến độ tổng).
- `<ProductLineTabs>` — tab nav sticky top.

---

## 4. Nội dung 6 tab

### 4.1 Tab "Mã Z" (default)

List các `bom_template` thuộc product_line, mỗi dòng:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ☑  Z0000002-502653_BANG_TAI_DIPPI       Tiến độ: ████████░░ 80%      │
│                                         150 linh kiện · 120 đã nhận │
│                                         [📝 Mở BOM Grid →]           │
└──────────────────────────────────────────────────────────────────────┘
```

Fields mỗi card:
- Code + name mã Z
- Progress bar (% `bom_line.derived_status = 'received'` hoặc `'completed'` / total)
- Số lineage: tổng linh kiện, đã nhận, thiếu
- Nút "Mở BOM Grid" → deeplink `/bom/[code]` (mở Univer Grid)

Actions:
- Nút "+ Thêm mã Z" → dialog chọn `bom_template` có sẵn chưa thuộc dòng nào, hoặc tạo mới.
- Multi-select → bulk actions: remove khỏi dòng SP, thay đổi `position`.

Component: `<ProductLineBomsTab>` + `<BomProgressCard>`.

### 4.2 Tab "Đơn hàng"

List `sales_order` linked với bất kỳ `bom_template` thuộc dòng SP:

| SO code | Khách hàng | Số lượng | Giá trị | Trạng thái | Ngày giao |
|---|---|---|---|---|---|
| SO-2026-0015 | TNHH Anh Minh | 3 máy | 180.000.000 | Producing | 25/04/2026 |

Link ra `/orders/[code]`.

### 4.3 Tab "Mua sắm"

Rollup PR + PO từ tất cả mã Z:
- Card KPI: tổng giá trị PR chưa duyệt, PO đang chờ nhận, PO quá hạn ETA.
- Table PR (link `/procurement/purchase-requests/[code]`).
- Table PO (link `/procurement/purchase-orders/[code]`).

### 4.4 Tab "Sản xuất"

List WO của dòng SP:

| WO code | Mã Z | Số lượng | Trạng thái | Thợ | Kết thúc |
|---|---|---|---|---|---|
| WO-0042 | Z0000002 | 3/3 | Completed | Thợ A | 18/04/2026 |

### 4.5 Tab "Giao hàng"

List `delivery_note` + status. Filter theo range ngày. Link `/deliveries/[code]` (nếu tồn tại V1.4+).

### 4.6 Tab "Tài chính"

(STUB cho V1.5 — chỉ hiển thị placeholder + nút "Coming soon V1.6". Không build logic.)

---

## 5. Drill-down drawer

Khi ở bất kỳ tab nào click vào 1 linh kiện (SKU), mở **drawer phải** (1/3 màn hình) chứa:

```
┌──── Drawer phải ───────────────────────────┐
│ [X đóng]                                   │
│                                            │
│  Thép tấm 5mm · SKU: THEP-001             │
│  [Hình ảnh nhỏ]                            │
│                                            │
│  ━━ PR liên quan ━━                         │
│   PR-2026-012 · 20kg · Chờ duyệt           │
│                                            │
│  ━━ PO liên quan ━━                         │
│   PO-2026-034 · 50kg · Đã đặt · ETA 22/4   │
│                                            │
│  ━━ WO liên quan ━━                         │
│   WO-0042 · Tiến độ 70% · Thợ A            │
│                                            │
│  ━━ Nhận hàng ━━                            │
│   RCV-0089 · 50kg · 18/04/2026 · QC PASS  │
│                                            │
│  [🔗 Mở trang vật tư →]                    │
└────────────────────────────────────────────┘
```

Component: `<ItemDetailDrawer>` — tái sử dụng ở Grid (cùng dùng cho Trụ cột 5).

Data source: mỗi section là 1 query riêng, memoized.

```ts
// apps/web/src/hooks/useItemLinkedDocs.ts
export function useItemLinkedDocs(itemId: string) {
  return useQueries({
    queries: [
      { queryKey: ["prs", itemId], queryFn: () => api.getPRsByItem(itemId) },
      { queryKey: ["pos", itemId], queryFn: () => api.getPOsByItem(itemId) },
      { queryKey: ["wos", itemId], queryFn: () => api.getWOsByItem(itemId) },
      { queryKey: ["rcvs",itemId], queryFn: () => api.getReceivingsByItem(itemId) },
    ],
  });
}
```

---

## 6. Tính tiến độ rollup

```
product_line.progress
    = AVG(bom_template.progress WHERE template IN product_line_member)

bom_template.progress
    = COUNT(bom_line WHERE derived_status IN ('received','in_production','completed','delivered'))
    / COUNT(bom_line WHERE template_id = X)
```

### 6.1 Query SQL

```sql
-- View materialized — refresh mỗi 5 phút hoặc on-demand
CREATE MATERIALIZED VIEW app.mv_bom_template_progress AS
SELECT
  bt.id                            AS template_id,
  COUNT(*)                         AS total_lines,
  COUNT(*) FILTER (WHERE bl.derived_status IN
    ('received','in_production','completed','delivered')) AS done_lines,
  ROUND(
    COUNT(*) FILTER (WHERE bl.derived_status IN
      ('received','in_production','completed','delivered'))::numeric
    * 100.0 / NULLIF(COUNT(*), 0),
    1
  ) AS progress_pct
FROM app.bom_template bt
LEFT JOIN app.bom_line bl ON bl.template_id = bt.id
GROUP BY bt.id;

CREATE UNIQUE INDEX ON app.mv_bom_template_progress (template_id);

-- Refresh concurrently
CREATE OR REPLACE FUNCTION app.fn_refresh_bom_progress()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY app.mv_bom_template_progress;
END;
$$ LANGUAGE plpgsql;
```

Gọi từ cron 5 phút 1 lần (BullMQ job `refresh-bom-progress`).

### 6.2 Product line rollup (không cần MV — query realtime)

```sql
SELECT
  pl.id,
  pl.name,
  ROUND(AVG(mv.progress_pct), 1) AS progress_pct
FROM app.product_line pl
LEFT JOIN app.product_line_member plm ON plm.product_line_id = pl.id
LEFT JOIN app.mv_bom_template_progress mv ON mv.template_id = plm.bom_template_id
WHERE pl.id = $1
GROUP BY pl.id, pl.name;
```

---

## 7. List page `/product-lines`

Grid card 3 cột (responsive):

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ [Image]     │ │ [Image]     │ │ [Image]     │
│ BĂNG TẢI    │ │ MÁY XAY     │ │ CỬA CUỐN    │
│ DIPPI       │ │ DẸT         │ │             │
│ 5 mã Z      │ │ 3 mã Z      │ │ 2 mã Z      │
│ ████░░ 68%  │ │ ████████94% │ │ ██░░░░ 31%  │
└─────────────┘ └─────────────┘ └─────────────┘
```

Component: `<ProductLineCard>`. Nuqs URL state: `q`, `status`, `page`.

---

## 8. API endpoints

| Method | Path | Action |
|---|---|---|
| GET | `/api/product-lines` | List + filter |
| POST | `/api/product-lines` | Tạo mới |
| GET | `/api/product-lines/[id]` | Detail |
| PATCH | `/api/product-lines/[id]` | Update header |
| DELETE | `/api/product-lines/[id]` | Soft delete (status=ARCHIVED) |
| POST | `/api/product-lines/[id]/members` | Add bom_template vào dòng |
| DELETE | `/api/product-lines/[id]/members/[bomId]` | Remove |
| GET | `/api/product-lines/[id]/rollup` | KPI + progress |
| GET | `/api/items/[id]/linked-docs` | PR/PO/WO/RCV theo item (dùng cho drawer) |

Files handler: `apps/web/src/app/api/product-lines/**`.

Repo: `apps/web/src/server/repos/productLine.ts`.

---

## 9. Cách test

| Test | Cách |
|---|---|
| Tạo product_line mới | POST API → DB có record mới, code unique |
| Thêm bom_template vào dòng | `INSERT product_line_member` → GET detail thấy |
| Progress tính đúng | Seed 3 bom_line (2 received, 1 null) → MV report 67% |
| Drawer hiện đủ 4 section | Click 1 item có full PR+PO+WO+RCV → đủ 4 card |
| Route `/product-lines/[id]` render <2s | Lighthouse |
| Filter nav-items.ts hiện "Dòng sản phẩm" đúng role | Login `admin` → sidebar có; login `operator` → không có |

---

## 10. Rủi ro

| Rủi ro | Giảm nhẹ |
|---|---|
| MV refresh chậm khi có 5000 bom_line | `REFRESH CONCURRENTLY` + schedule 5min; nếu vẫn chậm → partial refresh |
| User không biết mã Z thuộc dòng nào khi tạo mới | Wizard tạo product_line có bước "chọn mã Z" với autocomplete |
| Tab "Tài chính" stub gây confusion | Hiển thị placeholder rõ "V1.6 — coming soon", disable click |
| Drawer đổ dữ liệu 4 query song song làm chậm | `useQueries` parallel + skeleton từng section |

---

## 11. Files phải tạo/sửa

| Path | Action |
|---|---|
| `apps/web/src/app/(app)/product-lines/page.tsx` | CREATE |
| `apps/web/src/app/(app)/product-lines/new/page.tsx` | CREATE |
| `apps/web/src/app/(app)/product-lines/[id]/layout.tsx` | CREATE |
| `apps/web/src/app/(app)/product-lines/[id]/page.tsx` | CREATE |
| `apps/web/src/app/(app)/product-lines/[id]/edit/page.tsx` | CREATE |
| `apps/web/src/components/product-line/ProductLineHeader.tsx` | CREATE |
| `apps/web/src/components/product-line/ProductLineTabs.tsx` | CREATE |
| `apps/web/src/components/product-line/ProductLineCard.tsx` | CREATE |
| `apps/web/src/components/product-line/BomProgressCard.tsx` | CREATE |
| `apps/web/src/components/product-line/tabs/BomsTab.tsx` | CREATE |
| `apps/web/src/components/product-line/tabs/OrdersTab.tsx` | CREATE |
| `apps/web/src/components/product-line/tabs/ProcurementTab.tsx` | CREATE |
| `apps/web/src/components/product-line/tabs/ProductionTab.tsx` | CREATE |
| `apps/web/src/components/product-line/tabs/DeliveryTab.tsx` | CREATE |
| `apps/web/src/components/product-line/tabs/FinanceTab.tsx` | CREATE (stub) |
| `apps/web/src/components/bom-grid/ItemDetailDrawer.tsx` | CREATE (share với Trụ cột 5) |
| `apps/web/src/app/api/product-lines/**/route.ts` | CREATE (các endpoint §8) |
| `apps/web/src/app/api/items/[id]/linked-docs/route.ts` | CREATE |
| `apps/web/src/server/repos/productLine.ts` | CREATE |
| `apps/web/src/hooks/useProductLine.ts` | CREATE |
| `apps/web/src/hooks/useItemLinkedDocs.ts` | CREATE |
| `apps/web/src/lib/nav-items.ts` | EDIT — thêm `/product-lines` |
| `packages/db/migrations/0008c_mv_bom_progress.sql` | CREATE — materialized view |
| `apps/worker/src/jobs/refreshBomProgress.ts` | CREATE — cron 5min |

---

## 12. TODO checklist

- [ ] Migration MV `mv_bom_template_progress`
- [ ] Worker job refresh MV 5 phút
- [ ] Repo `productLine.ts`
- [ ] API endpoints 8 handler
- [ ] List page `/product-lines` + card
- [ ] Detail page `/product-lines/[id]` + 6 tab
- [ ] Drawer `<ItemDetailDrawer>` (reuse Trụ cột 5)
- [ ] Update nav-items.ts "Dòng sản phẩm"
- [ ] Test E2E tạo dòng SP → thêm mã Z → thấy progress
