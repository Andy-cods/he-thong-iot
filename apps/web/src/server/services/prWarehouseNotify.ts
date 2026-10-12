import { and, eq, inArray, like, sql } from "drizzle-orm";
import { notification, purchaseOrder } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { GOODS_RECEIVED_TITLE_MARK, shouldNotifyReadyToIssue } from "@/lib/pr-close-policy";
import {
  finalizePrIfComplete,
  getPrLedger,
  markPRGoodsReceivedIfAllPOsDone,
} from "@/server/repos/purchaseRequests";
import { INFO_EVENT_SUFFIX } from "@/server/services/notification-plans";
import {
  closeReadyToIssue,
  notifyPRApproved,
  notifyPRProgress,
  notifyPRReadyToIssue,
} from "@/server/services/notifications";

interface ActorLike {
  userId: string;
  fullName?: string | null;
}

/** Số dòng phiếu nhập của PO (sống) của phiếu còn chờ QC — hàng đó CHƯA xuất được. */
async function countPendingQcLines(prId: string): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT count(*)::int AS n
    FROM app.inbound_receipt_line rl
    JOIN app.purchase_order_line pol ON pol.id = rl.po_line_id
    JOIN app.purchase_order po ON po.id = pol.po_id
    WHERE po.pr_id = ${prId} AND po.status <> 'CANCELLED' AND rl.qc_status = 'PENDING'
  `)) as unknown as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}

/** Đã từng báo Kho "hàng mua đã về" cho phiếu này (bất kể đã đọc hay chưa)? */
async function alreadyNotifiedGoodsReceived(prId: string): Promise<boolean> {
  const [hit] = await db
    .select({ id: notification.id })
    .from(notification)
    .where(
      and(
        eq(notification.entityId, prId),
        inArray(notification.eventType, [
          "PR_READY_TO_ISSUE",
          `PR_READY_TO_ISSUE${INFO_EVENT_SUFFIX}`,
        ]),
        like(notification.title, `%${GOODS_RECEIVED_TITLE_MARK}%`),
      ),
    )
    .limit(1);
  return !!hit;
}

/**
 * Báo Kho "Cần xuất kho" khi phiếu có phần xuất được THỰC SỰ (xem
 * `shouldNotifyReadyToIssue`). Không báo nếu phiếu đã xuất xong / hoàn tất /
 * huỷ-từ chối. Lỗi chỉ log — không phá nghiệp vụ.
 *
 * reason "approved" / "stock_covered": gọi sau duyệt cuối / Kho đủ từ tồn → chỉ
 *   tính phần xuất từ tồn (qty − SL cần mua).
 * reason "goods_received": mọi PO sống đã nhận đủ + hết lô chờ QC → tính theo
 *   trần có PO (phần có sẵn + hàng đã về), 1 lần / phiếu.
 *
 * actorUserId: người thao tác (session) hoặc null — KHÔNG BAO GIỜ chuỗi "system"
 * (cột actor_user_id là uuid → trước đây insert lỗi, thông báo không ghi).
 */
export async function notifyReadyToIssueIfAny(
  prId: string,
  reason: "approved" | "goods_received" | "stock_covered",
  actor?: ActorLike | null,
): Promise<void> {
  try {
    const loaded = await getPrLedger(prId);
    if (!loaded) return;
    const pr = loaded.pr;
    const pos = await db
      .select({ status: purchaseOrder.status })
      .from(purchaseOrder)
      .where(eq(purchaseOrder.prId, prId));
    // SỔ DÒNG — phần còn xuất được của phiếu (cùng nguồn với trần xuất/giữ chỗ).
    const remaining = loaded.ledger.totalRemaining;
    // m4 — SL cần mua mà hàng đạt QC từ PO chưa đủ (PO đóng thiếu / có lô không đạt).
    let shortQty = 0;
    if (reason === "goods_received") {
      for (const l of loaded.ledger.lines) {
        if (!l.itemId) continue;
        shortQty += Math.max(0, l.buy - l.receivedOk);
      }
    }

    const ok = shouldNotifyReadyToIssue({
      reason: reason === "goods_received" ? "goods_received" : "approved",
      pr,
      poStatuses: pos.map((p) => p.status as string),
      pendingQcLines: reason === "goods_received" ? await countPendingQcLines(prId) : 0,
      issuableRemaining: remaining,
      alreadyNotifiedGoodsReceived:
        reason === "goods_received" ? await alreadyNotifiedGoodsReceived(prId) : false,
    });
    if (!ok) return;

    await notifyPRReadyToIssue({
      prId,
      prNo: pr.paperFormNo ?? pr.code,
      title: pr.title ?? null,
      creatorUserId: pr.requestedBy,
      // "Hàng về" là sự kiện của hệ thống/NCC: không loại người thao tác khỏi danh sách
      // nhận (một người Kho nhận hàng vẫn cần thấy việc xuất).
      actorUserId: reason === "goods_received" ? null : actor?.userId ?? null,
      actorUsername: reason === "goods_received" ? null : actor?.fullName ?? null,
      reason,
      shortQty,
    });
    // m4 — chống "Cần xuất kho" treo do race (đóng PO/nhận hàng ‖ xuất kho): đọc lại sổ SAU khi chèn;
    // phiếu đã hết phần xuất được / đã xuất xong → đóng ngay. Thao tác xuất commit sau lần đọc này thì
    // chính route xuất đóng thông báo (closeReadyToIssue chạy sau commit của nó, tức sau lần chèn này).
    const again = await getPrLedger(prId);
    if (!again || again.pr.goodsIssuedAt || again.pr.completedAt || again.ledger.totalRemaining <= 5e-5) {
      await closeReadyToIssue(prId);
    }
  } catch (err) {
    logger.warn({ err, prId }, "notifyReadyToIssueIfAny failed");
  }
}

/**
 * Ghi mốc "hàng về đủ" của PR (khi MỌI PO còn hiệu lực đã nhận đủ/đóng) và báo
 * Kho có phiếu cần xuất. Gọi ở cả đường nhận hàng, QC đạt và đóng PO; việc báo
 * là idempotent (1 lần / phiếu) và chỉ bắn khi hàng thực sự xuất được (đã QC đạt).
 */
export async function markPrReceivedAndNotifyWarehouse(
  prId: string,
  actor?: ActorLike | null,
): Promise<void> {
  try {
    await markPRGoodsReceivedIfAllPOsDone(prId);
  } catch (err) {
    logger.warn({ err, prId }, "markPRGoodsReceivedIfAllPOsDone failed");
  }
  // N6 — sau nhận hàng / QC / đóng PO: sổ dòng có thể đã đủ điều kiện Hoàn tất.
  if (await finalizePrAndNotify(prId, actor)) return;
  await notifyReadyToIssueIfAny(prId, "goods_received", actor);
}

/**
 * N6 — chạy finalizeIfComplete (giao dịch riêng, khoá vật tư → PR); nếu phiếu vừa Hoàn tất thì
 * đóng "Cần xuất kho" + báo người lập. Trả true nếu đã hoàn tất. Lỗi chỉ log.
 */
export async function finalizePrAndNotify(
  prId: string,
  actor?: ActorLike | null,
): Promise<boolean> {
  try {
    const done = await finalizePrIfComplete(prId);
    if (!done) {
      await notifyPoTopUpIfNeeded(prId, actor);
      return false;
    }
    await notifyPrAutoFinalized(done, actor);
    return true;
  } catch (err) {
    logger.warn({ err, prId }, "finalizePrAndNotify failed");
    return false;
  }
}

/**
 * L2(b) — phiếu vừa được `finalizeIfComplete` tự Hoàn tất (sau duyệt cuối / Kiểm tồn lại): đóng
 * "Cần xuất kho" của Kho + báo người lập mốc "đã xuất". Lỗi chỉ log.
 */
export async function notifyPrAutoFinalized(
  pr: { id: string; paperFormNo?: string | null; code: string; title?: string | null; requestedBy: string | null },
  actor?: ActorLike | null,
): Promise<void> {
  try {
    await closeReadyToIssue(pr.id);
    await notifyPRProgress({
      stage: "issued",
      prId: pr.id,
      prNo: pr.paperFormNo ?? pr.code,
      title: pr.title ?? null,
      creatorUserId: pr.requestedBy,
      actorUserId: actor?.userId ?? null,
      actorUsername: actor?.fullName ?? null,
    });
  } catch (err) {
    logger.warn({ err, prId: pr.id }, "notifyPrAutoFinalized failed");
  }
}

/**
 * B2 — phiếu đã lập PO (CONVERTED) mà còn phần phải đặt (PO đóng thiếu / QC hỏng, PO bị huỷ…) →
 * báo Thu mua "Cần tạo PO bổ sung" (1 thông báo chưa đọc / phiếu). Thu mua lập PO thẳng từ phiếu
 * (from-pr nhận CONVERTED khi toOrder > 0). Thông báo tự đóng khi có PO mới / Kho kiểm tồn về 0 /
 * phiếu hoàn tất-huỷ. Lỗi chỉ log.
 */
export async function notifyPoTopUpIfNeeded(prId: string, actor?: ActorLike | null): Promise<boolean> {
  try {
    const loaded = await getPrLedger(prId);
    if (!loaded) return false;
    const { pr, ledger } = loaded;
    if (pr.status !== "CONVERTED" || ledger.phase !== "FINAL" || ledger.toOrder <= 5e-5) return false;
    const [open] = await db
      .select({ id: notification.id })
      .from(notification)
      .where(
        and(
          eq(notification.entityId, prId),
          eq(notification.eventType, "PR_APPROVED"),
          sql`${notification.readAt} IS NULL`,
        ),
      )
      .limit(1);
    if (open) return false;
    await notifyPRApproved({
      prId,
      prNo: pr.paperFormNo ?? pr.code,
      title: pr.title ?? null,
      creatorUserId: pr.requestedBy,
      // Việc của Thu mua nói chung — không loại người vừa đóng PO khỏi danh sách nhận.
      actorUserId: null,
      actorUsername: actor?.fullName ?? null,
      topUp: ledger.toOrder,
    });
    return true;
  } catch (err) {
    logger.warn({ err, prId }, "notifyPoTopUpIfNeeded failed");
    return false;
  }
}
