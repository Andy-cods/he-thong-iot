import type { Job } from "bullmq";
import { and, eq, gt, inArray, isNull, notInArray } from "drizzle-orm";
import { notification, purchaseOrder, purchaseRequest, role, userAccount, userRole } from "@iot/db/schema";
import type { Role } from "@iot/shared";
import { db } from "../db.js";
import { daysSinceApproved } from "./reminderLogic.js";

/**
 * V4.2 PROCUREMENT_WAREHOUSE.md P1-1 — "PR đã duyệt nhưng kẹt không lên PO".
 *
 * Bám khuôn `prReminderScan.ts`/`finInvoiceReminderScan.ts` (worker KHÔNG
 * import code apps/web — xem comment gốc trong `prReminderScan.ts`; hàm
 * `getActiveUserIdsByRoles` dưới đây lại là 1 bản copy y nguyên logic fan-out
 * theo role, cùng schema `@iot/db` dùng chung giữa 2 app).
 *
 * Khác `prReminderScan.ts` (nhắc PR CHƯA duyệt xong, quét theo `approvalStep`
 * SUBMITTED/DEPT_APPROVED): job này nhắc PR ĐÃ duyệt xong hoàn toàn
 * (`status='APPROVED'` VÀ `approvalStep='DIRECTOR_APPROVED'` — 2 điều kiện
 * đúng như audit xác nhận trên prod, xem PROCUREMENT_WAREHOUSE.md P1-1) mà
 * quá 3 ngày vẫn chưa có `purchase_order` nào trỏ tới (`purchase_order.pr_id`
 * — cột FK thật, không phải tra `metadata->>'prId'`).
 *
 * Repeatable job 1 LẦN/NGÀY (giống `finInvoiceReminderScan` — quét PR không
 * cần tần suất cao như PR_REMINDER_SCAN mỗi 1h, ngưỡng ở đây là NGÀY không
 * phải GIỜ). Nhắc lại tối đa mỗi 7 ngày/phiếu (dedupe qua bảng `notification`,
 * y hệt cơ chế `OVERDUE_REPEAT_MS` của `finInvoiceReminderScan.ts`).
 *
 * event_type "PR_APPROVED_NO_PO_REMINDER" là chuỗi tự do (cột varchar(64),
 * không phải Postgres enum) — không cần migration.
 */

export interface PrApprovedNoPoScanJob {
  triggeredAt?: string;
}

export interface PrApprovedNoPoScanResult {
  scanned: number;
  reminded: number;
  skipped: number;
}

const STUCK_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // 3 ngày
const REMINDER_REPEAT_MS = 7 * 24 * 60 * 60 * 1000; // nhắc lại tối đa mỗi 7 ngày
const EVENT_TYPE = "PR_APPROVED_NO_PO_REMINDER";
const TARGET_ROLES: Role[] = ["purchaser", "admin"];

/** Copy y nguyên logic fan-out theo role từ prReminderScan.ts. */
async function getActiveUserIdsByRoles(roles: Role[]): Promise<string[]> {
  if (roles.length === 0) return [];
  const rows = await db
    .select({ id: userRole.userId })
    .from(userRole)
    .innerJoin(role, eq(role.id, userRole.roleId))
    .innerJoin(userAccount, eq(userAccount.id, userRole.userId))
    .where(and(inArray(role.code, roles), eq(userAccount.isActive, true)));
  return [...new Set(rows.map((r) => r.id))];
}

export async function processPrApprovedNoPoScan(
  job: Job<PrApprovedNoPoScanJob>,
): Promise<PrApprovedNoPoScanResult> {
  void job; // không dùng payload, giữ tham số cho đúng signature Worker<T>

  const threshold = new Date(Date.now() - STUCK_THRESHOLD_MS);
  const repeatThreshold = new Date(Date.now() - REMINDER_REPEAT_MS);

  // PR đã duyệt cuối (DIRECTOR_APPROVED) quá 3 ngày, CHƯA có PO nào (pr_id).
  // Lấy toàn bộ pr_id đã có PO (bảng purchase_order rất nhỏ — xem
  // PERF_REDUNDANCY.md, PO thật hiện chỉ vài chục dòng) rồi loại trừ bằng JS
  // thay vì NOT EXISTS lồng nhau, giữ code đơn giản (KISS) đúng quy mô hiện tại.
  const linkedPrIds = await db
    .select({ prId: purchaseOrder.prId })
    .from(purchaseOrder);
  const linkedPrIdSet = new Set(
    linkedPrIds.map((r) => r.prId).filter((id): id is string => !!id),
  );

  const candidates = await db
    .select({
      id: purchaseRequest.id,
      code: purchaseRequest.code,
      paperFormNo: purchaseRequest.paperFormNo,
      directorApprovedAt: purchaseRequest.directorApprovedAt,
      updatedAt: purchaseRequest.updatedAt,
    })
    .from(purchaseRequest)
    .where(
      and(
        eq(purchaseRequest.status, "APPROVED"),
        eq(purchaseRequest.approvalStep, "DIRECTOR_APPROVED"),
        ...(linkedPrIdSet.size > 0
          ? [notInArray(purchaseRequest.id, [...linkedPrIdSet])]
          : []),
      ),
    );

  const pending = candidates.filter((pr) => {
    const at = pr.directorApprovedAt ?? pr.updatedAt;
    return at !== null && at < threshold;
  });

  let reminded = 0;
  let skipped = 0;
  let userIds: string[] | null = null;

  for (const pr of pending) {
    const [already] = await db
      .select({ id: notification.id })
      .from(notification)
      .where(
        and(
          eq(notification.eventType, EVENT_TYPE),
          eq(notification.entityId, pr.id),
          gt(notification.createdAt, repeatThreshold),
        ),
      )
      .limit(1);
    if (already) {
      skipped++;
      continue;
    }

    if (userIds === null) {
      userIds = await getActiveUserIdsByRoles(TARGET_ROLES);
    }
    if (userIds.length === 0) {
      skipped++;
      continue;
    }

    const prNo = pr.paperFormNo ?? pr.code;
    const approvedAt = pr.directorApprovedAt ?? pr.updatedAt;
    const days = daysSinceApproved(approvedAt);

    // Chống trùng — xem comment tương đương trong prReminderScan.ts: mỗi
    // người tối đa 1 dòng CHƯA ĐỌC / PR, nhắc lại chỉ cập nhật created_at.
    for (const userId of userIds) {
      const [existingUnread] = await db
        .select({ id: notification.id })
        .from(notification)
        .where(
          and(
            eq(notification.recipientUser, userId),
            eq(notification.eventType, EVENT_TYPE),
            eq(notification.entityId, pr.id),
            isNull(notification.readAt),
          ),
        )
        .limit(1);
      const values = {
        title: `${prNo} đã duyệt nhưng chưa lên PO`,
        message:
          days !== null
            ? `Đã duyệt xong ${days} ngày, chưa tạo Đơn hàng mua nào — bấm để xử lý.`
            : "Đã duyệt xong, chưa tạo Đơn hàng mua nào — bấm để xử lý.",
        link: `/procurement/purchase-requests/${pr.id}`,
        severity: "warning" as const,
      };
      if (existingUnread) {
        await db
          .update(notification)
          .set({ ...values, createdAt: new Date() })
          .where(eq(notification.id, existingUnread.id));
      } else {
        await db.insert(notification).values({
          recipientUser: userId,
          recipientRole: null,
          actorUserId: null,
          actorUsername: null,
          eventType: EVENT_TYPE,
          entityType: "purchase_request",
          entityId: pr.id,
          entityCode: prNo,
          ...values,
        });
      }
    }
    reminded++;
  }

  return { scanned: pending.length, reminded, skipped };
}
