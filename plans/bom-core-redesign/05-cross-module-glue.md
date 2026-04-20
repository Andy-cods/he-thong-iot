# Trụ cột 5 — Cross-module glue (Status tự sinh)

> **Estimate:** 4 ngày (32h).
> **Owner:** Thắng.
> **Dependency:** Trụ cột 1 (cột `bom_line.derived_status`) + Trụ cột 2 (Grid để update UI) + Trụ cột 4 (log STATUS_SYNC).

---

## 1. Vấn đề cần giải

Excel hiện tại có cột "Note" gõ tay: "đã nhận đủ 13/4", "giao 50%", "chưa gc"...
→ Anh Hoạt + thư ký phải **cập nhật thủ công** mỗi khi có sự kiện → lệch, quên, sai.

**Giải pháp:** Cột "Trạng thái" trong Grid là **read-only, auto-computed** từ các event đã xảy ra trong hệ thống (PR, PO, receiving, WO, delivery).

---

## 2. State machine — 8 trạng thái

```
        ┌────────────┐
        │ chưa bắt   │   ← derived_status IS NULL
        │    đầu     │
        └─────┬──────┘
              │ có PR (purchase_request)
              ▼
        ┌────────────┐
        │ đã yêu cầu │   requested
        │    mua     │
        └─────┬──────┘
              │ có PO
              ▼
        ┌────────────┐
        │ đã đặt     │   ordered
        │   hàng     │
        └─────┬──────┘
              │ PO confirmed (NCC xác nhận)
              ▼
        ┌────────────┐
        │ đang vận   │   in_transit
        │  chuyển    │
        └─────┬──────┘
              │ có receiving_receipt với QC pass
              ▼
        ┌────────────┐
        │   đã       │   received
        │   nhận     │
        └─────┬──────┘
              │ có WO dùng linh kiện này
              ▼
        ┌────────────┐
        │   đang     │   in_production
        │  sản xuất  │
        └─────┬──────┘
              │ WO completed
              ▼
        ┌────────────┐
        │ đã hoàn    │   completed
        │  thành     │
        └─────┬──────┘
              │ có delivery_note
              ▼
        ┌────────────┐
        │   đã       │   delivered
        │   giao     │
        └────────────┘
```

**Lưu ý:**
- Không phải mọi bom_line đều đi qua hết. VD: FG (finished goods) không cần `received` (không mua).
- State có thể nhảy lùi nếu event bị revert (receiving bị xoá, WO cancel).
- Partial qty: nếu nhận 50/100 → vẫn ở trạng thái `in_transit` (chưa đủ). Tooltip hiển thị "đã nhận 50% (50/100)".

---

## 3. Event sources

| Event | Bảng trigger | Sự kiện | Ảnh hưởng `derived_status` |
|---|---|---|---|
| PR created | `purchase_request_line` INSERT | 1 dòng BOM được yêu cầu mua | `→ requested` |
| PO created | `purchase_order_line` INSERT | 1 dòng BOM được đặt NCC | `→ ordered` |
| PO confirmed | `purchase_order` status=CONFIRMED | NCC đã xác nhận | `→ in_transit` |
| Receiving | `receiving_receipt_line` INSERT với qc_status=PASS | Kho nhận vật tư | `→ received` (partial hay full tuỳ qty) |
| WO started | `work_order` status=IN_PROGRESS | Thợ bắt đầu | `→ in_production` |
| WO completed | `work_order` status=COMPLETED | Thợ xong | `→ completed` |
| Delivery | `delivery_note_line` INSERT | Xe xuất kho | `→ delivered` |

---

## 4. Architecture — Event-driven, không trigger DB

**Lý do không dùng DB trigger:**
1. Khó test.
2. Không log được activity (trigger chạy trước khi có session userId).
3. Sidecar BullMQ worker handle dễ hơn.

### 4.1 Flow

```
┌────────────────────┐
│  API endpoint X    │ (VD: POST /api/receiving)
│  - Insert DB row   │
│  - logActivity()   │
│  - enqueue job     │──────┐
└────────────────────┘      │
                            ▼
                   ┌─────────────────────┐
                   │ BullMQ queue        │
                   │ "status-sync"       │
                   │ jobId = eventId     │
                   └────────┬────────────┘
                            ▼
┌──────────────────────────────────────────────────┐
│  apps/worker/src/jobs/statusSync.ts              │
│                                                  │
│  1. Lookup bom_line ảnh hưởng (join qua sku)    │
│  2. Compute new derived_status (state machine)   │
│  3. UPDATE bom_line SET derived_status=...       │
│  4. INSERT activity_log action=STATUS_SYNC       │
│  5. PG NOTIFY 'bom:cell:update' payload={...}    │
└──────────────────┬───────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────┐
│  SSE endpoint /api/bom/[id]/stream               │
│  listen PG NOTIFY → push event to client         │
└──────────────────┬───────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────┐
│  Client <UniverGrid> subscribe SSE               │
│  → patch cell (cột Status) không cần full reload │
└──────────────────────────────────────────────────┘
```

### 4.2 Worker pseudo-code

File: `apps/worker/src/jobs/statusSync.ts`.

```ts
export async function handleStatusSync(job: {
  eventKind: "PR_CREATED" | "PO_CREATED" | "PO_CONFIRMED" | "RECEIVING"
           | "WO_STARTED" | "WO_COMPLETED" | "DELIVERY";
  refId: string;       // id của PR/PO/RCV/WO/DN
  sku?: string;        // nếu có thể infer SKU direct
}) {
  // Step 1: tìm bom_line[] ảnh hưởng
  const affectedLines = await findAffectedBomLines(job);
  // affectedLines: Array<{ bomLineId, templateId, currentStatus }>

  for (const line of affectedLines) {
    // Step 2: recompute status
    const newStatus = await recomputeStatus(line.bomLineId);
    //   → query: có PR? có PO? PO confirmed? RCV đủ qty? WO in progress? ...
    //   → return enum string

    if (newStatus === line.currentStatus) continue;

    // Step 3: UPDATE
    await db.transaction(async (tx) => {
      await tx.update(bomLine)
        .set({
          derivedStatus:          newStatus,
          derivedStatusUpdatedAt: new Date(),
          derivedStatusSource:    { kind: job.eventKind, refId: job.refId },
        })
        .where(eq(bomLine.id, line.bomLineId));

      await tx.insert(activityLog).values({
        userId:     null,        // hệ thống
        entityType: "bom_line",
        entityId:   line.bomLineId,
        action:     "STATUS_SYNC",
        diffJson: {
          before: line.currentStatus,
          after:  newStatus,
          source: { kind: job.eventKind, refId: job.refId },
        },
      });

      // Step 4: PG NOTIFY
      await tx.execute(sql`
        SELECT pg_notify('bom_cell_update', ${JSON.stringify({
          templateId: line.templateId,
          bomLineId:  line.bomLineId,
          newStatus,
        })})
      `);
    });
  }
}
```

### 4.3 `recomputeStatus` logic

```ts
async function recomputeStatus(bomLineId: string): Promise<DerivedStatus | null> {
  const line = await db.query.bomLine.findFirst({ where: eq(bomLine.id, bomLineId) });
  if (!line) return null;

  const sku       = await getSkuFromBomLine(bomLineId);
  const parentQty = line.qtyPerParent * (templateTargetQty ?? 1);

  // Check theo thứ tự ngược (state cao → thấp)
  if (await hasDelivery(sku))                   return "delivered";
  if (await hasCompletedWO(sku))                return "completed";
  if (await hasInProgressWO(sku))               return "in_production";
  if (await hasReceivingFullQty(sku, parentQty))return "received";
  if (await hasConfirmedPO(sku))                return "in_transit";
  if (await hasAnyPO(sku))                      return "ordered";
  if (await hasAnyPR(sku))                      return "requested";
  return null;  // chưa bắt đầu
}
```

**Mỗi `hasXxx(sku)` là 1 query đơn giản** — join qua `item.sku`. Thêm index phù hợp để <50ms.

### 4.4 Trigger enqueue từ API

Ví dụ trong `POST /api/receiving/:id/commit`:

```ts
// apps/web/src/app/api/receiving/[id]/commit/route.ts
import { statusSyncQueue } from "@/server/services/importQueue";

await statusSyncQueue.add(
  "status-sync",
  { eventKind: "RECEIVING", refId: receivingId, sku: item.sku },
  { jobId: `rcv:${receivingId}`, removeOnComplete: 100 },
);
```

Tương tự cho:
- `POST /api/procurement/purchase-requests` → `PR_CREATED`
- `POST /api/procurement/purchase-orders` → `PO_CREATED`
- `PATCH /api/procurement/purchase-orders/[id]` (status=CONFIRMED) → `PO_CONFIRMED`
- `PATCH /api/work-orders/[id]` (status change) → `WO_STARTED` / `WO_COMPLETED`
- `POST /api/deliveries` → `DELIVERY`

---

## 5. Real-time update UI

### 5.1 Server-Sent Events endpoint

File: `apps/web/src/app/api/bom/[id]/stream/route.ts`.

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }) {
  const templateId = params.id;
  const stream = new ReadableStream({
    async start(controller) {
      const pgClient = await pgPool.connect();
      await pgClient.query(`LISTEN bom_cell_update`);

      pgClient.on("notification", (msg) => {
        const payload = JSON.parse(msg.payload ?? "{}");
        if (payload.templateId !== templateId) return;
        controller.enqueue(
          `data: ${JSON.stringify(payload)}\n\n`,
        );
      });

      req.signal.addEventListener("abort", () => {
        pgClient.query(`UNLISTEN bom_cell_update`).finally(() => pgClient.release());
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
```

### 5.2 Client subscribe

```ts
// apps/web/src/hooks/useBomGridStream.ts
export function useBomGridStream(
  bomId: string,
  onUpdate: (payload: CellUpdate) => void,
) {
  useEffect(() => {
    const es = new EventSource(`/api/bom/${bomId}/stream`);
    es.onmessage = (ev) => onUpdate(JSON.parse(ev.data));
    return () => es.close();
  }, [bomId]);
}
```

### 5.3 Apply patch vào Univer

```ts
useBomGridStream(bomId, (payload) => {
  const sheet = univerAPI.getActiveSheet();
  const row   = findRowByBomLineId(payload.bomLineId);
  sheet.getRange(row, STATUS_COL).setValue(statusVi(payload.newStatus));
});
```

---

## 6. UI chi tiết cột "Trạng thái"

### 6.1 Read-only

```ts
// Trong build-initial-snapshot.ts
cellData[row][STATUS_COL] = {
  v:  statusVi(line.derivedStatus),
  s:  STATUS_STYLE_ID[line.derivedStatus],  // preset màu
  // Block edit
  p:  { editable: false },
};
```

Univer có API `protection.setRangeProtection(range, { editable: false })`.

### 6.2 Tooltip nguồn gốc

Click cell → custom popover:

```
┌──────────────────────────────────┐
│ Trạng thái: Đã nhận              │
│ Tự sinh từ: PO #PO-2026-034     │
│ Nhận ngày 15/04/2026 · QC PASS   │
│ Người nhận: anh Quang            │
│                                  │
│ [🔗 Mở phiếu nhận →]             │
└──────────────────────────────────┘
```

Component: `<StatusCellPopover>`.

### 6.3 Nút "Override" cho admin

Nếu admin cần sửa tay (edge case):
- Menu cell right-click → "Sửa trạng thái thủ công"
- Dialog chọn enum + lý do.
- Insert activity_log action="MANUAL_OVERRIDE" với lý do.
- Lần tiếp theo event đến, system KHÔNG overwrite manual (flag `manual_lock=true` trong `derived_status_source.manual`).

---

## 7. Cross-module drawer

Reuse `<ItemDetailDrawer>` từ Trụ cột 3. Khi click vào 1 dòng BOM (ngoài cột status), mở drawer 4 section:

```
┌──── Drawer phải ────────────────────────┐
│ Thép tấm 5mm · THEP-001                 │
│                                         │
│ ━━ Yêu cầu mua (PR) ━━                   │
│  PR-2026-012 · 20kg · Chờ duyệt          │
│                                         │
│ ━━ Đơn mua (PO) ━━                       │
│  PO-2026-034 · 50kg · ETA 22/4           │
│                                         │
│ ━━ Lệnh SX (WO) ━━                        │
│  WO-0042 · 70% · Thợ A                   │
│                                         │
│ ━━ Nhận hàng ━━                           │
│  RCV-0089 · 50kg · 18/4 · QC PASS        │
│                                         │
│ [🔗 Mở trang vật tư]                     │
└─────────────────────────────────────────┘
```

API endpoint đã mô tả ở Trụ cột 3 §8: `GET /api/items/[id]/linked-docs`.

---

## 8. Cách test

| Test case | Kịch bản | Expected |
|---|---|---|
| Empty → requested | Tạo PR có item THEP-001 → grid tự chuyển "đã yêu cầu mua" | SSE push event <3s |
| Requested → ordered | Tạo PO cùng item | Grid chuyển "đã đặt hàng" |
| Ordered → in_transit | PATCH PO status=CONFIRMED | "đang vận chuyển" |
| Partial receive 50% | Receiving 50/100 | Vẫn "đang vận chuyển", tooltip "50%" |
| Full receive | Receiving thêm 50 nữa | "đã nhận" |
| Tooltip source | Click cell | Popover hiện "Tự sinh từ PO #..." |
| Manual override | Admin override → tạo mới PO | Không bị overwrite (lock) |
| SSE reconnect | Tắt server → bật lại | Client auto reconnect <5s |
| Activity log STATUS_SYNC | Receiving xong | DB có row user_id=NULL action=STATUS_SYNC |
| Rollback | Xoá receiving_receipt | Status quay về "đang vận chuyển" |

---

## 9. Rủi ro

| Rủi ro | Giảm nhẹ |
|---|---|
| `recomputeStatus` chậm >500ms khi BOM có 2000 dòng | Index trên `item.sku`, `receiving_event.sku`; process theo batch 100 line/job |
| SSE connection drop khi Cloudflare timeout 100s | Auto-reconnect client + heartbeat ping 30s |
| PG NOTIFY payload >8000 bytes | Chỉ gửi ID + newStatus, client refetch chi tiết nếu cần |
| Event race condition (2 event cùng SKU đến cùng lúc) | BullMQ `jobId` deterministic + serialize per SKU (queue per bomLine) |
| Derived status sai khi SKU có 2 PO active | State "đã đặt hàng" đơn giản (có ít nhất 1 PO open); qty logic partial detect |
| User mất niềm tin vì status sai | Tooltip nguồn gốc + nút Override + activity log rõ ràng |

---

## 10. Files phải tạo/sửa

| Path | Action |
|---|---|
| `apps/worker/src/jobs/statusSync.ts` | CREATE — worker job chính |
| `apps/worker/src/services/recomputeStatus.ts` | CREATE — state machine logic |
| `apps/worker/src/services/findAffectedBomLines.ts` | CREATE |
| `apps/web/src/server/services/statusSyncQueue.ts` | CREATE — wrapper BullMQ enqueue |
| `apps/web/src/app/api/bom/[id]/stream/route.ts` | CREATE — SSE |
| `apps/web/src/hooks/useBomGridStream.ts` | CREATE |
| `apps/web/src/components/bom-grid/StatusCellPopover.tsx` | CREATE — tooltip source |
| `apps/web/src/components/bom-grid/UniverGrid.tsx` | EDIT — subscribe SSE + patch cell |
| `apps/web/src/app/api/receiving/**/route.ts` | EDIT — enqueue after commit |
| `apps/web/src/app/api/procurement/**/route.ts` | EDIT — enqueue PR/PO |
| `apps/web/src/app/api/work-orders/**/route.ts` | EDIT — enqueue WO start/complete |
| `apps/web/src/app/api/deliveries/**/route.ts` | EDIT — enqueue delivery |
| `packages/shared/src/constants/status-vi.ts` | CREATE — map enum → VI |

---

## 11. TODO checklist

- [ ] State machine enum + mapping VI
- [ ] `recomputeStatus()` function + unit test 8 case
- [ ] Worker job `status-sync` + BullMQ setup
- [ ] Enqueue hooks ở API PR/PO/RCV/WO/Delivery
- [ ] SSE endpoint `/api/bom/[id]/stream`
- [ ] PG NOTIFY listen channel
- [ ] Client hook `useBomGridStream`
- [ ] Status cell render read-only + popover
- [ ] Override dialog admin
- [ ] Activity log STATUS_SYNC message template (Trụ cột 4 đã đặt)
- [ ] E2E: tạo PR → Grid tự đổi status <3s
