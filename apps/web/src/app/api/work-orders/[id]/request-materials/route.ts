import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import {
  WoMaterialPlanError,
  createWoMaterialRequests,
} from "@/server/repos/workOrderMaterialPlan";
import { jsonError, validateUuidParam } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { notifyIssueRequestNew, notifyPRSubmitted } from "@/server/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/work-orders/[id]/request-materials — V4.4 (Việc 1) "Xin vật tư
 * theo BOM": tính nhu cầu (BOM/Section II × plannedQty − phần đã xin) NGAY
 * LÚC BẤM (không tin số liệu FE gửi) → phần kho đủ tạo Yêu cầu xuất kho (ISR,
 * PENDING chờ Kho duyệt), phần thiếu tạo Đề xuất vật tư (PR, SUBMITTED đi
 * đúng luồng duyệt hiện có) — không cần body, không có tham số nào để giả
 * mạo số lượng.
 *
 * Quyền: mặc định planner + operator + admin (`transition:wo` — khớp RBAC
 * matrix hiện có, warehouse/purchaser/qc KHÔNG có `wo.transition`).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "wo");
  if ("response" in guard) return guard.response;

  // V4.5 QA-C P2-6 — chặn id sai định dạng TRƯỚC khi query DB.
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;

  try {
    const result = await createWoMaterialRequests(params.id, guard.session.userId);

    if (result.isr) {
      await writeAudit({
        actor: guard.session,
        action: "CREATE",
        objectType: "warehouse_issue_request",
        objectId: result.isr.id,
        after: { requestNo: result.isr.requestNo, totalQty: result.isr.totalQty, woId: params.id },
        notes: `Tự động sinh từ "Xin vật tư theo BOM" cho lệnh SX ${result.plan.woNo}`,
      });
      void notifyIssueRequestNew({
        reason: "production",
        requestId: result.isr.id,
        requestNo: result.isr.requestNo,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.username,
        reference: result.plan.woNo,
        totalQty: result.isr.totalQty,
      });
    }
    if (result.pr) {
      await writeAudit({
        actor: guard.session,
        action: "CREATE",
        objectType: "purchase_request",
        objectId: result.pr.id,
        after: { code: result.pr.code, totalQty: result.pr.totalQty, linkedWoId: params.id },
        notes: `Tự động sinh từ "Xin vật tư theo BOM" cho lệnh SX ${result.plan.woNo}`,
      });
      void notifyPRSubmitted({
        prId: result.pr.id,
        prNo: result.pr.paperFormNo ?? result.pr.code,
        title: `Xin vật tư theo BOM — ${result.plan.woNo}`,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.username,
      });
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof WoMaterialPlanError) {
      return jsonError(err.code, err.message, err.status);
    }
    logger.error({ err, id: params.id }, "request materials from BOM failed");
    return jsonError("INTERNAL", "Không tạo được yêu cầu vật tư.", 500);
  }
}
