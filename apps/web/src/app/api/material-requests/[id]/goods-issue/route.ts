import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { jsonError, parseJson } from "@/server/http";
import {
  GoodsIssueError,
  issueMaterialRequest,
} from "@/server/repos/goodsIssues";
import { mapDbGuardError } from "@/server/repos/stockGuard";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import {
  lookupUsername,
  notifyMaterialRequestDelivered,
  notifyMaterialRequestIssued,
} from "@/server/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.1 Đợt 1b (Q3/KHO-04) — POST /api/material-requests/[id]/goods-issue
 *
 * Kho lập phiếu xuất kho `PX-YYMM-NNNN` giao vật tư cho phiếu yêu cầu. Giao
 * từng phần được: phiếu → PARTIAL, giao đủ → DELIVERED (tính từ SL, không
 * chuyển tay). Trừ tồn thật (inventory_txn OUT_ISSUE) qua guard chung Đợt 1a.
 *
 * Body: { notes?, lines: [{ materialRequestLineId, picks: [{ lotSerialId, binId, qty }] }] }
 * RBAC: `create:goodsIssue` (admin, warehouse).
 */
const bodySchema = z.object({
  notes: z.string().trim().max(500).optional().nullable(),
  lines: z
    .array(
      z.object({
        materialRequestLineId: z.string().uuid(),
        picks: z
          .array(
            z.object({
              lotSerialId: z.string().uuid(),
              binId: z.string().uuid(),
              qty: z.coerce.number().positive(),
            }),
          )
          .min(1),
      }),
    )
    .min(1, "Chọn ít nhất 1 dòng để xuất"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "create", "goodsIssue");
  if ("response" in guard) return guard.response;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return jsonError("INVALID_ID", "ID không hợp lệ", 400);
  }

  const body = await parseJson(req, bodySchema);
  if ("response" in body) return body.response;

  try {
    const result = await issueMaterialRequest({
      materialRequestId: params.id,
      actorUserId: guard.session.userId,
      lines: body.data.lines,
      notes: body.data.notes ?? null,
    });

    await writeAudit({
      actor: guard.session,
      action: "ISSUE",
      objectType: "goods_issue",
      objectId: result.goodsIssue.id,
      before: { materialRequestStatus: result.previousStatus },
      after: {
        issueNo: result.goodsIssue.issueNo,
        materialRequestId: params.id,
        requestNo: result.requestNo,
        materialRequestStatus: result.status,
        totalQty: result.goodsIssue.totalQty,
        lineCount: result.goodsIssue.lineCount,
      },
      notes: `${result.goodsIssue.issueNo} giao ${result.requestNo} · ${result.goodsIssue.totalQty} · ${result.status === "DELIVERED" ? "đủ" : "một phần"}`,
    });

    const actorUsername =
      guard.session.username ??
      (await lookupUsername(guard.session.userId)) ??
      "system";
    const ctx = {
      requestId: params.id,
      requestNo: result.requestNo,
      actorUserId: guard.session.userId,
      actorUsername,
      requesterUserId: result.requestedBy,
      issueNo: result.goodsIssue.issueNo,
    };
    if (result.status === "DELIVERED") {
      void notifyMaterialRequestDelivered(ctx);
    } else {
      void notifyMaterialRequestIssued({ ...ctx, totalQty: result.goodsIssue.totalQty });
    }

    return NextResponse.json({
      data: {
        goodsIssueId: result.goodsIssue.id,
        issueNo: result.goodsIssue.issueNo,
        totalQty: result.goodsIssue.totalQty,
        lineCount: result.goodsIssue.lineCount,
        status: result.status,
      },
    });
  } catch (err) {
    if (err instanceof GoodsIssueError) {
      return jsonError(err.code, err.message, err.status);
    }
    const g = mapDbGuardError(err);
    if (g) return jsonError(g.code, g.message, g.status);
    logger.error({ err, materialRequestId: params.id }, "material request goods issue failed");
    return jsonError(
      "GOODS_ISSUE_FAILED",
      err instanceof Error ? err.message : "Lỗi lập phiếu xuất kho",
      500,
    );
  }
}
