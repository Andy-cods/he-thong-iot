import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import {
  contentTypeForFilename,
  readAttachmentFile,
  resolveAttachmentPath,
} from "@/server/services/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/finance/attachments/[filename] — serve file chứng từ tài chính.
 * Chứng từ tài chính KHÔNG được public — bắt buộc guard `read:finance`
 * (khác `/api/uploads/*` public nếu có, xem ràng buộc trong task).
 *
 * Chặn path traversal tuyệt đối: `resolveAttachmentPath` chỉ chấp nhận
 * filename khớp regex uuid+ext (không `..`, không `/`).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { filename: string } },
) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;

  const fullPath = await resolveAttachmentPath(params.filename);
  if (!fullPath) {
    return jsonError("NOT_FOUND", "Không tìm thấy file.", 404);
  }

  const buffer = await readAttachmentFile(fullPath);
  const contentType = contentTypeForFilename(params.filename);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": contentType,
      // private — chứng từ tài chính không cache ở CDN/proxy trung gian.
      "cache-control": "private, max-age=3600",
      "content-disposition": `inline; filename="${params.filename}"`,
      // V4.1 TC-27 — không cho trình duyệt tự đoán kiểu nội dung.
      "x-content-type-options": "nosniff",
    },
  });
}
