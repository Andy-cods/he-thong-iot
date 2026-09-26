import { NextResponse, type NextRequest } from "next/server";
import { getMaterialRequest } from "@/server/repos/materialRequests";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/material-requests/[id] — chi tiết + lines.
 * V4.1 Đợt 1b — `read:materialRequest`; lines kèm remainingQty/issuableQty,
 * kèm danh sách phiếu xuất kho (goodsIssues).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "materialRequest");
  if ("response" in guard) return guard.response;

  const id = params.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return jsonError("INVALID_ID", "ID không hợp lệ", 400);
  }

  try {
    const data = await getMaterialRequest(id);
    if (!data) return jsonError("NOT_FOUND", "Yêu cầu không tồn tại", 404);
    return NextResponse.json({ data });
  } catch (e) {
    return jsonError(
      "MR_GET_FAILED",
      (e as Error).message ?? "Không lấy được yêu cầu",
      500,
    );
  }
}
