import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyShort,
  formatPercent,
  formatQty,
  formatRelative,
  toLocalDateInput,
} from "./format";
import { formatVndFull } from "./finance";

// V4.1 UI-13..16 (Đợt 6B).

describe("formatMoney", () => {
  it("đủ số, dấu chấm nghìn, ký hiệu ₫", () => {
    expect(formatMoney(1234567)).toBe("1.234.567 ₫");
    expect(formatMoney("12500000.40")).toBe("12.500.000 ₫");
    expect(formatMoney(0)).toBe("0 ₫");
  });
  it("âm dùng dấu trừ thật, không in −0", () => {
    expect(formatMoney(-1500)).toBe("−1.500 ₫");
    expect(formatMoney(-0.4)).toBe("0 ₫");
  });
  it("thiếu giá trị → 0 ₫ (giữ hành vi bảng tiền cũ), tuỳ chọn empty", () => {
    expect(formatMoney(null)).toBe("0 ₫");
    expect(formatMoney("")).toBe("0 ₫");
    expect(formatMoney("abc")).toBe("0 ₫");
    expect(formatMoney(undefined, { empty: "—" })).toBe("—");
  });
  it("unit none + sign", () => {
    expect(formatMoney(2500, { unit: "none" })).toBe("2.500");
    expect(formatMoney(2500, { sign: true })).toBe("+2.500 ₫");
    expect(formatMoney(null, { unit: "none" })).toBe("0");
  });
  it("Tài chính formatVndFull cho kết quả y hệt trước khi gộp", () => {
    const legacy = (n: number | string | null | undefined) => {
      const v = typeof n === "string" ? Number(n) : (n ?? 0);
      if (!Number.isFinite(v)) return "0 ₫";
      const rounded = Math.round(v);
      const abs = Math.abs(rounded).toLocaleString("vi-VN");
      return `${rounded < 0 ? "−" : ""}${abs} ₫`;
    };
    const samples: Array<number | string | null | undefined> = [
      0, 1, 999, 1000, 1234567.5, -42, -1234567, "3000000", "", null, undefined, "x",
    ];
    for (const v of samples) expect(formatVndFull(v)).toBe(legacy(v));
  });
});

describe("formatMoneyShort", () => {
  it("dấu phẩy thập phân", () => {
    expect(formatMoneyShort(1_500_000)).toBe("1,5 tr ₫");
    expect(formatMoneyShort(2_300_000_000)).toBe("2,3 tỷ ₫");
    expect(formatMoneyShort(950)).toBe("950 ₫");
    expect(formatMoneyShort(null)).toBe("0 ₫");
  });
});

describe("formatQty", () => {
  it("bỏ số 0 thừa, ĐVT viết hoa", () => {
    expect(formatQty(1000, "pcs")).toBe("1.000 PCS");
    expect(formatQty("2.5000", "Set")).toBe("2,5 SET");
    expect(formatQty("12.0000")).toBe("12");
    expect(formatQty(0.12345)).toBe("0,1235");
    expect(formatQty(null, "PCS")).toBe("—");
    expect(formatQty(3, "")).toBe("3");
  });
});

describe("formatPercent", () => {
  it("tỉ lệ và phần trăm sẵn", () => {
    expect(formatPercent(0.125)).toBe("12,5%");
    expect(formatPercent(80, { ratio: false })).toBe("80%");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("formatDate / formatDateTime — giờ Việt Nam", () => {
  it("UTC 03:52 → 10:52 giờ VN (lỗi Nhật ký cũ)", () => {
    expect(formatDateTime("2026-09-27T03:52:19Z")).toBe("27/09/2026 10:52");
    expect(formatDateTime("2026-09-27T03:52:19Z", { seconds: true })).toBe("27/09/2026 10:52:19");
  });
  it("mép nửa đêm UTC: 17:00Z đã sang ngày hôm sau ở VN", () => {
    expect(formatDate("2026-09-26T17:00:00Z")).toBe("27/09/2026");
    expect(formatDate("2026-09-26T16:59:59Z")).toBe("26/09/2026");
    expect(formatDate("2026-12-31T17:30:00Z")).toBe("01/01/2027");
    expect(formatDate("2026-09-27T00:00:00Z", "dd/MM/yyyy HH:mm")).toBe("27/09/2026 07:00");
  });
  it("chuỗi ngày thuần YYYY-MM-DD giữ nguyên ngày", () => {
    expect(formatDate("2026-09-27")).toBe("27/09/2026");
    expect(formatDate("2026-01-01", "dd/MM/yyyy HH:mm")).toBe("01/01/2026 00:00");
  });
  it("các pattern", () => {
    const iso = "2026-09-27T03:05:09Z";
    expect(formatDate(iso, "HH:mm")).toBe("10:05");
    expect(formatDate(iso, "dd/MM HH:mm")).toBe("27/09 10:05");
    expect(formatDate(iso, "dd/MM")).toBe("27/09");
    expect(formatDate(iso, "yyyy-MM-dd")).toBe("2026-09-27");
  });
  it("giá trị hỏng → —", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not a date")).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });
  it("toLocalDateInput theo ngày VN (trước 7h sáng không lùi ngày)", () => {
    expect(toLocalDateInput(new Date("2026-09-26T18:00:00Z"))).toBe("2026-09-27");
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-09-27T10:00:00Z");
  it("phút / giờ / ngày / quá 7 ngày ra ngày", () => {
    expect(formatRelative("2026-09-27T09:59:40Z", { now })).toBe("vừa xong");
    expect(formatRelative("2026-09-27T09:55:00Z", { now })).toBe("5 phút trước");
    expect(formatRelative("2026-09-27T07:00:00Z", { now })).toBe("3 giờ trước");
    expect(formatRelative("2026-09-25T10:00:00Z", { now })).toBe("2 ngày trước");
    expect(formatRelative("2026-09-01T10:00:00Z", { now })).toBe("01/09/2026");
    expect(formatRelative("2026-09-27T09:59:40Z", { now, justNow: "vài giây trước" })).toBe(
      "vài giây trước",
    );
  });
});
