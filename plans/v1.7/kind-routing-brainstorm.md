# Brainstorm — Column Width + Kind Routing (V1.7 Grid)

**Ngày:** 2026-04-21
**Nguồn:** Feedback LIVE từ anh Hoạt sau khi Grid được set làm default BOM workspace.
**Trạng thái:** Đang thảo luận — chưa code.
**File liên quan:**
- `apps/web/src/lib/bom-grid/build-workbook.ts` — Univer workbook builder.
- `apps/web/src/lib/bom-grid/sample-z502653.ts` — 11 cột canonical + `KIND_LABEL`.
- `packages/db/src/schema/bom.ts` — `bom_line` với `metadata` JSONB.
- `packages/db/src/schema/item.ts` — `itemType` enum master.

---

## 1. Column width tuning

### 1.1. Đánh giá hiện trạng

Config đang chạy (tổng 1682px trước scrollbar) có 3 vấn đề nhãn tiền:

- **"Kích thước (mm)" 170px** thừa cho format chuẩn `601.0 x 21.0 x 20.0` (~19 chars JetBrains Mono 12px ≈ 133px content). Thừa ~37px.
- **"Tổng SL" 92px + "Hao hụt" 92px** — chỉ hiển thị 1-4 digit + dấu %, lãng phí khoảng 20-25px mỗi cột.
- **"Ghi chú" 260px** đặt cuối nhưng nội dung thực tế dài 20-80 chars, nếu để ở cuối thì bị cắt khi scroll ngang. Cần ngắn hơn hoặc bật wrap.

Ngược lại:
- **"NCC" 110px** hẹp cho các chuỗi viết tắt dài như "AL Profile" (10 chars + padding ≈ 90px OK), nhưng nếu sau này đổi thành tên công ty đầy đủ thì tràn ngay. Giữ 110, cho wrap.
- **"Tên / Mô tả" 280px** — OK với mô tả TB 30-60 chars. Giữ.

### 1.2. Đề xuất 11 column widths mới (tổng ~1590px)

| Idx | Header | Width cũ | **Width mới** | Rationale |
|-----|--------|---------:|--------------:|-----------|
| 0 | Ảnh | 52 | **56** | +4 để padding thumbnail 40x40 dễ nhìn. |
| 1 | Mã linh kiện | 110 | **140** | SKU dạng `C1609-24-P-00154` (16 chars mono 12px) ≈ 128px content + indent 3 spaces cho depth 2+. |
| 2 | Tên / Mô tả | 280 | **300** | Cho mô tả TB 35-60 chars Inter 12px wrap 2 dòng. |
| 3 | Loại | 130 | **150** | Chừa chỗ icon dropdown caret ▾ sau "🔧 Gia công". |
| 4 | Vật liệu / Nhóm | 200 | **180** | Cụm dài nhất "AL6061 anode đen" 17 chars ≈ 128px. Giảm 20px. |
| 5 | NCC | 110 | **100** | Đa số 3-6 chars viết tắt (GTAM/MI/VB/PG). |
| 6 | SL/bộ | 78 | **72** | 1-4 digit mono căn phải. |
| 7 | Kích thước (mm) | 170 | **140** | `601.0 x 21.0 x 20.0` 19 chars mono ≈ 133px. Giảm 30px. |
| 8 | Tổng SL | 92 | **80** | Formula 1-5 digit mono bold. |
| 9 | Hao hụt % | 92 | **80** | `3.0%` 4 chars mono. |
| 10 | Ghi chú | 260 | **290** | Đặt cuối — cho rộng để wrap tối đa 80 chars không tràn khi scroll cuối. |

**Tổng mới:** 56+140+300+150+180+100+72+140+80+80+290 = **1588px** (giảm 94px so với 1682 cũ).

**Ghi chú triển khai:**
- Bật `rowAutoHeight` hoặc `wrapStrategy: WRAP` cho cột 2, 4, 10 để nội dung dài không bị cắt.
- Khi có ảnh thật (phase sau), tăng `defaultRowHeight` lên 40 để thumbnail vừa.
- Font size header nên giảm còn `fs: 10` (Inter) để hiển thị hết "Kích thước (mm)" trong 140px.

---

## 2. Dropdown "Loại" interactive

### 2a. Univer dropdown cell vs Shadcn Select overlay

| Tiêu chí | Univer dataValidation list | Shadcn Select overlay DOM |
|---|---|---|
| Native feel trong grid | ✅ Hoàn toàn | ⚠️ Hơi lệch (DOM overlay trên canvas) |
| Khả năng tùy biến | ⚠️ Limited (text + icon fake) | ✅ Full (avatar NCC, badge, group) |
| Keyboard a11y | ✅ Enter/Escape chuẩn Univer | ✅ Radix primitive chuẩn |
| Implementation effort | ~2h (API `IDataValidation`) | ~1d (hit-test cell, position, portal) |
| Bundle size | 0 thêm | +shadcn Select (~6KB gzip) — đã có trong project |
| Paste/fill-down | ✅ Validate tự động | ⚠️ Phải custom listener |
| Đồng bộ with `item.itemType` | ✅ Chỉ cell value cần match enum | ✅ Tự do |

**Đề xuất: Univer dataValidation list (approach A)** cho V1.7-beta vì:
1. Thao tác nằm trong grid, không context-switch sang DOM overlay.
2. Keyboard flow đồng nhất với các cell khác (F2 edit, Enter commit).
3. Effort chỉ ~2h, phù hợp scope beta.
4. Fill-down / paste value "Thương mại" xuống 20 dòng liền — Univer xử lý miễn phí.

Shadcn Select overlay chỉ nên dùng khi cần hiển thị avatar/logo NCC phức tạp (V2).

### 2b. Persist vào đâu?

3 option:

**Option 1 — Đọc/ghi qua `item.itemType` (global master)**
- Pros: Source of truth duy nhất. Đổi 1 lần, mọi BOM cùng dùng item này đều update.
- Cons: **Nguy hiểm.** Item `VB12345` đang dùng ở 30 BOM khác nhau; đổi từ PURCHASED → FABRICATED sẽ lan rộng. Audit trail cực khó. BOM cũ có thể đã RELEASED (frozen revision) lẫn với DRAFT.

**Option 2 — Cột `kind` mới vào `bom_line`**
- Pros: Truy vấn nhanh (index được), typesafe enum.
- Cons: Phải migration DB, enum phải commit sớm. Nếu sau thêm `SUB_ASSEMBLY_WITH_ROUTE` thì lại migrate tiếp.

**Option 3 — `bom_line.metadata.kind` JSONB (RECOMMENDED cho V1.7-beta)**
- Pros: Không migrate DB, ship được trong 1 ngày. Per-usage linh hoạt (cùng 1 item có thể fab ở BOM này, com ở BOM kia).
- Cons: Không có enum constraint ở DB level (validate ở app layer). Query filter chậm hơn nếu không có GIN index.

**Đề xuất:** Option 3 cho V1.7-beta, sau 2-4 tuần dùng thật sẽ quyết có promote lên cột enum thực hay không (Option 2).

### 2c. Override vs inherit từ item master — ví dụ cụ thể

**Scenario A (đa số):** Item `C1609-24-P-00154` (Tấm chống thanh trượt dài) trong master = FABRICATED. Khi thêm vào BOM Z502653:
- Grid auto hiển thị "🔧 Gia công" đọc từ `item.itemType`.
- `bom_line.metadata.kind` = `null` (inherit).

**Scenario B (edge case):** Item `STWN20` (Phanh trục) master = PURCHASED (thương mại), nhưng BOM ZXYZ đặc biệt xưởng tự mài trong nhà:
- User đổi dropdown "Loại" tại bom_line đó → "🔧 Gia công".
- `bom_line.metadata.kind` = `"fab"` (override).
- Grid hiển thị override, `item.itemType` giữ PURCHASED.

**Rule đọc:**
```
effectiveKind = bom_line.metadata.kind ?? mapItemType(item.itemType)
```
Hiển thị badge nhỏ "⚠️ override" cạnh dropdown khi override khác master → user biết lệch và có thể revert.

---

## 3. "Options quy trình tiếp theo" — scope

Đây là phần user nói "tổng quát" — cần chốt scope để không over-engineer.

### 3.1. Trường hợp Thương mại (com) — cần gì?

Tier theo priority:

**Tier 1 (Must — V1.7-beta.1):**
- Chọn NCC từ dropdown `supplier` (FK thực sự, không phải text).
- Nhập giá/đơn vị, lead time (ngày), MOQ.

**Tier 2 (Should — V1.7 GA):**
- Link tới PR/PO active cho item này (chỉ đọc, không trigger).
- Hiển thị tình trạng giao hàng cuối (tóm tắt từ `receiving_event`).

**Tier 3 (Could — V2):**
- Button "Tạo PR nhanh" pre-fill item + NCC + qty.
- So sánh giá giữa N NCC cho cùng item (supplier price history).

### 3.2. Trường hợp Gia công (fab) — cần gì?

**Tier 1 (Must — V1.7-beta.1):**
- Vật liệu gốc (POM / AL6061 / SUS304 / ...) từ enum hoặc bảng `material`.
- Kích thước phôi (blank size): text string hoặc W/H/L numeric.

**Tier 2 (Should — V1.7 GA):**
- Route công đoạn: chọn 1-N từ danh sách (MCT / Wire cut / Mill / Drill / Lathe / Grind).
- Thứ tự công đoạn (seq) — drag-to-reorder.
- Giờ/công đoạn ước lượng.

**Tier 3 (Could — V2):**
- Tính lead time tự động = sum(hours × 60 phút) / cap xưởng.
- Tính cost = (phôi kg × giá kg) + sum(hours × giá/giờ) × (1 + scrap%).
- Export route sheet PDF cho tổ gia công.

**Note quan trọng:** Excel "Material&Process" có đủ data giá/kg + giá/giờ. Khi import vào DB sẽ là bảng master `material_price` + `process_rate`. Đây là prerequisite cho tính cost Tier 3.

---

## 4. UX patterns (4 option, rank theo feasibility)

### 4a. Click "Loại" → Side Sheet phải (DETAILED EDIT)
- **Cách hoạt động:** Click single vào cell "Loại" mở Sheet shadcn trượt từ phải (w-[480px]). Header Sheet: "Quy trình cho [SKU] — [Tên]". Tabs: Thương mại / Gia công. User chọn tab → form tương ứng.
- **Pros:** Không gian rộng cho form phức tạp (route steps, 3-5 input), keyboard nav tốt (Tab).
- **Cons:** Break rhythm "grid-first" — user phải di chuột ra khỏi cell, đọc Sheet, xong Save rồi quay lại. Không phù hợp bulk edit 20 dòng.
- **Effort:** 1 ngày cho shell + form cơ bản (sourcing + route).
- **Univer support:** ✅ Event `onCellClick` có sẵn.

### 4b. Double-click → Popover inline (QUICK CHANGE)
- **Cách hoạt động:** Double-click cell "Loại" mở Popover shadcn 320px ngay tại cell. Chứa: Select kind + inline 2-3 field quan trọng nhất (NCC cho com, vật liệu chính cho fab). Save on blur.
- **Pros:** Nhanh, không rời grid. Phù hợp bulk edit.
- **Cons:** Chật chội, không nhét đủ route 5-7 steps. Phải có "Xem thêm" link mở Sheet ở 4a.
- **Effort:** 0.5 ngày.
- **Univer support:** ✅ Hit-test tọa độ cell → position popover.

### 4c. Expand row ▶ (INLINE SUB-ROWS)
- **Cách hoạt động:** Click icon ▶ ở đầu dòng mở sub-row bên dưới, hiển thị các route step / sourcing info inline. Giống Notion subtable.
- **Pros:** Hiển thị được data đầy đủ mà không rời grid. Bulk view.
- **Cons:** **Univer KHÔNG hỗ trợ native expandable row.** Phải hack: thêm row ẩn + toggle visibility + merge cells kỳ công. Performance rủi ro với BOM 500+ lines.
- **Effort:** 1 tuần + test hồi quy scroll/freeze.
- **Univer support:** ❌ Phải custom, high risk.

### 4d. Dynamic columns (ẨN/HIỆN THEO LOẠI)
- **Cách hoạt động:** Khi toàn bộ BOM có ≥1 dòng com → hiện cột "Lead time", "MOQ", "Giá". Khi có ≥1 dòng fab → hiện cột "Vật liệu phôi", "Route". User toggle trên toolbar.
- **Pros:** Grid phẳng, xem tất cả info mà không click. Phù hợp power user.
- **Cons:** BOM hỗn hợp fab+com thì cả 2 nhóm cột cùng hiện → 18+ cột, scroll ngang địa ngục. Điền sparse (fab không có lead time → empty, trông xấu).
- **Effort:** 2 ngày (column show/hide API Univer + toolbar toggle + persist preference).
- **Univer support:** ✅ `setColumnHidden` có sẵn.

### 4.1. Đề xuất ranking

**#1 — 4a (Side Sheet) cho V1.7-beta.1 edit detail + 4b (Popover) cho V1.7-beta quick kind change.**

Lý do: Hai pattern bổ sung cho nhau (quick change via popover cho thao tác đơn giản, side sheet cho edit chi tiết), effort tổng ~1.5 ngày, rủi ro thấp, không cần hack Univer.

**#2 — 4d** cho V2 khi có power user thực sự cần.

**#3 — 4c** loại bỏ do Univer không support native, effort/risk không xứng.

---

## 5. Schema proposals

### 5a. `bom_line.metadata` JSONB mở rộng (RECOMMENDED V1.7)

```
metadata: {
  kind: "fab" | "com" | null,       // null = inherit từ item
  size: string,                     // đã có
  seq: number,                      // đã có
  supplierItemCode: string,         // đã có (hoặc dùng cột top-level)
  sourcing?: {                      // chỉ cho com
    supplierId: uuid,
    leadTimeDays: number,
    moq: number,
    unitPrice: number,
    currency: "VND" | "USD",
    lastUpdatedAt: ISO
  },
  routing?: {                       // chỉ cho fab
    rawMaterial: {
      code: string,                 // e.g. "AL6061"
      blankSize: string,            // "60 x 30 x 10"
      blankWeight?: number          // kg
    },
    steps: [
      { seq: 1, processCode: "WIRE_CUT", hours: 0.5, note?: string },
      { seq: 2, processCode: "MILL",     hours: 1.2 }
    ]
  }
}
```

- **Pros:** Zero migration. Ship V1.7-beta.1 trong 3-5 ngày. Evolving shape dễ dàng khi chốt scope thực tế.
- **Cons:** Không có FK constraint (supplierId tham chiếu soft), validate phải ở Zod layer. Query kiểu "tất cả line sourcing từ NCC X" phải dùng `metadata @> ...` (cần GIN index).

### 5b. Normalized: `bom_line_sourcing` + `bom_line_route_step`

```
bom_line_sourcing (
  bom_line_id uuid PK FK,
  supplier_id uuid FK,
  lead_time_days int,
  moq numeric,
  unit_price numeric,
  currency varchar(8),
  updated_at timestamptz
)

bom_line_route_step (
  id uuid PK,
  bom_line_id uuid FK,
  seq int,
  process_code varchar(32),
  hours numeric,
  note text
)

manufacturing_process (                -- master
  code varchar(32) PK,
  name text,
  hourly_rate numeric,
  category varchar(32)
)

material (                              -- master
  code varchar(32) PK,
  name text,
  price_per_kg numeric,
  category varchar(32)
)
```

- **Pros:** Query SQL chuẩn (JOIN, aggregate), FK constraint, reporting dễ. Cost calculation sum route steps trực tiếp.
- **Cons:** Migration phức tạp. Phải định nghĩa enum `process_code` sớm. Effort 1-2 tuần để schema + API + migrations + seed master data.

### 5c. Hybrid: cột `kind` enum + JSONB cho flex

```
bom_line.kind              pgEnum('fab','com', null)   -- NEW column
bom_line.metadata          jsonb                        -- giữ nguyên cho sourcing/routing chi tiết
```

- **Pros:** Kind truy vấn nhanh (index B-tree), JSONB linh hoạt cho nested detail.
- **Cons:** Vẫn cần 1 migration nhưng nhỏ. Là middle ground.

### 5.1. Ranking

| Approach | Query performance | Maintenance | V1.7 fit | V2 fit |
|---|---|---|---|---|
| 5a JSONB only | 6/10 | 7/10 (typescript schema evolving) | ✅ Ship nhanh | ⚠️ Phải refactor khi report phức tạp |
| 5b Normalized | 10/10 | 8/10 (schema ổn định) | ❌ Quá lớn | ✅ Tối ưu |
| 5c Hybrid | 9/10 | 7/10 | ⚠️ Cần migration nhỏ | ✅ OK |

**Đề xuất:** Bắt đầu **5a (JSONB only)** cho V1.7-beta + V1.7-beta.1 để learn data. Sau 4-6 tuần có feedback thực, migrate sang **5c (Hybrid)** cho V1.7 GA hoặc **5b (Normalized)** cho V2 khi cần reporting/cost calc.

---

## 6. Roadmap đề xuất

### Phase 1 — V1.7-beta (1-2 ngày)

**Scope:** Nhanh, ship trong tuần này, không migrate DB.

- [ ] Tinh chỉnh 11 column widths theo section 1.2.
- [ ] Bật wrap cho cột Tên, Vật liệu, Ghi chú.
- [ ] Giảm font header xuống `fs: 10`.
- [ ] Thêm Univer dataValidation list cell cho cột "Loại" (2 options fab/com).
- [ ] Viết handler `onCellValueChange` cho cột 3 (Loại): persist `bom_line.metadata.kind`.
- [ ] Badge "⚠️ override" khi `metadata.kind` khác `item.itemType`.
- [ ] Test fill-down 20 dòng: Univer xử lý OK.

**Deliverable:** User đổi được Loại ngay trong grid, persist vào metadata, không mất data khi reload.

### Phase 2 — V1.7-beta.1 (3-5 ngày)

**Scope:** Thêm side sheet edit sourcing/routing basic.

- [ ] Component `<KindDetailSheet />` với 2 tabs Thương mại / Gia công.
- [ ] Tab Thương mại: form NCC (FK select) + lead time + MOQ + giá + currency.
- [ ] Tab Gia công: form vật liệu + blank size + route steps (dynamic list, add/remove, drag-to-reorder).
- [ ] Seed master `manufacturing_process` + `material` từ Excel "Material&Process" (read-only cho V1.7-beta.1, chưa cost calc).
- [ ] Double-click cell "Loại" → Popover quick, click "Chi tiết..." → mở Sheet.
- [ ] Persist toàn bộ vào `bom_line.metadata.sourcing` hoặc `.routing`.
- [ ] Hiển thị small badge ở cell Loại nếu đã có route (green dot) hoặc sourcing đầy đủ (blue dot) → user biết dòng nào chưa điền.

**Deliverable:** Data sourcing + routing được lưu, đọc lại đúng, form validate.

### Phase 3 — V1.7 GA (1-2 tuần)

**Scope:** Auto calc + integration PR.

- [ ] Cost calculation: sum route × process rate + material × weight × (1 + scrap%).
- [ ] Lead time tính từ sum hours ÷ xưởng capacity hoặc max(supplier leadtime, route total).
- [ ] Cột mới "Ước tính lead time" + "Cost" (có thể ẩn mặc định, toggle).
- [ ] Button "Tạo PR từ BOM" gom các line com → bulk PR cho từng NCC.
- [ ] Migration sang schema 5c (Hybrid) khi data shape chốt.
- [ ] Export route sheet PDF cho tổ xưởng.

**Deliverable:** Từ BOM có thể sinh PR và route sheet tự động, chuẩn bị cho workflow V2.

---

## 7. Open questions — cần user trả lời trước khi implement

Ranked theo mức blocker:

1. **[BLOCKER Phase 1]** Khi user đổi Loại tại `bom_line`, có cần prompt xác nhận "bạn đang override với item master" không? Hay silent override? *(Ảnh hưởng UX: 1 click vs 2 click cho mỗi lần đổi.)*

2. **[BLOCKER Phase 1]** Khi item master đổi `itemType` về sau, `bom_line.metadata.kind` đã override có auto-sync không? Hay giữ nguyên override cho đến khi user clear? *(Ảnh hưởng: data consistency vs predictability.)*

3. **[BLOCKER Phase 2]** Route công đoạn có cần **tính cost/lead-time tự động** từ giá/giờ + giá/kg (cần bảng master), hay chỉ **ghi nhận thông tin** cho tổ xưởng đọc? *(Nếu chỉ ghi nhận: Phase 2 chỉ 3 ngày. Nếu tính tự động: đẩy sang Phase 3 + seed master data là prerequisite.)*

4. **[BLOCKER Phase 2]** Thương mại có cần **link đến PR/PO hiện có** (join với bảng `purchase_request` + `purchase_order`), hay chỉ **snapshot NCC + giá tại thời điểm thêm BOM**? *(Nếu link: query phức tạp + issue state inconsistency khi PR cancelled. Nếu snapshot: đơn giản, nhưng giá có thể lỗi thời.)*

5. **[BLOCKER Phase 2]** Khi đổi loại **fab → com** giữa chừng (user đã điền route), route cũ **xóa ngay**, **giữ lại ẩn** (có thể revert), hay **prompt xác nhận**? *(Ảnh hưởng: data loss risk.)*

6. **[Phase 2]** Có cần **template route** không? Ví dụ "Route chuẩn cho AL6061" = Wire cut → Mill → Drill → Anode. User apply template + tinh chỉnh. *(Save time cho BOM mới nhưng thêm complexity UI picker.)*

7. **[Phase 2]** NCC đa quốc gia hay chỉ VN? Có cần nhiều currency VND/USD/CNY không? *(Impact: numeric precision, format hiển thị, cột currency thêm.)*

8. **[Phase 3]** Khi **BOM revision đã RELEASED** (frozen), user có được đổi kind/sourcing/route không? Hay chỉ đọc? *(Audit trail vs operational flexibility.)*

9. **[Phase 3]** Khi user đã tạo PR từ BOM line → có lock `metadata.sourcing` lại không? Hoặc cho edit nhưng warning "PR đã tạo, edit có thể gây lệch"? *(Immutability vs pragmatism.)*

10. **[Polish]** Column width có cần **persist per-user** không (mỗi user tự resize, lưu vào preference), hay global cho toàn team? *(Ảnh hưởng scope: +1-2 ngày nếu persist per-user.)*

---

## Next step

**Anh Hoạt vui lòng trả lời nhanh 5 blocker (Q1-Q5)** để Phase 1 + Phase 2 có scope chốt. Q6-Q10 có thể giải quyết lúc implement Phase 2/3.

Sau khi chốt, solution-brainstormer sẽ chuyển plan này sang `planner` để viết implementation plan chi tiết cho V1.7-beta (column widths + Univer dropdown) — ship trong 1-2 ngày.
