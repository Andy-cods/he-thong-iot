/**
 * BOM V5 / WP9 — publish/subscribe bom-events (Redis mock) + registry room.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BULLMQ_PREFIX = "test-";
});
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const publishMock = vi.fn().mockResolvedValue(1);
vi.mock("@/server/services/redis", () => ({
  getCacheRedis: () => ({ publish: publishMock }),
}));

const subOn = vi.fn();
const subSubscribe = vi.fn().mockResolvedValue(undefined);
const fakeSub = { on: subOn, subscribe: subSubscribe };

import { logger } from "@/lib/logger";
import {
  BOM_CHANNEL,
  __resetBomSubscriberForTests,
  buildBomEventPayload,
  ensureBomSubscriber,
  handleBomMessage,
  publishBomEvent,
} from "./bom-events";
import {
  MAX_BOM_STREAMS_PER_USER,
  __resetRoomRegistryForTests,
  broadcastToRoom,
  getActiveRoomCount,
  getRoomClientCount,
  getRoomPresence,
  getRoomStreamCountForUser,
  registerRoomClient,
  unregisterRoomClient,
  type RoomClient,
} from "./bom-room-registry";

function mk(
  id: string,
  userId: string,
  templateId = "t1",
  name = userId,
): RoomClient & { sent: string[] } {
  const sent: string[] = [];
  const c: RoomClient & { sent: string[] } = {
    id,
    userId,
    userName: name,
    templateId,
    sent,
    send: (e, d) => sent.push(`${e}:${d}`),
    close: vi.fn(() => unregisterRoomClient(c)),
  };
  return c;
}

beforeEach(() => {
  __resetRoomRegistryForTests();
  __resetBomSubscriberForTests();
});
afterEach(() => vi.clearAllMocks());

describe("publishBomEvent", () => {
  it("kênh có prefix BULLMQ_PREFIX", () => {
    expect(BOM_CHANNEL).toBe("test-bom:events");
  });

  it("publish payload đúng, khử trùng lineIds", () => {
    publishBomEvent({ templateId: "t1", lineIds: ["a", "a", "b"], kind: "line", actorId: "u1" });
    const [ch, payload] = publishMock.mock.calls[0]!;
    expect(ch).toBe("test-bom:events");
    expect(JSON.parse(payload)).toEqual({
      templateId: "t1",
      lineIds: ["a", "b"],
      kind: "line",
      by: "u1",
    });
  });

  it("quá 200 dòng thì bỏ lineIds (client refetch cả tree)", () => {
    const ids = Array.from({ length: 201 }, (_, i) => `l${i}`);
    expect(
      buildBomEventPayload({ templateId: "t", lineIds: ids, kind: "import" }).lineIds,
    ).toBeUndefined();
  });

  it("Redis reject: không throw, chỉ log warn", async () => {
    publishMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(() => publishBomEvent({ templateId: "t1", kind: "stage" })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(logger.warn).toHaveBeenCalled();
  });

  it("lỗi đồng bộ cũng không throw", () => {
    publishMock.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(() => publishBomEvent({ templateId: "t1", kind: "stage" })).not.toThrow();
  });
});

describe("subscriber + fan-out theo room", () => {
  it("ensureBomSubscriber đăng ký 1 lần (idempotent) kênh + listener", () => {
    ensureBomSubscriber(fakeSub);
    ensureBomSubscriber(fakeSub);
    expect(subSubscribe).toHaveBeenCalledTimes(1);
    expect(subSubscribe).toHaveBeenCalledWith("test-bom:events");
    expect(subOn).toHaveBeenCalledTimes(1);
    expect(subOn.mock.calls[0]![0]).toBe("message");
  });

  it("message chỉ tới đúng room, bỏ qua kênh lạ và JSON hỏng", () => {
    const a = mk("1", "u1", "t1");
    const b = mk("2", "u2", "t2");
    registerRoomClient(a);
    registerRoomClient(b);
    a.sent.length = 0;
    b.sent.length = 0;
    const msg = JSON.stringify({ templateId: "t1", kind: "line", lineIds: ["x"], by: "u9" });
    handleBomMessage("test-bom:events", msg);
    handleBomMessage("other-channel", msg);
    handleBomMessage("test-bom:events", "{khong phai json");
    expect(a.sent).toEqual([`bom:${msg}`]);
    expect(b.sent).toEqual([]);
  });
});

describe("bom-room-registry", () => {
  it("đếm theo room, dọn room rỗng", () => {
    const a = mk("1", "u1", "t1");
    const b = mk("2", "u2", "t1");
    registerRoomClient(a);
    registerRoomClient(b);
    expect(getRoomClientCount("t1")).toBe(2);
    unregisterRoomClient(a);
    unregisterRoomClient(b);
    expect(getActiveRoomCount()).toBe(0);
    expect(getRoomStreamCountForUser("u1")).toBe(0);
  });

  it("presence gộp theo user và phát khi vào/ra", () => {
    const a1 = mk("1", "u1", "t1", "An");
    const a2 = mk("2", "u1", "t1", "An");
    const b = mk("3", "u2", "t1", "Binh");
    registerRoomClient(a1);
    registerRoomClient(a2);
    registerRoomClient(b);
    expect(getRoomPresence("t1")).toEqual([
      { id: "u1", name: "An" },
      { id: "u2", name: "Binh" },
    ]);
    expect(a1.sent.at(-1)).toBe(`presence:${JSON.stringify({ users: getRoomPresence("t1") })}`);
    unregisterRoomClient(b);
    expect(JSON.parse(a1.sent.at(-1)!.replace("presence:", "")).users).toEqual([
      { id: "u1", name: "An" },
    ]);
  });

  it("vượt giới hạn/người thì evict cũ nhất, close idempotent", () => {
    const list = Array.from({ length: MAX_BOM_STREAMS_PER_USER + 2 }, (_, i) =>
      mk(`c${i}`, "u1", i % 2 ? "t1" : "t2"),
    );
    list.forEach(registerRoomClient);
    expect(getRoomStreamCountForUser("u1")).toBe(MAX_BOM_STREAMS_PER_USER);
    expect(list[0]!.close).toHaveBeenCalledTimes(1);
    expect(list[1]!.close).toHaveBeenCalledTimes(1);
    expect(list[2]!.close).not.toHaveBeenCalled();
    unregisterRoomClient(list[0]!);
    expect(getRoomStreamCountForUser("u1")).toBe(MAX_BOM_STREAMS_PER_USER);
  });

  it("client send lỗi không làm rớt client khác", () => {
    const bad = mk("1", "u1", "t1");
    bad.send = () => {
      throw new Error("x");
    };
    const good = mk("2", "u2", "t1");
    registerRoomClient(bad);
    registerRoomClient(good);
    good.sent.length = 0;
    expect(broadcastToRoom("t1", "bom", "{}")).toBe(1);
    expect(good.sent).toEqual(["bom:{}"]);
  });
});
