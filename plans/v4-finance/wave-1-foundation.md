# Kế hoạch V4 — ĐỢT 1 (Nền tảng): Role Cổ đông, RBAC mở rộng, đổi người duyệt PR bước 2, hạ tầng notification chống miss, admin/users theo module

- **Mã task đề xuất:** `TASK-20260922-001`
- **Ngày lập:** 2026-09-22
- **Người lập:** planner (Claude)
- **Bản chất:** NỀN TẢNG cho V4 Tài chính — KHÔNG code màn hình finance/deliveryNote, chỉ chuẩn bị RBAC + nav + notification + admin UI để các đợt sau (Wave 2: màn hình Tài chính, Wave 3: Phiếu giao hàng) cắm vào không phải sửa lại nền.
- **Migration dự kiến:** `packages/db/migrations/0054_shareholder_role.sql` (số kế tiếp sau `0053_item_type_catchup.sql` / `0053_sales_order_priority.sql` — xem rủi ro R-1 về việc trùng số 0053).
- **Trạng thái:** DRAFT — chờ user duyệt trước khi `/cook`.

---

## 1. Tóm tắt & Mục tiêu

V4 hướng tới 2 phân hệ mới (Tài chính kế toán, Phiếu giao hàng/BBGH) và 1 vai trò mới (Cổ đông xem báo cáo). Đợt 1 KHÔNG viết UI các phân hệ này — chỉ dựng nền: role, quyền, nav, notification, và trang quản trị user để khi Wave 2/3 code màn hình thật, không phải quay lại sửa RBAC/nav/notification lần nữa.

**5 khối công việc (A–E theo yêu cầu), chia thành 6 phase phụ thuộc:**

| Phase | Nội dung | Tương ứng yêu cầu |
|---|---|---|
| Phase 0 | Khảo sát xung đột đặt tên `NavSection "finance"` — quyết định trước khi code | Tiền đề cho B, E |
| Phase 1 | Migration 0054 + role `shareholder` (ROLES, RBAC_MATRIX, seed, nav, guard, test) | A |
| Phase 2 | Entity RBAC mới `finance` + `deliveryNote` (matrix, ENTITIES, test) | B |
| Phase 3 | Đổi người duyệt bước 2 PR: `planner` → `warehouse` (kèm phương án chuyển đổi) | C |
| Phase 4 | Notification: event type mới + rà soát broadcast → fan-out + escalation job + delivery tracking | D |
| Phase 5 | `/admin/users` — nhóm entity theo "phân hệ" (module) | E |

Thứ tự bắt buộc: **Phase 0 → 1 → 2 → 3 → 4 → 5** (4 và 5 có thể làm song song sau khi 1-3 xong, vì cùng phụ thuộc role/entity mới nhưng không phụ thuộc lẫn nhau).

---

## 2. Quyết định cần chốt trước khi code (đề xuất của planner — user duyệt hoặc chỉnh)

| # | Vấn đề | Đề xuất | Rủi ro nếu bỏ qua |
|---|---|---|---|
| QĐ-1 | `NavSection` đã có giá trị `"finance"` (label "Tài chính & Mua bán", đang gán cho `/sales` = Thu mua — xem `nav-items.ts:33,73,85,160`) — trùng tên với phân hệ Tài chính kế toán tương lai | **Đổi tên section hiện tại `"finance"` → `"purchasing"`** (label giữ "Bộ phận Thu mua"), giải phóng key `"finance"` cho phân hệ Tài chính kế toán thật ở Wave 2. Đây là rename thuần enum key, không đổi UI/URL. | Nếu không đổi, Wave 2 phải đặt tên khác (vd `"accounting"`) gây rối vì đã có RbacEntity tên `finance` nhưng NavSection tên khác — không nhất quán, dễ nhầm khi đọc code sau này |
| QĐ-2 | Đổi người duyệt bước 2 PR `planner → warehouse`: có giữ `planner` duyệt song song trong giai đoạn chuyển đổi không? | **CÓ** — cho cả `planner` VÀ `warehouse` cùng duyệt được bước dept-approve trong Đợt 1 (OR, giống cách admin luôn bypass), kèm cảnh báo UI "Trưởng bộ phận Kho" là người duyệt chính thức mới. Gỡ `planner` khỏi guard ở đợt sau (V4 Wave 2) sau khi xác nhận vận hành ổn định ≥ 2 tuần. Lý do: dept-approve hiện không lưu "ai đã duyệt theo vai trò nào", nên đổi cứng ngay có rủi ro khoá luồng nếu kho chưa quen thao tác kịp thời trong lúc dữ liệu thật đang chạy production. | Đổi cứng ngay: nếu warehouse quên/chưa được đào tạo, mọi PR mới bị kẹt ở SUBMITTED không ai duyệt được (planner mất quyền, warehouse chưa quen) → chặn toàn bộ chuỗi mua vật tư |
| QĐ-3 | RBAC_ENTITIES hiện có 16 entity (không phải 17 như comment cũ trong `can.test.ts:13` đã lạc hậu — presence: item, supplier, bomTemplate, bomRevision, salesOrder, bomSnapshot, pr, po, wo, reservation, eco, audit, user, session, inventory, report, productionBoard = **17 thực tế** khi đếm đúng, xem Phase 2 mục kiểm chứng số) | Đếm lại chính xác bằng lệnh, KHÔNG tin theo comment cũ trong test. Test cũ đã sai 1 lần (V3.9 ghi nhận), Đợt 1 sẽ sửa số trong assertion khi thêm 2 entity mới → 19. | Assertion `toHaveLength(N)` sai số làm test fail ngay, hoặc tệ hơn — pass nhầm vì viết cứng sai số cả 2 chỗ |
| QĐ-4 | Cổ đông xem "tiến độ gia công/sản xuất" — dùng entity nào? | Tái dùng `productionBoard` (đã tồn tại, admin+qc CRUD) — cấp `shareholder: productionBoard: ["read"]`. KHÔNG tạo entity mới cho "tiến độ sản xuất" vì trùng chức năng với bảng đã có. Nếu Wave 2 cần view khác (biểu đồ riêng, không phải bảng QC) thì tạo `RbacEntity` mới lúc đó (YAGNI). | Tạo thừa entity trống ngay từ đầu, không ai dùng, phải dọn sau |
| QĐ-5 | Route `/production-board` guard hiện chỉ `["admin", "qc"]` (`layout.tsx:45`) — cổ đông cần xem nhưng KHÔNG được sửa | Thêm `"shareholder"` vào guard `/production-board`, nhưng UI trang đó phải tự ẩn nút CRUD khi role không có quyền `update`/`create`/`delete` (RBAC matrix đã tự động chặn qua `can()`, chỉ cần verify UI không hardcode role check riêng — xem Phase 1 bước kiểm tra). | Cổ đông vào được trang nhưng thấy nút Thêm/Sửa/Xoá do UI hardcode role thay vì dùng `can()` — lộ chức năng không nên thấy |

> Nếu user không đồng ý QĐ-2 (muốn đổi cứng ngay không giữ planner song song) — xem Phase 3 mục "Phương án B" làm alternative, đã viết sẵn.

---

## 3. Phase 0 — Rename NavSection `finance` → `purchasing` (giải phóng namespace)

**Effort: S (0.5 ngày)**

### Bối cảnh xác nhận
- `apps/web/src/lib/nav-items.ts` dòng 33-37: `NavSection` union có `"finance"`.
- Dòng 73: `NAV_SECTION_LABEL.finance = "Tài chính & Mua bán"`.
- Dòng 85: `NAV_SECTION_ORDER` có `"finance"` ở vị trí thứ 4.
- Dòng 160: nav item `/sales` (Bộ phận Thu mua) gán `section: "finance"`.
- Dòng 220-227: `groupNavBySection()` khởi tạo `map` với key `finance`.
- File `apps/web/src/lib/nav-items.test.ts` (159 dòng) — cần grep các test đang assert `"finance"` để sửa theo.

### Việc cần làm
1. **File:** `apps/web/src/lib/nav-items.ts`
   - Dòng 34: `"finance"` → `"purchasing"` trong khai báo type `NavSection`.
   - Dòng 73: đổi key `finance:` → `purchasing:`, label giữ nguyên `"Bộ phận Thu mua"` (KHÔNG dùng "Tài chính & Mua bán" nữa — tên cũ gây hiểu nhầm, đổi cho khớp nội dung thực tế trang `/sales`).
   - Dòng 85: `NAV_SECTION_ORDER` đổi `"finance"` → `"purchasing"`.
   - Dòng 160: nav item `/sales` đổi `section: "finance"` → `section: "purchasing"`.
   - Dòng 220-227: `map` trong `groupNavBySection` đổi key `finance:` → `purchasing:`.
2. **File:** `apps/web/src/lib/nav-items.test.ts` — grep `"finance"` và sửa các assertion theo tên mới `"purchasing"`.
3. Grep toàn repo `grep -rn '"finance"' apps/web/src` để chắc chắn không còn nơi nào khác tham chiếu `NavSection.finance` (phân biệt với `RbacEntity.finance` mới ở Phase 2 — 2 khái niệm khác nhau, dễ nhầm khi search).

### Definition of Done Phase 0
- [ ] `pnpm --filter web build` pass (TypeScript union thay đổi sẽ tự báo lỗi ở mọi chỗ dùng `NavSection` cũ nếu sót).
- [ ] `pnpm --filter web test nav-items` pass.
- [ ] Không còn literal `"finance"` nào gắn với `NavSection` trong codebase (chỉ còn dùng cho `RbacEntity` ở Phase 2).

### Rollback
- Revert 1 commit — không đụng DB, không đụng runtime state. An toàn tuyệt đối.

---

## 4. Phase 1 — Role `shareholder` (Cổ đông)

**Effort: M (1-1.5 ngày)**

### 4.1 Migration `0054_shareholder_role.sql`

**File tạo mới:** `packages/db/migrations/0054_shareholder_role.sql`

Bám đúng pattern `0050_accountant_role.sql` (đã đọc nguyên văn — xem mục 4.1.1) và `0049_display_role.sql`:

```sql
-- V4 Wave 1 — Role 'shareholder' (Cổ đông): READ-ONLY phân hệ Tài chính +
-- tiến độ sản xuất (productionBoard). Giám đốc vẫn dùng role 'admin' có sẵn
-- (KHÔNG tạo role riêng cho giám đốc — theo quyết định user).
--
-- LƯU Ý: chạy qua `psql -f` KHÔNG bọc --single-transaction — ALTER TYPE ADD
-- VALUE phải commit trước khi INSERT dùng value mới (pattern giống 0049/0050).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'shareholder'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'role_code')
  ) THEN
    ALTER TYPE role_code ADD VALUE 'shareholder';
  END IF;
END $$;

INSERT INTO app.role (code, display_name, description)
VALUES ('shareholder', 'Cổ đông',
        'Xem báo cáo Tài chính (thu chi/công nợ/dòng tiền) và tiến độ sản xuất — READ-ONLY, không thấy BOM/PR/PO chi tiết')
ON CONFLICT (code) DO NOTHING;
```

**4.1.1 — Xác nhận số migration:** `ls packages/db/migrations/` hiện có CẢ `0053_item_type_catchup.sql` LẪN `0053_sales_order_priority.sql` (trùng số 0053, xem DRIFT-NOTES.md mục 5 về "numbering còn gap" — đây là 1 gap mới phát sinh chưa được ghi chú). File mới của Đợt 1 phải là `0054` (số lớn nhất hiện có + 1, không phải nối vào 0053). Trước khi tạo file, BẮT BUỘC chạy lại `ls packages/db/migrations/ | sort` để xác nhận không có `0054_*` nào được tạo bởi nhánh khác giữa lúc lập kế hoạch và lúc thực thi (do repo có nhiều agent làm song song).

### 4.2 `packages/shared/src/types.ts`

**File:** dòng 17.
- Trước: `export const ROLES = ["admin", "planner", "warehouse", "operator", "purchaser", "qc", "display", "accountant"] as const;`
- Sau: thêm `"shareholder"` vào cuối mảng:
  ```ts
  export const ROLES = ["admin", "planner", "warehouse", "operator", "purchaser", "qc", "display", "accountant", "shareholder"] as const;
  ```
- Cập nhật JSDoc mapping bộ phận (dòng 7-16): thêm dòng `shareholder → Cổ đông (xem báo cáo Tài chính + tiến độ SX, read-only)`.

### 4.3 `packages/shared/src/rbac/matrix.ts`

**File:** sau block `accountant` (dòng 178-184), thêm block mới:
```ts
// V4 Wave 1 — Shareholder (Cổ đông): READ-ONLY Tài chính + tiến độ sản xuất.
// KHÔNG thấy BOM/PR/PO/supplier/item chi tiết. user/session read cho profile.
shareholder: {
  finance: ["read"],
  productionBoard: ["read"],
  user: ["read"],
  session: ["read"],
},
```
> Lưu ý: entity `finance` chưa tồn tại tới khi Phase 2 chạy — nếu tách commit riêng theo phase, TypeScript sẽ báo lỗi biên dịch ở dòng này (property `finance` không tồn tại trong `RbacEntity` union) cho tới khi Phase 2 merge. **Khuyến nghị gộp Phase 1 + Phase 2 vào cùng 1 PR** để tránh trạng thái trung gian không compile được (giống khuyến nghị đã áp dụng ở kế hoạch V3.9).

### 4.4 `packages/shared/src/rbac/can.test.ts`

**File:** cần sửa 3 chỗ:
- Dòng 13-23: thêm `"shareholder"` vào mảng `Object.keys(RBAC_MATRIX)` kỳ vọng, và cập nhật comment tiêu đề (dòng 13 hiện ghi sai "17 entity" — đếm lại đúng số thực tế trước khi sửa, xem QĐ-3).
- Dòng 24: `RBAC_ENTITIES` length — cập nhật theo tổng entity thực tế SAU Phase 2 (16 hiện tại + 2 mới = 18; xem cảnh báo QĐ-3 phải đếm bằng lệnh, không suy đoán).
- Thêm case mới vào mảng `cases` (sau dòng 154, trước dòng "Accountant"):
  ```ts
  // V4 Wave 1 — Shareholder: chỉ read finance + productionBoard + user, KHÔNG PR/PO/BOM.
  ["shareholder", "read", "finance", true],
  ["shareholder", "create", "finance", false],
  ["shareholder", "read", "productionBoard", true],
  ["shareholder", "update", "productionBoard", false],
  ["shareholder", "read", "pr", false],
  ["shareholder", "read", "po", false],
  ["shareholder", "read", "bomTemplate", false],
  ["shareholder", "read", "user", true],
  ```
- Dòng 180-190 `canAny() — planner true trên mọi entity...`: không cần sửa vì chỉ test `planner`, nhưng thêm 1 test block mới ngay sau (dòng ~190) cho shareholder:
  ```ts
  it("shareholder CHỈ true trên finance/productionBoard/user/session", () => {
    const allowed: RbacEntity[] = ["finance", "productionBoard", "user", "session"];
    for (const e of RBAC_ENTITIES) {
      expect(canAny(["shareholder"], e)).toBe(allowed.includes(e));
    }
  });
  ```

### 4.5 Nav — `apps/web/src/lib/nav-items.ts`

- Thêm `NavSection` mới `"finance"` (namespace vừa giải phóng ở Phase 0) với label "Tài chính" — CHƯA có nav item nào trỏ vào section này ở Đợt 1 (Wave 2 sẽ thêm item `/finance` khi code màn hình thật). Thêm section rỗng vào `NAV_SECTION_LABEL` + `NAV_SECTION_ORDER` (đặt sau `"engineering"`, trước `"purchasing"`) + `groupNavBySection` map — vì `groupNavBySection` (dòng 232) tự động ẩn section rỗng (`.filter((s) => map[s].length > 0)`), thêm section rỗng vào Đợt 1 AN TOÀN, không hiện gì cho tới khi Wave 2 thêm item.
  - **Cân nhắc:** CÓ NÊN thêm section rỗng ngay ở Đợt 1 hay đợi Wave 2? Đề xuất: **thêm ngay** vì `NavSection` là union type dùng ở nhiều nơi (`NAV_SECTION_LABEL`, `NAV_SECTION_ORDER`, `groupNavBySection`) — thêm 1 lần ở Đợt 1 tránh Wave 2 phải sửa lại đúng 3 chỗ này lần nữa, và không có tác dụng phụ vì record rỗng bị filter tự động.
- Thêm nav item cho `productionBoard` xem bởi shareholder: sửa item `/production-board` (dòng 147-153) — thêm `"shareholder"` vào mảng `roles`:
  ```ts
  roles: ["admin", "qc", "shareholder"],
  ```
  (Section giữ nguyên `"operations"` — shareholder sẽ thấy mục "Bảng sản xuất (QC)" xuất hiện trong section Gia công dù họ không thuộc bộ phận đó; chấp nhận được vì đây là nav — chỉ 1 mục, không lộ toàn bộ section).

### 4.6 Route guard — `apps/web/src/app/(app)/layout.tsx`

**File:** `ROUTE_ROLE_GUARD` (dòng 25-48).
- Dòng 45: `{ prefix: "/production-board", roles: ["admin", "qc"] }` → thêm `"shareholder"`:
  ```ts
  { prefix: "/production-board", roles: ["admin", "qc", "shareholder"] },
  ```
- **KHÔNG** thêm shareholder vào bất kỳ prefix nào khác (`/engineering`, `/procurement`, `/sales`, `/warehouse`, `/operations`, `/admin`) — đúng yêu cầu "không thấy BOM/PR/PO chi tiết".
- Wave 2 sẽ thêm dòng guard mới `{ prefix: "/finance", roles: ["admin", "accountant", "shareholder"] }` khi màn hình Tài chính ra đời — Đợt 1 KHÔNG thêm route chưa tồn tại (YAGNI, tránh guard trỏ vào path 404).

### 4.7 Kiểm tra UI production-board không hardcode role (theo QĐ-5)

**Cần đọc trước khi sửa (Phase 1 phải làm bước audit này, không giả định):**
- `apps/web/src/app/(app)/production-board/page.tsx` (chưa đọc — audit trong lúc code Phase 1): grep `roles.includes("qc")` hoặc `roles.includes("admin")` hardcode trong component để bật/tắt nút CRUD. Nếu có hardcode kiểu `if (isQc || isAdmin) showEditButton`, PHẢI đổi sang `can(roles, "update", "productionBoard")` từ `@iot/shared` để tự động đúng cho shareholder (không có quyền update → nút tự ẩn, không cần thêm điều kiện role thủ công).
- Đây là bước **audit bắt buộc**, không skip, vì nếu bỏ qua, cổ đông sẽ thấy nút Sửa/Xoá dù RBAC matrix đã chặn ở API (double-check: API vẫn an toàn nhờ `requireCan`, nhưng UI hiện nút bấm ra lỗi 403 là trải nghiệm tệ, không đúng "read-only" như yêu cầu).

### 4.8 Seed account thử nghiệm (không bắt buộc nhưng khuyến nghị cho QA)

Theo precedent `seed-ketoan-user.sql` (đã tồn tại cho accountant) — tạo file tương tự `packages/db/migrations/seed-shareholder-user.sql` (KHÔNG đánh số, giống 2 file seed hiện có là phụ trợ ngoài migration chính) để QA có tài khoản test:
```sql
-- Seed account thử nghiệm role 'shareholder' cho QA — chạy tay, KHÔNG tự động trong CI/CD.
```
(Nội dung follow đúng pattern trong `seed-test-users.sql` đã đọc ở trên — dùng `pw_hash` argon2id có sẵn, username đề xuất `co.dong` / email `codong@songchau.local`).

### Definition of Done Phase 1
- [ ] Migration 0054 chạy thành công trên local Postgres dev (`psql -f 0054_shareholder_role.sql`, KHÔNG dùng `--single-transaction`).
- [ ] `pnpm --filter shared test` pass — `can.test.ts` xanh với case shareholder.
- [ ] `pnpm --filter web build` pass.
- [ ] Login bằng account seed `co.dong`: vào `/` thấy Tổng quan, vào `/production-board` thấy bảng (read-only, không có nút Thêm/Sửa/Xoá), thử vào `/engineering` hoặc `/procurement` bị redirect `/?denied=1`.
- [ ] `curl` trực tiếp API `POST /api/production-board/...` (nếu có endpoint ghi) bằng cookie shareholder → trả 403.

### Rollback
- **Code (nav/matrix/guard/test):** revert commit bình thường, an toàn.
- **Migration 0054:** `ALTER TYPE ... ADD VALUE` **KHÔNG rollback được bằng DOWN migration** (Postgres không hỗ trợ xoá enum value đã thêm, đặc biệt nếu đã có row dùng giá trị đó). Nếu cần "huỷ" role shareholder sau khi đã chạy migration:
  - Xoá row `app.role WHERE code='shareholder'` (an toàn nếu chưa có `user_role` nào trỏ tới).
  - Value `'shareholder'` vẫn tồn tại vĩnh viễn trong enum `role_code` — CHẤP NHẬN ĐƯỢC (giống các role cũ `display`, `accountant` không ai rollback). Không ảnh hưởng vận hành, chỉ là "rác" enum vô hại.
  - Nếu đã có user gán role này → phải xoá `user_role` link trước khi xoá `app.role` row (FK constraint).

---

## 5. Phase 2 — RbacEntity mới `finance` + `deliveryNote`

**Effort: M (1 ngày)**

### 5.1 Đếm lại số entity hiện tại (bắt buộc trước khi sửa test)

Chạy trước khi code: `node -e "console.log(require('./packages/shared/src/rbac/matrix.ts'))"` không chạy được trực tiếp (TS) — dùng cách đếm thủ công từ file đã đọc: `RBAC_ENTITIES` (dòng 188-206 `matrix.ts`) hiện liệt kê: item, supplier, bomTemplate, bomRevision, salesOrder, bomSnapshot, pr, po, wo, reservation, eco, audit, user, session, inventory, report, productionBoard = **17 entity** (đếm tay lại bằng script khi thực thi để chắc chắn, vì đây là con số quyết định assertion test — sai 1 đơn vị làm CI đỏ).

Sau Phase 2 thêm 2 entity → **19 entity**.

### 5.2 `packages/shared/src/rbac/matrix.ts`

**Bước 2.1 — Thêm vào `RbacEntity` union** (dòng 22-40, sau `productionBoard`):
```ts
export type RbacEntity =
  | "item"
  | "supplier"
  | "bomTemplate"
  | "bomRevision"
  | "salesOrder"
  | "bomSnapshot"
  | "pr"
  | "po"
  | "wo"
  | "reservation"
  | "eco"
  | "audit"
  | "user"
  | "session"
  | "inventory"
  | "report"
  | "productionBoard"
  // V4 Wave 1 — Tài chính kế toán (thu chi/hóa đơn/công nợ). Chuẩn bị nền cho
  // Wave 2 (chưa có UI/API dùng entity này ở Đợt 1).
  | "finance"
  // V4 Wave 1 — Phiếu giao hàng / Biên bản giao hàng (BBGH). Chuẩn bị nền cho
  // Wave 3.
  | "deliveryNote";
```

**Bước 2.2 — Gán quyền cho từng role hiện có** (đề xuất theo yêu cầu user "Gán quyền hợp lý"):

| Role | `finance` | `deliveryNote` | Lý do |
|---|---|---|---|
| admin | `["create","read","update","delete","approve"]` | `["create","read","update","delete","approve"]` | Full quyền mọi entity (nhất quán pattern hiện có) |
| accountant | `["create","read","update","delete"]` | `["read"]` | Kế toán CRUD sổ thu chi/công nợ; chỉ cần xem BBGH để đối chiếu công nợ giao hàng — KHÔNG tạo/sửa phiếu giao hàng (thuộc kho) |
| shareholder | `["read"]` | *(không cấp)* | Đúng yêu cầu — chỉ xem Tài chính, KHÔNG xem chi tiết giao hàng/BOM/PR/PO |
| warehouse | *(không cấp finance)* | `["create","read","update"]` | Kho là bên lập phiếu giao hàng/nhận hàng (nghiệp vụ tự nhiên nhất khớp vai trò hiện tại) |
| purchaser | *(không cấp finance)* | `["read"]` | Thu mua cần xem BBGH để đối chiếu với PO/NCC nhưng không lập phiếu |
| planner | *(không cấp)* | *(không cấp)* | Không liên quan nghiệp vụ tài chính/giao hàng trực tiếp |
| operator | *(không cấp)* | *(không cấp)* | Ngoài phạm vi |
| qc | *(không cấp)* | *(không cấp)* | Ngoài phạm vi |
| display | *(không cấp)* | *(không cấp)* | Kiosk chỉ productionBoard |

Vị trí sửa cụ thể trong file (thêm dòng vào object đã có, KHÔNG tạo object mới):
- `admin` block (dòng 56-77): thêm 2 dòng sau `productionBoard` (dòng 76):
  ```ts
  finance: ["create", "read", "update", "delete", "approve"],
  deliveryNote: ["create", "read", "update", "delete", "approve"],
  ```
- `accountant` block (dòng 180-184): thêm:
  ```ts
  finance: ["create", "read", "update", "delete"],
  deliveryNote: ["read"],
  ```
- `shareholder` block (mới tạo ở Phase 1, dòng ~186 sau khi thêm): đã có `finance: ["read"]` — giữ nguyên, KHÔNG thêm `deliveryNote`.
- `warehouse` block (dòng 116-137): thêm sau `productionBoard: ["read"]` (dòng 136):
  ```ts
  deliveryNote: ["create", "read", "update"],
  ```
- `purchaser` block (dòng 139-157): thêm sau `productionBoard: ["read"]` (dòng 156):
  ```ts
  deliveryNote: ["read"],
  ```

**Bước 2.3 — `RBAC_ENTITIES` array** (dòng 188-206): thêm `"finance", "deliveryNote"` vào cuối mảng.

### 5.3 `packages/shared/src/rbac/can.test.ts`

- Sửa dòng 13 comment + dòng 24 `toHaveLength(17)` → `toHaveLength(19)`.
- Thêm case mới (bổ sung vào mảng `cases`, đặt cuối):
  ```ts
  // V4 Wave 1 — Finance entity
  ["admin", "delete", "finance", true],
  ["accountant", "create", "finance", true],
  ["accountant", "delete", "finance", true],
  ["shareholder", "read", "finance", true],
  ["shareholder", "create", "finance", false],
  ["warehouse", "read", "finance", false],
  ["planner", "read", "finance", false],
  // V4 Wave 1 — DeliveryNote entity
  ["warehouse", "create", "deliveryNote", true],
  ["purchaser", "read", "deliveryNote", true],
  ["purchaser", "create", "deliveryNote", false],
  ["accountant", "read", "deliveryNote", true],
  ["accountant", "create", "deliveryNote", false],
  ["shareholder", "read", "deliveryNote", false],
  ["operator", "read", "deliveryNote", false],
  ```
- Test `it("admin có quyền trên tất cả entity")` (dòng 28-32) tự động pass nếu admin đã được cấp cả 2 entity mới ở bước 2.2 (không cần sửa code test, chỉ cần matrix đúng).

### 5.4 UI — `UserPermissionMatrix.tsx` labels (chuẩn bị, để Phase 5 dùng)

**File:** `apps/web/src/components/admin/UserPermissionMatrix.tsx` dòng 27-42 `ENTITY_LABELS`.
- Object này ĐANG THIẾU nhãn cho `inventory`, `report`, `productionBoard` (đã tồn tại trong `RBAC_ENTITIES` từ trước nhưng chưa từng thêm label — bug nhỏ có sẵn, component sẽ render `undefined` cho các dòng đó hiện tại). Đợt 1 tiện thể vá luôn (không phải lỗi mới do Đợt 1 gây ra, nhưng bổ sung `finance`/`deliveryNote` mà không vá 3 dòng thiếu kia sẽ để lại `undefined` giữa bảng, trông như bug mới).
- Thêm đủ 5 nhãn còn thiếu:
  ```ts
  inventory: "Tồn kho",
  report: "Báo cáo/KPI",
  productionBoard: "Bảng sản xuất",
  finance: "Tài chính",
  deliveryNote: "Phiếu giao hàng",
  ```
- Type `RbacEntityKey` (import từ `useAdmin.ts`, chưa đọc trực tiếp — cần audit khi code: kiểm tra `apps/web/src/hooks/useAdmin.ts` có định nghĩa lại union `RbacEntityKey` tách biệt với `RbacEntity` của `@iot/shared` hay không; nếu tách biệt, phải đồng bộ thêm 2 giá trị mới ở đó nữa).

### Definition of Done Phase 2
- [ ] `pnpm --filter shared test` pass với 19 entity.
- [ ] `pnpm --filter web build` pass — không còn entity nào thiếu label trong `ENTITY_LABELS` (kiểm tra bằng cách mở `/admin/users/[id]` tab quyền, thấy đủ 19 dòng có tên tiếng Việt, không dòng nào "undefined").
- [ ] `GET /api/admin/users/[id]/permissions` trả về matrix có 19 entity (test thủ công qua curl với cookie admin).

### Rollback
- Thuần code (union type + object literal + test) — revert commit an toàn, không đụng DB (entity là khái niệm application-level, không phải cột DB).

---

## 6. Phase 3 — Đổi người duyệt bước 2 PR: `planner` → `warehouse`

**Effort: M-L (1.5-2 ngày, gồm thời gian theo dõi vận hành)**

### 6.1 Bối cảnh xác nhận (đã đọc file thật)

- `apps/web/src/app/api/purchase-requests/[id]/dept-approve/route.ts` dòng 27-40:
  ```ts
  const guard = await requireCan(req, "approve", "pr");
  if ("response" in guard) return guard.response;
  if (
    !guard.session.roles.includes("admin") &&
    !guard.session.roles.includes("planner")
  ) {
    return jsonError("FORBIDDEN", "Chỉ Admin hoặc Trưởng bộ phận được duyệt bước này.", 403);
  }
  ```
- RBAC matrix hiện tại: `planner.pr` có `approve` (dòng 85 `matrix.ts`); `warehouse.pr` là `["create", "read"]` (dòng 124) — **CHƯA có `approve`**.
- `apps/worker/src/jobs/prReminderScan.ts` dòng 116-119: escalation nhắc SUBMITTED nhắm vào `["planner", "admin"]` — **PHẢI đổi đồng bộ**, nếu không worker tiếp tục nhắc nhầm người sau khi đổi guard route.
- `apps/web/src/components/engineering/PRTab.tsx` dòng 59-64 (theo plan V3.9 đã đọc, chưa re-verify trực tiếp lần này — audit lại khi code) có khả năng có UI hiển thị nút "Duyệt" theo hardcode role `planner` — cần audit.

### 6.2 Quyết định QĐ-2 (đã đề xuất ở mục 2): Phương án A (giữ song song) là mặc định của kế hoạch này

**Phương án A — Song song có thời hạn (ĐỀ XUẤT CHÍNH):**

1. **`packages/shared/src/rbac/matrix.ts`**
   - `warehouse` block (dòng 116-137, cụ thể dòng 124): đổi
     - Trước: `pr: ["create", "read"],`
     - Sau: `pr: ["create", "read", "approve"],`
   - `planner` block (dòng 78-95, dòng 85): **GIỮ NGUYÊN** `pr: ["create", "read", "update", "approve"],` trong Đợt 1 (không xoá `approve`) — đây chính là "giữ song song".

2. **`apps/web/src/app/api/purchase-requests/[id]/dept-approve/route.ts`** dòng 31-40:
   - Trước:
     ```ts
     if (
       !guard.session.roles.includes("admin") &&
       !guard.session.roles.includes("planner")
     ) {
       return jsonError("FORBIDDEN", "Chỉ Admin hoặc Trưởng bộ phận được duyệt bước này.", 403);
     }
     ```
   - Sau:
     ```ts
     // V4 Wave 1 — Trưởng bộ phận duyệt bước này ĐỔI từ planner sang warehouse
     // (Kho = trưởng bộ phận thực tế theo yêu cầu user). Giữ planner song song
     // trong giai đoạn chuyển đổi (2-4 tuần) — gỡ ở V4 Wave 2 sau khi xác nhận
     // vận hành ổn định. Xem plans/v4-finance/wave-1-foundation.md Phase 3.
     if (
       !guard.session.roles.includes("admin") &&
       !guard.session.roles.includes("warehouse") &&
       !guard.session.roles.includes("planner")
     ) {
       return jsonError(
         "FORBIDDEN",
         "Chỉ Admin hoặc Trưởng bộ phận Kho được duyệt bước này.",
         403,
       );
     }
     ```
   - Đổi message lỗi + JSDoc dòng 21 (`Authorization: admin OR planner...`) → `admin OR warehouse (OR planner — giai đoạn chuyển đổi)`.

3. **`apps/worker/src/jobs/prReminderScan.ts`** dòng 116-119:
   - Trước: `pr.approvalStep === "SUBMITTED" ? ["planner", "admin"] : ["purchaser", "admin"]`
   - Sau: `pr.approvalStep === "SUBMITTED" ? ["warehouse", "planner", "admin"] : ["purchaser", "admin"]`
   - Comment dòng 113-115 cập nhật theo.

4. **`packages/shared/src/rbac/can.test.ts`**: sửa case cũ nếu có assert `warehouse.approve.pr === false` (chưa thấy trong 196 dòng đã đọc — không có case này hiện tại nên không cần sửa xoá, chỉ **thêm mới**):
   ```ts
   ["warehouse", "approve", "pr", true],
   ```

5. **Audit UI (bắt buộc khi code, chưa verify trực tiếp lần khảo sát này):**
   - `apps/web/src/components/engineering/PRTab.tsx` — tìm mọi chỗ hiển thị nút "Duyệt bước 2" / dept-approve theo điều kiện hardcode `roles.includes("planner")`, đổi thành `can(roles, "approve", "pr")` HOẶC thêm `roles.includes("warehouse")` tuỳ theo cách code hiện tại, để nút hiện đúng cho cả 2 role trong giai đoạn chuyển đổi.
   - Trang chi tiết PR (`apps/web/src/app/(app)/procurement/purchase-requests/[id]/page.tsx` — đường dẫn suy luận, xác nhận tên file thật khi code) — tương tự.

6. **Nav/route guard:** `/procurement` và `/engineering` guard (`layout.tsx` dòng 32, 38) đã có sẵn `"warehouse"` trong danh sách — **KHÔNG cần sửa gì thêm** ở layout.

### 6.3 Xử lý phiếu đang chạy dở (rủi ro quan trọng nhất của Phase 3)

**Câu hỏi:** Phiếu đang ở `approvalStep = 'SUBMITTED'` chờ `planner` duyệt tại thời điểm deploy sẽ ra sao?

**Trả lời:** Với Phương án A (song song), **KHÔNG có phiếu nào bị kẹt** — vì:
- `planner` vẫn giữ quyền `approve:pr` trong RBAC matrix (không bị xoá).
- Route `dept-approve` vẫn chấp nhận `planner` (guard giữ `includes("planner")` trong điều kiện OR).
- Phiếu cũ tiếp tục được planner duyệt bình thường như trước; phiếu MỚI (tạo sau khi deploy) có thể được duyệt bởi CẢ warehouse LẪN planner — không có gián đoạn.

→ Đây chính là lý do Phương án A được đề xuất làm mặc định: loại bỏ hoàn toàn rủi ro "phiếu SUBMITTED không ai duyệt được" mà không cần script migrate dữ liệu.

**Phương án B — Đổi cứng ngay (chỉ dùng nếu user KHÔNG chấp nhận QĐ-2 Phương án A):**
- Xoá `approve` khỏi `planner.pr` trong matrix, guard route chỉ còn `admin`/`warehouse`.
- **Bắt buộc kèm theo:** script kiểm tra + thông báo TRƯỚC khi deploy — chạy 1 query đếm số phiếu đang `approvalStep IN ('SUBMITTED')`:
  ```sql
  SELECT count(*), array_agg(paper_form_no) FROM app.purchase_request WHERE approval_step = 'SUBMITTED';
  ```
  Nếu > 0: phải thông báo trước cho người tạo phiếu + đảm bảo tài khoản `warehouse` đã có người trực + đã được đào tạo thao tác duyệt TRƯỚC khi deploy (không tự động chuyển approver cũ sang warehouse — dữ liệu phiếu không đổi, chỉ đổi AI ĐƯỢC PHÉP bấm nút duyệt).
- Rủi ro: nếu deploy giờ hành chính mà warehouse chưa sẵn sàng, phiếu SUBMITTED bị đứng cho tới khi có người warehouse xử lý — planner nhìn thấy phiếu nhưng bấm duyệt sẽ nhận lỗi 403 (khác hẳn UX hiện tại).
- **Không đề xuất chọn phương án này trừ khi user có lý do vận hành khác** (vd muốn cắt hẳn ngay để tránh nhầm lẫn 2 luồng duyệt song song).

### Definition of Done Phase 3
- [ ] `pnpm --filter shared test` pass (case `warehouse.approve.pr === true`).
- [ ] `pnpm --filter web build` pass.
- [ ] Test e2e thủ công: login `bo.phan.kho` (role warehouse, đã có sẵn trong `seed-test-users.sql`) → tạo/không cần tạo PR mới, chỉ cần lấy 1 PR đang SUBMITTED (tạo bằng account operator/planner) → POST `/api/purchase-requests/[id]/dept-approve` → 200, `approvalStep` chuyển `DEPT_APPROVED`.
- [ ] Cùng kịch bản với account `bo.phan.thiet.ke` (role planner) → vẫn 200 (backward-compat còn hiệu lực).
- [ ] Login account `bo.phan.van.hanh` (role operator, KHÔNG có approve pr) → POST dept-approve → 403.
- [ ] Worker: kiểm tra log `prReminderScan` job chạy thủ công (`pnpm --filter worker exec node -e "..."` hoặc trigger qua BullMQ UI nếu có) không lỗi, nhắc đúng cả warehouse + planner cho phiếu SUBMITTED quá 24h.
- [ ] Cập nhật `tests/e2e/cross-role-flow.mjs` nếu file này có bước dept-approve bằng planner cứng — audit lại step liên quan khi code (chưa đọc hết 667 dòng ở khảo sát này).

### Rollback
- Code thuần (matrix + route guard + worker) — revert 1 commit. KHÔNG có migration DB ở Phase 3 → rollback tức thời, an toàn 100%, không có dữ liệu nào cần hoàn tác vì Phương án A không đổi dữ liệu phiếu, chỉ mở rộng ai được phép bấm nút.

---

## 7. Phase 4 — Hạ tầng notification chống miss

**Effort: L (2-3 ngày)**

### 7.1 Event type mới — `NotificationEventType` (`apps/web/src/server/services/notifications.ts` dòng 18-54)

Thêm vào union (sau `ISSUE_REQUEST_REJECTED` dòng 53, trước dấu `;` đóng union):
```ts
  // V4 Wave 1 — Tài chính (Wave 2 sẽ dùng để emit thật; khai báo trước để
  // tránh sửa lại union type khi code màn hình).
  | "FINANCE_ENTRY_CREATED"      // Kế toán ghi nhận thu/chi mới
  | "FINANCE_PAYMENT_DUE_SOON"   // Công nợ sắp đến hạn (cảnh báo trước N ngày)
  | "FINANCE_PAYMENT_OVERDUE"    // Công nợ quá hạn
  // V4 Wave 1 — Phiếu giao hàng (Wave 3 sẽ dùng)
  | "DELIVERY_NOTE_CREATED"
  | "DELIVERY_NOTE_CONFIRMED"
  // V4 Wave 1 — PR warehouse-check (bước dept-approve giờ do warehouse xử lý)
  | "PR_WAREHOUSE_CHECK_PENDING" // Có phiếu SUBMITTED chờ Kho duyệt (dùng ở notifyPRSubmitted mở rộng, xem 7.3)
  // V4 Wave 1 — Escalation: notification "cần hành động" quá hạn N giờ chưa đọc
  | "NOTIFICATION_ESCALATED";
```
> Không thêm event vào `EMAIL_EVENTS` whitelist (dòng 79-85) ở Đợt 1 — hệ thống hiện KHÔNG có SMTP nối dây thật (theo ghi chú kế hoạch V3.9 mục "KHÔNG có SMTP"; `emailQueue`/`emailSend.ts` tồn tại nhưng cần xác nhận trạng thái kết nối thật khi code — audit `apps/web/src/lib/env.ts` biến `MAIL_ENABLED` hiện set gì trên VPS trước khi quyết định thêm event vào whitelist).

**Vì sao khai báo event Wave 2/3 trước:** cột `event_type` là `VARCHAR(64)` tự do (không phải PG enum — đã xác nhận qua `packages/db/DRIFT-NOTES.md` và comment trong `prReminderScan.ts` dòng 25-27), nên thêm giá trị KHÔNG cần migration DB. Khai báo trong TypeScript union giúp Wave 2/3 có type-safety ngay từ đầu và tránh dev quên convention đặt tên.

### 7.2 Rà soát broadcast `recipientRole` còn sót — liệt kê CHÍNH XÁC từng call site

Đã grep toàn bộ `notifications.ts` (817 dòng, đọc đầy đủ ở trên). Kết quả: **CHỈ CÒN DUY NHẤT 1 call site dùng `recipientRole` broadcast** (không đếm badge):

| File:dòng | Hàm | Trạng thái |
|---|---|---|
| `apps/web/src/server/services/notifications.ts:707-708` | `notifyMaterialRequestDelivered()` — `recipientRole: "warehouse"` | **GIỮ NGUYÊN CÓ CHỦ ĐÍCH** — comment tại dòng 696-702 giải thích rõ: đây là event ĐÓNG (thông tin/đối soát), không cần đếm badge "nhắc hành động". Đây là quyết định thiết kế đã có từ V3.16, KHÔNG PHẢI bug sót lại. |

**Kết luận Phase 4 bước rà soát:** KHÔNG có call site nào cần đổi thêm — hệ thống đã được dọn sạch broadcast không đếm badge từ V3.16 (7 hàm đã đổi: `notifyPRDeptApproved`, `notifyPRSubmitted`, `notifyPOSent`, `notifyPOReceivedPartial`, `notifyPOReceivedFull`, `notifyWORequestSubmitted`, `notifyWOReleased`, `notifyWOCompleted`, `notifyMaterialRequestNew`, `notifyIssueRequestNew` — đều đã dùng `emitToUsersWithRole`). Chỉ còn 1 exception có chủ đích. **Đợt 1 KHÔNG cần sửa gì ở mục này** — nhưng PHẢI ghi nhận rõ trong plan (đã ghi ở đây) để Wave 2/3 khi thêm hàm `notifyFinance...`/`notifyDeliveryNote...` mới, LUÔN dùng `emitToUsersWithRole` ngay từ đầu, không quay lại pattern `recipientRole` cũ.

**Việc thật sự cần làm ở Phase 4 (không phải "sửa call site" mà là "bổ sung helper mới cho Wave 2/3 dùng sẵn"):**
- Thêm 2 helper builder mới (đặt cuối file, sau `notifyIssueRequestRejected` dòng 791, trước `/* ── Helpers ── */` dòng 793) để Wave 2 gọi thẳng khi code màn hình Tài chính — tránh Wave 2 phải tự viết lại pattern `emitToUsersWithRole` từ đầu:
  ```ts
  /* ── V4 Wave 1 — Finance notification builders (Wave 2 sẽ gọi khi có UI) ── */

  export interface FinanceNotifyContext {
    entryId: string;
    entryCode: string;
    amount?: number | string;
    actorUserId: string;
    actorUsername: string;
  }

  /** Kế toán ghi nhận thu/chi mới → notify shareholder + admin (đếm badge). */
  export async function notifyFinanceEntryCreated(ctx: FinanceNotifyContext) {
    await emitToUsersWithRole("admin", {
      actorUserId: ctx.actorUserId,
      actorUsername: ctx.actorUsername,
      eventType: "FINANCE_ENTRY_CREATED",
      entityType: "finance_entry",
      entityId: ctx.entryId,
      entityCode: ctx.entryCode,
      title: `Ghi nhận thu/chi mới: ${ctx.entryCode}`,
      message: ctx.amount ? `Số tiền: ${ctx.amount}` : undefined,
      link: `/finance/${ctx.entryId}`,
      severity: "info",
    });
  }
  ```
  (Chỉ viết SKELETON — Wave 2 hoàn thiện logic thật + link đúng route khi có UI. Đợt 1 KHÔNG gọi hàm này ở đâu cả — chỉ tồn tại như hạ tầng sẵn sàng, có thể bị coi là over-engineer nếu viết quá chi tiết; giữ tối giản 1 hàm mẫu, KHÔNG viết đủ bộ cho deliveryNote/escalation ở bước này để tránh code chết không ai gọi — YAGNI. Wave 2/3 tự thêm hàm khi cần, theo đúng pattern đã có.)

  **Quyết định KISS:** Cân nhắc lại — viết cả bộ helper cho finance+deliveryNote ở Đợt 1 khi CHƯA CÓ API/UI nào gọi chúng vi phạm YAGNI (code chết, không test được thật, dễ lạc hậu khi Wave 2 thiết kế payload khác đi). **Đề xuất cuối cùng: KHÔNG viết bất kỳ hàm `notifyFinance*`/`notifyDeliveryNote*` nào ở Đợt 1** — chỉ khai báo `NotificationEventType` (mục 7.1) làm hạ tầng type-safe, để Wave 2/3 tự viết helper khi có ngữ cảnh thật (route, payload, business logic cụ thể). Xoá đề xuất helper skeleton ở trên khỏi phạm vi thực thi Đợt 1 — giữ lại trong plan chỉ để tham khảo hướng đi, KHÔNG đưa vào checklist DoD.

### 7.3 Escalation job — không ai miss thông báo "cần hành động"

**Thiết kế:**
- Tái sử dụng pattern `prReminderScan.ts` (repeatable BullMQ job trong `apps/worker`) — tạo job mới `notificationEscalationScan.ts` thay vì nhồi thêm logic vào `prReminderScan` (tách riêng vì phạm vi khác: `prReminderScan` chỉ quét PR, escalation quét MỌI notification "cần hành động" chưa đọc, tổng quát hơn — tránh 1 job làm 2 việc, vi phạm SRP).

**File tạo mới:** `apps/worker/src/jobs/notificationEscalationScan.ts`

Logic:
1. Định nghĩa whitelist "event cần hành động" (đối xứng với `EMAIL_EVENTS` trong `notifications.ts` — nhưng job worker không import được code apps/web nên phải khai báo lại, giống cách `prReminderScan.ts` đã copy `getActiveUserIdsByRoles` — đây là trade-off đã CHẤP NHẬN TỪ TRƯỚC do 2 app tách biệt, xem comment dòng 17-23 file đó):
   ```ts
   const ACTIONABLE_EVENTS = new Set([
     "PR_SUBMITTED", "PR_DEPT_APPROVED", "WO_REQUEST_SUBMITTED",
     "ISSUE_REQUEST_NEW", "PO_SUBCONTRACT_DRAFT",
     // V4 Wave 1
     "FINANCE_PAYMENT_DUE_SOON", "DELIVERY_NOTE_CREATED",
   ]);
   const ESCALATE_AFTER_MS = 12 * 60 * 60 * 1000; // 12h chưa đọc → nhắc + leo thang admin
   ```
2. Quét `notification WHERE event_type IN (...) AND read_at IS NULL AND recipient_user IS NOT NULL AND created_at < now() - 12h AND escalated_at IS NULL` (cột `escalated_at` MỚI — xem migration 7.4 bên dưới).
3. Với mỗi notification quá hạn: insert 1 row mới `eventType: "NOTIFICATION_ESCALATED"`, `recipientRole: null`, fan-out tới TẤT CẢ admin (trừ chính người bị escalate, nếu họ đã là admin) — nội dung nhắc kèm link gốc + tên người đang bị treo việc.
4. Set `escalated_at = now()` trên row gốc để không escalate lặp lại (tương tự cách `prReminderScan` check "đã nhắc trong 24h chưa" nhưng ở đây dùng cột thay vì query lại bảng — đơn giản hơn, tránh 1 truy vấn phụ mỗi vòng lặp).
5. Đăng ký repeatable job trong `apps/worker/src/index.ts` (chưa đọc file này trực tiếp — audit khi code, theo đúng cách `prReminderScan` đã đăng ký `upsertJobScheduler`, tần suất đề xuất mỗi 1h giống PR reminder, lệch giờ 15 phút để tránh 2 job cùng query DB 1 lúc).

### 7.4 Migration — cột theo dõi delivery

**File tạo mới:** `packages/db/migrations/0055_notification_delivery_tracking.sql` (số kế tiếp sau 0054 của Phase 1).

> Theo `DRIFT-NOTES.md` mục 4: bảng `notification` được tạo trong `0033_...sql` (KHÔNG nằm trong danh sách 23 bảng baseline chỉ tạo bằng `drizzle-kit push`) — nghĩa là bảng này ĐÃ có sẵn qua SQL migration, việc `ALTER TABLE ADD COLUMN` ở đây là an toàn và đúng convention (không cần `drizzle-kit push`, chỉ cần SQL thuần cộng với cập nhật song song file TS schema).

```sql
-- V4 Wave 1 — Notification delivery tracking: biết đã gửi email chưa (khi
-- SMTP thật được bật ở tương lai) + đã escalate chưa (chống spam nhắc lặp).
-- Cả 2 cột nullable, không phá dữ liệu cũ.

ALTER TABLE app.notification
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notification_escalation_scan_idx
  ON app.notification (event_type, read_at, escalated_at, created_at)
  WHERE recipient_user IS NOT NULL AND read_at IS NULL AND escalated_at IS NULL;
```

**File sửa:** `packages/db/src/schema/notification.ts` — thêm 2 field vào object schema (sau `readAt` dòng 47):
```ts
emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
escalatedAt: timestamp("escalated_at", { withTimezone: true }),
```

**Sửa `maybeEmail()`** (`notifications.ts` dòng 97-148) — sau khi `enqueueEmailSend` thành công, `UPDATE notification SET email_sent_at = now() WHERE id = notifId` (thêm 1 lệnh update trong khối `try` sau `Promise.allSettled`, KHÔNG throw nếu update fail — giữ triết lý "không phá business logic chính" của toàn service).

### 7.5 Retention / cleanup notification cũ

**Đề xuất:** CÓ, nhưng ở mức tối thiểu — thêm 1 job dọn dẹp (KHÔNG phải bảng/index mới, chỉ 1 DELETE định kỳ):
- Job mới (hoặc gộp vào job có sẵn chạy hiếm hơn) trong `apps/worker`: xoá notification `read_at IS NOT NULL AND created_at < now() - interval '180 days'`. KHÔNG xoá notification chưa đọc dù cũ (giữ để audit/escalation vẫn thấy).
- Tần suất: 1 lần/ngày, không cần repeatable job riêng — có thể chạy `DELETE` này ngay trong job escalation (mục 7.3 bước 6, thêm cuối hàm `processNotificationEscalationScan`) để tránh tạo thêm 1 BullMQ repeatable job chỉ để dọn rác — KISS.
- Index bổ sung (đã có sẵn `notification_recipient_user_idx` trên `(recipient_user, read_at, created_at)` — ĐỦ để câu `DELETE ... WHERE read_at IS NOT NULL AND created_at < X` chạy hiệu quả nếu thêm điều kiện `recipient_user IS NOT NULL`; với broadcast cũ `recipient_role` dùng index riêng đã có `notification_recipient_role_idx`). **Không cần thêm index mới cho riêng cleanup** — tái dùng 2 index hiện có, chỉ cần viết đúng điều kiện WHERE khớp thứ tự cột.

### Definition of Done Phase 4
- [ ] Migration 0055 chạy thành công, `\d app.notification` trên psql xác nhận có 2 cột mới + index mới.
- [ ] `pnpm --filter shared test` + `pnpm --filter web build` pass (union `NotificationEventType` mở rộng không phá chỗ nào dùng exhaustive switch — grep `switch (eventType)` hoặc `satisfies NotificationEventType[]` để rà nơi cần cập nhật, đặc biệt UI hiển thị icon/label theo `eventType` nếu có — audit `NotificationBell.tsx` khi code).
- [ ] `pnpm --filter worker build` pass — job mới compile được, import đúng `@iot/db/schema`.
- [ ] Test thủ công: tạo 1 notification `PR_SUBMITTED` giả (insert trực tiếp DB với `created_at` lùi 13 giờ), chạy job escalation thủ công (gọi hàm export trực tiếp qua script `.mjs` giống cách test `prReminderScan` — kiểm tra có file test tương tự khi code, nếu `apps/worker` có `*.test.ts` cho `prReminderScan` thì viết test cùng dạng cho job mới) → xác nhận có notification `NOTIFICATION_ESCALATED` mới cho admin + cột `escalated_at` được set.
- [ ] Chạy lại y hệt lần 2 → KHÔNG tạo thêm notification escalation trùng (do điều kiện `escalated_at IS NULL`).
- [ ] Cleanup: insert 1 notification đã đọc, `created_at` lùi 200 ngày → chạy job → bị xoá; notification đã đọc nhưng mới (< 180 ngày) → KHÔNG bị xoá.

### Rủi ro & Rollback
- **Rủi ro:** job escalation chạy sai điều kiện có thể spam admin liên tục nếu `escalated_at` không được set đúng (race condition nếu job overlap — BullMQ repeatable job mặc định không chạy chồng nếu cấu hình đúng `jobId` cố định, audit `apps/worker/src/index.ts` cách `prReminderScan` đăng ký để copy đúng pattern chống chồng lấn).
- **Rollback migration 0055:** AN TOÀN — `ALTER TABLE ADD COLUMN` có thể `DROP COLUMN` ngược lại không mất dữ liệu cột khác (chỉ mất chính 2 cột mới, chấp nhận được vì chưa ai phụ thuộc). Không giống Phase 1 (enum value không xoá được), đây là cột thường → viết kèm câu rollback thủ công trong PR description: `ALTER TABLE app.notification DROP COLUMN IF EXISTS email_sent_at, DROP COLUMN IF EXISTS escalated_at;`.
- **Rollback code:** revert commit, tắt job mới trong `apps/worker/src/index.ts` (bỏ dòng đăng ký repeatable) là đủ để dừng hành vi mới ngay lập tức mà không cần rollback migration.

---

## 8. Phase 5 — `/admin/users`: nhóm entity theo "phân hệ" (module)

**Effort: M (1.5 ngày)**

### 8.1 Vấn đề hiện tại

`UserPermissionMatrix.tsx` (409 dòng, đọc đầy đủ ở trên) hiển thị bảng phẳng **19 entity × 6 action = 114 ô** (sau Phase 2) — quá nhiều cho người dùng thường (không rành kỹ thuật) thao tác phân quyền thủ công. Yêu cầu: gom nhóm thành "phân hệ" dễ hiểu, giữ chế độ chi tiết cho ai cần.

### 8.2 Thiết kế nhóm module (đề xuất — thuần UI, KHÔNG đổi RBAC_MATRIX/schema)

Thêm 1 file mới **thuần frontend** (không đụng `packages/shared` — nhóm module là khái niệm UX, không phải RBAC concept, tránh lẫn lộn 2 tầng trừu tượng khác nhau — đây là lý do KHÔNG đặt trong `packages/shared/src/rbac/matrix.ts`):

**File tạo mới:** `apps/web/src/lib/rbac-modules.ts`
```ts
import type { RbacEntity } from "@iot/shared";

/**
 * V4 Wave 1 — Nhóm RbacEntity thành "phân hệ" (module) để UI /admin/users
 * hiển thị dễ hiểu hơn bảng phẳng 19 entity × 6 action. Thuần UI-level,
 * KHÔNG ảnh hưởng logic RBAC thật (can() vẫn check theo entity/action gốc).
 *
 * Khi thêm RbacEntity mới trong matrix.ts → PHẢI thêm vào đúng 1 module ở
 * đây, nếu không entity sẽ rơi vào module "other" (fallback).
 */
export type RbacModuleKey =
  | "master-data"   // item, supplier
  | "bom-order"     // bomTemplate, bomRevision, salesOrder, bomSnapshot, eco
  | "procurement"   // pr, po
  | "production"    // wo, reservation, productionBoard
  | "finance"       // finance, deliveryNote
  | "admin-system"  // user, session, audit, report, inventory
  | "other";

export const RBAC_MODULES: Record<
  RbacModuleKey,
  { label: string; description: string; entities: RbacEntity[] }
> = {
  "master-data": {
    label: "Dữ liệu gốc",
    description: "Vật tư, Nhà cung cấp",
    entities: ["item", "supplier"],
  },
  "bom-order": {
    label: "BOM & Đơn hàng",
    description: "BOM List, BOM Revision, Đơn hàng, BOM Snapshot, ECO",
    entities: ["bomTemplate", "bomRevision", "salesOrder", "bomSnapshot", "eco"],
  },
  procurement: {
    label: "Mua hàng",
    description: "Đề xuất mua vật tư (YCVT), Đơn mua hàng (PO)",
    entities: ["pr", "po"],
  },
  production: {
    label: "Sản xuất",
    description: "Lệnh sản xuất, Giữ kho, Bảng điều hành sản xuất",
    entities: ["wo", "reservation", "productionBoard"],
  },
  finance: {
    label: "Tài chính",
    description: "Thu chi/công nợ, Phiếu giao hàng",
    entities: ["finance", "deliveryNote"],
  },
  "admin-system": {
    label: "Quản trị & Hệ thống",
    description: "Người dùng, Phiên đăng nhập, Nhật ký, Báo cáo, Tồn kho",
    entities: ["user", "session", "audit", "report", "inventory"],
  },
  other: { label: "Khác", description: "", entities: [] },
};
```

### 8.3 Sửa `UserPermissionMatrix.tsx` — thêm chế độ "Theo phân hệ" / "Chi tiết"

**File:** `apps/web/src/components/admin/UserPermissionMatrix.tsx`.
- Thêm state `const [viewMode, setViewMode] = React.useState<"module" | "detail">("module")` (mặc định module — dễ dùng hơn cho user thường theo đúng tinh thần yêu cầu).
- Thêm toggle 2 nút (Tabs component đã có sẵn trong design system — dùng lại `@/components/ui/tabs` giống cách trang `admin/users/[id]/page.tsx` đã dùng `Tabs`/`TabsList`/`TabsTrigger` dòng 18) ở đầu component, trước bảng.
- **Chế độ "Theo phân hệ" (mặc định):**
  - Với mỗi module trong `RBAC_MODULES`, hiển thị 1 dòng gộp thay vì N dòng entity riêng: 6 cột action như cũ, nhưng mỗi ô đại diện TOÀN BỘ entity trong module đó.
  - Logic bấm 1 ô module × action = áp dụng override cho TẤT CẢ entity thuộc module đó cùng action (vd bấm "Tài chính" × "Đọc" = GRANT → tạo 2 override: `finance.read=true` VÀ `deliveryNote.read=true`).
  - Trạng thái hiển thị ô module: nếu TẤT CẢ entity con cùng trạng thái (effectiveAllowed giống nhau) → hiện ✓/✕ rõ ràng; nếu MIXED (vd `finance.read=true` nhưng `deliveryNote.read=false`) → hiện icon "một phần" (dùng ký hiệu `~` hoặc dấu gạch ngang `—`) kèm tooltip liệt kê chi tiết từng entity — không được che giấu thông tin mixed state, tránh admin tưởng nhầm đã cấp đủ.
  - Click vào ô mixed → tự chuyển sang chế độ "Chi tiết" đúng module đó để admin tự xử lý từng entity (tránh bấm nhầm ghi đè ý định cũ khi state không đồng nhất).
- **Chế độ "Chi tiết":** giữ nguyên bảng phẳng hiện tại (code đã có, không đổi) — chỉ thêm bộ lọc theo module (dropdown chọn module → chỉ hiện entity thuộc module đó, giảm số dòng phải cuộn).
- **KHÔNG đổi API** `/api/admin/users/[id]/permissions` (GET/PATCH) — nhóm module CHỈ là lớp hiển thị/thao tác hàng loạt phía client, mỗi lần "Lưu" vẫn gửi N patch riêng lẻ từng `(entity, action)` như cũ qua `useBulkUpdateUserPermissions` đã có sẵn (không cần sửa backend, không cần sửa `userPermissionOverrides.ts` hay route — đúng tinh thần KISS, tái dùng hạ tầng override đã hoàn thiện từ V1.9 P10).

### 8.4 Sửa `ENTITY_LABELS` — đã làm ở Phase 2 mục 5.4 (không lặp lại ở đây, chỉ tham chiếu).

### Definition of Done Phase 5
- [ ] Vào `/admin/users/[id]` tab Quyền → mặc định thấy 6 module (không phải 19 dòng entity) với 6 cột action.
- [ ] Bấm ô "Tài chính" × "Đọc" → chuyển GRANT → verify network tab gửi đúng 2 PATCH request (`finance.read`, `deliveryNote.read`).
- [ ] Toggle sang "Chi tiết" → thấy đúng 19 dòng entity như cũ, không mất tính năng cũ.
- [ ] Tạo trạng thái mixed thủ công (grant `finance.read` riêng qua chế độ chi tiết, không đụng `deliveryNote.read`) → quay lại chế độ module → ô "Tài chính"×"Đọc" hiện icon mixed, tooltip đúng.
- [ ] `pnpm --filter web build` + lint pass.
- [ ] Không có regression ở luồng override cũ (self-lockout check dòng 152-161 vẫn hoạt động — thử tự DENY `user.read` bằng chính tài khoản admin đang đăng nhập ở cả 2 chế độ → bị chặn với toast lỗi).

### Rollback
- Thuần frontend, revert commit an toàn — không đụng API/DB.

---

## 9. Bảng tổng hợp Files (toàn Đợt 1)

| # | File | Loại | Phase |
|---|---|---|---|
| 1 | `apps/web/src/lib/nav-items.ts` | Sửa | 0, 1 |
| 2 | `apps/web/src/lib/nav-items.test.ts` | Sửa | 0 |
| 3 | `packages/db/migrations/0054_shareholder_role.sql` | Mới | 1 |
| 4 | `packages/db/migrations/seed-shareholder-user.sql` | Mới (không đánh số) | 1 |
| 5 | `packages/shared/src/types.ts` | Sửa | 1 |
| 6 | `packages/shared/src/rbac/matrix.ts` | Sửa | 1, 2, 3 |
| 7 | `packages/shared/src/rbac/can.test.ts` | Sửa | 1, 2, 3 |
| 8 | `apps/web/src/app/(app)/layout.tsx` | Sửa | 1 |
| 9 | `apps/web/src/app/(app)/production-board/page.tsx` | Sửa (audit + vá nếu hardcode role) | 1 |
| 10 | `apps/web/src/components/admin/UserPermissionMatrix.tsx` | Sửa | 2, 5 |
| 11 | `apps/web/src/hooks/useAdmin.ts` | Sửa (nếu `RbacEntityKey` tách riêng khỏi `RbacEntity`) | 2 |
| 12 | `apps/web/src/app/api/purchase-requests/[id]/dept-approve/route.ts` | Sửa | 3 |
| 13 | `apps/worker/src/jobs/prReminderScan.ts` | Sửa | 3 |
| 14 | `apps/web/src/components/engineering/PRTab.tsx` | Sửa (audit hardcode role) | 3 |
| 15 | Trang chi tiết PR (`.../purchase-requests/[id]/page.tsx`) | Sửa (audit hardcode role) | 3 |
| 16 | `apps/web/src/server/services/notifications.ts` | Sửa (thêm event type only) | 4 |
| 17 | `packages/db/migrations/0055_notification_delivery_tracking.sql` | Mới | 4 |
| 18 | `packages/db/src/schema/notification.ts` | Sửa | 4 |
| 19 | `apps/worker/src/jobs/notificationEscalationScan.ts` | Mới | 4 |
| 20 | `apps/worker/src/index.ts` | Sửa (đăng ký job mới) | 4 |
| 21 | `apps/web/src/components/layout/NotificationBell.tsx` | Sửa (audit — nếu switch/label theo eventType) | 4 |
| 22 | `apps/web/src/lib/rbac-modules.ts` | Mới | 5 |
| 23 | `tests/e2e/cross-role-flow.mjs` | Sửa (audit bước dept-approve) | 3 |
| 24 | `PROGRESS.md` | Sửa (cập nhật milestone) | Cuối |

---

## 10. Rủi ro tổng hợp & Mitigation

| # | Rủi ro | Mức độ | Mitigation |
|---|---|---|---|
| R-1 | Trùng số migration `0053` (2 file cùng số đã tồn tại) khiến người thực thi nhầm số tiếp theo | Trung bình | Luôn `ls packages/db/migrations/ \| sort` trước khi đặt tên file mới; Đợt 1 dùng `0054` + `0055`, xác nhận lại ngay trước khi tạo file thật (agent khác có thể đã tạo 0054 song song) |
| R-2 | `ALTER TYPE role_code ADD VALUE` không rollback được | Thấp (chấp nhận được — đã là pattern chuẩn từ V3.3 tới nay, 5 role đã thêm theo cách này) | Không rollback enum, chỉ xoá row `app.role` + `user_role` liên quan nếu cần "tắt" tính năng; document rõ trong PR |
| R-3 | Đổi approver PR bước 2 làm kẹt phiếu đang chạy dở | Cao nếu chọn Phương án B | Mặc định dùng Phương án A (song song planner+warehouse), loại bỏ hoàn toàn rủi ro này; chỉ chuyển Phương án B sau khi xác nhận vận hành ổn định |
| R-4 | Escalation job chạy sai gây spam admin | Trung bình | Test kỹ điều kiện `escalated_at IS NULL`, đặt `jobId` cố định chống chồng lấn (theo đúng pattern `prReminderScan`), theo dõi log 48h đầu sau deploy |
| R-5 | Rename `NavSection.finance → purchasing` (Phase 0) sót chỗ dùng | Thấp | TypeScript union thay đổi tự báo lỗi biên dịch ở MỌI chỗ dùng sai — `pnpm build` là lưới an toàn tự nhiên, không cần grep thủ công tuyệt đối |
| R-6 | Đếm sai số lượng `RbacEntity` trong test assertion (`toHaveLength`) | Thấp nhưng dễ mắc lại (đã từng sai ở V3.9) | Luôn đếm bằng cách in ra thực tế (`console.log(RBAC_ENTITIES.length)`) thay vì tính nhẩm từ đọc code, ngay trước khi sửa assertion |
| R-7 | Gộp quá nhiều phase vào 1 PR lớn (do TypeScript union bắt buộc Phase 1+2 đi cùng nhau) làm review khó | Thấp | Chấp nhận gộp Phase 0+1+2 thành 1 PR (nền tảng role+entity không tách được do compile-time dependency); Phase 3, 4, 5 có thể tách PR riêng vì không có ràng buộc compile chéo |
| R-8 | Seed account cổ đông bị lộ mật khẩu mặc định trên production | Trung bình | Dùng đúng cơ chế `must_change_password = TRUE` hiện có (xem field trong `seed-test-users.sql` — hiện set `FALSE` cho test users, Đợt 1 seed cho QA/thật cần set `TRUE` để bắt đổi mật khẩu lần đầu, KHÁC với seed test thuần dev) |

---

## 11. Ước lượng tổng effort

| Phase | Effort | Ghi chú |
|---|---|---|
| 0 — Rename NavSection | 0.5 ngày | Rủi ro thấp, chủ yếu là rename có TypeScript hỗ trợ |
| 1 — Role shareholder | 1-1.5 ngày | Gồm migration + test + audit UI production-board |
| 2 — Entity finance/deliveryNote | 1 ngày | Chủ yếu thêm khai báo + test, không có UI thật dùng |
| 3 — Đổi approver PR | 1.5-2 ngày | Effort cao vì cần audit nhiều UI hardcode + test e2e cẩn thận |
| 4 — Notification escalation | 2-3 ngày | Phase nặng nhất — job mới, migration, test kịch bản thời gian |
| 5 — Admin/users module UI | 1.5 ngày | UI component mới, không đụng backend |
| **Tổng** | **~8-9.5 ngày làm việc** | Chưa tính thời gian theo dõi vận hành 2-4 tuần cho QĐ-2 (Phase 3) trước khi cân nhắc gỡ `planner` khỏi dept-approve ở Wave 2 |

---

## 12. Thứ tự deploy đề xuất (khi thực thi)

1. Gộp Phase 0 + 1 + 2 vào 1 PR (bắt buộc do ràng buộc compile-time của TypeScript union) → deploy migration `0054` **TRƯỚC** khi deploy code (giống nguyên tắc đã áp dụng ở V3.9 — enum value phải tồn tại trước khi code đọc role mới).
2. Deploy Phase 3 (PR riêng) — theo dõi log + `prReminderScan` 24-48h đầu.
3. Deploy Phase 4 (PR riêng) — migration `0055` trước code, theo dõi escalation job 48h đầu tránh spam.
4. Deploy Phase 5 (PR riêng) — thuần frontend, rủi ro thấp nhất, có thể deploy bất kỳ lúc nào sau Phase 2.
5. Sau toàn bộ Đợt 1 ổn định ≥ 1 tuần → cập nhật `PROGRESS.md` đánh dấu hoàn thành nền tảng V4 Wave 1, mở kế hoạch Wave 2 (màn hình Tài chính thật) tham chiếu các entity/event/module đã chuẩn bị sẵn ở đây.

---

## 13. TODO Tasks (checklist tổng)

- [ ] Phase 0: Rename `NavSection.finance` → `purchasing`
- [ ] Phase 1: Migration 0054 + ROLES + RBAC_MATRIX + nav + guard + test + audit UI production-board + seed account
- [ ] Phase 2: RbacEntity `finance` + `deliveryNote` + gán quyền 9 role + test + vá `ENTITY_LABELS`
- [ ] Phase 3: Đổi dept-approve guard (Phương án A song song) + RBAC + worker reminder + audit UI hardcode + test e2e
- [ ] Phase 4: Event types mới + migration 0055 (email_sent_at/escalated_at) + job escalation + job cleanup + test kịch bản thời gian
- [ ] Phase 5: `rbac-modules.ts` + UI toggle module/chi tiết trong `UserPermissionMatrix.tsx`
- [ ] Cập nhật `PROGRESS.md` sau khi cả 5 phase deploy ổn định
- [ ] Sau 2-4 tuần vận hành Phase 3 ổn định → lên kế hoạch Wave 2 để gỡ `planner` khỏi dept-approve guard (nếu user xác nhận muốn cắt hẳn)
