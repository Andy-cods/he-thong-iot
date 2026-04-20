# Trụ cột 4 — Activity Log + Undo theo người

> **Estimate:** 2 ngày (16h).
> **Owner:** Thắng.
> **Dependency:** Trụ cột 1 DONE (table `activity_log`). Trụ cột 2 IN-PROGRESS (Grid Univer để hook vào).

---

## 1. Hai tính năng, hai mục đích khác nhau

| Tính năng | Server hay Client? | Mục đích | Scope |
|---|---|---|---|
| **Activity Log** | Server (table `activity_log`) | Truy dấu ai làm gì, không xoá được | Vĩnh viễn (append-only) |
| **Undo / Ctrl+Z** | Client (IndexedDB) | Sửa nhanh khi lỡ tay, không phiền bạn khác | Per-user, 30 bước, reset khi logout |

**Quan trọng:** Undo không revert transaction DB — nó chỉ **phát sinh PATCH "ngược"** với cùng quyền user.

---

## 2. Activity Log — server side

### 2.1 Schema

Đã có ở Trụ cột 1 (`app.activity_log`). Trường `diff_json` chứa:

```jsonc
// Ví dụ cho action UPDATE_CELL
{
  "cellRef":  "C5",        // ô tương ứng
  "field":    "quantity",  // logical field name
  "bomLineId":"uuid-abc",
  "before":   6,
  "after":    8,
  "sheetId":  "default"
}

// Ví dụ ADD_ROW
{
  "bomLineId":"uuid-new",
  "position": 12,
  "componentItemId":"uuid-xyz",
  "qty":      5
}

// Ví dụ FORMAT
{
  "range":    "A1:C10",
  "type":     "conditional_format",
  "presetId": "status-received"
}

// Ví dụ STATUS_SYNC (Trụ cột 5 emit)
{
  "bomLineId":"uuid-abc",
  "field":    "derived_status",
  "before":   "ordered",
  "after":    "received",
  "source":   { "kind": "receiving_event", "refId": "rcv-0012" }
}
```

### 2.2 Service

File: `apps/web/src/server/services/activityLog.ts`.

```ts
export async function logActivity(args: {
  userId: string | null;   // null khi event tự động (status sync)
  entityType: "bom_template" | "bom_line" | "product_line" | "alias_supplier";
  entityId: string;
  action: "CREATE" | "UPDATE_CELL" | "DELETE_ROW" | "ADD_ROW"
        | "FORMAT" | "IMPORT" | "STATUS_SYNC" | "UNDO";
  diff: Record<string, unknown>;
  req?: { ip?: string; userAgent?: string };
}): Promise<void> {
  await db.insert(activityLog).values({
    userId:     args.userId,
    entityType: args.entityType,
    entityId:   args.entityId,
    action:     args.action,
    diffJson:   args.diff,
    ipAddress:  args.req?.ip ?? null,
    userAgent:  args.req?.userAgent ?? null,
  });
}
```

Gọi từ:
- `POST /api/bom/[id]/grid` (mỗi cell edit).
- `POST /api/product-lines` (create).
- Event handlers Trụ cột 5 (status sync).

### 2.3 API đọc log

```
GET /api/activity-log?entityType=bom_template&entityId=XXX&limit=50&cursor=...
```

Response:

```jsonc
{
  "items": [
    {
      "id": 12345,
      "at": "2026-04-20T14:22:08Z",
      "user": { "id": "...", "displayName": "anh Hoạt" },
      "action": "UPDATE_CELL",
      "message": "anh Hoạt đã sửa R01.Quantity từ 6 thành 8",  // rendered server-side
      "diff": { ... }
    }
  ],
  "nextCursor": "..."
}
```

### 2.4 UI — Tab "Lịch sử" trong `/bom/[code]`

Layout 3 cột:

```
┌──────────────────────────────────────────────────────┐
│  [📋 BOM Grid] [📊 Tiến độ] [📝 Lịch sử] [🔗 Liên kết]│
├──────────────────────────────────────────────────────┤
│  20/04/2026                                           │
│   🟢 14:22 · anh Hoạt đã sửa R01.Quantity 6 → 8       │
│   🟢 14:20 · anh Hoạt đã thêm dòng mới ID V03         │
│   🟡 13:50 · hệ thống · V01 chuyển sang "Đã nhận"     │
│   🟢 13:45 · Thắng đã áp dụng preset Tiến độ          │
│  19/04/2026                                           │
│   ...                                                 │
└──────────────────────────────────────────────────────┘
```

Component: `<ActivityLogTab>`. Tải cursor-paginated. Filter theo: action, user, date range.

### 2.5 Message templates tiếng Việt (10 mẫu)

File: `apps/web/src/lib/activity-log/messages.ts`.

```ts
export function renderActivityMessage(log: ActivityLog): string {
  const u = log.user?.displayName ?? "hệ thống";
  const d = log.diffJson as any;

  switch (log.action) {
    case "CREATE":
      return `${u} đã tạo ${entityLabel(log.entityType)} mới`;

    case "UPDATE_CELL":
      return `${u} đã sửa ${d.cellRef}.${fieldVi(d.field)} từ "${d.before}" thành "${d.after}"`;

    case "ADD_ROW":
      return `${u} đã thêm dòng mới ${d.componentSku ?? d.bomLineId}`;

    case "DELETE_ROW":
      return `${u} đã xoá dòng ${d.componentSku ?? d.bomLineId}`;

    case "FORMAT":
      return `${u} đã áp dụng định dạng ${presetLabel(d.presetId)} cho vùng ${d.range}`;

    case "IMPORT":
      return `${u} đã nhập ${d.rowCount} dòng từ file ${d.fileName}`;

    case "STATUS_SYNC":
      return `hệ thống cập nhật ${d.bomLineSku}: ${statusVi(d.before)} → ${statusVi(d.after)} (${sourceLabel(d.source)})`;

    case "UNDO":
      return `${u} đã hoàn tác: ${d.originalMessage}`;

    default:
      return `${u} đã thực hiện ${log.action}`;
  }
}

const STATUS_VI: Record<string, string> = {
  planned:       "chưa bắt đầu",
  requested:     "đã yêu cầu mua",
  ordered:       "đã đặt hàng",
  in_transit:    "đang vận chuyển",
  received:      "đã nhận",
  in_production: "đang sản xuất",
  completed:     "đã hoàn thành",
  delivered:     "đã giao",
};

const FIELD_VI: Record<string, string> = {
  quantity:          "Số lượng",
  standardNumber:    "Tiêu chuẩn",
  supplier:          "NCC",
  visiblePartSize:   "Kích thước",
  description:       "Ghi chú",
};
```

---

## 3. Undo client-side — IndexedDB

### 3.1 Library

Dùng `idb-keyval` (~1KB, zero dep) thay vì `dexie` (40KB).

```bash
pnpm -F @iot/web add idb-keyval
```

### 3.2 Data structure

```ts
// apps/web/src/lib/undo/types.ts
export type UndoStep = {
  id:         string;            // nanoid
  userId:     string;            // từ session
  bomId:      string;
  timestamp:  number;            // Date.now()
  action:     "UPDATE_CELL" | "ADD_ROW" | "DELETE_ROW" | "FORMAT";
  before:     unknown;           // state "ngược" để apply khi undo
  after:      unknown;           // current state (dùng cho redo)
  cellRange?: string;            // VD "C5", "A1:C10"
  originalMessage: string;       // để hiển thị trong toast undo
};

export type UndoQueue = {
  userId: string;
  bomId:  string;
  steps:  UndoStep[];            // max 30
  position: number;              // index hiện tại (cho redo)
};
```

### 3.3 Storage

Key pattern: `undo:${userId}:${bomId}` → value = `UndoQueue`.

```ts
// apps/web/src/lib/undo/store.ts
import { get, set, del } from "idb-keyval";

export async function pushUndoStep(step: UndoStep) {
  const key = `undo:${step.userId}:${step.bomId}`;
  const q: UndoQueue = (await get(key)) ?? {
    userId: step.userId, bomId: step.bomId, steps: [], position: -1,
  };
  // Cắt nhánh redo khi user action mới sau undo
  q.steps = q.steps.slice(0, q.position + 1);
  q.steps.push(step);
  // Cap 30
  if (q.steps.length > 30) q.steps.shift();
  q.position = q.steps.length - 1;
  await set(key, q);
}

export async function popUndo(userId: string, bomId: string): Promise<UndoStep | null> {
  const key = `undo:${userId}:${bomId}`;
  const q: UndoQueue | undefined = await get(key);
  if (!q || q.position < 0) return null;
  const step = q.steps[q.position];
  q.position -= 1;
  await set(key, q);
  return step;
}

export async function popRedo(userId: string, bomId: string): Promise<UndoStep | null> {
  const key = `undo:${userId}:${bomId}`;
  const q: UndoQueue | undefined = await get(key);
  if (!q || q.position >= q.steps.length - 1) return null;
  q.position += 1;
  const step = q.steps[q.position];
  await set(key, q);
  return step;
}

export async function clearUndoOnLogout(userId: string) {
  // Duyệt tất cả key undo:$userId:* và xoá
  const keys = (await keys()).filter((k) =>
    typeof k === "string" && k.startsWith(`undo:${userId}:`),
  );
  await Promise.all(keys.map((k) => del(k)));
}
```

### 3.4 Hook

```ts
// apps/web/src/hooks/useUndoRedo.ts
export function useUndoRedo(bomId: string) {
  const { user } = useSession();
  const applyPatch = useMutation({ mutationFn: patchGridCell });

  const undo = useCallback(async () => {
    const step = await popUndo(user.id, bomId);
    if (!step) {
      toast("Không còn gì để hoàn tác");
      return;
    }
    await applyPatch.mutateAsync({
      bomId,
      cellRange: step.cellRange,
      value:     step.before,
      isUndo:    true,        // server log action=UNDO
    });
    toast(`Đã hoàn tác: ${step.originalMessage}`);
  }, [bomId, user.id]);

  const redo = useCallback(async () => { /* tương tự popRedo */ }, []);

  useHotkey("mod+z", undo);
  useHotkey("mod+shift+z", redo);

  return { undo, redo };
}
```

### 3.5 Hook vào Univer edit event

```ts
// apps/web/src/components/bom-grid/UniverGrid.tsx (tiếp §10 Trụ cột 2)

univerAPI.addEvent(univerAPI.Event.BeforeSheetEditEnd, (ev) => {
  // Capture "before" value TRƯỚC khi cell update
  const cell = univerAPI.getActiveSheet().getRange(ev.row, ev.col);
  undoBuffer.setBefore(cell.getValue());
});

univerAPI.addEvent(univerAPI.Event.SheetEditEnded, async (ev) => {
  const cell  = univerAPI.getActiveSheet().getRange(ev.row, ev.col);
  const after = cell.getValue();
  await pushUndoStep({
    id:         nanoid(),
    userId:     user.id,
    bomId,
    timestamp:  Date.now(),
    action:     "UPDATE_CELL",
    before:     undoBuffer.getBefore(),
    after,
    cellRange:  rangeToA1(ev.row, ev.col),
    originalMessage: `sửa ${rangeToA1(ev.row, ev.col)} ${before} → ${after}`,
  });
});
```

---

## 4. UI toolbar

Override nút Undo/Redo của Univer thành nút riêng sử dụng hook trên:

```tsx
// apps/web/src/components/bom-grid/GridToolbar.tsx
export function GridToolbar({ bomId }: { bomId: string }) {
  const { undo, redo } = useUndoRedo(bomId);
  return (
    <div className="flex gap-2 border-b p-2">
      <Button size="sm" variant="ghost" onClick={undo} title="Hoàn tác (Ctrl+Z)">
        <Undo2 className="h-4 w-4" /> Hoàn tác
      </Button>
      <Button size="sm" variant="ghost" onClick={redo} title="Làm lại (Ctrl+Shift+Z)">
        <Redo2 className="h-4 w-4" /> Làm lại
      </Button>
      {/* ... nút khác */}
    </div>
  );
}
```

Tắt Univer built-in undo:

```ts
// Trong createUniver config
presets: [
  UniverSheetsCorePreset({ container, disableUndoRedo: true }),
  // ^ nếu preset không support → override qua command registry
]
```

---

## 5. Clear trên logout

```ts
// apps/web/src/app/api/auth/logout/route.ts (hook client-side cũng)
import { clearUndoOnLogout } from "@/lib/undo/store";

// Trong client-side logout handler
await logoutApi();
await clearUndoOnLogout(currentUser.id);
router.push("/login");
```

---

## 6. Cách test

| Test | Thao tác | Expected |
|---|---|---|
| Undo sau 1 edit | Sửa C5 6→8 → Ctrl+Z | Cell về 6, toast "Đã hoàn tác" |
| Redo sau undo | Ctrl+Z → Ctrl+Shift+Z | Cell về 8 |
| 30 bước max | Edit 35 cells → reload | Queue chỉ còn 30 gần nhất |
| Cut nhánh redo | Edit A → Ctrl+Z → Edit B → Ctrl+Shift+Z | Redo không có (bị cắt) |
| Logout clear | Edit → Logout → Login lại → Ctrl+Z | "Không còn gì để hoàn tác" |
| Activity log message VI | Sửa cell → GET /api/activity-log | message "anh Hoạt đã sửa ..." |
| Activity log append-only | Thử UPDATE trực tiếp DB | EXCEPTION từ trigger |
| Status sync log | Nhận hàng → log new row action=STATUS_SYNC | "hệ thống cập nhật ..." |

---

## 7. Rủi ro

| Rủi ro | Giảm nhẹ |
|---|---|
| IndexedDB bị browser xoá (private mode, low storage) | Fallback: mất undo chỉ khó chịu, server log vẫn còn. Toast "Trình duyệt không lưu được undo" khi write fail |
| Undo áp dụng patch lỗi thời (server state đã đổi bởi user khác) | PATCH kèm ETag; nếu conflict → toast "Không hoàn tác được vì ai đó vừa sửa" |
| 2 user cùng edit, undo của user A làm mất edit user B | V1.5 single-user; V1.6 thêm cảnh báo "user B đang edit" |
| Activity log phình table | INSERT-heavy nhưng select nhẹ; partition theo month V1.6 nếu >10M row |
| Rendering 10000 log entry chậm | Virtualized list + cursor pagination 50/page |

---

## 8. Files phải tạo/sửa

| Path | Action |
|---|---|
| `apps/web/src/server/services/activityLog.ts` | CREATE |
| `apps/web/src/app/api/activity-log/route.ts` | CREATE (GET) |
| `apps/web/src/server/repos/activityLog.ts` | CREATE |
| `apps/web/src/lib/activity-log/messages.ts` | CREATE (10 template VI) |
| `apps/web/src/lib/undo/store.ts` | CREATE (idb-keyval wrapper) |
| `apps/web/src/lib/undo/types.ts` | CREATE |
| `apps/web/src/hooks/useUndoRedo.ts` | CREATE |
| `apps/web/src/components/bom-grid/GridToolbar.tsx` | EDIT (nút Undo/Redo) |
| `apps/web/src/components/activity-log/ActivityLogTab.tsx` | CREATE |
| `apps/web/src/components/activity-log/ActivityLogItem.tsx` | CREATE |
| `apps/web/src/hooks/useActivityLog.ts` | CREATE |
| `apps/web/src/app/api/auth/logout/route.ts` | EDIT — trigger clearUndoOnLogout |

---

## 9. TODO checklist

- [ ] Service `activityLog.logActivity()`
- [ ] API `GET /api/activity-log` + cursor paging
- [ ] Message templates VI 10 mẫu
- [ ] `idb-keyval` store + types
- [ ] Hook `useUndoRedo` + hotkeys Ctrl+Z/Ctrl+Shift+Z
- [ ] Hook vào Univer edit events
- [ ] Tab "Lịch sử" trong `/bom/[code]`
- [ ] Clear IndexedDB on logout
- [ ] Unit test messages.ts render 10 case
- [ ] E2E test undo scenario
