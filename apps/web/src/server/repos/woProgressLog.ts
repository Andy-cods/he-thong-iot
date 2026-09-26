import { and, desc, eq, sql } from "drizzle-orm";
import {
  woProgressLog,
  workOrder,
  workOrderLine,
  userAccount,
  type WoProgressLog,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { checkProgressLoggable, progressAffectsHeader } from "@/lib/wo-guards";

/**
 * V1.9 Phase 4 — repo nhật ký tiến độ WO (wo_progress_log).
 *
 * Side effect quan trọng: khi insert 1 PROGRESS_REPORT có qtyCompleted > 0
 * + workOrderLineId → cộng dồn vào work_order_line.completed_qty đồng thời
 * cộng vào work_order.good_qty / scrap_qty. Tất cả trong 1 transaction để
 * giữ consistency.
 */

export interface ProgressLogRow extends WoProgressLog {
  operatorUsername: string | null;
  operatorDisplayName: string | null;
}

export async function listProgressLog(
  woId: string,
  limit = 100,
): Promise<ProgressLogRow[]> {
  const rows = await db
    .select({
      log: woProgressLog,
      operatorUsername: userAccount.username,
      operatorDisplayName: userAccount.fullName,
    })
    .from(woProgressLog)
    .leftJoin(userAccount, eq(userAccount.id, woProgressLog.operatorId))
    .where(eq(woProgressLog.workOrderId, woId))
    .orderBy(desc(woProgressLog.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r.log,
    operatorUsername: r.operatorUsername,
    operatorDisplayName: r.operatorDisplayName,
  }));
}

export interface InsertProgressLogInput {
  workOrderId: string;
  workOrderLineId?: string | null;
  stepType: string;
  qtyCompleted?: number;
  qtyScrap?: number;
  notes?: string | null;
  photoUrl?: string | null;
  station?: string | null;
  durationMinutes?: number | null;
  operatorId: string | null;
}

/** V4.1 SX-12/13 — lỗi nghiệp vụ nhật ký tiến độ (map HTTP ở route). */
export class ProgressLogError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
  ) {
    super(message);
  }
}

/**
 * Insert 1 entry + áp side effect:
 * - PROGRESS_REPORT có workOrderLineId (dòng linh kiện WO kiểu cũ):
 *     work_order_line.completed_qty += qtyCompleted (cap ở requiredQty).
 * - PROGRESS_REPORT KHÔNG chọn dòng (báo thành phẩm):
 *     work_order.good_qty += qtyCompleted, scrap_qty += qtyScrap.
 *   V4.1 SX-14: trước đây báo cho dòng linh kiện cũng cộng vào good_qty của
 *   thành phẩm → SL đạt sai nghĩa.
 * - Nếu durationMinutes > 0: cộng vào work_order.actual_hours.
 *
 * V4.1 SX-13: khoá WO `FOR UPDATE`; chặn WO đã xong/huỷ, báo SL khi chưa
 * chạy, và dòng thuộc WO khác.
 */
export async function insertProgressLog(
  input: InsertProgressLogInput,
): Promise<WoProgressLog> {
  return db.transaction(async (tx) => {
    const [wo] = await tx
      .select({ id: workOrder.id, status: workOrder.status })
      .from(workOrder)
      .where(eq(workOrder.id, input.workOrderId))
      .for("update");
    if (!wo) {
      throw new ProgressLogError("Lệnh sản xuất không tồn tại.", "WO_NOT_FOUND", 404);
    }

    const qtyCompleted = Number(input.qtyCompleted ?? 0);
    const qtyScrap = Number(input.qtyScrap ?? 0);
    const check = checkProgressLoggable({
      status: wo.status,
      stepType: input.stepType,
      qtyCompleted,
      qtyScrap,
    });
    if (!check.ok) {
      throw new ProgressLogError(check.reason, "WO_INVALID_STATE", 409);
    }

    if (input.workOrderLineId) {
      const [line] = await tx
        .select({ id: workOrderLine.id })
        .from(workOrderLine)
        .where(
          and(
            eq(workOrderLine.id, input.workOrderLineId),
            eq(workOrderLine.woId, input.workOrderId),
          ),
        )
        .limit(1);
      if (!line) {
        throw new ProgressLogError(
          "Dòng linh kiện không thuộc lệnh sản xuất này.",
          "WO_LINE_MISMATCH",
          422,
        );
      }
    }

    const [row] = await tx
      .insert(woProgressLog)
      .values({
        workOrderId: input.workOrderId,
        workOrderLineId: input.workOrderLineId ?? null,
        stepType: input.stepType,
        qtyCompleted: String(qtyCompleted),
        qtyScrap: String(qtyScrap),
        notes: input.notes ?? null,
        photoUrl: input.photoUrl ?? null,
        operatorId: input.operatorId,
        station: input.station ?? null,
        durationMinutes: input.durationMinutes ?? null,
      })
      .returning();
    if (!row) throw new Error("PROGRESS_LOG_INSERT_FAILED");

    // Dòng linh kiện (WO kiểu cũ).
    if (
      input.stepType === "PROGRESS_REPORT" &&
      qtyCompleted > 0 &&
      input.workOrderLineId
    ) {
      await tx
        .update(workOrderLine)
        .set({
          completedQty: sql`LEAST(${workOrderLine.requiredQty}, ${workOrderLine.completedQty} + ${String(qtyCompleted)})`,
          updatedAt: new Date(),
        })
        .where(eq(workOrderLine.id, input.workOrderLineId));
    }

    // Thành phẩm → SL đạt/phế trên header WO.
    if (
      progressAffectsHeader(input) &&
      (qtyCompleted > 0 || qtyScrap > 0)
    ) {
      await tx
        .update(workOrder)
        .set({
          goodQty: sql`${workOrder.goodQty} + ${String(qtyCompleted)}`,
          scrapQty: sql`${workOrder.scrapQty} + ${String(qtyScrap)}`,
        })
        .where(eq(workOrder.id, input.workOrderId));
    }

    const duration = input.durationMinutes ?? 0;
    if (duration > 0) {
      await tx
        .update(workOrder)
        .set({
          actualHours: sql`COALESCE(${workOrder.actualHours}, 0) + ${String(duration / 60)}`,
        })
        .where(eq(workOrder.id, input.workOrderId));
    }

    return row;
  });
}

/**
 * V4.1 SX-12 — Xoá entry VÀ trừ lại mọi số đã cộng (SL dòng, SL đạt/phế, giờ
 * thực tế) trong 1 transaction. Không xoá được entry của lệnh đã hoàn thành
 * (số liệu đã chốt). Entry có SL trên dòng linh kiện bị cap ở requiredQty khi
 * cộng → trừ lại GREATEST(0, …) (không âm).
 */
export async function deleteProgressLog(
  woId: string,
  entryId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [wo] = await tx
      .select({ status: workOrder.status })
      .from(workOrder)
      .where(eq(workOrder.id, woId))
      .for("update");
    if (!wo) return false;
    if (wo.status === "COMPLETED") {
      throw new ProgressLogError(
        "Lệnh đã hoàn thành — không xoá được nhật ký tiến độ (số liệu đã chốt).",
        "WO_INVALID_STATE",
        409,
      );
    }

    const [entry] = await tx
      .delete(woProgressLog)
      .where(
        and(
          eq(woProgressLog.id, entryId),
          eq(woProgressLog.workOrderId, woId),
        ),
      )
      .returning();
    if (!entry) return false;

    const qtyCompleted = Number(entry.qtyCompleted ?? 0);
    const qtyScrap = Number(entry.qtyScrap ?? 0);

    if (
      entry.stepType === "PROGRESS_REPORT" &&
      qtyCompleted > 0 &&
      entry.workOrderLineId
    ) {
      await tx
        .update(workOrderLine)
        .set({
          completedQty: sql`GREATEST(0, ${workOrderLine.completedQty} - ${String(qtyCompleted)})`,
          updatedAt: new Date(),
        })
        .where(eq(workOrderLine.id, entry.workOrderLineId));
    }
    if (
      progressAffectsHeader(entry) &&
      (qtyCompleted > 0 || qtyScrap > 0)
    ) {
      await tx
        .update(workOrder)
        .set({
          goodQty: sql`GREATEST(0, ${workOrder.goodQty} - ${String(qtyCompleted)})`,
          scrapQty: sql`GREATEST(0, ${workOrder.scrapQty} - ${String(qtyScrap)})`,
        })
        .where(eq(workOrder.id, woId));
    }
    const duration = entry.durationMinutes ?? 0;
    if (duration > 0) {
      await tx
        .update(workOrder)
        .set({
          actualHours: sql`GREATEST(0, COALESCE(${workOrder.actualHours}, 0) - ${String(duration / 60)})`,
        })
        .where(eq(workOrder.id, woId));
    }
    return true;
  });
}
