/**
 * TASK-notify V4.4 — nhóm hiển thị dùng chung cho NotificationBell +
 * trang /notifications. `category` đến từ API (`/api/notifications`,
 * tính bằng `categoryForEventType()` phía server — xem
 * apps/web/src/server/services/notification-plans.ts).
 */
export type NotifyCategory = "action" | "update" | "reminder";

export const NOTIFY_GROUP_ORDER: readonly NotifyCategory[] = ["action", "update", "reminder"];

export const NOTIFY_GROUP_LABEL: Record<NotifyCategory, string> = {
  action: "Cần bạn duyệt",
  update: "Cập nhật",
  reminder: "Nhắc hạn",
};

export interface Groupable {
  category?: NotifyCategory | string;
  /** Đã đọc/đã xử lý (kể cả hệ thống tự resolve) → không còn là việc đang mở. */
  readAt?: string | null;
}

export interface NotifyGroup<T> {
  key: NotifyCategory;
  label: string;
  items: T[];
}

/** Gộp danh sách thông báo theo category, bỏ nhóm rỗng, giữ nguyên thứ tự trong nhóm. */
export function groupNotificationsByCategory<T extends Groupable>(items: T[]): NotifyGroup<T>[] {
  const buckets: Record<NotifyCategory, T[]> = { action: [], update: [], reminder: [] };
  for (const item of items) {
    let cat = (item.category as NotifyCategory) ?? "update";
    // L14 — "Cần bạn duyệt"/"Nhắc hạn" chỉ gồm việc còn mở; việc đã đọc/đã xử lý
    // (kể cả bị hệ thống tự resolve) chuyển xuống "Cập nhật" như lịch sử.
    if ((cat === "action" || cat === "reminder") && item.readAt) cat = "update";
    (buckets[cat] ?? buckets.update).push(item);
  }
  return NOTIFY_GROUP_ORDER.filter((k) => buckets[k].length > 0).map((k) => ({
    key: k,
    label: NOTIFY_GROUP_LABEL[k],
    items: buckets[k],
  }));
}
