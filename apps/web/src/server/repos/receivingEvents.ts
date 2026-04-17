import { desc, eq, sql } from "drizzle-orm";
import { receivingEvent } from "@iot/db/schema";
import { db } from "@/lib/db";

export interface ReceivingEventInsertInput {
  id: string;
  scanId: string;
  poCode: string;
  sku: string;
  qty: number;
  lotNo?: string | null;
  qcStatus?: "OK" | "NG" | "PENDING";
  scannedAt: Date;
  receivedBy?: string | null;
  rawCode?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ReceivingInsertResult {
  id: string;
  inserted: boolean; // true nếu row mới, false nếu đã tồn tại (scan_id conflict)
}

/**
 * Idempotent insert: ON CONFLICT DO NOTHING theo scan_id unique.
 * Response xác định rõ inserted vs duplicate để FE mark synced.
 */
export async function insertEvent(
  input: ReceivingEventInsertInput,
): Promise<ReceivingInsertResult> {
  const rows = await db.execute(sql`
    INSERT INTO app.receiving_event
      (id, scan_id, po_code, sku, qty, lot_no, qc_status, scanned_at, received_by, raw_code, metadata)
    VALUES
      (${input.id}, ${input.scanId}, ${input.poCode}, ${input.sku}, ${input.qty},
       ${input.lotNo ?? null}, ${input.qcStatus ?? "PENDING"}, ${input.scannedAt.toISOString()},
       ${input.receivedBy ?? null}, ${input.rawCode ?? null},
       ${JSON.stringify(input.metadata ?? {})}::jsonb)
    ON CONFLICT (scan_id) DO NOTHING
    RETURNING id
  `);
  const list = rows as unknown as Array<{ id: string }>;
  return {
    id: input.id,
    inserted: list.length > 0,
  };
}

export async function listEventsByPo(poCode: string, limit = 100) {
  return db
    .select()
    .from(receivingEvent)
    .where(eq(receivingEvent.poCode, poCode))
    .orderBy(desc(receivingEvent.scannedAt))
    .limit(limit);
}
