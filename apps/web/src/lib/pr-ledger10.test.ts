/**
 * Lần 10 — giám thị lần 9: migration 0081 viết lại (M1 Σ SL đặt; M2 phân tồn khả dụng cho phiếu cũ không
 * PO theo thứ tự phiếu) — hàm thuần tương đương; N-a 4 số lẻ cho SL xuất / SL nhận.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { receivingEventSchema } from "@iot/shared";
import {
  buildPrLedger,
  legacyBackfillApproved,
  legacyStockAllocation,
  summarizePrPos,
  type LedgerPoLineRow,
} from "./pr-ledger";

const row = (itemId: string, poStatus: string, ordered: number, pass: number, fail = 0): LedgerPoLineRow => ({
  itemId,
  poStatus,
  ordered,
  received: pass + fail,
  pendingQc: 0,
  failQc: fail,
});

describe("M1 — phiếu cũ CÓ PO: approved = Σ SL ĐẶT (kể cả PO đóng / QC hỏng); phần hỏng / thiếu thành toOrder", () => {
  it("95/PRD-MRF/1026: 2 dòng (12, 5) PO 12 + 5, QC hỏng 7 + 8, đóng → approved 12 / 5, toOrder 7 + 8", () => {
    const appr = legacyBackfillApproved(
      [
        { id: "a", itemId: "A", qty: 12 },
        { id: "b", itemId: "B", qty: 5 },
      ],
      true,
      new Map([
        ["A", 12],
        ["B", 5],
      ]),
    );
    expect(appr).toEqual({ a: 12, b: 5 });
    const led = buildPrLedger(
      [
        { id: "a", itemId: "A", qty: 12, approvedQty: appr.a },
        { id: "b", itemId: "B", qty: 5, approvedQty: appr.b },
      ],
      summarizePrPos([row("A", "CLOSED", 12, 5, 7), row("B", "CLOSED", 5, 0, 8 > 5 ? 5 : 8)]),
      "FINAL",
    );
    expect(led.items.get("A")!.toOrder).toBe(7);
    expect(led.items.get("B")!.toOrder).toBe(5);
  });
  it("20/PRD-MRF/1026: PO 50 đóng sau khi nhận 48 → approved 50, toOrder 2", () => {
    const appr = legacyBackfillApproved([{ id: "a", itemId: "A", qty: 50 }], true, new Map([["A", 50]]));
    expect(appr.a).toBe(50);
    const led = buildPrLedger([{ id: "a", itemId: "A", qty: 50, approvedQty: 50 }], summarizePrPos([row("A", "CLOSED", 50, 48)]), "FINAL");
    expect(led.toOrder).toBe(2);
  });
  it("dự phòng của sổ khi còn NULL dùng cùng ngữ nghĩa (Σ SL đặt)", () => {
    const led = buildPrLedger([{ id: "a", itemId: "A", qty: 50, approvedQty: null }], summarizePrPos([row("A", "CLOSED", 50, 48)]), "FINAL");
    expect(led.byId.get("a")).toMatchObject({ buy: 50, toOrder: 2, cap: 48 });
  });
});

describe("M2 — phiếu cũ KHÔNG PO: phân tồn khả dụng theo thứ tự phiếu tạo trước", () => {
  it("1/0926 (có PO, giữ hàng của mình) và 3/0726 (không PO, cần 2) không chặn nhau", () => {
    // tồn VT-2607-LI9O1 = 1, đang được 1/0926 giữ (hàng PO của chính nó) → tồn khả dụng cho phiếu cũ = 0.
    const r = legacyStockAllocation(
      [{ id: "x", itemId: "LI9O1", qty: 2, issued: 0, prCreatedAt: "2026-07-01", lineNo: 1 }],
      new Map([["LI9O1", 0]]),
    );
    expect(r.x).toEqual({ give: 0, approved: 2 }); // phần thiếu thành cần mua, không giữ chỗ ảo
  });
  it("phiếu tạo trước dùng trước; đã xuất không cần lại; giữ chỗ mới ≤ tồn", () => {
    const r = legacyStockAllocation(
      [
        { id: "late", itemId: "I", qty: 5, issued: 0, prCreatedAt: "2026-09-01", lineNo: 1 },
        { id: "early", itemId: "I", qty: 4, issued: 1, prCreatedAt: "2026-07-01", lineNo: 1 },
        { id: "other", itemId: "J", qty: 2, issued: 0, prCreatedAt: "2026-07-02", lineNo: 1 },
      ],
      new Map([
        ["I", 5],
        ["J", 10],
      ]),
    );
    expect(r.early).toEqual({ give: 3, approved: 0 });
    expect(r.late).toEqual({ give: 2, approved: 3 });
    expect(r.other).toEqual({ give: 2, approved: 0 });
    expect(r.early!.give + r.late!.give).toBeLessThanOrEqual(5);
  });
  it("SQL 0081: một transaction, bảng audit, M1 Σ ordered_qty, M2 window theo created_at (đọc mã nguồn)", () => {
    const s = readFileSync(join(__dirname, "../../../../packages/db/migrations/0081_pr_legacy_buy_backfill.sql"), "utf8");
    expect(s).toMatch(/^BEGIN;/m);
    expect(s).toMatch(/^COMMIT;/m);
    expect(s).toContain("CREATE TABLE IF NOT EXISTS app.pr_line_backfill_0081");
    expect(s).toContain("SUM(pol.ordered_qty) AS q");
    expect(s).toContain("PARTITION BY t.item_id ORDER BY t.pr_created, t.pr_id, t.line_no, t.id");
    expect(s).toContain("AND NOT EXISTS (SELECT 1 FROM app.pr_line_backfill_0081 b WHERE b.pr_line_id = l.id AND b.reason LIKE 'backfill%')");
  });
});

describe("N-a — SL nhận / SL xuất tối đa 4 số lẻ", () => {
  const base = {
    id: "11111111-1111-4111-8111-111111111111",
    scanId: "11111111-1111-4111-8111-111111111112",
    poCode: "PO-1",
    sku: "A",
    scannedAt: new Date().toISOString(),
  };
  it("nhận hàng: 0,00005 / 1,23456 bị chặn; 0,0001 / 1,2345 hợp lệ", () => {
    expect(receivingEventSchema.safeParse({ ...base, qty: 0.00005 }).success).toBe(false);
    expect(receivingEventSchema.safeParse({ ...base, qty: 1.23456 }).success).toBe(false);
    expect(receivingEventSchema.safeParse({ ...base, qty: 0.0001 }).success).toBe(true);
    expect(receivingEventSchema.safeParse({ ...base, qty: 1.2345 }).success).toBe(true);
  });
  it("xuất kho phiếu: pick qty refine 4 số lẻ (đọc mã nguồn route)", () => {
    const s = readFileSync(join(__dirname, "../app/api/purchase-requests/[id]/mark-issued/route.ts"), "utf8");
    expect(s).toContain("Số lượng tối đa 4 chữ số thập phân.");
  });
});
