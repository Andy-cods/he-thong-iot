import { NextResponse, type NextRequest } from "next/server";
import { SHIFT_PART_IMAGE_MAX_BYTES, SHIFT_PART_IMAGE_MIME } from "@iot/shared";
import { logger } from "@/lib/logger";
import { extractRequestMeta, jsonError, validateUuidParam } from "@/server/http";
import { sniffAttachmentMime } from "@/server/services/attachments";
import { writeAudit } from "@/server/services/audit";
import { readAsset, saveImage } from "@/server/services/bomAssets";
import { WORKSHOP_SETUP_DENIED_MESSAGE, workshopSetupDenied } from "@/server/shiftOutputAccess";
import { requireShiftOutput, scopeAllows, type ShiftScope } from "@/server/shiftOutputScope";
import { getSetupAnySite, setPartImage } from "@/server/repos/shiftOutputSetup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P2 (0089) — ảnh sản phẩm của Mã hàng (site_part.image_asset_id).
 *
 * Lưu: tái dùng kho ảnh dedup sha256 của BOM (`saveImage` — sharp: gốc ≤1600px,
 * thumbnail webp 96px) ở UPLOAD_DIR/bom/{full,thumb}/ (prod: /app/uploads,
 * bind-mount ./uploads → bền qua redeploy). Phục vụ qua route này (cookie auth +
 * phạm vi site) — tài khoản xưởng xem được, KHÔNG dùng /api/bom/assets (cần
 * quyền BOM).
 *
 *   GET    ?size=thumb|full&v=<assetId>  — read:shiftOutput
 *   POST   multipart `file` (JPEG/PNG/WEBP ≤ 5MB, kiểm magic bytes) — update:shiftOutputSetup
 *   DELETE gỡ ảnh (file giữ lại trong kho dedup — có thể dùng chung)
 */

const notFound = () => jsonError("NOT_FOUND", "Không tìm thấy mã hàng.", 404);

async function loadPart(id: string, scope: ShiftScope) {
  const part = await getSetupAnySite("parts", id);
  if (!part || !scopeAllows(scope, part.siteId)) return null;
  return part as typeof part & { imageAssetId?: string | null; code?: string };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireShiftOutput(req, "read", "shiftOutput");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  try {
    const part = await loadPart(params.id, guard.scope);
    if (!part?.imageAssetId) return jsonError("NOT_FOUND", "Mã hàng chưa có ảnh.", 404);
    const size = req.nextUrl.searchParams.get("size") === "full" ? "full" : "thumb";
    const asset = await readAsset(part.imageAssetId, size);
    if (!asset) return jsonError("NOT_FOUND", "Không đọc được file ảnh.", 404);
    // URL có v = asset id → nội dung bất biến (đổi ảnh = đổi v).
    const immutable = req.nextUrl.searchParams.get("v") === part.imageAssetId;
    return new NextResponse(new Uint8Array(asset.data), {
      status: 200,
      headers: {
        "content-type": asset.mime,
        "cache-control": immutable ? "private, max-age=31536000, immutable" : "private, no-cache",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    logger.error({ err, id: params.id }, "read part image failed");
    return jsonError("INTERNAL", "Lỗi tải ảnh.", 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireShiftOutput(req, "update", "shiftOutputSetup");
  if ("response" in guard) return guard.response;
  if (workshopSetupDenied(guard.session, "parts")) return jsonError("FORBIDDEN", WORKSHOP_SETUP_DENIED_MESSAGE, 403);
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("INVALID_FORM", "Form dữ liệu không hợp lệ.", 400);
  const file = form.get("file");
  if (!(file instanceof Blob)) return jsonError("NO_FILE", "Chưa chọn ảnh.", 400);
  if (file.size > SHIFT_PART_IMAGE_MAX_BYTES) {
    return jsonError("FILE_TOO_LARGE", `Ảnh vượt quá ${SHIFT_PART_IMAGE_MAX_BYTES / 1024 / 1024}MB.`, 413);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffAttachmentMime(new Uint8Array(buffer));
  if (!mime || !(SHIFT_PART_IMAGE_MIME as readonly string[]).includes(mime)) {
    return jsonError("INVALID_FILE_TYPE", "Chỉ nhận ảnh JPG, PNG hoặc WEBP.", 422);
  }

  try {
    const part = await loadPart(params.id, guard.scope);
    if (!part) return notFound();
    let saved: Awaited<ReturnType<typeof saveImage>>;
    try {
      saved = await saveImage(buffer);
    } catch (err) {
      logger.error({ err, id: params.id }, "save part image failed");
      return jsonError("IMAGE_PROCESS_FAILED", "Không xử lý được ảnh này. Thử ảnh khác (JPG/PNG).", 422);
    }
    const row = await setPartImage(part.siteId, part.id, saved.id, guard.session.userId);
    if (!row) return notFound();
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "shift_setup_parts",
      objectId: part.id,
      before: { imageAssetId: part.imageAssetId ?? null },
      after: { imageAssetId: saved.id },
      notes: part.imageAssetId ? "Thay ảnh mã hàng" : "Thêm ảnh mã hàng",
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err, id: params.id }, "upload part image failed");
    return jsonError("INTERNAL", "Lỗi lưu ảnh.", 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireShiftOutput(req, "update", "shiftOutputSetup");
  if ("response" in guard) return guard.response;
  if (workshopSetupDenied(guard.session, "parts")) return jsonError("FORBIDDEN", WORKSHOP_SETUP_DENIED_MESSAGE, 403);
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  try {
    const part = await loadPart(params.id, guard.scope);
    if (!part) return notFound();
    if (!part.imageAssetId) return NextResponse.json({ data: part });
    const row = await setPartImage(part.siteId, part.id, null, guard.session.userId);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "shift_setup_parts",
      objectId: part.id,
      before: { imageAssetId: part.imageAssetId },
      after: { imageAssetId: null },
      notes: "Gỡ ảnh mã hàng",
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err, id: params.id }, "remove part image failed");
    return jsonError("INTERNAL", "Lỗi gỡ ảnh.", 500);
  }
}
