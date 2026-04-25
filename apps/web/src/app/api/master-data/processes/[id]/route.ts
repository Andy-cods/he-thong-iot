import { NextResponse, type NextRequest } from "next/server";
import { processMasterUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  deactivateProcess,
  getProcessById,
  updateProcess,
} from "@/server/repos/processMaster";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Read open cho mọi role login (BOM editor cần load detail).
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  try {
    const row = await getProcessById(params.id);
    if (!row) return jsonError("NOT_FOUND", "Không tìm thấy quy trình.", 404);
    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error({ err }, "get process failed");
    return jsonError("INTERNAL", "Lỗi tải quy trình.", 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "admin", "planner");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, processMasterUpdateSchema);
  if ("response" in body) return body.response;

  try {
    const before = await getProcessById(params.id);
    if (!before)
      return jsonError("NOT_FOUND", "Không tìm thấy quy trình.", 404);

    const after = await updateProcess(params.id, body.data);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy quy trình.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "process_master",
      objectId: after.id,
      before,
      after,
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update process failed");
    return jsonError("INTERNAL", "Lỗi cập nhật quy trình.", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "admin", "planner");
  if ("response" in guard) return guard.response;

  try {
    const before = await getProcessById(params.id);
    if (!before)
      return jsonError("NOT_FOUND", "Không tìm thấy quy trình.", 404);

    const after = await deactivateProcess(params.id);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy quy trình.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "DELETE",
      objectType: "process_master",
      objectId: after.id,
      before,
      after,
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "delete process failed");
    return jsonError("INTERNAL", "Lỗi xoá quy trình.", 500);
  }
}
