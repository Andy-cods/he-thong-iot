/**
 * V4.1 Đợt 2 — Chính sách THUẦN của luồng Thu mua (PR → PO → nhận hàng → HĐ mua).
 *
 * Không import DB/server → dùng chung cho route API + giao diện + vitest.
 */

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

/* ── TM-10: dòng PR → dòng PO ─────────────────────────────────────────────── */

/**
 * V4.1 TM-10 — dòng PO sinh từ dòng PR mang SL duyệt (nếu có) + đơn giá dự kiến.
 * `approvedQty = 0` → Kho/duyệt đã gạch dòng → trả null (không đưa vào PO).
 */
export function prLineToPoLine(l: {
  qty: number | string;
  approvedQty?: number | string | null;
  estimatedUnitPrice?: number | string | null;
}): { orderedQty: number; unitPrice: number } | null {
  const approved =
    l.approvedQty === null || l.approvedQty === undefined || l.approvedQty === ""
      ? null
      : num(l.approvedQty);
  if (approved !== null && approved <= 0) return null;
  const orderedQty = approved ?? num(l.qty);
  if (orderedQty <= 0) return null;
  return { orderedQty, unitPrice: Math.max(0, num(l.estimatedUnitPrice)) };
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
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}
