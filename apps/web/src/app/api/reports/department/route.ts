import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getDepartmentLeaderboard } from "@/server/repos/employeeProductivity";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.61 — GET /api/reports/department
 *
 * Leaderboard 1 bộ phận theo metric chính.
 * RBAC: report.read (admin V1).
 */

const ROLES = ["admin", "planner", "operator", "warehouse", "purchaser"] as const;

const querySchema = z.object({
  role: z.enum(ROLES),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sortBy: z.string().trim().max(64).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

function defaultMonthRange() {
  const nowUtc = new Date();
  const vn = new Date(nowUtc.getTime() + 7 * 3600_000);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth();
  return {
    from: new Date(Date.UTC(y, m, 1) - 7 * 3600_000),
    to: new Date(Date.UTC(y, m + 1, 1) - 7 * 3600_000),
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "report");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, querySchema);
  if ("response" in q) return q.response;

  let from: Date;
  let to: Date;
  if (q.data.from && q.data.to) {
    from = new Date(q.data.from);
    to = new Date(q.data.to);
  } else if (q.data.year && q.data.month) {
    from = new Date(Date.UTC(q.data.year, q.data.month - 1, 1) - 7 * 3600_000);
    to = new Date(Date.UTC(q.data.year, q.data.month, 1) - 7 * 3600_000);
  } else {
    const r = defaultMonthRange();
    from = r.from;
    to = r.to;
  }

  try {
    const result = await getDepartmentLeaderboard({
      role: q.data.role,
      from,
      to,
      sortBy: q.data.sortBy,
      limit: q.data.limit,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error({ err, role: q.data.role }, "department leaderboard failed");
    return jsonError("INTERNAL", "Không tạo được leaderboard bộ phận.", 500);
  }
}
