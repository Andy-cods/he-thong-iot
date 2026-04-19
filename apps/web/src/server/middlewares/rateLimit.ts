/**
 * Rate limit middleware V1.4 — Redis sliding window.
 *
 * Thuật toán (sliding window): dùng Redis SortedSet với score = timestamp
 * (ms). Mỗi request:
 *   1. ZREMRANGEBYSCORE key 0 (now - window) → xoá entry hết hạn
 *   2. ZADD key now:uniqueId → thêm entry hiện tại
 *   3. ZCARD key → đếm số request trong window
 *   4. EXPIRE key window (auto cleanup nếu idle)
 *
 * Nếu count > limit → deny. Ưu điểm sliding window: không "burst lag" giữa
 * biên window như fixed window; cost: 3 ops pipelined thay vì 2.
 *
 * Redis key pattern: `ratelimit:{bucket}:{key}` với TTL auto = windowSec.
 */

import type { NextRequest } from "next/server";
import { getCacheRedis } from "@/server/services/redis";

export interface RateLimitOptions {
  /** Bucket identifier, e.g. "login" / "api" / "change-password". */
  bucket: string;
  /** Key định danh (thường là IP hoặc userId). */
  key: string;
  /** Số request tối đa trong window. */
  limit: number;
  /** Kích thước window, đơn vị giây. */
  windowSec: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Số request còn lại (0 khi ok=false). */
  remaining: number;
  /** Số giây client phải đợi trước khi retry. */
  retryAfter: number;
  /** Tổng request trong window hiện tại. */
  current: number;
}

/**
 * Kiểm tra rate limit. Trả về ok=true nếu còn quota, ok=false nếu vượt.
 * Không throw — caller quyết định phản hồi (thường là 429).
 *
 * Fail-open: nếu Redis lỗi, pass-through (log warn, không block user).
 */
export async function rateLimit(
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const fullKey = `ratelimit:${opts.bucket}:${opts.key}`;
  const now = Date.now();
  const windowMs = opts.windowSec * 1000;
  const cutoff = now - windowMs;
  const entryId = `${now}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const redis = getCacheRedis();
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(fullKey, 0, cutoff);
    pipeline.zadd(fullKey, now, entryId);
    pipeline.zcard(fullKey);
    pipeline.expire(fullKey, opts.windowSec + 5); // + 5s buffer
    const results = await pipeline.exec();

    // ZCARD là kết quả thứ 3 (index 2)
    const zcardResult = results?.[2];
    if (!zcardResult || zcardResult[0]) {
      // Redis returned error — fail-open
      return {
        ok: true,
        remaining: opts.limit,
        retryAfter: 0,
        current: 0,
      };
    }
    const current = Number(zcardResult[1] ?? 0);

    if (current > opts.limit) {
      // Lấy timestamp entry cũ nhất để tính retryAfter chính xác
      const oldest = await redis.zrange(fullKey, 0, 0, "WITHSCORES");
      const oldestTs = oldest[1] ? Number(oldest[1]) : now;
      const retryAfter = Math.max(
        1,
        Math.ceil((oldestTs + windowMs - now) / 1000),
      );
      return { ok: false, remaining: 0, retryAfter, current };
    }

    return {
      ok: true,
      remaining: Math.max(0, opts.limit - current),
      retryAfter: 0,
      current,
    };
  } catch (err) {
    // Fail-open: Redis down không nên làm chết app
    // eslint-disable-next-line no-console
    console.warn("[rate-limit] redis error, pass-through:", err);
    return { ok: true, remaining: opts.limit, retryAfter: 0, current: 0 };
  }
}

/**
 * Extract IP từ request — tôn trọng Cloudflare + Caddy + fallback socket.
 *
 * Priority:
 *   1. CF-Connecting-IP  — Cloudflare Tunnel (nếu có)
 *   2. X-Forwarded-For   — Caddy reverse proxy → dùng phần tử đầu
 *   3. X-Real-IP         — nginx-style fallback
 *   4. "0.0.0.0"         — last resort (không block user vô tình)
 */
export function getClientIp(req: NextRequest): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();

  return "0.0.0.0";
}

/** Helper preset: login IP-based 5/60s. */
export function loginRateLimit(req: NextRequest) {
  return rateLimit({
    bucket: "login",
    key: getClientIp(req),
    limit: 5,
    windowSec: 60,
  });
}

/** Helper preset: change-password user-based 3/60s. */
export function changePasswordRateLimit(userId: string) {
  return rateLimit({
    bucket: "change-password",
    key: userId,
    limit: 3,
    windowSec: 60,
  });
}

/** Helper preset: global API burst IP-based 60/60s. */
export function apiBurstRateLimit(req: NextRequest) {
  return rateLimit({
    bucket: "api",
    key: getClientIp(req),
    limit: 60,
    windowSec: 60,
  });
}
