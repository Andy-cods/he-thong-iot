import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SHIFT_SETUP_WORKSHOP_KINDS, shiftSetupSchemas } from "@iot/shared";
import { logger } from "@/lib/logger";
import { extractRequestMeta, jsonError, parseJson, parseSearchParams } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { canWithOverride } from "@/server/shiftOutputAccess";
import { pickSite, requireShiftOutput } from "@/server/shiftOutputScope";
import {
  createSetup,
  listSetup,
  parseSetupKind,
  SETUP_LABELS,
  SetupDuplicateError,
} from "@/server/repos/shiftOutputSetup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const qSchema = z.object({
  siteId: z.string().uuid().optional(),
  includeInactive: z.enum(["0", "1"]).optional(),
});

/** GET /api/shift-output/setup/[kind] — danh mục của site (mặc định chỉ mục đang dùng). */
export async function GET(req: NextRequest, { params }: { params: { kind: string } }) {
  const kind = parseSetupKind(params.kind);
  if (!kind) return jsonError("NOT_FOUND", "Danh mục không tồn tại.", 404);
  const guard = await requireShiftOutput(req, "read", "shiftOutputSetup");
  if ("response" in guard) return guard.response;
  const q = parseSearchParams(req, qSchema);
  if ("response" in q) return q.response;
  const picked = await pickSite(guard.scope, q.data.siteId);
  if ("response" in picked) return picked.response;
  try {
    const rows = await listSetup(kind, picked.site.id, q.data.includeInactive === "1");
    return NextResponse.json({ data: rows });
  } catch (err) {
    logger.error({ err, kind }, "list shift setup failed");
    return jsonError("INTERNAL", "Lỗi tải danh mục.", 500);
  }
}

/**
 * POST /api/shift-output/setup/[kind] — thêm mục. Tài khoản xưởng (có `create`
 * nhưng không `update` danh mục) chỉ thêm được Mã hàng + Người phụ trách
 * ("+ Thêm mã mới" ngay trong form Nhập ca); máy/ca/lý do do quản trị.
 */
export async function POST(req: NextRequest, { params }: { params: { kind: string } }) {
  const kind = parseSetupKind(params.kind);
  if (!kind) return jsonError("NOT_FOUND", "Danh mục không tồn tại.", 404);
  const guard = await requireShiftOutput(req, "create", "shiftOutputSetup");
  if ("response" in guard) return guard.response;
  if (
    !SHIFT_SETUP_WORKSHOP_KINDS.includes(kind) &&
    !(await canWithOverride(guard.session, "update", "shiftOutputSetup"))
  ) {
    return jsonError("FORBIDDEN", "Tài khoản xưởng chỉ thêm được Mã hàng và Người phụ trách.", 403);
  }
  const body = await parseJson(req, shiftSetupSchemas[kind].and(z.object({ siteId: z.string().uuid().nullish() })));
  if ("response" in body) return body.response;
  const { siteId, ...data } = body.data as Record<string, unknown> & { siteId?: string | null };
  const picked = await pickSite(guard.scope, siteId ?? null);
  if ("response" in picked) return picked.response;
  try {
    const row = await createSetup(kind, picked.site.id, data, guard.session.userId);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: `shift_setup_${kind}`,
      objectId: row.id,
      after: row,
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    if (err instanceof SetupDuplicateError) {
      return jsonError("DUPLICATE", `${SETUP_LABELS[kind]} này đã có trong danh mục.`, 409);
    }
    logger.error({ err, kind }, "create shift setup failed");
    return jsonError("INTERNAL", "Lỗi thêm danh mục.", 500);
  }
}
