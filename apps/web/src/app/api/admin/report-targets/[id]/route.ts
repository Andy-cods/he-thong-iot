import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { reportTarget } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError, parseJson } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  targetValue: z.coerce.number().nonnegative().optional(),
  comparison: z.enum(["gte", "lte"]).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "report");
  if ("response" in guard) return guard.response;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return jsonError("BAD_REQUEST", "id không hợp lệ.", 400);
  }
  const body = await parseJson(req, updateSchema);
  if ("response" in body) return body.response;

  const patch: Record<string, unknown> = {
    updatedBy: guard.session.userId,
    updatedAt: new Date(),
  };
  if (body.data.targetValue !== undefined)
    patch.targetValue = String(body.data.targetValue);
  if (body.data.comparison !== undefined) patch.comparison = body.data.comparison;
  if (body.data.notes !== undefined) patch.notes = body.data.notes;
  if (body.data.isActive !== undefined) patch.isActive = body.data.isActive;

  try {
    const [row] = await db
      .update(reportTarget)
      .set(patch)
      .where(eq(reportTarget.id, params.id))
      .returning();
    if (!row) return jsonError("NOT_FOUND", "Target không tồn tại.", 404);
    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err, id: params.id }, "update report target failed");
    return jsonError("INTERNAL", "Không cập nhật được KPI target.", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "delete", "report");
  if ("response" in guard) return guard.response;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return jsonError("BAD_REQUEST", "id không hợp lệ.", 400);
  }
  try {
    const [row] = await db
      .delete(reportTarget)
      .where(eq(reportTarget.id, params.id))
      .returning({ id: reportTarget.id });
    if (!row) return jsonError("NOT_FOUND", "Target không tồn tại.", 404);
    return NextResponse.json({ data: { id: row.id, deleted: true } });
  } catch (err) {
    logger.error({ err, id: params.id }, "delete report target failed");
    return jsonError("INTERNAL", "Không xoá được KPI target.", 500);
  }
}
