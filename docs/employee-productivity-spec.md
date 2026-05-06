# Employee Productivity Tracking — Spec

**Version**: V2 (user-approved) · 2026-05-06
**Status**: ✅ Approved — implementing Phase 1
**Author**: Engineering team
**Targets release**: V3.8.x

## ✅ User decisions (2026-05-06)

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Quyền xem report | **Chỉ admin** (V1) — không cấp manager/trưởng bộ phận |
| 2 | Operator metrics | **Cả 2** — `production_qty_good` (sản lượng) + `wo_completed` (số lệnh) |
| 3 | Compare 2-3 user | **Phase 1** (làm cùng Phase 1) |
| 4 | KPI/Target | **Bổ sung sau** — admin có thể chỉnh sửa được (cần bảng `report_target` Phase 2/3) |
| 5 | Self-view `/me/productivity` | **V2** (không làm V1) |
| 6 | Export | **Excel only** (không làm PDF V1) |

→ V1 simplified: chỉ admin, không self-view, không KPI baseline. Compare mode + Excel export trong Phase 1.

---

## 1. Mục tiêu

### Goals

Cho phép **admin / manager** theo dõi năng suất của từng nhân viên theo tháng (mặc định) hoặc khoảng thời gian tùy chọn, để:

1. Đánh giá hiệu suất cá nhân cuối tháng / cuối quý
2. Phát hiện nhân viên overload / underused
3. Tính bonus / KPI khi cần (manual offline trong V1)
4. So sánh nhân viên cùng bộ phận
5. Audit "ai làm cái gì khi nào" — truy vết khi có sự cố

### Non-goals (V1)

- ❌ Time tracking (clock in/out)
- ❌ Tích hợp HRM / payroll
- ❌ Auto-calculate bonus
- ❌ Goal/target setting (KPI cứng) — sẽ làm Phase 3
- ❌ Email/notification report tự động
- ❌ Real-time dashboard (refresh on-demand là đủ)

---

## 2. User personas + use cases

### Persona A — Admin / Giám đốc

> "Tháng vừa rồi `THIETKE-DUC` làm gì?"

- Truy cập `/admin/reports/employee-productivity`
- Chọn user `THIETKE-DUC` + tháng `2026-05`
- Thấy: 12 BOM tạo, 8 revisions release, 24 PR duyệt, 1240 sản lượng (đếm WO completed quy về units), 28 lượt login.
- Export Excel để gửi cho ban giám đốc.

### Persona B — Trưởng bộ phận

> "Tổng quan bộ phận Gia công tháng này — ai làm nhiều nhất?"

- Truy cập `/admin/reports/department?dept=operator&month=2026-05`
- Leaderboard: top 5 operator theo `sản lượng` hoặc `số WO complete`
- Click vào user → mở chi tiết Persona A view.

### Persona C — Nhân viên thường

> "Tháng này tôi đã làm những gì?"

- (V1) **Không có** trang riêng — chỉ admin/manager xem.
- (V2) Trang `/me/productivity` hiển thị metrics của chính họ (read self).

---

## 3. Metrics Catalog

Mỗi metric có:
- **id**: kebab-case unique
- **label_vi**: hiển thị UI
- **applicable_roles**: role nào quan tâm metric này
- **source**: table + column tracking
- **formula**: SQL aggregate
- **type**: `count` (số sự kiện) / `sum` (cộng dồn qty/value) / `duration`

### 3.1. Designer (planner)

| ID | Label | Source | Formula | Type |
|---|---|---|---|---|
| `bom_created` | BOM tạo mới | `bom_template.created_by` | COUNT WHERE created_at IN range | count |
| `bom_revisions_released` | Revisions release | `bom_revision` released_by + status RELEASED | COUNT | count |
| `wo_requested` | Yêu cầu sản xuất gửi | `work_order.created_by` WHERE status=DRAFT | COUNT | count |
| `pr_approved_by_planner` | PR planner duyệt | `purchase_request.approved_by` | COUNT | count |

### 3.2. Operator (Gia công)

| ID | Label | Source | Formula | Type |
|---|---|---|---|---|
| `wo_created` | Lệnh SX tạo | `work_order.created_by` | COUNT | count |
| `wo_completed` | WO hoàn thành | `work_order` status=COMPLETED + `completedAt` (cần track who completed — TBD) | COUNT | count |
| `production_qty_good` | Sản lượng đạt | `work_order_progress.reported_by` SUM(good_qty) | sum |
| `production_qty_scrap` | Phế phẩm | SUM(scrap_qty) cùng nguồn | sum |
| `progress_reports` | Báo cáo tiến độ | `work_order_progress` COUNT | count |
| `mrf_created_by_op` | MRF mua phôi tạo | `purchase_request.requested_by` WHERE source=MANUAL + creator role=operator | count |

### 3.3. Warehouse (Kho)

| ID | Label | Source | Formula | Type |
|---|---|---|---|---|
| `inv_adjustments_plus` | Bổ sung tồn (+) | `inventory_txn.posted_by` WHERE tx_type='ADJUST_PLUS' | count + sum(qty) |
| `inv_adjustments_minus` | Giảm tồn (−) | tx_type='ADJUST_MINUS' | count + sum(qty) |
| `receivings` | Nhận hàng (PO) | `inbound_receipt.received_by` | count |
| `qc_checks` | QC kiểm | `inbound_receipt.qc_checked_by` | count |
| `issues_picked` | Xuất kho | `material_request.picked_by` | count |
| `issue_requests_approved` | Duyệt yêu cầu xuất | `warehouse_issue_request.approved_by` | count |
| `putaways` | Putaway lots | `warehouse_putaway.putaway_by` | count |
| `mrf_created_by_kho` | MRF Kho tạo | tương tự operator nhưng creator role=warehouse | count |

### 3.4. Purchaser (Thu mua)

| ID | Label | Source | Formula | Type |
|---|---|---|---|---|
| `pr_approved` | PR duyệt | `purchase_request.approved_by` | count |
| `pr_rejected` | PR từ chối | `audit_event` action=REJECT, object=purchase_request | count |
| `po_created` | PO tạo | `purchase_order.created_by` | count |
| `po_value_total` | Tổng giá trị PO (VND) | SUM(total_amount) | sum |
| `suppliers_added` | NCC mới tạo | `supplier.created_by` (cần verify cột) | count |

### 3.5. Common (mọi role)

| ID | Label | Source | Formula | Type |
|---|---|---|---|---|
| `logins` | Lượt đăng nhập | `session` WHERE issued_at IN range | count |
| `active_days` | Ngày hoạt động | DISTINCT date(session.issued_at) | count |
| `audit_actions_total` | Tổng action audit | `audit_event.actor_user_id` | count |
| `last_seen` | Lần online cuối | MAX(session.issued_at) | timestamp |

---

## 4. API Design

### 4.1. `GET /api/reports/employee/[userId]`

**Query params**:
- `from` (ISO date, default = đầu tháng hiện tại theo VN time)
- `to` (ISO date, default = ngày hiện tại)
- `metrics` (CSV optional, default = all relevant metrics theo role)

**Response**:
```ts
{
  data: {
    user: {
      id: string;
      username: string;
      fullName: string;
      email: string | null;
      roles: Role[];
    };
    period: {
      from: string;        // "2026-05-01T00:00:00+07"
      to: string;          // "2026-05-31T23:59:59+07"
      label: string;       // "Tháng 5/2026"
      activeDays: number;  // 21
    };
    summary: {
      totalActions: number;          // tất cả mọi action
      lastSeen: string | null;
      productionQty: number | null;  // null nếu user không phải operator
      poValue: number | null;        // null nếu không phải purchaser
    };
    metrics: Array<{
      id: string;
      label: string;
      count: number;
      value: number | null;     // dùng cho metrics type=sum
      unit: string | null;      // "VND", "PCS", "phút", ...
      delta: number | null;     // chênh lệch so với tháng trước (% hoặc abs)
    }>;
    chart_daily: Array<{
      date: string;             // "2026-05-01"
      actions: number;
    }>;
    /** Top 10 audit events trong period — drill-down chi tiết */
    recent_actions: Array<{
      timestamp: string;
      action: string;           // "CREATE", "UPDATE", "APPROVE", ...
      objectType: string;       // "work_order", "purchase_request"
      objectId: string;
      objectCode: string | null; // "WO-2605-0001"
      notes: string | null;
    }>;
  };
}
```

**Error cases**:
- 404 user not found
- 403 caller không phải admin / manager
- 400 invalid date range / range > 1 năm

**Performance budget**: < 800ms p95 với DB hiện tại (~1000 events/tháng/user).

### 4.2. `GET /api/reports/department`

**Query params**:
- `role` (operator/warehouse/planner/purchaser, required)
- `from`, `to`
- `sortBy` (metric_id, default = activeDays)
- `limit` (default 20)

**Response**:
```ts
{
  data: {
    department: {
      role: Role;
      label: string;       // "Bộ phận Gia công"
      memberCount: number;
    };
    period: { from, to, label };
    leaderboard: Array<{
      user: { id, username, fullName };
      keyMetrics: {        // 3-4 metric chính của role
        [metricId: string]: number;
      };
      rank: number;
    }>;
  };
}
```

### 4.3. `GET /api/reports/employee/[userId]/export`

- Query giống endpoint detail
- Response: file `.xlsx` (Content-Disposition attachment)
- Sheet 1: Summary
- Sheet 2: Daily breakdown
- Sheet 3: Recent actions log

---

## 5. UI Design

### 5.1. Page `/admin/reports/employee-productivity`

```
┌──────────────────────────────────────────────────────────────────────┐
│ Báo cáo năng suất nhân viên                          [Export Excel]  │
├──────────────────────────────────────────────────────────────────────┤
│ Filter: [Chọn user ▾]  [Tháng 5/2026 ▾]  [So sánh ⚊]                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────── HERO SUMMARY ────────────────────────────────────────┐    │
│  │ 👤 Tiến — Bộ phận Gia công                                   │    │
│  │ Tháng 5/2026 · 21 ngày hoạt động · 142 actions               │    │
│  │ Lần online cuối: 06/05/2026 15:30                            │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌─ KPI CARDS (grid 3-4 cột theo role) ────────────────────────┐    │
│  │ [Lệnh SX tạo: 8]    [WO hoàn thành: 6]   [Sản lượng: 1240]  │    │
│  │ [Báo cáo tiến độ: 24] [MRF tạo: 3]       [Login: 28]        │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌─ CHART: Hoạt động theo ngày ────────────────────────────────┐    │
│  │  ▁▂▃▅▇▆▄▃▁▁▁▅▆▇▆▄▃▂▂▃▄▅▆▇▇▆▅▄▃▂   (31 cột bar)            │    │
│  │  01  05   10   15   20   25   30                           │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌─ TIMELINE: 10 actions gần nhất ─────────────────────────────┐    │
│  │ 06/05 15:30 · COMPLETE WO-2605-0008 · "Hoàn thành 200 pcs"   │    │
│  │ 06/05 14:15 · CREATE WO-2605-0010 · ...                      │    │
│  │ ...                                                           │    │
│  │ [Xem tất cả →]                                                │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2. Compare mode (modal)

Click "So sánh" → mở modal:
- Pick 2-3 user cùng bộ phận
- Side-by-side cards với metrics chính
- Bar chart so sánh

### 5.3. Page `/admin/reports/department`

```
┌──────────────────────────────────────────────────────────────────┐
│ Báo cáo bộ phận                                   [Export Excel]  │
├──────────────────────────────────────────────────────────────────┤
│ Filter: [Bộ phận: Gia công ▾] [Tháng 5/2026 ▾] [Sort: Sản lượng]│
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Bộ phận Gia công · 8 nhân viên · Tổng sản lượng tháng: 12,450    │
│                                                                   │
│ #1 🥇 Tiến      · 1240 pcs · 8 WO · 24 reports     [→ chi tiết]  │
│ #2 🥈 Cường     ·  980 pcs · 6 WO · 18 reports     [→ chi tiết]  │
│ #3 🥉 Long      ·  720 pcs · 5 WO · 16 reports     [→ chi tiết]  │
│ ...                                                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. RBAC

Thêm entity mới trong `packages/shared/src/rbac/matrix.ts`:

```ts
export type RbacEntity =
  | "..."
  | "report";  // V3.8 — productivity reports
```

Permissions:
| Role | report.read_all | report.read_self |
|---|---|---|
| admin | ✅ | ✅ |
| planner | ❌ (V1) — V2 nếu user yêu cầu | ✅ |
| operator | ❌ | ✅ |
| warehouse | ❌ | ✅ |
| purchaser | ❌ | ✅ |

V1: chỉ admin xem được report của tất cả users. V2 cân nhắc: trưởng bộ phận xem được nhân viên trong cùng dept.

---

## 7. Database Queries (sample)

### 7.1. Đếm WO created trong tháng

```sql
SELECT COUNT(*) AS wo_created
FROM app.work_order
WHERE created_by = $1
  AND created_at >= $2  -- '2026-05-01 00:00+07'
  AND created_at <  $3; -- '2026-06-01 00:00+07'
```

### 7.2. Tổng sản lượng good từ progress reports

```sql
SELECT
  COALESCE(SUM(good_qty), 0)  AS total_good,
  COALESCE(SUM(scrap_qty), 0) AS total_scrap,
  COUNT(*) AS report_count
FROM app.work_order_progress
WHERE reported_by = $1
  AND reported_at >= $2 AND reported_at < $3;
```

### 7.3. Login count + active days

```sql
SELECT
  COUNT(*) AS login_count,
  COUNT(DISTINCT date_trunc('day', issued_at AT TIME ZONE 'Asia/Ho_Chi_Minh')) AS active_days,
  MAX(issued_at) AS last_login
FROM app.session
WHERE user_id = $1
  AND issued_at >= $2 AND issued_at < $3;
```

### 7.4. Daily activity (chart_daily)

```sql
WITH daily AS (
  SELECT
    date_trunc('day', occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d,
    COUNT(*) AS n
  FROM app.audit_event
  WHERE actor_user_id = $1
    AND occurred_at >= $2 AND occurred_at < $3
  GROUP BY 1
),
days AS (
  SELECT generate_series($2::date, ($3::date - 1), '1 day'::interval)::date AS d
)
SELECT days.d, COALESCE(daily.n, 0) AS actions
FROM days LEFT JOIN daily USING (d)
ORDER BY days.d;
```

### 7.5. Top recent actions

```sql
SELECT
  occurred_at, action, object_type, object_id, notes,
  -- Resolve object code via subquery (nếu cần)
  CASE object_type
    WHEN 'work_order' THEN (SELECT wo_no FROM app.work_order WHERE id = object_id)
    WHEN 'purchase_request' THEN (SELECT code FROM app.purchase_request WHERE id = object_id)
    ELSE NULL
  END AS object_code
FROM app.audit_event
WHERE actor_user_id = $1
  AND occurred_at >= $2 AND occurred_at < $3
ORDER BY occurred_at DESC
LIMIT 10;
```

---

## 8. Edge Cases & Considerations

### 8.1. Time zone

DB lưu `timestamptz` (UTC). UI/Report **bắt buộc convert sang `Asia/Ho_Chi_Minh`** để tháng đúng theo nghiệp vụ:
- "Tháng 5/2026" = `2026-05-01 00:00+07` đến `2026-06-01 00:00+07`
- Không được dùng UTC raw → tháng có thể lệch 7h.

### 8.2. Audit log integrity

Một số API mutation chưa gọi `writeAudit()` (cần verify). Nếu metric chỉ rely vào `audit_event` → có thể missing. **Mitigation**:
- Phase 1: ưu tiên column `*_by` trực tiếp (luôn populated), audit_event chỉ dùng cho timeline + actions chung.
- Phase 1.5: audit toàn bộ mutations chưa writeAudit → patch thêm.

### 8.3. Performance

DB hiện < 1000 records/bảng → query ad-hoc OK (< 200ms).

Khi scale (>100k records/tháng):
- Index check: `audit_event(actor_user_id, occurred_at)` — verify có chưa
- Cache 1h Redis cho `/api/reports/employee/[userId]` (key = userId+month)
- Materialized view `mv_user_monthly_summary` refresh hourly cron

### 8.4. User left company

Khi user bị deactivate (`is_active = false`):
- Vẫn hiển thị trong báo cáo lịch sử
- Filter "active users only" trong dropdown chọn user (default)
- Có toggle "Bao gồm user đã nghỉ" cho admin xem audit cũ

### 8.5. Data retention

- `audit_event`: giữ ≥ 2 năm (compliance)
- `session`: giữ 1 năm rồi delete
- Cron retention sẽ làm trong Phase Database (đã đề xuất ở plan trước)

### 8.6. Privacy & access control

- Report của 1 user chỉ admin xem được (V1)
- Khi V2 cho self-view: `userId === session.userId` → check trước query
- Log mỗi lần ai xem report ai (audit_event action=READ_REPORT) — compliance

---

## 9. Phased rollout

### Phase 1.1 — Foundation (1.5h)
- Add RBAC entity `report`
- Repo function `getEmployeeProductivity(userId, from, to)` aggregate query
- API `/api/reports/employee/[userId]`
- Test với admin login → verify JSON response 200

### Phase 1.2 — UI page (2h)
- Page `/admin/reports/employee-productivity`
- Filter + Hero card + KPI cards + chart bar (recharts hoặc chart đơn giản SVG)
- Timeline 10 recent actions
- Loading + empty states

### Phase 1.3 — Department leaderboard (1.5h)
- API `/api/reports/department`
- Page `/admin/reports/department`
- Card list với rank #1-3 highlight

### Phase 1.4 — Excel export (1h)
- API `/api/reports/employee/[userId]/export`
- Server-side dùng `exceljs` (đã có deps)
- 3 sheets: Summary / Daily / Actions

### Phase 1.5 — Audit gap fix (1h)
- Run audit script: list mutations chưa có writeAudit
- Patch missing ones

**Tổng effort Phase 1**: ~7 giờ work, 3-5 commits.

### Phase 2 (sau khi Phase 1 prod stable ≥ 2 tuần)

- Self-view `/me/productivity` (read_self)
- Compare mode (multi-user side-by-side)
- Quarter / year period selector
- Trend chart 6 tháng gần nhất

### Phase 3 (mở rộng)

- KPI targets per role
- Email monthly report tự động
- Materialized view nếu data lớn
- Integration HRM (export bonus calc)

---

## 10. Acceptance Criteria

Phase 1 done khi:

- [ ] Admin login `/admin/reports/employee-productivity` → chọn user + tháng → render đúng metrics
- [ ] Mọi role có ít nhất 4 metrics có data thật (không null)
- [ ] Chart daily 31 cột render đúng số (tháng 30/31/28 ngày)
- [ ] Timezone Asia/Ho_Chi_Minh chính xác — test edge case ngày 1 tháng (UTC vs VN)
- [ ] Non-admin truy cập → 403
- [ ] Department leaderboard sort đúng theo metric chọn
- [ ] Export Excel mở được trên Excel + LibreOffice
- [ ] Performance: API < 800ms p95 (DB hiện tại)
- [ ] Test E2E với 6 user thật của bạn (GIACONG/THIETKE/KHO/THUMUA)

---

## 11. Câu hỏi mở cần bạn quyết định

1. **Quyền xem report**: V1 chỉ admin. Bạn có muốn **trưởng bộ phận** cũng xem được nhân viên trong cùng dept không? (Cần định nghĩa "trưởng bộ phận" — thêm role `manager` hay tag user `is_manager` của department?)

2. **Metric cụ thể**: list ở section 3 có miss/dư cái nào không? Đặc biệt:
   - Operator: bạn quan tâm `production_qty_good` (tổng pcs) hay `wo_completed` (số lệnh)?
   - Warehouse: có cần track riêng `qty_adjusted_in` vs số lần adjust không?
   - Có metric nào ngoài list bạn nghĩ ra không?

3. **Compare mode**: Phase 1 hay 2? (V1 chỉ xem 1 user; V2 mới so sánh.)

4. **KPI/Target**: Phase 3. Bạn có ý tưởng gì về target chuẩn cho từng role chưa? (vd "Operator: ≥ 5 WO complete/tháng")

5. **Privacy**: Có muốn user thường xem được report của chính họ không (V2)? Hay 100% chỉ admin?

6. **Export**: Excel đủ chưa hay cần thêm PDF?

---

## 12. Phụ thuộc

- Không cần migration DB mới (tất cả column tracking đã có)
- Cần verify `audit_event` được populate đầy đủ — có thể patch thêm nếu thiếu
- Frontend chart: dùng lib có sẵn nếu có (recharts?), hoặc SVG đơn giản tự build
- Excel export: package `exceljs` (cần check deps)

---

**Spec end. Reply để tôi:**
- Trả lời câu hỏi mở (section 11)
- Approve → tôi bắt tay Phase 1.1
- Hoặc đề nghị chỉnh sửa spec
