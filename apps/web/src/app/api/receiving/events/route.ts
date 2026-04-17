import { NextResponse, type NextRequest } from "next/server";
import { receivingEventsBatchSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { insertEvent } from "@/server/repos/receivingEvents";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // warehouse / admin / planner được phép ghi receiving event
  const guard = await requireSession(req, "warehouse", "planner");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, receivingEventsBatchSchema);
  if ("response" in body) return body.response;

  const acked: string[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];
  const meta = extractRequestMeta(req);

  for (const e of body.data.events) {
    try {
      const result = await insertEvent({
        id: e.id,
        scanId: e.scanId,
        poCode: e.poCode,
        sku: e.sku,
        qty: e.qty,
        lotNo: e.lotNo ?? null,
        qcStatus: e.qcStatus,
        scannedAt: new Date(e.scannedAt),
        receivedBy: guard.session.userId,
        rawCode: e.rawCode ?? null,
        metadata: e.metadata ?? {},
      });
      acked.push(e.id);
      if (result.inserted) {
        // Audit chỉ khi insert mới (idempotent duplicate không ghi audit)
        await writeAudit({
          actor: guard.session,
          action: "CREATE",
          objectType: "receiving_event",
          objectId: e.id,
          after: {
            scanId: e.scanId,
            poCode: e.poCode,
            sku: e.sku,
            qty: e.qty,
            qcStatus: e.qcStatus,
          },
          ...meta,
        });
      }
    } catch (err) {
      logger.warn({ err, eventId: e.id }, "insert receiving event failed");
      rejected.push({
        id: e.id,
        reason: err instanceof Error ? err.message : "insert failed",
      });
    }
  }

  return NextResponse.json({
    data: { acked, rejected, count: acked.length },
  });
}
