import { describe, expect, it } from "vitest";
import { describeQueryError, getErrorStatus } from "./query-error";

function httpError(status: number, message = `HTTP ${status}`, details?: unknown) {
  return Object.assign(new Error(message), { status, details });
}

describe("V4.1 UI-05 — QueryError helpers", () => {
  it("lấy status từ err.status, 'HTTP 429' hoặc thông điệp rate-limit", () => {
    expect(getErrorStatus(httpError(500))).toBe(500);
    expect(getErrorStatus(new Error("HTTP 403"))).toBe(403);
    expect(
      getErrorStatus(new Error("Quá nhiều yêu cầu. Vui lòng thử lại sau 12s.")),
    ).toBe(429);
    expect(getErrorStatus(null)).toBeUndefined();
  });

  it("429 → 'Hệ thống đang bận' kèm số giây", () => {
    const d = describeQueryError(
      httpError(429, "Quá nhiều yêu cầu", { retryAfter: 7 }),
    );
    expect(d.title).toBe("Hệ thống đang bận");
    expect(d.description).toContain("7 giây");
  });

  it("403 / 500 / lỗi mạng có thông điệp tiếng Việt riêng", () => {
    expect(describeQueryError(httpError(403)).title).toMatch(/không có quyền/);
    expect(describeQueryError(httpError(502)).title).toMatch(/Máy chủ/);
    expect(describeQueryError(new TypeError("Failed to fetch")).title).toMatch(
      /kết nối/,
    );
  });
});
