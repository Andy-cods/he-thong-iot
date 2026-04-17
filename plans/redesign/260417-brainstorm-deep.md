# Brainstorm cấp thực thi — UI/UX Redesign Direction B

*Ngày:* 2026-04-17 · *Persona:* solution-brainstormer (brutal honesty)
*Tham chiếu:* [260417-brainstorm.md](./260417-brainstorm.md) · [260417-design-spec.md](./260417-design-spec.md) · [docs/design-guidelines.md](../../docs/design-guidelines.md) · [plans/design/260416-v1-wireframes.md](../design/260416-v1-wireframes.md)
*Scope:* mở rộng cấp implementation những phần 2 file trên CHƯA nói. Không lặp layout grid, không lặp token, không lặp wireframe ASCII.

> **Brutal honesty premise:** design spec đã rất dày visual — nhưng dev mở ra vẫn sẽ hỏi "state nằm đâu? URL schema? conflict Telex? offline replay order?". File này trả lời những câu đó.

---

## §1. Data flow & state management (per screen)

### 1.1 Phân tầng state — không dùng Redux/Zustand cho V1

Bốn tầng, mỗi dữ liệu rơi đúng 1 tầng. Dev vi phạm = code review bounce.

| Tầng | Công nghệ | Dùng cho | Lifetime |
|---|---|---|---|
| Server cache | TanStack Query v5 | items, suppliers, dashboard, po lines | 30s–5m stale, GC 10m |
| URL state | `nuqs` v1 (không tự làm) | filter, sort, page, tab | tới khi user navigate |
| Form state | react-hook-form + zod resolver | ItemForm, ImportWizard mapping, LineReceipt | tới khi unmount / submit |
| Client persistent | localStorage + cookie fallback | sidebar-collapsed, density, cmdk-recents, saved-mapping | cross-session |
| Offline persistent | Dexie v4 (IndexedDB) | scan_queue, po_lines cache PWA | tới khi sync success |

**Không dùng React Context cho data** — chỉ dùng cho theme/user/query-client provider. Mọi state dữ liệu phải qua 1 trong 5 tầng trên.

### 1.2 React Query keys — schema cố định

Key factory bắt buộc, không tự do. Tạo file `apps/web/src/lib/query-keys.ts`:

```ts
export const qk = {
  items: {
    all: ["items"] as const,
    list: (filters: ItemFilters) => ["items", "list", filters] as const,
    detail: (id: string) => ["items", "detail", id] as const,
    skuCheck: (sku: string) => ["items", "sku-check", sku] as const,
    bulkExport: (ids: string[]) => ["items", "bulk-export", ids.sort().join(",")] as const,
  },
  suppliers: {
    all: ["suppliers"] as const,
    list: (filters: SupplierFilters) => ["suppliers", "list", filters] as const,
  },
  dashboard: {
    overview: ["dashboard", "overview"] as const,
    alerts: ["dashboard", "alerts"] as const,
    systemHealth: ["dashboard", "system-health"] as const,
  },
  import: {
    preview: (fileHash: string) => ["import", "preview", fileHash] as const,
    job: (jobId: string) => ["import", "job", jobId] as const,
  },
  receiving: {
    po: (poId: string) => ["receiving", "po", poId] as const,
    queue: ["receiving", "queue"] as const,
  },
  auth: {
    me: ["auth", "me"] as const,
  },
} as const;
```

**Lý do sort trong bulkExport key:** tránh cache miss khi select order khác nhau nhưng cùng set id.

### 1.3 Invalidation strategy — cụ thể từng mutation

| Mutation | Invalidate | Optimistic? | Rollback trigger |
|---|---|---|---|
| `POST /items` | `qk.items.all` + `qk.dashboard.overview` | Không (SKU duplicate cần server check) | n/a |
| `PUT /items/:id` | `qk.items.detail(id)` + `qk.items.list(*)` prefix match | Có (rollback on 409/422) | server error, timeout 10s |
| `DELETE /items/:id` | `qk.items.all` | Có (remove from list immediately) | server 409 (FK constraint) |
| `POST /items/bulk` (status) | `qk.items.all` | Có | any error → toast + refetch |
| `POST /items/import/commit` | `qk.items.all` + `qk.dashboard.overview` | Không (async job) | polling job |
| `POST /receipts/:poId/commit` | `qk.receiving.po(poId)` + `qk.dashboard.overview` | n/a (offline-first) | Dexie keeps |
| `POST /auth/logout` | `queryClient.clear()` | n/a | n/a |

**Quy tắc prefix:** `queryClient.invalidateQueries({ queryKey: qk.items.all })` invalidate hết sub-tree. Không query id string raw.

### 1.4 Optimistic update cho Item CRUD — 3 flow

**Flow A: Edit name qua ItemQuickEditSheet:**
```
1. onMutate: cancel queries, snapshot old detail + list pages
2. setQueryData(detail, { ...old, name: newName })
3. setQueriesData(list prefix, patch matching id)
4. mutationFn gọi PUT
5. onError: restore 2 snapshot, toast danger "Không lưu được, đã khôi phục"
6. onSettled: invalidate (nhẹ vì optimistic đã hiển thị)
```

**Flow B: Bulk toggle active (3+ items):**
```
1. onMutate: không optimistic toàn bộ (10k row patch list tốn) — chỉ optimistic row đang visible
2. Dùng refetch on success thay optimistic cho list off-screen
3. Progress indicator trong BulkActionBar "Đang cập nhật 3/3..."
```

**Flow C: Delete single:**
```
1. Dialog confirm type "XOA"
2. onMutate: remove row khỏi list + show undo toast 5s (Sonner action button)
3. Undo click trong 5s → abort mutation (AbortController) + restore snapshot
4. Sau 5s → mutation actually fires
```

**Pattern Undo này chỉ cho delete single. Bulk delete KHÔNG undo** (phức tạp, user phải confirm kỹ).

### 1.5 URL-state serialization — dùng `nuqs` không tự làm

Tự viết `useSearchParams` + `router.replace` sẽ có 3 bug dev hay gặp: SSR hydration mismatch, race condition khi update nhanh, chuyển type int/bool thủ công. `nuqs` giải quyết cả 3. Install + dùng như sau:

```ts
// /items filter
import { useQueryStates, parseAsString, parseAsBoolean, parseAsInteger, parseAsStringEnum } from "nuqs";

const [filters, setFilters] = useQueryStates({
  q:        parseAsString.withDefault(""),
  type:     parseAsStringEnum(["RAW","FAB","SUB","FG"]).withDefault(null),
  uom:      parseAsString.withDefault(null),
  tracking: parseAsStringEnum(["lot","serial","none"]).withDefault(null),
  active:   parseAsBoolean.withDefault(null),
  sort:     parseAsString.withDefault("sku:asc"),
  page:     parseAsInteger.withDefault(1),
  size:     parseAsInteger.withDefault(50),
}, { history: "replace", shallow: true, throttleMs: 250 });
```

**Throttle 250ms** trùng với search debounce → 1 network call thay vì 2.

**Serialization rule:** null = omit param (URL sạch), false = omit (default hiểu là chưa filter). Chỉ encode khi khác default.

### 1.6 localStorage keys — namespace bắt buộc

Tiền tố `iot:` tránh đụng extension khác. Keys cụ thể:

| Key | Kiểu | Default | Ghi khi |
|---|---|---|---|
| `iot:sidebar-collapsed` | `"1" \| "0"` | `"0"` | user click toggle |
| `iot:items:density` | `"40" \| "56"` | auto theo viewport | user click toggle |
| `iot:items:columns-visible` | JSON array | preset | user ẩn cột |
| `iot:items:columns-widths` | JSON obj | defaults | user resize |
| `iot:cmdk:recents` | JSON array (max 10) | `[]` | sau mỗi select |
| `iot:cmdk:favorites` | JSON array | `[]` | user pin item |
| `iot:import:mapping-preset:items` | JSON `Record<source,target>` | `{}` | user tick "Lưu mapping" |
| `iot:pwa:sound-enabled` | `"1" \| "0"` | `"1"` | user toggle |
| `iot:pwa:last-po` | string | — | mở lại sau crash |

**SSR-safe read pattern:** cookie mirror cho `sidebar-collapsed` + `density` (server cần để render đúng lần đầu). Các key khác client-only, render sau hydration.

```ts
// cookie fallback
const sidebarCollapsed = cookies().get("iot-sidebar-collapsed")?.value === "1";
// client sync
useEffect(() => {
  const ls = localStorage.getItem("iot:sidebar-collapsed");
  if (ls !== null) document.cookie = `iot-sidebar-collapsed=${ls}; path=/; max-age=31536000; samesite=lax`;
}, [collapsed]);
```

### 1.7 Cookie strategy cho auth

- **Name:** `iot_session` (single source of truth trong `@iot/shared/constants.ts` — bug P1 §4.4 brainstorm cũ).
- **Flags:** `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800` (7d nếu remember) hoặc session (không Max-Age) nếu không.
- **SameSite=Lax không Strict:** Strict sẽ break redirect từ email magic link tương lai (V1.1), chọn Lax đủ an toàn CSRF vì mọi mutation có CSRF token.
- **CSRF double-submit:** cookie `iot_csrf` (JS-readable) + header `X-CSRF-Token` check server-side cho non-GET. Next.js server action auto handle, API routes phải tự check.
- **Refresh flow V1:** chưa làm refresh token — session 7d hard, hết → re-login. Đừng over-engineer.
- **Logout:** `Set-Cookie: iot_session=; Max-Age=0` + client `queryClient.clear()` + redirect `/login`.

---

## §2. Edge cases 8 components quan trọng

### 2.1 CommandPalette — Ctrl+K

**Ctrl+K conflict:** Chrome/Firefox mặc định Ctrl+K focus address bar (chỉ Firefox) hoặc search engine (browser tùy). Giải pháp:
- `preventDefault()` chỉ khi focus nằm trong app root (không phải input address bar — không thể, JS chạy rồi thì Ctrl+K đã vào app).
- Fallback shortcut `Ctrl+J` (không conflict) hiển thị trong tooltip nếu user báo conflict. Không cần built-in toggle V1.
- **macOS:** dùng `Cmd+K` (detect `navigator.platform.includes("Mac")`). Hiển thị shortcut đúng theo OS trong trigger button.

**Fuzzy vs exact search:**
- Navigation items (ít, fixed): exact prefix match (case-insensitive, normalize NFD).
- Item lookup (nhiều, dynamic): fuzzy với `fuse.js` weight: `sku×3, name×2, barcode×1`. Threshold 0.3.
- Action items: prefix-only (user gõ "thêm" → "Thêm vật tư" match, không cho "m vtt" match).
- **Server hit khi gõ ≥ 2 ký tự**, debounce 200ms. `<2` char → chỉ navigation + recents + actions local.

**Recent items storage:**
- Lưu `{id, type, label, visitedAt}` vào `iot:cmdk:recents` (max 10, FIFO).
- Hiển thị nhóm "Gần đây" trên cùng khi input rỗng.
- **Expire logic:** item quá 30 ngày không visit → drop khi mở palette (cleanup lazy).

**Permission-gated actions:**
- Action "Xoá vật tư" chỉ hiển thị khi `user.role === "admin"`.
- Action "Import" hiển thị cho admin + planner.
- Filter trong render, không hide sau khi fuzzy match (tránh match rồi disappear).

**Empty state:**
- Input rỗng: hiển thị 3 group Navigation / Gần đây / Gợi ý hành động.
- Có query, no match: "Không tìm thấy '{query}'. Bạn có muốn tìm trong toàn bộ vật tư?" + button full-search chuyển sang `/items?q={query}`.
- Loading (fuzzy server hit): spinner trong header input, giữ kết quả cũ (staleWhileRevalidate).

### 2.2 Items bulk action

**Select all vs page-only — phải phân biệt rõ:**
- Click checkbox header lần 1 → chọn 50 rows của trang hiện tại. Badge `Đã chọn 50 / 3.124`.
- Sau lần 1, xuất hiện banner mỏng trên table: `Đã chọn 50 trên trang này. [Chọn tất cả 3.124 khớp bộ lọc]`.
- Click link → chọn all-across-pages (state `selectionMode: "all-across-pages", excluded: Set<id>`).
- User uncheck 1 row trong all-across mode → move id vào `excluded`.
- Click header checkbox lần nữa → clear all.

**State shape:**
```ts
type Selection =
  | { mode: "none" }
  | { mode: "visible"; ids: Set<string> }          // tick tay từng row
  | { mode: "all-matching"; excluded: Set<string>; filtersSnapshot: ItemFilters };
```

**Snapshot filters:** khi chuyển sang `all-matching`, lưu filters hiện tại. Nếu user đổi filter → auto-reset selection về `none` (tránh confusion "tôi đang chọn gì").

**Action confirm flow:**
- Destructive (delete, deactivate): Dialog type-to-confirm "XOA". Show count + sample 3 SKU trong dialog.
- Non-destructive (export, change status active→inactive): Dialog nhẹ "Xác nhận cập nhật 50 vật tư?" với button confirm (không cần type).
- Với `all-matching` N > 500: warn sticky "Hành động này ảnh hưởng {N} vật tư. Không thể undo. Nên test với filter hẹp hơn trước." — và button Confirm chỉ enable sau 3s đọc.

### 2.3 ItemQuickEditSheet — unsaved changes + concurrent edit

**Unsaved changes warning:**
- Track qua `useFormState().isDirty` (react-hook-form).
- Close attempts (X button, Esc, click outside, route change): nếu dirty → AlertDialog "Thay đổi chưa lưu. Tiếp tục đóng?" [Huỷ thay đổi / Quay lại].
- `beforeunload` handler CHỈ khi dirty (tránh annoying).
- Submit thành công → `reset(newData)` để isDirty=false trước khi toast.

**Concurrent edit detection:**
- Server return `updated_at` trong item detail.
- Sheet form include hidden field `baseUpdatedAt = data.updated_at`.
- PUT request include `If-Unmodified-Since: <baseUpdatedAt>` header (hoặc body field `expected_version`).
- Server check: nếu DB `updated_at > expected_version` → 409 Conflict với body `{ current: Item }`.
- Client 409 handler: show Dialog "Vật tư này vừa được {currentUser} chỉnh sửa. [Xem khác biệt] [Ghi đè] [Huỷ]".
- "Xem khác biệt": merge view 2 cột (mine vs theirs), cho user pick từng field.
- V1 đơn giản hơn: chỉ show "Tải lại bản mới" button, user tự paste lại. "Diff merge" là V1.1.

**Optimistic rollback:**
- Snapshot `{ detail, listPage }` trước mutation.
- `onError`: `setQueryData` trả về snapshot. Toast danger với action "Thử lại" (keep form open, không đóng sheet).
- Nếu user đã đóng sheet trước khi error xảy ra (async fail) → toast có action "Mở lại để sửa".

### 2.4 Import Wizard ColumnMapper

**Auto-detect header VN/EN — fuzzy + synonym dict:**

Không cố gắng AI — làm dict cứng + Levenshtein đơn giản:

```ts
const synonymDict: Record<string, string[]> = {
  sku:         ["sku", "ma sku", "ma san pham", "mã sp", "ma vt", "code", "mã"],
  name:        ["tên", "ten", "name", "ten san pham", "tên vật tư", "product name"],
  type:        ["loai", "loại", "type", "phan loai", "phân loại", "category"],
  uom:         ["uom", "dvt", "đvt", "don vi", "đơn vị", "unit"],
  description: ["mo ta", "mô tả", "description", "note", "ghi chu", "ghi chú"],
  barcode:     ["barcode", "ma vach", "mã vạch", "ean", "upc"],
};
// normalize: toLowerCase + NFD + strip combining marks
// match: exact (score 100) → synonym (80) → Levenshtein ratio (min 0.7 × 60)
```

Auto-pre-select nếu score ≥ 80 single match. Nếu 2 source column cùng map 1 target → chọn cái score cao hơn, cái kia về `-- Bỏ qua --`. User override bất cứ lúc nào.

**Save mapping preset:**
- Checkbox "Lưu mapping này làm mặc định lần sau".
- Lưu `iot:import:mapping-preset:items` = `{ [sourceHeader]: targetField }`.
- Lần sau mở wizard + file có header trùng ≥ 60% → tự apply preset + banner "Đã áp dụng mapping đã lưu. [Reset về tự động]".

**Duplicate headers:**
- Excel cho phép cột trùng tên (Excel tự suffix `.1` khi mở lại). SheetJS đọc raw → có thể thấy 2 cột "Tên".
- Handle: nếu detect duplicate, append index vào display `Tên (1)`, `Tên (2)`. Internal key là col-index, không phải name.
- Banner warning: "File có 2 cột cùng tên 'Tên'. Chọn cột dùng cho trường `name`."
- Reject file nếu 2 cột cùng tên đều map tới cùng required field → validation error "Không thể map 2 cột cùng tới 1 trường".

**Edge case: header có cell rỗng:**
- Cột header rỗng → auto-label "Cột không tên (vị trí {letter})". User phải pick "-- Bỏ qua --" hoặc map thủ công. Banner "Cột {L} không có tên — sẽ bỏ qua nếu không map."

**File size guard:**
- > 10MB hoặc > 50k rows → reject trước khi upload. Toast "File quá lớn. Chia nhỏ thành nhiều lần hoặc liên hệ IT."
- Parse client-side (SheetJS) CHỈ header + 100 first data rows cho preview. Upload full file lên server ở bước commit. Tránh OOM browser tablet.

### 2.5 Receiving PWA — offline + conflicts

**Offline queue replay order — FIFO strict với dependency check:**

Queue schema Dexie:
```ts
interface QueueEntry {
  id: string;              // uuid v7 (time-ordered)
  poId: string;
  lineId: string;
  payload: LineReceipt;
  createdAt: number;       // Date.now()
  syncAttempts: number;
  lastError?: string;
}
```

Replay order:
1. Sort by `createdAt ASC` (uuid v7 giúp đảm bảo).
2. Gửi 1 request/lần (concurrency=1) — không parallel, tránh race condition cùng 1 PO line.
3. Success → delete entry khỏi queue + invalidate `qk.receiving.po(poId)`.
4. 4xx (validation, conflict) → move sang `failed_queue` table (cần manual review). Toast danger.
5. 5xx / network error → increment `syncAttempts`, backoff exponential `2^n seconds` max 60s, keep in queue.
6. Sau 5 lần fail → đẩy sang `failed_queue`.

**Conflict 2 devices cùng scan 1 PO line:**

Scenario: device A scan RM-0001 qty 400 lúc 14:20 (offline), device B scan RM-0001 qty 300 lúc 14:21 (online → commit ngay). Device A online lại 14:25.

Server side: endpoint commit là "append receipt event", không "overwrite line qty". Mỗi scan tạo 1 receipt_event riêng. PO line tổng = `SUM(events.qty)` với QC pass.

Client side: Device A sync 14:25 → server accept (700kg total > 500kg ordered). Server return warning `{ warning: "over_received", ordered: 500, received: 700 }`. Client toast warning "Đã nhận 700/500 kg (140%)". User review manual.

**Nguyên tắc:** KHÔNG "first write wins" hay "last write wins" vì đây là event append, không mutation state. Mỗi scan là fact độc lập.

**Camera permission denied fallback:**
- First permission request: delay cho tới khi user click "Quét" lần đầu (không request on mount, tránh spam permission dialog mobile).
- Deny → set localStorage `iot:pwa:camera-denied=1` → không request lại session này.
- UI: ẩn camera preview, highlight manual input lớn lên `h-14 text-xl`, auto-focus, USB keyboard wedge vẫn hoạt động bình thường.
- Banner sticky trên scanner panel: "Camera bị từ chối. [Cài lại quyền truy cập] (mở settings)". Link chrome://settings/content/camera cho desktop, instructions cho iOS/Android cho mobile.
- Sau F5 → recheck `permission.state` (nếu user grant lại trong settings) → xoá flag localStorage.

---

## §3. VN-specific interaction

### 3.1 Barcode USB (keyboard wedge) vs camera — phân biệt bằng timing

USB scanner gõ chuỗi ≤ 50ms cho 10-20 ký tự + trailing Enter. Human gõ ≥ 80ms/ký tự. Detect:

```ts
let buf = "";
let firstKeyAt = 0;
let lastKeyAt = 0;

function onKeyDown(e: KeyboardEvent) {
  const now = performance.now();
  if (buf.length === 0) firstKeyAt = now;

  if (e.key === "Enter") {
    const total = now - firstKeyAt;
    const avgInterval = total / buf.length;
    if (buf.length >= 6 && avgInterval < 30) {
      // SCANNER INPUT — apply directly, bypass focused input
      handleScan(buf);
      e.preventDefault();
    }
    // else: user gõ tay Enter normal, let it through
    buf = "";
    return;
  }

  if (e.key.length === 1) {
    buf += e.key;
    lastKeyAt = now;
  }

  // timeout 500ms reset buffer (tránh leftover từ scan trước)
  setTimeout(() => { if (now === lastKeyAt) buf = ""; }, 500);
}
```

Attach handler ở `window` level khi route `/pwa/*` active. **Prevent** default cho scan detection → input focused không chèn chuỗi. Chỉ trigger khi route PWA — tránh conflict với search input desktop.

### 3.2 Telex/VNI với shortcut

**Vấn đề:** Telex gõ "dd" = "đ", "aa" = "â". Shortcut như "g i" (goto items) gõ liên tiếp có thể bị IME nuốt nếu user đang bật Telex.

**Giải pháp:**
- Shortcut 2-ký tự dạng "G + I" (sequential, không đồng thời) — CHỈ active khi `document.activeElement` không phải input/textarea.
- Shortcut đơn "Ctrl+K", "Ctrl+S" — luôn preventDefault vì Ctrl+phím không trigger IME.
- Shortcut trong input ("/", "j", "k" trong items table) — chỉ nghe khi input KHÔNG focused. Dùng data-attribute `[data-shortcut-scope="table"]` + listener filter `e.target.closest('[data-shortcut-scope="table"]')`.
- Detect IME composition: `e.isComposing || e.keyCode === 229` → skip handler.

**Rule:** KHÔNG có shortcut chỉ dùng chữ cái latin thuần (trùng Telex compose). Ưu tiên Ctrl/Cmd/Alt combos.

### 3.3 Locale số — chọn `1.250.000,5` (vi-VN)

Postgres lưu numeric chuẩn `1250000.5`. UI dùng `Intl.NumberFormat("vi-VN")` → `1.250.000,5`.

**Input:**
- Component `<NumberInput>` wrap `<input inputMode="decimal">`.
- On type: accept cả `.` và `,` làm decimal separator (user copy từ Excel có thể gửi `1250000,5`).
- Parse: `parseVN(str) = Number(str.replace(/\./g, "").replace(",", "."))`.
- On blur: reformat về `1.250.000,5`.
- Paste Excel "1,250,000.50" → auto-normalize.

**Display:**
- Table cell right-align, `font-mono tabular-nums`, format `vi-VN` với max 2 decimals (configurable per field).
- Tiền: `{amount.toLocaleString("vi-VN", { style: "currency", currency: "VND" })}` → `1.250.000 ₫`.

**Export CSV/Excel:** dùng raw number `1250000.5`, không locale format. User open Excel tự render theo locale.

### 3.4 Date format dd/MM/yyyy

- Display: `dd/MM/yyyy` uniform (ItemUpdatedAt, POEta, ExpDate).
- Input: shadcn `DatePicker` với `date-fns` locale `vi`. Placeholder "dd/MM/yyyy".
- Parse từ Excel import: detect format `dd/MM/yyyy | yyyy-MM-dd | MM/dd/yyyy` bằng heuristic (column có values > 12 ở vị trí đầu → dd/MM).
- Store: ISO 8601 `yyyy-MM-dd` trong DB.
- Timezone: không lưu timezone cho date, chỉ date. Nếu cần timestamp → UTC, display `Asia/Ho_Chi_Minh` (UTC+7).
- Relative time ("2 giờ trước"): dùng `date-fns` + locale `vi` — cho activity log, không cho business field.

---

## §4. Performance concerns (10k SKU + low-end tablet)

### 4.1 TanStack Virtual row measurement — dynamic height

Items table spec có 2 chế độ (40/56). Suppliers/preview có thể wrap 2 lines → dynamic.

**Strategy:**
- Dùng `useVirtualizer` với `estimateSize: () => density === 40 ? 40 : 56` cho items (fixed per mode).
- Cho preview import (có thể wrap): dùng `measureElement` callback — nhưng CHỈ khi cần wrap. Mặc định fixed, override khi truncate=false.
- `overscan: 5` default, `overscan: 10` cho fast scroll (>500px/frame detect qua delta trong `onScroll`).

**Pitfall:** `estimateSize` sai → scroll jitter. Measure 1 lần với 10 sample rows, nếu variance < 10% → set fixed. Nếu > 10% → fallback measureElement.

**Bench target:** 10k rows, scroll liên tục, FPS ≥ 50 trên tablet Surface Go 2 gen (CPU Pentium 4425Y). Nếu fail → giảm column count mobile (đã spec §2.4), lazy-load cột phụ.

### 4.2 Sidebar collapsible layout shift — LCP

`width: 240px → 56px` transition 320ms gây CLS nếu content reflow bên trong.

**Giải pháp:**
- Dùng `grid-template-columns: var(--sidebar-width) 1fr` trên AppShell. Animate CSS custom property qua `@property --sidebar-width` (browser hỗ trợ: Chrome 85+, Safari 16.4+, Firefox 128+).
- Fallback (browser cũ): animate `width` + `content-visibility: auto` trên sidebar → content main không observe width animation.
- **SSR:** đọc cookie `iot-sidebar-collapsed`, render đúng width ngay lần đầu → LCP text không jump.
- Hydration mismatch avoidance: cookie sync với localStorage trong layout effect, không trong component client.

**LCP element:** Dashboard KPI row (first meaningful paint). Preload font `Be Vietnam Pro 700` (KPI number font) trong `<head>` — `next/font` tự làm nếu `preload: true`.

### 4.3 Service Worker cache strategy per route

Dùng Workbox custom (`next-pwa` abstraction quá cứng cho case này).

| Route pattern | Strategy | TTL | Lý do |
|---|---|---|---|
| `/_next/static/*` | CacheFirst | 1y | immutable hash filenames |
| `/icons/*`, `/illustrations/*` | CacheFirst | 30d | assets ổn định |
| `/fonts/*` | CacheFirst | 1y | font file immutable |
| `/api/items?*` | NetworkFirst, fallback cache 30s | 5m | fresh cho planner |
| `/api/dashboard/*` | NetworkFirst | 1m | khi offline vẫn show stale |
| `/api/receiving/po/:id` | NetworkFirst, **precache trước khi offline** | 1d | hot path tablet |
| `/api/auth/*` | NetworkOnly | — | never cache |
| `/pwa/*` (HTML shell) | StaleWhileRevalidate | 1d | load instant, update BG |
| `/items`, `/`, `/login` (HTML) | NetworkFirst với 2s timeout | — | prefer fresh |

**Precache PO list trên click "Nhận hàng" trước khi offline:**
- User click vào PO → trigger prefetch `/api/receiving/po/:id` + put vào cache manual.
- Service worker event listen `message` từ client với payload `{ type: "PRECACHE_PO", poId }` → fetch + cache.put.
- Khi offline vào route, cache hit → load instant.

**Update flow:** service worker new version → show toast "Có phiên bản mới. [Tải lại]" — không auto reload (đang scan giữa chừng reload là disaster). User confirm mới refresh.

---

## §5. Integration risk với P0 bugs

### 5.1 Search VN không dấu trước migration 0002 apply

Migration 0002 thêm `pg_trgm + unaccent` + GIN index. Nếu chưa apply → query `WHERE items.name ILIKE '%bánh răng%'` không match "banh rang".

**FE xử lý tạm thời (trước khi migration chạy):**
- Client-side normalize query trước gửi API: `q.normalize("NFD").replace(/\p{M}/gu, "")` → gửi param `q_unaccent`.
- Server-side fallback (trước migration): `WHERE unaccent(name) ILIKE unaccent($1)` — NHƯNG nếu extension chưa install thì crash. Giải pháp: thêm feature flag `FEATURE_UNACCENT=false` mặc định, set `true` sau khi apply migration.
- Khi `FEATURE_UNACCENT=false`: server chạy câu query đơn giản `ILIKE %q%` với raw input. User gõ "banh rang" → không match "bánh răng" → empty state.
- **Empty state tailor:** thêm hint "Thử gõ có dấu: 'bánh răng', 'búa'..." khi `FEATURE_UNACCENT=false` + result empty + query không có dấu (detect `/^[\x00-\x7F]+$/`).

**Banner dev-only:** trong dashboard system health strip, hiển thị `pg_trgm: ✕ off` khi flag off → nhắc admin apply migration.

### 5.2 Worker disabled → Import commit fail

Import wizard `POST /items/import/commit` expected async qua BullMQ worker. Worker chết → job stuck "pending" vô hạn.

**UI fallback:**
- Commit endpoint thử enqueue, nếu Redis/worker health check fail → API return 503 + body `{ code: "WORKER_UNAVAILABLE", fallback: "sync" }`.
- Client catch 503 → hiển thị Dialog "Hệ thống worker đang bảo trì. Xử lý đồng bộ (có thể chậm 5-15s)? [Huỷ / Tiếp tục]".
- User confirm → call `POST /items/import/commit-sync` — cùng logic nhưng chạy synchronous trong request handler, timeout 30s, throttle 1 request/user.
- Post-commit: refresh list, toast "Đã import 243 vật tư (chế độ đồng bộ)".

**Hard limit sync mode:** max 500 rows. File > 500 → hard error "Worker cần chạy. Liên hệ IT." (tránh timeout 30s).

**Tương lai khi worker chạy:** remove sync endpoint hoặc giữ làm backup. Priority: fix worker Dockerfile (P0 bug §4.3 brainstorm cũ) — đừng dựa sync hoài.

### 5.3 env.ts regex → DSN password edge case

Bug: password có `!`, `$`, `:`, `@` bị regex parse sai → DATABASE_URL sai → login fail intermittent.

**Risk cho redesign:**
- Nếu login flow đổi (Ctrl+K palette cho "Đăng xuất", redirect sau login từ `/app` → `/`) → khó debug khi DSN sai. Dev sẽ thấy 500 từ `/api/auth/login` nhưng thực tế là env chưa ghép DSN đúng.
- Unit test login E2E phải chạy với 5 password test case:
  - `ChangeMe!234` (bang + digit)
  - `p@ssw0rd` (at sign)
  - `P:ssword` (colon — edge)
  - `pass/word` (slash)
  - `hello world` (space → phải URL-encode)
- Playwright test preferred: start container với DATABASE_URL chứa các password trên, verify `/api/auth/login` 200.

**Fix chạy trước cook FE:**
```ts
// apps/web/src/lib/env.ts — new URL(), not regex
export function buildDsn(opts: { user: string; pass: string; host: string; port: number; db: string }) {
  const u = new URL(`postgres://${opts.host}:${opts.port}/${opts.db}`);
  u.username = encodeURIComponent(opts.user);
  u.password = encodeURIComponent(opts.pass);
  return u.toString();
}
```

Đơn vị test:
```ts
expect(buildDsn({ user: "u", pass: "p@ss:1!", host: "h", port: 5432, db: "d" }))
  .toBe("postgres://u:p%40ss%3A1%21@h:5432/d");
```

---

## §6. Kiến trúc file/folder bổ sung (dev blueprint)

Chỉ những file CHƯA có trong design spec §3 component list:

```
apps/web/src/
├── lib/
│   ├── query-keys.ts           ← §1.2
│   ├── query-client.ts         ← QueryClient config (staleTime, retry, refetchOnFocus)
│   ├── storage.ts              ← localStorage wrapper namespace "iot:"
│   ├── shortcuts.ts            ← global shortcut registry + IME detect
│   ├── vn-normalize.ts         ← NFD strip marks, parse VN number
│   ├── barcode-detector.ts     ← keyboard wedge timing detect
│   ├── dexie-db.ts             ← Dexie instance + migrations
│   ├── sw-register.ts          ← SW lifecycle + update prompt
│   └── env.ts                  ← sửa regex bug (§5.3)
├── hooks/
│   ├── use-debounced-value.ts
│   ├── use-sidebar-state.ts    ← cookie+ls sync
│   ├── use-selection.ts        ← Selection state machine §2.2
│   ├── use-unsaved-warn.ts     ← beforeunload + route change guard
│   ├── use-online-status.ts    ← navigator.onLine + fetch heartbeat
│   ├── use-scan-audio.ts       ← Web Audio API 880/220Hz beep
│   └── use-scan-queue.ts       ← Dexie queue hook
├── providers/
│   ├── query-provider.tsx
│   ├── toast-provider.tsx      ← Sonner config responsive position
│   └── csrf-provider.tsx       ← inject csrf token vào axios/fetch
└── workers/
    └── sw.ts                   ← Workbox custom SW
```

---

## §7. Test plan (ưu tiên)

Brainstorm cũ mention test generic — cụ thể hoá cho Direction B:

| Level | File | Cover |
|---|---|---|
| Unit | `lib/vn-normalize.test.ts` | parseVN/formatVN số, normalize không dấu, edge case decimal |
| Unit | `lib/barcode-detector.test.ts` | timing threshold, buffer reset, preventDefault Enter |
| Unit | `lib/env.test.ts` | buildDsn 5 password edge cases |
| Unit | `hooks/use-selection.test.tsx` | transition none→visible→all-matching, filter change reset |
| Component | `ItemQuickEditSheet.test.tsx` | unsaved warning, 409 conflict dialog, optimistic rollback |
| Component | `ColumnMapperStep.test.tsx` | auto-match synonym dict, duplicate headers, save preset |
| Component | `CommandPalette.test.tsx` | IME skip, macOS Cmd+K, permission filter, recents |
| Integration | `items-list.spec.ts` (Playwright) | URL filter persist, bulk select all-across, density toggle, keyboard nav |
| Integration | `login.spec.ts` | 5 password edge, captcha after 5 fail, rate limit 429 |
| Integration | `import-wizard.spec.ts` | 4 steps end-to-end, worker down fallback sync |
| E2E PWA | `receiving.spec.ts` (Playwright mobile emulation) | scan offline → online → commit, camera denied fallback |
| A11y | `axe.spec.ts` | 8 routes × (loaded, loading, empty, error) = 32 scans |
| Visual | `chromatic/*` hoặc Percy | 18 component × 3-5 state = ~70 snapshots |
| Perf | `lighthouse-ci.yml` | 4 routes CI budget score ≥ threshold |

**Budget thresholds Lighthouse:**
- Perf ≥ 90, LCP < 2s, CLS < 0.1, TBT < 200ms.
- A11y ≥ 95 (fail build nếu < 95).
- Best Practices = 100.

---

## §8. Checklist 27 quyết định cụ thể cho planner chốt

Mỗi dòng 1 quyết định binary. Planner tick hoặc add note.

- [ ] **D01.** Dùng `nuqs` cho URL state thay vì tự viết (khuyến nghị: Yes — risk thấp, 4KB bundle, maintain tốt).
- [ ] **D02.** Server cache: TanStack Query v5 thay SWR (khuyến nghị: Yes — prefix invalidation + optimistic mature hơn).
- [ ] **D03.** Không dùng global store (Redux/Zustand) cho V1, chỉ 5 tầng state §1.1 (khuyến nghị: Yes).
- [ ] **D04.** Auth cookie: tên `iot_session`, SameSite=Lax, 7d remember / session nếu không (khuyến nghị: Yes).
- [ ] **D05.** CSRF double-submit cookie + header `X-CSRF-Token` cho non-GET API routes (khuyến nghị: Yes V1).
- [ ] **D06.** Shortcut: hỗ trợ Ctrl+K và Cmd+K (detect OS), fallback Ctrl+J nếu user báo conflict (khuyến nghị: Yes).
- [ ] **D07.** CommandPalette server-search chỉ kích hoạt khi query ≥ 2 ký tự, debounce 200ms (khuyến nghị: Yes).
- [ ] **D08.** Recent items trong cmdk: lưu 10 entries, expire 30d, localStorage key `iot:cmdk:recents` (khuyến nghị: Yes).
- [ ] **D09.** Items bulk select: 3 mode `none / visible / all-matching` với snapshot filter (khuyến nghị: Yes — đúng UX enterprise).
- [ ] **D10.** Delete single có Undo toast 5s; bulk delete KHÔNG Undo, chỉ Dialog type-to-confirm (khuyến nghị: Yes).
- [ ] **D11.** Concurrent edit V1: chỉ detect 409 + prompt "Tải lại bản mới". Diff merge → V1.1 (khuyến nghị: Yes — YAGNI).
- [ ] **D12.** Import auto-mapping: dict synonym + Levenshtein ≥ 0.7, không dùng AI/LLM (khuyến nghị: Yes).
- [ ] **D13.** Import file guard: max 10MB, 50k rows, parse 100 rows preview client-side SheetJS (khuyến nghị: Yes).
- [ ] **D14.** Worker down fallback: endpoint `commit-sync` giới hạn 500 rows (khuyến nghị: Yes tạm thời tới khi worker fix).
- [ ] **D15.** Barcode USB wedge detect: buffer timing < 30ms/char, ≥ 6 chars, Enter submit (khuyến nghị: Yes).
- [ ] **D16.** IME skip: check `e.isComposing` trong mọi shortcut handler (khuyến nghị: Yes — bắt buộc).
- [ ] **D17.** Locale số: `vi-VN` display `1.250.000,5`, input accept cả `.` và `,`, DB store raw (khuyến nghị: Yes).
- [ ] **D18.** Date format UI: `dd/MM/yyyy`, DB ISO, timezone Asia/Ho_Chi_Minh cho timestamp (khuyến nghị: Yes).
- [ ] **D19.** Offline queue replay: concurrency=1, FIFO theo uuid v7, backoff expo max 60s, 5 lần fail → failed_queue (khuyến nghị: Yes).
- [ ] **D20.** PWA conflict 2 devices: server append receipt_event (không mutate line qty), warning over-received trả về client (khuyến nghị: Yes).
- [ ] **D21.** Camera permission: lazy request khi user click "Quét" lần đầu, deny → flag localStorage + fallback manual (khuyến nghị: Yes).
- [ ] **D22.** SW cache strategy: 9 rule phân biệt theo route pattern §4.3, precache PO trước khi offline (khuyến nghị: Yes).
- [ ] **D23.** SW update: toast "Có phiên bản mới. Tải lại" — user confirm, không auto reload (khuyến nghị: Yes — bắt buộc).
- [ ] **D24.** Sidebar width animate qua CSS `@property --sidebar-width`, cookie mirror SSR (khuyến nghị: Yes).
- [ ] **D25.** FE fallback khi migration 0002 chưa apply: normalize client-side + feature flag `FEATURE_UNACCENT` (khuyến nghị: Yes — bắt buộc vì migration chưa chạy).
- [ ] **D26.** Fix `lib/env.ts` dùng `new URL()` thay regex TRƯỚC khi cook FE (khuyến nghị: Yes — blocker, 2h).
- [ ] **D27.** Test plan: Playwright E2E cho login + items + import + receiving, axe-core 32 scans, Lighthouse CI budget (khuyến nghị: Yes).

**Thêm 3 quyết định phụ — nếu planner muốn mở rộng:**

- [ ] **D28.** (optional) Dùng `framer-motion` cho sheet spring + KPI counter roll-up hay thuần CSS (khuyến nghị: CSS, import FM chỉ nếu thực sự cần).
- [ ] **D29.** (optional) Visual regression test: Chromatic hay Percy hay tự build với `@playwright/experimental-ct-react` (khuyến nghị: Playwright visual — rẻ, CI đã có).
- [ ] **D30.** (optional) Dashboard mock data hay thực: tuần 3-4 mock (wireframe #2), tuần 5+ real khi order module ready (khuyến nghị: mock + feature flag).

---

## §9. Kết

File này là rider cho design spec — dev mở ra biết:
- State nằm tầng nào (§1).
- Edge case 8 component đã cover cụ thể (§2).
- VN-specific cần lib gì, detect gì (§3).
- Performance bench target cụ thể trên hardware gì (§4).
- P0 bug nào block FE merge, fix hướng nào (§5).
- Test trước khi PR merge cần pass cái gì (§7).
- 27 quyết định cần planner chốt trong ngày đầu sprint (§8).

**Next action:** planner đọc §8, tick → chốt. Nếu có item reject → viết rationale + alternative. Sau đó spawn cook agent với design-spec + brainstorm-deep + planner-decisions làm 3 input chính.

---

*End of brainstorm-deep. Version 1.0 — 2026-04-17.*
