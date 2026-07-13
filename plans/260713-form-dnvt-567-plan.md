# Kế hoạch: Form "Phiếu đề xuất vật tư DNVT" (khớp 100% DNVT 567) — V3.10

- **Task ID:** TASK-20260713-001
- **Ngày lập:** 2026-07-13 (+07)
- **Người lập:** Claude (planner)
- **Version đích:** V3.10
- **Phụ thuộc:** V3.9 (backend `purchase_request` + luồng submit→duyệt→kế toán) đã LIVE.
- **Nguồn form giấy:** `./DNVT 567 09072026.xlsx` (đã inspect line-level bằng openpyxl — xem §3).

---

## 1. Overview

Tạo **FORM CHỨC NĂNG MỚI** "Phiếu đề xuất vật tư DNVT" trình bày khớp 100% form giấy thật của
xưởng (mẫu `GTAM/PRD-MRF-02`). **Tái dùng TOÀN BỘ backend + luồng duyệt/kế toán V3.9**
(`purchase_request` / `purchase_request_line`, submit→admin duyệt→kế toán nhận PDF/Excel,
ownership, audit, số phiếu tự động). Chỉ tạo mới **phần trình bày**, phân biệt bằng cột
discriminator `form_type`.

**GIỮ NGUYÊN form MRF cũ** (`/procurement/purchase-requests/new-mrf`) — không sửa một dòng,
chỉ gỡ khỏi CTA. Vào được bằng URL trực tiếp.

**3 surface đều phải khớp DNVT 100%:**
1. **(a) Form nhập mới** — `/procurement/purchase-requests/new-dnvt` (standalone, không tái dùng component new-mrf).
2. **(b) Trang chi tiết/duyệt on-screen** — `[id]/page.tsx` branch render theo `form_type`.
3. **(c) File xuất** — PDF (`dnvtPdf.tsx`) + Excel (`dnvt-mrf-template.xlsx` + `buildDnvtExcel`) mới.

Cả 3 surface DNVT: **ẩn** cột Mã VT + Đơn giá + Tổng tiền + mục IV (Theo dõi) + mục V (Quy tắc);
**thêm** 2 cột Tham khảo + Ngày giao hàng.

---

## 2. Quyết định đã chốt (user confirm — KHÔNG hỏi lại)

| # | Quyết định |
|---|------------|
| 1 | **Hướng A**: tái dùng backend V3.9, chỉ thêm phần trình bày, discriminator `form_type`. |
| 2 | 3 surface (form nhập / detail / file xuất) khớp DNVT 100%. |
| 3 | Số phiếu **dùng CHUNG** dãy `{seq}/PRD-MRF/{MMYY}` với MRF. |
| 4 | **Tham khảo** = free-text `varchar(64)` (nhãn "Tham khảo", khác `reference_code`="Mã tham chiếu"). **Ngày giao hàng** = `date` (khác `needed_by`="Ngày cần"). |
| 5 | Giữ new-mrf sống, gỡ khỏi menu. CTA "Tạo đề xuất vật tư" trỏ form MỚI. Form mới standalone, chấp nhận duplicate ~80 dòng helper. |

**Xác minh khi đọc code (bổ sung chắc chắn cho quyết định):**
- **QĐ#3 — số phiếu dùng chung: ĐÚNG, 0 dòng backend cần sửa.** `app.gen_pr_paper_form_no()`
  (`packages/db/migrations/0046_pr_mrf_workflow.sql` L140–162) tính `MAX(seq)+1` trên TẤT CẢ
  `purchase_request` có `paper_form_no LIKE '%/PRD-MRF/MMYY'` — **không filter `form_type`**.
  MRF + DNVT tự chia sẻ dãy. Form giấy `138/PRD-MRF/0926` khớp format.
- **Discriminator lan tỏa miễn phí:** `getPR()` (`repos/purchaseRequests.ts` L83) dùng
  `db.select().from(purchaseRequest)` (lấy hết cột) → sau khi thêm cột Drizzle, `pr.formType`
  tự có ở CẢ 2 export route + detail API (`[id]/route.ts` L73 spread `...row`). Không cần sửa GET.
- **Middleware:** `middleware.ts` chặn theo prefix `/procurement` (L41) → `new-dnvt` **đã được
  bảo vệ auth**, KHÔNG cần đăng ký route mới. Không có `ROUTE_ROLE_GUARD` riêng — RBAC nằm ở
  in-page `can(roles,"create","pr")` + API `requireCan`.

---

## 3. Cấu trúc DNVT 567 đã inspect (line-level, chính xác)

File `DNVT 567 09072026.xlsx`, 1 sheet `'09-07-26 (2)'`, vùng `A1:Q27`. Merges + values thực tế:

### Header (row 1–3)
| Ô | Nội dung |
|----|----------|
| `C1:J1` | `CÔNG TY CỔ PHẦN SẢN XUẤT TỰ ĐỘNG HÓA CÔNG NGHỆ TOÀN CẦU` |
| `C2:J3` | `PHIẾU ĐỀ XUẤT VẬT TƯ-NPL` (title, merge 2 hàng) |
| `K2` / `L2:M2` | `Số phiếu :` / `138/PRD-MRF/0926` |
| `K3` / `L3:M3` | `Ngày lập :` / `9/7/2026` |

### I. Thông tin chung (row 5–9)
| Ô label | Ô value | Map DB |
|---------|---------|--------|
| `A5:M5` = `I. Thông tin chung` | — | — |
| `A6:B6` = `Kính gửi:` | `C6:M6` = `Bộ Phận Mua Hàng` | `target_department` |
| `A7:B7` = `Bộ phận đề xuất:` | `C7:M7` = `Phòng Gia Công` | `proposing_department` |
| `A8:B8` = `Người đề xuất:` | `C8:M8` = `NGUYỄN VĂN TRIỀU` | `requested_by` → name |
| `A9:B9` = `Lý do đề xuất:` | `C9:M9` = `Gia công cho Code Z0000002-558567` | `request_reason` |

### II. Danh mục vật tư (row 11 title, row 12 header, data 13–19)
`A11:M11` = `II. Danh mục vật tư`. Header row 12 — **14 cột** (13 cột A–M liền + Q tách):

| Cột Excel gốc | Header | Map DB | Ghi chú |
|---------------|--------|--------|---------|
| A | STT | (index dòng) | |
| B | Tên vật tư | `item_name` (fallback `item.name`) | VD "Nhôm AL6061" |
| C | Quy cách chi tiết | `specification` | VD "445X365X15" |
| D | ĐVT | `uom` | VD "TẤM", "CỤC" |
| E | SL yêu cầu | `qty` | |
| F | Tồn kho | `on_hand_snapshot` | VD 0 |
| G | Duyệt | `approved_qty` | |
| H | Ngày cần | `needed_by` | VD 7/10/2026 |
| I | Ưu tiên | `priority` | Khẩn/Bình thường/Dự phòng |
| J | Phân loại | `category` | Tiêu hao=CONSUMABLE / CCDC=TOOL |
| K | Mã tham chiếu | `reference_code` | |
| L | **Tham khảo** | **`reference_note` (MỚI)** | VD "EC", "VH" (free-text ngắn) |
| M | Ghi chú | `notes` | |
| **Q** | **NGÀY GIAO HÀNG** | **`delivery_date` (MỚI)** | Gốc đặt ở cột Q (tách rời sau gap N–P) |

> **Quyết định template (R-note):** Trong file generate `dnvt-mrf-template.xlsx`, đặt
> **Ngày giao hàng ở cột N liền mạch** (ngay sau M=Ghi chú) → bảng 14 cột A–N contiguous,
> sạch hơn bản giấy (gốc để ở Q là phần phụ ghi tay). Khớp đúng ý "14 cột" của user.

### III. Kiểm tra & Phê duyệt (row 20 title, row 21 header, 5 dòng 22–26)
`A20:M20` = `III. Kiểm tra & Phê duyệt`. Header row 21: `A21:B21`=Vai trò · `C21:E21`=Họ tên ·
`F21:J21`=Ký tên / Ngày · `K21:M21`=(vùng trống ký).

| Dòng | Vai trò (A:B) | Họ tên (C:E) | Map data |
|------|---------------|--------------|----------|
| 22 | Người đề xuất | `NGUYỄN VĂN TRIỀU` | `requested_by` + `created_at` |
| 23 | Kiểm tra tồn kho | `LÊ XUÂN HÒA` | **trống — ký tay** (không map) |
| 24 | Kiểm tra kỹ thuật | (trống) | **trống — ký tay** |
| 25 | Trưởng bộ phận | (trống) | `dept_approved_by` + `dept_approved_at` |
| 26 | Giám đốc | (trống) | `director_approved_by` + `director_approved_at` |

### Footer
`H27:M27` = `Mẫu No: GTAM/PRD-MRF-02 | Phiên bản: 1.0 | Hiệu lực: 2025`

---

## 4. Field mapping DNVT → DB (đầy đủ)

**Header** — đã có sẵn 100%: `target_department`, `proposing_department`, `request_reason`,
`paper_form_no`, `created_at`, `requested_by`. **THÊM** `form_type varchar(16) NOT NULL DEFAULT 'MRF'`.

**Line** — 12/14 cột map sẵn (xem §3 bảng II). **THÊM 2 cột:**
- `reference_note varchar(64) NULL` ← Tham khảo (nhãn "Tham khảo").
- `delivery_date date NULL` ← Ngày giao hàng.

**Enum label (tái dùng nguyên):**
- Ưu tiên: `URGENT`=Khẩn · `NORMAL`=Bình thường · `RESERVE`=Dự phòng.
- Phân loại (DNVT chỉ dùng 2): `CONSUMABLE`=Tiêu hao · `TOOL`=CCDC (giữ MATERIAL/OTHER cho tương thích).

---

## 5. Architecture — discriminator pattern

```
                         ┌────────────────── BACKEND V3.9 (tái dùng 100%) ──────────────────┐
 new-dnvt (form)  ─POST─▶│ /api/purchase-requests  → createPR() → submitPR() (gen số phiếu) │
 new-mrf (form)   ─POST─▶│   body.formType: 'DNVT' | 'MRF'  →  purchase_request.form_type     │
                         │ luồng duyệt: quick-approve / dept / director (KHÔNG đổi)          │
                         │ notify kế toán sau duyệt (KHÔNG đổi — deep-link detail)           │
                         └──────────────────────────────────────────────────────────────────┘
                                              │ pr.form_type
                    ┌─────────────────────────┼─────────────────────────┐
          detail [id]/page.tsx        export-pdf/route.ts        export-excel/route.ts
          if formType==='DNVT'        if formType==='DNVT'        if formType==='DNVT'
            <DnvtDetailBody/>           renderDnvtPdfBuffer()       buildDnvtExcel()
          else <Mrf hiện tại>          else renderYcvtPdfBuffer()  else buildYcvtExcel()
```

**Nguyên tắc:** 1 branch point duy nhất mỗi surface (`pr.formType === 'DNVT'`). YAGNI/KISS/DRY:
- Backend/luồng/notify/audit/số phiếu: **0 thay đổi logic** (chỉ persist thêm 3 cột).
- new-mrf: **0 thay đổi** (defaults `form_type='MRF'`).

---

## 6. Phases (schema → wiring → form → excel → pdf → branch → entry)

### P0 — Migration 0051 (schema, additive) · **Effort: S**
File mới: `packages/db/migrations/0051_dnvt_form_type_fields.sql`
```sql
-- V3.10 — DNVT form: discriminator + 2 cột dòng (Tham khảo + Ngày giao hàng).
-- Additive, không --single-transaction cần thiết (chỉ ADD COLUMN, không backfill nặng).
ALTER TABLE app.purchase_request      ADD COLUMN IF NOT EXISTS form_type      varchar(16) NOT NULL DEFAULT 'MRF';
ALTER TABLE app.purchase_request_line ADD COLUMN IF NOT EXISTS reference_note varchar(64);
ALTER TABLE app.purchase_request_line ADD COLUMN IF NOT EXISTS delivery_date  date;

COMMENT ON COLUMN app.purchase_request.form_type IS
  'V3.10 — Loại phiếu trình bày: MRF (mẫu YCVT 5-section) | DNVT (mẫu GTAM/PRD-MRF-02). Backend chung.';
COMMENT ON COLUMN app.purchase_request_line.reference_note IS 'V3.10 DNVT — Cột "Tham khảo" (free-text ngắn, VD EC/VH).';
COMMENT ON COLUMN app.purchase_request_line.delivery_date  IS 'V3.10 DNVT — Cột "Ngày giao hàng".';

-- (tuỳ chọn) index lọc theo loại phiếu nếu sau này cần report tách DNVT/MRF:
-- CREATE INDEX IF NOT EXISTS pr_form_type_idx ON app.purchase_request (form_type, created_at DESC);
```
> **Idempotent** (`IF NOT EXISTS`) → chạy lại an toàn. Không backfill: mọi phiếu cũ mặc định 'MRF' (đúng — chúng là YCVT/MRF).

### P1 — Drizzle schema + shared Zod + repo wiring · **Effort: M**

**1a. `packages/db/src/schema/procurement.ts`**
- `purchaseRequest` (sau `requestReason`, ~L73): thêm
  ```ts
  /** V3.10 — Loại phiếu trình bày: 'MRF' | 'DNVT'. Backend chung. */
  formType: varchar("form_type", { length: 16 }).notNull().default("MRF"),
  ```
- `purchaseRequestLine` (sau `onHandSnapshot`, ~L266): thêm
  ```ts
  /** V3.10 DNVT — Cột "Tham khảo" (free-text ngắn). */
  referenceNote: varchar("reference_note", { length: 64 }),
  /** V3.10 DNVT — Cột "Ngày giao hàng". */
  deliveryDate: date("delivery_date"),
  ```
  (`date` đã import sẵn ở L4.)

**1b. `packages/shared/src/schemas/procurement.ts`**
- Thêm hằng loại phiếu (gần `PR_PRIORITIES` ~L66):
  ```ts
  export const PR_FORM_TYPES = ["MRF", "DNVT"] as const;
  export type PrFormType = (typeof PR_FORM_TYPES)[number];
  ```
- `prLineInputSchema` (thêm sau `onHandSnapshot` ~L94):
  ```ts
  referenceNote: z.string().trim().max(64).optional().nullable(),
  deliveryDate: dateStringOrDate.optional().nullable(),
  ```
- `prCreateSchema` (thêm sau `requestReason` ~L110):
  ```ts
  formType: z.enum(PR_FORM_TYPES).default("MRF"),
  ```
- `prUpdateSchema.lines[]` (thêm 2 field line cho parity edit ~L155): `referenceNote`, `deliveryDate` như trên.

**1c. `apps/web/src/server/repos/purchaseRequests.ts`**
- `CreatePRLineInput` + `ReplacePRLineInput`: thêm `referenceNote?: string | null;` `deliveryDate?: Date | null;`
- `CreatePRInput`: thêm `formType?: "MRF" | "DNVT" | null;`
- `createPR()` insert header (~L172): thêm `formType: input.formType ?? "MRF",`
- `createPR()` + `replacePRLines()` insert line values (~L200 và ~L318): thêm
  ```ts
  referenceNote: l.referenceNote ?? null,
  deliveryDate: l.deliveryDate ? l.deliveryDate.toISOString().slice(0, 10) : null,
  ```
- `getPRLinesEnriched()` SELECT (~L636): thêm
  ```ts
  referenceNote: purchaseRequestLine.referenceNote,
  deliveryDate: purchaseRequestLine.deliveryDate,
  ```
> `getPR()` KHÔNG cần sửa — `select()` lấy hết cột → `formType` tự có sau khi thêm Drizzle field.

### P2 — API POST route (formType passthrough) · **Effort: S**
`apps/web/src/app/api/purchase-requests/route.ts` POST (~L66):
- Thêm `formType: body.data.formType ?? "MRF",` vào object gọi `createPR({...})`.
- Trong `lines.map`: thêm `referenceNote: l.referenceNote ?? null,` và `deliveryDate: l.deliveryDate ?? null,`.
> Auto-submit + notify (L98–134) giữ nguyên → DNVT tự chạy đúng luồng V3.9. `GET`/`PATCH` không đụng
> (PATCH nếu muốn edit đủ 2 cột thì thêm map ở L148 — optional, form DNVT chưa cần edit-in-place ở V3.10).

### P3 — Form nhập `new-dnvt` (standalone) · **Effort: M**
File mới: `apps/web/src/app/(app)/procurement/purchase-requests/new-dnvt/page.tsx`
- **COPY khung** từ `new-mrf/page.tsx` (structure header/toolbar/print/handleSubmit) rồi **sửa**:
  - Bỏ cột **Mã VT** (itemSku input), **Đơn giá DK**, **Tổng tiền**, dòng footer tổng tiền.
  - Bỏ **mục IV (Theo dõi)** + **mục V (Quy tắc quản lý)**.
  - Bảng II đổi thành **14 cột**: STT · Tên vật tư · Quy cách chi tiết · ĐVT · SL yêu cầu ·
    Tồn kho(—) · Duyệt(—) · Ngày cần · Ưu tiên · Phân loại · Mã tham chiếu · **Tham khảo** ·
    Ghi chú · **Ngày giao hàng**.
  - Mục III đổi từ 3 dòng → **5 dòng**: Người đề xuất / Kiểm tra tồn kho / Kiểm tra kỹ thuật /
    Trưởng bộ phận / Giám đốc (cột Họ tên + Ký tên/Ngày; 3 dòng ký tay để trống on-screen).
  - Title giữ `PHIẾU ĐỀ XUẤT VẬT TƯ — NPL`. Footer thêm dòng `Mẫu No: GTAM/PRD-MRF-02 | Phiên bản: 1.0 | Hiệu lực: 2025`.
  - Header company: `CÔNG TY CỔ PHẦN SẢN XUẤT TỰ ĐỘNG HÓA CÔNG NGHỆ TOÀN CẦU` (giữ logo GTAM + XƯỞNG SXKD).
- `MRFLineDraft` → `DnvtLineDraft`: **bỏ** `itemSku`, `estimatedUnitPrice`; **thêm** `referenceNote: string`, `deliveryDate: string`.
- `handleSubmit` payload `PRCreateInput`: thêm `formType: "DNVT"`, mỗi line thêm
  `referenceNote: l.referenceNote.trim() || null`, `deliveryDate: l.deliveryDate ? new Date(l.deliveryDate) : null`,
  và `estimatedUnitPrice: null` (DNVT không nhập giá), `itemSku: null`.
- Reuse hooks có sẵn: `useCreatePurchaseRequest`, `usePreviewPaperFormNo`, `useSession` (không tạo hook mới).
- Sau tạo: `router.push('/procurement/purchase-requests/${id}')` (detail branch sẽ render DNVT).
- **KHÔNG import** bất kỳ thứ gì từ `new-mrf/page.tsx` (component nội bộ) — copy helper `SectionTitle/FieldRow/Th/Td/ApprovalRow/formatDateVN/blankLine` vào file này (duplicate ~80 dòng, đã được user chấp nhận).
- `export const dynamic = "force-dynamic";`

### P4 — Excel template DNVT + `buildDnvtExcel` · **Effort: M**

**4a. File template mới:** `apps/web/src/server/templates/dnvt-mrf-template.xlsx`
→ Sinh bằng script openpyxl ở §8 (chạy 1 lần, commit file kết quả).

**4b. Service mới:** `apps/web/src/server/services/dnvtExportExcel.ts`
- Copy pattern `ycvtExportExcel.ts` (load template cache, logo, `fmtDateVN`), nhưng:
  - `TEMPLATE_PATH` → `dnvt-mrf-template.xlsx`; sheet name `wb.getWorksheet("Phiếu DNVT")`.
  - Interface `DnvtExportLine` = YcvtExportLine **bỏ** `estimatedUnitPrice`, **thêm**
    `referenceNote?: string | null; deliveryDate?: string | Date | null;`.
  - `DnvtExportData` = như YcvtExportData nhưng **bỏ** timeline IV (`poCreatedAt/goodsReceivedAt/...`).
  - **Cell mapping** (khớp template §8, sheet "Phiếu DNVT"):
    - `L2` = paperFormNo · `L3` = createdAt (date).
    - `C6` = targetDepartment · `C7` = proposingDepartment · `C8` = requestedByName · `C9` = requestReason.
    - Data rows **13→32** (max 20): `A`=STT(pre-fill) · `B`=name · `C`=specification · `D`=uom ·
      `E`=qty · `F`=onHandSnapshot · `G`=approvedQty · `H`=neededBy(fmtDateVN) · `I`=priority label ·
      `J`=category label · `K`=referenceCode · `L`=referenceNote · `M`=notes · `N`=deliveryDate(fmtDateVN).
    - Section III rows **36–40**: `C36`=requestedByName, `F36`=fmtDateVN(createdAt);
      row 37 (Kiểm tra tồn kho) + 38 (Kiểm tra kỹ thuật) **để trống**;
      `C39`=deptApprovedByName, `F39`=fmtDateVN(deptApprovedAt);
      `C40`=directorApprovedByName, `F40`=fmtDateVN(directorApprovedAt).
  - **KHÔNG** fill giá/tổng tiền/mục IV/mục V (không tồn tại trong template).
  - `buildDnvtExcel(data): Promise<Uint8Array>` — return giống buildYcvtExcel.

### P5 — PDF DNVT · **Effort: M**
File mới: `apps/web/src/server/services/dnvtPdf.tsx`
- Copy `ycvtPdf.tsx` (font Roboto, logo, A4 landscape, helper `fmtDate/fmtNum`) rồi:
  - Header + title + section I: **giữ nguyên** (đủ field).
  - **II. Danh mục vật tư — 14 cột**, BỎ `cSku`(Mã VT) + `cPrice`(Đơn giá) + `cTotal`(Tổng tiền) +
    dòng `tFootRow` tổng tiền. THÊM cột `cRefNote`(Tham khảo) + `cDelivery`(Ngày giao hàng).
    Thứ tự: STT · Tên vật tư · Quy cách · ĐVT · SL · Tồn kho · Duyệt · Ngày cần · Ưu tiên ·
    Phân loại · Mã tham chiếu · Tham khảo · Ghi chú · Ngày giao hàng.
    → **Cân lại col widths** cho tổng ~815pt landscape (A4 usable 817.89pt). Gợi ý:
    STT22 · Name150 · Spec95 · Uom34 · Qty40 · OnHand42 · Approved42 · Need52 · Prio52 · Cat54 ·
    RefCode54 · RefNote46 · Note100 · Delivery52 (≈835 → tinh chỉnh Name/Note xuống cho vừa ≤816).
  - **III. Kiểm tra & Phê duyệt — 5 dòng** (thay 3 dòng MRF): Người đề xuất(ký ✓ createdAt) /
    Kiểm tra tồn kho(trống) / Kiểm tra kỹ thuật(trống) / Trưởng bộ phận(dept) / Giám đốc(director).
    Cột: Vai trò · Họ tên · Ký tên / Ngày (bỏ cột Ghi chú của MRF hoặc giữ hẹp — theo giấy chỉ 3 cột).
  - **BỎ hẳn mục IV (Theo dõi)** + **mục V (Quy tắc quản lý)**.
  - THÊM footer text `Mẫu No: GTAM/PRD-MRF-02 | Phiên bản: 1.0 | Hiệu lực: 2025` cuối trang.
  - `interface DnvtPdfLine` (bỏ estimatedUnitPrice, thêm referenceNote + deliveryDate);
    `interface DnvtPdfInput` (bỏ totalEstimatedAmount + timeline IV).
  - Export `renderDnvtPdfBuffer(input): Promise<Uint8Array>`.

### P6 — Branch 2 export route + trang chi tiết (surface b) · **Effort: M**

**⚠️ R1 (điểm quan trọng nhất — brainstorm):** CẢ 2 export route phải branch. Sót 1 → phiếu DNVT
ra template MRF **lộ cột giá/Mã VT/IV/V** = sai nghiệp vụ. Test BẮT BUỘC cả PDF lẫn Excel.

**6a. `apps/web/src/app/api/purchase-requests/[id]/export-excel/route.ts`**
- Sau `const pr = await getPR(...)` + ownership guard (giữ nguyên L30–39), branch:
  ```ts
  if (pr.formType === "DNVT") {
    const lines: DnvtExportLine[] = linesRaw.map((l) => ({ ...bỏ price, thêm referenceNote, deliveryDate }));
    const buf = await buildDnvtExcel({ paperFormNo, createdAt, targetDepartment, proposingDepartment,
      requestedByName, requestReason, lines, deptApprovedByName, deptApprovedAt, directorApprovedByName,
      directorApprovedAt });
    // filename: `DNVT-${safeFormNo}.xlsx`
  } else { /* buildYcvtExcel hiện tại — giữ nguyên */ }
  ```
- `linesRaw` map thêm `referenceNote: l.referenceNote ?? null`, `deliveryDate: l.deliveryDate ?? null`.

**6b. `apps/web/src/app/api/purchase-requests/[id]/export-pdf/route.ts`**
- Y hệt: branch `pr.formType === "DNVT"` → `renderDnvtPdfBuffer({...})` (bỏ totalEstimatedAmount +
  timeline IV, thêm 2 field line). filename `DNVT-${safeFormNo}.pdf`. Else giữ `renderYcvtPdfBuffer`.

**6c. `apps/web/src/app/(app)/procurement/purchase-requests/[id]/page.tsx`**
- Sau khi có `pr` (~L190), branch body:
  ```tsx
  {pr.formType === "DNVT" ? <DnvtDetailBody pr={pr} /> : (/* MRF <article> hiện tại giữ nguyên */)}
  ```
- **Toolbar + dialog duyệt/từ chối/xoá/convert GIỮ CHUNG** (không đụng — luồng V3.9). Chỉ tách phần
  `<article>` render.
- `DnvtDetailBody`: tách thành component (cùng file hoặc `components/procurement/DnvtDetailBody.tsx`)
  render 14 cột (bỏ Mã VT/Đơn giá/Tổng tiền/footer tổng), mục III 5 dòng (map dept/director + 3 dòng
  trống ký tay), **bỏ mục IV + V**, thêm footer mẫu. Nút Excel/PDF trong toolbar tự trỏ đúng file
  (route đã branch) — không cần sửa handler.
- Line type: detail API trả `pr.lines` đã gồm `referenceNote` + `deliveryDate` sau P1c.

### P7 — Entry points (2 form để chọn) · **Effort: S**
> **CẬP NHẬT (user chốt 2026-07-13):** hiển thị CẢ 2 FORM cho người dùng chọn, KHÔNG ẩn new-mrf.
- `apps/web/src/components/engineering/PRTab.tsx`:
  - Nút header (L83–88): thay 1 nút bằng **2 nút** cạnh nhau:
    - **"＋ Phiếu đề xuất vật tư (DNVT)"** (primary) → `/procurement/purchase-requests/new-dnvt`
    - **"＋ Phiếu MRF (có giá)"** (variant outline) → `/procurement/purchase-requests/new-mrf`
    - Cả 2 chỉ hiện khi `canCreateMRF` (can create pr).
  - Empty-state (L139): 2 nút tương tự (DNVT primary + MRF outline).
- `apps/web/src/lib/nav-items.ts`: **KHÔNG đổi** — menu "Đề xuất vật tư" (L123) đã trỏ list
  `/procurement/purchase-requests` (đúng). Người dùng vào list → chọn 1 trong 2 nút tạo.

---

## 7. Danh sách file (Create / Modify)

**Tạo mới (5):**
| File | Mục đích |
|------|----------|
| `packages/db/migrations/0051_dnvt_form_type_fields.sql` | Migration additive 3 cột |
| `apps/web/src/app/(app)/procurement/purchase-requests/new-dnvt/page.tsx` | Form nhập DNVT standalone |
| `apps/web/src/server/services/dnvtExportExcel.ts` | `buildDnvtExcel` |
| `apps/web/src/server/services/dnvtPdf.tsx` | `renderDnvtPdfBuffer` |
| `apps/web/src/server/templates/dnvt-mrf-template.xlsx` | Template Excel DNVT (sinh từ script §8) |

*(tuỳ chọn)* `apps/web/src/components/procurement/DnvtDetailBody.tsx` nếu tách component detail.

**Sửa (7):**
| File | Thay đổi |
|------|----------|
| `packages/db/src/schema/procurement.ts` | +`formType` (header) +`referenceNote`/`deliveryDate` (line) |
| `packages/shared/src/schemas/procurement.ts` | +`PR_FORM_TYPES`, +3 field zod, +`formType` create |
| `apps/web/src/server/repos/purchaseRequests.ts` | persist 3 cột + SELECT enriched 2 cột |
| `apps/web/src/app/api/purchase-requests/route.ts` | POST passthrough `formType` + 2 field line |
| `apps/web/src/app/api/purchase-requests/[id]/export-excel/route.ts` | **Branch R1** DNVT→buildDnvtExcel |
| `apps/web/src/app/api/purchase-requests/[id]/export-pdf/route.ts` | **Branch R1** DNVT→renderDnvtPdfBuffer |
| `apps/web/src/app/(app)/procurement/purchase-requests/[id]/page.tsx` | Branch render body theo formType |
| `apps/web/src/components/engineering/PRTab.tsx` | CTA new-mrf → new-dnvt (2 link) |

**KHÔNG đụng:** `new-mrf/page.tsx`, `ycvtExportExcel.ts`, `ycvtPdf.tsx`, `ycvt-mrf-template.xlsx`,
`nav-items.ts`, `middleware.ts`, toàn bộ route duyệt (`quick-approve/dept-approve/director-approve/
reject/submit`), `notifications.ts`, `gen_pr_paper_form_no()`.

---

## 8. Script sinh template `dnvt-mrf-template.xlsx` (openpyxl — chạy 1 lần)

Chạy tại repo root (`python3` + openpyxl có sẵn — đã verify). Sinh file rồi commit.

```python
# scripts/gen-dnvt-template.py  (chạy 1 lần, có thể xoá sau khi commit .xlsx)
import openpyxl
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Phiếu DNVT"          # buildDnvtExcel getWorksheet("Phiếu DNVT")

BLUE = "005D9F"; GREY = "F5F5F5"
thin = Side(style="thin", color="999999")
box  = Border(left=thin, right=thin, top=thin, bottom=thin)
def bluehdr(c): c.fill=PatternFill("solid",fgColor=BLUE); c.font=Font(bold=True,color="FFFFFF",size=11)
def greyhdr(c): c.fill=PatternFill("solid",fgColor=GREY); c.font=Font(bold=True,size=9)
center=Alignment(horizontal="center",vertical="center",wrap_text=True)
left  =Alignment(horizontal="left",vertical="center",wrap_text=True)

# Col widths (A..N = 14 cột bảng II liền mạch)
widths={"A":4.5,"B":26,"C":22,"D":7,"E":8,"F":8,"G":8,"H":12,"I":11,"J":12,"K":15,"L":9,"M":24,"N":13}
for k,v in widths.items(): ws.column_dimensions[k].width=v

# ---- Header ----
ws.merge_cells("A1:B4")   # logo box (buildDnvtExcel addImage vào đây)
ws.merge_cells("C1:J2"); ws["C1"]="CÔNG TY CỔ PHẦN SẢN XUẤT TỰ ĐỘNG HÓA CÔNG NGHỆ TOÀN CẦU"
ws["C1"].font=Font(bold=True,size=12); ws["C1"].alignment=center
ws.merge_cells("C3:J4"); ws["C3"]="PHIẾU ĐỀ XUẤT VẬT TƯ-NPL"
ws["C3"].font=Font(bold=True,size=16); ws["C3"].alignment=center
ws["K2"]="Số phiếu :"; ws["K2"].font=Font(bold=True)
ws.merge_cells("L2:N2")   # buildDnvtExcel ghi L2 = paperFormNo
ws["K3"]="Ngày lập :"; ws["K3"].font=Font(bold=True)
ws.merge_cells("L3:N3")   # L3 = createdAt
ws["L3"].number_format="dd/mm/yyyy"

# ---- I. Thông tin chung ----
ws.merge_cells("A6:N6"); ws["A6"]="I. Thông tin chung"; bluehdr(ws["A6"]); ws["A6"].alignment=left
for r,(lbl) in zip((7,8,9,10),("Kính gửi:","Bộ phận đề xuất:","Người đề xuất:","Lý do đề xuất:")):
    ws.merge_cells(f"A{r}:B{r}"); ws[f"A{r}"]=lbl; greyhdr(ws[f"A{r}"])
    ws.merge_cells(f"C{r}:N{r}")     # C7=target,C8=proposing,C9=requester,C10=reason
    ws[f"C{r}"].alignment=left; ws[f"C{r}"].border=box
# (buildDnvtExcel map: C7/C8/C9/C10 — CẬP NHẬT số hàng cho khớp code; ví dụ này I ở 7..10)

# ---- II. Danh mục vật tư ----
ws.merge_cells("A12:N12"); ws["A12"]="II. Danh mục vật tư"; bluehdr(ws["A12"]); ws["A12"].alignment=left
HEAD=["STT","Tên vật tư","Quy cách chi tiết","ĐVT","SL yêu cầu","Tồn kho","Duyệt","Ngày cần",
      "Ưu tiên","Phân loại","Mã tham chiếu","Tham khảo","Ghi chú","NGÀY GIAO HÀNG"]
for i,h in enumerate(HEAD):
    c=ws.cell(row=13,column=1+i,value=h); greyhdr(c); c.alignment=center; c.border=box
DATA_START=14; MAX=20
for r in range(DATA_START, DATA_START+MAX):        # 14..33
    ws.cell(row=r,column=1,value=r-DATA_START+1).alignment=center   # STT pre-fill 1..20
    for col in range(1,15): ws.cell(row=r,column=col).border=box

# ---- III. Kiểm tra & Phê duyệt ----
sec3=DATA_START+MAX+1                                # 35
ws.merge_cells(f"A{sec3}:N{sec3}"); ws[f"A{sec3}"]="III. Kiểm tra & Phê duyệt"; bluehdr(ws[f"A{sec3}"]); ws[f"A{sec3}"].alignment=left
hr=sec3+1                                            # 36 header
for rng,txt in (("A{r}:B{r}","Vai trò"),("C{r}:H{r}","Họ tên"),("I{r}:N{r}","Ký tên / Ngày")):
    ws.merge_cells(rng.format(r=hr)); c=ws[rng.format(r=hr).split(":")[0]]; c.value=txt; greyhdr(c); c.alignment=center
ROLES=["Người đề xuất","Kiểm tra tồn kho","Kiểm tra kỹ thuật","Trưởng bộ phận","Giám đốc"]
for i,role in enumerate(ROLES):
    r=hr+1+i                                         # 37..41
    ws.merge_cells(f"A{r}:B{r}"); ws[f"A{r}"]=role; ws[f"A{r}"].font=Font(bold=True); ws[f"A{r}"].alignment=left
    ws.merge_cells(f"C{r}:H{r}")                     # C{r} = Họ tên
    ws.merge_cells(f"I{r}:N{r}")                     # I{r} = Ký tên/Ngày
    for col in range(1,15): ws.cell(row=r,column=col).border=box

# ---- Footer ----
fr=hr+1+len(ROLES)+1                                 # 43
ws.merge_cells(f"A{fr}:N{fr}"); ws[f"A{fr}"]="Mẫu No: GTAM/PRD-MRF-02 | Phiên bản: 1.0 | Hiệu lực: 2025"
ws[f"A{fr}"].font=Font(italic=True,size=9); ws[f"A{fr}"].alignment=Alignment(horizontal="right")
ws.print_area=f"A1:N{fr}"; ws.page_setup.orientation="landscape"; ws.page_setup.fitToWidth=1
ws.sheet_properties.pageSetUpPr.fitToPage=True
wb.save("apps/web/src/server/templates/dnvt-mrf-template.xlsx")
print("OK")
```
> **QUAN TRỌNG:** số hàng trong `buildDnvtExcel` (P4b) PHẢI khớp số hàng script sinh ra. Nếu dùng
> layout script trên thì I ở row 7–10, header bảng row 13, data 14–33, III row 35 (header 36, dòng 37–41),
> footer 43 → **cập nhật lại cell mapping P4b theo đúng các số này** (mô tả P4b dùng 13/36–40 làm ví dụ;
> lấy CON SỐ TỪ SCRIPT làm chuẩn duy nhất). Khuyến nghị: sau khi sinh, mở file verify bằng openpyxl
> in ra coord để chốt hằng số trước khi viết builder.

**Cách khác (đỡ lệch số hàng):** clone `ycvt-mrf-template.xlsx` rồi xoá cột giá + section IV/V,
đổi header. Tuy nhiên template MRF nhiều merge phức tạp → **script sinh mới sạch hơn**, khuyến nghị dùng script.

---

## 9. Testing strategy

### 9.1 Local (bắt buộc pass trước push — CLAUDE.md rule #3)
```
pnpm.cmd --filter @iot/db typecheck
pnpm.cmd --filter @iot/shared typecheck
pnpm.cmd --filter @iot/web typecheck
pnpm.cmd --filter @iot/web build      # build phải PASS (CI sẽ fail nếu local fail)
```
Kiểm nhanh template: viết script node/openpyxl in cell của `dnvt-mrf-template.xlsx` xác nhận
header 14 cột đúng vị trí + không có ô "Đơn giá"/"Tổng tiền".

### 9.2 E2E VPS (sau deploy — 8 bước)
> Migration 0051 apply VPS **TRƯỚC** khi deploy code (xem §11).

1. **Tạo phiếu DNVT** qua form mới `/procurement/purchase-requests/new-dnvt`: 2–3 dòng (điền Tham khảo
   "EC"/"VH", Ngày giao hàng) → submit. Verify HTTP 201 + `paper_form_no` dạng `{n}/PRD-MRF/{MMYY}`
   nối tiếp dãy chung (không reset vì có DNVT).
2. **Detail branch:** mở `/procurement/purchase-requests/{id}` → thấy layout DNVT (14 cột, có Tham khảo
   + Ngày giao hàng, KHÔNG có Mã VT/Đơn giá/Tổng tiền/mục IV/mục V, mục III 5 dòng, footer mẫu).
3. **Admin duyệt nhanh** → APPROVED + DIRECTOR_APPROVED (luồng V3.9 chạy đúng cho DNVT).
4. **Tải PDF** `/{id}/export-pdf` → file `DNVT-*.pdf` layout DNVT (14 cột, 5 dòng ký, không giá/IV/V).
5. **Tải Excel** `/{id}/export-excel` → file `DNVT-*.xlsx` mở LibreOffice/Excel khớp mẫu GTAM/PRD-MRF-02.
6. **⚠️ R1 regression:** mở lại **1 phiếu MRF cũ** (VD `1/PRD-MRF/0726` băng tải 738) → detail + PDF +
   Excel vẫn ra **template MRF cũ** (có giá + IV + V). Chứng minh branch không phá MRF.
7. **Kế toán** `ketoan`: nhận notification sau duyệt DNVT → mở deep-link tải được cả PDF + Excel DNVT.
8. **Ownership:** operator tạo phiếu DNVT → operator khác/không phải chủ GET detail + export trả 404.

---

## 10. Security & Performance

- **Security:** tái dùng `requireCan(req,"read"/"create","pr")` + `canViewAllPRs()` ownership guard
  (đã có ở mọi route) → DNVT thừa hưởng nguyên. Không thêm bề mặt tấn công. Free-text `reference_note`
  giới hạn `varchar(64)` + Zod `max(64)` chống oversize. `delivery_date` qua `dateStringOrDate` refine.
- **Performance:** 0 query mới, 0 index bắt buộc (form_type index optional). Template Excel cache buffer
  như YCVT (`cachedTemplateBuffer`). PDF/Excel render on-demand, `Cache-Control: no-store` (giữ nguyên).
  1 phiếu ≤ 20 dòng → render < 200ms như MRF hiện tại.

---

## 11. Deploy order (nghiêm ngặt)

1. **Apply migration 0051 VPS TRƯỚC** (thủ công SCP + psql — như 0049/0050):
   ```
   scp -i ~/.ssh/iot_vps packages/db/migrations/0051_dnvt_form_type_fields.sql root@45.124.94.13:/tmp/
   ssh -i ~/.ssh/iot_vps root@45.124.94.13 \
     "docker exec -i iot_postgres psql -U iot -d iot < /tmp/0051_dnvt_form_type_fields.sql"
   # verify: \d app.purchase_request có form_type; \d app.purchase_request_line có reference_note+delivery_date
   ```
   (Additive + IF NOT EXISTS → code cũ đang chạy vẫn OK trong lúc apply.)
2. Push `main` → CI build `ghcr.io/andy-cods/hethong-iot:latest`.
3. SSH VPS `docker compose pull app worker` + `up -d app worker caddy`.
4. Chạy E2E §9.2 (8 bước) trên production.

---

## 12. Risks & Mitigations

| # | Rủi ro | Mitigation |
|---|--------|------------|
| R1 | **Sót branch 1 export route** → phiếu DNVT ra template MRF lộ cột giá/IV/V | Test §9.2 bước 4+5 BẮT BUỘC cả PDF lẫn Excel; checklist DoD tách 2 dòng riêng |
| R2 | Lệch số hàng script template ↔ `buildDnvtExcel` → data đổ sai ô | Chốt hằng số từ CHÍNH script §8; verify openpyxl in coord trước khi viết builder |
| R3 | new-mrf bị regression | Không đụng file new-mrf/ycvt*; test §9.2 bước 6 mở lại phiếu MRF cũ |
| R4 | Migration chạy code trước khi apply → insert thiếu cột 500 | Deploy order §11: apply 0051 TRƯỚC; cột có DEFAULT nên code cũ vẫn chạy |
| R5 | `delivery_date` timezone lệch (ISO slice) | Dùng `.toISOString().slice(0,10)` như `neededBy` hiện có (đã proven) |
| R6 | PDF 14 cột tràn chiều ngang A4 landscape | Tính lại col widths tổng ≤ 816pt (§P5); test render bước 4 |

---

## 13. Definition of Done (DoD)

- [ ] Migration `0051_dnvt_form_type_fields.sql` apply VPS OK (3 cột verified: `form_type`, `reference_note`, `delivery_date`).
- [ ] Drizzle schema + shared Zod + repo persist/SELECT 3 cột; `pnpm @iot/{db,shared,web} typecheck` PASS.
- [ ] Form `/procurement/purchase-requests/new-dnvt` tạo phiếu `formType='DNVT'` → 201 + số phiếu nối dãy chung.
- [ ] Detail `[id]` render DNVT khi `formType='DNVT'` (14 cột + Tham khảo + Ngày giao hàng; KHÔNG Mã VT/giá/tổng/IV/V; III 5 dòng; footer mẫu).
- [ ] **Export PDF DNVT** đúng layout (branch R1 verified).
- [ ] **Export Excel DNVT** đúng template `dnvt-mrf-template.xlsx` (branch R1 verified).
- [ ] **Regression:** phiếu MRF cũ vẫn ra detail + PDF + Excel template MRF (có giá + IV + V).
- [ ] Kế toán `ketoan` nhận notify sau duyệt DNVT + tải được PDF + Excel.
- [ ] Ownership: operator không xem/tải được phiếu DNVT người khác (404).
- [ ] new-mrf KHÔNG bị sửa (vẫn vào được URL trực tiếp, defaults MRF); CTA PRTab đã trỏ new-dnvt.
- [ ] `pnpm @iot/web build` local PASS trước push.

---

## 14. TODO tasks (thứ tự thực thi)

- [ ] **P0** Viết + apply migration 0051 (VPS trước).
- [ ] **P1** Drizzle schema + shared Zod (`PR_FORM_TYPES`, 3 field) + repo wiring (persist + SELECT).
- [ ] **P2** POST route passthrough `formType` + 2 field line.
- [ ] **P4a** Chạy script §8 sinh `dnvt-mrf-template.xlsx`, verify coord, commit.
- [ ] **P4b** `dnvtExportExcel.ts` + `buildDnvtExcel` (chốt cell theo template).
- [ ] **P5** `dnvtPdf.tsx` + `renderDnvtPdfBuffer` (14 cột, III 5 dòng, bỏ giá/IV/V).
- [ ] **P3** Form `new-dnvt/page.tsx` (standalone, copy helper).
- [ ] **P6a/b** Branch export-excel + export-pdf route (R1).
- [ ] **P6c** Branch detail `[id]/page.tsx` (`DnvtDetailBody`).
- [ ] **P7** CTA PRTab new-mrf → new-dnvt (2 link).
- [ ] typecheck + build local → push → deploy → E2E §9.2.

---

## 15. Effort tổng

| Phase | Effort |
|-------|--------|
| P0 migration | S |
| P1 schema+shared+repo | M |
| P2 API route | S |
| P3 form new-dnvt | M |
| P4 excel template+builder | M |
| P5 pdf | M |
| P6 branch 2 route + detail | M |
| P7 entry points | S |

**Tổng: ~12–16h (1.5–2 ngày công tập trung)** — 3×S + 5×M. Rủi ro chính R1 (branch) + R2 (lệch ô template),
đều khoanh vùng test rõ. Không có unknown lớn (backend + luồng V3.9 đã proven, DNVT structure đã verify line-level).
