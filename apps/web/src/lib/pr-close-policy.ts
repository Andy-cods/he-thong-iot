/**
 * Chính sách THUẦN bổ sung cho Đề xuất vật tư (đợt sửa lỗi giám thị lần 2):
 * C1 (khi nào báo Kho "Cần xuất"), C2 (từ chối khi đã xuất sớm · tạo lại).
 * Không import DB/server.
 */

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Dấu hiệu trong tiêu đề để nhận ra thông báo "hàng mua đã về" (không cần cột mới). */
export const GOODS_RECEIVED_TITLE_MARK = "hàng mua đã về";

export interface ReadyToIssueInput {
  reason: "approved" | "goods_received";
  pr: { status: string; completedAt: unknown; goodsIssuedAt: unknown };
  /** Trạng thái các PO của phiếu (mọi PO, kể cả CANCELLED). */
  poStatuses: readonly string[];
  /** Số dòng phiếu nhập của PO phiếu còn chờ QC (lô HOLD, chưa xuất được). */
  pendingQcLines: number;
  /** SL còn xuất được (đã trừ đã xuất) — theo trần đúng giai đoạn. */
  issuableRemaining: number;
  /** Đã từng báo "hàng về" cho phiếu này (idempotent 1 lần). */
  alreadyNotifiedGoodsReceived: boolean;
}

/**
 * THUẦN — có báo Kho "Cần xuất" không?
 *  - approved: phiếu APPROVED/CONVERTED, chưa xuất xong, còn phần xuất từ tồn.
 *  - goods_received: như trên + MỌI PO sống đã nhận đủ/đóng + KHÔNG còn lô chờ QC
 *    (hàng thực sự xuất được) + chưa báo lần nào cho đợt "hàng về".
 */
export function shouldNotifyReadyToIssue(i: ReadyToIssueInput): boolean {
  if (i.pr.goodsIssuedAt || i.pr.completedAt) return false;
  if (i.pr.status !== "APPROVED" && i.pr.status !== "CONVERTED") return false;
  if (i.issuableRemaining <= 1e-6) return false;
  if (i.reason === "approved") return true;
  const live = i.poStatuses.filter((s) => s !== "CANCELLED");
  if (live.length === 0 || !live.every((s) => s === "RECEIVED" || s === "CLOSED")) return false;
  if (i.pendingQcLines > 0) return false;
  return !i.alreadyNotifiedGoodsReceived;
}

/** Từ chối ở bước duyệt cuối: đã có phiếu xuất → chốt ở phần đã xuất (không REJECTED). */
export function rejectOutcome(issueCount: number): "REJECT" | "CLOSE_AT_ISSUED" {
  return issueCount > 0 ? "CLOSE_AT_ISSUED" : "REJECT";
}

/** C3(d) — phiếu đã hoàn tất không lập PO được (API trả 409). */
export const PR_COMPLETED_PO_MESSAGE =
  "Phiếu đã hoàn tất (xuất đủ hoặc đã chốt ở phần đã xuất) — không lập PO được nữa. Cần mua thêm thì dùng “Tạo lại từ phiếu này”.";

export const REJECTED_PARTIAL_LABEL = "Hoàn tất – phần mua bị từ chối";

/** Phiếu hoàn tất do phần mua bị từ chối (đã xuất phần có sẵn)? */
export function isClosedByPartialReject(pr: {
  completedAt?: unknown;
  rejectedAt?: unknown;
  status?: string;
}): boolean {
  return !!pr.completedAt && !!pr.rejectedAt && pr.status !== "REJECTED";
}

/**
 * "Tạo lại từ phiếu này": SL = đề xuất − đã xuất; bỏ dòng ≤ 0. Trả dòng giữ
 * lại + dòng bị bỏ (đã xuất đủ) để toast liệt kê.
 */
export function recreateQuantities<T extends { id: string; qty: number | string }>(
  lines: readonly T[],
  issuedByLine: ReadonlyMap<string, number>,
): { kept: Array<{ line: T; qty: number }>; dropped: T[] } {
  const kept: Array<{ line: T; qty: number }> = [];
  const dropped: T[] = [];
  for (const l of lines) {
    const q = Math.round((num(l.qty) - (issuedByLine.get(l.id) ?? 0)) * 1e6) / 1e6;
    if (q > 1e-6) kept.push({ line: l, qty: q });
    else dropped.push(l);
  }
  return { kept, dropped };
}
