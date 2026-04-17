import { NextResponse, type NextRequest } from "next/server";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { importCommitSchema } from "@iot/shared";
import { getImportBatch, updateImportBatch } from "@/server/repos/importBatch";
import { enqueueItemImportCommit } from "@/server/services/importQueue";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/imports/:id/commit
 * Body: { duplicateMode?: "skip"|"upsert"|"error" }
 * → Đẩy job BullMQ (idempotent qua jobId=batchId).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "planner");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, importCommitSchema);
  if ("response" in body) return body.response;

  const batch = await getImportBatch(params.id);
  if (!batch) return jsonError("NOT_FOUND", "Không tìm thấy phiên import.", 404);
  if (batch.kind !== "item") {
    return jsonError("WRONG_KIND", "Phiên import không phải item.", 400);
  }
  if (batch.status !== "preview_ready") {
    return jsonError(
      "INVALID_STATE",
      `Không commit được ở trạng thái "${batch.status}".`,
      409,
    );
  }

  const duplicateMode = body.data.duplicateMode;

  try {
    await updateImportBatch(batch.id, {
      status: "committing",
      duplicateMode,
      startedAt: new Date(),
    });

    await enqueueItemImportCommit({
      batchId: batch.id,
      fileHash: batch.fileHash,
      actorId: guard.session.userId,
      duplicateMode,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "COMMIT",
      objectType: "import_batch",
      objectId: batch.id,
      after: { duplicateMode },
      ...meta,
    });

    return NextResponse.json({
      data: { batchId: batch.id, status: "committing" },
    });
  } catch (err) {
    logger.error({ err, batchId: batch.id }, "commit import failed");
    await updateImportBatch(batch.id, {
      status: "failed",
      errorMessage: String((err as Error)?.message ?? err),
      finishedAt: new Date(),
    });
    return jsonError("INTERNAL", "Không commit được phiên import.", 500);
  }
}
