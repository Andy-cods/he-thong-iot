import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { createFromSnapshot, listWorkOrders } from "@/server/repos/workOrders";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  parseSearchParams,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WO_STATUSES = [
  "DRAFT",
  "QUEUED",
  "RELEASED",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z
    .union([z.enum(WO_STATUSES), z.array(z.enum(WO_STATUSES))])
    .optional()
    .transform((s) =>
      s === undefined ? undefined : Array.isArray(s) ? s : [s],
    ),
  orderId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

const createSchema = z.object({
  orderId: z.string().uuid(),
  snapshotLineIds: z.array(z.string().uuid()).min(1),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  plannedStart: z.string().datetime().optional(),
  plannedEnd: z.string().datetime().optional(),
  notes: z.string().max(2000).nullish(),
});

/**
 * GET /api/work-orders — list + filter.
 * POST /api/work-orders — create WO từ order + N snapshot_lines.
 *   Role: admin / planner (operator không tạo được WO).
 */
export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, listQuerySchema);
  if ("response" in q) return q.response;

  try {
    const result = await listWorkOrders({
      q: q.data.q,
      status: q.data.status,
      orderId: q.data.orderId,
      page: q.data.page,
      pageSize: q.data.pageSize,
    });
    return NextResponse.json({
      data: result.rows,
      meta: {
        page: q.data.page,
        pageSize: q.data.pageSize,
        total: result.total,
      },
    });
  } catch (err) {
    logger.error({ err }, "list work orders failed");
    return jsonError("INTERNAL", "Lỗi tải danh sách Work Order.", 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "admin", "planner");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, createSchema);
  if ("response" in body) return body.response;

  try {
    const wo = await createFromSnapshot({
      orderId: body.data.orderId,
      snapshotLineIds: body.data.snapshotLineIds,
      priority: body.data.priority,
      plannedStart: body.data.plannedStart
        ? new Date(body.data.plannedStart)
        : null,
      plannedEnd: body.data.plannedEnd ? new Date(body.data.plannedEnd) : null,
      notes: body.data.notes ?? null,
      userId: guard.session.userId,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "work_order",
      objectId: wo.id,
      after: {
        woNo: wo.woNo,
        orderId: body.data.orderId,
        snapshotLineIds: body.data.snapshotLineIds,
        priority: body.data.priority,
      },
      notes: `WO ${wo.woNo} tạo từ ${body.data.snapshotLineIds.length} snapshot lines`,
      ...meta,
    });

    return NextResponse.json({ data: wo }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create WO failed");
    const msg = (err as Error).message;
    if (msg === "ORDER_NOT_FOUND")
      return jsonError("ORDER_NOT_FOUND", "Đơn hàng không tồn tại.", 404);
    if (msg === "SOME_SNAPSHOT_LINES_NOT_FOUND")
      return jsonError(
        "SNAPSHOT_LINES_INVALID",
        "Một số snapshot_line không thuộc đơn hàng này.",
        422,
      );
    return jsonError("INTERNAL", "Không tạo được Work Order.", 500);
  }
}
