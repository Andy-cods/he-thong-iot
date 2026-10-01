import { cacheDel } from "@/server/services/redis";

/**
 * TASK-notify-realtime — khoá cache Redis 30s của
 * `GET /api/dashboard/action-items` (theo user). Tách ra đây (thay vì để
 * private trong route.ts) để `notifications.ts` xoá cache NGAY khi phát/đọc
 * thông báo mà không phải import ngược route.ts.
 */
export const ACTION_ITEMS_CACHE_PREFIX = "dashboard:action-items:v3:";

export function actionItemsCacheKey(userId: string): string {
  return `${ACTION_ITEMS_CACHE_PREFIX}${userId}`;
}

/** Xoá cache "Cần xử lý" của 1 user — gọi ngay sau khi phát/đọc thông báo để badge/dashboard khớp tức thì. */
export async function invalidateActionItemsCache(userId: string): Promise<void> {
  await cacheDel(actionItemsCacheKey(userId));
}
