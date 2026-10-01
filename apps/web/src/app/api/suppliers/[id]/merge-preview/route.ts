import { NextResponse, type NextRequest } from "next/server";
import { jsonError, validateUuidParam } from "@/server/http";
import {
  getSupplierById,
  getSupplierMergeCounts,
} from "@/server/repos/suppliers";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TASK-6VIEC Việc 3 — GET /api/suppliers/[id]/merge-preview?targetId=
 *
 * Màn xác nhận TRƯỚC khi gộp: đếm số PO/hoá đơn/thanh toán/giao dịch/bảng giá
 * vật tư của NCC [id] (nguồn) SẼ chuyển sang NCC targetId. Chỉ admin (RBAC
 * `delete:supplier`) — khớp guard `POST .../merge` (hành động phá huỷ, chỉ
 * Giám đốc/admin, purchaser chỉ ĐỀ XUẤT ngoài hệ thống).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "delete", "supplier");
  if ("response" in guard) return guard.response;

  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;

  const targetId = new URL(req.url).searchParams.get("targetId");
  if (!targetId) {
    return jsonError("VALIDATION", "Thiếu targetId (NCC giữ lại).", 400);
  }
  const targetCheck = validateUuidParam(targetId, "targetId");
  if ("response" in targetCheck) return targetCheck.response;

  if (targetId === params.id) {
    return jsonError("VALIDATION", "NCC giữ lại phải khác NCC sẽ gộp.", 400);
  }

  const [source, target] = await Promise.all([
    getSupplierById(params.id),
    getSupplierById(targetId),
  ]);
  if (!source) return jsonError("NOT_FOUND", "Không tìm thấy NCC sẽ gộp.", 404);
  if (!target) return jsonError("NOT_FOUND", "Không tìm thấy NCC giữ lại.", 404);

  const counts = await getSupplierMergeCounts(params.id);
  return NextResponse.json({
    data: {
      source: { id: source.id, code: source.code, name: source.name },
      target: { id: target.id, code: target.code, name: target.name },
      counts,
    },
  });
}
