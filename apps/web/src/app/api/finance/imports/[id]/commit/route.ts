import { NextResponse, type NextRequest } from "next/server";
import { extractRequestMeta, jsonError } from "@/server/http";
import { getImportBatch, updateImportBatch } from "@/server/repos/importBatch";
import { enqueueFinanceTransactionImportCommit } from "@/server/services/importQueue";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/finance/imports/:id/commit
 * → Đẩy job BullMQ commit import giao dịch tài chính (idempotent qua
 * jobId=batchId). Không nhận `duplicateMode` — finance luôn dùng
 * `ON CONFLICT (dedupe_hash) DO NOTHING` ở worker (xem wave-2-finance.md §D.6).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "create", "finance");
  if ("response" in guard) return guard.response;

  const batch = await getImportBatch(params.id);
  if (!batch) return jsonError("NOT_FOUND", "Không tìm thấy phiên import.", 404);
  if (batch.kind !== "finance_transaction") {
    return jsonError("WRONG_KIND", "Phiên import không phải giao dịch tài chính.", 400);
  }
  if (batch.status !== "preview_ready") {
    return jsonError(
      "INVALID_STATE",
      `Không commit được ở trạng thái "${batch.status}".`,
      409,
    );
  }

  try {
    await updateImportBatch(batch.id, {
      status: "committing",
      startedAt: new Date(),
    });

    await enqueueFinanceTransactionImportCommit({
      batchId: batch.id,
      fileHash: batch.fileHash,
      actorId: guard.session.userId,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "COMMIT",
      objectType: "import_batch",
      objectId: batch.id,
      after: {},
      ...meta,
    });

    return NextResponse.json({
      data: { batchId: batch.id, status: "committing" },
    });
  } catch (err) {
    logger.error({ err, batchId: batch.id }, "commit finance import failed");
    await updateImportBatch(batch.id, {
      status: "failed",
      errorMessage: String((err as Error)?.message ?? err),
      finishedAt: new Date(),
    });
    return jsonError("INTERNAL", "Không commit được phiên import.", 500);
  }
}
