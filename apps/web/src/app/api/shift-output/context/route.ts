import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { hhmm, shiftMinutes, suggestCurrentShift, todayInTz } from "@/lib/shift-output/shift-window";
import { jsonError, parseSearchParams } from "@/server/http";
import { canWithOverride } from "@/server/shiftOutputAccess";
import { pickSite, requireShiftOutput } from "@/server/shiftOutputScope";
import { listSites, loadActiveCatalog } from "@/server/repos/shiftOutputSetup";
import { loadRecentContext } from "@/server/repos/shiftOutputEntries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const qSchema = z.object({ siteId: z.string().uuid().optional() });

/**
 * GET /api/shift-output/context — mọi thứ form Nhập ca cần trong 1 lượt (client
 * cache localStorage để mở form khi mạng chập chờn): site + thiết lập, danh mục
 * ACTIVE, gợi ý ngày/ca theo giờ hiện tại, 5 mã gần nhất, mã ca trước theo máy,
 * TB OK 30 ngày (V3), quyền của người đang xem.
 */
export async function GET(req: NextRequest) {
  const guard = await requireShiftOutput(req, "read", "shiftOutput");
  if ("response" in guard) return guard.response;
  const q = parseSearchParams(req, qSchema);
  if ("response" in q) return q.response;
  const picked = await pickSite(guard.scope, q.data.siteId);
  if ("response" in picked) return picked.response;
  const site = picked.site;

  try {
    const now = new Date();
    const today = todayInTz(now, site.timezone);
    const [catalog, recent, sites, canApprove, canCreateSetup, canUpdateSetup] = await Promise.all([
      loadActiveCatalog(site.id),
      loadRecentContext(site.id, today),
      guard.scope.all ? listSites() : listSites(guard.scope.siteIds),
      canWithOverride(guard.session, "approve"),
      canWithOverride(guard.session, "create", "shiftOutputSetup"),
      canWithOverride(guard.session, "update", "shiftOutputSetup"),
    ]);
    const shifts = catalog.shifts.map((s) => {
      const r = s as unknown as { id: string; code: string; name: string; startTime: string; endTime: string; crossesMidnight: boolean; sortOrder: number };
      return { ...r, startTime: hhmm(r.startTime), endTime: hhmm(r.endTime), minutes: shiftMinutes(r) };
    });
    const suggestion = suggestCurrentShift(now, shifts, site.timezone);
    return NextResponse.json({
      data: {
        site,
        sites: sites.filter((s) => s.isActive),
        today,
        serverTime: now.toISOString(),
        suggestion: suggestion ? { prodDate: suggestion.prodDate, shiftId: suggestion.shift.id } : null,
        machines: catalog.machines,
        shifts,
        parts: catalog.parts,
        operators: catalog.operators,
        defectReasons: catalog.defectReasons,
        downtimeReasons: catalog.downtimeReasons,
        ...recent,
        permissions: {
          approve: canApprove,
          createSetup: canCreateSetup,
          updateSetup: canUpdateSetup,
          workshop: guard.session.roles.includes("workshop") && !guard.session.roles.includes("admin"),
        },
      },
    });
  } catch (err) {
    logger.error({ err }, "shift-output context failed");
    return jsonError("INTERNAL", "Lỗi tải dữ liệu nhập ca.", 500);
  }
}
