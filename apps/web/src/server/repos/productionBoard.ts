import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  productionBoardHistory,
  productionBoardItem,
  userAccount,
  type ProductionBoardItem,
  type ProductionBoardStatus,
} from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * V3.8 — Production Board repository.
 *
 * Bảng điều hành sản xuất (kiểu "bảng chờ chuyến bay" chiếu TV xưởng).
 * Tổ QC (role `qc`) + admin CRUD; còn lại read-only.
 *
 * Sắp xếp board: pinned trước → seq ASC → deadline ASC (gần hết hạn lên trên)
 * → mới tạo trước. Mã COMPLETED/DELIVERED đẩy xuống cuối (xử lý ở UI grouping).
 */

export interface BoardItemRow extends ProductionBoardItem {
  updatedByName: string | null;
}

/** Thứ tự trạng thái để sort (đang chạy nổi nhất). */
const STATUS_ORDER: Record<ProductionBoardStatus, number> = {
  IN_PROGRESS: 0,
  QC: 1,
  QUEUED: 2,
  COMPLETED: 3,
  DELIVERED: 4,
};

/**
 * Lấy toàn bộ board cho màn hình TV.
 * @param completedLimit số mã đã hoàn thành gần nhất giữ lại (mặc định 5).
 *        Mã DELIVERED quá hạn cũ không trả (chỉ giữ recent).
 */
export async function listBoardItems(opts?: {
  completedLimit?: number;
  includeDelivered?: boolean;
}): Promise<BoardItemRow[]> {
  const completedLimit = opts?.completedLimit ?? 5;

  // Active = QUEUED / IN_PROGRESS / QC — luôn hiện hết.
  const activeStatuses: ProductionBoardStatus[] = [
    "QUEUED",
    "IN_PROGRESS",
    "QC",
  ];

  const rows = await db
    .select({
      item: productionBoardItem,
      updatedByName: userAccount.fullName,
    })
    .from(productionBoardItem)
    .leftJoin(userAccount, eq(userAccount.id, productionBoardItem.updatedBy))
    .where(
      opts?.includeDelivered
        ? undefined
        : inArray(productionBoardItem.status, [
            ...activeStatuses,
            "COMPLETED",
            "DELIVERED",
          ]),
    )
    .orderBy(
      desc(productionBoardItem.isPinned),
      asc(productionBoardItem.seq),
      desc(productionBoardItem.updatedAt),
    );

  const mapped: BoardItemRow[] = rows.map((r) => ({
    ...r.item,
    updatedByName: r.updatedByName ?? null,
  }));

  // Tách active vs completed; completed chỉ giữ N gần nhất theo completedAt.
  const active = mapped.filter((r) =>
    activeStatuses.includes(r.status),
  );
  const completed = mapped
    .filter((r) => r.status === "COMPLETED" || r.status === "DELIVERED")
    .sort((a, b) => {
      const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, completedLimit);

  // Sort active theo STATUS_ORDER rồi pinned/seq.
  active.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (so !== 0) return so;
    return a.seq - b.seq;
  });

  return [...active, ...completed];
}

/** Đếm theo trạng thái cho widget homepage. */
export async function countBoardByStatus(): Promise<
  Record<ProductionBoardStatus, number>
> {
  const rows = (await db
    .select({
      status: productionBoardItem.status,
      n: sql<number>`COUNT(*)::int`,
    })
    .from(productionBoardItem)
    .groupBy(productionBoardItem.status)) as Array<{
    status: ProductionBoardStatus;
    n: number;
  }>;
  const out: Record<ProductionBoardStatus, number> = {
    QUEUED: 0,
    IN_PROGRESS: 0,
    QC: 0,
    COMPLETED: 0,
    DELIVERED: 0,
  };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export interface CreateBoardItemInput {
  productCode: string;
  rfqNo?: string | null;
  productName: string;
  customer?: string | null;
  qtyPlanned?: number;
  qtyDone?: number;
  uom?: string | null;
  status?: ProductionBoardStatus;
  deadline?: string | null;
  currentStage?: string | null;
  notes?: string | null;
  isPinned?: boolean;
  seq?: number;
  userId: string | null;
}

export async function createBoardItem(
  input: CreateBoardItemInput,
): Promise<ProductionBoardItem> {
  return db.transaction(async (tx) => {
    // seq mặc định = MAX(seq)+1 nếu không truyền.
    let seq = input.seq;
    if (seq === undefined) {
      const [maxRow] = (await tx.execute(
        sql`SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM app.production_board_item`,
      )) as unknown as Array<{ next: number }>;
      seq = maxRow?.next ?? 1;
    }

    const inserted = await tx
      .insert(productionBoardItem)
      .values({
        seq,
        productCode: input.productCode,
        rfqNo: input.rfqNo ?? null,
        productName: input.productName,
        customer: input.customer ?? null,
        qtyPlanned: String(input.qtyPlanned ?? 0),
        qtyDone: String(input.qtyDone ?? 0),
        uom: input.uom ?? "Pcs",
        status: input.status ?? "QUEUED",
        deadline: input.deadline ?? null,
        currentStage: input.currentStage ?? null,
        notes: input.notes ?? null,
        isPinned: input.isPinned ?? false,
        completedAt:
          input.status === "COMPLETED" || input.status === "DELIVERED"
            ? sql`now()`
            : null,
        createdBy: input.userId,
        updatedBy: input.userId,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error("Insert production board item failed");

    await tx.insert(productionBoardHistory).values({
      itemId: row.id,
      field: "create",
      oldValue: null,
      newValue: `${row.productCode} · ${row.status}`,
      changedBy: input.userId,
    });

    return row;
  });
}

export interface UpdateBoardItemInput {
  productCode?: string;
  rfqNo?: string | null;
  productName?: string;
  customer?: string | null;
  qtyPlanned?: number;
  qtyDone?: number;
  uom?: string | null;
  status?: ProductionBoardStatus;
  deadline?: string | null;
  currentStage?: string | null;
  notes?: string | null;
  isPinned?: boolean;
  seq?: number;
  userId: string | null;
}

export class BoardItemNotFoundError extends Error {
  constructor() {
    super("Mã hàng không tồn tại trên bảng.");
    this.name = "BoardItemNotFoundError";
  }
}

export async function updateBoardItem(
  id: string,
  input: UpdateBoardItemInput,
): Promise<ProductionBoardItem> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(productionBoardItem)
      .where(eq(productionBoardItem.id, id))
      .limit(1);
    if (!before) throw new BoardItemNotFoundError();

    const patch: Partial<typeof productionBoardItem.$inferInsert> = {
      updatedBy: input.userId,
    };
    if (input.productCode !== undefined) patch.productCode = input.productCode;
    if (input.rfqNo !== undefined) patch.rfqNo = input.rfqNo;
    if (input.productName !== undefined) patch.productName = input.productName;
    if (input.customer !== undefined) patch.customer = input.customer;
    if (input.qtyPlanned !== undefined)
      patch.qtyPlanned = String(input.qtyPlanned);
    if (input.qtyDone !== undefined) patch.qtyDone = String(input.qtyDone);
    if (input.uom !== undefined) patch.uom = input.uom;
    if (input.status !== undefined) patch.status = input.status;
    if (input.deadline !== undefined) patch.deadline = input.deadline;
    if (input.currentStage !== undefined)
      patch.currentStage = input.currentStage;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.isPinned !== undefined) patch.isPinned = input.isPinned;
    if (input.seq !== undefined) patch.seq = input.seq;

    const updated = await tx
      .update(productionBoardItem)
      .set(patch)
      .where(eq(productionBoardItem.id, id))
      .returning();
    const row = updated[0];
    if (!row) throw new BoardItemNotFoundError();

    // Ghi history cho các field quan trọng.
    const histories: Array<{ field: string; oldV: string; newV: string }> = [];
    if (input.status !== undefined && input.status !== before.status) {
      histories.push({
        field: "status",
        oldV: before.status,
        newV: input.status,
      });
    }
    if (
      input.qtyDone !== undefined &&
      String(input.qtyDone) !== String(before.qtyDone)
    ) {
      histories.push({
        field: "qty_done",
        oldV: String(before.qtyDone),
        newV: String(input.qtyDone),
      });
    }
    if (histories.length > 0) {
      await tx.insert(productionBoardHistory).values(
        histories.map((h) => ({
          itemId: id,
          field: h.field,
          oldValue: h.oldV,
          newValue: h.newV,
          changedBy: input.userId,
        })),
      );
    }

    return row;
  });
}

export async function deleteBoardItem(
  id: string,
  userId: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ code: productionBoardItem.productCode })
      .from(productionBoardItem)
      .where(eq(productionBoardItem.id, id))
      .limit(1);
    if (!before) throw new BoardItemNotFoundError();
    // History cascade-deletes với item; ghi 1 dòng audit ở entity khác không
    // cần — xóa là xóa hẳn. (Nếu cần audit-trail bền hơn, dùng writeAudit.)
    await tx
      .delete(productionBoardItem)
      .where(eq(productionBoardItem.id, id));
  });
}

export async function getBoardHistory(
  id: string,
): Promise<
  Array<{
    id: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    changedAt: Date;
    changedByName: string | null;
  }>
> {
  const rows = await db
    .select({
      id: productionBoardHistory.id,
      field: productionBoardHistory.field,
      oldValue: productionBoardHistory.oldValue,
      newValue: productionBoardHistory.newValue,
      changedAt: productionBoardHistory.changedAt,
      changedByName: userAccount.fullName,
    })
    .from(productionBoardHistory)
    .leftJoin(
      userAccount,
      eq(userAccount.id, productionBoardHistory.changedBy),
    )
    .where(eq(productionBoardHistory.itemId, id))
    .orderBy(desc(productionBoardHistory.changedAt))
    .limit(100);
  return rows.map((r) => ({ ...r, changedByName: r.changedByName ?? null }));
}
