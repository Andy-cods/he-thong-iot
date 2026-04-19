import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  AssemblyScanError,
  recordAssemblyScanAtomic,
} from "@/server/repos/assemblies";
import { jsonError, parseJson } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventSchema = z.object({
  woId: z.string().uuid(),
  snapshotLineId: z.string().uuid(),
  lotSerialId: z.string().uuid(),
  qty: z.number().positive(),
  scanId: z.string().min(8),
  barcode: z.string().max(128).default(""),
  scannedAt: z.string().datetime(),
  deviceId: z.string().max(64).optional().nullable(),
});

const schema = z.object({
  events: z.array(eventSchema).min(1).max(100),
});

export interface BatchAck {
  acked: string[];
  rejected: Array<{ scanId: string; code: string; message: string }>;
}

/** POST /api/assembly/scan/batch — replay Dexie queue. */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "transition", "wo");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  const acked: string[] = [];
  const rejected: BatchAck["rejected"] = [];

  for (const ev of body.data.events) {
    try {
      const res = await recordAssemblyScanAtomic({
        woId: ev.woId,
        snapshotLineId: ev.snapshotLineId,
        lotSerialId: ev.lotSerialId,
        qty: ev.qty,
        offlineQueueId: ev.scanId,
        barcode: ev.barcode || ev.lotSerialId,
        scannedAt: new Date(ev.scannedAt),
        deviceId: ev.deviceId ?? null,
        userId: guard.session.userId,
      });
      // idempotent replay cũng coi là acked để client xoá khỏi queue
      acked.push(ev.scanId);
      if (res.idempotent) {
        logger.info({ scanId: ev.scanId }, "assembly scan batch: idempotent");
      }
    } catch (err) {
      if (err instanceof AssemblyScanError) {
        rejected.push({
          scanId: ev.scanId,
          code: err.code,
          message: err.message,
        });
      } else {
        rejected.push({
          scanId: ev.scanId,
          code: "INTERNAL",
          message: (err as Error).message,
        });
      }
    }
  }

  return NextResponse.json({ data: { acked, rejected } });
}
