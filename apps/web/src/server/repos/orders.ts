import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { salesOrder } from "@iot/db/schema";
import type { SalesOrder } from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * Repository sales_order — V1.2.
 *
 * Order code sinh bằng Postgres function `app.gen_order_code()` (SO-YYMM-####)
 * — sequence global, simple atomic, không cần cron reset monthly.
 */

export type SalesOrderStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "SNAPSHOTTED"
  | "IN_PROGRESS"
  | "FULFILLED"
  | "CLOSED"
  | "CANCELLED";

export interface OrderListQuery {
  q?: string;
  status?: SalesOrderStatus[];
  dueFrom?: Date;
  dueTo?: Date;
  page: number;
  pageSize: number;
}

export interface OrderListResult {
  rows: SalesOrder[];
  total: number;
}

export async function listOrders(q: OrderListQuery): Promise<OrderListResult> {
  const where: SQL[] = [];

  if (q.status && q.status.length > 0) {
    where.push(
      inArray(
        salesOrder.status,
        q.status as unknown as (typeof salesOrder.status.enumValues)[number][],
      ),
    );
  }
  if (q.q && q.q.trim().length > 0) {
    const needle = `%${q.q.trim()}%`;
    const condSearch = or(
      ilike(salesOrder.orderNo, needle),
      ilike(salesOrder.customerName, needle),
    );
    if (condSearch) where.push(condSearch);
  }
  if (q.dueFrom) where.push(gte(salesOrder.dueDate, q.dueFrom.toISOString().slice(0, 10)));
  if (q.dueTo) where.push(lte(salesOrder.dueDate, q.dueTo.toISOString().slice(0, 10)));

  const whereExpr = where.length > 0 ? and(...where) : sql`true`;
  const offset = (q.page - 1) * q.pageSize;

  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(salesOrder)
      .where(whereExpr),
    db
      .select()
      .from(salesOrder)
      .where(whereExpr)
      .orderBy(desc(salesOrder.createdAt))
      .limit(q.pageSize)
      .offset(offset),
  ]);

  return {
    rows,
    total: totalResult[0]?.count ?? 0,
  };
}

export async function getOrder(id: string): Promise<SalesOrder | null> {
  const [row] = await db
    .select()
    .from(salesOrder)
    .where(eq(salesOrder.id, id))
    .limit(1);
  return row ?? null;
}

export async function getOrderByCode(orderNo: string): Promise<SalesOrder | null> {
  const [row] = await db
    .select()
    .from(salesOrder)
    .where(eq(salesOrder.orderNo, orderNo))
    .limit(1);
  return row ?? null;
}

export interface CreateOrderInput {
  customerName: string;
  customerRef?: string | null;
  productItemId: string;
  bomTemplateId?: string | null;
  orderQty: number;
  dueDate?: Date | null;
  notes?: string | null;
  createdBy: string | null;
}

/**
 * Tạo order mới DRAFT. Code sinh bằng Postgres function `gen_order_code()`
 * để atomic với sequence.
 */
export async function createOrder(input: CreateOrderInput): Promise<SalesOrder> {
  // Lấy code từ Postgres function (1 round-trip)
  const codeRows = await db.execute(sql`SELECT app.gen_order_code() AS code`);
  const codeRow = (codeRows as unknown as Array<{ code: string }>)[0];
  if (!codeRow) throw new Error("ORDER_CODE_GEN_FAILED");

  const [row] = await db
    .insert(salesOrder)
    .values({
      orderNo: codeRow.code,
      customerName: input.customerName,
      customerRef: input.customerRef ?? null,
      productItemId: input.productItemId,
      bomTemplateId: input.bomTemplateId ?? null,
      orderQty: String(input.orderQty),
      dueDate: input.dueDate ? input.dueDate.toISOString().slice(0, 10) : null,
      notes: input.notes ?? null,
      status: "DRAFT",
      createdBy: input.createdBy,
    })
    .returning();

  if (!row) throw new Error("ORDER_INSERT_FAILED");
  return row;
}

export interface UpdateOrderInput {
  customerName?: string;
  customerRef?: string | null;
  bomTemplateId?: string | null;
  orderQty?: number;
  dueDate?: Date | null;
  notes?: string | null;
  expectedVersionLock: number;
}

/**
 * Update header order — chỉ cho phép khi DRAFT. Dùng optimistic lock
 * version_lock để tránh race.
 */
export async function updateOrder(
  id: string,
  patch: UpdateOrderInput,
): Promise<SalesOrder> {
  const [current] = await db
    .select({ status: salesOrder.status, versionLock: salesOrder.versionLock })
    .from(salesOrder)
    .where(eq(salesOrder.id, id))
    .limit(1);
  if (!current) throw new Error("ORDER_NOT_FOUND");
  if (current.status !== "DRAFT") {
    throw new Error(`ORDER_NOT_EDITABLE (status=${current.status})`);
  }

  const values: Record<string, unknown> = {
    versionLock: current.versionLock + 1,
    updatedAt: new Date(),
  };
  if (patch.customerName !== undefined) values.customerName = patch.customerName;
  if (patch.customerRef !== undefined) values.customerRef = patch.customerRef;
  if (patch.bomTemplateId !== undefined) values.bomTemplateId = patch.bomTemplateId;
  if (patch.orderQty !== undefined) values.orderQty = String(patch.orderQty);
  if (patch.dueDate !== undefined)
    values.dueDate = patch.dueDate ? patch.dueDate.toISOString().slice(0, 10) : null;
  if (patch.notes !== undefined) values.notes = patch.notes;

  const rows = await db
    .update(salesOrder)
    .set(values)
    .where(
      and(
        eq(salesOrder.id, id),
        eq(salesOrder.versionLock, patch.expectedVersionLock),
      ),
    )
    .returning();

  if (rows.length === 0) {
    throw new Error("ORDER_VERSION_CONFLICT");
  }
  const first = rows[0];
  if (!first) throw new Error("ORDER_UPDATE_FAILED");
  return first;
}

export async function closeOrder(id: string): Promise<SalesOrder | null> {
  const [row] = await db
    .update(salesOrder)
    .set({
      status: "CLOSED",
      closedAt: new Date(),
      updatedAt: new Date(),
      versionLock: sql`${salesOrder.versionLock} + 1`,
    })
    .where(eq(salesOrder.id, id))
    .returning();
  return row ?? null;
}

export async function reopenOrder(id: string): Promise<SalesOrder | null> {
  const [row] = await db
    .update(salesOrder)
    .set({
      status: "IN_PROGRESS",
      closedAt: null,
      updatedAt: new Date(),
      versionLock: sql`${salesOrder.versionLock} + 1`,
    })
    .where(and(eq(salesOrder.id, id), eq(salesOrder.status, "CLOSED")))
    .returning();
  return row ?? null;
}

export async function confirmOrder(id: string): Promise<SalesOrder | null> {
  const [row] = await db
    .update(salesOrder)
    .set({
      status: "CONFIRMED",
      updatedAt: new Date(),
      versionLock: sql`${salesOrder.versionLock} + 1`,
    })
    .where(and(eq(salesOrder.id, id), eq(salesOrder.status, "DRAFT")))
    .returning();
  return row ?? null;
}
