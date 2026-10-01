import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { requireSession } from "@/server/session";
import {
  ensureNotifySubscriber,
  registerStreamClient,
  unregisterStreamClient,
  type StreamClient,
} from "@/server/services/notify-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/stream — TASK-notify-realtime.
 *
 * SSE một chiều: đẩy tín hiệu "có thay đổi" NGAY khi notifications.ts publish
 * (xem notify-pubsub.ts), thay cho việc đợi tới vòng poll 60s của chuông.
 *
 * - Xác thực giống mọi API khác (`requireSession` — cookie phiên + kiểm phiên
 *   còn hiệu lực qua `isSessionValid`, chặn luôn role `display` kiosk thuần).
 * - KHÔNG gửi nội dung nhạy cảm — chỉ { kind, userIds không cần gửi lại,
 *   notificationId, category, title ngắn (để toast) }. Client tự gọi lại
 *   `/api/notifications` (đã kiểm quyền) để lấy dữ liệu thật.
 * - 1 Redis subscriber DÙNG CHUNG mỗi tiến trình (ensureNotifySubscriber,
 *   singleton qua globalThis) — route này KHÔNG mở kết nối Redis riêng, chỉ
 *   đăng ký controller vào registry trong bộ nhớ (notify-stream-registry.ts).
 * - Giới hạn 5 stream/người (registerStreamClient tự evict cũ nhất) — chống
 *   1 người mở quá nhiều tab/thiết bị làm rò rỉ controller.
 * - Đóng sạch khi client ngắt (`req.signal` abort): clear heartbeat, gỡ khỏi
 *   registry, đóng controller — idempotent (cleanup() có thể gọi nhiều lần).
 */

const HEARTBEAT_MS = 20_000;
const encoder = new TextEncoder();

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  // Lazy init — chỉ tạo kết nối Redis subscriber khi có client SSE đầu tiên
  // trong tiến trình này (không tốn connection nếu tính năng không ai dùng).
  ensureNotifySubscriber();

  const userId = guard.session.userId;
  const clientId = randomUUID();
  let cleanupFn: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller đã đóng (race với cleanup) — đánh dấu để các lần gọi
          // sau không thử nữa.
          closed = true;
        }
      };

      // cleanup() PHẢI idempotent: được gọi từ (1) abort listener khi client
      // ngắt kết nối, (2) registerStreamClient khi evict do vượt giới hạn
      // 5 stream/người, (3) ReadableStream.cancel().
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        req.signal.removeEventListener("abort", cleanup);
        unregisterStreamClient(userId, client);
        try {
          controller.close();
        } catch {
          /* đã đóng */
        }
      };

      const client: StreamClient = {
        id: clientId,
        send: (event, data) => safeEnqueue(`event: ${event}\ndata: ${data}\n\n`),
        close: cleanup,
      };

      registerStreamClient(userId, client);

      // retry: thời gian (ms) EventSource tự nối lại nếu mất kết nối.
      safeEnqueue("retry: 3000\n\n");
      // Comment mở đầu — vài proxy cần nhận byte đầu để bắt đầu flush response.
      safeEnqueue(": connected\n\n");

      heartbeat = setInterval(() => safeEnqueue(": heartbeat\n\n"), HEARTBEAT_MS);

      req.signal.addEventListener("abort", cleanup, { once: true });
      cleanupFn = cleanup;
    },
    cancel() {
      cleanupFn?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
