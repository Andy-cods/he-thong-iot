import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  bomLine,
  bomSnapshotLine,
  bomTemplate,
  item,
  salesOrder,
  userAccount,
  workOrder,
  workOrderLine,
  type WorkOrder,
  type WorkOrderLine,
  type WorkOrderStatus,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { routingPlanForInsert } from "@/lib/wo-routing";
import {
  WO_STATUS_LABEL_VI,
  checkWoCompletable,
  isWoDeletable,
  isWoTransitionAllowed,
} from "@/lib/wo-guards";
import { currentYymm, genDocNo } from "./_docNumber";
import { releaseWoReservationsTx } from "./reservations";

/**
 * V1.3 Work Order repository.
 *
 * State machine: xem `WO_ALLOWED_TRANSITIONS` (lib/wo-guards.ts).
 *   DRAFT (Yêu cầu SX) → RELEASED (qua /approve) | QUEUED | CANCELLED
 *   RELEASED/QUEUED → IN_PROGRESS | CANCELLED
 *   IN_PROGRESS → PAUSED | COMPLETED | CANCELLED
 *   PAUSED → IN_PROGRESS | CANCELLED
 *
 * V4.1 Đợt 4:
 *  - SX-06 bỏ DRAFT → IN_PROGRESS (phải duyệt trước).
 *  - SX-04/05 mọi chuyển trạng thái chạy trong 1 transaction thật, khoá hàng WO
 *    `FOR UPDATE` (trước đây completeWO mở tx nhưng transitionStatus dùng `db`
 *    ngoài tx → tx vô tác dụng).
 *  - SX-16/17 WO ↔ BOM qua `bom_template_id` / `bom_line_id`.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  /**
   * V1.6 — filter WO theo BOM template.
   * V4.1 SX-16: khớp `work_order.bom_template_id` (WO tạo từ chính BOM) HOẶC
   * `sales_order.bom_template_id` (WO kiểu cũ từ đơn hàng).
   */
  bomTemplateId?: string;
  page: number;
  pageSize: number;
}

export type WorkOrderListRow = WorkOrder & {
  orderNo: string | null;
  /** V4.1 SX-33 — cột Sản phẩm trên danh sách WO. */
  productSku: string | null;
  productName: string | null;
};

export async function listWorkOrders(q: WorkOrderListQuery): Promise<{
  rows: WorkOrderListRow[];
  total: number;
  /** V4.1 SX-29 — đếm theo trạng thái trên TOÀN bộ (không theo trang). */
  statusCounts: Partial<Record<WorkOrderStatus, number>>;
}> {
  const where: SQL[] = [];
  // Điều kiện không gồm trạng thái — dùng cho statusCounts (chip KPI).
  const baseWhere: SQL[] = [];
  if (q.status && q.status.length > 0) {
    where.push(
      inArray(
        workOrder.status,
        q.status as unknown as (typeof workOrder.status.enumValues)[number][],
      ),
    );
  }
  if (q.orderId) baseWhere.push(eq(workOrder.linkedOrderId, q.orderId));
  if (q.bomTemplateId) {
    const byBom = or(
      eq(workOrder.bomTemplateId, q.bomTemplateId),
      eq(salesOrder.bomTemplateId, q.bomTemplateId),
    );
    if (byBom) baseWhere.push(byBom);
  }
  if (q.q && q.q.trim().length > 0) {
    const needle = `%${q.q.trim()}%`;
    const search = or(
      ilike(workOrder.woNo, needle),
      ilike(workOrder.notes, needle),
      ilike(item.sku, needle),
      ilike(item.name, needle),
    );
    if (search) baseWhere.push(search);
  }
  const all = [...baseWhere, ...where];
  const whereExpr = all.length > 0 ? and(...all) : sql`true`;
  const baseExpr = baseWhere.length > 0 ? and(...baseWhere) : sql`true`;
  const offset = (q.page - 1) * q.pageSize;

  const [totalRows, rows, countRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(workOrder)
      .leftJoin(salesOrder, eq(salesOrder.id, workOrder.linkedOrderId))
      .leftJoin(item, eq(item.id, workOrder.productItemId))
      .where(whereExpr),
    db
      .select({
        wo: workOrder,
        orderNo: salesOrder.orderNo,
        productSku: item.sku,
        productName: item.name,
      })
      .from(workOrder)
      .leftJoin(salesOrder, eq(salesOrder.id, workOrder.linkedOrderId))
      .leftJoin(item, eq(item.id, workOrder.productItemId))
      .where(whereExpr)
      .orderBy(desc(workOrder.createdAt))
      .limit(q.pageSize)
      .offset(offset),
    db
      .select({
        status: workOrder.status,
        count: sql<number>`count(*)::int`,
      })
      .from(workOrder)
      .leftJoin(salesOrder, eq(salesOrder.id, workOrder.linkedOrderId))
      .leftJoin(item, eq(item.id, workOrder.productItemId))
      .where(baseExpr)
      .groupBy(workOrder.status),
  ]);

  const statusCounts: Partial<Record<WorkOrderStatus, number>> = {};
  for (const r of countRows) statusCounts[r.status] = Number(r.count) || 0;

  return {
    rows: rows.map((r) => ({
      ...r.wo,
      orderNo: r.orderNo ?? null,
      productSku: r.productSku ?? null,
      productName: r.productName ?? null,
    })),
    total: totalRows[0]?.count ?? 0,
    statusCounts,
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
      productItemSku: string | null;
      productItemName: string | null;
      productItemUom: string | null;
      /** V4.1 SX-11 — tên người lập thật (trước đây lấy người đang xem). */
      createdByName: string | null;
      /** V4.1 SX-16 — BOM nguồn. */
      bomTemplateCode: string | null;
      bomTemplateName: string | null;
    })
  | null
> {
  const [wo] = await db
    .select({
      wo: workOrder,
      orderNo: salesOrder.orderNo,
      // V3.7.74 — Enrich product master để detail page render Section I.
      productItemSku: item.sku,
      productItemName: item.name,
      productItemUom: item.uom,
      createdByName: sql<string | null>`COALESCE(${userAccount.fullName}, ${userAccount.username})`,
      bomTemplateCode: bomTemplate.code,
      bomTemplateName: bomTemplate.name,
    })
    .from(workOrder)
    .leftJoin(salesOrder, eq(salesOrder.id, workOrder.linkedOrderId))
    .leftJoin(item, eq(item.id, workOrder.productItemId))
    .leftJoin(userAccount, eq(userAccount.id, workOrder.createdBy))
    .leftJoin(bomTemplate, eq(bomTemplate.id, workOrder.bomTemplateId))
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
    productItemSku: wo.productItemSku ?? null,
    productItemName: wo.productItemName ?? null,
    productItemUom: wo.productItemUom ?? null,
    createdByName: wo.createdByName ?? null,
    bomTemplateCode: wo.bomTemplateCode ?? null,
    bomTemplateName: wo.bomTemplateName ?? null,
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
 * Tạo WO từ 1 order + N snapshot_lines (kiểu cũ — đơn hàng bán đang ẩn, API giữ).
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
        bomTemplateId: salesOrder.bomTemplateId,
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

    // 3) Gen WO no — WO-YYMM-#### (V3.11.4 advisory lock chống trùng số).
    const woNo = await genDocNo(tx, {
      table: "app.work_order",
      column: "wo_no",
      prefix: `WO-${currentYymm()}`,
      seqPart: 3,
    });

    // 4) Insert WO header
    const plannedQty = input.snapshotLineIds.length > 0 ? orderRow.orderQty : "1";
    const [newWo] = await tx
      .insert(workOrder)
      .values({
        woNo,
        productItemId: orderRow.productItemId,
        linkedOrderId: input.orderId,
        // V4.1 SX-16 — ghi BOM nguồn ngay khi tạo.
        bomTemplateId: orderRow.bomTemplateId ?? null,
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
  /** V4.1 SX-16 — LSX mở từ BOM (tab Lệnh SX / sửa dòng BOM). */
  bomTemplateId?: string | null;
  bomLineId?: string | null;
  userId: string | null;
}

/**
 * V4.1 SX-16 — Chuẩn hoá cặp (bomTemplateId, bomLineId): nếu có dòng BOM thì
 * BOM lấy theo dòng (không tin client); BOM không tồn tại → bỏ link.
 */
async function resolveBomLink(
  tx: Tx,
  input: { bomTemplateId?: string | null; bomLineId?: string | null },
): Promise<{ bomTemplateId: string | null; bomLineId: string | null }> {
  if (input.bomLineId) {
    const [line] = await tx
      .select({ id: bomLine.id, templateId: bomLine.templateId })
      .from(bomLine)
      .where(eq(bomLine.id, input.bomLineId))
      .limit(1);
    if (line) return { bomTemplateId: line.templateId, bomLineId: line.id };
  }
  if (input.bomTemplateId) {
    const [tpl] = await tx
      .select({ id: bomTemplate.id })
      .from(bomTemplate)
      .where(eq(bomTemplate.id, input.bomTemplateId))
      .limit(1);
    if (tpl) return { bomTemplateId: tpl.id, bomLineId: null };
  }
  return { bomTemplateId: null, bomLineId: null };
}

export async function createLsxWorkOrder(
  input: CreateLsxWorkOrderInput,
): Promise<WorkOrder> {
  if (input.plannedQty <= 0) {
    throw new Error("PLANNED_QTY_REQUIRED");
  }

  return db.transaction(async (tx) => {
    const link = await resolveBomLink(tx, input);
    // V3.11.4 (audit 1.21) — advisory lock chống trùng số khi tạo đồng thời.
    const woNo = await genDocNo(tx, {
      table: "app.work_order",
      column: "wo_no",
      prefix: `WO-${currentYymm()}`,
      seqPart: 3,
    });

    const [newWo] = await tx
      .insert(workOrder)
      .values({
        woNo,
        productItemId: input.productItemId,
        linkedOrderId: null,
        bomTemplateId: link.bomTemplateId,
        bomLineId: link.bomLineId,
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

/** V4.1 SX-18 — đã có YCSX đang chờ duyệt cho cùng dòng BOM. */
export class WoDuplicateRequestError extends Error {
  public readonly code = "WO_DUPLICATE_REQUEST";
  public readonly httpStatus = 409;
  constructor(public readonly existingWoNo: string) {
    super(
      `Dòng BOM này đã có yêu cầu sản xuất ${existingWoNo} đang chờ duyệt — mở yêu cầu đó thay vì tạo thêm.`,
    );
  }
}

export interface CreateFromBomLineInput {
  bomLineId: string;
  bomTemplateId: string;
  productItemId: string;
  plannedQty: number;
  priority: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  notes: string;
  /** metadata.routing của dòng BOM (object) — chuyển thành RoutingStep[]. */
  routing: unknown;
  userId: string | null;
}

/**
 * V4.1 SX-02/17/18 — Tạo Yêu cầu SX (DRAFT) từ 1 dòng BOM (nút GTAM).
 *  - Số WO qua `genDocNo` (advisory lock + giờ VN) — trước đây COUNT+1 giờ UTC
 *    → trùng số → 500.
 *  - Ghi `bom_template_id` + `bom_line_id` (link WO ↔ BOM).
 *  - Khoá theo dòng BOM + chặn tạo thêm khi đã có YCSX DRAFT cho dòng đó
 *    (bấm 2 lần / 2 người cùng bấm → không ra 2 yêu cầu).
 */
export async function createFromBomLine(
  input: CreateFromBomLineInput,
): Promise<WorkOrder> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${"wo-bom-line:" + input.bomLineId}))`,
    );
    const [dup] = await tx
      .select({ woNo: workOrder.woNo })
      .from(workOrder)
      .where(
        and(
          eq(workOrder.bomLineId, input.bomLineId),
          eq(workOrder.status, "DRAFT"),
        ),
      )
      .limit(1);
    if (dup) throw new WoDuplicateRequestError(dup.woNo);

    const woNo = await genDocNo(tx, {
      table: "app.work_order",
      column: "wo_no",
      prefix: `WO-${currentYymm()}`,
      seqPart: 3,
    });

    // V4.1 SX-01: metadata.routing là OBJECT → chuyển processRoute thành mảng.
    const routingPlan = routingPlanForInsert(input.routing);

    const [wo] = await tx
      .insert(workOrder)
      .values({
        woNo,
        productItemId: input.productItemId,
        bomTemplateId: input.bomTemplateId,
        bomLineId: input.bomLineId,
        plannedQty: String(input.plannedQty),
        status: "DRAFT",
        priority: input.priority,
        plannedStart: input.plannedStart || null,
        plannedEnd: input.plannedEnd || null,
        notes: input.notes,
        materialRequirements: [],
        routingPlan,
        releasedAt: null,
        createdBy: input.userId,
      })
      .returning();
    if (!wo) throw new Error("WO_INSERT_FAILED");
    return wo;
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

/** Khoá hàng WO trong tx, trả status + versionLock. */
async function lockWo(
  tx: Tx,
  id: string,
): Promise<{ status: WorkOrderStatus; versionLock: number; goodQty: string }> {
  const [cur] = await tx
    .select({
      status: workOrder.status,
      versionLock: workOrder.versionLock,
      goodQty: workOrder.goodQty,
    })
    .from(workOrder)
    .where(eq(workOrder.id, id))
    .for("update");
  if (!cur) throw new WoNotFoundError("Lệnh sản xuất không tồn tại.");
  return cur;
}

/**
 * Chung — transition WO status với guard rule + version_lock, TRONG tx đã có
 * (caller đã/không khoá; hàm tự khoá hàng WO `FOR UPDATE`).
 */
async function transitionStatusTx(
  tx: Tx,
  id: string,
  toStatus: WorkOrderStatus,
  extra: Partial<{
    startedAt: Date;
    completedAt: Date;
    pausedAt: Date | null;
    pausedReason: string | null;
    /** V4.1 SX-06 — chỉ đặt nếu chưa có (không ghi đè giờ duyệt). */
    releasedAtIfNull: Date;
  }> = {},
  expectedVersionLock?: number,
): Promise<WorkOrder> {
  const cur = await lockWo(tx, id);

  if (!isWoTransitionAllowed(cur.status, toStatus)) {
    throw new WoTransitionError(
      `Không thể chuyển lệnh từ "${WO_STATUS_LABEL_VI[cur.status] ?? cur.status}" sang "${WO_STATUS_LABEL_VI[toStatus] ?? toStatus}".`,
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
  if (extra.releasedAtIfNull !== undefined) {
    values.releasedAt = sql`COALESCE(${workOrder.releasedAt}, ${extra.releasedAtIfNull.toISOString()}::timestamptz)`;
  }

  const rows = await tx
    .update(workOrder)
    .set(values)
    .where(
      and(eq(workOrder.id, id), eq(workOrder.versionLock, locked)),
    )
    .returning();
  if (rows.length === 0) {
    throw new WoConflictError(
      "Lệnh đã bị người khác thay đổi — tải lại trang rồi thử lại.",
    );
  }
  const first = rows[0];
  if (!first) throw new Error("WO_TRANSITION_FAILED");
  return first;
}

export async function startWO(id: string, versionLock?: number): Promise<WorkOrder> {
  return db.transaction((tx) =>
    transitionStatusTx(
      tx,
      id,
      "IN_PROGRESS",
      { startedAt: new Date(), releasedAtIfNull: new Date() },
      versionLock,
    ),
  );
}

export async function pauseWO(
  id: string,
  reason: string | null,
  versionLock?: number,
): Promise<WorkOrder> {
  return db.transaction((tx) =>
    transitionStatusTx(
      tx,
      id,
      "PAUSED",
      { pausedAt: new Date(), pausedReason: reason },
      versionLock,
    ),
  );
}

export async function resumeWO(id: string, versionLock?: number): Promise<WorkOrder> {
  return db.transaction((tx) =>
    transitionStatusTx(
      tx,
      id,
      "IN_PROGRESS",
      { pausedAt: null, pausedReason: null },
      versionLock,
    ),
  );
}

/**
 * Complete WO — V4.1 SX-04/05: 1 transaction thật, khoá WO rồi kiểm
 * `checkWoCompletable` (đang chạy + SL đạt > 0 + mọi dòng linh kiện đủ).
 *
 * TODO V4.1 Q2: điểm móc nhập kho thành phẩm — ghi `inventory_txn` PROD_IN
 * (SL đạt, lô FG) TRONG CÙNG transaction này khi anh Thang bật lại bước nhập
 * kho thành phẩm (`HIDDEN_FEATURES.fgReceipt`). Hiện chỉ chuyển trạng thái.
 */
export async function completeWO(id: string, versionLock?: number): Promise<WorkOrder> {
  return db.transaction(async (tx) => {
    const cur = await lockWo(tx, id);
    const lines = await tx
      .select({
        requiredQty: workOrderLine.requiredQty,
        completedQty: workOrderLine.completedQty,
      })
      .from(workOrderLine)
      .where(eq(workOrderLine.woId, id));
    const check = checkWoCompletable({
      status: cur.status,
      goodQty: cur.goodQty,
      lines,
    });
    if (!check.ok) throw new WoTransitionError(check.reason);
    return transitionStatusTx(
      tx,
      id,
      "COMPLETED",
      { completedAt: new Date() },
      versionLock,
    );
  });
}

/**
 * V4.1 SX-08 — Huỷ WO + nhả MỌI giữ chỗ ACTIVE của WO (trước đây giữ chỗ
 * treo vĩnh viễn → tồn khả dụng bị khoá). Cùng 1 transaction.
 */
export async function cancelWO(
  id: string,
  versionLock?: number,
  opts: { userId?: string | null; reason?: string | null } = {},
): Promise<WorkOrder & { releasedReservations: number }> {
  return db.transaction(async (tx) => {
    const wo = await transitionStatusTx(tx, id, "CANCELLED", {}, versionLock);
    const released = await releaseWoReservationsTx(tx, {
      woId: id,
      userId: opts.userId ?? null,
      reason: `Huỷ lệnh SX ${wo.woNo}${opts.reason ? `: ${opts.reason}` : ""}`,
    });
    return { ...wo, releasedReservations: released };
  });
}

/**
 * V3.7.71 — Hard-delete WO (admin only).
 *
 * V4.1 SX-07: CHỈ xoá được DRAFT/CANCELLED — `force` KHÔNG còn vượt qua kiểm
 * trạng thái (trước đây UI luôn gửi force → xoá được cả lệnh đang chạy/đã
 * xong). `force` chỉ còn nghĩa: bỏ link reservation/assembly còn sót trước khi
 * xoá lệnh Nháp/Đã huỷ.
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
      .for("update");
    if (!wo) throw new Error("WO_NOT_FOUND");

    if (!isWoDeletable(wo.status)) {
      throw new Error(`WO_INVALID_STATE: ${wo.status}`);
    }

    // Reservation ACTIVE còn sót (lệnh Nháp chưa huỷ) → nhả trước, rồi bỏ link.
    const reservations = await tx.execute(sql`
      SELECT id FROM app.reservation WHERE wo_id = ${id}
    `);
    const reservationRows = reservations as unknown as Array<{ id: string }>;
    if (reservationRows.length > 0 && !options.force) {
      throw new Error(`WO_HAS_RESERVATIONS: ${reservationRows.length}`);
    }
    if (options.force && reservationRows.length > 0) {
      await releaseWoReservationsTx(tx, {
        woId: id,
        userId: null,
        reason: "Xoá lệnh SX",
      });
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

    // DELETE WO — work_order_line, routing, material, tool, qc cascade auto
    const result = await tx.delete(workOrder).where(eq(workOrder.id, id));
    const count = (result as unknown as { count?: number }).count ?? 0;
    if (count === 0) throw new Error("WO_NOT_FOUND");
    return true;
  });
}
