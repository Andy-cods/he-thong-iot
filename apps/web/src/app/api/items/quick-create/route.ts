import { NextResponse, type NextRequest } from "next/server";
import { itemQuickCreateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { quickCreateItem } from "@/server/repos/items";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/items/quick-create — V4.4 (Việc 3), mở quyền V4.6.
 *
 * Tạo nhanh vật tư ngay trong form Đề xuất vật tư (Sheet nhỏ: tên/ĐVT/nhóm)
 * thay vì để người dùng gõ tên tự do rồi để `findOrCreateItemForLine` tự
 * đoán lúc chuyển PO (nguồn gây trùng item — xem LOOP_E2E.md #2).
 *
 * V4.6 — chủ xưởng yêu cầu MỌI vai tạo được phiếu Đề xuất vật tư (pr:create)
 * cũng tạo nhanh được vật tư từ trong phiếu (trước đây bị 403 vì dùng
 * `create:item`, chỉ admin/planner có). Dùng `create:pr` thay vì `create:item`
 * — PHẠM VI CHỈ giới hạn ở quick-create (tên/ĐVT/nhóm tối thiểu, có kiểm
 * trùng tên + audit người tạo); KHÔNG mở `/api/items` đầy đủ (sửa/xoá vật tư,
 * trang quản lý vật tư vẫn theo `create:item`/`update:item` như cũ).
 */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "pr");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, itemQuickCreateSchema);
  if ("response" in body) return body.response;

  try {
    const result = await quickCreateItem(body.data, guard.session.userId);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: {
            code: "DUPLICATE_NAME",
            message: `Đã có vật tư tên gần giống: ${result.duplicate.sku} — ${result.duplicate.name}. Dùng vật tư này hoặc xác nhận tạo mới.`,
          },
          data: { duplicate: result.duplicate },
        },
        { status: 409 },
      );
    }

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "item",
      objectId: result.item.id,
      after: result.item,
      notes: "Tạo nhanh từ form Đề xuất vật tư",
      ...meta,
    });

    return NextResponse.json({ data: result.item }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "quick-create item failed");
    return jsonError("INTERNAL", "Không tạo được vật tư.", 500);
  }
}
