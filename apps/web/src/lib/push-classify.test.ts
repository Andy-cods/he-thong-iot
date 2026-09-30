import { describe, expect, it } from "vitest";
import { classifyPushStatusCode } from "@/lib/push-classify";

/**
 * TASK-notify V4.4 — classifyPushStatusCode là hàm THUẦN (không mạng/DB) nên
 * test được trực tiếp: quyết định deliverPush() có xoá subscription hết hạn
 * hay chỉ log-and-keep khi push service (FCM/Mozilla…) trả lỗi.
 */
describe("classifyPushStatusCode", () => {
  it("2xx → sent", () => {
    expect(classifyPushStatusCode(200)).toBe("sent");
    expect(classifyPushStatusCode(201)).toBe("sent");
    expect(classifyPushStatusCode(299)).toBe("sent");
  });

  it("404 | 410 → expired (subscription hết hạn, cần xoá khỏi DB)", () => {
    expect(classifyPushStatusCode(404)).toBe("expired");
    expect(classifyPushStatusCode(410)).toBe("expired");
  });

  it("429/5xx/0 (mất mạng) → retryable_error (giữ subscription, chỉ log)", () => {
    expect(classifyPushStatusCode(429)).toBe("retryable_error");
    expect(classifyPushStatusCode(500)).toBe("retryable_error");
    expect(classifyPushStatusCode(503)).toBe("retryable_error");
    expect(classifyPushStatusCode(0)).toBe("retryable_error");
  });

  it("3xx/4xx khác 404/410 → retryable_error (không xoá nhầm subscription còn dùng được)", () => {
    expect(classifyPushStatusCode(301)).toBe("retryable_error");
    expect(classifyPushStatusCode(400)).toBe("retryable_error");
    expect(classifyPushStatusCode(401)).toBe("retryable_error");
  });
});
