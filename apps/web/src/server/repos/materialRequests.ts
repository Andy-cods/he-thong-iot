import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  item,
  materialRequest,
  materialRequestLine,
  userAccount,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { currentYymm, genDocNo } from "./_docNumber";
import { listGoodsIssuesForMaterialRequest } from "./goodsIssues";

/**
 * V3.3 — Material Request repository.
 *
 * Quản lý yêu cầu xuất kho linh kiện (engineer → warehouse).
 */

export type MaterialRequestStatus =
  | "PENDING"
  | "PICKING"
  | "READY"
  // V4.1 Đợt 1b — đã giao một phần qua phiếu xuất kho.
  | "PARTIAL"
  | "DELIVERED"
  | "CANCELLED";

export const MATERIAL_REQUEST_STATUSES: MaterialRequestStatus[] = [
  "PENDING",
  "PICKING",
  "READY",
  "PARTIAL",
  "DELIVERED",
  "CANCELLED",
];

/** Lỗi claim trạng thái (người khác vừa đổi) → route trả 409. */
export class MaterialRequestConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialRequestConflictError";
  }
}

export interface ListRequestsQuery {
  status?: MaterialRequestStatus[];
  requestedBy?: string;
  bomTemplateId?: string;
  /** V3.13 — lọc phiếu theo đúng 1 ngày (`YYYY-MM-DD`, giờ Asia/Ho_Chi_Minh). */
  date?: string;
  /** V3.16 — lọc khoảng ngày [from, to] (`YYYY-MM-DD`, giờ Asia/Ho_Chi_Minh). Có thể chỉ truyền 1 đầu. */
  from?: string;
  to?: string;
  /** V3.16 — bảng phẳng thay thư mục: sort theo Ngày tạo. Mặc định "desc". */
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
}

/** V3.13 — WHERE created_at (giờ +07) rơi vào đúng ngày `YYYY-MM-DD`. */
function dayFilter(date: string): SQL {
  return sql`(${materialRequest.createdAt} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ${date}::date`;
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
  if (q.date) {
    where.push(dayFilter(q.date));
  }
  // V3.16 — bảng phẳng thay thư mục: filter khoảng ngày [from, to] (1 hoặc
  // cả 2 đầu). rangeFilter() đã có sẵn (dùng cho export range) — hàm khai
  // báo `function` nên hoisted, gọi được dù định nghĩa ở dưới trong file.
  if (q.from && q.to) {
    where.push(rangeFilter(q.from, q.to));
  } else if (q.from) {
    where.push(
      sql`(${materialRequest.createdAt} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= ${q.from}::date`,
    );
  } else if (q.to) {
    where.push(
      sql`(${materialRequest.createdAt} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= ${q.to}::date`,
    );
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
      .orderBy(
        q.sortDir === "asc"
          ? asc(materialRequest.createdAt)
          : desc(materialRequest.createdAt),
      )
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

export interface MaterialRequestDayBucket {
  day: string;
  count: number;
  statuses: Record<MaterialRequestStatus, number>;
}

/**
 * V3.13 — Gom số phiếu theo ngày (giờ +07) để dựng "thư mục ngày". Trả 1 dòng
 * mỗi ngày kèm tách nhỏ theo trạng thái. Dữ liệu nhỏ (1 dòng/ngày) → client gom
 * tiếp thành tháng.
 */
export async function listMaterialRequestDayBuckets(q: {
  requestedBy?: string;
}): Promise<MaterialRequestDayBucket[]> {
  const where: SQL[] = [];
  if (q.requestedBy) {
    where.push(eq(materialRequest.requestedBy, q.requestedBy));
  }
  const whereExpr = where.length > 0 ? and(...where) : sql`true`;
  const dayExpr = sql<string>`to_char(${materialRequest.createdAt} AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')`;

  const rows = await db
    .select({
      day: dayExpr,
      count: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${materialRequest.status} = 'PENDING')::int`,
      picking: sql<number>`count(*) filter (where ${materialRequest.status} = 'PICKING')::int`,
      ready: sql<number>`count(*) filter (where ${materialRequest.status} = 'READY')::int`,
      partial: sql<number>`count(*) filter (where ${materialRequest.status} = 'PARTIAL')::int`,
      delivered: sql<number>`count(*) filter (where ${materialRequest.status} = 'DELIVERED')::int`,
      cancelled: sql<number>`count(*) filter (where ${materialRequest.status} = 'CANCELLED')::int`,
    })
    .from(materialRequest)
    .where(whereExpr)
    .groupBy(dayExpr)
    .orderBy(desc(dayExpr));

  return rows.map((r) => ({
    day: r.day,
    count: r.count,
    statuses: {
      PENDING: r.pending,
      PICKING: r.picking,
      READY: r.ready,
      PARTIAL: r.partial,
      DELIVERED: r.delivered,
      CANCELLED: r.cancelled,
    },
  }));
}

/** V3.14 — WHERE created_at (giờ +07) nằm trong khoảng [from, to] (cả 2 đầu, `YYYY-MM-DD`). */
function rangeFilter(from: string, to: string): SQL {
  return sql`(${materialRequest.createdAt} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN ${from}::date AND ${to}::date`;
}

export interface MaterialRequestSlipLine {
  lineNo: number;
  itemSku: string | null;
  itemName: string | null;
  itemUom: string | null;
  requestedQty: string;
  pickedQty: string;
  deliveredQty: string;
  notes: string | null;
}

export interface MaterialRequestSlip {
  id: string;
  requestNo: string;
  status: MaterialRequestStatus;
  requestedByName: string | null;
  requestedByUsername: string | null;
  notes: string | null;
  createdAt: Date;
  lines: MaterialRequestSlipLine[];
}

/** V3.14 — Cap số phiếu export 1 lần (tránh workbook khổng lồ nếu range quá rộng). */
const RANGE_EXPORT_CAP = 2000;

/**
 * V3.14 — Lấy toàn bộ phiếu (kèm lines) tạo trong khoảng [from, to] (giờ +07)
 * để export Excel "mỗi phiếu 1 sheet". Không phân trang — lines lấy 1 query
 * bulk (tránh N+1).
 */
export async function listMaterialRequestsInRange(q: {
  from: string;
  to: string;
  requestedBy?: string;
}): Promise<MaterialRequestSlip[]> {
  const where: SQL[] = [rangeFilter(q.from, q.to)];
  if (q.requestedBy) where.push(eq(materialRequest.requestedBy, q.requestedBy));
  const whereExpr = and(...where);

  const headers = await db
    .select({
      id: materialRequest.id,
      requestNo: materialRequest.requestNo,
      status: materialRequest.status,
      requestedByName: userAccount.fullName,
      requestedByUsername: userAccount.username,
      notes: materialRequest.notes,
      createdAt: materialRequest.createdAt,
    })
    .from(materialRequest)
    .leftJoin(userAccount, eq(userAccount.id, materialRequest.requestedBy))
    .where(whereExpr)
    .orderBy(materialRequest.createdAt)
    .limit(RANGE_EXPORT_CAP);

  const ids = headers.map((h) => h.id);
  const linesByRequest = new Map<string, MaterialRequestSlipLine[]>();
  if (ids.length > 0) {
    const lineRows = await db
      .select({
        requestId: materialRequestLine.requestId,
        lineNo: materialRequestLine.lineNo,
        itemSku: item.sku,
        itemName: item.name,
        itemUom: item.uom,
        requestedQty: materialRequestLine.requestedQty,
        pickedQty: materialRequestLine.pickedQty,
        deliveredQty: materialRequestLine.deliveredQty,
        notes: materialRequestLine.notes,
      })
      .from(materialRequestLine)
      .leftJoin(item, eq(item.id, materialRequestLine.itemId))
      .where(inArray(materialRequestLine.requestId, ids))
      .orderBy(materialRequestLine.requestId, materialRequestLine.lineNo);
    for (const l of lineRows) {
      const arr = linesByRequest.get(l.requestId) ?? [];
      arr.push({
        lineNo: l.lineNo,
        itemSku: l.itemSku,
        itemName: l.itemName,
        itemUom: l.itemUom,
        requestedQty: l.requestedQty,
        pickedQty: l.pickedQty,
        deliveredQty: l.deliveredQty,
        notes: l.notes,
      });
      linesByRequest.set(l.requestId, arr);
    }
  }

  return headers.map((h) => ({
    ...h,
    status: h.status as MaterialRequestStatus,
    lines: linesByRequest.get(h.id) ?? [],
  }));
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

  // V4.1 Đợt 1b — SL còn phải giao + "Khả dụng" (issuable_qty — chỉ lô
  // AVAILABLE trừ giữ chỗ, view chuẩn 0059) + các phiếu xuất đã lập.
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const issuableByItem = new Map<string, number>();
  if (itemIds.length > 0) {
    const stock = (await db.execute(sql`
      SELECT item_id::text AS item_id, COALESCE(issuable_qty, 0)::text AS issuable_qty
      FROM app.v_item_stock
      WHERE item_id IN (${sql.join(
        itemIds.map((x) => sql`${x}::uuid`),
        sql`, `,
      )})
    `)) as unknown as Array<{ item_id: string; issuable_qty: string }>;
    for (const r of stock) issuableByItem.set(r.item_id, Number(r.issuable_qty) || 0);
  }
  const goodsIssues = await listGoodsIssuesForMaterialRequest(id);

  return {
    ...header,
    lines: lines.map((l) => ({
      ...l,
      remainingQty: String(
        Math.max(0, (Number(l.requestedQty) || 0) - (Number(l.deliveredQty) || 0)),
      ),
      issuableQty: String(issuableByItem.get(l.itemId) ?? 0),
    })),
    goodsIssues,
  };
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
    // V3.11.4 (audit 1.38/1.21) — advisory lock + MAX(seq)+1 thay COUNT(*)+1.
    const requestNo = await genDocNo(tx, {
      table: "app.material_request",
      column: "request_no",
      prefix: `MR-${currentYymm()}`,
      seqPart: 3,
    });

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

/**
 * Đổi trạng thái phiếu yêu cầu (Kho chuẩn bị / huỷ / đóng phiếu giao dở).
 *
 * V4.1 Đợt 1b (KHO-17/35):
 *  - BỎ tham số `lines` — trước đây client gửi được SL soạn/giao của dòng
 *    BẤT KỲ (kể cả phiếu khác). SL giao nay chỉ đổi qua phiếu xuất kho.
 *  - Claim có điều kiện `status = fromStatus` → 2 người bấm cùng lúc: người
 *    sau nhận MaterialRequestConflictError (409) thay vì ghi đè.
 *  - `pickedBy`/`pickedAt` giữ người soạn đầu tiên (COALESCE), không ghi đè.
 *  - DELIVERED/PARTIAL KHÔNG đi qua đây (chỉ `issueMaterialRequest`).
 */
export async function updateMaterialRequestStatus(
  id: string,
  fromStatus: MaterialRequestStatus,
  toStatus: Exclude<MaterialRequestStatus, "DELIVERED" | "PARTIAL">,
  actorUserId: string,
  payload?: { warehouseNotes?: string | null },
) {
  const now = new Date();
  const update: Record<string, unknown> = { status: toStatus, updatedAt: now };
  if (toStatus === "PICKING" || toStatus === "READY") {
    update.pickedBy = sql`COALESCE(${materialRequest.pickedBy}, ${actorUserId}::uuid)`;
    update.pickedAt = sql`COALESCE(${materialRequest.pickedAt}, now())`;
  }
  if (toStatus === "READY") {
    update.readyAt = now;
  }
  if (payload?.warehouseNotes !== undefined) {
    update.warehouseNotes = payload.warehouseNotes;
  }

  const [updated] = await db
    .update(materialRequest)
    .set(update)
    .where(
      and(eq(materialRequest.id, id), eq(materialRequest.status, fromStatus)),
    )
    .returning();
  if (!updated) {
    throw new MaterialRequestConflictError(
      "Phiếu yêu cầu vừa được người khác cập nhật — vui lòng tải lại trang.",
    );
  }
  return updated;
}
