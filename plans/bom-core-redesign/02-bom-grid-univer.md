# Trụ cột 2 — BOM Grid kiểu Excel (Univer)

> **Estimate:** 5 ngày (40h) — dài nhất trong 5 trụ cột, cũng là phần có giá trị cao nhất.
> **Owner:** Thắng.
> **Dependency:** Trụ cột 1 DONE (cột `univer_snapshot` tồn tại).

## ⚡ Update 2026-04-20 — corrections sau khi install thực tế

Researcher agent xác minh qua `npm view` → các correction sau:

| Plan gốc | Thực tế | Action |
|---|---|---|
| Univer v0.5+ | **v0.21.0** (stable Apr 2026) | Dùng `@univerjs/presets@^0.21.0` |
| `@univerjs/preset-sheets-advanced` | ❌ Commercial (DreamNum, `@univerjs-pro/*`) | **BỎ** khỏi V1.5 scope |
| `@univerjs/sheets-clipboard` | ❌ Không tồn tại (bundle trong `sheets-ui` transitive) | Không cài trực tiếp |
| `@univerjs/sheets-exchange` | ❌ Commercial | V1.5 bỏ export XLSX. CSV dùng papaparse (V1.6) |
| `@univerjs/core/design/docs/engine-render` | Transitive của presets | **KHÔNG cài trực tiếp** (tránh duplicate plugin) |

**Install lệnh đúng (đã chạy, commit 0eb8):**
```bash
pnpm -F @iot/web add @univerjs/presets@^0.21.0 @univerjs/preset-sheets-core@^0.21.0 rxjs
```

**Vi-VN locale:** có sẵn tại `@univerjs/preset-sheets-core/locales/vi-VN` → KHÔNG cần tự dịch 50 key. Import `LocaleType.VI_VN`.

**Next.js 14 pitfall chính:** Univer touch `window` ở import time → BẮT BUỘC `next/dynamic({ ssr: false })`. File `UniverSpreadsheetLazy.tsx` đã wrap.

**React StrictMode (reactStrictMode: true):** double-mount làm plugin register 2 lần → dùng ref guard `initedRef` trong `UniverSpreadsheet.tsx` + `univer.dispose()` trong cleanup.

---

## 1. Tại sao Univer?

Chúng ta đã brainstorm 4 vòng và chốt dùng **Univer** (https://univer.ai, Apache 2.0) thay vì Handsontable/AG Grid/TanStack Table vì:

| Tiêu chí | Univer | Handsontable | AG Grid | Lý do chọn |
|---|---|---|---|---|
| Giá | Free (Apache 2.0) | $695/dev/năm | Community free, Enterprise $999 | Univer dùng thương mại tự do |
| Merge cell | ✅ built-in | ✅ | ⚠️ chỉ Enterprise | Excel mẫu Song Châu dùng merge nhiều |
| Conditional format | ✅ built-in | ⚠️ phải code tay | ⚠️ manual | Nút thắt: UX "tô màu theo trạng thái" |
| Formula engine | ✅ SUM/IF/VLOOKUP | ⚠️ Pro only | ❌ | Anh Hoạt muốn gõ =SUM() |
| Copy/paste Excel giữ format | ✅ `@univerjs/sheets-clipboard` | ⚠️ HTML only | ⚠️ CSV only | **Điểm then chốt** |
| Export .xlsx | ✅ `@univerjs/sheets-exchange` | ⚠️ Pro | ⚠️ Pro | Kế toán cần xuất |
| Undo stack | ✅ built-in | ✅ | ⚠️ tự code | Trụ cột 4 reuse |
| i18n | ✅ | ✅ | ⚠️ phải wrap | Vi-VN có sẵn key |
| Bundle size | ~500KB gzip | ~350KB | ~400KB | Chấp nhận được (dynamic import) |
| React 18 | ✅ `@univerjs/presets` | ✅ | ✅ | — |

---

## 2. Kiến trúc tổng thể

```
┌────────────────────────────────────────────────────────────────┐
│  /bom/[code] route (Next.js App Router)                        │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ <BomGridPage>                                            │  │
│  │   ├─ <Header>  (tên BOM + nút Xuất xlsx + Hoàn tác)     │  │
│  │   ├─ <Suspense fallback={<GridSkeleton/>}>               │  │
│  │   │    <UniverGrid bomId={id} snapshot={initial}/>       │  │
│  │   │      ^ dynamic import chunked                        │  │
│  │   ├─ <RightDrawer>  (cross-module — Trụ cột 5)           │  │
│  │   └─ <HistoryTab>   (Activity Log — Trụ cột 4)           │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                            │
                            │  debounced save 2s
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  POST /api/bom/[id]/grid                                        │
│  body: { univerSnapshot: <jsonb 80-120KB>, etag: string }      │
│  → UPDATE bom_template SET univer_snapshot=$1, ... WHERE id=$2  │
│  → INSERT activity_log (action=UPDATE_CELL, diff_json=...)      │
└────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  Background: derivedStatus watcher (Trụ cột 5)                  │
│    listen PG NOTIFY → recompute status cell                     │
│    → emit WebSocket/SSE "bom:grid:cell-update"                  │
│    → client patch Univer cell without full reload               │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. POC — 2 ngày đầu

### Ngày 1: setup + render

- Route mới: `apps/web/src/app/(app)/playground/univer/page.tsx` (dùng để demo, xoá sau khi merge chính thức).
- Install:
  ```bash
  pnpm -F @iot/web add @univerjs/presets @univerjs/preset-sheets-core @univerjs/preset-sheets-advanced
  pnpm -F @iot/web add @univerjs/sheets-clipboard @univerjs/sheets-exchange
  pnpm -F @iot/web add @univerjs/core @univerjs/design @univerjs/docs @univerjs/engine-render
  ```
- Test render: cứng data từ `docs/samples/Z0000002-502653_BANG_TAI_DIPPI.xlsx` (100 dòng) → confirm trang load <2s.

### Ngày 2: persist + load

- API endpoint:
  - `GET  /api/bom/[id]/grid` → `{ snapshot: jsonb, etag: string }`
  - `POST /api/bom/[id]/grid` → body `{ snapshot, etag }` (ETag optimistic lock).
- Component `<UniverGrid>`:
  - Mount → `useQuery` fetch snapshot.
  - Nếu `snapshot === null` → build initial từ `bom_line[]` (xem §5 column spec).
  - Sub vào `FUniver` event `SheetEditEnded` → debounce 2s → `useMutation` POST.

**Tiêu chí qua POC (sau ngày 2):**

- [ ] Trang mở <2s ở chế độ cache cold.
- [ ] Sửa 1 cell → 2s sau DB update `univer_snapshot`.
- [ ] Refresh trang → state giữ nguyên (cell đã sửa).
- [ ] Copy range 3×5 → paste vào Excel thật → giữ đúng text (format phase 2).

Nếu POC FAIL ở bất kỳ checkbox nào → **STOP**, báo anh Hoạt, thảo luận fallback (Handsontable hoặc table HTML nâng cấp).

---

## 4. Column spec — map 1:1 với Excel mẫu Song Châu

Bảng dưới là thứ tự cột chuẩn của Grid, khớp với 3 file Excel mẫu đã inspect:

| # | Cột Excel | Cột Grid Univer | Type | Editable | Ghi chú |
|---|---|---|---|---|---|
| A | Image | Image | IMG cell | Read | Render từ `item.image_url` |
| B | ID Number | ID | STRING | R/W | `bom_line.component_item_id` → `item.sku` |
| C | Quantity | Số lượng | NUMBER | R/W | `bom_line.qty_per_parent` |
| D | Standard Number | Tiêu chuẩn | STRING | R/W | `bom_line.metadata.standardNumber` (free text) |
| E | Sub Category | Nhóm | STRING | R/W | `item.category` (mirror, update hai chiều cần chốt) |
| F | NCC | Nhà cung cấp | STRING + alias | R/W | Nếu gõ alias (VD "GTAM") → popup "NCC Gold Thai Am Minh?" Y/N |
| G | Visible Part Size | Kích thước lộ ra | STRING | R/W | `bom_line.metadata.visiblePartSize` |
| H | SL | Tổng cần | **FORMULA** | Computed | `=C × [parent qty]` (tự sinh) |
| I | Status | Trạng thái | **READ-ONLY** | Read | `bom_line.derived_status` — Trụ cột 5 lo |
| J | Note | Ghi chú | STRING | R/W | `bom_line.description` |

**Sub-assembly (V/R/AB/AC prefix):**
- Hiển thị thành **nhóm merge** (merge cột A-B dòng parent) + indent cột B các dòng con.
- V1.5 xử lý flat rendering (không thu gọn được). V1.6 thêm expand/collapse.

---

## 5. Persist state: `bom_template.univer_snapshot` JSONB

### 5.1 Kích thước typical

- BOM 100 dòng: ~35KB.
- BOM 500 dòng: ~80KB.
- BOM 2000 dòng: ~250KB (Postgres TOAST auto-compresses ~40%).

### 5.2 Schema trong JSONB

```ts
// Univer `IWorkbookData` (trích rút — xem full ở https://univer.ai/api)
type UniverSnapshot = {
  id: string;                  // workbook id = bom_template.id
  sheetOrder: string[];        // ["sheet1"]
  sheets: {
    [sheetId: string]: {
      id: string;
      name: string;            // = bom_template.name
      rowCount: number;
      columnCount: number;
      cellData: Record<row, Record<col, ICell>>;
      mergeData: IRange[];
      freeze: { xSplit: 0, ySplit: 1 };   // freeze header row
      conditionalFormats?: IConditionalFormat[];
      columnData?: Record<col, { w: number }>;
      rowData?: Record<row, { h: number }>;
    };
  };
  styles: Record<styleId, IStyle>;
  resources?: Array<{ name: "SHEET_COMMENTS_PLUGIN" | ...; data: string }>;
};
```

### 5.3 Debounced save

```ts
// Pseudo code trong <UniverGrid>
const { univerAPI } = useUniver();
const saveGrid = useMutation({ mutationFn: postGrid });
const debouncedSave = useMemo(
  () => debounce((snap) => saveGrid.mutate(snap), 2000),
  [],
);

univerAPI.addEvent(univerAPI.Event.SheetEditEnded, (ev) => {
  const snap = univerAPI.getActiveWorkbook().save();
  debouncedSave(snap);
  // đồng thời push 1 entry vào undo IndexedDB — xem Trụ cột 4
});
```

### 5.4 Optimistic lock chống conflict 2 user cùng edit

- Mỗi response GET trả kèm `etag = sha256(univer_snapshot)`.
- POST body kèm `etag` → server verify; nếu khác → 409 Conflict, client show toast "Ai đó vừa sửa, xin tải lại".
- V1.5 chấp nhận UX thô này (single-user per-grid). V1.6 OT thật.

---

## 6. Conditional format — preset "Tiến độ vật tư"

Tạo 1 nút "Áp dụng preset Tiến độ vật tư" trên toolbar. Khi bấm → áp 4 rule sau vào cột `I` (Trạng thái):

```ts
// apps/web/src/lib/univer/conditional-formats.ts
export const PRESET_STATUS_FORMATS = [
  {
    id: "status-received",
    ruleType: "highlightCell",
    ranges: [{ startRow: 1, endRow: -1, startColumn: 8, endColumn: 8 }], // col I
    condition: { type: "EQUAL", value: "Đã nhận" },
    style: { bg: { rgb: "#D1FAE5" }, cl: { rgb: "#065F46" } },
  },
  {
    id: "status-ordered",
    condition: { type: "EQUAL", value: "Đang mua" },
    style:     { bg: { rgb: "#FEF3C7" }, cl: { rgb: "#92400E" } },
  },
  {
    id: "status-shortage",
    condition: { type: "EQUAL", value: "Thiếu" },
    style:     { bg: { rgb: "#FEE2E2" }, cl: { rgb: "#991B1B" } },
  },
  {
    id: "status-notstart",
    condition: { type: "EQUAL", value: "Chưa bắt đầu" },
    style:     { bg: { rgb: "#FFFFFF" }, cl: { rgb: "#6B7280" } },
  },
];
```

UX: anh Hoạt bật/tắt preset qua checkbox trong menu "Format → Tiến độ vật tư".

---

## 7. i18n tiếng Việt — 50 key đầu

File: `apps/web/src/lib/univer/locale/vi-VN.ts`.

```ts
export const UNIVER_VI_VN = {
  // Menu bar
  "ribbon.start": "Trang đầu",
  "ribbon.insert": "Chèn",
  "ribbon.formulas": "Công thức",
  "ribbon.data": "Dữ liệu",
  "ribbon.view": "Xem",

  // Toolbar — File
  "file.save": "Lưu",
  "file.export": "Xuất Excel",
  "file.import": "Nhập Excel",

  // Clipboard
  "clipboard.cut": "Cắt",
  "clipboard.copy": "Sao chép",
  "clipboard.paste": "Dán",
  "clipboard.pasteSpecial": "Dán đặc biệt",

  // Font
  "toolbar.fontFamily": "Phông chữ",
  "toolbar.fontSize": "Cỡ chữ",
  "toolbar.bold": "In đậm",
  "toolbar.italic": "In nghiêng",
  "toolbar.underline": "Gạch chân",
  "toolbar.strikethrough": "Gạch ngang",

  // Alignment
  "toolbar.alignLeft": "Căn trái",
  "toolbar.alignCenter": "Căn giữa",
  "toolbar.alignRight": "Căn phải",
  "toolbar.alignTop": "Căn trên",
  "toolbar.alignMiddle": "Căn giữa dọc",
  "toolbar.alignBottom": "Căn dưới",

  // Cell
  "toolbar.mergeCell": "Gộp ô",
  "toolbar.unmergeCell": "Bỏ gộp",
  "toolbar.wrapText": "Xuống dòng tự động",
  "toolbar.fillColor": "Màu nền",
  "toolbar.textColor": "Màu chữ",
  "toolbar.border": "Viền",

  // Format
  "toolbar.numberFormat": "Định dạng số",
  "toolbar.percent": "Phần trăm",
  "toolbar.currency": "Tiền tệ",
  "toolbar.date": "Ngày tháng",

  // Data
  "toolbar.sort": "Sắp xếp",
  "toolbar.filter": "Lọc",
  "toolbar.sortAsc": "Sắp xếp tăng dần",
  "toolbar.sortDesc": "Sắp xếp giảm dần",

  // View
  "toolbar.freezeRow": "Đóng băng dòng",
  "toolbar.freezeColumn": "Đóng băng cột",
  "toolbar.unfreeze": "Bỏ đóng băng",

  // Undo/Redo
  "toolbar.undo": "Hoàn tác",
  "toolbar.redo": "Làm lại",

  // Comment
  "comment.add": "Thêm ghi chú",
  "comment.edit": "Sửa ghi chú",
  "comment.delete": "Xoá ghi chú",
  "comment.reply": "Trả lời",

  // Conditional format
  "condFormat.title": "Định dạng điều kiện",
  "condFormat.preset.progress": "Preset: Tiến độ vật tư",
  "condFormat.clear": "Xoá định dạng",

  // Formula (giữ nguyên tên func — Excel tương thích)
  "formula.helper.SUM": "Tính tổng các ô",
  "formula.helper.COUNT": "Đếm số ô",
  "formula.helper.IF": "Điều kiện",
  "formula.helper.VLOOKUP": "Dò tìm dọc",
};
```

Register:

```ts
import { LocaleType } from "@univerjs/core";
import { UNIVER_VI_VN } from "./locale/vi-VN";

univer.setLocale(LocaleType.ZH_CN, UNIVER_VI_VN);
// Note: Univer chưa có VI-VN chính thức → ta đăng ký override zh-CN slot
// và set default locale = ZH_CN. Alternative: dùng `RegisterLocale` API.
```

---

## 8. Formula whitelist V1

Chỉ cho phép **10 công thức** an toàn:

```ts
const FORMULA_WHITELIST = [
  "SUM", "COUNT", "COUNTA", "AVERAGE",
  "IF", "IFS", "AND", "OR", "NOT",
  "VLOOKUP",
];
```

**Disable:**
- `RTD`, `HYPERLINK` — không dùng, tránh rủi ro bảo mật.
- `INDIRECT` — có thể gây ref injection.
- `IMPORTXML`, `IMPORTRANGE` — không có.

Cách disable: override `FormulaService.registerFunction` — reject bất kỳ function name ngoài whitelist.

---

## 9. Copy/paste Excel giữ format — kịch bản test

| Test | Thao tác | Expected |
|---|---|---|
| 1 | Copy 10 dòng từ Grid Univer → paste vào Excel thật | Excel nhận đủ 10 dòng, text + format (bold, màu) giữ nguyên |
| 2 | Copy range Excel 5×5 có merge → paste vào Univer | Merge giữ nguyên, cell value đúng |
| 3 | Copy cell có formula `=SUM(A1:A5)` từ Excel → Univer | Univer parse formula, hiển thị kết quả đúng |
| 4 | Copy với conditional format (nền xanh) từ Univer → Excel | Excel giữ nền xanh |
| 5 | Copy 1 cột 100 dòng giữa 2 tab Univer | Không crash, paste instant |

**Plugin cần:** `@univerjs/sheets-clipboard` — đã include trong preset.

---

## 10. Integration React 18

File: `apps/web/src/components/bom-grid/UniverGrid.tsx`.

```tsx
"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { LocaleType, UniverInstanceType, LogLevel } from "@univerjs/core";
import { createUniver } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import { UniverSheetsAdvancedPreset } from "@univerjs/preset-sheets-advanced";
import "@univerjs/preset-sheets-core/lib/index.css";

import { UNIVER_VI_VN } from "@/lib/univer/locale/vi-VN";

export function UniverGrid({ bomId, snapshot, onSnapshotChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const univerRef = useRef<ReturnType<typeof createUniver> | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const u = createUniver({
      locale: LocaleType.ZH_CN, // hack: override ZH with VI
      locales: { [LocaleType.ZH_CN]: UNIVER_VI_VN },
      logLevel: LogLevel.ERROR,
      presets: [
        UniverSheetsCorePreset({ container: container.current }),
        UniverSheetsAdvancedPreset({}), // formula + conditional format
      ],
    });
    u.univer.createUnit(UniverInstanceType.UNIVER_SHEET, snapshot);
    univerRef.current = u;

    // subscribe edit event
    u.univerAPI.addEvent(u.univerAPI.Event.SheetEditEnded, () => {
      const snap = u.univerAPI.getActiveWorkbook()?.save();
      onSnapshotChange?.(snap);
    });

    return () => u.univer.dispose();
  }, [bomId]);

  return <div ref={container} className="h-full w-full" />;
}
```

Dynamic import chỉ khi vào `/bom/[code]`:

```tsx
// apps/web/src/app/(app)/bom/[code]/page.tsx
const UniverGrid = dynamic(() => import("@/components/bom-grid/UniverGrid"), {
  ssr: false,
  loading: () => <GridSkeleton />,
});
```

---

## 11. Test checklist — 10 thao tác Excel phải work

| # | Thao tác | PASS nếu |
|---|---|---|
| 1 | Merge 3 ô ngang (A1:C1) | Hiển thị 1 ô lớn, unmerge về 3 ô gốc |
| 2 | Multi-select (Ctrl+click 3 vùng rời) | Delete → xoá cả 3 vùng cùng lúc |
| 3 | Conditional format preset "Tiến độ" | Cột Status tự đổi màu theo value |
| 4 | Fill down (kéo handle dưới bên phải 1 ô số) | Dòng dưới tăng 1 |
| 5 | Freeze dòng 1 | Scroll down → dòng header vẫn hiển thị |
| 6 | Formula `=SUM(C2:C100)` | Kết quả = tổng cột Quantity |
| 7 | Copy range → paste Excel thật | Excel nhận format + text |
| 8 | Autofilter cột Sub Category | Dropdown show distinct values |
| 9 | Ctrl+Z undo + Ctrl+Y redo | Grid state revert/advance đúng |
| 10 | Export .xlsx | File mở được trong Excel, giữ merge + format |

Chạy thủ công + Playwright script `apps/web/tests/e2e/univer-10-actions.spec.ts`.

---

## 12. Rủi ro

| Rủi ro | Giảm nhẹ |
|---|---|
| Univer tiếng Việt chưa hoàn thiện (chưa có locale chính thức) | Fallback hack override ZH_CN slot. Nộp PR lên repo Univer chính chủ sau V1.5 |
| Bundle 500KB gzip làm FCP chậm | Dynamic import + preload sau login 2s. Measure với Lighthouse — accept FCP <2.5s |
| JSONB snapshot xung đột 2 user edit | ETag optimistic lock, 409 show toast "tải lại" |
| Formula engine nặng CPU khi 2000 cells có formula | Throttle recompute 500ms; BOM >2000 dòng chia sheet |
| Mobile tablet 10" không vừa toolbar | V1.5 chỉ desktop; mobile xem read-only (fallback table HTML) |

---

## 13. Files phải tạo/sửa

| Path | Action |
|---|---|
| `apps/web/src/app/(app)/bom/[code]/page.tsx` | EDIT — swap table HTML → `<UniverGrid>` khi flag V2 on |
| `apps/web/src/app/(app)/playground/univer/page.tsx` | CREATE (xoá sau POC) |
| `apps/web/src/components/bom-grid/UniverGrid.tsx` | CREATE |
| `apps/web/src/components/bom-grid/GridSkeleton.tsx` | CREATE |
| `apps/web/src/components/bom-grid/GridToolbar.tsx` | CREATE (nút Preset, Undo override, Export) |
| `apps/web/src/lib/univer/locale/vi-VN.ts` | CREATE — 50 key i18n |
| `apps/web/src/lib/univer/conditional-formats.ts` | CREATE — preset "Tiến độ vật tư" |
| `apps/web/src/lib/univer/formula-whitelist.ts` | CREATE |
| `apps/web/src/lib/univer/build-initial-snapshot.ts` | CREATE — map `bom_line[]` → `IWorkbookData` |
| `apps/web/src/app/api/bom/[id]/grid/route.ts` | CREATE — GET + POST handlers |
| `apps/web/src/hooks/useBomGrid.ts` | CREATE — TanStack Query wrapper |
| `apps/web/tests/e2e/univer-10-actions.spec.ts` | CREATE — Playwright checklist |

---

## 14. Cách test (cho Thắng)

```bash
# Unit
pnpm -F @iot/web test src/lib/univer/

# Integration
pnpm -F @iot/web dev
# → mở http://localhost:3000/playground/univer → manual test 10 thao tác

# E2E
pnpm -F @iot/web exec playwright test univer-10-actions
```

## 15. TODO checklist

- [ ] Cài dependencies Univer
- [ ] POC route `/playground/univer` render 1 BOM mẫu
- [ ] API `GET/POST /api/bom/[id]/grid`
- [ ] Component `<UniverGrid>` + `<GridSkeleton>`
- [ ] Locale vi-VN 50 key
- [ ] Preset "Tiến độ vật tư" 4 rule
- [ ] Formula whitelist
- [ ] Debounced save 2s + ETag optimistic
- [ ] Build initial snapshot từ `bom_line[]`
- [ ] Test 10 thao tác Excel (checklist §11)
- [ ] Lighthouse FCP <2.5s, bundle <550KB gzip
- [ ] Merge vào `/bom/[code]` đằng sau flag `NEXT_PUBLIC_FF_BOM_GRID_V2`
