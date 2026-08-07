import type { Job } from "bullmq";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { notification, purchaseRequest, role, userAccount, userRole } from "@iot/db/schema";
import type { Role } from "@iot/shared";
import { db } from "../db.js";

/**
 * V3.16 — "Nhắc duyệt" PR (tính năng mới, thiết kế từ đầu).
 *
 * Repeatable job (upsertJobScheduler mỗi 1h, xem index.ts) quét
 * purchase_request đang ở approval_step SUBMITTED/DEPT_APPROVED mà
 * updated_at đã quá 24h chưa ai xử lý tiếp → nhắc role liên quan.
 * Nhắc lại tối đa 1 lần/24h cho mỗi phiếu (không spam) — check bảng
 * notification xem đã có dòng PR_PENDING_REMINDER cho phiếu đó trong 24h
 * gần nhất chưa, có rồi thì skip.
 *
 * LƯU Ý KIẾN TRÚC: worker là package riêng (apps/worker), KHÔNG import code
 * apps/web (2 Next.js/Node app tách biệt, không share module runtime) — nên
 * KHÔNG gọi được emitNotification/emitToUsersWithRole của web. Hàm
 * getActiveUserIdsByRoles() dưới đây là bản copy tương đương logic
 * "fan-out theo role" từ apps/web/src/server/services/notifications.ts
 * (emitToUsersWithRole, dòng ~200-219) — insert thẳng vào bảng notification
 * qua Drizzle, cùng schema @iot/db dùng chung giữa 2 app.
 *
 * event_type là cột varchar(64) (KHÔNG phải Postgres enum — đã kiểm
 * packages/db/src/schema/notification.ts) nên insert string
 * "PR_PENDING_REMINDER" trực tiếp không cần migration ALTER TYPE.
 *
 * Email: CHƯA nối (xem ghi chú cuối file) — chỉ tạo notification in-app ở
 * đợt đầu này, ưu tiên KISS/rủi ro thấp.
 *
 * KHÔNG throw khi 0 phiếu cần nhắc — trả về summary, index.ts log info.
 */

export interface PrReminderScanJob {
  /** Job không cần payload — mỗi lần chạy tự quét lại toàn bộ PR chờ duyệt. */
  triggeredAt?: string;
}

export interface PrReminderScanResult {
  scanned: number;
  reminded: number;
  skipped: number;
}

const REMINDER_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const EVENT_TYPE = "PR_PENDING_REMINDER";

/**
 * Copy logic từ emitToUsersWithRole (apps/web) — lấy danh sách user active
 * có ít nhất 1 trong các role chỉ định. Dedupe bằng Set vì 1 user có thể có
 * nhiều role cùng lúc (vd admin) → join theo inArray(role.code, roles) có
 * thể trả trùng userId nếu không dedupe.
 */
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

export async function processPrReminderScan(
  job: Job<PrReminderScanJob>,
): Promise<PrReminderScanResult> {
  void job; // không dùng payload, giữ tham số cho đúng signature Worker<T>

  const threshold = new Date(Date.now() - REMINDER_THRESHOLD_MS);

  const pending = await db
    .select({
      id: purchaseRequest.id,
      code: purchaseRequest.code,
      paperFormNo: purchaseRequest.paperFormNo,
      approvalStep: purchaseRequest.approvalStep,
      updatedAt: purchaseRequest.updatedAt,
    })
    .from(purchaseRequest)
    .where(
      and(
        inArray(purchaseRequest.approvalStep, ["SUBMITTED", "DEPT_APPROVED"]),
        lt(purchaseRequest.updatedAt, threshold),
      ),
    );

  let reminded = 0;
  let skipped = 0;
  // Cache theo tổ hợp role trong phạm vi 1 lần chạy — tránh N truy vấn giống
  // nhau khi nhiều PR cùng ở 1 approval_step trong cùng batch quét.
  const roleUserCache = new Map<string, string[]>();

  for (const pr of pending) {
    // Đã nhắc phiếu này trong 24h gần nhất chưa → tránh spam.
    const [already] = await db
      .select({ id: notification.id })
      .from(notification)
      .where(
        and(
          eq(notification.eventType, EVENT_TYPE),
          eq(notification.entityId, pr.id),
          gt(notification.createdAt, threshold),
        ),
      )
      .limit(1);
    if (already) {
      skipped++;
      continue;
    }

    // SUBMITTED → chờ Trưởng bộ phận duyệt (dept-approve: admin OR planner).
    // DEPT_APPROVED → chờ Giám đốc/Mua hàng duyệt cuối (director-approve:
    // admin OR purchaser). Luôn kèm admin vì admin duyệt được cả 2 bước.
    const targetRoles: Role[] =
      pr.approvalStep === "SUBMITTED"
        ? ["planner", "admin"]
        : ["purchaser", "admin"];
    const cacheKey = [...targetRoles].sort().join(",");
    let userIds = roleUserCache.get(cacheKey);
    if (!userIds) {
      userIds = await getActiveUserIdsByRoles(targetRoles);
      roleUserCache.set(cacheKey, userIds);
    }
    if (userIds.length === 0) {
      skipped++;
      continue;
    }

    const prNo = pr.paperFormNo ?? pr.code;
    const stepLabel =
      pr.approvalStep === "SUBMITTED" ? "Trưởng bộ phận" : "Giám đốc/Mua hàng";

    await db.insert(notification).values(
      userIds.map((userId) => ({
        recipientUser: userId,
        recipientRole: null,
        actorUserId: null,
        actorUsername: null,
        eventType: EVENT_TYPE,
        entityType: "purchase_request",
        entityId: pr.id,
        entityCode: prNo,
        title: `Nhắc duyệt: ${prNo} chờ quá 24h`,
        message: `Đang chờ ${stepLabel} duyệt — bấm để xử lý.`,
        link: `/procurement/purchase-requests/${pr.id}`,
        severity: "warning" as const,
      })),
    );
    reminded++;
  }

  return { scanned: pending.length, reminded, skipped };
}
