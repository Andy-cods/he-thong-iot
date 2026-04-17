import { NextResponse, type NextRequest } from "next/server";
import { LIMITS } from "@iot/shared";
import { extractRequestMeta, jsonError } from "@/server/http";
import { logger } from "@/lib/logger";
import {
  createImportBatch,
  findRecentByHash,
  updateImportBatch,
} from "@/server/repos/importBatch";
import { autoMapHeaders, parseBomImport } from "@/server/services/bomImportParser";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bom/imports/upload
 * multipart/form-data: file=<xlsx>, duplicateMode=skip|upsert|error
 * Parse tất cả sheets → preview + auto-mapping.
 */
export async function POST(req: NextRequest) {
  const guard = await requireSession(req);
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
    parsed = await parseBomImport(buffer);
  } catch (err) {
    logger.error({ err }, "parseBomImport failed");
    return jsonError(
      "PARSE_FAILED",
      "Không đọc được file. Kiểm tra định dạng .xlsx.",
      422,
    );
  }

  // Idempotency check: file_hash + kind=bom trong 60 phút
  const existing = await findRecentByHash(parsed.fileHash, "bom", 60);
  if (existing && existing.status !== "failed") {
    return NextResponse.json(
      {
        data: {
          batchId: existing.id,
          reused: true,
          status: existing.status,
        },
      },
      { status: 200 },
    );
  }

  // Tạo auto-mapping cho mỗi sheet
  const autoMappings: Record<string, Record<string, string | null>> = {};
  for (const s of parsed.sheets) {
    autoMappings[s.sheetName] = autoMapHeaders(s.headersDetected);
  }

  const batch = await createImportBatch({
    kind: "bom",
    fileHash: parsed.fileHash,
    fileName: file.name,
    fileSizeBytes: file.size,
    duplicateMode: duplicateMode as "skip" | "upsert" | "error",
    uploadedBy: guard.session.userId,
  });

  if (!batch) {
    return jsonError("INTERNAL", "Không tạo được phiên import.", 500);
  }

  // Lưu preview + all rows + auto mapping
  await updateImportBatch(batch.id, {
    status: "preview_ready",
    rowTotal: parsed.sheets.reduce((acc, s) => acc + s.rowCount, 0),
    previewJson: {
      sheets: parsed.sheets,
      allRowsBySheet: parsed.allRowsBySheet,
      autoMappings,
    },
  });

  const meta = extractRequestMeta(req);
  await writeAudit({
    actor: guard.session,
    action: "CREATE",
    objectType: "import_batch",
    objectId: batch.id,
    after: {
      kind: "bom",
      fileName: file.name,
      sheets: parsed.sheets.map((s) => ({
        name: s.sheetName,
        rowCount: s.rowCount,
      })),
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
        sheets: parsed.sheets,
        autoMappings,
        duplicateMode,
      },
    },
    { status: 201 },
  );
}
