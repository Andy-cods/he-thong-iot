import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getMaterialRequest,
  updateMaterialRequestStatus,
  type MaterialRequestStatus,
} from "@/server/repos/materialRequests";
import { jsonError, parseJson } from "@/server/http";
import { requireSession } from "@/server/session";
import {
  lookupUsername,
  notifyMaterialRequestReady,
  notifyMaterialRequestDelivered,
} from "@/server/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/material-requests/[id]/transition — chuyển trạng thái.
 *
 * Cho phép:
 *   - PENDING → PICKING | READY | CANCELLED  (warehouse / admin)
 *   - PICKING → READY | CANCELLED            (warehouse)
 *   - READY → DELIVERED                       (engineer requester / admin)
 *   - * → CANCELLED                           (admin / requester nếu PENDING)
 */
const transitionSchema = z.object({
  to: z.enum(["PENDING", "PICKING", "READY", "DELIVERED", "CANCELLED"]),
  warehouseNotes: z.string().max(2000).nullable().optional(),
  lines: z
    .array(
      z.object({
        id: z.string().uuid(),
        pickedQty: z.coerce.number().nonnegative().optional(),
        deliveredQty: z.coerce.number().nonnegative().optional(),
      }),
    )
    .optional(),
});

const ALLOWED: Record<MaterialRequestStatus, MaterialRequestStatus[]> = {
  PENDING:   ["PICKING", "READY", "CANCELLED"],
  PICKING:   ["READY", "CANCELLED"],
  READY:     ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req);
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

  // Validate transition
  if (!ALLOWED[fromStatus].includes(toStatus)) {
    return jsonError(
      "INVALID_TRANSITION",
      `Không thể chuyển ${fromStatus} → ${toStatus}`,
      409,
    );
  }

  // Authorization rules
  const roles = guard.session.roles;
  const isAdmin = roles.includes("admin");
  const isWarehouse = roles.includes("warehouse") || isAdmin;
  const isRequester = current.requestedBy === guard.session.userId;

  if (toStatus === "PICKING" || toStatus === "READY") {
    if (!isWarehouse) {
      return jsonError(
        "FORBIDDEN",
        "Chỉ Bộ phận Kho được chuyển sang PICKING/READY",
        403,
      );
    }
  }
  if (toStatus === "DELIVERED") {
    if (!isRequester && !isAdmin && !isWarehouse) {
      return jsonError(
        "FORBIDDEN",
        "Chỉ người yêu cầu hoặc Kho được xác nhận DELIVERED",
        403,
      );
    }
  }
  if (toStatus === "CANCELLED") {
    // Requester (chỉ khi PENDING) hoặc admin
    if (!(isAdmin || (fromStatus === "PENDING" && isRequester) || isWarehouse)) {
      return jsonError("FORBIDDEN", "Không có quyền huỷ yêu cầu này", 403);
    }
  }

  try {
    const updated = await updateMaterialRequestStatus(
      id,
      toStatus,
      guard.session.userId,
      {
        warehouseNotes: body.data.warehouseNotes ?? undefined,
        lines: body.data.lines,
      },
    );

    // Emit notifications
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
    } else if (toStatus === "DELIVERED") {
      void notifyMaterialRequestDelivered({
        requestId: id,
        requestNo: current.requestNo,
        actorUserId: guard.session.userId,
        actorUsername,
        requesterUserId: current.requestedBy,
      });
    }

    return NextResponse.json({ data: { id: updated?.id, status: updated?.status } });
  } catch (e) {
    return jsonError(
      "MR_TRANSITION_FAILED",
      (e as Error).message ?? "Không chuyển được trạng thái",
      500,
    );
  }
}
