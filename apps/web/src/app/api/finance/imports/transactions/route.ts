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
import { parseFinanceTransactionImport } from "@/server/services/financeImport";
import { writeAudit } from "@/server/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/finance/imports/transactions
 * multipart/form-data: file=<xlsx>
 * Parse server-side (fuzzy match account/category/supplier + dedupe hash),
 * tạo import_batch kind=finance_transaction, trả preview. Bám khuôn
 * `/api/imports/items` (xem wave-2-finance.md §D.2, D.5) — KHÔNG có
 * duplicateMode (finance luôn ON CONFLICT DO NOTHING theo dedupeHash, không
 * có khái niệm "upsert theo SKU" như item).
 */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "finance");
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

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseFinanceTransactionImport(buffer);
  } catch (err) {
    logger.error({ err }, "parseFinanceTransactionImport failed");
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

  // Dedup theo fileHash trong 60 phút (idempotency cho user retry mạng) —
  // giống hệt cơ chế item import.
  const existing = await findRecentByHash(parsed.fileHash, "finance_transaction", 60);
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

  const duplicateRows = parsed.validRows.filter((r) => r.duplicate);
  const freshRows = parsed.validRows.filter((r) => !r.duplicate);

  const batch = await createImportBatch({
    kind: "finance_transaction",
    fileHash: parsed.fileHash,
    fileName: file.name,
    fileSizeBytes: file.size,
    duplicateMode: "skip",
    uploadedBy: guard.session.userId,
  });
  if (!batch) {
    logger.error({ fileHash: parsed.fileHash }, "createImportBatch returned undefined");
    return jsonError("INTERNAL", "Không tạo được import batch.", 500);
  }

  const previewRows = parsed.validRows.slice(0, 20).map((r) => ({ ...r.data, duplicate: r.duplicate }));
  // Lưu ALL valid rows (kể cả dòng trùng — worker vẫn cần thấy để đếm số liệu
  // báo cáo đúng, ON CONFLICT DO NOTHING sẽ tự bỏ qua khi insert).
  const allRows = parsed.validRows.map((r) => ({
    rowNumber: r.rowNumber,
    data: r.data,
    duplicate: r.duplicate,
  }));

  await updateImportBatch(batch.id, {
    status: "preview_ready",
    rowTotal: parsed.rowTotal,
    rowSuccess: freshRows.length,
    rowFail: parsed.errors.length,
    previewJson: {
      preview: previewRows,
      allRows,
      validCount: parsed.validRows.length,
      freshCount: freshRows.length,
      duplicateCount: duplicateRows.length,
      errorCount: parsed.errors.length,
      warnings: parsed.warnings.slice(0, 200),
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
      duplicate: duplicateRows.length,
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
        rowSuccess: freshRows.length,
        rowFail: parsed.errors.length,
        duplicateCount: duplicateRows.length,
        previewRows,
        errors: parsed.errors.slice(0, 100),
        warnings: parsed.warnings.slice(0, 100),
      },
    },
    { status: 201 },
  );
}
