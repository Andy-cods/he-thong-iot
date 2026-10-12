import { describe, expect, it } from "vitest";
import {
  poCancelCloseSchema,
  poCreateSchema,
  poListQuerySchema,
  poPriceUpdateSchema,
  poUpdateSchema,
  prCreateSchema,
  prListQuerySchema,
  prTodayVN,
  prUpdateSchema,
  PR_MAX_LINES,
} from "./procurement";

const uuidA = "00000000-0000-4000-8000-000000000001";
const uuidB = "00000000-0000-4000-8000-000000000002";

describe("TASK-6VIEC Việc 2 — prCreateSchema.saveAsDraft", () => {
  it("mặc định không có saveAsDraft (undefined) — giữ hành vi cũ (auto-submit)", () => {
    const parsed = prCreateSchema.parse({
      lines: [{ itemId: uuidA, qty: 1 }],
    });
    expect(parsed.saveAsDraft).toBeUndefined();
  });

  it("chấp nhận saveAsDraft: true — route sẽ giữ DRAFT, không auto-submit", () => {
    const parsed = prCreateSchema.parse({
      lines: [{ itemId: uuidA, qty: 1 }],
      saveAsDraft: true,
    });
    expect(parsed.saveAsDraft).toBe(true);
  });
});

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

describe("QA PR 12/10 — zod trần + thông báo tiếng Việt (L9/L10/L12/L19)", () => {
  const msgs = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
    r.success ? [] : (r.error?.issues.map((i) => i.message) ?? []);
  const base = { lines: [{ itemId: uuidA, qty: 1 }] };

  it("đơn giá >= 1e16 bị chặn 422 (trước đây 500 tràn NUMERIC)", () => {
    const r = prCreateSchema.safeParse({ lines: [{ itemId: uuidA, qty: 1, estimatedUnitPrice: 1e16 }] });
    expect(r.success).toBe(false);
    expect(msgs(r).join(" ")).toContain("Đơn giá quá lớn");
  });

  it("tồn kho snapshot 1e15 bị chặn", () => {
    const r = prCreateSchema.safeParse({ lines: [{ itemId: uuidA, qty: 1, onHandSnapshot: 1e15 }] });
    expect(r.success).toBe(false);
    expect(msgs(r).join(" ")).toContain("Tồn kho quá lớn");
  });

  it("SL × đơn giá tràn NUMERIC(18,2) bị chặn dù từng số hợp lệ", () => {
    const r = prCreateSchema.safeParse({
      lines: [{ itemId: uuidA, qty: 9_000_000, estimatedUnitPrice: 9e12 }],
    });
    expect(r.success).toBe(false);
    expect(msgs(r).join(" ")).toContain("Thành tiền");
  });

  it("giá trị lớn nhưng hợp lệ vẫn qua", () => {
    const r = prCreateSchema.safeParse({
      lines: [{ itemId: uuidA, qty: 100, estimatedUnitPrice: 5_000_000_000 }],
    });
    expect(r.success).toBe(true);
  });

  it("dòng thiếu vật tư → thông báo rõ", () => {
    const r = prCreateSchema.safeParse({ lines: [{ qty: 5 }] });
    expect(r.success).toBe(false);
    expect(msgs(r).join(" ")).toContain("chưa chọn vật tư");
  });

  it("tối đa 20 dòng (khớp UI) ở cả create lẫn update", () => {
    const lines = Array.from({ length: PR_MAX_LINES + 1 }, () => ({ itemId: uuidA, qty: 1 }));
    expect(prCreateSchema.safeParse({ lines }).success).toBe(false);
    expect(prUpdateSchema.safeParse({ lines }).success).toBe(false);
    expect(prCreateSchema.safeParse({ lines: lines.slice(0, PR_MAX_LINES) }).success).toBe(true);
  });

  it("ngày cần quá khứ bị chặn, hôm nay và tương lai được", () => {
    const today = prTodayVN();
    const d = new Date(`${today}T00:00:00Z`);
    const yesterday = new Date(d.getTime() - 86_400_000).toISOString().slice(0, 10);
    const tomorrow = new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10);
    const mk = (neededBy: string) =>
      prCreateSchema.safeParse({ lines: [{ itemId: uuidA, qty: 1, neededBy }] });
    expect(mk(yesterday).success).toBe(false);
    expect(msgs(mk(yesterday)).join(" ")).toContain("quá khứ");
    expect(mk(today).success).toBe(true);
    expect(mk(tomorrow).success).toBe(true);
  });

  it("thông báo lỗi chuẩn là tiếng Việt, có tên trường", () => {
    const r = prCreateSchema.safeParse({ ...base, title: "x".repeat(300) });
    expect(msgs(r)).toEqual(["Tiêu đề tối đa 255 ký tự."]);
    const r2 = prCreateSchema.safeParse({ lines: [{ itemId: uuidA, qty: 1, estimatedUnitPrice: -5 }] });
    expect(msgs(r2)).toEqual(["Đơn giá không được âm."]);
    const r3 = prCreateSchema.safeParse({ lines: [{ itemId: uuidA, qty: 1, priority: "HOT" }] });
    expect(msgs(r3)).toEqual(["Mức ưu tiên không hợp lệ."]);
    const r4 = prCreateSchema.safeParse({ lines: [] });
    expect(msgs(r4)).toEqual(["Phiếu cần ít nhất 1 dòng."]);
  });

  it("lọc danh sách: from > to bị từ chối, from <= to ổn", () => {
    expect(prListQuerySchema.safeParse({ from: "2026-10-10", to: "2026-10-01" }).success).toBe(false);
    expect(prListQuerySchema.safeParse({ from: "2026-10-01", to: "2026-10-10" }).success).toBe(true);
    expect(prListQuerySchema.safeParse({ from: "2026-10-01" }).success).toBe(true);
  });
});
