import { describe, expect, it } from "vitest";
import { finInvoiceCreateSchema } from "./finance";

/**
 * V4.5 QA-D P2-01 — hoá đơn tổng 0 ₫ tự động ghi "Đã trả" ngay khi tạo,
 * không cảnh báo gì (dễ do quên điền số tiền). Zod bắt xác nhận rõ ràng
 * qua cờ `confirmZeroAmount` thay vì âm thầm cho qua.
 */
function base(over: Partial<Record<string, unknown>> = {}) {
  return {
    invoiceNo: "HD-001",
    direction: "IN" as const,
    issueDate: "2026-10-01",
    subtotalAmount: 1000,
    vatAmount: 80,
    totalAmount: 1080,
    ...over,
  };
}

describe("finInvoiceCreateSchema — tổng tiền khớp subtotal+VAT", () => {
  it("hợp lệ bình thường (khác 0) → parse OK", () => {
    const r = finInvoiceCreateSchema.safeParse(base());
    expect(r.success).toBe(true);
  });

  it("tổng không khớp subtotal+VAT → lỗi ở totalAmount", () => {
    const r = finInvoiceCreateSchema.safeParse(
      base({ subtotalAmount: 1000, vatAmount: 80, totalAmount: 2000 }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "totalAmount")).toBe(true);
    }
  });
});

describe("finInvoiceCreateSchema — V4.5 QA-D P2-01 HĐ 0 ₫ cần xác nhận", () => {
  it("tổng = 0, KHÔNG gửi confirmZeroAmount → lỗi ở confirmZeroAmount", () => {
    const r = finInvoiceCreateSchema.safeParse(
      base({ subtotalAmount: 0, vatAmount: 0, totalAmount: 0 }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.join(".") === "confirmZeroAmount");
      expect(issue).toBeDefined();
      expect(issue?.message).toMatch(/Đã trả/);
    }
  });

  it("tổng = 0, confirmZeroAmount=false tường minh → vẫn lỗi", () => {
    const r = finInvoiceCreateSchema.safeParse(
      base({ subtotalAmount: 0, vatAmount: 0, totalAmount: 0, confirmZeroAmount: false }),
    );
    expect(r.success).toBe(false);
  });

  it("tổng = 0, confirmZeroAmount=true → parse OK (vẫn cho tạo, đã xác nhận)", () => {
    const r = finInvoiceCreateSchema.safeParse(
      base({ subtotalAmount: 0, vatAmount: 0, totalAmount: 0, confirmZeroAmount: true }),
    );
    expect(r.success).toBe(true);
  });

  it("tổng > 0 → KHÔNG cần confirmZeroAmount (mặc định false vẫn OK)", () => {
    const r = finInvoiceCreateSchema.safeParse(base());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.confirmZeroAmount).toBe(false);
  });

  it("thiếu CẢ 2: tổng=0 không xác nhận VÀ tổng không khớp subtotal+VAT → báo cả 2 lỗi", () => {
    const r = finInvoiceCreateSchema.safeParse(
      base({ subtotalAmount: 100, vatAmount: 0, totalAmount: 0 }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("totalAmount");
      expect(paths).toContain("confirmZeroAmount");
    }
  });
});
