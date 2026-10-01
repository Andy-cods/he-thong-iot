import { describe, expect, it } from "vitest";
import {
  computeBoardValueSummary,
  computeExpectedPayable,
  type BoardValueRow,
} from "./finance-overview-policy";

/**
 * V4.4.2 — Việc 2: vitest cho 3 công thức THUẦN của Tổng quan Tài chính
 * ("Đang sản xuất", "Dự trù thu", "Dự trù chi").
 */

describe("computeBoardValueSummary — Đang sản xuất / Dự trù thu", () => {
  it("Đang sản xuất = Σ(qty_planned × unit_price) các mã QUEUED/IN_PROGRESS/QC", () => {
    const rows: BoardValueRow[] = [
      { status: "QUEUED", qtyPlanned: "10", qtyDone: "0", unitPrice: "1000" },
      { status: "IN_PROGRESS", qtyPlanned: "5", qtyDone: "2", unitPrice: "2000" },
      { status: "QC", qtyPlanned: "3", qtyDone: "3", unitPrice: "500" },
    ];
    const out = computeBoardValueSummary(rows);
    // 10*1000 + 5*2000 + 3*500 = 10000 + 10000 + 1500 = 21500
    expect(out.inProduction).toEqual({ value: 21500, itemCount: 3 });
    expect(out.missingPriceCount).toBe(0);
  });

  it("Dự trù thu = Σ(qty_done × unit_price) các mã COMPLETED (hoàn thành, chưa giao)", () => {
    const rows: BoardValueRow[] = [
      { status: "COMPLETED", qtyPlanned: "10", qtyDone: "10", unitPrice: "3000" },
      { status: "COMPLETED", qtyPlanned: "4", qtyDone: "4", unitPrice: "1500" },
    ];
    const out = computeBoardValueSummary(rows);
    // 10*3000 + 4*1500 = 30000 + 6000 = 36000
    expect(out.expectedReceivable).toEqual({ value: 36000, itemCount: 2 });
  });

  it("DELIVERED không tính vào bên nào (đã giao — ra khỏi phạm vi dự trù)", () => {
    const rows: BoardValueRow[] = [
      { status: "DELIVERED", qtyPlanned: "10", qtyDone: "10", unitPrice: "9999" },
    ];
    const out = computeBoardValueSummary(rows);
    expect(out.inProduction).toEqual({ value: 0, itemCount: 0 });
    expect(out.expectedReceivable).toEqual({ value: 0, itemCount: 0 });
    expect(out.missingPriceCount).toBe(0);
  });

  it("unit_price NULL → giá trị tính 0 (không thổi phồng) nhưng đếm vào missingPriceCount", () => {
    const rows: BoardValueRow[] = [
      { status: "IN_PROGRESS", qtyPlanned: "10", qtyDone: "0", unitPrice: null },
      { status: "COMPLETED", qtyPlanned: "5", qtyDone: "5", unitPrice: null },
      { status: "QC", qtyPlanned: "2", qtyDone: "1", unitPrice: "100" },
    ];
    const out = computeBoardValueSummary(rows);
    expect(out.inProduction).toEqual({ value: 200, itemCount: 2 }); // chỉ mã QC có giá: 2*100
    expect(out.expectedReceivable).toEqual({ value: 0, itemCount: 1 });
    expect(out.missingPriceCount).toBe(2);
  });

  it("mảng rỗng → tất cả về 0", () => {
    const out = computeBoardValueSummary([]);
    expect(out).toEqual({
      inProduction: { value: 0, itemCount: 0 },
      expectedReceivable: { value: 0, itemCount: 0 },
      missingPriceCount: 0,
    });
  });
});

describe("computeExpectedPayable — Dự trù chi", () => {
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
