# Kế hoạch V3.9: Đề xuất mua vật tư cho MỌI tài khoản + Duyệt nhanh Admin + Kế toán nhận PDF/Excel

- **Mã task đề xuất:** `TASK-20260712-001`
- **Ngày:** 2026-07-12
- **Người lập:** planner (Claude)
- **Bản chất:** BẢN VÁ/MỞ RỘNG module Purchase Requests CÓ SẴN — KHÔNG viết lại form/flow/export
- **Version đề xuất:** **V3.9**
- **Migration:** `packages/db/migrations/0050_accountant_role.sql` (số kế tiếp sau 0049)
- **Trạng thái:** SẴN SÀNG EXECUTE (mọi quyết định đã được user chốt — xem mục 2)

---

## 1. Tóm tắt & Mục tiêu

Module YCVT/MRF (Purchase Request) đã hoàn thiện ~80%: form MRF GTAM 5 section, số phiếu `{seq}/PRD-MRF/{MMYY}`, duyệt 2 cấp, export PDF/Excel. V3.9 vá 4 gap:

1. **Mọi tài khoản đề xuất được** — mở `pr:create` cho purchaser + qc, nav item "Đề xuất vật tư" cho mọi role trừ display, kèm ownership filter: operator/qc chỉ thấy phiếu MÌNH tạo.
2. **Admin biết ngay khi có phiếu mới** — fan-out notification direct per-user (đếm vào badge chuông) tới mọi admin khi PR submit.
3. **Admin duyệt nhanh 1 nút** — endpoint `quick-approve` gộp 2 cấp duyệt trong 1 UPDATE atomic; deprecate route legacy `[id]/approve` (đang gãy timeline).
4. **Kế toán nhận file** — role `accountant` mới + acc `ketoan`; sau duyệt cuối, mọi user accountant nhận notification direct có link trang chi tiết PR (đã có sẵn 2 nút tải PDF/Excel).

**Bối cảnh kỹ thuật đã kiểm chứng (planner verify từng file:line ngày 2026-07-12):**

| Phát hiện | Chứng cứ (file:line) | Hệ quả |
|---|---|---|
| Schema PR + line đầy đủ mẫu GTAM (paperFormNo unique, approvalStep, dept/director approve fields) | `packages/db/src/schema/procurement.ts:55-122` | KHÔNG cần sửa schema PR |
| POST tạo phiếu → auto-submit → sinh paperFormNo → `notifyPRSubmitted` broadcast role `purchaser` | `apps/web/src/app/api/purchase-requests/route.ts:98-129` | Hook điểm bắn notify admin ở đây |
| Duyệt 2 cấp: dept-approve (SUBMITTED→DEPT_APPROVED, guard step tại `dept-approve/route.ts:32`), director-approve (DEPT_APPROVED→DIRECTOR_APPROVED + status APPROVED, guard tại `director-approve/route.ts:33`) | 2 route + repo `purchaseRequests.ts:367-421` | Quick-approve tái dùng pattern, gộp 1 UPDATE |
| Route legacy `[id]/approve` duyệt SUBMITTED→APPROVED **KHÔNG set approvalStep** → gãy timeline mục III/IV | `[id]/approve/route.ts:45` → repo `approvePR` `purchaseRequests.ts:426-446` | Phải chặn (410). Hook client `useApprovePurchaseRequest` (`usePurchaseRequests.ts:218-232`) KHÔNG được component nào dùng → xoá an toàn (đã grep toàn bộ `apps/web/src`) |
| Export ĐÃ CÓ: `export-pdf/route.ts:25` + `export-excel/route.ts:25`, cùng guard `requireCan("read","pr")`; trang chi tiết đã có 2 nút tải | `[id]/page.tsx:241-246, 292-299` | Kế toán CHỈ cần quyền `read pr` + link là tải được, KHÔNG code export mới |
| Role-broadcast KHÔNG đếm badge chuông: `getUnreadCount` chỉ đếm `recipientUser` | `server/services/notifications.ts:592-604` | Muốn admin/kế toán thấy badge → PHẢI fan-out direct per-user |
| RBAC hiện tại: operator/warehouse có `pr:["create","read"]`; purchaser `pr:["read","update","approve"]` (THIẾU create); qc/display không có entry pr | `packages/shared/src/rbac/matrix.ts:103,124,146,160-174` | Phase 1 sửa matrix |
| Route guard server chặn `/procurement` + `/engineering` với qc (và accountant tương lai) | `apps/web/src/app/(app)/layout.tsx:25-46` (dòng 31, 36) | Phải thêm role vào 2 prefix, nếu quên → redirect `/?denied=1` |
| List PR đã hỗ trợ filter `requestedBy` ở repo + API nhưng KHÔNG enforce | `server/repos/purchaseRequests.ts:49`, `api/purchase-requests/route.ts:35` | Ownership = force param server-side, không cần sửa repo |
| Precedent thêm role (V3.8.2 `display`, commit `99b9907`): 13 files | `git show --stat 99b9907` | Checklist Phase 4 bám đúng commit này |
| Test RBAC **ĐANG STALE**: case `["operator","create","pr",false]` sai với matrix hiện tại (operator CÓ create từ V3.7.55) | `packages/shared/src/rbac/can.test.ts:91` vs `matrix.ts:103` | Sửa luôn trong Phase 4 khi update test |
| Migration mới nhất: `0049_display_role.sql` (pattern DO-block ALTER TYPE + INSERT role) | `packages/db/migrations/` | Migration mới = **0050** |
| KHÔNG có SMTP trong hệ thống | — | Kế toán nhận qua in-app notification (user đã chốt tạo acc `ketoan`) |

---

## 2. Quyết định đã chốt (user confirm — KHÔNG hỏi lại)

| # | Quyết định |
|---|---|
| QĐ-1 | Tạo acc `ketoan` (role `accountant` mới) mật khẩu tạm — kế toán đăng nhập app nhận notification + tự tải PDF/Excel. KHÔNG làm email/SMTP. |
| QĐ-2 | Admin "duyệt nhanh" 1 nút gộp 2 cấp — chấp nhận tên admin hiện ở CẢ 2 ô ký (Trưởng bộ phận + Giám đốc) trên PDF/phiếu. |
| QĐ-3 | Ownership: operator/qc chỉ xem phiếu MÌNH tạo (`requestedBy`); admin/planner/purchaser/accountant xem tất cả. Warehouse giữ nguyên hiện trạng (xem tất cả) — nếu sau này muốn siết chỉ cần bỏ khỏi 1 hằng số (xem Phase 1 Bước 1.4). |

---

## 3. Phạm vi

### Trong phạm vi (4 phase, thứ tự triển khai = thứ tự phụ thuộc)
1. **Phase 1 — RBAC + Nav + Ownership** (nền cho các phase sau)
2. **Phase 2 — Notify submit → admin** (fan-out direct, helper tái dùng cho Phase 4)
3. **Phase 3 — Quick-approve admin + chặn route legacy**
4. **Phase 4 — Role `accountant` + notify kế toán + seed acc `ketoan`**

### Ngoài phạm vi (KHÔNG làm đợt này)
- KHÔNG viết lại form MRF / flow duyệt / export PDF-Excel (tất cả đã có).
- KHÔNG email/SMTP, KHÔNG push notification.
- KHÔNG sửa RLS policy Postgres (RLS_ENABLED đang off; accountant map PG role có sẵn).
- KHÔNG đụng module PO / inventory / production board.
- KHÔNG per-recipient read-state cho role-broadcast (giữ nguyên cơ chế cũ cho purchaser).

---

## 4. Chi tiết triển khai

> **Thứ tự deploy bắt buộc:** migration `0050` apply trên VPS **TRƯỚC** khi deploy code (enum value phải tồn tại trước khi code login đọc role `accountant`). Code cũ không bị ảnh hưởng bởi enum value mới → apply migration sớm là an toàn. Xem mục 6.

### Phase 1 — RBAC + Nav + Ownership filter (effort: M)

#### Bước 1.1 — Mở `pr:create` cho purchaser + entry pr cho qc
- **File:** `packages/shared/src/rbac/matrix.ts`
- Dòng 146 (purchaser): `pr: ["read", "update", "approve"]` → `pr: ["create", "read", "update", "approve"]`.
- Block qc (dòng 160-169): thêm `pr: ["create", "read"],` (kèm comment `// V3.9 — QC tự đề xuất mua vật tư (dụng cụ đo, tiêu hao QC)`).
- KHÔNG đụng display.

#### Bước 1.2 — Nav item "Đề xuất vật tư" cho mọi role trừ display
- **File:** `apps/web/src/lib/nav-items.ts`
- Thêm import `ShoppingCart` từ `lucide-react` (dòng 1-10).
- Thêm item mới vào `NAV_ITEMS` (sau item `/engineering` dòng 110-116, section `engineering`):
  ```ts
  // V3.9 — Đề xuất mua vật tư: MỌI tài khoản (trừ display) đều tạo/theo dõi được.
  {
    href: "/engineering?tab=pr",
    label: "Đề xuất vật tư",
    icon: ShoppingCart,
    roles: ["admin", "planner", "warehouse", "operator", "purchaser", "qc", "accountant"],
    section: "engineering",
  },
  ```
  > Lưu ý: `"accountant"` chỉ compile sau khi Phase 4 thêm vào `ROLES`. Nếu execute Phase 1 tách commit riêng → tạm để mảng không có `accountant`, Phase 4 bổ sung. Khuyến nghị: **gộp cả 4 phase vào 1 PR/release V3.9** để tránh trạng thái trung gian.

#### Bước 1.3 — Mở route guard server + tabs hub cho qc (accountant bổ sung ở Phase 4)
- **File:** `apps/web/src/app/(app)/layout.tsx` — `ROUTE_ROLE_GUARD` (dòng 25-46):
  - Dòng 31 `/engineering`: thêm `"qc"` (Phase 4 thêm `"accountant"`).
  - Dòng 36 `/procurement`: thêm `"qc"` (Phase 4 thêm `"accountant"`). Detail/new-mrf/PR list đều nằm dưới prefix này.
- **File:** `apps/web/src/app/(app)/engineering/page.tsx`:
  - `tabs` useMemo (dòng 47-58): thêm nhánh qc/accountant chỉ thấy tab `pr` (qc KHÔNG có quyền `bomTemplate:read` nên không mở tab BOM):
    ```ts
    const isQc = roles.includes("qc");
    // ... trong useMemo:
    if (isQc /* Phase 4: || isAccountant */) allowedKeys.add("pr");
    ```
  - Nhánh `breadcrumbDept`/`pageTitle`/`pageSubtitle` (dòng 66-88): thêm fallback cho qc ("Tổ QC/KCS" / "Đề xuất mua vật tư") — cosmetic, S.
- **File:** `apps/web/src/components/engineering/PRTab.tsx` — `canCreateMRF` (dòng 59-64) đang hardcode role list. **Refactor DRY** dùng matrix:
  ```ts
  import { can } from "@iot/shared";
  const canCreateMRF = can(roles, "create", "pr");
  ```
  → tự động đúng cho purchaser/qc (và accountant Phase 4), hết lệch với matrix.
- **File:** `apps/web/src/app/(app)/procurement/purchase-requests/new-mrf/page.tsx` — auto-fill `proposingDepartment` (dòng 125-132): thêm nhánh `qc → "Tổ QC/KCS"` (Phase 4: `accountant → "Bộ phận Kế toán"`, `purchaser → đã có`).

#### Bước 1.4 — Ownership filter server-side (điểm QUAN TRỌNG nhất Phase 1)
- **File tạo mới:** `apps/web/src/server/services/prAccess.ts`
  ```ts
  import type { Role } from "@iot/shared";

  /**
   * V3.9 — Ownership PR: role nào xem được TẤT CẢ phiếu.
   * operator/qc (không nằm trong list) chỉ xem phiếu requestedBy = chính mình.
   * QĐ-3: warehouse giữ nguyên xem tất cả (hiện trạng V3.7.55).
   */
  const PR_VIEW_ALL_ROLES: Role[] = [
    "admin", "planner", "purchaser", "warehouse",
    // Phase 4: "accountant",
  ];

  export function canViewAllPRs(roles: Role[]): boolean {
    return roles.some((r) => PR_VIEW_ALL_ROLES.includes(r));
  }
  ```
- **File:** `apps/web/src/app/api/purchase-requests/route.ts` — handler `GET` (dòng 23-51): sau guard, force filter:
  ```ts
  const viewAll = canViewAllPRs(guard.session.roles);
  const result = await listPRs({
    ...,
    // V3.9 — operator/qc chỉ thấy phiếu mình tạo (override query param)
    requestedBy: viewAll ? q.data.requestedBy : guard.session.userId,
    ...
  });
  ```
  Repo `listPRs` đã hỗ trợ `requestedBy` (`purchaseRequests.ts:49`) — KHÔNG sửa repo.
- **Guard chi tiết + export theo owner** — 3 route cùng pattern, chèn ngay sau `getPR`:
  - `apps/web/src/app/api/purchase-requests/[id]/route.ts` — `GET` (sau dòng 37)
  - `apps/web/src/app/api/purchase-requests/[id]/export-pdf/route.ts` (sau dòng 30)
  - `apps/web/src/app/api/purchase-requests/[id]/export-excel/route.ts` (sau check NOT_FOUND tương ứng)
  ```ts
  // V3.9 — ownership: operator/qc chỉ xem phiếu mình tạo. Trả 404 (không 403)
  // để không lộ sự tồn tại của phiếu người khác.
  if (!canViewAllPRs(guard.session.roles) && row.requestedBy !== guard.session.userId) {
    return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);
  }
  ```
  > KHÔNG cần guard PATCH/DELETE/reject/dept-approve/director-approve — các action đó đòi `update`/`delete`/`approve` mà operator/qc không có trong matrix.
  > Edge: phiếu cũ `requestedBy = NULL` → operator/qc không thấy (đúng kỳ vọng — không phải phiếu của họ).

### Phase 2 — Notification submit → fan-out direct tới admin (effort: S)

#### Bước 2.1 — Helper `emitToUsersWithRole` (tái dùng Phase 4)
- **File:** `apps/web/src/server/services/notifications.ts`
- Thêm import: `role`, `userRole` từ `@iot/db/schema` + `and`, `ne` từ `drizzle-orm` (dòng 1-2 hiện import `eq, sql` + `notification, userAccount`).
- Thêm helper (đặt cạnh `getUnreadCount`, sau dòng ~590):
  ```ts
  /**
   * V3.9 — Fan-out notification DIRECT tới từng user active có role chỉ định.
   * Khác recipientRole broadcast: mỗi user 1 row riêng → ĐẾM vào badge chuông
   * (getUnreadCount chỉ đếm recipientUser) + read-state độc lập từng người.
   * Loại actor khỏi danh sách (không tự notify chính mình).
   */
  export async function emitToUsersWithRole(
    roleCode: Role,
    input: Omit<EmitNotificationInput, "recipientUser" | "recipientRole">,
  ): Promise<void> {
    try {
      const rows = await db
        .select({ id: userRole.userId })
        .from(userRole)
        .innerJoin(role, eq(role.id, userRole.roleId))
        .innerJoin(userAccount, eq(userAccount.id, userRole.userId))
        .where(and(eq(role.code, roleCode), eq(userAccount.isActive, true)));
      const ids = rows
        .map((r) => r.id)
        .filter((id) => id !== (input.actorUserId ?? null));
      await emitNotifications(ids.map((id) => ({ ...input, recipientUser: id })));
    } catch (err) {
      logger.warn({ err, roleCode }, "emitToUsersWithRole failed");
    }
  }
  ```

#### Bước 2.2 — `notifyPRSubmitted` bắn thêm cho admin
- **File:** `apps/web/src/server/services/notifications.ts` — `notifyPRSubmitted` (dòng 163-177):
  - GIỮ broadcast `recipientRole: "purchaser"` (backward-compat, purchaser vẫn thấy trong list notifications).
  - THÊM sau đó:
    ```ts
    // V3.9 — fan-out direct tới mọi admin (đếm badge) để duyệt nhanh
    await emitToUsersWithRole("admin", {
      actorUserId: ctx.actorUserId,
      actorUsername: ctx.actorUsername,
      eventType: "PR_SUBMITTED",
      entityType: "purchase_request",
      entityId: ctx.prId,
      entityCode: ctx.prNo,
      title: `Phiếu YCVT mới chờ duyệt: ${ctx.prNo}`,
      message: ctx.title ? `"${ctx.title}" — bấm để duyệt nhanh` : "Bấm để xem và duyệt nhanh",
      link: `/procurement/purchase-requests/${ctx.prId}`,
      severity: "info",
    });
    ```
- KHÔNG sửa call-site (`api/purchase-requests/route.ts:121-129` đã gọi `notifyPRSubmitted` fire-and-forget với đủ context).
- Lưu ý duplicate chấp nhận được: user vừa admin vừa purchaser sẽ thấy 2 rows (1 direct + 1 broadcast) — hiếm (chỉ tài khoản admin gốc), không xử lý dedupe (KISS).

### Phase 3 — Quick-approve admin + chặn route legacy (effort: M)

#### Bước 3.1 — Repo `quickApprovePR` (1 UPDATE atomic)
- **File:** `apps/web/src/server/repos/purchaseRequests.ts` — thêm sau `directorApprovePR` (dòng 421):
  ```ts
  /**
   * V3.9 — Admin duyệt nhanh: gộp 2 cấp trong 1 UPDATE atomic.
   * SUBMITTED → DIRECTOR_APPROVED + status APPROVED. Cả 2 ô ký = admin (QĐ-2).
   * WHERE approvalStep='SUBMITTED' → race với dept-approve trả null → 409.
   */
  export async function quickApprovePR(
    id: string,
    approverId: string,
    note?: string | null,
  ): Promise<PurchaseRequest | null> {
    const now = new Date();
    const quickNote = note ?? "Duyệt nhanh (Admin)";
    const [row] = await db
      .update(purchaseRequest)
      .set({
        status: "APPROVED",
        approvalStep: "DIRECTOR_APPROVED",
        deptApprovedBy: approverId,
        deptApprovedAt: now,
        deptApprovalNote: quickNote,
        directorApprovedBy: approverId,
        directorApprovedAt: now,
        directorApprovalNote: quickNote,
        approvedBy: approverId, // back-compat
        approvedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(purchaseRequest.id, id),
          eq(purchaseRequest.approvalStep, "SUBMITTED"),
        ),
      )
      .returning();
    return row ?? null;
  }
  ```

#### Bước 3.2 — Route mới `[id]/quick-approve` (admin-only)
- **File tạo mới:** `apps/web/src/app/api/purchase-requests/[id]/quick-approve/route.ts`
- Copy skeleton từ `director-approve/route.ts` (cùng inputSchema `{ note }`), khác biệt:
  ```ts
  const guard = await requireCan(req, "approve", "pr");
  if ("response" in guard) return guard.response;
  // V3.9 — quick-approve CHỈ admin (planner/purchaser vẫn duyệt từng cấp)
  if (!guard.session.isAdmin()) {
    return jsonError("FORBIDDEN", "Chỉ Admin được duyệt nhanh 2 cấp.", 403);
  }
  // ... getPR → NOT_FOUND 404
  if (before.approvalStep !== "SUBMITTED") {
    return jsonError("INVALID_STATE",
      `Phiếu đang ở bước ${before.approvalStep} — duyệt nhanh chỉ áp dụng khi SUBMITTED.`, 409);
  }
  const row = await quickApprovePR(params.id, guard.session.userId, body.data.note ?? null);
  if (!row) return jsonError("CONFLICT", "Phiếu đã thay đổi trạng thái.", 409);
  ```
- Audit: 1 record `writeAudit` action `APPROVE`, notes `"Duyệt nhanh 2 cấp (admin)"`, before `{approvalStep, status}` / after `{approvalStep, status, directorApprovedBy}`.
- Notification: gọi `notifyPRApproved` (creator, như director-approve dòng 69-76) + hook kế toán của Phase 4 (Bước 4.4).

#### Bước 3.3 — Chặn route legacy `[id]/approve` → 410
- **File:** `apps/web/src/app/api/purchase-requests/[id]/approve/route.ts` — thay TOÀN BỘ handler:
  ```ts
  /**
   * V3.9 — DEPRECATED (410). Route này duyệt tắt KHÔNG set approvalStep →
   * gãy timeline III/IV. Dùng dept-approve / director-approve / quick-approve.
   */
  export async function POST() {
    return jsonError("GONE",
      "Endpoint đã ngưng. Dùng /dept-approve, /director-approve hoặc /quick-approve.", 410);
  }
  ```
  (Xoá import không dùng; giữ file để trả 410 thay vì 404 — client cũ nhận message rõ ràng.)
- **File:** `apps/web/src/hooks/usePurchaseRequests.ts` — XOÁ `useApprovePurchaseRequest` (dòng 218-232, đã verify không component nào import) + xoá import `PRApproveInput` nếu không còn dùng.
- Repo `approvePR` (`purchaseRequests.ts:426-446`): xoá luôn (không còn caller sau khi route 410). Nếu ngại diff lớn → giữ + comment `@deprecated`, nhưng khuyến nghị xoá (YAGNI).

#### Bước 3.4 — UI nút "Duyệt nhanh (Admin)" ở trang chi tiết
- **File:** `apps/web/src/hooks/usePurchaseRequests.ts` — thêm hook (pattern y hệt `useDirectorApprovePR` dòng 313-327):
  ```ts
  /** V3.9 — Admin duyệt nhanh 2 cấp trong 1 request. */
  export function useQuickApprovePR(id: string) { /* POST .../quick-approve, invalidate requests.all + detail + dashboard */ }
  ```
- **File:** `apps/web/src/app/(app)/procurement/purchase-requests/[id]/page.tsx`:
  - Thêm `const quickApprove = useQuickApprovePR(id);` (cạnh dòng 147-148).
  - Thêm flag sau dòng 191: `const canQuickApprove = isAdmin && step === "SUBMITTED";`
  - State dialog dòng 159: mở rộng union `"dept" | "director" | "quick"`.
  - `handleApproveSubmit` (dòng 209-223): thêm nhánh `quick` → `quickApprove.mutateAsync({ note })` + toast `"Đã duyệt nhanh 2 cấp — phiếu sẵn sàng tạo PO"`.
  - Toolbar (chèn cạnh nút dept-approve dòng 312-329): nút `Duyệt nhanh (Admin)` màu emerald, icon `CheckCircle2`, hiện khi `canQuickApprove`. Admin khi step=SUBMITTED sẽ thấy CẢ 2 nút ("Duyệt (Trưởng bộ phận)" từng cấp + "Duyệt nhanh") — chủ đích, giữ đường duyệt từng cấp.
  - Dialog title/description (dòng 807-818): thêm nhánh `quick`: "Duyệt nhanh — gộp 2 cấp" / "Tên bạn sẽ hiện ở CẢ 2 ô ký (Trưởng bộ phận + Giám đốc). Phiếu chuyển thẳng sang Đã duyệt, sẵn sàng tạo PO."

### Phase 4 — Role `accountant` + notify kế toán + seed `ketoan` (effort: M)

> Checklist bám đúng precedent commit `99b9907` (role display, 13 files), BỎ các phần kiosk-only (`lib/auth.ts` TTL, `lib/env.ts` JWT_KIOSK_TTL, login route session 24h — accountant dùng TTL thường, KHÔNG sửa 3 file này).

#### Bước 4.1 — Type + enum + migration
- **File:** `packages/shared/src/types.ts` (dòng 15):
  ```ts
  export const ROLES = ["admin", "planner", "warehouse", "operator", "purchaser", "qc", "display", "accountant"] as const;
  ```
  + comment mapping `accountant → Bộ phận Kế toán (nhận phiếu YCVT đã duyệt, tải PDF/Excel)`.
  > Thêm vào CUỐI mảng — khớp thứ tự ALTER TYPE ADD VALUE (enum Postgres append cuối).
- **File:** `packages/db/src/schema/auth.ts` — `roleCodeEnum` (dòng 21-29): thêm `"accountant"` cuối mảng + comment V3.9.
- **File tạo mới:** `packages/db/migrations/0050_accountant_role.sql` (pattern y hệt 0049):
  ```sql
  -- V3.9 — Role 'accountant' (Bộ phận Kế toán): nhận notification phiếu YCVT
  -- đã duyệt + tải PDF/Excel. Theo precedent 0049: ALTER TYPE trong DO block
  -- (psql autocommit mỗi statement) rồi INSERT role row.

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'accountant'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'role_code')
    ) THEN
      ALTER TYPE role_code ADD VALUE 'accountant';
    END IF;
  END $$;

  INSERT INTO app.role (code, display_name, description)
  VALUES ('accountant', 'Bộ phận Kế toán',
          'Nhận thông báo phiếu YCVT đã duyệt, tải PDF/Excel gửi nhà cung cấp/thanh toán')
  ON CONFLICT (code) DO NOTHING;
  ```
  > LƯU Ý: chạy qua `psql -f` KHÔNG bọc `-1`/`--single-transaction` — `ALTER TYPE ADD VALUE` (trong DO) phải commit trước khi INSERT dùng value mới. 0049 đã chạy đúng cách này.

#### Bước 4.2 — RBAC matrix + rlsContext + test
- **File:** `packages/shared/src/rbac/matrix.ts` — thêm block sau `display` (dòng 172-174):
  ```ts
  // V3.9 — Accountant (Bộ phận Kế toán): tạo + xem YCVT để tải PDF/Excel.
  // KHÔNG duyệt, KHÔNG PO. user/session read để dùng profile + admin hiển thị.
  accountant: {
    pr: ["create", "read"],
    user: ["read"],
    session: ["read"],
  },
  ```
  (`RBAC_ENTITIES`/`RBAC_ACTIONS` giữ nguyên — không entity mới.)
- **File:** `apps/web/src/server/services/rlsContext.ts`:
  - `ROLE_PRIORITY` (dòng 24-34): `accountant: 1,` (read-mostly như qc).
  - `ROLE_TO_PG` (dòng 36-47): `accountant: "iot_purchaser",` + comment `// V3.9 — chưa có PG role riêng; map iot_purchaser (đọc PR). RLS đang off, app-level RBAC là chính.`
- **File:** `packages/shared/src/rbac/can.test.ts`:
  - Dòng 13-25: đổi tên it `"có đủ 8 role × 17 entity × 6 action (V3.9 thêm accountant)"` + thêm `"accountant"` vào expected keys (đúng THỨ TỰ khai báo trong matrix — sau `display`).
  - **SỬA CASE STALE dòng 91:** `["operator", "create", "pr", false]` → `true` (matrix đã cho operator create từ V3.7.55 — test này hiện FAIL nếu chạy vitest).
  - Thêm cases V3.9:
    ```ts
    ["purchaser", "create", "pr", true],
    ["qc", "create", "pr", true],
    ["qc", "read", "pr", true],
    ["accountant", "create", "pr", true],
    ["accountant", "read", "pr", true],
    ["accountant", "approve", "pr", false],
    ["accountant", "read", "po", false],
    ["accountant", "read", "productionBoard", false],
    ```

#### Bước 4.3 — UI admin + nav + guard (exhaustiveness `Record<Role>`)
Đã grep toàn repo `Record<Role` — chỉ 5 chỗ, 3 chỗ cần sửa ngoài matrix/rlsContext:
- **File:** `apps/web/src/components/admin/UserForm.tsx` — `ALL_ROLES` (dòng 24-46): thêm `{ code: "accountant", label: "Kế toán", desc: "Nhận phiếu YCVT đã duyệt — tải PDF/Excel" }`.
- **File:** `apps/web/src/app/(app)/admin/users/page.tsx` — `ROLE_OPTIONS` (dòng 24-33) thêm `{ code: "accountant", label: "Bộ phận Kế toán" }`; `ROLE_BADGE` (dòng 35-43) thêm `accountant: "bg-lime-50 text-lime-700 ring-lime-200"`.
- **File:** `apps/web/src/app/(app)/admin/users/[id]/page.tsx` — `ROLE_BADGE` (dòng 32) thêm entry tương tự.
- Hoàn tất các chỗ "Phase 4 bổ sung" của Phase 1:
  - `nav-items.ts`: `"accountant"` trong roles item "Đề xuất vật tư".
  - `layout.tsx` `ROUTE_ROLE_GUARD`: thêm `"accountant"` vào `/engineering` + `/procurement`.
  - `engineering/page.tsx`: `isAccountant` → `allowedKeys.add("pr")` + nhánh breadcrumb "Bộ phận Kế toán".
  - `prAccess.ts`: thêm `"accountant"` vào `PR_VIEW_ALL_ROLES`.
  - `new-mrf/page.tsx`: nhánh auto-fill `accountant → "Bộ phận Kế toán"`.

#### Bước 4.4 — Notify kế toán khi phiếu duyệt cuối (kèm link tải file)
- **File:** `apps/web/src/server/services/notifications.ts` — thêm builder (tái dùng event `PR_APPROVED`, KHÔNG cần event type mới):
  ```ts
  /**
   * V3.9 — Sau duyệt cuối (director-approve HOẶC quick-approve): fan-out
   * direct tới mọi user accountant. Link = trang chi tiết PR (đã có sẵn
   * 2 nút tải PDF/Excel) — không đính kèm file, không cần SMTP.
   */
  export async function notifyPRApprovedToAccounting(ctx: PRNotifyContext) {
    await emitToUsersWithRole("accountant", {
      actorUserId: ctx.actorUserId,
      actorUsername: ctx.actorUsername,
      eventType: "PR_APPROVED",
      entityType: "purchase_request",
      entityId: ctx.prId,
      entityCode: ctx.prNo,
      title: `Phiếu ${ctx.prNo} đã duyệt — tải PDF/Excel`,
      message: ctx.title
        ? `"${ctx.title}" — mở phiếu để tải bản PDF/Excel gửi thanh toán.`
        : "Mở phiếu để tải bản PDF/Excel.",
      link: `/procurement/purchase-requests/${ctx.prId}`,
      severity: "success",
    });
  }
  ```
- **Call-sites (2 chỗ, đều fire-and-forget `void`):**
  - `apps/web/src/app/api/purchase-requests/[id]/director-approve/route.ts` — cạnh `notifyPRApproved` (dòng 69-76), dùng `prNo = before.paperFormNo ?? before.code`.
  - `apps/web/src/app/api/purchase-requests/[id]/quick-approve/route.ts` (route mới Phase 3).

#### Bước 4.5 — Seed acc `ketoan`
- **Cách chính (khuyến nghị):** admin tự tạo qua UI `/admin/users` → username `ketoan`, role Kế toán, mật khẩu tạm, bật "bắt đổi mật khẩu lần đầu". KHÔNG cần code.
- **Fallback SQL** (nếu muốn seed cùng lúc migration): **file tạo mới** `packages/db/migrations/seed-ketoan-user.sql` — copy pattern `seed-test-users.sql` (tái dùng hash argon2id có sẵn của mật khẩu `Test@1234`, dòng 7 file đó), 1 user:
  `('ketoan', 'Bộ phận Kế toán', 'ketoan@songchau.local', 'accountant')` + set `must_change_password = TRUE`. Idempotent (skip nếu tồn tại). Chạy SAU 0050.

---

## 5. Danh sách file tác động (tổng hợp)

| # | File | Loại | Phase | Việc |
|---|---|---|---|---|
| 1 | `packages/shared/src/rbac/matrix.ts` | Sửa | 1+4 | purchaser +create; qc +pr; block accountant |
| 2 | `apps/web/src/lib/nav-items.ts` | Sửa | 1+4 | Item "Đề xuất vật tư" (+ShoppingCart import) |
| 3 | `apps/web/src/app/(app)/layout.tsx` | Sửa | 1+4 | ROUTE_ROLE_GUARD: +qc/accountant vào `/engineering`, `/procurement` |
| 4 | `apps/web/src/app/(app)/engineering/page.tsx` | Sửa | 1+4 | Tabs qc/accountant = pr-only + breadcrumb |
| 5 | `apps/web/src/components/engineering/PRTab.tsx` | Sửa | 1 | `canCreateMRF = can(roles,"create","pr")` |
| 6 | `apps/web/src/app/(app)/procurement/purchase-requests/new-mrf/page.tsx` | Sửa | 1+4 | Auto-fill proposingDepartment qc/accountant |
| 7 | `apps/web/src/server/services/prAccess.ts` | **Tạo mới** | 1+4 | `canViewAllPRs()` |
| 8 | `apps/web/src/app/api/purchase-requests/route.ts` | Sửa | 1 | GET: force `requestedBy` cho operator/qc |
| 9 | `apps/web/src/app/api/purchase-requests/[id]/route.ts` | Sửa | 1 | GET: owner-guard 404 |
| 10 | `apps/web/src/app/api/purchase-requests/[id]/export-pdf/route.ts` | Sửa | 1 | Owner-guard 404 |
| 11 | `apps/web/src/app/api/purchase-requests/[id]/export-excel/route.ts` | Sửa | 1 | Owner-guard 404 |
| 12 | `apps/web/src/server/services/notifications.ts` | Sửa | 2+4 | `emitToUsersWithRole` + admin fan-out trong `notifyPRSubmitted` + `notifyPRApprovedToAccounting` |
| 13 | `apps/web/src/server/repos/purchaseRequests.ts` | Sửa | 3 | +`quickApprovePR`; xoá `approvePR` (dòng 426-446) |
| 14 | `apps/web/src/app/api/purchase-requests/[id]/quick-approve/route.ts` | **Tạo mới** | 3 | Admin-only, 1 UPDATE atomic, audit + notify |
| 15 | `apps/web/src/app/api/purchase-requests/[id]/approve/route.ts` | Sửa | 3 | Trả 410 GONE |
| 16 | `apps/web/src/app/api/purchase-requests/[id]/director-approve/route.ts` | Sửa | 4 | +`notifyPRApprovedToAccounting` |
| 17 | `apps/web/src/hooks/usePurchaseRequests.ts` | Sửa | 3 | +`useQuickApprovePR`; xoá `useApprovePurchaseRequest` |
| 18 | `apps/web/src/app/(app)/procurement/purchase-requests/[id]/page.tsx` | Sửa | 3 | Nút + dialog "Duyệt nhanh (Admin)" |
| 19 | `packages/shared/src/types.ts` | Sửa | 4 | ROLES +accountant |
| 20 | `packages/db/src/schema/auth.ts` | Sửa | 4 | roleCodeEnum +accountant |
| 21 | `packages/db/migrations/0050_accountant_role.sql` | **Tạo mới** | 4 | Enum + role row |
| 22 | `apps/web/src/server/services/rlsContext.ts` | Sửa | 4 | ROLE_PRIORITY + ROLE_TO_PG |
| 23 | `apps/web/src/components/admin/UserForm.tsx` | Sửa | 4 | ALL_ROLES |
| 24 | `apps/web/src/app/(app)/admin/users/page.tsx` | Sửa | 4 | ROLE_OPTIONS + ROLE_BADGE |
| 25 | `apps/web/src/app/(app)/admin/users/[id]/page.tsx` | Sửa | 4 | ROLE_BADGE |
| 26 | `packages/shared/src/rbac/can.test.ts` | Sửa | 4 | 8 roles + cases mới + **fix case stale dòng 91** |
| 27 | `packages/db/migrations/seed-ketoan-user.sql` | **Tạo mới (tuỳ chọn)** | 4 | Seed acc `ketoan` (fallback nếu không tạo qua UI) |

→ **1 migration duy nhất (0050). KHÔNG sửa schema bảng PR. KHÔNG event type notification mới. KHÔNG SMTP.**

---

## 6. Migration & thứ tự deploy (QUAN TRỌNG)

1. **Local:** code + `pnpm build` pass (CLAUDE.md nguyên tắc 3) + `pnpm -F @iot/shared test` (vitest can.test.ts) pass.
2. **Apply migration TRƯỚC trên VPS** (enum value mới an toàn với code cũ):
   ```bash
   scp -i ~/.ssh/iot_vps packages/db/migrations/0050_accountant_role.sql root@45.124.94.13:/tmp/
   ssh -i ~/.ssh/iot_vps root@45.124.94.13 \
     "docker exec -i iot_postgres psql -U hethong_app -d hethong_iot < /tmp/0050_accountant_role.sql"
   # KHÔNG dùng --single-transaction (ALTER TYPE ADD VALUE phải commit trước INSERT)
   # Verify: SELECT enumlabel FROM pg_enum WHERE enumtypid = 'role_code'::regtype;
   #         SELECT code, display_name FROM app.role ORDER BY code;
   ```
   (Điều chỉnh user/db theo thực tế container — kiểm tra bằng `docker exec iot_postgres env | grep POSTGRES` trước khi chạy.)
3. **Push `main`** → GitHub Actions build image → VPS pull + `docker compose up -d app worker caddy`.
4. **Seed acc `ketoan`:** tạo qua UI admin (khuyến nghị) hoặc apply `seed-ketoan-user.sql` (SAU bước 2-3).
5. Smoke test E2E (mục 8).

**Rollback:** enum value Postgres KHÔNG drop được dễ — nếu phải rollback code, enum `accountant` thừa vô hại (không user nào gán). Chỉ cần revert commit + redeploy image cũ.

---

## 7. Định nghĩa Done (DoD) theo hạng mục

### DoD-1 (RBAC + nav + ownership)
- [ ] Login `purchaser` → thấy nav "Đề xuất vật tư" → mở form new-mrf → tạo phiếu 201.
- [ ] Login `qc` → thấy nav "Đề xuất vật tư", vào `/engineering?tab=pr` KHÔNG bị redirect `/?denied=1`, tab BOM KHÔNG hiện, tạo được phiếu.
- [ ] `display` KHÔNG thấy nav mới (vẫn bị đẩy về `/board`).
- [ ] Login `operator` A: list PR chỉ trả phiếu A tạo (kể cả khi gọi API với `?requestedBy=<user khác>` — server override).
- [ ] Operator A gọi `GET /api/purchase-requests/<id-của-B>` và cả 2 export → **404** (không phải 403, không lộ tồn tại).
- [ ] admin/planner/purchaser (+accountant sau Phase 4) vẫn thấy toàn bộ phiếu; warehouse giữ nguyên thấy tất cả.

### DoD-2 (notify admin)
- [ ] Operator tạo phiếu → MỌI user role admin (trừ actor, chỉ user active) có notification direct mới: badge chuông +1, title chứa paperFormNo, click → mở trang chi tiết phiếu.
- [ ] Broadcast purchaser vẫn hoạt động như cũ (purchaser thấy trong list notifications).
- [ ] Notification fail (DB lỗi) KHÔNG làm fail request tạo phiếu (fire-and-forget, log warn).

### DoD-3 (quick-approve)
- [ ] Admin mở phiếu SUBMITTED → thấy nút "Duyệt nhanh (Admin)" cạnh nút duyệt từng cấp; planner/purchaser KHÔNG thấy nút.
- [ ] Bấm duyệt nhanh → 1 request → phiếu sang `DIRECTOR_APPROVED` + status `APPROVED`; mục III hiện tên admin ở CẢ 2 ô ký kèm timestamp; timeline IV "Đã duyệt đề xuất" có dữ liệu; nút "Tạo PO" xuất hiện.
- [ ] `POST quick-approve` bởi non-admin → 403; phiếu ở step khác SUBMITTED → 409; race (dept-approve trước) → 409 CONFLICT.
- [ ] `POST /api/purchase-requests/[id]/approve` → **410 GONE**.
- [ ] Audit log có 1 record APPROVE ghi rõ "Duyệt nhanh 2 cấp (admin)".

### DoD-4 (accountant + notify file)
- [ ] Migration 0050 apply OK; `pg_enum` có `accountant`; `app.role` có row.
- [ ] Acc `ketoan` login được, chỉ thấy nav "Tổng quan" + "Đề xuất vật tư"; vào PR list thấy TẤT CẢ phiếu; KHÔNG có nút duyệt/từ chối/tạo PO trên chi tiết.
- [ ] Sau director-approve HOẶC quick-approve → `ketoan` badge +1, notification "Phiếu {paperFormNo} đã duyệt — tải PDF/Excel", click → trang chi tiết → bấm 2 nút tải: PDF + Excel đều tải về thành công (HTTP 200, file mở được).
- [ ] Admin `/admin/users` hiển thị + gán được role "Bộ phận Kế toán" (badge màu riêng, không crash `Record<Role>`).
- [ ] `pnpm -F @iot/shared test` pass (bao gồm case stale dòng 91 đã sửa).

---

## 8. Test plan

### 8.1 Local (trước push — bắt buộc)
1. `pnpm typecheck` (hoặc `pnpm -F web typecheck`) → 0 lỗi. Chú ý các `Record<Role,...>` exhaustive (rlsContext, 2 trang admin users) — thiếu key accountant sẽ fail typecheck NGAY, đây là lưới an toàn chính.
2. `pnpm -F @iot/shared test` → vitest can.test.ts pass (8 roles, case mới + case stale đã sửa).
3. `pnpm build` PASS (nguyên tắc 3 CLAUDE.md — CI không được fail).

### 8.2 Smoke E2E trên VPS sau deploy (theo nguyên tắc 5 CLAUDE.md — login thật, không chỉ /api/health)
Kịch bản chuỗi (dùng curl giữ cookie hoặc browser 4 tab ẩn danh):
1. **Tạo:** login `bo.phan.van.hanh` (operator) → tạo phiếu MRF 1 dòng free-text → 201, phiếu SUBMITTED, có paperFormNo.
2. **Badge admin:** login `admin` → chuông +1, notification "Phiếu YCVT mới chờ duyệt: {paperFormNo}" → click vào trang chi tiết.
3. **Duyệt nhanh:** admin bấm "Duyệt nhanh (Admin)" → toast OK, pill "Đã duyệt", mục III đủ 2 chữ ký admin.
4. **Kế toán:** login `ketoan` → chuông +1 → mở notification → trang chi tiết → tải PDF (mở được file, đủ 2 chữ ký) + tải Excel (mở được, đúng template YCVT).
5. **Ownership:** login operator B (tạo tạm nếu chưa có) → list KHÔNG thấy phiếu của A; `curl GET /api/purchase-requests/<id-A>` với cookie B → 404; export-pdf → 404. Login lại A → thấy + xem được phiếu mình.
6. **Legacy:** `curl -X POST .../api/purchase-requests/<id>/approve` (cookie admin) → 410.
7. **Regression duyệt từng cấp:** tạo phiếu thứ 2 → planner dept-approve → purchaser director-approve → `ketoan` vẫn nhận notification (call-site director-approve).
8. **Display regression:** login acc display → vẫn bị đẩy `/board`, không thấy nav mới.

### 8.3 Edge cases
- Phiếu cũ `requestedBy NULL` → operator/qc không thấy (đúng); admin vẫn thấy.
- User vừa admin vừa purchaser → nhận 2 notification cho 1 lần submit (1 direct + 1 broadcast) — chấp nhận, đã ghi ở Phase 2.
- 0 user accountant active → `emitToUsersWithRole` no-op không lỗi.
- Quick-approve trên phiếu REJECTED/DEPT_APPROVED → 409 kèm message tiếng Việt rõ bước hiện tại.

---

## 9. Rủi ro & giảm thiểu

| # | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| R1 | Deploy code TRƯỚC khi apply 0050 → login user gán accountant cast enum fail | Cao | Quy trình mục 6: migration bước 2, deploy bước 3. Enum mới vô hại với code cũ nên apply sớm luôn an toàn. |
| R2 | Quên thêm qc/accountant vào `ROUTE_ROLE_GUARD` (layout.tsx:31,36) → nav hiện nhưng click bị đá `/?denied=1` | Cao | DoD-1/DoD-4 có bước click-through thật từng role; guard + nav sửa trong CÙNG commit. |
| R3 | Ownership guard sót route export-excel (chỉ sửa detail + pdf) → operator xem lén qua Excel | Trung | Bảng file #9-11 liệt kê đủ 3 route; test 8.2-5 gọi thẳng export bằng cookie operator B. |
| R4 | `can.test.ts` fail CI vì case stale dòng 91 (bug có sẵn, lộ ra khi đụng file test) | Trung | Đã đưa vào Bước 4.2 — sửa cùng lúc, chạy vitest local trước push. |
| R5 | Race quick-approve vs dept-approve đồng thời → double-approve | Thấp | 1 UPDATE atomic `WHERE approval_step='SUBMITTED'` — kẻ thua nhận null → 409. Không cần lock/transaction. |
| R6 | Fan-out N admin/accountant chậm request tạo phiếu | Thấp | Call-site đã `void` fire-and-forget (pattern có sẵn dòng 122 route.ts); helper nuốt lỗi + log warn. Xưởng ~vài user/role. |
| R7 | Thứ tự `ROLES`/matrix keys lệch → test `Object.keys` fail | Thấp | Quy ước: `accountant` đặt CUỐI ở types.ts + enum + matrix + test expected — khớp nhau. |
| R8 | Xoá `approvePR`/`useApprovePurchaseRequest` sót caller | Thấp | Đã grep verify 2026-07-12: hook không ai import; repo chỉ route legacy gọi. Typecheck bắt nốt nếu sót. |
| R9 | PDF quick-approve: 2 ô ký cùng tên admin gây thắc mắc | Chấp nhận | QĐ-2 user đã chốt. Note dialog đã cảnh báo trước khi bấm. |

---

## 10. Ước lượng

| Phase | Việc | Effort |
|---|---|---|
| 1 | RBAC + nav + guard + ownership 4 route | **M** (~0.5 ngày) |
| 2 | Helper fan-out + notify admin | **S** (~1-2h) |
| 3 | Quick-approve (repo + route + 410 + UI) | **M** (~0.5 ngày) |
| 4 | Role accountant (13 điểm chạm) + notify + seed | **M** (~0.5 ngày) |
| — | Test E2E VPS + fix lặt vặt | S-M (~2-3h) |

**Tổng: ~1.5-2 ngày dev.** Khuyến nghị 1 PR duy nhất (V3.9) vì Phase 1 tham chiếu type `accountant` của Phase 4.

---

## 11. Ghi chú codexdo.md

Theo CLAUDE.md, trước khi execute:
- Search `codexdo.md` keyword "đề xuất vật tư" / "purchase request" / "accountant" — nếu có task TODO/IN_PROGRESS tương tự thì comment vào task cũ.
- Tạo `TASK-20260712-001` section "🚀 Tasks": DoD = mục 7 plan này, Ưu tiên P1, Phụ thuộc: none, link file plan.
- Khi execute: `TODO → IN_PROGRESS` + timestamp `(+07)`; khi xong: `DONE` + commit hash + kết quả build/test + log smoke E2E.
- Sau merge: cập nhật `PROGRESS.md` (milestone V3.9) + đổi version hiển thị nếu có chỗ hardcode.
