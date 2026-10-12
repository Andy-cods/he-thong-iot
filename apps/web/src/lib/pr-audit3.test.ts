/**
 * Đợt sửa lỗi giám thị lần 3 — Đề xuất vật tư (L1, L2, L3, L4, N3, N7). Chỉ hàm THUẦN.
 */
import { describe, expect, it } from "vitest";
import {
  allocateStockAcrossLines,
  computeCommittedByItem,
  isRejectStepCurrent,
  isStockRecheckableState,
  netIssuableByItem,
  resolveBuyDecisions,
  summarizeLineCoverage,
  validateStockCommitment,
} from "./procurement-policy";
import {
  buildPrLedger,
  checkNewPoAgainstLedger,
  EMPTY_PO_SUMMARY,
  summarizePrPos,
  type LedgerLineInput,
  type PrPoSummary,
} from "./pr-ledger";

// Lần 7 — prIssueRight/buildIssueContext/checkPoLinesAgainstPr/planStockRecheck thay bằng SỔ DÒNG.
const prIssueRight = (lines: LedgerLineInput[], ctx: { phase: "FINAL"; receivedByItem: Map<string, number> }) =>
  buildPrLedger(lines, EMPTY_PO_SUMMARY, ctx.phase);

describe("L1 — giữ chỗ mềm tồn kho giữa các phiếu", () => {
  it("cam kết = Σ remainingByItem của prIssueRight (một nguồn với trần xuất)", () => {
    const right = (lines: Parameters<typeof prIssueRight>[0]) =>
      prIssueRight(lines, { phase: "FINAL", receivedByItem: new Map() }).remainingByItem;
    const m = computeCommittedByItem([
      right([
        { id: "1", itemId: "i", qty: 10, approvedQty: 4, issuedQty: 0 }, // 6
        { id: "2", itemId: "i", qty: 5, approvedQty: 5, issuedQty: 0 }, // 0 (mua đủ)
        { id: "3", itemId: "i", qty: 8, approvedQty: 2, issuedQty: 4 }, // 6 − 4 = 2
        { id: "4", itemId: "j", qty: 3, approvedQty: 0, issuedQty: 5 }, // đã xuất vượt → 0
        { id: "5", itemId: null, qty: 9, approvedQty: 0, issuedQty: 0 }, // dòng nhập tay bỏ qua
        { id: "6", itemId: "k", qty: 7, approvedQty: null, issuedQty: 0 }, // phiếu cũ chưa chốt: sau duyệt cuối coi xuất đủ → 7
      ]),
    ]);
    expect(m.get("i")).toBe(8);
    expect(m.has("j")).toBe(false);
    expect(m.get("k")).toBe(7);
  });

  it("tồn khả dụng = issuable − cam kết, không âm", () => {
    const net = netIssuableByItem(
      new Map([
        ["i", 10],
        ["j", 3],
        ["k", 5],
      ]),
      new Map([
        ["i", 8],
        ["j", 9],
      ]),
    );
    expect(net.get("i")).toBe(2);
    expect(net.get("j")).toBe(0);
    expect(net.get("k")).toBe(5);
  });

  it("hai phiếu cùng vật tư: phiếu A giữ 8/10 → phiếu B đòi 5 từ kho bị chặn, đòi 2 thì được", () => {
    // Phiếu A đã duyệt, giữ 8. Tồn thô 10 → phiếu B thấy 2.
    const committed = computeCommittedByItem([
      prIssueRight([{ id: "a1", itemId: "i", qty: 8, approvedQty: 0, issuedQty: 0 }], {
        phase: "FINAL",
        receivedByItem: new Map(),
      }).remainingByItem,
    ]);
    const net = netIssuableByItem(new Map([["i", 10]]), committed);
    const lines = [{ id: "b1", itemId: "i", qty: 5, label: "VT-01" }];
    // mặc định theo tồn khả dụng còn 2 → cần mua 3
    const alloc = allocateStockAcrossLines(lines, net);
    const resolved = resolveBuyDecisions(
      lines.map((l) => ({ id: l.id, itemId: l.itemId, qty: l.qty, available: alloc.get(l.id) })),
      undefined,
    );
    expect(resolved.ok && resolved.decisions["b1"]).toBe(3);
    // Kho cố ép "đủ từ tồn" (cần mua 0) → vượt tồn khả dụng 2 → lỗi
    expect(validateStockCommitment(lines, { b1: 0 }, net)).toMatch(/chỉ còn 2 khả dụng/);
    expect(validateStockCommitment(lines, { b1: 3 }, net)).toBeNull();
  });

  it("isStockRecheckableState: chỉ phiếu đã qua Kho, chưa hoàn tất / xuất xong", () => {
    const base = { completedAt: null, goodsIssuedAt: null };
    expect(isStockRecheckableState({ ...base, status: "SUBMITTED", approvalStep: "DEPT_APPROVED" })).toBe(true);
    expect(isStockRecheckableState({ ...base, status: "APPROVED", approvalStep: "DIRECTOR_APPROVED" })).toBe(true);
    expect(isStockRecheckableState({ ...base, status: "CONVERTED", approvalStep: "DIRECTOR_APPROVED" })).toBe(true);
    expect(isStockRecheckableState({ ...base, status: "SUBMITTED", approvalStep: "SUBMITTED" })).toBe(false);
    expect(isStockRecheckableState({ ...base, status: "DRAFT", approvalStep: "DRAFT" })).toBe(false);
    expect(
      isStockRecheckableState({ status: "APPROVED", approvalStep: "DONE", completedAt: new Date(), goodsIssuedAt: null }),
    ).toBe(false);
    expect(
      isStockRecheckableState({ status: "APPROVED", approvalStep: "DIRECTOR_APPROVED", completedAt: null, goodsIssuedAt: new Date() }),
    ).toBe(false);
  });
});

describe("L2 — PO kèm prId áp đúng quy tắc from-pr (sổ dòng: toOrder)", () => {
  const prLines = [
    { id: "a", itemId: "i", qty: 10, approvedQty: 6, issuedQty: 0 },
    { id: "b", itemId: "j", qty: 4, approvedQty: 0, issuedQty: 0 }, // không cần mua
  ];
  const label = (id: string) => (id === "i" ? "VT-01" : "VT-02");
  const openPo = (ordered: number) =>
    summarizePrPos([{ itemId: "i", poStatus: "SENT", ordered, received: 0, pendingQc: 0, failQc: 0 }]);
  const chk = (lines: LedgerLineInput[], p: PrPoSummary, n: Array<{ itemId: string; orderedQty: number }>) =>
    checkNewPoAgainstLedger(buildPrLedger(lines, p, "FINAL"), label, n);
  it("hợp lệ: đặt đúng phần cần mua", () => {
    expect(chk(prLines, EMPTY_PO_SUMMARY, [{ itemId: "i", orderedQty: 6 }])).toBeNull();
  });
  it("vượt SL cần mua → OVER_QTY (kể cả cộng PO đang mở)", () => {
    expect(chk(prLines, EMPTY_PO_SUMMARY, [{ itemId: "i", orderedQty: 7 }])?.code).toBe("OVER_QTY");
    const r2 = chk(prLines, openPo(4), [{ itemId: "i", orderedQty: 3 }]);
    expect(r2?.code).toBe("OVER_QTY");
    expect(r2?.message).toContain("VT-01");
    expect(chk(prLines, openPo(4), [{ itemId: "i", orderedQty: 2 }])).toBeNull();
  });
  it("vật tư không thuộc phiếu → ITEM_NOT_IN_PR", () => {
    expect(chk(prLines, EMPTY_PO_SUMMARY, [{ itemId: "zzz", orderedQty: 1 }])?.code).toBe("ITEM_NOT_IN_PR");
  });
  it("vật tư thuộc phiếu nhưng Kho đã đáp ứng đủ (cần mua 0) → không đặt được", () => {
    expect(chk(prLines, EMPTY_PO_SUMMARY, [{ itemId: "j", orderedQty: 1 }])?.code).toBe("OVER_QTY");
  });
  it("mọi dòng = 0 → NOTHING_TO_BUY", () => {
    expect(chk(prLines, EMPTY_PO_SUMMARY, [{ itemId: "i", orderedQty: 0 }])?.code).toBe("NOTHING_TO_BUY");
  });
  it("dữ liệu cũ: qty 10, cần mua 6, đã xuất 7 → chỉ còn đặt được 3", () => {
    const pl = [{ id: "a", itemId: "i", qty: 10, approvedQty: 6, issuedQty: 7 }];
    expect(chk(pl, EMPTY_PO_SUMMARY, [{ itemId: "i", orderedQty: 3 }])).toBeNull();
    expect(chk(pl, EMPTY_PO_SUMMARY, [{ itemId: "i", orderedQty: 4 }])?.code).toBe("OVER_QTY");
  });
  it("hai dòng cùng vật tư: trần cộng dồn", () => {
    const pl = [
      { id: "a", itemId: "i", qty: 5, approvedQty: 5 },
      { id: "b", itemId: "i", qty: 5, approvedQty: 3 },
    ];
    expect(chk(pl, EMPTY_PO_SUMMARY, [{ itemId: "i", orderedQty: 8 }])).toBeNull();
    expect(chk(pl, EMPTY_PO_SUMMARY, [{ itemId: "i", orderedQty: 9 }])?.code).toBe("OVER_QTY");
  });
});

describe("L3/L4 — trần xuất sau duyệt cuối và chặn 'không trừ tồn' (sổ dòng)", () => {
  const livePo = (ordered: number, received: number): PrPoSummary =>
    summarizePrPos([
      {
        itemId: "i",
        poStatus: received >= ordered ? "RECEIVED" : "SENT",
        ordered,
        received,
        pendingQc: 0,
        failQc: 0,
      },
    ]);
  const cap = (l: LedgerLineInput, p: PrPoSummary) => buildPrLedger([l], p, "FINAL").byId.get(l.id)!.cap;
  it("L3: qty 10, cần mua 6, PO 6: chưa về → 4; về 6 → 10", () => {
    const line = { id: "a", itemId: "i", qty: 10, approvedQty: 6 };
    expect(cap(line, livePo(6, 0))).toBe(4);
    expect(cap(line, livePo(6, 6))).toBe(10);
  });
  it("L3: đã xuất 7, PO 3 chưa về → trần 7; về 3 → 10", () => {
    const line = { id: "a", itemId: "i", qty: 10, approvedQty: 3, issuedQty: 7 };
    expect(cap(line, livePo(3, 0))).toBe(7);
    expect(cap(line, livePo(3, 3))).toBe(10);
  });
  it("L4: còn hàng đang về → không 'kết thúc'/'không trừ tồn' (noWaiting false)", () => {
    const line = { id: "a", itemId: "i", qty: 10, approvedQty: 6, issuedQty: 4 };
    expect(buildPrLedger([line], livePo(6, 0), "FINAL").noWaiting).toBe(false);
    expect(buildPrLedger([line], livePo(6, 6), "FINAL").noWaiting).toBe(true);
  });
});

describe("N3 — tóm tắt có sẵn / cần mua cho thông báo duyệt cuối", () => {
  it("dòng có sẵn một phần đếm vào 'cần mua' và được ghi riêng", () => {
    const s = summarizeLineCoverage([
      { qty: 5, approvedQty: 0 }, // có sẵn đủ
      { qty: 5, approvedQty: 2 }, // một phần
      { qty: 5, approvedQty: 5 }, // mua đủ
      { qty: 5, approvedQty: null }, // chưa chốt → mua đủ
    ]);
    expect(s).toEqual({ coveredLines: 1, partialLines: 1, buyLines: 3 });
  });
});

describe("N7 — từ chối theo bước mong đợi", () => {
  it("chỉ khớp khi phiếu vẫn ở đúng bước người từ chối thấy", () => {
    expect(isRejectStepCurrent("SUBMITTED", "SUBMITTED")).toBe(true);
    expect(isRejectStepCurrent("DEPT_APPROVED", "SUBMITTED")).toBe(false);
    expect(isRejectStepCurrent("DIRECTOR_APPROVED", "DEPT_APPROVED")).toBe(false);
    expect(isRejectStepCurrent(null, "SUBMITTED")).toBe(false);
  });
});
