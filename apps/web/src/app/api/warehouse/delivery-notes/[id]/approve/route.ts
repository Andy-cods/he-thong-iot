import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, parseJson } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { notifyDeliveryNoteConfirmed } from "@/server/services/notifications";
import { confirmDeliveryNote, getDeliveryNote } from "@/server/repos/deliveryNotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  deliveryResult: z.enum(["FULL", "SHORT", "DAMAGED"]).optional(),
  conclusionNotes: z.string().trim().max(2000).optional().nullable(),
});

/**
 * POST /api/warehouse/delivery-notes/[id]/approve — Giám đốc duyệt phiếu giao
 * hàng → CONFIRMED (= BBGH chính thức). PENDING_APPROVAL → CONFIRMED.
 *
 * V4.0 QĐ-5 — "CHỈ Giám đốc" là yêu cầu nghiệp vụ CỨNG, không chỉ dựa RBAC
 * matrix mềm (matrix có thể bị sửa trong tương lai). Hard-check role admin
 * TRỰC TIẾP tại route, giống pattern dept-approve/director-approve của PR.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "deliveryNote");
  if ("response" in guard) return guard.response;
  if (!guard.session.roles.includes("admin")) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ Giám đốc được phê duyệt phiếu giao hàng.",
      403,
    );
  }

  const before = await getDeliveryNote(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy phiếu giao hàng.", 404);
  if (before.status !== "PENDING_APPROVAL") {
    return jsonError(
      "INVALID_STATE",
      `Phiếu đang ở trạng thái ${before.status} — chỉ duyệt được khi PENDING_APPROVAL.`,
      409,
    );
  }

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  const row = await confirmDeliveryNote(params.id, {
    confirmedBy: guard.session.userId,
    deliveryResult: body.data.deliveryResult,
    conclusionNotes: body.data.conclusionNotes ?? undefined,
  });
  if (!row) return jsonError("CONFLICT", "Phiếu đã thay đổi trạng thái.", 409);

  await writeAudit({
    actor: guard.session,
    action: "APPROVE",
    objectType: "delivery_note",
    objectId: params.id,
    before: { status: before.status },
    after: { status: row.status },
    notes: `Giám đốc duyệt BBGH ${row.noteNo}`,
  });

  void notifyDeliveryNoteConfirmed({
    deliveryNoteId: row.id,
    noteNo: row.noteNo,
    actorUserId: guard.session.userId,
    actorUsername: guard.session.username,
  });

  return NextResponse.json({ data: row });
}
