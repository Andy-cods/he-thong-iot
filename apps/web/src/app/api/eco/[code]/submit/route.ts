import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import {
  EcoError,
  getECOByCode,
  submitECO,
} from "@/server/repos/ecoChanges";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireSession(req, "admin", "planner");
  if ("response" in guard) return guard.response;

  try {
    const existing = await getECOByCode(params.code);
    if (!existing) return jsonError("NOT_FOUND", "ECO không tồn tại.", 404);
    const eco = await submitECO(existing.id, guard.session.userId);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "ECO_SUBMIT",
      objectType: "eco_change",
      objectId: eco.id,
      after: { status: "SUBMITTED" },
      notes: `ECO ${eco.code} submitted for review`,
      ...meta,
    });
    return NextResponse.json({ data: eco });
  } catch (err) {
    if (err instanceof EcoError)
      return jsonError(err.code, err.message, err.httpStatus);
    logger.error({ err }, "submit ECO failed");
    return jsonError("INTERNAL", "Lỗi submit ECO.", 500);
  }
}
