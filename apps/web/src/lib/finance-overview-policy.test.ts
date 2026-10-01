import { describe, expect, it } from "vitest";
import {
  ABNORMAL_LINE_VALUE_THRESHOLD,
  classifyPayableDueBucket,
  computeBoardValueSummary,
  computeExpectedPayable,
  groupPayablesBySupplierAndBucket,
  type BoardValueRow,
  type PayableRawRow,
} from "./finance-overview-policy";

/**
 * TASK-20261001 — vitest cho công thức THUẦN của Tổng quan Tài chính
 * ("Dự trù thu" gộp, "Dự trù chi" phần (a) công nợ sắp đến hạn + phần (b)).
 */

describe("computeBoardValueSummary — Dự trù thu (gộp Đang gia công + Đã xong chờ giao)", () => {
  it("Đang gia công = Σ(qty_planned × unit_price) các mã IN_PROGRESS/QC (KHÔNG gồm QUEUED)", () => {
    const rows: BoardValueRow[] = [
      { status: "QUEUED", qtyPlanned: "10", qtyDone: "0", unitPrice: "1000" },
      { status: "IN_PROGRESS", qtyPlanned: "5", qtyDone: "2", unitPrice: "2000" },
      { status: "QC", qtyPlanned: "3", qtyDone: "3", unitPrice: "500" },
    ];
    const out = computeBoardValueSummary(rows);
    // 5*2000 + 3*500 = 11500 (QUEUED KHÔNG tính).
    expect(out.expectedReceivable.inProgress).toEqual({ value: 11500, itemCount: 2 });
    expect(out.expectedReceivable.value).toBe(11500);
    expect(out.missingPriceCount).toBe(0);
  });

  it("Đã xong chờ giao = Σ(qty_done × unit_price) các mã COMPLETED; tổng = 2 nhóm cộng lại", () => {
    const rows: BoardValueRow[] = [
      { status: "IN_PROGRESS", qtyPlanned: "5", qtyDone: "0", unitPrice: "2000" },
      { status: "COMPLETED", qtyPlanned: "10", qtyDone: "10", unitPrice: "3000" },
      { status: "COMPLETED", qtyPlanned: "4", qtyDone: "4", unitPrice: "1500" },
    ];
    const out = computeBoardValueSummary(rows);
    expect(out.expectedReceivable.completed).toEqual({ value: 36000, itemCount: 2 });
    expect(out.expectedReceivable.inProgress).toEqual({ value: 10000, itemCount: 1 });
    expect(out.expectedReceivable.value).toBe(46000);
    expect(out.expectedReceivable.itemCount).toBe(3);
  });

  it("QUEUED và DELIVERED không tính vào bên nào", () => {
    const rows: BoardValueRow[] = [
      { status: "QUEUED", qtyPlanned: "10", qtyDone: "10", unitPrice: "9999" },
      { status: "DELIVERED", qtyPlanned: "10", qtyDone: "10", unitPrice: "9999" },
    ];
    const out = computeBoardValueSummary(rows);
    expect(out.expectedReceivable.value).toBe(0);
    expect(out.expectedReceivable.itemCount).toBe(0);
    expect(out.missingPriceCount).toBe(0);
  });

  it("unit_price NULL → giá trị tính 0 (không thổi phồng) nhưng đếm vào missingPriceCount", () => {
    const rows: BoardValueRow[] = [
      { status: "IN_PROGRESS", qtyPlanned: "10", qtyDone: "0", unitPrice: null },
      { status: "COMPLETED", qtyPlanned: "5", qtyDone: "5", unitPrice: null },
      { status: "QC", qtyPlanned: "2", qtyDone: "1", unitPrice: "100" },
    ];
    const out = computeBoardValueSummary(rows);
    expect(out.expectedReceivable.inProgress).toEqual({ value: 200, itemCount: 2 }); // chỉ mã QC có giá
    expect(out.expectedReceivable.completed).toEqual({ value: 0, itemCount: 1 });
    expect(out.missingPriceCount).toBe(2);
  });

  it("mảng rỗng → tất cả về 0", () => {
    const out = computeBoardValueSummary([]);
    expect(out).toEqual({
      expectedReceivable: {
        value: 0,
        itemCount: 0,
        inProgress: { value: 0, itemCount: 0 },
        completed: { value: 0, itemCount: 0 },
      },
      missingPriceCount: 0,
      abnormalCount: 0,
    });
  });
});

describe("V4.5 QA-D P1-01 — dòng giá bất thường bị loại khỏi tổng", () => {
  it("1 dòng giá trị vượt ngưỡng → loại khỏi tổng, đếm vào abnormalCount", () => {
    const rows: BoardValueRow[] = [
      { status: "IN_PROGRESS", qtyPlanned: "10", qtyDone: "0", unitPrice: "1000" },
      // Dòng gõ nhầm (vd thêm vài số 0 vào đơn giá) — qty*price vượt ngưỡng.
      { status: "IN_PROGRESS", qtyPlanned: "99999", qtyDone: "0", unitPrice: "999999999999" },
    ];
    const out = computeBoardValueSummary(rows);
    expect(out.expectedReceivable.inProgress).toEqual({ value: 10000, itemCount: 1 }); // chỉ dòng hợp lệ
    expect(out.abnormalCount).toBe(1);
  });

  it("dòng COMPLETED vượt ngưỡng cũng bị loại", () => {
    const rows: BoardValueRow[] = [
      { status: "COMPLETED", qtyPlanned: "1", qtyDone: "99999", unitPrice: "999999999999" },
    ];
    const out = computeBoardValueSummary(rows);
    expect(out.expectedReceivable.completed).toEqual({ value: 0, itemCount: 0 });
    expect(out.abnormalCount).toBe(1);
  });

  it("đúng ngưỡng (không vượt) → vẫn tính bình thường, không đánh dấu bất thường", () => {
    const rows: BoardValueRow[] = [
      { status: "IN_PROGRESS", qtyPlanned: "1", qtyDone: "0", unitPrice: String(ABNORMAL_LINE_VALUE_THRESHOLD) },
    ];
    const out = computeBoardValueSummary(rows);
    expect(out.expectedReceivable.inProgress).toEqual({ value: ABNORMAL_LINE_VALUE_THRESHOLD, itemCount: 1 });
    expect(out.abnormalCount).toBe(0);
  });
});

describe("computeExpectedPayable — Dự trù chi phần (b)", () => {
  it("= PO mở chưa có HĐ + tổng HĐ mua đang NHÁP, KHÔNG đếm trùng HĐ đã xác nhận", () => {
    const out = computeExpectedPayable({
      openPoAmounts: ["10000000", "5000000"],
      draftInvoiceAmounts: ["2000000"],
    });
    expect(out).toEqual({
      poValue: 15_000_000,
      poCount: 2,
      draftInvoiceValue: 2_000_000,
      draftInvoiceCount: 1,
      value: 17_000_000,
    });
  });

  it("rỗng cả 2 nguồn → 0", () => {
    const out = computeExpectedPayable({ openPoAmounts: [], draftInvoiceAmounts: [] });
    expect(out.value).toBe(0);
    expect(out.poCount).toBe(0);
    expect(out.draftInvoiceCount).toBe(0);
  });

  it("chấp cả number lẫn string (numeric Postgres trả string qua Drizzle)", () => {
    const out = computeExpectedPayable({
      openPoAmounts: [1000, "2000.50"],
      draftInvoiceAmounts: [],
    });
    expect(out.poValue).toBeCloseTo(3000.5);
  });
});

describe("classifyPayableDueBucket — Dự trù chi phần (a), mốc hạn", () => {
  const today = "2026-10-01";
  it("hạn trước hôm nay → OVERDUE", () => {
    expect(classifyPayableDueBucket("2026-09-20", today)).toBe("OVERDUE");
  });
  it("hạn đúng hôm nay → 0-30 (chưa quá hạn)", () => {
    expect(classifyPayableDueBucket("2026-10-01", today)).toBe("0-30");
  });
  it("hạn 30 ngày tới → 0-30", () => {
    expect(classifyPayableDueBucket("2026-10-31", today)).toBe("0-30");
  });
  it("hạn 31 ngày tới → 31-45", () => {
    expect(classifyPayableDueBucket("2026-11-01", today)).toBe("31-45");
  });
  it("hạn 45 ngày tới → 31-45; 46 ngày → 46-60", () => {
    expect(classifyPayableDueBucket("2026-11-15", today)).toBe("31-45");
    expect(classifyPayableDueBucket("2026-11-16", today)).toBe("46-60");
  });
  it("hạn 60/61 ngày → biên 46-60 / 61-90", () => {
    expect(classifyPayableDueBucket("2026-11-30", today)).toBe("46-60");
    expect(classifyPayableDueBucket("2026-12-01", today)).toBe("61-90");
  });
  it("hạn 90/91 ngày → biên 61-90 / 90+", () => {
    expect(classifyPayableDueBucket("2026-12-30", today)).toBe("61-90");
    expect(classifyPayableDueBucket("2026-12-31", today)).toBe("90+");
  });
  it("không có hạn (null) → 0-30 (không ẩn khoản nợ khỏi tầm nhìn gần)", () => {
    expect(classifyPayableDueBucket(null, today)).toBe("0-30");
  });
});

describe("groupPayablesBySupplierAndBucket — nhóm NCC × mốc hạn", () => {
  const today = "2026-10-01";

  it("nhóm đúng theo NCC + mốc hạn, cộng dồn nhiều HĐ cùng nhóm", () => {
    const rows: PayableRawRow[] = [
      { supplierId: "s1", supplierName: "NCC A", dueDate: "2026-09-01", outstandingAmount: "1000000" }, // OVERDUE
      { supplierId: "s1", supplierName: "NCC A", dueDate: "2026-09-15", outstandingAmount: "500000" }, // OVERDUE
      { supplierId: "s1", supplierName: "NCC A", dueDate: "2026-10-20", outstandingAmount: "2000000" }, // 0-30
      { supplierId: "s2", supplierName: "NCC B", dueDate: "2026-12-01", outstandingAmount: "3000000" }, // 61-90
    ];
    const out = groupPayablesBySupplierAndBucket(rows, today);

    const s1Overdue = out.rows.find((r) => r.supplierId === "s1" && r.bucket === "OVERDUE");
    expect(s1Overdue).toMatchObject({ amount: 1_500_000, invoiceCount: 2 });

    const s1Due30 = out.rows.find((r) => r.supplierId === "s1" && r.bucket === "0-30");
    expect(s1Due30).toMatchObject({ amount: 2_000_000, invoiceCount: 1 });

    expect(out.totalBySupplier).toEqual([
      { supplierId: "s1", supplierName: "NCC A", total: 3_500_000, invoiceCount: 3 },
      { supplierId: "s2", supplierName: "NCC B", total: 3_000_000, invoiceCount: 1 },
    ]);
    expect(out.totalByBucket.OVERDUE).toBe(1_500_000);
    expect(out.totalByBucket["0-30"]).toBe(2_000_000);
    expect(out.totalByBucket["61-90"]).toBe(3_000_000);
    expect(out.dueSoonAmount).toBe(3_500_000); // OVERDUE + 0-30
    expect(out.grandTotal).toBe(6_500_000);
  });

  it("dư nợ 0 hoặc âm (sai số làm tròn) → bỏ qua, không cộng vào tổng", () => {
    const rows: PayableRawRow[] = [
      { supplierId: "s1", supplierName: "NCC A", dueDate: "2026-09-01", outstandingAmount: "0" },
      { supplierId: "s1", supplierName: "NCC A", dueDate: "2026-09-01", outstandingAmount: "-5" },
    ];
    const out = groupPayablesBySupplierAndBucket(rows, today);
    expect(out.rows).toEqual([]);
    expect(out.grandTotal).toBe(0);
  });

  it("mảng rỗng → tổng 0, danh sách rỗng", () => {
    const out = groupPayablesBySupplierAndBucket([], today);
    expect(out.rows).toEqual([]);
    expect(out.totalBySupplier).toEqual([]);
    expect(out.dueSoonAmount).toBe(0);
    expect(out.grandTotal).toBe(0);
  });
});
