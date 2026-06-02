import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  bomSnapshotLine,
  salesOrder,
  workOrder,
  workOrderLine,
  type WorkOrder,
  type WorkOrderLine,
  type WorkOrderStatus,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * V1.3 Work Order repository.
 *
 * State machine:
 *   DRAFT → QUEUED | CANCELLED
 *   QUEUED → IN_PROGRESS | CANCELLED
 *   IN_PROGRESS → PAUSED | COMPLETED | CANCELLED
 *   PAUSED → IN_PROGRESS | CANCELLED
 *
 * (RELEASED giữ lại cho backward-compat V1 — không phát sinh mới V1.3.)
 */

const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  // V3.7.46: DRAFT = Yêu cầu SX (TK-A submit). VH-A approve → RELEASED (lệnh
  // chính thức). Hoặc reject → CANCELLED. Vẫn giữ DRAFT → IN_PROGRESS cho
  // legacy snapshot flow + DRAFT → QUEUED cho schedule pipeline.
  DRAFT: ["QUEUED", "RELEASED", "IN_PROGRESS", "CANCELLED"],
  QUEUED: ["IN_PROGRESS", "CANCELLED"],
  RELEASED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["PAUSED", "COMPLETED", "CANCELLED"],
  PAUSED: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export class WoConflictError extends Error {
  public readonly code = "CONFLICT";
  public readonly httpStatus = 409;
}

export class WoTransitionError extends Error {
  public readonly code = "WO_TRANSITION_INVALID";
  public readonly httpStatus = 422;
}

export class WoNotFoundError extends Error {
  public readonly code = "WO_NOT_FOUND";
  public readonly httpStatus = 404;
}

export interface WorkOrderListQuery {
  q?: string;
  status?: WorkOrderStatus[];
  orderId?: string;
  /** V1.6 — filter WO theo BOM template (JOIN qua sales_order.bom_template_id). */
  bomTemplateId?: string;
  page: number;
  pageSize: number;
}

export async function listWorkOrders(q: WorkOrderListQuery): Promise<{
  rows: (WorkOrder & { orderNo: string | null })[];
  total: number;
}> {
  const where: SQL[] = [];
  if (q.status && q.status.length > 0) {
    where.push(
      inArray(
        workOrder.status,
        q.status as unknown as (typeof workOrder.status.enumValues)[number][],
      ),
    );
  }
  if (q.orderId) where.push(eq(workOrder.linkedOrderId, q.orderId));
  if (q.bomTemplateId) {
    // JOIN đã có sẵn qua salesOrder — thêm WHERE trên salesOrder.bomTemplateId.
    where.push(eq(salesOrder.bomTemplateId, q.bomTemplateId));
  }
  if (q.q && q.q.trim().length > 0) {
    const needle = `%${q.q.trim()}%`;
    const search = or(
      ilike(workOrder.woNo, needle),
      ilike(workOrder.notes, needle),
    );
    if (search) where.push(search);
  }
  const whereExpr = where.length > 0 ? and(...where) : sql`true`;
  const offset = (q.page - 1) * q.pageSize;

  // JOIN salesOrder trong cả COUNT + rows query (để WHERE bomTemplateId khớp).
  const [totalRows, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(workOrder)
      .leftJoin(salesOrder, eq(salesOrder.id, workOrder.linkedOrderId))
      .where(whereExpr),
    db
      .select({
        wo: workOrder,
        orderNo: salesOrder.orderNo,
      })
      .from(workOrder)
      .leftJoin(salesOrder, eq(salesOrder.id, workOrder.linkedOrderId))
      .where(whereExpr)
      .orderBy(desc(workOrder.createdAt))
      .limit(q.pageSize)
      .offset(offset),
  ]);

  return {
    rows: rows.map((r) => ({ ...r.wo, orderNo: r.orderNo ?? null })),
    total: totalRows[0]?.count ?? 0,
  };
}

export async function getWorkOrder(id: string): Promise<
  | (WorkOrder & {
      lines: (WorkOrderLine & {
        componentSku: string;
        componentName: string;
        snapshotState: string;
      })[];
      orderNo: string | null;
    })
  | null
> {
  const [wo] = await db
    .select({
      wo: workOrder,
      orderNo: salesOrder.orderNo,
    })
    .from(workOrder)
    .leftJoin(salesOrder, eq(salesOrder.id, workOrder.linkedOrderId))
    .where(eq(workOrder.id, id))
    .limit(1);
  if (!wo) return null;

  const lines = await db
    .select({
      line: workOrderLine,
      componentSku: bomSnapshotLine.componentSku,
      componentName: bomSnapshotLine.componentName,
      snapshotState: bomSnapshotLine.state,
    })
    .from(workOrderLine)
    .innerJoin(
      bomSnapshotLine,
      eq(bomSnapshotLine.id, workOrderLine.snapshotLineId),
    )
    .where(eq(workOrderLine.woId, id))
    .orderBy(asc(workOrderLine.position));

  return {
    ...wo.wo,
    orderNo: wo.orderNo ?? null,
    lines: lines.map((l) => ({
      ...l.line,
      componentSku: l.componentSku,
      componentName: l.componentName,
      snapshotState: l.snapshotState,
    })),
  };
}

export interface CreateWorkOrderInput {
  orderId: string;
  snapshotLineIds: string[];
  priority?: string;
  plannedStart?: Date | null;
  plannedEnd?: Date | null;
  notes?: string | null;
  userId: string | null;
}

/**
 * Tạo WO từ 1 order + N snapshot_lines. Derive required_qty từ
 * `bom_snapshot_line.gross_required_qty` và productItemId từ order.
 * Atomic: 1 transaction, WO no gen by in-memory sequence pattern
 * (TODO: move to Postgres function nếu race — V1.3 OK với serial insert).
 */
export async function createFromSnapshot(
  input: CreateWorkOrderInput,
): Promise<WorkOrder> {
  if (input.snapshotLineIds.length === 0) {
    throw new Error("NO_SNAPSHOT_LINES");
  }

  return db.transaction(async (tx) => {
    // 1) Lookup order + product
    const [orderRow] = await tx
      .select({
        id: salesOrder.id,
        productItemId: salesOrder.productItemId,
        orderQty: salesOrder.orderQty,
      })
      .from(salesOrder)
      .where(eq(salesOrder.id, input.orderId))
      .limit(1);
    if (!orderRow) throw new Error("ORDER_NOT_FOUND");

    // 2) Load snapshot lines — verify thuộc order này
    const snapLines = await tx
      .select()
      .from(bomSnapshotLine)
      .where(
        and(
          eq(bomSnapshotLine.orderId, input.orderId),
          inArray(bomSnapshotLine.id, input.snapshotLineIds),
        ),
      );
    if (snapLines.length !== input.snapshotLineIds.length) {
      throw new Error("SOME_SNAPSHOT_LINES_NOT_FOUND");
    }

    // 3) Gen WO no — WO-YYMM-####
    // V3.7.73 — MAX(seq) + 1 thay COUNT(*) + 1 để tránh collision khi có gap.
    const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
    const maxRows = (await tx.execute(sql`
      SELECT COALESCE(MAX(
        CAST(SPLIT_PART(wo_no, '-', 3) AS INTEGER)
      ), 0) AS max_seq
      FROM app.work_order
      WHERE wo_no LIKE ${"WO-" + yymm + "-%"}
        AND wo_no ~ ${"^WO-" + yymm + "-[0-9]+$"}
    `)) as unknown as Array<{ max_seq: number }>;
    const nextSeq = (maxRows[0]?.max_seq ?? 0) + 1;
    const woNo = `WO-${yymm}-${String(nextSeq).padStart(4, "0")}`;

    // 4) Insert WO header
    const plannedQty = input.snapshotLineIds.length > 0 ? orderRow.orderQty : "1";
    const [newWo] = await tx
      .insert(workOrder)
      .values({
        woNo,
        productItemId: orderRow.productItemId,
        linkedOrderId: input.orderId,
        plannedQty,
        priority: input.priority ?? "NORMAL",
        plannedStart: input.plannedStart
          ? input.plannedStart.toISOString().slice(0, 10)
          : null,
        plannedEnd: input.plannedEnd
          ? input.plannedEnd.toISOString().slice(0, 10)
          : null,
        notes: input.notes ?? null,
        status: "DRAFT",
        createdBy: input.userId,
      })
      .returning();
    if (!newWo) throw new Error("WO_INSERT_FAILED");

    // 5) Insert work_order_line từ snapshot_lines
    await tx.insert(workOrderLine).values(
      snapLines.map((s, i) => ({
        woId: newWo.id,
        snapshotLineId: s.id,
        requiredQty: s.grossRequiredQty,
        position: i + 1,
      })),
    );

    logger.info(
      { woId: newWo.id, woNo, lines: snapLines.length },
      "work order created",
    );

    return newWo;
  });
}

export interface UpdateWorkOrderInput {
  priority?: string;
  plannedStart?: Date | null;
  plannedEnd?: Date | null;
  notes?: string | null;
  /** V1.9-P4 — JSONB metadata. */
  routingPlan?: unknown;
  materialRequirements?: unknown;
  technicalDrawingUrl?: string | null;
  toleranceSpecs?: unknown;
  estimatedHours?: number | null;
  /** V3.7.58 LSX. */
  orderType?: string | null;
  creatorDepartment?: string | null;
  toolsRequired?: unknown;
  productSpecification?: unknown;
  expectedVersionLock: number;
}

/**
 * V3.7.58 — Tạo Work Order standalone (không cần snapshot/sales order) theo
 * form LSX (Lệnh Sản Xuất GTAM). Operator/Planner/Admin tạo trực tiếp với
 * đầy đủ routing + materials + tools + product spec.
 */
export interface CreateLsxWorkOrderInput {
  productItemId: string;
  plannedQty: number;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  plannedStart?: Date | null;
  plannedEnd?: Date | null;
  notes?: string | null;
  orderType?: "NEW" | "REPAIR" | "TRIAL";
  creatorDepartment?: string | null;
  routingPlan?: unknown;
  materialRequirements?: unknown;
  toolsRequired?: unknown;
  productSpecification?: unknown;
  technicalDrawingUrl?: string | null;
  estimatedHours?: number | null;
  userId: string | null;
}

export async function createLsxWorkOrder(
  input: CreateLsxWorkOrderInput,
): Promise<WorkOrder> {
  if (input.plannedQty <= 0) {
    throw new Error("PLANNED_QTY_REQUIRED");
  }

  return db.transaction(async (tx) => {
    // Generate WO no — WO-YYMM-####
    // V3.7.73 — Đổi từ COUNT(*) + 1 sang MAX(seq) + 1 vì COUNT có thể sinh
    // collision khi đã có WO bị xóa trong tháng (gap trong sequence).
    // Pattern này khớp với gen_pr_paper_form_no() đã verified production.
    const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
    const maxRows = (await tx.execute(sql`
      SELECT COALESCE(MAX(
        CAST(SPLIT_PART(wo_no, '-', 3) AS INTEGER)
      ), 0) AS max_seq
      FROM app.work_order
      WHERE wo_no LIKE ${"WO-" + yymm + "-%"}
        AND wo_no ~ ${"^WO-" + yymm + "-[0-9]+$"}
    `)) as unknown as Array<{ max_seq: number }>;
    const nextSeq = (maxRows[0]?.max_seq ?? 0) + 1;
    const woNo = `WO-${yymm}-${String(nextSeq).padStart(4, "0")}`;

    const [newWo] = await tx
      .insert(workOrder)
      .values({
        woNo,
        productItemId: input.productItemId,
        linkedOrderId: null,
        plannedQty: String(input.plannedQty),
        priority: input.priority ?? "NORMAL",
        plannedStart: input.plannedStart
          ? input.plannedStart.toISOString().slice(0, 10)
          : null,
        plannedEnd: input.plannedEnd
          ? input.plannedEnd.toISOString().slice(0, 10)
          : null,
        notes: input.notes ?? null,
        status: "DRAFT",
        createdBy: input.userId,
        // V3.7.58 LSX fields
        orderType: input.orderType ?? "NEW",
        creatorDepartment: input.creatorDepartment ?? null,
        routingPlan: input.routingPlan ?? null,
        materialRequirements: input.materialRequirements ?? null,
        toolsRequired: input.toolsRequired ?? null,
        productSpecification: input.productSpecification ?? null,
        technicalDrawingUrl: input.technicalDrawingUrl ?? null,
        estimatedHours:
          input.estimatedHours != null ? String(input.estimatedHours) : null,
      })
      .returning();
    if (!newWo) throw new Error("WO_INSERT_FAILED");

    logger.info({ woId: newWo.id, woNo, type: "LSX" }, "LSX work order created");
    return newWo;
  });
}

export async function updateWorkOrder(
  id: string,
  patch: UpdateWorkOrderInput,
): Promise<WorkOrder> {
  const values: Record<string, unknown> = {};
  if (patch.priority !== undefined) values.priority = patch.priority;
  if (patch.plannedStart !== undefined)
    values.plannedStart = patch.plannedStart
      ? patch.plannedStart.toISOString().slice(0, 10)
      : null;
  if (patch.plannedEnd !== undefined)
    values.plannedEnd = patch.plannedEnd
      ? patch.plannedEnd.toISOString().slice(0, 10)
      : null;
  if (patch.notes !== undefined) values.notes = patch.notes;
  if (patch.routingPlan !== undefined) values.routingPlan = patch.routingPlan;
  if (patch.materialRequirements !== undefined)
    values.materialRequirements = patch.materialRequirements;
  if (patch.technicalDrawingUrl !== undefined)
    values.technicalDrawingUrl = patch.technicalDrawingUrl;
  if (patch.toleranceSpecs !== undefined)
    values.toleranceSpecs = patch.toleranceSpecs;
  if (patch.estimatedHours !== undefined)
    values.estimatedHours =
      patch.estimatedHours === null ? null : String(patch.estimatedHours);
  // V3.7.58 LSX fields
  if (patch.orderType !== undefined) values.orderType = patch.orderType;
  if (patch.creatorDepartment !== undefined)
    values.creatorDepartment = patch.creatorDepartment;
  if (patch.toolsRequired !== undefined) values.toolsRequired = patch.toolsRequired;
  if (patch.productSpecification !== undefined)
    values.productSpecification = patch.productSpecification;
  values.versionLock = sql`${workOrder.versionLock} + 1`;

  const rows = await db
    .update(workOrder)
    .set(values)
    .where(
      and(
        eq(workOrder.id, id),
        eq(workOrder.versionLock, patch.expectedVersionLock),
      ),
    )
    .returning();
  if (rows.length === 0) {
    throw new WoConflictError(
      "Work Order đã thay đổi bởi user khác (version_lock mismatch).",
    );
  }
  const first = rows[0];
  if (!first) throw new Error("WO_UPDATE_FAILED");
  return first;
}

/** Chung — transition WO status với guard rule + version_lock. */
async function transitionStatus(
  id: string,
  toStatus: WorkOrderStatus,
  extra: Partial<{
    startedAt: Date;
    completedAt: Date;
    pausedAt: Date | null;
    pausedReason: string | null;
    releasedAt: Date;
  }> = {},
  expectedVersionLock?: number,
): Promise<WorkOrder> {
  const [cur] = await db
    .select({ status: workOrder.status, versionLock: workOrder.versionLock })
    .from(workOrder)
    .where(eq(workOrder.id, id))
    .limit(1);
  if (!cur) throw new WoNotFoundError("WO không tồn tại.");

  if (!ALLOWED_TRANSITIONS[cur.status].includes(toStatus)) {
    throw new WoTransitionError(
      `Không thể chuyển WO ${cur.status} → ${toStatus}.`,
    );
  }
  const locked = expectedVersionLock ?? cur.versionLock;

  const values: Record<string, unknown> = {
    status: toStatus,
    versionLock: sql`${workOrder.versionLock} + 1`,
  };
  if (extra.startedAt !== undefined) values.startedAt = extra.startedAt;
  if (extra.completedAt !== undefined) values.completedAt = extra.completedAt;
  if (extra.pausedAt !== undefined) values.pausedAt = extra.pausedAt;
  if (extra.pausedReason !== undefined) values.pausedReason = extra.pausedReason;
  if (extra.releasedAt !== undefined) values.releasedAt = extra.releasedAt;

  const rows = await db
    .update(workOrder)
    .set(values)
    .where(
      and(eq(workOrder.id, id), eq(workOrder.versionLock, locked)),
    )
    .returning();
  if (rows.length === 0) {
    throw new WoConflictError(
      "WO version_lock mismatch, vui lòng refresh.",
    );
  }
  const first = rows[0];
  if (!first) throw new Error("WO_TRANSITION_FAILED");
  return first;
}

export async function startWO(id: string, versionLock?: number): Promise<WorkOrder> {
  return transitionStatus(
    id,
    "IN_PROGRESS",
    { startedAt: new Date(), releasedAt: new Date() },
    versionLock,
  );
}

export async function pauseWO(
  id: string,
  reason: string | null,
  versionLock?: number,
): Promise<WorkOrder> {
  return transitionStatus(
    id,
    "PAUSED",
    { pausedAt: new Date(), pausedReason: reason },
    versionLock,
  );
}

export async function resumeWO(id: string, versionLock?: number): Promise<WorkOrder> {
  return transitionStatus(
    id,
    "IN_PROGRESS",
    { pausedAt: null, pausedReason: null },
    versionLock,
  );
}

/**
 * Complete WO: check mọi work_order_line có completed_qty >= required_qty.
 * Nếu có line chưa complete → reject với message rõ.
 */
export async function completeWO(id: string, versionLock?: number): Promise<WorkOrder> {
  return db.transaction(async (tx) => {
    const incompleteLines = await tx
      .select({ id: workOrderLine.id })
      .from(workOrderLine)
      .where(
        and(
          eq(workOrderLine.woId, id),
          sql`${workOrderLine.completedQty} < ${workOrderLine.requiredQty}`,
        ),
      );
    if (incompleteLines.length > 0) {
      throw new WoTransitionError(
        `Còn ${incompleteLines.length} line chưa hoàn tất, không thể complete WO.`,
      );
    }
    // Re-check trong cùng tx (double-read rủi ro race thấp vì WO là owner-exclusive)
    return transitionStatus(
      id,
      "COMPLETED",
      { completedAt: new Date() },
      versionLock,
    );
  });
}

export async function cancelWO(id: string, versionLock?: number): Promise<WorkOrder> {
  return transitionStatus(id, "CANCELLED", {}, versionLock);
}

/**
 * V3.7.71 — Hard-delete WO (admin only).
 *
 * Guards:
 *   - WO chỉ xoá được khi DRAFT/CANCELLED (chưa release vào production).
 *   - Cascade tự động qua FK onDelete: cascade cho work_order_line, routing,
 *     material, tool, qc.
 *   - reservation/assembly link KHÔNG cascade — phải check thủ công.
 *
 * Throws "WO_INVALID_STATE", "WO_HAS_RESERVATIONS", "WO_HAS_ASSEMBLY", "WO_NOT_FOUND".
 */
export async function deleteWO(
  id: string,
  options: { force?: boolean } = {},
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [wo] = await tx
      .select({ id: workOrder.id, status: workOrder.status })
      .from(workOrder)
      .where(eq(workOrder.id, id))
      .limit(1);
    if (!wo) throw new Error("WO_NOT_FOUND");

    // Chỉ cho phép xoá DRAFT/CANCELLED — đã release thì block
    const DELETABLE_STATES: WorkOrderStatus[] = ["DRAFT", "CANCELLED"];
    if (
      !DELETABLE_STATES.includes(wo.status as WorkOrderStatus) &&
      !options.force
    ) {
      throw new Error(`WO_INVALID_STATE: ${wo.status}`);
    }

    // Check reservation link (no cascade)
    const reservations = await tx.execute(sql`
      SELECT id FROM app.reservation WHERE wo_id = ${id}
    `);
    const reservationRows = reservations as unknown as Array<{ id: string }>;
    if (reservationRows.length > 0 && !options.force) {
      throw new Error(`WO_HAS_RESERVATIONS: ${reservationRows.length}`);
    }
    if (options.force && reservationRows.length > 0) {
      // Null-out reservation.wo_id
      await tx.execute(sql`
        UPDATE app.reservation SET wo_id = NULL WHERE wo_id = ${id}
      `);
    }

    // Check assembly_order link (no cascade FK)
    const assembly = await tx.execute(sql`
      SELECT id FROM app.assembly_order WHERE wo_id = ${id}
    `);
    const assemblyRows = assembly as unknown as Array<{ id: string }>;
    if (assemblyRows.length > 0 && !options.force) {
      throw new Error(`WO_HAS_ASSEMBLY: ${assemblyRows.length}`);
    }
    if (options.force && assemblyRows.length > 0) {
      await tx.execute(sql`
        UPDATE app.assembly_order SET wo_id = NULL WHERE wo_id = ${id}
      `);
    }
    // Check assembly_scan link cũng có wo_id (no cascade) — null-out luôn nếu force
    const scans = await tx.execute(sql`
      SELECT id FROM app.assembly_scan WHERE wo_id = ${id}
    `);
    const scanRows = scans as unknown as Array<{ id: string }>;
    if (scanRows.length > 0 && !options.force) {
      throw new Error(`WO_HAS_ASSEMBLY: ${scanRows.length} scan rows`);
    }
    if (options.force && scanRows.length > 0) {
      await tx.execute(sql`
        UPDATE app.assembly_scan SET wo_id = NULL WHERE wo_id = ${id}
      `);
    }

    // Null-out material_request.wo_id đã set null cascade auto via schema FK.

    // DELETE WO — work_order_line, routing, material, tool, qc cascade auto
    const result = await tx.delete(workOrder).where(eq(workOrder.id, id));
    const count = (result as unknown as { count?: number }).count ?? 0;
    if (count === 0) throw new Error("WO_NOT_FOUND");
    return true;
  });
}
