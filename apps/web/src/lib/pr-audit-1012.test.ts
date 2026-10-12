import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
import { prCreateSchema, prUpdateSchema } from "@iot/shared";
import {
  canCreatePoFromPr,
  canRejectAtStep,
  convertBlockedMessage,
  defaultBuyQty,
  effectiveApprovedQty,
  isRealIsoDate,
  isRequestReasonMissing,
  isWarehouseIssueStage,
  prHasGoodsIssueMessage,
  resolveBuyDecisions,
  shouldRevertPrAfterPoCancel,
  summarizeBuyDecisions,
  validateExportRange,
} from "./procurement-policy";
import { buildPrLedger, EMPTY_PO_SUMMARY, type PrIssuePhase } from "./pr-ledger";

// Lần 7 — prLineToPoLine / issueCapForStage / warehouseIssuableRemaining / computePrIssueProgress thay bằng
// SỔ DÒNG. Bộ chuyển đổi: phiếu chưa có PO.
const led = (
  l: { qty: number; approvedQty: number | null; issuedQty?: number; itemId?: string | null },
  phase: PrIssuePhase = "FINAL",
) => buildPrLedger([{ id: "x", itemId: l.itemId === undefined ? "i" : l.itemId, ...l }], EMPTY_PO_SUMMARY, phase);
const toOrder = (l: { qty: number; approvedQty: number | null }, issued = 0) =>
  led({ ...l, issuedQty: issued }).byId.get("x")!.toOrder;
const capOf = (phase: PrIssuePhase, qty: number, approvedQty: number | null) =>
  led({ qty, approvedQty }, phase).byId.get("x")!.cap;
import {
  INFO_EVENT_SUFFIX,
  ACTION_EVENT_TYPES,
  RESOLVES_STALE,
  baseEventType,
  categoryForEventType,
  categoryForDelivery,
  planPRApproved,
  planPRReadyToIssue,
  planPRStockCovered,
  planPRDeptApproved,
  planPOCancelled,
  storedEventType,
} from "../server/services/notification-plans";
import { validatePrIssuePicks } from "../server/repos/purchaseRequests";

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const line = { itemName: "Ốc vít", qty: 5 };

describe("A1 — approvedQty", () => {
  it("prUpdateSchema bỏ qua approvedQty do client gửi", () => {
    const r = prUpdateSchema.parse({ lines: [{ ...line, approvedQty: 500 }] });
    expect(r.lines?.[0]).not.toHaveProperty("approvedQty");
  });
  it("kẹp approvedQty ≤ qty (dữ liệu cũ qty 5 / duyệt 500)", () => {
    expect(effectiveApprovedQty(5, 500)).toBe(5);
    expect(effectiveApprovedQty(5, null)).toBeNull();
    expect(toOrder({ qty: 5, approvedQty: 500 })).toBe(5);
  });
});

describe("PO chỉ mua phần còn thiếu", () => {
  it("toOrder = min(SL cần mua − đã đặt, đề xuất − đã xuất)", () => {
    expect(toOrder({ qty: 10, approvedQty: 4 }, 6)).toBe(4);
    expect(toOrder({ qty: 10, approvedQty: 4 }, 8)).toBe(2);
    expect(toOrder({ qty: 10, approvedQty: null }, 3)).toBe(7);
    expect(toOrder({ qty: 10, approvedQty: 0 }, 0)).toBe(0);
    expect(toOrder({ qty: 10, approvedQty: null }, 10)).toBe(0);
  });
});

describe("Kho kiểm tồn — SL cần mua", () => {
  it("mặc định = max(0, đề xuất − khả dụng)", () => {
    expect(defaultBuyQty(10, 4)).toBe(6);
    expect(defaultBuyQty(10, 25)).toBe(0);
    expect(defaultBuyQty(10, null)).toBe(10);
  });
  const lines = [
    { id: "a", qty: 10, available: 4 },
    { id: "b", qty: 3, available: 9 },
  ];
  it("dùng mặc định + override hợp lệ", () => {
    const r = resolveBuyDecisions(lines, { a: 2 });
    expect(r).toEqual({ ok: true, decisions: { a: 2, b: 0 } });
  });
  it("từ chối ngoài 0..qty và dòng lạ", () => {
    expect(resolveBuyDecisions(lines, { a: 11 }).ok).toBe(false);
    expect(resolveBuyDecisions(lines, { a: -1 }).ok).toBe(false);
    expect(resolveBuyDecisions(lines, { zzz: 1 }).ok).toBe(false);
  });
  it("tóm tắt có sẵn / cần mua + allCovered", () => {
    expect(summarizeBuyDecisions({ a: 2, b: 0 })).toEqual({ coveredLines: 1, buyLines: 1, allCovered: false });
    expect(summarizeBuyDecisions({ a: 0, b: 0 }).allCovered).toBe(true);
  });
});

describe("Xuất kho theo giai đoạn", () => {
  it("nhận diện giai đoạn Kho", () => {
    expect(isWarehouseIssueStage({ status: "SUBMITTED", approvalStep: "DEPT_APPROVED" })).toBe(true);
    expect(isWarehouseIssueStage({ status: "SUBMITTED", approvalStep: "SUBMITTED" })).toBe(false);
    expect(isWarehouseIssueStage({ status: "APPROVED", approvalStep: "DIRECTOR_APPROVED" })).toBe(false);
  });
  it("trần nền = qty − cần mua (B2: sau duyệt cuối chưa có PO vẫn thế)", () => {
    expect(capOf("WAREHOUSE", 10, 4)).toBe(6);
    expect(capOf("WAREHOUSE", 10, null)).toBe(0);
    expect(capOf("FINAL", 10, 4)).toBe(6);
  });
  const states = [{ id: "l1", itemId: "i", sku: "S", qty: 10, approvedQty: 4, issuedQty: 0, cap: 6 }];
  const pick = (qty: number) => [{ prLineId: "l1", lotSerialId: "x", binId: "y", qty }];
  it("giai đoạn Kho: xuất ≤ 6 ok, 7 vượt", () => {
    expect(validatePrIssuePicks(states, pick(6), "WAREHOUSE").ok).toBe(true);
    expect(validatePrIssuePicks(states, pick(7), "WAREHOUSE").ok).toBe(false);
  });
  it("B2 — sau duyệt cuối chưa có PO: trần vẫn qty − cần mua (6), không phải qty", () => {
    expect(validatePrIssuePicks(states, pick(6), "FINAL").ok).toBe(true);
    expect(validatePrIssuePicks(states, pick(7), "FINAL").ok).toBe(false);
  });
  it("giai đoạn Kho: xuất đủ phần từ kho → hết dòng chờ xuất nhưng phiếu KHÔNG hoàn tất", () => {
    const w = led({ qty: 10, approvedQty: 4, issuedQty: 6 }, "WAREHOUSE");
    expect(w.pendingLines).toBe(0);
    expect(w.complete).toBe(false);
    // sau duyệt cuối còn phần cần mua chưa đặt (toOrder 4) → chưa hoàn tất
    expect(led({ qty: 10, approvedQty: 4, issuedQty: 6 }, "FINAL").complete).toBe(false);
  });
  it("phần còn xuất được (thông báo Kho)", () => {
    const rem = (approvedQty: number | null, issuedQty = 0, hasItem = true, phase: PrIssuePhase = "WAREHOUSE") =>
      led({ qty: 10, approvedQty, issuedQty, itemId: hasItem ? "i" : null }, phase).totalRemaining;
    expect(rem(4)).toBe(6);
    expect(rem(10)).toBe(0);
    expect(rem(4, 6)).toBe(0);
    expect(rem(4, 0, false)).toBe(0);
    expect(rem(null, 3, true, "FINAL")).toBe(7);
  });
});

describe("A2 — huỷ hết PO → PR về APPROVED", () => {
  it("chỉ khi CONVERTED và mọi PO đã huỷ", () => {
    expect(shouldRevertPrAfterPoCancel("CONVERTED", ["CANCELLED", "CANCELLED"])).toBe(true);
    expect(shouldRevertPrAfterPoCancel("CONVERTED", ["CANCELLED", "SENT"])).toBe(false);
    expect(shouldRevertPrAfterPoCancel("APPROVED", ["CANCELLED"])).toBe(false);
  });
});

describe("A3 — thông báo chặn huỷ/xoá khi có PX", () => {
  it("nêu số phiếu xuất", () => {
    expect(prHasGoodsIssueMessage(["PX-1"], "cancel")).toContain("PX-1");
    expect(prHasGoodsIssueMessage(["PX-1"], "delete")).toContain("không xoá được");
  });
});

describe("A8 — từ chối đúng bước", () => {
  it("SUBMITTED: Kho/admin; DEPT_APPROVED: Mua hàng/admin", () => {
    expect(canRejectAtStep("SUBMITTED", ["purchaser"])).toBe(false);
    expect(canRejectAtStep("SUBMITTED", ["warehouse"])).toBe(true);
    expect(canRejectAtStep("DEPT_APPROVED", ["warehouse"])).toBe(false);
    expect(canRejectAtStep("DEPT_APPROVED", ["purchaser"])).toBe(true);
    expect(canRejectAtStep("DEPT_APPROVED", ["admin"])).toBe(true);
    expect(canRejectAtStep("DRAFT", ["admin"])).toBe(false);
  });
});

describe("A12 — kiểm đầu vào", () => {
  it("neededBy/ngày giao sai → lỗi zod, không ném RangeError", () => {
    for (const bad of ["abc", "31/12/2026"]) {
      const r = prCreateSchema.safeParse({ lines: [{ ...line, neededBy: bad }] });
      expect(r.success).toBe(false);
    }
  });
  it("ngày quá xa (9999-12-31) bị từ chối, ngày gần ok", () => {
    expect(prCreateSchema.safeParse({ lines: [{ ...line, neededBy: "9999-12-31" }] }).success).toBe(false);
    expect(prCreateSchema.safeParse({ lines: [{ ...line, neededBy: tomorrow() }] }).success).toBe(true);
  });
  it("qty làm tròn về 0 bị từ chối", () => {
    expect(prCreateSchema.safeParse({ lines: [{ itemName: "x", qty: 0.0000001 }] }).success).toBe(false);
    // ĐỔI KỲ VỌNG (lần 9, N4): tối thiểu 0,0001 (4 số lẻ).
    expect(prCreateSchema.safeParse({ lines: [{ itemName: "x", qty: 0.0001 }] }).success).toBe(true);
    expect(prCreateSchema.safeParse({ lines: [{ itemName: "x", qty: 0.000001 }] }).success).toBe(false);
  });
  it("khoảng ngày Excel", () => {
    expect(isRealIsoDate("2026-02-30")).toBe(false);
    expect(isRealIsoDate("2026-02-28")).toBe(true);
    expect(validateExportRange("2026-02-30", "2026-03-01", "2026-10-12")).not.toBeNull();
    expect(validateExportRange("2026-05-01", "2026-04-01", "2026-10-12")).not.toBeNull();
    expect(validateExportRange("2026-01-01", "9999-12-31", "2026-10-12")).not.toBeNull();
    expect(validateExportRange("2026-01-01", "2026-10-01", "2026-10-12")).toBeNull();
  });
});

describe("A16/A17/A19", () => {
  it("lý do đề xuất bắt buộc khi gửi", () => {
    expect(isRequestReasonMissing(null)).toBe(true);
    expect(isRequestReasonMissing("   ")).toBe(true);
    expect(isRequestReasonMissing("Thay dao")).toBe(false);
  });
  it("thông báo đúng lý do theo trạng thái", () => {
    expect(convertBlockedMessage("CONVERTED")).toContain("đã được lập PO");
    expect(convertBlockedMessage("SUBMITTED")).toContain("chưa được duyệt");
  });
  it("chỉ Mua hàng/admin tạo PO từ PR", () => {
    expect(canCreatePoFromPr(["planner"])).toBe(false);
    expect(canCreatePoFromPr(["purchaser"])).toBe(true);
    expect(canCreatePoFromPr(["admin"])).toBe(true);
  });
});

describe("A6 — phân loại thông báo theo người nhận", () => {
  const prCtx = { prId: "p", prNo: "N", title: "t", creatorUserId: "u1", actorUserId: "a" };
  it("PR_APPROVED: Thu mua = action giữ nguyên, người lập/Kế toán lưu _INFO (update)", () => {
    const plan = planPRApproved(prCtx);
    const stored = plan.targets.map((t) => storedEventType(plan.eventType, t));
    expect(stored).toEqual(["PR_APPROVED", "PR_APPROVED_INFO", "PR_APPROVED_INFO"]);
    expect(categoryForEventType("PR_APPROVED_INFO")).toBe("update");
    expect(categoryForEventType("PR_APPROVED")).toBe("action");
  });
  it("PR_DEPT_APPROVED người lập là _INFO; event update giữ nguyên tên", () => {
    const plan = planPRDeptApproved(prCtx);
    expect(storedEventType(plan.eventType, plan.targets[2]!)).toBe(`PR_DEPT_APPROVED${INFO_EVENT_SUFFIX}`);
    expect(storedEventType("WO_COMPLETED", {})).toBe("WO_COMPLETED");
  });
  it("baseEventType và categoryForDelivery", () => {
    expect(baseEventType("PR_APPROVED_INFO")).toBe("PR_APPROVED");
    expect(baseEventType("PR_APPROVED")).toBe("PR_APPROVED");
    expect(categoryForDelivery({}, "PR_PENDING_REMINDER")).toBe("reminder");
    expect(categoryForDelivery({ category: "action" }, "X")).toBe("action");
  });
  it("PO_CANCELLED đóng được thông báo PO_CREATED_FROM_PR gắn id PR của người lập", () => {
    const plan = planPOCancelled({
      poId: "po", poNo: "PO", actorUserId: "a", reason: "r", wasSent: false, wasApproved: false,
      creatorUserId: "c", prId: "pr-9", prRequesterUserId: "u",
    });
    expect(plan.resolveExtraEntityIds).toEqual(["pr-9"]);
    expect(RESOLVES_STALE.PO_CANCELLED).toContain("PO_CREATED_FROM_PR");
  });
});

describe("Thông báo Kho / Kho đáp ứng đủ", () => {
  const ctx = { prId: "p", prNo: "N", title: "t", creatorUserId: "u1", actorUserId: "a" };
  it("PR_READY_TO_ISSUE là action cho vai warehouse và tự đóng khi Kho xử lý/huỷ", () => {
    const plan = planPRReadyToIssue({ ...ctx, reason: "approved" });
    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]).toMatchObject({ kind: "role", role: "warehouse", category: "action" });
    expect(ACTION_EVENT_TYPES.has("PR_READY_TO_ISSUE")).toBe(true);
    expect(RESOLVES_STALE.PR_GOODS_ISSUED).toContain("PR_READY_TO_ISSUE");
    expect(RESOLVES_STALE.PR_COMPLETED).toContain("PR_READY_TO_ISSUE");
    expect(RESOLVES_STALE.PR_CANCELLED).toContain("PR_READY_TO_ISSUE");
  });
  it("PR_STOCK_COVERED chỉ báo người lập (không báo người duyệt cuối)", () => {
    const plan = planPRStockCovered(ctx);
    expect(plan.targets.map((t) => t.kind)).toEqual(["user"]);
    expect(categoryForEventType("PR_STOCK_COVERED")).toBe("update");
  });
  it("PR_DEPT_APPROVED nêu 'có sẵn X dòng, cần mua Y dòng'", () => {
    const plan = planPRDeptApproved({ ...ctx, coveredLines: 2, buyLines: 3 });
    expect(plan.targets[0]!.message).toContain("Có sẵn 2 dòng · cần mua 3 dòng");
  });
});
