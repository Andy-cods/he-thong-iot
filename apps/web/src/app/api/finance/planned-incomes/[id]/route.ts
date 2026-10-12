import { NextResponse, type NextRequest } from "next/server";
import { finPlannedIncomeUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  deleteFinPlannedIncome,
  getFinPlannedIncomeById,
  updateFinPlannedIncome,
} from "@/server/repos/finPlannedIncome";
import { extractRequestMeta, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { diffObjects, writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  const row = await getFinPlannedIncomeById(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy khoản thu dự kiến.", 404);
  return NextResponse.json({ data: row });
}

/** PATCH dùng chung cho sửa thông tin VÀ đánh dấu "Đã thu"/"Huỷ" (status). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireCan(req, "update", "finance");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  const body = await parseJson(req, finPlannedIncomeUpdateSchema);
  if ("response" in body) return body.response;

  const before = await getFinPlannedIncomeById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy khoản thu dự kiến.", 404);

  try {
    const after = await updateFinPlannedIncome(params.id, body.data);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy khoản thu dự kiến.", 404);
    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "fin_planned_income",
      objectId: params.id,
      before: diff.before,
      after: diff.after,
      ...meta,
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update fin planned expense failed");
    return jsonError("INTERNAL", "Không cập nhật được khoản thu dự kiến.", 500);
  }
}

/** DELETE — chỉ xoá khoản chưa thu (OPEN/CANCELLED); UI chỉ hiện nút xoá khi phù hợp. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireCan(req, "update", "finance");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;

  const before = await getFinPlannedIncomeById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy khoản thu dự kiến.", 404);
  if (before.status === "DONE") {
    return jsonError(
      "FIN_PLANNED_INCOME_ALREADY_DONE",
      "Khoản thu đã đánh dấu Đã thu — không thể xoá (huỷ phiếu thu liên quan trước nếu cần).",
      409,
    );
  }

  try {
    const row = await deleteFinPlannedIncome(params.id);
    if (!row) return jsonError("NOT_FOUND", "Không tìm thấy khoản thu dự kiến.", 404);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "DELETE",
      objectType: "fin_planned_income",
      objectId: params.id,
      before,
      ...meta,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "delete fin planned expense failed");
    return jsonError("INTERNAL", "Không xoá được khoản thu dự kiến.", 500);
  }
}
