import { NextResponse, type NextRequest } from "next/server";
import IORedis from "ioredis";
import { Queue } from "bullmq";
import { QUEUE_NAMES } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  EcoError,
  applyECO,
  getECOByCode,
} from "@/server/repos/ecoChanges";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let _queue: Queue | null = null;
function getQueue(): Queue {
  if (_queue) return _queue;
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379/2";
  const prefix = process.env.BULLMQ_PREFIX ?? "iot-";
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  _queue = new Queue(QUEUE_NAMES.ECO_APPLY_BATCH, { connection, prefix });
  return _queue;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  // Apply ECO là hành động critical → yêu cầu delete/eco (admin only theo matrix).
  const guard = await requireCan(req, "delete", "eco");
  if ("response" in guard) return guard.response;

  try {
    const existing = await getECOByCode(params.code);
    if (!existing) return jsonError("NOT_FOUND", "ECO không tồn tại.", 404);

    const eco = await applyECO(existing.id, guard.session.userId);

    // Nếu async (> 10 orders), enqueue BullMQ job
    if (!eco.syncMode && eco.affectedOrdersCount > 0) {
      try {
        const job = await getQueue().add(
          QUEUE_NAMES.ECO_APPLY_BATCH,
          {
            ecoId: eco.id,
            ecoCode: eco.code,
            affectedTemplateId: eco.affectedTemplateId,
            affectedOrdersCount: eco.affectedOrdersCount,
            userId: guard.session.userId,
          },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 100,
          },
        );
        logger.info(
          { ecoId: eco.id, jobId: job.id },
          "eco-apply-batch enqueued",
        );
      } catch (err) {
        logger.error({ err }, "BullMQ enqueue failed, ECO đã APPLIED sync fallback");
      }
    }

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "ECO_APPLY",
      objectType: "eco_change",
      objectId: eco.id,
      after: {
        status: "APPLIED",
        affectedOrdersCount: eco.affectedOrdersCount,
        syncMode: eco.syncMode,
      },
      notes: `ECO ${eco.code} applied (${eco.syncMode ? "sync" : "async"}) — ${eco.affectedOrdersCount} orders`,
      ...meta,
    });

    return NextResponse.json(
      { data: eco },
      { status: eco.syncMode ? 200 : 202 },
    );
  } catch (err) {
    if (err instanceof EcoError)
      return jsonError(err.code, err.message, err.httpStatus);
    logger.error({ err }, "apply ECO failed");
    return jsonError("INTERNAL", "Lỗi apply ECO.", 500);
  }
}
