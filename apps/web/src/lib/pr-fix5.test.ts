/**
 * Đợt sửa lỗi giám thị lần 5 — Đề xuất vật tư: L1 (phiếu cũ approved_qty NULL không giữ chỗ),
 * L2 (Kiểm tồn lại về 0 / finalize), L4 (PO sống = PO đang chờ về), m-a, m-b, m-c. Chỉ hàm THUẦN.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
import { computeCommittedByItem, resolveBuyDecisions } from "./procurement-policy";
import { buildPrLedger, EMPTY_PO_SUMMARY, summarizePrPos } from "./pr-ledger";
import { buyQtysSchema } from "./pr-buy-schema";
import { buildBreadcrumbItems } from "./breadcrumb-items";
import { RESOLVES_STALE } from "@/server/services/notification-plans";
import { validatePrIssuePicks } from "@/server/repos/purchaseRequests";

// Lần 7: các kỳ vọng L1/L2/L4 (prIssueRight/buildIssueContext/hasPendingPo/planStockRecheck…) chuyển sang
// pr-ledger.test.ts (sổ dòng). Ở đây giữ các bất biến còn nguyên nghĩa.
const L = [{ id: "a", itemId: "i", qty: 10, approvedQty: null as number | null, issuedQty: 0 }];
const po = (ordered: number, received: number, status = "SENT") =>
  summarizePrPos([{ itemId: "i", poStatus: status, ordered, received, pendingQc: 0, failQc: 0 }]);

describe("L1 — phiếu cũ approved_qty NULL (sổ dòng)", () => {
  it("NULL có PO chưa nhận: cap 0, không giữ chỗ", () => {
    const r = buildPrLedger(L, po(10, 0), "FINAL");
    expect(r.byId.get("a")!.cap).toBe(0);
    expect(r.heldByItem.size).toBe(0);
  });
  it("NULL có PO nhận 5 đạt: cap 5 xuất được, nhưng KHÔNG giữ chỗ", () => {
    const r = buildPrLedger(L, po(10, 5), "FINAL");
    expect(r.byId.get("a")!.remaining).toBe(5);
    expect(r.heldByItem.size).toBe(0);
  });
  it("cam kết của phiếu cũ = 0; phiếu mới vẫn giữ chỗ", () => {
    const legacy = buildPrLedger(L, EMPTY_PO_SUMMARY, "FINAL");
    const fresh = buildPrLedger([{ id: "b", itemId: "i", qty: 10, approvedQty: 4 }], EMPTY_PO_SUMMARY, "FINAL");
    expect(computeCommittedByItem([legacy.heldByItem, fresh.heldByItem]).get("i")).toBe(6);
  });
});

describe("L2 — khoá + thông báo", () => {
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
  it("GET stock-check?recheck=1 và POST recheck dùng cùng điều kiện sổ dòng (đọc mã nguồn)", () => {
    const get = readFileSync(
      join(__dirname, "../app/api/purchase-requests/[id]/stock-check/route.ts"),
      "utf8",
    );
    const repo = readFileSync(join(__dirname, "../server/repos/purchaseRequests.ts"), "utf8");
    expect(get).toContain("recheckBlockReason(loaded.ledger)");
    expect(repo).toContain("recheckBlockReason(loaded.ledger)");
  });
});

// ĐỔI KỲ VỌNG (lần 9, N4): SL tối đa 4 số lẻ → ngưỡng 0,0001 (thay 0,000001).
describe("m-a — buyQtys nhỏ hơn 4 số lẻ", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("0 < v < 0,0001 → lỗi; 0 và ≥ 0,0001 hợp lệ", () => {
    expect(buyQtysSchema.safeParse({ [id]: 0.00005 }).success).toBe(false);
    expect(buyQtysSchema.safeParse({ [id]: 0 }).success).toBe(true);
    expect(buyQtysSchema.safeParse({ [id]: 0.0001 }).success).toBe(true);
    expect(buyQtysSchema.safeParse({ [id]: 0.000001 }).success).toBe(false);
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
