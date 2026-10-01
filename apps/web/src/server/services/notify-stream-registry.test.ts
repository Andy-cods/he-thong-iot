/**
 * TASK-notify-realtime — registry userId→streams cho SSE. Thuần (không Redis/
 * DB) nên test trực tiếp, không cần mock.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_STREAMS_PER_USER,
  __resetStreamRegistryForTests,
  broadcastToUser,
  getActiveStreamUserCount,
  getStreamCountForUser,
  registerStreamClient,
  unregisterStreamClient,
  type StreamClient,
} from "./notify-stream-registry";

function makeClient(id: string): StreamClient & { sent: string[] } {
  const sent: string[] = [];
  return {
    id,
    sent,
    send: (event, data) => sent.push(`${event}:${data}`),
    close: vi.fn(),
  };
}

afterEach(() => {
  __resetStreamRegistryForTests();
});

describe("notify-stream-registry", () => {
  it("đăng ký + đếm đúng theo user, không lẫn user khác", () => {
    const a1 = makeClient("a1");
    const b1 = makeClient("b1");
    registerStreamClient("user-a", a1);
    registerStreamClient("user-b", b1);
    expect(getStreamCountForUser("user-a")).toBe(1);
    expect(getStreamCountForUser("user-b")).toBe(1);
    expect(getStreamCountForUser("user-khong-ton-tai")).toBe(0);
    expect(getActiveStreamUserCount()).toBe(2);
  });

  it("unregister gỡ đúng client, không ảnh hưởng client khác của cùng user", () => {
    const c1 = makeClient("c1");
    const c2 = makeClient("c2");
    registerStreamClient("user-a", c1);
    registerStreamClient("user-a", c2);
    expect(getStreamCountForUser("user-a")).toBe(2);

    unregisterStreamClient("user-a", c1);
    expect(getStreamCountForUser("user-a")).toBe(1);

    const sent = broadcastToUser("user-a", "notify", "{}");
    expect(sent).toBe(1);
    expect(c2.sent).toEqual(["notify:{}"]);
    expect(c1.sent).toEqual([]);
  });

  it("unregister user không tồn tại / client không có trong set → no-op an toàn", () => {
    expect(() => unregisterStreamClient("ma-khong-ton-tai", makeClient("x"))).not.toThrow();
    const c1 = makeClient("c1");
    registerStreamClient("user-a", c1);
    // client lạ, không phải c1 — không được xoá c1
    unregisterStreamClient("user-a", makeClient("khac"));
    expect(getStreamCountForUser("user-a")).toBe(1);
  });

  it(`giới hạn ${MAX_STREAMS_PER_USER} stream/người — vượt quá tự evict (đóng) cái CŨ NHẤT`, () => {
    const clients = Array.from({ length: MAX_STREAMS_PER_USER + 2 }, (_, i) =>
      makeClient(`t${i}`),
    );
    for (const c of clients) registerStreamClient("user-a", c);

    // Không bao giờ vượt giới hạn.
    expect(getStreamCountForUser("user-a")).toBe(MAX_STREAMS_PER_USER);

    // 2 client cũ nhất (t0, t1) bị đóng — register mới KHÔNG từ chối kết nối.
    expect(clients[0]!.close).toHaveBeenCalledTimes(1);
    expect(clients[1]!.close).toHaveBeenCalledTimes(1);
    // Các client còn lại (từ t2 trở đi) vẫn sống, không bị đóng.
    for (let i = 2; i < clients.length; i++) {
      expect(clients[i]!.close).not.toHaveBeenCalled();
    }

    // Broadcast chỉ tới các client còn sống (đúng = giới hạn).
    const sent = broadcastToUser("user-a", "notify", "payload");
    expect(sent).toBe(MAX_STREAMS_PER_USER);
  });

  it("broadcastToUser: 1 client throw khi send không chặn các client khác nhận", () => {
    const ok1 = makeClient("ok1");
    const bad = makeClient("bad");
    bad.send = vi.fn(() => {
      throw new Error("ECONNRESET giả lập");
    });
    const ok2 = makeClient("ok2");
    registerStreamClient("user-a", ok1);
    registerStreamClient("user-a", bad);
    registerStreamClient("user-a", ok2);

    const sent = broadcastToUser("user-a", "notify", "{}");
    expect(sent).toBe(2); // ok1 + ok2, bad bị bỏ qua
    expect(ok1.sent).toEqual(["notify:{}"]);
    expect(ok2.sent).toEqual(["notify:{}"]);
  });

  it("broadcastToUser cho user không có stream nào → trả 0, không throw", () => {
    expect(broadcastToUser("khong-ai-nghe", "notify", "{}")).toBe(0);
  });
});
