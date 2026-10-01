/**
 * V4.5 QA-E P2 / QA-A P2 — chặn double-submit tạo trùng chứng từ (PR/PO/...)
 * khi bấm 2 lần liên tiếp/mạng chậm retry. Trước đây chỉ dựa vào
 * `disabled={pending}` phía client (React Query `isPending`) — bấm rất
 * nhanh 2 lần TRƯỚC khi React kịp re-render vẫn gửi 2 request, cả 2 đều
 * 201 (xem QA-E P2, tái hiện qua test API trực tiếp).
 *
 * Cơ chế: client sinh 1 `Idempotency-Key` (vd `crypto.randomUUID()`) MỘT
 * LẦN mỗi phiên form, gửi kèm MỌI lần submit (kể cả double-click/retry) của
 * phiên đó. Server dùng Redis SET NX làm khoá ngắn hạn trong lúc xử lý, rồi
 * cache kết quả CUỐI CÙNG `ttlSeconds` (mặc định 600s = 10 phút) — request
 * trùng trong khoảng đó nhận lại ĐÚNG kết quả cũ (replay) thay vì chạy lại
 * `fn()` (không tạo bản ghi DB thứ 2, không bắn audit/notify lần 2).
 *
 * Best-effort: Redis lỗi/không kết nối → bỏ qua idempotency, chạy `fn()`
 * bình thường (không chặn nghiệp vụ vì hạ tầng cache down) — giống triết lý
 * `cacheGetJson`/`cacheSetJson` (lib/redis.ts) đã dùng trong repo.
 */
import { getCacheRedis } from "./redis";

const PENDING_MARKER = "__PENDING__";
const DEFAULT_POLL_INTERVAL_MS = 300;
const DEFAULT_POLL_MAX_ATTEMPTS = 10; // tổng tối đa ~3s chờ request gốc xử lý xong.

export interface IdempotencyPollOptions {
  /** Khoảng cách giữa 2 lần poll (ms). Mặc định 300ms. Chỉnh nhỏ hơn trong test. */
  intervalMs?: number;
  /** Số lần poll tối đa trước khi báo IdempotencyInProgressError. Mặc định 10. */
  maxAttempts?: number;
}

export interface IdempotencyResult<T> {
  /** true nếu trả lại kết quả ĐÃ CÓ SẴN (không chạy lại `fn`, không side-effect lần 2). */
  replayed: boolean;
  data: T;
}

/** Request trùng đang được xử lý nhưng CHƯA xong sau thời gian chờ hợp lý. */
export class IdempotencyInProgressError extends Error {
  constructor() {
    super(
      "Yêu cầu trước đó (cùng nội dung) đang được xử lý — vui lòng đợi vài giây rồi tải lại trang.",
    );
    this.name = "IdempotencyInProgressError";
  }
}

/**
 * Chạy `fn()` với khoá idempotency theo `namespace:key`. `key` rỗng/null →
 * bỏ qua hoàn toàn (chạy `fn()` thẳng, giữ nguyên hành vi cũ — client chưa
 * gửi Idempotency-Key, vd tool gọi API trực tiếp/client cũ).
 */
export async function withIdempotency<T>(
  namespace: string,
  key: string | null | undefined,
  ttlSeconds: number,
  fn: () => Promise<T>,
  pollOptions?: IdempotencyPollOptions,
): Promise<IdempotencyResult<T>> {
  const intervalMs = pollOptions?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxAttempts = pollOptions?.maxAttempts ?? DEFAULT_POLL_MAX_ATTEMPTS;
  if (!key) return { replayed: false, data: await fn() };

  const redisKey = `idem:${namespace}:${key}`;
  let r: ReturnType<typeof getCacheRedis>;
  try {
    r = getCacheRedis();
  } catch {
    return { replayed: false, data: await fn() };
  }

  let acquired = false;
  try {
    const setRes = await r.set(redisKey, PENDING_MARKER, "EX", ttlSeconds, "NX");
    acquired = setRes === "OK";
  } catch {
    // Redis down — fail-open, không chặn nghiệp vụ.
    return { replayed: false, data: await fn() };
  }

  if (acquired) {
    try {
      const data = await fn();
      await r.set(redisKey, JSON.stringify({ data }), "EX", ttlSeconds).catch(() => {});
      return { replayed: false, data };
    } catch (err) {
      // Lỗi THẬT (không phải trùng) — xoá lock để retry hợp lệ không bị
      // khoá oan tới 10 phút.
      await r.del(redisKey).catch(() => {});
      throw err;
    }
  }

  // Không acquire được lock — có request khác (cùng key) đang/đã xử lý.
  // Kiểm NGAY trước (không chờ cache đã xong rồi vẫn bắt chờ 1 nhịp oan),
  // rồi mới poll ngắn giữa các lần — chờ request gốc xong rồi trả lại ĐÚNG
  // kết quả, không chạy fn() lần 2.
  for (let i = 0; i < maxAttempts; i += 1) {
    let raw: string | null;
    try {
      raw = await r.get(redisKey);
    } catch {
      return { replayed: false, data: await fn() };
    }
    if (raw === null) {
      // Lock hết hạn/bị xoá (request gốc lỗi thật) — không còn gì để
      // replay, coi như yêu cầu mới hợp lệ.
      return { replayed: false, data: await fn() };
    }
    if (raw !== PENDING_MARKER) {
      try {
        const parsed = JSON.parse(raw) as { data: T };
        return { replayed: true, data: parsed.data };
      } catch {
        return { replayed: false, data: await fn() };
      }
    }
    if (i < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  throw new IdempotencyInProgressError();
}
