import { and, eq, sql } from "drizzle-orm";
import { notification, role, userAccount, userRole } from "@iot/db/schema";
import type { Role } from "@iot/shared";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * V3.3 — Notification service.
 *
 * Helpers để emit notification fire-and-forget từ flow PR/PO/WO/MaterialRequest.
 * KHÔNG throw — log warn nếu fail để tránh phá business logic chính.
 */

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export type NotificationEventType =
  // Purchase Request flow
  | "PR_SUBMITTED"
  | "PR_DEPT_APPROVED" // V3.7.69 YCVT step 2/3 — Trưởng bộ phận duyệt
  | "PR_APPROVED"      // = step 3/3 (Giám đốc) hoặc legacy 1-step
  | "PR_REJECTED"
  // Purchase Order flow
  | "PO_SENT"
  | "PO_RECEIVED_PARTIAL"
  | "PO_RECEIVED_FULL"
  // V3.7.43 — PO Subcontract (gia công ngoài) DRAFT cần TM-A chốt giá + duyệt
  | "PO_SUBCONTRACT_DRAFT"
  // Work Order flow
  | "WO_RELEASED"
  | "WO_COMPLETED"
  // V3.7.46 — Production Request approval flow:
  // TK-A submit YCSX → VH-A approve/reject → notify TK-A
  | "WO_REQUEST_SUBMITTED"
  | "WO_APPROVED"
  | "WO_REJECTED"
  | "WO_PROGRESS_UPDATED"
  // Material Request flow
  | "MATERIAL_REQUEST_NEW"
  | "MATERIAL_REQUEST_PICKING"
  | "MATERIAL_REQUEST_READY"
  | "MATERIAL_REQUEST_DELIVERED"
  | "MATERIAL_REQUEST_CANCELLED"
  // V3.7.17 — Warehouse Issue Request flow
  | "ISSUE_REQUEST_NEW"
  | "ISSUE_REQUEST_APPROVED"
  | "ISSUE_REQUEST_REJECTED";

export interface EmitNotificationInput {
  /** User cụ thể (đếm vào unread badge). Bỏ qua nếu chỉ broadcast role. */
  recipientUser?: string | null;
  /** Broadcast tới mọi user có role này (không đếm vào badge user khác). */
  recipientRole?: Role | null;
  /** User gây ra event (để hiển thị "by Nguyễn A"). */
  actorUserId?: string | null;
  actorUsername?: string | null;
  eventType: NotificationEventType;
  entityType?: string;
  entityId?: string;
  entityCode?: string;
  title: string;
  message?: string;
  link?: string;
  severity?: NotificationSeverity;
}

/**
 * Insert 1 row notification. Trả về id nếu thành công, null nếu fail.
 * Không throw — chỉ log warn.
 */
export async function emitNotification(
  input: EmitNotificationInput,
): Promise<string | null> {
  if (!input.recipientUser && !input.recipientRole) {
    logger.warn({ input }, "emitNotification: no recipient");
    return null;
  }
  try {
    const [row] = await db
      .insert(notification)
      .values({
        recipientUser: input.recipientUser ?? null,
        recipientRole: input.recipientRole ?? null,
        actorUserId: input.actorUserId ?? null,
        actorUsername: input.actorUsername ?? null,
        eventType: input.eventType,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        entityCode: input.entityCode ?? null,
        title: input.title,
        message: input.message ?? null,
        link: input.link ?? null,
        severity: input.severity ?? "info",
      })
      .returning({ id: notification.id });
    return row?.id ?? null;
  } catch (err) {
    logger.warn({ err, input }, "emitNotification failed");
    return null;
  }
}

/**
 * Helper: emit nhiều notifications cùng lúc (vd PO received → notify
 * purchaser + engineer creator + warehouse).
 * Filter bỏ entry không có recipient.
 */
export async function emitNotifications(
  inputs: EmitNotificationInput[],
): Promise<void> {
  await Promise.allSettled(inputs.map((i) => emitNotification(i)));
}

/**
 * V3.9 — Fan-out notification DIRECT tới từng user active có role chỉ định.
 * Khác `recipientRole` broadcast: mỗi user 1 row riêng → ĐẾM vào badge chuông
 * (getUnreadCount chỉ đếm recipientUser) + read-state độc lập từng người.
 * Loại actor khỏi danh sách (không tự notify chính mình). Không throw.
 */
export async function emitToUsersWithRole(
  roleCode: Role,
  input: Omit<EmitNotificationInput, "recipientUser" | "recipientRole">,
): Promise<void> {
  try {
    const rows = await db
      .select({ id: userRole.userId })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.roleId))
      .innerJoin(userAccount, eq(userAccount.id, userRole.userId))
      .where(and(eq(role.code, roleCode), eq(userAccount.isActive, true)));
    const actorId = input.actorUserId ?? null;
    const ids = rows.map((r) => r.id).filter((id) => id !== actorId);
    await emitNotifications(
      ids.map((id) => ({ ...input, recipientUser: id })),
    );
  } catch (err) {
    logger.warn({ err, roleCode }, "emitToUsersWithRole failed");
  }
}

/* ── Convenience builders cho từng event type ────────────────────────────── */

export interface PRNotifyContext {
  prId: string;
  prNo: string;
  title?: string | null;
  actorUserId: string;
  actorUsername: string;
  creatorUserId?: string | null;
}

/**
 * V3.7.69 YCVT step 2 — Trưởng bộ phận duyệt → notify purchaser role
 * (để Giám đốc/Mua hàng biết phiếu chờ duyệt cuối).
 */
export async function notifyPRDeptApproved(ctx: PRNotifyContext) {
  await emitNotification({
    recipientRole: "purchaser",
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PR_DEPT_APPROVED",
    entityType: "purchase_request",
    entityId: ctx.prId,
    entityCode: ctx.prNo,
    title: `${ctx.prNo} đã qua Trưởng bộ phận`,
    message: ctx.title
      ? `"${ctx.title}" — chờ Giám đốc/Mua hàng duyệt cuối`
      : "Chờ Giám đốc/Mua hàng duyệt cuối",
    link: `/procurement/purchase-requests/${ctx.prId}`,
    severity: "info",
  });
  // Đồng thời báo cho creator biết tiến độ
  if (ctx.creatorUserId) {
    await emitNotification({
      recipientUser: ctx.creatorUserId,
      actorUserId: ctx.actorUserId,
      actorUsername: ctx.actorUsername,
      eventType: "PR_DEPT_APPROVED",
      entityType: "purchase_request",
      entityId: ctx.prId,
      entityCode: ctx.prNo,
      title: `${ctx.prNo} đã qua bước 2/3`,
      message: "Trưởng bộ phận đã duyệt — đang chờ Giám đốc duyệt cuối.",
      link: `/procurement/purchase-requests/${ctx.prId}`,
      severity: "success",
    });
  }
}

/** Engineer submit PR → notify purchaser role + fan-out direct tới admin */
export async function notifyPRSubmitted(ctx: PRNotifyContext) {
  // Broadcast cho Thu mua (backward-compat — purchaser thấy trong list).
  await emitNotification({
    recipientRole: "purchaser",
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PR_SUBMITTED",
    entityType: "purchase_request",
    entityId: ctx.prId,
    entityCode: ctx.prNo,
    title: `Yêu cầu mua mới: ${ctx.prNo}`,
    message: ctx.title ? `"${ctx.title}" — chờ duyệt` : "Chờ Bộ phận Thu mua duyệt",
    link: `/procurement/purchase-requests/${ctx.prId}`,
    severity: "info",
  });
  // V3.9 — fan-out DIRECT tới mọi admin (đếm badge) để duyệt nhanh.
  await emitToUsersWithRole("admin", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PR_SUBMITTED",
    entityType: "purchase_request",
    entityId: ctx.prId,
    entityCode: ctx.prNo,
    title: `Phiếu YCVT mới chờ duyệt: ${ctx.prNo}`,
    message: ctx.title
      ? `"${ctx.title}" — bấm để duyệt nhanh`
      : "Bấm để xem và duyệt nhanh",
    link: `/procurement/purchase-requests/${ctx.prId}`,
    severity: "info",
  });
}

/** Purchaser approve PR → notify engineer creator */
export async function notifyPRApproved(ctx: PRNotifyContext) {
  if (!ctx.creatorUserId) return;
  await emitNotification({
    recipientUser: ctx.creatorUserId,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PR_APPROVED",
    entityType: "purchase_request",
    entityId: ctx.prId,
    entityCode: ctx.prNo,
    title: `${ctx.prNo} đã được duyệt`,
    message: "Bộ phận Thu mua đang tiến hành tạo PO.",
    link: `/procurement/purchase-requests/${ctx.prId}`,
    severity: "success",
  });
}

/**
 * V3.9 — Sau duyệt cuối (director-approve HOẶC quick-approve): fan-out direct
 * tới mọi user accountant. Link = trang chi tiết PR (đã có sẵn 2 nút tải
 * PDF/Excel) — không đính kèm file, không cần SMTP. Tái dùng event PR_APPROVED.
 */
export async function notifyPRApprovedToAccounting(ctx: PRNotifyContext) {
  await emitToUsersWithRole("accountant", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PR_APPROVED",
    entityType: "purchase_request",
    entityId: ctx.prId,
    entityCode: ctx.prNo,
    title: `Phiếu ${ctx.prNo} đã duyệt — tải PDF/Excel`,
    message: ctx.title
      ? `"${ctx.title}" — mở phiếu để tải bản PDF/Excel gửi thanh toán.`
      : "Mở phiếu để tải bản PDF/Excel.",
    link: `/procurement/purchase-requests/${ctx.prId}`,
    severity: "success",
  });
}

/** Purchaser reject PR → notify engineer creator */
export async function notifyPRRejected(ctx: PRNotifyContext & { reason?: string }) {
  if (!ctx.creatorUserId) return;
  await emitNotification({
    recipientUser: ctx.creatorUserId,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PR_REJECTED",
    entityType: "purchase_request",
    entityId: ctx.prId,
    entityCode: ctx.prNo,
    title: `${ctx.prNo} bị từ chối`,
    message: ctx.reason ? `Lý do: ${ctx.reason}` : "Liên hệ Bộ phận Thu mua để biết chi tiết",
    link: `/procurement/purchase-requests/${ctx.prId}`,
    severity: "warning",
  });
}

export interface PONotifyContext {
  poId: string;
  poNo: string;
  supplierName?: string | null;
  actorUserId: string;
  actorUsername: string;
  /** PR creator (engineer) — nhận thông báo khi PO received. */
  prCreatorUserId?: string | null;
}

/** Purchaser send PO → notify warehouse role */
export async function notifyPOSent(ctx: PONotifyContext) {
  await emitNotification({
    recipientRole: "warehouse",
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PO_SENT",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    title: `${ctx.poNo} đã gửi NCC, sắp về kho`,
    message: ctx.supplierName ? `Nhà cung cấp: ${ctx.supplierName}` : undefined,
    link: `/warehouse?tab=receiving`,
    severity: "info",
  });
}

/** Warehouse nhận PO partial → notify purchaser role */
export async function notifyPOReceivedPartial(ctx: PONotifyContext) {
  await emitNotification({
    recipientRole: "purchaser",
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PO_RECEIVED_PARTIAL",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    title: `${ctx.poNo} đã nhận một phần`,
    message: "Theo dõi đợt nhận tiếp theo từ NCC",
    link: `/procurement/purchase-orders/${ctx.poId}`,
    severity: "info",
  });
}

/** Warehouse approve nhận đủ PO → notify purchaser + engineer creator + warehouse role */
export async function notifyPOReceivedFull(ctx: PONotifyContext) {
  const inputs: EmitNotificationInput[] = [
    {
      recipientRole: "purchaser",
      actorUserId: ctx.actorUserId,
      actorUsername: ctx.actorUsername,
      eventType: "PO_RECEIVED_FULL",
      entityType: "purchase_order",
      entityId: ctx.poId,
      entityCode: ctx.poNo,
      title: `${ctx.poNo} đã nhận đủ`,
      message: "PO đã hoàn tất, vào trạng thái RECEIVED",
      link: `/procurement/purchase-orders/${ctx.poId}`,
      severity: "success",
    },
  ];
  // Engineer creator nhận thông báo cá nhân (đếm vào badge)
  if (ctx.prCreatorUserId) {
    inputs.push({
      recipientUser: ctx.prCreatorUserId,
      actorUserId: ctx.actorUserId,
      actorUsername: ctx.actorUsername,
      eventType: "PO_RECEIVED_FULL",
      entityType: "purchase_order",
      entityId: ctx.poId,
      entityCode: ctx.poNo,
      title: `Linh kiện đã về: ${ctx.poNo}`,
      message: "PR bạn đề xuất đã về kho đầy đủ. BOM list đã cập nhật tiến độ.",
      link: `/procurement/purchase-orders/${ctx.poId}`,
      severity: "success",
    });
  }
  await emitNotifications(inputs);
}

export interface WONotifyContext {
  woId: string;
  woNo: string;
  productName?: string | null;
  plannedQty?: number | string;
  actorUserId: string;
  actorUsername: string;
  creatorUserId?: string | null;
}

/**
 * V3.7.46 — Engineer (TK-A) submit YÊU CẦU sản xuất → notify operator role
 * (broadcast tất cả VH để duyệt). Khác notifyWOReleased: yêu cầu chứ chưa
 * phải lệnh chính thức.
 */
export async function notifyWORequestSubmitted(ctx: WONotifyContext) {
  await emitNotification({
    recipientRole: "operator",
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "WO_REQUEST_SUBMITTED",
    entityType: "work_order",
    entityId: ctx.woId,
    entityCode: ctx.woNo,
    title: `Yêu cầu sản xuất mới: ${ctx.woNo}`,
    message: ctx.productName
      ? `${ctx.productName}${ctx.plannedQty ? ` × ${ctx.plannedQty}` : ""} — chờ duyệt`
      : "Bộ phận Thiết kế gửi yêu cầu — chờ Gia công duyệt",
    link: `/work-orders/${ctx.woId}`,
    severity: "info",
  });
}

/**
 * V3.7.46 — Operator (VH-A) approve YCSX → DRAFT→RELEASED → notify creator (TK-A).
 */
export async function notifyWOApproved(ctx: WONotifyContext) {
  if (!ctx.creatorUserId) return;
  await emitNotification({
    recipientUser: ctx.creatorUserId,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "WO_APPROVED",
    entityType: "work_order",
    entityId: ctx.woId,
    entityCode: ctx.woNo,
    title: `Yêu cầu SX ${ctx.woNo} đã được duyệt`,
    message: "Gia công đã chấp nhận, đang tiến hành sản xuất.",
    link: `/work-orders/${ctx.woId}`,
    severity: "success",
  });
}

/**
 * V3.7.46 — Operator reject YCSX → DRAFT→CANCELLED → notify creator.
 */
export async function notifyWORejected(
  ctx: WONotifyContext & { reason?: string },
) {
  if (!ctx.creatorUserId) return;
  await emitNotification({
    recipientUser: ctx.creatorUserId,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "WO_REJECTED",
    entityType: "work_order",
    entityId: ctx.woId,
    entityCode: ctx.woNo,
    title: `Yêu cầu SX ${ctx.woNo} bị từ chối`,
    message: ctx.reason
      ? `Lý do: ${ctx.reason}`
      : "Gia công đã từ chối yêu cầu.",
    link: `/work-orders/${ctx.woId}`,
    severity: "warning",
  });
}

/**
 * V3.7.46 — Operator báo cáo tiến độ → notify creator (TK-A).
 */
export async function notifyWOProgressUpdated(
  ctx: WONotifyContext & {
    percentCompleted?: number | string;
    goodQty?: number | string;
  },
) {
  if (!ctx.creatorUserId) return;
  const pct = ctx.percentCompleted ? `${ctx.percentCompleted}%` : "";
  await emitNotification({
    recipientUser: ctx.creatorUserId,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "WO_PROGRESS_UPDATED",
    entityType: "work_order",
    entityId: ctx.woId,
    entityCode: ctx.woNo,
    title: `Tiến độ ${ctx.woNo}${pct ? ` — ${pct}` : ""}`,
    message: ctx.goodQty
      ? `Đã hoàn thành ${ctx.goodQty}${ctx.plannedQty ? `/${ctx.plannedQty}` : ""}`
      : "Cập nhật tiến độ mới",
    link: `/work-orders/${ctx.woId}`,
    severity: "info",
  });
}

/** Engineer release WO → notify operator role (legacy /quick endpoint) */
export async function notifyWOReleased(ctx: WONotifyContext) {
  await emitNotification({
    recipientRole: "operator",
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "WO_RELEASED",
    entityType: "work_order",
    entityId: ctx.woId,
    entityCode: ctx.woNo,
    title: `Lệnh sản xuất mới: ${ctx.woNo}`,
    message: ctx.productName
      ? `${ctx.productName}${ctx.plannedQty ? ` × ${ctx.plannedQty}` : ""}`
      : "Vào tab Gia công để bắt đầu sản xuất",
    link: `/work-orders/${ctx.woId}`,
    severity: "info",
  });
}

/** Operator complete WO → notify engineer creator + warehouse */
export async function notifyWOCompleted(ctx: WONotifyContext & { goodQty?: number | string }) {
  const inputs: EmitNotificationInput[] = [
    {
      recipientRole: "warehouse",
      actorUserId: ctx.actorUserId,
      actorUsername: ctx.actorUsername,
      eventType: "WO_COMPLETED",
      entityType: "work_order",
      entityId: ctx.woId,
      entityCode: ctx.woNo,
      title: `${ctx.woNo} đã sản xuất xong`,
      message: ctx.goodQty ? `Thành phẩm +${ctx.goodQty} đang chuẩn bị nhập kho` : undefined,
      link: `/work-orders/${ctx.woId}`,
      severity: "info",
    },
  ];
  if (ctx.creatorUserId) {
    inputs.push({
      recipientUser: ctx.creatorUserId,
      actorUserId: ctx.actorUserId,
      actorUsername: ctx.actorUsername,
      eventType: "WO_COMPLETED",
      entityType: "work_order",
      entityId: ctx.woId,
      entityCode: ctx.woNo,
      title: `${ctx.woNo} đã hoàn thành`,
      message: ctx.goodQty
        ? `${ctx.goodQty} sản phẩm đã sản xuất xong.`
        : "Sản phẩm đã sẵn sàng",
      link: `/work-orders/${ctx.woId}`,
      severity: "success",
    });
  }
  await emitNotifications(inputs);
}

export interface MaterialRequestNotifyContext {
  requestId: string;
  requestNo: string;
  actorUserId: string;
  actorUsername: string;
  requesterUserId?: string | null;
  itemSummary?: string;
}

/** Engineer tạo Material Request → notify warehouse */
export async function notifyMaterialRequestNew(ctx: MaterialRequestNotifyContext) {
  await emitNotification({
    recipientRole: "warehouse",
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "MATERIAL_REQUEST_NEW",
    entityType: "material_request",
    entityId: ctx.requestId,
    entityCode: ctx.requestNo,
    title: `Yêu cầu xuất kho: ${ctx.requestNo}`,
    message: ctx.itemSummary ?? "Chờ Bộ phận Kho chuẩn bị",
    link: `/material-requests/${ctx.requestId}`,
    severity: "info",
  });
}

/** Warehouse READY → notify engineer requester */
export async function notifyMaterialRequestReady(ctx: MaterialRequestNotifyContext) {
  if (!ctx.requesterUserId) return;
  await emitNotification({
    recipientUser: ctx.requesterUserId,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "MATERIAL_REQUEST_READY",
    entityType: "material_request",
    entityId: ctx.requestId,
    entityCode: ctx.requestNo,
    title: `${ctx.requestNo} đã chuẩn bị xong`,
    message: "Lên kho nhận linh kiện và xác nhận đã nhận.",
    link: `/material-requests/${ctx.requestId}`,
    severity: "success",
  });
}

/** Engineer DELIVERED → notify warehouse */
export async function notifyMaterialRequestDelivered(
  ctx: MaterialRequestNotifyContext,
) {
  await emitNotification({
    recipientRole: "warehouse",
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "MATERIAL_REQUEST_DELIVERED",
    entityType: "material_request",
    entityId: ctx.requestId,
    entityCode: ctx.requestNo,
    title: `${ctx.requestNo} đã giao thành công`,
    message: "Linh kiện đã được trao tay người yêu cầu.",
    link: `/material-requests/${ctx.requestId}`,
    severity: "success",
  });
}

/* ── V3.7.17 — Warehouse Issue Request notifications ─────────────────────── */

interface IssueRequestNotifyContext {
  requestId: string;
  requestNo: string;
  actorUserId: string;
  actorUsername?: string | null;
  requesterUserId?: string | null;
  reference?: string | null;
  totalQty?: number | null;
}

/** Operations tạo ISR PENDING → notify warehouse role broadcast */
export async function notifyIssueRequestNew(ctx: IssueRequestNotifyContext) {
  await emitNotification({
    recipientRole: "warehouse",
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "ISSUE_REQUEST_NEW",
    entityType: "warehouse_issue_request",
    entityId: ctx.requestId,
    entityCode: ctx.requestNo,
    title: `Yêu cầu xuất kho: ${ctx.requestNo}`,
    message: ctx.reference
      ? `Tham chiếu ${ctx.reference}${ctx.totalQty ? ` · ${ctx.totalQty} qty` : ""}`
      : "Chờ duyệt xuất kho",
    link: `/warehouse?tab=issue`,
    severity: "info",
  });
}

/** Warehouse APPROVE ISR (COMPLETED) → notify requester */
export async function notifyIssueRequestApproved(ctx: IssueRequestNotifyContext) {
  if (!ctx.requesterUserId) return;
  await emitNotification({
    recipientUser: ctx.requesterUserId,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "ISSUE_REQUEST_APPROVED",
    entityType: "warehouse_issue_request",
    entityId: ctx.requestId,
    entityCode: ctx.requestNo,
    title: `${ctx.requestNo} đã được duyệt + xuất kho`,
    message: ctx.totalQty
      ? `Đã xuất ${ctx.totalQty} qty. Liên hệ Kho để nhận linh kiện.`
      : "Hàng đã sẵn sàng giao. Liên hệ Kho.",
    link: `/operations`,
    severity: "success",
  });
}

/** Warehouse REJECT ISR → notify requester */
export async function notifyIssueRequestRejected(
  ctx: IssueRequestNotifyContext & { reason?: string },
) {
  if (!ctx.requesterUserId) return;
  await emitNotification({
    recipientUser: ctx.requesterUserId,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "ISSUE_REQUEST_REJECTED",
    entityType: "warehouse_issue_request",
    entityId: ctx.requestId,
    entityCode: ctx.requestNo,
    title: `${ctx.requestNo} bị Kho từ chối`,
    message: ctx.reason ?? "Liên hệ Kho để biết lý do.",
    link: `/operations`,
    severity: "warning",
  });
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/**
 * Đếm số notifications chưa đọc của 1 user (cả direct + role broadcast).
 * Role broadcast KHÔNG đếm — chỉ direct user count vào badge.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notification)
    .where(
      sql`${notification.recipientUser} = ${userId} AND ${notification.readAt} IS NULL`,
    );
  return row?.count ?? 0;
}

/** Lấy username của 1 user — convenience cho actor info. */
export async function lookupUsername(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ username: userAccount.username })
    .from(userAccount)
    .where(eq(userAccount.id, userId))
    .limit(1);
  return row?.username ?? null;
}
