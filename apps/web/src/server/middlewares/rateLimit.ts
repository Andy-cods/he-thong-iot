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
import { logger } from "@/lib/logger";

export interface RateLimitOptions {
  /** Bucket identifier, e.g. "login" / "api" / "change-password". */
  bucket: string;
  /** Key định danh (thường là IP hoặc userId). */
  key: string;
  /** Số request tối đa trong window. */
  limit: number;
  /** Kích thước window, đơn vị giây. */
  windowSec: number;
  /**
   * V3.11.4 (audit S.5) — khi Redis lỗi, thay vì fail-open hoàn toàn (mất chống
   * brute-force) thì dùng in-memory fallback limiter cho bucket này. Bật cho
   * login/change-password để Redis down không mở toang cửa brute-force.
   */
  fallbackInMemory?: boolean;
}

/* ── In-memory fallback limiter (dùng khi Redis lỗi) ───────────────────────
 * Sliding window đơn giản trong RAM process. Chỉ là lớp phòng thủ dự phòng —
 * không thay Redis (không chia sẻ giữa nhiều instance), nhưng chặn được kịch
 * bản Redis chết + brute-force cùng lúc trên 1 instance. */
const memBuckets = new Map<string, number[]>();

function memRateLimit(
  fullKey: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const arr = (memBuckets.get(fullKey) ?? []).filter((t) => t > cutoff);
  arr.push(now);
  memBuckets.set(fullKey, arr);
  // Chống rò bộ nhớ: dọn map khi phình to.
  if (memBuckets.size > 10_000) {
    for (const [k, v] of memBuckets) {
      if (v.every((t) => t <= cutoff)) memBuckets.delete(k);
    }
  }
  const current = arr.length;
  if (current > limit) {
    const oldest = arr[0] ?? now;
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfter, current };
  }
  return {
    ok: true,
    remaining: Math.max(0, limit - current),
    retryAfter: 0,
    current,
  };
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
      // Redis returned error — fallback in-memory nếu bucket yêu cầu, else fail-open.
      if (opts.fallbackInMemory) {
        return memRateLimit(fullKey, opts.limit, windowMs);
      }
      return { ok: true, remaining: opts.limit, retryAfter: 0, current: 0 };
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
    // Redis down: fallback in-memory (login/change-password) hoặc fail-open.
    logger.warn({ err, bucket: opts.bucket }, "rate-limit redis error");
    if (opts.fallbackInMemory) {
      return memRateLimit(fullKey, opts.limit, windowMs);
    }
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

/**
 * V3.7.29 — Login IP-based 60/60s (nới từ 5/60s).
 *
 * Lý do: 5/60s/IP chặn hoàn toàn văn phòng nhiều user cùng IP NAT — 1 cty
 * 5+ nhân viên login buổi sáng đã quá quota. Vẫn defend IP-level abuse,
 * brute-force trên 1 account cụ thể đã được bảo vệ bởi
 * `loginRateLimitByUsername` (5/60s/username) + failedLoginCount lock.
 */
export function loginRateLimit(req: NextRequest) {
  return rateLimit({
    bucket: "login-ip",
    key: getClientIp(req),
    limit: 60,
    windowSec: 60,
  });
}

/**
 * V3.7.29 — Login per-username 5/60s. Defend brute-force trên 1 acc cụ thể
 * bất kể attacker đến từ IP nào (botnet rotating IPs). Phải gọi SAU khi
 * parse body để có username.
 */
export function loginRateLimitByUsername(username: string) {
  return rateLimit({
    bucket: "login-user",
    key: username.toLowerCase().trim(),
    limit: 5,
    windowSec: 60,
    // V3.11.4 (audit S.5) — fallback in-memory: Redis down không mở toang
    // brute-force trên 1 account.
    fallbackInMemory: true,
  });
}

/** Helper preset: change-password user-based 3/60s. */
export function changePasswordRateLimit(userId: string) {
  return rateLimit({
    bucket: "change-password",
    key: userId,
    limit: 3,
    windowSec: 60,
    fallbackInMemory: true,
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
