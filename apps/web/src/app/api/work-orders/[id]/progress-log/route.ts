import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  insertProgressLog,
  listProgressLog,
} from "@/server/repos/woProgressLog";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { hasRole, requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEP_TYPES = [
  "PROGRESS_REPORT",
  "PAUSE",
  "RESUME",
  "QC_PASS",
  "QC_FAIL",
  "ISSUE",
  "NOTE",
  "PHOTO",
] as const;

const postSchema = z.object({
  workOrderLineId: z.string().uuid().optional().nullable(),
  stepType: z.enum(STEP_TYPES),
  qtyCompleted: z.number().nonnegative().optional(),
  qtyScrap: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional().nullable(),
  photoUrl: z.string().max(2048).optional().nullable(),
  station: z.string().max(100).optional().nullable(),
  durationMinutes: z.number().int().nonnegative().optional().nullable(),
});

/** GET /api/work-orders/[id]/progress-log — 100 entries mới nhất. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "wo");
  if ("response" in guard) return guard.response;

  try {
    const rows = await listProgressLog(params.id, 100);
    return NextResponse.json({ data: rows, meta: { total: rows.length } });
  } catch (err) {
    logger.error({ err, id: params.id }, "list progress-log failed");
    return jsonError("INTERNAL", "Lỗi tải nhật ký tiến độ.", 500);
  }
}

/**
 * POST /api/work-orders/[id]/progress-log
 *
 * RBAC: operator+ (admin/planner/operator/warehouse) — dùng `transition` action
 * trên `wo` entity (match quyền QC checks + pause/resume).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "wo");
  if ("response" in guard) return guard.response;

  // Hạn chế thêm: warehouse không được báo tiến độ (chỉ operator+).
  if (
    !hasRole(guard.session, "admin", "planner", "operator")
  ) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ admin/planner/operator mới được báo tiến độ.",
      403,
    );
  }

  const body = await parseJson(req, postSchema);
  if ("response" in body) return body.response;

  try {
    const row = await insertProgressLog({
      workOrderId: params.id,
      workOrderLineId: body.data.workOrderLineId ?? null,
      stepType: body.data.stepType,
      qtyCompleted: body.data.qtyCompleted ?? 0,
      qtyScrap: body.data.qtyScrap ?? 0,
      notes: body.data.notes ?? null,
      photoUrl: body.data.photoUrl ?? null,
      station: body.data.station ?? null,
      durationMinutes: body.data.durationMinutes ?? null,
      operatorId: guard.session.userId,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "work_order",
      objectId: params.id,
      after: {
        progressEntryId: row.id,
        stepType: body.data.stepType,
        qtyCompleted: body.data.qtyCompleted,
        qtyScrap: body.data.qtyScrap,
        station: body.data.station,
      },
      notes: `Progress log: ${body.data.stepType}${body.data.notes ? ` · ${body.data.notes.slice(0, 100)}` : ""}`,
      ...meta,
    });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err, id: params.id }, "insert progress-log failed");
    return jsonError("INTERNAL", "Lỗi ghi nhật ký tiến độ.", 500);
  }
}
