import { and, asc, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import {
  productLine,
  productLineMember,
  bomTemplate,
  item,
  salesOrder,
  workOrder,
  purchaseOrder,
} from "@iot/db/schema";
import { db } from "@/lib/db";

export type ProductLineStatus = "ACTIVE" | "ARCHIVED";

export interface ProductLineListQuery {
  q?: string;
  status?: ProductLineStatus[];
  page: number;
  pageSize: number;
  sort?: "updatedAt" | "code" | "name";
  sortDir?: "asc" | "desc";
}

export interface ProductLineRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function listProductLines(
  q: ProductLineListQuery,
): Promise<{ rows: ProductLineRow[]; total: number }> {
  const where: SQL[] = [];

  if (q.status && q.status.length > 0) {
    where.push(inArray(productLine.status, q.status));
  }
  if (q.q?.trim()) {
    const needle = q.q.trim();
    where.push(
      sql`(${productLine.code} ILIKE ${"%" + needle + "%"} OR ${productLine.name} ILIKE ${"%" + needle + "%"})`,
    );
  }

  const whereExpr = where.length > 0 ? and(...where) : undefined;
  const offset = (q.page - 1) * q.pageSize;

  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(productLine)
      .where(whereExpr ?? sql`true`),
    db
      .select({
        id: productLine.id,
        code: productLine.code,
        name: productLine.name,
        description: productLine.description,
        status: productLine.status,
        createdAt: productLine.createdAt,
        updatedAt: productLine.updatedAt,
        memberCount: sql<number>`(
          SELECT count(*)::int FROM app.product_line_member m
          WHERE m.product_line_id = ${productLine.id}
        )`,
      })
      .from(productLine)
      .where(whereExpr ?? sql`true`)
      .orderBy(
        q.sortDir === "asc"
          ? asc(productLine.updatedAt)
          : desc(productLine.updatedAt),
      )
      .limit(q.pageSize)
      .offset(offset),
  ]);

  return { rows: rows as ProductLineRow[], total: totalResult[0]?.count ?? 0 };
}

export async function getProductLineById(id: string) {
  const [row] = await db
    .select()
    .from(productLine)
    .where(eq(productLine.id, id))
    .limit(1);
  return row ?? null;
}

export async function getProductLineByCode(code: string) {
  const [row] = await db
    .select()
    .from(productLine)
    .where(eq(productLine.code, code))
    .limit(1);
  return row ?? null;
}

export interface ProductLineCreateInput {
  code: string;
  name: string;
  description?: string | null;
  ownerUserId?: string | null;
}

export async function createProductLine(
  input: ProductLineCreateInput,
  actorId: string | null,
) {
  const [row] = await db
    .insert(productLine)
    .values({
      code: input.code.toUpperCase(),
      name: input.name,
      description: input.description ?? null,
      ownerUserId: input.ownerUserId ?? null,
      status: "ACTIVE",
      createdBy: actorId,
    })
    .returning();
  return row;
}

export interface ProductLineUpdateInput {
  name?: string;
  description?: string | null;
  ownerUserId?: string | null;
  status?: ProductLineStatus;
}

export async function updateProductLine(
  id: string,
  patch: ProductLineUpdateInput,
) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.ownerUserId !== undefined) values.ownerUserId = patch.ownerUserId;
  if (patch.status !== undefined) values.status = patch.status;

  const [row] = await db
    .update(productLine)
    .set(values)
    .where(eq(productLine.id, id))
    .returning();
  return row ?? null;
}

/** Lấy danh sách bom_template trong 1 product line (kèm thống kê). */
export interface ProductLineMemberRow {
  memberId: string;
  position: number;
  role: string | null;
  bomId: string;
  bomCode: string;
  bomName: string;
  bomStatus: string;
  targetQty: string;
  parentItemSku: string | null;
  parentItemName: string | null;
  componentCount: number;
}

export async function getProductLineMembers(
  productLineId: string,
): Promise<ProductLineMemberRow[]> {
  const rows = await db
    .select({
      memberId: productLineMember.id,
      position: productLineMember.position,
      role: productLineMember.role,
      bomId: bomTemplate.id,
      bomCode: bomTemplate.code,
      bomName: bomTemplate.name,
      bomStatus: bomTemplate.status,
      targetQty: bomTemplate.targetQty,
      parentItemSku: item.sku,
      parentItemName: item.name,
      componentCount: sql<number>`(
        SELECT count(*)::int FROM app.bom_line l WHERE l.template_id = ${bomTemplate.id}
      )`,
    })
    .from(productLineMember)
    .innerJoin(bomTemplate, eq(bomTemplate.id, productLineMember.bomTemplateId))
    .leftJoin(item, eq(item.id, bomTemplate.parentItemId))
    .where(eq(productLineMember.productLineId, productLineId))
    .orderBy(asc(productLineMember.position));

  return rows as ProductLineMemberRow[];
}

export async function addProductLineMember(
  productLineId: string,
  bomTemplateId: string,
) {
  const [maxPos] = await db
    .select({ max: sql<number>`COALESCE(MAX(position), 0)` })
    .from(productLineMember)
    .where(eq(productLineMember.productLineId, productLineId));

  const [row] = await db
    .insert(productLineMember)
    .values({
      productLineId,
      bomTemplateId,
      position: (maxPos?.max ?? 0) + 1,
      role: "MAIN",
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function removeProductLineMember(
  productLineId: string,
  bomTemplateId: string,
) {
  await db
    .delete(productLineMember)
    .where(
      and(
        eq(productLineMember.productLineId, productLineId),
        eq(productLineMember.bomTemplateId, bomTemplateId),
      ),
    );
}

/** Lấy đơn hàng liên quan (có BOM thuộc product line này). */
export async function getProductLineOrders(
  productLineId: string,
  limit = 20,
) {
  const memberBomIds = db
    .select({ bomId: productLineMember.bomTemplateId })
    .from(productLineMember)
    .where(eq(productLineMember.productLineId, productLineId));

  const rows = await db
    .select({
      id: salesOrder.id,
      code: salesOrder.orderNo,
      customer: salesOrder.customerName,
      status: salesOrder.status,
      dueDate: salesOrder.dueDate,
      createdAt: salesOrder.createdAt,
    })
    .from(salesOrder)
    .where(
      sql`EXISTS (
        SELECT 1 FROM app.bom_snapshot_line sl
        WHERE sl.sales_order_id = ${salesOrder.id}
          AND sl.bom_template_id IN (${memberBomIds})
      )`,
    )
    .orderBy(desc(salesOrder.createdAt))
    .limit(limit);

  return rows;
}

/** Lấy work orders liên quan. */
export async function getProductLineWorkOrders(
  productLineId: string,
  limit = 20,
) {
  const memberBomIds = db
    .select({ bomId: productLineMember.bomTemplateId })
    .from(productLineMember)
    .where(eq(productLineMember.productLineId, productLineId));

  const rows = await db
    .select({
      id: workOrder.id,
      code: workOrder.woNo,
      status: workOrder.status,
      priority: workOrder.priority,
      plannedStart: workOrder.plannedStart,
      plannedEnd: workOrder.plannedEnd,
      createdAt: workOrder.createdAt,
    })
    .from(workOrder)
    .where(
      sql`EXISTS (
        SELECT 1 FROM app.bom_snapshot_line sl
        WHERE sl.sales_order_id IN (
          SELECT so.id FROM app.sales_order so
          WHERE EXISTS (
            SELECT 1 FROM app.bom_snapshot_line sl2
            WHERE sl2.sales_order_id = so.id
              AND sl2.bom_template_id IN (${memberBomIds})
          )
        )
      )`,
    )
    .orderBy(desc(workOrder.createdAt))
    .limit(limit);

  return rows;
}

/** Lấy purchase orders liên quan (theo supplier_item_code trong bom_line). */
export async function getProductLinePurchaseOrders(
  productLineId: string,
  limit = 20,
) {
  const rows = await db
    .select({
      id: purchaseOrder.id,
      code: purchaseOrder.poNo,
      supplierId: purchaseOrder.supplierId,
      status: purchaseOrder.status,
      totalAmount: purchaseOrder.totalAmount,
      expectedDelivery: purchaseOrder.expectedEta,
      createdAt: purchaseOrder.createdAt,
    })
    .from(purchaseOrder)
    .where(
      sql`EXISTS (
        SELECT 1 FROM app.purchase_order_line pol
        JOIN app.bom_snapshot_line sl ON sl.component_item_id = pol.item_id
        JOIN app.product_line_member plm ON plm.bom_template_id = sl.bom_template_id
        WHERE pol.purchase_order_id = ${purchaseOrder.id}
          AND plm.product_line_id = ${productLineId}
      )`,
    )
    .orderBy(desc(purchaseOrder.createdAt))
    .limit(limit);

  return rows;
}
