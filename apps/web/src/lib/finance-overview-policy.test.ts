import { describe, expect, it } from "vitest";
import {
  ABNORMAL_LINE_VALUE_THRESHOLD,
  classifyPayableDueBucket,
  computeBoardValueSummary,
  computeOrderValueSummary,
  computeExpectedPayable,
  computeExpectedPayableTotal,
  computeExpectedReceivableTotal,
  groupReceivablesByCustomerAndBucket,
  isDueWithinHorizon,
  parseHorizon,
  sumBucketsWithinHorizon,
  sumPlannedWithinHorizon,
  groupPayablesBySupplierAndBucket,
  type BoardValueRow,
  type OrderValueRow,
  type PayableRawRow,
} from "./finance-overview-policy";

/**
 * TASK-20261001 — vitest cho công thức THUẦN của Tổng quan Tài chính
 * ("Dự trù thu" gộp, "Dự trù chi" phần (a) công nợ sắp đến hạn + phần (b)).
 */

describe("computeOrderValueSummary — Dự trù thu từ ĐƠN HÀNG BÁN (V4.7)", () => {
  it("Σ(order_qty × unit_price) các đơn CONFIRMED/SNAPSHOTTED/IN_PROGRESS", () => {
    const rows: OrderValueRow[] = [
      { status: "CONFIRMED", orderQty: "5", unitPrice: "2000" },
      { status: "SNAPSHOTTED", orderQty: "3", unitPrice: "1000" },
      { status: "IN_PROGRESS", orderQty: "2", unitPrice: "500" },
    ];
    const out = computeOrderValueSummary(rows);
    expect(out.expectedReceivable).toEqual({ value: 10000 + 3000 + 1000, itemCount: 3 });
    expect(out.missingPriceCount).toBe(0);
  });

  it("DRAFT/FULFILLED/CLOSED/CANCELLED KHÔNG tính (chưa chắc / đã giao → thành công nợ)", () => {
    const rows: OrderValueRow[] = [
      { status: "DRAFT", orderQty: "10", unitPrice: "9999" },
      { status: "FULFILLED", orderQty: "10", unitPrice: "9999" },
      { status: "CLOSED", orderQty: "10", unitPrice: "9999" },
      { status: "CANCELLED", orderQty: "10", unitPrice: "9999" },
    ];
    const out = computeOrderValueSummary(rows);
    expect(out.expectedReceivable).toEqual({ value: 0, itemCount: 0 });
  });

  it("unit_price NULL → giá trị 0 nhưng đếm vào missingPriceCount", () => {
    const rows: OrderValueRow[] = [
      { status: "CONFIRMED", orderQty: "10", unitPrice: null },
      { status: "IN_PROGRESS", orderQty: "4", unitPrice: "250" },
    ];
    const out = computeOrderValueSummary(rows);
    expect(out.expectedReceivable).toEqual({ value: 1000, itemCount: 2 });
    expect(out.missingPriceCount).toBe(1);
  });

  it("dòng giá trị vượt ngưỡng bất thường bị loại khỏi tổng, đếm riêng", () => {
    const rows: OrderValueRow[] = [
      { status: "CONFIRMED", orderQty: "1", unitPrice: String(ABNORMAL_LINE_VALUE_THRESHOLD + 1) },
      { status: "CONFIRMED", orderQty: "2", unitPrice: "1000" },
    ];
    const out = computeOrderValueSummary(rows);
    expect(out.expectedReceivable).toEqual({ value: 2000, itemCount: 1 });
    expect(out.abnormalCount).toBe(1);
  });

  it("mảng rỗng → tất cả 0", () => {
    expect(computeOrderValueSummary([])).toEqual({
      expectedReceivable: { value: 0, itemCount: 0 },
      missingPriceCount: 0,
      abnormalCount: 0,
    });
  });
});

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

describe("parseHorizon — kỳ dự trù chung", () => {
  it("chỉ nhận 30/45/60/90, còn lại về 30", () => {
    expect(parseHorizon("45")).toBe(45);
    expect(parseHorizon("90")).toBe(90);
    expect(parseHorizon(60)).toBe(60);
    expect(parseHorizon("7")).toBe(30);
    expect(parseHorizon("abc")).toBe(30);
    expect(parseHorizon(null)).toBe(30);
    expect(parseHorizon(undefined)).toBe(30);
  });
});

describe("isDueWithinHorizon — biên đúng N ngày", () => {
  const today = "2026-10-12";
  it("đúng ngày thứ N thì tính, N+1 thì không; quá hạn luôn tính; không hạn tính", () => {
    expect(isDueWithinHorizon("2026-11-11", today, 30)).toBe(true); // +30
    expect(isDueWithinHorizon("2026-11-12", today, 30)).toBe(false); // +31
    expect(isDueWithinHorizon("2026-11-26", today, 45)).toBe(true); // +45
    expect(isDueWithinHorizon("2026-11-27", today, 45)).toBe(false); // +46
    expect(isDueWithinHorizon("2026-09-01", today, 30)).toBe(true); // quá hạn
    expect(isDueWithinHorizon(null, today, 30)).toBe(true);
  });
});

describe("groupReceivablesByCustomerAndBucket — bucket phải thu", () => {
  const today = "2026-10-12";
  it("nhóm khách × mốc, bỏ dư nợ 0, tổng đúng", () => {
    const out = groupReceivablesByCustomerAndBucket(
      [
        { customerId: "a", customerName: "Khách A", dueDate: "2026-10-01", outstandingAmount: 100 }, // quá hạn
        { customerId: "a", customerName: "Khách A", dueDate: "2026-10-20", outstandingAmount: "50" }, // 0-30
        { customerId: "a", customerName: "Khách A", dueDate: "2026-11-26", outstandingAmount: 70 }, // 31-45 (+45)
        { customerId: null, customerName: "Khách lẻ", dueDate: "2027-03-01", outstandingAmount: 900 }, // 90+
        { customerId: "b", customerName: "Khách B", dueDate: "2026-10-05", outstandingAmount: 0 }, // bỏ
      ],
      today,
    );
    expect(out.totalByBucket.OVERDUE).toBe(100);
    expect(out.totalByBucket["0-30"]).toBe(50);
    expect(out.totalByBucket["31-45"]).toBe(70);
    expect(out.totalByBucket["90+"]).toBe(900);
    expect(out.grandTotal).toBe(1120);
    expect(out.totalByCustomer[0]).toMatchObject({ customerName: "Khách lẻ", total: 900 });
    expect(out.totalByCustomer.find((c) => c.customerId === "a")?.total).toBe(220);
    expect(out.totalByCustomer.some((c) => c.customerId === "b")).toBe(false);
  });
});

describe("sumBucketsWithinHorizon — lọc theo kỳ", () => {
  const total = { OVERDUE: 1, "0-30": 2, "31-45": 4, "46-60": 8, "61-90": 16, "90+": 32 };
  it("cộng dồn đúng theo kỳ", () => {
    expect(sumBucketsWithinHorizon(total, 30)).toBe(3);
    expect(sumBucketsWithinHorizon(total, 45)).toBe(7);
    expect(sumBucketsWithinHorizon(total, 60)).toBe(15);
    expect(sumBucketsWithinHorizon(total, 90)).toBe(31);
  });
  it("khớp với lọc theo ngày ở biên N", () => {
    const today = "2026-10-12";
    const dues = [
      { dueDate: "2026-11-11", v: 5 }, // +30
      { dueDate: "2026-11-12", v: 7 }, // +31
      { dueDate: "2026-11-26", v: 11 }, // +45
      { dueDate: "2026-11-27", v: 13 }, // +46
    ];
    const g = groupReceivablesByCustomerAndBucket(
      dues.map((d) => ({ customerId: "x", customerName: "X", dueDate: d.dueDate, outstandingAmount: d.v })),
      today,
    );
    expect(sumBucketsWithinHorizon(g.totalByBucket, 30)).toBe(5);
    expect(sumBucketsWithinHorizon(g.totalByBucket, 45)).toBe(5 + 7 + 11);
  });
});

describe("sumPlannedWithinHorizon — khoản dự kiến OPEN theo kỳ", () => {
  const today = "2026-10-12";
  const items = [
    { amount: "1000", dueDate: "2026-10-01" }, // quá hạn → tính
    { amount: 2000, dueDate: "2026-11-11" }, // +30 → tính ở 30
    { amount: 4000, dueDate: "2026-11-12" }, // +31 → chỉ từ 45
    { amount: 8000, dueDate: "2027-02-01" }, // > 90
  ];
  it("kỳ 30: quá hạn + đến +30", () => {
    expect(sumPlannedWithinHorizon(items, today, 30)).toEqual({ value: 3000, count: 2 });
  });
  it("kỳ 45 gồm thêm +31; kỳ 90 vẫn loại khoản > 90 ngày", () => {
    expect(sumPlannedWithinHorizon(items, today, 45)).toEqual({ value: 7000, count: 3 });
    expect(sumPlannedWithinHorizon(items, today, 90)).toEqual({ value: 7000, count: 3 });
  });
});

describe("tổng thẻ Dự trù thu / Dự trù chi", () => {
  const today = "2026-10-12";
  it("Dự trù thu = Bảng SX + phải thu trong kỳ + thu dự kiến trong kỳ", () => {
    const receivables = groupReceivablesByCustomerAndBucket(
      [
        { customerId: "a", customerName: "A", dueDate: "2026-10-01", outstandingAmount: 100 },
        { customerId: "a", customerName: "A", dueDate: "2026-11-20", outstandingAmount: 40 }, // +39
        { customerId: "a", customerName: "A", dueDate: "2027-01-30", outstandingAmount: 999 }, // ngoài 90
      ],
      today,
    );
    const plannedIncomes = [
      { amount: 10, dueDate: "2026-10-05" },
      { amount: 20, dueDate: "2027-05-05" },
    ];
    const at30 = computeExpectedReceivableTotal({ orderValue: 1000, receivables, plannedIncomes, today, horizon: 30 });
    expect(at30).toMatchObject({ orderValue: 1000, receivableDue: 100, plannedIncomeValue: 10, plannedIncomeCount: 1, value: 1110 });
    const at45 = computeExpectedReceivableTotal({ orderValue: 1000, receivables, plannedIncomes, today, horizon: 45 });
    expect(at45.value).toBe(1150);
  });

  it("Dự trù chi giữ nguyên PO chưa HĐ khi đổi kỳ", () => {
    const payables = groupPayablesBySupplierAndBucket(
      [
        { supplierId: "s", supplierName: "S", dueDate: "2026-10-20", outstandingAmount: 300 },
        { supplierId: "s", supplierName: "S", dueDate: "2026-12-01", outstandingAmount: 500 }, // +50
      ],
      today,
    );
    const plannedExpenses = [{ amount: 50, dueDate: "2026-10-30" }];
    const a = computeExpectedPayableTotal({ payables, poDraftValue: 700, plannedExpenses, today, horizon: 30 });
    expect(a).toMatchObject({ payableDue: 300, poDraftValue: 700, plannedExpenseValue: 50, value: 1050 });
    const b = computeExpectedPayableTotal({ payables, poDraftValue: 700, plannedExpenses, today, horizon: 60 });
    expect(b).toMatchObject({ payableDue: 800, poDraftValue: 700, value: 1550 });
  });
});
