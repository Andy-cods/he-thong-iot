/**
 * Lần 9 — giám thị lần 8: N1 (phiếu cũ: backfill 0081 + sổ không phụ thuộc thứ tự sự kiện), N2 (chia lô
 * FIFO theo vật tư), N3 (từ chối phần mua thêm), N4 (4 số lẻ), N5 (đóng "Cần tạo PO" chỉ khi đặt đủ).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
import { prCreateSchema } from "@iot/shared";
import {
  buildPrLedger,
  EMPTY_PO_SUMMARY,
  legacyBackfillApproved,
  planRecheck,
  planRecheckRows,
  summarizePrPos,
  type LedgerLineInput,
} from "./pr-ledger";
import { splitPicksAcrossLines } from "./pr-issue-split";
import { buyQtysSchema } from "./pr-buy-schema";
import { planPOCreatedFromPR, planPRRejected } from "@/server/services/notification-plans";

const po = (status: string, ordered: number, pass: number, pending = 0) =>
  summarizePrPos([{ itemId: "i", poStatus: status, ordered, received: pass + pending, pendingQc: pending, failQc: 0 }]);

describe("N1 — phiếu cũ (130/PRD-MRF/1026): q2, đã xuất 1 từ tồn, rồi lập PO 1", () => {
  it("backfill 0081 (hàm tương đương): approved = đặt hiệu lực kẹp ≤ qty − đã xuất trước PO = 1", () => {
    // PO thật 1 + PO trùng 1 do giám thị tạo → đặt hiệu lực 2, nhưng dòng chỉ còn 1 phải mua.
    expect(legacyBackfillApproved([{ id: "a", itemId: "i", qty: 2, issuedBeforeFirstPo: 1 }], true, new Map([["i", 2]]))).toEqual({
      a: 1,
    });
    expect(legacyBackfillApproved([{ id: "a", itemId: "i", qty: 2 }], false, new Map())).toEqual({ a: 0 });
    expect(legacyBackfillApproved([{ id: "x", itemId: null, qty: 3 }], false, new Map())).toEqual({ x: 3 });
    // 2 dòng cùng vật tư: rót lần lượt
    expect(
      legacyBackfillApproved(
        [
          { id: "a", itemId: "i", qty: 4 },
          { id: "b", itemId: "i", qty: 4 },
        ],
        true,
        new Map([["i", 6]]),
      ),
    ).toEqual({ a: 4, b: 2 });
  });

  it("sau backfill: kết quả KHÔNG đổi theo thứ tự hàng về / xuất (trần 2, còn phải đặt 0)", () => {
    const line = (issued: number): LedgerLineInput => ({ id: "a", itemId: "i", qty: 2, approvedQty: 1, issuedQty: issued });
    const s1 = buildPrLedger([line(1)], po("SENT", 1, 0), "FINAL");
    expect(s1.byId.get("a")).toMatchObject({ cap: 1, remaining: 0, toOrder: 0, waiting: 1 });
    const s2 = buildPrLedger([line(1)], po("RECEIVED", 1, 1), "FINAL"); // hàng về
    expect(s2.byId.get("a")).toMatchObject({ buy: 1, cap: 2, remaining: 1, toOrder: 0 });
    const s3 = buildPrLedger([line(2)], po("RECEIVED", 1, 1), "FINAL"); // xuất hàng vừa về
    expect(s3.complete).toBe(true);
  });

  it("dự phòng khi còn NULL (dữ liệu sót): buy = min(qty, đặt hiệu lực), không đổi khi hàng về", () => {
    const l: LedgerLineInput = { id: "a", itemId: "i", qty: 2, approvedQty: null, issuedQty: 1 };
    const before = buildPrLedger([l], po("SENT", 1, 0), "FINAL").byId.get("a")!;
    const after = buildPrLedger([l], po("RECEIVED", 1, 1), "FINAL").byId.get("a")!;
    expect(before.buy).toBe(1);
    expect(after.buy).toBe(1);
    expect(after).toMatchObject({ cap: 2, remaining: 1, toOrder: 0 });
  });

  it("SQL 0081 idempotent: chỉ chạm dòng approved_qty IS NULL; làm tròn so khác mới ghi (đọc mã nguồn)", () => {
    const sqlText = readFileSync(join(__dirname, "../../../../packages/db/migrations/0081_pr_legacy_buy_backfill.sql"), "utf8");
    expect(sqlText).toContain("ADD COLUMN IF NOT EXISTS approved_qty_prev");
    expect(sqlText).toContain("WHERE l.id = c.id AND l.approved_qty IS NULL");
    expect(sqlText).toContain("AND l.qty <> GREATEST(ROUND(l.qty, 4), 0.0001)");
  });
});

describe("N2 — chia lô FIFO (gợi ý một lần cho tổng) xuống các dòng cùng vật tư", () => {
  it("2 dòng 4 + 2 từ lô A 3 + lô B 5 → dòng 1: A3 + B1; dòng 2: B2 (không lấy trùng lô vượt tồn)", () => {
    const parts = splitPicksAcrossLines(
      [
        { lineId: "l1", qty: 4 },
        { lineId: "l2", qty: 2 },
      ],
      [
        { lotSerialId: "A", binId: "x", qty: 3 },
        { lotSerialId: "B", binId: "x", qty: 5 },
      ],
    );
    expect(parts.get("l1")).toEqual([
      { lotSerialId: "A", binId: "x", qty: 3 },
      { lotSerialId: "B", binId: "x", qty: 1 },
    ]);
    expect(parts.get("l2")).toEqual([{ lotSerialId: "B", binId: "x", qty: 2 }]);
  });
  it("tổng tồn không đủ → dòng sau thiếu (không bịa lô)", () => {
    const parts = splitPicksAcrossLines(
      [
        { lineId: "l1", qty: 4 },
        { lineId: "l2", qty: 2 },
      ],
      [{ lotSerialId: "A", binId: "x", qty: 5 }],
    );
    expect(parts.get("l2")).toEqual([{ lotSerialId: "A", binId: "x", qty: 1 }]);
  });
  it("server kiểm TỔNG theo (vị trí, lô) khi nhiều dòng cùng lô (đọc mã nguồn stockGuard)", () => {
    const src = readFileSync(join(__dirname, "../server/repos/stockGuard.ts"), "utf8");
    expect(src).toContain("// 2) Tổng pick theo (bin, lô) ≤ tồn bin");
  });
});

describe("N3 — từ chối ở duyệt cuối khi đã có PO / đã duyệt trước Kiểm tồn lại", () => {
  it("chỉ bỏ phần mua thêm: khôi phục approved_qty_prev, giữ APPROVED/CONVERTED (đọc mã nguồn)", () => {
    const src = readFileSync(join(__dirname, "../server/repos/purchaseRequests.ts"), "utf8");
    expect(src).toContain("approvedQty: sql`COALESCE(${purchaseRequestLine.approvedQtyPrev}, ${purchaseRequestLine.approvedQty})`");
    expect(src).toContain('status: po ? "CONVERTED" : "APPROVED"');
    expect(src).toContain("approvedQtyPrev: sql`COALESCE(${purchaseRequestLine.approvedQtyPrev}, ${purchaseRequestLine.approvedQty})`");
    // huỷ phiếu: chặn khi còn PO không huỷ ở MỌI trạng thái
    const i = src.indexOf("export async function cancelPR(");
    expect(src.slice(i, i + 2500)).not.toContain('if (pr.status === "APPROVED") {');
  });
  it("thông báo người lập 'phần mua thêm bị từ chối'", () => {
    const p = planPRRejected({
      prId: "p",
      prNo: "PR-1",
      title: null,
      creatorUserId: "u",
      actorUserId: null,
      actorUsername: null,
      reason: "không cần",
      extraOnly: true,
    });
    expect(p.targets[0]!.title).toContain("phần mua thêm bị từ chối");
  });
});

describe("N4 — 4 chữ số thập phân", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("zod: SL đề xuất / SL cần mua > 4 số lẻ bị chặn; tối thiểu 0,0001", () => {
    expect(prCreateSchema.safeParse({ lines: [{ itemName: "x", qty: 2.000049 }] }).success).toBe(false);
    expect(prCreateSchema.safeParse({ lines: [{ itemName: "x", qty: 2.0001 }] }).success).toBe(true);
    expect(prCreateSchema.safeParse({ lines: [{ itemName: "x", qty: 0.00005 }] }).success).toBe(false);
    expect(buyQtysSchema.safeParse({ [id]: 1.23456 }).success).toBe(false);
    expect(buyQtysSchema.safeParse({ [id]: 1.2345 }).success).toBe(true);
  });
  it("sổ làm tròn 4 số lẻ; Kiểm tồn lại chặn add > 4 số lẻ", () => {
    const led = buildPrLedger([{ id: "a", itemId: "i", qty: 2.00004, approvedQty: 2.00004 }], EMPTY_PO_SUMMARY, "FINAL");
    expect(led.toOrder).toBe(2);
    const l2 = buildPrLedger([{ id: "a", itemId: "i", qty: 5, approvedQty: 5 }], EMPTY_PO_SUMMARY, "FINAL");
    const plan = planRecheck(l2, planRecheckRows(l2, new Map([["i", 0]])), { a: 1.23456 });
    expect(plan.ok).toBe(false);
  });
  it("from-pr không bao giờ tạo dòng PO SL 0 (đọc mã nguồn)", () => {
    const src = readFileSync(join(__dirname, "../server/repos/purchaseOrders.ts"), "utf8");
    expect(src).toContain("lines = lines.filter((l) => r4(toOrderOf(l.id)) >= 0.0001);");
  });
});

describe("N5 — PO từ phiếu chỉ đóng 'Cần tạo PO' khi phiếu đã đặt đủ", () => {
  const ctx = { prId: "p", prNo: "PR-1", poCount: 1, firstPoId: "po", actorUserId: null, actorUsername: null };
  it("đặt đủ (mặc định) → hết hiệu lực PR_APPROVED của phiếu", () => {
    expect(planPOCreatedFromPR(ctx).resolveExtraEntityIds).toEqual(["p"]);
  });
  it("đặt một phần → GIỮ PR_APPROVED", () => {
    expect(planPOCreatedFromPR({ ...ctx, prFullyOrdered: false }).resolveExtraEntityIds).toEqual([]);
  });
});
