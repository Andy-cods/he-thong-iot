/**
 * V4.2 (TASK "Trừ tồn luôn") — vitest cho `validatePrIssuePicks`, hàm THUẦN
 * kiểm picks xuất kho khi Kho bấm "Đã xuất kho" trên phiếu Đề xuất vật tư
 * (PR/YCVT/DNVT). Cùng mẫu `validateMrIssue` trong `goodsIssues.test.ts`.
 *
 * Không chạm DB — `markPRGoodsIssuedWithStock` (transaction thật, dùng
 * `createGoodsIssueTx`/`assertIssuable` đã có vitest riêng ở
 * `goodsIssues.test.ts`/`stockGuard.test.ts`) chỉ kiểm bằng smoke test tay
 * trên prod (xem báo cáo cuối).
 */
import { describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  vi.doMock("@/lib/db", () => ({ db: {} }));
  return import("./purchaseRequests");
}

const lines = [
  { id: "l1", itemId: "item-A", sku: "A-01", qty: 10, approvedQty: 8 },
  { id: "l2", itemId: "item-B", sku: "B-01", qty: 5, approvedQty: null },
  { id: "l3", itemId: null, sku: "C-01", qty: 3, approvedQty: null },
];

describe("validatePrIssuePicks", () => {
  it("hợp lệ: cộng dồn theo dòng, cap = approvedQty khi có", async () => {
    const { validatePrIssuePicks } = await load();
    const r = validatePrIssuePicks(lines, [
      { prLineId: "l1", lotSerialId: "lot-1", binId: "bin-1", qty: 3 },
      { prLineId: "l1", lotSerialId: "lot-2", binId: "bin-2", qty: 5 },
      { prLineId: "l2", lotSerialId: "lot-3", binId: "bin-1", qty: 5 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.picks).toHaveLength(3);
    expect(r.picks.filter((p) => p.purchaseRequestLineId === "l1")).toHaveLength(2);
    expect(r.picks.every((p) => p.itemId === "item-A" || p.itemId === "item-B")).toBe(
      true,
    );
  });

  it("vượt SL đã duyệt (approvedQty) → OVER_ISSUE (422)", async () => {
    const { validatePrIssuePicks } = await load();
    const r = validatePrIssuePicks(lines, [
      { prLineId: "l1", lotSerialId: "x", binId: "b", qty: 9 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("OVER_ISSUE");
    expect(r.error.status).toBe(422);
    expect(r.error.message).toContain("A-01");
    expect(r.error.message).toContain("8");
  });

  it("vượt SL đề xuất khi chưa có approvedQty → OVER_ISSUE", async () => {
    const { validatePrIssuePicks } = await load();
    const r = validatePrIssuePicks(lines, [
      { prLineId: "l2", lotSerialId: "x", binId: "b", qty: 5.5 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("OVER_ISSUE");
  });

  it("cộng dồn nhiều pick cùng dòng vượt cap → OVER_ISSUE", async () => {
    const { validatePrIssuePicks } = await load();
    const r = validatePrIssuePicks(lines, [
      { prLineId: "l1", lotSerialId: "x", binId: "b", qty: 5 },
      { prLineId: "l1", lotSerialId: "y", binId: "b", qty: 4 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("OVER_ISSUE");
  });

  it("dòng chưa gắn vật tư trong danh mục (itemId null) → LINE_NO_MASTER_ITEM", async () => {
    const { validatePrIssuePicks } = await load();
    const r = validatePrIssuePicks(lines, [
      { prLineId: "l3", lotSerialId: "x", binId: "b", qty: 1 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("LINE_NO_MASTER_ITEM");
    expect(r.error.message).toContain("C-01");
  });

  it("dòng không thuộc phiếu → LINE_NOT_IN_REQUEST (400)", async () => {
    const { validatePrIssuePicks } = await load();
    const r = validatePrIssuePicks(lines, [
      { prLineId: "khac", lotSerialId: "x", binId: "b", qty: 1 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("LINE_NOT_IN_REQUEST");
    expect(r.error.status).toBe(400);
  });

  it("SL ≤ 0 → INVALID_QTY; không có pick → EMPTY_ISSUE", async () => {
    const { validatePrIssuePicks } = await load();
    const a = validatePrIssuePicks(lines, [
      { prLineId: "l1", lotSerialId: "x", binId: "b", qty: 0 },
    ]);
    expect(a.ok ? null : a.error.code).toBe("INVALID_QTY");
    const b = validatePrIssuePicks(lines, []);
    expect(b.ok ? null : b.error.code).toBe("EMPTY_ISSUE");
    expect(b.ok ? null : b.error.status).toBe(400);
  });

  it("đúng bằng cap (sai số thập phân) vẫn hợp lệ", async () => {
    const { validatePrIssuePicks } = await load();
    const r = validatePrIssuePicks(
      [{ id: "l1", itemId: "i", sku: null, qty: 0.3, approvedQty: null }],
      [
        { prLineId: "l1", lotSerialId: "x", binId: "b", qty: 0.1 },
        { prLineId: "l1", lotSerialId: "y", binId: "b", qty: 0.2 },
      ],
    );
    expect(r.ok).toBe(true);
  });
});
