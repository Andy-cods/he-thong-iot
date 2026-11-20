import { NextResponse, type NextRequest } from "next/server";
import { shiftSiteUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { extractRequestMeta, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { diffObjects, writeAudit } from "@/server/services/audit";
import { WORKSHOP_SETUP_DENIED_MESSAGE, workshopSetupDenied } from "@/server/shiftOutputAccess";
import { requireShiftOutput, scopeAllows } from "@/server/shiftOutputScope";
import { getSiteById, updateSite } from "@/server/repos/shiftOutputSetup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/shift-output/sites/[id] — thiết lập xưởng (giờ tự khoá, lùi ngày, ngưỡng %NG). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireShiftOutput(req, "update", "shiftOutputSetup");
  if ("response" in guard) return guard.response;
  // P2 — xưởng có update danh mục nhưng KHÔNG được nới giờ tự khoá / lùi ngày / %NG.
  if (workshopSetupDenied(guard.session, "site")) return jsonError("FORBIDDEN", WORKSHOP_SETUP_DENIED_MESSAGE, 403);
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  const body = await parseJson(req, shiftSiteUpdateSchema);
  if ("response" in body) return body.response;
  if (!scopeAllows(guard.scope, params.id)) return jsonError("SITE_NOT_FOUND", "Không tìm thấy xưởng.", 404);
  try {
    const before = await getSiteById(params.id);
    if (!before) return jsonError("SITE_NOT_FOUND", "Không tìm thấy xưởng.", 404);
    const after = await updateSite(params.id, body.data, guard.session.userId);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      (after ?? {}) as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "site",
      objectId: params.id,
      before: diff.before,
      after: diff.after,
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update site failed");
    return jsonError("INTERNAL", "Lỗi lưu thiết lập xưởng.", 500);
  }
}
