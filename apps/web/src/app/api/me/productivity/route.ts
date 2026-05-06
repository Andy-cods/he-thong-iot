import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getEmployeeProductivity } from "@/server/repos/employeeProductivity";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.62 — GET /api/me/productivity
 *
 * Self-view báo cáo năng suất của user hiện tại. Mọi role đã login đều xem
 * được report của chính họ (không cần RBAC report.read — chỉ cần session).
 *
 * Spec section 8.6: "Privacy & access control" — log mỗi self-view nếu cần
 * compliance (V2 add audit_event action=READ_OWN_REPORT).
 */

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
});

function defaultMonthRange() {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3600_000);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth();
  return {
    from: new Date(Date.UTC(y, m, 1) - 7 * 3600_000),
    to: new Date(Date.UTC(y, m + 1, 1) - 7 * 3600_000),
  };
}

function quarterRange(year: number, q: number) {
  const startMonth = (q - 1) * 3;
  return {
    from: new Date(Date.UTC(year, startMonth, 1) - 7 * 3600_000),
    to: new Date(Date.UTC(year, startMonth + 3, 1) - 7 * 3600_000),
  };
}

function yearRange(year: number) {
  return {
    from: new Date(Date.UTC(year, 0, 1) - 7 * 3600_000),
    to: new Date(Date.UTC(year + 1, 0, 1) - 7 * 3600_000),
  };
}

function explicitMonthRange(year: number, month: number) {
  return {
    from: new Date(Date.UTC(year, month - 1, 1) - 7 * 3600_000),
    to: new Date(Date.UTC(year, month, 1) - 7 * 3600_000),
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, querySchema);
  if ("response" in q) return q.response;

  let from: Date;
  let to: Date;
  if (q.data.from && q.data.to) {
    from = new Date(q.data.from);
    to = new Date(q.data.to);
  } else if (q.data.year && q.data.quarter) {
    const r = quarterRange(q.data.year, q.data.quarter);
    from = r.from;
    to = r.to;
  } else if (q.data.year && q.data.month) {
    const r = explicitMonthRange(q.data.year, q.data.month);
    from = r.from;
    to = r.to;
  } else if (q.data.year) {
    const r = yearRange(q.data.year);
    from = r.from;
    to = r.to;
  } else {
    const r = defaultMonthRange();
    from = r.from;
    to = r.to;
  }

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return jsonError("BAD_REQUEST", "Khoảng thời gian không hợp lệ.", 400);
  }
  if (to.getTime() <= from.getTime()) {
    return jsonError("BAD_REQUEST", "to phải > from.", 400);
  }

  try {
    const report = await getEmployeeProductivity({
      userId: guard.session.userId,
      from,
      to,
    });
    if (!report) return jsonError("NOT_FOUND", "Không tìm thấy nhân viên.", 404);
    return NextResponse.json({ data: report });
  } catch (err) {
    logger.error(
      { err, userId: guard.session.userId },
      "self productivity report failed",
    );
    return jsonError("INTERNAL", "Không tạo được báo cáo.", 500);
  }
}
