/**
 * TASK-notify-realtime — publishNotifyEvent: fire-and-forget, KHÔNG throw,
 * chỉ gọi khi có userIds (tức là CHỈ có ý nghĩa sau khi ghi DB thành công —
 * notifications.ts chỉ gọi hàm này sau khi `notifId` tồn tại).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { BULLMQ_PREFIX: "test-" } }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const publishMock = vi.fn().mockResolvedValue(1);
vi.mock("@/server/services/redis", () => ({
  getCacheRedis: () => ({ publish: publishMock }),
}));

import { logger } from "@/lib/logger";
import { NOTIFY_CHANNEL, publishNotifyEvent } from "./notify-pubsub";

afterEach(() => {
  vi.clearAllMocks();
});

describe("publishNotifyEvent", () => {
  it("kênh có prefix theo BULLMQ_PREFIX (tránh lẫn staging/prod)", () => {
    expect(NOTIFY_CHANNEL).toBe("test-notify:events");
  });

  it("publish đúng kênh + payload JSON khi có userIds", () => {
    publishNotifyEvent({
      kind: "new",
      userIds: ["u1", "u2"],
      notificationId: "n1",
      category: "action",
      title: "PR cần duyệt",
    });
    expect(publishMock).toHaveBeenCalledTimes(1);
    const [channel, payload] = publishMock.mock.calls[0]!;
    expect(channel).toBe("test-notify:events");
    expect(JSON.parse(payload)).toEqual({
      kind: "new",
      userIds: ["u1", "u2"],
      notificationId: "n1",
      category: "action",
      title: "PR cần duyệt",
    });
  });

  it("userIds rỗng hoặc thiếu → KHÔNG publish (không có ai cần nhận)", () => {
    publishNotifyEvent({ kind: "read-all", userIds: [] });
    // @ts-expect-error cố tình thiếu userIds để kiểm tra fail-safe
    publishNotifyEvent({ kind: "read-all" });
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("publish() reject (Redis down) → swallow, chỉ log warn, không throw", async () => {
    publishMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(() =>
      publishNotifyEvent({ kind: "new", userIds: ["u1"], notificationId: "n1" }),
    ).not.toThrow();
    // publish() là async — đợi 1 microtask để catch() nội bộ chạy xong.
    await new Promise((r) => setTimeout(r, 0));
    expect(logger.warn).toHaveBeenCalled();
  });

  it("getCacheRedis() throw đồng bộ (vd lazy init lỗi) → vẫn swallow, không throw", async () => {
    const redisMod = await import("@/server/services/redis");
    const spy = vi
      .spyOn(redisMod, "getCacheRedis")
      .mockImplementationOnce(() => {
        throw new Error("redis init lỗi");
      });
    expect(() => publishNotifyEvent({ kind: "new", userIds: ["u1"] })).not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
    spy.mockRestore();
  });
});
