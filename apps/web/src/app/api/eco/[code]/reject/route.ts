import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  EcoError,
  getECOByCode,
  rejectECO,
} from "@/server/repos/ecoChanges";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  reason: z.string().min(1).max(1024),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireSession(req, "admin", "planner");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  try {
    const existing = await getECOByCode(params.code);
    if (!existing) return jsonError("NOT_FOUND", "ECO không tồn tại.", 404);
    const eco = await rejectECO(
      existing.id,
      body.data.reason,
      guard.session.userId,
    );
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "ECO_REJECT",
      objectType: "eco_change",
      objectId: eco.id,
      after: { status: "REJECTED", reason: body.data.reason },
      notes: `ECO ${eco.code} rejected: ${body.data.reason}`,
      ...meta,
    });
    return NextResponse.json({ data: eco });
  } catch (err) {
    if (err instanceof EcoError)
      return jsonError(err.code, err.message, err.httpStatus);
    logger.error({ err }, "reject ECO failed");
    return jsonError("INTERNAL", "Lỗi reject ECO.", 500);
  }
}
