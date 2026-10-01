/**
 * TASK-notify-realtime — registry THUẦN (không đụng Redis/DB) map
 * userId → Set<StreamClient> cho SSE `/api/notifications/stream`.
 *
 * Tách riêng khỏi `notify-stream.ts` (nơi giữ kết nối Redis subscriber) để
 * test được bằng vitest thuần, không cần mock ioredis.
 */

export interface StreamClient {
  id: string;
  send: (event: string, data: string) => void;
  /** Đóng sạch stream này — PHẢI idempotent (có thể gọi nhiều lần an toàn). */
  close: () => void;
}

/** Giới hạn số stream/người (VD 5 tab) — chống rò rỉ khi 1 người mở quá nhiều tab/thiết bị. */
export const MAX_STREAMS_PER_USER = 5;

const registry = new Map<string, Set<StreamClient>>();

/**
 * Đăng ký 1 client mới cho userId. Nếu đã đạt giới hạn → đóng (evict) các
 * client CŨ NHẤT trước (Set giữ thứ tự insertion) để nhường chỗ — không bao
 * giờ từ chối kết nối mới (để tab vừa mở không bị lỗi im lặng).
 */
export function registerStreamClient(userId: string, client: StreamClient): void {
  let set = registry.get(userId);
  if (!set) {
    set = new Set();
    registry.set(userId, set);
  }
  while (set.size >= MAX_STREAMS_PER_USER) {
    const oldest = set.values().next().value as StreamClient | undefined;
    if (!oldest) break;
    set.delete(oldest);
    try {
      oldest.close();
    } catch {
      /* ignore — client tự dọn phần còn lại */
    }
  }
  set.add(client);
}

/** Gỡ 1 client khỏi registry (gọi khi stream đóng — chủ động hoặc bị evict). */
export function unregisterStreamClient(userId: string, client: StreamClient): void {
  const set = registry.get(userId);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) registry.delete(userId);
}

/** Số stream đang mở của 1 user — dùng cho test + quan sát/debug. */
export function getStreamCountForUser(userId: string): number {
  return registry.get(userId)?.size ?? 0;
}

/** Tổng số user đang có ít nhất 1 stream mở — dùng cho test tải/metrics. */
export function getActiveStreamUserCount(): number {
  return registry.size;
}

/**
 * Đẩy 1 event tới MỌI stream đang mở của userId. Một client lỗi (send throw)
 * không được làm rớt các client khác — tự nó sẽ đóng qua onAbort/cleanup
 * riêng, registry không tự xoá ở đây.
 */
export function broadcastToUser(userId: string, event: string, data: string): number {
  const set = registry.get(userId);
  if (!set || set.size === 0) return 0;
  let sent = 0;
  for (const client of set) {
    try {
      client.send(event, data);
      sent++;
    } catch {
      /* ignore — client đã/sẽ tự cleanup qua abort handler */
    }
  }
  return sent;
}

/** CHỈ dùng trong test — reset registry giữa các test case. */
export function __resetStreamRegistryForTests(): void {
  registry.clear();
}
