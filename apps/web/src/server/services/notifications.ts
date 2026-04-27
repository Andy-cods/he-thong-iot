import { eq, sql } from "drizzle-orm";
import { notification, userAccount } from "@iot/db/schema";
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
  | "PR_APPROVED"
  | "PR_REJECTED"
  // Purchase Order flow
  | "PO_SENT"
  | "PO_RECEIVED_PARTIAL"
  | "PO_RECEIVED_FULL"
  // Work Order flow
  | "WO_RELEASED"
  | "WO_COMPLETED"
  // Material Request flow
  | "MATERIAL_REQUEST_NEW"
  | "MATERIAL_REQUEST_PICKING"
  | "MATERIAL_REQUEST_READY"
  | "MATERIAL_REQUEST_DELIVERED"
  | "MATERIAL_REQUEST_CANCELLED";

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

/* ── Convenience builders cho từng event type ────────────────────────────── */

export interface PRNotifyContext {
  prId: string;
  prNo: string;
  title?: string | null;
  actorUserId: string;
  actorUsername: string;
  creatorUserId?: string | null;
}

/** Engineer submit PR → notify purchaser role */
export async function notifyPRSubmitted(ctx: PRNotifyContext) {
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

/** Engineer release WO → notify operator role */
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
      : "Vào tab Vận hành để bắt đầu sản xuất",
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
