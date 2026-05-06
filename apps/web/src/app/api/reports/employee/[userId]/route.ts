import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getEmployeeProductivity } from "@/server/repos/employeeProductivity";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.61 — GET /api/reports/employee/[userId]
 *
 * Báo cáo năng suất 1 user trong khoảng thời gian (mặc định = tháng hiện tại VN).
 *
 * Spec: docs/employee-productivity-spec.md
 * RBAC: report.read (chỉ admin V1).
 *
 * Query:
 *   from?: ISO date string  (default: đầu tháng hiện tại)
 *   to?:   ISO date string  (default: đầu tháng kế tiếp = exclusive bound)
 *   year?: number (alt: chọn năm)
 *   month?: number 1-12 (kết hợp year)
 */

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

/**
 * Tính range mặc định = tháng hiện tại theo Asia/Ho_Chi_Minh.
 * Postgres timezone đã handle bên trong; ở TS layer nhận UTC ISO.
 */
function defaultMonthRange(): { from: Date; to: Date } {
  // VN tz offset = +7h. Lấy "now" ở UTC, convert sang VN, tính đầu tháng VN.
  const nowUtc = new Date();
  const vnNow = new Date(nowUtc.getTime() + 7 * 3600_000);
  const year = vnNow.getUTCFullYear();
  const month = vnNow.getUTCMonth(); // 0-11
  // Đầu tháng VN = UTC year-month-01 00:00 minus 7h
  const fromVnEpoch = Date.UTC(year, month, 1, 0, 0, 0) - 7 * 3600_000;
  const toVnEpoch = Date.UTC(year, month + 1, 1, 0, 0, 0) - 7 * 3600_000;
  return { from: new Date(fromVnEpoch), to: new Date(toVnEpoch) };
}

function explicitMonthRange(year: number, month: number): { from: Date; to: Date } {
  const fromVnEpoch = Date.UTC(year, month - 1, 1, 0, 0, 0) - 7 * 3600_000;
  const toVnEpoch = Date.UTC(year, month, 1, 0, 0, 0) - 7 * 3600_000;
  return { from: new Date(fromVnEpoch), to: new Date(toVnEpoch) };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } },
) {
  const guard = await requireCan(req, "read", "report");
  if ("response" in guard) return guard.response;

  if (!/^[0-9a-f-]{36}$/i.test(params.userId)) {
    return jsonError("BAD_REQUEST", "userId không hợp lệ.", 400);
  }

  const q = parseSearchParams(req, querySchema);
  if ("response" in q) return q.response;

  let from: Date;
  let to: Date;
  if (q.data.from && q.data.to) {
    from = new Date(q.data.from);
    to = new Date(q.data.to);
  } else if (q.data.year && q.data.month) {
    const r = explicitMonthRange(q.data.year, q.data.month);
    from = r.from;
    to = r.to;
  } else {
    const r = defaultMonthRange();
    from = r.from;
    to = r.to;
  }

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return jsonError("BAD_REQUEST", "from/to không hợp lệ.", 400);
  }
  if (to.getTime() <= from.getTime()) {
    return jsonError("BAD_REQUEST", "to phải > from.", 400);
  }
  // Cap range tối đa 1 năm
  if (to.getTime() - from.getTime() > 366 * 24 * 3600 * 1000) {
    return jsonError("BAD_REQUEST", "Khoảng thời gian tối đa 1 năm.", 400);
  }

  try {
    const report = await getEmployeeProductivity({
      userId: params.userId,
      from,
      to,
    });
    if (!report) {
      return jsonError("NOT_FOUND", "Không tìm thấy nhân viên.", 404);
    }
    return NextResponse.json({ data: report });
  } catch (err) {
    logger.error({ err, userId: params.userId }, "employee productivity report failed");
    return jsonError("INTERNAL", "Không tạo được báo cáo.", 500);
  }
}
