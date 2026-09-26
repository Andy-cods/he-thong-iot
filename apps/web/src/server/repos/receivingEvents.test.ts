/**
 * V4.1 Đợt 1a — vitest hàm thuần của nhận hàng: tách mã lô trùng (D5) +
 * hạ cấp QC OK khi người nhận không có quyền QC (KHO-01).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  RECEIVABLE_PO_STATUSES,
  nextSplitLotCode,
  resolveReceiveQc,
} from "./receivingEvents";

describe("nextSplitLotCode (D5)", () => {
  it("mã lô chưa có → giữ nguyên", () => {
    expect(nextSplitLotCode("LOT-A", [])).toBe("LOT-A");
    expect(nextSplitLotCode("LOT-A", ["LOT-A-2"])).toBe("LOT-A");
  });

  it("đã có mã gốc → -2", () => {
    expect(nextSplitLotCode("LOT-A", ["LOT-A"])).toBe("LOT-A-2");
  });

  it("đã có -2, -5 → -6 (lấy max + 1)", () => {
    expect(nextSplitLotCode("LOT-A", ["LOT-A", "LOT-A-2", "LOT-A-5"])).toBe("LOT-A-6");
  });

  it("bỏ qua hậu tố không phải số / mã khác tiền tố", () => {
    expect(
      nextSplitLotCode("LOT-A", ["LOT-A", "LOT-A-X", "LOT-A-2B", "LOT-AB-9"]),
    ).toBe("LOT-A-2");
  });

  it("ký tự đặc biệt regex trong mã lô được escape", () => {
    expect(nextSplitLotCode("L.1(a)+", ["L.1(a)+", "L.1(a)+-3", "LX1(a)+-9"])).toBe(
      "L.1(a)+-4",
    );
    expect(nextSplitLotCode("A*", ["A*", "AAAA-7"])).toBe("A*-2");
  });
});

describe("resolveReceiveQc (KHO-01)", () => {
  it("OK + có quyền QC → giữ OK", () => {
    expect(resolveReceiveQc("OK", true)).toEqual({ qc: "OK", downgraded: false });
  });

  it("OK + KHÔNG có quyền QC → hạ PENDING, downgraded", () => {
    expect(resolveReceiveQc("OK", false)).toEqual({ qc: "PENDING", downgraded: true });
  });

  it("NG luôn được (không cần quyền QC)", () => {
    expect(resolveReceiveQc("NG", false)).toEqual({ qc: "NG", downgraded: false });
  });

  it("PENDING / không gửi → PENDING", () => {
    expect(resolveReceiveQc("PENDING", true)).toEqual({ qc: "PENDING", downgraded: false });
    expect(resolveReceiveQc(undefined, false)).toEqual({ qc: "PENDING", downgraded: false });
  });
});

describe("RECEIVABLE_PO_STATUSES (KHO-08)", () => {
  it("chỉ SENT / PARTIAL / RECEIVED", () => {
    expect([...RECEIVABLE_PO_STATUSES]).toEqual(["SENT", "PARTIAL", "RECEIVED"]);
  });
});
