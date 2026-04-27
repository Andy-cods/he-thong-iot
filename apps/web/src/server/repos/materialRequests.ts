import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  item,
  materialRequest,
  materialRequestLine,
  userAccount,
} from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * V3.3 — Material Request repository.
 *
 * Quản lý yêu cầu xuất kho linh kiện (engineer → warehouse).
 */

export type MaterialRequestStatus =
  | "PENDING"
  | "PICKING"
  | "READY"
  | "DELIVERED"
  | "CANCELLED";

export interface ListRequestsQuery {
  status?: MaterialRequestStatus[];
  requestedBy?: string;
  bomTemplateId?: string;
  page: number;
  pageSize: number;
}

export async function listMaterialRequests(q: ListRequestsQuery) {
  const where: SQL[] = [];
  if (q.status && q.status.length > 0) {
    where.push(inArray(materialRequest.status, q.status));
  }
  if (q.requestedBy) {
    where.push(eq(materialRequest.requestedBy, q.requestedBy));
  }
  if (q.bomTemplateId) {
    where.push(eq(materialRequest.bomTemplateId, q.bomTemplateId));
  }

  const whereExpr = where.length > 0 ? and(...where) : sql`true`;
  const offset = (q.page - 1) * q.pageSize;

  const [totalRow, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(materialRequest)
      .where(whereExpr),
    db
      .select({
        id: materialRequest.id,
        requestNo: materialRequest.requestNo,
        bomTemplateId: materialRequest.bomTemplateId,
        woId: materialRequest.woId,
        status: materialRequest.status,
        requestedBy: materialRequest.requestedBy,
        requestedByName: userAccount.fullName,
        requestedByUsername: userAccount.username,
        pickedBy: materialRequest.pickedBy,
        deliveredTo: materialRequest.deliveredTo,
        pickedAt: materialRequest.pickedAt,
        readyAt: materialRequest.readyAt,
        deliveredAt: materialRequest.deliveredAt,
        notes: materialRequest.notes,
        warehouseNotes: materialRequest.warehouseNotes,
        createdAt: materialRequest.createdAt,
        updatedAt: materialRequest.updatedAt,
      })
      .from(materialRequest)
      .leftJoin(userAccount, eq(userAccount.id, materialRequest.requestedBy))
      .where(whereExpr)
      .orderBy(desc(materialRequest.createdAt))
      .limit(q.pageSize)
      .offset(offset),
  ]);

  // Đếm số lines cho mỗi request
  const ids = rows.map((r) => r.id);
  const lineCountsMap: Record<string, number> = {};
  if (ids.length > 0) {
    const counts = await db
      .select({
        requestId: materialRequestLine.requestId,
        c: sql<number>`count(*)::int`,
      })
      .from(materialRequestLine)
      .where(inArray(materialRequestLine.requestId, ids))
      .groupBy(materialRequestLine.requestId);
    for (const x of counts) lineCountsMap[x.requestId] = x.c;
  }

  return {
    rows: rows.map((r) => ({ ...r, lineCount: lineCountsMap[r.id] ?? 0 })),
    total: totalRow[0]?.count ?? 0,
  };
}

export async function getMaterialRequest(id: string) {
  const [header] = await db
    .select({
      id: materialRequest.id,
      requestNo: materialRequest.requestNo,
      bomTemplateId: materialRequest.bomTemplateId,
      woId: materialRequest.woId,
      status: materialRequest.status,
      requestedBy: materialRequest.requestedBy,
      requestedByName: userAccount.fullName,
      requestedByUsername: userAccount.username,
      pickedBy: materialRequest.pickedBy,
      deliveredTo: materialRequest.deliveredTo,
      pickedAt: materialRequest.pickedAt,
      readyAt: materialRequest.readyAt,
      deliveredAt: materialRequest.deliveredAt,
      notes: materialRequest.notes,
      warehouseNotes: materialRequest.warehouseNotes,
      createdAt: materialRequest.createdAt,
      updatedAt: materialRequest.updatedAt,
    })
    .from(materialRequest)
    .leftJoin(userAccount, eq(userAccount.id, materialRequest.requestedBy))
    .where(eq(materialRequest.id, id))
    .limit(1);

  if (!header) return null;

  const lines = await db
    .select({
      id: materialRequestLine.id,
      requestId: materialRequestLine.requestId,
      lineNo: materialRequestLine.lineNo,
      itemId: materialRequestLine.itemId,
      itemSku: item.sku,
      itemName: item.name,
      itemUom: item.uom,
      requestedQty: materialRequestLine.requestedQty,
      pickedQty: materialRequestLine.pickedQty,
      deliveredQty: materialRequestLine.deliveredQty,
      lotSerialId: materialRequestLine.lotSerialId,
      notes: materialRequestLine.notes,
    })
    .from(materialRequestLine)
    .leftJoin(item, eq(item.id, materialRequestLine.itemId))
    .where(eq(materialRequestLine.requestId, id))
    .orderBy(materialRequestLine.lineNo);

  return { ...header, lines };
}

export interface CreateMaterialRequestInput {
  requestedBy: string;
  bomTemplateId?: string | null;
  woId?: string | null;
  notes?: string | null;
  lines: Array<{
    itemId: string;
    requestedQty: number;
    notes?: string | null;
  }>;
}

export async function createMaterialRequest(input: CreateMaterialRequestInput) {
  return db.transaction(async (tx) => {
    // Generate request_no MR-yymm-NNNN
    const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
    const cntRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS c FROM app.material_request
      WHERE request_no LIKE ${`MR-${yymm}-%`}
    `);
    const cnt = (cntRows as unknown as Array<{ c: number }>)[0]?.c ?? 0;
    const requestNo = `MR-${yymm}-${(cnt + 1).toString().padStart(4, "0")}`;

    const [header] = await tx
      .insert(materialRequest)
      .values({
        requestNo,
        bomTemplateId: input.bomTemplateId ?? null,
        woId: input.woId ?? null,
        status: "PENDING",
        requestedBy: input.requestedBy,
        notes: input.notes ?? null,
      })
      .returning();
    if (!header) throw new Error("MR_INSERT_FAILED");

    const lineValues = input.lines.map((l, i) => ({
      requestId: header.id,
      lineNo: i + 1,
      itemId: l.itemId,
      requestedQty: String(l.requestedQty),
      notes: l.notes ?? null,
    }));
    if (lineValues.length > 0) {
      await tx.insert(materialRequestLine).values(lineValues);
    }
    return header;
  });
}

export async function updateMaterialRequestStatus(
  id: string,
  status: MaterialRequestStatus,
  actorUserId: string,
  payload?: { warehouseNotes?: string | null; lines?: Array<{ id: string; pickedQty?: number; deliveredQty?: number }> },
) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const update: Record<string, unknown> = { status, updatedAt: now };
    if (status === "PICKING") {
      update.pickedBy = actorUserId;
      update.pickedAt = now;
    } else if (status === "READY") {
      update.readyAt = now;
      if (!update.pickedBy) {
        update.pickedBy = actorUserId;
      }
    } else if (status === "DELIVERED") {
      update.deliveredTo = actorUserId;
      update.deliveredAt = now;
    }
    if (payload?.warehouseNotes !== undefined) {
      update.warehouseNotes = payload.warehouseNotes;
    }

    const [updated] = await tx
      .update(materialRequest)
      .set(update)
      .where(eq(materialRequest.id, id))
      .returning();

    // Update line qty if provided
    if (payload?.lines) {
      for (const ln of payload.lines) {
        const lineUpdate: Record<string, unknown> = {};
        if (ln.pickedQty !== undefined) lineUpdate.pickedQty = String(ln.pickedQty);
        if (ln.deliveredQty !== undefined) lineUpdate.deliveredQty = String(ln.deliveredQty);
        if (Object.keys(lineUpdate).length > 0) {
          await tx
            .update(materialRequestLine)
            .set(lineUpdate)
            .where(eq(materialRequestLine.id, ln.id));
        }
      }
    }

    return updated;
  });
}
