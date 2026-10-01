import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getCacheRedis } from "@/server/services/redis";
import type { NotifyCategory } from "@/server/services/notification-plans";

/**
 * TASK-notify-realtime — kênh Redis pub/sub cho "tín hiệu đẩy" realtime.
 *
 * CHỈ truyền tín hiệu "có thay đổi" (userIds + notificationId + category),
 * KHÔNG bao giờ truyền nội dung nhạy cảm (title đầy đủ vẫn ok vì đã hiển thị
 * y hệt ở chuông, nhưng KHÔNG kèm message/link) — client nhận tín hiệu rồi tự
 * gọi lại /api/notifications (đã có kiểm quyền) để lấy dữ liệu thật.
 *
 * Prefix kênh theo BULLMQ_PREFIX (giống namespace queue) để staging/prod dùng
 * chung 1 Redis vật lý không lẫn tín hiệu của nhau.
 */
export const NOTIFY_CHANNEL = `${env.BULLMQ_PREFIX}notify:events`;

export type NotifyStreamKind = "new" | "read" | "read-all";

export interface NotifyStreamEvent {
  kind: NotifyStreamKind;
  /** Người cần nhận tín hiệu — luôn là mảng user id (fan-out đã được giải ở notifications.ts). */
  userIds: string[];
  notificationId?: string | null;
  category?: NotifyCategory;
  /** Tiêu đề ngắn — chỉ dùng để hiện toast nhẹ phía client, không phải nguồn dữ liệu. */
  title?: string;
}

/**
 * Publish 1 sự kiện nhỏ lên Redis — CHỈ gọi SAU khi ghi DB thành công (sau
 * commit transaction). Fire-and-forget, KHÔNG throw — lỗi chỉ log warn, không
 * được phép làm hỏng nghiệp vụ chính (giống triết lý emitNotification).
 */
export function publishNotifyEvent(evt: NotifyStreamEvent): void {
  if (!evt.userIds || evt.userIds.length === 0) return;
  try {
    const client = getCacheRedis();
    const payload = JSON.stringify(evt);
    void client.publish(NOTIFY_CHANNEL, payload).catch((err: unknown) => {
      logger.warn({ err, kind: evt.kind }, "[notify-pubsub] publish thất bại (bỏ qua)");
    });
  } catch (err) {
    logger.warn({ err, kind: evt.kind }, "[notify-pubsub] publish lỗi đồng bộ (bỏ qua)");
  }
}
