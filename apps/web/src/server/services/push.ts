import webpush from "web-push";
import { eq } from "drizzle-orm";
import { pushSubscription } from "@iot/db/schema";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { classifyPushStatusCode } from "@/lib/push-classify";

export { classifyPushStatusCode, type PushSendOutcome } from "@/lib/push-classify";

/**
 * TASK-notify V4.4 — lớp gửi Web Push (VAPID), tách khỏi notifications.ts để
 * dễ thay/bỏ kênh sau này (deliver() ở notifications.ts chỉ gọi deliverPush()
 * khi target có `push: true` — không đụng chỗ emit nào khác).
 *
 * Thiếu khoá VAPID → isPushConfigured() = false → mọi lệnh gửi bị bỏ qua êm,
 * KHÔNG throw (đúng triết lý fire-and-forget của toàn bộ hệ thông báo).
 */

let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  vapidReady = true;
  return true;
}

/** Dùng ở UI (vd trang /notifications) để biết có nên hiện nút "Bật thông báo" không. */
export function isPushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body?: string;
  /** Link tương đối (KHÔNG cần APP_URL — service worker mở bằng origin hiện tại). */
  link?: string | null;
  /** Gộp thông báo OS theo cùng chứng từ (thường = entityId). */
  tag?: string;
}

/**
 * Gửi push cho TẤT CẢ thiết bị đã subscribe của 1 user. Fire-and-forget —
 * không throw, lỗi chỉ log warn (giống emitNotification). Subscription hết
 * hạn (404/410) tự xoá khỏi DB để lần sau khỏi thử lại vô ích.
 */
export async function deliverPush(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureVapid()) return;
  try {
    const subs = await db
      .select()
      .from(pushSubscription)
      .where(eq(pushSubscription.userId, userId));
    if (subs.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? "",
      link: payload.link ?? "/",
      tag: payload.tag,
    });

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          const res = await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
          // V4.4 — log INFO khi gửi thật thành công (verify thủ công/Playwright
          // đọc log này; web-push không throw ở 2xx nên phải log tay ở đây).
          logger.info(
            { userId, endpoint: sub.endpoint.slice(0, 60), statusCode: res.statusCode },
            "deliverPush gửi thành công",
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode ?? 0;
          const outcome = classifyPushStatusCode(statusCode);
          if (outcome === "expired") {
            await db
              .delete(pushSubscription)
              .where(eq(pushSubscription.id, sub.id))
              .catch((delErr) =>
                logger.warn({ delErr, subId: sub.id }, "xoá push_subscription hết hạn thất bại"),
              );
          } else {
            logger.warn(
              { err, userId, endpoint: sub.endpoint.slice(0, 60) },
              "deliverPush gửi thất bại (bỏ qua)",
            );
          }
        }
      }),
    );
  } catch (err) {
    logger.warn({ err, userId }, "deliverPush tra subscription thất bại (bỏ qua)");
  }
}
