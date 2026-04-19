import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  AssemblyScanError,
  recordAssemblyScanAtomic,
} from "@/server/repos/assemblies";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  woId: z.string().uuid(),
  snapshotLineId: z.string().uuid(),
  lotSerialId: z.string().uuid(),
  qty: z.number().positive(),
  scanId: z.string().min(8), // offline queue id / uuidv7
  barcode: z.string().max(128).default(""),
  scannedAt: z.string().datetime(),
  deviceId: z.string().max(64).optional().nullable(),
});

/** POST /api/assembly/scan — 1 scan atomic (admin/operator/warehouse). */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "transition", "wo");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  try {
    const result = await recordAssemblyScanAtomic({
      woId: body.data.woId,
      snapshotLineId: body.data.snapshotLineId,
      lotSerialId: body.data.lotSerialId,
      qty: body.data.qty,
      offlineQueueId: body.data.scanId,
      barcode: body.data.barcode || body.data.lotSerialId,
      scannedAt: new Date(body.data.scannedAt),
      deviceId: body.data.deviceId ?? null,
      userId: guard.session.userId,
    });

    if (!result.idempotent) {
      const meta = extractRequestMeta(req);
      await writeAudit({
        actor: guard.session,
        action: "ISSUE",
        objectType: "assembly_scan",
        objectId: result.scanId,
        after: {
          woId: body.data.woId,
          snapshotLineId: body.data.snapshotLineId,
          lotId: body.data.lotSerialId,
          qty: body.data.qty,
        },
        notes: `Assembly scan qty ${body.data.qty}`,
        ...meta,
      });
    }

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    if (err instanceof AssemblyScanError) {
      return jsonError(err.code, err.message, err.httpStatus);
    }
    logger.error({ err }, "assembly scan failed");
    return jsonError("INTERNAL", "Lỗi ghi nhận scan.", 500);
  }
}
