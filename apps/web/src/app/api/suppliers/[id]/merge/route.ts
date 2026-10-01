import { NextResponse, type NextRequest } from "next/server";
import { supplierMergeSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  validateUuidParam,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import {
  getSupplierById,
  mergeSuppliers,
  SupplierMergeError,
} from "@/server/repos/suppliers";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TASK-6VIEC Việc 3 — POST /api/suppliers/[id]/merge { targetId }
 *
 * Gộp NCC [id] (nguồn, sẽ bị is_active=false) VÀO NCC targetId (giữ lại,
 * nhận mọi tham chiếu FK). Chỉ admin (RBAC `delete:supplier` — purchaser chỉ
 * CÓ THỂ ĐỀ XUẤT ngoài hệ thống, không thực thi được route này vì matrix
 * purchaser không có `delete:supplier`). Audit cả 2 bên (nguồn + đích).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "delete", "supplier");
  if ("response" in guard) return guard.response;

  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;

  const body = await parseJson(req, supplierMergeSchema);
  if ("response" in body) return body.response;

  if (body.data.targetId === params.id) {
    return jsonError("VALIDATION", "NCC giữ lại phải khác NCC sẽ gộp.", 400);
  }

  const [source, target] = await Promise.all([
    getSupplierById(params.id),
    getSupplierById(body.data.targetId),
  ]);
  if (!source) return jsonError("NOT_FOUND", "Không tìm thấy NCC sẽ gộp.", 404);
  if (!target) return jsonError("NOT_FOUND", "Không tìm thấy NCC giữ lại.", 404);
  if (source.isActive === false) {
    return jsonError(
      "CONFLICT",
      "NCC này đã ngưng hoạt động (có thể đã được gộp trước đó).",
      409,
    );
  }

  try {
    const result = await mergeSuppliers(params.id, body.data.targetId);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "supplier",
      objectId: params.id,
      before: { isActive: true, code: source.code, name: source.name },
      after: { isActive: false },
      notes: `Gộp NCC ${source.code} — ${source.name} vào ${target.code} — ${target.name}. Chuyển: ${JSON.stringify(result.moved)}. Xung đột xử lý: item_supplier=${result.itemSupplierConflictsResolved}, fin_invoice=${result.finInvoiceConflictsRenamed}.`,
      ...meta,
    });
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "supplier",
      objectId: body.data.targetId,
      notes: `Nhận gộp từ NCC ${source.code} — ${source.name}. Chuyển: ${JSON.stringify(result.moved)}.`,
      ...meta,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof SupplierMergeError) {
      return jsonError("VALIDATION", err.message, 400);
    }
    logger.error({ err }, "merge suppliers failed");
    return jsonError("INTERNAL", "Không gộp được NCC.", 500);
  }
}
