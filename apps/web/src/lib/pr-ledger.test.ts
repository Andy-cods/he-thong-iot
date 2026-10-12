/**
 * Lần 7 — SỔ DÒNG của phiếu Đề xuất vật tư (pr-ledger.ts): mọi ca của giám thị lần 6 + bất biến.
 * Chỉ hàm THUẦN.
 */
import { describe, expect, it } from "vitest";
import {
  allocatePoToLines,
  buildLineLedger,
  buildPrLedger,
  checkNewPoAgainstLedger,
  decideFinish,
  EMPTY_PO_SUMMARY,
  ledgerIssueProgress,
  planRecheck,
  planRecheckRows,
  recheckBlockReason,
  summarizePrPos,
  type LedgerLineInput,
  type LedgerPoLineRow,
  type PrIssuePhase,
  type PrLedger,
} from "./pr-ledger";

/** Dòng PO của vật tư "i": [trạng thái, đặt, đạt QC, chờ QC, không đạt]. */
type PoSpec = [status: string, ordered: number, pass: number, pending?: number, fail?: number];
const po = (...rows: PoSpec[]) =>
  summarizePrPos(
    rows.map(
      ([status, ordered, pass, pending = 0, fail = 0]): LedgerPoLineRow => ({
        itemId: "i",
        poStatus: status,
        ordered,
        received: pass + pending + fail,
        pendingQc: pending,
        failQc: fail,
      }),
    ),
  );
const line = (qty: number, approvedQty: number | null, issuedQty = 0): LedgerLineInput => ({
  id: "a",
  itemId: "i",
  qty,
  approvedQty,
  issuedQty,
});
const L = (l: LedgerLineInput, p = EMPTY_PO_SUMMARY, phase: PrIssuePhase = "FINAL") => buildPrLedger([l], p, phase);
const A = (led: PrLedger) => led.byId.get("a")!;
const free = (n: number) => new Map([["i", n]]);
/** Áp kết quả Kiểm tồn lại vào dòng (approved_qty mới). */
const applyRecheck = (l: LedgerLineInput, led: PrLedger, freeQty: number, add?: number) => {
  const rows = planRecheckRows(led, free(freeQty));
  const plan = planRecheck(led, rows, add === undefined ? undefined : { a: add });
  if (!plan.ok) throw new Error(plan.message);
  return { line: { ...l, approvedQty: plan.newBuy.a! }, plan, rows };
};

describe("buildLineLedger — công thức gốc", () => {
  it("cap = min(req, fromStock + receivedOk); remaining; toOrder; waiting; orderedEffective", () => {
    const l = buildLineLedger(line(10, 6, 1), { receivedOk: 2, pendingQc: 1, inbound: 3 }, "FINAL", true);
    expect(l).toMatchObject({
      req: 10,
      buy: 6,
      fromStock: 4,
      receivedOk: 2,
      pendingQc: 1,
      inbound: 3,
      orderedEffective: 6,
      issued: 1,
      cap: 6,
      remaining: 5,
      held: 5,
      toOrder: 0,
      waiting: 4,
    });
  });
  it("giai đoạn NONE: remaining/held 0 nhưng cap vẫn tính", () => {
    const l = buildLineLedger(line(10, 6), { receivedOk: 0, pendingQc: 0, inbound: 0 }, "NONE", false);
    expect(l.cap).toBe(4);
    expect(l.remaining).toBe(0);
    expect(l.held).toBe(0);
  });
  it("dòng nhập tay: không xuất kho, chỉ theo dõi mua", () => {
    const led = buildPrLedger([{ id: "x", itemId: null, qty: 3, approvedQty: 3 }], EMPTY_PO_SUMMARY, "FINAL");
    expect(led.byId.get("x")).toMatchObject({ cap: 0, remaining: 0, toOrder: 3 });
    expect(led.complete).toBe(false);
  });
});

describe("summarizePrPos — PO đang mở / đóng / huỷ, QC", () => {
  it("PO đang mở: inbound = đặt − đạt − chờ QC; lô FAIL phải giao bù", () => {
    const s = po(["PARTIAL", 6, 2, 1, 2]).byItem.get("i")!;
    expect(s).toMatchObject({ receivedOk: 2, pendingQc: 1, inbound: 3, orderedOpen: 6 });
  });
  it("PO đã đóng / nhận đủ: không còn inbound; chờ QC vẫn tính là đang về", () => {
    expect(po(["CLOSED", 6, 2, 0, 2]).byItem.get("i")).toMatchObject({ receivedOk: 2, pendingQc: 0, inbound: 0 });
    expect(po(["RECEIVED", 6, 0, 6]).byItem.get("i")).toMatchObject({ receivedOk: 0, pendingQc: 6, inbound: 0 });
  });
  it("PO huỷ = 0, không tính là có PO", () => {
    const s = po(["CANCELLED", 6, 0]);
    expect(s.hasPo).toBe(false);
    expect(s.byItem.size).toBe(0);
  });
  it("QC không đạt trên PO đã đóng KHÔNG tính vào orderedEffective → còn phải đặt", () => {
    const led = L(line(6, 6, 4), po(["CLOSED", 6, 4, 0, 2]));
    expect(A(led).orderedEffective).toBe(4);
    expect(led.toOrder).toBe(2);
  });
});

describe("N1 — q4 / PO4 / nhận 2 / xuất 2: CHƯA hoàn tất; NCC giao nốt 2 → xuất được, hoàn tất", () => {
  it("còn 2 đang về → outstandingBuy 2, không hoàn tất", () => {
    const led = L(line(4, 4, 2), po(["PARTIAL", 4, 2]));
    expect(A(led)).toMatchObject({ cap: 2, remaining: 0, toOrder: 0, waiting: 2 });
    expect(led.outstandingBuy).toBe(2);
    expect(led.complete).toBe(false);
    expect(decideFinish(led, "x").ok).toBe(false);
  });
  it("giao nốt 2 (đạt) → còn xuất 2; xuất xong → hoàn tất", () => {
    const got = L(line(4, 4, 2), po(["RECEIVED", 4, 4]));
    expect(A(got).remaining).toBe(2);
    expect(got.complete).toBe(false);
    expect(L(line(4, 4, 4), po(["RECEIVED", 4, 4])).complete).toBe(true);
  });
});

describe("q10 / nhận 6 (PO 10 đang mở)", () => {
  it("cap 6, còn chờ 4 → xuất 6 vẫn chưa hoàn tất, chưa được kết thúc", () => {
    const led = L(line(10, 10, 6), po(["PARTIAL", 10, 6]));
    expect(A(led)).toMatchObject({ cap: 6, remaining: 0, waiting: 4, toOrder: 0 });
    expect(led.complete).toBe(false);
    const d = decideFinish(led, "lý do");
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe("OUTSTANDING_PURCHASE");
    expect(recheckBlockReason(led)).not.toBeNull();
  });
});

describe("PO cũ đóng thiếu → Kiểm tồn lại → PO mới → 'không trừ tồn' bị chặn", () => {
  it("đủ chuỗi", () => {
    let l = line(10, 10, 4);
    const closed = po(["CLOSED", 10, 4]);
    const led0 = L(l, closed);
    expect(A(led0)).toMatchObject({ cap: 4, remaining: 0, toOrder: 6, waiting: 0 });
    expect(led0.complete).toBe(false);
    expect(recheckBlockReason(led0)).toBeNull();
    // Kiểm tồn lại, không có tồn → mua thêm 6 (mặc định)
    const r = applyRecheck(l, led0, 0);
    expect(r.rows[0]!.stillNeeded).toBe(6);
    expect(r.plan.ok && r.plan.addTotal).toBe(6);
    l = r.line;
    expect(l.approvedQty).toBe(10); // buy_new = orderedEffective 4 + add 6
    expect(L(l, closed).toOrder).toBe(6);
    // PO mới 6 đang về → không trừ tồn / kết thúc bị chặn
    const withNew = summarizePrPos([
      { itemId: "i", poStatus: "CLOSED", ordered: 10, received: 4, pendingQc: 0, failQc: 0 },
      { itemId: "i", poStatus: "SENT", ordered: 6, received: 0, pendingQc: 0, failQc: 0 },
    ]);
    const led2 = L(l, withNew);
    expect(led2.toOrder).toBe(0);
    expect(led2.waiting).toBe(6);
    const d = decideFinish(led2, "không trừ tồn");
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe("OUTSTANDING_PURCHASE");
  });
});

describe("S1-B — q10, nhận 4, xuất 4, đóng PO, tồn 2 → Kiểm tồn lại không giữ ảo", () => {
  it("giữ chỗ sau kiểm = tồn thật 2, mua thêm 4", () => {
    const l = line(10, 10, 4);
    const closed = po(["CLOSED", 10, 4]);
    const r = applyRecheck(l, L(l, closed), 2);
    expect(r.rows[0]).toMatchObject({ stillNeeded: 6, available: 2, defaultAdd: 4, receivedUnissued: 0 });
    expect(r.line.approvedQty).toBe(8);
    const after = L(r.line, closed);
    expect(A(after)).toMatchObject({ fromStock: 2, cap: 6, remaining: 2, toOrder: 4 });
    expect(after.heldByItem.get("i")).toBe(2); // = tồn 2, không đếm lại 4 đã về/đã xuất
  });
  it("S1-A — không có tồn: mua thêm 6, không giữ chỗ", () => {
    const l = line(10, 10, 4);
    const closed = po(["CLOSED", 10, 4]);
    const r = applyRecheck(l, L(l, closed), 0);
    expect(A(L(r.line, closed))).toMatchObject({ remaining: 0, toOrder: 6 });
  });
  it("Kho nhập mua thêm vượt phần còn phải đáp ứng → lỗi; xuất từ kho vượt tồn → STOCK_SHORT", () => {
    const l = line(10, 10, 4);
    const led = L(l, po(["CLOSED", 10, 4]));
    const rows = planRecheckRows(led, free(2));
    const over = planRecheck(led, rows, { a: 7 });
    expect(over.ok).toBe(false);
    const short = planRecheck(led, rows, { a: 3 });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.code).toBe("STOCK_SHORT");
    expect(planRecheck(led, rows, { zzz: 1 }).ok).toBe(false);
  });
});

describe("S4-E1 — xuất ngoài phiếu → Kiểm tồn lại → xuất hết → hết banner", () => {
  it("đủ chuỗi theo sổ + tồn mô phỏng", () => {
    // Kho duyệt: tồn 4 → mua 6 (fromStock 4).
    let l = line(10, 6, 0);
    expect(A(L(l, EMPTY_PO_SUMMARY, "WAREHOUSE")).cap).toBe(4); // xuất sớm giai đoạn Kho ≤ 4
    expect(A(L(l, EMPTY_PO_SUMMARY, "FINAL")).cap).toBe(4); // sau duyệt cuối, chưa PO: vẫn 4
    // PO 6 đang về → chặn Kiểm tồn lại
    expect(recheckBlockReason(L(l, po(["SENT", 6, 0])))).not.toBeNull();
    // Hàng về 6 nhưng chờ QC (PO đã RECEIVED) → vẫn chặn (N5)
    expect(recheckBlockReason(L(l, po(["RECEIVED", 6, 0, 6])))).not.toBeNull();
    // QC đạt: tồn = 4 + 6 − 2 (xuất ngoài phiếu) = 8 < giữ 10 → banner
    const passed = po(["RECEIVED", 6, 6]);
    const led = L(l, passed);
    expect(A(led).remaining).toBe(10);
    let stock = 8;
    expect(led.heldByItem.get("i")!).toBeGreaterThan(stock);
    // Kiểm tồn lại: còn phải đáp ứng 4, khả dụng mới = 8 − 6 (hàng PO chưa xuất) = 2 → mua thêm 2
    const r = applyRecheck(l, led, stock);
    expect(r.rows[0]).toMatchObject({ stillNeeded: 4, receivedUnissued: 6, available: 2, defaultAdd: 2 });
    l = r.line;
    expect(l.approvedQty).toBe(8);
    const after = L(l, passed, "WAREHOUSE"); // add > 0 → về chờ duyệt cuối
    expect(A(after).remaining).toBe(8);
    expect(after.heldByItem.get("i")!).toBeLessThanOrEqual(stock); // hết banner
    // Xuất hết 8 → tồn 0, giữ 0
    stock -= 8;
    const done = L({ ...l, issuedQty: 8 }, passed, "WAREHOUSE");
    expect(done.totalRemaining).toBe(0);
    expect(stock).toBe(0);
  });
});

describe("S5 — from-pr không mua trùng", () => {
  it("hàng về chờ QC: toOrder 0 (không lập PO lần 2), Kiểm tồn lại bị chặn", () => {
    const led = L(line(10, 6), po(["RECEIVED", 6, 0, 6]));
    expect(led.toOrder).toBe(0);
    expect(recheckBlockReason(led)).not.toBeNull();
  });
  it("đã nhận 6 (PO đóng) + Kiểm tồn lại mua thêm 2 → đặt mới ≤ 2", () => {
    const closed = po(["CLOSED", 6, 6]);
    const l0 = line(10, 6, 4);
    const r = applyRecheck(l0, L(l0, closed), 0);
    // còn phải đáp ứng = 10 − max(4, 6) = 4, tồn khả dụng mới = 0 − 2 hàng PO chưa xuất → 0
    expect(r.rows[0]!.stillNeeded).toBe(4);
    expect(r.line.approvedQty).toBe(10);
    const led = L(r.line, closed);
    expect(led.toOrder).toBe(4);
    const lab = () => "VT";
    expect(checkNewPoAgainstLedger(led, lab, [{ itemId: "i", orderedQty: 4 }])).toBeNull();
    expect(checkNewPoAgainstLedger(led, lab, [{ itemId: "i", orderedQty: 5 }])?.code).toBe("OVER_QTY");
  });
});

describe("PO thủ công không bị chặn nhầm bởi PO đã đóng", () => {
  it("cần mua 10, PO cũ đóng sau khi nhận 4 → đặt thêm được 6", () => {
    const led = L(line(10, 10, 4), po(["CLOSED", 10, 4]));
    const lab = () => "VT";
    expect(checkNewPoAgainstLedger(led, lab, [{ itemId: "i", orderedQty: 6 }])).toBeNull();
    expect(checkNewPoAgainstLedger(led, lab, [{ itemId: "i", orderedQty: 7 }])?.code).toBe("OVER_QTY");
  });
  it("PO đang mở tính theo SL đặt", () => {
    const led = L(line(10, 10), po(["SENT", 10, 0]));
    expect(checkNewPoAgainstLedger(led, () => "VT", [{ itemId: "i", orderedQty: 1 }])?.code).toBe("OVER_QTY");
  });
});

describe("Phiếu cũ approved_qty NULL — 3 ca", () => {
  it("(1) chưa PO, sau duyệt cuối: xuất đủ từ tồn HOẶC mua phần chưa xuất; không giữ chỗ", () => {
    const led = L(line(10, null, 3));
    expect(A(led)).toMatchObject({ cap: 10, remaining: 7, toOrder: 7, held: 0 });
    expect(led.heldByItem.size).toBe(0);
    expect(L(line(10, null, 10)).complete).toBe(true);
  });
  it("(2) có PO: trần = hàng PO đạt QC + phần đã cấp từ tồn; không giữ chỗ", () => {
    const open = L(line(10, null), po(["SENT", 10, 0]));
    expect(A(open)).toMatchObject({ cap: 0, toOrder: 0, waiting: 10 });
    const got5 = L(line(10, null), po(["PARTIAL", 10, 5]));
    expect(A(got5)).toMatchObject({ cap: 5, remaining: 5, held: 0 });
    // đã xuất 4 từ tồn rồi mới lập PO 6 → không mua thêm, trần = 4 + hàng về
    const mixed = L(line(10, null, 4), po(["SENT", 6, 0]));
    expect(A(mixed)).toMatchObject({ buy: 6, toOrder: 0, cap: 4, remaining: 0 });
  });
  it("(3) giai đoạn Kho chưa chốt: cap 0", () => {
    expect(A(L(line(10, null), EMPTY_PO_SUMMARY, "WAREHOUSE")).cap).toBe(0);
  });
});

describe("Xuất sớm giai đoạn Kho / Kho đáp ứng đủ", () => {
  it("giai đoạn Kho: trần = phần từ tồn, không bao giờ hoàn tất; phần mua chưa tính vào outstanding", () => {
    const w = L(line(10, 6, 4), EMPTY_PO_SUMMARY, "WAREHOUSE");
    expect(A(w)).toMatchObject({ cap: 4, remaining: 0, toOrder: 6 });
    expect(w.outstandingBuy).toBe(0);
    expect(w.complete).toBe(false);
  });
  it("Kho đáp ứng đủ (buy 0): cap = req, không phải mua; xuất đủ → hoàn tất", () => {
    expect(A(L(line(10, 0)))).toMatchObject({ cap: 10, toOrder: 0 });
    expect(L(line(10, 0, 10)).complete).toBe(true);
    expect(L(line(10, 0, 6)).complete).toBe(false);
  });
});

describe("Kết thúc (N2)", () => {
  it("không còn đang về, còn phần chưa đặt → bắt buộc lý do; có lý do → bỏ phần đó", () => {
    const led = L(line(10, 10, 4), po(["CLOSED", 10, 4]));
    const no = decideFinish(led, "");
    expect(no.ok).toBe(false);
    if (!no.ok) expect(no.code).toBe("UNORDERED_REASON_REQUIRED");
    const yes = decideFinish(led, "NCC ngừng cung cấp");
    expect(yes).toEqual({ ok: true, dropsUnordered: 6 });
  });
  it("không còn gì phải đặt / đang về → kết thúc không cần lý do", () => {
    expect(decideFinish(L(line(10, 0, 3)), null)).toEqual({ ok: true, dropsUnordered: 0 });
  });
});

describe("Phân bổ PO theo dòng cùng vật tư", () => {
  it("đổ đạt → chờ QC → đang về vào sức chứa (SL cần mua) từng dòng; dư dồn dòng cuối", () => {
    const lines: LedgerLineInput[] = [
      { id: "a", itemId: "i", qty: 6, approvedQty: 6 },
      { id: "b", itemId: "i", qty: 4, approvedQty: 4 },
    ];
    const alloc = allocatePoToLines(lines, po(["PARTIAL", 10, 7, 1]));
    expect(alloc.get("a")).toEqual({ receivedOk: 6, pendingQc: 0, inbound: 0 });
    expect(alloc.get("b")).toEqual({ receivedOk: 1, pendingQc: 1, inbound: 2 });
    const over = allocatePoToLines(lines, po(["RECEIVED", 10, 12]));
    expect(over.get("b")!.receivedOk).toBe(6);
  });
  it("tiến độ cho giao diện khớp sổ", () => {
    const p = ledgerIssueProgress(L(line(10, 6, 2), po(["PARTIAL", 6, 3])));
    expect(p.lines[0]).toEqual({ id: "a", cap: 7, issued: 2, remaining: 5 });
    expect(p.outstandingBuy).toBe(true);
  });
});

describe("BẤT BIẾN — mô phỏng ngẫu nhiên một phiếu: giữ chỗ ≤ tồn thật, không mua trùng", () => {
  // PRNG cố định để lặp lại được.
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = (n: number) => Math.floor(rnd() * n);
  it("1000 kịch bản: Σ giữ chỗ ≤ tồn, Σ đặt ≤ req − đã cấp từ tồn, xuất ≤ trần", () => {
    for (let run = 0; run < 1000; run++) {
      const req = 1 + pick(12);
      let stock = pick(req + 3); // tồn khả dụng ban đầu (không phiếu khác)
      const buy0 = Math.max(0, req - stock); // Kho duyệt mặc định
      let l: LedgerLineInput = { id: "a", itemId: "i", qty: req, approvedQty: buy0, issuedQty: 0 };
      const pos: Array<{ status: string; ordered: number; pass: number; pending: number; fail: number }> = [];
      const summary = () =>
        summarizePrPos(
          pos.map((p) => ({
            itemId: "i",
            poStatus: p.status,
            ordered: p.ordered,
            received: p.pass + p.pending + p.fail,
            pendingQc: p.pending,
            failQc: p.fail,
          })),
        );
      for (let step = 0; step < 25; step++) {
        const led = L(l, summary());
        const a = A(led);
        // BẤT BIẾN
        expect(a.remaining).toBeLessThanOrEqual(stock + 1e-9);
        expect(a.issued).toBeLessThanOrEqual(a.cap + 1e-9);
        const orderedTotal = pos.reduce((s, p) => s + (p.status === "CANCELLED" ? 0 : p.ordered), 0);
        void orderedTotal;
        expect(a.orderedEffective + a.toOrder).toBeLessThanOrEqual(req - Math.max(0, a.issued - a.receivedOk) + 1e-9);
        const ev = pick(6);
        if (ev === 0 && a.toOrder > 0) {
          pos.push({ status: "SENT", ordered: a.toOrder, pass: 0, pending: 0, fail: 0 });
        } else if (ev === 1) {
          const open = pos.find((p) => p.status === "SENT" || p.status === "PARTIAL");
          if (open) {
            const left = open.ordered - open.pass - open.pending;
            const k = Math.min(left, 1 + pick(3));
            if (k > 0) {
              open.pending += k;
              open.status = open.pass + open.pending >= open.ordered ? "RECEIVED" : "PARTIAL";
            }
          }
        } else if (ev === 2) {
          const p = pos.find((x) => x.pending > 0);
          if (p) {
            const ok = rnd() < 0.8;
            if (ok) {
              p.pass += p.pending;
              stock += p.pending;
            } else {
              p.fail += p.pending;
              if (p.status === "RECEIVED") p.status = "PARTIAL";
            }
            p.pending = 0;
          }
        } else if (ev === 3) {
          const x = Math.min(a.remaining, stock, 1 + pick(4));
          if (x > 0) {
            l = { ...l, issuedQty: Number(l.issuedQty) + x };
            stock -= x;
          }
        } else if (ev === 4) {
          const p = pos.find((x) => (x.status === "PARTIAL" || x.status === "RECEIVED") && x.pending === 0);
          if (p) p.status = "CLOSED";
        } else if (ev === 5 && led.noWaiting) {
          const rows = planRecheckRows(led, free(stock));
          const plan = planRecheck(led, rows, undefined);
          if (plan.ok) l = { ...l, approvedQty: plan.newBuy.a! };
        }
      }
    }
  });
});
