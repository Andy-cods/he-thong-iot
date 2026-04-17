import { NextResponse, type NextRequest } from "next/server";
import { bomImportCommitSchema } from "@iot/shared";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { logger } from "@/lib/logger";
import { getImportBatch, updateImportBatch } from "@/server/repos/importBatch";
import { enqueueBomImportCommit } from "@/server/services/bomImportQueue";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, bomImportCommitSchema);
  if ("response" in body) return body.response;

  const batch = await getImportBatch(params.id);
  if (!batch) return jsonError("NOT_FOUND", "Không tìm thấy phiên import.", 404);
  if (batch.kind !== "bom") {
    return jsonError("WRONG_KIND", "Phiên import không phải BOM.", 400);
  }
  if (batch.status !== "preview_ready") {
    return jsonError(
      "INVALID_STATE",
      `Không commit được ở trạng thái "${batch.status}".`,
      409,
    );
  }

  // Validate selectedSheets tồn tại trong preview
  const preview = batch.previewJson as
    | { sheets?: Array<{ sheetName: string }> }
    | null;
  const availableSheets = new Set(
    (preview?.sheets ?? []).map((s) => s.sheetName),
  );
  const missing = body.data.selectedSheets.filter((s) => !availableSheets.has(s));
  if (missing.length > 0) {
    return jsonError(
      "SHEET_NOT_FOUND",
      `Các sheet không tồn tại: ${missing.join(", ")}`,
      400,
    );
  }

  try {
    await updateImportBatch(batch.id, {
      status: "committing",
      duplicateMode: body.data.duplicateMode,
      startedAt: new Date(),
    });

    await enqueueBomImportCommit({
      batchId: batch.id,
      fileHash: batch.fileHash,
      actorId: guard.session.userId,
      selectedSheets: body.data.selectedSheets,
      mappings: body.data.mappings as Record<string, Record<string, string | null>>,
      autoCreateMissingItems: body.data.autoCreateMissingItems ?? false,
      duplicateMode: body.data.duplicateMode ?? "skip",
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "import_batch",
      objectId: batch.id,
      after: {
        selectedSheets: body.data.selectedSheets,
        autoCreate: body.data.autoCreateMissingItems,
      },
      notes: "bom commit enqueue",
      ...meta,
    });

    return NextResponse.json({
      data: { batchId: batch.id, status: "committing" },
    });
  } catch (err) {
    logger.error({ err, batchId: batch.id }, "commit bom import failed");
    await updateImportBatch(batch.id, {
      status: "failed",
      errorMessage: String((err as Error)?.message ?? err),
      finishedAt: new Date(),
    });
    return jsonError("INTERNAL", "Không commit được phiên BOM import.", 500);
  }
}
