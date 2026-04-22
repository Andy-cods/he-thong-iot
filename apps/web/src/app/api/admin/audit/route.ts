import { NextResponse, type NextRequest } from "next/server";
import { auditListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { listAudit } from "@/server/repos/auditEvents";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "audit");
  if ("response" in guard) return guard.response;

  // Cast schema — auditListQuerySchema dùng ZodEffects (transform from/to → Date)
  // nên parseSearchParams generic infer không khớp. Cast an toàn vì schema chính xác.
  const q = parseSearchParams(
    req,
    auditListQuerySchema as unknown as Parameters<typeof parseSearchParams>[1],
  );
  if ("response" in q) return q.response;
  const data = q.data as ReturnType<typeof auditListQuerySchema.parse>;

  try {
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 50;
    const result = await listAudit({
      q: data.q,
      entity: data.entity,
      action: data.action,
      actorUsername: data.actorUsername,
      userId: data.userId,
      objectId: data.objectId,
      from: data.from,
      to: data.to,
      page,
      pageSize,
    });
    return NextResponse.json({
      data: result.rows,
      meta: { page, pageSize, total: result.total },
    });
  } catch (err) {
    logger.error({ err }, "list audit failed");
    return jsonError("INTERNAL", "Lỗi tải audit log.", 500);
  }
}
