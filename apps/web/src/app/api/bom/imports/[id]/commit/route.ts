import { NextResponse, type NextRequest } from "next/server";
import {
  bomImportCommitSchema,
  bomImportDecisionsBodySchema,
  planTrienKhaiRows,
  type CommitMatch,
} from "@iot/shared";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { logger } from "@/lib/logger";
import { getImportBatch, updateImportBatch } from "@/server/repos/importBatch";
import {
  enqueueBomImportCommit,
  enqueueBomImportTrienKhai,
} from "@/server/services/bomImportQueue";
import { guardTrienKhaiEnabled } from "@/server/services/bomImportTrienKhaiPreview";
import { env } from "@/lib/env";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "create", "bomTemplate");
  if ("response" in guard) return guard.response;

  // V5 WP4b — đọc thêm `decisions` (schema cũ strip field lạ) từ bản sao body.
  const rawBody: unknown = await req.clone().json().catch(() => null);
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

  // V5 WP4b — nhánh mẫu BOM triển khai: cần flag + đủ quyết định cho dòng CONFIRM.
  const tkPreview = batch.previewJson as {
    template?: string;
    trienKhai?: { rows?: Array<{ position: string; match: CommitMatch }> };
  } | null;
  if (tkPreview?.template === "TRIEN_KHAI") {
    const off = guardTrienKhaiEnabled(env.BOM_IMPORT_V5);
    if (off) return jsonError(off.code, off.message, off.status);
    const dec = bomImportDecisionsBodySchema.safeParse(rawBody);
    if (!dec.success) {
      return jsonError("INVALID_DECISIONS", "Quyết định khớp vật tư không hợp lệ.", 400);
    }
    const { undecided } = planTrienKhaiRows(
      tkPreview.trienKhai?.rows ?? [],
      dec.data.decisions,
    );
    if (undecided.length > 0) {
      return jsonError(
        "DECISIONS_REQUIRED",
        `Còn ${undecided.length} dòng cần xác nhận vật tư: ${undecided.slice(0, 10).join(", ")}`,
        422,
      );
    }
    try {
      await updateImportBatch(batch.id, {
        status: "committing",
        duplicateMode: body.data.duplicateMode,
        startedAt: new Date(),
      });
      await enqueueBomImportTrienKhai({
        batchId: batch.id,
        actorId: guard.session.userId,
        duplicateMode: body.data.duplicateMode ?? "skip",
        decisions: dec.data.decisions,
      });
      await writeAudit({
        actor: guard.session,
        action: "CREATE",
        objectType: "import_batch",
        objectId: batch.id,
        after: { template: "TRIEN_KHAI", decisions: dec.data.decisions.length },
        notes: "bom trien khai commit enqueue",
        ...extractRequestMeta(req),
      });
      return NextResponse.json({ data: { batchId: batch.id, status: "committing" } });
    } catch (err) {
      logger.error({ err, batchId: batch.id }, "commit bom trien khai failed");
      await updateImportBatch(batch.id, {
        status: "failed",
        errorMessage: String((err as Error)?.message ?? err),
        finishedAt: new Date(),
      });
      return jsonError("INTERNAL", "Không commit được phiên BOM import.", 500);
    }
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
