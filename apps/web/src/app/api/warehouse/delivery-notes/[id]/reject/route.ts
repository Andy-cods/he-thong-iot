import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, parseJson } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { notifyDeliveryNoteRejected } from "@/server/services/notifications";
import { getDeliveryNote, rejectDeliveryNote } from "@/server/repos/deliveryNotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  reason: z.string().trim().min(1, "Cần nhập lý do từ chối").max(500),
});

/**
 * POST /api/warehouse/delivery-notes/[id]/reject — Giám đốc từ chối phiếu
 * giao hàng. CHỈ admin (hard-check, xem ghi chú ở approve/route.ts).
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
      "Chỉ Giám đốc được từ chối phiếu giao hàng.",
      403,
    );
  }

  const before = await getDeliveryNote(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy phiếu giao hàng.", 404);
  if (before.status !== "PENDING_APPROVAL") {
    return jsonError(
      "INVALID_STATE",
      `Phiếu đang ở trạng thái ${before.status} — chỉ từ chối được khi PENDING_APPROVAL.`,
      409,
    );
  }

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  const row = await rejectDeliveryNote(
    params.id,
    guard.session.userId,
    body.data.reason,
  );
  if (!row) return jsonError("CONFLICT", "Phiếu đã thay đổi trạng thái.", 409);

  await writeAudit({
    actor: guard.session,
    action: "UPDATE",
    objectType: "delivery_note",
    objectId: params.id,
    before: { status: before.status },
    after: { status: row.status, reason: body.data.reason },
    notes: `Giám đốc từ chối phiếu giao hàng ${row.noteNo}: ${body.data.reason}`,
  });

  void notifyDeliveryNoteRejected({
    deliveryNoteId: row.id,
    noteNo: row.noteNo,
    actorUserId: guard.session.userId,
    actorUsername: guard.session.username,
    deliveredByUserId: before.deliveredBy,
    reason: body.data.reason,
  });

  return NextResponse.json({ data: row });
}
