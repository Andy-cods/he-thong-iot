import { describe, expect, it } from "vitest";
import {
  decidePoAutoApproval,
  isSelfApprovalBlocked,
  poAutoApproveBlockedMessage,
  resolvePoAutoApproveLimit,
  shouldRevertPoAutoApproval,
  type PoAutoApproveReason,
} from "./procurement-policy";

const LIMIT = 20_000_000;
const okInput = {
  prId: "pr-1",
  currency: "VND",
  totalAmount: 5_000_000,
  lines: [{ unitPrice: 1000 }, { unitPrice: "2500" }],
  limit: LIMIT,
};

describe("V4.9 — duyệt PO theo ngưỡng tiền", () => {
  it("resolvePoAutoApproveLimit đọc env an toàn", () => {
    expect(resolvePoAutoApproveLimit(undefined)).toBe(20_000_000);
    expect(resolvePoAutoApproveLimit("0")).toBe(0);
    expect(resolvePoAutoApproveLimit("5000000")).toBe(5_000_000);
    expect(resolvePoAutoApproveLimit("abc")).toBe(20_000_000);
    expect(resolvePoAutoApproveLimit("-1")).toBe(20_000_000);
  });

  it("decidePoAutoApproval: đủ điều kiện dưới ngưỡng → tự duyệt", () => {
    expect(decidePoAutoApproval(okInput)).toEqual({ auto: true, reason: "UNDER_LIMIT" });
  });

  it("decidePoAutoApproval: currency null coi là VND", () => {
    expect(decidePoAutoApproval({ ...okInput, currency: null }).auto).toBe(true);
  });

  it.each([
    ["limit 0 → DISABLED", { limit: 0 }, "DISABLED"],
    ["prId null → NO_PR", { prId: null }, "NO_PR"],
    ["có dòng giá 0 → UNPRICED", { lines: [{ unitPrice: 1000 }, { unitPrice: 0 }] }, "UNPRICED"],
    ["không có dòng → UNPRICED", { lines: [] }, "UNPRICED"],
    ["USD → CURRENCY", { currency: "USD" }, "CURRENCY"],
    ["tổng == ngưỡng → OVER_LIMIT", { totalAmount: LIMIT }, "OVER_LIMIT"],
    ["tổng > ngưỡng → OVER_LIMIT", { totalAmount: LIMIT + 1 }, "OVER_LIMIT"],
  ] as const)("decidePoAutoApproval: %s", (_name, patch, reason) => {
    expect(decidePoAutoApproval({ ...okInput, ...patch })).toEqual({ auto: false, reason });
  });

  it("shouldRevertPoAutoApproval", () => {
    const base = {
      status: "DRAFT",
      approvalStatus: "approved",
      autoApproveReason: "UNDER_LIMIT",
      totalAfter: LIMIT,
      limit: LIMIT,
    };
    expect(shouldRevertPoAutoApproval(base)).toBe(true);
    expect(shouldRevertPoAutoApproval({ ...base, totalAfter: "25000000" })).toBe(true);
    expect(shouldRevertPoAutoApproval({ ...base, totalAfter: LIMIT - 1 })).toBe(false);
    expect(shouldRevertPoAutoApproval({ ...base, status: "SENT" })).toBe(false);
    expect(shouldRevertPoAutoApproval({ ...base, autoApproveReason: null })).toBe(false);
    expect(shouldRevertPoAutoApproval({ ...base, limit: 0 })).toBe(false);
  });

  it("poAutoApproveBlockedMessage nhắc Giám đốc cho mọi lý do bị chặn", () => {
    const reasons: Exclude<PoAutoApproveReason, "UNDER_LIMIT">[] = [
      "DISABLED",
      "NO_PR",
      "UNPRICED",
      "CURRENCY",
      "OVER_LIMIT",
    ];
    for (const r of reasons) expect(poAutoApproveBlockedMessage(r, LIMIT)).toContain("Giám đốc");
  });

  it("M4: 2 bước duyệt PR = 2 người (tái dùng isSelfApprovalBlocked cho deptApprovedBy)", () => {
    expect(
      isSelfApprovalBlocked({ creatorId: "u1", actorId: "u1", actorRoles: ["warehouse", "purchaser"] }),
    ).toBe(true);
    expect(
      isSelfApprovalBlocked({ creatorId: "u1", actorId: "u1", actorRoles: ["admin", "purchaser"] }),
    ).toBe(false);
    expect(
      isSelfApprovalBlocked({ creatorId: null, actorId: "u1", actorRoles: ["purchaser"] }),
    ).toBe(false);
  });
});
