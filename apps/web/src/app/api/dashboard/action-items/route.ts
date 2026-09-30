import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { bucketActionItemsByEntityType } from "@/lib/dashboard-action-items";
import { jsonError } from "@/server/http";
import { forbidden, getSession, isDisplayKiosk, unauthorized } from "@/server/session";
import { cacheGetJson, cacheSetJson } from "@/server/services/redis";
import { getActionItemsForUser } from "@/server/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/action-items — TASK-20260427-027, sửa lại V4.4 (P0).
 *
 * TRƯỚC ĐÂY: tự đếm lại bằng SQL riêng trên purchase_request/purchase_order/
 * work_order — GLOBAL (không theo người xem), thiếu PR ở bước DEPT_APPROVED
 * (chờ Giám đốc) và không đếm ISR/BBGH/PO chờ duyệt → thẻ báo "Ổn định" dù có
 * việc thật đang chờ (kiểm kê UI_INVENTORY.md #1).
 *
 * NAY: dùng ĐÚNG cùng nguồn với nhóm "Cần bạn duyệt" ở chuông —
 * `getActionItemsForUser()` (notifications.ts) đếm unread + eventType thuộc
 * ACTION_EVENT_TYPES theo recipient_user = NGƯỜI ĐANG XEM, rồi
 * `bucketActionItemsByEntityType()` (thuần, có test) gộp vào 3 hàng hiện có
 * của ActionItemsCard. Tổng luôn KHỚP số trong nhóm "Cần bạn duyệt" của
 * chính người đó trên trang /notifications.
 *
 * Cache Redis 30s — SCOPE THEO USER (trước đây 1 key chung cho mọi người xem
 * là bug gốc thứ 2: dù có sửa SQL cũng vẫn trả nhầm số của người khác).
 *
 * Sample response:
 * {
 *   "cachedAt": "2026-04-27T12:34:56.789Z",
 *   "prDraft":   { "count": 3, "href": "/notifications" },
 *   "poOverdue": { "count": 1, "href": "/notifications" },
 *   "woOverdue": { "count": 2, "href": "/notifications" }
 * }
 */

const CACHE_KEY_PREFIX = "dashboard:action-items:v3:";
const CACHE_TTL_SECONDS = 30;

export interface DashboardActionItem {
  count: number;
  href: string;
}

export interface DashboardActionItemsPayload {
  cachedAt: string;
  prDraft: DashboardActionItem;
  poOverdue: DashboardActionItem;
  woOverdue: DashboardActionItem;
}

async function buildPayload(userId: string): Promise<DashboardActionItemsPayload> {
  const summary = await getActionItemsForUser(userId);
  const buckets = bucketActionItemsByEntityType(summary.byEntityType);

  // Cả 3 hàng đều trỏ về /notifications — số hiển thị giờ LÀ số thông báo
  // "Cần bạn duyệt" thật (không còn suy diễn qua bộ lọc trạng thái riêng lẻ
  // dễ lệch mỗi khi nghiệp vụ đổi), bấm vào thấy đúng danh sách đang chờ.
  return {
    cachedAt: new Date().toISOString(),
    prDraft: { count: buckets.prPending, href: "/notifications" },
    poOverdue: { count: buckets.poPending, href: "/notifications" },
    woOverdue: { count: buckets.otherPending, href: "/notifications" },
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (isDisplayKiosk(session)) return forbidden(); // V3.11.4 (audit S.8)

    const cacheKey = `${CACHE_KEY_PREFIX}${session.userId}`;
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    if (!fresh) {
      const cached = await cacheGetJson<DashboardActionItemsPayload>(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            "Cache-Control": "private, s-maxage=30, stale-while-revalidate=60",
            "X-Cache": "HIT",
          },
        });
      }
    }

    const payload = await buildPayload(session.userId);
    await cacheSetJson(cacheKey, payload, CACHE_TTL_SECONDS);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, s-maxage=30, stale-while-revalidate=60",
        "X-Cache": fresh ? "BYPASS" : "MISS",
      },
    });
  } catch (err) {
    logger.error({ err }, "dashboard action-items failed");
    return jsonError("INTERNAL", "Không tải được danh sách cần xử lý.", 500);
  }
}
