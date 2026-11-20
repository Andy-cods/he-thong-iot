import { NextResponse, type NextRequest } from "next/server";
import { shiftBoardQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { buildBoard } from "@/lib/shift-output/board";
import { isEntryLocked } from "@/lib/shift-output/policy";
import { hhmm, todayInTz } from "@/lib/shift-output/shift-window";
import { jsonError, parseSearchParams } from "@/server/http";
import { pickSite, requireShiftOutput } from "@/server/shiftOutputScope";
import { listSetup } from "@/server/repos/shiftOutputSetup";
import { loadReportData } from "@/server/repos/shiftOutputReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/shift-output/board?date= — màn "Hôm nay": KPI ngày + lưới Máy × Ca. */
export async function GET(req: NextRequest) {
  const guard = await requireShiftOutput(req, "read", "shiftOutput");
  if ("response" in guard) return guard.response;
  const q = parseSearchParams(req, shiftBoardQuerySchema);
  if ("response" in q) return q.response;
  const picked = await pickSite(guard.scope, q.data.siteId);
  if ("response" in picked) return picked.response;
  const site = picked.site;
  try {
    const now = new Date();
    const date = q.data.date ?? todayInTz(now, site.timezone);
    const [machinesRaw, shiftsRaw, data] = await Promise.all([
      listSetup("machines", site.id, true),
      listSetup("shifts", site.id, true),
      loadReportData(site.id, { from: date, to: date }),
    ]);
    // P2 — mục đã ngừng dùng vẫn hiện nếu NGÀY ĐÓ có dòng (đổi cấu hình ca không làm "mất" ngày cũ).
    const used = new Set(data.entries.flatMap((e) => [e.machineId, e.shiftId]));
    const visible = <T extends { id: string; isActive: boolean }>(rows: T[]) => rows.filter((r) => r.isActive || used.has(r.id));
    const machines = visible(machinesRaw).map((m) => ({ id: m.id, code: String(m.code), name: String(m.name) }));
    const shifts = visible(shiftsRaw).map((s) => ({
      id: s.id,
      code: String(s.code),
      name: String(s.name),
      startTime: hhmm(String(s.startTime)),
      endTime: hhmm(String(s.endTime)),
      crossesMidnight: Boolean(s.crossesMidnight),
    }));
    const entries = data.entries.map((e) => ({
      ...e,
      locked: isEntryLocked(
        e,
        { startTime: e.shiftStart, endTime: e.shiftEnd, crossesMidnight: e.crossesMidnight },
        site,
        now,
      ),
    }));
    const board = buildBoard({ date, now, tz: site.timezone, machines, shifts, entries });
    return NextResponse.json({
      data: { ...board, site: { id: site.id, name: site.name }, machines, shifts, serverTime: now.toISOString() },
    });
  } catch (err) {
    logger.error({ err }, "shift board failed");
    return jsonError("INTERNAL", "Lỗi tải bảng hôm nay.", 500);
  }
}
