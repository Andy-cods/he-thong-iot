import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  getPR,
  markPRGoodsIssuedWithStock,
} from "@/server/repos/purchaseRequests";
import { GoodsIssueError } from "@/server/repos/goodsIssues";
import { mapDbGuardError } from "@/server/repos/stockGuard";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPRProgress } from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.2 (TASK "Trừ tồn luôn") — POST /api/purchase-requests/[id]/mark-issued
 * Timeline IV.4 — "Đã xuất kho". Nay TRỪ TỒN THẬT trong cùng 1 request: Kho
 * chọn lô/bin cho từng dòng PR → sinh phiếu xuất `goods_issue` (tái dùng
 * assertIssuable/postOutboundTxns/genDocNo của Đợt 1b) CÙNG lúc set
 * goods_issued_at. Trước đây route này CHỈ ghi mốc thời gian, không trừ tồn
 * → Kho phải xuất lại lần 2 ở Sơ đồ kho → tồn lệch (lỗi gốc cần sửa).
 *
 * Body:
 *   { picks: [{ prLineId, lotSerialId, binId, qty }], notes? }
 *   — hoặc { noStockConfirm: true, noStockReason: "..." } để ghi nhận đã xuất
 *   KHÔNG trừ tồn (vật tư mua ngoài giao thẳng, không qua kho — giữ tương
 *   thích hành vi cũ, bắt buộc xác nhận rõ lý do).
 *
 * Idempotent theo đúng nghĩa "chống bấm 2 lần": đã xuất rồi → 409
 * ALREADY_ISSUED (không phải 200 im lặng như route cũ) — client hiển thị lỗi
 * rõ thay vì tưởng nhầm vừa xuất thành công lần nữa.
 */
const pickSchema = z.object({
  prLineId: z.string().uuid(),
  lotSerialId: z.string().uuid(),
  binId: z.string().uuid(),
  qty: z.coerce.number().positive(),
});

const bodySchema = z.object({
  picks: z.array(pickSchema).max(200).default([]),
  noStockConfirm: z.boolean().default(false),
  noStockReason: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "pr");
  if ("response" in guard) return guard.response;
  // V4.2 audit S-guard — RBAC action `approve:pr` dùng chung cho nhiều bước;
  // khớp docstring + UI (canMarkIssued = isAdmin || isWarehouse) nên khoá
  // thêm role tại đây, giống dept-approve/director-approve cùng thư mục.
  if (
    !guard.session.roles.includes("admin") &&
    !guard.session.roles.includes("warehouse")
  ) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ Admin hoặc Bộ phận Kho được đánh dấu đã xuất kho.",
      403,
    );
  }

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);

  // V4.1 TM-13 — chỉ phiếu đã duyệt cuối / đã lên PO mới có mốc xuất kho.
  if (before.status !== "APPROVED" && before.status !== "CONVERTED") {
    return jsonError(
      "INVALID_STATE",
      "Phiếu chưa được duyệt xong — chưa ghi nhận xuất kho được.",
      409,
    );
  }

  // Idempotency sớm (trước khi parse body) — chống bấm 2 lần rõ ràng bằng 409.
  // Transaction bên dưới vẫn khoá + kiểm lại lần nữa (phòng race thật).
  if (before.goodsIssuedAt) {
    return jsonError(
      "ALREADY_ISSUED",
      "Phiếu đã ghi nhận xuất kho trước đó — không xuất lại.",
      409,
    );
  }

  const parsed = await parseJson(req, bodySchema);
  if ("response" in parsed) return parsed.response;
  const { picks, noStockConfirm, noStockReason, notes } = parsed.data;

  if (!noStockConfirm && picks.length === 0) {
    return jsonError(
      "EMPTY_ISSUE",
      'Chọn lô/bin để xuất cho ít nhất 1 dòng, hoặc tick "Ghi nhận đã xuất — không trừ tồn" kèm lý do.',
      422,
    );
  }

  try {
    const result = await markPRGoodsIssuedWithStock(params.id, {
      actorUserId: guard.session.userId,
      picks,
      noStockConfirm,
      noStockReason: noStockReason ?? null,
      notes: notes ?? null,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_request",
      objectId: params.id,
      before: { goodsIssuedAt: null },
      after: {
        goodsIssuedAt: result.pr.goodsIssuedAt,
        goodsIssueNo: result.goodsIssue?.issueNo ?? null,
      },
      notes: result.goodsIssue
        ? `YCVT timeline IV → Đã xuất kho, trừ tồn qua phiếu ${result.goodsIssue.issueNo}`
        : `YCVT timeline IV → Đã xuất kho (KHÔNG trừ tồn): ${noStockReason ?? ""}`,
      ...meta,
    });

    // TASK-20260927 — báo người lập phiếu mốc tiến độ mới.
    void notifyPRProgress({
      stage: "issued",
      prId: params.id,
      prNo: before.paperFormNo ?? before.code,
      title: before.title ?? null,
      creatorUserId: before.requestedBy,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.fullName,
    });

    return NextResponse.json({
      data: result.pr,
      meta: { goodsIssue: result.goodsIssue },
    });
  } catch (err) {
    if (err instanceof GoodsIssueError) {
      return jsonError(err.code, err.message, err.status);
    }
    // mapDbGuardError — bắt lỗi StockGuardError + lỗi thô từ DB (trigger
    // inventory_txn_lot_guard "LOT_NOT_ISSUABLE…", lock_timeout 55P03) — cùng
    // pattern route material-requests/[id]/goods-issue.
    const g = mapDbGuardError(err);
    if (g) return jsonError(g.code, g.message, g.status);
    logger.error({ err }, "mark-issued PR failed");
    return jsonError("INTERNAL", "Không cập nhật được trạng thái.", 500);
  }
}
