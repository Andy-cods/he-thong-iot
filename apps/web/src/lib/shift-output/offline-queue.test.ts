import { describe, expect, it, vi } from "vitest";
import { enqueue, flushQueue, loadQueue, OFFLINE_QUEUE_KEY, saveQueue, type StorageLike } from "./offline-queue";

function memStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("offline-queue", () => {
  it("lưu/đọc localStorage; JSON hỏng hoặc storage ném lỗi → rỗng", () => {
    const s = memStorage();
    saveQueue(enqueue([], { clientUuid: A, payload: { qtyOk: 1 } }), s);
    expect(loadQueue(s).map((q) => q.clientUuid)).toEqual([A]);
    s.data.set(OFFLINE_QUEUE_KEY, "{hỏng");
    expect(loadQueue(s)).toEqual([]);
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadQueue(throwing)).toEqual([]);
    expect(() => saveQueue([], throwing)).not.toThrow();
  });

  it("enqueue cùng clientUuid thay thế (không nhân đôi)", () => {
    let q = enqueue([], { clientUuid: A, payload: { qtyOk: 1 } });
    q = enqueue(q, { clientUuid: A, payload: { qtyOk: 2 } });
    expect(q).toHaveLength(1);
    expect(q[0]?.payload).toEqual({ qtyOk: 2 });
  });

  it("flush: 201/200 xoá; 409 giữ 'failed' kèm existingId; 5xx giữ pending", async () => {
    let q = enqueue([], { clientUuid: A, payload: {} });
    q = enqueue(q, { clientUuid: B, payload: {} });
    q = enqueue(q, { clientUuid: C, payload: {} });
    const send = vi.fn(async (entries: Array<Record<string, unknown>>) => {
      expect(entries.map((e) => e.clientUuid)).toEqual([A, B, C]);
      return [
        { clientUuid: A, status: 201, id: "1" },
        { clientUuid: B, status: 409, code: "DUPLICATE_SLOT", existingId: "x" },
        { clientUuid: C, status: 500 },
      ];
    });
    const r = await flushQueue(q, send);
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.queue.map((x) => [x.clientUuid, x.status])).toEqual([
      [B, "failed"],
      [C, "pending"],
    ]);
    expect(r.queue[0]?.error?.existingId).toBe("x");
  });

  it("lỗi mạng → không mất dòng, tăng attempts", async () => {
    const q = enqueue([], { clientUuid: A, payload: {} });
    const r = await flushQueue(q, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(r.networkError).toBe(true);
    expect(r.queue[0]).toMatchObject({ clientUuid: A, status: "pending", attempts: 1 });
  });

  it("dòng 'failed' không tự gửi lại", async () => {
    const q = [{ ...enqueue([], { clientUuid: A, payload: {} })[0]!, status: "failed" as const }];
    const send = vi.fn(async () => []);
    await flushQueue(q, send);
    expect(send).not.toHaveBeenCalled();
  });
});
