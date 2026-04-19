import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  EcoError,
  getECOByCode,
  updateECO,
} from "@/server/repos/ecoChanges";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionEnum = z.enum([
  "ADD_LINE",
  "REMOVE_LINE",
  "UPDATE_QTY",
  "UPDATE_SCRAP",
  "REPLACE_COMPONENT",
]);

const patchSchema = z.object({
  title: z.string().min(1).max(256).optional(),
  description: z.string().max(2000).nullish(),
  lines: z
    .array(
      z.object({
        action: actionEnum,
        targetLineId: z.string().uuid().optional().nullable(),
        componentItemId: z.string().uuid().optional().nullable(),
        qtyPerParent: z.number().optional().nullable(),
        scrapPercent: z.number().optional().nullable(),
        description: z.string().optional().nullable(),
      }),
    )
    .optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  try {
    const eco = await getECOByCode(params.code);
    if (!eco) return jsonError("NOT_FOUND", "ECO không tồn tại.", 404);
    return NextResponse.json({ data: eco });
  } catch (err) {
    logger.error({ err }, "get ECO failed");
    return jsonError("INTERNAL", "Lỗi tải ECO.", 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireSession(req, "admin", "planner");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, patchSchema);
  if ("response" in body) return body.response;

  try {
    const existing = await getECOByCode(params.code);
    if (!existing) return jsonError("NOT_FOUND", "ECO không tồn tại.", 404);
    const updated = await updateECO(existing.id, body.data);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "eco_change",
      objectId: updated.id,
      after: body.data,
      ...meta,
    });
    return NextResponse.json({ data: updated });
  } catch (err) {
    if (err instanceof EcoError)
      return jsonError(err.code, err.message, err.httpStatus);
    logger.error({ err }, "patch ECO failed");
    return jsonError("INTERNAL", "Lỗi cập nhật ECO.", 500);
  }
}
