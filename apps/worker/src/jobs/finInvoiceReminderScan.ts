import type { Job } from "bullmq";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { finInvoice, notification, role, supplier, userAccount, userRole } from "@iot/db/schema";
import type { Role } from "@iot/shared";
import { db } from "../db.js";

/**
 * V4.0 đợt 2 Phase F — "Nhắc hạn" hoá đơn tài chính (fin_invoice).
 *
 * Bám khuôn `prReminderScan.ts` (đã copy y nguyên `getActiveUserIdsByRoles`
 * cục bộ — worker KHÔNG import code apps/web, xem comment gốc trong
 * prReminderScan.ts). Repeatable job chạy 1 LẦN/NGÀY (khác PR reminder mỗi
 * 1h) vì hoá đơn không cần tần suất cao, tránh spam notification.
 *
 * event_type là varchar(64) tự do (KHÔNG migration) — insert string
 * "FIN_INVOICE_DUE_SOON"/"FIN_INVOICE_OVERDUE"/"FIN_RECEIVABLE_OVERDUE" trực
 * tiếp, khớp union `NotificationEventType` phía apps/web
 * (server/services/notifications.ts) để badge/UI hiển thị đúng.
 *
 * 2 nhánh quét:
 *  - direction=IN, dueDate trong [today, today+3], chưa trả đủ → nhắc sắp
 *    đến hạn (FIN_INVOICE_DUE_SOON), KHÔNG đổi status.
 *  - dueDate < today, chưa trả đủ → cập nhật status='OVERDUE' (đồng bộ cache,
 *    xem wave-2-finance.md §A.3.3) + bắn FIN_INVOICE_OVERDUE (direction=IN,
 *    chi trả NCC) hoặc FIN_RECEIVABLE_OVERDUE (direction=OUT, thu từ khách —
 *    kèm fan-out thêm role shareholder).
 *
 * Chống spam: tối đa 1 nhắc/hoá đơn/loại event/24h — check bảng notification
 * y hệt cơ chế `already` của prReminderScan.ts.
 *
 * Email: đã nối qua whitelist EMAIL_EVENTS phía apps/web (maybeEmail đọc
 * event_type từ mọi notification insert — kể cả insert trực tiếp từ worker,
 * VÌ maybeEmail chỉ chạy trong `emitNotification` của apps/web, KHÔNG chạy
 * khi worker insert thẳng bảng `notification`). Do đó nhắc hạn từ worker này
 * CHỈ tạo in-app notification, KHÔNG tự gửi email — nếu cần email cho
 * FIN_INVOICE_OVERDUE/FIN_RECEIVABLE_OVERDUE thì phải bổ sung enqueueEmailSend
 * trực tiếp ở đây (đánh dấu TODO, chưa làm ở V1 vì risk thấp — nhắc hạn xem
 * qua badge chuông hàng ngày là đủ, tránh phụ thuộc SMTP config ở worker).
 */

export interface FinInvoiceReminderScanJob {
  triggeredAt?: string;
}

export interface FinInvoiceReminderScanResult {
  dueSoonReminded: number;
  overdueMarked: number;
  receivableOverdueReminded: number;
  skipped: number;
}

const DUE_SOON_EVENT = "FIN_INVOICE_DUE_SOON";
const OVERDUE_EVENT = "FIN_INVOICE_OVERDUE";
const RECEIVABLE_OVERDUE_EVENT = "FIN_RECEIVABLE_OVERDUE";
const DEDUPE_WINDOW_MS = 20 * 60 * 60 * 1000; // ~20h — đủ để job chạy 1 lần/ngày không trùng dù giờ chạy trôi nhẹ.

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

async function alreadyRemindedToday(eventType: string, invoiceId: string): Promise<boolean> {
  const threshold = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const [row] = await db
    .select({ id: notification.id })
    .from(notification)
    .where(
      and(
        eq(notification.eventType, eventType),
        eq(notification.entityId, invoiceId),
        gt(notification.createdAt, threshold),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function processFinInvoiceReminderScan(
  job: Job<FinInvoiceReminderScanJob>,
): Promise<FinInvoiceReminderScanResult> {
  void job;

  let dueSoonReminded = 0;
  let overdueMarked = 0;
  let receivableOverdueReminded = 0;
  let skipped = 0;

  const accountantIds = await getActiveUserIdsByRoles(["accountant"]);
  const adminIds = await getActiveUserIdsByRoles(["admin"]);
  const shareholderIds = await getActiveUserIdsByRoles(["shareholder"]);

  // ── Nhánh 1: sắp đến hạn trong 3 ngày (direction=IN, chưa trả đủ) ────────
  const dueSoonRows = await db
    .select({
      id: finInvoice.id,
      invoiceNo: finInvoice.invoiceNo,
      dueDate: finInvoice.dueDate,
      totalAmount: finInvoice.totalAmount,
      paidAmount: finInvoice.paidAmount,
      supplierId: finInvoice.supplierId,
    })
    .from(finInvoice)
    .where(
      and(
        eq(finInvoice.direction, "IN"),
        inArray(finInvoice.status, ["UNPAID", "PARTIAL"]),
        sql`${finInvoice.dueDate} IS NOT NULL`,
        sql`${finInvoice.dueDate} BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'`,
      ),
    );

  const overdueInRows = await db
    .select({
      id: finInvoice.id,
      invoiceNo: finInvoice.invoiceNo,
      dueDate: finInvoice.dueDate,
      totalAmount: finInvoice.totalAmount,
      paidAmount: finInvoice.paidAmount,
      supplierId: finInvoice.supplierId,
    })
    .from(finInvoice)
    .where(
      and(
        eq(finInvoice.direction, "IN"),
        inArray(finInvoice.status, ["UNPAID", "PARTIAL"]),
        sql`${finInvoice.dueDate} IS NOT NULL AND ${finInvoice.dueDate} < CURRENT_DATE`,
      ),
    );

  const overdueOutRows = await db
    .select({
      id: finInvoice.id,
      invoiceNo: finInvoice.invoiceNo,
      dueDate: finInvoice.dueDate,
      totalAmount: finInvoice.totalAmount,
      paidAmount: finInvoice.paidAmount,
      supplierId: finInvoice.supplierId,
    })
    .from(finInvoice)
    .where(
      and(
        eq(finInvoice.direction, "OUT"),
        inArray(finInvoice.status, ["UNPAID", "PARTIAL"]),
        sql`${finInvoice.dueDate} IS NOT NULL AND ${finInvoice.dueDate} < CURRENT_DATE`,
      ),
    );

  const allSupplierIds = [
    ...new Set(
      [...dueSoonRows, ...overdueInRows, ...overdueOutRows]
        .map((r) => r.supplierId)
        .filter((id): id is string => !!id),
    ),
  ];
  const supplierRows =
    allSupplierIds.length > 0
      ? await db
          .select({ id: supplier.id, name: supplier.name })
          .from(supplier)
          .where(inArray(supplier.id, allSupplierIds))
      : [];
  const supplierNameMap = new Map(supplierRows.map((s) => [s.id, s.name]));

  const notifyRows: Array<{
    recipientUser: string;
    eventType: string;
    entityId: string;
    entityCode: string;
    title: string;
    message: string;
    link: string;
    severity: "info" | "warning" | "error" | "success";
  }> = [];

  for (const inv of dueSoonRows) {
    if (await alreadyRemindedToday(DUE_SOON_EVENT, inv.id)) {
      skipped++;
      continue;
    }
    const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
    const supplierName = inv.supplierId ? supplierNameMap.get(inv.supplierId) : null;
    const title = `Hoá đơn ${inv.invoiceNo} sắp đến hạn — ${inv.dueDate}`;
    const message = supplierName
      ? `Nhà cung cấp: ${supplierName} — còn ${outstanding.toLocaleString("vi-VN")}đ`
      : `Còn ${outstanding.toLocaleString("vi-VN")}đ`;
    for (const userId of [...accountantIds, ...adminIds]) {
      notifyRows.push({
        recipientUser: userId,
        eventType: DUE_SOON_EVENT,
        entityId: inv.id,
        entityCode: inv.invoiceNo,
        title,
        message,
        link: `/sales?tab=fin-invoices`,
        severity: "warning",
      });
    }
    dueSoonReminded++;
  }

  for (const inv of overdueInRows) {
    if (!(await alreadyRemindedToday(OVERDUE_EVENT, inv.id))) {
      const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
      const supplierName = inv.supplierId ? supplierNameMap.get(inv.supplierId) : null;
      const title = `Hoá đơn ${inv.invoiceNo} đã QUÁ HẠN thanh toán`;
      const message = supplierName
        ? `Nhà cung cấp: ${supplierName} — còn ${outstanding.toLocaleString("vi-VN")}đ`
        : `Còn ${outstanding.toLocaleString("vi-VN")}đ`;
      for (const userId of [...accountantIds, ...adminIds]) {
        notifyRows.push({
          recipientUser: userId,
          eventType: OVERDUE_EVENT,
          entityId: inv.id,
          entityCode: inv.invoiceNo,
          title,
          message,
          link: `/sales?tab=fin-invoices`,
          severity: "error",
        });
      }
      overdueMarked++;
    } else {
      skipped++;
    }
    // Đồng bộ status='OVERDUE' luôn chạy (không phụ thuộc đã nhắc hay chưa) —
    // đúng §A.3.3: cache hiển thị phải khớp thực tế mỗi lần job chạy.
    await db
      .update(finInvoice)
      .set({ status: "OVERDUE", updatedAt: new Date() })
      .where(eq(finInvoice.id, inv.id));
  }

  for (const inv of overdueOutRows) {
    if (await alreadyRemindedToday(RECEIVABLE_OVERDUE_EVENT, inv.id)) {
      skipped++;
    } else {
      const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
      const supplierName = inv.supplierId ? supplierNameMap.get(inv.supplierId) : null;
      const title = `Công nợ phải thu ${inv.invoiceNo} đã quá hạn`;
      const message = supplierName
        ? `Khách hàng: ${supplierName} — còn ${outstanding.toLocaleString("vi-VN")}đ`
        : `Còn ${outstanding.toLocaleString("vi-VN")}đ`;
      for (const userId of [...accountantIds, ...adminIds, ...shareholderIds]) {
        notifyRows.push({
          recipientUser: userId,
          eventType: RECEIVABLE_OVERDUE_EVENT,
          entityId: inv.id,
          entityCode: inv.invoiceNo,
          title,
          message,
          link: `/sales?tab=fin-receivables`,
          severity: "error",
        });
      }
      receivableOverdueReminded++;
    }
    await db
      .update(finInvoice)
      .set({ status: "OVERDUE", updatedAt: new Date() })
      .where(eq(finInvoice.id, inv.id));
  }

  if (notifyRows.length > 0) {
    await db.insert(notification).values(
      notifyRows.map((r) => ({
        recipientUser: r.recipientUser,
        recipientRole: null,
        actorUserId: null,
        actorUsername: null,
        eventType: r.eventType,
        entityType: "fin_invoice",
        entityId: r.entityId,
        entityCode: r.entityCode,
        title: r.title,
        message: r.message,
        link: r.link,
        severity: r.severity,
      })),
    );
  }

  return { dueSoonReminded, overdueMarked, receivableOverdueReminded, skipped };
}
