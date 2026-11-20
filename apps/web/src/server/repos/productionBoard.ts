import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  bomTemplate,
  productionBoardHistory,
  productionBoardItem,
  userAccount,
  type ProductionBoardItem,
  type ProductionBoardStatus,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import {
  computeBoardValueSummary,
  type BoardValueSummary,
} from "@/lib/finance-overview-policy";
import {
  compareOpenBoardRows,
  findDuplicateBoardItem,
  planBoardSyncFromBom,
  type BoardActivationExtras,
} from "@/lib/production-board-policy";
import { normalizeBoardProductCode } from "@iot/shared";

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

  // Ghim → hạn gần nhất (quá hạn nổi lên) → chưa có hạn xếp sau → trạng thái → STT.
  active.sort(compareOpenBoardRows);

  return [...active, ...completed];
}

/**
 * TASK-20261001 (việc 1) — lấy 1 mã hàng theo id, DÙNG cho API chi tiết
 * `GET /api/production-board/[id]` (prefill form Sửa — danh sách GET
 * `/api/production-board` không còn trả `unitPrice` nữa).
 */
export async function getBoardItemById(id: string): Promise<BoardItemRow | null> {
  const [row] = await db
    .select({
      item: productionBoardItem,
      updatedByName: userAccount.fullName,
    })
    .from(productionBoardItem)
    .leftJoin(userAccount, eq(userAccount.id, productionBoardItem.updatedBy))
    .where(eq(productionBoardItem.id, id))
    .limit(1);
  if (!row) return null;
  return { ...row.item, updatedByName: row.updatedByName ?? null };
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
  /** V4.4.2 — Đơn giá bán. `undefined` = không set (role không được nhập giá). */
  unitPrice?: number | null;
  /** Migration 0088 — BOM nguồn (dòng tự tạo khi BOM kích hoạt). */
  bomTemplateId?: string | null;
  /** Ghi chú cho dòng history "create" (mặc định "<mã> · <trạng thái>"). */
  createNote?: string;
  userId: string | null;
}

/**
 * V4.5 QA-C P2-2 — tạo/sửa mã hàng trùng CẢ `productCode` lẫn `rfqNo` (coi
 * `rfqNo` rỗng/null là cùng 1 giá trị "không có RFQ") bị chặn: trước đây
 * không kiểm gì, tạo được 2 dòng tiến độ riêng cho cùng 1 mã hàng.
 */
export class BoardItemDuplicateError extends Error {
  constructor(
    public readonly existingId: string,
    productCode: string,
  ) {
    super(
      `Mã hàng "${productCode}" đã tồn tại trên Bảng sản xuất (cùng Mã hàng + Số RFQ) — kiểm tra lại trước khi tạo mới.`,
    );
    this.name = "BoardItemDuplicateError";
  }
}

async function assertNoDuplicateBoardItem(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  productCode: string,
  rfqNo: string | null,
  excludeId?: string,
): Promise<void> {
  // Query NARROW theo productCode (rẻ — mã hàng hiếm khi trùng hàng loạt),
  // quyết định trùng hay không bằng hàm THUẦN (test vitest riêng) — xem
  // `lib/production-board-policy.ts` (findDuplicateBoardItem/isSameBoardItemIdentity).
  const candidates = await tx
    .select({ id: productionBoardItem.id, productCode: productionBoardItem.productCode, rfqNo: productionBoardItem.rfqNo })
    .from(productionBoardItem)
    .where(
      and(
        eq(productionBoardItem.productCode, productCode),
        excludeId ? ne(productionBoardItem.id, excludeId) : undefined,
      ),
    );
  const existing = findDuplicateBoardItem({ productCode, rfqNo }, candidates);
  if (existing) throw new BoardItemDuplicateError(existing.id, productCode);
}

export async function createBoardItem(
  input: CreateBoardItemInput,
): Promise<ProductionBoardItem> {
  return db.transaction(async (tx) => {
    await assertNoDuplicateBoardItem(tx, input.productCode, input.rfqNo ?? null);

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
        unitPrice:
          input.unitPrice === undefined
            ? null
            : input.unitPrice === null
              ? null
              : String(input.unitPrice),
        completedAt:
          input.status === "COMPLETED" || input.status === "DELIVERED"
            ? sql`now()`
            : null,
        bomTemplateId: input.bomTemplateId ?? null,
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
      newValue: input.createNote ?? `${row.productCode} · ${row.status}`,
      changedBy: input.userId,
    });

    return row;
  });
}

export type BoardSyncResult =
  | {
      action: "created" | "linked" | "updated" | "unchanged";
      itemId: string;
      productCode: string;
      productName: string;
      hasDeadline: boolean;
    }
  | { action: "skipped"; reason: string; productCode: string };

/**
 * BOM vừa chuyển "Đang dùng" → đảm bảo có 1 dòng Bảng sản xuất (không nhân
 * đôi). Quyết định ở `planBoardSyncFromBom` (thuần, có test); ở đây chỉ nạp
 * ứng viên + ghi DB + history. Gọi qua `services/boardFromBom.ts`.
 */
export async function syncBoardFromBom(
  templateId: string,
  extras: BoardActivationExtras,
  userId: string | null,
): Promise<BoardSyncResult | null> {
  const [tpl] = await db
    .select({
      id: bomTemplate.id,
      code: bomTemplate.code,
      name: bomTemplate.name,
      targetQty: bomTemplate.targetQty,
      metadata: bomTemplate.metadata,
    })
    .from(bomTemplate)
    .where(eq(bomTemplate.id, templateId))
    .limit(1);
  if (!tpl) return null;

  const norm = normalizeBoardProductCode(tpl.code);
  const like = norm.replace(/[\\%_]/g, "\\$&") + "%";
  const candidates = await db
    .select({
      id: productionBoardItem.id,
      productCode: productionBoardItem.productCode,
      rfqNo: productionBoardItem.rfqNo,
      productName: productionBoardItem.productName,
      customer: productionBoardItem.customer,
      qtyPlanned: productionBoardItem.qtyPlanned,
      status: productionBoardItem.status,
      deadline: productionBoardItem.deadline,
      bomTemplateId: productionBoardItem.bomTemplateId,
    })
    .from(productionBoardItem)
    .where(
      sql`${productionBoardItem.bomTemplateId} = ${templateId}
        OR UPPER(${productionBoardItem.productCode}) LIKE ${like}`,
    )
    .orderBy(desc(productionBoardItem.updatedAt));

  const plan = planBoardSyncFromBom(tpl, candidates, extras);

  if (plan.action === "none") {
    const row = candidates.find((c) => c.id === plan.itemId)!;
    return {
      action: "unchanged",
      itemId: plan.itemId,
      productCode: row.productCode,
      productName: row.productName,
      hasDeadline: !!row.deadline,
    };
  }

  if (plan.action === "create") {
    try {
      const row = await createBoardItem({
        ...plan.values,
        status: "QUEUED",
        userId,
        createNote: `${plan.values.productCode} · QUEUED (tự tạo khi kích hoạt BOM ${tpl.code})`,
      });
      return {
        action: "created",
        itemId: row.id,
        productCode: row.productCode,
        productName: row.productName,
        hasDeadline: !!row.deadline,
      };
    } catch (err) {
      if (err instanceof BoardItemDuplicateError) {
        // Chỉ còn dòng ĐÃ GIAO cùng mã + RFQ → không tạo trùng; QC thêm tay với Số RFQ mới.
        return {
          action: "skipped",
          productCode: plan.values.productCode,
          reason: `Bảng sản xuất đã có dòng đã giao cùng mã ${plan.values.productCode} và cùng Số RFQ — không tạo trùng. Thêm tay với Số RFQ mới nếu là đơn mới.`,
        };
      }
      throw err;
    }
  }

  const before = candidates.find((c) => c.id === plan.itemId)!;
  await db.transaction(async (tx) => {
    const p = plan.patch;
    await tx
      .update(productionBoardItem)
      .set({
        ...(p.bomTemplateId !== undefined ? { bomTemplateId: p.bomTemplateId } : {}),
        ...(p.productName !== undefined ? { productName: p.productName } : {}),
        ...(p.qtyPlanned !== undefined ? { qtyPlanned: String(p.qtyPlanned) } : {}),
        ...(p.deadline !== undefined ? { deadline: p.deadline } : {}),
        ...(p.rfqNo !== undefined ? { rfqNo: p.rfqNo } : {}),
        ...(p.customer !== undefined ? { customer: p.customer } : {}),
        updatedBy: userId,
      })
      .where(eq(productionBoardItem.id, plan.itemId));
    await tx.insert(productionBoardHistory).values(
      plan.history.map((h) => ({
        itemId: plan.itemId,
        field: h.field.slice(0, 32),
        oldValue: h.oldValue,
        newValue: h.newValue,
        changedBy: userId,
      })),
    );
  });
  const onlyLink = plan.history.every((h) => h.field === "bom_link");
  return {
    action: onlyLink ? "linked" : "updated",
    itemId: plan.itemId,
    productCode: before.productCode,
    productName: plan.patch.productName ?? before.productName,
    hasDeadline: !!(plan.patch.deadline ?? before.deadline),
  };
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
  /** V4.4.2 — `undefined` = không đổi (route đã lọc field theo quyền trước khi gọi repo). */
  unitPrice?: number | null;
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

    // V4.5 QA-C P2-2 — chỉ cần kiểm lại khi productCode HOẶC rfqNo đổi (giữ
    // nguyên cả 2 thì không thể tự trùng với chính nó).
    if (input.productCode !== undefined || input.rfqNo !== undefined) {
      await assertNoDuplicateBoardItem(
        tx,
        input.productCode ?? before.productCode,
        (input.rfqNo !== undefined ? input.rfqNo : before.rfqNo) ?? null,
        id,
      );
    }

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
    if (input.unitPrice !== undefined)
      patch.unitPrice = input.unitPrice === null ? null : String(input.unitPrice);

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
    // V4.4.2 — ghi lịch sử đổi đơn giá bán (chỉ route gọi tới khi actor có
    // quyền `canSeeOrderValue`; lọc field hiển thị cho vai khác ở route history).
    if (input.unitPrice !== undefined) {
      const oldPrice = before.unitPrice === null ? null : String(before.unitPrice);
      const newPrice = input.unitPrice === null ? null : String(input.unitPrice);
      if (oldPrice !== newPrice) {
        histories.push({
          field: "unit_price",
          oldV: oldPrice ?? "—",
          newV: newPrice ?? "—",
        });
      }
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

/**
 * V4.4.2 — Việc 2: tổng giá trị Bảng sản xuất cho 2 ô "Đang sản xuất"/"Dự
 * trù thu" ở Tổng quan Tài chính. Chỉ fetch DỮ LIỆU THÔ ở đây — công thức
 * tính (hàm thuần, có vitest) nằm ở `lib/finance-overview-policy.ts`.
 */
export async function getBoardValueSummary(): Promise<BoardValueSummary> {
  const rows = await db
    .select({
      status: productionBoardItem.status,
      qtyPlanned: productionBoardItem.qtyPlanned,
      qtyDone: productionBoardItem.qtyDone,
      unitPrice: productionBoardItem.unitPrice,
    })
    .from(productionBoardItem)
    .where(
      // TASK-20261001 — bỏ QUEUED (chưa bắt đầu gia công, chưa đủ chắc chắn
      // để tính vào "Dự trù thu" — xem lib/finance-overview-policy.ts).
      inArray(productionBoardItem.status, ["IN_PROGRESS", "QC", "COMPLETED"]),
    );
  return computeBoardValueSummary(rows);
}
