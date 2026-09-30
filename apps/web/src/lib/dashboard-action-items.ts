/**
 * TASK-notify V4.4 (P0 dashboard) — quy tắc gộp "Cần xử lý" trên Dashboard
 * THEO ĐÚNG cùng nguồn dữ liệu với nhóm "Cần bạn duyệt" ở chuông thông báo
 * (`notification` WHERE recipient_user = tôi AND read_at IS NULL AND
 * event_type IN ACTION_EVENT_TYPES — xem
 * apps/web/src/server/services/notifications.ts#getActionItemsForUser và
 * notification-plans.ts#ACTION_EVENT_TYPES).
 *
 * Trước đây `/api/dashboard/action-items` tự đếm lại bằng SQL riêng trên
 * purchase_request/purchase_order/work_order (GLOBAL, không theo người xem,
 * thiếu PR ở bước DEPT_APPROVED và không đếm ISR/BBGH/PO chờ duyệt) → báo
 * "Ổn định" dù có việc thật đang chờ. Hàm THUẦN dưới đây chỉ làm 1 việc: gộp
 * kết quả GROUP BY entity_type (đã tính đúng, đã theo người xem) thành 3 hàng
 * hiển thị hiện có của ActionItemsCard.
 */
export interface ActionItemBuckets {
  prPending: number;
  poPending: number;
  otherPending: number;
  total: number;
}

export function bucketActionItemsByEntityType(
  byEntityType: Readonly<Record<string, number>>,
): ActionItemBuckets {
  let prPending = 0;
  let poPending = 0;
  let otherPending = 0;
  for (const [entityType, count] of Object.entries(byEntityType)) {
    if (entityType === "purchase_request") prPending += count;
    else if (entityType === "purchase_order") poPending += count;
    else otherPending += count;
  }
  return { prPending, poPending, otherPending, total: prPending + poPending + otherPending };
}
