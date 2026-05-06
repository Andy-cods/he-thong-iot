import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { reportTarget } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError, parseJson, parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.62 — CRUD KPI Targets.
 * RBAC: report.create / read / update / delete (admin only).
 */

const ROLE_CODES = [
  "admin",
  "planner",
  "operator",
  "warehouse",
  "purchaser",
] as const;
const PERIOD_TYPES = ["monthly", "quarterly", "yearly"] as const;
const COMPARISONS = ["gte", "lte"] as const;

const listSchema = z.object({
  roleCode: z.enum(ROLE_CODES).optional(),
  isActive: z.coerce.boolean().optional(),
});

const createSchema = z.object({
  roleCode: z.enum(ROLE_CODES).optional().nullable(),
  metricId: z.string().trim().min(1).max(64),
  periodType: z.enum(PERIOD_TYPES).default("monthly"),
  targetValue: z.coerce.number().nonnegative(),
  comparison: z.enum(COMPARISONS).default("gte"),
  notes: z.string().trim().max(500).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "report");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, listSchema);
  if ("response" in q) return q.response;

  const conds = [] as Parameters<typeof and>;
  if (q.data.roleCode) conds.push(eq(reportTarget.roleCode, q.data.roleCode));
  if (q.data.isActive !== undefined)
    conds.push(eq(reportTarget.isActive, q.data.isActive));

  const rows = await db
    .select()
    .from(reportTarget)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(reportTarget.updatedAt));

  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "report");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, createSchema);
  if ("response" in body) return body.response;

  try {
    // Deactivate existing target same (role, metric, period) trước khi tạo mới
    if (body.data.roleCode) {
      await db
        .update(reportTarget)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(reportTarget.roleCode, body.data.roleCode),
            eq(reportTarget.metricId, body.data.metricId),
            eq(reportTarget.periodType, body.data.periodType),
            eq(reportTarget.isActive, true),
          ),
        );
    }

    const [row] = await db
      .insert(reportTarget)
      .values({
        roleCode: body.data.roleCode ?? null,
        metricId: body.data.metricId,
        periodType: body.data.periodType,
        targetValue: String(body.data.targetValue),
        comparison: body.data.comparison,
        notes: body.data.notes ?? null,
        isActive: true,
        createdBy: guard.session.userId,
        updatedBy: guard.session.userId,
      })
      .returning();

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create report target failed");
    return jsonError("INTERNAL", "Không tạo được KPI target.", 500);
  }
}
