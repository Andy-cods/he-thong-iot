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
  { id: "l1", itemId: "item-A", sku: "A-01", qty: 10, approvedQty: 0 },
  { id: "l2", itemId: "item-B", sku: "B-01", qty: 5, approvedQty: null },
  { id: "l3", itemId: null, sku: "C-01", qty: 3, approvedQty: null },
];

describe("validatePrIssuePicks", () => {
  it("hợp lệ: cộng dồn theo dòng, cap = qty − SL cần mua (B2: đủ từ kho khi cần mua = 0)", async () => {
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

  it("vượt SL đề xuất → OVER_ISSUE (422)", async () => {
    const { validatePrIssuePicks } = await load();
    const r = validatePrIssuePicks(lines, [
      { prLineId: "l1", lotSerialId: "x", binId: "b", qty: 11 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("OVER_ISSUE");
    expect(r.error.status).toBe(422);
    expect(r.error.message).toContain("A-01");
    expect(r.error.message).toContain("10");
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
      { prLineId: "l1", lotSerialId: "y", binId: "b", qty: 6 },
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

describe("L8 — xuất kho nhiều đợt", () => {
  it("trừ phần đã xuất ở đợt trước khỏi cap (còn lại)", async () => {
    const { validatePrIssuePicks } = await load();
    const ls = [{ id: "l1", itemId: "i", sku: "A-01", qty: 6, approvedQty: null, issuedQty: 2 }];
    const ok = validatePrIssuePicks(ls, [{ prLineId: "l1", lotSerialId: "x", binId: "b", qty: 4 }]);
    expect(ok.ok).toBe(true);
    const over = validatePrIssuePicks(ls, [{ prLineId: "l1", lotSerialId: "x", binId: "b", qty: 4.5 }]);
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.error.code).toBe("OVER_ISSUE");
    expect(over.error.message).toContain("đã xuất");
  });

  it("dòng đã xuất đủ → không xuất thêm", async () => {
    const { validatePrIssuePicks } = await load();
    const r = validatePrIssuePicks(
      [{ id: "l1", itemId: "i", sku: "A-01", qty: 5, approvedQty: 2, issuedQty: 5 }],
      [{ prLineId: "l1", lotSerialId: "x", binId: "b", qty: 1 }],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toContain("đã xuất đủ");
  });

  it("computePrIssueProgress (C3): dòng nhập tay chưa gắn vật tư luôn tính là còn thiếu — chưa hoàn tất sớm", async () => {
    const { computePrIssueProgress } = await load();
    const part = computePrIssueProgress([
      { id: "l1", itemId: "i1", sku: "A", qty: 6, approvedQty: null, issuedQty: 2 },
      { id: "l2", itemId: "i2", sku: "B", qty: 3, approvedQty: null, issuedQty: 3 },
      { id: "l3", itemId: null, sku: "C", qty: 9, approvedQty: null, issuedQty: 0 },
    ]);
    expect(part.complete).toBe(false);
    expect(part.pendingLines).toBe(2);
    expect(part.lines[0]).toMatchObject({ cap: 6, issued: 2, remaining: 4 });

    const stillPending = computePrIssueProgress([
      { id: "l1", itemId: "i1", sku: "A", qty: 5, approvedQty: 2, issuedQty: 5 },
      { id: "l3", itemId: null, sku: "C", qty: 9, approvedQty: null },
    ]);
    expect(stillPending.complete).toBe(false);
    // Sau khi PO gắn vật tư cho dòng nhập tay và Kho xuất đủ → mới hoàn tất.
    const done = computePrIssueProgress([
      { id: "l1", itemId: "i1", sku: "A", qty: 5, approvedQty: 2, issuedQty: 5 },
      { id: "l3", itemId: "i3", sku: "C", qty: 9, approvedQty: null, issuedQty: 9 },
    ]);
    expect(done.complete).toBe(true);
    // Còn phần cần mua chưa về → không hoàn tất dù đã xuất đủ trần.
    expect(
      computePrIssueProgress(
        [{ id: "l1", itemId: "i1", sku: "A", qty: 5, approvedQty: 2, issuedQty: 3, cap: 3 }],
        "FINAL",
        true,
      ).complete,
    ).toBe(false);
  });

  it("computePrIssueProgress: không có dòng gắn vật tư nào → không tự hoàn tất", async () => {
    const { computePrIssueProgress } = await load();
    expect(
      computePrIssueProgress([{ id: "l3", itemId: null, sku: null, qty: 1, approvedQty: null }]).complete,
    ).toBe(false);
  });

  it("sai số làm tròn 4 số lẻ không chặn hoàn tất", async () => {
    const { computePrIssueProgress } = await load();
    expect(
      computePrIssueProgress([
        { id: "l1", itemId: "i", sku: "A", qty: 0.333333, approvedQty: null, issuedQty: 0.3333 },
      ]).complete,
    ).toBe(true);
  });
});

describe("L4 — chỉ nhận hàng khi TẤT CẢ PO xong", () => {
  it("areAllPOsReceived", async () => {
    const { areAllPOsReceived } = await load();
    expect(areAllPOsReceived(["RECEIVED", "SENT"])).toBe(false);
    expect(areAllPOsReceived(["RECEIVED", "PARTIAL"])).toBe(false);
    expect(areAllPOsReceived(["RECEIVED", "RECEIVED"])).toBe(true);
    expect(areAllPOsReceived(["RECEIVED", "CLOSED"])).toBe(true);
    // PO huỷ không tính
    expect(areAllPOsReceived(["RECEIVED", "CANCELLED"])).toBe(true);
    // chỉ toàn PO huỷ / không có PO → chưa coi là đã nhận
    expect(areAllPOsReceived(["CANCELLED"])).toBe(false);
    expect(areAllPOsReceived([])).toBe(false);
  });
});

describe("L6/L9/L10/L13 — helper thuần", () => {
  it("cancelBlockedMessage: REJECTED không bảo 'không có quyền'", async () => {
    const { cancelBlockedMessage } = await load();
    const m = cancelBlockedMessage("REJECTED");
    expect(m).toContain("từ chối");
    expect(m).toContain("Tạo lại");
    expect(cancelBlockedMessage("CANCELLED")).toContain("đã huỷ");
  });

  it("isItemUsableForPR: chỉ ACTIVE và chưa vô hiệu hoá", async () => {
    const { isItemUsableForPR } = await load();
    expect(isItemUsableForPR({ status: "ACTIVE", isActive: true })).toBe(true);
    expect(isItemUsableForPR({ status: "ACTIVE", isActive: false })).toBe(false);
    expect(isItemUsableForPR({ status: "OBSOLETE", isActive: true })).toBe(false);
    expect(isItemUsableForPR({ status: "DRAFT", isActive: true })).toBe(false);
  });

  it("escapeLike: % _ \\ của người dùng không thành wildcard", async () => {
    const { escapeLike } = await load();
    expect(escapeLike("50%_x")).toBe("50\\%\\_x");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
    expect(escapeLike("Tấm nhôm")).toBe("Tấm nhôm");
  });
});
