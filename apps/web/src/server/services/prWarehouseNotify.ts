import { logger } from "@/lib/logger";
import { warehouseIssuableRemaining } from "@/lib/procurement-policy";
import {
  getPR,
  getPRIssuedQtyByLine,
  getPRLinesEnriched,
  markPRGoodsReceivedIfAllPOsDone,
} from "@/server/repos/purchaseRequests";
import { notifyPRReadyToIssue } from "@/server/services/notifications";

interface ActorLike {
  userId: string;
  fullName?: string | null;
}

/**
 * Báo Kho "Cần xuất kho" khi phiếu còn phần xuất được từ tồn (cap theo giai
 * đoạn FINAL = SL đề xuất, trừ phần đã xuất). Không báo nếu phiếu đã xuất xong
 * / đã hoàn tất / bị huỷ-từ chối. Lỗi chỉ log — không phá nghiệp vụ.
 *
 * reason "approved": gọi sau duyệt cuối → chỉ tính phần xuất từ tồn
 *   (qty − SL cần mua). reason "goods_received": PO về đủ → còn bất cứ phần
 *   nào chưa xuất (qty − đã xuất).
 */
export async function notifyReadyToIssueIfAny(
  prId: string,
  reason: "approved" | "goods_received",
  actor?: ActorLike,
): Promise<void> {
  try {
    const pr = await getPR(prId);
    if (!pr || pr.goodsIssuedAt || pr.completedAt) return;
    if (pr.status !== "APPROVED" && pr.status !== "CONVERTED") return;
    const [lines, issued] = await Promise.all([getPRLinesEnriched(prId), getPRIssuedQtyByLine(prId)]);
    const remaining = warehouseIssuableRemaining(
      lines.map((l) => ({
        qty: l.qty,
        approvedQty: reason === "approved" ? l.approvedQty : null,
        issuedQty: issued.get(l.id) ?? 0,
        hasItem: !!l.itemId,
      })),
      // "approved": phần xuất từ tồn = qty − SL cần mua → dùng cap kiểu WAREHOUSE.
      reason === "approved" ? "WAREHOUSE" : "FINAL",
    );
    if (remaining <= 0) return;
    await notifyPRReadyToIssue({
      prId,
      prNo: pr.paperFormNo ?? pr.code,
      title: pr.title ?? null,
      creatorUserId: pr.requestedBy,
      actorUserId: actor?.userId ?? "system",
      actorUsername: actor?.fullName ?? null,
      reason,
    });
  } catch (err) {
    logger.warn({ err, prId }, "notifyReadyToIssueIfAny failed");
  }
}

/**
 * Ghi mốc "hàng về đủ" của PR (khi MỌI PO còn hiệu lực đã nhận đủ/đóng) và —
 * lần đầu — báo Kho có phiếu cần xuất.
 */
export async function markPrReceivedAndNotifyWarehouse(
  prId: string,
  actor?: ActorLike,
): Promise<void> {
  const row = await markPRGoodsReceivedIfAllPOsDone(prId);
  if (row) await notifyReadyToIssueIfAny(prId, "goods_received", actor);
}
