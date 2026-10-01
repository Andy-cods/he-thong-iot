import { describe, expect, it } from "vitest";
import type { Role } from "@iot/shared";
import { isRouteAllowed } from "@/lib/route-guard";
import { NOTIF_TYPE_LABELS } from "@/lib/status";
import { NOTIFICATION_EVENT_ICON } from "@/components/layout/notification-icons";
import {
  ACTION_EVENT_TYPES,
  EMAIL_EVENTS,
  NOTIFICATION_EVENT_TYPES,
  REMINDER_EVENT_TYPES,
  RESOLVES_STALE,
  assignRecipients,
  categoryForEventType,
  planDeliveryNoteConfirmed,
  planDeliveryNoteCreated,
  planDeliveryNoteRejected,
  planIssueRequestApproved,
  planIssueRequestNew,
  planIssueRequestRejected,
  planMaterialRequestCancelled,
  planMaterialRequestIssued,
  planMaterialRequestNew,
  planMaterialRequestPicking,
  planMaterialRequestReady,
  planPaymentRecorded,
  planPOApprovalRejected,
  planPOApprovalRequested,
  planPOApproved,
  planPOCancelled,
  planPOClosed,
  planPOCreatedFromPR,
  planPOInvoiceConfirmed,
  planPOInvoiceDraft,
  planPOPriceUpdated,
  planPOReceivedFull,
  planPOReceivedPartial,
  planPOSent,
  planPOSubcontractDraft,
  planPRApproved,
  planPRDeptApproved,
  planPRProgress,
  planPRRejected,
  planPRSubmitted,
  planReceiptQcFailed,
  planReceiptQcPassed,
  planReceiptQcPending,
  planStocktakeApproved,
  planStocktakeRejected,
  planStocktakeSubmitted,
  planWOApproved,
  planWOCancelled,
  planWOCompleted,
  planWORejected,
  planWOReleased,
  planWORequestSubmitted,
  planWOStarted,
  resolveLink,
  staleResolutionEntityIds,
  type CandidateUser,
  type NotifyPlan,
} from "./notification-plans";

const ACTOR = "00000000-0000-0000-0000-00000000000a";
const A = { actorUserId: ACTOR, actorUsername: "actor" };
const U = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const PR = { prId: "pr-1", prNo: "YCVT-01", title: "Ốc vít", creatorUserId: U(1), ...A };
const PO = { poId: "po-1", poNo: "PO-01", ...A };
const POA = { ...PO, creatorUserId: U(2), submitterUserId: U(3), prId: "pr-1", prRequesterUserId: U(1) };
const WO = { woId: "wo-1", woNo: "WO-01", productName: "Trục", plannedQty: 5, creatorUserId: U(4), ...A };
const MR = { requestId: "mr-1", requestNo: "MR-01", requesterUserId: U(5), ...A };
const ISR = { requestId: "isr-1", requestNo: "ISR-01", requesterUserId: U(6), totalQty: 3, ...A };
const QC = {
  receiptId: "rc-1", receiptNo: "PN-01", poId: "po-1", poNo: "PO-01",
  poCreatorUserId: U(2), sku: "SKU-1", lotCode: "L1", qty: 2, ...A,
};
const DN = { deliveryNoteId: "dn-1", noteNo: "GH-01", ...A };
const ST = { sessionId: "st-1", code: "KK-2609-0001", ...A };

/** Mọi plan builder × các biến thể nhánh. */
const PLANS: Array<[string, NotifyPlan]> = [
  ["PR submitted", planPRSubmitted(PR)],
  ["PR dept approved", planPRDeptApproved(PR)],
  ["PR approved", planPRApproved(PR)],
  ["PR rejected", planPRRejected({ ...PR, reason: "thiếu" })],
  ["PR issued", planPRProgress({ ...PR, stage: "issued" })],
  ["PR completed", planPRProgress({ ...PR, stage: "completed" })],
  ["PO from PR", planPOCreatedFromPR({ ...A, prId: "pr-1", prNo: "YCVT-01", prCreatorUserId: U(1), poCount: 2, firstPoId: "po-1" })],
  ["PO subcontract", planPOSubcontractDraft({ ...PO, sku: "S", qty: 1 })],
  ["PO approval requested", planPOApprovalRequested({ ...PO, totalAmount: 1000 })],
  ["PO approved", planPOApproved(POA)],
  ["PO approved (no PR)", planPOApproved({ ...POA, prId: null })],
  ["PO rejected", planPOApprovalRejected({ ...POA, reason: "đắt" })],
  ["PO sent", planPOSent(PO)],
  ["PO price draft", planPOPriceUpdated({ ...PO, changedLineCount: 1, afterApproval: false })],
  ["PO price after approval", planPOPriceUpdated({ ...PO, changedLineCount: 1, afterApproval: true, totalAfter: 5, invoiceRefreshedNo: "HD-1" })],
  ["PO received partial", planPOReceivedPartial(PO)],
  ["PO received full", planPOReceivedFull({ ...PO, prId: "pr-1", prCreatorUserId: U(1) })],
  ["PO received full (no PR)", planPOReceivedFull({ ...PO, prCreatorUserId: U(1) })],
  ["PO cancelled draft", planPOCancelled({ ...POA, reason: "x", wasSent: false, wasApproved: false })],
  ["PO cancelled sent", planPOCancelled({ ...POA, reason: "x", wasSent: true, wasApproved: true })],
  ["PO closed", planPOClosed({ ...POA, reason: "x", fromStatus: "PARTIAL", invoiceNo: null })],
  ["PO invoice draft", planPOInvoiceDraft({ ...PO, invoiceId: "i", invoiceNo: "HD-1", totalAmount: 1 })],
  ["PO invoice confirmed", planPOInvoiceConfirmed({ ...PO, invoiceId: "i", invoiceNo: "HD-1", totalAmount: 1 })],
  ["QC pending", planReceiptQcPending({ ...QC, lineCount: 2 })],
  ["QC passed", planReceiptQcPassed(QC)],
  ["QC passed (no PO)", planReceiptQcPassed({ ...QC, poId: null, poNo: null })],
  ["QC failed", planReceiptQcFailed({ ...QC, notes: "móp" })],
  ["QC failed (no PO)", planReceiptQcFailed({ ...QC, poId: null, notes: null })],
  ["WO request", planWORequestSubmitted(WO)],
  ["WO approved", planWOApproved(WO)],
  ["WO released", planWOReleased(WO)],
  ["WO rejected", planWORejected({ ...WO, reason: "x" })],
  ["WO started", planWOStarted(WO)],
  ["WO cancelled", planWOCancelled({ ...WO, reason: null })],
  ["WO completed", planWOCompleted({ ...WO, goodQty: 5 })],
  ["MR new", planMaterialRequestNew(MR)],
  ["MR picking", planMaterialRequestPicking(MR)],
  ["MR ready", planMaterialRequestReady(MR)],
  ["MR issued", planMaterialRequestIssued({ ...MR, issueNo: "PX-1", totalQty: 1, full: false })],
  ["MR delivered", planMaterialRequestIssued({ ...MR, issueNo: "PX-1", full: true })],
  ["MR cancelled by requester", planMaterialRequestCancelled({ ...MR, byRequester: true, partial: false })],
  ["MR cancelled by warehouse", planMaterialRequestCancelled({ ...MR, byRequester: false, partial: true })],
  ["ISR new (production)", planIssueRequestNew({ ...ISR, reason: "production" })],
  ["ISR new (sales)", planIssueRequestNew({ ...ISR, reason: "sales" })],
  ["ISR approved", planIssueRequestApproved(ISR)],
  ["ISR rejected", planIssueRequestRejected({ ...ISR, rejectReason: "hết" })],
  ["DN created", planDeliveryNoteCreated(DN)],
  ["DN confirmed", planDeliveryNoteConfirmed({ ...DN, poId: "po-1" })],
  ["DN confirmed (no PO)", planDeliveryNoteConfirmed(DN)],
  ["DN rejected", planDeliveryNoteRejected({ ...DN, deliveredByUserId: U(7), reason: "x" })],
  ["payment recorded", planPaymentRecorded({ ...A, paymentId: "p", paymentCode: "PT-1", totalAmount: 10, direction: "OUT" })],
  ["stocktake submitted", planStocktakeSubmitted(ST)],
  ["stocktake approved", planStocktakeApproved({ ...ST, creatorUserId: U(8), diffLineCount: 3 })],
  ["stocktake approved (no diff)", planStocktakeApproved({ ...ST, creatorUserId: U(8), diffLineCount: 0 })],
  ["stocktake rejected", planStocktakeRejected({ ...ST, creatorUserId: U(8), reason: "đếm thiếu 2 ô" })],
  ["stocktake rejected (no reason)", planStocktakeRejected({ ...ST, creatorUserId: U(8), reason: null })],
];

describe("TASK-20260927 — link thông báo mở được theo vai trò người nhận", () => {
  const rows: Array<[string, string, Role, readonly string[]]> = [];
  for (const [name, plan] of PLANS) {
    plan.targets.forEach((t, i) => {
      // Target user rỗng (vd PO không gắn PR) không bao giờ được gửi.
      if (t.kind === "user" && !t.userId) return;
      const roles = t.kind === "role" ? [t.role] : t.possibleRoles;
      for (const r of roles) rows.push([name, `${plan.eventType}#${i}`, r, t.links]);
    });
    if (plan.adminFallback) {
      rows.push([name, `${plan.eventType}#adminFallback`, "admin", plan.adminFallback.links]);
    }
  }

  it.each(rows)("%s · %s · vai trò %s", (_n, _t, r, links) => {
    const link = resolveLink(links, [r]);
    expect(link, `không link nào mở được: ${links.join(" | ")}`).not.toBeNull();
    expect(isRouteAllowed(link!, [r])).toBe(true);
  });
});

describe("TASK-20260927 — nhãn + icon + email", () => {
  it("mọi event type có nhãn tiếng Việt và icon riêng", () => {
    for (const t of NOTIFICATION_EVENT_TYPES) {
      expect(NOTIF_TYPE_LABELS[t], t).toBeTruthy();
      expect(NOTIFICATION_EVENT_ICON[t], t).toBeTruthy();
    }
    for (const [, plan] of PLANS) {
      expect(NOTIFICATION_EVENT_TYPES).toContain(plan.eventType);
    }
  });

  it("EMAIL_EVENTS chỉ gồm việc cần duyệt (không FIN_*)", () => {
    for (const e of EMAIL_EVENTS) expect(e.startsWith("FIN_")).toBe(false);
  });

  it("PR_DEPT_APPROVED: người duyệt có email, người lập không", () => {
    const plan = planPRDeptApproved(PR);
    const creator = plan.targets.find((t) => t.kind === "user");
    expect(creator?.email).toBe(false);
    expect(plan.targets.filter((t) => t.kind === "role").every((t) => t.email)).toBe(true);
  });
});

describe("TASK-20260927 — assignRecipients", () => {
  const users: CandidateUser[] = [
    { id: ACTOR, roles: ["accountant"] },
    { id: U(10), roles: ["admin"] },
    { id: U(11), roles: ["purchaser", "accountant"] }, // muahang
    { id: U(12), roles: ["warehouse", "qc"] }, // KHO-HOA
    { id: U(13), roles: ["purchaser"] },
    { id: U(14), roles: ["operator"] },
    { id: U(4), roles: ["planner"] },
  ];

  it("user nhiều vai trò chỉ nhận 1 dòng, nội dung của target đầu tiên", () => {
    const d = assignRecipients(planPRApproved({ ...PR, creatorUserId: null }), users);
    const ids = d.map((x) => x.userId);
    expect(new Set(ids).size).toBe(ids.length);
    const muahang = d.filter((x) => x.userId === U(11));
    expect(muahang).toHaveLength(1);
    expect(muahang[0]!.content.title).toMatch(/^Cần tạo PO/);
  });

  it("loại actor; không còn ai → báo Giám đốc (FIN_PAYMENT_RECORDED, 1 kế toán)", () => {
    const solo: CandidateUser[] = [
      { id: ACTOR, roles: ["accountant"] },
      { id: U(10), roles: ["admin"] },
    ];
    const d = assignRecipients(
      planPaymentRecorded({ ...A, paymentId: "p", paymentCode: "PT-1", totalAmount: 1, direction: "IN" }),
      solo,
    );
    expect(d.map((x) => x.userId)).toEqual([U(10)]);
  });

  it("có kế toán khác → không fallback Giám đốc", () => {
    const d = assignRecipients(
      planPaymentRecorded({ ...A, paymentId: "p", paymentCode: "PT-1", totalAmount: 1, direction: "IN" }),
      users,
    );
    expect(d.map((x) => x.userId)).toEqual([U(11)]);
  });

  it("DELIVERY_NOTE_CONFIRMED: Thu mua nhận link PO, Kho nhận link /warehouse", () => {
    const d = assignRecipients(planDeliveryNoteConfirmed({ ...DN, poId: "po-9" }), users);
    expect(d.find((x) => x.userId === U(13))?.link).toBe("/procurement/purchase-orders/po-9");
    expect(d.find((x) => x.userId === U(12))?.link).toBe("/warehouse?tab=delivery-notes&id=dn-1");
  });

  it("ISSUE_REQUEST_*: người lập là Kho → /warehouse, là Gia công → /operations", () => {
    const wh = assignRecipients(planIssueRequestApproved({ ...ISR, requesterUserId: U(12) }), users);
    expect(wh[0]?.link).toBe("/warehouse?tab=movement&mode=out");
    const op = assignRecipients(planIssueRequestRejected({ ...ISR, requesterUserId: U(14) }), users);
    expect(op[0]?.link).toBe("/operations");
  });

  it("ISR xuất bán → Giám đốc được báo", () => {
    const d = assignRecipients(planIssueRequestNew({ ...ISR, reason: "sales" }), users);
    expect(d.some((x) => x.userId === U(10))).toBe(true);
  });

  it("WO_COMPLETED: Kho nhận link /warehouse (không phải /work-orders)", () => {
    const d = assignRecipients(planWOCompleted({ ...WO, goodQty: 1 }), users);
    expect(d.find((x) => x.userId === U(12))?.link).toBe("/warehouse?tab=movement&mode=in");
    expect(d.find((x) => x.userId === U(4))?.link).toBe("/work-orders/wo-1");
  });

  // TASK-6VIEC Việc 4 — "Kiểm kê" tách khỏi tab "Báo cáo kho" (`?tab=report`)
  // sang tab riêng "Kiểm kê" (`?tab=stocktake`). Mọi thông báo kiểm kê phải
  // trỏ tab mới, không còn link tab report cũ.
  it("STOCKTAKE_*: link trỏ tab 'stocktake' riêng (không còn ?tab=report)", () => {
    const submitted = assignRecipients(planStocktakeSubmitted(ST), users);
    expect(submitted[0]?.link).toBe("/warehouse?tab=stocktake&id=st-1");

    const approved = assignRecipients(
      planStocktakeApproved({ ...ST, creatorUserId: U(12), diffLineCount: 1 }),
      users,
    );
    for (const d of approved) {
      expect(d.link).toBe("/warehouse?tab=stocktake&id=st-1");
      expect(d.link).not.toContain("tab=report");
    }

    const rejected = assignRecipients(
      planStocktakeRejected({ ...ST, creatorUserId: U(12), reason: "x" }),
      users,
    );
    for (const d of rejected) {
      expect(d.link).toBe("/warehouse?tab=stocktake&id=st-1");
    }
  });

  it("WO_RELEASED loại người lập khỏi fan-out Gia công", () => {
    const d = assignRecipients(planWORelease4(), [...users, { id: U(20), roles: ["operator"] }]);
    expect(d.map((x) => x.userId).sort()).toEqual([U(14)]);
  });

  it("người đề xuất vai trò QC nhận link PR (không vào được trang PO)", () => {
    const d = assignRecipients(planPOApproved({ ...POA, prRequesterUserId: U(30) }), [
      { id: U(30), roles: ["qc"] },
    ]);
    expect(d[0]?.link).toBe("/procurement/purchase-requests/pr-1");
  });

  it("user không active (không có trong danh sách) bị bỏ qua", () => {
    const d = assignRecipients(planPRRejected({ ...PR, creatorUserId: U(99) }), users);
    expect(d).toHaveLength(0);
  });
});

/** WO_RELEASED với người lập là operator U(20) (bị loại) và actor là operator khác. */
function planWORelease4(): NotifyPlan {
  return planWOReleased({ ...WO, creatorUserId: U(20) });
}

describe("TASK-notify V4.4 — nhóm hiển thị (category) + chống trùng/nhắc dày", () => {
  it("RESOLVES_STALE chỉ tham chiếu eventType có thật", () => {
    for (const [trigger, staleTypes] of Object.entries(RESOLVES_STALE)) {
      expect(NOTIFICATION_EVENT_TYPES, trigger).toContain(trigger);
      for (const s of staleTypes ?? []) {
        expect(NOTIFICATION_EVENT_TYPES, `${trigger} → ${s}`).toContain(s);
      }
    }
  });

  it("RESOLVES_STALE không tự tham chiếu chính nó (tránh vô nghĩa)", () => {
    for (const [trigger, staleTypes] of Object.entries(RESOLVES_STALE)) {
      expect(staleTypes, trigger).not.toContain(trigger);
    }
  });

  it("ACTION_EVENT_TYPES và REMINDER_EVENT_TYPES không giao nhau", () => {
    for (const e of ACTION_EVENT_TYPES) {
      expect(REMINDER_EVENT_TYPES.has(e), e).toBe(false);
    }
  });

  it("categoryForEventType: reminder > action > update (mặc định)", () => {
    expect(categoryForEventType("PR_PENDING_REMINDER")).toBe("reminder");
    expect(categoryForEventType("FIN_INVOICE_OVERDUE")).toBe("reminder");
    expect(categoryForEventType("PR_SUBMITTED")).toBe("action");
    expect(categoryForEventType("WO_REQUEST_SUBMITTED")).toBe("action");
    expect(categoryForEventType("WO_COMPLETED")).toBe("update");
    expect(categoryForEventType("KHONG_TON_TAI")).toBe("update");
  });

  it("mọi target category:'action' trong các plan thuộc ACTION_EVENT_TYPES (đối chiếu 2 nguồn)", () => {
    for (const [name, plan] of PLANS) {
      const hasActionTarget = plan.targets.some((t) => t.category === "action");
      if (hasActionTarget) {
        expect(ACTION_EVENT_TYPES.has(plan.eventType), `${name} (${plan.eventType})`).toBe(true);
      }
    }
  });

  it("target push:true đều nằm trong EMAIL_EVENTS hoặc ACTION_EVENT_TYPES (chỉ push việc cần xử lý)", () => {
    for (const [name, plan] of PLANS) {
      const hasPush = plan.targets.some((t) => t.push);
      if (hasPush) {
        expect(
          ACTION_EVENT_TYPES.has(plan.eventType) || EMAIL_EVENTS.has(plan.eventType),
          `${name} (${plan.eventType})`,
        ).toBe(true);
      }
    }
  });
});

describe("TASK-notify V4.4 (fix P0 hộp thư dồn purchaser) — resolveExtraEntityIds", () => {
  it("staleResolutionEntityIds gộp entityId + resolveExtraEntityIds, lọc trùng/rỗng", () => {
    expect(
      staleResolutionEntityIds({
        eventType: "PO_CREATED_FROM_PR",
        entityType: "purchase_order",
        entityId: "po-1",
        resolveExtraEntityIds: ["pr-1", "po-1", undefined as unknown as string, ""],
        targets: [],
      }),
    ).toEqual(["po-1", "pr-1"]);
  });

  it("staleResolutionEntityIds trả [] khi không có entityId lẫn resolveExtraEntityIds", () => {
    expect(
      staleResolutionEntityIds({ eventType: "PR_SUBMITTED", entityType: "purchase_request", targets: [] }),
    ).toEqual([]);
  });

  it("planPOCreatedFromPR khai báo resolveExtraEntityIds=[prId] — PO và PR có entityId KHÁC nhau", () => {
    const plan = planPOCreatedFromPR({
      ...A,
      prId: "pr-1",
      prNo: "YCVT-01",
      prCreatorUserId: U(1),
      poCount: 1,
      firstPoId: "po-1",
    });
    expect(plan.entityId).toBe("po-1");
    expect(plan.resolveExtraEntityIds).toEqual(["pr-1"]);
    // Không dùng resolveExtraEntityIds thì KHÔNG BAO GIỜ khớp được PR_APPROVED
    // (entityId=pr-1) — xác nhận lỗi gốc đã sửa (trước đây chỉ dùng entityId).
    expect(staleResolutionEntityIds(plan)).toContain("pr-1");
  });

  it("planPOInvoiceDraft khai báo resolveExtraEntityIds=[poId] — hoá đơn và PO có entityId KHÁC nhau", () => {
    const plan = planPOInvoiceDraft({ ...PO, invoiceId: "inv-1", invoiceNo: "HD-01", totalAmount: 1000 });
    expect(plan.entityId).toBe("inv-1");
    expect(plan.resolveExtraEntityIds).toEqual(["po-1"]);
    expect(staleResolutionEntityIds(plan)).toContain("po-1");
  });

  it("RESOLVES_STALE: tạo PO từ PR phải hết hiệu lực PR_APPROVED (không chỉ bản nhắc)", () => {
    expect(RESOLVES_STALE.PO_CREATED_FROM_PR).toContain("PR_APPROVED");
  });

  it("RESOLVES_STALE: gửi duyệt PO / gửi NCC thẳng phải hết hiệu lực PO_CREATED_FROM_PR", () => {
    expect(RESOLVES_STALE.PO_APPROVAL_REQUESTED).toContain("PO_CREATED_FROM_PR");
    expect(RESOLVES_STALE.PO_SENT).toContain("PO_CREATED_FROM_PR");
    expect(RESOLVES_STALE.PO_CANCELLED).toContain("PO_CREATED_FROM_PR");
    expect(RESOLVES_STALE.PO_CLOSED).toContain("PO_CREATED_FROM_PR");
  });

  it("RESOLVES_STALE: tạo HĐ mua nháp / đóng PO phải hết hiệu lực PO_RECEIVED_FULL", () => {
    expect(RESOLVES_STALE.PO_INVOICE_DRAFT).toContain("PO_RECEIVED_FULL");
    expect(RESOLVES_STALE.PO_CLOSED).toContain("PO_RECEIVED_FULL");
  });
});

describe("P2 (PO_FLOW_E2E.md bước 10) — planPOReceivedFull không báo lại Kế toán khi PO đã có HĐ active", () => {
  it("chưa có HĐ (mặc định) → vẫn báo accountant 'có thể tạo HĐ mua'", () => {
    const plan = planPOReceivedFull({ ...PO, prId: "pr-1", prCreatorUserId: U(1) });
    const accTarget = plan.targets.find((t) => t.kind === "role" && t.role === "accountant");
    expect(accTarget).toBeDefined();
    expect(accTarget?.title).toContain("có thể tạo HĐ mua");
    expect(accTarget?.category).toBe("action");
  });

  it("đã có HĐ active (hasActiveInvoice=true) → KHÔNG còn target accountant", () => {
    const plan = planPOReceivedFull({
      ...PO,
      prId: "pr-1",
      prCreatorUserId: U(1),
      hasActiveInvoice: true,
    });
    expect(plan.targets.find((t) => t.kind === "role" && t.role === "accountant")).toBeUndefined();
    // purchaser + người đề xuất PR vẫn nhận như cũ.
    expect(plan.targets.find((t) => t.kind === "role" && t.role === "purchaser")).toBeDefined();
    expect(plan.targets.some((t) => t.kind === "user" && t.userId === U(1))).toBe(true);
  });

  it("đã có HĐ active nhưng không có PR gốc → vẫn không lỗi, không có target accountant", () => {
    const plan = planPOReceivedFull({ ...PO, hasActiveInvoice: true });
    expect(plan.targets.find((t) => t.kind === "role" && t.role === "accountant")).toBeUndefined();
    expect(plan.targets.find((t) => t.kind === "role" && t.role === "purchaser")).toBeDefined();
  });
});
