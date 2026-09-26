import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  balanceAfter,
  buildTransferLegs,
  contentDispositionAttachment,
  evaluateSpend,
  formatVndFull,
  isoDateVN,
  vnToday,
} from "./finance";

describe("V4.1 Đợt 3 — formatVndFull (tiền đủ số)", () => {
  it("không rút gọn, ngăn cách nghìn kiểu Việt", () => {
    expect(formatVndFull(12_500_000)).toBe("12.500.000 ₫");
    expect(formatVndFull("1500000.00")).toBe("1.500.000 ₫");
    expect(formatVndFull(0)).toBe("0 ₫");
  });
  it("số âm giữ dấu trừ", () => {
    expect(formatVndFull(-250_000)).toBe("−250.000 ₫");
  });
});

describe("V4.1 Q7 — số dư sau phiếu", () => {
  it("thu cộng, chi trừ (nhận chuỗi numeric)", () => {
    expect(balanceAfter("12500000.00", "IN", 500_000)).toBe(13_000_000);
    expect(balanceAfter(12_500_000, "OUT", 13_000_000)).toBe(-500_000);
  });
});

describe("V4.1 Q7 — evaluateSpend (chặn chi vượt số dư)", () => {
  it("đủ số dư → ok + số dư sau", () => {
    const r = evaluateSpend({ accountName: "Quỹ tiền mặt", balance: "1000000", amount: 1_000_000 });
    expect(r).toEqual({ ok: true, balanceAfter: 0 });
  });
  it("vượt số dư → FIN_INSUFFICIENT_BALANCE, câu tiếng Việt có số dư đủ số", () => {
    const r = evaluateSpend({ accountName: "Quỹ tiền mặt", balance: 1_000_000, amount: 1_000_001 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("FIN_INSUFFICIENT_BALANCE");
      expect(r.message).toBe('Nguồn chi "Quỹ tiền mặt" chỉ còn 1.000.000 ₫.');
      expect(r.balanceAfter).toBe(-1);
    }
  });
  it("admin cho phép vượt → ok, số dư sau âm", () => {
    const r = evaluateSpend({ accountName: "TK chi tiêu", balance: 0, amount: 200_000, allowOverdraft: true });
    expect(r).toEqual({ ok: true, balanceAfter: -200_000 });
  });
  it("nguồn đã ngưng → luôn chặn, kể cả admin", () => {
    const r = evaluateSpend({
      accountName: "Quỹ cũ",
      balance: 9_000_000,
      amount: 1,
      isActive: false,
      allowOverdraft: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FIN_ACCOUNT_INACTIVE");
  });
  it("sai số làm tròn ≤ 0,5 ₫ không chặn", () => {
    expect(evaluateSpend({ accountName: "A", balance: "100.00", amount: 100.4 }).ok).toBe(true);
  });
});

describe("V4.1 Q7 — buildTransferLegs (cặp chân chuyển quỹ)", () => {
  const input = {
    fromAccountId: "acc-cash",
    toAccountId: "acc-exp",
    fromAccountName: "Quỹ tiền mặt",
    toAccountName: "TK chi tiêu",
    amount: 3_000_000,
    transactionDate: "2026-09-27",
    description: "Nạp quỹ tuần 40",
  };
  it("đúng 1 OUT ở nguồn đi + 1 IN ở nguồn nhận, cùng nhóm, cùng số tiền", () => {
    const [out, inn] = buildTransferLegs(input, "CQ-2609-0001", "grp-1");
    expect(out.direction).toBe("OUT");
    expect(out.accountId).toBe("acc-cash");
    expect(inn.direction).toBe("IN");
    expect(inn.accountId).toBe("acc-exp");
    expect(out.amount).toBe(inn.amount);
    expect(out.transferGroupId).toBe("grp-1");
    expect(inn.transferGroupId).toBe("grp-1");
    expect(out.code).toBe("CQ-2609-0001");
    expect(inn.code).toBe("CQ-2609-0001-N");
    expect(out.description).toBe("Chuyển quỹ: Quỹ tiền mặt → TK chi tiêu — Nạp quỹ tuần 40");
    // Tổng 2 chân = 0 → tổng tài sản công ty không đổi.
    expect(balanceAfter(balanceAfter(0, out.direction, 3_000_000), inn.direction, 3_000_000)).toBe(0);
  });
  it("chân IN không lọt regex seq của genDocNo (^CQ-YYMM-[0-9]+$)", () => {
    const [, inn] = buildTransferLegs(input, "CQ-2609-0007", "g");
    expect(/^CQ-2609-[0-9]+$/.test(inn.code)).toBe(false);
  });
  it("cùng nguồn → lỗi", () => {
    expect(() => buildTransferLegs({ ...input, toAccountId: "acc-cash" }, "CQ-2609-0001", "g")).toThrow(
      "FIN_TRANSFER_SAME_ACCOUNT",
    );
  });
});

describe("V4.1 TC-13 — ngày theo giờ Việt Nam", () => {
  it("06:30 sáng VN (23:30 UTC hôm trước) vẫn là ngày VN", () => {
    expect(isoDateVN(new Date("2026-09-26T23:30:00Z"))).toBe("2026-09-27");
  });
  it("Date từ chuỗi 'YYYY-MM-DD' (nửa đêm UTC) giữ nguyên ngày", () => {
    expect(isoDateVN(new Date("2026-09-27"))).toBe("2026-09-27");
  });
  it("vnToday + addDaysIso", () => {
    expect(vnToday(new Date("2026-09-30T18:00:00Z"))).toBe("2026-10-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("V4.1 TC-26 — Content-Disposition tên tiếng Việt", () => {
  it("chỉ ASCII trong filename= + bản UTF-8 ở filename*", () => {
    const h = contentDispositionAttachment("Sổ thu chi tháng 9-errors.xlsx");
    expect(h).toContain('filename="So thu chi thang 9-errors.xlsx"');
    expect(h).toContain("filename*=UTF-8''S%E1%BB%95%20thu%20chi");
    expect(/^[\x20-\x7e]*$/.test(h)).toBe(true);
  });
});
