import { describe, expect, it } from "vitest";
import {
  poCancelCloseSchema,
  poCreateSchema,
  poListQuerySchema,
  poPriceUpdateSchema,
  poUpdateSchema,
} from "./procurement";

const uuidA = "00000000-0000-4000-8000-000000000001";
const uuidB = "00000000-0000-4000-8000-000000000002";

describe("PO schemas", () => {
  it("defaults to a plain draft", () => {
    const parsed = poCreateSchema.parse({
      supplierId: uuidA,
      lines: [{ itemId: uuidB, orderedQty: 1 }],
    });

    expect(parsed.autoApprove).toBe(false);
    expect(parsed.submitForApproval).toBe(false);
  });

  it("accepts atomic submit-for-approval on create", () => {
    const parsed = poCreateSchema.parse({
      supplierId: uuidA,
      submitForApproval: true,
      lines: [{ itemId: uuidB, orderedQty: 2 }],
    });

    expect(parsed.submitForApproval).toBe(true);
  });

  it("rejects status through the generic update schema", () => {
    expect(() =>
      poUpdateSchema.parse({
        notes: "unsafe update",
        status: "SENT",
      }),
    ).toThrow();
  });
});

describe("V4.1 Đợt 2 — schema Thu mua", () => {
  it("TM-03/04: sửa PO giữ quy cách + VAT 0 không bị đổi thành 8", () => {
    const parsed = poUpdateSchema.parse({
      lines: [{ itemId: uuidB, orderedQty: 2, taxRate: 0, spec: "D6x50", snapshotLineId: uuidA }],
    });
    expect(parsed.lines?.[0]?.taxRate).toBe(0);
    expect(parsed.lines?.[0]?.spec).toBe("D6x50");
    expect(parsed.lines?.[0]?.snapshotLineId).toBe(uuidA);
  });

  it("lọc PO quá hạn: overdue=1|true → true, bỏ trống → false", () => {
    expect(poListQuerySchema.parse({ overdue: "1" }).overdue).toBe(true);
    expect(poListQuerySchema.parse({ overdue: "true" }).overdue).toBe(true);
    expect(poListQuerySchema.parse({}).overdue).toBe(false);
  });

  it("TM-17: huỷ/đóng PO bắt buộc lý do ≥ 3 ký tự", () => {
    expect(() => poCancelCloseSchema.parse({ reason: "ab" })).toThrow();
    expect(poCancelCloseSchema.parse({ reason: " NCC ngưng giao " }).reason).toBe("NCC ngưng giao");
  });
});

describe("V4.1 PO-UI — schema điều chỉnh giá PO", () => {
  it("nhận đơn giá 0 + VAT 0 (chuỗi được ép số)", () => {
    const parsed = poPriceUpdateSchema.parse({
      lines: [{ lineId: uuidA, unitPrice: "0", taxRate: "0" }],
    });
    expect(parsed.lines[0]).toEqual({ lineId: uuidA, unitPrice: 0, taxRate: 0 });
  });

  it("chặn đơn giá âm, lineId trùng, danh sách rỗng, trường lạ", () => {
    expect(() => poPriceUpdateSchema.parse({ lines: [{ lineId: uuidA, unitPrice: -1, taxRate: 8 }] })).toThrow();
    expect(() =>
      poPriceUpdateSchema.parse({
        lines: [
          { lineId: uuidA, unitPrice: 1, taxRate: 8 },
          { lineId: uuidA, unitPrice: 2, taxRate: 8 },
        ],
      }),
    ).toThrow();
    expect(() => poPriceUpdateSchema.parse({ lines: [] })).toThrow();
    expect(() =>
      poPriceUpdateSchema.parse({ lines: [{ lineId: uuidA, unitPrice: 1, taxRate: 8, orderedQty: 5 }] }),
    ).toThrow();
    expect(() => poPriceUpdateSchema.parse({ lines: [{ lineId: uuidB, unitPrice: 1, taxRate: 101 }] })).toThrow();
  });
});
