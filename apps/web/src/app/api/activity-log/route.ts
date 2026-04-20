import { NextResponse, type NextRequest } from "next/server";
import { requireCan } from "@/server/session";
import { jsonError } from "@/server/http";
import { listActivityLogs } from "@/server/repos/activityLogs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ENTITY_TYPES = new Set([
  "bom_template",
  "product_line",
  "item",
  "sales_order",
  "work_order",
  "purchase_order",
]);

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType") ?? "";
  const entityId = searchParams.get("entityId") ?? "";
  const limitParam = searchParams.get("limit");
  const limit = Math.min(50, Math.max(1, parseInt(limitParam ?? "20", 10) || 20));

  if (!entityType || !ALLOWED_ENTITY_TYPES.has(entityType)) {
    return jsonError("INVALID_PARAMS", "entityType không hợp lệ.", 400);
  }
  if (!entityId) {
    return jsonError("INVALID_PARAMS", "Thiếu entityId.", 400);
  }

  const rows = await listActivityLogs(entityType, entityId, limit);
  return NextResponse.json({ data: rows });
}
