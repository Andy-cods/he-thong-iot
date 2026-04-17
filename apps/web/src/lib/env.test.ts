import { describe, it, expect } from "vitest";
import { buildDsn } from "./dsn";

/**
 * Smoke test cho buildDsn — verify logic inject password qua URL constructor
 * xử lý đúng các ký tự đặc biệt thường gặp trong password Postgres.
 */
describe("buildDsn — password có ký tự đặc biệt", () => {
  const base = "postgres://hethong_app@iot_postgres:5432/hethong_iot";

  it.each([
    ["p ass", "p%20ass"], // space
    ["p@ss!", "p%40ss!"], // @
    ["a!only", "a!only"], // ! (không phải char đặc biệt trong userinfo)
    ["p:w/d$", "p%3Aw%2Fd$"], // : và /
    ["P@ssw0rd!Strong", "P%40ssw0rd!Strong"], // combo thường gặp
  ])("encode password %s -> %s", (pwd, encoded) => {
    const dsn = buildDsn(base, pwd);
    expect(dsn).toBe(
      `postgres://hethong_app:${encoded}@iot_postgres:5432/hethong_iot`,
    );
    // Parse lại DSN phải khôi phục password gốc qua URL.password decoder
    expect(decodeURIComponent(new URL(dsn).password)).toBe(pwd);
  });

  it("không ghi đè nếu DSN đã có password (dev local)", () => {
    const dsn = buildDsn("postgres://u:existing@h:5432/d", "newpwd");
    expect(dsn).toBe("postgres://u:existing@h:5432/d");
  });

  it("return raw nếu password undefined", () => {
    expect(buildDsn(base, undefined)).toBe(base);
  });

  it("return raw nếu password empty string", () => {
    expect(buildDsn(base, "")).toBe(base);
  });

  it("throw error tiếng Việt nếu DSN không hợp lệ", () => {
    expect(() => buildDsn("not-a-url", "x")).toThrow(
      /không phải URL hợp lệ/,
    );
  });
});
