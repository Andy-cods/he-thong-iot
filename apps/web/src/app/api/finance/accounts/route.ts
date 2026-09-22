import { NextResponse, type NextRequest } from "next/server";
import { finAccountCreateSchema, finAccountListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  createFinAccount,
  getFinAccountByCode,
  listFinAccounts,
} from "@/server/repos/finAccounts";
import { extractRequestMeta, jsonError, parseJson, parseSearchParams } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  const q = parseSearchParams(req, finAccountListQuerySchema);
  if ("response" in q) return q.response;
  const result = await listFinAccounts(q.data);
  return NextResponse.json({
    data: result.rows,
    meta: { page: q.data.page, pageSize: q.data.pageSize, total: result.total },
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "finance");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, finAccountCreateSchema);
  if ("response" in body) return body.response;

  const dup = await getFinAccountByCode(body.data.code);
  if (dup)
    return jsonError(
      "FIN_ACCOUNT_CODE_DUPLICATE",
      `Mã tài khoản "${body.data.code}" đã tồn tại.`,
      409,
    );
  try {
    const row = await createFinAccount(body.data, guard.session.userId);
    if (!row) throw new Error("createFinAccount trả về undefined");
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "fin_account",
      objectId: row.id,
      after: row,
      ...meta,
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    const pgCode =
      (err as { code?: string; cause?: { code?: string } }).code ??
      (err as { cause?: { code?: string } }).cause?.code;
    if (pgCode === "23505") {
      return jsonError(
        "FIN_ACCOUNT_CODE_DUPLICATE",
        `Mã tài khoản "${body.data.code}" đã tồn tại.`,
        409,
      );
    }
    logger.error({ err }, "create fin account failed");
    return jsonError("INTERNAL", "Không tạo được tài khoản.", 500);
  }
}
