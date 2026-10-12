/**
 * SỔ DÒNG của phiếu Đề xuất vật tư (PR) — MỘT mô hình duy nhất cho tồn / mua / xuất.
 *
 * THUẦN (không import DB/server) → dùng chung cho repo, route, giao diện và vitest.
 *
 * Mỗi dòng PR có vật tư (dòng nhập tay chưa có vật tư chỉ theo dõi PO, bỏ qua tồn):
 *
 *   req        SL đề xuất
 *   buy        SL cần mua, CƠ SỞ TOÀN PHIẾU (approved_qty kẹp ≤ req)
 *   fromStock  req − buy (phần Kho cấp từ tồn)
 *   ── theo PO của phiếu (PO huỷ = 0), phân bổ theo vật tư lần lượt qua các dòng ──
 *   receivedOk     Σ nhận ĐẠT QC
 *   pendingQc      Σ nhận còn chờ QC
 *   inbound        Σ (đặt − đạt − chờ QC) của PO ĐANG MỞ (chưa đóng/nhận đủ) — hàng còn phải về
 *   orderedEffective = receivedOk + pendingQc + inbound
 *                  (= Σ đặt PO đang mở + Σ nhận chưa bị QC loại của PO đã đóng/nhận đủ)
 *   issued     Σ đã xuất cho dòng
 *
 *   cap       = min(req, fromStock + receivedOk)       trần xuất
 *   remaining = max(0, cap − issued)                   còn xuất được = GIỮ CHỖ (phiếu ở giai đoạn giữ chỗ)
 *   toOrder   = max(0, buy − orderedEffective)         còn được lập PO
 *   waiting   = inbound + pendingQc                    đang về / chờ QC
 *
 *   outstandingBuy (phiếu) = Σ toOrder (sau duyệt cuối) + Σ waiting
 *   complete  ⇔ giai đoạn FINAL ∧ mọi dòng issued ≥ cap ∧ outstandingBuy = 0
 *   Kết thúc / không trừ tồn / Kiểm tồn lại chỉ khi Σ waiting = 0.
 *
 * Hàng QC KHÔNG ĐẠT không tính vào orderedEffective (NCC phải giao bù hoặc mua lại) — thống nhất
 * với tồn khả dụng (lô FAIL không xuất được).
 *
 * Phiếu cũ (approved_qty NULL — chưa có quyết định mua):
 *  - có PO: buy = req − SL đã xuất từ tồn (đã xuất vượt hàng PO đạt) → trần = hàng PO đạt + phần đã cấp;
 *  - không PO: sau duyệt cuối xuất đủ từ tồn (cap = req) HOẶC mua phần chưa xuất (toOrder = req − issued);
 *    giai đoạn Kho chưa chốt → cap 0;
 *  - KHÔNG BAO GIỜ giữ chỗ tồn của phiếu khác (held = 0).
 */

export type PrIssuePhase = "NONE" | "WAREHOUSE" | "FINAL";

const EPS = 1e-6;

function num(v: number | string | null | undefined, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Làm tròn 6 số lẻ (bỏ đuôi dấu phẩy động). */
export function r6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Dòng phiếu cũ: approved_qty NULL / không hợp lệ (chưa có quyết định mua). */
export function isLegacyBuy(approvedQty: number | string | null | undefined): boolean {
  return (
    approvedQty === null ||
    approvedQty === undefined ||
    approvedQty === "" ||
    !Number.isFinite(Number(approvedQty))
  );
}

/** SL cần mua đã chốt (approved_qty kẹp trong [0, req]); NULL (phiếu cũ) → req. Chỉ dùng để TÓM TẮT/hiển thị. */
export function decidedBuy(
  qty: number | string,
  approvedQty: number | string | null | undefined,
): number {
  const q = Math.max(0, num(qty));
  if (isLegacyBuy(approvedQty)) return q;
  return Math.max(0, Math.min(num(approvedQty), q));
}

/* ── Dữ liệu PO của phiếu ─────────────────────────────────────────────────── */

/** Một dòng PO (không huỷ) của phiếu, kèm tình hình nhận/QC. */
export interface LedgerPoLineRow {
  itemId: string;
  poStatus: string;
  ordered: number | string;
  /** purchase_order_line.received_qty — tổng đã nhận (mọi kết quả QC). */
  received: number | string;
  /** Σ dòng phiếu nhập chờ QC. */
  pendingQc: number | string;
  /** Σ dòng phiếu nhập QC không đạt. */
  failQc: number | string;
}

export interface ItemPoAgg {
  receivedOk: number;
  pendingQc: number;
  inbound: number;
  /** Σ đặt của PO đang mở (thông tin). */
  orderedOpen: number;
}

export interface PrPoSummary {
  /** Phiếu có ít nhất 1 PO không huỷ. */
  hasPo: boolean;
  byItem: ReadonlyMap<string, ItemPoAgg>;
}

/** PO "đang mở" = còn chờ hàng (chưa huỷ, chưa đóng, chưa nhận đủ). */
export function isOpenPoStatus(status: string): boolean {
  return status !== "CANCELLED" && status !== "CLOSED" && status !== "RECEIVED";
}

/** Gộp các dòng PO của MỘT phiếu thành tổng theo vật tư. PO huỷ bị bỏ qua. */
export function summarizePrPos(rows: ReadonlyArray<LedgerPoLineRow>): PrPoSummary {
  const byItem = new Map<string, ItemPoAgg>();
  let hasPo = false;
  for (const r of rows) {
    if (r.poStatus === "CANCELLED") continue;
    hasPo = true;
    const ordered = Math.max(0, num(r.ordered));
    const pending = Math.max(0, num(r.pendingQc));
    const fail = Math.max(0, num(r.failQc));
    // Nhận không có dòng phiếu nhập (dữ liệu cũ) coi như đạt.
    const pass = Math.max(0, num(r.received) - pending - fail);
    const a = byItem.get(r.itemId) ?? { receivedOk: 0, pendingQc: 0, inbound: 0, orderedOpen: 0 };
    a.receivedOk += pass;
    a.pendingQc += pending;
    if (isOpenPoStatus(r.poStatus)) {
      a.orderedOpen += ordered;
      a.inbound += Math.max(0, ordered - pass - pending);
    }
    byItem.set(r.itemId, a);
  }
  return { hasPo, byItem };
}

export const EMPTY_PO_SUMMARY: PrPoSummary = { hasPo: false, byItem: new Map() };

/* ── Sổ dòng ───────────────────────────────────────────────────────────────── */

export interface LedgerLineInput {
  id: string;
  itemId: string | null;
  qty: number | string;
  approvedQty?: number | string | null;
  issuedQty?: number | string | null;
}

/** Phần PO đã phân bổ cho một dòng. */
export interface LinePoShare {
  receivedOk: number;
  pendingQc: number;
  inbound: number;
}

export interface LineLedger {
  id: string;
  itemId: string | null;
  hasItem: boolean;
  /** approved_qty NULL (phiếu cũ). */
  legacy: boolean;
  req: number;
  buy: number;
  fromStock: number;
  receivedOk: number;
  pendingQc: number;
  inbound: number;
  orderedEffective: number;
  issued: number;
  cap: number;
  /** Còn xuất được (= giữ chỗ khi phiếu ở giai đoạn giữ chỗ; 0 ở giai đoạn NONE). */
  remaining: number;
  /** Phần GIỮ CHỖ tồn của phiếu khác (= remaining, trừ phiếu cũ và dòng nhập tay). */
  held: number;
  toOrder: number;
  waiting: number;
}

/**
 * HÀM GỐC — sổ của MỘT dòng từ phần PO đã phân bổ + đã xuất.
 * `hasPo` = phiếu có PO không huỷ (chỉ ảnh hưởng dòng phiếu cũ NULL).
 */
export function buildLineLedger(
  line: LedgerLineInput,
  po: LinePoShare,
  phase: PrIssuePhase,
  hasPo: boolean,
): LineLedger {
  const req = Math.max(0, num(line.qty));
  const issued = Math.max(0, num(line.issuedQty));
  const hasItem = !!line.itemId;
  const legacy = isLegacyBuy(line.approvedQty);
  const receivedOk = Math.max(0, po.receivedOk);
  const pendingQc = Math.max(0, po.pendingQc);
  const inbound = Math.max(0, po.inbound);
  const orderedEffective = receivedOk + pendingQc + inbound;

  let buy: number;
  let fromStock: number;
  let cap: number;
  let toOrder: number;
  if (!hasItem) {
    // Dòng nhập tay: không xuất kho được, chỉ theo dõi mua.
    buy = legacy ? req : decidedBuy(req, line.approvedQty) || req;
    fromStock = 0;
    cap = 0;
    toOrder = Math.max(0, buy - orderedEffective);
  } else if (legacy && !hasPo) {
    // Phiếu cũ chưa có PO: hai lối đều mở — xuất đủ từ tồn (sau duyệt cuối) hoặc mua phần chưa xuất.
    buy = Math.max(0, req - issued);
    fromStock = phase === "WAREHOUSE" ? 0 : req;
    cap = fromStock;
    toOrder = buy;
  } else {
    if (legacy) {
      const issuedFromStock = Math.max(0, issued - receivedOk);
      buy = req - Math.min(req, issuedFromStock);
    } else {
      buy = decidedBuy(req, line.approvedQty);
    }
    fromStock = req - buy;
    cap = Math.min(req, fromStock + receivedOk);
    // Phòng hờ dữ liệu cũ (đã xuất từ tồn vượt phần fromStock theo quy tắc cũ): không bao giờ đặt
    // vượt phần đề xuất chưa được đáp ứng. Với dữ liệu theo sổ, vế sau luôn ≥ vế đầu.
    toOrder = Math.max(
      0,
      Math.min(buy - orderedEffective, req - Math.max(issued, receivedOk) - pendingQc - inbound),
    );
  }
  const remaining = phase === "NONE" || !hasItem ? 0 : Math.max(0, cap - issued);
  return {
    id: line.id,
    itemId: line.itemId,
    hasItem,
    legacy,
    req: r6(req),
    buy: r6(buy),
    fromStock: r6(fromStock),
    receivedOk: r6(receivedOk),
    pendingQc: r6(pendingQc),
    inbound: r6(inbound),
    orderedEffective: r6(orderedEffective),
    issued: r6(issued),
    cap: r6(cap),
    remaining: r6(remaining),
    held: legacy ? 0 : r6(remaining),
    toOrder: r6(toOrder),
    waiting: r6(inbound + pendingQc),
  };
}

/** Sức chứa PO của dòng khi phân bổ (theo SL cần mua; phiếu cũ = req). */
function allocCapacity(l: LedgerLineInput): number {
  const req = Math.max(0, num(l.qty));
  return isLegacyBuy(l.approvedQty) ? req : decidedBuy(req, l.approvedQty);
}

/**
 * Phân bổ tổng PO theo vật tư cho các dòng cùng vật tư (thứ tự dòng): đổ lần lượt
 * receivedOk → pendingQc → inbound vào sức chứa (SL cần mua) của từng dòng; phần dư
 * (nhận vượt) dồn vào dòng cuối cùng của vật tư đó.
 */
export function allocatePoToLines(
  lines: ReadonlyArray<LedgerLineInput>,
  po: PrPoSummary,
): Map<string, LinePoShare> {
  const out = new Map<string, LinePoShare>();
  const byItem = new Map<string, LedgerLineInput[]>();
  for (const l of lines) {
    out.set(l.id, { receivedOk: 0, pendingQc: 0, inbound: 0 });
    if (!l.itemId) continue;
    const arr = byItem.get(l.itemId) ?? [];
    arr.push(l);
    byItem.set(l.itemId, arr);
  }
  for (const [itemId, ls] of byItem) {
    const agg = po.byItem.get(itemId);
    if (!agg) continue;
    const room = new Map(ls.map((l) => [l.id, allocCapacity(l)]));
    for (const key of ["receivedOk", "pendingQc", "inbound"] as const) {
      let left = Math.max(0, agg[key]);
      for (const l of ls) {
        if (left <= 0) break;
        const take = Math.min(left, room.get(l.id) ?? 0);
        if (take <= 0) continue;
        out.get(l.id)![key] += take;
        room.set(l.id, (room.get(l.id) ?? 0) - take);
        left -= take;
      }
      if (left > EPS) out.get(ls[ls.length - 1]!.id)![key] += left;
    }
  }
  return out;
}

export interface PrLedger {
  phase: PrIssuePhase;
  hasPo: boolean;
  lines: LineLedger[];
  byId: Map<string, LineLedger>;
  /** Σ remaining theo vật tư. */
  remainingByItem: Map<string, number>;
  /** Σ held theo vật tư (phần giữ chỗ tồn của phiếu khác). */
  heldByItem: Map<string, number>;
  totalRemaining: number;
  toOrder: number;
  waiting: number;
  /** Σ toOrder (trừ giai đoạn Kho — phần mua chưa duyệt) + Σ waiting. */
  outstandingBuy: number;
  /** Số dòng có vật tư chưa xuất đủ trần. */
  pendingLines: number;
  complete: boolean;
  /** Không còn hàng đang về / chờ QC → được Kiểm tồn lại / Kết thúc / ghi nhận không trừ tồn. */
  noWaiting: boolean;
}

/** Sổ của cả phiếu. */
export function buildPrLedger(
  lines: ReadonlyArray<LedgerLineInput>,
  po: PrPoSummary,
  phase: PrIssuePhase,
): PrLedger {
  const shares = allocatePoToLines(lines, po);
  const out: LineLedger[] = [];
  const byId = new Map<string, LineLedger>();
  const remainingByItem = new Map<string, number>();
  const heldByItem = new Map<string, number>();
  let totalRemaining = 0;
  let toOrder = 0;
  let waiting = 0;
  let pendingLines = 0;
  for (const l of lines) {
    const led = buildLineLedger(l, shares.get(l.id)!, phase, po.hasPo);
    out.push(led);
    byId.set(led.id, led);
    if (led.itemId && led.remaining > 0) {
      remainingByItem.set(led.itemId, r6((remainingByItem.get(led.itemId) ?? 0) + led.remaining));
      totalRemaining += led.remaining;
    }
    if (led.itemId && led.held > 0) {
      heldByItem.set(led.itemId, r6((heldByItem.get(led.itemId) ?? 0) + led.held));
    }
    toOrder += led.toOrder;
    waiting += led.waiting;
    if (led.hasItem && led.issued + 1e-4 < led.cap) pendingLines += 1;
  }
  const outstandingBuy = r6((phase === "WAREHOUSE" ? 0 : toOrder) + waiting);
  return {
    phase,
    hasPo: po.hasPo,
    lines: out,
    byId,
    remainingByItem,
    heldByItem,
    totalRemaining: r6(totalRemaining),
    toOrder: r6(toOrder),
    waiting: r6(waiting),
    outstandingBuy,
    pendingLines,
    complete: phase === "FINAL" && out.length > 0 && pendingLines === 0 && outstandingBuy <= 1e-4,
    noWaiting: waiting <= 1e-4,
  };
}

/* ── Quyết định suy ra từ sổ ───────────────────────────────────────────────── */

export const WAITING_BLOCK_MESSAGE =
  "Phiếu còn hàng đang về hoặc lô chờ QC — nhận đủ/QC xong, hoặc đóng/huỷ PO trước.";

/** Câu chặn Kiểm tồn lại khi còn hàng đang về / chờ QC (null = được). */
export function recheckBlockReason(led: PrLedger): string | null {
  return led.noWaiting
    ? null
    : "Phiếu còn hàng đang về hoặc lô chờ QC — nhận đủ/QC xong, hoặc đóng/huỷ PO trước khi kiểm tồn lại.";
}

export type FinishDecision =
  | { ok: true; dropsUnordered: number }
  | { ok: false; code: "OUTSTANDING_PURCHASE" | "UNORDERED_REASON_REQUIRED"; message: string };

/** Lý do tối thiểu khi kết thúc bỏ phần chưa đặt mua. */
export const DROP_REASON_MIN_LEN = 3;

/**
 * "Kết thúc" / "ghi nhận không trừ tồn": chỉ khi KHÔNG còn hàng đang về / chờ QC. Còn phần
 * chưa đặt mua (toOrder > 0) → kết thúc = bỏ phần đó, bắt buộc có lý do.
 */
export function decideFinish(led: PrLedger, reason: string | null | undefined): FinishDecision {
  if (!led.noWaiting) {
    return { ok: false, code: "OUTSTANDING_PURCHASE", message: WAITING_BLOCK_MESSAGE };
  }
  if (led.toOrder > 1e-4 && (reason ?? "").trim().length < DROP_REASON_MIN_LEN) {
    return {
      ok: false,
      code: "UNORDERED_REASON_REQUIRED",
      message: `Còn ${fmtQ(led.toOrder)} chưa đặt mua — kết thúc nghĩa là BỎ phần này. Nhập lý do (≥ ${DROP_REASON_MIN_LEN} ký tự) để xác nhận.`,
    };
  }
  return { ok: true, dropsUnordered: led.toOrder };
}

const fmtQ = (n: number) => Number(n.toFixed(4)).toLocaleString("vi-VN");

/** Tiến độ xuất kho cho giao diện (hình dạng cũ `issueProgress`), suy ra từ sổ. */
export function ledgerIssueProgress(led: PrLedger): {
  complete: boolean;
  pendingLines: number;
  outstandingBuy: boolean;
  outstandingQty: number;
  issuableRemaining: number;
  lines: { id: string; cap: number; issued: number; remaining: number }[];
} {
  return {
    complete: led.complete,
    pendingLines: led.pendingLines,
    outstandingBuy: led.outstandingBuy > 1e-4,
    outstandingQty: led.outstandingBuy,
    issuableRemaining: led.totalRemaining,
    lines: led.lines.map((l) => ({
      id: l.id,
      cap: l.cap,
      issued: l.issued,
      remaining: Math.max(0, r6(l.cap - l.issued)),
    })),
  };
}

/* ── Lập PO (from-pr + PO thủ công kèm prId) ─────────────────────────────── */

/** Σ toOrder theo vật tư. */
export function toOrderByItem(led: PrLedger): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of led.lines) {
    if (!l.itemId) continue;
    m.set(l.itemId, r6((m.get(l.itemId) ?? 0) + l.toOrder));
  }
  return m;
}

/**
 * PO thủ công kèm prId: vật tư phải thuộc phiếu; theo từng vật tư Σ SL đặt mới ≤ Σ toOrder (sổ dòng —
 * PO đang mở tính theo SL đặt, PO đã đóng/nhận đủ chỉ tính hàng đã nhận chưa bị QC loại);
 * mọi dòng = 0 → NOTHING_TO_BUY.
 */
export function checkNewPoAgainstLedger(
  led: PrLedger,
  labelOf: (itemId: string) => string,
  newLines: ReadonlyArray<{ itemId: string; orderedQty: number | string }>,
): { code: "ITEM_NOT_IN_PR" | "OVER_QTY" | "NOTHING_TO_BUY"; message: string } | null {
  const allowed = toOrderByItem(led);
  const total = newLines.reduce((a, l) => a + Math.max(0, num(l.orderedQty)), 0);
  if (total <= 0) {
    return { code: "NOTHING_TO_BUY", message: "PO phải có ít nhất 1 dòng với SL lớn hơn 0." };
  }
  const newByItem = new Map<string, number>();
  for (const l of newLines) {
    if (!allowed.has(l.itemId)) {
      return {
        code: "ITEM_NOT_IN_PR",
        message: "Có vật tư không thuộc phiếu đề xuất này — chỉ đặt được vật tư có trong phiếu.",
      };
    }
    newByItem.set(l.itemId, (newByItem.get(l.itemId) ?? 0) + Math.max(0, num(l.orderedQty)));
  }
  for (const [itemId, qty] of newByItem) {
    const cap = allowed.get(itemId) ?? 0;
    if (qty > cap + 1e-6) {
      const lines = led.lines.filter((l) => l.itemId === itemId);
      const buy = lines.reduce((a, l) => a + l.buy, 0);
      const eff = lines.reduce((a, l) => a + l.orderedEffective, 0);
      return {
        code: "OVER_QTY",
        message: `Vật tư ${labelOf(itemId)}: chỉ còn được đặt thêm ${fmtQ(cap)} (cần mua ${fmtQ(buy)}, đã đặt/đã về ${fmtQ(eff)}), đang đặt ${fmtQ(qty)}.`,
      };
    }
  }
  return null;
}

/* ── Kiểm tồn lại ──────────────────────────────────────────────────────────── */

export interface RecheckRow {
  id: string;
  itemId: string | null;
  req: number;
  issued: number;
  receivedOk: number;
  orderedEffective: number;
  /** Đã nhận đạt nhưng chưa xuất (hàng của phiếu đang nằm trong kho). */
  receivedUnissued: number;
  /** Phần còn phải đáp ứng = req − max(issued, receivedOk). */
  stillNeeded: number;
  /** Tồn khả dụng cho riêng dòng (sau cam kết phiếu khác, sau hàng PO của chính phiếu, lũy kế theo dòng). */
  available: number;
  /** "SL cần mua THÊM" mặc định = phần còn thiếu sau khi trừ tồn khả dụng. */
  defaultAdd: number;
  buyBefore: number;
}

/**
 * Dữ liệu hộp thoại Kiểm tồn lại (chỉ dòng có vật tư mới nhập được). `freeByItem` = tồn khả dụng
 * − cam kết của phiếu KHÁC. Hàng PO đã về mà chưa xuất của chính phiếu được trừ khỏi phần "khả dụng
 * mới" (nó đã nằm trong trần của phiếu).
 */
export function planRecheckRows(
  led: PrLedger,
  freeByItem: ReadonlyMap<string, number>,
): RecheckRow[] {
  const ownUnissued = new Map<string, number>();
  for (const l of led.lines) {
    if (!l.itemId) continue;
    ownUnissued.set(l.itemId, (ownUnissued.get(l.itemId) ?? 0) + Math.max(0, l.receivedOk - l.issued));
  }
  const left = new Map<string, number>();
  const rows: RecheckRow[] = [];
  for (const l of led.lines) {
    const receivedUnissued = Math.max(0, l.receivedOk - l.issued);
    const stillNeeded = Math.max(0, l.req - Math.max(l.issued, l.receivedOk));
    let available = 0;
    if (l.itemId) {
      const rem = left.has(l.itemId)
        ? left.get(l.itemId)!
        : Math.max(0, (freeByItem.get(l.itemId) ?? 0) - (ownUnissued.get(l.itemId) ?? 0));
      available = rem;
      left.set(l.itemId, Math.max(0, rem - stillNeeded));
    }
    rows.push({
      id: l.id,
      itemId: l.itemId,
      req: l.req,
      issued: l.issued,
      receivedOk: l.receivedOk,
      orderedEffective: l.orderedEffective,
      receivedUnissued: r6(receivedUnissued),
      stillNeeded: r6(stillNeeded),
      available: r6(available),
      defaultAdd: l.itemId ? r6(Math.max(0, stillNeeded - available)) : 0,
      buyBefore: l.buy,
    });
  }
  return rows;
}

export type RecheckPlan =
  | {
      ok: true;
      /** lineId → approved_qty mới (cơ sở toàn phiếu) — chỉ dòng có vật tư. */
      newBuy: Record<string, number>;
      /** lineId → SL cần mua thêm đã chốt. */
      adds: Record<string, number>;
      addTotal: number;
      /** Σ buy mới > Σ buy cũ (mua vượt mức đã duyệt trước đó). */
      buyIncreased: boolean;
    }
  | { ok: false; code: "VALIDATION" | "STOCK_SHORT"; message: string };

/**
 * Chốt Kiểm tồn lại. `addQtys[lineId]` = SL cần mua THÊM (≥ 0, ≤ phần còn phải đáp ứng);
 * thiếu → mặc định. Lưu buy_new = orderedEffective + add (kẹp ≤ req − đã xuất từ tồn).
 * Phần xuất từ tồn mới (stillNeeded − add) theo từng vật tư ≤ tồn khả dụng.
 */
export function planRecheck(
  led: PrLedger,
  rows: ReadonlyArray<RecheckRow>,
  addQtys: Readonly<Record<string, number>> | undefined,
  labelOf: (lineId: string) => string = () => "Dòng",
): RecheckPlan {
  const ids = new Set(rows.map((r) => r.id));
  for (const k of Object.keys(addQtys ?? {})) {
    if (!ids.has(k)) {
      return { ok: false, code: "VALIDATION", message: "Có dòng không thuộc phiếu này — tải lại trang rồi thử lại." };
    }
  }
  const newBuy: Record<string, number> = {};
  const adds: Record<string, number> = {};
  const fromStockByItem = new Map<string, { need: number; avail: number; label: string }>();
  let addTotal = 0;
  let buyBefore = 0;
  let buyAfter = 0;
  for (const row of rows) {
    if (!row.itemId) continue;
    const l = led.byId.get(row.id)!;
    const o = addQtys?.[row.id];
    const add = o === undefined ? row.defaultAdd : o;
    if (!Number.isFinite(add) || add < 0 || add > row.stillNeeded + 1e-9) {
      return {
        ok: false,
        code: "VALIDATION",
        message: `${labelOf(row.id)}: SL cần mua thêm phải từ 0 đến ${fmtQ(row.stillNeeded)} (phần còn phải đáp ứng).`,
      };
    }
    if (add > 0 && add < 0.000001) {
      return {
        ok: false,
        code: "VALIDATION",
        message: `${labelOf(row.id)}: SL cần mua thêm tối thiểu 0,000001 (hoặc nhập 0).`,
      };
    }
    const issuedFromStock = Math.max(0, l.issued - Math.min(l.issued, l.receivedOk));
    const nb = r6(Math.max(0, Math.min(l.orderedEffective + add, l.req - issuedFromStock, l.req)));
    newBuy[row.id] = nb;
    adds[row.id] = r6(add);
    addTotal += add;
    buyBefore += l.buy;
    buyAfter += nb;
    const cur = fromStockByItem.get(row.itemId) ?? { need: 0, avail: row.available, label: labelOf(row.id) };
    cur.need += Math.max(0, row.stillNeeded - add);
    fromStockByItem.set(row.itemId, cur);
  }
  for (const c of fromStockByItem.values()) {
    if (c.need > c.avail + 1e-6) {
      return {
        ok: false,
        code: "STOCK_SHORT",
        message: `${c.label}: chỉ còn ${fmtQ(c.avail)} khả dụng, đang định xuất từ kho ${fmtQ(c.need)} — tăng SL cần mua thêm.`,
      };
    }
  }
  return { ok: true, newBuy, adds, addTotal: r6(addTotal), buyIncreased: buyAfter > buyBefore + 1e-6 };
}
