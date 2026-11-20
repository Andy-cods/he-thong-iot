import { sql, type SQL } from "drizzle-orm";

/**
 * Đếm tham chiếu tới DÒNG / TEMPLATE của 1 BOM — dùng chung web (preview nhập
 * lại BOM, xoá vĩnh viễn) + worker (ghi đè trong transaction).
 *
 * Bảng có thể chưa tồn tại trên 1 số môi trường (order_bom_snapshot là bảng
 * drizzle-push đời đầu; bom_stage_move/delivery_slip từ 0085/0086) → kiểm
 * `to_regclass` trước, chỉ đếm bảng có thật. Tên bảng/cột là HẰNG trong file
 * này (không nhận input người dùng) nên `sql.raw` an toàn.
 */

export interface SqlExecutor {
  execute(query: SQL): Promise<unknown>;
}

export type BomRefKindDb =
  | "stage_move"
  | "delivery_slip"
  | "delivery_slip_line"
  | "eco"
  | "work_order"
  | "legacy_snapshot"
  | "sales_order"
  | "order_snapshot";

interface RefSpec {
  kind: BomRefKindDb;
  table: string;
  /** Mệnh đề FROM/WHERE sau `SELECT count(*)` — `$TPL` thay bằng templateId. */
  body: (tpl: SQL) => SQL;
}

/** Tham chiếu tới bom_line — chặn GHI ĐÈ (xoá dòng cũ). */
const LINE_REFS: RefSpec[] = [
  {
    kind: "stage_move",
    table: "app.bom_stage_move",
    body: (tpl) => sql`FROM app.bom_stage_move r JOIN app.bom_line l ON l.id = r.line_id WHERE l.template_id = ${tpl}`,
  },
  {
    kind: "delivery_slip_line",
    table: "app.delivery_slip_line",
    body: (tpl) => sql`FROM app.delivery_slip_line r JOIN app.bom_line l ON l.id = r.line_id WHERE l.template_id = ${tpl}`,
  },
  {
    kind: "eco",
    table: "app.eco_line",
    body: (tpl) => sql`FROM app.eco_line r JOIN app.bom_line l ON l.id = r.target_line_id WHERE l.template_id = ${tpl}`,
  },
  {
    // FK SET NULL (không lỗi DB) nhưng mất liên kết lệnh SX ↔ dòng → coi là chặn.
    kind: "work_order",
    table: "app.work_order",
    body: (tpl) =>
      sql`FROM app.work_order r JOIN app.bom_line l ON l.id = r.bom_line_id WHERE l.template_id = ${tpl} AND r.status::text <> 'CANCELLED'`,
  },
  {
    kind: "legacy_snapshot",
    table: "app.order_bom_snapshot",
    body: (tpl) =>
      sql`FROM app.order_bom_snapshot r JOIN app.bom_line l ON l.id = r.source_bom_line_id WHERE l.template_id = ${tpl}`,
  },
];

/** Tham chiếu tới chính template (NO ACTION) — chặn XOÁ VĨNH VIỄN (cộng thêm LINE_REFS). */
const TEMPLATE_REFS: RefSpec[] = [
  {
    // Lệnh SX gắn BOM (theo template HOẶC theo dòng), trừ lệnh đã huỷ.
    kind: "work_order",
    table: "app.work_order",
    body: (tpl) =>
      sql`FROM app.work_order r WHERE r.status::text <> 'CANCELLED' AND (r.bom_template_id = ${tpl} OR r.bom_line_id IN (SELECT l.id FROM app.bom_line l WHERE l.template_id = ${tpl}))`,
  },
  {
    kind: "sales_order",
    table: "app.sales_order",
    body: (tpl) => sql`FROM app.sales_order r WHERE r.bom_template_id = ${tpl}`,
  },
  {
    kind: "order_snapshot",
    table: "app.bom_snapshot_line",
    body: (tpl) =>
      sql`FROM (SELECT DISTINCT s.order_id FROM app.bom_snapshot_line s JOIN app.bom_revision v ON v.id = s.revision_id WHERE v.template_id = ${tpl}) r`,
  },
  {
    kind: "eco",
    table: "app.eco_change",
    body: (tpl) => sql`FROM app.eco_change r WHERE r.affected_template_id = ${tpl}`,
  },
  {
    kind: "delivery_slip",
    table: "app.delivery_slip",
    body: (tpl) => sql`FROM app.delivery_slip r WHERE r.template_id = ${tpl}`,
  },
];

function rowsOf(res: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(res)) return res as Array<Record<string, unknown>>;
  const r = (res as { rows?: unknown })?.rows;
  return Array.isArray(r) ? (r as Array<Record<string, unknown>>) : [];
}

async function countRefs(
  exec: SqlExecutor,
  templateId: string,
  specs: RefSpec[],
): Promise<Array<{ kind: BomRefKindDb; count: number }>> {
  const tables = [...new Set(specs.map((s) => s.table))];
  const existRows = rowsOf(
    await exec.execute(
      sql`SELECT t AS name, to_regclass(t) IS NOT NULL AS ok FROM unnest(${sql.raw(
        `ARRAY[${tables.map((t) => `'${t}'`).join(",")}]::text[]`,
      )}) AS t`,
    ),
  );
  const existing = new Set(existRows.filter((r) => r.ok === true).map((r) => String(r.name)));
  const out = new Map<BomRefKindDb, number>();
  for (const s of specs) {
    if (!existing.has(s.table)) continue;
    const [row] = rowsOf(await exec.execute(sql`SELECT count(*)::int AS n ${s.body(sql`${templateId}::uuid`)}`));
    out.set(s.kind, (out.get(s.kind) ?? 0) + Number(row?.n ?? 0));
  }
  return [...out.entries()].map(([kind, count]) => ({ kind, count }));
}

/** Đếm tham chiếu tới các dòng của BOM (chặn ghi đè). */
export function countBomLineRefs(exec: SqlExecutor, templateId: string) {
  return countRefs(exec, templateId, LINE_REFS);
}

/** Đếm mọi tham chiếu chặn xoá vĩnh viễn BOM (template + dòng). */
export function countBomHardDeleteRefs(exec: SqlExecutor, templateId: string) {
  // Phiếu giao + ECO đã đếm theo template (đầu phiếu) → bỏ bản đếm theo dòng
  // để câu báo không cộng trùng.
  const lineOnly = LINE_REFS.filter(
    (s) => s.kind !== "delivery_slip_line" && s.kind !== "eco" && s.kind !== "work_order",
  );
  return countRefs(exec, templateId, [...TEMPLATE_REFS, ...lineOnly]);
}
