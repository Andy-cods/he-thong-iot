import { NextResponse, type NextRequest } from "next/server";
import { shiftSetupPatchSchemas, shiftSetupSchemas } from "@iot/shared";
import { logger } from "@/lib/logger";
import { hhmm } from "@/lib/shift-output/shift-window";
import { extractRequestMeta, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { diffObjects, writeAudit } from "@/server/services/audit";
import { WORKSHOP_SETUP_DENIED_MESSAGE, workshopSetupDenied } from "@/server/shiftOutputAccess";
import { requireShiftOutput, scopeAllows } from "@/server/shiftOutputScope";
import {
  countActiveSetup,
  getSetupAnySite,
  parseSetupKind,
  SETUP_LABELS,
  SetupDuplicateError,
  updateSetup,
} from "@/server/repos/shiftOutputSetup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => jsonError("NOT_FOUND", "Không tìm thấy mục.", 404);
const denied = () => jsonError("FORBIDDEN", WORKSHOP_SETUP_DENIED_MESSAGE, 403);
const lastShift = () =>
  jsonError("LAST_ACTIVE_SHIFT", "Phải còn ít nhất 1 ca đang dùng. Thêm ca mới trước khi ngừng ca này.", 422);

/** Ngừng dùng ca đang dùng CUỐI CÙNG của site → chặn (form Nhập ca cần ≥ 1 ca). */
async function isLastActiveShift(kind: string, before: { siteId: string; isActive: boolean }) {
  return kind === "shifts" && before.isActive && (await countActiveSetup("shifts", before.siteId)) <= 1;
}

/** PATCH /api/shift-output/setup/[kind]/[id] — sửa mục (gồm bật/tắt "đang dùng"). */
export async function PATCH(req: NextRequest, { params }: { params: { kind: string; id: string } }) {
  const kind = parseSetupKind(params.kind);
  if (!kind) return jsonError("NOT_FOUND", "Danh mục không tồn tại.", 404);
  const guard = await requireShiftOutput(req, "update", "shiftOutputSetup");
  if ("response" in guard) return guard.response;
  if (workshopSetupDenied(guard.session, kind)) return denied();
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  const body = await parseJson(req, shiftSetupPatchSchemas[kind]);
  if ("response" in body) return body.response;
  try {
    const before = await getSetupAnySite(kind, params.id);
    if (!before || !scopeAllows(guard.scope, before.siteId)) return notFound();
    const patch = body.data as Record<string, unknown>;
    if (kind === "shifts") {
      const { crossesMidnight: _ignored, ...rest } = patch;
      const check = shiftSetupSchemas.shifts.safeParse({
        code: before.code,
        name: before.name,
        startTime: hhmm(String(before.startTime)),
        endTime: hhmm(String(before.endTime)),
        ...rest,
      });
      if (!check.success) {
        return jsonError("VALIDATION_ERROR", check.error.issues[0]?.message ?? "Giờ ca không hợp lệ.", 422);
      }
      // P2 — "qua nửa đêm" luôn suy từ giờ sau khi ghép (client không cần checkbox).
      patch.crossesMidnight = check.data.crossesMidnight;
    }
    if (patch.isActive === false && (await isLastActiveShift(kind, before))) return lastShift();
    const row = await updateSetup(kind, before.siteId, params.id, patch, guard.session.userId);
    if (!row) return notFound();
    const diff = diffObjects(before, row);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: `shift_setup_${kind}`,
      objectId: row.id,
      before: diff.before,
      after: diff.after,
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ data: row });
  } catch (err) {
    if (err instanceof SetupDuplicateError) {
      return jsonError("DUPLICATE", `${SETUP_LABELS[kind]} này đã có trong danh mục.`, 409);
    }
    logger.error({ err, kind }, "update shift setup failed");
    return jsonError("INTERNAL", "Lỗi sửa danh mục.", 500);
  }
}

/** DELETE = NGỪNG DÙNG (is_active=false) — không xoá để giữ lịch sử sản lượng. */
export async function DELETE(req: NextRequest, { params }: { params: { kind: string; id: string } }) {
  const kind = parseSetupKind(params.kind);
  if (!kind) return jsonError("NOT_FOUND", "Danh mục không tồn tại.", 404);
  const guard = await requireShiftOutput(req, "delete", "shiftOutputSetup");
  if ("response" in guard) return guard.response;
  if (workshopSetupDenied(guard.session, kind)) return denied();
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  try {
    const before = await getSetupAnySite(kind, params.id);
    if (!before || !scopeAllows(guard.scope, before.siteId)) return notFound();
    if (await isLastActiveShift(kind, before)) return lastShift();
    const row = await updateSetup(kind, before.siteId, params.id, { isActive: false }, guard.session.userId);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: `shift_setup_${kind}`,
      objectId: params.id,
      before: { isActive: before.isActive },
      after: { isActive: false },
      notes: "Ngừng dùng",
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err, kind }, "deactivate shift setup failed");
    return jsonError("INTERNAL", "Lỗi ngừng dùng mục.", 500);
  }
}
