/**
 * Đợt sửa lỗi giám thị lần 2 — Đề xuất vật tư (C1, C2, C3, C4, T2, M3, N2, N5).
 * Chỉ test hàm THUẦN (không DB).
 */
import { describe, expect, it } from "vitest";
import {
  allocatePoolToLines,
  allocateStockAcrossLines,
  buildIssueContext,
  issueCapForStage,
  parseDateParam,
  resolveBuyDecisions,
  validateStockCommitment,
  warehouseIssuableRemaining,
  type PrPoSummary,
} from "./procurement-policy";
import {
  isClosedByPartialReject,
  recreateQuantities,
  rejectOutcome,
  shouldNotifyReadyToIssue,
} from "./pr-close-policy";
import { buyQtysSchema } from "./pr-buy-schema";
import { prListQuerySchema } from "@iot/shared";
import { planPRReadyToIssue, staleEventTypesToClose } from "@/server/services/notification-plans";

const noPo: PrPoSummary = {
  hasLivePo: false,
  receivedByItem: new Map(),
  settledByItem: new Map(),
  pendingByItem: new Map(),
};
/** `ordered` = SL đã đặt theo vật tư trên PO sống (mặc định = mọi vật tư đang test đặt 6). */
const po = (
  received: Record<string, number>,
  settled?: Record<string, number>,
  ordered: Record<string, number> = { i: 6 },
): PrPoSummary => ({
  hasLivePo: true,
  receivedByItem: new Map(Object.entries(received)),
  settledByItem: new Map(Object.entries(settled ?? received)),
  pendingByItem: new Map(
    Object.entries(ordered).map(([k, v]) => [k, Math.max(0, v - (received[k] ?? 0))]),
  ),
});

describe("C1 — shouldNotifyReadyToIssue", () => {
  const base = {
    reason: "goods_received" as const,
    pr: { status: "CONVERTED", completedAt: null, goodsIssuedAt: null },
    poStatuses: ["RECEIVED"],
    pendingQcLines: 0,
    issuableRemaining: 5,
    alreadyNotifiedGoodsReceived: false,
  };
  it("báo khi mọi PO sống đã nhận đủ + hết lô chờ QC + còn phần xuất được", () => {
    expect(shouldNotifyReadyToIssue(base)).toBe(true);
  });
  it("chưa báo khi còn lô chờ QC (hàng chưa xuất được)", () => {
    expect(shouldNotifyReadyToIssue({ ...base, pendingQcLines: 2 })).toBe(false);
  });
  it("QC đạt xong (pendingQc = 0) thì báo — dù mốc 'đã nhận' đã set từ trước", () => {
    expect(shouldNotifyReadyToIssue({ ...base, pendingQcLines: 0 })).toBe(true);
  });
  it("PO CANCELLED bỏ qua; còn PO PARTIAL thì chưa báo; đóng PO (CLOSED) tính là xong", () => {
    expect(shouldNotifyReadyToIssue({ ...base, poStatuses: ["RECEIVED", "CANCELLED"] })).toBe(true);
    expect(shouldNotifyReadyToIssue({ ...base, poStatuses: ["RECEIVED", "PARTIAL"] })).toBe(false);
    expect(shouldNotifyReadyToIssue({ ...base, poStatuses: ["CLOSED", "RECEIVED"] })).toBe(true);
    expect(shouldNotifyReadyToIssue({ ...base, poStatuses: ["CANCELLED"] })).toBe(false);
    expect(shouldNotifyReadyToIssue({ ...base, poStatuses: [] })).toBe(false);
  });
  it("idempotent: đã báo 'hàng về' rồi thì không báo lại", () => {
    expect(shouldNotifyReadyToIssue({ ...base, alreadyNotifiedGoodsReceived: true })).toBe(false);
  });
  it("không báo khi phiếu đã xuất xong / hoàn tất / huỷ / hết phần xuất", () => {
    expect(shouldNotifyReadyToIssue({ ...base, pr: { ...base.pr, goodsIssuedAt: new Date() } })).toBe(false);
    expect(shouldNotifyReadyToIssue({ ...base, pr: { ...base.pr, completedAt: new Date() } })).toBe(false);
    expect(shouldNotifyReadyToIssue({ ...base, pr: { ...base.pr, status: "CANCELLED" } })).toBe(false);
    expect(shouldNotifyReadyToIssue({ ...base, issuableRemaining: 0 })).toBe(false);
  });
  it("reason approved không cần PO/QC", () => {
    expect(
      shouldNotifyReadyToIssue({ ...base, reason: "approved", poStatuses: [], pendingQcLines: 3 }),
    ).toBe(true);
  });
  it("plan không dùng 'system' làm actor; goods_received mang dấu 'hàng mua đã về'", () => {
    const plan = planPRReadyToIssue({
      prId: "p",
      prNo: "PR-1",
      creatorUserId: null,
      actorUserId: null,
      reason: "goods_received",
    });
    expect(plan.actorUserId).toBeNull();
    expect(plan.targets[0]!.title).toContain("hàng mua đã về");
  });
  it("N3 — stock_covered không nói 'đã duyệt cuối'", () => {
    const plan = planPRReadyToIssue({
      prId: "p",
      prNo: "PR-1",
      creatorUserId: null,
      actorUserId: null,
      reason: "stock_covered",
    });
    const c = plan.targets[0]!;
    expect(c.title).toContain("đủ từ tồn");
    expect(`${c.title} ${c.message}`).not.toMatch(/duyệt cuối/);
  });
});

describe("C2 — từ chối khi đã xuất sớm", () => {
  it("rejectOutcome: có phiếu xuất → chốt ở phần đã xuất; không → từ chối như cũ", () => {
    expect(rejectOutcome(0)).toBe("REJECT");
    expect(rejectOutcome(1)).toBe("CLOSE_AT_ISSUED");
  });
  it("isClosedByPartialReject", () => {
    expect(isClosedByPartialReject({ completedAt: new Date(), rejectedAt: new Date(), status: "APPROVED" })).toBe(true);
    expect(isClosedByPartialReject({ completedAt: null, rejectedAt: new Date(), status: "REJECTED" })).toBe(false);
    expect(isClosedByPartialReject({ completedAt: new Date(), rejectedAt: null, status: "APPROVED" })).toBe(false);
  });
  it("recreateQuantities: SL = đề xuất − đã xuất, bỏ dòng = 0", () => {
    const r = recreateQuantities(
      [
        { id: "a", qty: 10 },
        { id: "b", qty: 4 },
        { id: "c", qty: 7 },
      ],
      new Map([
        ["a", 6],
        ["b", 4],
      ]),
    );
    expect(r.kept.map((k) => [k.line.id, k.qty])).toEqual([
      ["a", 4],
      ["c", 7],
    ]);
    expect(r.dropped.map((l) => l.id)).toEqual(["b"]);
  });
});

describe("C3 — dòng nhập tay & điều kiện hoàn tất", () => {
  it("resolveBuyDecisions: dòng không có vật tư bị ép = SL đề xuất, bỏ qua override", () => {
    const r = resolveBuyDecisions(
      [
        { id: "a", qty: 10, available: 100, itemId: "i1" },
        { id: "b", qty: 5, available: 0, itemId: null },
      ],
      { b: 0 },
    );
    expect(r).toEqual({ ok: true, decisions: { a: 0, b: 5 } });
  });
  it("buildIssueContext: dòng cần mua chưa có PO → outstandingBuy (không hoàn tất)", () => {
    const lines = [{ id: "a", itemId: "i1", qty: 10, approvedQty: 6, issuedQty: 4 }];
    expect(buildIssueContext("FINAL", lines, noPo).outstandingBuy).toBe(true);
  });
  it("PO đã về đủ → hết outstanding; PO chưa về → còn", () => {
    const lines = [{ id: "a", itemId: "i1", qty: 10, approvedQty: 6, issuedQty: 4 }];
    expect(buildIssueContext("FINAL", lines, po({ i1: 6 })).outstandingBuy).toBe(false);
    expect(buildIssueContext("FINAL", lines, po({ i1: 2 })).outstandingBuy).toBe(true);
  });
  it("PO đã đóng (NCC không giao nữa) tính là hết chờ", () => {
    const lines = [{ id: "a", itemId: "i1", qty: 10, approvedQty: 6, issuedQty: 4 }];
    expect(buildIssueContext("FINAL", lines, po({ i1: 2 }, { i1: 6 })).outstandingBuy).toBe(false);
  });
  it("dòng nhập tay chưa gắn vật tư (buy = qty) → còn outstanding", () => {
    const lines = [{ id: "x", itemId: null, qty: 3, approvedQty: 3, issuedQty: 0 }];
    expect(buildIssueContext("FINAL", lines, po({})).outstandingBuy).toBe(true);
  });
  it("đã xuất đủ đề xuất từ tồn → không cần mua nữa", () => {
    const lines = [{ id: "a", itemId: "i1", qty: 10, approvedQty: 6, issuedQty: 10 }];
    expect(buildIssueContext("FINAL", lines, noPo).outstandingBuy).toBe(false);
  });
});

describe("C4 — phân bổ tồn lũy kế theo vật tư", () => {
  const lines = [
    { id: "a", itemId: "i1", qty: 6 },
    { id: "b", itemId: "i1", qty: 6 },
    { id: "c", itemId: "i2", qty: 3 },
  ];
  const stock = new Map([
    ["i1", 8],
    ["i2", 100],
  ]);
  it("dòng sau chỉ thấy phần tồn còn lại sau dòng trước", () => {
    const a = allocateStockAcrossLines(lines, stock);
    expect(a.get("a")).toBe(8);
    expect(a.get("b")).toBe(2);
    expect(a.get("c")).toBe(100);
  });
  it("hai dòng cùng vật tư tồn 8: cần mua mặc định 0 và 4 (không phải 0 và 0)", () => {
    const a = allocateStockAcrossLines(lines, stock);
    const r = resolveBuyDecisions(
      lines.map((l) => ({ ...l, available: a.get(l.id) })),
      undefined,
    );
    expect(r).toEqual({ ok: true, decisions: { a: 0, b: 4, c: 0 } });
  });
  it("validateStockCommitment: tổng xuất từ kho theo vật tư vượt tồn → thông báo tiếng Việt", () => {
    const msg = validateStockCommitment(
      lines.map((l) => ({ ...l, label: l.itemId === "i1" ? "VT-01" : "VT-02" })),
      { a: 0, b: 0, c: 0 },
      stock,
    );
    expect(msg).toContain("Vật tư VT-01");
    expect(msg).toContain("chỉ còn 8 khả dụng");
    expect(msg).toContain("đang xuất từ kho 12");
  });
  it("validateStockCommitment: hợp lệ → null", () => {
    expect(validateStockCommitment(lines, { a: 0, b: 4, c: 0 }, stock)).toBeNull();
  });
});

describe("T2 — trần xuất khi đã có PO sống", () => {
  it("không có PO → trần = đề xuất như cũ", () => {
    expect(issueCapForStage("FINAL", 10, 6)).toBe(10);
    expect(buildIssueContext("FINAL", [{ id: "a", itemId: "i", qty: 10, approvedQty: 6 }], noPo).caps.get("a")).toBe(10);
  });
  it("L3: qty 10, cần mua 6, PO 6 chưa về → trần 4", () => {
    const c = buildIssueContext("FINAL", [{ id: "a", itemId: "i", qty: 10, approvedQty: 6 }], po({}));
    expect(c.caps.get("a")).toBe(4);
  });
  it("L3: PO về một phần (2/6) → trần = 10 − 4 chờ = 6", () => {
    const c = buildIssueContext("FINAL", [{ id: "a", itemId: "i", qty: 10, approvedQty: 6 }], po({ i: 2 }));
    expect(c.caps.get("a")).toBe(6);
  });
  it("L3: Kho đã xuất vượt phần có sẵn (7), PO 3 chưa về → trần 7; về 3 → 10", () => {
    const line = { id: "a", itemId: "i", qty: 10, approvedQty: 3, issuedQty: 7 };
    expect(buildIssueContext("FINAL", [line], po({}, undefined, { i: 3 })).caps.get("a")).toBe(7);
    expect(buildIssueContext("FINAL", [line], po({ i: 3 }, undefined, { i: 3 })).caps.get("a")).toBe(10);
  });
  it("L3: PO đã đóng không còn chờ → trần = đề xuất; không có PO sống → qty", () => {
    const closed: PrPoSummary = {
      hasLivePo: true,
      receivedByItem: new Map(),
      settledByItem: new Map([["i", 6]]),
      pendingByItem: new Map([["i", 0]]),
    };
    expect(buildIssueContext("FINAL", [{ id: "a", itemId: "i", qty: 10, approvedQty: 6 }], closed).caps.get("a")).toBe(10);
    expect(issueCapForStage("FINAL", 10, 6, null)).toBe(10);
    expect(issueCapForStage("FINAL", 10, 6, 99)).toBe(0);
    expect(issueCapForStage("FINAL", 10, 6, -5)).toBe(10);
  });
  it("PO về đủ/vượt → trần tối đa = đề xuất", () => {
    const c = buildIssueContext("FINAL", [{ id: "a", itemId: "i", qty: 10, approvedQty: 6 }], po({ i: 9 }, undefined, { i: 6 }));
    expect(c.caps.get("a")).toBe(10);
  });
  it("hai dòng cùng vật tư: hàng đã nhận phân bổ lần lượt theo dòng", () => {
    const lines = [
      { id: "a", itemId: "i", qty: 5, approvedQty: 5 },
      { id: "b", itemId: "i", qty: 5, approvedQty: 5 },
    ];
    const alloc = allocatePoolToLines(lines, new Map([["i", 7]]));
    expect(alloc.get("a")).toBe(5);
    expect(alloc.get("b")).toBe(2);
  });
  it("warehouseIssuableRemaining dùng trần truyền vào", () => {
    expect(
      warehouseIssuableRemaining(
        [{ qty: 10, approvedQty: 6, issuedQty: 4, hasItem: true, cap: 4 }],
        "FINAL",
      ),
    ).toBe(0);
  });
  it("giai đoạn Kho không đổi", () => {
    expect(issueCapForStage("WAREHOUSE", 10, 6)).toBe(4);
  });
});

describe("M3 — buyQtys không coerce", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("null / chuỗi rỗng / chữ → lỗi; số hợp lệ → ok", () => {
    expect(buyQtysSchema.safeParse({ [id]: null }).success).toBe(false);
    expect(buyQtysSchema.safeParse({ [id]: "" }).success).toBe(false);
    expect(buyQtysSchema.safeParse({ [id]: "5" }).success).toBe(false);
    expect(buyQtysSchema.safeParse({ [id]: -1 }).success).toBe(false);
    expect(buyQtysSchema.safeParse({ [id]: Infinity }).success).toBe(false);
    expect(buyQtysSchema.safeParse({ [id]: 5 }).success).toBe(true);
    expect(buyQtysSchema.safeParse({ [id]: 0 }).success).toBe(true);
  });
  it("thông báo lỗi tiếng Việt", () => {
    const r = buyQtysSchema.safeParse({ [id]: null });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toMatch(/SL cần mua/);
    const inf = buyQtysSchema.safeParse({ [id]: Infinity });
    if (!inf.success) expect(inf.error.issues[0]!.message).toMatch(/hữu hạn/);
  });
});

describe("N2 — ngày không tồn tại", () => {
  it("parseDateParam: 2026-02-30 → invalid; 2026-02-28 ok", () => {
    expect(parseDateParam("2026-02-30")).toBe("invalid");
    expect(parseDateParam("2026-02-28")).toBeInstanceOf(Date);
  });
  it("prListQuerySchema từ chối from/to/date không có thật", () => {
    expect(prListQuerySchema.safeParse({ from: "2026-02-30" }).success).toBe(false);
    expect(prListQuerySchema.safeParse({ date: "2026-13-01" }).success).toBe(false);
    expect(prListQuerySchema.safeParse({ from: "2026-02-28", to: "2026-03-01" }).success).toBe(true);
  });
});

describe("N5 — tạo PO không đóng bản _INFO", () => {
  it("PO_CREATED_FROM_PR chỉ đóng bản 'cần làm'", () => {
    const types = staleEventTypesToClose({
      eventType: "PO_CREATED_FROM_PR",
      entityType: "purchase_order",
      keepInfoOnResolve: true,
      targets: [],
    });
    expect(types).toContain("PR_APPROVED");
    expect(types).not.toContain("PR_APPROVED_INFO");
  });
  it("mặc định vẫn đóng cả _INFO", () => {
    const types = staleEventTypesToClose({
      eventType: "PR_APPROVED",
      entityType: "purchase_request",
      targets: [],
    });
    expect(types).toContain("PR_SUBMITTED_INFO");
  });
});
