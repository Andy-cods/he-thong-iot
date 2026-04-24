import { NextResponse, type NextRequest } from "next/server";
import { prCreateSchema, prListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { createPR, listPRs } from "@/server/repos/purchaseRequests";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  parseSearchParams,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/purchase-requests — list PR với filter status[], linkedOrderId.
 * POST /api/purchase-requests — tạo PR manual (DRAFT) + lines.
 *   Role: admin + planner.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "pr");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, prListQuerySchema);
  if ("response" in q) return q.response;

  try {
    const result = await listPRs({
      status: q.data.status,
      linkedOrderId: q.data.linkedOrderId,
      bomTemplateId: q.data.bomTemplateId,
      requestedBy: q.data.requestedBy,
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
    logger.error({ err }, "list PRs failed");
    return jsonError("INTERNAL", "Lỗi hệ thống khi tải yêu cầu mua hàng.", 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "pr");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, prCreateSchema);
  if ("response" in body) return body.response;

  try {
    const row = await createPR({
      title: body.data.title ?? null,
      source: body.data.source,
      linkedOrderId: body.data.linkedOrderId ?? null,
      notes: body.data.notes ?? null,
      requestedBy: guard.session.userId,
      lines: body.data.lines.map((l) => ({
        itemId: l.itemId,
        qty: l.qty,
        preferredSupplierId: l.preferredSupplierId ?? null,
        snapshotLineId: l.snapshotLineId ?? null,
        neededBy: l.neededBy ?? null,
        notes: l.notes ?? null,
      })),
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "purchase_request",
      objectId: row.id,
      after: {
        code: row.code,
        status: row.status,
        source: body.data.source,
        lineCount: body.data.lines.length,
      },
      ...meta,
    });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create PR failed");
    const msg = (err as Error).message ?? "";
    if (msg.includes("PR_MUST_HAVE_LINES")) {
      return jsonError("VALIDATION", "PR phải có ít nhất 1 dòng.", 422);
    }
    return jsonError("INTERNAL", "Không tạo được yêu cầu mua hàng.", 500);
  }
}
