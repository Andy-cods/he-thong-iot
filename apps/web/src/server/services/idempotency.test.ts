import { beforeEach, describe, expect, it, vi } from "vitest";

/** Poll options nhỏ để test chạy nhanh với timer THẬT (không cần fake timers). */
const FAST_POLL = { intervalMs: 5, maxAttempts: 5 } as const;

/**
 * V4.5 QA-E P2 / QA-A P2 — vitest cho withIdempotency() với FakeRedis (mô
 * phỏng đúng ngữ nghĩa ioredis SET ... NX / GET / DEL cần dùng).
 */
class FakeRedis {
  private store = new Map<string, string>();

  async set(
    key: string,
    value: string,
    _ex: "EX",
    _ttl: number,
    nx?: "NX",
  ): Promise<"OK" | null> {
    if (nx === "NX") {
      if (this.store.has(key)) return null;
      this.store.set(key, value);
      return "OK";
    }
    this.store.set(key, value);
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

let fakeRedis: FakeRedis;

vi.mock("./redis", () => ({
  getCacheRedis: () => fakeRedis,
}));

const { withIdempotency, IdempotencyInProgressError } = await import("./idempotency");

beforeEach(() => {
  fakeRedis = new FakeRedis();
});

describe("withIdempotency", () => {
  it("key rỗng/null → luôn chạy fn(), không đụng Redis", async () => {
    const fn = vi.fn().mockResolvedValue({ id: "a" });
    const r1 = await withIdempotency("pr-create", null, 600, fn);
    const r2 = await withIdempotency("pr-create", undefined, 600, fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(r1).toEqual({ replayed: false, data: { id: "a" } });
    expect(r2).toEqual({ replayed: false, data: { id: "a" } });
  });

  it("key mới → chạy fn() 1 lần, replayed=false", async () => {
    const fn = vi.fn().mockResolvedValue({ id: "pr-1" });
    const result = await withIdempotency("pr-create", "user1:key-abc", 600, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ replayed: false, data: { id: "pr-1" } });
  });

  it("CÙNG key gọi lại SAU KHI request gốc đã xong → KHÔNG chạy lại fn(), trả cached (ca lỗi thật QA-E: bấm 2 lần tạo 2 phiếu)", async () => {
    const fn = vi.fn().mockResolvedValue({ id: "pr-1", code: "PR-001" });
    const r1 = await withIdempotency("pr-create", "user1:key-xyz", 600, fn, FAST_POLL);
    const r2 = await withIdempotency("pr-create", "user1:key-xyz", 600, fn, FAST_POLL);
    expect(fn).toHaveBeenCalledTimes(1); // CHỈ tạo 1 phiếu, không phải 2.
    expect(r1.data).toEqual({ id: "pr-1", code: "PR-001" });
    expect(r2).toEqual({ replayed: true, data: { id: "pr-1", code: "PR-001" } });
  });

  it("key KHÁC NHAU → tạo độc lập, mỗi key chạy fn() riêng", async () => {
    const fn = vi.fn().mockResolvedValueOnce({ id: "pr-1" }).mockResolvedValueOnce({ id: "pr-2" });
    const r1 = await withIdempotency("pr-create", "user1:key-A", 600, fn);
    const r2 = await withIdempotency("pr-create", "user1:key-B", 600, fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(r1.data).toEqual({ id: "pr-1" });
    expect(r2.data).toEqual({ id: "pr-2" });
  });

  it("fn() throw lỗi THẬT (không phải trùng) → xoá lock, retry ngay sau đó chạy lại fn() bình thường", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("PR_MUST_HAVE_LINES"))
      .mockResolvedValueOnce({ id: "pr-retry-ok" });

    await expect(withIdempotency("pr-create", "user1:key-err", 600, fn)).rejects.toThrow(
      "PR_MUST_HAVE_LINES",
    );
    const r2 = await withIdempotency("pr-create", "user1:key-err", 600, fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(r2).toEqual({ replayed: false, data: { id: "pr-retry-ok" } });
  });

  it("2 request CÙNG key gần như đồng thời (race thật) → request thứ 2 chờ rồi nhận lại kết quả của request thứ nhất, KHÔNG chạy fn() 2 lần", async () => {
    let resolveFirst: (v: { id: string }) => void;
    const firstPromise = new Promise<{ id: string }>((resolve) => {
      resolveFirst = resolve;
    });
    const fn = vi.fn().mockReturnValueOnce(firstPromise);

    const p1 = withIdempotency("pr-create", "user1:key-race", 600, fn, FAST_POLL);
    // Request thứ 2 bắt đầu khi request 1 CHƯA xong (còn PENDING trong Redis).
    const p2 = withIdempotency("pr-create", "user1:key-race", 600, fn, FAST_POLL);

    // Để p2 kịp vào vòng poll (thấy PENDING) trước khi request gốc xong.
    await new Promise((resolve) => setTimeout(resolve, 10));
    resolveFirst!({ id: "pr-race-1" });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(fn).toHaveBeenCalledTimes(1); // CHỈ 1 phiếu được tạo, không phải 2.
    expect(r1).toEqual({ replayed: false, data: { id: "pr-race-1" } });
    expect(r2).toEqual({ replayed: true, data: { id: "pr-race-1" } });
  });

  it("request gốc PENDING quá lâu (Redis không cập nhật) → báo IdempotencyInProgressError thay vì tạo trùng", async () => {
    const neverResolves = new Promise<never>(() => {});
    const fn = vi.fn().mockReturnValueOnce(neverResolves);

    withIdempotency("pr-create", "user1:key-stuck", 600, fn, FAST_POLL).catch(() => {
      // request gốc không bao giờ resolve trong test này — bỏ qua rejection của p1 (không có, vì không throw).
    });
    const err = await withIdempotency(
      "pr-create",
      "user1:key-stuck",
      600,
      fn,
      FAST_POLL,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(IdempotencyInProgressError);
    expect(fn).toHaveBeenCalledTimes(1); // request thứ 2 KHÔNG tự chạy fn().
  });
});
