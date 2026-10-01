import { NextResponse, type NextRequest } from "next/server";
import { finPlannedExpenseCreateSchema, finPlannedExpenseListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  createFinPlannedExpense,
  listFinPlannedExpenses,
} from "@/server/repos/finPlannedExpense";
import { extractRequestMeta, jsonError, parseJson, parseSearchParams } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TASK-20261001 — "Khoản chi dự kiến" (Dự trù chi, việc 3 phần b). Đọc cho
 * mọi vai đọc `finance` (admin/accountant/shareholder); tạo/sửa chỉ
 * admin+accountant (RBAC `create`/`update` finance — xem rbac/matrix.ts).
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  const q = parseSearchParams(req, finPlannedExpenseListQuerySchema);
  if ("response" in q) return q.response;
  const rows = await listFinPlannedExpenses({ status: q.data.status });
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "finance");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, finPlannedExpenseCreateSchema);
  if ("response" in body) return body.response;

  try {
    const row = await createFinPlannedExpense(body.data, guard.session.userId);
    if (!row) throw new Error("createFinPlannedExpense trả về undefined");
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "fin_planned_expense",
      objectId: row.id,
      after: row,
      ...meta,
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create fin planned expense failed");
    return jsonError("INTERNAL", "Không tạo được khoản chi dự kiến.", 500);
  }
}
