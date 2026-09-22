import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import { AttachmentValidationError, saveFinanceAttachment } from "@/server/services/attachments";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/finance/attachments — upload chứng từ tài chính (ảnh/PDF hoá đơn,
 * phiếu thu/chi). multipart/form-data field `file`. Trả `{ data: { url } }` —
 * FE dùng `url` này để PATCH vào `attachmentUrl` của transaction/invoice.
 *
 * KHÔNG gắn trực tiếp vào 1 transaction/invoice cụ thể ở route này (tách rời
 * upload khỏi gắn kết, giống pattern R2 presign) — caller tự PATCH sau khi
 * upload xong, đơn giản hơn cho V1.
 */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "finance");
  if ("response" in guard) return guard.response;

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("INVALID_FORM", "Form dữ liệu không hợp lệ.", 400);

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("NO_FILE", "Thiếu file đính kèm.", 400);
  }

  try {
    const { url, filename } = await saveFinanceAttachment(file);
    return NextResponse.json({ data: { url, filename } }, { status: 201 });
  } catch (err) {
    if (err instanceof AttachmentValidationError) {
      return jsonError(err.code, err.message, 422);
    }
    logger.error({ err }, "upload finance attachment failed");
    return jsonError("INTERNAL", "Không lưu được file đính kèm.", 500);
  }
}
