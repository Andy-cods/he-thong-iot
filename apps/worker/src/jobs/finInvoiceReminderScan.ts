import type { Job } from "bullmq";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { finInvoice, notification, role, supplier, userAccount, userRole } from "@iot/db/schema";
import type { Role } from "@iot/shared";
import { db } from "../db.js";
import { mergeUniqueUserIds, outstandingAmount } from "./reminderLogic.js";

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
 * Email: KHÔNG gửi. Nhắc hạn chỉ là thông báo in-app (chuông). Các event
 * FIN_* đã được gỡ khỏi EMAIL_EVENTS phía apps/web (email chỉ dành cho việc
 * CẦN DUYỆT) — worker insert thẳng bảng `notification` nên cũng không qua
 * maybeEmail. Đây là nguồn DUY NHẤT phát FIN_INVOICE_DUE_SOON/
 * FIN_INVOICE_OVERDUE/FIN_RECEIVABLE_OVERDUE (bản sao notify* phía web đã xoá).
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
// V4.1 TC-12 — HĐ đã quá hạn được nhắc LẠI mỗi 7 ngày (trước đây chỉ nhắc đúng
// 1 lần: lần quét đầu đổi status sang OVERDUE, các lần sau lọc UNPAID/PARTIAL
// nên không bao giờ thấy lại). 7 ngày để không spam chuông hằng ngày.
const OVERDUE_REPEAT_MS = 7 * 24 * 60 * 60 * 1000;

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

async function alreadyRemindedToday(
  eventType: string,
  invoiceId: string,
  windowMs: number = DEDUPE_WINDOW_MS,
): Promise<boolean> {
  const threshold = new Date(Date.now() - windowMs);
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
  // Người giữ nhiều role (vd muahang = purchaser + accountant, admin kiêm kế
  // toán) chỉ nhận 1 dòng / hoá đơn / loại nhắc → gộp Set trước khi fan-out.
  const payableRecipients = mergeUniqueUserIds(accountantIds, adminIds);
  const receivableRecipients = mergeUniqueUserIds(accountantIds, adminIds, shareholderIds);

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
        // V4.1 TC-12 — gồm cả OVERDUE để nhắc lại định kỳ.
        inArray(finInvoice.status, ["UNPAID", "PARTIAL", "OVERDUE"]),
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
        // V4.1 TC-12 — gồm cả OVERDUE để nhắc lại định kỳ.
        inArray(finInvoice.status, ["UNPAID", "PARTIAL", "OVERDUE"]),
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
    const outstanding = outstandingAmount(inv.totalAmount, inv.paidAmount);
    const supplierName = inv.supplierId ? supplierNameMap.get(inv.supplierId) : null;
    const title = `Hoá đơn ${inv.invoiceNo} sắp đến hạn — ${inv.dueDate}`;
    const message = supplierName
      ? `Nhà cung cấp: ${supplierName} — còn ${outstanding.toLocaleString("vi-VN")}đ`
      : `Còn ${outstanding.toLocaleString("vi-VN")}đ`;
    for (const userId of payableRecipients) {
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
    if (!(await alreadyRemindedToday(OVERDUE_EVENT, inv.id, OVERDUE_REPEAT_MS))) {
      const outstanding = outstandingAmount(inv.totalAmount, inv.paidAmount);
      const supplierName = inv.supplierId ? supplierNameMap.get(inv.supplierId) : null;
      const title = `Hoá đơn ${inv.invoiceNo} đã QUÁ HẠN thanh toán`;
      const message = supplierName
        ? `Nhà cung cấp: ${supplierName} — còn ${outstanding.toLocaleString("vi-VN")}đ`
        : `Còn ${outstanding.toLocaleString("vi-VN")}đ`;
      for (const userId of payableRecipients) {
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
    if (await alreadyRemindedToday(RECEIVABLE_OVERDUE_EVENT, inv.id, OVERDUE_REPEAT_MS)) {
      skipped++;
    } else {
      const outstanding = outstandingAmount(inv.totalAmount, inv.paidAmount);
      const supplierName = inv.supplierId ? supplierNameMap.get(inv.supplierId) : null;
      const title = `Công nợ phải thu ${inv.invoiceNo} đã quá hạn`;
      const message = supplierName
        ? `Khách hàng: ${supplierName} — còn ${outstanding.toLocaleString("vi-VN")}đ`
        : `Còn ${outstanding.toLocaleString("vi-VN")}đ`;
      for (const userId of receivableRecipients) {
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

  // Chống trùng — xem comment tương đương trong prReminderScan.ts: mỗi người
  // tối đa 1 dòng CHƯA ĐỌC / hoá đơn / loại nhắc; nhắc lại (7 ngày/lần với
  // OVERDUE_REPEAT_MS) chỉ cập nhật created_at + nội dung mới nhất thay vì
  // chèn thêm dòng — trước đây insert thẳng mỗi lần quét qua ngưỡng lặp lại
  // → hoá đơn bị bỏ quên nhiều tuần dồn nhiều dòng chưa đọc cho cùng 1 người.
  for (const r of notifyRows) {
    const [existingUnread] = await db
      .select({ id: notification.id })
      .from(notification)
      .where(
        and(
          eq(notification.recipientUser, r.recipientUser),
          eq(notification.eventType, r.eventType),
          eq(notification.entityId, r.entityId),
          isNull(notification.readAt),
        ),
      )
      .limit(1);
    const values = {
      entityCode: r.entityCode,
      title: r.title,
      message: r.message,
      link: r.link,
      severity: r.severity,
    };
    if (existingUnread) {
      await db
        .update(notification)
        .set({ ...values, createdAt: new Date() })
        .where(eq(notification.id, existingUnread.id));
    } else {
      await db.insert(notification).values({
        recipientUser: r.recipientUser,
        recipientRole: null,
        actorUserId: null,
        actorUsername: null,
        eventType: r.eventType,
        entityType: "fin_invoice",
        entityId: r.entityId,
        ...values,
      });
    }
  }

  return { dueSoonReminded, overdueMarked, receivableOverdueReminded, skipped };
}
