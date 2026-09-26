import { describe, expect, it } from "vitest";
import {
  acceptedQtyOf,
  addDaysIso,
  buildPoInvoiceDraft,
  canEditPoPrices,
  detectPoPriceChanges,
  evaluatePoReceipt,
  findUnpricedPoLines,
  isSelfApprovalBlocked,
  nextPoStatusAfterReceipt,
  parseDateParam,
  parsePaymentTermDays,
  prLineToPoLine,
  vnToday,
} from "./procurement-policy";

describe("V4.1 D8 — người tạo không tự duyệt", () => {
  it("chặn khi người duyệt = người lập (không phải admin)", () => {
    expect(
      isSelfApprovalBlocked({ creatorId: "u1", actorId: "u1", actorRoles: ["warehouse"] }),
    ).toBe(true);
    expect(
      isSelfApprovalBlocked({ creatorId: "u1", actorId: "u1", actorRoles: ["purchaser"] }),
    ).toBe(true);
  });
  it("admin được tự duyệt; người khác duyệt được; phiếu không rõ người lập không chặn", () => {
    expect(
      isSelfApprovalBlocked({ creatorId: "u1", actorId: "u1", actorRoles: ["admin"] }),
    ).toBe(false);
    expect(
      isSelfApprovalBlocked({ creatorId: "u1", actorId: "u2", actorRoles: ["warehouse"] }),
    ).toBe(false);
    expect(
      isSelfApprovalBlocked({ creatorId: null, actorId: "u2", actorRoles: ["purchaser"] }),
    ).toBe(false);
  });
});

describe("V4.1 D8 — chỉ Thu mua/Giám đốc sửa đơn giá PO", () => {
  it("quyền theo vai trò", () => {
    expect(canEditPoPrices(["admin"])).toBe(true);
    expect(canEditPoPrices(["purchaser"])).toBe(true);
    expect(canEditPoPrices(["warehouse"])).toBe(false);
    expect(canEditPoPrices(["planner"])).toBe(false);
  });
  it("phát hiện đổi giá / đổi VAT / dòng mới có giá; đổi SL không tính", () => {
    const before = [
      { itemId: "a", unitPrice: "100", taxRate: "8" },
      { itemId: "b", unitPrice: "50", taxRate: "8" },
    ];
    expect(
      detectPoPriceChanges(before, [
        { itemId: "a", unitPrice: 100, taxRate: 8 },
        { itemId: "b", unitPrice: 50, taxRate: 8 },
      ]),
    ).toEqual({ changed: 0, added: 0 });
    expect(
      detectPoPriceChanges(before, [
        { itemId: "a", unitPrice: 120, taxRate: 8 },
        { itemId: "b", unitPrice: 50, taxRate: 0 },
      ]),
    ).toEqual({ changed: 2, added: 0 });
    expect(
      detectPoPriceChanges(before, [
        { itemId: "a", unitPrice: 100, taxRate: 8 },
        { itemId: "c", unitPrice: 0, taxRate: 8 },
        { itemId: "d", unitPrice: 9, taxRate: 8 },
      ]),
    ).toEqual({ changed: 0, added: 1 });
  });
});

describe("V4.1 TM-10 — dòng chưa có giá + PR → PO", () => {
  it("liệt kê dòng giá 0", () => {
    expect(
      findUnpricedPoLines([
        { lineNo: 1, unitPrice: "10" },
        { lineNo: 2, unitPrice: "0" },
        { lineNo: 3, unitPrice: null },
      ]),
    ).toEqual([2, 3]);
    expect(findUnpricedPoLines([{ unitPrice: 5 }])).toEqual([]);
  });
  it("dùng SL duyệt + đơn giá dự kiến; SL duyệt 0 → bỏ dòng", () => {
    expect(prLineToPoLine({ qty: "10", approvedQty: "8", estimatedUnitPrice: "1500" })).toEqual({
      orderedQty: 8,
      unitPrice: 1500,
    });
    expect(prLineToPoLine({ qty: "10", approvedQty: null, estimatedUnitPrice: null })).toEqual({
      orderedQty: 10,
      unitPrice: 0,
    });
    expect(prLineToPoLine({ qty: "10", approvedQty: "0", estimatedUnitPrice: "5" })).toBeNull();
  });
});

describe("V4.1 TM-15/16 — nhận đủ theo TỪNG dòng, bỏ hàng QC không đạt", () => {
  it("tổng ≥95% nhưng 1 dòng nhận 0 → KHÔNG đủ (lỗi cũ)", () => {
    const r = evaluatePoReceipt([
      { lineNo: 1, orderedQty: 100, receivedQty: 100 },
      { lineNo: 2, orderedQty: 1, receivedQty: 0 },
    ]);
    // Tổng 100/101 = 99% — logic cũ cho qua.
    expect(r.ok).toBe(false);
    expect(r.shortLines.map((l) => l.lineNo)).toEqual([2]);
  });
  it("hàng NG không tính là đã nhận", () => {
    const line = { lineNo: 1, orderedQty: 10, receivedQty: 10, rejectedQty: 4 };
    expect(acceptedQtyOf(line)).toBe(6);
    expect(evaluatePoReceipt([line]).ok).toBe(false);
    expect(nextPoStatusAfterReceipt([line])).toBe("PARTIAL");
  });
  it("từng dòng ≥ 95% → đủ; PO rỗng không đủ", () => {
    expect(
      evaluatePoReceipt([
        { lineNo: 1, orderedQty: 100, receivedQty: 95 },
        { lineNo: 2, orderedQty: 10, receivedQty: 10, rejectedQty: 0 },
      ]).ok,
    ).toBe(true);
    expect(evaluatePoReceipt([]).ok).toBe(false);
  });
  it("trạng thái tự tính sau nhận", () => {
    expect(nextPoStatusAfterReceipt([{ lineNo: 1, orderedQty: 5, receivedQty: 0 }])).toBeNull();
    expect(nextPoStatusAfterReceipt([{ lineNo: 1, orderedQty: 5, receivedQty: 5 }])).toBe("RECEIVED");
    expect(
      nextPoStatusAfterReceipt([
        { lineNo: 1, orderedQty: 5, receivedQty: 6, rejectedQty: 1 },
        { lineNo: 2, orderedQty: 2, receivedQty: 1 },
      ]),
    ).toBe("PARTIAL");
  });
});

describe("V4.1 D7 — bản nháp HĐ mua từ PO", () => {
  it("tính theo SL nhận đạt × đơn giá, VAT chung", () => {
    const d = buildPoInvoiceDraft({
      lines: [
        { lineNo: 1, orderedQty: 10, receivedQty: 10, rejectedQty: 2, unitPrice: "1000", taxRate: "8" },
        { lineNo: 2, orderedQty: 5, receivedQty: 0, unitPrice: "999", taxRate: "8" },
      ],
      paymentTerms: "Net 30",
      today: "2026-09-27",
    });
    expect(d.subtotalAmount).toBe(8000);
    expect(d.vatRate).toBe(8);
    expect(d.vatAmount).toBe(640);
    expect(d.totalAmount).toBe(8640);
    expect(d.mixedVat).toBe(false);
    expect(d.billedQtyTotal).toBe(8);
    expect(d.issueDate).toBe("2026-09-27");
    expect(d.dueDate).toBe("2026-10-27");
  });
  it("VAT 0% giữ nguyên 0 (không thành 8)", () => {
    const d = buildPoInvoiceDraft({
      lines: [{ lineNo: 1, orderedQty: 3, receivedQty: 3, unitPrice: 500, taxRate: "0" }],
      today: "2026-09-27",
    });
    expect(d.vatRate).toBe(0);
    expect(d.vatAmount).toBe(0);
    expect(d.totalAmount).toBe(1500);
    expect(d.dueDate).toBeNull();
  });
  it("nhiều thuế suất → VAT cộng theo dòng, % bình quân", () => {
    const d = buildPoInvoiceDraft({
      lines: [
        { lineNo: 1, orderedQty: 1, receivedQty: 1, unitPrice: 1000, taxRate: 10 },
        { lineNo: 2, orderedQty: 1, receivedQty: 1, unitPrice: 1000, taxRate: 0 },
      ],
      today: "2026-09-27",
    });
    expect(d.mixedVat).toBe(true);
    expect(d.vatAmount).toBe(100);
    expect(d.vatRate).toBe(5);
    expect(d.totalAmount).toBe(2100);
  });
  it("điều khoản thanh toán", () => {
    expect(parsePaymentTermDays("Net 45")).toBe(45);
    expect(parsePaymentTermDays("TT 30 ngày")).toBe(30);
    expect(parsePaymentTermDays("Tiền mặt")).toBeNull();
    expect(parsePaymentTermDays(null)).toBeNull();
    expect(addDaysIso("2026-12-20", 15)).toBe("2027-01-04");
  });
});

describe("V4.1 TM-24/25 — ngày", () => {
  it("ngày VN: 23h UTC = sáng hôm sau ở VN", () => {
    expect(vnToday(new Date("2026-09-26T18:30:00Z"))).toBe("2026-09-27");
    expect(vnToday(new Date("2026-09-26T16:59:00Z"))).toBe("2026-09-26");
  });
  it("tham số ngày sai → invalid (400), rỗng → null", () => {
    expect(parseDateParam("abc")).toBe("invalid");
    expect(parseDateParam("")).toBeNull();
    expect(parseDateParam(null)).toBeNull();
    const d = parseDateParam("2026-09-01");
    expect(d instanceof Date && d.toISOString().slice(0, 10)).toBe("2026-09-01");
  });
});
