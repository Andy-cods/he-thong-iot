import type { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { ecoChange } from "@iot/db/schema";
import { db } from "../db.js";

export interface EcoApplyBatchJob {
  ecoId: string;
  ecoCode: string;
  affectedTemplateId: string;
  affectedOrdersCount: number;
  userId: string | null;
}

/**
 * V1.3 Phase B4 — ECO apply batch worker.
 *
 * Trigger: khi ECO apply có > 10 affected orders, web route enqueue job này.
 * Nhiệm vụ:
 *   1) Flag sales_order.metadata.requires_review = true cho toàn bộ affected orders
 *   2) Update eco_change.apply_progress mỗi 10 orders xử lý xong
 *   3) Khi done → apply_progress = 100
 *
 * Idempotent qua eco_change.status=APPLIED check; nếu đã 100 thì skip.
 * Retry 3× exponential do route config.
 */
export async function processEcoApplyBatch(
  job: Job<EcoApplyBatchJob>,
): Promise<{ status: string; updated: number; ecoId: string }> {
  const { ecoId, affectedTemplateId } = job.data;

  // Check eco đã APPLIED + chưa progress 100
  const [eco] = await db
    .select()
    .from(ecoChange)
    .where(eq(ecoChange.id, ecoId))
    .limit(1);
  if (!eco) {
    return { status: "eco_not_found", updated: 0, ecoId };
  }
  if (eco.applyProgress >= 100) {
    return { status: "already_done", updated: 0, ecoId };
  }

  // Lấy danh sách affected orders
  const orderRows = (await db.execute(sql`
    SELECT id FROM app.sales_order
    WHERE bom_template_id = ${affectedTemplateId}
      AND status NOT IN ('CLOSED','CANCELLED','FULFILLED')
    ORDER BY created_at ASC
  `)) as unknown as Array<{ id: string }>;

  const total = orderRows.length;
  if (total === 0) {
    await db
      .update(ecoChange)
      .set({ applyProgress: 100, updatedAt: new Date() })
      .where(eq(ecoChange.id, ecoId));
    return { status: "done_empty", updated: 0, ecoId };
  }

  const BATCH = 10;
  let updated = 0;
  for (let i = 0; i < total; i += BATCH) {
    const chunk = orderRows.slice(i, i + BATCH);
    const ids = chunk.map((r) => r.id);
    await db.execute(sql`
      UPDATE app.sales_order
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{requires_review}', 'true'::jsonb
      )
      WHERE id = ANY(${ids}::uuid[])
    `);
    updated += chunk.length;
    const progress = Math.min(100, Math.round((updated / total) * 100));
    await db
      .update(ecoChange)
      .set({ applyProgress: progress, updatedAt: new Date() })
      .where(eq(ecoChange.id, ecoId));
    await job.updateProgress(progress);
  }

  return { status: "done", updated, ecoId };
}
