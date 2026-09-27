import { describe, expect, it } from "vitest";
import { buildPoSteps, derivePoFlags, parseVnNumber } from "./po-detail";

const noRecv = [{ receivedQty: "0" }];

describe("V4.1 PO-UI — quyền thao tác theo trạng thái", () => {
  it("Thu mua: PO đã nhận vẫn được điều chỉnh giá; Kho thì không", () => {
    const p = derivePoFlags({ status: "RECEIVED", roles: ["purchaser"], lines: [{ receivedQty: "5" }] });
    expect(p.priceLockReason).toBeNull();
    expect(p.canClose).toBe(true);
    expect(p.canCancel).toBe(false);
    const w = derivePoFlags({ status: "RECEIVED", roles: ["warehouse"], lines: noRecv });
    expect(w.priceLockReason).toMatch(/Thu mua/);
  });

  it("PO huỷ / HĐ đã ghi nợ khoá giá; HĐ nháp thì không", () => {
    expect(derivePoFlags({ status: "CANCELLED", roles: ["admin"], lines: noRecv }).priceLockReason).toMatch(/huỷ/);
    expect(
      derivePoFlags({ status: "CLOSED", roles: ["admin"], lines: noRecv, invoiceStatus: "UNPAID" }).priceLockReason,
    ).toMatch(/hoá đơn/);
    expect(
      derivePoFlags({ status: "CLOSED", roles: ["admin"], lines: noRecv, invoiceStatus: "DRAFT" }).priceLockReason,
    ).toBeNull();
  });

  it("luồng duyệt: gửi duyệt → admin duyệt → đánh dấu gửi", () => {
    expect(derivePoFlags({ status: "DRAFT", roles: ["planner"], lines: noRecv }).canSubmitApproval).toBe(true);
    const pending = derivePoFlags({ status: "DRAFT", approvalStatus: "pending", roles: ["admin"], lines: noRecv });
    expect(pending.canApprove).toBe(true);
    expect(pending.canEdit).toBe(false);
    expect(pending.canCancel).toBe(false);
    const approved = derivePoFlags({ status: "DRAFT", approvalStatus: "approved", roles: ["purchaser"], lines: noRecv });
    expect(approved.canMarkSent).toBe(true);
    expect(derivePoFlags({ status: "SENT", roles: ["purchaser"], lines: noRecv }).canReceive).toBe(true);
  });
});

describe("V4.1 PO-UI — tiến trình PO", () => {
  it("PO đang chờ duyệt: bước Duyệt là hiện tại", () => {
    const steps = buildPoSteps({
      status: "DRAFT",
      createdAt: "2026-09-01T00:00:00Z",
      metadata: { approvalStatus: "pending", submittedAt: "2026-09-02T00:00:00Z" },
    });
    expect(steps.map((s) => [s.key, s.state])).toEqual([
      ["created", "done"],
      ["submitted", "done"],
      ["approved", "current"],
      ["sent", "todo"],
      ["received", "todo"],
      ["closed", "todo"],
    ]);
  });

  it("PO cũ gửi NCC không qua duyệt → bỏ qua; nhận một phần ghi %", () => {
    const steps = buildPoSteps({
      status: "PARTIAL",
      createdAt: "2026-09-01T00:00:00Z",
      sentAt: "2026-09-03T00:00:00Z",
      receivedPct: 40,
    });
    expect(steps[1]?.state).toBe("skipped");
    expect(steps[2]?.state).toBe("skipped");
    expect(steps[4]).toMatchObject({ key: "received", state: "current", note: "Đã nhận 40%" });
  });

  it("PO huỷ: bước cuối là Đã huỷ kèm lý do", () => {
    const steps = buildPoSteps({
      status: "CANCELLED",
      createdAt: "2026-09-01T00:00:00Z",
      cancelledAt: "2026-09-05T00:00:00Z",
      metadata: { cancelledReason: "NCC ngừng" },
    });
    expect(steps.at(-1)).toMatchObject({ key: "cancelled", state: "cancelled", note: "NCC ngừng" });
  });
});

describe("V4.1 PO-UI — đọc số kiểu VN", () => {
  it.each([
    ["1.500.000", 1500000],
    ["1500000", 1500000],
    ["12,5", 12.5],
    ["1.234,56", 1234.56],
    ["1.5", 1.5],
    ["1.500", 1500],
    ["2.000 ₫", 2000],
    ["0", 0],
  ])("%s → %s", (raw, n) => {
    expect(parseVnNumber(raw)).toBe(n);
  });

  it("rỗng / chữ → null", () => {
    expect(parseVnNumber("")).toBeNull();
    expect(parseVnNumber("abc")).toBeNull();
    expect(parseVnNumber("1..2")).toBeNull();
  });
});
