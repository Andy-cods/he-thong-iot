import IORedis from "ioredis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { NOTIFY_CHANNEL, type NotifyStreamEvent } from "@/server/services/notify-pubsub";
import { broadcastToUser } from "@/server/services/notify-stream-registry";

export {
  registerStreamClient,
  unregisterStreamClient,
  getStreamCountForUser,
  getActiveStreamUserCount,
  MAX_STREAMS_PER_USER,
  type StreamClient,
} from "@/server/services/notify-stream-registry";

/**
 * TASK-notify-realtime — MỘT Redis subscriber dùng chung mỗi tiến trình
 * (singleton qua globalThis, giống `getCacheRedis()`). KHÔNG tạo kết nối Redis
 * mới cho mỗi client SSE — mọi request `/api/notifications/stream` chỉ đăng
 * ký vào registry trong bộ nhớ (notify-stream-registry.ts), subscriber này
 * nhận message rồi fan-out nội bộ bằng `broadcastToUser()`.
 *
 * Tự kết nối lại: ioredis mặc định tự reconnect (retryStrategy) VÀ tự
 * resubscribe lại các channel đã subscribe trước đó sau khi reconnect — không
 * cần tự tay gọi lại `.subscribe()`.
 */

type GlobalWithNotifySub = typeof globalThis & {
  __iotNotifySub?: IORedis;
};

function createSubscriber(): IORedis {
  const client = new IORedis(env.REDIS_URL, {
    // Subscriber không nên giới hạn số lần retry — mất kết nối lâu vẫn phải
    // tự nối lại vô thời hạn (không throw làm chết process).
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });

  client.on("error", (err) => {
    logger.warn({ err: err.message }, "[notify-stream] redis subscriber lỗi (sẽ tự thử lại)");
  });

  client.on("message", (channel: string, message: string) => {
    if (channel !== NOTIFY_CHANNEL) return;
    try {
      const payload = JSON.parse(message) as NotifyStreamEvent;
      for (const userId of payload.userIds ?? []) {
        broadcastToUser(userId, "notify", message);
      }
    } catch (err) {
      logger.warn({ err }, "[notify-stream] parse message thất bại (bỏ qua)");
    }
  });

  client.subscribe(NOTIFY_CHANNEL).catch((err: unknown) => {
    logger.warn(
      { err },
      "[notify-stream] subscribe lần đầu thất bại — ioredis sẽ tự thử lại khi reconnect",
    );
  });

  return client;
}

/** Lazy init — chỉ tạo kết nối khi có request SSE đầu tiên trong tiến trình. */
export function ensureNotifySubscriber(): IORedis {
  const g = globalThis as GlobalWithNotifySub;
  if (!g.__iotNotifySub) {
    g.__iotNotifySub = createSubscriber();
  }
  return g.__iotNotifySub;
}
