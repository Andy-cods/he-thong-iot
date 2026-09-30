import type { Role } from "@iot/shared";
import { isRouteAllowed } from "@/lib/route-guard";

/**
 * TASK-20260927 — "Kế hoạch thông báo" THUẦN (không đụng DB) cho mọi sự kiện.
 *
 * Mỗi hàm `planXxx(ctx)` trả về 1 `NotifyPlan`: loại sự kiện + danh sách
 * NGƯỜI NHẬN THEO THỨ TỰ ƯU TIÊN (vai trò hoặc user cụ thể) + nội dung + các
 * link ứng viên. `notifications.ts` nạp user thật từ DB rồi gọi
 * `assignRecipients()` để:
 *   1. Gộp người nhận — user giữ nhiều vai trò (KHO-HOA = warehouse+qc,
 *      muahang = purchaser+accountant…) chỉ nhận MỘT dòng / sự kiện, lấy nội
 *      dung của target ĐẦU TIÊN khớp với họ.
 *   2. Loại người thao tác (actor) + `excludeUserIds`.
 *   3. Nếu sau khi loại không còn ai và plan có `adminFallback` → báo Giám đốc.
 *   4. Chọn link MỞ ĐƯỢC theo vai trò của từng người nhận: link ứng viên đầu
 *      tiên mà `isRouteAllowed(link, roles)` = true (cùng quy tắc route guard
 *      của `(app)/layout.tsx`), không có thì bỏ link (null) thay vì dẫn tới
 *      trang bị chặn `/?denied=1`.
 *
 * Tách thuần để test bảng (notification-plans.test.ts): mọi link × mọi vai
 * trò có thể nhận đều phải mở được.
 */

export const NOTIFICATION_EVENT_TYPES = [
  // Đề xuất vật tư (YCVT / PR)
  "PR_SUBMITTED",
  "PR_DEPT_APPROVED",
  "PR_APPROVED",
  "PR_REJECTED",
  "PR_PENDING_REMINDER", // worker prReminderScan.ts insert trực tiếp
  "PR_GOODS_ISSUED",
  "PR_COMPLETED",
  "PR_APPROVED_NO_PO_REMINDER", // worker prApprovedNoPoScan.ts insert trực tiếp
  // Đơn mua hàng (PO)
  "PO_CREATED_FROM_PR",
  "PO_SUBCONTRACT_DRAFT",
  "PO_APPROVAL_REQUESTED",
  "PO_APPROVED",
  "PO_APPROVAL_REJECTED",
  "PO_SENT",
  "PO_PRICE_UPDATED",
  "PO_RECEIVED_PARTIAL",
  "PO_RECEIVED_FULL",
  "PO_CANCELLED",
  "PO_CLOSED",
  "PO_INVOICE_DRAFT",
  "PO_INVOICE_CONFIRMED",
  // QC nhập kho
  "QC_RECEIPT_PENDING",
  "QC_RECEIPT_PASSED",
  "QC_RECEIPT_FAILED",
  // Lệnh sản xuất
  "WO_REQUEST_SUBMITTED",
  "WO_APPROVED",
  "WO_REJECTED",
  "WO_RELEASED",
  "WO_STARTED",
  "WO_CANCELLED",
  "WO_COMPLETED",
  // Phiếu yêu cầu vật tư (material request)
  "MATERIAL_REQUEST_NEW",
  "MATERIAL_REQUEST_PICKING",
  "MATERIAL_REQUEST_READY",
  "MATERIAL_REQUEST_ISSUED",
  "MATERIAL_REQUEST_DELIVERED",
  "MATERIAL_REQUEST_CANCELLED",
  // Yêu cầu xuất kho (ISR)
  "ISSUE_REQUEST_NEW",
  "ISSUE_REQUEST_APPROVED",
  "ISSUE_REQUEST_REJECTED",
  // Phiếu giao hàng / BBGH
  "DELIVERY_NOTE_CREATED",
  "DELIVERY_NOTE_CONFIRMED",
  "DELIVERY_NOTE_REJECTED",
  // Tài chính — 3 loại nhắc hạn do worker finInvoiceReminderScan.ts insert.
  "FIN_INVOICE_DUE_SOON",
  "FIN_INVOICE_OVERDUE",
  "FIN_RECEIVABLE_OVERDUE",
  "FIN_PAYMENT_RECORDED",
  // V4.3 Việc 2 — Phiên kiểm kê kho.
  "STOCKTAKE_SUBMITTED",
  "STOCKTAKE_APPROVED",
  "STOCKTAKE_REJECTED",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export type NotificationSeverity = "info" | "success" | "warning" | "error";

/**
 * Nhóm hiển thị chuông/trang thông báo (V4.4 notify):
 *   - "action"   — Cần bạn duyệt: người nhận phải làm gì đó tiếp theo.
 *   - "reminder" — Nhắc hạn: worker phát định kỳ (PR_PENDING_REMINDER,
 *     PR_APPROVED_NO_PO_REMINDER, FIN_INVOICE_*, FIN_RECEIVABLE_OVERDUE).
 *   - "update"   — Cập nhật: chỉ để biết tiến độ, không cần thao tác. Mặc định.
 */
export type NotifyCategory = "action" | "update" | "reminder";

/**
 * Email CHỈ cho việc người nhận phải DUYỆT (template email = "[Cần duyệt]").
 * Ngoài whitelist này còn cần target bật `email: true` — vd PR_DEPT_APPROVED
 * gửi email cho người duyệt cuối nhưng KHÔNG cho người lập (chỉ báo tiến độ).
 * Nhắc hạn tài chính (FIN_*) chỉ in-app — không nằm ở đây.
 */
export const EMAIL_EVENTS: ReadonlySet<NotificationEventType> = new Set<NotificationEventType>([
  "PR_SUBMITTED",
  "PR_DEPT_APPROVED",
  "WO_REQUEST_SUBMITTED",
  "ISSUE_REQUEST_NEW",
  "PO_SUBCONTRACT_DRAFT",
  "PO_APPROVAL_REQUESTED",
  "DELIVERY_NOTE_CREATED",
]);

/**
 * Nhóm hiển thị chuông/trang thông báo THEO event_type — coarse-grained, suy
 * luận từ TÊN sự kiện (không lưu cột riêng trong DB — xem migration 0070 §ghi
 * chú vận hành: bảng `notification` do `hethong_app` sở hữu, role vận hành/
 * staging thường không có quyền ALTER TABLE nên tránh yêu cầu DDL). Hạn chế
 * đã biết: 1 event có thể gửi cho nhiều vai trò với sắc thái khác nhau (VD
 * PR_APPROVED báo Thu mua "cần tạo PO" — action — lẫn người lập "chỉ để biết"
 * — update) nhưng dùng chung 1 nhóm cho cả 2 vì suy theo event_type. Chấp
 * nhận đánh đổi độ chính xác lấy KISS (không cần cột DB mới, không cần DDL
 * trên bảng có sẵn) — xem NOTIFY_MATRIX.md mục "Hạn chế đã biết".
 */
export function categoryForEventType(eventType: string): NotifyCategory {
  if (REMINDER_EVENT_TYPES.has(eventType as NotificationEventType)) return "reminder";
  if (ACTION_EVENT_TYPES.has(eventType as NotificationEventType)) return "action";
  return "update";
}

/** Worker phát định kỳ (không qua NotifyPlan) — luôn là "Nhắc hạn". */
export const REMINDER_EVENT_TYPES: ReadonlySet<NotificationEventType> = new Set<NotificationEventType>([
  "PR_PENDING_REMINDER",
  "PR_APPROVED_NO_PO_REMINDER",
  "FIN_INVOICE_DUE_SOON",
  "FIN_INVOICE_OVERDUE",
  "FIN_RECEIVABLE_OVERDUE",
]);

/**
 * Event mà PHẦN LỚN/TOÀN BỘ người nhận cần làm gì đó tiếp theo → "Cần bạn
 * duyệt". Khớp với các target đã gắn `category: "action"` trong các hàm
 * planXxx() bên dưới (xem test notification-plans.test.ts đối chiếu 2 nguồn).
 */
export const ACTION_EVENT_TYPES: ReadonlySet<NotificationEventType> = new Set<NotificationEventType>([
  "PR_SUBMITTED",
  "PR_DEPT_APPROVED",
  "PR_APPROVED",
  "PO_CREATED_FROM_PR",
  "PO_SUBCONTRACT_DRAFT",
  "PO_APPROVAL_REQUESTED",
  "QC_RECEIPT_PENDING",
  "PO_INVOICE_DRAFT",
  "WO_REQUEST_SUBMITTED",
  "ISSUE_REQUEST_NEW",
  "DELIVERY_NOTE_CREATED",
  "MATERIAL_REQUEST_NEW",
  "PO_RECEIVED_FULL",
]);

/**
 * Khi eventType này phát ra, các thông báo "chờ xử lý" CŨ hơn của CÙNG chứng
 * từ (entityId) — mọi người nhận — coi như hết hiệu lực (chứng từ đã qua bước
 * đó) → tự động đánh dấu đã đọc. Sửa đúng gốc "hộp thư dồn" trên prod (VD PR
 * đã được Kho duyệt bước 2 nhưng PR_SUBMITTED/PR_PENDING_REMINDER cũ vẫn nằm
 * chưa đọc trong hộp thư Kho/Giám đốc dù họ đã xử lý). Thuần — test được
 * không cần DB (notification-plans.test.ts).
 */
export const RESOLVES_STALE: Partial<
  Record<NotificationEventType, readonly NotificationEventType[]>
> = {
  PR_DEPT_APPROVED: ["PR_SUBMITTED", "PR_PENDING_REMINDER"],
  PR_APPROVED: ["PR_SUBMITTED", "PR_DEPT_APPROVED", "PR_PENDING_REMINDER"],
  PR_REJECTED: ["PR_SUBMITTED", "PR_DEPT_APPROVED", "PR_PENDING_REMINDER"],
  PO_CREATED_FROM_PR: ["PR_APPROVED_NO_PO_REMINDER"],
  PO_APPROVED: ["PO_APPROVAL_REQUESTED", "PO_SUBCONTRACT_DRAFT"],
  PO_APPROVAL_REJECTED: ["PO_APPROVAL_REQUESTED", "PO_SUBCONTRACT_DRAFT"],
  PO_CANCELLED: ["PO_APPROVAL_REQUESTED", "PO_SUBCONTRACT_DRAFT"],
  PO_CLOSED: ["PO_APPROVAL_REQUESTED"],
  PO_INVOICE_CONFIRMED: ["PO_INVOICE_DRAFT"],
  WO_APPROVED: ["WO_REQUEST_SUBMITTED"],
  WO_REJECTED: ["WO_REQUEST_SUBMITTED"],
  ISSUE_REQUEST_APPROVED: ["ISSUE_REQUEST_NEW"],
  ISSUE_REQUEST_REJECTED: ["ISSUE_REQUEST_NEW"],
  DELIVERY_NOTE_CONFIRMED: ["DELIVERY_NOTE_CREATED"],
  DELIVERY_NOTE_REJECTED: ["DELIVERY_NOTE_CREATED"],
  MATERIAL_REQUEST_PICKING: ["MATERIAL_REQUEST_NEW"],
  MATERIAL_REQUEST_CANCELLED: [
    "MATERIAL_REQUEST_NEW",
    "MATERIAL_REQUEST_PICKING",
    "MATERIAL_REQUEST_READY",
  ],
};

export interface NotifyContent {
  title: string;
  message?: string;
  /** Link ứng viên theo thứ tự ưu tiên — lấy cái đầu tiên người nhận mở được. */
  links: readonly string[];
  severity?: NotificationSeverity;
  /** Gửi email (chỉ có tác dụng khi eventType thuộc EMAIL_EVENTS). */
  email?: boolean;
  /** Nhóm hiển thị — mặc định "update" nếu không khai (xem NotifyCategory). */
  category?: NotifyCategory;
  /**
   * Gửi kèm push đẩy (Web Push) qua lớp deliver() — CHỈ cho việc thật sự cần
   * người nhận hành động (không push mọi cập nhật nhỏ). Mặc định false.
   */
  push?: boolean;
  /** Ghi đè entity của plan cho target này (vd PR vs PO). */
  entityType?: string;
  entityId?: string;
  entityCode?: string;
}

export type NotifyTarget =
  | (NotifyContent & { kind: "role"; role: Role })
  | (NotifyContent & {
      kind: "user";
      userId: string | null | undefined;
      /** Vai trò có thể có của user này (tài liệu + test link). */
      possibleRoles: readonly Role[];
    });

export interface NotifyPlan {
  eventType: NotificationEventType;
  entityType: string;
  entityId?: string;
  entityCode?: string;
  actorUserId?: string | null;
  actorUsername?: string | null;
  targets: NotifyTarget[];
  /** Không còn ai nhận (sau khi loại actor) → báo mọi Giám đốc với nội dung này. */
  adminFallback?: NotifyContent;
  excludeUserIds?: readonly string[];
}

export interface CandidateUser {
  id: string;
  roles: readonly Role[];
}

export interface NotifyDelivery {
  userId: string;
  content: NotifyContent;
  link: string | null;
}

/** Link đầu tiên mà user (theo vai trò) mở được; null nếu không cái nào. */
export function resolveLink(
  links: readonly string[],
  roles: readonly Role[],
): string | null {
  for (const l of links) {
    if (isRouteAllowed(l, [...roles])) return l;
  }
  return null;
}

/** Role cần nạp user từ DB cho plan (gồm admin khi có adminFallback). */
export function planRoles(plan: NotifyPlan): Role[] {
  const s = new Set<Role>();
  for (const t of plan.targets) if (t.kind === "role") s.add(t.role);
  if (plan.adminFallback) s.add("admin");
  return [...s];
}

export function planUserIds(plan: NotifyPlan): string[] {
  const s = new Set<string>();
  for (const t of plan.targets) if (t.kind === "user" && t.userId) s.add(t.userId);
  return [...s];
}

/**
 * Gán người nhận: 1 user = 1 dòng; target đầu tiên khớp quyết định nội dung.
 * `users` = user ACTIVE kèm TOÀN BỘ vai trò (user target không có trong
 * danh sách = inactive → bỏ qua).
 */
export function assignRecipients(
  plan: NotifyPlan,
  users: readonly CandidateUser[],
): NotifyDelivery[] {
  const byId = new Map(users.map((u) => [u.id, u]));
  const excluded = new Set<string>(plan.excludeUserIds ?? []);
  if (plan.actorUserId) excluded.add(plan.actorUserId);
  const assigned = new Map<string, NotifyDelivery>();

  const give = (u: CandidateUser, content: NotifyContent) => {
    if (excluded.has(u.id) || assigned.has(u.id)) return;
    assigned.set(u.id, { userId: u.id, content, link: resolveLink(content.links, u.roles) });
  };

  for (const t of plan.targets) {
    if (t.kind === "role") {
      for (const u of users) if (u.roles.includes(t.role)) give(u, t);
    } else if (t.userId) {
      const u = byId.get(t.userId);
      if (u) give(u, t);
    }
  }

  if (assigned.size === 0 && plan.adminFallback) {
    for (const u of users) if (u.roles.includes("admin")) give(u, plan.adminFallback);
  }
  return [...assigned.values()];
}

/* ── Vai trò có thể là "người lập" từng loại chứng từ (theo RBAC create) ─── */

export const PR_CREATOR_ROLES: readonly Role[] = [
  "admin", "planner", "operator", "warehouse", "purchaser", "qc", "accountant",
];
export const PO_CREATOR_ROLES: readonly Role[] = ["admin", "planner", "purchaser"];
export const WO_CREATOR_ROLES: readonly Role[] = ["admin", "planner", "operator"];
export const MR_CREATOR_ROLES: readonly Role[] = ["admin", "planner", "operator"];
/** ISR lập từ màn Kho (/warehouse) hoặc Gia công (/operations). */
export const ISR_CREATOR_ROLES: readonly Role[] = ["admin", "warehouse", "operator"];
export const DELIVERY_NOTE_CREATOR_ROLES: readonly Role[] = ["admin", "warehouse"];
/** V4.3 Việc 2 — phiên kiểm kê chỉ Kho/admin tạo được. */
export const STOCKTAKE_CREATOR_ROLES: readonly Role[] = ["admin", "warehouse"];

/* ── Link ─────────────────────────────────────────────────────────────── */

export const L = {
  pr: (id: string) => `/procurement/purchase-requests/${id}`,
  po: (id: string) => `/procurement/purchase-orders/${id}`,
  poInvoice: (id: string) => `/procurement/purchase-orders/${id}#hoa-don-mua`,
  salesPo: "/sales?tab=po",
  wo: (id: string) => `/work-orders/${id}`,
  woList: "/engineering?tab=work-orders",
  operations: "/operations",
  mr: (id: string) => `/material-requests/${id}`,
  whIn: "/warehouse?tab=movement&mode=in",
  whOut: "/warehouse?tab=movement&mode=out",
  whQc: "/warehouse?tab=movement&mode=qc",
  whDeliveryNote: (id: string) => `/warehouse?tab=delivery-notes&id=${id}`,
  finPayments: "/sales?tab=fin-payments",
  // V4.3 Việc 2 — phiên kiểm kê nằm trong tab Báo cáo kho.
  whStocktake: (id: string) => `/warehouse?tab=report&stocktake=${id}`,
} as const;

const role = (r: Role, c: NotifyContent): NotifyTarget => ({ kind: "role", role: r, ...c });
const user = (
  userId: string | null | undefined,
  possibleRoles: readonly Role[],
  c: NotifyContent,
): NotifyTarget => ({ kind: "user", userId, possibleRoles, ...c });

const vnd = (n: string | number | null | undefined) =>
  `${Math.round(Number(n ?? 0) || 0).toLocaleString("vi-VN")} ₫`;

interface Actor {
  actorUserId: string;
  actorUsername?: string | null;
}

/* ── Đề xuất vật tư (PR) ──────────────────────────────────────────────── */

export interface PRCtx extends Actor {
  prId: string;
  prNo: string;
  title?: string | null;
  creatorUserId?: string | null;
}

/** Bước 1 — người lập gửi phiếu → Kho (kiểm tồn + duyệt bước 2) + Giám đốc (duyệt nhanh). */
export function planPRSubmitted(ctx: PRCtx): NotifyPlan {
  const link = [L.pr(ctx.prId)];
  const who = ctx.actorUsername ?? "Người lập phiếu";
  return {
    eventType: "PR_SUBMITTED",
    entityType: "purchase_request",
    entityId: ctx.prId,
    entityCode: ctx.prNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      role("warehouse", {
        title: `${who} gửi đề xuất ${ctx.prNo} — cần kiểm tồn`,
        message: ctx.title
          ? `"${ctx.title}" — kiểm tra lượng tồn rồi duyệt`
          : "Kiểm tra lượng tồn thực tế rồi duyệt phiếu",
        links: link,
        severity: "warning",
        email: true,
        category: "action",
        push: true,
      }),
      role("admin", {
        title: `${who} gửi đề xuất ${ctx.prNo} — chờ duyệt`,
        message: ctx.title ? `"${ctx.title}" — bấm để duyệt nhanh` : "Bấm để xem và duyệt nhanh",
        links: link,
        severity: "info",
        email: true,
        category: "action",
        push: true,
      }),
    ],
  };
}

/** Bước 2 — Kho duyệt → Giám đốc + Thu mua duyệt cuối; người lập biết tiến độ (không email). */
export function planPRDeptApproved(ctx: PRCtx): NotifyPlan {
  const link = [L.pr(ctx.prId)];
  return {
    eventType: "PR_DEPT_APPROVED",
    entityType: "purchase_request",
    entityId: ctx.prId,
    entityCode: ctx.prNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      role("admin", {
        title: `${ctx.prNo} chờ Giám đốc duyệt cuối`,
        message: ctx.title
          ? `"${ctx.title}" — Kho đã kiểm tồn và duyệt`
          : "Kho đã kiểm tồn và duyệt — chờ duyệt cuối",
        links: link,
        email: true,
        category: "action",
        push: true,
      }),
      role("purchaser", {
        title: `${ctx.prNo} đã qua Kho — chờ duyệt cuối`,
        message: ctx.title
          ? `"${ctx.title}" — chờ Giám đốc/Thu mua duyệt cuối`
          : "Chờ Giám đốc/Thu mua duyệt cuối",
        links: link,
        email: true,
        category: "action",
        push: true,
      }),
      user(ctx.creatorUserId, PR_CREATOR_ROLES, {
        title: `${ctx.prNo} đã qua bước 2/3`,
        message: "Kho đã kiểm tồn và duyệt — đang chờ duyệt cuối.",
        links: link,
        severity: "success",
        email: false,
      }),
    ],
  };
}

/** Bước 3 (director-approve / quick-approve) → Thu mua tạo PO + người lập + Kế toán tải PDF. */
export function planPRApproved(ctx: PRCtx): NotifyPlan {
  const link = [L.pr(ctx.prId)];
  return {
    eventType: "PR_APPROVED",
    entityType: "purchase_request",
    entityId: ctx.prId,
    entityCode: ctx.prNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      role("purchaser", {
        title: `Cần tạo PO: ${ctx.prNo} đã duyệt cuối`,
        message: ctx.title
          ? `"${ctx.title}" — mở phiếu và bấm “Tạo PO”.`
          : "Mở phiếu và bấm “Tạo PO”.",
        links: link,
        category: "action",
        push: true,
      }),
      user(ctx.creatorUserId, PR_CREATOR_ROLES, {
        title: `${ctx.prNo} đã được duyệt`,
        message: "Bộ phận Thu mua đang tiến hành tạo PO.",
        links: link,
        severity: "success",
      }),
      role("accountant", {
        title: `Phiếu ${ctx.prNo} đã duyệt — tải PDF/Excel`,
        message: ctx.title
          ? `"${ctx.title}" — mở phiếu để tải bản PDF/Excel gửi thanh toán.`
          : "Mở phiếu để tải bản PDF/Excel.",
        links: link,
        severity: "success",
      }),
    ],
  };
}

export function planPRRejected(ctx: PRCtx & { reason?: string | null }): NotifyPlan {
  return {
    eventType: "PR_REJECTED",
    entityType: "purchase_request",
    entityId: ctx.prId,
    entityCode: ctx.prNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      user(ctx.creatorUserId, PR_CREATOR_ROLES, {
        title: `${ctx.prNo} bị từ chối`,
        message: ctx.reason
          ? `Lý do: ${ctx.reason}`
          : `Người từ chối: ${ctx.actorUsername ?? "—"} — liên hệ để biết chi tiết.`,
        links: [L.pr(ctx.prId)],
        severity: "warning",
      }),
    ],
  };
}

/** Kho/Giám đốc ghi mốc "Đã xuất kho" (mark-issued) hoặc "Hoàn tất" (mark-completed) → người lập. */
export function planPRProgress(ctx: PRCtx & { stage: "issued" | "completed" }): NotifyPlan {
  const issued = ctx.stage === "issued";
  return {
    eventType: issued ? "PR_GOODS_ISSUED" : "PR_COMPLETED",
    entityType: "purchase_request",
    entityId: ctx.prId,
    entityCode: ctx.prNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      user(ctx.creatorUserId, PR_CREATOR_ROLES, {
        title: issued ? `Vật tư phiếu ${ctx.prNo} đã xuất kho` : `Phiếu ${ctx.prNo} đã hoàn tất`,
        message: issued
          ? "Kho đã xuất vật tư theo đề xuất của bạn — liên hệ Kho để nhận."
          : "Đề xuất đã hoàn tất toàn bộ quy trình.",
        links: [L.pr(ctx.prId)],
        severity: "success",
      }),
    ],
  };
}

/* ── Đơn mua hàng (PO) ────────────────────────────────────────────────── */

export interface POCtx extends Actor {
  poId: string;
  poNo: string;
}

/** PR → N PO nháp: Thu mua nhập giá + trình duyệt; người lập PR biết tiến độ. */
export function planPOCreatedFromPR(
  ctx: Actor & {
    prId: string;
    prNo: string;
    prCreatorUserId?: string | null;
    poCount: number;
    firstPoId: string;
  },
): NotifyPlan {
  return {
    eventType: "PO_CREATED_FROM_PR",
    entityType: "purchase_order",
    entityId: ctx.firstPoId,
    entityCode: ctx.prNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      role("purchaser", {
        title: `${ctx.poCount} PO nháp mới từ phiếu ${ctx.prNo}`,
        message: "Nhập/kiểm tra đơn giá rồi gửi Giám đốc duyệt trước khi gửi NCC.",
        links: [L.po(ctx.firstPoId), L.salesPo],
        category: "action",
      }),
      user(ctx.prCreatorUserId, PR_CREATOR_ROLES, {
        title: `Phiếu ${ctx.prNo} đã được lập ${ctx.poCount} đơn mua hàng (PO)`,
        message: "Thu mua đang chốt giá và trình Giám đốc duyệt PO.",
        links: [L.pr(ctx.prId)],
        severity: "success",
        entityType: "purchase_request",
        entityId: ctx.prId,
      }),
    ],
  };
}

/** PO gia công ngoài (từ dòng BOM) → Thu mua chốt giá + trình duyệt (cần hành động). */
export function planPOSubcontractDraft(
  ctx: POCtx & { sku: string; qty: number | string },
): NotifyPlan {
  return {
    eventType: "PO_SUBCONTRACT_DRAFT",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      role("purchaser", {
        title: `Đơn gia công ngoài mới: ${ctx.poNo}`,
        message: `Linh kiện ${ctx.sku} SL ${ctx.qty}. Cần chốt đơn giá + trình duyệt.`,
        links: [L.po(ctx.poId), L.salesPo],
        email: true,
        category: "action",
        push: true,
      }),
    ],
    adminFallback: {
      title: `Đơn gia công ngoài: ${ctx.poNo}`,
      message: `Linh kiện ${ctx.sku} SL ${ctx.qty}. Cần chốt đơn giá + duyệt.`,
      links: [L.po(ctx.poId)],
      category: "action",
    },
  };
}

/** PO gửi duyệt → Giám đốc (người duyệt PO duy nhất). */
export function planPOApprovalRequested(
  ctx: POCtx & { totalAmount?: string | number | null },
): NotifyPlan {
  const total = Number(ctx.totalAmount ?? 0);
  return {
    eventType: "PO_APPROVAL_REQUESTED",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      role("admin", {
        title: `${ctx.actorUsername ?? "Thu mua"} gửi duyệt PO ${ctx.poNo}`,
        message:
          total > 0
            ? `Giá trị ${vnd(total)} — mở PO để duyệt/từ chối.`
            : "Mở PO để duyệt/từ chối.",
        links: [L.po(ctx.poId)],
        severity: "warning",
        email: true,
        category: "action",
        push: true,
      }),
    ],
  };
}

export interface POApprovalCtx extends POCtx {
  /** purchase_order.createdBy */
  creatorUserId?: string | null;
  /** metadata.submittedBy — người bấm "Gửi duyệt" (có thể là Thiết kế/planner). */
  submitterUserId?: string | null;
  prId?: string | null;
  prRequesterUserId?: string | null;
}

const poOrPr = (ctx: POApprovalCtx): string[] =>
  ctx.prId ? [L.po(ctx.poId), L.pr(ctx.prId)] : [L.po(ctx.poId)];
/** Người đề xuất PR gốc — chỉ khi PO gắn PR (link PR là đường lui cho vai trò QC). */
const prRequester = (ctx: { prId?: string | null; prRequesterUserId?: string | null }) =>
  ctx.prId ? ctx.prRequesterUserId : null;

/** Giám đốc duyệt PO → người lập/gửi duyệt + Thu mua (gửi NCC) + người đề xuất + Kho. */
export function planPOApproved(ctx: POApprovalCtx): NotifyPlan {
  const mine: NotifyContent = {
    title: `${ctx.poNo} đã được Giám đốc duyệt`,
    message: "PO bạn lập/gửi duyệt đã được duyệt — có thể gửi NCC.",
    links: [L.po(ctx.poId)],
    severity: "success",
  };
  return {
    eventType: "PO_APPROVED",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      user(ctx.submitterUserId, PO_CREATOR_ROLES, mine),
      user(ctx.creatorUserId, PO_CREATOR_ROLES, mine),
      role("purchaser", {
        title: `${ctx.poNo} đã được Giám đốc duyệt`,
        message: "Có thể gửi NCC.",
        links: [L.po(ctx.poId), L.salesPo],
        severity: "success",
      }),
      user(prRequester(ctx), PR_CREATOR_ROLES, {
        title: "Đơn mua cho đề xuất của bạn đã duyệt",
        message: `${ctx.poNo} đã được Giám đốc duyệt.`,
        links: poOrPr(ctx),
        severity: "success",
      }),
      role("warehouse", {
        title: `${ctx.poNo} đã duyệt — chuẩn bị nhận hàng`,
        message: "Thu mua sẽ gửi NCC; hàng về nhận ở màn Nhập kho.",
        links: [L.po(ctx.poId), L.whIn],
      }),
    ],
  };
}

export function planPOApprovalRejected(
  ctx: POApprovalCtx & { reason?: string | null },
): NotifyPlan {
  const reason = ctx.reason ? `Lý do: ${ctx.reason}` : undefined;
  const mine: NotifyContent = {
    title: `${ctx.poNo} bị Giám đốc từ chối duyệt`,
    message: reason,
    links: [L.po(ctx.poId)],
    severity: "warning",
  };
  return {
    eventType: "PO_APPROVAL_REJECTED",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      user(ctx.submitterUserId, PO_CREATOR_ROLES, mine),
      user(ctx.creatorUserId, PO_CREATOR_ROLES, mine),
      role("purchaser", {
        title: `${ctx.poNo} bị từ chối duyệt`,
        message: reason,
        links: [L.po(ctx.poId), L.salesPo],
        severity: "warning",
      }),
      user(prRequester(ctx), PR_CREATOR_ROLES, {
        title: "Đơn mua cho đề xuất của bạn bị từ chối",
        message: reason,
        links: poOrPr(ctx),
        severity: "warning",
      }),
    ],
  };
}

/** PO gửi NCC → Kho chuẩn bị nhận hàng. */
export function planPOSent(ctx: POCtx & { supplierName?: string | null }): NotifyPlan {
  return {
    eventType: "PO_SENT",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      role("warehouse", {
        title: `${ctx.poNo} đã gửi NCC, sắp về kho`,
        message: ctx.supplierName
          ? `Nhà cung cấp: ${ctx.supplierName}`
          : "Chuẩn bị nhận hàng khi NCC giao.",
        links: [L.whIn],
      }),
    ],
  };
}

/**
 * Đổi đơn giá dòng PO. Kho luôn được báo (đối chiếu giá trị nhận hàng). Khi PO
 * ĐÃ DUYỆT hoặc đã gửi NCC trở đi (giá thay đổi sau khi Giám đốc chốt) → báo
 * thêm Giám đốc + Kế toán (HĐ mua nháp — nếu có — đã tự tính lại).
 */
export function planPOPriceUpdated(
  ctx: POCtx & {
    changedLineCount: number;
    afterApproval: boolean;
    totalAfter?: string | number | null;
    invoiceRefreshedNo?: string | null;
  },
): NotifyPlan {
  const title = `${ctx.poNo} vừa đổi giá ${ctx.changedLineCount} dòng`;
  const targets: NotifyTarget[] = [
    role("warehouse", {
      title,
      message: "Kiểm tra lại giá trị khi đối chiếu nhận hàng.",
      links: [L.po(ctx.poId), L.whIn],
      severity: "warning",
    }),
  ];
  if (ctx.afterApproval) {
    targets.push(
      role("admin", {
        title: `${ctx.poNo} đổi giá sau khi đã duyệt`,
        message: `${ctx.changedLineCount} dòng đổi giá${ctx.totalAfter != null ? ` — tổng mới ${vnd(ctx.totalAfter)}` : ""}.`,
        links: [L.po(ctx.poId)],
        severity: "warning",
      }),
      role("accountant", {
        title,
        message: ctx.invoiceRefreshedNo
          ? `HĐ mua nháp ${ctx.invoiceRefreshedNo} đã tự tính lại tiền — kiểm tra trước khi xác nhận.`
          : "Giá PO đã đổi — đối chiếu khi lập/xác nhận HĐ mua.",
        links: [L.poInvoice(ctx.poId)],
        severity: "warning",
      }),
    );
  }
  return {
    eventType: "PO_PRICE_UPDATED",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets,
  };
}

export function planPOReceivedPartial(ctx: POCtx): NotifyPlan {
  return {
    eventType: "PO_RECEIVED_PARTIAL",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      role("purchaser", {
        title: `${ctx.poNo} đã nhận một phần`,
        message: "Theo dõi đợt nhận tiếp theo từ NCC.",
        links: [L.po(ctx.poId), L.salesPo],
      }),
    ],
  };
}

/** PO nhận đủ → Thu mua + người đề xuất PR + Kế toán (tạo HĐ mua). */
export function planPOReceivedFull(
  ctx: POCtx & { prId?: string | null; prCreatorUserId?: string | null },
): NotifyPlan {
  return {
    eventType: "PO_RECEIVED_FULL",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      role("purchaser", {
        title: `${ctx.poNo} đã nhận đủ`,
        message: "PO đã nhận đủ hàng (trạng thái Đã nhận).",
        links: [L.po(ctx.poId), L.salesPo],
        severity: "success",
      }),
      user(ctx.prId ? ctx.prCreatorUserId : null, PR_CREATOR_ROLES, {
        title: `Linh kiện đã về: ${ctx.poNo}`,
        message: "Hàng cho đề xuất của bạn đã về kho đủ số lượng.",
        links: ctx.prId ? [L.po(ctx.poId), L.pr(ctx.prId)] : [L.po(ctx.poId)],
        severity: "success",
      }),
      role("accountant", {
        title: `PO ${ctx.poNo} đã nhận đủ — có thể tạo HĐ mua`,
        message: "Mở PO, mục Hoá đơn mua → tạo HĐ nháp, nhập số HĐ NCC rồi xác nhận ghi công nợ.",
        links: [L.poInvoice(ctx.poId)],
        category: "action",
      }),
    ],
  };
}

/** PO huỷ. Kho được báo nếu PO đã duyệt/gửi NCC; Giám đốc nếu PO đã duyệt. */
export function planPOCancelled(
  ctx: POApprovalCtx & { reason: string; wasSent: boolean; wasApproved: boolean },
): NotifyPlan {
  const targets: NotifyTarget[] = [];
  if (ctx.wasSent || ctx.wasApproved) {
    targets.push(
      role("warehouse", {
        title: `${ctx.poNo} đã bị huỷ — không nhận hàng`,
        message: `Lý do: ${ctx.reason}`,
        links: [L.po(ctx.poId), L.whIn],
        severity: "warning",
      }),
      role("admin", {
        title: `${ctx.poNo} (đã duyệt) bị huỷ`,
        message: `Lý do: ${ctx.reason}`,
        links: [L.po(ctx.poId)],
        severity: "warning",
      }),
    );
  }
  targets.push(
    user(ctx.creatorUserId, PO_CREATOR_ROLES, {
      title: `${ctx.poNo} đã bị huỷ`,
      message: `Lý do: ${ctx.reason}`,
      links: [L.po(ctx.poId)],
      severity: "warning",
    }),
    user(prRequester(ctx), PR_CREATOR_ROLES, {
      title: `Đơn mua ${ctx.poNo} cho đề xuất của bạn đã bị huỷ`,
      message: `Lý do: ${ctx.reason}`,
      links: poOrPr(ctx),
      severity: "warning",
    }),
  );
  return {
    eventType: "PO_CANCELLED",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets,
  };
}

/** PO đóng (NCC không giao nốt / chốt hồ sơ) → Kho + Kế toán + người đề xuất. */
export function planPOClosed(
  ctx: POApprovalCtx & {
    reason: string;
    fromStatus?: string | null;
    invoiceNo?: string | null;
  },
): NotifyPlan {
  const partial = ctx.fromStatus === "PARTIAL";
  return {
    eventType: "PO_CLOSED",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      role("warehouse", {
        title: `${ctx.poNo} đã đóng${partial ? " — không nhận thêm hàng" : ""}`,
        message: `Lý do: ${ctx.reason}`,
        links: [L.po(ctx.poId), L.whIn],
      }),
      role("accountant", {
        title: `${ctx.poNo} đã đóng`,
        message: ctx.invoiceNo
          ? `Đã có HĐ mua ${ctx.invoiceNo} — đối chiếu số lượng thực nhận.`
          : "Chưa có HĐ mua — tạo HĐ theo số lượng thực nhận.",
        links: [L.poInvoice(ctx.poId)],
      }),
      user(prRequester(ctx), PR_CREATOR_ROLES, {
        title: `Đơn mua ${ctx.poNo} cho đề xuất của bạn đã đóng`,
        message: partial ? `Chỉ nhận một phần. Lý do: ${ctx.reason}` : `Lý do: ${ctx.reason}`,
        links: poOrPr(ctx),
      }),
    ],
  };
}

/** HĐ mua NHÁP tạo từ PO → Kế toán xác nhận ghi công nợ. */
export function planPOInvoiceDraft(
  ctx: POCtx & { invoiceId: string; invoiceNo: string; totalAmount: string | number },
): NotifyPlan {
  const content: NotifyContent = {
    title: `HĐ mua nháp từ ${ctx.poNo} chờ xác nhận`,
    message: `Tổng ${vnd(ctx.totalAmount)} — nhập số HĐ của NCC rồi “Xác nhận ghi công nợ”.`,
    links: [L.poInvoice(ctx.poId)],
    category: "action",
  };
  return {
    eventType: "PO_INVOICE_DRAFT",
    entityType: "fin_invoice",
    entityId: ctx.invoiceId,
    entityCode: ctx.invoiceNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [role("accountant", content)],
    adminFallback: content,
  };
}

/** Kế toán xác nhận HĐ mua (DRAFT → UNPAID, ghi công nợ phải trả) → Thu mua + Giám đốc. */
export function planPOInvoiceConfirmed(
  ctx: POCtx & { invoiceId: string; invoiceNo: string; totalAmount: string | number },
): NotifyPlan {
  const content: NotifyContent = {
    title: `HĐ mua ${ctx.invoiceNo} của ${ctx.poNo} đã ghi công nợ`,
    message: `Tổng ${vnd(ctx.totalAmount)} — Kế toán đã xác nhận, chờ thanh toán NCC.`,
    links: [L.poInvoice(ctx.poId)],
    severity: "success",
  };
  return {
    eventType: "PO_INVOICE_CONFIRMED",
    entityType: "fin_invoice",
    entityId: ctx.invoiceId,
    entityCode: ctx.invoiceNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [role("purchaser", content), role("admin", content)],
  };
}

/* ── QC nhập kho ──────────────────────────────────────────────────────── */

export interface ReceiptQcCtx extends Actor {
  receiptId: string;
  receiptNo: string;
  poId?: string | null;
  poNo?: string | null;
}

export function planReceiptQcPending(ctx: ReceiptQcCtx & { lineCount: number }): NotifyPlan {
  return {
    eventType: "QC_RECEIPT_PENDING",
    entityType: "inbound_receipt",
    entityId: ctx.receiptId,
    entityCode: ctx.receiptNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      role("qc", {
        title: `${ctx.lineCount} dòng hàng nhận chờ QC (${ctx.receiptNo})`,
        message: ctx.poNo
          ? `Hàng của PO ${ctx.poNo} đang bị giữ (HOLD) cho tới khi QC kết luận Đạt.`
          : "Hàng đang bị giữ (HOLD) cho tới khi QC kết luận Đạt.",
        links: [L.whQc],
        severity: "warning",
        category: "action",
        push: true,
      }),
    ],
  };
}

interface QcLineCtx extends ReceiptQcCtx {
  sku: string;
  lotCode: string | null;
  qty: number;
  /** purchase_order.createdBy — người lập PO. */
  poCreatorUserId?: string | null;
}

const poLinks = (poId?: string | null) => (poId ? [L.po(poId), L.salesPo] : [L.salesPo]);

/** QC Đạt → Kho (hàng đã nhả HOLD, xuất được) + người lập PO. */
export function planReceiptQcPassed(ctx: QcLineCtx): NotifyPlan {
  const lot = ctx.lotCode ? ` · lô ${ctx.lotCode}` : "";
  return {
    eventType: "QC_RECEIPT_PASSED",
    entityType: "inbound_receipt",
    entityId: ctx.receiptId,
    entityCode: ctx.receiptNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      role("warehouse", {
        title: `QC đạt: ${ctx.sku}${lot} (${ctx.receiptNo})`,
        message: `SL ${ctx.qty} đã nhả HOLD — có thể xuất dùng.${ctx.poNo ? ` PO ${ctx.poNo}.` : ""}`,
        links: [L.whQc, L.whIn],
        severity: "success",
      }),
      user(ctx.poId ? ctx.poCreatorUserId : null, PO_CREATOR_ROLES, {
        title: `QC đạt: ${ctx.sku}${lot}${ctx.poNo ? ` — PO ${ctx.poNo}` : ""}`,
        message: `SL ${ctx.qty} đã đạt QC nhập kho.`,
        links: poLinks(ctx.poId),
        severity: "success",
      }),
    ],
  };
}

/** QC Không đạt → Kho (cách ly) + Thu mua (làm việc NCC) + người lập PO. */
export function planReceiptQcFailed(ctx: QcLineCtx & { notes: string | null }): NotifyPlan {
  const title = `QC không đạt: ${ctx.sku}${ctx.lotCode ? ` · lô ${ctx.lotCode}` : ""} (${ctx.receiptNo})`;
  const message = `SL ${ctx.qty}${ctx.poNo ? ` · PO ${ctx.poNo}` : ""}${ctx.notes ? ` · Lý do: ${ctx.notes}` : ""}`;
  return {
    eventType: "QC_RECEIPT_FAILED",
    entityType: "inbound_receipt",
    entityId: ctx.receiptId,
    entityCode: ctx.receiptNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      role("warehouse", { title, message, links: [L.whQc], severity: "error" }),
      role("purchaser", { title, message, links: poLinks(ctx.poId), severity: "error" }),
      user(ctx.poId ? ctx.poCreatorUserId : null, PO_CREATOR_ROLES, {
        title,
        message,
        links: poLinks(ctx.poId),
        severity: "error",
      }),
    ],
  };
}

/* ── Lệnh sản xuất (WO) ───────────────────────────────────────────────── */

export interface WOCtx extends Actor {
  woId: string;
  woNo: string;
  productName?: string | null;
  plannedQty?: number | string | null;
  creatorUserId?: string | null;
}

const woLinks = (id: string) => [L.wo(id), L.woList];

const woPlan = (
  eventType: NotificationEventType,
  ctx: WOCtx,
  targets: NotifyTarget[],
  extra: Partial<NotifyPlan> = {},
): NotifyPlan => ({
  eventType,
  entityType: "work_order",
  entityId: ctx.woId,
  entityCode: ctx.woNo,
  actorUserId: ctx.actorUserId,
  actorUsername: ctx.actorUsername,
  targets,
  ...extra,
});

const productLine = (ctx: WOCtx) =>
  ctx.productName ? `${ctx.productName}${ctx.plannedQty ? ` × ${ctx.plannedQty}` : ""}` : null;

/** Thiết kế gửi Yêu cầu SX → Gia công duyệt (cần hành động). */
export function planWORequestSubmitted(ctx: WOCtx): NotifyPlan {
  const content: NotifyContent = {
    title: `${ctx.actorUsername ?? "Thiết kế"} gửi yêu cầu sản xuất ${ctx.woNo}`,
    message: productLine(ctx)
      ? `${productLine(ctx)} — chờ duyệt`
      : "Bộ phận Thiết kế gửi yêu cầu — chờ Gia công duyệt",
    links: woLinks(ctx.woId),
    email: true,
    category: "action",
    push: true,
  };
  return woPlan("WO_REQUEST_SUBMITTED", ctx, [role("operator", content)], {
    adminFallback: { ...content, email: false },
  });
}

/** Gia công duyệt YCSX → người lập biết đã duyệt. */
export function planWOApproved(ctx: WOCtx): NotifyPlan {
  return woPlan("WO_APPROVED", ctx, [
    user(ctx.creatorUserId, WO_CREATOR_ROLES, {
      title: `Yêu cầu SX ${ctx.woNo} đã được duyệt`,
      message: "Gia công đã chấp nhận — lệnh đã phát hành.",
      links: woLinks(ctx.woId),
      severity: "success",
    }),
  ]);
}

/** Cùng lúc duyệt: lệnh phát hành → Gia công (trừ người duyệt + người lập) bắt đầu sản xuất. */
export function planWOReleased(ctx: WOCtx): NotifyPlan {
  return woPlan(
    "WO_RELEASED",
    ctx,
    [
      role("operator", {
        title: `Lệnh sản xuất mới: ${ctx.woNo}`,
        message: productLine(ctx) ?? "Lệnh đã phát hành — vào Gia công để bắt đầu sản xuất.",
        links: [L.wo(ctx.woId), L.operations],
      }),
    ],
    { excludeUserIds: ctx.creatorUserId ? [ctx.creatorUserId] : [] },
  );
}

export function planWORejected(ctx: WOCtx & { reason?: string | null }): NotifyPlan {
  return woPlan("WO_REJECTED", ctx, [
    user(ctx.creatorUserId, WO_CREATOR_ROLES, {
      title: `Yêu cầu SX ${ctx.woNo} bị từ chối`,
      message: ctx.reason ? `Lý do: ${ctx.reason}` : "Gia công đã từ chối yêu cầu.",
      links: woLinks(ctx.woId),
      severity: "warning",
    }),
  ]);
}

export function planWOStarted(ctx: WOCtx): NotifyPlan {
  return woPlan("WO_STARTED", ctx, [
    user(ctx.creatorUserId, WO_CREATOR_ROLES, {
      title: `${ctx.woNo} đã bắt đầu sản xuất`,
      message: `Người bắt đầu: ${ctx.actorUsername ?? "—"}.`,
      links: woLinks(ctx.woId),
    }),
  ]);
}

export function planWOCancelled(ctx: WOCtx & { reason?: string | null }): NotifyPlan {
  return woPlan("WO_CANCELLED", ctx, [
    user(ctx.creatorUserId, WO_CREATOR_ROLES, {
      title: `${ctx.woNo} đã bị huỷ`,
      message: ctx.reason ? `Lý do: ${ctx.reason}` : "Lệnh sản xuất đã huỷ, vật tư giữ chỗ đã được nhả.",
      links: woLinks(ctx.woId),
      severity: "warning",
    }),
  ]);
}

/** Hoàn thành lệnh → người lập + Kho (nhập thành phẩm nếu có). */
export function planWOCompleted(ctx: WOCtx & { goodQty?: number | string | null }): NotifyPlan {
  return woPlan("WO_COMPLETED", ctx, [
    user(ctx.creatorUserId, WO_CREATOR_ROLES, {
      title: `${ctx.woNo} đã hoàn thành`,
      message: ctx.goodQty ? `${ctx.goodQty} sản phẩm đạt đã sản xuất xong.` : "Lệnh sản xuất đã hoàn thành.",
      links: woLinks(ctx.woId),
      severity: "success",
    }),
    role("warehouse", {
      title: `${ctx.woNo} đã sản xuất xong`,
      message: ctx.goodQty
        ? `Thành phẩm đạt: ${ctx.goodQty}. Tiếp nhận vào kho nếu có hàng giao về.`
        : "Tiếp nhận thành phẩm vào kho nếu có hàng giao về.",
      links: [L.whIn],
    }),
  ]);
}

/* ── Phiếu yêu cầu vật tư ─────────────────────────────────────────────── */

export interface MRCtx extends Actor {
  requestId: string;
  requestNo: string;
  requesterUserId?: string | null;
  itemSummary?: string;
}

const mrPlan = (
  eventType: NotificationEventType,
  ctx: MRCtx,
  targets: NotifyTarget[],
): NotifyPlan => ({
  eventType,
  entityType: "material_request",
  entityId: ctx.requestId,
  entityCode: ctx.requestNo,
  actorUserId: ctx.actorUserId,
  actorUsername: ctx.actorUsername,
  targets,
});

export function planMaterialRequestNew(ctx: MRCtx): NotifyPlan {
  return mrPlan("MATERIAL_REQUEST_NEW", ctx, [
    role("warehouse", {
      title: `${ctx.actorUsername ?? "Người lập phiếu"} yêu cầu vật tư ${ctx.requestNo}`,
      message: ctx.itemSummary ?? "Chờ Bộ phận Kho chuẩn bị",
      links: [L.mr(ctx.requestId), L.whOut],
      category: "action",
    }),
  ]);
}

export function planMaterialRequestPicking(ctx: MRCtx): NotifyPlan {
  return mrPlan("MATERIAL_REQUEST_PICKING", ctx, [
    user(ctx.requesterUserId, MR_CREATOR_ROLES, {
      title: `${ctx.requestNo} đang được Kho chuẩn bị`,
      message: "Kho đã nhận phiếu và đang soạn vật tư.",
      links: [L.mr(ctx.requestId)],
    }),
  ]);
}

export function planMaterialRequestReady(ctx: MRCtx): NotifyPlan {
  return mrPlan("MATERIAL_REQUEST_READY", ctx, [
    user(ctx.requesterUserId, MR_CREATOR_ROLES, {
      title: `${ctx.requestNo} đã chuẩn bị xong`,
      message: "Lên kho nhận vật tư — Kho sẽ lập phiếu xuất khi giao.",
      links: [L.mr(ctx.requestId)],
      severity: "success",
    }),
  ]);
}

export function planMaterialRequestIssued(
  ctx: MRCtx & { issueNo: string; totalQty?: number; full: boolean },
): NotifyPlan {
  return mrPlan(ctx.full ? "MATERIAL_REQUEST_DELIVERED" : "MATERIAL_REQUEST_ISSUED", ctx, [
    user(ctx.requesterUserId, MR_CREATOR_ROLES, ctx.full
      ? {
          title: `${ctx.requestNo} đã giao đủ`,
          message: `Kho đã xuất đủ vật tư theo phiếu xuất ${ctx.issueNo}.`,
          links: [L.mr(ctx.requestId)],
          severity: "success",
        }
      : {
          title: `${ctx.requestNo} đã giao một phần`,
          message: `Kho đã xuất ${ctx.issueNo}${ctx.totalQty ? ` (${ctx.totalQty.toLocaleString("vi-VN")} đơn vị)` : ""}; phần còn lại sẽ giao tiếp.`,
          links: [L.mr(ctx.requestId)],
        }),
  ]);
}

/** Huỷ phiếu: người lập tự huỷ → báo Kho; Kho huỷ/đóng → báo người lập. */
export function planMaterialRequestCancelled(
  ctx: MRCtx & { byRequester: boolean; partial: boolean; notes?: string | null },
): NotifyPlan {
  const extra = ctx.notes ? ` Ghi chú: ${ctx.notes}` : "";
  return mrPlan(
    "MATERIAL_REQUEST_CANCELLED",
    ctx,
    ctx.byRequester
      ? [
          role("warehouse", {
            title: `${ctx.requestNo} đã bị người lập huỷ`,
            message: `Không cần chuẩn bị vật tư cho phiếu này nữa.${extra}`,
            links: [L.mr(ctx.requestId), L.whOut],
            severity: "warning",
          }),
        ]
      : [
          user(ctx.requesterUserId, MR_CREATOR_ROLES, {
            title: ctx.partial
              ? `${ctx.requestNo} đã đóng — phần còn lại không giao`
              : `${ctx.requestNo} đã bị Kho huỷ`,
            message: `Người thao tác: ${ctx.actorUsername ?? "—"}.${extra}`,
            links: [L.mr(ctx.requestId)],
            severity: "warning",
          }),
        ],
  );
}

/* ── Yêu cầu xuất kho (ISR) ───────────────────────────────────────────── */

export interface ISRCtx extends Actor {
  requestId: string;
  requestNo: string;
  requesterUserId?: string | null;
  reference?: string | null;
  totalQty?: number | null;
  /** reason của ISR: production | sales | return | … — sales/return chỉ Giám đốc duyệt. */
  reason?: string | null;
}

const isrLinks = [L.whOut, L.operations];
export const DIRECTOR_ONLY_ISR_REASONS: readonly string[] = ["sales", "return"];

export function planIssueRequestNew(ctx: ISRCtx): NotifyPlan {
  const directorOnly = DIRECTOR_ONLY_ISR_REASONS.includes(ctx.reason ?? "");
  const detail = ctx.reference
    ? `Tham chiếu ${ctx.reference}${ctx.totalQty ? ` · SL ${ctx.totalQty}` : ""}`
    : ctx.totalQty
      ? `SL ${ctx.totalQty}`
      : "";
  const who = ctx.actorUsername ?? "Người lập phiếu";
  const adminContent: NotifyContent = {
    title: directorOnly
      ? `${who} yêu cầu xuất ${ctx.reason === "sales" ? "bán" : "trả NCC"} ${ctx.requestNo} — chờ duyệt`
      : `${who} yêu cầu xuất kho ${ctx.requestNo}`,
    message: detail || "Chờ duyệt xuất kho",
    links: [L.whOut],
    severity: directorOnly ? "warning" : "info",
    email: directorOnly,
    category: "action",
    push: directorOnly,
  };
  const targets: NotifyTarget[] = [];
  if (directorOnly) targets.push(role("admin", adminContent));
  targets.push(
    role("warehouse", {
      title: `${who} yêu cầu xuất kho ${ctx.requestNo}`,
      message: directorOnly
        ? `${detail ? `${detail} · ` : ""}Xuất bán/trả NCC — chờ Giám đốc duyệt.`
        : detail || "Chờ duyệt xuất kho",
      links: [L.whOut],
      email: !directorOnly,
      // directorOnly: Kho chỉ biết trước, chưa làm được gì tới khi Giám đốc duyệt.
      category: directorOnly ? "update" : "action",
      push: !directorOnly,
    }),
  );
  return {
    eventType: "ISSUE_REQUEST_NEW",
    entityType: "warehouse_issue_request",
    entityId: ctx.requestId,
    entityCode: ctx.requestNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets,
    adminFallback: { ...adminContent, email: false },
  };
}

export function planIssueRequestApproved(ctx: ISRCtx): NotifyPlan {
  return {
    eventType: "ISSUE_REQUEST_APPROVED",
    entityType: "warehouse_issue_request",
    entityId: ctx.requestId,
    entityCode: ctx.requestNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      user(ctx.requesterUserId, ISR_CREATOR_ROLES, {
        title: `${ctx.requestNo} đã được duyệt + xuất kho`,
        message: ctx.totalQty
          ? `Đã xuất SL ${ctx.totalQty}. Liên hệ Kho để nhận hàng.`
          : "Hàng đã xuất kho. Liên hệ Kho để nhận.",
        links: isrLinks,
        severity: "success",
      }),
    ],
  };
}

export function planIssueRequestRejected(ctx: ISRCtx & { rejectReason?: string | null }): NotifyPlan {
  return {
    eventType: "ISSUE_REQUEST_REJECTED",
    entityType: "warehouse_issue_request",
    entityId: ctx.requestId,
    entityCode: ctx.requestNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      user(ctx.requesterUserId, ISR_CREATOR_ROLES, {
        title: `${ctx.requestNo} bị từ chối`,
        message: ctx.rejectReason
          ? `Lý do: ${ctx.rejectReason} (người từ chối: ${ctx.actorUsername ?? "—"})`
          : `Người từ chối: ${ctx.actorUsername ?? "—"}.`,
        links: isrLinks,
        severity: "warning",
      }),
    ],
  };
}

/* ── Phiếu giao hàng / BBGH ───────────────────────────────────────────── */

export interface DeliveryNoteCtx extends Actor {
  deliveryNoteId: string;
  noteNo: string;
}

const dnPlan = (
  eventType: NotificationEventType,
  ctx: DeliveryNoteCtx,
  targets: NotifyTarget[],
): NotifyPlan => ({
  eventType,
  entityType: "delivery_note",
  entityId: ctx.deliveryNoteId,
  entityCode: ctx.noteNo,
  actorUserId: ctx.actorUserId,
  actorUsername: ctx.actorUsername,
  targets,
});

export function planDeliveryNoteCreated(ctx: DeliveryNoteCtx): NotifyPlan {
  return dnPlan("DELIVERY_NOTE_CREATED", ctx, [
    role("admin", {
      title: `${ctx.actorUsername ?? "Kho"} lập phiếu giao hàng ${ctx.noteNo} — chờ duyệt`,
      message: "Chỉ Giám đốc được phê duyệt phiếu giao hàng ra ngoài công ty.",
      links: [L.whDeliveryNote(ctx.deliveryNoteId)],
      email: true,
      category: "action",
      push: true,
    }),
  ]);
}

/** Giám đốc duyệt BBGH → Kho (in 3 liên) + Thu mua (link PO/ Đặt hàng — Thu mua không vào /warehouse). */
export function planDeliveryNoteConfirmed(ctx: DeliveryNoteCtx & { poId?: string | null }): NotifyPlan {
  return dnPlan("DELIVERY_NOTE_CONFIRMED", ctx, [
    role("warehouse", {
      title: `BBGH ${ctx.noteNo} đã hoàn tất`,
      message: "Giám đốc đã duyệt — in 3 liên giao cho tài xế/khách ký nhận.",
      links: [L.whDeliveryNote(ctx.deliveryNoteId)],
      severity: "success",
    }),
    role("purchaser", {
      title: `BBGH ${ctx.noteNo} đã hoàn tất`,
      message: "Giám đốc đã duyệt biên bản giao hàng — lưu hồ sơ/đối chiếu công nợ (bản PDF lấy tại Kho).",
      links: [...(ctx.poId ? [L.po(ctx.poId)] : []), L.salesPo],
      severity: "success",
    }),
  ]);
}

export function planDeliveryNoteRejected(
  ctx: DeliveryNoteCtx & { deliveredByUserId: string; reason?: string | null },
): NotifyPlan {
  return dnPlan("DELIVERY_NOTE_REJECTED", ctx, [
    user(ctx.deliveredByUserId, DELIVERY_NOTE_CREATOR_ROLES, {
      title: `Phiếu giao hàng ${ctx.noteNo} bị từ chối`,
      message: ctx.reason ? `Lý do: ${ctx.reason}` : undefined,
      links: [L.whDeliveryNote(ctx.deliveryNoteId)],
      severity: "warning",
    }),
  ]);
}

/* ── Tài chính ────────────────────────────────────────────────────────── */

/**
 * Ghi nhận thanh toán → Kế toán KHÁC; nếu chỉ có 1 kế toán (chính người ghi)
 * thì báo Giám đốc để luôn có người biết khoản thu/chi đã ghi.
 */
export function planPaymentRecorded(
  ctx: Actor & { paymentId: string; paymentCode: string; totalAmount: number; direction: "IN" | "OUT" },
): NotifyPlan {
  const content: NotifyContent = {
    title: `${ctx.paymentCode} đã ghi nhận thanh toán`,
    message: `${ctx.direction === "IN" ? "Thu" : "Chi"} ${vnd(ctx.totalAmount)} — người ghi: ${ctx.actorUsername ?? "—"}`,
    links: [L.finPayments],
    severity: "success",
  };
  return {
    eventType: "FIN_PAYMENT_RECORDED",
    entityType: "fin_payment",
    entityId: ctx.paymentId,
    entityCode: ctx.paymentCode,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [role("accountant", content)],
    adminFallback: content,
  };
}

/* ── Kiểm kê kho ──────────────────────────────────────────────────────── */

export interface StocktakeCtx extends Actor {
  sessionId: string;
  code: string;
}

/** Kho gửi duyệt (DRAFT→PENDING_APPROVAL) → CHỈ Giám đốc (admin) cần biết để chốt. */
export function planStocktakeSubmitted(ctx: StocktakeCtx): NotifyPlan {
  const content: NotifyContent = {
    title: `Phiếu kiểm kê ${ctx.code} chờ duyệt`,
    message: "Kho đã đếm xong — cần Giám đốc duyệt để ghi điều chỉnh tồn.",
    links: [L.whStocktake(ctx.sessionId)],
    severity: "warning",
    email: true,
  };
  return {
    eventType: "STOCKTAKE_SUBMITTED",
    entityType: "stocktake_session",
    entityId: ctx.sessionId,
    entityCode: ctx.code,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [role("admin", content)],
  };
}

/** Giám đốc chốt (APPROVED) → người tạo phiếu + Kho (đã ghi điều chỉnh tồn). */
export function planStocktakeApproved(
  ctx: StocktakeCtx & { creatorUserId: string; diffLineCount: number },
): NotifyPlan {
  const content: NotifyContent = {
    title: `Phiếu kiểm kê ${ctx.code} đã được duyệt`,
    message:
      ctx.diffLineCount > 0
        ? `Đã ghi điều chỉnh tồn cho ${ctx.diffLineCount} dòng chênh lệch.`
        : "Không có chênh lệch — không ghi điều chỉnh nào.",
    links: [L.whStocktake(ctx.sessionId)],
    severity: "success",
  };
  return {
    eventType: "STOCKTAKE_APPROVED",
    entityType: "stocktake_session",
    entityId: ctx.sessionId,
    entityCode: ctx.code,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      user(ctx.creatorUserId, STOCKTAKE_CREATOR_ROLES, content),
      role("warehouse", content),
    ],
  };
}

/** Giám đốc trả lại kèm lý do (REJECTED) → người tạo phiếu + Kho (đếm lại). */
export function planStocktakeRejected(
  ctx: StocktakeCtx & { creatorUserId: string; reason?: string | null },
): NotifyPlan {
  const content: NotifyContent = {
    title: `Phiếu kiểm kê ${ctx.code} bị trả lại`,
    message: ctx.reason
      ? `Lý do: ${ctx.reason} — đếm lại rồi gửi duyệt lại.`
      : "Cần đếm lại rồi gửi duyệt lại.",
    links: [L.whStocktake(ctx.sessionId)],
    severity: "warning",
  };
  return {
    eventType: "STOCKTAKE_REJECTED",
    entityType: "stocktake_session",
    entityId: ctx.sessionId,
    entityCode: ctx.code,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: [
      user(ctx.creatorUserId, STOCKTAKE_CREATOR_ROLES, content),
      role("warehouse", content),
    ],
  };
}
