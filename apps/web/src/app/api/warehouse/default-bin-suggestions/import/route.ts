import { NextResponse, type NextRequest } from "next/server";
import { item, locationBin } from "@iot/db/schema";
import { LIMITS } from "@iot/shared";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { parseDefaultBinImportFile } from "@/server/services/defaultBinImport";
import { ImportTooManyRowsError } from "@/server/services/importLimits";
import { setItemDefaultBins } from "@/server/repos/defaultBinSuggestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.3 Việc 1 — POST /api/warehouse/default-bin-suggestions/import
 *
 * multipart/form-data: file=<xlsx>, commit=("1" để ghi, bỏ trống/khác = chỉ
 * xem trước). KHÔNG dùng import_batch (dữ liệu nhỏ ≤ vài nghìn dòng, không
 * cần lưu trạng thái giữa 2 bước — client tự gửi lại CÙNG file khi bấm "Ghi
 * nhận" sau khi xem preview, đơn giản hơn nhiều so với hạ tầng import_batch
 * đầy đủ dùng cho item/finance — đúng YAGNI cho tính năng phụ này).
 */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "update", "inventory");
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
  const commit = String(form.get("commit") ?? "") === "1";

  const buffer = Buffer.from(await file.arrayBuffer());

  const [items, bins] = await Promise.all([
    db
      .select({ id: item.id, sku: item.sku, name: item.name, isActive: item.isActive })
      .from(item),
    db
      .select({ id: locationBin.id, fullCode: locationBin.fullCode, isActive: locationBin.isActive })
      .from(locationBin),
  ]);
  const safeBins = bins.map((b) => ({ ...b, fullCode: b.fullCode ?? "" }));

  let parsed;
  try {
    parsed = await parseDefaultBinImportFile(buffer, { items, bins: safeBins });
  } catch (err) {
    if (err instanceof ImportTooManyRowsError) {
      return jsonError(err.code, err.message, 422);
    }
    logger.error({ err }, "parseDefaultBinImportFile failed");
    return jsonError("PARSE_FAILED", "Không đọc được file. Kiểm tra định dạng .xlsx.", 422);
  }

  if (parsed.headerMismatch.length > 0) {
    return jsonError(
      "HEADER_MISMATCH",
      `Thiếu cột: ${parsed.headerMismatch.join(", ")}. Tải lại template (nút Xuất Excel).`,
      422,
      { missing: parsed.headerMismatch },
    );
  }

  if (!commit) {
    return NextResponse.json({
      data: {
        committed: false,
        rowTotal: parsed.rowTotal,
        validCount: parsed.validRows.length,
        errorCount: parsed.errors.length,
        preview: parsed.validRows.slice(0, 50),
        errors: parsed.errors.slice(0, 200),
      },
    });
  }

  try {
    const applied = await setItemDefaultBins(
      parsed.validRows.map((r) => ({ itemId: r.itemId, binId: r.binId })),
      guard.session.userId,
    );

    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "item_default_bin_import",
      after: {
        fileName: file.name,
        rowTotal: parsed.rowTotal,
        applied,
        errors: parsed.errors.length,
      },
      notes: `Nhập Excel gán vị trí mặc định hàng loạt — ${applied} dòng.`,
    });

    return NextResponse.json({
      data: {
        committed: true,
        rowTotal: parsed.rowTotal,
        applied,
        errorCount: parsed.errors.length,
        errors: parsed.errors.slice(0, 200),
      },
    });
  } catch (err) {
    logger.error({ err }, "setItemDefaultBins failed");
    return jsonError("IMPORT_COMMIT_FAILED", (err as Error).message ?? "Không ghi được dữ liệu", 500);
  }
}
