import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { processMasterCreateSchema, PROCESS_PRICING_UNITS } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  createProcess,
  getProcessByCode,
  listProcesses,
} from "@/server/repos/processMaster";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  parseSearchParams,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  q: z.string().optional(),
  pricingUnit: z.enum(PROCESS_PRICING_UNITS).optional(),
  isActive: z.coerce.boolean().optional(),
  sort: z.enum(["code", "nameVn", "pricePerUnit", "createdAt"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export async function GET(req: NextRequest) {
  // Master quy trình — mọi role đã login đều xem được (BOM grid cần dropdown).
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, listQuerySchema);
  if ("response" in q) return q.response;

  try {
    const result = await listProcesses({
      q: q.data.q,
      pricingUnit: q.data.pricingUnit,
      isActive: q.data.isActive,
      sort: q.data.sort,
      order: q.data.order,
      page: q.data.page,
      pageSize: q.data.pageSize,
    });
    return NextResponse.json({
      data: result.rows,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    });
  } catch (err) {
    logger.error({ err }, "list processes failed");
    return jsonError("INTERNAL", "Lỗi tải danh sách quy trình.", 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "admin", "planner");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, processMasterCreateSchema);
  if ("response" in body) return body.response;

  try {
    const existing = await getProcessByCode(body.data.code);
    if (existing) {
      return jsonError(
        "DUPLICATE_CODE",
        `Mã '${body.data.code}' đã tồn tại.`,
        409,
      );
    }

    const row = await createProcess(body.data, guard.session.userId);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "process_master",
      objectId: row.id,
      after: row,
      ...meta,
    });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create process failed");
    return jsonError("INTERNAL", "Lỗi tạo quy trình.", 500);
  }
}
