import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { notifyDeliveryNoteCreated } from "@/server/services/notifications";
import { getDeliveryNote, submitDeliveryNote } from "@/server/repos/deliveryNotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/warehouse/delivery-notes/[id]/submit — Kho gửi phiếu giao hàng
 * DRAFT → PENDING_APPROVAL, chờ Giám đốc (admin) duyệt thành BBGH chính thức.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "deliveryNote");
  if ("response" in guard) return guard.response;

  const before = await getDeliveryNote(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy phiếu giao hàng.", 404);
  if (before.status !== "DRAFT") {
    return jsonError(
      "INVALID_STATE",
      `Phiếu đang ở trạng thái ${before.status} — chỉ gửi được khi DRAFT.`,
      409,
    );
  }

  const row = await submitDeliveryNote(params.id);
  if (!row) return jsonError("CONFLICT", "Phiếu đã thay đổi trạng thái.", 409);

  await writeAudit({
    actor: guard.session,
    action: "UPDATE",
    objectType: "delivery_note",
    objectId: params.id,
    before: { status: before.status },
    after: { status: row.status },
    notes: `Gửi phiếu giao hàng ${row.noteNo} chờ Giám đốc duyệt`,
  });

  void notifyDeliveryNoteCreated({
    deliveryNoteId: row.id,
    noteNo: row.noteNo,
    actorUserId: guard.session.userId,
    actorUsername: guard.session.username,
  });

  return NextResponse.json({ data: row });
}
