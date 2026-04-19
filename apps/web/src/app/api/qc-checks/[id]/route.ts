import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { deleteCheck, updateResult } from "@/server/repos/qcChecks";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  result: z.enum(["PASS", "FAIL", "NA"]),
  note: z.string().max(1024).optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(
    req,
    "admin",
    "planner",
    "operator",
    "warehouse",
  );
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, patchSchema);
  if ("response" in body) return body.response;

  try {
    const check = await updateResult({
      id: params.id,
      result: body.data.result,
      note: body.data.note ?? null,
      userId: guard.session.userId,
    });
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "QC_CHECK",
      objectType: "qc_check",
      objectId: check.id,
      after: { result: body.data.result, note: body.data.note },
      notes: `QC result updated: ${body.data.result}`,
      ...meta,
    });
    return NextResponse.json({ data: check });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "QC_CHECK_NOT_FOUND")
      return jsonError("NOT_FOUND", "QC check không tồn tại.", 404);
    logger.error({ err }, "update QC check failed");
    return jsonError("INTERNAL", "Lỗi cập nhật QC check.", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "admin");
  if ("response" in guard) return guard.response;

  try {
    await deleteCheck(params.id);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "DELETE",
      objectType: "qc_check",
      objectId: params.id,
      ...meta,
    });
    return NextResponse.json({ data: { id: params.id, deleted: true } });
  } catch (err) {
    logger.error({ err }, "delete QC check failed");
    return jsonError("INTERNAL", "Lỗi xóa QC check.", 500);
  }
}
