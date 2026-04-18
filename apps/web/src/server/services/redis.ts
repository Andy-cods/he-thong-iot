/**
 * Redis singleton client cho cache ngắn hạn (dashboard overview 60s, v.v.).
 *
 * Dùng DB index khác BullMQ (BullMQ đang dùng DB 2 trong importQueue.ts).
 * Cache client → DB 1 để isolate keyspace.
 *
 * Lazy init: tạo connection lần đầu khi gọi getCacheRedis(). Next.js HMR
 * dev sẽ reuse qua globalThis cache để tránh leak connection.
 */
import IORedis from "ioredis";

const CACHE_DB = Number(process.env.REDIS_CACHE_DB ?? "1");

type GlobalWithRedis = typeof globalThis & {
  __iotCacheRedis?: IORedis;
};

export function getCacheRedis(): IORedis {
  const g = globalThis as GlobalWithRedis;
  if (g.__iotCacheRedis) return g.__iotCacheRedis;

  const baseUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  // Chèn DB index vào URL nếu chưa có.
  const url = /\/\d+$/.test(baseUrl)
    ? baseUrl
    : `${baseUrl.replace(/\/$/, "")}/${CACHE_DB}`;

  const client = new IORedis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    lazyConnect: false,
  });

  // Tránh crash process khi Redis down — chỉ log. Route sẽ fallback query DB.
  client.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.warn("[cache-redis]", err.message);
  });

  g.__iotCacheRedis = client;
  return client;
}

/**
 * get + parse JSON. Trả null nếu miss hoặc lỗi (swallow để fallback).
 */
export async function cacheGetJson<T>(key: string): Promise<T | null> {
  try {
    const r = getCacheRedis();
    const raw = await r.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * SET với EX (seconds). Swallow error nếu Redis down.
 */
export async function cacheSetJson(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    const r = getCacheRedis();
    await r.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    /* ignore */
  }
}

/** DEL — dùng cho invalidate thủ công nếu cần. */
export async function cacheDel(key: string): Promise<void> {
  try {
    const r = getCacheRedis();
    await r.del(key);
  } catch {
    /* ignore */
  }
}
