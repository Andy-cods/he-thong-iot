import { and, desc, eq, sql } from "drizzle-orm";
import {
  woProgressLog,
  workOrder,
  workOrderLine,
  userAccount,
  type WoProgressLog,
} from "@iot/db/schema";
import { db } from "@/lib/db";

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

/**
 * Insert 1 entry + áp side effect:
 * - Nếu stepType="PROGRESS_REPORT" + qtyCompleted>0 và có workOrderLineId:
 *     update work_order_line.completed_qty += qtyCompleted (cap ở requiredQty).
 *     update work_order.good_qty += qtyCompleted, scrap_qty += qtyScrap.
 * - Nếu durationMinutes > 0: cộng vào work_order.actual_hours.
 */
export async function insertProgressLog(
  input: InsertProgressLogInput,
): Promise<WoProgressLog> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(woProgressLog)
      .values({
        workOrderId: input.workOrderId,
        workOrderLineId: input.workOrderLineId ?? null,
        stepType: input.stepType,
        qtyCompleted: String(input.qtyCompleted ?? 0),
        qtyScrap: String(input.qtyScrap ?? 0),
        notes: input.notes ?? null,
        photoUrl: input.photoUrl ?? null,
        operatorId: input.operatorId,
        station: input.station ?? null,
        durationMinutes: input.durationMinutes ?? null,
      })
      .returning();
    if (!row) throw new Error("PROGRESS_LOG_INSERT_FAILED");

    const qtyCompleted = Number(input.qtyCompleted ?? 0);
    const qtyScrap = Number(input.qtyScrap ?? 0);

    // Cộng dồn vào work_order_line.completed_qty khi PROGRESS_REPORT.
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

    // Cộng dồn good/scrap/actual_hours trên work_order header.
    if (
      input.stepType === "PROGRESS_REPORT" &&
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

export async function deleteProgressLog(
  woId: string,
  entryId: string,
): Promise<boolean> {
  const rows = await db
    .delete(woProgressLog)
    .where(
      and(
        eq(woProgressLog.id, entryId),
        eq(woProgressLog.workOrderId, woId),
      ),
    )
    .returning({ id: woProgressLog.id });
  return rows.length > 0;
}
