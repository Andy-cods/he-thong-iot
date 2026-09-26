import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { notification, role, userAccount, userRole } from "@iot/db/schema";
import type { Role } from "@iot/shared";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueueEmailSend } from "@/server/services/emailQueue";

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
  // V3.16 — worker (pr-reminder-scan) nhắc phiếu SUBMITTED/DEPT_APPROVED quá
  // 24h chưa xử lý. Insert trực tiếp từ apps/worker (không qua emitNotification)
  // — xem apps/worker/src/jobs/prReminderScan.ts.
  | "PR_PENDING_REMINDER"
  // Purchase Order flow
  | "PO_SENT"
  | "PO_RECEIVED_PARTIAL"
  | "PO_RECEIVED_FULL"
  // V3.16 — PR convert → N PO mới tạo (createPOFromPR), cần Thu mua gửi NCC.
  | "PO_CREATED_FROM_PR"
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
  // V4.1 Đợt 1b — Kho lập phiếu xuất giao MỘT PHẦN phiếu yêu cầu (→ người lập).
  | "MATERIAL_REQUEST_ISSUED"
  // V3.7.17 — Warehouse Issue Request flow
  | "ISSUE_REQUEST_NEW"
  | "ISSUE_REQUEST_APPROVED"
  | "ISSUE_REQUEST_REJECTED"
  // V4.0 Wave 3 Phase C — PO approve/reject (Giám đốc) + đổi giá lúc DRAFT
  // trước đây KHÔNG bắn notify gì (gap thật, xem wave-3 plan). Đặt tên khác
  // PR_APPROVED/PR_REJECTED để không nhầm PO với PR trong log/UI.
  | "PO_APPROVED"
  | "PO_APPROVAL_REJECTED"
  | "PO_PRICE_UPDATED"
  // V4.0 Wave 3 Phase D — Phiếu giao hàng / Biên bản giao hàng (BBGH).
  | "DELIVERY_NOTE_CREATED"
  | "DELIVERY_NOTE_CONFIRMED"
  | "DELIVERY_NOTE_REJECTED"
  // V4.0 đợt 2 Phase F — Tài chính: hoá đơn sắp/đã quá hạn, thanh toán ghi
  // nhận, công nợ phải thu quá hạn. FIN_INVOICE_DUE_SOON/FIN_INVOICE_OVERDUE
  // insert từ apps/worker (finInvoiceReminderScan.ts), tương tự
  // PR_PENDING_REMINDER — worker không import code apps/web.
  | "FIN_INVOICE_DUE_SOON"
  | "FIN_INVOICE_OVERDUE"
  | "FIN_PAYMENT_RECORDED"
  | "FIN_RECEIVABLE_OVERDUE"
  // V4.1 Đợt 1a — QC nhập kho: hàng nhận chờ QC (→ Tổ QC) + QC không đạt
  // (→ Kho + Thu mua). Cột event_type là varchar(64) → không cần migration.
  | "QC_RECEIPT_PENDING"
  | "QC_RECEIPT_FAILED";

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
 * V3.12 — Whitelist event GỬI EMAIL: chỉ sự kiện "cần người nhận HÀNH ĐỘNG
 * (duyệt)". Event kết quả (APPROVED/REJECTED/DELIVERED...) chỉ in-app,
 * không email — tránh spam hộp thư.
 */
const EMAIL_EVENTS: ReadonlySet<NotificationEventType> = new Set([
  "PR_SUBMITTED", // V4.0: warehouse (kiểm tồn + duyệt bước 2) + purchaser + admin
  "PR_DEPT_APPROVED", // chờ duyệt bước cuối → purchaser + admin
  "WO_REQUEST_SUBMITTED", // YCSX chờ duyệt → operator
  "ISSUE_REQUEST_NEW", // phiếu xuất kho chờ duyệt → warehouse
  "PO_SUBCONTRACT_DRAFT", // PO gia công chờ chốt giá → purchaser
  // V4.0 đợt 2 Phase F — chỉ 2 event "công nợ quá hạn" CẦN HÀNH ĐỘNG mới gửi
  // email (đề xuất trong wave-2-finance.md §F.1). DUE_SOON/PAYMENT_RECORDED
  // chỉ in-app, tránh spam hộp thư mỗi ngày.
  "FIN_INVOICE_OVERDUE",
  "FIN_RECEIVABLE_OVERDUE",
  // V4.0 Wave 3 Phase D — phiếu giao hàng chờ Giám đốc duyệt = "cần hành động".
  "DELIVERY_NOTE_CREATED",
] satisfies NotificationEventType[]);

/**
 * V3.12 — Gửi email cho notification vừa insert (nếu event thuộc whitelist).
 * Fire-and-forget: caller gọi `void maybeEmail(...)` — lỗi chỉ log warn.
 *
 * - recipientUser → email của đúng user đó (nếu đã điền email + active).
 * - recipientRole (broadcast) → fan-out email tới mọi user active có role,
 *   email khác null, loại actor (không tự email chính mình).
 *
 * Link trong email là link TUYỆT ĐỐI (APP_URL + link) để mở từ điện thoại.
 */
async function maybeEmail(
  notifId: string,
  input: EmitNotificationInput,
): Promise<void> {
  if (!env.MAIL_ENABLED) return;
  if (!EMAIL_EVENTS.has(input.eventType)) return;
  try {
    let recipients: Array<{ id: string; email: string }> = [];
    if (input.recipientUser) {
      recipients = await db
        .select({ id: userAccount.id, email: sql<string>`${userAccount.email}` })
        .from(userAccount)
        .where(
          and(
            eq(userAccount.id, input.recipientUser),
            eq(userAccount.isActive, true),
            isNotNull(userAccount.email),
          ),
        );
    } else if (input.recipientRole) {
      const actorId = input.actorUserId ?? null;
      recipients = await db
        .select({ id: userAccount.id, email: sql<string>`${userAccount.email}` })
        .from(userRole)
        .innerJoin(role, eq(role.id, userRole.roleId))
        .innerJoin(userAccount, eq(userAccount.id, userRole.userId))
        .where(
          and(
            eq(role.code, input.recipientRole),
            eq(userAccount.isActive, true),
            isNotNull(userAccount.email),
            ...(actorId ? [ne(userAccount.id, actorId)] : []),
          ),
        );
    }
    await Promise.allSettled(
      recipients.map((r) =>
        enqueueEmailSend(`${notifId}:${r.id}`, {
          to: r.email,
          eventType: input.eventType,
          title: input.title,
          message: input.message,
          entityCode: input.entityCode,
          actorUsername: input.actorUsername ?? undefined,
          link: input.link ? `${env.APP_URL}${input.link}` : undefined,
        }),
      ),
    );
  } catch (err) {
    logger.warn({ err, notifId }, "maybeEmail failed (bỏ qua)");
  }
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
    // V3.12 — email "cần duyệt" (whitelist EMAIL_EVENTS). Fire-and-forget:
    // không await để không cộng latency vào request nghiệp vụ.
    if (row?.id) void maybeEmail(row.id, input);
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
  // V3.16 (fix badge) — cần Thu mua HÀNH ĐỘNG (duyệt cuối) → fan-out direct
  // (đếm badge chuông) thay vì broadcast recipientRole (không đếm).
  await emitToUsersWithRole("purchaser", {
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
  // V4.0 — Giám đốc (admin) cũng duyệt bước cuối (director-approve/quick-approve)
  // nên phải nhận thông báo, nếu không phiếu chỉ trông chờ Thu mua online.
  await emitToUsersWithRole("admin", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PR_DEPT_APPROVED",
    entityType: "purchase_request",
    entityId: ctx.prId,
    entityCode: ctx.prNo,
    title: `${ctx.prNo} chờ Giám đốc duyệt cuối`,
    message: ctx.title
      ? `"${ctx.title}" — Kho đã kiểm tồn và duyệt`
      : "Kho đã kiểm tồn và duyệt — chờ duyệt cuối",
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
  // V4.0 — KHO là người duyệt bước kế tiếp (dept-approve): phải nhận thông báo
  // ĐẦU TIÊN để kiểm tra lượng tồn thực tế rồi mới duyệt cho mua. Trước V4.0
  // chỉ báo purchaser + admin nên Kho hoàn toàn không biết có phiếu chờ mình.
  await emitToUsersWithRole("warehouse", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PR_SUBMITTED",
    entityType: "purchase_request",
    entityId: ctx.prId,
    entityCode: ctx.prNo,
    title: `Cần kiểm tra tồn kho: ${ctx.prNo}`,
    message: ctx.title
      ? `"${ctx.title}" — kiểm tra lượng tồn rồi duyệt`
      : "Kiểm tra lượng tồn thực tế rồi duyệt phiếu",
    link: `/procurement/purchase-requests/${ctx.prId}`,
    severity: "warning",
  });
  // V3.16 (fix badge) — trước đây broadcast recipientRole (không đếm badge,
  // xác nhận qua DB: 29 dòng PR_SUBMITTED role=purchaser không ai bấm vào).
  // Đổi sang fan-out direct để đếm badge + read-state riêng từng người.
  await emitToUsersWithRole("purchaser", {
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
  // V3.16 (fix badge) — warehouse cần xử lý (chuẩn bị nhận hàng) → fan-out direct.
  await emitToUsersWithRole("warehouse", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PO_SENT",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    title: `${ctx.poNo} đã gửi NCC, sắp về kho`,
    message: ctx.supplierName ? `Nhà cung cấp: ${ctx.supplierName}` : undefined,
    link: `/warehouse?tab=movement&mode=in`,
    severity: "info",
  });
}

/** Warehouse nhận PO partial → notify purchaser role */
export async function notifyPOReceivedPartial(ctx: PONotifyContext) {
  // V3.16 (fix badge) — purchaser cần theo dõi đợt nhận tiếp theo → fan-out direct.
  await emitToUsersWithRole("purchaser", {
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
  // V3.16 (fix badge) — purchaser role: đổi broadcast → fan-out direct (đếm badge).
  await emitToUsersWithRole("purchaser", {
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
  });
  // Engineer creator nhận thông báo cá nhân (đếm vào badge) — vốn đã direct.
  if (ctx.prCreatorUserId) {
    await emitNotification({
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
}

export interface POCreatedFromPRNotifyContext {
  prId: string;
  prNo: string;
  /** PR creator (engineer) — báo tiến độ "đã lập PO". */
  prCreatorUserId?: string | null;
  poCount: number;
  /** PO đầu tiên trong lô vừa tạo — dùng làm link cho purchaser xử lý ngay. */
  firstPoId: string;
  actorUserId: string;
  actorUsername: string;
}

/**
 * V3.16 (vấn đề 2) — Convert PR → PO (createPOFromPR) thành công → notify:
 *  (a) PR creator: báo tiến độ (đã có PO, đang chờ gửi NCC).
 *  (b) role purchaser (fan-out direct, đếm badge): cần gửi NCC ngay.
 */
export async function notifyPOCreatedFromPR(ctx: POCreatedFromPRNotifyContext) {
  if (ctx.prCreatorUserId) {
    await emitNotification({
      recipientUser: ctx.prCreatorUserId,
      actorUserId: ctx.actorUserId,
      actorUsername: ctx.actorUsername,
      eventType: "PO_CREATED_FROM_PR",
      entityType: "purchase_request",
      entityId: ctx.prId,
      entityCode: ctx.prNo,
      title: `Phiếu ${ctx.prNo} đã được lập ${ctx.poCount} đơn mua hàng (PO)`,
      message: "Bộ phận Thu mua đang tiến hành gửi NCC.",
      link: `/procurement/purchase-requests/${ctx.prId}`,
      severity: "success",
    });
  }
  await emitToUsersWithRole("purchaser", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PO_CREATED_FROM_PR",
    entityType: "purchase_order",
    entityId: ctx.firstPoId,
    entityCode: ctx.prNo,
    title: `${ctx.poCount} PO mới từ phiếu ${ctx.prNo}`,
    message: "Cần gửi NCC để tiến hành mua hàng.",
    link: `/procurement/purchase-orders/${ctx.firstPoId}`,
    severity: "info",
  });
}

/**
 * V4.0 Wave 3 Phase C — trước đây approvePO/rejectPO KHÔNG bắn notify gì
 * (gap thật, xác nhận qua audit route approve/reject PO). Bổ sung: purchaser +
 * warehouse (chuẩn bị nhận hàng) + người đề xuất PR gốc (nếu PO có prId).
 */
export interface POApprovalNotifyContext {
  poId: string;
  poNo: string;
  actorUserId: string;
  actorUsername: string;
  /** Người đề xuất PR gốc (purchase_request.requestedBy qua purchase_order.prId). NULL nếu PO tạo thủ công. */
  prRequesterUserId?: string | null;
}

export async function notifyPOApproved(ctx: POApprovalNotifyContext) {
  await emitToUsersWithRole("purchaser", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PO_APPROVED",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    title: `${ctx.poNo} đã được Giám đốc duyệt`,
    message: "Có thể gửi NCC.",
    link: `/procurement/purchase-orders/${ctx.poId}`,
    severity: "success",
  });
  await emitToUsersWithRole("warehouse", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PO_APPROVED",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    title: `${ctx.poNo} đã duyệt — chuẩn bị nhận hàng`,
    link: `/procurement/purchase-orders/${ctx.poId}`,
    severity: "info",
  });
  if (ctx.prRequesterUserId) {
    await emitNotification({
      recipientUser: ctx.prRequesterUserId,
      actorUserId: ctx.actorUserId,
      actorUsername: ctx.actorUsername,
      eventType: "PO_APPROVED",
      entityType: "purchase_order",
      entityId: ctx.poId,
      entityCode: ctx.poNo,
      title: `Đơn mua cho đề xuất của bạn đã duyệt`,
      message: `${ctx.poNo} đã được Giám đốc duyệt.`,
      link: `/procurement/purchase-orders/${ctx.poId}`,
      severity: "success",
    });
  }
}

export async function notifyPOApprovalRejected(
  ctx: POApprovalNotifyContext & { reason?: string | null },
) {
  await emitToUsersWithRole("purchaser", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PO_APPROVAL_REJECTED",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    title: `${ctx.poNo} bị từ chối duyệt`,
    message: ctx.reason ? `Lý do: ${ctx.reason}` : undefined,
    link: `/procurement/purchase-orders/${ctx.poId}`,
    severity: "warning",
  });
  if (ctx.prRequesterUserId) {
    await emitNotification({
      recipientUser: ctx.prRequesterUserId,
      actorUserId: ctx.actorUserId,
      actorUsername: ctx.actorUsername,
      eventType: "PO_APPROVAL_REJECTED",
      entityType: "purchase_order",
      entityId: ctx.poId,
      entityCode: ctx.poNo,
      title: `Đơn mua cho đề xuất của bạn bị từ chối`,
      message: ctx.reason ? `Lý do: ${ctx.reason}` : undefined,
      link: `/procurement/purchase-orders/${ctx.poId}`,
      severity: "warning",
    });
  }
}

/**
 * V4.0 Wave 3 Phase C — Sửa đơn giá dòng PO khi còn DRAFT → báo Kho biết giá
 * dự kiến đã đổi (Kho thường xem PR/PO để đối chiếu tồn kho + kế hoạch nhận
 * hàng). Theo U-3: KHÔNG cho sửa giá khi đã SENT nên chỉ cần báo lúc DRAFT.
 */
export interface POPriceUpdateContext {
  poId: string;
  poNo: string;
  changedLineCount: number;
  actorUserId: string;
  actorUsername: string;
}

export async function notifyPOPriceUpdated(ctx: POPriceUpdateContext) {
  await emitToUsersWithRole("warehouse", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PO_PRICE_UPDATED",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    title: `${ctx.poNo} vừa đổi giá ${ctx.changedLineCount} dòng`,
    message: "Kiểm tra lại giá trị khi đối chiếu nhận hàng.",
    link: `/procurement/purchase-orders/${ctx.poId}`,
    severity: "warning",
  });
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
  // V3.16 (fix badge) — operator cần duyệt → fan-out direct thay vì broadcast.
  await emitToUsersWithRole("operator", {
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
  // V3.16 (fix badge) — operator cần bắt đầu sản xuất → fan-out direct.
  await emitToUsersWithRole("operator", {
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
  // V3.16 (fix badge) — warehouse cần xử lý (nhập kho thành phẩm) → fan-out
  // direct thay vì broadcast recipientRole (giống lý do đổi notifyPOSent).
  await emitToUsersWithRole("warehouse", {
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
  });
  if (ctx.creatorUserId) {
    await emitNotification({
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
  // V3.16 (fix badge) — warehouse cần chuẩn bị hàng → fan-out direct.
  await emitToUsersWithRole("warehouse", {
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

/**
 * V4.1 Đợt 1b — Kho lập phiếu xuất kho giao ĐỦ phiếu yêu cầu → báo người lập.
 *
 * Trước đây event này do engineer tự bấm "Xác nhận đã nhận" (không trừ tồn)
 * rồi broadcast cho Kho. Nay DELIVERED chỉ sinh ra khi Kho lập phiếu xuất
 * (PX) giao đủ → người cần biết là người lập phiếu yêu cầu (đếm vào badge).
 */
export async function notifyMaterialRequestDelivered(
  ctx: MaterialRequestNotifyContext & { issueNo: string },
) {
  if (!ctx.requesterUserId) return;
  await emitNotification({
    recipientUser: ctx.requesterUserId,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "MATERIAL_REQUEST_DELIVERED",
    entityType: "material_request",
    entityId: ctx.requestId,
    entityCode: ctx.requestNo,
    title: `${ctx.requestNo} đã giao đủ`,
    message: `Kho đã xuất đủ vật tư theo phiếu xuất ${ctx.issueNo}.`,
    link: `/material-requests/${ctx.requestId}`,
    severity: "success",
  });
}

/** V4.1 Đợt 1b — Kho lập phiếu xuất giao MỘT PHẦN → báo người lập phiếu. */
export async function notifyMaterialRequestIssued(
  ctx: MaterialRequestNotifyContext & { issueNo: string; totalQty?: number },
) {
  if (!ctx.requesterUserId) return;
  await emitNotification({
    recipientUser: ctx.requesterUserId,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "MATERIAL_REQUEST_ISSUED",
    entityType: "material_request",
    entityId: ctx.requestId,
    entityCode: ctx.requestNo,
    title: `${ctx.requestNo} đã giao một phần`,
    message: `Kho đã xuất ${ctx.issueNo}${ctx.totalQty ? ` (${ctx.totalQty.toLocaleString("vi-VN")} đơn vị)` : ""}; phần còn lại sẽ giao tiếp.`,
    link: `/material-requests/${ctx.requestId}`,
    severity: "info",
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

/** Operations tạo ISR PENDING → notify warehouse role */
export async function notifyIssueRequestNew(ctx: IssueRequestNotifyContext) {
  // V3.16 (fix badge) — warehouse cần duyệt xuất kho → fan-out direct.
  await emitToUsersWithRole("warehouse", {
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
    link: `/warehouse?tab=movement&mode=out`,
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

/* ── V4.0 đợt 2 Phase F — Tài chính: nhắc hạn + thông báo thanh toán ──────── */

export interface FinInvoiceNotifyContext {
  invoiceId: string;
  invoiceNo: string;
  supplierName?: string | null;
  dueDate?: string | null;
  outstandingAmount?: number;
}

/**
 * Hoá đơn đầu vào (direction=IN) sắp đến hạn trong 3 ngày, chưa trả đủ.
 * Gọi từ `finInvoiceReminderScan.ts` (worker, 1 lần/ngày) — fan-out direct
 * tới accountant + admin (đếm badge chuông).
 */
export async function notifyInvoiceDueSoon(ctx: FinInvoiceNotifyContext) {
  const dueLabel = ctx.dueDate ? ` — hạn ${ctx.dueDate}` : "";
  const payload = {
    eventType: "FIN_INVOICE_DUE_SOON" as const,
    entityType: "fin_invoice",
    entityId: ctx.invoiceId,
    entityCode: ctx.invoiceNo,
    title: `Hoá đơn ${ctx.invoiceNo} sắp đến hạn${dueLabel}`,
    message: ctx.supplierName
      ? `Nhà cung cấp: ${ctx.supplierName}${ctx.outstandingAmount ? ` — còn ${ctx.outstandingAmount.toLocaleString("vi-VN")}đ` : ""}`
      : "Sắp đến hạn thanh toán.",
    link: `/sales?tab=fin-invoices`,
    severity: "warning" as const,
  };
  await emitToUsersWithRole("accountant", payload);
  await emitToUsersWithRole("admin", payload);
}

/**
 * Hoá đơn đầu vào (direction=IN) quá hạn chưa trả đủ — status đã chuyển
 * OVERDUE (xem finInvoiceReminderScan.ts). Fan-out accountant + admin, CÓ
 * email (whitelist EMAIL_EVENTS — cần hành động chi trả NCC).
 */
export async function notifyInvoiceOverdue(ctx: FinInvoiceNotifyContext) {
  const payload = {
    eventType: "FIN_INVOICE_OVERDUE" as const,
    entityType: "fin_invoice",
    entityId: ctx.invoiceId,
    entityCode: ctx.invoiceNo,
    title: `Hoá đơn ${ctx.invoiceNo} đã QUÁ HẠN thanh toán`,
    message: ctx.supplierName
      ? `Nhà cung cấp: ${ctx.supplierName}${ctx.outstandingAmount ? ` — còn ${ctx.outstandingAmount.toLocaleString("vi-VN")}đ` : ""}`
      : "Cần thanh toán ngay để tránh ảnh hưởng quan hệ NCC.",
    link: `/sales?tab=fin-invoices`,
    severity: "error" as const,
  };
  await emitToUsersWithRole("accountant", payload);
  await emitToUsersWithRole("admin", payload);
}

/**
 * Hoá đơn đầu ra (direction=OUT, bán cho khách) quá hạn chưa thu đủ — công nợ
 * phải thu. Fan-out accountant + admin + shareholder (cổ đông cần theo dõi
 * công nợ phải thu theo đúng yêu cầu nghiệp vụ). CÓ email.
 */
export async function notifyReceivableOverdue(ctx: FinInvoiceNotifyContext) {
  const payload = {
    eventType: "FIN_RECEIVABLE_OVERDUE" as const,
    entityType: "fin_invoice",
    entityId: ctx.invoiceId,
    entityCode: ctx.invoiceNo,
    title: `Công nợ phải thu ${ctx.invoiceNo} đã quá hạn`,
    message: ctx.supplierName
      ? `Khách hàng: ${ctx.supplierName}${ctx.outstandingAmount ? ` — còn ${ctx.outstandingAmount.toLocaleString("vi-VN")}đ` : ""}`
      : "Cần đôn đốc khách hàng thanh toán.",
    link: `/sales?tab=fin-receivables`,
    severity: "error" as const,
  };
  await emitToUsersWithRole("accountant", payload);
  await emitToUsersWithRole("admin", payload);
  await emitToUsersWithRole("shareholder", payload);
}

export interface FinPaymentNotifyContext {
  paymentId: string;
  paymentCode: string;
  totalAmount: number;
  direction: "IN" | "OUT";
  actorUserId: string;
  actorUsername: string;
}

/**
 * Ghi nhận 1 đợt thanh toán thành công → notify accountant KHÁC actor (không
 * tự báo cho chính mình) NGAY LẬP TỨC (không qua worker, gọi trực tiếp trong
 * route `POST /api/finance/payments`, fire-and-forget). KHÔNG gửi email
 * (không thuộc EMAIL_EVENTS — chỉ mang tính thông tin nội bộ kế toán).
 */
export async function notifyPaymentRecorded(ctx: FinPaymentNotifyContext) {
  await emitToUsersWithRole("accountant", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "FIN_PAYMENT_RECORDED",
    entityType: "fin_payment",
    entityId: ctx.paymentId,
    entityCode: ctx.paymentCode,
    title: `${ctx.paymentCode} đã ghi nhận thanh toán`,
    message: `${ctx.direction === "IN" ? "Thu" : "Chi"} ${ctx.totalAmount.toLocaleString("vi-VN")}đ`,
    link: `/sales?tab=fin-payments`,
    severity: "success",
  });
}

/**
 * V4.0 Wave 3 Phase D — Phiếu giao hàng / BBGH.
 * DELIVERY_NOTE_CREATED: Kho submit → chờ Giám đốc duyệt (cần hành động, có email).
 * DELIVERY_NOTE_CONFIRMED: Giám đốc duyệt xong (= BBGH chính thức) → báo
 *   Thu mua + Kho theo đúng yêu cầu B.6 "chuyển trả BBGH về cho Thu mua và Kho".
 * DELIVERY_NOTE_REJECTED: Giám đốc từ chối → báo người tạo (Kho).
 */
export interface DeliveryNoteNotifyContext {
  deliveryNoteId: string;
  noteNo: string;
  actorUserId: string;
  actorUsername: string;
}

export async function notifyDeliveryNoteCreated(ctx: DeliveryNoteNotifyContext) {
  await emitToUsersWithRole("admin", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "DELIVERY_NOTE_CREATED",
    entityType: "delivery_note",
    entityId: ctx.deliveryNoteId,
    entityCode: ctx.noteNo,
    title: `Phiếu giao hàng ${ctx.noteNo} chờ duyệt`,
    message: "Chỉ Giám đốc được phê duyệt phiếu giao hàng ra ngoài công ty.",
    link: `/warehouse?tab=delivery-notes&id=${ctx.deliveryNoteId}`, // V4.1 AD-05: trang /warehouse/delivery-notes/:id không tồn tại
    severity: "info",
  });
}

export async function notifyDeliveryNoteConfirmed(ctx: DeliveryNoteNotifyContext) {
  await emitToUsersWithRole("purchaser", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "DELIVERY_NOTE_CONFIRMED",
    entityType: "delivery_note",
    entityId: ctx.deliveryNoteId,
    entityCode: ctx.noteNo,
    title: `BBGH ${ctx.noteNo} đã hoàn tất`,
    message: "Giám đốc đã duyệt — tải PDF để lưu hồ sơ/đối chiếu công nợ.",
    link: `/warehouse?tab=delivery-notes&id=${ctx.deliveryNoteId}`, // V4.1 AD-05: trang /warehouse/delivery-notes/:id không tồn tại
    severity: "success",
  });
  await emitToUsersWithRole("warehouse", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "DELIVERY_NOTE_CONFIRMED",
    entityType: "delivery_note",
    entityId: ctx.deliveryNoteId,
    entityCode: ctx.noteNo,
    title: `BBGH ${ctx.noteNo} đã hoàn tất`,
    message: "Có thể in 3 liên giao cho tài xế/khách ký nhận.",
    link: `/warehouse?tab=delivery-notes&id=${ctx.deliveryNoteId}`, // V4.1 AD-05: trang /warehouse/delivery-notes/:id không tồn tại
    severity: "success",
  });
}

export async function notifyDeliveryNoteRejected(
  ctx: DeliveryNoteNotifyContext & {
    deliveredByUserId: string;
    reason?: string | null;
  },
) {
  await emitNotification({
    recipientUser: ctx.deliveredByUserId,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "DELIVERY_NOTE_REJECTED",
    entityType: "delivery_note",
    entityId: ctx.deliveryNoteId,
    entityCode: ctx.noteNo,
    title: `Phiếu giao hàng ${ctx.noteNo} bị từ chối`,
    message: ctx.reason ? `Lý do: ${ctx.reason}` : undefined,
    link: `/warehouse?tab=delivery-notes&id=${ctx.deliveryNoteId}`, // V4.1 AD-05: trang /warehouse/delivery-notes/:id không tồn tại
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

/* ── V4.1 Đợt 1a — QC nhập kho ───────────────────────────────────────── */

export interface ReceiptQcNotifyContext {
  receiptId: string;
  receiptNo: string;
  poId?: string | null;
  poNo?: string | null;
  actorUserId: string;
  actorUsername: string;
}

/**
 * Hàng vừa nhận đang HOLD chờ QC → báo Tổ QC (fan-out từng user để đếm badge).
 * Gọi 1 lần / request nhận hàng (route tự gom), không phải mỗi dòng.
 */
export async function notifyReceiptQcPending(
  ctx: ReceiptQcNotifyContext & { lineCount: number },
) {
  await emitToUsersWithRole("qc", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "QC_RECEIPT_PENDING",
    entityType: "inbound_receipt",
    entityId: ctx.receiptId,
    entityCode: ctx.receiptNo,
    title: `${ctx.lineCount} dòng hàng nhận chờ QC (${ctx.receiptNo})`,
    message: ctx.poNo
      ? `Hàng của PO ${ctx.poNo} đang bị giữ (HOLD) cho tới khi QC kết luận Đạt.`
      : "Hàng đang bị giữ (HOLD) cho tới khi QC kết luận Đạt.",
    link: "/qc-inbound",
    severity: "warning",
  });
}

/** QC kết luận Không đạt → báo Kho (cách ly hàng) + Thu mua (làm việc NCC). */
export async function notifyReceiptQcFailed(
  ctx: ReceiptQcNotifyContext & {
    sku: string;
    lotCode: string | null;
    qty: number;
    notes: string | null;
  },
) {
  const input = {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "QC_RECEIPT_FAILED" as const,
    entityType: "inbound_receipt",
    entityId: ctx.receiptId,
    entityCode: ctx.receiptNo,
    title: `QC không đạt: ${ctx.sku}${ctx.lotCode ? ` · lô ${ctx.lotCode}` : ""} (${ctx.receiptNo})`,
    message: `SL ${ctx.qty}${ctx.poNo ? ` · PO ${ctx.poNo}` : ""}${ctx.notes ? ` · Lý do: ${ctx.notes}` : ""}`,
    link: "/warehouse?tab=movement&mode=qc",
    severity: "error" as const,
  };
  await emitToUsersWithRole("warehouse", input);
  // Thu mua không vào được màn Chờ QC → link về PO để làm việc với NCC.
  await emitToUsersWithRole("purchaser", {
    ...input,
    link: ctx.poId ? `/procurement/purchase-orders/${ctx.poId}` : undefined,
  });
}
