import { NextResponse, type NextRequest } from "next/server";
import { shiftLockSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { pickSite, requireShiftOutput } from "@/server/shiftOutputScope";
import { getSetupById } from "@/server/repos/shiftOutputSetup";
import { lockEntries } from "@/server/repos/shiftOutputEntries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/shift-output/locks — "Chốt ca" (có shiftId) / "Chốt ngày" (không có):
 * khoá sớm mọi dòng còn hiệu lực (status → LOCKED). Cần `approve:shiftOutput`
 * (admin / quản lý được grant) — tài khoản xưởng KHÔNG chốt được.
 */
export async function POST(req: NextRequest) {
  const guard = await requireShiftOutput(req, "approve", "shiftOutput");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, shiftLockSchema);
  if ("response" in body) return body.response;
  const picked = await pickSite(guard.scope, body.data.siteId ?? null);
  if ("response" in picked) return picked.response;
  const site = picked.site;
  try {
    const shiftId = body.data.shiftId ?? null;
    if (shiftId && !(await getSetupById("shifts", site.id, shiftId))) {
      return jsonError("INVALID_REFERENCE", "Ca không thuộc xưởng.", 422);
    }
    const ids = await lockEntries(site.id, body.data.prodDate, shiftId, guard.session.userId);
    const meta = extractRequestMeta(req);
    for (const id of ids) {
      await writeAudit({
        actor: guard.session,
        action: "TRANSITION",
        objectType: "shift_output_entry",
        objectId: id,
        before: { status: "SUBMITTED" },
        after: { status: "LOCKED" },
        notes: shiftId ? "Chốt ca" : "Chốt ngày",
        ...meta,
      });
    }
    return NextResponse.json({ data: { locked: ids.length } });
  } catch (err) {
    logger.error({ err }, "lock shift entries failed");
    return jsonError("INTERNAL", "Lỗi chốt ca.", 500);
  }
}
