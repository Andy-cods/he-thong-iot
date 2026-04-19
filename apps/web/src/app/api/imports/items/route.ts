import { NextResponse, type NextRequest } from "next/server";
import { LIMITS } from "@iot/shared";
import { jsonError, extractRequestMeta } from "@/server/http";
import { requireCan } from "@/server/session";
import { logger } from "@/lib/logger";
import {
  createImportBatch,
  findRecentByHash,
  updateImportBatch,
} from "@/server/repos/importBatch";
import { parseItemImport } from "@/server/services/excelImport";
import { writeAudit } from "@/server/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/imports/items
 * multipart/form-data: file=<xlsx>, duplicateMode=skip|upsert|error
 * Parse server-side, tạo import_batch status=preview_ready, trả preview.
 */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "item");
  if ("response" in guard) return guard.response;

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("INVALID_FORM", "Form dữ liệu không hợp lệ.", 400);

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("NO_FILE", "Thiếu file Excel.", 400);
  }
  if (file.size > LIMITS.FILE_UPLOAD_MAX_BYTES) {
    return jsonError(
      "FILE_TOO_LARGE",
      `File vượt quá ${LIMITS.FILE_UPLOAD_MAX_BYTES / 1024 / 1024}MB.`,
      413,
    );
  }
  const duplicateMode =
    (form.get("duplicateMode") as string | null) ?? "skip";
  if (!["skip", "upsert", "error"].includes(duplicateMode)) {
    return jsonError(
      "INVALID_DUPLICATE_MODE",
      "duplicateMode phải là skip|upsert|error.",
      400,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseItemImport(buffer);
  } catch (err) {
    logger.error({ err }, "parseItemImport failed");
    return jsonError(
      "PARSE_FAILED",
      "Không đọc được file. Kiểm tra định dạng .xlsx.",
      422,
    );
  }

  if (parsed.headerMismatch.length > 0) {
    return jsonError(
      "HEADER_MISMATCH",
      `Thiếu cột: ${parsed.headerMismatch.join(", ")}. Tải lại template.`,
      422,
      { missing: parsed.headerMismatch },
    );
  }

  // Dedup theo fileHash trong 60 phút (idempotency cho user retry mạng).
  const existing = await findRecentByHash(parsed.fileHash, "item", 60);
  if (existing && existing.status !== "failed") {
    return NextResponse.json(
      {
        data: {
          batchId: existing.id,
          reused: true,
          status: existing.status,
          rowTotal: existing.rowTotal,
          rowSuccess: existing.rowSuccess,
          rowFail: existing.rowFail,
        },
      },
      { status: 200 },
    );
  }

  const batch = await createImportBatch({
    kind: "item",
    fileHash: parsed.fileHash,
    fileName: file.name,
    fileSizeBytes: file.size,
    duplicateMode: duplicateMode as "skip" | "upsert" | "error",
    uploadedBy: guard.session.userId,
  });
  if (!batch) {
    logger.error({ fileHash: parsed.fileHash }, "createImportBatch returned undefined");
    return jsonError("INTERNAL", "Không tạo được import batch.", 500);
  }

  const previewRows = parsed.validRows.slice(0, 20).map((r) => r.data);
  // Lưu ALL valid rows để worker commit có dữ liệu; preview UI chỉ show 20 từ field riêng.
  const allRows = parsed.validRows.map((r) => ({
    rowNumber: r.rowNumber,
    data: r.data,
  }));
  await updateImportBatch(batch.id, {
    status: "preview_ready",
    rowTotal: parsed.rowTotal,
    rowSuccess: parsed.validRows.length,
    rowFail: parsed.errors.length,
    previewJson: {
      preview: previewRows,
      allRows,
      validCount: parsed.validRows.length,
      errorCount: parsed.errors.length,
    },
    errorJson: parsed.errors.slice(0, 500),
  });

  const meta = extractRequestMeta(req);
  await writeAudit({
    actor: guard.session,
    action: "UPLOAD",
    objectType: "import_batch",
    objectId: batch.id,
    after: {
      fileName: file.name,
      rowTotal: parsed.rowTotal,
      valid: parsed.validRows.length,
      errors: parsed.errors.length,
    },
    ...meta,
  });

  return NextResponse.json(
    {
      data: {
        batchId: batch.id,
        reused: false,
        status: "preview_ready",
        fileHash: parsed.fileHash,
        rowTotal: parsed.rowTotal,
        rowSuccess: parsed.validRows.length,
        rowFail: parsed.errors.length,
        previewRows,
        errors: parsed.errors.slice(0, 100),
      },
    },
    { status: 201 },
  );
}
