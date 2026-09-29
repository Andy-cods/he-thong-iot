import { describe, expect, it } from "vitest";
import { assertSeedAllowed, resolveSeedAdminPassword } from "./seed";

describe("assertSeedAllowed (V4.2 audit S1)", () => {
  it("cho phép chạy bình thường ngoài production", () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: "development",
        ALLOW_PROD_SEED: undefined,
        SEED_ADMIN_PASSWORD: undefined,
      }),
    ).not.toThrow();
  });

  it("chặn production khi thiếu ALLOW_PROD_SEED=1", () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: "production",
        ALLOW_PROD_SEED: undefined,
        SEED_ADMIN_PASSWORD: "s3cret-strong",
      }),
    ).toThrow();
  });

  it("chặn production khi ALLOW_PROD_SEED khác '1' (vd 'true')", () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: "production",
        ALLOW_PROD_SEED: "true",
        SEED_ADMIN_PASSWORD: "s3cret-strong",
      }),
    ).toThrow();
  });

  it("chặn production khi có ALLOW_PROD_SEED=1 nhưng thiếu SEED_ADMIN_PASSWORD", () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: "production",
        ALLOW_PROD_SEED: "1",
        SEED_ADMIN_PASSWORD: undefined,
      }),
    ).toThrow();
  });

  it("cho phép production khi có cả ALLOW_PROD_SEED=1 và SEED_ADMIN_PASSWORD", () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: "production",
        ALLOW_PROD_SEED: "1",
        SEED_ADMIN_PASSWORD: "s3cret-strong",
      }),
    ).not.toThrow();
  });
});

describe("resolveSeedAdminPassword", () => {
  it("dùng SEED_ADMIN_PASSWORD khi có", () => {
    expect(resolveSeedAdminPassword({ SEED_ADMIN_PASSWORD: "abc123" })).toBe(
      "abc123",
    );
  });

  it("fallback về mật khẩu mặc định khi không set (chỉ dùng ngoài production)", () => {
    expect(resolveSeedAdminPassword({ SEED_ADMIN_PASSWORD: undefined })).toBe(
      "ChangeMe!234",
    );
  });
});
