import { describe, expect, it } from "vitest";
import { isValidUuid, jsonError, validateUuidParam } from "./http";

/**
 * V4.5 QA-C P2-6 — kiểm định dạng UUID chung cho mọi route `[id]` trước khi
 * query DB (trước đây id sai định dạng → Postgres ném lỗi cast → lọt xuống
 * 500 thô thay vì 400 sạch tiếng Việt).
 */
describe("isValidUuid", () => {
  it("UUID hợp lệ (mọi version) → true", () => {
    expect(isValidUuid("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(isValidUuid("a1b2c3d4-e5f6-4789-a123-0123456789ab")).toBe(true);
    // Hoa/thường đều hợp lệ.
    expect(isValidUuid("A1B2C3D4-E5F6-4789-A123-0123456789AB")).toBe(true);
  });

  it("chuỗi không phải UUID → false (tái hiện ca lỗi thật QA-C)", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
    expect(isValidUuid("123")).toBe(false);
    expect(isValidUuid("")).toBe(false);
  });

  it("gần giống UUID nhưng sai độ dài/thiếu gạch ngang → false", () => {
    expect(isValidUuid("11111111111111111111111111111111")).toBe(false);
    expect(isValidUuid("11111111-1111-1111-1111-11111111111")).toBe(false); // thiếu 1 ký tự
    expect(isValidUuid("11111111-1111-1111-1111-1111111111111")).toBe(false); // thừa 1 ký tự
  });

  it("không phải string (null/undefined/number) → false, không throw", () => {
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(123)).toBe(false);
  });
});

describe("validateUuidParam", () => {
  it("UUID hợp lệ → { ok: true }", () => {
    expect(validateUuidParam("11111111-1111-1111-1111-111111111111")).toEqual({ ok: true });
  });

  it("id sai định dạng → trả response 400 tiếng Việt (không phải 500)", async () => {
    const result = validateUuidParam("not-a-uuid");
    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error.code).toBe("INVALID_ID");
      expect(body.error.message).toMatch(/UUID/);
    }
  });

  it("label tuỳ chỉnh xuất hiện trong thông báo lỗi", async () => {
    const result = validateUuidParam("bad", "woId");
    if ("response" in result) {
      const body = await result.response.json();
      expect(body.error.message).toContain("woId");
    } else {
      throw new Error("expected response");
    }
  });
});

describe("jsonError", () => {
  it("trả đúng status + code + message, kèm details khi có", async () => {
    const res = jsonError("FOO", "Lỗi mẫu", 409, { bar: 1 });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toEqual({ code: "FOO", message: "Lỗi mẫu", details: { bar: 1 } });
  });

  it("không có details → không có field details trong response", async () => {
    const res = jsonError("FOO", "Lỗi mẫu", 400);
    const body = await res.json();
    expect(body.error).toEqual({ code: "FOO", message: "Lỗi mẫu" });
  });
});
