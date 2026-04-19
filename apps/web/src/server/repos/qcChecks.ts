import { and, asc, eq, sql } from "drizzle-orm";
import {
  qcCheck,
  type QcCheck,
  type QcCheckResult,
  type QcCheckpoint,
} from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * V1.3 QC Check repository — stub. Hardcode 3 checkpoint
 * (PRE_ASSEMBLY, MID_PRODUCTION, PRE_FG). Custom plans defer V1.4.
 */

export async function listChecks(woId: string): Promise<QcCheck[]> {
  return db
    .select()
    .from(qcCheck)
    .where(eq(qcCheck.woId, woId))
    .orderBy(asc(qcCheck.createdAt));
}

export interface AddCheckInput {
  woId: string;
  checkpointName: string;
  checkpoint?: QcCheckpoint | null;
  result?: QcCheckResult | null;
  note?: string | null;
  userId: string | null;
}

export async function addCheck(input: AddCheckInput): Promise<QcCheck> {
  const [row] = await db
    .insert(qcCheck)
    .values({
      woId: input.woId,
      checkpointName: input.checkpointName,
      checkpoint: input.checkpoint ?? null,
      result: input.result ?? null,
      note: input.note ?? null,
      checkedBy: input.userId,
      checkedAt: input.result ? new Date() : null,
    })
    .returning();
  if (!row) throw new Error("QC_CHECK_INSERT_FAILED");
  return row;
}

export interface UpdateCheckResultInput {
  id: string;
  result: QcCheckResult;
  note?: string | null;
  userId: string | null;
}

export async function updateResult(input: UpdateCheckResultInput): Promise<QcCheck> {
  const [row] = await db
    .update(qcCheck)
    .set({
      result: input.result,
      note: input.note ?? null,
      checkedBy: input.userId,
      checkedAt: new Date(),
    })
    .where(eq(qcCheck.id, input.id))
    .returning();
  if (!row) throw new Error("QC_CHECK_NOT_FOUND");
  return row;
}

export async function deleteCheck(id: string): Promise<void> {
  await db.delete(qcCheck).where(eq(qcCheck.id, id));
}

/** Seed 3 checkpoint preset cho WO mới tạo. */
export async function seedDefaultCheckpoints(
  woId: string,
  userId: string | null,
): Promise<QcCheck[]> {
  const presets: Array<{ name: string; checkpoint: QcCheckpoint }> = [
    { name: "Pre-Assembly", checkpoint: "PRE_ASSEMBLY" },
    { name: "Mid-Production", checkpoint: "MID_PRODUCTION" },
    { name: "Pre-FG", checkpoint: "PRE_FG" },
  ];
  const rows = await db
    .insert(qcCheck)
    .values(
      presets.map((p) => ({
        woId,
        checkpointName: p.name,
        checkpoint: p.checkpoint,
        checkedBy: userId,
      })),
    )
    .returning();
  return rows;
}

/** Aggregate: % checkpoint đã PASS cho WO. */
export async function getQcProgress(woId: string): Promise<{
  total: number;
  pass: number;
  fail: number;
  na: number;
  pending: number;
}> {
  const rows = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE result = 'PASS')::int AS pass,
      COUNT(*) FILTER (WHERE result = 'FAIL')::int AS fail,
      COUNT(*) FILTER (WHERE result = 'NA')::int AS na,
      COUNT(*) FILTER (WHERE result IS NULL)::int AS pending
    FROM app.qc_check
    WHERE wo_id = ${woId}
  `)) as unknown as Array<{
    total: number;
    pass: number;
    fail: number;
    na: number;
    pending: number;
  }>;
  return rows[0] ?? { total: 0, pass: 0, fail: 0, na: 0, pending: 0 };
}
