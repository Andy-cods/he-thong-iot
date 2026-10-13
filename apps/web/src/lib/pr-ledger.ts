/**
 * SỔ của phiếu Đề xuất vật tư (PR) — MỘT mô hình duy nhất cho tồn / mua / xuất.
 *
 * Lần 8 (B1): trần / còn xuất / giữ chỗ / còn phải đặt tính theo VẬT TƯ trong phiếu (cộng các dòng cùng
 * vật tư); phân bổ xuống dòng CHỈ để hiển thị. Công thức dưới đây áp cho tổng theo vật tư.
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
 *  - có PO: buy = phần "đặt hiệu lực" của dòng (min(req, orderedEffective)) — không phụ thuộc thứ tự
 *    xuất/nhận (N1); migration 0081 đã chốt approved_qty cho phiếu đang mở, nhánh này chỉ là dự phòng;
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

/** N4 — SL làm tròn 4 số lẻ (khớp PO / nhận / xuất kho numeric(…,4)). */
export function r4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Ngưỡng so sánh SL (SL 4 số lẻ → nửa bước 0,0001: vượt 0,0001 vẫn bị bắt). */
export const QTY_EPS = 5e-5;

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

/** Σ SL cần mua đã chốt của phiếu (NULL → req). */
export function buyTotalOf(
  lines: ReadonlyArray<{ qty: number | string; approvedQty?: number | string | null }>,
): number {
  return r4(lines.reduce((a, l) => a + decidedBuy(l.qty, l.approvedQty), 0));
}

/** m5 — người duyệt cuối đã thấy Σ cần mua khác hiện tại (Kho vừa kiểm tồn lại)? Bỏ trống = không kiểm. */
export function isBuyTotalStale(
  lines: ReadonlyArray<{ qty: number | string; approvedQty?: number | string | null }>,
  expected: number | null | undefined,
): boolean {
  if (expected === null || expected === undefined) return false;
  return Math.abs(buyTotalOf(lines) - expected) > 5e-5;
}

/**
 * M2 — hàm thuần TƯƠNG ĐƯƠNG migration 0081 (dòng phiếu cũ KHÔNG PO): phân tồn khả dụng (đã trừ giữ chỗ
 * của các phiếu có approved) cho các dòng theo thứ tự phiếu tạo trước, theo vật tư.
 * give = min(qty − đã xuất, tồn còn lại); approved = qty − đã xuất − give.
 */
export function legacyStockAllocation(
  lines: ReadonlyArray<{ id: string; itemId: string; qty: number; issued: number; prCreatedAt: string | number; lineNo: number }>,
  poolByItem: ReadonlyMap<string, number>,
): Record<string, { give: number; approved: number }> {
  const sorted = [...lines].sort((a, b) =>
    a.prCreatedAt === b.prCreatedAt ? a.lineNo - b.lineNo : a.prCreatedAt < b.prCreatedAt ? -1 : 1,
  );
  const left = new Map(poolByItem);
  const out: Record<string, { give: number; approved: number }> = {};
  for (const l of sorted) {
    const need = Math.max(0, l.qty - l.issued);
    const pool = Math.max(0, left.get(l.itemId) ?? 0);
    const give = Math.min(need, pool);
    left.set(l.itemId, pool - give);
    out[l.id] = { give: r4(give), approved: r4(Math.max(0, need - give)) };
  }
  return out;
}

/**
 * N1 — hàm thuần TƯƠNG ĐƯƠNG migration 0081: chốt approved_qty cho các dòng phiếu cũ (NULL) của MỘT phiếu.
 *  - dòng nhập tay → qty; phiếu không có PO → 0 (xuất từ tồn);
 *  - có PO (M1) → Σ SL ĐẶT của mọi PO không huỷ của vật tư rót lần lượt theo dòng, mỗi dòng ≤ qty − đã
 *    xuất TRƯỚC PO đầu tiên. (`oeByItem` = Σ SL đặt.) Không PO → xem `legacyStockAllocation` (M2).
 */
export function legacyBackfillApproved(
  lines: ReadonlyArray<{ id: string; itemId: string | null; qty: number; issuedBeforeFirstPo?: number }>,
  hasPo: boolean,
  oeByItem: ReadonlyMap<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  const used = new Map<string, number>();
  for (const l of lines) {
    if (!l.itemId) {
      out[l.id] = r4(l.qty);
      continue;
    }
    if (!hasPo) {
      out[l.id] = 0;
      continue;
    }
    const room = Math.max(0, l.qty - (l.issuedBeforeFirstPo ?? 0));
    const before = used.get(l.itemId) ?? 0;
    out[l.id] = r4(Math.min(room, Math.max(0, (oeByItem.get(l.itemId) ?? 0) - before)));
    used.set(l.itemId, before + room);
  }
  return out;
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
  /** Σ đặt của MỌI PO không huỷ (kể cả đã đóng / QC hỏng) — SL cần mua của dòng phiếu cũ (M1). */
  orderedAll?: number;
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
    const a = byItem.get(r.itemId) ?? { receivedOk: 0, pendingQc: 0, inbound: 0, orderedOpen: 0, orderedAll: 0 };
    a.orderedAll = (a.orderedAll ?? 0) + ordered;
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

/* ── Sổ: tính theo VẬT TƯ trong phiếu, phân bổ xuống dòng chỉ để hiển thị ─── */

export interface LedgerLineInput {
  id: string;
  itemId: string | null;
  qty: number | string;
  approvedQty?: number | string | null;
  issuedQty?: number | string | null;
}

/** Phần PO đã phân bổ cho một dòng (hiển thị). */
export interface LinePoShare {
  receivedOk: number;
  pendingQc: number;
  inbound: number;
}

/** Sổ của MỘT vật tư trong phiếu — nguồn của trần xuất / giữ chỗ / còn phải đặt. */
export interface ItemLedger {
  itemId: string;
  req: number;
  buy: number;
  fromStock: number;
  receivedOk: number;
  pendingQc: number;
  inbound: number;
  orderedEffective: number;
  issued: number;
  /** cap = min(Σ req, Σ fromStock + receivedOk). */
  cap: number;
  /** max(0, cap − Σ issued) — bất kể giai đoạn (dùng cho trần khi xuất). */
  capLeft: number;
  /** Còn xuất được = giữ chỗ (0 ở giai đoạn NONE). */
  remaining: number;
  /** Giữ chỗ tồn của phiếu khác (= remaining, trừ phần của dòng phiếu cũ NULL). */
  held: number;
  toOrder: number;
  waiting: number;
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
  /** Trần hiển thị của dòng = đã xuất + phần còn xuất được của vật tư phân cho dòng. */
  cap: number;
  remaining: number;
  held: number;
  toOrder: number;
  waiting: number;
}

/** Rót `total` lần lượt vào các ô theo hạn mức `limits` (2 lượt: `first`, rồi `second`); dư dồn ô cuối. */
function pour(total: number, first: number[], second?: number[]): number[] {
  const n = first.length;
  const out = new Array<number>(n).fill(0);
  let left = Math.max(0, total);
  for (let i = 0; i < n && left > EPS; i++) {
    const t = Math.min(left, Math.max(0, first[i]!));
    out[i]! += t;
    left -= t;
  }
  if (second) {
    for (let i = 0; i < n && left > EPS; i++) {
      const t = Math.min(left, Math.max(0, second[i]! - out[i]!));
      out[i]! += t;
      left -= t;
    }
  }
  if (left > EPS && n > 0) out[n - 1]! += left;
  return out;
}

/**
 * HÀM GỐC — sổ của một nhóm dòng CÙNG vật tư (hoặc 1 dòng nhập tay chưa có vật tư).
 * Trần / còn xuất / giữ chỗ / còn phải đặt tính theo VẬT TƯ; phân bổ xuống dòng chỉ để hiển thị:
 *  - hàng đạt QC phủ trước phần mỗi dòng đã xuất vượt fromStock, rồi rót theo SL cần mua;
 *  - còn xuất được rót theo trần tự nhiên của dòng, rồi theo (đề xuất − đã xuất);
 *  - còn phải đặt rót theo (cần mua − đã đặt/đã về) của dòng.
 */
export function buildItemLedger(
  ls: ReadonlyArray<LedgerLineInput>,
  agg: (Pick<ItemPoAgg, "receivedOk" | "pendingQc" | "inbound"> & { orderedAll?: number }) | undefined,
  phase: PrIssuePhase,
  hasPo: boolean,
): { item: ItemLedger | null; lines: LineLedger[] } {
  const itemId = ls[0]?.itemId ?? null;
  if (!itemId) {
    // Dòng nhập tay: không xuất kho được, chỉ theo dõi mua (PO luôn gắn vật tư → không có PO ở đây).
    const lines = ls.map((l) => {
      const req = Math.max(0, num(l.qty));
      const legacy = isLegacyBuy(l.approvedQty);
      const buy = legacy ? req : decidedBuy(req, l.approvedQty) || req;
      return {
        id: l.id,
        itemId: null,
        hasItem: false,
        legacy,
        req: r4(req),
        buy: r4(buy),
        fromStock: 0,
        receivedOk: 0,
        pendingQc: 0,
        inbound: 0,
        orderedEffective: 0,
        issued: r4(Math.max(0, num(l.issuedQty))),
        cap: 0,
        remaining: 0,
        held: 0,
        toOrder: r4(buy),
        waiting: 0,
      } satisfies LineLedger;
    });
    return { item: null, lines };
  }
  const rOk = Math.max(0, agg?.receivedOk ?? 0);
  const pq = Math.max(0, agg?.pendingQc ?? 0);
  const inb = Math.max(0, agg?.inbound ?? 0);
  const req = ls.map((l) => Math.max(0, num(l.qty)));
  const iss = ls.map((l) => Math.max(0, num(l.issuedQty)));
  const legacy = ls.map((l) => isLegacyBuy(l.approvedQty));
  const decided = ls.map((l, i) => (legacy[i] ? req[i]! : decidedBuy(req[i]!, l.approvedQty)));
  // Sức chứa PO của dòng (phiếu cũ = req) và phần "đã xuất vượt fromStock" cần hàng PO phủ.
  const room = ls.map((_, i) => (legacy[i] ? req[i]! : decided[i]!));
  const fsPrelim = ls.map((_, i) => (legacy[i] ? 0 : req[i]! - decided[i]!));
  // Phiếu cũ: không suy "đã xuất từ tồn" theo thời điểm → không phủ phần đã xuất bằng hàng PO.
  const needCover = ls.map((_, i) =>
    legacy[i] ? 0 : Math.min(room[i]!, Math.max(0, iss[i]! - fsPrelim[i]!)),
  );
  const shOk = pour(rOk, needCover, room);
  const roomAfterOk = room.map((v, i) => Math.max(0, v - shOk[i]!));
  const shPq = pour(pq, roomAfterOk);
  const shInb = pour(inb, roomAfterOk.map((v, i) => Math.max(0, v - shPq[i]!)));
  // Phiếu cũ có PO (M1, giống migration 0081): SL cần mua = Σ SL ĐẶT của mọi PO không huỷ, rót theo dòng.
  const legacyBuy = pour(
    agg?.orderedAll ?? rOk + pq + inb,
    ls.map((_, i) => (legacy[i] ? req[i]! : 0)),
  );
  // SL cần mua / phần từ tồn của từng dòng.
  const buy: number[] = [];
  const fs: number[] = [];
  ls.forEach((_, i) => {
    if (legacy[i] && !hasPo) {
      buy.push(Math.max(0, req[i]! - iss[i]!));
      fs.push(phase === "WAREHOUSE" ? 0 : req[i]!);
    } else if (legacy[i]) {
      // N1 — phiếu cũ có PO: SL cần mua = phần "đặt hiệu lực" của dòng (không đổi khi hàng về / khi xuất),
      // phần còn lại là từ tồn. Migration 0081 đã chốt approved_qty cho phiếu đang mở; nhánh này chỉ là
      // dự phòng đọc cho dữ liệu sót.
      const b = Math.min(req[i]!, legacyBuy[i]!);
      buy.push(b);
      fs.push(req[i]! - b);
    } else {
      buy.push(decided[i]!);
      fs.push(req[i]! - decided[i]!);
    }
  });
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const reqI = sum(req);
  const buyI = sum(buy);
  const fsI = sum(fs);
  const issI = sum(iss);
  const oeI = rOk + pq + inb;
  const capI = Math.min(reqI, fsI + rOk);
  const capLeft = Math.max(0, capI - issI);
  const remI = phase === "NONE" ? 0 : capLeft;
  // Phòng hờ dữ liệu cũ: khi Σ đã xuất ≤ trần, vế sau luôn ≥ vế đầu (không có tác dụng).
  const toOrderI = Math.max(0, Math.min(buyI - oeI, reqI - Math.max(issI, rOk) - pq - inb));
  // Phân bổ hiển thị.
  const natural = ls.map((_, i) => Math.max(0, Math.min(req[i]!, fs[i]! + shOk[i]!) - iss[i]!));
  const lineRoom = ls.map((_, i) => Math.max(0, req[i]! - iss[i]!));
  const rem = pour(capLeft, natural, lineRoom);
  const toNatural = ls.map((_, i) => Math.max(0, buy[i]! - shOk[i]! - shPq[i]! - shInb[i]!));
  const to = pour(toOrderI, toNatural);
  const lines: LineLedger[] = ls.map((l, i) => {
    const remaining = phase === "NONE" ? 0 : rem[i]!;
    return {
      id: l.id,
      itemId,
      hasItem: true,
      legacy: legacy[i]!,
      req: r4(req[i]!),
      buy: r4(buy[i]!),
      fromStock: r4(fs[i]!),
      receivedOk: r4(shOk[i]!),
      pendingQc: r4(shPq[i]!),
      inbound: r4(shInb[i]!),
      orderedEffective: r4(shOk[i]! + shPq[i]! + shInb[i]!),
      issued: r4(iss[i]!),
      cap: r4(iss[i]! + rem[i]!),
      remaining: r4(remaining),
      held: legacy[i] ? 0 : r4(remaining),
      toOrder: r4(to[i]!),
      waiting: r4(shPq[i]! + shInb[i]!),
    };
  });
  const item: ItemLedger = {
    itemId,
    req: r4(reqI),
    buy: r4(buyI),
    fromStock: r4(fsI),
    receivedOk: r4(rOk),
    pendingQc: r4(pq),
    inbound: r4(inb),
    orderedEffective: r4(oeI),
    issued: r4(issI),
    cap: r4(capI),
    capLeft: r4(capLeft),
    remaining: r4(remI),
    held: r4(lines.reduce((a, l) => a + l.held, 0)),
    toOrder: r4(toOrderI),
    waiting: r4(pq + inb),
  };
  return { item, lines };
}

/** Sổ của MỘT dòng (= nhóm một dòng) — giữ cho tương thích/test. */
export function buildLineLedger(
  line: LedgerLineInput,
  po: LinePoShare,
  phase: PrIssuePhase,
  hasPo: boolean,
): LineLedger {
  return buildItemLedger([line], po, phase, hasPo).lines[0]!;
}

/** Phân bổ hiển thị hàng PO theo dòng (cùng quy tắc với `buildItemLedger`, giai đoạn FINAL). */
export function allocatePoToLines(
  lines: ReadonlyArray<LedgerLineInput>,
  po: PrPoSummary,
): Map<string, LinePoShare> {
  const led = buildPrLedger(lines, po, "FINAL");
  return new Map(
    led.lines.map((l) => [l.id, { receivedOk: l.receivedOk, pendingQc: l.pendingQc, inbound: l.inbound }]),
  );
}

export interface PrLedger {
  phase: PrIssuePhase;
  hasPo: boolean;
  lines: LineLedger[];
  byId: Map<string, LineLedger>;
  /** Sổ theo vật tư — NGUỒN của trần xuất / giữ chỗ / còn phải đặt. */
  items: Map<string, ItemLedger>;
  /** Σ remaining theo vật tư. */
  remainingByItem: Map<string, number>;
  /** Σ held theo vật tư (phần giữ chỗ tồn của phiếu khác). */
  heldByItem: Map<string, number>;
  totalRemaining: number;
  toOrder: number;
  waiting: number;
  /** Σ toOrder (trừ giai đoạn Kho — phần mua chưa duyệt) + Σ waiting. */
  outstandingBuy: number;
  /** Số dòng có vật tư còn phần xuất được phân cho dòng. */
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
  const groups = new Map<string, LedgerLineInput[]>();
  const free: LedgerLineInput[] = [];
  for (const l of lines) {
    if (!l.itemId) free.push(l);
    else {
      const g = groups.get(l.itemId) ?? [];
      g.push(l);
      groups.set(l.itemId, g);
    }
  }
  const byId = new Map<string, LineLedger>();
  const items = new Map<string, ItemLedger>();
  for (const [itemId, ls] of groups) {
    const r = buildItemLedger(ls, po.byItem.get(itemId), phase, po.hasPo);
    items.set(itemId, r.item!);
    for (const l of r.lines) byId.set(l.id, l);
  }
  for (const l of free) for (const x of buildItemLedger([l], undefined, phase, po.hasPo).lines) byId.set(x.id, x);
  const out = lines.map((l) => byId.get(l.id)!);
  const remainingByItem = new Map<string, number>();
  const heldByItem = new Map<string, number>();
  let totalRemaining = 0;
  let toOrder = 0;
  let waiting = 0;
  let itemsOpen = 0;
  for (const it of items.values()) {
    if (it.remaining > 0) remainingByItem.set(it.itemId, it.remaining);
    if (it.held > 0) heldByItem.set(it.itemId, it.held);
    totalRemaining += it.remaining;
    toOrder += it.toOrder;
    waiting += it.waiting;
    if (it.capLeft > 5e-5) itemsOpen += 1;
  }
  for (const l of out) if (!l.hasItem) toOrder += l.toOrder;
  const pendingLines = out.filter((l) => l.hasItem && l.cap - l.issued > 5e-5).length;
  const outstandingBuy = r4((phase === "WAREHOUSE" ? 0 : toOrder) + waiting);
  return {
    phase,
    hasPo: po.hasPo,
    lines: out,
    byId,
    items,
    remainingByItem,
    heldByItem,
    totalRemaining: r4(totalRemaining),
    toOrder: r4(toOrder),
    waiting: r4(waiting),
    outstandingBuy,
    pendingLines,
    complete: phase === "FINAL" && out.length > 0 && itemsOpen === 0 && outstandingBuy <= 5e-5,
    noWaiting: waiting <= 5e-5,
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
  if (led.toOrder > 5e-5 && (reason ?? "").trim().length < DROP_REASON_MIN_LEN) {
    return {
      ok: false,
      code: "UNORDERED_REASON_REQUIRED",
      message: `Còn ${fmtQ(led.toOrder)} chưa đặt mua — kết thúc nghĩa là BỎ phần này. Nhập lý do (≥ ${DROP_REASON_MIN_LEN} ký tự) để xác nhận.`,
    };
  }
  return { ok: true, dropsUnordered: led.toOrder };
}

const fmtQ = (n: number) => Number(n.toFixed(4)).toLocaleString("vi-VN", { maximumFractionDigits: 4 });

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
    outstandingBuy: led.outstandingBuy > 5e-5,
    outstandingQty: led.outstandingBuy,
    issuableRemaining: led.totalRemaining,
    lines: led.lines.map((l) => ({
      id: l.id,
      cap: l.cap,
      issued: l.issued,
      remaining: Math.max(0, r4(l.cap - l.issued)),
    })),
  };
}

/* ── Lập PO (from-pr + PO thủ công kèm prId) ─────────────────────────────── */

/** Σ toOrder theo vật tư. */
export function toOrderByItem(led: PrLedger): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of led.items.values()) m.set(it.itemId, it.toOrder);
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
    if (qty > cap + QTY_EPS) {
      const it = led.items.get(itemId)!;
      const buy = it.buy;
      const eff = it.orderedEffective;
      return {
        code: "OVER_QTY",
        message: `Vật tư ${labelOf(itemId)}: chỉ còn được đặt thêm ${fmtQ(cap)} (cần mua ${fmtQ(buy)}, đã đặt/đã về ${fmtQ(eff)}), đang đặt ${fmtQ(qty)}.`,
      };
    }
  }
  return null;
}

/* ── Kiểm tồn lại (theo vật tư; dòng chỉ để nhập/hiển thị) ─────────────────── */

export interface RecheckRow {
  id: string;
  itemId: string | null;
  req: number;
  issued: number;
  receivedOk: number;
  orderedEffective: number;
  /** Đã nhận đạt nhưng chưa xuất (hàng của phiếu đang nằm trong kho) — phần phân cho dòng. */
  receivedUnissued: number;
  /** Phần còn phải đáp ứng phân cho dòng (Σ theo vật tư = Σ đề xuất − max(Σ đã xuất, đã về)). */
  stillNeeded: number;
  /** Tồn khả dụng còn lại cho dòng (sau cam kết phiếu khác, hàng PO của phiếu chưa xuất, các dòng trên). */
  available: number;
  /** "SL cần mua THÊM" mặc định phân cho dòng. */
  defaultAdd: number;
  buyBefore: number;
}

interface RecheckItem {
  stillNeeded: number;
  receivedUnissued: number;
  available: number;
  defaultAdd: number;
}

function recheckItemOf(it: ItemLedger, freeQty: number): RecheckItem {
  const receivedUnissued = Math.max(0, it.receivedOk - it.issued);
  const stillNeeded = Math.max(0, it.req - Math.max(it.issued, it.receivedOk));
  const available = Math.max(0, freeQty - receivedUnissued);
  return { stillNeeded, receivedUnissued, available, defaultAdd: Math.max(0, stillNeeded - available) };
}

/**
 * Dữ liệu hộp thoại Kiểm tồn lại. `freeByItem` = tồn khả dụng − cam kết của phiếu KHÁC. Tính theo vật
 * tư; phân xuống dòng để hiển thị/nhập.
 */
export function planRecheckRows(
  led: PrLedger,
  freeByItem: ReadonlyMap<string, number>,
): RecheckRow[] {
  const byItem = new Map<string, LineLedger[]>();
  for (const l of led.lines) {
    if (!l.itemId) continue;
    const g = byItem.get(l.itemId) ?? [];
    g.push(l);
    byItem.set(l.itemId, g);
  }
  const rowsById = new Map<string, RecheckRow>();
  for (const [itemId, ls] of byItem) {
    const it = led.items.get(itemId)!;
    const rc = recheckItemOf(it, freeByItem.get(itemId) ?? 0);
    const need = pour(
      rc.stillNeeded,
      ls.map((l) => Math.max(0, l.req - Math.max(l.issued, l.receivedOk))),
      ls.map((l) => Math.max(0, l.req - l.issued)),
    );
    const add = pour(rc.defaultAdd, need);
    const ru = pour(rc.receivedUnissued, ls.map((l) => Math.max(0, l.receivedOk - l.issued)));
    let left = rc.available;
    ls.forEach((l, i) => {
      rowsById.set(l.id, {
        id: l.id,
        itemId,
        req: l.req,
        issued: l.issued,
        receivedOk: l.receivedOk,
        orderedEffective: l.orderedEffective,
        receivedUnissued: r4(ru[i]!),
        stillNeeded: r4(need[i]!),
        available: r4(left),
        defaultAdd: r4(add[i]!),
        buyBefore: l.buy,
      });
      left = Math.max(0, left - Math.max(0, need[i]! - add[i]!));
    });
  }
  return led.lines.map(
    (l) =>
      rowsById.get(l.id) ?? {
        id: l.id,
        itemId: null,
        req: l.req,
        issued: l.issued,
        receivedOk: 0,
        orderedEffective: 0,
        receivedUnissued: 0,
        stillNeeded: 0,
        available: 0,
        defaultAdd: 0,
        buyBefore: l.buy,
      },
  );
}

export type RecheckPlan =
  | {
      ok: true;
      /** lineId → approved_qty mới (cơ sở toàn phiếu) — chỉ dòng có vật tư. */
      newBuy: Record<string, number>;
      /** lineId → SL cần mua thêm đã chốt. */
      adds: Record<string, number>;
      addTotal: number;
      /** Có vật tư mà Σ buy mới > Σ buy cũ (mua vượt mức đã duyệt) → phải duyệt lại. */
      buyIncreased: boolean;
    }
  | { ok: false; code: "VALIDATION" | "STOCK_SHORT"; message: string };

/**
 * Chốt Kiểm tồn lại, THEO VẬT TƯ: Σ add ≤ phần còn phải đáp ứng; phần xuất từ tồn mới
 * (còn phải đáp ứng − add) ≤ tồn khả dụng; buy_new = orderedEffective + add (kẹp ≤ Σ đề xuất − đã xuất
 * từ tồn). buy_new chia xuống dòng (mỗi dòng ≤ đề xuất) để lưu approved_qty.
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
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const byItem = new Map<string, LineLedger[]>();
  for (const l of led.lines) {
    if (!l.itemId) continue;
    const g = byItem.get(l.itemId) ?? [];
    g.push(l);
    byItem.set(l.itemId, g);
  }
  const newBuy: Record<string, number> = {};
  const adds: Record<string, number> = {};
  let addTotal = 0;
  let buyIncreased = false;
  for (const [itemId, ls] of byItem) {
    const it = led.items.get(itemId)!;
    const lineAdds: number[] = [];
    for (const l of ls) {
      const row = rowById.get(l.id)!;
      const o = addQtys?.[l.id];
      const add = o === undefined ? row.defaultAdd : o;
      if (!Number.isFinite(add) || add < 0 || add > l.req + 1e-9) {
        return {
          ok: false,
          code: "VALIDATION",
          message: `${labelOf(l.id)}: SL cần mua thêm phải từ 0 đến ${fmtQ(l.req)}.`,
        };
      }
      if (add > 0 && add < 0.0001) {
        return { ok: false, code: "VALIDATION", message: `${labelOf(l.id)}: SL cần mua thêm tối thiểu 0,0001 (hoặc nhập 0).` };
      }
      if (Math.abs(r4(add) - add) > 1e-9) {
        return { ok: false, code: "VALIDATION", message: `${labelOf(l.id)}: SL cần mua thêm tối đa 4 chữ số thập phân.` };
      }
      lineAdds.push(add);
      adds[l.id] = r4(add);
    }
    const addI = lineAdds.reduce((a, b) => a + b, 0);
    const first = rowById.get(ls[0]!.id)!;
    const stillNeeded = ls.reduce((a, l) => a + rowById.get(l.id)!.stillNeeded, 0);
    const available = first.available;
    const label = labelOf(ls[0]!.id);
    if (addI > stillNeeded + 1e-9) {
      return {
        ok: false,
        code: "VALIDATION",
        message: `${label}: tổng SL cần mua thêm của vật tư phải từ 0 đến ${fmtQ(stillNeeded)} (phần còn phải đáp ứng).`,
      };
    }
    if (stillNeeded - addI > available + QTY_EPS) {
      return {
        ok: false,
        code: "STOCK_SHORT",
        message: `${label}: chỉ còn ${fmtQ(available)} khả dụng, đang định xuất từ kho ${fmtQ(stillNeeded - addI)} — tăng SL cần mua thêm.`,
      };
    }
    const ifsI = Math.max(0, it.issued - it.receivedOk);
    const buyNewI = Math.max(0, Math.min(it.orderedEffective + addI, it.req - ifsI, it.req));
    // Chia xuống dòng: mục tiêu = hàng đã về của dòng + mua thêm của dòng; chỉnh cho Σ = buyNewI.
    const target = ls.map((l, i) => Math.min(l.req, l.receivedOk + lineAdds[i]!));
    let diff = buyNewI - target.reduce((a, b) => a + b, 0);
    if (diff > 0) {
      for (let i = 0; i < ls.length && diff > EPS; i++) {
        const t = Math.min(diff, ls[i]!.req - target[i]!);
        target[i]! += t;
        diff -= t;
      }
    } else if (diff < 0) {
      for (let i = ls.length - 1; i >= 0 && diff < -EPS; i--) {
        const t = Math.min(-diff, target[i]!);
        target[i]! -= t;
        diff += t;
      }
    }
    ls.forEach((l, i) => (newBuy[l.id] = r4(target[i]!)));
    addTotal += addI;
    if (buyNewI > it.buy + QTY_EPS) buyIncreased = true;
  }
  return { ok: true, newBuy, adds, addTotal: r4(addTotal), buyIncreased };
}
