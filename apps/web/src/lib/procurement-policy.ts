/**
 * V4.1 Đợt 2 — Chính sách THUẦN của luồng Thu mua (PR → PO → nhận hàng → HĐ mua).
 *
 * Không import DB/server → dùng chung cho route API + giao diện + vitest.
 */

import { decidedBuy, type PrIssuePhase } from "./pr-ledger";

type RoleLike = string;

/* ── D8: người tạo không tự duyệt ─────────────────────────────────────────── */

/**
 * V4.1 D8 — true nếu PHẢI CHẶN: người duyệt chính là người lập phiếu và không
 * phải admin (Giám đốc được tự duyệt để luồng không tắc).
 * creatorId null (phiếu cũ/không rõ người lập) → không chặn.
 */
export function isSelfApprovalBlocked(input: {
  creatorId: string | null | undefined;
  actorId: string;
  actorRoles: readonly RoleLike[];
}): boolean {
  if (input.actorRoles.includes("admin")) return false;
  if (!input.creatorId) return false;
  return input.creatorId === input.actorId;
}

/** V4.1 D8 — chỉ Thu mua + Giám đốc được đổi đơn giá / VAT dòng PO. */
export function canEditPoPrices(roles: readonly RoleLike[]): boolean {
  return roles.includes("admin") || roles.includes("purchaser");
}

/* ── V4.4 (Việc 4): huỷ phiếu đề xuất vật tư (PR) ──────────────────────── */

export type PrStatusLike = "DRAFT" | "SUBMITTED" | "APPROVED" | "CONVERTED" | "REJECTED" | "CANCELLED";

/**
 * V4.4 — true nếu được phép huỷ PR: admin (mọi trạng thái còn huỷ được —
 * DRAFT/SUBMITTED/APPROVED) hoặc chính người tạo NHƯNG chỉ khi còn
 * DRAFT/SUBMITTED (chưa duyệt xong — huỷ APPROVED cần admin vì đã tốn công
 * duyệt 3 bước, tránh người tạo tự ý huỷ sau khi được duyệt).
 * CONVERTED/REJECTED/CANCELLED không huỷ được nữa (CONVERTED đã có PO — dùng
 * huỷ/đóng PO; REJECTED/CANCELLED đã là trạng thái kết thúc).
 */
export function canCancelPR(input: {
  status: PrStatusLike;
  creatorId: string | null | undefined;
  actorId: string;
  actorRoles: readonly RoleLike[];
}): boolean {
  const cancellable = input.status === "DRAFT" || input.status === "SUBMITTED" || input.status === "APPROVED";
  if (!cancellable) return false;
  if (input.actorRoles.includes("admin")) return true;
  if (input.status === "APPROVED") return false;
  return !!input.creatorId && input.creatorId === input.actorId;
}

/** A17 — thông báo đúng lý do khi PR không tạo PO được vì trạng thái. THUẦN. */
export function convertBlockedMessage(status: string): string {
  switch (status) {
    case "CONVERTED":
      return "Phiếu đã được lập PO — không tạo thêm. Xem các PO ở mục IV của phiếu.";
    case "REJECTED":
      return "Phiếu đã bị từ chối — không tạo PO được.";
    case "CANCELLED":
      return "Phiếu đã huỷ — không tạo PO được.";
    default:
      return "PR chưa được duyệt — không thể convert PO.";
  }
}

/** A19 — chỉ Thu mua/admin được tạo PO từ PR (planner có create:po nhưng không phải việc của họ). */
export function canCreatePoFromPr(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("purchaser");
}

/** A3 — thông báo chặn huỷ/xoá PR đã có phiếu xuất kho (tồn đã trừ). THUẦN. */
export function prHasGoodsIssueMessage(
  issueNos: readonly string[],
  action: "cancel" | "delete",
): string {
  const list = issueNos.slice(0, 5).join(", ") + (issueNos.length > 5 ? ", …" : "");
  return action === "cancel"
    ? `Phiếu đã có phiếu xuất kho (${list}) — tồn đã bị trừ nên không huỷ được. Nếu xuất nhầm, tạo phiếu nhập trả kho rồi nhờ Giám đốc xử lý.`
    : `Phiếu đã có phiếu xuất kho (${list}) — không xoá được vì sẽ mất dấu vết xuất kho.`;
}

/**
 * A8 — ai được từ chối phiếu ở bước nào: SUBMITTED (chờ Kho) → admin/warehouse;
 * DEPT_APPROVED (chờ duyệt cuối) → admin/purchaser. Bước khác → không ai.
 */
export function canRejectAtStep(
  approvalStep: string | null | undefined,
  roles: readonly string[],
): boolean {
  if (approvalStep !== "SUBMITTED" && approvalStep !== "DEPT_APPROVED") return false;
  if (roles.includes("admin")) return true;
  return approvalStep === "SUBMITTED"
    ? roles.includes("warehouse")
    : roles.includes("purchaser");
}

export interface PoPriceLine {
  itemId: string;
  unitPrice: number | string | null | undefined;
  taxRate?: number | string | null | undefined;
}

function num(v: number | string | null | undefined, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * V4.1 D8 — so dòng PO trước/sau khi sửa (theo itemId, dòng bị xoá-tạo lại nên
 * không còn id cũ). `changed` = dòng cũ đổi đơn giá hoặc VAT; `added` = dòng mới
 * có đơn giá > 0. Người không có quyền giá chỉ được sửa khi cả 2 bằng 0.
 */
export function detectPoPriceChanges(
  before: readonly PoPriceLine[],
  after: readonly PoPriceLine[],
): { changed: number; added: number } {
  const byItem = new Map(before.map((l) => [l.itemId, l]));
  let changed = 0;
  let added = 0;
  for (const l of after) {
    const b = byItem.get(l.itemId);
    if (!b) {
      if (num(l.unitPrice) > 0) added += 1;
      continue;
    }
    const priceDiff = Math.abs(num(b.unitPrice) - num(l.unitPrice)) > 1e-9;
    const taxDiff =
      Math.abs(num(b.taxRate, 8) - num(l.taxRate, 8)) > 1e-9;
    if (priceDiff || taxDiff) changed += 1;
  }
  return { changed, added };
}

/** V4.1 TM-10 — số thứ tự các dòng PO chưa có đơn giá (≤ 0). */
export function findUnpricedPoLines(
  lines: ReadonlyArray<{ lineNo?: number | null; unitPrice: number | string | null | undefined }>,
): number[] {
  const out: number[] = [];
  lines.forEach((l, idx) => {
    if (num(l.unitPrice) <= 0) out.push(l.lineNo ?? idx + 1);
  });
  return out;
}

/* ── TM-15/16: nhận đủ theo TỪNG dòng, không tính hàng QC không đạt ──────── */

export interface PoReceiptLine {
  lineNo: number;
  orderedQty: number | string;
  receivedQty: number | string;
  /** Tổng SL các dòng phiếu nhập bị QC kết luận Không đạt (FAIL). */
  rejectedQty?: number | string | null;
}

/** SL nhận "đạt" của 1 dòng = đã nhận − QC không đạt (không âm). */
export function acceptedQtyOf(l: PoReceiptLine): number {
  return Math.max(0, num(l.receivedQty) - num(l.rejectedQty));
}

export interface PoReceiptEvaluation {
  ok: boolean;
  shortLines: Array<{
    lineNo: number;
    ordered: number;
    accepted: number;
    rejected: number;
    ratio: number;
  }>;
  totals: { ordered: number; accepted: number; rejected: number };
}

/**
 * V4.1 TM-15/16 — PO "đủ" khi MỌI dòng có SL đạt ≥ ordered × threshold.
 * Trước đây tính tổng gộp ≥ 95% → một dòng nhận 0 vẫn qua; hàng NG vẫn tính.
 */
export function evaluatePoReceipt(
  lines: readonly PoReceiptLine[],
  threshold = 0.95,
): PoReceiptEvaluation {
  const shortLines: PoReceiptEvaluation["shortLines"] = [];
  let ordered = 0;
  let accepted = 0;
  let rejected = 0;
  for (const l of lines) {
    const o = num(l.orderedQty);
    const a = acceptedQtyOf(l);
    const r = num(l.rejectedQty);
    ordered += o;
    accepted += a;
    rejected += r;
    if (o <= 0) continue;
    const ratio = a / o;
    if (ratio + 1e-9 < threshold) {
      shortLines.push({ lineNo: l.lineNo, ordered: o, accepted: a, rejected: r, ratio });
    }
  }
  return {
    ok: lines.length > 0 && ordered > 0 && shortLines.length === 0,
    shortLines,
    totals: { ordered, accepted, rejected },
  };
}

/**
 * V4.1 TM-16 — trạng thái PO tự tính sau nhận/QC: mọi dòng đạt đủ → RECEIVED;
 * có dòng đã nhận (kể cả NG, vì hàng đã về) → PARTIAL; chưa có gì → null.
 */
export function nextPoStatusAfterReceipt(
  lines: readonly PoReceiptLine[],
): "RECEIVED" | "PARTIAL" | null {
  if (lines.length === 0) return null;
  const allFull = lines.every((l) => acceptedQtyOf(l) >= num(l.orderedQty));
  if (allFull) return "RECEIVED";
  const anyReceived = lines.some((l) => num(l.receivedQty) > 0);
  return anyReceived ? "PARTIAL" : null;
}

/* ── V4.3 LOOP_E2E P1: chặn nhận vượt SL đặt của dòng PO ─────────────────── */

/** Số ký tự tối thiểu của lý do "xác nhận nhận vượt". */
export const OVER_DELIVERY_REASON_MIN_LEN = 3;

export interface OverDeliveryCheckInput {
  lineNo: number;
  orderedQty: number | string;
  /** SL đã nhận ĐẠT của dòng này (accepted = received − rejected), CHƯA cộng lần này. */
  alreadyAcceptedQty: number | string;
  /** SL đang nhận thêm ở lần này. */
  qty: number;
  /** Người dùng đã tick "Xác nhận nhận vượt". */
  allowOverDelivery?: boolean | null;
  /** Lý do nhận vượt — bắt buộc ≥ OVER_DELIVERY_REASON_MIN_LEN ký tự khi allowOverDelivery=true. */
  overDeliveryReason?: string | null;
}

export type OverDeliveryCheckResult =
  | { ok: true; over: false; overQty: 0 }
  | { ok: true; over: true; overQty: number }
  | { ok: false; over: true; overQty: number; lineNo: number; message: string };

/**
 * V4.3 fix LOOP_E2E P1 — THUẦN: nhận hàng vượt SL đặt (ordered_qty) của MỘT
 * dòng PO phải bị chặn, trừ khi người dùng xác nhận tường minh
 * (`allowOverDelivery: true`) kèm lý do đủ dài. Trước đây chỉ chặn khi vượt
 * > 120% (OVER_DELIVERY_HARD_RATIO) nên PO đặt 100 vẫn âm thầm nhận được 120
 * mà không ai xác nhận — sai lệch số liệu nguồn cho đối soát công nợ NCC.
 */
export function checkOverDelivery(
  input: OverDeliveryCheckInput,
): OverDeliveryCheckResult {
  const ordered = num(input.orderedQty);
  const already = num(input.alreadyAcceptedQty);
  const projected = already + input.qty;
  const overQty = round2(Math.max(0, projected - ordered));
  const isOver = ordered > 0 && overQty > 1e-9;
  if (!isOver) return { ok: true, over: false, overQty: 0 };

  const reasonOk =
    (input.overDeliveryReason ?? "").trim().length >= OVER_DELIVERY_REASON_MIN_LEN;
  if (input.allowOverDelivery && reasonOk) {
    return { ok: true, over: true, overQty };
  }
  return {
    ok: false,
    over: true,
    overQty,
    lineNo: input.lineNo,
    message:
      `Dòng ${input.lineNo}: nhận ${projected.toFixed(2)} vượt ${overQty.toFixed(2)} so với ` +
      `SL đặt ${ordered.toFixed(2)}. Tick "Xác nhận nhận vượt" và nhập lý do (≥ ${OVER_DELIVERY_REASON_MIN_LEN} ký tự) để tiếp tục.`,
  };
}

/* ── TM-10: dòng PR → dòng PO ─────────────────────────────────────────────── */

/**
 * V4.1 TM-10 — dòng PO sinh từ dòng PR mang SL duyệt (nếu có) + đơn giá dự kiến.
 * `approvedQty = 0` → Kho/duyệt đã gạch dòng → trả null (không đưa vào PO).
 */
/**
 * A1 — SL duyệt hợp lệ: không bao giờ vượt SL đề xuất (dữ liệu cũ bị ghi sai
 * như qty 5 / duyệt 500 sẽ bị kẹp về qty). null/không hợp lệ → null.
 */
export function effectiveApprovedQty(
  qty: number | string,
  approvedQty: number | string | null | undefined,
): number | null {
  if (approvedQty === null || approvedQty === undefined || approvedQty === "") return null;
  const a = num(approvedQty);
  if (!Number.isFinite(a)) return null;
  return Math.min(a, num(qty));
}

/**
 * A2 — PR đang CONVERTED nhưng MỌI PO của nó đã CANCELLED (không còn PO sống)
 * → đưa PR về "đã duyệt cuối, chưa lập PO" để Thu mua lập lại được.
 * `poStatuses` = trạng thái của TẤT CẢ PO gắn PR (sau khi huỷ PO hiện tại).
 */
export function shouldRevertPrAfterPoCancel(
  prStatus: string,
  poStatuses: readonly string[],
): boolean {
  if (prStatus !== "CONVERTED") return false;
  return poStatuses.every((s) => s === "CANCELLED");
}

/* ── Kho kiểm tồn ở bước duyệt Kho (approved_qty = SL CẦN MUA) ─────────────── */

/** SL cần mua mặc định = max(0, đề xuất − tồn khả dụng hiện tại), 6 số lẻ. */
export function defaultBuyQty(qty: number | string, available: number | string | null | undefined): number {
  const v = Math.max(0, num(qty) - Math.max(0, num(available)));
  return Math.round(v * 1e6) / 1e6;
}

export interface BuyDecisionLine {
  id: string;
  qty: number | string;
  available: number | string | null | undefined;
  /** C3 — dòng KHÔNG có vật tư danh mục (null): SL cần mua bị ép = SL đề xuất. undefined = coi là có. */
  itemId?: string | null;
}

/* ── L1 — giữ chỗ mềm tồn kho giữa các phiếu ─────────────────────────────── */

/**
 * THUẦN — cam kết xuất từ kho theo vật tư = Σ `remainingByItem` (từ `prIssueRight`) của
 * các phiếu đã qua Kho duyệt mà chưa hoàn tất/huỷ/từ chối. Một nguồn duy nhất với trần xuất.
 */
export function computeCommittedByItem(
  perPr: ReadonlyArray<ReadonlyMap<string, number>>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of perPr) {
    for (const [itemId, v] of m) {
      if (v <= 0) continue;
      out.set(itemId, (out.get(itemId) ?? 0) + v);
    }
  }
  return out;
}

/** THUẦN — tồn khả dụng cho một phiếu = issuable − đã cam kết cho phiếu KHÁC (≥ 0). */
export function netIssuableByItem(
  issuable: ReadonlyMap<string, number>,
  committed: ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, v] of issuable) out.set(id, Math.max(0, v - (committed.get(id) ?? 0)));
  return out;
}

/** Phiếu ở trạng thái Kho còn kiểm tồn lại được (đã qua Kho duyệt, chưa hoàn tất/xuất xong). */
export function isStockRecheckableState(pr: {
  status: string;
  approvalStep: string | null | undefined;
  completedAt: Date | string | null | undefined;
  goodsIssuedAt: Date | string | null | undefined;
}): boolean {
  if (pr.completedAt || pr.goodsIssuedAt) return false;
  if (pr.approvalStep === "DEPT_APPROVED") return pr.status === "SUBMITTED";
  if (pr.approvalStep === "DIRECTOR_APPROVED") return pr.status === "APPROVED" || pr.status === "CONVERTED";
  // m2 — đã lập PO: approval_step = CONVERTED. Vẫn "kiểm tồn lại" được về mặt trạng thái; còn PO sống thì
  // repo trả đúng câu "huỷ/đóng PO trước", không phải câu "chỉ kiểm tồn lại được phiếu đã qua Kho duyệt".
  if (pr.approvalStep === "CONVERTED") return pr.status === "CONVERTED";
  return false;
}

/**
 * C4 — phân bổ tồn khả dụng LŨY KẾ theo vật tư: dòng trước dùng trước. Hai dòng
 * cùng vật tư không còn cùng "thấy" toàn bộ tồn (tính tồn 2 lần).
 * Trả `lineId → tồn còn khả dụng cho riêng dòng đó` (trước khi dòng đó lấy phần của mình).
 */
export function allocateStockAcrossLines(
  lines: ReadonlyArray<{ id: string; itemId: string | null; qty: number | string }>,
  stockByItem: ReadonlyMap<string, number>,
): Map<string, number> {
  const left = new Map<string, number>();
  const out = new Map<string, number>();
  for (const l of lines) {
    if (!l.itemId) {
      out.set(l.id, 0);
      continue;
    }
    const rem = left.has(l.itemId) ? left.get(l.itemId)! : Math.max(0, stockByItem.get(l.itemId) ?? 0);
    out.set(l.id, Math.round(rem * 1e6) / 1e6);
    left.set(l.itemId, Math.max(0, rem - Math.max(0, num(l.qty))));
  }
  return out;
}

/**
 * C4 — kiểm phía server khi Kho duyệt: tổng phần xuất từ kho (đề xuất − cần mua)
 * theo TỪNG vật tư không vượt tồn khả dụng hiện tại. Trả thông báo tiếng Việt
 * hoặc null nếu hợp lệ.
 */
export function validateStockCommitment(
  lines: ReadonlyArray<{
    id: string;
    itemId: string | null;
    qty: number | string;
    label?: string | null;
  }>,
  decisions: Readonly<Record<string, number>>,
  stockByItem: ReadonlyMap<string, number>,
): string | null {
  const commit = new Map<string, { total: number; label: string; lines: number }>();
  for (const l of lines) {
    if (!l.itemId) continue;
    const fromStock = Math.max(0, num(l.qty) - (decisions[l.id] ?? num(l.qty)));
    if (fromStock <= 0) continue;
    const cur = commit.get(l.itemId) ?? { total: 0, label: l.label ?? "vật tư", lines: 0 };
    cur.total += fromStock;
    cur.lines += 1;
    commit.set(l.itemId, cur);
  }
  for (const [itemId, c] of commit) {
    const avail = Math.max(0, stockByItem.get(itemId) ?? 0);
    if (c.total > avail + 1e-6) {
      const f = (n: number) => Number(n.toFixed(4)).toLocaleString("vi-VN");
      return `Vật tư ${c.label}: chỉ còn ${f(avail)} khả dụng, đang xuất từ kho ${f(c.total)}${
        c.lines > 1 ? ` (tổng ${c.lines} dòng cùng vật tư)` : ""
      }.`;
    }
  }
  return null;
}

/**
 * THUẦN — chốt SL cần mua cho từng dòng: `overrides[lineId]` (Kho nhập) hoặc
 * mặc định theo tồn khả dụng. Lỗi nếu ngoài 0 ≤ x ≤ SL đề xuất, hoặc override
 * trỏ dòng không thuộc phiếu. Dòng không có vật tư danh mục: ép = SL đề xuất (C3).
 */
export function resolveBuyDecisions(
  lines: readonly BuyDecisionLine[],
  overrides: Readonly<Record<string, number>> | undefined,
): { ok: true; decisions: Record<string, number> } | { ok: false; message: string } {
  const ids = new Set(lines.map((l) => l.id));
  for (const k of Object.keys(overrides ?? {})) {
    if (!ids.has(k)) return { ok: false, message: "Có dòng không thuộc phiếu này — tải lại trang rồi thử lại." };
  }
  const decisions: Record<string, number> = {};
  for (const [i, l] of lines.entries()) {
    const qty = num(l.qty);
    if (l.itemId === null) {
      decisions[l.id] = Math.round(qty * 1e6) / 1e6;
      continue;
    }
    const o = overrides?.[l.id];
    const buy = o === undefined ? defaultBuyQty(qty, l.available) : o;
    if (o !== undefined && o > 0 && o < 0.000001) {
      return { ok: false, message: `Dòng ${i + 1}: SL cần mua tối thiểu 0,000001 (hoặc nhập 0 nếu không cần mua).` };
    }
    if (!Number.isFinite(buy) || buy < 0 || buy > qty + 1e-9) {
      return { ok: false, message: `Dòng ${i + 1}: SL cần mua phải từ 0 đến SL đề xuất (${qty}).` };
    }
    decisions[l.id] = Math.round(buy * 1e6) / 1e6;
  }
  return { ok: true, decisions };
}

/** Tóm tắt cho thông báo: dòng "có sẵn" (cần mua = 0) vs dòng cần mua. */
export function summarizeBuyDecisions(decisions: Readonly<Record<string, number>>): {
  coveredLines: number;
  buyLines: number;
  allCovered: boolean;
} {
  const vals = Object.values(decisions);
  const coveredLines = vals.filter((v) => v <= 0).length;
  return { coveredLines, buyLines: vals.length - coveredLines, allCovered: vals.length > 0 && coveredLines === vals.length };
}

/**
 * N3 — tóm tắt cho thông báo duyệt cuối từ SL đã chốt của từng dòng: "có sẵn" (cần mua = 0),
 * "có sẵn một phần" (0 < cần mua < đề xuất, đếm vào CẢ HAI nhóm có sẵn/cần mua), cần mua.
 */
export function summarizeLineCoverage(
  lines: ReadonlyArray<{ qty: number | string; approvedQty?: number | string | null }>,
): { coveredLines: number; partialLines: number; buyLines: number } {
  let coveredLines = 0;
  let partialLines = 0;
  let buyLines = 0;
  for (const l of lines) {
    const q = num(l.qty);
    const buy = decidedBuy(l.qty, l.approvedQty);
    if (buy <= 1e-9) coveredLines += 1;
    else {
      buyLines += 1;
      if (buy < q - 1e-9) partialLines += 1;
    }
  }
  return { coveredLines, partialLines, buyLines };
}

/** m5 — câu tóm tắt "Có sẵn X dòng · cần mua Y dòng (Z dòng có sẵn một phần)". */
export function formatCoverageSummary(c: { coveredLines: number; partialLines: number; buyLines: number }): string {
  const base = `Có sẵn ${c.coveredLines} dòng · cần mua ${c.buyLines} dòng`;
  return c.partialLines > 0 ? `${base} (${c.partialLines} dòng có sẵn một phần)` : base;
}

/**
 * M1 — chống thao tác trên màn cũ: `expectedStep` thiếu (client cũ) → cho qua; khác bước hiện tại → lệch.
 */
export function isExpectedStepStale(
  current: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  return expected !== undefined && expected !== null && expected !== "" && current !== expected;
}

/** m8 — làm tròn số tồn ở lớp trả ra (6 số lẻ, bỏ đuôi dư dấu phẩy động). */
export function roundQty(n: number | null | undefined): number {
  if (n === null || n === undefined || !Number.isFinite(n)) return 0;
  return Math.round(n * 1e6) / 1e6;
}

/** THUẦN (N7) — phiếu vẫn đang ở đúng bước mà người từ chối đã thấy? */
export function isRejectStepCurrent(
  current: string | null | undefined,
  expected: "SUBMITTED" | "DEPT_APPROVED",
): boolean {
  return current === expected;
}

/** Phiếu đã qua Kho (DEPT_APPROVED) nhưng chưa duyệt cuối — Kho được xuất phần có sẵn. */
export function isWarehouseIssueStage(pr: { status: string; approvalStep: string | null | undefined }): boolean {
  return pr.status === "SUBMITTED" && pr.approvalStep === "DEPT_APPROVED";
}

export type { PrIssuePhase };

/** Giai đoạn giữ chỗ/xuất của phiếu: NONE = không giữ chỗ (nháp/chờ Kho/hoàn tất/huỷ/từ chối). */
export function prIssuePhaseOf(pr: {
  status: string;
  approvalStep: string | null | undefined;
  completedAt?: Date | string | null;
  goodsIssuedAt?: Date | string | null;
}): PrIssuePhase {
  if (pr.completedAt || pr.goodsIssuedAt) return "NONE";
  if (pr.status === "SUBMITTED") return pr.approvalStep === "DEPT_APPROVED" ? "WAREHOUSE" : "NONE";
  if (pr.status === "APPROVED" || pr.status === "CONVERTED") {
    return pr.approvalStep === "DONE" || pr.approvalStep === "REJECTED" || pr.approvalStep === "CANCELLED"
      ? "NONE"
      : "FINAL";
  }
  return "NONE";
}

/**
 * THUẦN — kiểm khi xuất (B1-B3): với từng vật tư, tổng SL xuất ≤ tồn khả dụng − phần ĐÃ GIỮ CHỖ cho
 * phiếu khác. Trả thông báo tiếng Việt cho vật tư đầu tiên vi phạm, hoặc null.
 */
export function checkIssueAgainstHold(
  pickByItem: ReadonlyMap<string, number>,
  issuable: ReadonlyMap<string, number>,
  heldByOthers: ReadonlyMap<string, number>,
  labelOf: (itemId: string) => string = () => "Vật tư",
): string | null {
  const f = (n: number) => Number(n.toFixed(4)).toLocaleString("vi-VN");
  for (const [itemId, qty] of pickByItem) {
    const have = issuable.get(itemId) ?? 0;
    const held = heldByOthers.get(itemId) ?? 0;
    const free = Math.max(0, have - held);
    if (qty > free + 1e-4) {
      return `${labelOf(itemId)}: tồn khả dụng ${f(have)}, trong đó ${f(held)} đã giữ cho phiếu khác — chỉ xuất được tối đa ${f(free)}, không xuất ${f(qty)}. Kho kiểm lại tồn rồi xuất phần còn được.`;
    }
  }
  return null;
}

/** line_total = qty × price × (1 + VAT/100), làm tròn 2 số lẻ (giống purchaseOrders.ts). */
export function computePoLineTotal(qty: number, price: number, taxRate: number): number {
  return Math.round(qty * price * (1 + taxRate / 100) * 100) / 100;
}

/* ── D7: HĐ mua từ PO ─────────────────────────────────────────────────────── */

/** "Net 30" / "30 ngày" / "TT 45 ngày" → 30/45. Không đọc được → null. */
export function parsePaymentTermDays(terms: string | null | undefined): number | null {
  if (!terms) return null;
  const m = /(\d{1,3})/.exec(terms);
  if (!m) return null;
  const days = Number.parseInt(m[1]!, 10);
  return days > 0 && days <= 365 ? days : null;
}

/** Cộng ngày cho chuỗi `YYYY-MM-DD` (không lệch múi giờ). */
export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface PoInvoiceSourceLine {
  lineNo: number;
  orderedQty: number | string;
  receivedQty: number | string;
  rejectedQty?: number | string | null;
  unitPrice: number | string;
  taxRate: number | string | null;
}

export interface PoInvoiceDraft {
  subtotalAmount: number;
  vatAmount: number;
  totalAmount: number;
  /** Thuế suất chung; dòng khác thuế suất → thuế suất hiệu dụng (2 số lẻ). */
  vatRate: number;
  mixedVat: boolean;
  billedQtyTotal: number;
  issueDate: string;
  dueDate: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * V4.1 D7 — bản nháp HĐ mua từ PO: tính theo SL ĐÃ NHẬN ĐẠT (đã trừ QC không
 * đạt) × đơn giá — NCC chỉ được thanh toán hàng thực nhận. VAT 0% giữ nguyên 0.
 */
export function buildPoInvoiceDraft(input: {
  lines: readonly PoInvoiceSourceLine[];
  paymentTerms?: string | null;
  today: string;
}): PoInvoiceDraft {
  let subtotal = 0;
  let vat = 0;
  let billed = 0;
  const rates = new Set<number>();
  for (const l of input.lines) {
    const qty = acceptedQtyOf(l);
    if (qty <= 0) continue;
    const pre = round2(qty * num(l.unitPrice));
    const rate = num(l.taxRate, 0);
    subtotal += pre;
    vat += round2((pre * rate) / 100);
    billed += qty;
    rates.add(rate);
  }
  subtotal = round2(subtotal);
  vat = round2(vat);
  const mixedVat = rates.size > 1;
  const vatRate =
    rates.size === 1
      ? [...rates][0]!
      : subtotal > 0
        ? round2((vat / subtotal) * 100)
        : 0;
  const days = parsePaymentTermDays(input.paymentTerms);
  return {
    subtotalAmount: subtotal,
    vatAmount: vat,
    totalAmount: round2(subtotal + vat),
    vatRate,
    mixedVat,
    billedQtyTotal: billed,
    issueDate: input.today,
    dueDate: days ? addDaysIso(input.today, days) : null,
  };
}

/** V4.1 D7 — trạng thái PO được tạo HĐ mua. */
export const PO_INVOICEABLE_STATUSES = ["PARTIAL", "RECEIVED", "CLOSED"] as const;

/* ── TM-24/25: ngày ───────────────────────────────────────────────────────── */

/** Ngày hôm nay `YYYY-MM-DD` theo giờ Việt Nam (+07), không phụ thuộc TZ máy chủ. */
export function vnToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * V4.1 TM-25 — đọc tham số ngày từ query. Rỗng → null; sai định dạng →
 * "invalid" (route trả 400 thay vì 500 do `toISOString()` ném lỗi).
 */
export function parseDateParam(raw: string | null | undefined): Date | null | "invalid" {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const t = raw.trim();
  // N2 — dạng YYYY-MM-DD phải là ngày thật (JS để 2026-02-30 lăn sang 02/03).
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) && !isRealIsoDate(t)) return "invalid";
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

/** A16 — "Lý do đề xuất" bắt buộc khi GỬI phiếu (nháp được để trống). */
export const REQUEST_REASON_REQUIRED_MSG = "Cần nhập “Lý do đề xuất” trước khi gửi phiếu.";
export function isRequestReasonMissing(reason: string | null | undefined): boolean {
  return !reason || reason.trim().length === 0;
}

/** YYYY-MM-DD có phải ngày lịch thật (loại 2026-02-30)? THUẦN. */
export function isRealIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * A12 — kiểm khoảng ngày xuất Excel hàng loạt: đúng định dạng + ngày thật,
 * from ≤ to, to không quá ~5 năm tới. Trả thông báo lỗi tiếng Việt hoặc null.
 */
export function validateExportRange(from: string, to: string, today: string = vnToday()): string | null {
  if (!isRealIsoDate(from) || !isRealIsoDate(to)) {
    return "Thiếu hoặc sai ngày from/to (YYYY-MM-DD, phải là ngày có thật).";
  }
  if (from > to) return "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.";
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCFullYear(limit.getUTCFullYear() + 5);
  if (to > limit.toISOString().slice(0, 10) || from < "2000-01-01") {
    return "Khoảng ngày không hợp lệ (từ năm 2000 đến tối đa 5 năm tới).";
  }
  return null;
}

/* ── V4.1 PO-UI: điều chỉnh giá PO sau khi rời DRAFT ─────────────────────── */

/**
 * V4.1 PO-UI: thuế suất VAT được chọn khi điều chỉnh giá (VN: 0/5/8/10 %).
 * Dòng cũ có thuế suất khác vẫn giữ được nếu KHÔNG đổi VAT.
 */
export const PO_VAT_RATES = [0, 5, 8, 10] as const;

/** Giới hạn đơn giá theo cột numeric(18,4) → ≤ 14 chữ số phần nguyên. */
export const PO_MAX_UNIT_PRICE = 1e13;

/**
 * V4.1 PO-UI: Thu mua / Giám đốc điều chỉnh đơn giá + VAT ở MỌI trạng thái trừ
 * Đã huỷ — giá chốt thường về sau khi nhận hàng / có hoá đơn NCC.
 */
export function isPoPriceEditableStatus(status: string | null | undefined): boolean {
  return !!status && status !== "CANCELLED";
}

/**
 * V4.1 PO-UI: HĐ mua của PO đã ghi công nợ (khác Nháp / Đã huỷ) → khoá giá PO,
 * điều chỉnh trên hoá đơn ở màn Tài chính.
 */
export function isPoInvoiceLockingPrices(invoiceStatus: string | null | undefined): boolean {
  return !!invoiceStatus && invoiceStatus !== "DRAFT" && invoiceStatus !== "CANCELLED";
}

export interface PoPriceLineState {
  id: string;
  lineNo: number;
  orderedQty: number | string;
  unitPrice: number | string | null | undefined;
  taxRate: number | string | null | undefined;
}

export interface PoPriceEdit {
  lineId: string;
  unitPrice: number;
  taxRate: number;
}

export interface PoPriceValues {
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
}

export interface PoPriceChange {
  lineId: string;
  lineNo: number;
  before: PoPriceValues;
  after: PoPriceValues;
}

export type PoPricePlan =
  | {
      ok: true;
      changes: PoPriceChange[];
      totalBefore: number;
      totalAfter: number;
    }
  | {
      ok: false;
      code: "DUPLICATE_LINE" | "LINE_NOT_FOUND" | "INVALID_PRICE" | "INVALID_VAT";
      message: string;
      lineNo?: number;
    };

/** Làm tròn đơn giá theo scale 4 của cột unit_price. */
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * V4.1 PO-UI: kiểm tra + tính chênh lệch khi điều chỉnh giá dòng PO (THUẦN —
 * route + vitest dùng chung). Chỉ dòng thực sự đổi đơn giá/VAT nằm trong
 * `changes`; tổng PO tính lại từ MỌI dòng sau điều chỉnh.
 *  - lineId trùng → DUPLICATE_LINE; không thuộc PO → LINE_NOT_FOUND
 *  - đơn giá âm / không hữu hạn / quá lớn → INVALID_PRICE
 *  - VAT ngoài {0,5,8,10} → INVALID_VAT (trừ khi giữ nguyên VAT cũ của dòng)
 */
export function planPoPriceEdit(
  current: readonly PoPriceLineState[],
  edits: readonly PoPriceEdit[],
  allowedVat: readonly number[] = PO_VAT_RATES,
): PoPricePlan {
  const byId = new Map(current.map((l) => [l.id, l]));
  const seen = new Set<string>();
  const nextById = new Map<string, { unitPrice: number; taxRate: number }>();

  for (const e of edits) {
    if (seen.has(e.lineId)) {
      return { ok: false, code: "DUPLICATE_LINE", message: "Một dòng PO xuất hiện 2 lần trong yêu cầu." };
    }
    seen.add(e.lineId);
    const line = byId.get(e.lineId);
    if (!line) {
      return { ok: false, code: "LINE_NOT_FOUND", message: "Dòng PO không thuộc đơn này (có thể đã bị sửa) — tải lại trang." };
    }
    if (!Number.isFinite(e.unitPrice) || e.unitPrice < 0 || e.unitPrice > PO_MAX_UNIT_PRICE) {
      return {
        ok: false,
        code: "INVALID_PRICE",
        message: `Dòng ${line.lineNo}: đơn giá không hợp lệ (phải ≥ 0).`,
        lineNo: line.lineNo,
      };
    }
    const oldTax = num(line.taxRate, 8);
    const taxUnchanged = Math.abs(oldTax - e.taxRate) < 1e-9;
    if (!Number.isFinite(e.taxRate) || (!taxUnchanged && !allowedVat.includes(e.taxRate))) {
      return {
        ok: false,
        code: "INVALID_VAT",
        message: `Dòng ${line.lineNo}: thuế suất VAT phải là ${allowedVat.join("/")} %.`,
        lineNo: line.lineNo,
      };
    }
    nextById.set(e.lineId, { unitPrice: round4(e.unitPrice), taxRate: e.taxRate });
  }

  const changes: PoPriceChange[] = [];
  let totalBefore = 0;
  let totalAfter = 0;
  for (const l of current) {
    const qty = num(l.orderedQty);
    const beforePrice = num(l.unitPrice);
    const beforeTax = num(l.taxRate, 8);
    const before: PoPriceValues = {
      unitPrice: beforePrice,
      taxRate: beforeTax,
      lineTotal: computePoLineTotal(qty, beforePrice, beforeTax),
    };
    const next = nextById.get(l.id);
    const after: PoPriceValues = next
      ? { ...next, lineTotal: computePoLineTotal(qty, next.unitPrice, next.taxRate) }
      : before;
    totalBefore += before.lineTotal;
    totalAfter += after.lineTotal;
    if (
      next &&
      (Math.abs(before.unitPrice - after.unitPrice) > 1e-9 ||
        Math.abs(before.taxRate - after.taxRate) > 1e-9)
    ) {
      changes.push({ lineId: l.id, lineNo: l.lineNo, before, after });
    }
  }
  return {
    ok: true,
    changes,
    totalBefore: round2(totalBefore),
    totalAfter: round2(totalAfter),
  };
}

/** V4.1 PO-UI: tổng tiền PO (tạm tính / VAT / tổng) từ các dòng — dùng cho UI. */
export function summarizePoLines(
  lines: ReadonlyArray<{ orderedQty: number | string; unitPrice: number | string | null | undefined; taxRate?: number | string | null }>,
): { subtotal: number; vat: number; total: number; unpriced: number } {
  let subtotal = 0;
  let vat = 0;
  let unpriced = 0;
  for (const l of lines) {
    const pre = num(l.orderedQty) * num(l.unitPrice);
    subtotal += pre;
    vat += (pre * num(l.taxRate, 0)) / 100;
    if (num(l.unitPrice) <= 0) unpriced += 1;
  }
  return { subtotal: round2(subtotal), vat: round2(vat), total: round2(subtotal + vat), unpriced };
}
