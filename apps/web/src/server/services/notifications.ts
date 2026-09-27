import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { notification, role, userAccount, userRole } from "@iot/db/schema";
import type { Role } from "@iot/shared";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueueEmailSend } from "@/server/services/emailQueue";
import {
  EMAIL_EVENTS,
  assignRecipients,
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
  planRoles,
  planUserIds,
  planWOApproved,
  planWOCancelled,
  planWOCompleted,
  planWORejected,
  planWOReleased,
  planWORequestSubmitted,
  planWOStarted,
  type CandidateUser,
  type NotificationEventType,
  type NotificationSeverity,
  type NotifyPlan,
} from "@/server/services/notification-plans";

export type { NotificationEventType, NotificationSeverity };

/**
 * V3.3 → TASK-20260927 — Notification service.
 *
 * Mọi sự kiện đi qua `dispatchNotification(plan)`:
 *   - plan (người nhận + nội dung + link ứng viên) dựng THUẦN ở
 *     `notification-plans.ts` (có test bảng link × vai trò),
 *   - ở đây chỉ nạp user ACTIVE + toàn bộ vai trò của họ rồi insert 1 dòng /
 *     người (gộp người nhiều vai trò, loại actor, fallback Giám đốc, link theo
 *     vai trò người nhận).
 * Fire-and-forget: KHÔNG throw — lỗi chỉ log warn để không phá nghiệp vụ.
 */

interface EmitInput {
  recipientUser: string;
  actorUserId?: string | null;
  actorUsername?: string | null;
  eventType: NotificationEventType;
  entityType?: string;
  entityId?: string;
  entityCode?: string;
  title: string;
  message?: string;
  link?: string | null;
  severity?: NotificationSeverity;
  email?: boolean;
}

/**
 * Email chỉ khi: MAIL_ENABLED + event thuộc EMAIL_EVENTS (việc cần DUYỆT) +
 * target bật `email` + user active có email. Link tuyệt đối (APP_URL + link).
 */
async function maybeEmail(notifId: string, input: EmitInput): Promise<void> {
  if (!env.MAIL_ENABLED) return;
  if (!input.email || !EMAIL_EVENTS.has(input.eventType)) return;
  try {
    const recipients = await db
      .select({ id: userAccount.id, email: sql<string>`${userAccount.email}` })
      .from(userAccount)
      .where(
        and(
          eq(userAccount.id, input.recipientUser),
          eq(userAccount.isActive, true),
          isNotNull(userAccount.email),
        ),
      );
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

async function emitNotification(input: EmitInput): Promise<string | null> {
  try {
    const [row] = await db
      .insert(notification)
      .values({
        recipientUser: input.recipientUser,
        recipientRole: null,
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
    if (row?.id) void maybeEmail(row.id, input);
    return row?.id ?? null;
  } catch (err) {
    logger.warn({ err, eventType: input.eventType }, "emitNotification failed");
    return null;
  }
}

/** User ACTIVE thuộc các vai trò / id chỉ định, kèm TOÀN BỘ vai trò của họ. */
async function loadCandidates(roles: Role[], userIds: string[]): Promise<CandidateUser[]> {
  if (roles.length === 0 && userIds.length === 0) return [];
  const conds = [];
  if (roles.length > 0) {
    conds.push(
      inArray(
        userRole.userId,
        db
          .select({ id: userRole.userId })
          .from(userRole)
          .innerJoin(role, eq(role.id, userRole.roleId))
          .where(inArray(role.code, roles)),
      ),
    );
  }
  if (userIds.length > 0) conds.push(inArray(userRole.userId, userIds));
  const rows = await db
    .select({ id: userRole.userId, code: role.code })
    .from(userRole)
    .innerJoin(role, eq(role.id, userRole.roleId))
    .innerJoin(userAccount, eq(userAccount.id, userRole.userId))
    .where(and(eq(userAccount.isActive, true), or(...conds)));
  const map = new Map<string, Role[]>();
  for (const r of rows) {
    const list = map.get(r.id) ?? [];
    list.push(r.code as Role);
    map.set(r.id, list);
  }
  return [...map.entries()].map(([id, rs]) => ({ id, roles: rs }));
}

/** Thực thi 1 plan: 1 dòng notification / người nhận. Không throw. */
export async function dispatchNotification(plan: NotifyPlan): Promise<number> {
  try {
    const users = await loadCandidates(planRoles(plan), planUserIds(plan));
    const deliveries = assignRecipients(plan, users);
    await Promise.allSettled(
      deliveries.map((d) =>
        emitNotification({
          recipientUser: d.userId,
          actorUserId: plan.actorUserId ?? null,
          actorUsername: plan.actorUsername ?? null,
          eventType: plan.eventType,
          entityType: d.content.entityType ?? plan.entityType,
          entityId: d.content.entityId ?? plan.entityId,
          entityCode: d.content.entityCode ?? plan.entityCode,
          title: d.content.title,
          message: d.content.message,
          link: d.link,
          severity: d.content.severity,
          email: d.content.email,
        }),
      ),
    );
    return deliveries.length;
  } catch (err) {
    logger.warn({ err, eventType: plan.eventType }, "dispatchNotification failed");
    return 0;
  }
}

const run = (plan: NotifyPlan) => dispatchNotification(plan).then(() => undefined);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Arg<F extends (ctx: any) => NotifyPlan> = Parameters<F>[0];

/* ── Đề xuất vật tư ─────────────────────────────────────────────────────── */

export const notifyPRSubmitted = (ctx: Arg<typeof planPRSubmitted>) => run(planPRSubmitted(ctx));
export const notifyPRDeptApproved = (ctx: Arg<typeof planPRDeptApproved>) =>
  run(planPRDeptApproved(ctx));
/** Duyệt cuối (director-approve / quick-approve): Thu mua + người lập + Kế toán — 1 dòng / người. */
export const notifyPRApproved = (ctx: Arg<typeof planPRApproved>) => run(planPRApproved(ctx));
export const notifyPRRejected = (ctx: Arg<typeof planPRRejected>) => run(planPRRejected(ctx));
/** Ghi mốc "Đã xuất kho" (issued) / "Hoàn tất" (completed) → người lập. */
export const notifyPRProgress = (ctx: Arg<typeof planPRProgress>) => run(planPRProgress(ctx));

/* ── Đơn mua hàng ───────────────────────────────────────────────────────── */

export const notifyPOCreatedFromPR = (ctx: Arg<typeof planPOCreatedFromPR>) =>
  run(planPOCreatedFromPR(ctx));
export const notifyPOSubcontractDraft = (ctx: Arg<typeof planPOSubcontractDraft>) =>
  run(planPOSubcontractDraft(ctx));
export const notifyPOApprovalRequested = (ctx: Arg<typeof planPOApprovalRequested>) =>
  run(planPOApprovalRequested(ctx));
export const notifyPOApproved = (ctx: Arg<typeof planPOApproved>) => run(planPOApproved(ctx));
export const notifyPOApprovalRejected = (ctx: Arg<typeof planPOApprovalRejected>) =>
  run(planPOApprovalRejected(ctx));
export const notifyPOSent = (ctx: Arg<typeof planPOSent>) => run(planPOSent(ctx));
export const notifyPOPriceUpdated = (ctx: Arg<typeof planPOPriceUpdated>) =>
  run(planPOPriceUpdated(ctx));
export const notifyPOReceivedPartial = (ctx: Arg<typeof planPOReceivedPartial>) =>
  run(planPOReceivedPartial(ctx));
export const notifyPOReceivedFull = (ctx: Arg<typeof planPOReceivedFull>) =>
  run(planPOReceivedFull(ctx));
export const notifyPOCancelled = (ctx: Arg<typeof planPOCancelled>) => run(planPOCancelled(ctx));
export const notifyPOClosed = (ctx: Arg<typeof planPOClosed>) => run(planPOClosed(ctx));
export const notifyPoInvoiceDraftCreated = (ctx: Arg<typeof planPOInvoiceDraft>) =>
  run(planPOInvoiceDraft(ctx));
export const notifyPoInvoiceConfirmed = (ctx: Arg<typeof planPOInvoiceConfirmed>) =>
  run(planPOInvoiceConfirmed(ctx));

/* ── QC nhập kho ────────────────────────────────────────────────────────── */

export const notifyReceiptQcPending = (ctx: Arg<typeof planReceiptQcPending>) =>
  run(planReceiptQcPending(ctx));
export const notifyReceiptQcPassed = (ctx: Arg<typeof planReceiptQcPassed>) =>
  run(planReceiptQcPassed(ctx));
export const notifyReceiptQcFailed = (ctx: Arg<typeof planReceiptQcFailed>) =>
  run(planReceiptQcFailed(ctx));

/* ── Lệnh sản xuất ──────────────────────────────────────────────────────── */

export const notifyWORequestSubmitted = (ctx: Arg<typeof planWORequestSubmitted>) =>
  run(planWORequestSubmitted(ctx));
/** Duyệt YCSX: người lập (WO_APPROVED) + Gia công khác (WO_RELEASED, trừ người lập). */
export const notifyWOApproved = async (ctx: Arg<typeof planWOApproved>) => {
  await run(planWOApproved(ctx));
  await run(planWOReleased(ctx));
};
export const notifyWORejected = (ctx: Arg<typeof planWORejected>) => run(planWORejected(ctx));
export const notifyWOStarted = (ctx: Arg<typeof planWOStarted>) => run(planWOStarted(ctx));
export const notifyWOCancelled = (ctx: Arg<typeof planWOCancelled>) => run(planWOCancelled(ctx));
export const notifyWOCompleted = (ctx: Arg<typeof planWOCompleted>) => run(planWOCompleted(ctx));

/* ── Phiếu yêu cầu vật tư ───────────────────────────────────────────────── */

export const notifyMaterialRequestNew = (ctx: Arg<typeof planMaterialRequestNew>) =>
  run(planMaterialRequestNew(ctx));
export const notifyMaterialRequestPicking = (ctx: Arg<typeof planMaterialRequestPicking>) =>
  run(planMaterialRequestPicking(ctx));
export const notifyMaterialRequestReady = (ctx: Arg<typeof planMaterialRequestReady>) =>
  run(planMaterialRequestReady(ctx));
/** Kho lập phiếu xuất: full=true → DELIVERED, ngược lại ISSUED (giao một phần). */
export const notifyMaterialRequestIssued = (ctx: Arg<typeof planMaterialRequestIssued>) =>
  run(planMaterialRequestIssued(ctx));
export const notifyMaterialRequestCancelled = (ctx: Arg<typeof planMaterialRequestCancelled>) =>
  run(planMaterialRequestCancelled(ctx));

/* ── Yêu cầu xuất kho ───────────────────────────────────────────────────── */

export const notifyIssueRequestNew = (ctx: Arg<typeof planIssueRequestNew>) =>
  run(planIssueRequestNew(ctx));
export const notifyIssueRequestApproved = (ctx: Arg<typeof planIssueRequestApproved>) =>
  run(planIssueRequestApproved(ctx));
export const notifyIssueRequestRejected = (ctx: Arg<typeof planIssueRequestRejected>) =>
  run(planIssueRequestRejected(ctx));

/* ── Phiếu giao hàng / BBGH ─────────────────────────────────────────────── */

export const notifyDeliveryNoteCreated = (ctx: Arg<typeof planDeliveryNoteCreated>) =>
  run(planDeliveryNoteCreated(ctx));
export const notifyDeliveryNoteConfirmed = (ctx: Arg<typeof planDeliveryNoteConfirmed>) =>
  run(planDeliveryNoteConfirmed(ctx));
export const notifyDeliveryNoteRejected = (ctx: Arg<typeof planDeliveryNoteRejected>) =>
  run(planDeliveryNoteRejected(ctx));

/* ── Tài chính ──────────────────────────────────────────────────────────── */
// Nhắc hạn hoá đơn / công nợ (FIN_INVOICE_DUE_SOON / OVERDUE / RECEIVABLE_OVERDUE)
// do worker apps/worker/src/jobs/finInvoiceReminderScan.ts phát — nguồn duy nhất.

export const notifyPaymentRecorded = (ctx: Arg<typeof planPaymentRecorded>) =>
  run(planPaymentRecorded(ctx));

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** Số thông báo chưa đọc (chỉ dòng gửi trực tiếp user — mọi event hiện tại). */
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
