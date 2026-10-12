/**
 * Đợt sửa lỗi giám thị lần 5 — Đề xuất vật tư: L1 (phiếu cũ approved_qty NULL không giữ chỗ),
 * L2 (Kiểm tồn lại về 0 / finalize), L4 (PO sống = PO đang chờ về), m-a, m-b, m-c. Chỉ hàm THUẦN.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
import {
  buildIssueContext,
  computeCommittedByItem,
  effectiveBuy,
  hasPendingPo,
  issueCapForStage,
  planStockRecheck,
  prIssueRight,
  prLineToPoLine,
  resolveBuyDecisions,
  summarizeBuyDecisions,
  type PrPoSummary,
} from "./procurement-policy";
import { buyQtysSchema } from "./pr-buy-schema";
import { buildBreadcrumbItems } from "./breadcrumb-items";
import { RESOLVES_STALE } from "@/server/services/notification-plans";
import { computePrIssueProgress, validatePrIssuePicks } from "@/server/repos/purchaseRequests";

const L = [{ id: "a", itemId: "i", qty: 10, approvedQty: null as number | null }];
const rcv = (n: number) => new Map([["i", n]]);

describe("L1 — phiếu cũ approved_qty NULL", () => {
  it("NULL có PO chưa nhận: cap 0, giữ chỗ 0", () => {
    const r = prIssueRight(L, { phase: "FINAL", receivedByItem: rcv(0), hasPo: true });
    expect(r.caps.get("a")).toBe(0);
    expect(r.remaining.get("a")).toBe(0);
    expect(r.heldByItem.size).toBe(0);
  });
  it("NULL có PO nhận 5 đạt: cap 5 (xuất được), nhưng KHÔNG giữ chỗ", () => {
    const r = prIssueRight(L, { phase: "FINAL", receivedByItem: rcv(5), hasPo: true });
    expect(r.caps.get("a")).toBe(5);
    expect(r.remaining.get("a")).toBe(5);
    expect(r.remainingByItem.get("i")).toBe(5);
    expect(r.heldByItem.size).toBe(0);
  });
  it("NULL không PO: cap = đề xuất (hành vi cũ), giữ chỗ 0", () => {
    const r = prIssueRight(L, { phase: "FINAL", receivedByItem: rcv(0), hasPo: false });
    expect(r.caps.get("a")).toBe(10);
    expect(r.remaining.get("a")).toBe(10);
    expect(r.heldByItem.size).toBe(0);
  });
  it("cam kết của phiếu cũ = 0; phiếu mới vẫn giữ chỗ", () => {
    const legacy = prIssueRight(L, { phase: "FINAL", receivedByItem: rcv(0), hasPo: false });
    const fresh = prIssueRight([{ id: "b", itemId: "i", qty: 10, approvedQty: 4 }], {
      phase: "FINAL",
      receivedByItem: rcv(0),
      hasPo: false,
    });
    expect(computeCommittedByItem([legacy.heldByItem, fresh.heldByItem]).get("i")).toBe(6);
  });
  it("một nghĩa duy nhất: effectiveBuy(NULL) = qty; prLineToPoLine mua đủ; issueCapForStage khớp", () => {
    expect(effectiveBuy(10, null)).toBe(10);
    expect(prLineToPoLine({ qty: 10, approvedQty: null }, 0)?.orderedQty).toBe(10);
    expect(issueCapForStage("FINAL", 10, null, true)).toBe(0);
    expect(issueCapForStage("FINAL", 10, null, false)).toBe(10);
  });
  it("buildIssueContext: NULL + PO đã đặt → cap 0, outstandingBuy, không giữ chỗ", () => {
    const po: PrPoSummary = {
      hasLivePo: true,
      receivedByItem: new Map(),
      settledByItem: new Map(),
      pendingByItem: new Map([["i", 10]]),
    };
    const c = buildIssueContext("FINAL", [{ ...L[0]!, issuedQty: 0 }], po);
    expect(c.caps.get("a")).toBe(0);
    expect(c.outstandingBuy).toBe(true);
    expect(c.hasPendingPo).toBe(true);
    expect(c.heldByItem.size).toBe(0);
  });
});

describe("L2 — Kiểm tồn lại hạ về 0 + điều kiện Hoàn tất", () => {
  const noPo: PrPoSummary = {
    hasLivePo: false,
    receivedByItem: new Map(),
    settledByItem: new Map(),
    pendingByItem: new Map(),
  };
  it("hạ hết cần mua về 0 → allCovered (bỏ duyệt cuối), không 'increased'", () => {
    const plan = planStockRecheck([{ id: "a", itemId: "i", qty: 10, approvedQty: 4 }], { a: 0 });
    expect(plan.increased).toBe(false);
    expect(summarizeBuyDecisions({ a: 0 }).allCovered).toBe(true);
  });
  it("điều kiện Hoàn tất: xuất đủ cap + không còn mua chưa về", () => {
    const done = [{ id: "a", itemId: "i", qty: 10, approvedQty: 0, issuedQty: 10 }];
    const ctx = buildIssueContext("FINAL", done, noPo);
    expect(ctx.outstandingBuy).toBe(false);
    const p = computePrIssueProgress(
      done.map((l) => ({ ...l, sku: null, cap: ctx.caps.get(l.id) })),
      "FINAL",
      ctx.outstandingBuy,
    );
    expect(p.complete).toBe(true);
  });
  it("còn phần mua chưa có PO → chưa Hoàn tất", () => {
    const open = [{ id: "a", itemId: "i", qty: 10, approvedQty: 4, issuedQty: 6 }];
    const ctx = buildIssueContext("FINAL", open, noPo);
    expect(ctx.outstandingBuy).toBe(true);
    const p = computePrIssueProgress(
      open.map((l) => ({ ...l, sku: null, cap: ctx.caps.get(l.id) })),
      "FINAL",
      ctx.outstandingBuy,
    );
    expect(p.complete).toBe(false);
  });
  it("PR_STOCK_COVERED đóng 'chờ duyệt cuối' và 'Cần tạo PO'", () => {
    expect(RESOLVES_STALE.PR_STOCK_COVERED).toEqual(
      expect.arrayContaining(["PR_DEPT_APPROVED", "PR_APPROVED", "PR_APPROVED_NO_PO_REMINDER"]),
    );
  });
  it("mọi đường ghi khoá vật tư TRƯỚC hàng PR (đọc mã nguồn: recheck)", () => {
    const repo = readFileSync(join(__dirname, "../server/repos/purchaseRequests.ts"), "utf8");
    const i = repo.indexOf("export async function recheckPrStock(");
    const body = repo.slice(i, i + 2500);
    expect(body.indexOf("lockPrItemsForStock")).toBeGreaterThan(-1);
    expect(body.indexOf("lockPrItemsForStock")).toBeLessThan(body.indexOf('.for("update")'));
  });
});

describe("L4 — PO sống = còn chờ hàng về", () => {
  const mk = (pending: Record<string, number>) => ({ pendingByItem: new Map(Object.entries(pending)) });
  it("PO đã đóng/nhận đủ (pending 0) không chặn", () => {
    expect(hasPendingPo(mk({ i: 0 }))).toBe(false);
    expect(hasPendingPo(mk({}))).toBe(false);
  });
  it("còn chờ về → chặn", () => {
    expect(hasPendingPo(mk({ i: 3 }))).toBe(true);
  });
  it("GET và POST dùng cùng một điều kiện (đọc mã nguồn)", () => {
    const get = readFileSync(
      join(__dirname, "../app/api/purchase-requests/[id]/stock-check/route.ts"),
      "utf8",
    );
    const repo = readFileSync(join(__dirname, "../server/repos/purchaseRequests.ts"), "utf8");
    expect(get).toContain("getRecheckPendingPoBlock");
    expect(repo).toMatch(/hasPendingPo\(po\)/);
    expect(repo).toMatch(/hasPendingPo\(await getPrPoSummary/);
  });
});

describe("m-a — buyQtys nhỏ hơn 6 số lẻ", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("0 < v < 0,000001 → lỗi; 0 và ≥ 0,000001 hợp lệ", () => {
    expect(buyQtysSchema.safeParse({ [id]: 0.0000001 }).success).toBe(false);
    expect(buyQtysSchema.safeParse({ [id]: 0 }).success).toBe(true);
    expect(buyQtysSchema.safeParse({ [id]: 0.000001 }).success).toBe(true);
    expect(resolveBuyDecisions([{ id: "a", qty: 5, available: 0, itemId: "i" }], { a: 1e-7 }).ok).toBe(false);
  });
});

describe("m-b — câu OVER_ISSUE theo có/không PO", () => {
  const line = { id: "a", itemId: "i", sku: "SKU", qty: 10, approvedQty: 4, issuedQty: 0 };
  const pick = [{ prLineId: "a", lotSerialId: "l", binId: "b", qty: 9 }];
  const msg = (hasPo: boolean, cap: number) => {
    const r = validatePrIssuePicks([{ ...line, cap }], pick, "FINAL", hasPo);
    return r.ok ? "" : r.error.message;
  };
  it("chưa PO → 'phần xuất từ kho'", () => {
    expect(msg(false, 6)).toContain("phần xuất từ kho");
  });
  it("có PO → 'phần có sẵn + hàng đã về'", () => {
    expect(msg(true, 6)).toContain("phần có sẵn + hàng đã về");
  });
});

describe("m-c — breadcrumb Thu mua trỏ hub hiện có", () => {
  it("/procurement → /sales", () => {
    const items = buildBreadcrumbItems("/procurement/purchase-requests/11111111-1111-4111-8111-111111111111");
    expect(items.find((i) => i.label === "Thu mua")?.href).toBe("/sales");
  });
});
