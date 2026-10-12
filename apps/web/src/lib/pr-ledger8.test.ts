/**
 * Lần 8 — giám thị lần 7: B1 (sổ theo VẬT TƯ, nhiều dòng cùng vật tư), B2 (kết thúc bỏ phần mua khi
 * chưa xuất đợt nào), m5 (duyệt cuối trên dữ liệu cũ), buyIncreased theo vật tư. Chỉ hàm THUẦN
 * (+ đọc mã nguồn cho nhánh giao dịch).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPrLedger,
  checkNewPoAgainstLedger,
  decideFinish,
  isBuyTotalStale,
  planRecheck,
  planRecheckRows,
  summarizePrPos,
  type LedgerLineInput,
  type LedgerPoLineRow,
} from "./pr-ledger";

const row = (itemId: string, poStatus: string, ordered: number, pass: number, pending = 0, fail = 0): LedgerPoLineRow => ({
  itemId,
  poStatus,
  ordered,
  received: pass + pending + fail,
  pendingQc: pending,
  failQc: fail,
});

describe("B1 — S3: 2 dòng cùng vật tư G (10+10) + dòng nhập tay (đã gán vật tư M) 5", () => {
  // Kho duyệt: tồn G 4 → cần mua 6/10; M 5. PO về G 6+4 (đóng), M 5. Dòng 2 xuất 4, dòng 3 xuất 5.
  // Xuất ngoài phiếu 4 → tồn G thật = 4 + 10 − 4 − 4 = 6.
  const base: LedgerLineInput[] = [
    { id: "L1", itemId: "G", qty: 10, approvedQty: 6, issuedQty: 0 },
    { id: "L2", itemId: "G", qty: 10, approvedQty: 10, issuedQty: 4 },
    { id: "L3", itemId: "M", qty: 5, approvedQty: 5, issuedQty: 5 },
  ];
  const closedPo = summarizePrPos([row("G", "CLOSED", 6, 6), row("G", "CLOSED", 10, 4), row("M", "CLOSED", 5, 5)]);
  const stockG = 6;

  it("trước Kiểm tồn lại: sổ theo vật tư — trần 14, còn 10, còn phải đặt 6; dòng không bị 'xuất > trần'", () => {
    const led = buildPrLedger(base, closedPo, "FINAL");
    const g = led.items.get("G")!;
    expect(g).toMatchObject({ req: 20, buy: 16, fromStock: 4, receivedOk: 10, cap: 14, issued: 4, remaining: 10, toOrder: 6 });
    for (const l of led.lines) expect(l.issued).toBeLessThanOrEqual(l.cap + 1e-9);
    // hàng PO phủ trước phần dòng 2 đã xuất
    expect(led.byId.get("L2")!.receivedOk).toBe(4);
    expect(led.byId.get("L1")!.receivedOk).toBe(6);
  });

  it("Kiểm tồn lại mặc định: mua thêm 10 → Σ cần mua G = 20, giữ chỗ = tồn thật 6, toOrder 10 (from-pr lập 10)", () => {
    const led = buildPrLedger(base, closedPo, "FINAL");
    const rows = planRecheckRows(led, new Map([["G", stockG], ["M", 0]]));
    const g = rows.filter((r) => r.itemId === "G");
    expect(g.reduce((a, r) => a + r.stillNeeded, 0)).toBe(10);
    expect(g.reduce((a, r) => a + r.defaultAdd, 0)).toBe(10);
    expect(g[0]!.available).toBe(0); // 6 tồn = hàng PO của phiếu chưa xuất
    const plan = planRecheck(led, rows, undefined);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.newBuy.L1! + plan.newBuy.L2!).toBe(20);
    expect(plan.newBuy.L3).toBe(5);
    expect(plan.buyIncreased).toBe(true);
    const after = buildPrLedger(
      base.map((l) => ({ ...l, approvedQty: plan.newBuy[l.id]! })),
      closedPo,
      "WAREHOUSE",
    );
    const ga = after.items.get("G")!;
    expect(ga).toMatchObject({ buy: 20, fromStock: 0, cap: 10, remaining: 6, toOrder: 10 });
    expect(after.heldByItem.get("G")).toBe(stockG); // không giữ ảo
    for (const l of after.lines) expect(l.issued).toBeLessThanOrEqual(l.cap + 1e-9);
    // PO thủ công: còn đặt được đúng 10
    const fin = buildPrLedger(base.map((l) => ({ ...l, approvedQty: plan.newBuy[l.id]! })), closedPo, "FINAL");
    expect(checkNewPoAgainstLedger(fin, () => "G", [{ itemId: "G", orderedQty: 10 }])).toBeNull();
    expect(checkNewPoAgainstLedger(fin, () => "G", [{ itemId: "G", orderedQty: 11 }])?.code).toBe("OVER_QTY");
  });

  it("PO bổ sung 10 về 6 đạt → còn xuất 6, đang về 4; xuất theo vật tư (dòng nào cũng được, ≤ đề xuất)", () => {
    const lines = base.map((l) => ({ ...l, approvedQty: l.id === "L3" ? 5 : 10 }));
    const po = summarizePrPos([
      row("G", "CLOSED", 6, 6),
      row("G", "CLOSED", 10, 4),
      row("M", "CLOSED", 5, 5),
      row("G", "PARTIAL", 10, 6),
    ]);
    const led = buildPrLedger(lines, po, "FINAL");
    expect(led.items.get("G")).toMatchObject({ receivedOk: 16, cap: 16, remaining: 12, waiting: 4, toOrder: 0 });
    const after = buildPrLedger(
      lines.map((l) => (l.id === "L1" ? { ...l, issuedQty: 8 } : l.id === "L2" ? { ...l, issuedQty: 8 } : l)),
      po,
      "FINAL",
    );
    expect(after.items.get("G")!.remaining).toBe(0);
    expect(after.complete).toBe(false); // còn 4 đang về
  });
});

describe("buyIncreased theo vật tư", () => {
  it("tăng ở một vật tư dù vật tư khác giảm → phải duyệt lại", () => {
    const lines: LedgerLineInput[] = [
      { id: "a", itemId: "A", qty: 10, approvedQty: 2 },
      { id: "b", itemId: "B", qty: 10, approvedQty: 8 },
    ];
    const led = buildPrLedger(lines, summarizePrPos([]), "FINAL");
    const rows = planRecheckRows(led, new Map([["A", 5], ["B", 10]]));
    const plan = planRecheck(led, rows, undefined); // A: 2 → 5 (tăng), B: 8 → 0 (giảm)
    expect(plan.ok && plan.newBuy).toEqual({ a: 5, b: 0 });
    expect(plan.ok && plan.buyIncreased).toBe(true);
  });
});

describe("B2 — PO đóng vì QC hỏng hết, chưa xuất đợt nào: 'Kết thúc – bỏ phần mua'", () => {
  const lines: LedgerLineInput[] = [{ id: "a", itemId: "R", qty: 3, approvedQty: 3, issuedQty: 0 }];
  const po = summarizePrPos([row("R", "CLOSED", 3, 0, 0, 3)]);
  it("sổ: không còn đang về, còn phải đặt 3 → kết thúc được khi có lý do", () => {
    const led = buildPrLedger(lines, po, "FINAL");
    expect(led.noWaiting).toBe(true);
    expect(led.toOrder).toBe(3);
    expect(decideFinish(led, "").ok).toBe(false);
    expect(decideFinish(led, "NCC hỏng, bỏ")).toEqual({ ok: true, dropsUnordered: 3 });
  });
  it("API kết thúc không picks cho phép khi noWaiting ∧ toOrder > 0 (đọc mã nguồn)", () => {
    const src = readFileSync(join(__dirname, "../server/repos/purchaseRequests.ts"), "utf8");
    expect(src).toContain("const dropOnly = before.noWaiting && before.toOrder > 5e-5;");
    expect(src).toContain("if (!hadEarlierIssue && !dropOnly)");
  });
  it("from-pr nhận phiếu CONVERTED (PO bổ sung) (đọc mã nguồn)", () => {
    const src = readFileSync(join(__dirname, "../server/repos/purchaseOrders.ts"), "utf8");
    expect(src).toContain('pr.status !== "APPROVED" && pr.status !== "CONVERTED"');
  });
});

describe("m5 — duyệt cuối trên dữ liệu cũ", () => {
  const lines = [
    { qty: 10, approvedQty: 4 },
    { qty: 5, approvedQty: null },
  ];
  it("Σ cần mua khớp → không chặn; khác (Kho vừa kiểm tồn lại) → chặn; client cũ không gửi → không kiểm", () => {
    expect(isBuyTotalStale(lines, 9)).toBe(false);
    expect(isBuyTotalStale(lines, 7)).toBe(true);
    expect(isBuyTotalStale(lines, undefined)).toBe(false);
  });
});

describe("BẤT BIẾN — mô phỏng ngẫu nhiên 2 dòng cùng vật tư", () => {
  let seed = 777;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = (n: number) => Math.floor(rnd() * n);
  it("1000 kịch bản: giữ chỗ vật tư ≤ tồn thật; mỗi dòng xuất ≤ đề xuất; Σ xuất ≤ trần vật tư", () => {
    for (let run = 0; run < 1000; run++) {
      const q1 = 1 + pick(8);
      const q2 = 1 + pick(8);
      let stock = pick(q1 + q2 + 2);
      const buyTotal = Math.max(0, q1 + q2 - stock);
      const b1 = Math.min(q1, buyTotal);
      let lines: LedgerLineInput[] = [
        { id: "a", itemId: "i", qty: q1, approvedQty: b1, issuedQty: 0 },
        { id: "b", itemId: "i", qty: q2, approvedQty: buyTotal - b1, issuedQty: 0 },
      ];
      const pos: Array<{ status: string; ordered: number; pass: number; pending: number; fail: number }> = [];
      const sum = () => summarizePrPos(pos.map((p) => row("i", p.status, p.ordered, p.pass, p.pending, p.fail)));
      for (let step = 0; step < 30; step++) {
        const led = buildPrLedger(lines, sum(), "FINAL");
        const it = led.items.get("i")!;
        expect(it.remaining).toBeLessThanOrEqual(stock + 1e-9);
        expect(it.issued).toBeLessThanOrEqual(it.cap + 1e-9);
        for (const l of led.lines) {
          expect(l.issued).toBeLessThanOrEqual(l.req + 1e-9);
          expect(l.issued).toBeLessThanOrEqual(l.cap + 1e-9);
        }
        expect(led.lines.reduce((a, l) => a + l.remaining, 0)).toBeCloseTo(it.remaining, 6);
        expect(it.orderedEffective + it.toOrder).toBeLessThanOrEqual(it.req - Math.max(0, it.issued - it.receivedOk) + 1e-9);
        const ev = pick(6);
        if (ev === 0 && it.toOrder > 0) pos.push({ status: "SENT", ordered: it.toOrder, pass: 0, pending: 0, fail: 0 });
        else if (ev === 1) {
          const open = pos.find((p) => p.status === "SENT" || p.status === "PARTIAL");
          if (open) {
            const k = Math.min(open.ordered - open.pass - open.pending, 1 + pick(3));
            if (k > 0) {
              open.pending += k;
              open.status = open.pass + open.pending >= open.ordered ? "RECEIVED" : "PARTIAL";
            }
          }
        } else if (ev === 2) {
          const p = pos.find((x) => x.pending > 0);
          if (p) {
            if (rnd() < 0.8) {
              p.pass += p.pending;
              stock += p.pending;
            } else {
              p.fail += p.pending;
              if (p.status === "RECEIVED") p.status = "PARTIAL";
            }
            p.pending = 0;
          }
        } else if (ev === 3) {
          // xuất theo vật tư: chọn dòng ngẫu nhiên, ≤ đề xuất dòng, ≤ còn của vật tư, ≤ tồn
          const k = pick(2);
          const l = led.lines[k]!;
          const x = Math.min(l.req - l.issued, it.capLeft, stock, 1 + pick(4));
          if (x > 0) {
            lines = lines.map((y, j) => (j === k ? { ...y, issuedQty: Number(y.issuedQty) + x } : y));
            stock -= x;
          }
        } else if (ev === 4) {
          const p = pos.find((x) => (x.status === "PARTIAL" || x.status === "RECEIVED") && x.pending === 0);
          if (p) p.status = "CLOSED";
        } else if (ev === 5 && led.noWaiting) {
          const plan = planRecheck(led, planRecheckRows(led, new Map([["i", stock]])), undefined);
          if (plan.ok) lines = lines.map((y) => ({ ...y, approvedQty: plan.newBuy[y.id]! }));
        }
      }
    }
  });
});
