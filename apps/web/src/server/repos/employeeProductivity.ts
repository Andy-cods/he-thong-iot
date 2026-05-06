import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * V3.7.61 — Employee Productivity Report repo.
 *
 * Spec: docs/employee-productivity-spec.md
 *
 * Strategy: leverage 30+ cột `*_by` đã có trên các bảng business
 * (created_by, requested_by, approved_by, posted_by, picked_by, ...).
 * Audit_event làm fallback cho timeline + actions chung.
 *
 * Timezone: tất cả query convert sang Asia/Ho_Chi_Minh để tháng đúng VN time.
 * Range gọi từ API là `from`/`to` đã ở UTC nhưng đại diện cho biên VN tz.
 */

export interface EmployeeProductivityInput {
  userId: string;
  from: Date; // inclusive lower bound (UTC representation of VN tz boundary)
  to: Date; // exclusive upper bound
}

export interface ProductivityMetric {
  id: string;
  label: string;
  count: number;
  value: number | null;
  unit: string | null;
}

export interface ProductivityReport {
  user: {
    id: string;
    username: string;
    fullName: string;
    email: string | null;
    isActive: boolean;
    roles: string[];
  };
  period: {
    from: string;
    to: string;
    label: string;
    activeDays: number;
  };
  summary: {
    totalActions: number;
    lastSeen: string | null;
    productionQty: number | null;
    poValue: number | null;
  };
  metrics: ProductivityMetric[];
  chartDaily: Array<{ date: string; actions: number }>;
  recentActions: Array<{
    timestamp: string;
    action: string;
    objectType: string | null;
    objectId: string | null;
    objectCode: string | null;
    notes: string | null;
  }>;
}

/**
 * Aggregate productivity metrics cho 1 user trong khoảng time.
 * Trả về tất cả metrics applicable theo role + common metrics.
 */
export async function getEmployeeProductivity(
  input: EmployeeProductivityInput,
): Promise<ProductivityReport | null> {
  const { userId, from, to } = input;

  // 1. Verify user + load roles
  const userRows = (await db.execute(sql`
    SELECT
      u.id::text, u.username, u.full_name, u.email, u.is_active,
      COALESCE(
        ARRAY_AGG(DISTINCT r.code::text) FILTER (WHERE r.code IS NOT NULL),
        ARRAY[]::text[]
      ) AS roles
    FROM app.user_account u
    LEFT JOIN app.user_role ur ON ur.user_id = u.id
    LEFT JOIN app.role r ON r.id = ur.role_id
    WHERE u.id = ${userId}
    GROUP BY u.id, u.username, u.full_name, u.email, u.is_active
  `)) as unknown as Array<{
    id: string;
    username: string;
    full_name: string;
    email: string | null;
    is_active: boolean;
    roles: string[];
  }>;
  const user = userRows[0];
  if (!user) return null;

  // 2. Aggregate query — single round-trip với CTEs
  const aggRows = (await db.execute(sql`
    WITH params AS (
      SELECT ${userId}::uuid AS uid, ${from.toISOString()}::timestamptz AS p_from, ${to.toISOString()}::timestamptz AS p_to
    ),
    -- Designer
    bom_created AS (
      SELECT COUNT(*)::int AS n FROM app.bom_template, params
      WHERE created_by = uid AND created_at >= p_from AND created_at < p_to
    ),
    bom_revisions AS (
      SELECT COUNT(*)::int AS n FROM app.bom_revision, params
      WHERE released_by = uid AND released_at >= p_from AND released_at < p_to
    ),
    -- Operator + Designer
    wo_created AS (
      SELECT COUNT(*)::int AS n FROM app.work_order, params
      WHERE created_by = uid AND created_at >= p_from AND created_at < p_to
    ),
    wo_completed AS (
      SELECT COUNT(*)::int AS n FROM app.work_order, params
      WHERE created_by = uid AND status = 'COMPLETED'
        AND completed_at IS NOT NULL
        AND completed_at >= p_from AND completed_at < p_to
    ),
    wo_progress AS (
      SELECT
        COUNT(*)::int AS n,
        COALESCE(SUM(good_qty), 0)::numeric AS sum_good,
        COALESCE(SUM(scrap_qty), 0)::numeric AS sum_scrap
      FROM app.work_order_progress, params
      WHERE reported_by = uid AND reported_at >= p_from AND reported_at < p_to
    ),
    -- PR / PO (Designer + Purchaser + Operator/Warehouse for MRF)
    pr_created AS (
      SELECT COUNT(*)::int AS n FROM app.purchase_request, params
      WHERE requested_by = uid AND created_at >= p_from AND created_at < p_to
    ),
    pr_approved AS (
      SELECT COUNT(*)::int AS n FROM app.purchase_request, params
      WHERE approved_by = uid AND approved_at IS NOT NULL
        AND approved_at >= p_from AND approved_at < p_to
    ),
    po_created AS (
      SELECT
        COUNT(*)::int AS n,
        COALESCE(SUM(total_amount), 0)::numeric AS sum_value
      FROM app.purchase_order, params
      WHERE created_by = uid AND created_at >= p_from AND created_at < p_to
    ),
    -- Warehouse
    inv_plus AS (
      SELECT COUNT(*)::int AS n, COALESCE(SUM(qty), 0)::numeric AS sum_qty
      FROM app.inventory_txn, params
      WHERE posted_by = uid AND tx_type = 'ADJUST_PLUS'
        AND occurred_at >= p_from AND occurred_at < p_to
    ),
    inv_minus AS (
      SELECT COUNT(*)::int AS n, COALESCE(SUM(qty), 0)::numeric AS sum_qty
      FROM app.inventory_txn, params
      WHERE posted_by = uid AND tx_type = 'ADJUST_MINUS'
        AND occurred_at >= p_from AND occurred_at < p_to
    ),
    receivings AS (
      SELECT COUNT(*)::int AS n FROM app.inbound_receipt, params
      WHERE received_by = uid AND received_at >= p_from AND received_at < p_to
    ),
    qc_checks AS (
      SELECT COUNT(*)::int AS n FROM app.inbound_receipt, params
      WHERE qc_checked_by = uid AND qc_checked_at IS NOT NULL
        AND qc_checked_at >= p_from AND qc_checked_at < p_to
    ),
    putaways AS (
      SELECT COUNT(*)::int AS n FROM app.warehouse_putaway, params
      WHERE putaway_by = uid AND putaway_at >= p_from AND putaway_at < p_to
    ),
    issue_picked AS (
      SELECT COUNT(*)::int AS n FROM app.material_request, params
      WHERE picked_by = uid AND created_at >= p_from AND created_at < p_to
    ),
    -- Common
    sessions AS (
      SELECT
        COUNT(*)::int AS login_count,
        COUNT(DISTINCT date_trunc('day', issued_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS active_days,
        MAX(issued_at) AS last_login
      FROM app.session, params
      WHERE user_id = uid AND issued_at >= p_from AND issued_at < p_to
    ),
    audit_total AS (
      SELECT COUNT(*)::int AS n FROM app.audit_event, params
      WHERE actor_user_id = uid AND occurred_at >= p_from AND occurred_at < p_to
    )
    SELECT
      (SELECT n FROM bom_created)        AS bom_created,
      (SELECT n FROM bom_revisions)      AS bom_revisions,
      (SELECT n FROM wo_created)         AS wo_created,
      (SELECT n FROM wo_completed)       AS wo_completed,
      (SELECT n FROM wo_progress)        AS wo_progress_count,
      (SELECT sum_good FROM wo_progress) AS wo_good,
      (SELECT sum_scrap FROM wo_progress) AS wo_scrap,
      (SELECT n FROM pr_created)         AS pr_created,
      (SELECT n FROM pr_approved)        AS pr_approved,
      (SELECT n FROM po_created)         AS po_created,
      (SELECT sum_value FROM po_created) AS po_value,
      (SELECT n FROM inv_plus)           AS inv_plus_count,
      (SELECT sum_qty FROM inv_plus)     AS inv_plus_qty,
      (SELECT n FROM inv_minus)          AS inv_minus_count,
      (SELECT sum_qty FROM inv_minus)    AS inv_minus_qty,
      (SELECT n FROM receivings)         AS receivings,
      (SELECT n FROM qc_checks)          AS qc_checks,
      (SELECT n FROM putaways)           AS putaways,
      (SELECT n FROM issue_picked)       AS issue_picked,
      (SELECT login_count FROM sessions) AS login_count,
      (SELECT active_days FROM sessions) AS active_days,
      (SELECT last_login FROM sessions)  AS last_login,
      (SELECT n FROM audit_total)        AS audit_total
  `)) as unknown as Array<Record<string, number | string | null>>;
  const agg = aggRows[0] ?? {};

  // Helper get number
  const num = (k: string): number => Number(agg[k] ?? 0) || 0;

  // 3. Daily activity chart (audit-based, fallback to all metrics aggregate)
  const dailyRows = (await db.execute(sql`
    WITH params AS (
      SELECT ${userId}::uuid AS uid, ${from.toISOString()}::timestamptz AS p_from, ${to.toISOString()}::timestamptz AS p_to
    ),
    days AS (
      SELECT generate_series(
        date_trunc('day', (SELECT p_from FROM params) AT TIME ZONE 'Asia/Ho_Chi_Minh'),
        date_trunc('day', (SELECT p_to FROM params) AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '1 day',
        interval '1 day'
      )::date AS d
    ),
    daily AS (
      SELECT
        date_trunc('day', occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d,
        COUNT(*)::int AS n
      FROM app.audit_event, params
      WHERE actor_user_id = uid AND occurred_at >= p_from AND occurred_at < p_to
      GROUP BY 1
    )
    SELECT to_char(days.d, 'YYYY-MM-DD') AS d, COALESCE(daily.n, 0) AS n
    FROM days LEFT JOIN daily USING (d)
    ORDER BY days.d
  `)) as unknown as Array<{ d: string; n: number }>;

  // 4. Recent 10 audit actions
  const recentRows = (await db.execute(sql`
    SELECT
      to_char(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') AS ts,
      action::text AS action,
      object_type,
      object_id::text AS object_id,
      notes,
      CASE object_type
        WHEN 'work_order' THEN (SELECT wo_no FROM app.work_order WHERE id = object_id LIMIT 1)
        WHEN 'purchase_request' THEN (SELECT code FROM app.purchase_request WHERE id = object_id LIMIT 1)
        WHEN 'purchase_order' THEN (SELECT po_no FROM app.purchase_order WHERE id = object_id LIMIT 1)
        WHEN 'bom_template' THEN (SELECT code FROM app.bom_template WHERE id = object_id LIMIT 1)
        WHEN 'item' THEN (SELECT sku FROM app.item WHERE id = object_id LIMIT 1)
        WHEN 'supplier' THEN (SELECT code FROM app.supplier WHERE id = object_id LIMIT 1)
        WHEN 'location_bin' THEN (SELECT full_code FROM app.location_bin WHERE id = object_id LIMIT 1)
        ELSE NULL
      END AS object_code
    FROM app.audit_event
    WHERE actor_user_id = ${userId}
      AND occurred_at >= ${from.toISOString()}::timestamptz
      AND occurred_at <  ${to.toISOString()}::timestamptz
    ORDER BY occurred_at DESC
    LIMIT 10
  `)) as unknown as Array<{
    ts: string;
    action: string;
    object_type: string | null;
    object_id: string | null;
    object_code: string | null;
    notes: string | null;
  }>;

  // 5. Build metrics theo role
  const roles = user.roles ?? [];
  const isPlanner = roles.includes("planner");
  const isOperator = roles.includes("operator");
  const isWarehouse = roles.includes("warehouse");
  const isPurchaser = roles.includes("purchaser");
  const isAdmin = roles.includes("admin");

  const metrics: ProductivityMetric[] = [];

  // Designer (planner + admin)
  if (isPlanner || isAdmin) {
    metrics.push(
      { id: "bom_created", label: "BOM tạo mới", count: num("bom_created"), value: null, unit: null },
      { id: "bom_revisions_released", label: "Revision đã release", count: num("bom_revisions"), value: null, unit: null },
    );
  }

  // Operator (gia công) + Designer (cũng tạo WO)
  if (isOperator || isPlanner || isAdmin) {
    metrics.push(
      { id: "wo_created", label: "Lệnh SX tạo", count: num("wo_created"), value: null, unit: null },
      { id: "wo_completed", label: "WO hoàn thành", count: num("wo_completed"), value: null, unit: null },
      { id: "production_qty_good", label: "Sản lượng đạt", count: num("wo_progress_count"), value: num("wo_good"), unit: "PCS" },
      { id: "production_qty_scrap", label: "Phế phẩm", count: 0, value: num("wo_scrap"), unit: "PCS" },
      { id: "progress_reports", label: "Báo cáo tiến độ", count: num("wo_progress_count"), value: null, unit: null },
    );
  }

  // PR / MRF (operator + warehouse + admin tạo; purchaser duyệt)
  if (isOperator || isWarehouse || isPurchaser || isAdmin) {
    metrics.push(
      { id: "pr_created", label: "PR / MRF tạo", count: num("pr_created"), value: null, unit: null },
    );
  }
  if (isPurchaser || isAdmin) {
    metrics.push(
      { id: "pr_approved", label: "PR duyệt", count: num("pr_approved"), value: null, unit: null },
      { id: "po_created", label: "PO tạo", count: num("po_created"), value: null, unit: null },
      {
        id: "po_value",
        label: "Tổng giá trị PO",
        count: num("po_created"),
        value: num("po_value"),
        unit: "VND",
      },
    );
  }

  // Warehouse
  if (isWarehouse || isAdmin) {
    metrics.push(
      { id: "inv_plus", label: "Bổ sung tồn (+)", count: num("inv_plus_count"), value: num("inv_plus_qty"), unit: "qty" },
      { id: "inv_minus", label: "Giảm tồn (−)", count: num("inv_minus_count"), value: num("inv_minus_qty"), unit: "qty" },
      { id: "receivings", label: "Nhận hàng (PO)", count: num("receivings"), value: null, unit: null },
      { id: "qc_checks", label: "QC kiểm", count: num("qc_checks"), value: null, unit: null },
      { id: "putaways", label: "Putaway lots", count: num("putaways"), value: null, unit: null },
      { id: "issues_picked", label: "Xuất kho (picked)", count: num("issue_picked"), value: null, unit: null },
    );
  }

  // Common (mọi role)
  metrics.push(
    { id: "logins", label: "Lượt đăng nhập", count: num("login_count"), value: null, unit: null },
    { id: "audit_total", label: "Tổng action audit", count: num("audit_total"), value: null, unit: null },
  );

  return {
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      email: user.email,
      isActive: user.is_active,
      roles: user.roles ?? [],
    },
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
      label: formatPeriodLabel(from, to),
      activeDays: num("active_days"),
    },
    summary: {
      totalActions: num("audit_total"),
      lastSeen: agg.last_login ? String(agg.last_login) : null,
      productionQty: isOperator || isPlanner || isAdmin ? num("wo_good") : null,
      poValue: isPurchaser || isAdmin ? num("po_value") : null,
    },
    metrics,
    chartDaily: dailyRows.map((r) => ({ date: r.d, actions: Number(r.n) || 0 })),
    recentActions: recentRows.map((r) => ({
      timestamp: r.ts,
      action: r.action,
      objectType: r.object_type,
      objectId: r.object_id,
      objectCode: r.object_code,
      notes: r.notes,
    })),
  };
}

function formatPeriodLabel(from: Date, to: Date): string {
  // Convert sang VN time để label hiển thị đúng tháng nghiệp vụ.
  const VN_OFFSET_MS = 7 * 3600_000;
  const fromVn = new Date(from.getTime() + VN_OFFSET_MS);
  const toVnInclusive = new Date(to.getTime() + VN_OFFSET_MS - 1000);
  const fromYm = fromVn.toISOString().slice(0, 7);
  const toYm = toVnInclusive.toISOString().slice(0, 7);
  if (fromYm === toYm) {
    const [y, m] = fromYm.split("-");
    return `Tháng ${parseInt(m!, 10)}/${y}`;
  }
  return `${fromVn.toISOString().slice(0, 10)} → ${toVnInclusive.toISOString().slice(0, 10)}`;
}

/**
 * Department leaderboard — list users theo role + sort theo metric chính.
 */
export interface DepartmentReportInput {
  role: string;
  from: Date;
  to: Date;
  sortBy?: string;
  limit?: number;
}

export interface DepartmentLeaderboardRow {
  user: { id: string; username: string; fullName: string };
  rank: number;
  keyMetrics: Record<string, number>;
}

export async function getDepartmentLeaderboard(
  input: DepartmentReportInput,
): Promise<{
  department: { role: string; label: string; memberCount: number };
  period: { from: string; to: string; label: string };
  leaderboard: DepartmentLeaderboardRow[];
}> {
  const { role, from, to, limit = 20 } = input;

  // Lấy users của role
  const userRows = (await db.execute(sql`
    SELECT u.id::text, u.username, u.full_name AS full_name
    FROM app.user_account u
    JOIN app.user_role ur ON ur.user_id = u.id
    JOIN app.role r ON r.id = ur.role_id
    WHERE r.code::text = ${role}
      AND u.is_active = TRUE
    ORDER BY u.full_name
    LIMIT ${limit}
  `)) as unknown as Array<{ id: string; username: string; full_name: string }>;

  // Loop aggregate per user (acceptable cho 5-30 users; nếu >100 cần optimize)
  const rows: DepartmentLeaderboardRow[] = [];
  for (const u of userRows) {
    const rep = await getEmployeeProductivity({ userId: u.id, from, to });
    if (!rep) continue;
    const m: Record<string, number> = {};
    for (const k of rep.metrics) {
      m[k.id] = k.value ?? k.count;
    }
    rows.push({
      user: { id: u.id, username: u.username, fullName: u.full_name },
      rank: 0,
      keyMetrics: m,
    });
  }

  // Sort + assign rank
  const sortKey =
    input.sortBy ??
    (role === "operator"
      ? "production_qty_good"
      : role === "warehouse"
        ? "receivings"
        : role === "purchaser"
          ? "po_created"
          : role === "planner"
            ? "bom_revisions_released"
            : "audit_total");

  rows.sort((a, b) => (b.keyMetrics[sortKey] ?? 0) - (a.keyMetrics[sortKey] ?? 0));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const labels: Record<string, string> = {
    admin: "Quản trị",
    planner: "Bộ phận Thiết kế",
    operator: "Bộ phận Gia công",
    warehouse: "Bộ phận Kho",
    purchaser: "Bộ phận Thu mua",
  };

  return {
    department: {
      role,
      label: labels[role] ?? role,
      memberCount: userRows.length,
    },
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
      label: formatPeriodLabel(from, to),
    },
    leaderboard: rows,
  };
}
