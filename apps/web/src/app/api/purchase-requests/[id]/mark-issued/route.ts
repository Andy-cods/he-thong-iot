import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  getPR,
  markPRGoodsIssuedWithStock,
} from "@/server/repos/purchaseRequests";
import { GoodsIssueError } from "@/server/repos/goodsIssues";
import { mapDbGuardError } from "@/server/repos/stockGuard";
import { extractRequestMeta, isDbConcurrencyError, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { closeReadyToIssue, notifyPRProgress } from "@/server/services/notifications";
import { isWarehouseIssueStage } from "@/lib/procurement-policy";
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
 * L8 — XUẤT NHIỀU ĐỢT: mỗi lần gọi sinh 1 phiếu xuất (trừ tồn thật) cho phần
 * Kho chọn, cộng dồn theo dòng. Chỉ khi MỌI dòng (có vật tư trong danh mục) đã
 * xuất đủ — hoặc Kho chọn `finish: true` ("Kết thúc, không xuất thêm") — phiếu
 * mới set goods_issued_at + Hoàn tất. Giữa chừng phiếu vẫn APPROVED/CONVERTED
 * và còn xuất tiếp được.
 *
 * Chống bấm 2 lần: sau khi phiếu đã đóng (xuất đủ/kết thúc) → 409
 * ALREADY_ISSUED; còn trong lúc xuất dở, vượt SL còn lại → 422 OVER_ISSUE.
 */
const pickSchema = z.object({
  prLineId: z.string().uuid(),
  lotSerialId: z.string().uuid(),
  binId: z.string().uuid(),
  // A12 — goods_issue_line.qty có 4 số lẻ + CHECK > 0: dưới 0,0001 làm tròn về 0 → 500.
  qty: z.coerce.number().min(0.0001, "Số lượng xuất tối thiểu 0,0001.").max(10_000_000),
});

const bodySchema = z.object({
  picks: z.array(pickSchema).max(200).default([]),
  /**
   * L8 — "Kết thúc, không xuất thêm": đóng quy trình xuất kho dù còn dòng chưa
   * xuất đủ. Không bật → phiếu chỉ hoàn tất khi MỌI dòng đã xuất đủ (xuất nhiều đợt).
   */
  finish: z.boolean().default(false),
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

  // V4.5 QA-C P2-6 — chặn id sai định dạng TRƯỚC khi query DB.
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
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
  // Giai đoạn Kho (đã qua Kho duyệt, chưa duyệt cuối): được xuất phần có sẵn trong kho.
  if (
    before.status !== "APPROVED" &&
    before.status !== "CONVERTED" &&
    !isWarehouseIssueStage(before)
  ) {
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
      "Phiếu đã xuất kho xong — không xuất thêm.",
      409,
    );
  }

  const parsed = await parseJson(req, bodySchema);
  if ("response" in parsed) return parsed.response;
  const { picks, noStockConfirm, noStockReason, notes, finish } = parsed.data;

  // Không có picks: chỉ hợp lệ khi "Kết thúc" (repo kiểm thêm đã có ≥ 1 đợt) hoặc ghi nhận không trừ tồn.
  if (!noStockConfirm && picks.length === 0 && !finish) {
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
      finish,
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
        complete: result.complete,
      },
      notes: result.goodsIssue
        ? `YCVT timeline IV → ${result.complete ? "Đã xuất kho xong" : "Xuất kho một phần"}, trừ tồn qua phiếu ${result.goodsIssue.issueNo}`
        : result.complete && !noStockConfirm
          ? `YCVT timeline IV → Kết thúc xuất kho (không xuất thêm)${
              result.progress && !result.progress.complete
                ? ` — còn ${result.progress.pendingLines} dòng chưa xuất đủ`
                : ""
            }`
          : `YCVT timeline IV → Đã xuất kho (KHÔNG trừ tồn): ${noStockReason ?? ""}`,
      ...meta,
    });

    // N5 — đóng "Cần xuất kho" của các Kho khác CHỈ khi phiếu không còn phần xuất được ở
    // giai đoạn hiện tại (xuất xong / hoàn tất). Mới xuất một phần → còn việc, giữ thông báo.
    if (result.complete || (result.progress?.issuableRemaining ?? 1) <= 1e-6) {
      void closeReadyToIssue(params.id);
    }

    // TASK-20260927 — báo người lập phiếu mốc tiến độ mới. L8: chỉ báo khi xuất
    // xong (đợt dở không báo — cũng tránh làm hết hiệu lực các việc còn mở).
    if (result.complete) {
      void notifyPRProgress({
        stage: "issued",
        prId: params.id,
        prNo: before.paperFormNo ?? before.code,
        title: before.title ?? null,
        creatorUserId: before.requestedBy,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.fullName,
      });
    }

    return NextResponse.json({
      data: result.pr,
      meta: {
        goodsIssue: result.goodsIssue,
        complete: result.complete,
        progress: result.progress,
      },
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
    if (isDbConcurrencyError(err)) {
      return jsonError("CONFLICT", "Đang có thao tác khác trên phiếu — thử lại.", 409);
    }
    logger.error({ err }, "mark-issued PR failed");
    return jsonError("INTERNAL", "Không cập nhật được trạng thái.", 500);
  }
}
