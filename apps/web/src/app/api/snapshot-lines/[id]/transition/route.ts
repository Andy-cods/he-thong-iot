import { NextResponse, type NextRequest } from "next/server";
import { can, snapshotTransitionSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  ConflictError,
  StateTransitionError,
  getSnapshotLine,
  transitionState,
} from "@/server/repos/snapshots";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { canForUser } from "@/server/services/rbac";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/snapshot-lines/[id]/transition — đổi state với optimistic lock.
 *
 * Server check: transition rule (STATE_TRANSITIONS) + version_lock.
 * adminOverride=true bắt buộc có role admin (guard double).
 * Audit action=TRANSITION với before/after state + actionNote.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "bomSnapshot");
  if ("response" in guard) return guard.response;

  const before = await getSnapshotLine(params.id);
  if (!before) {
    return jsonError("NOT_FOUND", "Không tìm thấy snapshot line.", 404);
  }

  const body = await parseJson(req, snapshotTransitionSchema);
  if ("response" in body) return body.response;

  // adminOverride yêu cầu role admin — không cho warehouse/planner bypass rule
  if (
    body.data.adminOverride &&
    !guard.session.roles.includes("admin")
  ) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ admin được phép override state transition.",
      403,
    );
  }

  // V4.1 Đợt 1a (AUDIT §2 mục 9) — INBOUND_QC → AVAILABLE là kết luận QC:
  // chỉ người có `approve:qcInspection` (Tổ QC / Giám đốc). Trước đây mọi role
  // có `transition:bomSnapshot` (warehouse, operator…) bấm được.
  if (
    before.state === "INBOUND_QC" &&
    body.data.toState === "AVAILABLE" &&
    !(await canForUser(
      guard.session.userId,
      guard.session.roles,
      "approve",
      "qcInspection",
    ).then((r) => r.allowed, () => can(guard.session.roles, "approve", "qcInspection")))
  ) {
    return jsonError(
      "FORBIDDEN",
      "Chuyển Chờ QC → Sẵn sàng là kết luận QC — chỉ Tổ QC / Giám đốc được thực hiện (màn Chờ QC nhập kho).",
      403,
    );
  }

  try {
    const after = await transitionState({
      lineId: params.id,
      toState: body.data.toState,
      expectedVersionLock: body.data.versionLock,
      userId: guard.session.userId,
      adminOverride: body.data.adminOverride,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "TRANSITION",
      objectType: "bom_snapshot_line",
      objectId: params.id,
      before: { state: before.state, versionLock: before.versionLock },
      after: { state: after.state, versionLock: after.versionLock },
      notes: `${before.state} → ${after.state}: ${body.data.actionNote}${
        body.data.adminOverride ? " [ADMIN OVERRIDE]" : ""
      }`,
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    if (err instanceof ConflictError) {
      return jsonError("VERSION_CONFLICT", err.message, err.httpStatus);
    }
    if (err instanceof StateTransitionError) {
      return jsonError("INVALID_TRANSITION", err.message, err.httpStatus);
    }
    logger.error(
      { err, lineId: params.id, toState: body.data.toState },
      "transition state failed",
    );
    return jsonError("INTERNAL", "Không đổi được state.", 500);
  }
}
