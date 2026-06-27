# Kế hoạch: Cột "Ngày dự kiến nhận hàng" + tô màu khẩn cấp trong BOM list (BomGridPro)

- **Mã task đề xuất:** `TASK-20260627-001`
- **Ngày:** 2026-06-27
- **Người lập:** planner (Claude)
- **File chính bị tác động:** `apps/web/src/components/bom-grid-pro/BomGridPro.tsx`
- **Trạng thái:** CHỜ USER DUYỆT (xem mục 5 — Bảng quyết định)

---

## 1. Tóm tắt & Mục tiêu

Thêm 1 cột mới **"Dự kiến nhận"** vào grid BOM (`BomGridPro`) hiển thị `expectedEta` của từng dòng, **tô màu nóng dần** theo số ngày còn lại `(expectedEta − hôm nay)` để Bộ phận Thu mua nhìn lướt là biết dòng nào quá hạn / sắp tới hạn → chủ động giục NCC.

**Bối cảnh kỹ thuật đã kiểm chứng (3 agent + planner verify lại file:line):**

| Phát hiện | Chứng cứ (file:line) | Hệ quả |
|---|---|---|
| Cột DB `expected_eta` (date), `received_qty`, `status_note` đã có sẵn từ V3.7.19 | `packages/db/src/schema/bom.ts:122-128` | **KHÔNG cần migration DB** |
| Đã nhập tay được qua dialog → API | `PicEditDialog.tsx:198-213` → `POST /api/bom-lines/[id]/pic-update` | Cơ chế ghi ETA đã tồn tại |
| RBAC ghi ETA: chỉ admin + PIC của dòng | `pic-update/route.ts:61-70` | Cần chốt có nới cho purchaser không (QĐ-3) |
| ETA đã chảy ra grid qua type + query + colHasData | `useBom.ts:70`, `bomTemplates.ts:418,454`, `BomGridPro.tsx:347` | **Field đã có ở client, chỉ thiếu render thành cột** |
| Grid chạy trên `bom_line` (template), KHÔNG phải snapshot | — | Render field có sẵn, **KHÔNG derive từ PO** (gap 4-hop join, bất khả thi rẻ) |
| Grid có virtualization (`@tanstack/react-virtual`) bật khi >80 dòng | `BomGridPro.tsx:360` | Thêm 1 `<td>` tính toán nhẹ → không ảnh hưởng perf |
| **Toàn bộ cell hiện KHÔNG dùng `dark:`** (toàn `bg-white` / `text-zinc-*` thuần) | `BomGridPro.tsx:499-756` | Cột mới **KHÔNG thêm `dark:`** để nhất quán (xem QĐ-6 + rủi ro R3) |

→ Đây là task **thuần frontend render**, không đụng DB, không đụng API (trừ khi chốt QĐ-3 = nới RBAC).

---

## 2. Phạm vi chốt (ranh giới rõ ràng)

### P0 — Lõi cột màu (LÀM NGAY, là phần chính)
- Helper `getEtaBucket(eta, receivedQty?, totalQty?)` → trả `{ tone, Icon, labelShort, labelLong, daysLeft }`.
- Thêm cột "Dự kiến nhận" vào **5 vị trí** trong `BomGridPro.tsx`: `colHasData`, `colgroup`, `thead`, `renderRow (tbody)`, và **2 chỗ colSpan hardcode**.
- Tô màu theo bucket + icon + chữ (3 kênh a11y cho người mù màu).
- Ẩn/hiện tự động theo `showCol("eta")` (theo đúng pattern cột PIC/Tiến độ hiện có).

### P1 — Tiện ích Thu mua (TÙY USER — xem QĐ-5)
- Badge tổng ở header/toolbar: "N quá hạn · M sắp tới".
- Filter nhanh "Chỉ quá/sắp hạn".
- Sort theo độ khẩn cấp (ETA gần nhất / quá hạn lên đầu).

### P2 — Defer (KHÔNG làm đợt này)
- Inline edit ETA ngay trên cell (hiện đã edit được qua `PicEditDialog`, đủ dùng).
- Pre-fill ETA tự động từ PO line (gap dữ liệu: `po_line.snapshotLineId` không trace ngược về `bom_line`; phải join 4 hop revision→snapshot, mơ hồ khi 1 dòng có nhiều PO/order). Để task riêng nếu cần.

---

## 3. Các bước triển khai (đánh số)

> Tất cả thay đổi P0 nằm trong **1 file**: `apps/web/src/components/bom-grid-pro/BomGridPro.tsx`, trừ Bước 1 (helper) có thể tách file riêng.

### Bước 1 — Tạo helper `getEtaBucket`
- **File:** tạo mới `apps/web/src/components/bom-grid-pro/etaBucket.ts` (tách riêng để dễ unit-test + tái dùng cho badge P1). Hoặc đặt inline đầu `BomGridPro.tsx` nếu muốn gọn — **khuyến nghị tách file**.
- **Phụ thuộc:** dùng `date-fns` (`differenceInCalendarDays`, `parseISO`, `format`) — đã có trong dự án (kiểm tra nhanh: nếu chưa có thì `pnpm add date-fns -F web`). **Bắt buộc dùng `differenceInCalendarDays`** (so theo ngày-lịch) thay vì trừ mili-giây để tránh lệch do timezone +07.
- **Chữ ký:**
  ```
  getEtaBucket(eta: string | null, receivedQty?: number, totalQty?: number)
    => {
      tone: "overdue" | "urgent" | "near" | "soon" | "later" | "none" | "done";
      cellClass: string;       // class Tailwind cho <td> (bg + text + ring)
      Icon: LucideIcon | null; // AlertTriangle / Dot / Circle ...
      labelShort: string;      // "dd/MM" hiển thị trong cell
      labelLong: string;       // "quá 3 ngày" / "còn 5 ngày" / "hôm nay" / "Đã về"
      title: string;           // tooltip dd/MM/yyyy + mô tả
      daysLeft: number | null; // null nếu eta == null
    }
  ```
- **Logic bucket (ngưỡng mặc định — xem QĐ-2):**

  | Điều kiện | tone | Màu (light, KHÔNG dark:) | Icon | labelLong |
  |---|---|---|---|---|
  | `receivedQty >= totalQty` (nếu bật QĐ-4) | `done` | `bg-emerald-50 text-emerald-700` | `Check` | "Đã về" |
  | `eta == null` | `none` | `text-zinc-400` | — | "Chưa đặt" |
  | `daysLeft < 0` | `overdue` | `bg-rose-100 text-rose-800 ring-1 ring-rose-300` | `AlertTriangle` ▲ | "quá N ngày" |
  | `0 ≤ daysLeft ≤ 3` | `urgent` | `bg-orange-100 text-orange-800` | `Dot` ● | "hôm nay" / "còn N ngày" |
  | `3 < daysLeft ≤ 7` | `near` | `bg-amber-100 text-amber-800` | `Dot` ● | "còn N ngày" |
  | `7 < daysLeft ≤ 14` | `soon` | `bg-yellow-50 text-yellow-700` | `Circle` ○ | "còn N ngày" |
  | `daysLeft > 14` | `later` | `text-zinc-600` (gần như không tô) | — | "còn N ngày" |

  > 3 kênh a11y: **màu** + **icon** + **chữ** — người mù màu vẫn phân biệt được. `daysLeft == 0` → labelLong = "hôm nay".

### Bước 2 — Thêm key `eta` vào `colHasData`
- **File:** `BomGridPro.tsx` — object `colHasData` (~L327-335) + vòng lặp (~L336-350).
- Thêm `eta: false` vào object khởi tạo.
- Trong vòng lặp, thêm: `if (r.node.expectedEta) has.eta = true;` (đặt cạnh dòng L347).
- → Cột tự ẩn khi cả BOM không dòng nào có ETA; hiện lại khi `showAllColumns`. Đúng pattern sẵn có. `showCol("eta")` hoạt động tự động.

### Bước 3 — Thêm `<col>` vào colgroup
- **File:** `BomGridPro.tsx` — colgroup (~L825-841).
- Chèn 1 dòng tại **vị trí đã chốt** (QĐ-1). Khuyến nghị **ngay sau cột Tiến độ** (sau L839, trước `<col 100px>` Thao tác):
  ```
  {showCol("eta") && <col style={{ width: "115px" }} />}{/* Dự kiến nhận */}
  ```
- **Lưu ý thứ tự `<col>` phải khớp 1-1 với `<th>` và `<td>`** — nếu chọn vị trí sau PIC (QĐ-1 phương án B) thì phải chèn ở dòng tương ứng (sau L835, trước SL L836).

### Bước 4 — Thêm `<th>` "Dự kiến nhận" vào thead
- **File:** `BomGridPro.tsx` — thead (~L842-1026).
- Chèn tại vị trí khớp Bước 3. Khuyến nghị sau block Tiến độ (sau L1022, trước `<th>` Thao tác L1023):
  ```
  {showCol("eta") && (
    <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-center"
        title="Ngày dự kiến nhận hàng — tô đỏ dần theo độ khẩn">
      Dự kiến nhận
    </th>
  )}
  ```

### Bước 5 — Thêm `<td>` cell màu vào renderRow (tbody, dòng non-group)
- **File:** `BomGridPro.tsx` — `renderRow` nhánh non-group (~L499-755).
- Chèn `<td>` tại vị trí khớp (sau block Tiến độ ~L738, trước `<td>` Thao tác L740):
  ```
  {showCol("eta") && (() => {
    const meta = row.node.metadata as { totalQty?: string | number } | null;
    const totalQty = meta?.totalQty != null ? Number(meta.totalQty) : qty * parentQty;
    const b = getEtaBucket(
      row.node.expectedEta,
      Number(row.node.receivedQty ?? 0),
      totalQty,
    );
    return (
      <td className={cn("px-2 text-center text-[11px] tabular-nums", b.cellClass)} title={b.title}>
        <span className="inline-flex items-center gap-1">
          {b.Icon && <b.Icon className="h-3 w-3" aria-hidden />}
          <span>{b.labelShort}</span>
          {b.daysLeft != null && <span className="text-[10px] opacity-80">· {b.labelLong}</span>}
        </span>
      </td>
    );
  })()}
  ```
  > IIFE giống pattern cell SL (L681-686) và Quy cách (L570-614) hiện có. Khi `eta == null` → render "— Chưa đặt" màu xám.

### Bước 6 — Sửa colSpan hardcode (ĐIỂM DỄ SAI — KIỂM TRA KỸ)
Đây là 2 chỗ duy nhất phải sửa tay vì là số cứng, không tự tính theo `showCol`:

- **6a. Group row** — `BomGridPro.tsx:466`: `<td colSpan={13} ...>`.
  Cột mới chèn **sau Tiến độ** nằm trong vùng colSpan của group row (group row gộp tất cả cột giữa "#" và "Thao tác"). → đổi `colSpan={13}` → **`colSpan={14}`**.
  > Nếu chèn ETA **sau PIC** (phương án B) cũng vẫn nằm trong vùng gộp → vẫn `13 → 14`. (Group row gộp cố định, không phụ thuộc showCol vì nó luôn render toàn bộ width — xác nhận lại bằng mắt khi sửa: group row có 3 td là `#` + `colSpan(gộp)` + `Thao tác`.)

- **6b. Empty-state** — `BomGridPro.tsx:1049`: `<td colSpan={15} ...>`.
  → đổi `colSpan={15}` → **`colSpan={16}`**.

  > **Cảnh báo:** cả 2 colSpan này là số tối đa (giả định mọi cột hiện). Hiện code đã hardcode bất kể `showCol`, nên ta chỉ cần +1 cho nhất quán với code hiện tại. KHÔNG cần tính động.

### Bước 7 (P1 — chỉ nếu QĐ-5 = Có) — Badge tổng + Filter + Sort
- **7a. Badge tổng:** ở toolbar phía trên grid (khu vực nút "Hiện tất cả cột" / filter). Tính từ `visibleRows`: đếm `tone === "overdue"` và `tone ∈ {urgent, near}`. Render: `<span class="...rose...">N quá hạn</span> · <span class="...amber...">M sắp tới</span>`. Dùng lại `getEtaBucket` (lý do tách helper ở Bước 1).
- **7b. Filter "Chỉ quá/sắp hạn":** thêm 1 state `etaFilter: boolean`, lọc trong `visibleRows` useMemo (~L320 vùng filter supplier/pic). Nút toggle cạnh badge.
- **7c. Sort theo độ khẩn:** thêm state `etaSort: boolean`. Khi bật, sort các dòng non-group theo `daysLeft` ASC (null xuống cuối). **Lưu ý:** grid đang là cây phân cấp (group + child) — sort phẳng có thể phá cấu trúc cây. → Khuyến nghị nếu làm 7c: chỉ sort trong phạm vi từng nhóm, HOẶC defer 7c sang P2 và chỉ làm 7a+7b (badge + filter ít rủi ro hơn).

---

## 4. Định nghĩa Done (DoD) & cách test

### DoD P0
- [ ] Cột "Dự kiến nhận" hiện trong grid khi có ít nhất 1 dòng có `expectedEta`; tự ẩn khi không có và `showAllColumns=false`.
- [ ] Mỗi cell hiển thị đúng 3 kênh: màu nền + icon + ngày (`dd/MM`) + chữ khẩn ("quá N ngày"/"còn N ngày"/"hôm nay").
- [ ] Dòng quá hạn → rose đậm + ▲; cận kề → orange; ... ; chưa đặt → xám "— Chưa đặt".
- [ ] Tooltip cell hiện `dd/MM/yyyy` đầy đủ.
- [ ] colSpan group row & empty-state đã +1, không vỡ layout (header thẳng cột với body).
- [ ] Virtualization (BOM >80 dòng) vẫn cuộn mượt, cột không lệch.
- [ ] Không có lỗi lệch ngày do TZ (test 1 dòng ETA = hôm nay → "hôm nay", không phải "quá 1 ngày").

### Cách test
1. **Typecheck:** `pnpm -F web typecheck` (hoặc `tsc --noEmit`) → 0 lỗi.
2. **Lint:** `pnpm -F web lint` cho file sửa.
3. **Build:** `pnpm -F web build` PASS (bắt buộc trước push để CI không fail — theo CLAUDE.md nguyên tắc 3).
4. **Smoke trên grid thật:** mở 1 BOM có ETA đa dạng (1 dòng quá hạn, 1 hôm nay, 1 còn 5 ngày, 1 chưa đặt). Kiểm tra mắt:
   - Cột thẳng hàng header↔body.
   - Bật/tắt "Hiện tất cả cột" → cột ETA ẩn/hiện đúng.
   - BOM rỗng → empty-state "BOM chưa có linh kiện nào" vẫn căn giữa (colSpan đúng).
   - BOM >80 dòng → cuộn ảo không lệch cột.
5. **Edge:** dòng `received_qty >= totalQty` (nếu bật QĐ-4) → hiện "Đã về" xanh, tắt màu khẩn.

> Lưu ý theo CLAUDE.md: "curl /api/health không đủ". Nhưng task này **thuần render client, không đụng auth/API** (trừ khi QĐ-3 nới RBAC). Nếu QĐ-3 = Có → bổ sung test: login bằng user role `purchaser`, POST `/api/bom-lines/[id]/pic-update` sửa ETA → trả 200; user thường (không phải PIC/admin/purchaser) → 403.

---

## 5. Bảng quyết định — CẦN USER CHỐT

| # | Quyết định | Phương án | Khuyến nghị mặc định | Tác động nếu đổi |
|---|---|---|---|---|
| **QĐ-1** | Vị trí cột | A) Sau "Tiến độ" (cạnh Thao tác) · B) Sau "PIC" (trước SL) | **A — sau Tiến độ.** Đọc liền mạch "trạng thái → khi nào về", gom nhóm thông tin theo dõi tiến độ. | Đổi sang B → chèn `<col>/<th>/<td>` ở vị trí khác (sau L835/L1002/L674) nhưng colSpan vẫn `13→14`, `15→16`. |
| **QĐ-2** | Ngưỡng bucket | 0-3 / 3-7 / 7-14 ngày | **Giữ mặc định.** Khớp lead-time vật tư cơ khí phổ thông. | Chỉ sửa hằng số trong `getEtaBucket` — 1 chỗ, không đụng UI. **Hỏi user: lead-time NCC xưởng thường bao nhiêu ngày?** |
| **QĐ-3** | RBAC sửa ETA cho purchaser | A) Giữ nguyên (admin + PIC dòng) · B) Nới thêm role `purchaser` | **A cho đợt này (P0 chỉ hiển thị, chưa cần sửa).** Nếu Thu mua cần tự sửa ETA → B ở đợt sau. | B → sửa `pic-update/route.ts:61-70`: thêm `const isPurchaser = guard.session.roles.includes("purchaser");` và `if (!isAdmin && !isPic && !isPurchaser)`. Đồng thời nới điều kiện `canEdit` ở cell PIC (`BomGridPro.tsx:627-630`). +1 test RBAC. |
| **QĐ-4** | "Đã về" theo `received_qty` (manual) | A) Bật badge "Đã về" khi `receivedQty >= totalQty` · B) Bỏ, chỉ hiện ETA | **A — bật.** Tận dụng `received_qty` đã có, hữu ích cho Thu mua. | B → bỏ nhánh `done` trong helper, đơn giản hơn 1 chút. |
| **QĐ-5** | Làm P1 (badge/filter/sort) đợt này? | A) Chỉ P0 · B) P0 + P1 (7a+7b) · C) P0 + P1 đầy đủ (7a+7b+7c) | **B — P0 + badge + filter.** 7c (sort) có rủi ro phá cây phân cấp → defer. | A → bỏ Bước 7. C → thêm rủi ro sort cây (xem Bước 7c). |
| **QĐ-6** | Thêm `dark:` cho cột mới? | A) Không (nhất quán code hiện tại) · B) Có | **A — KHÔNG thêm dark:.** Toàn bộ grid hiện 0 dùng `dark:`. Thêm riêng cột này sẽ lệch màu khi/ nếu bật dark mode toàn cục. | B → cần thêm `dark:` cho TẤT CẢ cell grid (ngoài scope). Để task riêng nếu muốn dark mode toàn grid. |

---

## 6. Ước lượng độ phức tạp & rủi ro

### Ước lượng

| Phase | Việc | Độ phức tạp | Thời gian ước tính |
|---|---|---|---|
| P0 | Helper + 5 vị trí cột + 2 colSpan | Thấp–Trung (nhiều điểm sửa nhỏ, dễ sai vị trí/colSpan) | ~1.5–2.5h gồm test |
| P1 (7a+7b) | Badge tổng + filter | Thấp | ~1–1.5h |
| P1 (7c) | Sort theo khẩn cấp (giữ cây) | Trung–Cao (rủi ro phá cấu trúc cây) | ~2h+ — khuyến nghị defer |
| P2 | Pre-fill ETA từ PO | Cao (gap 4-hop join) | Defer — task riêng |

### Rủi ro & giảm thiểu

- **R1 — colSpan sai (CAO nhất):** group row `13→14` (L466) và empty-state `15→16` (L1049) là số cứng. Quên 1 trong 2 → header/body lệch cột hoặc empty-state co lại. **Giảm thiểu:** checklist DoD nhấn mạnh 2 chỗ này; test mắt cả BOM rỗng lẫn BOM có nhóm con (group row).
- **R2 — Thứ tự `<col>` / `<th>` / `<td>` không khớp:** table `table-fixed` → nếu chèn 3 element ở 3 vị trí lệch nhau, toàn bộ cột sau đó dồn sai. **Giảm thiểu:** chèn cả 3 ở cùng vị trí logic (sau Tiến độ); test "Hiện tất cả cột" để chắc thứ tự đúng ở mọi trạng thái `showCol`.
- **R3 — Dark mode:** grid hiện không có `dark:` (QĐ-6). Nếu lỡ thêm `dark:` chỉ cho cột mới → lệch tông. **Giảm thiểu:** tuân QĐ-6=A, dùng đúng palette light (`rose-100/orange-100/amber-100/yellow-50/emerald-50`).
- **R4 — Lệch ngày do TZ (+07):** trừ timestamp mili-giây sai múi giờ. **Giảm thiểu:** dùng `differenceInCalendarDays(parseISO(eta), new Date())` (so ngày-lịch). Test ETA = hôm nay → "hôm nay".
- **R5 — Virtualization:** mỗi `<td>` gọi `getEtaBucket` mỗi render khi cuộn ảo. **Giảm thiểu:** helper là tính toán O(1) thuần (parse date + 1 phép trừ), không I/O — không ảnh hưởng. Không cần memo hoá.
- **R6 — `expectedEta` format chuỗi:** Drizzle `date` trả `"YYYY-MM-DD"` (string) qua `useBom.ts:70`. **Giảm thiểu:** `parseISO` xử lý đúng định dạng này; guard `eta == null` trước khi parse.

---

## 7. Danh sách file tác động

| File | Loại | Việc |
|---|---|---|
| `apps/web/src/components/bom-grid-pro/etaBucket.ts` | **Tạo mới** | Helper `getEtaBucket` (Bước 1) |
| `apps/web/src/components/bom-grid-pro/BomGridPro.tsx` | **Sửa** | Bước 2–6 (colHasData, colgroup, thead, tbody td, 2 colSpan) + Bước 7 nếu P1 |
| `apps/web/src/app/api/bom-lines/[id]/pic-update/route.ts` | **Sửa (CHỈ nếu QĐ-3=B)** | Nới RBAC cho role `purchaser` (L61-70) |

→ **KHÔNG migration DB. KHÔNG đụng schema. KHÔNG đụng query/repo.** (ETA đã có sẵn end-to-end.)

---

## 8. Ghi chú codexdo.md

Theo CLAUDE.md: trước khi execute, tạo/cập nhật task trong `codexdo.md`:
- Tạo `TASK-20260627-001` section "Tasks", DoD = mục 4, Ưu tiên P1, Phụ thuộc = none.
- Khi execute: `TODO → IN_PROGRESS` + timestamp. Khi xong: `DONE` + commit hash + kết quả build/typecheck.
