import { and, asc, eq } from "drizzle-orm";
import {
  qcCheckItem,
  type QcCheckItem,
  type QcCheckItemResult,
  type QcCheckItemType,
} from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * V1.9 Phase 4 — repo qc_check_item (checklist chi tiết per QC stage).
 */

export async function listItemsByCheck(
  qcCheckId: string,
): Promise<QcCheckItem[]> {
  return db
    .select()
    .from(qcCheckItem)
    .where(eq(qcCheckItem.qcCheckId, qcCheckId))
    .orderBy(asc(qcCheckItem.sortOrder), asc(qcCheckItem.createdAt));
}

export interface BulkCreateItemsInput {
  qcCheckId: string;
  items: Array<{
    description: string;
    checkType?: QcCheckItemType;
    expectedValue?: string | null;
    sortOrder?: number;
  }>;
}

export async function bulkCreateItems(
  input: BulkCreateItemsInput,
): Promise<QcCheckItem[]> {
  if (input.items.length === 0) return [];
  const rows = await db
    .insert(qcCheckItem)
    .values(
      input.items.map((i, idx) => ({
        qcCheckId: input.qcCheckId,
        description: i.description,
        checkType: i.checkType ?? "BOOLEAN",
        expectedValue: i.expectedValue ?? null,
        sortOrder: i.sortOrder ?? idx,
        result: "PENDING" as QcCheckItemResult,
      })),
    )
    .returning();
  return rows;
}

export interface UpdateItemInput {
  id: string;
  qcCheckId: string;
  description?: string;
  checkType?: QcCheckItemType;
  expectedValue?: string | null;
  actualValue?: string | null;
  result?: QcCheckItemResult;
  defectReason?: string | null;
  photoUrl?: string | null;
  sortOrder?: number;
  checkedBy?: string | null;
}

export async function updateItem(
  input: UpdateItemInput,
): Promise<QcCheckItem | null> {
  const values: Record<string, unknown> = {};
  if (input.description !== undefined) values.description = input.description;
  if (input.checkType !== undefined) values.checkType = input.checkType;
  if (input.expectedValue !== undefined)
    values.expectedValue = input.expectedValue;
  if (input.actualValue !== undefined) values.actualValue = input.actualValue;
  if (input.result !== undefined) {
    values.result = input.result;
    values.checkedAt = input.result === "PENDING" ? null : new Date();
    if (input.checkedBy !== undefined) values.checkedBy = input.checkedBy;
  }
  if (input.defectReason !== undefined)
    values.defectReason = input.defectReason;
  if (input.photoUrl !== undefined) values.photoUrl = input.photoUrl;
  if (input.sortOrder !== undefined) values.sortOrder = input.sortOrder;

  if (Object.keys(values).length === 0) {
    const [row] = await db
      .select()
      .from(qcCheckItem)
      .where(
        and(
          eq(qcCheckItem.id, input.id),
          eq(qcCheckItem.qcCheckId, input.qcCheckId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  const rows = await db
    .update(qcCheckItem)
    .set(values)
    .where(
      and(
        eq(qcCheckItem.id, input.id),
        eq(qcCheckItem.qcCheckId, input.qcCheckId),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function deleteItem(
  qcCheckId: string,
  itemId: string,
): Promise<boolean> {
  const rows = await db
    .delete(qcCheckItem)
    .where(
      and(
        eq(qcCheckItem.id, itemId),
        eq(qcCheckItem.qcCheckId, qcCheckId),
      ),
    )
    .returning({ id: qcCheckItem.id });
  return rows.length > 0;
}
