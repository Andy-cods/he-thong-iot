import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, parseJson } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { createStocktakeSession, listStocktakeSessions, StocktakeError } from "@/server/repos/stocktake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  binIds: z.array(z.string().uuid()).min(1, "Chọn ít nhất 1 ô để kiểm kê"),
  scopeNote: z.string().trim().max(255).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

/**
 * V4.3 Việc 2 — GET/POST /api/warehouse/stocktake.
 *
 * GET: danh sách phiên kiểm kê (lọc theo status). POST: Kho/admin tạo phiên
 * mới — chụp tồn sổ sách NGAY từ `app.bin_inventory` cho các bin đã chọn.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "stocktake");
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const status = url.searchParams.getAll("status");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? "30")));

  const result = await listStocktakeSessions({ status, page, pageSize });
  return NextResponse.json({ data: result.rows, meta: { page, pageSize, total: result.total } });
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "stocktake");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, createSchema);
  if ("response" in body) return body.response;

  try {
    const result = await createStocktakeSession({
      binIds: body.data.binIds,
      scopeNote: body.data.scopeNote ?? null,
      notes: body.data.notes ?? null,
      createdBy: guard.session.userId,
    });

    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "stocktake_session",
      objectId: result.id,
      after: { code: result.code, binCount: body.data.binIds.length, lineCount: result.lineCount },
      notes: `Tạo phiên kiểm kê ${result.code} — ${body.data.binIds.length} ô, ${result.lineCount} dòng chụp tồn.`,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    if (err instanceof StocktakeError) return jsonError(err.code, err.message, 422);
    return jsonError("CREATE_FAILED", (err as Error).message ?? "Không tạo được phiên", 500);
  }
}
