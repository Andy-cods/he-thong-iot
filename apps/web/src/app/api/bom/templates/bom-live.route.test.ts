/**
 * BOM V5 / WP9 — GET /api/bom/templates/[id]/live: 401/403 từ guard, 404 id sai,
 * 200 SSE + presence khi hợp lệ, cleanup khi client ngắt.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const guardMock = vi.fn();
vi.mock("@/server/session", () => ({ requireCan: (...a: unknown[]) => guardMock(...a) }));
vi.mock("@/server/services/bom-events", () => ({ ensureBomSubscriber: vi.fn() }));
vi.mock("@/server/services/notify-stream", () => ({ ensureNotifySubscriber: vi.fn() }));

import { GET } from "./[id]/live/route";
import {
  __resetRoomRegistryForTests,
  getRoomClientCount,
} from "@/server/services/bom-room-registry";

const TID = "11111111-1111-4111-8111-111111111111";
const call = (id: string, ac?: AbortController) =>
  GET(
    new NextRequest(`http://x/api/bom/templates/${id}/live`, { signal: ac?.signal }),
    { params: { id } },
  );

afterEach(() => {
  vi.clearAllMocks();
  __resetRoomRegistryForTests();
});

describe("GET /api/bom/templates/[id]/live", () => {
  it("401 khi chưa đăng nhập", async () => {
    guardMock.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await call(TID)).status).toBe(401);
  });

  it("403 khi không có quyền đọc BOM", async () => {
    guardMock.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });
    expect((await call(TID)).status).toBe(403);
    expect(getRoomClientCount(TID)).toBe(0);
  });

  it("404 khi id không phải UUID", async () => {
    guardMock.mockResolvedValue({ session: { userId: "u1", fullName: "An" } });
    expect((await call("abc")).status).toBe(404);
  });

  it("200 SSE, vào room, gửi presence, ngắt thì dọn", async () => {
    guardMock.mockResolvedValue({ session: { userId: "u1", fullName: "An" } });
    const ac = new AbortController();
    const res = await call(TID, ac);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(getRoomClientCount(TID)).toBe(1);

    const reader = res.body!.getReader();
    let text = "";
    for (let i = 0; i < 4 && !text.includes("event: presence"); i++) {
      const { value } = await reader.read();
      text += new TextDecoder().decode(value);
    }
    expect(text).toContain("event: presence");
    expect(text).toContain('"name":"An"');

    ac.abort();
    expect(getRoomClientCount(TID)).toBe(0);
    ac.abort(); // idempotent
  });
});
