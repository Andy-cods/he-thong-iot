import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { can } from "@iot/shared";
import {
  getMaterialRequest,
  MaterialRequestConflictError,
  updateMaterialRequestStatus,
  type MaterialRequestStatus,
} from "@/server/repos/materialRequests";
import { jsonError, parseJson } from "@/server/http";
import { requireCan } from "@/server/session";
import { canForUser } from "@/server/services/rbac";
import { writeAudit } from "@/server/services/audit";
import {
  lookupUsername,
  notifyMaterialRequestReady,
} from "@/server/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/material-requests/[id]/transition — chuyển trạng thái.
 *
 * V4.1 Đợt 1b (Q3/KHO-04/KHO-17):
 *   - PENDING → PICKING | READY | CANCELLED
 *   - PICKING → READY | CANCELLED
 *   - READY   → PICKING | CANCELLED
 *   - PARTIAL → CANCELLED   (đóng phiếu giao dở, phần còn lại không giao nữa)
 *   - KHÔNG còn chuyển tay sang DELIVERED/PARTIAL → 409 "Phải lập phiếu xuất
 *     kho" (giao hàng phải trừ tồn + có chứng từ PX, xem /goods-issue).
 *   - PICKING/READY/đóng phiếu PARTIAL: `transition:materialRequest` (Kho, admin).
 *   - Huỷ: `transition:materialRequest`, hoặc người lập khi phiếu còn PENDING.
 *   - Không nhận `lines` nữa (trước đây sửa được SL dòng của phiếu khác).
 */
const transitionSchema = z.object({
  to: z.enum(["PENDING", "PICKING", "READY", "PARTIAL", "DELIVERED", "CANCELLED"]),
  warehouseNotes: z.string().max(2000).nullable().optional(),
});

type ManualTarget = "PICKING" | "READY" | "CANCELLED";

const ALLOWED: Record<MaterialRequestStatus, ManualTarget[]> = {
  PENDING:   ["PICKING", "READY", "CANCELLED"],
  PICKING:   ["READY", "CANCELLED"],
  READY:     ["PICKING", "CANCELLED"],
  PARTIAL:   ["CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "materialRequest");
  if ("response" in guard) return guard.response;

  const id = params.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return jsonError("INVALID_ID", "ID không hợp lệ", 400);
  }

  const body = await parseJson(req, transitionSchema);
  if ("response" in body) return body.response;

  const current = await getMaterialRequest(id);
  if (!current) return jsonError("NOT_FOUND", "Yêu cầu không tồn tại", 404);

  const fromStatus = current.status as MaterialRequestStatus;
  const toStatus = body.data.to;

  if (toStatus === "DELIVERED" || toStatus === "PARTIAL") {
    return jsonError(
      "GOODS_ISSUE_REQUIRED",
      "Phải lập phiếu xuất kho để giao vật tư (trừ tồn + chứng từ PX) — không đổi trạng thái tay.",
      409,
    );
  }

  const allowedTargets: string[] = ALLOWED[fromStatus] ?? [];
  if (!allowedTargets.includes(toStatus)) {
    return jsonError(
      "INVALID_TRANSITION",
      `Không thể chuyển ${fromStatus} → ${toStatus}`,
      409,
    );
  }

  // Authorization theo RBAC matrix (+ override per-user, fail-open về role).
  const canTransition = await canForUser(
    guard.session.userId,
    guard.session.roles,
    "transition",
    "materialRequest",
  ).then(
    (r) => r.allowed,
    () => can(guard.session.roles, "transition", "materialRequest"),
  );
  const isRequester = current.requestedBy === guard.session.userId;

  if (toStatus === "PICKING" || toStatus === "READY") {
    if (!canTransition) {
      return jsonError(
        "FORBIDDEN",
        "Chỉ Bộ phận Kho được chuyển sang Đang chuẩn bị / Sẵn sàng",
        403,
      );
    }
  }
  if (toStatus === "CANCELLED") {
    if (!(canTransition || (fromStatus === "PENDING" && isRequester))) {
      return jsonError("FORBIDDEN", "Không có quyền huỷ yêu cầu này", 403);
    }
  }

  try {
    const updated = await updateMaterialRequestStatus(
      id,
      fromStatus,
      toStatus as ManualTarget,
      guard.session.userId,
      { warehouseNotes: body.data.warehouseNotes ?? undefined },
    );

    await writeAudit({
      actor: guard.session,
      action: toStatus === "CANCELLED" ? "CANCEL" : "TRANSITION",
      objectType: "material_request",
      objectId: id,
      before: { status: fromStatus },
      after: { status: toStatus },
      notes:
        fromStatus === "PARTIAL" && toStatus === "CANCELLED"
          ? `Đóng ${current.requestNo} khi mới giao một phần`
          : `${current.requestNo}: ${fromStatus} → ${toStatus}`,
    });

    const actorUsername =
      guard.session.username ??
      (await lookupUsername(guard.session.userId)) ??
      "system";

    if (toStatus === "READY") {
      void notifyMaterialRequestReady({
        requestId: id,
        requestNo: current.requestNo,
        actorUserId: guard.session.userId,
        actorUsername,
        requesterUserId: current.requestedBy,
      });
    }

    return NextResponse.json({ data: { id: updated.id, status: updated.status } });
  } catch (e) {
    if (e instanceof MaterialRequestConflictError) {
      return jsonError("MR_CONFLICT", e.message, 409);
    }
    return jsonError(
      "MR_TRANSITION_FAILED",
      (e as Error).message ?? "Không chuyển được trạng thái",
      500,
    );
  }
}
