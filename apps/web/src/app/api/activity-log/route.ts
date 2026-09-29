import { NextResponse, type NextRequest } from "next/server";
import type { RbacEntity } from "@iot/shared";
import { requireCan } from "@/server/session";
import { jsonError } from "@/server/http";
import { listActivityLogs } from "@/server/repos/activityLogs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.2 audit S-guard — map `entityType` (tên bảng thật, dùng khi ghi audit)
 * sang `RbacEntity` (domain-concept của matrix) để kiểm ĐÚNG quyền đọc theo
 * loại chứng từ thật sự đang xem, thay vì hardcode `bomTemplate` cho mọi
 * loại (trước đây cho phép user chỉ có quyền đọc BOM xem cả lịch sử PO/WO...).
 */
const ENTITY_TYPE_TO_RBAC: Record<string, RbacEntity> = {
  bom_template: "bomTemplate",
  product_line: "bomTemplate",
  item: "item",
  sales_order: "salesOrder",
  work_order: "wo",
  purchase_order: "po",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType") ?? "";
  const entityId = searchParams.get("entityId") ?? "";
  const limitParam = searchParams.get("limit");
  const limit = Math.min(50, Math.max(1, parseInt(limitParam ?? "20", 10) || 20));

  const rbacEntity = ENTITY_TYPE_TO_RBAC[entityType];
  if (!entityType || !rbacEntity) {
    return jsonError("INVALID_PARAMS", "entityType không hợp lệ.", 400);
  }
  if (!entityId) {
    return jsonError("INVALID_PARAMS", "Thiếu entityId.", 400);
  }

  const guard = await requireCan(req, "read", rbacEntity);
  if ("response" in guard) return guard.response;

  const rows = await listActivityLogs(entityType, entityId, limit);
  return NextResponse.json({ data: rows });
}
