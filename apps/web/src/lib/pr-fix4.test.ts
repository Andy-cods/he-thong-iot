/**
 * Đợt sửa lỗi giám thị lần 4 — Đề xuất vật tư: prIssueRight là MỘT nguồn cho cam kết + trần xuất +
 * kiểm khi xuất (B1, B2, B3, T8), M1, m1, m2, m3, m4, m5, m8. Chỉ hàm THUẦN (m1 kiểm bằng đọc mã nguồn).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkIssueAgainstHold,
  computeCommittedByItem,
  formatCoverageSummary,
  isExpectedStepStale,
  isStockRecheckableState,
  netIssuableByItem,
  prIssuePhaseOf,
  roundQty,
} from "./procurement-policy";
import { buildPrLedger, summarizePrPos, type PrIssuePhase, type PrPoSummary } from "./pr-ledger";
import { RESOLVES_STALE, planPRReadyToIssue } from "@/server/services/notification-plans";

// Lần 7 — prIssueRight đã thay bằng SỔ DÒNG (buildPrLedger). Bộ chuyển đổi giữ nguyên các kỳ vọng cũ:
// "hàng đạt QC đã nhận" = PO đã nhận đủ (không còn đang về) với SL nhận = SL đặt.
const receivedPo = (received: Record<string, number>): PrPoSummary =>
  summarizePrPos(
    Object.entries(received).map(([itemId, n]) => ({
      itemId,
      poStatus: "RECEIVED",
      ordered: n,
      received: n,
      pendingQc: 0,
      failQc: 0,
    })),
  );
const view = (led: ReturnType<typeof buildPrLedger>) => ({
  caps: new Map(led.lines.map((l) => [l.id, l.cap])),
  remaining: new Map(led.lines.map((l) => [l.id, l.remaining])),
  remainingByItem: led.remainingByItem,
  heldByItem: led.heldByItem,
  total: led.totalRemaining,
});
const prIssueRight = (
  lines: Array<{ id: string; itemId: string | null; qty: number; approvedQty: number | null; issuedQty?: number }>,
  ctx: { phase: PrIssuePhase; receivedByItem: Map<string, number> },
) => view(buildPrLedger(lines, receivedPo(Object.fromEntries(ctx.receivedByItem)), ctx.phase));
const none = new Map<string, number>();
const right = (
  lines: Array<{ id: string; itemId: string | null; qty: number; approvedQty: number | null; issuedQty?: number }>,
  phase: "NONE" | "WAREHOUSE" | "FINAL" = "FINAL",
  received: Record<string, number> = {},
) => prIssueRight(lines, { phase, receivedByItem: new Map(Object.entries(received)) });

describe("prIssueRight — cap_i / remaining_i theo giai đoạn", () => {
  const L = [{ id: "a", itemId: "i", qty: 10, approvedQty: 6 }];
  it("giai đoạn Kho: cap = qty − cần mua", () => {
    const r = right(L, "WAREHOUSE");
    expect(r.caps.get("a")).toBe(4);
    expect(r.remaining.get("a")).toBe(4);
    expect(r.remainingByItem.get("i")).toBe(4);
  });
  it("B2 — sau duyệt cuối, CHƯA có PO: cap vẫn = qty − cần mua (không phải qty)", () => {
    expect(right(L, "FINAL").caps.get("a")).toBe(4);
  });
  it("có PO: cap = (qty − buy) + hàng đạt QC đã nhận, kẹp ≤ qty", () => {
    expect(right(L, "FINAL", { i: 2 }).caps.get("a")).toBe(6);
    expect(right(L, "FINAL", { i: 6 }).caps.get("a")).toBe(10);
    expect(right(L, "FINAL", { i: 99 }).caps.get("a")).toBe(10);
  });
  it("PO huỷ hết → receivedByItem rỗng → như chưa có PO", () => {
    expect(right(L, "FINAL", {}).caps.get("a")).toBe(4);
  });
  it("Kho đáp ứng đủ (buy = 0): cap = qty", () => {
    expect(right([{ id: "a", itemId: "i", qty: 10, approvedQty: 0 }]).caps.get("a")).toBe(10);
  });
  it("remaining = cap − đã xuất, không âm", () => {
    const r = right([{ id: "a", itemId: "i", qty: 10, approvedQty: 6, issuedQty: 7 }]);
    expect(r.remaining.get("a")).toBe(0);
    expect(r.remainingByItem.has("i")).toBe(false);
  });
  it("phiếu hoàn tất/huỷ/từ chối/nháp/chờ Kho (phase NONE) → remaining 0 nhưng cap vẫn tính", () => {
    const r = right(L, "NONE");
    expect(r.remaining.get("a")).toBe(0);
    expect(r.total).toBe(0);
    expect(r.caps.get("a")).toBe(4);
  });
  it("dòng nhập tay (chưa có vật tư) bỏ qua trong tồn", () => {
    const r = right([{ id: "a", itemId: null, qty: 5, approvedQty: 0 }]);
    expect(r.remainingByItem.size).toBe(0);
    expect(r.total).toBe(0);
  });
  it("hai dòng cùng vật tư: hàng nhận phân bổ lần lượt, remaining cộng theo vật tư", () => {
    const r = right(
      [
        { id: "a", itemId: "i", qty: 5, approvedQty: 5 },
        { id: "b", itemId: "i", qty: 5, approvedQty: 5 },
      ],
      "FINAL",
      { i: 7 },
    );
    expect(r.caps.get("a")).toBe(5);
    expect(r.caps.get("b")).toBe(2);
    expect(r.remainingByItem.get("i")).toBe(7);
  });
});

describe("prIssuePhaseOf", () => {
  it("nhận diện giai đoạn giữ chỗ", () => {
    expect(prIssuePhaseOf({ status: "SUBMITTED", approvalStep: "DEPT_APPROVED" })).toBe("WAREHOUSE");
    expect(prIssuePhaseOf({ status: "SUBMITTED", approvalStep: "SUBMITTED" })).toBe("NONE");
    expect(prIssuePhaseOf({ status: "DRAFT", approvalStep: null })).toBe("NONE");
    expect(prIssuePhaseOf({ status: "APPROVED", approvalStep: "DIRECTOR_APPROVED" })).toBe("FINAL");
    // B1 — phiếu đã lập PO có approval_step = CONVERTED vẫn giữ chỗ
    expect(prIssuePhaseOf({ status: "CONVERTED", approvalStep: "CONVERTED" })).toBe("FINAL");
    expect(prIssuePhaseOf({ status: "CONVERTED", approvalStep: "CONVERTED", completedAt: new Date() })).toBe("NONE");
    expect(prIssuePhaseOf({ status: "REJECTED", approvalStep: "REJECTED" })).toBe("NONE");
    expect(prIssuePhaseOf({ status: "CANCELLED", approvalStep: "CANCELLED" })).toBe("NONE");
    expect(prIssuePhaseOf({ status: "APPROVED", approvalStep: "DONE" })).toBe("NONE");
  });
});

describe("Cam kết = Σ remainingByItem — khớp trần xuất của từng phiếu", () => {
  it("B1 — phiếu CONVERTED có PO vẫn giữ chỗ phần có sẵn (T3)", () => {
    // A: qty 14, tồn 10 → cần mua 4 → giữ 10 (đã lập PO, approval_step CONVERTED)
    const phaseA = prIssuePhaseOf({ status: "CONVERTED", approvalStep: "CONVERTED" });
    const a = prIssueRight([{ id: "a", itemId: "C", qty: 14, approvedQty: 4 }], {
      phase: phaseA,
      receivedByItem: none,
    });
    const committed = computeCommittedByItem([a.remainingByItem]);
    expect(committed.get("C")).toBe(10);
    // B thấy tồn 10 − 10 = 0, không được cam kết thêm từ kho
    expect(netIssuableByItem(new Map([["C", 10]]), committed).get("C")).toBe(0);
  });

  it("B2/T4 — phiếu A (mua 6/10) sau duyệt cuối chưa PO chỉ giữ 4 → B còn 6 để đòi", () => {
    const a = right([{ id: "a", itemId: "D", qty: 10, approvedQty: 6 }], "FINAL");
    const committed = computeCommittedByItem([a.remainingByItem]);
    expect(committed.get("D")).toBe(4);
    // tồn 10, A giữ 4, A không thể xuất lấn: cap 4 (không phải 10)
    expect(a.caps.get("a")).toBe(4);
    expect(netIssuableByItem(new Map([["D", 10]]), committed).get("D")).toBe(6);
  });

  it("B3/T5 — hàng PO đạt QC của A nằm trong cap của A nên được giữ cho A", () => {
    // A mua hết 5, PO về 5 đạt QC → cap 5, giữ 5; tồn thô 5 → B thấy 0
    const a = right([{ id: "a", itemId: "E", qty: 5, approvedQty: 5 }], "FINAL", { E: 5 });
    expect(a.caps.get("a")).toBe(5);
    const committed = computeCommittedByItem([a.remainingByItem]);
    expect(committed.get("E")).toBe(5);
    expect(netIssuableByItem(new Map([["E", 5]]), committed).get("E")).toBe(0);
    // sau khi A xuất 5, tồn thô về 0 và A hết giữ: không bị trừ hai lần
    const after = right([{ id: "a", itemId: "E", qty: 5, approvedQty: 5, issuedQty: 5 }], "FINAL", { E: 5 });
    expect(computeCommittedByItem([after.remainingByItem]).has("E")).toBe(false);
  });

  it("Σ(cam kết + đã xuất) không vượt tồn nhập khi hai phiếu cùng vật tư", () => {
    const stockIn = 10;
    const a = right([{ id: "a", itemId: "i", qty: 6, approvedQty: 0 }]);
    const held = computeCommittedByItem([a.remainingByItem]);
    // B duyệt: chỉ còn 4 từ kho
    const bAvail = netIssuableByItem(new Map([["i", stockIn]]), held).get("i")!;
    expect(bAvail).toBe(4);
    const b = right([{ id: "b", itemId: "i", qty: 8, approvedQty: 8 - bAvail }]);
    const total = (a.remainingByItem.get("i") ?? 0) + (b.remainingByItem.get("i") ?? 0);
    expect(total).toBeLessThanOrEqual(stockIn);
  });
});

describe("T8 — PO đóng thiếu, một phần QC không đạt (sổ dòng)", () => {
  const po = (ordered: number, pass: number, fail: number, status: string) =>
    summarizePrPos([{ itemId: "H", poStatus: status, ordered, received: pass + fail, pendingQc: 0, failQc: fail }]);
  const line = { id: "h", itemId: "H", qty: 6, approvedQty: 6 };
  it("đặt 6, nhận 4 nhưng chỉ 2 đạt QC: cap 2; PO còn mở → còn chờ 4, chưa hoàn tất", () => {
    const c = buildPrLedger([line], po(6, 2, 2, "PARTIAL"), "FINAL");
    expect(c.byId.get("h")!.cap).toBe(2);
    expect(c.waiting).toBe(4);
    expect(c.complete).toBe(false);
  });
  it("ĐỔI KỲ VỌNG (lần 7): đóng PO thiếu không còn tự coi là xong — phần thiếu thành 'còn phải đặt' (toOrder 4)", () => {
    const c = buildPrLedger([{ ...line, issuedQty: 2 }], po(6, 2, 2, "CLOSED"), "FINAL");
    expect(c.byId.get("h")!.cap).toBe(2);
    expect(c.byId.get("h")!.remaining).toBe(0);
    expect(c.waiting).toBe(0);
    expect(c.toOrder).toBe(4);
    expect(c.complete).toBe(false);
  });
});

describe("Kiểm khi xuất — checkIssueAgainstHold", () => {
  const issuable = new Map([["i", 10]]);
  it("xuất ≤ tồn − giữ cho phiếu khác thì cho", () => {
    expect(checkIssueAgainstHold(new Map([["i", 6]]), issuable, new Map([["i", 4]]))).toBeNull();
  });
  it("lấn phần giữ chỗ → thông báo tiếng Việt rõ ràng", () => {
    const msg = checkIssueAgainstHold(new Map([["i", 7]]), issuable, new Map([["i", 4]]), () => "VT-01");
    expect(msg).toContain("VT-01");
    expect(msg).toContain("đã giữ cho phiếu khác");
    expect(msg).toContain("tối đa 6");
  });
  it("hai phiếu xuất song song cùng vật tư: tổng không vượt tồn", () => {
    // tồn 10; A giữ 6, B giữ 4. A xuất 6 (B giữ 4 → free 6 ok), rồi tồn còn 4, A hết giữ → B xuất 4 ok
    expect(checkIssueAgainstHold(new Map([["i", 6]]), new Map([["i", 10]]), new Map([["i", 4]]))).toBeNull();
    expect(checkIssueAgainstHold(new Map([["i", 4]]), new Map([["i", 4]]), new Map())).toBeNull();
    // B cố xuất 5 khi A còn giữ 6 / tồn 10 → chặn
    expect(checkIssueAgainstHold(new Map([["i", 5]]), new Map([["i", 10]]), new Map([["i", 6]]))).not.toBeNull();
  });
});

describe("M1 — expectedStep khi từ chối", () => {
  it("thiếu expectedStep (client cũ) → không coi là lệch", () => {
    expect(isExpectedStepStale("DEPT_APPROVED", undefined)).toBe(false);
    expect(isExpectedStepStale("DEPT_APPROVED", null)).toBe(false);
  });
  it("khớp bước → ok; khác bước → lệch (409)", () => {
    expect(isExpectedStepStale("SUBMITTED", "SUBMITTED")).toBe(false);
    expect(isExpectedStepStale("DEPT_APPROVED", "SUBMITTED")).toBe(true);
  });
});

describe("m1 — huỷ phiếu: PO đã huỷ không chặn", () => {
  it("kiểm HAS_PO bỏ qua PO CANCELLED", () => {
    const src = readFileSync(join(__dirname, "../server/repos/purchaseRequests.ts"), "utf8");
    const i = src.indexOf('"HAS_PO"');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i - 700, i)).toContain("<> 'CANCELLED'");
  });
});

describe("m2 — Kiểm tồn lại với phiếu đã lập PO", () => {
  it("approval_step CONVERTED vẫn là trạng thái kiểm lại được (repo trả câu 'huỷ/đóng PO trước')", () => {
    expect(
      isStockRecheckableState({ status: "CONVERTED", approvalStep: "CONVERTED", completedAt: null, goodsIssuedAt: null }),
    ).toBe(true);
    expect(
      isStockRecheckableState({ status: "APPROVED", approvalStep: "CONVERTED", completedAt: null, goodsIssuedAt: null }),
    ).toBe(false);
  });
});

describe("m3 — PR_DEPT_APPROVED đóng thông báo mâu thuẫn", () => {
  it("đóng PR_READY_TO_ISSUE và PR_STOCK_COVERED", () => {
    expect(RESOLVES_STALE.PR_DEPT_APPROVED).toEqual(
      expect.arrayContaining(["PR_SUBMITTED", "PR_READY_TO_ISSUE", "PR_STOCK_COVERED"]),
    );
  });
});

describe("m4 — tiêu đề 'hàng mua đã về' khi thiếu", () => {
  const ctx = { prId: "x", prNo: "PR-1", title: null, creatorUserId: null, actorUserId: null, actorUsername: null, reason: "goods_received" as const };
  it("đủ hàng → 'đã về đủ'", () => {
    expect(planPRReadyToIssue({ ...ctx, shortQty: 0 }).targets[0]!.title).toContain("hàng mua đã về đủ");
  });
  it("thiếu N → '(thiếu N)', vẫn chứa dấu hiệu chống báo trùng", () => {
    const t = planPRReadyToIssue({ ...ctx, shortQty: 4 }).targets[0]!.title;
    expect(t).toContain("hàng mua đã về (thiếu 4)");
    expect(t).not.toContain("đã về đủ");
  });
});

describe("m5/m8", () => {
  it("tóm tắt có sẵn / cần mua / một phần", () => {
    expect(formatCoverageSummary({ coveredLines: 2, buyLines: 3, partialLines: 1 })).toBe(
      "Có sẵn 2 dòng · cần mua 3 dòng (1 dòng có sẵn một phần)",
    );
    expect(formatCoverageSummary({ coveredLines: 2, buyLines: 3, partialLines: 0 })).toBe("Có sẵn 2 dòng · cần mua 3 dòng");
  });
  it("roundQty bỏ đuôi dấu phẩy động", () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
    expect(roundQty(9.999999999)).toBe(10);
    expect(roundQty(1.2345678)).toBe(1.234568);
    expect(roundQty(null)).toBe(0);
  });
});
