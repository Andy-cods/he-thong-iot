/**
 * TASK-notify V4.4 — hàm THUẦN (không DB/mạng) tách riêng khỏi
 * `server/services/push.ts` để test được không cần mock `@/lib/db`/`@/lib/env`
 * (đúng pattern notification-plans.ts thuần vs notifications.ts đụng DB).
 */
export type PushSendOutcome = "sent" | "expired" | "retryable_error";

/**
 * Phân loại kết quả gửi 1 subscription theo statusCode HTTP mà push service
 * (FCM/Mozilla…) trả về:
 *   - 2xx       → "sent"
 *   - 404 | 410 → "expired" (subscription hết hạn/bị gỡ ở trình duyệt) → xoá khỏi DB
 *   - còn lại   → "retryable_error" (429/5xx/mất mạng…) → chỉ log, giữ subscription
 */
export function classifyPushStatusCode(statusCode: number): PushSendOutcome {
  if (statusCode >= 200 && statusCode < 300) return "sent";
  if (statusCode === 404 || statusCode === 410) return "expired";
  return "retryable_error";
}
